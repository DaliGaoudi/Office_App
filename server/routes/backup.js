const express = require('express');
const router = express.Router();
const { dumpDatabase, uploadToBlob } = require('../services/backup');

/*
 * Automated backup endpoint, meant for the Vercel Cron defined in vercel.json.
 * Vercel sends `Authorization: Bearer $CRON_SECRET` to cron requests, so we
 * require that secret. Set CRON_SECRET and BLOB_READ_WRITE_TOKEN in the Vercel
 * project env for off-site daily backups; without them this endpoint is a no-op
 * 401 and the local scripts/backup_db.js remains the backup path.
 */
router.get('/', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || (req.headers.authorization || '') !== `Bearer ${secret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const dump = await dumpDatabase();
        const blobUrl = await uploadToBlob(dump);
        res.json({ success: true, tables: Object.keys(dump.tables).length, rows: dump.row_count, blobUrl });
    } catch (e) {
        console.error('Backup endpoint error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
