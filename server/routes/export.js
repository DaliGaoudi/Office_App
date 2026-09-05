const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const { dumpDatabase } = require('../services/backup');
const { logActivity } = require('../utils/logger');

/*
 * The office's own copy of its own data, as one JSON file.
 *
 * This is the same logical dump the nightly cron takes, handed to the office's
 * administrator on request. It is deliberately outside the licence gate
 * (middleware/license.js): a suspended or terminated office can still take its
 * registers with it. Withholding them would be indefensible — they are the
 * office's legal work product, not ours.
 *
 * Admins only, and audit-logged like every other privileged action.
 */
router.get('/data', authenticate, async (req, res) => {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
        return res.status(403).json({ error: 'التصدير متاح للمدير فقط.' });
    }
    try {
        const dump = await dumpDatabase();
        const stamp = dump.created_at.slice(0, 10);
        logActivity(req.user, 'EXPORT', 'DATABASE', `تصدير كامل للبيانات (${dump.row_count} سطر)`).catch(() => {});
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="office-data-${stamp}.json"`);
        res.send(JSON.stringify(dump, null, 2));
    } catch (e) {
        console.error('export error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
