const express = require('express');
const router = express.Router();
const db = require('../db');

function authenticate(req, res, next) {
    req.user = { id: 35, id_so: '35', role: 'admin' };
    next();
}

// Get telephone directory
router.get('/', authenticate, async (req, res) => {
    try {
        const { search = '' } = req.query;
        
        let query = `SELECT * FROM telephone WHERE id_so = ?`;
        let params = [req.user.id_so];

        if (search) {
            query += ` AND (nom LIKE ? OR prenom LIKE ? OR num_tel1 LIKE ? OR num_tel2 LIKE ?)`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }

        query += ` ORDER BY id_tel DESC LIMIT 100`;

        const rows = await db.all(query, params);
        res.json({ data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
