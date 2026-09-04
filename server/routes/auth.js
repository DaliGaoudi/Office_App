const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/secrets');
const { hashPassword, verifyPassword } = require('../services/password');

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        // Look the user up by name only — the password is checked in the app so that
        // both bcrypt and the legacy MD5 rows can be verified (see services/password).
        const row = await db.get(`SELECT * FROM admin_admin WHERE username = ?`, [username]);

        if (!row) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const { ok, needsUpgrade } = await verifyPassword(password, row.password);
        if (!ok) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Transparently migrate a legacy MD5 row to bcrypt now that we hold the
        // plaintext. Never let a failure here block a valid login.
        if (needsUpgrade) {
            try {
                await db.run(`UPDATE admin_admin SET password = ? WHERE id = ? RETURNING id`, [
                    await hashPassword(password),
                    row.id,
                ]);
            } catch (e) {
                console.error('Password upgrade failed for user', row.id, e.message);
            }
        }

        const token = jwt.sign({ id: row.id, role: row.role, id_so: row.id_so }, getJwtSecret(), { expiresIn: '1d' });
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
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
