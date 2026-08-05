const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const db = require('../db');

const authenticate = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { extractCnssFromFile } = require('../services/cnssExtract');
const { AJR_KEYS, EXP_KEYS, toMillimes, formatMillimes, computeFees } = require('../services/cnssFees');
const { renderMonthlyList, buildMonthlyGroups } = require('../services/listRender');
const { getOfficeProfile } = require('../services/officeProfile');

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
 *   عدد_الملف              → cnss_oeuvre.nbrreg
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
    'cl2_adressepersonnel', 'title', 'tribunal', 'nombre', 'date_s', 'montant', 'status'
];

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

// `?`-free numeric guard: db.js rewrites every literal '?' into a $n placeholder,
// so a TRY_CAST-style regex must not contain one. '^[0-9.]+$' is enough to keep
// SUM(dette) from throwing on blank / non-numeric values.
const SUM_DETTE = sub =>
    `COALESCE((SELECT SUM(CASE WHEN o.dette ~ '^[0-9.]+$' THEN o.dette::numeric ELSE 0 END)
               FROM cnss_oeuvre o WHERE o.id_cn = ${sub}), 0)`;

// ───────── "محضر إعلام بطاقة جبر" generation (publipostage replacement) ─────────
// Built once from Assets/template.docx by scripts/build_cnss_template.js.
const TEMPLATE_PATH = path.join(__dirname, '..', 'assets', 'template_cnss.docx');

// Map a company + one of its cards onto the template's tags (incl. the fee table).
// Fee math (computeFees/formatMillimes/AJR_KEYS/EXP_KEYS) lives in services/cnssFees.js.
const buildActRecord = (company, card) => {
    const fees = {};
    [...AJR_KEYS, ...EXP_KEYS].forEach((k) => { fees[k] = formatMillimes(toMillimes(card[k])); });
    // أ ق م = VAT, derived from the الأجور subtotal (never a manual input).
    const { ajr, exp, vat, rate, total } = computeFees(card);
    fees.fee_aqm = formatMillimes(vat);
    fees.vat_rate = String(rate);
    fees.fee_ajr_total = formatMillimes(ajr);     // الأجور subtotal (pre-VAT)
    fees.fee_exp_total = formatMillimes(exp);     // مصاريف subtotal
    fees.fee_total = formatMillimes(total);       // grand total

    return {
        num_dossier: card.nbrreg || '',
        code_inscription: company.codeng || '',
        num_affiliation: company.numcnss || '',
        nom_matloub: company.nom_cl2 || '',
        adresse: [company.cl2_adresse, company.cl2_adresse2].filter(Boolean).join(' '),
        date_carte: card.datecarte || '',
        num_carte: card.numcarte || '',
        trimestre: card.semestre || '',
        montant: card.dette || '',
        date_penalite: card.datesins || '',
        ...fees,
    };
};

// The acts loop ends with this paragraph so each محضر starts on a fresh page.
// After the LAST act it has nothing to separate, and Word renders it as a
// trailing blank page — so the render strips the final one.
const PAGE_BREAK_P = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

