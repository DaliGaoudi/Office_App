const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/auth');
const { Parser } = require('json2csv');

/**
 * GET /api/telephone
 * Get contacts with search and filtering
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { search = '', format = 'json' } = req.query;
        let query = `SELECT * FROM telephone WHERE id_so = ?`;
        let params = [req.user.id_so];

        if (search) {
            query += ` AND (nom LIKE ? OR tel1 LIKE ? OR tel2 LIKE ? OR email LIKE ? OR profession LIKE ?)`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }

        query += ` ORDER BY nom ASC`;

        const rows = await db.all(query, params);

        if (format === 'csv') {
            const fields = ['nom', 'profession', 'tel1', 'tel2', 'tel3', 'tel4', 'tel5', 'fax1', 'fax2', 'email', 'adresse', 'ville', 'codep'];
            const opts = { fields };
            const parser = new Parser(opts);
            const csv = parser.parse(rows);
            res.header('Content-Type', 'text/csv');
            res.attachment('annuaire.csv');
            return res.send(csv);
        }

        res.json({ data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/telephone/categories
 * Get Genre and Profession lists
 */
router.get('/categories', authenticate, async (req, res) => {
    try {
        const genres = await db.all(`SELECT * FROM genre_tel WHERE id_so = ?`, [req.user.id_so]);
        const professions = await db.all(`SELECT * FROM profession_tel WHERE id_so = ?`, [req.user.id_so]);
        res.json({ genres, professions });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/telephone
 * Add new contact
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const data = req.body;
        data.id_user = req.user.id;
        data.id_so = req.user.id_so;
        data.date_ajout = new Date().toISOString().split('T')[0];

        // Default empty values for missing fields to avoid NULLs in older DB logic
        const defaultFields = ['nom', 'adresse', 'adressepersonnel', 'profession', 'codep', 'ville', 'zone', 'etat', 'tel1', 'tel2', 'tel3', 'tel4', 'tel5', 'fax1', 'fax2', 'email', 'character1', 'nom1', 'position1', 'phone1', 'email1', 'character2', 'nom2', 'position2', 'phone2', 'email2', 'character3', 'nom3', 'position3', 'phone3', 'email3', 'id_r', 'id_o', 'type', 'registre'];
        defaultFields.forEach(f => { if (data[f] === undefined) data[f] = ''; });

        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map(() => '?').join(',');

        const query = `INSERT INTO telephone (${keys.join(',')}) VALUES (${placeholders})`;
        const result = await db.run(query, values);
        
        res.status(201).json({ id_tel: result.lastID, ...data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/telephone/:id
 * Update contact
 */
router.put('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        const keys = Object.keys(data).filter(k => k !== 'id_tel');
        const values = keys.map(k => data[k]);
        values.push(id, req.user.id_so);

        const setClause = keys.map(k => `${k} = ?`).join(', ');
        const query = `UPDATE telephone SET ${setClause} WHERE id_tel = ? AND id_so = ?`;
        
        await db.run(query, values);
        res.json({ success: true, id_tel: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/telephone/:id
 */
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        await db.run(`DELETE FROM telephone WHERE id_tel = ? AND id_so = ?`, [id, req.user.id_so]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
