const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');

const authenticate = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { extractCnssFromFile } = require('../services/cnssExtract');
const {
    ensureActeSchema, checkGrouping, buildActRecord, SHARED_FIELDS,
    loadActes, createActe, assignCards, pruneEmptyActes,
} = require('../services/cnssActes');
const {
    validateCard, errorText, unprintableMessage, canonicalCard,
} = require('../services/cnssValidate');
const { renderMonthlyList, buildMonthlyGroups } = require('../services/listRender');
const { getOfficeProfile } = require('../services/officeProfile');
const { renderActs } = require('../services/cnssActRender');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// "تاريخ احتساب الخطايا" = 16th of the month after the quarter ends.
// semestre is "Q/YYYY" e.g. "04/2021". Mirror of the client-side helper.
const deriveDatesins = (semestre) => {
    const m = /^\s*(\d{1,2})\s*\/\s*(\d{4})\s*$/.exec(semestre || '');
    if (!m) return '';
    const q = parseInt(m[1], 10);
    let y = parseInt(m[2], 10);
    const monthAfter = { 1: '04', 2: '07', 3: '10', 4: '01' }[q];
    if (!monthAfter) return '';
    if (q === 4) y += 1;
    return `16/${monthAfter}/${y}`;
};

/*
 * CNSS module — digitises the "état de liquidation → table → publipostage" flow.
 *
 *   cnss          = the pursued employer ("المطلوب"): one row per company.
 *   cnss_oeuvre   = its liquidation cards ("بطاقة الجبر"): many rows per company,
 *                   one per quarter, each generating one "محضر إعلام بطاقة جبر".
 *
 * Field map (template merge field → column):
 *   إسم_المطلوب            → cnss.nom_cl2
 *   العنوان                → cnss.cl2_adresse (+ cl2_adresse2)
 *   عدد_الإنخراط_بالصندوق  → cnss.numcnss
 *   رمز_الإنخراط           → cnss.codeng
 *   عدد_التضمين            → cnss_oeuvre.nbrreg
 *   عدد_بطاقة_الجبر        → cnss_oeuvre.numcarte
 *   تاريخ_بطاقة_الجبر      → cnss_oeuvre.datecarte
 *   الثلاثية               → cnss_oeuvre.semestre
 *   المبلغ                 → cnss_oeuvre.dette
 *   تاريخ_احتساب_الخطايا   → cnss_oeuvre.datesins
 *   (1.5% line)            → cnss_oeuvre.pourcentage
 */

// Writable columns for the employer master record. id_cn / id_user / id_so /
// date_ajout / id_f / nbr are managed by the server, never taken from the body.
const CNSS_COLS = [
    'ref', 'numcnss', 'nom_cl2', 'cl2_profession', 'cin', 'matricule_fiscal',
    'codeng', 'cl2_adresse', 'cl2_adresse2', 'cl2_avocat', 'cl2_tel',
    'cl2_adressepersonnel', 'title', 'tribunal', 'nombre', 'date_s', 'montant', 'status',
    // طريقة التبليغ — فصل 8 / فصل 10 / مباشر, stored as the literal label.
    'tabligh_method',
    // المآل النهائي — free text, same column name the execution register uses.
    'resultat',
    // ملاحظات — free text the office keeps on the employer. Internal only: it is
    // never rendered into an act or the monthly list.
    'notes'
];

// A new ملف starts before its محضر is printed; see CNSS_STATUS_MAP on the client.
// Existing records keep whatever status they already carry.
const DEFAULT_CNSS_STATUS = 'awaiting_print';

// Writable columns for a liquidation-card line (+ the per-act fee breakdown).
// fee_aqm (VAT) is derived and persisted by the client so the stored row matches
// what the act renders; vat_rate is the editable VAT percentage.
const FEE_COLS = ['fee_post', 'fee_stamp', 'fee_registration', 'fee_travel', 'fee_aqm',
    'fee_copies', 'fee_movement', 'fee_office_copy', 'fee_legal_copy', 'fee_counterparts', 'fee_original'];
