const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');
const authenticate = require('../middleware/auth');

// Middleware to check admin privileges
const isAdmin = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
        next();
    } else {
        res.status(403).json({ error: 'Access denied' });
    }
};

// Get all users
router.get('/', authenticate, isAdmin, async (req, res) => {
    try {
        const rows = await db.all('SELECT id, username, societe, email, role, id_so FROM admin_admin ORDER BY id ASC');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Create new user
router.post('/', authenticate, isAdmin, async (req, res) => {
    try {
        const { username, password, role, societe } = req.body;
        
        if (!username || !password || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const hashedPassword = crypto.createHash('md5').update(password).digest('hex');
        
        await db.run(
            `INSERT INTO admin_admin (username, password, role, societe, id_so) VALUES (?, ?, ?, ?, ?) RETURNING id`,
            [username, hashedPassword, role, societe || '', req.user.id_so || '']
        );
        
        res.status(201).json({ message: 'User created successfully' });
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Update user
router.put('/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { username, password, role, societe } = req.body;
        
        if (!username || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let query = `UPDATE admin_admin SET username = ?, role = ?, societe = ? WHERE id = ?`;
        let params = [username, role, societe || '', id];

        if (password && password.trim() !== '') {
            const hashedPassword = crypto.createHash('md5').update(password).digest('hex');
            query = `UPDATE admin_admin SET username = ?, role = ?, societe = ?, password = ? WHERE id = ?`;
            params = [username, role, societe || '', hashedPassword, id];
        }

        await db.run(query, params);
        res.json({ message: 'User updated successfully' });
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Delete user
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Prevent deleting yourself (if we want to be safe, we could check req.user.id)
        if (req.user && parseInt(req.user.id, 10) === parseInt(id, 10)) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        await db.run(`DELETE FROM admin_admin WHERE id = ?`, [id]);
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
