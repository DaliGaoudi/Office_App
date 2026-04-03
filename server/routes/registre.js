const express = require('express');
const router = express.Router();
const db = require('../db');

function authenticate(req, res, next) {
    req.user = { id: 35, id_so: '35', role: 'admin' };
    next();
}

// ── TVA cache (refreshed from settings table) ──────────────────────────────
let cachedTVA = 19; // default — overridden on first DB read

function refreshTVA(callback) {
    db.get(`SELECT value FROM app_settings WHERE key='tva_rate'`, [], (err, row) => {
        if (!err && row) cachedTVA = parseFloat(row.value) || 19;
        if (callback) callback();
    });
}

// Warm up cache on startup
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL, label TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        db.run(`INSERT OR IGNORE INTO app_settings (key, value, label)
                VALUES ('tva_rate','19','تسعيرة أ.ق.م (%)')`, () => {
            refreshTVA();
        });
    });
});

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
router.get('/', authenticate, (req, res) => {
    const { page = 1, limit = 50, ref, nom_cl1, de_part, date_reg } = req.query;
    const offset = (page - 1) * limit;

    let query = `SELECT * FROM clients_record WHERE id_so = ?`;
    let params = [req.user.id_so];

    if (ref) {
        query += ` AND ref LIKE ?`;
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

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let countQuery = `SELECT COUNT(*) as count FROM clients_record WHERE id_so = ?`;
        let countParams = [req.user.id_so];
        
        // Re-apply same filters for count
        if (ref) { countQuery += ` AND ref LIKE ?`; countParams.push(`%${ref}%`); }
        if (nom_cl1) { countQuery += ` AND (nom_cl1 LIKE ? OR nom_cl2 LIKE ?)`; countParams.push(`%${nom_cl1}%`, `%${nom_cl1}%`); }
        if (de_part) { countQuery += ` AND de_part LIKE ?`; countParams.push(`%${de_part}%`); }
        if (date_reg) { countQuery += ` AND date_reg LIKE ?`; countParams.push(`%${date_reg}%`); }

        db.get(countQuery, countParams, (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                data: rows.map(r => ({ ...r, salaire: computeSalaire(r) })),
                total: row.count,
                page: parseInt(page),
                totalPages: Math.ceil(row.count / limit)
            });
        });
    });
});

// Get Record By ID
router.get('/:id', authenticate, (req, res) => {
    const { id } = req.params;
    db.get(`SELECT * FROM clients_record WHERE id_r = ? AND id_so = ?`, [id, req.user.id_so], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

// Create Record
router.post('/', authenticate, (req, res) => {
    // Defaults and Mandatory fields from schema
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
        // Default to provided value or '0'/empty string
        const val = req.body[col];
        if (val !== undefined && val !== null && val !== '') {
            finalRecord[col] = val;
        } else {
            // Apply logic-based defaults
            if (col === 'id_user') finalRecord[col] = req.user.id;
            else if (col === 'id_so') finalRecord[col] = req.user.id_so;
            else if (col === 'date_ajout') finalRecord[col] = new Date().toLocaleString('fr-FR');
            else if (col === 'status') finalRecord[col] = (parseFloat(req.body.acompte) > 0) ? 'has_deposit' : 'not_started';
            else if (['id_r', 'ref'].includes(col)) {
                if (val === '' || val === undefined) {
                    // let it be handled by SQLite if possible, or null
                    // but id_r is manual, so if it's empty, we might have a problem.
                    // User should provide it.
                } else {
                    finalRecord[col] = parseInt(val);
                }
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

    const query = `INSERT INTO clients_record (${keys.join(',')}) VALUES (${placeholders})`;
    console.log('DEBUG: EXECUTING INSERT:', query, values);
    
    db.run(query, values, function(err) {
        if (err) {
            console.error('DEBUG: INSERT ERROR:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ id_r: this.lastID, ...finalRecord });
    });
});

// Update Record
router.put('/:id', authenticate, (req, res) => {
    const { id } = req.params;
    const record = req.body;
    
    // Disallow updating primary keys or system fields blindly
    delete record.id_r;
    delete record.id_user;
    delete record.id_so;

    const keys = Object.keys(record);
    const values = Object.values(record);
    
    if (keys.length === 0) return res.json({ success: true });

    const setString = keys.map(k => `${k} = ?`).join(', ');
    const query = `UPDATE clients_record SET ${setString} WHERE id_r = ? AND id_so = ?`;
    
    values.push(id, req.user.id_so);
    
    db.run(query, values, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, updatedID: id });
    });
});

// Update Status Only
router.patch('/:id/status', authenticate, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) return res.status(400).json({ error: 'Status is required' });

    db.run(`UPDATE clients_record SET status = ? WHERE id_r = ? AND id_so = ?`, 
        [status, id, req.user.id_so], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, status });
        }
    );
});

// Facturation — filterable billing list with salaire total
// If salaire is not stored, compute it from subcomponents (same formula as legacy calcSum)
function computeSalaire(row) {
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
        // Detailed breakdown exists
        base = baseRaw;
        const storedTVA = parseFloat(row.TVA) || 0;
        tva = (storedTVA > 0) ? storedTVA : Math.round(base * rate / 100);
        expenses = expensesRaw;
        total = base + tva + expenses;
    } else if (storedTotal > 0) {
        // Fallback: Back-calculate from stored total
        const storedTVA = parseFloat(row.TVA) || 0;
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

router.get('/facturation/list', authenticate, (req, res) => {
    const { ref, de_part, remarque, date_debut, date_fin, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `SELECT id_r, ref, de_part, nom_cl1, nom_cl2, date_reg, remarque, salaire, TVA, status,
                        origine, exemple, version_bureau, orientation, mobilite,
                        imprimer, inscri, delimitation, poste, autre
                 FROM clients_record WHERE id_so = ?`;
    let params = [req.user.id_so];

    if (ref)      { query += ` AND ref LIKE ?`;      params.push(`%${ref}%`); }
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

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Compute breakdown for each row, then keep only rows with a value > 0
        const withValue = (rows || [])
            .map(row => {
                const b = computeSalaire(row);
                // Extract only needed fields to avoid collisions
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
            .filter(row => row.calculated_total > 0);

        const grandTotal   = withValue.reduce((sum, r) => sum + r.calculated_total, 0);
        const totalRecords = withValue.length;
        const totalPages   = Math.ceil(totalRecords / (parseInt(limit) || 50));

        // Apply pagination on the already-filtered in-memory set
        const paginated = withValue.slice(offset, offset + parseInt(limit));

        res.json({
            data:       paginated,
            total:      Math.round(grandTotal * 1000) / 1000,
            count:      totalRecords,
            page:       parseInt(page),
            totalPages
        });
    });
});

// Delete Record (with cascading cleanup of œuvre_type actions)
router.delete('/:id', authenticate, (req, res) => {
    const { id } = req.params;
    db.serialize(() => {
        db.run('DELETE FROM "œuvre_type" WHERE id_o = ? AND id_so = ?', [id, req.user.id_so], (err) => {
            if (err) console.error("Error deleting from œuvre_type:", err.message);
        });
        db.run('DELETE FROM clients_record WHERE id_r = ? AND id_so = ?', [id, req.user.id_so], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, deletedID: id });
        });
    });
});

module.exports = router;
