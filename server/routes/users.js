const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPassword } = require('../services/password');
const authenticate = require('../middleware/auth');
const { logActivity } = require('../utils/logger');

/*
 * Every query here is scoped by id_so, like the rest of the app. Until this was
 * added, an office admin could list, edit, reset the password of, or delete a user
 * belonging to a DIFFERENT office simply by id — the read was unfiltered and the
 * writes addressed rows by primary key alone.
 *
 * There is deliberately no superadmin bypass: `superadmin` grants nothing beyond
 * `admin` anywhere in this codebase, so letting it cross tenants would hand any
 * office admin a privilege escalation (create a superadmin → see every office).
 * Vendor-side support uses database access, not a magic UI role.
 */
const isAdmin = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
        next();
    } else {
        res.status(403).json({ error: 'Access denied' });
    }
};

// Get all users in the caller's office.
router.get('/', authenticate, isAdmin, async (req, res) => {
    try {
        const rows = await db.all(
            `SELECT id, username, societe, email, role, id_so, client_aliases
               FROM admin_admin
              WHERE id_so::text = ?
              ORDER BY id ASC`,
            [req.user.id_so]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Create new user — always stamped with the creator's office.
router.post('/', authenticate, isAdmin, async (req, res) => {
    try {
        const { username, password, role, societe, client_aliases } = req.body;

        if (!username || !password || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Usernames are the login key and are unique across the database, so check
        // globally — a friendly 409 beats a constraint violation surfacing as a 500.
        const taken = await db.get(`SELECT id FROM admin_admin WHERE username = ?`, [username]);
        if (taken) {
            return res.status(409).json({ error: 'اسم المستخدم مُستعمل من قبل' });
        }

        const hashedPassword = await hashPassword(password);

        await db.run(
            `INSERT INTO admin_admin (username, password, role, societe, id_so, client_aliases) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
            [username, hashedPassword, role, societe || '', req.user.id_so || '', client_aliases || '']
        );

        await logActivity(req.user, 'CREATE', 'USER', `إنشاء مستخدم جديد: ${username} (الصلاحية: ${role})`);

        res.status(201).json({ message: 'User created successfully' });
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Update user. id_so is never taken from the body — a user cannot be moved between
// offices through this endpoint, and a row outside the caller's office won't match.
router.put('/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { username, password, role, societe, client_aliases } = req.body;

        if (!username || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const taken = await db.get(
            `SELECT id FROM admin_admin WHERE username = ? AND id <> ?`, [username, id]
        );
        if (taken) {
            return res.status(409).json({ error: 'اسم المستخدم مُستعمل من قبل' });
        }

        let query = `UPDATE admin_admin SET username = ?, role = ?, societe = ?, client_aliases = ? WHERE id = ? AND id_so::text = ?`;
        let params = [username, role, societe || '', client_aliases || '', id, req.user.id_so];

        if (password && password.trim() !== '') {
            const hashedPassword = await hashPassword(password);
            query = `UPDATE admin_admin SET username = ?, role = ?, societe = ?, client_aliases = ?, password = ? WHERE id = ? AND id_so::text = ?`;
            params = [username, role, societe || '', client_aliases || '', hashedPassword, id, req.user.id_so];
        }

        const { changes } = await db.run(query, params);
        if (!changes) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        await logActivity(req.user, 'UPDATE', 'USER', `تعديل المستخدم: ${username}`);

        res.json({ message: 'User updated successfully' });
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Delete user.
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent deleting yourself (if we want to be safe, we could check req.user.id)
        if (req.user && parseInt(req.user.id, 10) === parseInt(id, 10)) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        const { changes } = await db.run(
            `DELETE FROM admin_admin WHERE id = ? AND id_so::text = ?`, [id, req.user.id_so]
        );
        if (!changes) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        await logActivity(req.user, 'DELETE', 'USER', `حذف المستخدم (ID: ${id})`);

        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
