/*
 * migrate_attachments_tenancy.js — add id_so to attachments / scan_targets and
 * backfill it from each row's owning record.
 *
 * YOU NORMALLY DO NOT NEED THIS. routes/attachments.js runs the same attribution
 * itself on the first request after deploy and records completion in
 * app_settings.attachments_id_so_backfilled. This script exists for two cases:
 *
 *   1. adopting orphans — rows whose record no longer exists, which the automatic
 *      pass deliberately leaves hidden (see --orphans-to below);
 *   2. inspecting or forcing the migration by hand, e.g. with --dry-run before a
 *      deploy, or if the automatic pass logged a failure.
 *
 * `attachments` never had a tenant column, so every row predating it has a NULL
 * id_so. The route REQUIRES id_so to match, which means those rows stay invisible
 * until attributed — deliberately, because the alternative (treating "tenant
 * unknown" as "visible to everyone") is the bug being fixed.
 *
 *   node server/scripts/migrate_attachments_tenancy.js --url "postgres://…" [--dry-run]
 *
 * The office is derived by joining record_id back to the record it is attached to:
 *   record_type registre | execution | general → clients_record.id_r
 *   record_type cnss                            → cnss.id_cn
 *
 * Rows whose record no longer exists cannot be attributed to an office and are
 * reported, not guessed. Adopt them with --orphans-to <id_so> once you have
 * checked what they are.
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
const ORPHANS_TO = args['orphans-to'] && args['orphans-to'] !== true ? String(args['orphans-to']) : null;

const fail = (msg) => { console.error(`\n  ✗ ${msg}\n`); process.exit(1); };

// record_type → the table and id column that says which office owns it.
const SOURCES = [
    { types: ['registre', 'execution', 'general'], table: 'clients_record', idColumn: 'id_r' },
    { types: ['cnss'], table: 'cnss', idColumn: 'id_cn' },
];

async function main() {
    // Defaults to the deployed office's database (server/.env); --url overrides.
    let url = args.url;
    let source = '--url';
    if (!url || url === true) { url = process.env.POSTGRES_URL; source = 'server/.env'; }
    if (!url) fail('no database URL: pass --url, or set POSTGRES_URL in server/.env.');

    const pool = createPool({ connectionString: url });
    const host = (url.match(/@([^/:]+)/) || [])[1] || '(unknown host)';
    console.log(`\n  Database: ${host}  (from ${source})`);
    if (DRY_RUN) console.log('  DRY RUN — nothing will be written.');

    // ── 1. columns ──────────────────────────────────────────────────────────────
    if (!DRY_RUN) {
        await pool.query(`ALTER TABLE attachments ADD COLUMN IF NOT EXISTS id_so TEXT`);
        await pool.query(`ALTER TABLE scan_targets ADD COLUMN IF NOT EXISTS id_so TEXT`);
        console.log('  ✓ id_so column present on attachments and scan_targets');
    } else {
        console.log('  · would add id_so to attachments and scan_targets');
    }

    const hasColumn = (await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name='attachments' AND column_name='id_so'`
    )).rows.length > 0;

    // On a dry run the column may not exist yet; in that case every row is
    // unattributed, so the preview simply omits the id_so predicate.
    const unattributed = hasColumn ? 'a.id_so IS NULL' : 'TRUE';

    const before = (await pool.query(
        hasColumn
            ? `SELECT count(*)::int AS total, count(id_so)::int AS attributed FROM attachments`
            : `SELECT count(*)::int AS total, 0 AS attributed FROM attachments`
    )).rows[0];
    console.log(`\n  attachments: ${before.total} rows, ${before.attributed} already attributed`);

    // ── 2. backfill from the owning record ──────────────────────────────────────
    let filled = 0;
    for (const src of SOURCES) {
        const typeList = src.types.map((t) => `'${t}'`).join(',');

        const preview = await pool.query(
            `SELECT count(*)::int AS n
               FROM attachments a
               JOIN ${src.table} r ON r.${src.idColumn}::text = a.record_id
              WHERE ${unattributed} AND a.record_type IN (${typeList}) AND r.id_so IS NOT NULL`
        );
        const n = preview.rows[0].n;
        if (!n) { console.log(`  · ${src.table}: nothing to fill`); continue; }

        if (DRY_RUN) {
            console.log(`  · ${src.table}: would attribute ${n} attachment(s)`);
            continue;
        }

        const res = await pool.query(
            `UPDATE attachments a
                SET id_so = r.id_so::text
               FROM ${src.table} r
              WHERE r.${src.idColumn}::text = a.record_id
                AND a.id_so IS NULL
                AND a.record_type IN (${typeList})
                AND r.id_so IS NOT NULL`
        );
        console.log(`  ✓ ${src.table}: attributed ${res.rowCount} attachment(s)`);
        filled += res.rowCount;
    }

    // ── 3. whatever is left ─────────────────────────────────────────────────────
    const orphans = await pool.query(
        hasColumn
            ? `SELECT record_type, count(*)::int AS n FROM attachments WHERE id_so IS NULL GROUP BY record_type ORDER BY n DESC`
            : `SELECT record_type, count(*)::int AS n FROM attachments WHERE NOT EXISTS (SELECT 1 FROM clients_record r WHERE r.id_r::text = attachments.record_id AND r.id_so IS NOT NULL) GROUP BY record_type ORDER BY n DESC`
    );

    if (orphans.rows.length) {
        const total = orphans.rows.reduce((s, r) => s + r.n, 0);
        console.log(`\n  ! ${total} attachment(s) could not be attributed — their record no longer exists:`);
        orphans.rows.forEach((r) => console.log(`      record_type=${r.record_type}: ${r.n}`));
        console.log('    These stay invisible in the app until given an office.');

        if (ORPHANS_TO && !DRY_RUN) {
            const res = await pool.query(`UPDATE attachments SET id_so = $1 WHERE id_so IS NULL`, [ORPHANS_TO]);
            console.log(`  ✓ adopted ${res.rowCount} orphan(s) into office ${ORPHANS_TO}`);
        } else if (!ORPHANS_TO) {
            console.log('    Re-run with --orphans-to <id_so> to adopt them once you know what they are.');
        }
    } else {
        console.log('\n  ✓ every attachment is attributed to an office');
    }

    // scan_targets is per-user transient state; attribute from the user's own row.
    if (!DRY_RUN) {
        const st = await pool.query(
            `UPDATE scan_targets s SET id_so = u.id_so::text
               FROM admin_admin u WHERE u.id::text = s.user_id AND s.id_so IS NULL`
        );
        if (st.rowCount) console.log(`  ✓ scan_targets: attributed ${st.rowCount} row(s)`);
    }

    if (!DRY_RUN) {
        const after = (await pool.query(
            `SELECT count(*)::int AS total, count(id_so)::int AS attributed FROM attachments`
        )).rows[0];
        console.log(`\n  Result: ${after.attributed}/${after.total} attachments attributed (${filled} filled this run).`);
        console.log('\n  To revert: ALTER TABLE attachments DROP COLUMN id_so;  (and the same for scan_targets)\n');
    } else {
        console.log('');
    }

    await pool.end();
}

main().catch((e) => { console.error('\n  ✗ Migration failed:', e.message, '\n'); process.exit(1); });
