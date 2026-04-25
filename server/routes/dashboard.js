const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/auth');

router.get('/stats', authenticate, async (req, res) => {
    try {
        const id_so = req.user.id_so;
        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split('T')[0];
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

        // 1. Metrics & Counts
        const activeCount = await db.get(`SELECT COUNT(*) as count FROM clients_record WHERE id_so::text = ? AND status != 'finished'`, [id_so]);
        const dueToday = await db.get(`SELECT COUNT(*) as count FROM evenement WHERE id_so::text = ? AND debut_date = ?`, [id_so, today]);
        const dueWeek = await db.get(`SELECT COUNT(*) as count FROM evenement WHERE id_so::text = ? AND debut_date >= ? AND debut_date <= ?`, [id_so, today, nextWeekStr]);
        const completedMonth = await db.get(`SELECT COUNT(*) as count FROM clients_record WHERE id_so::text = ? AND status = 'finished' AND date_reg >= ?`, [id_so, firstOfMonth]);

        // 2. Recent Cases (Top 10)
        const recentCases = await db.all(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM "œuvre_type" o WHERE o.id_o::text = c.id_r::text) as action_count
            FROM clients_record c 
            WHERE c.id_so::text = ? 
            ORDER BY c.id_r DESC 
            LIMIT 10
        `, [id_so]);

        // 3. Upcoming Deadlines (Today + Week)
        const deadlines = await db.all(`
            SELECT id_even, sujet as title, debut_date as start, show_time as time_even, location as tribunal_even, description 
            FROM evenement 
            WHERE id_so::text = ? AND debut_date >= ? AND debut_date <= ?
            ORDER BY debut_date ASC, show_time ASC 
            LIMIT 15
        `, [id_so, today, nextWeekStr]);

        // 4. Tasks Queue (Overdue or Not Started)
        const tasksQueue = await db.all(`
            SELECT id_r, ref, nom_cl1, de_part, status, date_echeance 
            FROM clients_record 
            WHERE id_so::text = ? 
            AND (status = 'not_started' OR (date_echeance < ? AND status != 'finished'))
            ORDER BY date_echeance ASC
            LIMIT 10
        `, [id_so, today]);

        // 5. Activity Timeline (Milestones)
        // Combine recent case creations and recent event creations
        const activity = await db.all(`
            (SELECT 'case' as type, id_r as id, nom_cl1 as title, date_reg as date, 'محضر جديد' as action 
             FROM clients_record WHERE id_so::text = ? ORDER BY id_r DESC LIMIT 5)
            UNION ALL
            (SELECT 'event' as type, id_even as id, sujet as title, debut_date as date, 'موعد جديد' as action 
             FROM evenement WHERE id_so::text = ? ORDER BY id_even DESC LIMIT 5)
            ORDER BY date DESC
            LIMIT 10
        `, [id_so, id_so]);

        // 6. Payments Summary (Simplified)
        const payments = await db.get(`
            SELECT SUM(CAST(NULLIF(salaire, '') AS NUMERIC)) as total_expected,
                   SUM(CAST(NULLIF(acompte, '') AS NUMERIC) + CAST(NULLIF(montant_partiel1, '') AS NUMERIC)) as total_collected
            FROM clients_record 
            WHERE id_so::text = ? AND date_reg >= ?
        `, [id_so, firstOfMonth]);

        res.json({
            metrics: {
                activeCount: parseInt(activeCount?.count || 0),
                dueToday: parseInt(dueToday?.count || 0),
                dueWeek: parseInt(dueWeek?.count || 0),
                completedMonth: parseInt(completedMonth?.count || 0)
            },
            recentCases: recentCases || [],
            deadlines: deadlines || [],
            tasksQueue: tasksQueue || [],
            timeline: activity || [],
            payments: {
                expected: parseFloat(payments?.total_expected || 0),
                collected: parseFloat(payments?.total_collected || 0)
            }
        });
    } catch (err) {
        console.error("Dashboard All-in-One Error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
