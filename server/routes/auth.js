const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'huissier_mourad_secret_legacy';

// The legacy app used simple md5 hash for passwords (e.g. 'e10adc3949ba59abbe56e057f20f883e' = 123456). 
// For seamless migration, we should use MD5 initially since we migrated DB passwords without changing them.
const crypto = require('crypto');

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    // Hash password to match legacy md5 hex
    const hashedPassword = crypto.createHash('md5').update(password).digest('hex');

    db.get(`SELECT * FROM admin_admin WHERE username = ? AND password = ?`, [username, hashedPassword], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (row) {
            const token = jwt.sign({ id: row.id, role: row.role, id_so: row.id_so }, JWT_SECRET, { expiresIn: '1d' });
            res.json({
                user: {
                    id: row.id,
                    username: row.username,
                    role: row.role,
                    societe: row.societe
                },
                token
            });
        } else {
            res.status(401).json({ error: 'Invalid username or password' });
        }
    });
});

module.exports = router;
