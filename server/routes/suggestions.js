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

        const sql = `
            SELECT DISTINCT nom
            FROM (
                SELECT de_part as nom FROM clients_record WHERE de_part IS NOT NULL AND TRIM(de_part) != ''
                UNION
                SELECT nom_cl1 as nom FROM clients_record WHERE nom_cl1 IS NOT NULL AND TRIM(nom_cl1) != ''
                UNION
                SELECT nom_cl2 as nom FROM clients_record WHERE nom_cl2 IS NOT NULL AND TRIM(nom_cl2) != ''
                UNION
                SELECT nom_cl2 as nom FROM cnss WHERE nom_cl2 IS NOT NULL AND TRIM(nom_cl2) != ''
            ) AS all_names
            WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(nom, 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ة', 'ه'), 'ي', 'ى'), ' ', '') 
            LIKE '%' || ? || '%'  
            LIMIT 15;
        `;

        const rows = await db.all(sql, [normalizedQ]);
        res.json({ success: true, data: rows.map(r => r.nom) });
    } catch (err) {
        console.error("Error in GET /suggestions/names:", err);
        res.status(500).json({ error: "فشل في جلب الأسماء", details: err.message });
    }
});

module.exports = router;
