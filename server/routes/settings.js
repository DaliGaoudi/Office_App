const express = require('express');
const router = express.Router();
const db = require('../db');

function authenticate(req, res, next) {
    req.user = { id: 35, id_so: '35', role: 'admin' };
    next();
}

// GET all settings
router.get('/', authenticate, async (req, res) => {
    try {
        const rows = await db.all('SELECT key, value, label FROM app_settings');
        const settings = {};
        rows.forEach(r => { settings[r.key] = { value: r.value, label: r.label }; });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single setting
router.get('/:key', authenticate, async (req, res) => {
    try {
        const row = await db.get('SELECT key, value, label FROM app_settings WHERE key = ?', [req.params.key]);
        if (!row) return res.status(404).json({ error: 'Setting not found' });
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update a setting
router.put('/:key', authenticate, async (req, res) => {
    try {
        const { value } = req.body;
        if (value === undefined || value === '') return res.status(400).json({ error: 'value required' });

        const now = process.env.POSTGRES_URL ? 'CURRENT_TIMESTAMP' : "datetime('now')";
        
        let query;
        if (process.env.POSTGRES_URL) {
            query = `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
                     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`;
        } else {
            query = `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;
        }

        await db.run(query, [req.params.key, String(value)]);
        res.json({ key: req.params.key, value: String(value), updated: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
