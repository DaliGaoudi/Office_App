/*
 * create_office.js — stand up a whole new office: Neon database, Vercel project
 * linked to this repo, environment variables, first deployment, schema.
 *
 * Everything up to the point where a human opens the URL and fills in the
 * onboarding form. It does NOT create the office's account or letterhead — that is
 * the onboarding screen's job, and doing it here would close onboarding before it
 * ever appeared.
 *
 *   node server/scripts/create_office.js --name "ben-salah-sfax"          # plan only
 *   node server/scripts/create_office.js --name "ben-salah-sfax" --create # do it
 *
 * Credentials, from the environment (never arguments — arguments end up in shell
 * history and process listings):
 *   NEON_API_KEY        console.neon.tech → Account settings → API keys
 *   VERCEL_TOKEN        vercel.com/account/tokens
 *   VERCEL_TEAM_ID      optional; required if the projects live under a team
 *   OPENROUTER_API_KEY  optional; copied to the new project so CNSS scanning works
 *
 * IT SPENDS MONEY. A run creates a real Neon project and a real Vercel project, so
 * it prints the plan and exits unless --create is passed. If a later step fails,
 * every resource created so far is listed with what to delete — an interrupted run
 * leaves things behind, and they cost.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const { createPool } = require('@vercel/postgres');
const { applySchema, applyIndexes, readSchema } = require('../services/schemaSetup');

const NEON_API = 'https://console.neon.tech/api/v2';
const VERCEL_API = 'https://api.vercel.com';

// The repository every office deploys from.
const GIT_REPO = 'DaliGaoudi/Office_App';
const GIT_BRANCH = 'main';

// Match the existing office's region so latency and data residency are consistent.
const DEFAULT_REGION = 'aws-eu-central-1';

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

// Vercel project names: lowercase letters, digits, '.', '_', '-', max 100.
const isValidProjectName = (n) => /^[a-z0-9._-]{1,100}$/.test(n);

const generateSecret = () => crypto.randomBytes(48).toString('base64url');

async function main() {
    const name = args.name;
    if (!name || name === true) fail('--name is required (used for both the Neon and Vercel project, e.g. "ben-salah-sfax").');
    if (!isValidProjectName(name)) {
        fail(`--name "${name}" is not a valid Vercel project name: lowercase letters, digits, dots, underscores and hyphens only.`);
    }

    const neonKey = process.env.NEON_API_KEY;
    const vercelToken = process.env.VERCEL_TOKEN;
    if (!neonKey) fail('NEON_API_KEY is not set (console.neon.tech → Account settings → API keys).');
    if (!vercelToken) fail('VERCEL_TOKEN is not set (vercel.com/account/tokens).');

    const region = args.region && args.region !== true ? String(args.region) : DEFAULT_REGION;
    readSchema(); // fail early if schema.sql is missing, before creating anything

    console.log('\n  New office');
    console.log(`  ├─ name         : ${name}`);
    console.log(`  ├─ Neon region  : ${region}`);
    console.log(`  ├─ Vercel repo  : ${GIT_REPO} (${GIT_BRANCH})`);
    console.log(`  ├─ Vercel team  : ${process.env.VERCEL_TEAM_ID || '(personal account)'}`);
    console.log(`  └─ AI key       : ${process.env.OPENROUTER_API_KEY ? 'copied from this environment' : 'NOT SET — CNSS scanning will not work'}`);

    // ── refuse to collide with an existing Vercel project ───────────────────────
    try {
        await api(`${VERCEL_API}/v9/projects/${encodeURIComponent(name)}${teamQuery()}`, { token: vercelToken });
        fail(`a Vercel project named "${name}" already exists. Pick another --name.`);
    } catch (e) {
        if (e.status !== 404) throw e; // 404 is what we want
    }

    if (!CREATE) {
        console.log('\n  PLAN ONLY — nothing created. Re-run with --create to actually provision:');
        console.log('    1. Neon project + Postgres database');
        console.log('    2. Vercel project linked to the repo, with POSTGRES_URL, JWT_SECRET, OPENROUTER_API_KEY');
        console.log('    3. Production deployment from the linked branch');
        console.log('    4. schema.sql + indexes applied, no accounts created');
        console.log('\n  Then open the deployment URL and complete the onboarding form.\n');
        return;
    }

    // ── 1. Neon ─────────────────────────────────────────────────────────────────
    console.log('\n  Creating Neon project…');
    const neon = await api(`${NEON_API}/projects`, {
        token: neonKey,
        method: 'POST',
        body: { project: { name, region_id: region } },
    });
    const neonProjectId = neon.project?.id;
    created.push({ what: 'Neon project', id: neonProjectId, how: `DELETE ${NEON_API}/projects/${neonProjectId}` });

    // Prefer the pooled URI: serverless functions open many short-lived connections.
    const uris = neon.connection_uris || [];
    const pooled = uris.find((u) => u.connection_uri && u.connection_uri.includes('-pooler'));
    const connectionString = (pooled || uris[0])?.connection_uri;
    if (!connectionString) fail('Neon did not return a connection URI — delete the project it just created and retry.');
    console.log(`  ✓ Neon project ${neonProjectId} (${pooled ? 'pooled' : 'DIRECT — no pooled URI returned'})`);

    // ── 2. Vercel project ───────────────────────────────────────────────────────
    console.log('  Creating Vercel project…');
    const envVars = [
        { key: 'POSTGRES_URL', value: connectionString, type: 'encrypted', target: ['production', 'preview', 'development'] },
        // Unique per office: a shared secret would let one office's token be
        // replayed against another, and attachment link signatures use it too.
        { key: 'JWT_SECRET', value: generateSecret(), type: 'encrypted', target: ['production', 'preview', 'development'] },
    ];
    if (process.env.OPENROUTER_API_KEY) {
        envVars.push({ key: 'OPENROUTER_API_KEY', value: process.env.OPENROUTER_API_KEY, type: 'encrypted', target: ['production', 'preview', 'development'] });
    }

    const project = await api(`${VERCEL_API}/v11/projects${teamQuery()}`, {
        token: vercelToken,
        method: 'POST',
        body: {
            name,
            gitRepository: { type: 'github', repo: GIT_REPO },
            environmentVariables: envVars,
        },
    });
    created.push({ what: 'Vercel project', id: project.id, how: `delete "${name}" in the Vercel dashboard` });
    console.log(`  ✓ Vercel project ${project.id}`);

    // ── 3. Deployment ───────────────────────────────────────────────────────────
    // Creating a project does not deploy it; gitSource needs the numeric repo id,
    // which comes back on the project's git link.
    const repoId = project.link?.repoId;
    if (!repoId) {
        console.warn('  ! Vercel did not report a repoId — skipping the automatic deployment.');
        console.warn('    Deploy from the dashboard, or push a commit.');
    } else {
        console.log('  Triggering production deployment…');
        const deployment = await api(`${VERCEL_API}/v13/deployments${teamQuery()}`, {
            token: vercelToken,
            method: 'POST',
            body: {
                name,
                project: project.id,
                target: 'production',
                gitSource: { type: 'github', ref: GIT_BRANCH, repoId },
            },
        });
        console.log(`  ✓ deployment ${deployment.id} queued → https://${deployment.url}`);
    }

    // ── 4. Schema ───────────────────────────────────────────────────────────────
    // No accounts are created, so the app opens on its onboarding screen.
    console.log('  Applying schema…');
    const pool = createPool({ connectionString });
    await applySchema(pool);
    const indexes = await applyIndexes(pool);
    await pool.end();
    console.log(`  ✓ schema + ${indexes.length} index(es) applied, no accounts created`);

    console.log('\n  ────────────────────────────────────────────────');
    console.log('   Office provisioned.');
    console.log('  ────────────────────────────────────────────────');
    console.log('\n  Next:');
    console.log('   1. Wait for the build to finish in the Vercel dashboard.');
    console.log('   2. Open the project URL — it will show the onboarding screen.');
    console.log('   3. Fill in the office details and create the administrator.');
    console.log('   4. Generate one act and check the letterhead before the office uses it.\n');
    console.log('  The database connection string is stored only in the Vercel project.');
    console.log('  Read it back with: vercel env pull, or from the dashboard.\n');
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
