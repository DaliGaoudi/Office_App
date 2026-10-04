/*
 * Migration: add طريقة التبليغ and المآل النهائي to cnss.
 *
 *   tabligh_method  طريقة التبليغ   — how the محضر إعلام was served: فصل 8 / فصل 10 /
 *                                    مباشر. Stored as the literal label (TEXT) like
 *                                    the rest of this loosely-typed table; empty
 *                                    means not recorded yet. One per ملف المطلوب.
 *   resultat        المآل النهائي   — free text, the same field and column name the
 *                                    execution register already uses on
 *                                    clients_record, so the two registers agree.
 *
 * Idempotent (ADD COLUMN IF NOT EXISTS). Re-run safely:
 *   node scripts/add_cnss_tabligh_method_resultat_columns.js
 */
const db = require('../db');

const COLS = ['tabligh_method', 'resultat'];

async function run() {
    console.log('Migration: adding cnss.tabligh_method (طريقة التبليغ) + cnss.resultat (المآل النهائي)…');
    for (const col of COLS) {
        try {
            await db.run(`ALTER TABLE cnss ADD COLUMN IF NOT EXISTS ${col} TEXT`);
            console.log(`  ✓ ${col}`);
        } catch (e) {
            console.error(`  ✗ ${col}: ${e.message}`);
            throw e;
        }
    }
    console.log('Done.');
}

run().then(() => process.exit(0)).catch((e) => { console.error('Migration failed:', e); process.exit(1); });
