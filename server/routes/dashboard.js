const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/auth');

router.get('/stats', authenticate, async (req, res) => {
    try {
        const id_so = req.user.id_so;
        
        // 1. Total Acts (General Register)
        // Acts that don't exist in œuvre_type
        const actsCount = await db.get(`
            SELECT COUNT(*) as count 
            FROM clients_record c 
            WHERE c.id_so::text = ? 
            AND NOT EXISTS (SELECT 1 FROM "œuvre_type" o WHERE o.id_o::text = c.id_r::text)
        `, [id_so]);

        // 2. Total Execution Dossiers
        const execCount = await db.get(`
            SELECT COUNT(DISTINCT id_o) as count 
            FROM "œuvre_type" 
            WHERE id_so::text = ?
        `, [id_so]);

        // 3. Upcoming Events (next 5)
        const today = new Date().toISOString().split('T')[0];
        const upcomingEvents = await db.all(`
            SELECT * FROM evenement 
            WHERE id_so::text = ? AND start >= ?
            ORDER BY start ASC, time_even ASC 
            LIMIT 5
        `, [id_so, today]);

        // 4. Total Contacts
        const contactsCount = await db.get(`
            SELECT COUNT(*) as count FROM telephone WHERE id_so::text = ?
        `, [id_so]);

        // 5. Statistics for Chart (Last 7 days of acts/events - optional but nice)
        // For now, just basic counts
        
        res.json({
            stats: {
                acts: parseInt(actsCount?.count || 0),
                execution: parseInt(execCount?.count || 0),
                contacts: parseInt(contactsCount?.count || 0),
                upcomingCount: upcomingEvents.length
            },
            upcomingEvents: upcomingEvents || []
        });
    } catch (err) {
        console.error("Dashboard Stats Error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
