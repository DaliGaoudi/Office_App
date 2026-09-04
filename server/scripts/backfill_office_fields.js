/*
 * backfill_office_fields.js — fill office-profile keys on an EXISTING office database.
 *
 * provision_office.js seeds these for a new office. This script is for the office that
 * already exists: when new {office_*} merge tags are introduced, its app_settings has
 * no value for them, and every sentence built from those tags renders blank in a legal
 * document. Run this (or fill them in الإعدادات) before deploying such a change.
 *
 *   node server/scripts/backfill_office_fields.js --url "postgres://…" \
 *     --office-address "…" --office-jurisdiction "…" \
 *     --cnss-bureau "…" --cnss-region "…" [--dry-run] [--overwrite]
 *
 * Only keys that are currently missing or empty are written. An existing non-empty
 * value is never touched unless --overwrite is passed. Prints the previous values so
 * the change can be reversed by hand.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createPool } = require('@vercel/postgres');
const { OFFICE_KEYS } = require('../services/officeProfile');

const parseArgs = (argv) => {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith('--')) continue;
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) { args[key] = true; }
        else { args[key] = next; i++; }
    }
    return args;
};

const args = parseArgs(process.argv.slice(2));
const DRY_RUN = Boolean(args['dry-run']);
const OVERWRITE = Boolean(args.overwrite);

const fail = (msg) => { console.error(`\n  ✗ ${msg}\n`); process.exit(1); };

// --office-tax-id → office_tax_id, --cnss-region → cnss_region
const flagToKey = (flag) => flag.replace(/-/g, '_');

async function main() {
    /*
     * Unlike provision_office.js — which creates a NEW office and must never be
     * pointed at a live one by accident — this script only fills blank settings on
     * the office that is already deployed. So it defaults to the POSTGRES_URL in
     * server/.env and simply says which host it resolved, rather than making the
     * caller pipe the connection string through the shell.
     */
    let url = args.url;
    let source = '--url';
    if (!url || url === true) {
        url = process.env.POSTGRES_URL;
        source = 'server/.env';
    }
    if (!url) {
        fail('no database URL: pass --url, or set POSTGRES_URL in server/.env.');
    }

    // Collect only the office keys actually passed on the command line.
    const wanted = {};
    for (const [flag, value] of Object.entries(args)) {
        const key = flagToKey(flag);
        if (OFFICE_KEYS.includes(key)) {
            if (value === true) fail(`--${flag} needs a value.`);
            wanted[key] = String(value);
        }
    }
    if (!Object.keys(wanted).length) {
        fail(`nothing to set. Pass one or more of: ${OFFICE_KEYS.map((k) => '--' + k.replace(/_/g, '-')).join(', ')}`);
    }

    const pool = createPool({ connectionString: url });
    const host = (url.match(/@([^/:]+)/) || [])[1] || '(unknown host)';
    console.log(`\n  Database: ${host}  (from ${source})`);
    if (DRY_RUN) console.log('  DRY RUN — nothing will be written.');

    const { rows } = await pool.query(
        `SELECT key, value FROM app_settings WHERE key = ANY($1)`, [Object.keys(wanted)]
    );
    const current = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    const toWrite = [];
    const skipped = [];
    for (const [key, value] of Object.entries(wanted)) {
        const existing = current[key];
        const isEmpty = existing === undefined || existing === null || String(existing).trim() === '';
        if (!isEmpty && !OVERWRITE) { skipped.push([key, existing]); continue; }
        if (existing === value) { skipped.push([key, existing]); continue; }
        toWrite.push([key, value, existing]);
    }

    console.log('\n  Planned changes:');
    if (!toWrite.length) console.log('    (none — every requested key already has a value)');
    for (const [key, value, existing] of toWrite) {
        console.log(`    ${key}`);
        console.log(`      from: ${existing === undefined ? '(key absent)' : JSON.stringify(existing)}`);
        console.log(`      to  : ${JSON.stringify(value)}`);
    }
    if (skipped.length) {
        console.log('\n  Left alone (already set — pass --overwrite to change):');
        skipped.forEach(([k, v]) => console.log(`    ${k} = ${JSON.stringify(v)}`));
    }

    if (DRY_RUN || !toWrite.length) { await pool.end(); console.log(''); return; }

    const upsert = `INSERT INTO app_settings (key, value, updated_at)
                    VALUES ($1, $2, CURRENT_TIMESTAMP)
                    ON CONFLICT (key) DO UPDATE
                      SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`;
    for (const [key, value] of toWrite) await pool.query(upsert, [key, value]);

    console.log(`\n  ✓ Wrote ${toWrite.length} key(s).`);
    console.log('\n  To revert:');
    for (const [key, , existing] of toWrite) {
        if (existing === undefined) console.log(`    DELETE FROM app_settings WHERE key = '${key}';`);
        else console.log(`    UPDATE app_settings SET value = ${JSON.stringify(existing)} WHERE key = '${key}';`);
    }
    console.log('');

    await pool.end();
}

main().catch((e) => { console.error('\n  ✗ Backfill failed:', e.message, '\n'); process.exit(1); });