// Render one Word document containing `acts` (1 → single act, N → one per page).
// nullGetter keeps any unfilled tag (e.g. a blank fee cell) from throwing.
const renderActs = (acts) => {
    const zip = new PizZip(fs.readFileSync(TEMPLATE_PATH));
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
    doc.render({ acts });

    const out = doc.getZip();
    const xml = out.file('word/document.xml').asText();
    const last = xml.lastIndexOf(PAGE_BREAK_P);
    if (last !== -1) {
        out.file('word/document.xml', xml.slice(0, last) + xml.slice(last + PAGE_BREAK_P.length));
    }
    return out.generate({ type: 'nodebuffer' });
};

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
                cl2_adresse: d.cl2_adresse || '', status: 'has_deposit',
                id_user: req.user.id, id_so: req.user.id_so, date_ajout: new Date().toLocaleString('fr-FR'),
            };
            const ck = Object.keys(compData);
            company = await db.get(
                `INSERT INTO cnss (${ck.map(k => `"${k}"`).join(',')}) VALUES (${ck.map(() => '?').join(',')}) RETURNING *`,
                ck.map(k => compData[k])
            );
            createdCompany = true;
        }

        // Create the liquidation card.
        const noe = await db.get(`SELECT COALESCE(MAX(id_cn_oe), 0) + 1 AS n FROM cnss_oeuvre`);
        const cardData = {
            id_cn_oe: noe.n,
            numcarte: d.numcarte || '', datecarte: d.datecarte || '', semestre: d.semestre || '',
            dette: d.dette || '', pourcentage: '1.5', datesins: deriveDatesins(d.semestre), nbrreg: '',
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

        const cards = await db.all(
            `SELECT * FROM cnss_oeuvre WHERE id_cn = ? AND id_so = ? ORDER BY id_cn_oe ASC`,
            [id, req.user.id_so]
        );

        await logActivity(req.user, 'VIEW', 'RECORD', `عرض ملف CNSS عدد ${company.ref || id}`);
        res.json({ ...company, cards });
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
        if (!data.status) data.status = 'has_deposit';

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
        await db.run(`DELETE FROM cnss_oeuvre WHERE id_cn = ? AND id_so = ?`, [id, req.user.id_so]);
        await db.run(`DELETE FROM cnss WHERE id_cn = ? AND id_so = ?`, [id, req.user.id_so]);

        await logActivity(req.user, 'DELETE', 'RECORD', `حذف ملف CNSS (ID: ${id})`);
        res.json({ success: true, deletedID: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ───────────────────── Generate the act(s) as Word (.docx) ─────────────────────

// One card → one "محضر إعلام بطاقة جبر".
router.get('/cards/:cardId/act.docx', authenticate, async (req, res) => {
    try {
        const cardId = parseInt(req.params.cardId, 10);
        const card = await db.get(`SELECT * FROM cnss_oeuvre WHERE id_cn_oe = ? AND id_so = ?`, [cardId, req.user.id_so]);
        if (!card) return res.status(404).json({ error: 'بطاقة الجبر غير موجودة.' });
        const company = await db.get(`SELECT * FROM cnss WHERE id_cn = ? AND id_so = ?`, [card.id_cn, req.user.id_so]);
        if (!company) return res.status(404).json({ error: 'الملف غير موجود.' });

        const buf = renderActs([buildActRecord(company, card)]);
        await logActivity(req.user, 'PRINT', 'RECORD', `توليد محضر إعلام بطاقة جبر (بطاقة ${card.numcarte || cardId})`);
        sendDocx(res, buf, `act_${cardId}.docx`);
    } catch (err) {
        console.error('act.docx error:', err);
        res.status(500).json({ error: err.message });
    }
});

// All of a company's cards → one document, one act per page (publipostage).
router.get('/:id/acts.docx', authenticate, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const company = await db.get(`SELECT * FROM cnss WHERE id_cn = ? AND id_so = ?`, [id, req.user.id_so]);
        if (!company) return res.status(404).json({ error: 'الملف غير موجود.' });
        const cards = await db.all(`SELECT * FROM cnss_oeuvre WHERE id_cn = ? AND id_so = ? ORDER BY id_cn_oe ASC`, [id, req.user.id_so]);
        if (!cards.length) return res.status(400).json({ error: 'لا توجد بطاقات لتوليد محاضرها.' });

        const buf = renderActs(cards.map(c => buildActRecord(company, c)));
        await logActivity(req.user, 'PRINT', 'RECORD', `توليد ${cards.length} محضر للملف ${company.nom_cl2 || id}`);
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
        const owner = await db.get(`SELECT id_cn FROM cnss WHERE id_cn = ? AND id_so = ?`, [id, req.user.id_so]);
        if (!owner) return res.status(404).json({ error: 'Dossier non trouvé.' });

        const data = pick(req.body, OEUVRE_COLS);
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
        const data = pick(req.body, OEUVRE_COLS);
        if (Object.keys(data).length === 0) return res.json({ success: true });

        const setStr = Object.keys(data).map(k => `"${k}" = ?`).join(', ');
        const vals = [...Object.values(data), cardId, req.user.id_so];
        await db.run(`UPDATE cnss_oeuvre SET ${setStr} WHERE id_cn_oe = ? AND id_so = ?`, vals);

        await logActivity(req.user, 'UPDATE', 'RECORD', `تعديل بطاقة جبر (ID: ${cardId})`);
        res.json({ success: true, updatedID: cardId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a card.
router.delete('/cards/:cardId', authenticate, async (req, res) => {
    try {
        const cardId = parseInt(req.params.cardId, 10);
        await db.run(`DELETE FROM cnss_oeuvre WHERE id_cn_oe = ? AND id_so = ?`, [cardId, req.user.id_so]);

        await logActivity(req.user, 'DELETE', 'RECORD', `حذف بطاقة جبر (ID: ${cardId})`);
        res.json({ success: true, deletedID: cardId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
