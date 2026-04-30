const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/auth');

function computeActionSalaire(row) {
    if (!row) return 0;
    
    // Check if it's already calculated/stored
    const storedTotal = parseFloat(row.total) || 0;
    
    const fees = ['origine','exemple','versionbureau','orientation']
        .reduce((s, k) => s + (parseInt(row[k]) || 0), 0);
    // Note: in œuvre_type table from old schema, it was versionbureau (one word) and no 'version_bureau'
    
    const rate = 19; // Assume 19% or get from row if stored
    const tva = Math.round(fees * rate / 100);
    const expenses = ['delimitation','inscri','mobilite','imprimer','postal','autre']
        .reduce((s, k) => s + (parseInt(row[k]) || 0), 0);
        
    const calculated = fees + tva + expenses;
    return calculated > 0 ? calculated : (parseFloat(row.salaire) || storedTotal);
}

// Main Execution List
router.get('/', authenticate, async (req, res) => {
    try {
        const { search = '', page = 1, limit = 25 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const l = parseInt(limit);
        
        // Query to sum the 'salaire' (total price) of all actions per record using a subquery and EXISTS to avoid duplication
        let query = `SELECT c.*, c.id_r as id_o, 
                       (SELECT COALESCE(SUM(CAST(NULLIF(o2.salaire, '') AS NUMERIC)), 0) 
                        FROM "œuvre_type" o2 
                        WHERE o2.id_o::text = c.id_r::text) as total_salaire
                        FROM clients_record c 
                       WHERE c.id_so::text = ? 
                       AND c.is_execution = TRUE`;
        let params = [req.user.id_so];

        if (search) {
            query += ` AND (c.ref::text LIKE ? OR c.nom_cl1 LIKE ? OR c.de_part LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        const countQuery = `SELECT COUNT(c.id_r) as count FROM clients_record c 
                            WHERE c.id_so::text = ? 
                            AND c.is_execution = TRUE
                            ${search ? 'AND (c.ref::text LIKE ? OR c.nom_cl1 LIKE ? OR c.de_part LIKE ?)' : ''}`;
        
        const cRow = await db.get(countQuery, params);
        
        query += ` ORDER BY c.ref DESC LIMIT ? OFFSET ?`;
        const rows = await db.all(query, [...params, l, offset]);

        res.json({ data: (rows || []), total: parseInt(cRow?.count || 0), page: parseInt(page) });
    } catch (err) {
        console.error("Execution Main List Error:", err);
        res.status(500).json({ error: err.message, v: "2.1" });
    }
});

// Create new Execution Record (Base create)
router.post('/', authenticate, async (req, res) => {
    try {
        const { ref, de_part, nom_cl1, nom_cl2, date_reg, remarque } = req.body;
        const id_so = req.user.id_so;
        const id_user = req.user.id;

        // 1. Create the base record in clients_record
        // We use a simplified insert similar to registre.js but tailored for execution start
        const insertClientQuery = `
            INSERT INTO clients_record (ref, de_part, nom_cl1, nom_cl2, date_reg, remarque, id_so, id_user, status, is_execution)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'has_deposit', TRUE)
            RETURNING id_r
        `;
        const clientResult = await db.run(insertClientQuery, [
            ref ? parseInt(ref) : null,   // ref is INTEGER in PG — never pass ''
            de_part   || null,
            nom_cl1   || null,
            nom_cl2   || null,
            date_reg || new Date().toISOString().split('T')[0],
            remarque  || null,
            parseInt(id_so)  || null,
            parseInt(id_user) || null
        ]);

        const newId = clientResult.lastID;



        res.json({ success: true, id: newId });
    } catch (err) {
        console.error("Execution Create Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Facturation List (The problematic one)
router.get('/facturation/list', authenticate, async (req, res) => {
    console.log("Vercel executing Facturation List v2.1");
    try {
        const { ref, de_part, page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const l = parseInt(limit);

        let query = `SELECT c.id_r::text as id_r, c.ref, c.de_part, c.nom_cl1, c.nom_cl2, c.date_reg, c.remarque, c.salaire, c."TVA" as tva, c.status,
                       o.id as action_id, o.type_operation, o.salaire as action_salaire, o."TVA" as action_tva,
                       o.origine, o.exemple, o.versionbureau, o.orientation,
                       o.delimitation, o.inscri, o.mobilite, o.imprimer, o.postal, o.autre
                      FROM clients_record c 
                      LEFT JOIN "œuvre_type" o ON c.id_r::text = o.id_o::text 
                      WHERE c.id_so::text = ? 
                      AND c.is_execution = TRUE`;
        let params = [req.user.id_so];

        if (ref) {
            query += ` AND c.ref::text LIKE ?`;
            params.push(`%${ref}%`);
        }
        if (de_part) {
            query += ` AND c.de_part::text LIKE ?`;
            params.push(`%${de_part}%`);
        }

        query += ` ORDER BY c.ref DESC`;
        const rows = await db.all(query, params);

        // Group actions by record
        const groupedMap = new Map();
        (rows || []).forEach(row => {
            if (!groupedMap.has(row.id_r)) {
                groupedMap.set(row.id_r, {
                    id_r: row.id_r,
                    id_o: row.id_r,
                    ref: row.ref,
                    de_part: row.de_part,
                    nom_cl1: row.nom_cl1,
                    nom_cl2: row.nom_cl2,
                    date_reg: row.date_reg,
                    remarque: row.remarque,
                    status: row.status,
                    actions: []
                });
            }
            const s   = parseFloat(row.action_salaire) || 0;
            const t   = parseFloat(row.action_tva) || 0;
            const fees = ['origine','exemple','versionbureau','orientation']
                .reduce((sum, k) => sum + (parseFloat(row[k]) || 0), 0);
            const expenses = ['delimitation','inscri','mobilite','imprimer','postal','autre']
                .reduce((sum, k) => sum + (parseFloat(row[k]) || 0), 0);

            groupedMap.get(row.id_r).actions.push({
                id: row.action_id,
                type: row.type_operation,
                salaire: s,
                tva: t,
                total: s, // 'salaire' is already the grand total from DB
                base: fees,
                expenses: expenses,
            });
        });

        const allData = Array.from(groupedMap.values());
        const paginated = allData.slice(offset, offset + l);

        res.json({ 
            data: paginated, 
            count: allData.length,
            totalPages: Math.ceil(allData.length / l),
            page: parseInt(page) 
        });
    } catch (err) {
        console.error("Execution Facturation Error:", err);
        res.status(500).json({ error: err.message, stack: err.stack, v: "2.1" });
    }
});

// Single Record
router.get('/:id', authenticate, async (req, res) => {
    try {
        const row = await db.get('SELECT *, id_r as id_o FROM clients_record WHERE id_r::text = ? AND id_so::text = ?', [req.params.id, req.user.id_so]);
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Base Record
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const record = req.body;
        
        // Remove non-updatable fields
        delete record.id_r;
        delete record.id_o;
        delete record.id_user;
        delete record.id_so;
        delete record.actions; // UI-only field from grouped list

        const keys = Object.keys(record);
        const values = Object.values(record);
        
        if (keys.length === 0) return res.json({ success: true });

        const setString = keys.map(k => `"${k}" = ?`).join(', ');
        const query = `UPDATE clients_record SET ${setString} WHERE id_r::text = ? AND id_so::text = ?`;
        
        values.push(id, req.user.id_so);
        
        await db.run(query, values);
        res.json({ success: true, updatedID: id });
    } catch (err) {
        console.error("Execution base update error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Update Status
router.patch('/:id/status', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await db.run('UPDATE clients_record SET status = ? WHERE id_r::text = ? AND id_so::text = ?', [status, id, req.user.id_so]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Action (Stage) Management ──────────────────────────────────────────────

// Actions for Record (Moved up for priority)
router.get('/:id/actions', authenticate, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM "œuvre_type" WHERE id_o::text = ? ORDER BY id ASC', [req.params.id]);
        res.json((rows || []).map(r => ({ 
            ...r, 
            total: parseFloat(r.salaire) || 0, // Ensure 'total' is available for frontend
            calculated_salaire: computeActionSalaire(r) 
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add Action to Record
router.post('/:id/actions', authenticate, async (req, res) => {
    try {
        const { id } = req.params; // record ID (id_o)
        const action = req.body;
        
        const keys = [
            'type_operation', 'date_r', 'val_financiere', 'remarques', 'id_o', 'id_user', 'id_so',
            'origine', 'exemple', 'versionbureau', 'mobilite', 'orientation', 'imprimer', 'TVA', 
            'montantpartiel1', 'montantpartiel2', 'salaire', 'inscri', 'delimitation', 'postal', 'autre'
        ];
        
        const data = {};
        keys.forEach(k => {
            if (k === 'id_o') data[k] = parseInt(id);
            else if (k === 'id_user') data[k] = parseInt(req.user.id);
            else if (k === 'id_so') data[k] = parseInt(req.user.id_so);
            else if (k === 'date_r' && !action[k]) data[k] = new Date().toISOString().split('T')[0];
            else {
                const val = action[k];
                if (['type_operation', 'date_r', 'remarques'].includes(k)) {
                    data[k] = val || '';
                } else {
                    data[k] = val ? (isNaN(val) ? val : parseFloat(val)) : 0;
                }
            }
        });
        
        // No manual ID generation needed anymore! Database handles it via SERIAL.

        const columns = Object.keys(data);
        const quotedColumns = columns.map(c => `"${c}"`);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
        const query = `INSERT INTO "œuvre_type" (${quotedColumns.join(',')}) VALUES (${placeholders}) RETURNING *`;
        const result = await db.run(query, Object.values(data));
        
        // db.run returns lastID which will be the new 'id'
        const finalId = result.lastID;

        res.json({ success: true, id: finalId, ...data });
    } catch (err) {
        console.error("Action insertion error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Delete Action (Moved up and robustified for 'null' IDs)
router.delete('/:id/actions/:actionId', authenticate, async (req, res) => {
    try {
        const { id, actionId } = req.params;
        let query;
        let params;

        if (actionId === 'null' || !actionId) {
            // Special cleanup for legacy records that have NULL in the id column
            query = 'DELETE FROM "œuvre_type" WHERE id_o::text = $1 AND id IS NULL AND id_so::text = $2';
            params = [id, req.user.id_so];
        } else {
            query = 'DELETE FROM "œuvre_type" WHERE id::text = $1 AND id_so::text = $2';
            params = [actionId, req.user.id_so];
        }

        await db.run(query, params);
        res.json({ success: true, deletedID: actionId });
    } catch (err) {
        console.error("Action deletion error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Update Action
router.put('/:id/actions/:actionId', authenticate, async (req, res) => {
    try {
        const { actionId } = req.params;
        const action = req.body;
        
        const keys = [
            'type_operation', 'date_r', 'val_financiere', 'remarques',
            'origine', 'exemple', 'versionbureau', 'mobilite', 'orientation', 'imprimer', 'TVA', 
            'montantpartiel1', 'montantpartiel2', 'salaire', 'inscri', 'delimitation', 'postal', 'autre'
        ];
        
        const data = {};
        keys.forEach(k => {
            const val = action[k];
            if (['type_operation', 'date_r', 'remarques'].includes(k)) {
                data[k] = val || '';
            } else {
                data[k] = val ? (isNaN(val) ? val : parseFloat(val)) : 0;
            }
        });

        const setClause = Object.keys(data).map((c, i) => `"${c}" = $${i + 1}`).join(', ');
        const query = `UPDATE "œuvre_type" SET ${setClause} WHERE id::text = $${Object.keys(data).length + 1} AND id_so::text = $${Object.keys(data).length + 2} RETURNING *`;
        
        const params = [...Object.values(data), actionId, req.user.id_so];
        const result = await db.run(query, params);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Action not found' });
        }

        res.json({ success: true, id: actionId, ...data });
    } catch (err) {
        console.error("Action update error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Delete Record
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        await db.run('DELETE FROM "œuvre_type" WHERE id_o::text = $1 AND id_so::text = $2', [id, req.user.id_so]);
        await db.run('DELETE FROM clients_record WHERE id_r::text = $1 AND id_so::text = $2', [id, req.user.id_so]);
        res.json({ success: true, deletedID: id });
    } catch (err) {
        res.status(500).json({ error: err.message, v: "2.1" });
    }
});

module.exports = router;