// date_tabligh (تاريخ تبليغ المحضر) drives which month a card appears in on the
// monthly CNSS billing list.
const OEUVRE_COLS = ['numcarte', 'datecarte', 'date_tabligh', 'semestre', 'dette', 'pourcentage', 'datesins', 'nbrreg', ...FEE_COLS, 'vat_rate'];

// Keep only known columns from a request body so LLM/-client supplied keys can
// never reach SQL unless they are real columns.
const pick = (body, cols) => {
    const out = {};
    cols.forEach(c => { if (body[c] !== undefined) out[c] = body[c]; });
    return out;
};

// Scanning the same بطاقة جبر twice must not file two rows. عدد البطاقة is the
// document's own identifier, so a card already under the same مطلوب with that
// number is the duplicate. Compared on digits/letters only, so OCR spacing or
// punctuation differences can't hide a match.
const carteKey = (v) => String(v == null ? '' : v).replace(/[^0-9a-zA-Z]/g, '').toLowerCase();

// The already-filed card that `numcarte` would duplicate, or null. A card with no
// extracted number has nothing to match on and is never treated as a duplicate.
const findDuplicateCard = async (id_cn, id_so, numcarte) => {
    const key = carteKey(numcarte);
    if (!key) return null;
    const rows = await db.all(`SELECT * FROM cnss_oeuvre WHERE id_cn = ? AND id_so = ?`, [id_cn, id_so]);
    return rows.find(r => carteKey(r.numcarte) === key) || null;
};

// What the client needs to show the "keep it or cancel" prompt.
const duplicatePayload = (company, dup) => ({
    duplicate: true,
    id_cn: company.id_cn,
    company: { ref: company.ref, nom_cl2: company.nom_cl2, numcnss: company.numcnss },
    existing: {
        id_cn_oe: dup.id_cn_oe, numcarte: dup.numcarte, datecarte: dup.datecarte,
        semestre: dup.semestre, dette: dup.dette, date_tabligh: dup.date_tabligh,
    },
});

// `?`-free numeric guard: db.js rewrites every literal '?' into a $n placeholder,
// so a TRY_CAST-style regex must not contain one. '^[0-9.]+$' is enough to keep
// SUM(dette) from throwing on blank / non-numeric values.
const SUM_DETTE = sub =>
    `COALESCE((SELECT SUM(CASE WHEN o.dette ~ '^[0-9.]+$' THEN o.dette::numeric ELSE 0 END)
               FROM cnss_oeuvre o WHERE o.id_cn = ${sub}), 0)`;

// The Word rendering itself lives in services/cnssActRender.js.

const sendDocx = (res, buf, filename) => {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
};

// ───────────────────────────── Companies (المطلوب) ─────────────────────────────

