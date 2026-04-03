const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'huissier_mourad_secret_legacy';

function authenticate(req, res, next) {
    req.user = { id: 35, id_so: '35', role: 'admin' };
    next();
}

// Get events from calendar
router.get('/', authenticate, (req, res) => {
    // The legacy CodeIgniter returned "evenement"
    db.all(`SELECT * FROM evenement WHERE id_so = ? ORDER BY id_even DESC LIMIT 200`, [req.user.id_so], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// Create new event
router.post('/', authenticate, (req, res) => {
    const record = req.body;
    record.id_user = req.user.id;
    record.id_so = req.user.id_so;
    
    const keys = Object.keys(record);
    const values = Object.values(record);
    const placeholders = keys.map(() => '?').join(',');

    const query = `INSERT INTO evenement (${keys.join(',')}) VALUES (${placeholders})`;
    
    db.run(query, values, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id_even: this.lastID, ...record });
    });
});

module.exports = router;
