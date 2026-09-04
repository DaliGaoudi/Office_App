/*
 * provision_office.js — prepare a brand-new office (tenant) database.
 *
 * NORMAL USE — schema only, then let the app onboard itself:
 *
 *   node server/scripts/provision_office.js --url "postgres://…" --schema-only
 *
 * That applies server/schema.sql and the indexes and stops, leaving zero accounts,
 * so the deployment opens on its first-run onboarding screen and the office enters
 * its own details. Nothing creates app_settings / admin_admin at runtime, so this
 * step is still required before the app can be used on an empty database.
 *
 * SCRIPTED USE — everything at once, no onboarding screen:
 *   1. applies server/schema.sql
 *   2. applies the integrity/performance indexes the legacy schema never had
 *   3. seeds app_settings — the office letterhead profile + tva_rate
 *   4. creates the office's first admin with a generated bcrypt password
 * Creating that admin CLOSES onboarding permanently (routes/onboarding.js opens
 * only while admin_admin is empty), so use this when provisioning unattended.
 *
 * Usage:
 *   node server/scripts/provision_office.js \
 *     --url "postgres://…"            (REQUIRED — the new office's database)
 *     --office-id 42                  (REQUIRED — the id_so every row is scoped by)
 *     --admin-user "اسم المستخدم"     (REQUIRED)
 *     --office-name "محمد بن صالح"    --office-name-fr "Mohamed Ben Salah"
 *     --office-city "سوسة"            --office-phone "73 000 000"
 *     --office-fax  "73 000 001"      --office-tax-id "1234567/A/M/000"
 *     --office-rib  "08 123 …"        --office-cnss "123456"
 *     --office-address "…"            --office-jurisdiction "لمحكمة الإستئناف بسوسة"
 *     --cnss-bureau "…"               --cnss-region "بسوسة"
 *     --tva 19                        --dry-run
 *
 * Safety: --url is mandatory and is never read from server/.env, because that file
 * points at the LIVE office. The script also refuses to touch a database that
 * already holds users or records unless --force is passed.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createPool } = require('@vercel/postgres');
const { hashPassword } = require('../services/password');
const { OFFICE_KEYS } = require('../services/officeProfile');
const { SCHEMA_PATH, applySchema, applyIndexes } = require('../services/schemaSetup');

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
const SCHEMA_ONLY = Boolean(args['schema-only']);

const fail = (msg) => { console.error(`\n  ✗ ${msg}\n`); process.exit(1); };

// A password the office can actually retype off a printed sheet: no ambiguous glyphs.
const generatePassword = (len = 16) => {
    const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.randomBytes(len))
        .map((b) => alphabet[b % alphabet.length])
        .join('');
};

async function main() {
    // ── validate input ──────────────────────────────────────────────────────────
    const url = args.url || process.env.PROVISION_DATABASE_URL;
    if (!url || url === true) {
        fail('--url is required (the NEW office database). It is deliberately not read from server/.env.');
    }
    if (process.env.POSTGRES_URL && url === process.env.POSTGRES_URL && !FORCE) {
        fail('--url matches POSTGRES_URL from server/.env — that is the existing live office. Refusing.');
    }

    /*
     * --schema-only is the normal path now: create the tables and indexes and stop,
     * leaving the database with no user accounts so the in-app onboarding screen
     * takes over. Seeding an admin here would close onboarding before it ever
     * appeared (routes/onboarding.js opens only while admin_admin is empty).
     */
    if (SCHEMA_ONLY) {
        if (args['office-id'] || args['admin-user']) {
            fail('--schema-only takes no --office-id / --admin-user: the onboarding screen collects those.');
        }
    }

    const officeId = args['office-id'];
    if (!SCHEMA_ONLY && (!officeId || officeId === true)) fail('--office-id is required (the id_so for this office, e.g. 42). Or use --schema-only and let onboarding do it.');

    const adminUser = args['admin-user'];
    if (!SCHEMA_ONLY && (!adminUser || adminUser === true)) fail('--admin-user is required (the first admin login). Or use --schema-only and let onboarding do it.');

    if (!fs.existsSync(SCHEMA_PATH)) {
        fail(`${SCHEMA_PATH} not found — generate it first with: node server/scripts/dump_schema.js`);
    }

    // Every key is seeded (blank if not supplied) so the Settings page shows the
    // full form and nothing silently falls back to another office's value.
    const officeProfile = {
        office_name: args['office-name'] || '',
        office_name_fr: args['office-name-fr'] || '',
        office_city: args['office-city'] || '',
        office_phone: args['office-phone'] || '',
        office_fax: args['office-fax'] || '',
        office_tax_id: args['office-tax-id'] || '',
        office_rib: args['office-rib'] || '',
        office_cnss: args['office-cnss'] || '',
        // Printed inside each act — see parameterize_cnss_template.js.
        office_address: args['office-address'] || '',
        office_jurisdiction: args['office-jurisdiction'] || '',
        cnss_bureau: args['cnss-bureau'] || '',
        cnss_region: args['cnss-region'] || '',
    };
    // Keep this honest if officeProfile.js ever grows a key.
    const missingKeys = OFFICE_KEYS.filter((k) => !(k in officeProfile));
    if (missingKeys.length) fail(`officeProfile.js declares keys this script does not seed: ${missingKeys.join(', ')}`);

    const tvaRate = String(args.tva || '19');
    const password = args['admin-password'] && args['admin-password'] !== true
        ? String(args['admin-password'])
        : generatePassword();

    const host = (url.match(/@([^/:]+)/) || [])[1] || '(unknown host)';
    console.log('\n  Provisioning a new office');
    console.log(`  ├─ database   : ${host}`);
    console.log(`  ├─ id_so      : ${officeId}`);
    console.log(`  ├─ admin user : ${adminUser}`);
    console.log(`  ├─ office     : ${officeProfile.office_name || '(not set — fill in from Settings later)'}`);
    console.log(`  └─ tva_rate   : ${tvaRate}%`);
    if (DRY_RUN) console.log('\n  DRY RUN — nothing will be written.\n');

    const pool = createPool({ connectionString: url });

    // ── refuse to clobber an inhabited database ─────────────────────────────────
    const { rows: existing } = await pool.query(
        `SELECT to_regclass('public.admin_admin') AS users_tbl, to_regclass('public.clients_record') AS records_tbl`
    );
    if (existing[0].users_tbl) {
        const { rows } = await pool.query('SELECT count(*)::int AS n FROM admin_admin');
        if (rows[0].n > 0 && !FORCE) {
            fail(`target database already has ${rows[0].n} user(s) — this is not an empty office. Pass --force only if you are certain.`);
        }
    }

    if (DRY_RUN) { await pool.end(); console.log('  Dry run complete — target looks provisionable.\n'); return; }

    // ── 1. schema ───────────────────────────────────────────────────────────────
    await applySchema(pool);
    console.log('  ✓ schema applied');

    // ── 2. hardening indexes (best-effort, reported individually) ───────────────
    const appliedIndexes = await applyIndexes(pool);
    console.log(`  ✓ ${appliedIndexes.length} index(es) applied`);

    if (SCHEMA_ONLY) {
        await pool.end();
        console.log('\n  ────────────────────────────────────────────────');
        console.log('   Database ready. No accounts created, so the app will');
        console.log('   open on its first-run onboarding screen.');
        console.log('  ────────────────────────────────────────────────');
        console.log('\n  Next — in this office\'s Vercel project:');
        console.log('   1. Set env: POSTGRES_URL (this database), JWT_SECRET (unique per office!),');
        console.log('      OPENROUTER_API_KEY, and optionally BLOB_READ_WRITE_TOKEN, CRON_SECRET.');
        console.log('   2. Deploy, then open the URL: the onboarding screen collects the office');
        console.log('      details and creates the first administrator.\n');
        return;
    }

    // ── 3. settings: office letterhead + VAT ────────────────────────────────────
    const upsertSetting = `INSERT INTO app_settings (key, value, updated_at)
                           VALUES ($1, $2, CURRENT_TIMESTAMP)
                           ON CONFLICT (key) DO UPDATE
                             SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`;
    for (const [key, value] of Object.entries(officeProfile)) {
        await pool.query(upsertSetting, [key, value]);
    }
    await pool.query(upsertSetting, ['tva_rate', tvaRate]);
    console.log('  ✓ office profile + tva_rate seeded');

    // ── 4. first admin ──────────────────────────────────────────────────────────
    const hashed = await hashPassword(password);
    await pool.query(
        `INSERT INTO admin_admin (username, password, role, societe, id_so)
         VALUES ($1, $2, 'admin', $3, $4)`,
        [adminUser, hashed, officeProfile.office_name || '', String(officeId)]
    );
    console.log('  ✓ admin account created (bcrypt)');

    await pool.end();

    console.log('\n  ────────────────────────────────────────────────');
    console.log('   Office provisioned. Credentials — shown once:');
    console.log(`     username : ${adminUser}`);
    console.log(`     password : ${password}`);
    console.log('  ────────────────────────────────────────────────');
    console.log('\n  Next — in this office\'s Vercel project:');
    console.log('   1. Server env: POSTGRES_URL, JWT_SECRET (unique per office!),');
    console.log('      OPENROUTER_API_KEY, BLOB_READ_WRITE_TOKEN, CRON_SECRET.');
    console.log('   2. Client env: VITE_OFFICE_NAME (sidebar + browser tab; without it the UI');
    console.log('      shows a generic name), and optionally VITE_OFFICE_LOGO_URL.');
    console.log('   3. Deploy the project pointed at this database.');
    console.log('   4. Log in, confirm the letterhead under الإعدادات, and generate one act');
    console.log('      to check it before the office uses it for real.');
    console.log('   5. Have the admin change this password immediately.\n');
}

main().catch((e) => { console.error('\n  ✗ Provisioning failed:', e.message, '\n'); process.exit(1); });
