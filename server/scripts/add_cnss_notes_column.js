/*
 * Migration: add the ملاحظات (notes) column to cnss.
 *
 * Free text the office keeps against a pursued employer. The desktop app has
 * always had this field; the web app did not, so a record migrated across with
 * server/scripts/import_desktop_cnss.js had nowhere to put it. Internal only —
 * it is never rendered into an act or the monthly billing list.
 *
 * TEXT to match the rest of the loosely-typed cnss table.
 *
 * Idempotent (ADD COLUMN IF NOT EXISTS). Re-run safely:
 *   node scripts/add_cnss_notes_column.js
 */
const db = require('../db');

async function run() {
    console.log('Migration: adding cnss.notes (ملاحظات)…');
    try {
        await db.run('ALTER TABLE cnss ADD COLUMN IF NOT EXISTS notes TEXT');
        console.log('  ✓ notes');
    } catch (e) {
        console.error(`  ✗ notes: ${e.message}`);
        throw e;
    }
    console.log('Done.');
}

run().then(() => process.exit(0)).catch((e) => { console.error('Migration failed:', e); process.exit(1); });
