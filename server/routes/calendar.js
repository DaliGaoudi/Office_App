const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/auth');

/**
 * GET /api/calendar
 * Get events within a range or for the dashboard
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { start_date, end_date, limit = 200 } = req.query;
        let query = `SELECT * FROM evenement WHERE id_so = ?`;
        let params = [req.user.id_so];

        if (start_date && end_date) {
            query += ` AND debut_date >= ? AND fin_date <= ?`;
            params.push(start_date, end_date);
        }

        query += ` ORDER BY fin_date ASC LIMIT ?`;
        params.push(parseInt(limit));

        const rows = await db.all(query, params);
        res.json({ data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/calendar/today
 * Dashbaord helper for today's events
 */
router.get('/today', authenticate, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const query = `SELECT * FROM evenement WHERE id_so = ? AND (fin_date LIKE ? OR debut_date LIKE ?) ORDER BY fin_date ASC`;
        const params = [req.user.id_so, `%${today}%`, `%${today}%` ];
        const rows = await db.all(query, params);
        res.json({ data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/calendar
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const record = req.body;
        record.id_user = req.user.id;
        record.id_so = req.user.id_so;
        record.date_ajout = new Date().toISOString().split('T')[0];
        
        const keys = Object.keys(record);
        const values = Object.values(record);
        const placeholders = keys.map(() => '?').join(',');

        const query = `INSERT INTO evenement (${keys.join(',')}) VALUES (${placeholders})`;
        const result = await db.run(query, values);
        
        res.status(201).json({ id_even: result.lastID, ...record });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/calendar/:id
 */
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        await db.run(`DELETE FROM evenement WHERE id_even = ? AND id_so = ?`, [id, req.user.id_so]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
