/*
 * import_desktop_cnss.js — one-way migration of an office's CNSS records from
 * the desktop app (cnss-scanner-desktop) into this web app's database.
 *
 * Step 2 of the migration. Step 1 produces the JSON:
 *     node scripts/export-records.js        (in cnss-scanner-desktop)
 * A snapshot pulled from the licence server's /api/data/pull has the same shape
 * and imports unchanged.
 *
 * Usage:
 *   node server/scripts/import_desktop_cnss.js \
 *     --url "postgres://…"                  (REQUIRED — the target office database)
 *     --file cnss-records-2026-09-22.json   (REQUIRED)
 *     --office-id 42                        (REQUIRED — the id_so every imported row gets)
 *     --user-id 1                           (REQUIRED — the admin the rows are attributed to)
 *     --keep-notes                          (add a `notes` column on a DB predating it)
 *     --dry-run                             (report what would happen, write nothing)
 *     --force                               (import even though the office already has records)
 *
 * What it does about the two schemas not matching exactly:
 *   - id_cn / id_cn_oe are renumbered above this database's current maximum, the
 *     way both apps allocate ids (MAX(..)+1). Cards follow their employer.
 *   - ref is renumbered from the office's current maximum, keeping the desktop
 *     order, so the office's numbering continues rather than restarting.
 *   - id_so / id_user are rewritten to the target office and admin.
 *   - Columns this database does not have are dropped; columns it has and the
 *     export does not (id_f, nbr, id_cn_ty) stay NULL, exactly as rows created
 *     by the web app itself do.
 *
 * Safety: --url is mandatory and never read from server/.env, so the target is
 * always stated out loud. Everything runs in one transaction; a failure leaves
 * the database untouched. Re-running would duplicate every record, so the script
 * refuses an office that already has CNSS rows unless --force.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const { createPool } = require('@vercel/postgres');

// ── argv ────────────────────────────────────────────────────────────────────────
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
const FORCE = Boolean(args.force);
const KEEP_NOTES = Boolean(args['keep-notes']);
const DROP_NOTES_FLAG = Boolean(args['force-drop-notes']);

const fail = (msg) => { console.error(`\n  ✗ ${msg}\n`); process.exit(1); };
const required = (k) => {
    const v = args[k];
    if (!v || v === true) fail(`--${k} is required`);
    return v;
};

// Columns the desktop owns but that are recomputed here, never copied verbatim.
const REMAPPED = new Set(['id_cn', 'id_cn_oe', 'id_so', 'id_user', 'ref']);

async function main() {
    const url = required('url');
    const file = required('file');
    const officeId = String(required('office-id'));
    const userId = parseInt(required('user-id'), 10);
    if (!Number.isFinite(userId)) fail('--user-id must be a number');
    if (!/^\d+$/.test(officeId)) fail('--office-id must be a number (cnss.id_so is an integer column)');
    if (!fs.existsSync(file)) fail(`file not found: ${file}`);

    let snap;
    try { snap = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { fail(`could not parse ${file}: ${e.message}`); }

    // Accept both the export wrapper and a bare licence-server snapshot.
    const src = snap && snap.data && Array.isArray(snap.data.cnss) ? snap.data : snap;
    if (!src || !Array.isArray(src.cnss)) fail('invalid export: no `cnss` array found');
    const srcCnss = src.cnss;
    const srcCards = Array.isArray(src.cnss_oeuvre) ? src.cnss_oeuvre : [];

    console.log('\n  CNSS migration — desktop → web');
    console.log(`  ├─ file      : ${file}`);
    console.log(`  ├─ records   : ${srcCnss.length} employer(s), ${srcCards.length} card(s)`);
    console.log(`  ├─ office    : id_so ${officeId}`);
    console.log(`  └─ attributed: id_user ${userId}`);

    const pool = createPool({ connectionString: url });

    // ── validate the target ─────────────────────────────────────────────────────
    const admin = await pool.query(
        `SELECT id, username, role, id_so FROM admin_admin WHERE id = $1`, [userId]
    );
    if (!admin.rows.length) fail(`no user with id ${userId} in admin_admin`);
    if (String(admin.rows[0].id_so) !== officeId) {
        fail(`user ${userId} (${admin.rows[0].username}) belongs to office ${admin.rows[0].id_so}, not ${officeId}`);
    }

    const existing = await pool.query(
        `SELECT count(*)::int AS n FROM cnss WHERE id_so = $1`, [officeId]
    );
    if (existing.rows[0].n > 0 && !FORCE) {
        fail(`office ${officeId} already has ${existing.rows[0].n} CNSS record(s). This script is not idempotent — `
            + 'importing again would duplicate them. Pass --force only if you mean to add to them.');
    }

    // Which columns actually exist here, so the export's extras are dropped
    // rather than crashing the insert.
    const colsOf = async (table) => {
        const { rows } = await pool.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = $1`, [table]
        );
        return new Set(rows.map((r) => r.column_name));
    };
    let cnssCols = await colsOf('cnss');
    const cardCols = await colsOf('cnss_oeuvre');

    // ملاحظات: the desktop has a notes field, this schema does not. Dropping a
    // field the user typed by hand is not something to do silently.
    const notesRows = srcCnss.filter((r) => r.notes && String(r.notes).trim()).length;
    const hasNotesCol = cnssCols.has('notes');
    if (notesRows && !hasNotesCol && !DROP_NOTES_FLAG && !KEEP_NOTES) {
        fail(`${notesRows} record(s) carry ملاحظات (notes) and this database has no notes column.\n`
            + '      It predates the column, so run the migration first (preferred):\n'
            + '          node server/scripts/add_cnss_notes_column.js\n'
            + '      Or pass --keep-notes to have this script add it, or --force-drop-notes\n'
            + '      to import without them.');
    }
    // Decided from intent, not from the current column set, so --dry-run reports
    // what the real run would do rather than what an un-altered table can hold.
    const dropNotes = DROP_NOTES_FLAG || !(hasNotesCol || KEEP_NOTES);
    const addNotesCol = !dropNotes && !hasNotesCol;
    if (addNotesCol && !DRY_RUN) {
        await pool.query('ALTER TABLE cnss ADD COLUMN IF NOT EXISTS notes TEXT');
        cnssCols = await colsOf('cnss');
        console.log('  ✓ added cnss.notes');
    }

    // ── work out the new ids ────────────────────────────────────────────────────
    // Both apps allocate from the GLOBAL max, not per office, so renumbering has
    // to clear every existing row, not just this office's.
    const maxOf = async (table, col) => {
        const { rows } = await pool.query(`SELECT COALESCE(MAX(${col}), 0)::int AS m FROM ${table}`);
        return rows[0].m;
    };
    let nextIdCn = (await maxOf('cnss', 'id_cn')) + 1;
    let nextIdCard = (await maxOf('cnss_oeuvre', 'id_cn_oe')) + 1;
    const { rows: refRows } = await pool.query(
        `SELECT COALESCE(MAX(ref), 0)::int AS m FROM cnss WHERE id_so = $1`, [officeId]
    );
    let nextRef = refRows[0].m + 1;

    // Keep the desktop's own order so ref numbers stay in the sequence the office
    // is used to reading.
    const ordered = [...srcCnss].sort((a, b) => {
        const ra = parseInt(a.ref, 10), rb = parseInt(b.ref, 10);
        if (Number.isFinite(ra) && Number.isFinite(rb) && ra !== rb) return ra - rb;
        return (parseInt(a.id_cn, 10) || 0) - (parseInt(b.id_cn, 10) || 0);
    });

    const idMap = new Map();           // desktop id_cn → new id_cn
    for (const row of ordered) idMap.set(String(row.id_cn), nextIdCn++);

    const orphans = srcCards.filter((c) => !idMap.has(String(c.id_cn)));
    const cards = srcCards.filter((c) => idMap.has(String(c.id_cn)));

    const firstId = ordered.length ? idMap.get(String(ordered[0].id_cn)) : '-';
    console.log(`\n  id_cn     : ${idMap.size} record(s) renumbered from ${firstId}`);
    console.log(`  id_cn_oe  : ${cards.length} card(s) renumbered from ${cards.length ? nextIdCard : '-'}`);
    console.log(`  ref       : continues at ${nextRef}`);
    if (orphans.length) console.log(`  ⚠ ${orphans.length} card(s) reference a missing employer — they will be skipped`);
    if (notesRows) {
        const fate = dropNotes ? 'DROPPED' : `preserved in cnss.notes${addNotesCol ? ' (column added)' : ''}`;
        console.log(`  notes     : ${notesRows} record(s) ${fate}`);
    }

    if (DRY_RUN) {
        await pool.end();
        console.log('\n  Dry run — nothing was written.\n');
        return;
    }

    // ── insert, all or nothing ──────────────────────────────────────────────────
    const stamp = new Date().toLocaleString('fr-FR');
    const client = await pool.connect();
    let insertedCnss = 0, insertedCards = 0;
    try {
        await client.query('BEGIN');

        const insert = async (table, data) => {
            const keys = Object.keys(data);
            await client.query(
                `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(',')})
                 VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`,
                keys.map((k) => data[k])
            );
        };

        for (const row of ordered) {
            const data = {};
            for (const [k, v] of Object.entries(row)) {
                if (REMAPPED.has(k) || !cnssCols.has(k)) continue;
                if (k === 'notes' && dropNotes) continue;
                data[k] = v === undefined ? null : v;
            }
            data.id_cn = idMap.get(String(row.id_cn));
            data.ref = nextRef++;
            data.id_so = officeId;
            data.id_user = userId;
            if (!data.date_ajout) data.date_ajout = stamp;
            if (!data.status) data.status = 'has_deposit';
            await insert('cnss', data);
            insertedCnss++;
        }

        for (const card of cards) {
            const data = {};
            for (const [k, v] of Object.entries(card)) {
                if (REMAPPED.has(k) || !cardCols.has(k)) continue;
                data[k] = v === undefined ? null : v;
            }
            data.id_cn_oe = nextIdCard++;
            data.id_cn = idMap.get(String(card.id_cn));
            data.id_so = officeId;
            data.id_user = userId;
            if (!data.date_ajout) data.date_ajout = stamp;
            await insert('cnss_oeuvre', data);
            insertedCards++;
        }

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
        await pool.end();
        fail(`import failed and was rolled back — nothing was written: ${e.message}`);
    }
    client.release();

    // ── verify what landed ──────────────────────────────────────────────────────
    const after = await pool.query(
        `SELECT (SELECT count(*)::int FROM cnss WHERE id_so = $1) AS employers,
                (SELECT count(*)::int FROM cnss_oeuvre WHERE id_so = $1) AS cards`, [officeId]
    );
    await pool.end();

    console.log('\n  ────────────────────────────────────────────────');
    console.log(`   Imported ${insertedCnss} employer(s) and ${insertedCards} card(s).`);
    console.log(`   Office ${officeId} now holds ${after.rows[0].employers} employer(s), ${after.rows[0].cards} card(s).`);
    console.log('  ────────────────────────────────────────────────');
    console.log('\n  Next:');
    console.log('   1. Log in and check سجل CNSS — record count, a few employers, their cards.');
    console.log('   2. Generate one محضر إعلام and one monthly list, compare against the desktop.');
    console.log('   3. Only once both match: stop using the desktop app, so the two copies cannot diverge.\n');
}

main().catch((e) => { console.error('\n  ✗ Import failed:', e.message, '\n'); process.exit(1); });
