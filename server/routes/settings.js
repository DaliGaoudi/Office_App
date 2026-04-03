const express = require('express');
const router = express.Router();
const db = require('../db');

function authenticate(req, res, next) {
    req.user = { id: 35, id_so: '35', role: 'admin' };
    next();
}

// Ensure settings table exists and seed defaults
db.run(`CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    label TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
    if (err) return console.error('Settings table error:', err.message);

    // Seed TVA default = 19 if not already set
    db.run(`INSERT OR IGNORE INTO app_settings (key, value, label)
            VALUES ('tva_rate', '19', 'تسعيرة أ.ق.م (%)')`, (e) => {
        if (!e) console.log('Settings table ready.');
    });
});

// GET all settings
router.get('/', authenticate, (req, res) => {
    db.all('SELECT key, value, label FROM app_settings', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Return as object map for easy frontend use
        const settings = {};
        rows.forEach(r => { settings[r.key] = { value: r.value, label: r.label }; });
        res.json(settings);
    });
});

// GET single setting
router.get('/:key', authenticate, (req, res) => {
    db.get('SELECT key, value, label FROM app_settings WHERE key = ?', [req.params.key], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Setting not found' });
        res.json(row);
    });
});

// PUT update a setting
router.put('/:key', authenticate, (req, res) => {
    const { value } = req.body;
    if (value === undefined || value === '') return res.status(400).json({ error: 'value required' });

    db.run(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [req.params.key, String(value)],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ key: req.params.key, value: String(value), updated: true });
        }
    );
});

module.exports = router;
