const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/auth');

// A record is "active" (needs attention) when it isn't finished or cancelled.
const ACTIVE = `(status IS NULL OR status NOT IN ('finished','cancelled'))`;
// Deadlines are stored as text 'YYYY-MM-DD', which sorts/compares correctly.
const HAS_DEADLINE = `(date_echeance IS NOT NULL AND date_echeance <> '')`;

router.get('/stats', authenticate, async (req, res) => {
    try {
        const id_so = req.user.id_so;
        const today = new Date().toISOString().split('T')[0];
        const week = new Date();
        week.setDate(week.getDate() + 7);
        const weekStr = week.toISOString().split('T')[0];
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            .toISOString().split('T')[0];

        // ── Triage: file deadlines bucketed by urgency (the dashboard's spine) ──
        // All three buckets come from the SAME source so the counts match the agenda.
        const triageRow = await db.get(`
            SELECT
              COUNT(*) FILTER (WHERE date_echeance < ?) AS overdue,
              COUNT(*) FILTER (WHERE date_echeance = ?) AS today,
              COUNT(*) FILTER (WHERE date_echeance > ? AND date_echeance <= ?) AS week
            FROM clients_record
            WHERE id_so::text = ? AND ${ACTIVE} AND ${HAS_DEADLINE}
        `, [today, today, today, weekStr, id_so]);

        // ── Agenda: the prioritised action list (overdue + this week), soonest first ──
        const agenda = await db.all(`
            SELECT id_r, ref, nom_cl1, nom_cl2, de_part, status, date_echeance,
                   salaire, date_reg, remarque
            FROM clients_record
            WHERE id_so::text = ? AND ${ACTIVE} AND ${HAS_DEADLINE}
              AND date_echeance <= ?
            ORDER BY date_echeance ASC
            LIMIT 40
        `, [id_so, weekStr]);

        // ── Headline counts ──
        const activeCount = await db.get(
            `SELECT COUNT(*) as count FROM clients_record WHERE id_so::text = ? AND ${ACTIVE}`,
            [id_so]);
        const completedMonth = await db.get(
            `SELECT COUNT(*) as count FROM clients_record
             WHERE id_so::text = ? AND status = 'finished' AND date_reg >= ?`,
            [id_so, firstOfMonth]);

        // ── Upcoming appointments (events) for the next week ──
        const appointments = await db.all(`
            SELECT id_even, sujet as title, debut_date as start, show_time as time_even,
                   location as place, description
            FROM evenement
            WHERE id_so::text = ? AND debut_date >= ? AND debut_date <= ?
            ORDER BY debut_date ASC, show_time ASC
            LIMIT 10
        `, [id_so, today, weekStr]);

        // ── Recent activity (case + event milestones) ──
        const timeline = await db.all(`
            (SELECT 'case' as type, id_r as id, nom_cl1 as title, date_reg as date, 'محضر جديد' as action
             FROM clients_record WHERE id_so::text = ? ORDER BY id_r DESC LIMIT 5)
            UNION ALL
            (SELECT 'event' as type, id_even as id, sujet as title, debut_date as date, 'موعد جديد' as action
             FROM evenement WHERE id_so::text = ? ORDER BY id_even DESC LIMIT 5)
            ORDER BY date DESC
            LIMIT 8
        `, [id_so, id_so]);

        // ── Collection this month (amounts are stored in millimes) ──
        const payments = await db.get(`
            SELECT SUM(CAST(NULLIF(salaire, '') AS NUMERIC)) as total_expected,
                   SUM(CAST(NULLIF(acompte, '') AS NUMERIC) + CAST(NULLIF(montant_partiel1, '') AS NUMERIC)) as total_collected
            FROM clients_record
            WHERE id_so::text = ? AND date_reg >= ?
        `, [id_so, firstOfMonth]);

        // ── Month deadlines for the mini calendar ──
        const startOfMonth = firstOfMonth;
        const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0)
            .toISOString().split('T')[0];
        const calendarDeadlines = await db.all(`
            SELECT id_r, ref, nom_cl1, date_echeance
            FROM clients_record
            WHERE id_so::text = ? AND ${ACTIVE} AND ${HAS_DEADLINE}
              AND date_echeance >= ? AND date_echeance <= ?
        `, [id_so, startOfMonth, endOfMonth]);

        res.json({
            metrics: {
                activeCount: parseInt(activeCount?.count || 0),
                completedMonth: parseInt(completedMonth?.count || 0)
            },
            triage: {
                overdue: parseInt(triageRow?.overdue || 0),
                today: parseInt(triageRow?.today || 0),
                week: parseInt(triageRow?.week || 0)
            },
            agenda: agenda || [],
            appointments: appointments || [],
            timeline: timeline || [],
            calendarDeadlines: calendarDeadlines || [],
            payments: {
                expected: parseFloat(payments?.total_expected || 0),
                collected: parseFloat(payments?.total_collected || 0)
            }
        });
    } catch (err) {
        console.error("Dashboard stats error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
