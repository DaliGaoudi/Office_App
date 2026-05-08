const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/auth');

// Middleware to check admin privileges
const isAdmin = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
        next();
    } else {
        res.status(403).json({ error: 'Access denied' });
    }
};

router.get('/stats', authenticate, isAdmin, async (req, res) => {
    try {
        const { year = new Date().getFullYear() } = req.query;
        const id_so = req.user.id_so;

        // We will fetch raw records and aggregate them in JS for 100% accuracy matching Facturation.jsx

        // 1. General Registry (clients_record where is_execution = FALSE)
        const generalRecords = await db.all(
            `SELECT date_reg, origine, exemple, version_bureau, orientation, 
                    delimitation, inscri, mobilite, imprimer, poste, autre 
             FROM clients_record 
             WHERE id_so::text = ? AND is_execution = FALSE AND date_reg LIKE ?`,
            [id_so, `${year}-%`]
        );

        // 2. Execution Actions (œuvre_type)
        const executionActions = await db.all(
            `SELECT date_r, origine, exemple, versionbureau, orientation, 
                    delimitation, inscri, mobilite, imprimer, postal, autre, "TVA" as stored_tva, salaire
             FROM "œuvre_type"
             WHERE id_so::text = ? AND date_r LIKE ?`,
            [id_so, `${year}-%`]
        );

        // 3. CNSS Actions (cnss_oeuvre)
        // Based on Postgres hints, date_s and montant belong to the cnss table.
        const cnssActions = await db.all(
            `SELECT date_s, montant 
             FROM cnss 
             WHERE id_so::text = ? AND date_s LIKE ?`,
            [id_so, `${year}-%`]
        );

        // Get global TVA rate from settings (fallback to 19)
        let cachedTVA = 19;
        try {
            const row = await db.get(`SELECT value FROM app_settings WHERE key='tva_rate'`);
            if (row) cachedTVA = parseFloat(row.value) || 19;
        } catch (e) { }

        // Initialize 12 months
        const monthlyData = Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            monthName: new Date(year, i, 1).toLocaleString('ar-TN', { month: 'long' }),
            base: 0,
            tva: 0,
            expenses: 0,
            total: 0
        }));

        const processRecord = (dateStr, base, tva, expenses) => {
            if (!dateStr) return;
            const month = parseInt(dateStr.split('-')[1], 10);
            if (isNaN(month) || month < 1 || month > 12) return;

            const idx = month - 1;
            monthlyData[idx].base += base;
            monthlyData[idx].tva += tva;
            monthlyData[idx].expenses += expenses;
            monthlyData[idx].total += (base + tva + expenses);
        };

        // Process General
        generalRecords.forEach(r => {
            const base = (parseFloat(r.origine)||0) + (parseFloat(r.exemple)||0) + (parseFloat(r.version_bureau)||0) + (parseFloat(r.orientation)||0);
            const expenses = (parseFloat(r.delimitation)||0) + (parseFloat(r.inscri)||0) + (parseFloat(r.mobilite)||0) + (parseFloat(r.imprimer)||0) + (parseFloat(r.poste)||0) + (parseFloat(r.autre)||0);
            const tva = Math.round(base * cachedTVA / 100);
            processRecord(r.date_reg, base, tva, expenses);
        });

        // Process Execution
        executionActions.forEach(r => {
            const base = (parseFloat(r.origine)||0) + (parseFloat(r.exemple)||0) + (parseFloat(r.versionbureau)||0) + (parseFloat(r.orientation)||0);
            const expenses = (parseFloat(r.delimitation)||0) + (parseFloat(r.inscri)||0) + (parseFloat(r.mobilite)||0) + (parseFloat(r.imprimer)||0) + (parseFloat(r.postal)||0) + (parseFloat(r.autre)||0);
            
            let tva = parseFloat(r.stored_tva) || 0;
            if (!tva && base > 0) tva = Math.round(base * cachedTVA / 100); // Fallback
            
            // Note: If everything is 0 but `salaire` is set, we could map salaire to base, but standard is breakdown.
            let finalBase = base;
            if (base === 0 && expenses === 0 && parseFloat(r.salaire) > 0) {
                finalBase = parseFloat(r.salaire);
            }

            processRecord(r.date_r, finalBase, tva, expenses);
        });

        // Process CNSS
        cnssActions.forEach(r => {
            const total = parseFloat(r.montant) || 0;
            // Since CNSS often doesn't have a breakdown, we put it all in "base" for now, or just add to total.
            processRecord(r.date_s, total, 0, 0);
        });

        // Compute global sums
        const globalTotals = monthlyData.reduce((acc, m) => {
            acc.base += m.base;
            acc.tva += m.tva;
            acc.expenses += m.expenses;
            acc.total += m.total;
            return acc;
        }, { base: 0, tva: 0, expenses: 0, total: 0 });

        res.json({
            year,
            monthly: monthlyData,
            totals: globalTotals
        });
    } catch (err) {
        console.error("Accounting stats error:", err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
