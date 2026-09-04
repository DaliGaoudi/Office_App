/*
 * audit_tenancy.js — flag route queries that touch tenant data without an id_so filter.
 *
 * Every table in this app is shared by all offices in a database and separated only
 * by `id_so`. A query that addresses a row by its primary key alone therefore reaches
 * across offices. That is how users.js let an admin edit another office's users and
 * how portal.js listed another office's records to a client.
 *
 * This is a lint, not a proof. It reads SQL string literals that name a tenant table
 * and sorts them into three buckets:
 *
 *   FAIL     no id_so, nothing interpolated — the filter is genuinely absent.
 *   REVIEW   no literal id_so, but the WHERE clause is built from a ${...} fragment,
 *            so the filter may well be there. Reported, does not fail the run.
 *   ALLOWED  known-safe, listed below with the reason.
 *
 *   node server/scripts/audit_tenancy.js [--verbose]
 *
 * Exit code 1 if any FAIL is found, so it can gate a release.
 */
const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', 'routes');

// Tables that carry an id_so column and hold office data.
const TENANT_TABLES = [
    'clients_record', 'cnss', 'cnss_oeuvre', 'evenement', 'telephone',
    'œuvre_type', 'oeuvre_type', 'admin_admin', 'case_documents',
    'attachments', 'scan_targets',
];

/*
 * Known-good exceptions: [file, SQL fragment, why it is safe].
 * Keep the fragment long enough to be unambiguous.
 */
const ALLOWED = [
    ['ai.js', 'UPDATE clients_record SET status = ? WHERE id_r = ?',
        'ownership verified by the id_so-scoped SELECT immediately above'],
    ['ai.js', 'UPDATE telephone SET',
        'ownership verified by the id_so-scoped SELECT immediately above'],
    ['ai.js', 'DELETE FROM evenement WHERE id_even = ?',
        'ownership verified by the id_so-scoped SELECT immediately above'],
    ['ai.js', 'UPDATE evenement SET title=?',
        'ownership verified by the id_so-scoped SELECT immediately above'],
    ['portal.js', 'SELECT societe, client_aliases FROM admin_admin WHERE id = ?',
        'reads the caller\'s own row, id taken from the JWT'],
    ['auth.js', 'SELECT * FROM admin_admin WHERE username = ?',
        'login: the username is the global identity, before any office is known'],
    ['auth.js', 'UPDATE admin_admin SET password = ? WHERE id = ?',
        'bcrypt upgrade of the row that just authenticated'],
    ['users.js', 'SELECT id FROM admin_admin WHERE username = ?',
        'username uniqueness is global by design, checked before insert'],
    ['users.js', 'SELECT id FROM admin_admin WHERE username = ? AND id <> ?',
        'username uniqueness is global by design, checked before update'],
    ['cnss.js', 'SELECT COALESCE(MAX(id_cn), 0) + 1 AS n FROM cnss',
        'generates the next global primary key, deliberately across all offices'],
    ['cnss.js', 'SELECT COALESCE(MAX(id_cn_oe), 0) + 1 AS n FROM cnss_oeuvre',
        'generates the next global primary key, deliberately across all offices'],
    ['cnss.js', 'FROM cnss_oeuvre o WHERE o.id_cn = ',
        'correlated subquery of an already id_so-scoped outer query'],
    ['cnss.js', 'SELECT COUNT(*) FROM cnss_oeuvre o WHERE o.id_cn = c.id_cn',
        'correlated subquery of an already id_so-scoped outer query'],
    ['cnss.js', 'INSERT INTO cnss',
        'id_so is supplied as a column value from req.user.id_so'],
    ['cnss.js', 'INSERT INTO cnss_oeuvre',
        'id_so is supplied as a column value from req.user.id_so'],
    ['attachments.js', 'UPDATE attachments SET blob_url = ? WHERE id = ?',
        'rewrites the row just inserted in this request, by its returned id'],
    ['attachments.js', 'SELECT id_so, filename, mimetype, data FROM attachments WHERE id = ?',
        'authorised by the URL signature or a bearer token matched against the row id_so it selects'],
    ['onboarding.js', 'SELECT COUNT(*)::int AS n FROM admin_admin',
        'first-run check: deliberately global, asks whether ANY office exists yet'],
];

const isAllowed = (file, sql) =>
    ALLOWED.some(([f, fragment]) => f === file && sql.replace(/\s+/g, ' ').includes(fragment.replace(/\s+/g, ' ')));

const VERBOSE = process.argv.includes('--verbose');

const findings = [];
const review = [];
const explained = [];

for (const file of fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');

    // Template literals and plain quoted strings that look like SQL.
    const literals = [
        ...[...src.matchAll(/`([^`]*)`/g)].map((m) => m[1]),
        ...[...src.matchAll(/'([^'\n]{20,})'/g)].map((m) => m[1]),
    ];

    for (const sql of literals) {
        if (!/\b(SELECT|UPDATE|DELETE|INSERT)\b/i.test(sql)) continue;
        const touches = TENANT_TABLES.find((t) => new RegExp(`\\b${t}\\b`).test(sql));
        if (!touches) continue;
        if (/id_so/i.test(sql)) continue;

        const flat = sql.replace(/\s+/g, ' ').trim();
        if (isAllowed(file, sql)) { explained.push([file, flat]); continue; }

        // A WHERE built from an interpolated fragment (`WHERE ${baseWhere}`) can carry
        // the id_so filter without it appearing in this literal. Can't decide statically.
        if (/\$\{/.test(sql)) { review.push([file, touches, flat]); continue; }

        findings.push([file, touches, flat]);
    }
}

if (explained.length) {
    console.log(`  ${explained.length} known-safe quer${explained.length === 1 ? 'y' : 'ies'} skipped (see ALLOWED in this script).`);
}

if (review.length) {
    console.log(`  ${review.length} quer${review.length === 1 ? 'y' : 'ies'} build their WHERE from an interpolated fragment — verify by hand${VERBOSE ? ':' : ' (--verbose to list).'}`);
    if (VERBOSE) {
        for (const [file, table, sql] of review) {
            console.log(`      ${file} (${table})`);
            console.log(`        ${sql.slice(0, 140)}${sql.length > 140 ? '…' : ''}`);
        }
    }
}

if (!findings.length) {
    console.log('\n✓ No unscoped tenant queries found in server/routes.\n');
    process.exit(0);
}

console.error(`\n✗ ${findings.length} quer${findings.length === 1 ? 'y' : 'ies'} touch tenant data without an id_so filter:\n`);
for (const [file, table, sql] of findings) {
    console.error(`  ${file}  (${table})`);
    console.error(`    ${sql.slice(0, 160)}${sql.length > 160 ? '…' : ''}\n`);
}
console.error('  Add an id_so filter, or add it to ALLOWED with the reason it is safe.\n');
process.exit(1);
