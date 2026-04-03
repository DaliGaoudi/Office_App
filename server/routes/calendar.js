const express = require('express');
const router = express.Router();
const db = require('../db');

const authenticate = require('../middleware/auth');

// Get events from calendar
router.get('/', authenticate, async (req, res) => {
    try {
        const rows = await db.all(`SELECT * FROM evenement WHERE id_so = ? ORDER BY id_even DESC LIMIT 200`, [req.user.id_so]);
        res.json({ data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new event
router.post('/', authenticate, async (req, res) => {
    try {
        const record = req.body;
        record.id_user = req.user.id;
        record.id_so = req.user.id_so;
        
        const keys = Object.keys(record);
        const values = Object.values(record);
        const placeholders = keys.map(() => '?').join(',');

        let query = `INSERT INTO evenement (${keys.join(',')}) VALUES (${placeholders})`;
        if (process.env.POSTGRES_URL) {
            query += ` RETURNING id_even`;
        }
        
        const result = await db.run(query, values);
        res.json({ id_even: result.lastID, ...record });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
