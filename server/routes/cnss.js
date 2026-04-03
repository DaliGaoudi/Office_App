const express = require('express');
const router = express.Router();
const db = require('../db');

function authenticate(req, res, next) {
    req.user = { id: 35, id_so: '35', role: 'admin' };
    next();
}

// Get all records for CNSS
router.get('/', authenticate, (req, res) => {
    const { page = 1, limit = 50, nom_ste, num_cnss, num_affaire } = req.query;
    const offset = (page - 1) * limit;

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

    query += ` ORDER BY id_cn DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let countQuery = `SELECT COUNT(*) as count FROM cnss WHERE id_so = ?`;
        let countParams = [req.user.id_so];
        
        if (nom_ste) { countQuery += ` AND nom_ste LIKE ?`; countParams.push(`%${nom_ste}%`); }
        if (num_cnss) { countQuery += ` AND num_cnss LIKE ?`; countParams.push(`%${num_cnss}%`); }
        if (num_affaire) { countQuery += ` AND num_affaire LIKE ?`; countParams.push(`%${num_affaire}%`); }

        db.get(countQuery, countParams, (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                data: rows,
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
    db.get(`SELECT * FROM cnss WHERE id_cn = ? AND id_so = ?`, [id, req.user.id_so], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

// Create CNSS Record
router.post('/', authenticate, (req, res) => {
    const record = req.body;
    record.id_user = req.user.id;
    record.id_so = req.user.id_so;
    
    const keys = Object.keys(record);
    const values = Object.values(record);
    const placeholders = keys.map(() => '?').join(',');

    const query = `INSERT INTO cnss (${keys.join(',')}) VALUES (${placeholders})`;
    
    db.run(query, values, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id_cn: this.lastID, ...record });
    });
});

// Update CNSS Record
router.put('/:id', authenticate, (req, res) => {
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

    db.run(`UPDATE cnss SET status = ? WHERE id_cn = ? AND id_so = ?`, 
        [status, id, req.user.id_so], 
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, status });
        }
    );
});

// Facturation CNSS — filterable billing list with montant total
router.get('/facturation/list', authenticate, (req, res) => {
    const { nom_ste, num_cnss, num_affaire, date_debut, date_fin } = req.query;

    let ws = ['c.id_so = ?'];
    let ps = [req.user.id_so];
    if (nom_ste)    { ws.push('c.nom_ste LIKE ?');    ps.push('%'+nom_ste+'%'); }
    if (num_cnss)   { ws.push('c.num_cnss LIKE ?');   ps.push('%'+num_cnss+'%'); }
    if (num_affaire){ ws.push('c.num_affaire LIKE ?'); ps.push('%'+num_affaire+'%'); }
    if (date_debut && date_fin) { ws.push('o.date_o BETWEEN ? AND ?'); ps.push(date_debut, date_fin); }
    
    // Simplified single-line query for absolute robustness
    const condition = ws.join(' AND ');
    const query = 'SELECT c.id_cn, c.nom_ste, c.num_affaire, c.num_cnss, c.status, COALESCE(SUM(CAST(o.montant AS REAL)), 0) AS total_montant FROM cnss AS c LEFT JOIN cnss_oeuvre AS o ON o.id_cn = c.id_cn WHERE ' + condition + ' GROUP BY c.id_cn ORDER BY c.id_cn DESC';

    db.all(query, ps, (err, rows) => {
        if (err) return res.status(500).json({ error: 'CNSS Facturation SQL Error: ' + err.message + ' | Query: ' + query });
        const grandTotal = rows.reduce((sum, r) => sum + (parseFloat(r.total_montant) || 0), 0);
        res.json({ data: rows, total: Math.round(grandTotal * 1000) / 1000, count: rows.length });
    });
});

// Delete CNSS Record (with cascading cleanup of actions)
router.delete('/:id', authenticate, (req, res) => {
    const { id } = req.params;
    db.serialize(() => {
        db.run('DELETE FROM cnss_oeuvre WHERE id_cn = ? AND id_so = ?', [id, req.user.id_so], (err) => {
            if (err) console.error("Error deleting from cnss_oeuvre:", err.message);
        });
        db.run('DELETE FROM cnss WHERE id_cn = ? AND id_so = ?', [id, req.user.id_so], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, deletedID: id });
        });
    });
});

module.exports = router;
