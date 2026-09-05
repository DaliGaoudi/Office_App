/*
 * migrate_add_indexes.js — add the integrity/performance indexes to an EXISTING
 * office database. New offices get these from provision_office.js.
 *
 * The inherited schema has no foreign keys and no indexes at all — `admin_admin`
 * doesn't even have a primary key or a unique username, so nothing stops two
 * accounts sharing a login name. Meanwhile every request filters by id_so, which
 * today is a sequential scan.
 *
 *   node server/scripts/migrate_add_indexes.js --url "postgres://…" [--dry-run]
 *
 * Runs a pre-check first and refuses to create the unique username index if
 * duplicates exist (it would fail anyway, but the report is more useful than the
 * Postgres error). Every statement is IF NOT EXISTS, so re-running is safe.
 *
 * All of these are reversible with DROP INDEX; none rewrites table data.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createPool } = require('@vercel/postgres');

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

// The list lives in services/schemaSetup.js so a new office and an existing one
// can never drift apart. Unique first — it is the one that can legitimately fail.
const { HARDENING_INDEXES } = require('../services/schemaSetup');
const INDEXES = HARDENING_INDEXES.map((i) => [i.name, i.table, i.ddl]);

const fail = (msg) => { console.error(`\n  ✗ ${msg}\n`); process.exit(1); };

async function main() {
    // Defaults to the deployed office's database (server/.env); --url overrides.
    let url = args.url;
    let source = '--url';
    if (!url || url === true) { url = process.env.POSTGRES_URL; source = 'server/.env'; }
    if (!url) fail('no database URL: pass --url, or set POSTGRES_URL in server/.env.');

    const pool = createPool({ connectionString: url });
    const host = (url.match(/@([^/:]+)/) || [])[1] || '(unknown host)';
    console.log(`\n  Database: ${host}  (from ${source})`);
    if (DRY_RUN) console.log('  DRY RUN — nothing will be created.');

    // ── pre-check: duplicate usernames would make the unique index impossible ──
    const dupes = await pool.query(
        `SELECT username, count(*)::int AS n FROM admin_admin GROUP BY username HAVING count(*) > 1`
    );
    const canUnique = dupes.rows.length === 0;
    if (!canUnique) {
        console.log('\n  ! Duplicate usernames found — the unique index will be SKIPPED:');
        dupes.rows.forEach((r) => console.log(`      ${r.username} × ${r.n}`));
        console.log('    Resolve these first, then re-run.');
    }

    // ── what already exists ──
    const existing = new Set(
        (await pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`))
            .rows.map((r) => r.indexname)
    );
    const tables = new Set(
        (await pool.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`
        )).rows.map((r) => r.table_name)
    );

    const plan = [];
    for (const [name, table, ddl] of INDEXES) {
        if (existing.has(name)) { console.log(`  · ${name} — already exists`); continue; }
        if (!tables.has(table)) { console.log(`  · ${name} — table ${table} not present, skipping`); continue; }
        if (name === 'admin_admin_username_key' && !canUnique) continue;
        plan.push([name, ddl]);
    }

    if (!plan.length) { console.log('\n  Nothing to do.\n'); await pool.end(); return; }

    console.log('\n  Will create:');
    plan.forEach(([name]) => console.log(`    + ${name}`));

    if (DRY_RUN) { console.log('\n  DRY RUN — not created.\n'); await pool.end(); return; }

    const created = [];
    for (const [name, ddl] of plan) {
        try { await pool.query(ddl); created.push(name); console.log(`  ✓ ${name}`); }
        catch (e) { console.error(`  ✗ ${name}: ${e.message.split('\n')[0]}`); }
    }

    if (created.length) {
        console.log('\n  To revert:');
        created.forEach((n) => console.log(`    DROP INDEX IF EXISTS ${n};`));
    }
    console.log('');
    await pool.end();
}

main().catch((e) => { console.error('\n  ✗ Migration failed:', e.message, '\n'); process.exit(1); });
