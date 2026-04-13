const express = require('express');
const router = express.Router();
const db = require('../db');

const authenticate = require('../middleware/auth');

// Get all records for CNSS
router.get('/', authenticate, async (req, res) => {
    try {
        const { page = 1, limit = 50, nom_ste, num_cnss, num_affaire } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = `SELECT * FROM cnss WHERE id_so = ?`;
        let params = [req.user.id_so];

        if (nom_ste) {
            query += ` AND nom_ste LIKE ?`;
            params.push(`%${nom_ste}%`);
        }
        if (num_cnss) {
            query += ` AND num_cnss LIKE ?`;
            params.push(`%${num_cnss}%`);
        }
        if (num_affaire) {
            query += ` AND num_affaire LIKE ?`;
            params.push(`%${num_affaire}%`);
        }

        query += ` ORDER BY num_affaire ASC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const rows = await db.all(query, params);
        
        let countQuery = `SELECT COUNT(*) as count FROM cnss WHERE id_so = ?`;
        let countParams = [req.user.id_so];
        
        if (nom_ste) { countQuery += ` AND nom_ste LIKE ?`; countParams.push(`%${nom_ste}%`); }
        if (num_cnss) { countQuery += ` AND num_cnss LIKE ?`; countParams.push(`%${num_cnss}%`); }
        if (num_affaire) { countQuery += ` AND num_affaire LIKE ?`; countParams.push(`%${num_affaire}%`); }

        const countRow = await db.get(countQuery, countParams);
        const count = parseInt(countRow.count);

        res.json({
            data: rows,
            total: count,
            page: parseInt(page),
            totalPages: Math.ceil(count / limit)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Record By ID
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const row = await db.get(`SELECT * FROM cnss WHERE id_cn = ? AND id_so = ?`, [id, req.user.id_so]);
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create CNSS Record
router.post('/', authenticate, async (req, res) => {
    try {
        const record = req.body;
        record.id_user = req.user.id;
        record.id_so = req.user.id_so;
        
        const keys = Object.keys(record);
        const values = Object.values(record);
        const placeholders = keys.map(() => '?').join(',');

        let query = `INSERT INTO cnss (${keys.join(',')}) VALUES (${placeholders})`;
        if (process.env.POSTGRES_URL) {
            query += ` RETURNING id_cn`;
        }
        
        const result = await db.run(query, values);
        res.json({ id_cn: result.lastID, ...record });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update CNSS Record
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const record = req.body;
        
        delete record.id_cn;
        delete record.id_user;
        delete record.id_so;

        const keys = Object.keys(record);
        const values = Object.values(record);
        
        if (keys.length === 0) return res.json({ success: true });

        const setString = keys.map(k => `${k} = ?`).join(', ');
        const query = `UPDATE cnss SET ${setString} WHERE id_cn = ? AND id_so = ?`;
        
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

        await db.run(`UPDATE cnss SET status = ? WHERE id_cn = ? AND id_so = ?`, 
            [status, id, req.user.id_so]);
        res.json({ success: true, status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Facturation CNSS — filterable billing list with montant total
router.get('/facturation/list', authenticate, async (req, res) => {
    try {
        const { nom_ste, num_cnss, num_affaire, date_debut, date_fin } = req.query;

        let ws = ['c.id_so = ?'];
        let ps = [req.user.id_so];
        if (nom_ste)    { ws.push('c.nom_ste LIKE ?');    ps.push('%'+nom_ste+'%'); }
        if (num_cnss)   { ws.push('c.num_cnss LIKE ?');   ps.push('%'+num_cnss+'%'); }
        if (num_affaire){ ws.push('c.num_affaire LIKE ?'); ps.push('%'+num_affaire+'%'); }
        if (date_debut && date_fin) { ws.push('o.date_o BETWEEN ? AND ?'); ps.push(date_debut, date_fin); }
        
        const condition = ws.join(' AND ');
        const query = `SELECT c.id_cn, c.nom_ste, c.num_affaire, c.num_cnss, c.status, 
                              COALESCE(SUM(CAST(o.montant AS ${castType})), 0) AS total_montant 
                       FROM cnss AS c LEFT JOIN cnss_oeuvre AS o ON o.id_cn::text = c.id_cn::text 
                       WHERE ${condition} GROUP BY c.id_cn ORDER BY c.num_affaire ASC`;

        const rows = await db.all(query, ps);
        const grandTotal = rows.reduce((sum, r) => sum + (parseFloat(r.total_montant) || 0), 0);
        res.json({ data: rows, total: Math.round(grandTotal * 1000) / 1000, count: rows.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/facturation/list', authenticate, async (req, res) => {
    try {
        const { ref, de_part, date_debut, date_fin, page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const l = parseInt(limit);

        let query = `SELECT c.*, o.id as action_id, o.type_operation, o.salaire as action_salaire, o."TVA" as action_tva, o.total as action_total, o.date_o
                      FROM cnss c 
                      LEFT JOIN cnss_oeuvre o ON c.id_cn::text = o.id_cn::text 
                      WHERE c.id_so = ?`;
        let params = [req.user.id_so];

        if (ref)      { query += ` AND c.num_affaire::text LIKE ?`; params.push(`%${ref}%`); }
        if (de_part)  { query += ` AND c.nom_ste LIKE ?`;           params.push(`%${de_part}%`); }
        if (date_debut && date_fin) { query += ` AND o.date_o BETWEEN ? AND ?`; params.push(date_debut, date_fin); }

        query += ` ORDER BY c.id_cn DESC LIMIT ? OFFSET ?`;
        const rows = await db.all(query, [...params, l, offset]);
        res.json({ data: (rows || []), page: parseInt(page) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete CNSS Record (with cascading cleanup of actions)
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        await db.run('DELETE FROM cnss_oeuvre WHERE id_cn::text = ? AND id_so::text = ?', [id, req.user.id_so]);
        await db.run('DELETE FROM cnss WHERE id_cn::text = ? AND id_so::text = ?', [id, req.user.id_so]);
        res.json({ success: true, deletedID: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
