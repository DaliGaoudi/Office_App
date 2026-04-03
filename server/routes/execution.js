const express = require('express');
const router = express.Router();
const db = require('../db');

function authenticate(req, res, next) {
    req.user = { id: 35, id_so: '35', role: 'admin' };
    next();
}

let cachedTVA = 19;
async function refreshTVA() {
    try {
        const row = await db.get('SELECT value FROM app_settings WHERE key=\'tva_rate\'');
        if (row) cachedTVA = parseFloat(row.value) || 19;
    } catch (err) { console.error(err); }
}
refreshTVA();

function computeActionSalaire(row) {
    const dateStr = row.date_r || row.date_reg || row.date_inscri || '';
    const isOld = dateStr && new Date(dateStr.replace(/\//g, '-')) < new Date('2018-01-01');
    const rate = isOld ? 13 : (parseFloat(cachedTVA) || 19);

    const baseRaw = ['origine','exemple','version_bureau','orientation','mobilite'].reduce((a,k)=>a+(parseFloat(row[k])||0), 0);
    const expensesRaw = ['imprimer','inscri','delimitation','poste','autre'].reduce((a,k)=>a+(parseFloat(row[k])||0), 0);
    const storedTotal = parseFloat(row.salaire) || 0;

    let base, tva, expenses, total;

    if (baseRaw > 0 || expensesRaw > 0) {
        base = baseRaw;
        tva = Math.round(base * rate / 100);
        expenses = expensesRaw;
        total = base + tva + expenses;
    } else if (storedTotal > 0) {
        const storedTVA = parseFloat(row.TVA) || parseFloat(row.tva) || 0;
        if (storedTVA > 0) {
            tva = storedTVA;
            base = storedTotal - tva;
            expenses = 0;
        } else {
            base = Math.round((storedTotal / (1 + rate / 100)) * 1000) / 1000;
            tva = storedTotal - base;
            expenses = 0;
        }
        total = storedTotal;
    } else {
        base = 0; tva = 0; expenses = 0; total = 0;
    }

    return {
        base: Math.round(base * 1000) / 1000,
        tva: Math.round(tva * 1000) / 1000,
        expenses: Math.round(expenses * 1000) / 1000,
        total: Math.round(total * 1000) / 1000
    };
}

// ── Facturation (Robust Join-based) ─────────────────────────────────────────

router.get('/facturation/list', authenticate, async (req, res) => {
    try {
        const { ref, de_part, date_debut, date_fin, page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        let ws = ['c.id_so = ?'];
        let ps = [req.user.id_so];
        if (ref)     { ws.push('c.ref::text LIKE ?'); ps.push('%'+ref+'%'); }
        if (de_part) { ws.push('c.de_part LIKE ?'); ps.push('%'+de_part+'%'); }
        if (date_debut && date_fin) { ws.push('c.date_inscri BETWEEN ? AND ?'); ps.push(date_debut, date_fin); }
        
        const condition = ws.join(' AND ');
        const query = `SELECT DISTINCT c.* FROM clients_record AS c INNER JOIN "œuvre_type" AS o ON c.id_r = o.id_o WHERE ${condition} ORDER BY c.id_r DESC`;
        
        const dossiers = await db.all(query, ps);
        const allActions = await db.all('SELECT * FROM "œuvre_type" WHERE id_so = ?', [req.user.id_so]);
        
        const actionMap = {};
        allActions.forEach(a => {
            const k = String(a.id_o);
            if (!actionMap[k]) actionMap[k] = [];
            const breakdown = computeActionSalaire(a);
            actionMap[k].push({ ...a, ...breakdown, final_salaire: breakdown.total });
        });

        const processed = dossiers.map(d => {
            const k = String(d.id_r);
            const acts = actionMap[k] || [];
            const baseSum = acts.reduce((a, act) => a + (act.base || 0), 0);
            const tvaSum = acts.reduce((a, act) => a + (act.tva || 0), 0);
            const expensesSum = acts.reduce((a, act) => a + (act.expenses || 0), 0);
            const totalSum = acts.reduce((a, act) => a + (act.total || 0), 0);
            
            const { id_r, ref, de_part, nom_cl1, nom_cl2, date_inscri, remarque, status } = d;

            return { 
                id_r, ref, de_part, nom_cl1, nom_cl2, date_inscri, remarque,
                status: status || 'not_started',
                id_o: id_r,
                actions: acts, 
                base_fare: Math.round(baseSum * 1000) / 1000,
                tva: Math.round(tvaSum * 1000) / 1000,
                expenses: Math.round(expensesSum * 1000) / 1000,
                calculated_total: Math.round(totalSum * 1000) / 1000
            };
        });

        const paginated = processed.slice(offset, offset + parseInt(limit));
        res.json({
            data: paginated,
            total: Math.round(processed.reduce((a, f) => a + f.calculated_total, 0) * 1000) / 1000,
            count: processed.length,
            page: parseInt(page),
            totalPages: Math.ceil(processed.length / limit)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Registre d'Exécution Endpoints ───────────────────────────────────────────

router.get('/', authenticate, async (req, res) => {
    try {
        const { page = 1, limit = 25, ref, nom_cl1, de_part, date_inscri } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let ws = ['c.id_so = ?'];
        let ps = [req.user.id_so];
        if (ref)     { ws.push('c.ref::text LIKE ?'); ps.push('%'+ref+'%'); }
        if (nom_cl1) { ws.push('(c.nom_cl1 LIKE ? OR c.nom_cl2 LIKE ?)'); ps.push('%'+nom_cl1+'%', '%'+nom_cl1+'%'); }
        if (de_part) { ws.push('c.de_part LIKE ?'); ps.push('%'+de_part+'%'); }
        if (date_inscri) { ws.push('c.date_inscri LIKE ?'); ps.push('%'+date_inscri+'%'); }
        
        const query = `SELECT DISTINCT c.*, c.id_r as id_o FROM clients_record c 
                       INNER JOIN "œuvre_type" o ON c.id_r = o.id_o 
                       WHERE ${ws.join(' AND ')} ORDER BY c.id_r DESC LIMIT ? OFFSET ?`;

        const rows = await db.all(query, [...ps, parseInt(limit), offset]);
        const countQuery = `SELECT COUNT(DISTINCT c.id_r) as count FROM clients_record c 
                            INNER JOIN "œuvre_type" o ON c.id_r = o.id_o 
                            WHERE ${ws.join(' AND ')}`;
        const cRow = await db.get(countQuery, ps);
        res.json({ data: (rows || []), total: cRow.count, page: parseInt(page), totalPages: Math.ceil(cRow.count / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', authenticate, async (req, res) => {
    try {
        const row = await db.get('SELECT *, id_r as id_o FROM clients_record WHERE id_r = ? AND id_so = ?', [req.params.id, req.user.id_so]);
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', authenticate, async (req, res) => {
    try {
        const record = { ...req.body };
        delete record.id_o; delete record.id_r; delete record.id_so; delete record.id_user;
        const ks = Object.keys(record);
        if (ks.length === 0) return res.json({ success: true });
        const set = ks.map(k => `"${k}" = ?`).join(', ');
        await db.run(`UPDATE clients_record SET ${set} WHERE id_r = ? AND id_so = ?`, [...Object.values(record), req.params.id, req.user.id_so]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Action Endpoints ──────────────────────────────────────────────────────────

router.get('/:id/actions', authenticate, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM "œuvre_type" WHERE id_o = ? ORDER BY id ASC', [req.params.id]);
        res.json((rows || []).map(r => ({ ...r, calculated_salaire: computeActionSalaire(r) })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/actions', authenticate, async (req, res) => {
    try {
        const act = { ...req.body, id_o: req.params.id, id_so: req.user.id_so, id_user: req.user.id };
        delete act.id;
        const ks = Object.keys(act);
        const cols = ks.map(k => `"${k}"`).join(',');
        const vals = ks.map(() => '?').join(',');
        
        let query = `INSERT INTO "œuvre_type" (${cols}) VALUES (${vals})`;
        if (process.env.POSTGRES_URL) {
            query += ` RETURNING id`;
        }
        
        const result = await db.run(query, Object.values(act));
        res.json({ id: result.lastID, ...act });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id/actions/:actionId', authenticate, async (req, res) => {
    try {
        await db.run('DELETE FROM "œuvre_type" WHERE id = ? AND id_o = ?', [req.params.actionId, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Record
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        await db.run('DELETE FROM "œuvre_type" WHERE id_o = ? AND id_so = ?', [id, req.user.id_so]);
        await db.run('DELETE FROM clients_record WHERE id_r = ? AND id_so = ?', [id, req.user.id_so]);
        res.json({ success: true, deletedID: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

module.exports = router;