// List companies with their card count and total debt.
router.get('/', authenticate, async (req, res) => {
    try {
        const { page = 1, limit = 50, nom_cl2, numcnss, ref } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const where = ['c.id_so = ?'];
        const params = [req.user.id_so];
        if (nom_cl2) { where.push('c.nom_cl2 LIKE ?'); params.push(`%${nom_cl2}%`); }
        if (numcnss) { where.push('c.numcnss LIKE ?'); params.push(`%${numcnss}%`); }
        if (ref)     { where.push('c.ref::text LIKE ?'); params.push(`%${ref}%`); }
        const cond = where.join(' AND ');

        const rows = await db.all(
            `SELECT c.*,
                    (SELECT COUNT(*) FROM cnss_oeuvre o WHERE o.id_cn = c.id_cn) AS card_count,
                    ${SUM_DETTE('c.id_cn')} AS total_dette
             FROM cnss c
             WHERE ${cond}
             ORDER BY c.id_cn DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        const countRow = await db.get(`SELECT COUNT(*) AS count FROM cnss c WHERE ${cond}`, params);
        const count = parseInt(countRow.count);

        res.json({ data: rows, total: count, page: parseInt(page), totalPages: Math.ceil(count / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Billing list — companies with their total debt, filterable.
router.get('/facturation/list', authenticate, async (req, res) => {
    try {
        const { nom_cl2, numcnss, ref } = req.query;
        const where = ['c.id_so = ?'];
        const params = [req.user.id_so];
        if (nom_cl2) { where.push('c.nom_cl2 LIKE ?'); params.push(`%${nom_cl2}%`); }
        if (numcnss) { where.push('c.numcnss LIKE ?'); params.push(`%${numcnss}%`); }
        if (ref)     { where.push('c.ref::text LIKE ?'); params.push(`%${ref}%`); }
        const cond = where.join(' AND ');

        const rows = await db.all(
            `SELECT c.id_cn, c.ref, c.nom_cl2, c.numcnss, c.status,
                    ${SUM_DETTE('c.id_cn')} AS total_montant
             FROM cnss c WHERE ${cond} ORDER BY c.id_cn DESC`,
            params
        );
        const grandTotal = rows.reduce((s, r) => s + (parseFloat(r.total_montant) || 0), 0);
        res.json({ data: rows, total: Math.round(grandTotal * 1000) / 1000, count: rows.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upload or scan an "État de Liquidation": extract its fields and create the
// record automatically. If a company with the same CNSS number already exists,
// the card is added to it (so multiple cards group under one «مطلوب»).
router.post('/scan', authenticate, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

        const d = await extractCnssFromFile(req.file.buffer, req.file.mimetype);
        if (!d || (!d.nom_cl2 && !d.numcnss && !d.numcarte)) {
            return res.status(422).json({ error: 'تعذّر استخراج بيانات كافية من البطاقة. جرّب صورة/مسحاً أوضح.' });
        }

        // Find-or-create the company by CNSS affiliation number.
        let company = null;
        if (d.numcnss) {
            company = await db.get(
                `SELECT * FROM cnss WHERE numcnss = ? AND id_so = ? ORDER BY id_cn DESC LIMIT 1`,
                [String(d.numcnss), req.user.id_so]
            );
        }
        let createdCompany = false;
        if (!company) {
            const m = await db.get(`SELECT MAX(ref) AS m FROM cnss WHERE id_so = ?`, [req.user.id_so]);
            const nid = await db.get(`SELECT COALESCE(MAX(id_cn), 0) + 1 AS n FROM cnss`);
            const compData = {
                id_cn: nid.n,
                ref: (parseInt(m && m.m) || 0) + 1,
                nom_cl2: d.nom_cl2 || '', numcnss: d.numcnss || '', codeng: d.codeng || '',
                cl2_adresse: d.cl2_adresse || '', status: DEFAULT_CNSS_STATUS,
                id_user: req.user.id, id_so: req.user.id_so, date_ajout: new Date().toLocaleString('fr-FR'),
            };
            const ck = Object.keys(compData);
            company = await db.get(
                `INSERT INTO cnss (${ck.map(k => `"${k}"`).join(',')}) VALUES (${ck.map(() => '?').join(',')}) RETURNING *`,
                ck.map(k => compData[k])
            );
            createdCompany = true;
        }

        // Bring the AI's reading to canonical form (٠١٢ digits, 21-05-2026 → 21/05/2026,
        // "2 959,306" → 2959.306). A value that still fails is kept as read so the user
        // can see it: the cards table flags it and no act prints until it is fixed.
        const read = validateCard({
            numcarte: d.numcarte || '', datecarte: d.datecarte || '', semestre: d.semestre || '', dette: d.dette || '',
        }).values;
        const extracted = {
            ...read, pourcentage: '1.5', datesins: deriveDatesins(read.semestre), nbrreg: '',
        };

        // Already filed under this مطلوب? File nothing and hand the extracted card
        // back, so the client can ask the user to keep it or cancel. Keeping re-posts
        // it to /:id/cards with `force` — no second (paid) extraction. A company we
        // just created has no cards, so it can't be a duplicate.
        if (!createdCompany) {
            const dup = await findDuplicateCard(company.id_cn, req.user.id_so, extracted.numcarte);
            if (dup) return res.status(409).json({ ...duplicatePayload(company, dup), card: extracted });
        }

        // Create the liquidation card.
        const noe = await db.get(`SELECT COALESCE(MAX(id_cn_oe), 0) + 1 AS n FROM cnss_oeuvre`);
        const cardData = {
            id_cn_oe: noe.n,
            ...extracted,
            id_cn: company.id_cn, id_user: req.user.id, id_so: req.user.id_so,
            date_ajout: new Date().toLocaleString('fr-FR'),
        };
        const ok = Object.keys(cardData);
        const card = await db.get(
            `INSERT INTO cnss_oeuvre (${ok.map(k => `"${k}"`).join(',')}) VALUES (${ok.map(() => '?').join(',')}) RETURNING *`,
            ok.map(k => cardData[k])
        );

        await logActivity(req.user, 'CREATE', 'RECORD',
            `إنشاء بطاقة جبر من مسح/رفع (${card.numcarte || ''}) للمطلوب ${company.nom_cl2 || company.id_cn}`);

        res.json({ success: true, id_cn: company.id_cn, id_cn_oe: card.id_cn_oe, createdCompany, extracted: d });
    } catch (err) {
        console.error('cnss /scan error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ───────── Monthly billing list (قائمة مصاريف محاضر تبليغ بطاقات جبر) ─────────
// One row per بطاقة جبر whose act was delivered (تاريخ التبليغ) in the given month,
// with the per-act fee columns + totals — the bill the office sends to CNSS.
// Registered before '/:id' so the literal "list.docx" path isn't captured as an id.

// Every card joined to its company, for the monthly list (filtered by month in
// the render service).
const fetchListRows = (id_so) => db.all(
    `SELECT o.*, c.nom_cl2, c.cl2_adresse, c.cl2_adresse2, c.codeng, c.numcnss
     FROM cnss_oeuvre o JOIN cnss c ON c.id_cn = o.id_cn
     WHERE o.id_so = ?`,
    [id_so]
);

// Cards grouped by delivery month, for the CNSS facturation page.
router.get('/facturation/months', authenticate, async (req, res) => {
    try {
        res.json(buildMonthlyGroups(await fetchListRows(req.user.id_so)));
    } catch (err) {
        console.error('facturation/months error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/list.docx', authenticate, async (req, res) => {
    try {
        const year = parseInt(req.query.year, 10), month = parseInt(req.query.month, 10);
        if (!year || !month) return res.status(400).json({ error: 'حدّد السنة والشهر.' });
        const office = await getOfficeProfile();
        const { buffer, count } = renderMonthlyList(await fetchListRows(req.user.id_so), { year, month }, office);
        if (!count) return res.status(404).json({ error: 'لا توجد محاضر مُبلَّغة في هذا الشهر.' });
        await logActivity(req.user, 'PRINT', 'RECORD', `توليد قائمة CNSS الشهرية ${month}/${year} (${count} محضر)`);
        sendDocx(res, buffer, `cnss_list_${year}_${month}.docx`);
    } catch (err) {
        console.error('list.docx error:', err);
        res.status(500).json({ error: err.message });
    }
});

// One company plus its liquidation cards.
router.get('/:id', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const company = await db.get(`SELECT * FROM cnss WHERE id_cn = ? AND id_so = ?`, [id, req.user.id_so]);
        if (!company) return res.status(404).json({ error: 'Dossier non trouvé.' });

        await ensureActeSchema();
        const cards = await db.all(
            `SELECT * FROM cnss_oeuvre WHERE id_cn = ? AND id_so = ? ORDER BY id_cn_oe ASC`,
            [id, req.user.id_so]
        );
        const actes = Object.values(await loadActes(id, req.user.id_so));

        await logActivity(req.user, 'VIEW', 'RECORD', `عرض ملف CNSS عدد ${company.ref || id}`);
        res.json({ ...company, cards, actes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a company.
router.post('/', authenticate, async (req, res) => {
    try {
        const data = pick(req.body, CNSS_COLS);
        data.id_user = req.user.id;
        data.id_so = req.user.id_so;
        data.date_ajout = new Date().toLocaleString('fr-FR');
        if (!data.status) data.status = DEFAULT_CNSS_STATUS;

        // Auto-number ref when the client didn't supply one.
        if (data.ref === undefined || data.ref === '') {
            const m = await db.get(`SELECT MAX(ref) AS m FROM cnss WHERE id_so = ?`, [req.user.id_so]);
            data.ref = (parseInt(m && m.m) || 0) + 1;
        }

        // id_cn has no DB sequence default on this (legacy-ported) table, so assign
        // it explicitly. Works whether or not scripts/fix_cnss_sequences.js was run.
        const nextId = await db.get(`SELECT COALESCE(MAX(id_cn), 0) + 1 AS n FROM cnss`);
        data.id_cn = nextId.n;

        const keys = Object.keys(data);
        const placeholders = keys.map(() => '?').join(',');
        const r = await db.get(
            `INSERT INTO cnss (${keys.map(k => `"${k}"`).join(',')}) VALUES (${placeholders}) RETURNING id_cn`,
            keys.map(k => data[k])
        );

        await logActivity(req.user, 'CREATE', 'RECORD', `إضافة ملف CNSS جديد عدد ${data.ref}`);
        res.json({ id_cn: r.id_cn, ...data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a company.
router.put('/:id', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const data = pick(req.body, CNSS_COLS);
        if (Object.keys(data).length === 0) return res.json({ success: true });

        const setStr = Object.keys(data).map(k => `"${k}" = ?`).join(', ');
        const vals = [...Object.values(data), id, req.user.id_so];
        await db.run(`UPDATE cnss SET ${setStr} WHERE id_cn = ? AND id_so = ?`, vals);

        await logActivity(req.user, 'UPDATE', 'RECORD', `تعديل ملف CNSS (ID: ${id})`);
        res.json({ success: true, updatedID: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update status only.
router.patch('/:id/status', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status is required' });

        await db.run(`UPDATE cnss SET status = ? WHERE id_cn = ? AND id_so = ?`, [status, id, req.user.id_so]);
        res.json({ success: true, status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a company and all of its cards.
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        await ensureActeSchema();
        await db.run(`DELETE FROM cnss_oeuvre WHERE id_cn = ? AND id_so = ?`, [id, req.user.id_so]);
        await db.run(`DELETE FROM cnss_acte WHERE id_cn = ? AND id_so = ?`, [id, req.user.id_so]);
        await db.run(`DELETE FROM cnss WHERE id_cn = ? AND id_so = ?`, [id, req.user.id_so]);

        await logActivity(req.user, 'DELETE', 'RECORD', `حذف ملف CNSS (ID: ${id})`);
        res.json({ success: true, deletedID: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ───────────────────── Generate the act(s) as Word (.docx) ─────────────────────

// A محضر covers one or more cards of one مطلوب; services/cnssActes.js holds the
// grouping rules. Every route here that creates or moves a grouping is a POST.

const loadCompany = (id, id_so) => db.get(`SELECT * FROM cnss WHERE id_cn = ? AND id_so = ?`, [id, id_so]);
const loadCards = (id, id_so) => db.all(
    `SELECT * FROM cnss_oeuvre WHERE id_cn = ? AND id_so = ? ORDER BY id_cn_oe ASC`, [id, id_so]);

// The given محاضر, in order, as one document (one محضر per page).
const renderActes = async (company, acteIds, cards) => renderActs(
    acteIds.map((a) => buildActRecord(company, cards.filter((c) => c.id_acte === a).map(canonicalCard))),
    await getOfficeProfile());

const blankLabel = (v) => v || 'فارغ';
const mismatchMessage = (mismatches) => 'لا يمكن جمع هذه البطاقات في محضر واحد:\n'
    + mismatches.map((m) => `• ${m.label} مختلف بينها (${m.values.map(blankLabel).join('، ')})`).join('\n')
    + '\nبطاقات المحضر الواحد يجب أن يكون لها نفس عدد التضمين ونفس تاريخ التبليغ.';

// Selected cards → one محضر. Answers:
//   422 { mismatches }                  عدد التضمين / تاريخ التبليغ differ — refused
//   409 { needsConfirm, conflicts, … }  cards would leave another محضر, or their
//                                        تاريخ بطاقة الجبر differ — resend with force
//   200 docx                            the محضر (new, or the exact one reprinted)
router.post('/:id/actes', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const raw = Array.isArray(req.body.card_ids) ? req.body.card_ids : [];
        const ids = [...new Set(raw.map(Number).filter(Number.isInteger))];
        if (!ids.length) return res.status(400).json({ error: 'اختر بطاقة جبر واحدة على الأقل.' });

        await ensureActeSchema();
        const company = await loadCompany(id, req.user.id_so);
        if (!company) return res.status(404).json({ error: 'الملف غير موجود.' });
        const all = await loadCards(id, req.user.id_so);
        const selected = all.filter((c) => ids.includes(c.id_cn_oe));
        if (selected.length !== ids.length) {
            return res.status(400).json({ error: 'بعض البطاقات المحددة لا تنتمي إلى هذا الملف.' });
        }

        const actesById = await loadActes(id, req.user.id_so);
        const check = checkGrouping(selected, all.filter((c) => c.id_acte != null), actesById);

        const unprintable = unprintableMessage(selected);
        if (unprintable) return res.status(422).json({ error: unprintable });

        if (check.mismatches.length) {
            return res.status(422).json({ error: mismatchMessage(check.mismatches), mismatches: check.mismatches });
        }

        if (check.reprintActeId) {
            const acte = actesById[check.reprintActeId];
            const buf = await renderActes(company, [acte.id_acte], selected);
            await logActivity(req.user, 'PRINT', 'RECORD',
                `إعادة طباعة المحضر عدد ${acte.numero} للملف ${company.nom_cl2 || id}`);
            return sendDocx(res, buf, `acte_${id}_${acte.numero}.docx`);
        }

        if (!req.body.force && (check.conflicts.length || check.dateCarteValues.length > 1)) {
            return res.status(409).json({
                needsConfirm: true, conflicts: check.conflicts, dateCarteValues: check.dateCarteValues,
            });
        }

        const acte = await createActe(id, req.user);
        await assignCards(acte.id_acte, ids, req.user.id_so);
        await pruneEmptyActes(id, req.user.id_so);

        const cards = selected.map((c) => ({ ...c, id_acte: acte.id_acte }));
        const buf = await renderActes(company, [acte.id_acte], cards);
        const moved = check.conflicts.map((c) => `${c.moving.length} من المحضر ${c.numero}`).join('، ');
        await logActivity(req.user, 'PRINT', 'RECORD',
            `توليد المحضر عدد ${acte.numero} (${cards.length} بطاقة) للملف ${company.nom_cl2 || id}`
            + (moved ? ` — نُقلت ${moved}` : ''));
        sendDocx(res, buf, `acte_${id}_${acte.numero}.docx`);
    } catch (err) {
        console.error('actes error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Reprint an existing محضر as it stands.
router.get('/actes/:acteId/act.docx', authenticate, async (req, res) => {
    try {
        const acteId = parseInt(req.params.acteId, 10);
        await ensureActeSchema();
        const acte = await db.get(`SELECT * FROM cnss_acte WHERE id_acte = ? AND id_so = ?`, [acteId, req.user.id_so]);
        if (!acte) return res.status(404).json({ error: 'المحضر غير موجود.' });
        const company = await loadCompany(acte.id_cn, req.user.id_so);
        if (!company) return res.status(404).json({ error: 'الملف غير موجود.' });
        const cards = await loadCards(acte.id_cn, req.user.id_so);
        if (!cards.some((c) => c.id_acte === acteId)) return res.status(404).json({ error: 'المحضر لا يحتوي على بطاقات.' });
        const unprintable = unprintableMessage(cards.filter((c) => c.id_acte === acteId));
        if (unprintable) return res.status(422).json({ error: unprintable });

        const buf = await renderActes(company, [acteId], cards);
        await logActivity(req.user, 'PRINT', 'RECORD',
            `إعادة طباعة المحضر عدد ${acte.numero} للملف ${company.nom_cl2 || acte.id_cn}`);
        sendDocx(res, buf, `acte_${acte.id_cn}_${acte.numero}.docx`);
    } catch (err) {
        console.error('acte reprint error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Dissolve a محضر: its cards become free to be grouped again.
router.delete('/actes/:acteId', authenticate, async (req, res) => {
    try {
        const acteId = parseInt(req.params.acteId, 10);
        await ensureActeSchema();
        const acte = await db.get(`SELECT * FROM cnss_acte WHERE id_acte = ? AND id_so = ?`, [acteId, req.user.id_so]);
        if (!acte) return res.status(404).json({ error: 'المحضر غير موجود.' });
        await db.run(`UPDATE cnss_oeuvre SET id_acte = NULL WHERE id_acte = ? AND id_so = ?`, [acteId, req.user.id_so]);
        await db.run(`DELETE FROM cnss_acte WHERE id_acte = ? AND id_so = ?`, [acteId, req.user.id_so]);
        await logActivity(req.user, 'DELETE', 'RECORD', `إلغاء تجميع المحضر عدد ${acte.numero} (ملف ${acte.id_cn})`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Every محضر of the company in one document. Existing محاضر print as grouped; each
// card not yet in a محضر becomes its own one-card محضر (and stays so), so a card
// printed here can't later slip into a second محضر unnoticed.
router.post('/:id/acts.docx', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        await ensureActeSchema();
        const company = await loadCompany(id, req.user.id_so);
        if (!company) return res.status(404).json({ error: 'الملف غير موجود.' });
        let cards = await loadCards(id, req.user.id_so);
        if (!cards.length) return res.status(400).json({ error: 'لا توجد بطاقات لتوليد محاضرها.' });
        const unprintable = unprintableMessage(cards);
        if (unprintable) return res.status(422).json({ error: unprintable });

        const actesById = await loadActes(id, req.user.id_so);
        const free = cards.filter((c) => c.id_acte == null || !actesById[c.id_acte]);
        for (const card of free) {
            const acte = await createActe(id, req.user);
            await assignCards(acte.id_acte, [card.id_cn_oe], req.user.id_so);
            actesById[acte.id_acte] = acte;
        }
        if (free.length) cards = await loadCards(id, req.user.id_so);

        const acteIds = Object.values(actesById)
            .filter((a) => cards.some((c) => c.id_acte === a.id_acte))
            .sort((a, b) => a.numero - b.numero)
            .map((a) => a.id_acte);
        const buf = await renderActes(company, acteIds, cards);
        await logActivity(req.user, 'PRINT', 'RECORD', `توليد ${acteIds.length} محضر للملف ${company.nom_cl2 || id}`);
        sendDocx(res, buf, `acts_${id}.docx`);
    } catch (err) {
        console.error('acts.docx error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────── Liquidation cards (بطاقة الجبر) ────────────────────────

// Add a card to a company.
router.post('/:id/cards', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const owner = await db.get(`SELECT * FROM cnss WHERE id_cn = ? AND id_so = ?`, [id, req.user.id_so]);
        if (!owner) return res.status(404).json({ error: 'Dossier non trouvé.' });

        // `force` re-files a card /scan already read (the duplicate "keep it anyway"), so
        // an unreadable value stays for the user to fix, as in /scan. Typed values must
        // be valid (services/cnssValidate.js).
        const { values, errors } = validateCard(pick(req.body, OEUVRE_COLS));
        if (Object.keys(errors).length && !req.body.force) {
            return res.status(422).json({ error: errorText(errors), fields: errors });
        }
        const data = { ...pick(req.body, OEUVRE_COLS), ...values };

        // Same عدد البطاقة guard as /scan. `force` is the user's "keep it anyway"
        // (it isn't an OEUVRE_COLS column, so it never reaches SQL).
        if (!req.body.force) {
            const dup = await findDuplicateCard(id, req.user.id_so, data.numcarte);
            if (dup) return res.status(409).json(duplicatePayload(owner, dup));
        }

        data.id_cn = id;
        data.id_user = req.user.id;
        data.id_so = req.user.id_so;
        data.date_ajout = new Date().toLocaleString('fr-FR');
        if (data.pourcentage === undefined || data.pourcentage === '') data.pourcentage = '1.5';

        // id_cn_oe has no DB sequence default on this (legacy-ported) table.
        const nextId = await db.get(`SELECT COALESCE(MAX(id_cn_oe), 0) + 1 AS n FROM cnss_oeuvre`);
        data.id_cn_oe = nextId.n;

        const keys = Object.keys(data);
        const placeholders = keys.map(() => '?').join(',');
        const r = await db.get(
            `INSERT INTO cnss_oeuvre (${keys.map(k => `"${k}"`).join(',')}) VALUES (${placeholders}) RETURNING id_cn_oe`,
            keys.map(k => data[k])
        );

        await logActivity(req.user, 'CREATE', 'RECORD', `إضافة بطاقة جبر للملف (ID: ${id})`);
        res.json({ id_cn_oe: r.id_cn_oe, ...data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a card.
router.put('/cards/:cardId', authenticate, async (req, res) => {
    try {
        const cardId = parseInt(req.params.cardId, 10);
        const input = pick(req.body, OEUVRE_COLS);
        if (Object.keys(input).length === 0) return res.json({ success: true });

        await ensureActeSchema();
        const existing = await db.get(`SELECT * FROM cnss_oeuvre WHERE id_cn_oe = ? AND id_so = ?`, [cardId, req.user.id_so]);
        if (!existing) return res.status(404).json({ error: 'بطاقة الجبر غير موجودة.' });
        const { values, errors } = validateCard(input, existing);
        if (Object.keys(errors).length) return res.status(422).json({ error: errorText(errors), fields: errors });
        const data = { ...input, ...values };

        // تاريخ التبليغ is copied to the whole محضر below, so it must not precede any
        // of its cards' تاريخ البطاقة either.
        if (data.date_tabligh && existing.id_acte != null) {
            const siblings = await db.all(`SELECT * FROM cnss_oeuvre WHERE id_acte = ? AND id_so = ? AND id_cn_oe <> ?`,
                [existing.id_acte, req.user.id_so, cardId]);
            const clash = siblings.map((c) => ({ c, e: validateCard({ date_tabligh: data.date_tabligh }, c).errors.date_tabligh }))
                .find((x) => x.e);
            if (clash) {
                const msg = `${clash.e} — البطاقة ${clash.c.numcarte || clash.c.id_cn_oe} من نفس المحضر`;
                return res.status(422).json({ error: msg, fields: { date_tabligh: msg } });
            }
        }

        const setStr = Object.keys(data).map(k => `"${k}" = ?`).join(', ');
        const vals = [...Object.values(data), cardId, req.user.id_so];
        await db.run(`UPDATE cnss_oeuvre SET ${setStr} WHERE id_cn_oe = ? AND id_so = ?`, vals);

        // عدد التضمين and تاريخ التبليغ belong to the محضر, not the card: changing them
        // on one card of a محضر changes them for all its cards (services/cnssActes.js).
        const shared = pick(data, SHARED_FIELDS.map(f => f.key));
        let propagated = 0;
        if (Object.keys(shared).length && existing.id_acte != null) {
            const set = Object.keys(shared).map(k => `"${k}" = ?`).join(', ');
            const r = await db.run(
                `UPDATE cnss_oeuvre SET ${set} WHERE id_acte = ? AND id_so = ? AND id_cn_oe <> ?`,
                [...Object.values(shared), existing.id_acte, req.user.id_so, cardId]);
            propagated = r.changes;
        }

        await logActivity(req.user, 'UPDATE', 'RECORD', `تعديل بطاقة جبر (ID: ${cardId})`
            + (propagated ? ` وتحديث ${propagated} بطاقة أخرى من نفس المحضر` : ''));
        res.json({ success: true, updatedID: cardId, propagated, values: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a card.
router.delete('/cards/:cardId', authenticate, async (req, res) => {
    try {
        const cardId = parseInt(req.params.cardId, 10);
        const card = await db.get(`SELECT id_cn FROM cnss_oeuvre WHERE id_cn_oe = ? AND id_so = ?`, [cardId, req.user.id_so]);
        await db.run(`DELETE FROM cnss_oeuvre WHERE id_cn_oe = ? AND id_so = ?`, [cardId, req.user.id_so]);
        if (card) {
            await ensureActeSchema();
            await pruneEmptyActes(card.id_cn, req.user.id_so);   // a one-card محضر goes with its card
        }

        await logActivity(req.user, 'DELETE', 'RECORD', `حذف بطاقة جبر (ID: ${cardId})`);
        res.json({ success: true, deletedID: cardId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

// Exposed for scripts/verify_act_render.js, which renders a throwaway act against a
// fictitious office to prove the template still merges every {office_*} tag. Not
// part of the HTTP surface.
module.exports.renderActs = renderActs;
module.exports.buildActRecord = buildActRecord;
