const express = require('express');
const router = express.Router();
const db = require('../db');

const authenticate = require('../middleware/auth');

// ── TVA cache (refreshed from settings table) ──────────────────────────────
let cachedTVA = 19; // default — overridden on first DB read

async function refreshTVA() {
    try {
        const row = await db.get(`SELECT value FROM app_settings WHERE key='tva_rate'`);
        if (row) cachedTVA = parseFloat(row.value) || 19;
    } catch (err) {
        console.error('Error refreshing TVA:', err.message);
    }
}

// Warm up cache on startup
refreshTVA();

// Same formula as legacy jQuery calcSum — uses live TVA from settings
function computeSalaire(row) {
    const stored = parseFloat(row.salaire) || 0;
    if (stored > 0) return stored;
    const sum1 = ['origine','exemple','version_bureau','orientation','mobilite']
        .reduce((s, k) => s + (parseInt(row[k]) || 0), 0);
    const tva = Math.round(sum1 * cachedTVA / 100);
    const sum2 = ['imprimer','inscri','delimitation','poste','autre']
        .reduce((s, k) => s + (parseInt(row[k]) || 0), 0) + tva;
    return sum1 + sum2;
}

module.exports.refreshTVA = refreshTVA;

// Get all records (clients_record) with advanced search
router.get('/', authenticate, async (req, res) => {
    try {
        const { page = 1, limit = 50, ref, nom_cl1, de_part, date_reg } = req.query;
        const offset = (page - 1) * limit;

        let query = `SELECT * FROM clients_record WHERE id_so = ?`;
        let params = [req.user.id_so];

        if (ref) {
            query += ` AND ref::text LIKE ?`;
            params.push(`%${ref}%`);
        }
        if (nom_cl1) {
            query += ` AND (nom_cl1 LIKE ? OR nom_cl2 LIKE ?)`;
            params.push(`%${nom_cl1}%`, `%${nom_cl1}%`);
        }
        if (de_part) {
            query += ` AND de_part LIKE ?`;
            params.push(`%${de_part}%`);
        }
        if (date_reg) {
            query += ` AND date_reg LIKE ?`;
            params.push(`%${date_reg}%`);
        }

        query += ` ORDER BY id_r DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const rows = await db.all(query, params);
        
        let countQuery = `SELECT COUNT(*) as count FROM clients_record WHERE id_so = ?`;
        let countParams = [req.user.id_so];
        
        // Re-apply same filters for count
        if (ref) { countQuery += ` AND ref::text LIKE ?`; countParams.push(`%${ref}%`); }
        if (nom_cl1) { countQuery += ` AND (nom_cl1 LIKE ? OR nom_cl2 LIKE ?)`; countParams.push(`%${nom_cl1}%`, `%${nom_cl1}%`); }
        if (de_part) { countQuery += ` AND de_part LIKE ?`; countParams.push(`%${de_part}%`); }
        if (date_reg) { countQuery += ` AND date_reg LIKE ?`; countParams.push(`%${date_reg}%`); }

        const countRow = await db.get(countQuery, countParams);
        const count = parseInt(countRow.count);

        res.json({
            data: rows.map(r => ({ ...r, salaire: computeSalaire(r) })),
            total: count,
            page: parseInt(page),
            totalPages: Math.ceil(count / limit)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Get Record By ID
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const row = await db.get(`SELECT * FROM clients_record WHERE id_r = ? AND id_so = ?`, [id, req.user.id_so]);
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Record
router.post('/', authenticate, async (req, res) => {
    try {
        const allColumns = [
            'id_r', 'montant_partiel1', 'montant_partiel2', 'inscri', 'delimitation', 'poste', 'autre',
            'nom_cl1', 'nom_cl2', 'de_part', 'ref', 'cl1_profession', 'cl1_adresse', 'cl1_avocat',
            'cl1_tel', 'cl1_adressepersonnel', 'cl2_profession', 'cl2_adresse', 'cl2_avocat', 'cl2_tel',
            'cl2_adressepersonnel', 'fin_date', 'remarque', 'date_reg', 'date_inscri', 'origine',
            'exemple', 'imprimer', 'orientation', 'mobilite', 'version_bureau', 'TVA', 'salaire',
            'acompte', 'resume', 'date_ajout', 'id_user', 'id_so', 'status', 'date_s', 'nombre',
            'tribunal', 'resultat', 'tel2_cl1', 'tel2_cl2'
        ];

        const finalRecord = {};
        allColumns.forEach(col => {
            const val = req.body[col];
            if (val !== undefined && val !== null && val !== '') {
                finalRecord[col] = val;
            } else {
                if (col === 'id_user') finalRecord[col] = req.user.id;
                else if (col === 'id_so') finalRecord[col] = req.user.id_so;
                else if (col === 'date_ajout') finalRecord[col] = new Date().toLocaleString('fr-FR');
                else if (col === 'status') finalRecord[col] = (parseFloat(req.body.acompte) > 0) ? 'has_deposit' : 'not_started';
                else if (['id_r', 'ref'].includes(col)) {
                    // let it be handled by Postgres if possible
                } else if (['nom_cl1', 'nom_cl2', 'de_part', 'date_reg', 'remarque', 'date_s', 'nombre', 'tribunal', 'resultat'].includes(col)) {
                    finalRecord[col] = '';
                } else {
                    finalRecord[col] = '0';
                }
            }
        });

        const keys = Object.keys(finalRecord).filter(k => finalRecord[k] !== undefined);
        const values = keys.map(k => finalRecord[k]);
        const placeholders = keys.map(() => '?').join(',');

        let query = `INSERT INTO clients_record (${keys.join(',')}) VALUES (${placeholders})`;
        if (process.env.POSTGRES_URL) {
            query += ` RETURNING id_r`;
        }
        
        const result = await db.run(query, values);
        res.json({ id_r: result.lastID, ...finalRecord });
    } catch (err) {
        console.error('INSERT ERROR:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Update Record
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const record = req.body;
        
        delete record.id_r;
        delete record.id_user;
        delete record.id_so;

        const keys = Object.keys(record);
        const values = Object.values(record);
        
        if (keys.length === 0) return res.json({ success: true });

        const setString = keys.map(k => `${k} = ?`).join(', ');
        const query = `UPDATE clients_record SET ${setString} WHERE id_r = ? AND id_so = ?`;
        
        values.push(id, req.user.id_so);
        
        await db.run(query, values);
        res.json({ success: true, updatedID: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Status Only
router.patch('/:id/status', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status is required' });

        await db.run(`UPDATE clients_record SET status = ? WHERE id_r = ? AND id_so = ?`, 
            [status, id, req.user.id_so]);
        res.json({ success: true, status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Facturation — filterable billing list with salaire total
function computeSalaireBreakdown(row) {
    const dateStr = row.date_reg || '';
    const isOld = dateStr && new Date(dateStr.replace(/\//g, '-')) < new Date('2018-01-01');
    const rate = isOld ? 13 : (parseFloat(cachedTVA) || 19);

    const baseRaw = ['origine','exemple','version_bureau','orientation','mobilite']
        .reduce((s, k) => s + (parseInt(row[k]) || 0), 0);
    const expensesRaw = ['imprimer','inscri','delimitation','poste','autre']
        .reduce((s, k) => s + (parseInt(row[k]) || 0), 0);
    const storedTotal = parseFloat(row.salaire) || 0;

    let base, tva, expenses, total;

    if (baseRaw > 0 || expensesRaw > 0) {
        base = baseRaw;
        const storedTVA = parseFloat(row.tva) || 0; // check for lower/upper case
        tva = (storedTVA > 0) ? storedTVA : Math.round(base * rate / 100);
        expenses = expensesRaw;
        total = base + tva + expenses;
    } else if (storedTotal > 0) {
        const storedTVA = parseFloat(row.tva) || 0;
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

router.get('/facturation/list', authenticate, async (req, res) => {
    try {
        const { ref, de_part, remarque, date_debut, date_fin, page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = `SELECT id_r::text as id_r, ref, de_part, nom_cl1, nom_cl2, date_reg, remarque, salaire, "TVA" as tva, status,
                            origine, exemple, version_bureau, orientation, mobilite,
                            imprimer, inscri, delimitation, poste, autre, id_so::text as id_so
                     FROM clients_record c 
                     WHERE id_so::text = ? 
                     AND NOT EXISTS (SELECT 1 FROM "œuvre_type" o WHERE o.id_o::text = c.id_r::text)`;
        let params = [req.user.id_so];
        console.log(`Facturation params:`, params);

        if (ref)      { query += ` AND ref::text LIKE ?`;      params.push(`%${ref}%`); }
        if (de_part)  { query += ` AND de_part LIKE ?`;  params.push(`%${de_part}%`); }
        if (remarque) { query += ` AND remarque LIKE ?`; params.push(`%${remarque}%`); }
        if (date_debut && date_fin) {
            query += ` AND date_reg BETWEEN ? AND ?`;
            params.push(date_debut, date_fin);
        } else if (date_debut) {
            query += ` AND date_reg >= ?`;
            params.push(date_debut);
        } else if (date_fin) {
            query += ` AND date_reg <= ?`;
            params.push(date_fin);
        }

        query += ` ORDER BY id_r DESC`;

        const rows = await db.all(query, params);

        const withValue = (rows || [])
            .map(row => {
                const b = computeSalaireBreakdown(row);
                const { 
                    id_r, ref, de_part, nom_cl1, nom_cl2, date_reg, remarque, 
                    origine, exemple, version_bureau, orientation, mobilite,
                    imprimer, inscri, delimitation, poste, autre 
                } = row;
                
                return {
                    id_r, ref, de_part, nom_cl1, nom_cl2, date_reg, remarque,
                    status: row.status || 'not_started',
                    id_o: id_r,
                    origine, exemple, version_bureau, orientation, mobilite,
                    imprimer, inscri, delimitation, poste, autre,
                    base_fare: b.base,
                    tva: b.tva,
                    expenses: b.expenses,
                    calculated_total: b.total
                };
            })
            .filter(row => {
                const hasCost = row.calculated_total > 0;
                // If the user wants to see records even with 0 cost but with certain status, we can add it here.
                // For now, adhering strictly to "i only want to see records that actually have costs added"
                return hasCost;
            });

        const grandTotal   = withValue.reduce((sum, r) => sum + r.calculated_total, 0);
        const totalRecords = withValue.length;
        const totalPages   = Math.ceil(totalRecords / (parseInt(limit) || 50));

        const paginated = withValue.slice(offset, offset + parseInt(limit));

        res.json({
            data:       paginated,
            total:      Math.round(grandTotal * 1000) / 1000,
            count:      totalRecords,
            page:       parseInt(page),
            totalPages
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Record (with cascading cleanup of œuvre_type actions)
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
