const express = require('express');
const router = express.Router();
const db = require('../db');
const authorize = require('../middleware/auth');

router.get('/names', authorize, async (req, res) => {
    try {
        const query = req.query.q || '';
        if (query.trim().length === 0) {
            return res.json({ success: true, data: [] });
        }

        // Normalize JS string
        const normalizedQ = query
            .replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ي/g, 'ى')
            .replace(/\s+/g, '');

        // Every branch is scoped by id_so: without it the typeahead would suggest the
        // client and defendant names of every other office in the database.
        // Placeholders are positional (db.js rewrites ? → $n in order), so the four
        // id_so values must be passed before the search term.
        const sql = `
            SELECT DISTINCT nom
            FROM (
                SELECT de_part as nom FROM clients_record WHERE id_so::text = ? AND de_part IS NOT NULL AND TRIM(de_part) != ''
                UNION
                SELECT nom_cl1 as nom FROM clients_record WHERE id_so::text = ? AND nom_cl1 IS NOT NULL AND TRIM(nom_cl1) != ''
                UNION
                SELECT nom_cl2 as nom FROM clients_record WHERE id_so::text = ? AND nom_cl2 IS NOT NULL AND TRIM(nom_cl2) != ''
                UNION
                SELECT nom_cl2 as nom FROM cnss WHERE id_so::text = ? AND nom_cl2 IS NOT NULL AND TRIM(nom_cl2) != ''
            ) AS all_names
            WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(nom, 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ة', 'ه'), 'ي', 'ى'), ' ', '')
            LIKE '%' || ? || '%'
            LIMIT 15;
        `;

        const idSo = req.user.id_so;
        const rows = await db.all(sql, [idSo, idSo, idSo, idSo, normalizedQ]);
        res.json({ success: true, data: rows.map(r => r.nom) });
    } catch (err) {
        console.error("Error in GET /suggestions/names:", err);
        res.status(500).json({ error: "فشل في جلب الأسماء", details: err.message });
    }
});

module.exports = router;
