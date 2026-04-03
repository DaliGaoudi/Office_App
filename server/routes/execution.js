const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/auth');

function computeActionSalaire(row) {
    if (!row) return 0;
    const s = parseFloat(row.salaire) || 0;
    const t = parseFloat(row["TVA"]) || 0;
    const tt = parseFloat(row.total) || 0;
    if (tt > 0) return tt;
    return s + t;
}

// Main Execution List
router.get('/', authenticate, async (req, res) => {
    try {
        const { search = '', page = 1, limit = 25 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const l = parseInt(limit);
        
        let query = `SELECT DISTINCT c.*, c.id_r as id_o FROM clients_record c 
                       INNER JOIN "œuvre_type" o ON c.id_r::text = o.id_o::text 
                       WHERE c.id_so::text = ?`;
        let params = [req.user.id_so];

        if (search) {
            query += ` AND (c.ref::text LIKE ? OR c.nom_cl1 LIKE ? OR c.de_part LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        const countQuery = `SELECT COUNT(DISTINCT c.id_r) as count FROM clients_record c 
                            INNER JOIN "œuvre_type" o ON c.id_r::text = o.id_o::text 
                            WHERE c.id_so::text = ? ${search ? 'AND (c.ref::text LIKE ? OR c.nom_cl1 LIKE ? OR c.de_part LIKE ?)' : ''}`;
        
        const cRow = await db.get(countQuery, params);
        
        query += ` ORDER BY c.id_r DESC LIMIT ? OFFSET ?`;
        const rows = await db.all(query, [...params, l, offset]);

        res.json({ data: (rows || []), total: parseInt(cRow?.count || 0), page: parseInt(page) });
    } catch (err) {
        console.error("Execution Main List Error:", err);
        res.status(500).json({ error: err.message, v: "2.1" });
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
                       o.id as action_id, o.type_operation, o.salaire as action_salaire, o."TVA" as action_tva, o.total as action_total
                      FROM clients_record c 
                      INNER JOIN "œuvre_type" o ON c.id_r::text = o.id_o::text 
                      WHERE c.id_so::text = ?`;
        let params = [req.user.id_so];

        if (ref) {
            query += ` AND c.ref::text LIKE ?`;
            params.push(`%${ref}%`);
        }
        if (de_part) {
            query += ` AND c.de_part::text LIKE ?`;
            params.push(`%${de_part}%`);
        }

        query += ` ORDER BY c.id_r DESC`;
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
            groupedMap.get(row.id_r).actions.push({
                id: row.action_id,
                type: row.type_operation,
                salaire: row.action_salaire,
                tva: row.action_tva,
                total: row.action_total,
                // Add base/tva/expenses aliases for frontend (Facturation.jsx expects .base, .tva, .expenses, .total)
                base: parseFloat(row.action_salaire) || 0,
                expenses: 0, 
                // total is already there
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

// Actions for Record
router.get('/:id/actions', authenticate, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM "œuvre_type" WHERE id_o::text = ? ORDER BY id ASC', [req.params.id]);
        res.json((rows || []).map(r => ({ ...r, calculated_salaire: computeActionSalaire(r) })));
    } catch (err) {
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
