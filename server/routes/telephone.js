const express = require('express');
const router = express.Router();
const db = require('../db');

const authenticate = require('../middleware/auth');

// Get telephone directory
router.get('/', authenticate, async (req, res) => {
    try {
        const { search = '' } = req.query;
        const id_so = req.user.id_so;
        
        let query = `SELECT * FROM telephone WHERE id_so = ?`;
        let params = [id_so];

        if (search) {
            query += ` AND (nom LIKE ? OR prenom LIKE ? OR num_tel1 LIKE ? OR num_tel2 LIKE ?)`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }

        query += ` ORDER BY nom ASC, prenom ASC LIMIT 200`;

        const rows = await db.all(query, params);
        res.json({ data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new contact
router.post('/', authenticate, async (req, res) => {
    try {
        const { nom, prenom, num_tel1, num_tel2, email_tel, adresse_tel, observation_tel } = req.body;
        const id_so = req.user.id_so;

        const query = `
            INSERT INTO telephone (nom, prenom, num_tel1, num_tel2, email_tel, adresse_tel, observation_tel, id_so)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id_tel
        `;
        
        const result = await db.run(query, [nom, prenom, num_tel1, num_tel2, email_tel, adresse_tel, observation_tel, id_so]);
        res.json({ id_tel: result.lastID, nom, prenom, num_tel1, num_tel2, email_tel, adresse_tel, observation_tel });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update contact
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { nom, prenom, num_tel1, num_tel2, email_tel, adresse_tel, observation_tel } = req.body;
        const id_so = req.user.id_so;

        const query = `
            UPDATE telephone 
            SET nom = ?, prenom = ?, num_tel1 = ?, num_tel2 = ?, email_tel = ?, adresse_tel = ?, observation_tel = ?
            WHERE id_tel = ? AND id_so = ?
        `;
        
        await db.run(query, [nom, prenom, num_tel1, num_tel2, email_tel, adresse_tel, observation_tel, id, id_so]);
        res.json({ success: true, id_tel: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete contact
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const id_so = req.user.id_so;

        const query = `DELETE FROM telephone WHERE id_tel = ? AND id_so = ?`;
        await db.run(query, [id, id_so]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
