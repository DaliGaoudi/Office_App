/*
 * Migration: add date_tabligh (تاريخ تبليغ المحضر) to cnss_oeuvre.
 *
 * Records the day a بطاقة جبر act was delivered/notified; the monthly CNSS billing
 * list groups cards by the month of this date. TEXT to match the rest of the table.
 *
 * Idempotent (ADD COLUMN IF NOT EXISTS). Re-run safely:
 *   node scripts/add_cnss_date_tabligh_column.js
 */
const db = require('../db');

async function run() {
    console.log('Migration: adding date_tabligh column to cnss_oeuvre…');
    await db.run('ALTER TABLE cnss_oeuvre ADD COLUMN IF NOT EXISTS date_tabligh TEXT');
    console.log('  ✓ date_tabligh');
    console.log('Done.');
}

run().then(() => process.exit(0)).catch((e) => { console.error('Migration failed:', e); process.exit(1); });
