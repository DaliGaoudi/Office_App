const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'huissier_mourad_secret_legacy';

function authenticate(req, res, next) {
    req.user = { id: 35, id_so: '35', role: 'admin' };
    next();
}

// Get telephone directory
router.get('/', authenticate, (req, res) => {
    const { search = '' } = req.query;
    
    // Fallback logic, as the user could search names, numbers
    let query = `SELECT * FROM telephone WHERE id_so = ?`;
    let params = [req.user.id_so];

    if (search) {
        query += ` AND (nom LIKE ? OR prenom LIKE ? OR num_tel1 LIKE ? OR num_tel2 LIKE ?)`;
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    query += ` ORDER BY id_tel DESC LIMIT 100`;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

module.exports = router;
