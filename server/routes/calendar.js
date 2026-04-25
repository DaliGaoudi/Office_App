const express = require('express');
const router = express.Router();
const db = require('../db');

const authenticate = require('../middleware/auth');

// Get events from calendar
router.get('/', authenticate, async (req, res) => {
    try {
        const rows = await db.all(`SELECT id_even, sujet as title, debut_date as start, show_time as time_even, location as tribunal_even, description FROM evenement WHERE id_so = ? ORDER BY id_even DESC LIMIT 200`, [req.user.id_so]);
        res.json({ data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new event
router.post('/', authenticate, async (req, res) => {
    try {
        const { title, start, time_even, description, tribunal_even } = req.body;
        const id_user = req.user.id;
        const id_so = req.user.id_so;
        
        const query = `
            INSERT INTO evenement (sujet, debut_date, show_time, description, location, id_user, id_so)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING id_even
        `;
        
        const result = await db.run(query, [title, start, time_even, description, tribunal_even, id_user, id_so]);
        res.json({ id_even: result.lastID, title, start, time_even, description, tribunal_even });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update event
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, start, time_even, description, tribunal_even } = req.body;
        const id_so = req.user.id_so;

        const query = `
            UPDATE evenement 
            SET sujet = ?, debut_date = ?, show_time = ?, description = ?, location = ?
            WHERE id_even = ? AND id_so = ?
        `;
        
        await db.run(query, [title, start, time_even, description, tribunal_even, id, id_so]);
        res.json({ success: true, id_even: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete event
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const id_so = req.user.id_so;

        const query = `DELETE FROM evenement WHERE id_even = ? AND id_so = ?`;
        await db.run(query, [id, id_so]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
