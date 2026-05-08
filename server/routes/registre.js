const express = require('express');
const router = express.Router();
const db = require('../db');

const authenticate = require('../middleware/auth');
const { logActivity } = require('../utils/logger');

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

// New formula: Fees (origine, exemple, version_bureau, orientation) + VAT (on Fees) + Expenses (others)
function computeSalaire(row) {
    const stored = parseFloat(row.salaire) || 0;
    // We check for a flag 'use_stored' or similar if we wanted to prioritize legacy, 
    // but user says this applies to existing and new records.
    // However, if salaire was manually entered and no breakdown exists, we might want to keep it.
    // Based on user: "الجملة العامة = أجور + VAT + مصاريف"
    
    const fees = ['origine','exemple','version_bureau','orientation']
        .reduce((s, k) => s + (parseInt(row[k]) || 0), 0);
    const tva = Math.round(fees * (parseFloat(cachedTVA) || 19) / 100);
    const expenses = ['delimitation','inscri','mobilite','imprimer','poste','autre']
        .reduce((s, k) => s + (parseInt(row[k]) || 0), 0);
        
    const total = fees + tva + expenses;
    return total > 0 ? total : stored;
}

module.exports.refreshTVA = refreshTVA;

// Get all records (clients_record) with advanced search
router.get('/', authenticate, async (req, res) => {
    try {
        const { page = 1, limit = 50, ref, nom_cl1, de_part, date_reg, date_inscri } = req.query;
        const offset = (page - 1) * limit;

        let query = `SELECT * FROM clients_record WHERE id_so::text = ?`;
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
        if (date_inscri) {
            query += ` AND date_inscri LIKE ?`;
            params.push(`%${date_inscri}%`);
        }

        query += ` ORDER BY ref DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const rows = await db.all(query, params);
        
        let countQuery = `SELECT COUNT(*) as count FROM clients_record WHERE id_so::text = ?`;
        let countParams = [req.user.id_so];
        
        // Re-apply same filters for count
        if (ref) { countQuery += ` AND ref::text LIKE ?`; countParams.push(`%${ref}%`); }
        if (nom_cl1) { countQuery += ` AND (nom_cl1 LIKE ? OR nom_cl2 LIKE ?)`; countParams.push(`%${nom_cl1}%`, `%${nom_cl1}%`); }
        if (de_part) { countQuery += ` AND de_part LIKE ?`; countParams.push(`%${de_part}%`); }
        if (date_reg) { countQuery += ` AND date_reg LIKE ?`; countParams.push(`%${date_reg}%`); }
        if (date_inscri) { countQuery += ` AND date_inscri LIKE ?`; countParams.push(`%${date_inscri}%`); }

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
        const row = await db.get(`SELECT * FROM clients_record WHERE id_r::text = ? AND id_so::text = ?`, [id, req.user.id_so]);
        if (row) {
            await logActivity(req.user, 'VIEW', 'RECORD', `عرض الملف العام عدد ${row.ref || id}`);
        }
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
            'tribunal', 'resultat', 'tel2_cl1', 'tel2_cl2',
            'service_petitioner_name', 'service_petitioner_contact', 'date_echeance'
        ];

        const finalRecord = {};
        
        // 1. Auto-increment ref if not provided
        if (!req.body.ref) {
            const maxRefRow = await db.get(`SELECT MAX(ref) as max_ref FROM clients_record WHERE id_so = ?`, [req.user.id_so]);
            finalRecord.ref = (parseInt(maxRefRow?.max_ref) || 0) + 1;
        } else {
            finalRecord.ref = req.body.ref;
        }

        // 2. Calculate date_echeance (date_reg + 5 days)
        const date_reg = req.body.date_reg || new Date().toISOString().split('T')[0];
        if (!req.body.date_echeance && date_reg) {
            try {
                const d = new Date(date_reg);
                if (!isNaN(d.getTime())) {
                    d.setDate(d.getDate() + 5);
                    finalRecord.date_echeance = d.toISOString().split('T')[0];
                }
            } catch (e) {
                console.error("Error calculating date_echeance:", e);
            }
        }

        allColumns.forEach(col => {
            if (finalRecord[col] !== undefined) return; // already set (ref or date_echeance)
            
            const val = req.body[col];
            if (val !== undefined && val !== null && val !== '') {
                finalRecord[col] = val;
            } else {
                if (col === 'id_user') finalRecord[col] = req.user.id;
                else if (col === 'id_so') finalRecord[col] = req.user.id_so;
                else if (col === 'date_ajout') finalRecord[col] = new Date().toLocaleString('fr-FR');
                else if (col === 'status') finalRecord[col] = 'has_deposit';
                else if (['id_r'].includes(col)) {
                    // handled by Postgres
                } else if (['nom_cl1', 'nom_cl2', 'de_part', 'date_reg', 'remarque', 'date_s', 'nombre', 'tribunal', 'resultat', 'service_petitioner_name', 'service_petitioner_contact', 'date_echeance', 'date_inscri'].includes(col)) {
                    finalRecord[col] = finalRecord[col] || '';
                } else {
                    finalRecord[col] = '0';
                }
            }
        });

        const keys = Object.keys(finalRecord).filter(k => finalRecord[k] !== undefined);
        const values = keys.map(k => finalRecord[k]);
        const placeholders = keys.map(() => '?').join(',');

        const quotedKeys = keys.map(k => `"${k}"`);
        let query = `INSERT INTO clients_record (${quotedKeys.join(',')}) VALUES (${placeholders})`;
        if (process.env.POSTGRES_URL) {
            query += ` RETURNING id_r`;
        }
        
        const result = await db.run(query, values);
        
        await logActivity(req.user, 'CREATE', 'RECORD', `إضافة ملف عام جديد عدد ${finalRecord.ref}`);

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

        const setString = keys.map(k => `"${k}" = ?`).join(', ');
        const query = `UPDATE clients_record SET ${setString} WHERE id_r::text = ? AND id_so::text = ?`;
        
        values.push(id, req.user.id_so);
        
        await db.run(query, values);
        
        await logActivity(req.user, 'UPDATE', 'RECORD', `تعديل الملف العام (ID: ${id})`);

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

        await db.run(`UPDATE clients_record SET status = ? WHERE id_r::text = ? AND id_so::text = ?`, 
            [status, id, req.user.id_so]);
        res.json({ success: true, status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Facturation — filterable billing list with salaire total
function computeSalaireBreakdown(row) {
    const rate = parseFloat(cachedTVA) || 19;

    const fees = ['origine','exemple','version_bureau','orientation']
        .reduce((s, k) => s + (parseInt(row[k]) || 0), 0);
    const expenses = ['delimitation','inscri','mobilite','imprimer','poste','autre']
        .reduce((s, k) => s + (parseInt(row[k]) || 0), 0);
    
    const tva = Math.round(fees * rate / 100);
    const total = fees + tva + expenses;

    return {
        base: fees, // "Fees" (أجور)
        tva: tva,
        expenses: expenses,
        total: total
    };
}

router.get('/facturation/list', authenticate, async (req, res) => {
    try {
        const { ref, de_part, remarque, date_debut, date_fin, page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = `SELECT id_r::text as id_r, ref, de_part, nom_cl1, nom_cl2, date_reg, date_inscri, remarque, salaire, "TVA" as tva, status,
                            origine, exemple, version_bureau, orientation, mobilite,
                            imprimer, inscri, delimitation, poste, autre, id_so::text as id_so
                     FROM clients_record c 
                     WHERE id_so::text = ? 
                     AND c.is_execution = FALSE`;
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

        query += ` ORDER BY ref DESC`;

        const rows = await db.all(query, params);

        const withValue = (rows || [])
            .map(row => {
                const b = computeSalaireBreakdown(row);
                const { 
                    id_r, ref, de_part, nom_cl1, nom_cl2, date_reg, date_inscri, remarque, 
                    origine, exemple, version_bureau, orientation, mobilite,
                    imprimer, inscri, delimitation, poste, autre 
                } = row;
                
                return {
                    id_r, ref, de_part, nom_cl1, nom_cl2, date_reg, date_inscri, remarque,
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
        await db.run('DELETE FROM "œuvre_type" WHERE id_o::text = ? AND id_so::text = ?', [id, req.user.id_so]);
        await db.run('DELETE FROM clients_record WHERE id_r::text = ? AND id_so::text = ?', [id, req.user.id_so]);
        
        await logActivity(req.user, 'DELETE', 'RECORD', `حذف الملف العام (ID: ${id})`);

        res.json({ success: true, deletedID: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
