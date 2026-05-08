const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'huissier_mourad_secret_legacy';

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Hash password to match legacy md5 hex
        const hashedPassword = crypto.createHash('md5').update(password).digest('hex');

        const row = await db.get(`SELECT * FROM admin_admin WHERE username = ? AND password = ?`, [username, hashedPassword]);
        
        if (row) {
            const token = jwt.sign({ id: row.id, role: row.role, id_so: row.id_so }, JWT_SECRET, { expiresIn: '1d' });
            res.json({
                user: {
                    id: row.id,
                    username: row.username,
                    role: row.role,
                    societe: row.societe,
                    client_aliases: row.client_aliases
                },
                token
            });
        } else {
            res.status(401).json({ error: 'Invalid username or password' });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
