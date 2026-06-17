/*
 * Manual / scheduled database backup. Dumps every table to a timestamped JSON
 * file under server/backups/ (git-ignored), and also to Vercel Blob if
 * BLOB_READ_WRITE_TOKEN is set.
 *
 *   node scripts/backup_db.js
 *
 * To run it automatically on the office PC, add a Windows Scheduled Task, e.g.:
 *   schtasks /Create /TN "CNSS DB Backup" /TR "node \"%CD%\server\scripts\backup_db.js\"" /SC DAILY /ST 20:00
 * (or rely on the Vercel Cron in vercel.json for off-site backups.)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { dumpDatabase, uploadToBlob } = require('../services/backup');

(async () => {
    try {
        const dump = await dumpDatabase();

        const dir = path.join(__dirname, '..', 'backups');
        fs.mkdirSync(dir, { recursive: true });
        const stamp = dump.created_at.replace(/[:.]/g, '-');
        const file = path.join(dir, `backup-${stamp}.json`);
        fs.writeFileSync(file, JSON.stringify(dump));

        let blobUrl = null;
        try { blobUrl = await uploadToBlob(dump); }
        catch (e) { console.error('Blob upload skipped:', e.message); }

        const tableCount = Object.keys(dump.tables).length;
        console.log(`Backup OK — ${tableCount} tables, ${dump.row_count} rows total.`);
        console.log('Local file:', file);
        console.log(blobUrl ? `Blob: ${blobUrl}` : 'Blob: (not configured — local file only)');
    } catch (e) {
        console.error('Backup FAILED:', e.message);
        process.exit(1);
    }
    process.exit(0);
})();
