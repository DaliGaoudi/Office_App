/*
 * Migration: add the per-act fee ledger (أتعاب) columns to cnss_oeuvre.
 *
 * These back the fee statement printed on each "محضر إعلام بطاقة جبر" — the same
 * billing breakdown the desktop app already stores. All TEXT to match the rest of
 * the loosely-typed cnss_oeuvre table; amounts are whole millimes stored as text.
 *
 * Idempotent (ADD COLUMN IF NOT EXISTS). Re-run safely:
 *   node scripts/add_cnss_fee_columns.js
 */
const db = require('../db');

// Manual fee inputs + the derived VAT line (fee_aqm) + the editable VAT rate.
const FEE_COLS = [
    'fee_post', 'fee_stamp', 'fee_registration', 'fee_travel', 'fee_aqm',
    'fee_copies', 'fee_movement', 'fee_office_copy', 'fee_legal_copy',
    'fee_counterparts', 'fee_original', 'vat_rate',
];

async function run() {
    console.log('Migration: adding CNSS fee-ledger columns to cnss_oeuvre…');
    for (const col of FEE_COLS) {
        try {
            await db.run(`ALTER TABLE cnss_oeuvre ADD COLUMN IF NOT EXISTS ${col} TEXT`);
            console.log(`  ✓ ${col}`);
        } catch (e) {
            console.error(`  ✗ ${col}: ${e.message}`);
            throw e;
        }
    }
    console.log('Done.');
}

run().then(() => process.exit(0)).catch((e) => { console.error('Migration failed:', e); process.exit(1); });
