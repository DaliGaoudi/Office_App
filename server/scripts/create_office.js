/*
 * create_office.js — stand up a whole new office: Vercel project linked to this
 * repo, a Neon database from the Vercel Marketplace, environment variables, a
 * production deployment, and the schema.
 *
 * Everything up to the point where a human opens the URL and fills in the
 * onboarding form. It deliberately creates NO accounts — that is the onboarding
 * screen's job, and seeding an admin here would close onboarding before it ever
 * appeared.
 *
 *   node server/scripts/create_office.js --name "ala-gaoudi"          # plan only
 *   node server/scripts/create_office.js --name "ala-gaoudi" --create # do it
 *
 * The database is provisioned through `vercel integration add neon` rather than
 * Neon's own API: once a Neon organization is created through Vercel it is
 * "managed by Vercel" and its API refuses direct project creation. Going through
 * the Marketplace also keeps billing in one place.
 *
 * Credentials, from the environment (never arguments — arguments end up in shell
 * history and process listings):
 *   VERCEL_TOKEN        vercel.com/account/tokens
 *   VERCEL_TEAM_ID      optional; required if the projects live under a team
 *   OPENROUTER_API_KEY  optional; copied to the new project so CNSS scanning works
 *
 * Requires the Vercel CLI on PATH.
 *
 * IT SPENDS MONEY. A run creates a real Vercel project and a real Neon database,
 * so it prints the plan and exits unless --create is passed. If a later step
 * fails, everything created so far is listed with how to remove it — an
 * interrupted run leaves things behind, and they cost.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createPool } = require('@vercel/postgres');
const { applySchema, applyIndexes, readSchema } = require('../services/schemaSetup');

const VERCEL_API = 'https://api.vercel.com';

// The repository every office deploys from.
const GIT_REPO = 'DaliGaoudi/Office_App';
const GIT_BRANCH = 'main';

// No CLI step should ever sit waiting for input; cap them so a hung command
// fails the run instead of blocking it forever.
const CLI_TIMEOUT_MS = 4 * 60 * 1000;

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
const CREATE = Boolean(args.create);

const fail = (msg) => { console.error(`\n  ✗ ${msg}\n`); process.exit(1); };

// Everything this run has brought into existence, so a failure can say what to
// clean up rather than leaving paid resources orphaned and unnamed.
const created = [];

const api = async (url, { token, method = 'GET', body } = {}) => {
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
    if (!res.ok) {
        const detail = (json && (json.error?.message || json.message || json.error)) || text.slice(0, 300);
        const err = new Error(`${method} ${url.replace(/\?.*/, '')} → ${res.status}: ${detail}`);
        err.status = res.status;
        throw err;
    }
    return json;
};

const teamQuery = () => (process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '');

/*
 * Locate the Vercel CLI's JavaScript entrypoint so it can be run as
 * `node <entry>` with no shell.
 *
 * On Windows the installed binary is a .cmd, which Node refuses to spawn without
 * shell: true — and a shell concatenates arguments without escaping them, which
 * is a poor thing to do with an access token on the command line. Calling the JS
 * directly sidesteps both.
 */
const findVercelEntry = () => {
    // Set VERCEL_CLI_ENTRY if the CLI lives somewhere unusual.
    if (process.env.VERCEL_CLI_ENTRY && fs.existsSync(process.env.VERCEL_CLI_ENTRY)) return process.env.VERCEL_CLI_ENTRY;

    const roots = [
        process.env.npm_config_prefix && path.join(process.env.npm_config_prefix, 'node_modules'),
        process.env.npm_config_prefix && path.join(process.env.npm_config_prefix, 'lib', 'node_modules'),
        process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules'),
        '/usr/local/lib/node_modules',
        '/usr/lib/node_modules',
        process.env.HOME && path.join(process.env.HOME, '.npm-global', 'lib', 'node_modules'),
    ];

    for (const root of roots) {
        if (!root) continue;
        const entry = path.join(root, 'vercel', 'dist', 'index.js');
        if (fs.existsSync(entry)) return entry;
    }
    return null;
};

/*
 * Run the Vercel CLI. --non-interactive keeps it from prompting; the token has to
 * be an argument because that is the only way the CLI accepts it, so it is kept
 * out of the command line echoed below.
 */
const vercel = (argv, { cwd, token, label, entry }) => {
    const full = [entry, ...argv, '--non-interactive', '--token', token];
    if (process.env.VERCEL_TEAM_ID && !argv.includes('--team')) full.push('--team', process.env.VERCEL_TEAM_ID);

    console.log(`    $ vercel ${argv.join(' ')}`);
    const r = spawnSync(process.execPath, full, { cwd, encoding: 'utf8', timeout: CLI_TIMEOUT_MS });

    if (r.error && r.error.code === 'ETIMEDOUT') throw new Error(`${label}: vercel CLI timed out after ${CLI_TIMEOUT_MS / 1000}s`);
    if (r.error) throw new Error(`${label}: ${r.error.message}`);
    if (r.status !== 0) {
        const out = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-8).join('\n      ');
        throw new Error(`${label}: vercel exited ${r.status}\n      ${out}`);
    }
    return (r.stdout || '') + (r.stderr || '');
};

// Vercel project names: lowercase letters, digits, '.', '_', '-', max 100.
const isValidProjectName = (n) => /^[a-z0-9._-]{1,100}$/.test(n);

const generateSecret = () => crypto.randomBytes(48).toString('base64url');

// Pull the production env into a scratch file and read one variable out of it.
const readEnvVar = (dir, token, names, entry) => {
    const file = path.join(dir, '.env.production.local');
    if (fs.existsSync(file)) fs.unlinkSync(file);
    vercel(['env', 'pull', '.env.production.local', '--environment', 'production'], { cwd: dir, token, label: 'env pull', entry });
    if (!fs.existsSync(file)) throw new Error('env pull produced no file');

    const parsed = {};
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
        if (m) parsed[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    for (const n of names) if (parsed[n]) return { name: n, value: parsed[n] };
    return { name: null, value: null, available: Object.keys(parsed) };
};

async function main() {
    const name = args.name;
    if (!name || name === true) fail('--name is required (used for the Vercel project and the Neon resource, e.g. "ben-salah-sfax").');
    if (!isValidProjectName(name)) {
        fail(`--name "${name}" is not a valid Vercel project name: lowercase letters, digits, dots, underscores and hyphens only.`);
    }

    const token = process.env.VERCEL_TOKEN;
    if (!token) fail('VERCEL_TOKEN is not set (vercel.com/account/tokens).');

    const entry = findVercelEntry();
    if (!entry) fail('the Vercel CLI was not found — install it with: npm i -g vercel');
    const probe = spawnSync(process.execPath, [entry, '--version'], { encoding: 'utf8', timeout: 60000 });
    if (probe.status !== 0) fail(`found the Vercel CLI at ${entry} but could not run it.`);

    readSchema(); // fail early if schema.sql is missing, before creating anything

    console.log('\n  New office');
    console.log(`  ├─ name        : ${name}`);
    console.log(`  ├─ Vercel repo : ${GIT_REPO} (${GIT_BRANCH})`);
    console.log(`  ├─ Vercel team : ${process.env.VERCEL_TEAM_ID || '(personal account)'}`);
    console.log(`  ├─ Vercel CLI  : ${(probe.stdout || '').trim().split('\n')[0]}`);
    console.log(`  └─ AI key      : ${process.env.OPENROUTER_API_KEY ? 'copied from this environment' : 'NOT SET — CNSS scanning will not work'}`);

    // ── refuse to collide with an existing Vercel project ───────────────────────
    try {
        await api(`${VERCEL_API}/v9/projects/${encodeURIComponent(name)}${teamQuery()}`, { token });
        fail(`a Vercel project named "${name}" already exists. Pick another --name.`);
    } catch (e) {
        if (e.status !== 404) throw e; // 404 is what we want
    }

    if (!CREATE) {
        console.log('\n  PLAN ONLY — nothing created. Re-run with --create to actually provision:');
        console.log('    1. Vercel project linked to the repo, with JWT_SECRET and OPENROUTER_API_KEY');
        console.log('    2. Neon database via `vercel integration add neon`, connected to the project');
        console.log('    3. schema.sql + indexes applied, no accounts created');
        console.log('    4. Production deployment from the linked branch');
        console.log('\n  Then open the deployment URL and complete the onboarding form.\n');
        return;
    }

    // ── 1. Vercel project ───────────────────────────────────────────────────────
    // POSTGRES_URL is NOT set here: the Neon integration injects DATABASE_URL when
    // it connects, and server/db.js accepts either.
    console.log('\n  Creating Vercel project…');
    const envVars = [
        // Unique per office: a shared secret would let one office's token be
        // replayed against another, and attachment link signatures use it too.
        { key: 'JWT_SECRET', value: generateSecret(), type: 'encrypted', target: ['production', 'preview', 'development'] },
    ];
    if (process.env.OPENROUTER_API_KEY) {
        envVars.push({ key: 'OPENROUTER_API_KEY', value: process.env.OPENROUTER_API_KEY, type: 'encrypted', target: ['production', 'preview', 'development'] });
    }

    const project = await api(`${VERCEL_API}/v11/projects${teamQuery()}`, {
        token,
        method: 'POST',
        body: { name, gitRepository: { type: 'github', repo: GIT_REPO }, environmentVariables: envVars },
    });
    created.push({ what: 'Vercel project', id: project.id, how: `vercel project rm ${name}` });
    console.log(`  ✓ Vercel project ${project.id}`);

    // ── 2. Neon database, via the Marketplace ───────────────────────────────────
    // The CLI acts on the *linked* project, so link inside a scratch directory —
    // linking in the repo would leave a .vercel/ pointing at the wrong office.
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), `office-${name}-`));
    let connectionString;
    try {
        console.log('  Linking scratch directory to the project…');
        vercel(['link', '--yes', '--project', name], { cwd: workdir, token, label: 'link', entry });

        console.log('  Provisioning Neon database…');
        vercel(['integration', 'add', 'neon', '--name', name, '--no-env-pull'], { cwd: workdir, token, label: 'integration add neon', entry });
        created.push({ what: 'Neon resource', id: name, how: `vercel integration resource rm ${name} --disconnect-all --yes` });
        console.log('  ✓ Neon database provisioned and connected');

        console.log('  Reading the connection string back…');
        const found = readEnvVar(workdir, token, ['POSTGRES_URL', 'DATABASE_URL', 'POSTGRES_PRISMA_URL'], entry);
        if (!found.value) {
            throw new Error(`no Postgres URL among the project's env vars (saw: ${(found.available || []).join(', ') || 'none'})`);
        }
        connectionString = found.value;
        console.log(`  ✓ using ${found.name}`);
    } finally {
        // The scratch dir holds a pulled .env with live credentials — always remove it.
        try { fs.rmSync(workdir, { recursive: true, force: true }); } catch { /* best effort */ }
    }

    // ── 3. Schema ───────────────────────────────────────────────────────────────
    // No accounts are created, so the app opens on its onboarding screen.
    console.log('  Applying schema…');
    const pool = createPool({ connectionString });
    await applySchema(pool);
    const indexes = await applyIndexes(pool);
    await pool.end();
    console.log(`  ✓ schema + ${indexes.length} index(es) applied, no accounts created`);

    // ── 4. Deployment ───────────────────────────────────────────────────────────
    // Creating a project does not deploy it; gitSource needs the numeric repo id,
    // which comes back on the project's git link. Deploy last, so the first boot
    // meets a database that is already migrated.
    const repoId = project.link?.repoId;
    if (!repoId) {
        console.warn('  ! Vercel did not report a repoId — skipping the automatic deployment.');
        console.warn('    Deploy from the dashboard, or push a commit.');
    } else {
        console.log('  Triggering production deployment…');
        const deployment = await api(`${VERCEL_API}/v13/deployments${teamQuery()}`, {
            token,
            method: 'POST',
            body: { name, project: project.id, target: 'production', gitSource: { type: 'github', ref: GIT_BRANCH, repoId } },
        });
        // Report the production alias, not deployment.url. Vercel's default
        // ssoProtection ("all_except_custom_domains") makes the deployment-specific
        // URL demand a Vercel login, which the office does not have; the
        // <project>.vercel.app alias is the one that serves the app publicly.
        console.log(`  ✓ deployment ${deployment.id} queued`);
        console.log(`    office URL : https://${name}.vercel.app`);
        console.log(`    build log  : https://${deployment.url} (Vercel login required)`);
    }

    console.log('\n  ────────────────────────────────────────────────');
    console.log('   Office provisioned.');
    console.log('  ────────────────────────────────────────────────');
    console.log('\n  Next:');
    console.log('   1. Wait for the build to finish in the Vercel dashboard.');
    console.log('   2. Open the project URL — it will show the onboarding screen.');
    console.log('   3. Fill in the office details and create the administrator.');
    console.log('   4. Generate one act and check the letterhead before the office uses it.\n');
}

main().catch((e) => {
    console.error(`\n  ✗ ${e.message}`);
    if (created.length) {
        console.error('\n  Created before failing — these still exist and may cost money:');
        for (const c of created) console.error(`    ${c.what} ${c.id || ''}\n      remove: ${c.how}`);
    }
    console.error('');
    process.exit(1);
});
