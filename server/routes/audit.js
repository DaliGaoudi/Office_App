const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/auth');

// Middleware to check admin privileges
const isAdmin = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
        next();
    } else {
        res.status(403).json({ error: 'Access denied' });
    }
};

router.get('/', authenticate, isAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, user_id, action_type, search } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = `SELECT * FROM audit_logs WHERE 1=1`;
        let countQuery = `SELECT COUNT(*) as count FROM audit_logs WHERE 1=1`;
        let params = [];

        if (user_id) {
            query += ` AND user_id = ?`;
            countQuery += ` AND user_id = ?`;
            params.push(parseInt(user_id));
        }
        
        if (action_type) {
            query += ` AND action = ?`;
            countQuery += ` AND action = ?`;
            params.push(action_type);
        }

        if (search) {
            query += ` AND (details LIKE ? OR username LIKE ? OR entity LIKE ?)`;
            countQuery += ` AND (details LIKE ? OR username LIKE ? OR entity LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
        
        const rows = await db.all(query, [...params, parseInt(limit), parseInt(offset)]);
        const countRow = await db.get(countQuery, params);
        
        res.json({
            data: rows || [],
            total: countRow ? parseInt(countRow.count) : 0,
            page: parseInt(page),
            totalPages: countRow ? Math.ceil(parseInt(countRow.count) / parseInt(limit)) : 1
        });
    } catch (err) {
        console.error("Audit fetch error:", err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
