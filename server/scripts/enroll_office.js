/*
 * enroll_office.js — bring an office that ALREADY EXISTS on Vercel under the
 * control plane, so it can be suspended for non-payment or end of contract.
 *
 * create_office.js does this for a brand-new office. This is the retrofit: it
 * registers the office with the licence server, takes the check-in secret it
 * issues, and writes OFFICE_ID / OFFICE_SECRET / CONTROL_PLANE_URL into the
 * office's existing Vercel project.
 *
 *   node server/scripts/enroll_office.js --project office-app                  # plan
 *   node server/scripts/enroll_office.js --project office-app --apply          # do it
 *   node server/scripts/enroll_office.js --project a --project b --apply       # several
 *
 * The office's display name is read from its own live deployment
 * (/api/onboarding/status), so it matches what the office actually calls itself.
 * Pass --name to override, and rename any time in the panel.
 *
 * Credentials, never as arguments:
 *   VERCEL_TOKEN                     from server/.env
 *   CONTROL_PLANE_ADMIN_PASSWORD     optional; prompted for (without echo) if unset
 *
 * The secret is never printed and never written to disk: it goes straight from
 * the control plane's response into the Vercel environment. Lost one? Rotate it
 * from the panel — «مفتاح جديد» — rather than trying to recover it.
 *
 * Env vars only take effect on the next deployment, and the office only starts
 * checking in once the licence-gate code is on its deployed branch.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const VERCEL_API = 'https://api.vercel.com';
const DEFAULT_CONTROL_PLANE = 'https://cnss-license-server.vercel.app';

const parseArgs = (argv) => {
    const args = { project: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith('--')) continue;
        const key = a.slice(2);
        const next = argv[i + 1];
        const value = next === undefined || next.startsWith('--') ? true : (i++, next);
        if (key === 'project') args.project.push(value);
        else args[key] = value;
    }
    return args;
};

const args = parseArgs(process.argv.slice(2));
const APPLY = Boolean(args.apply);
const CONTROL_PLANE = String(args['control-plane'] || process.env.CONTROL_PLANE_URL || DEFAULT_CONTROL_PLANE).replace(/\/+$/, '');

const fail = (msg) => { console.error(`\n  ✗ ${msg}\n`); process.exit(1); };

const teamQuery = (sep = '?') =>
    (process.env.VERCEL_TEAM_ID ? `${sep}teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '');

async function vercelApi(url, { method = 'GET', body } = {}) {
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
    if (!res.ok) {
        const detail = (json && (json.error?.message || json.message)) || text.slice(0, 200);
        const e = new Error(`${method} ${url.split('?')[0]} → ${res.status}: ${detail}`);
        e.status = res.status;
        throw e;
    }
    return json;
}

/*
 * Read a password from the terminal without echoing it. Falls back to a normal
 * (visible) read when stdin is not a TTY, so the script still works when piped —
 * but prefer CONTROL_PLANE_ADMIN_PASSWORD in that case.
 */
function promptPassword(question) {
    return new Promise((resolve, reject) => {
        if (!process.stdin.isTTY) {
            const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
            return readline.question(question, (a) => { readline.close(); resolve(a.trim()); });
        }
        process.stdout.write(question);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        let buf = '';
        const onData = (ch) => {
            const s = ch.toString('utf8');
            if (s === '\r' || s === '\n' || s === '') {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                process.stdin.removeListener('data', onData);
                process.stdout.write('\n');
                return resolve(buf);
            }
            if (s === '') { // Ctrl-C
                process.stdin.setRawMode(false);
                process.stdout.write('\n');
                return reject(new Error('cancelled'));
            }
            if (s === '' || s === '\b') { buf = buf.slice(0, -1); return; }
            buf += s;
        };
        process.stdin.on('data', onData);
    });
}

/*
 * The office's public URL and the name it calls itself, both taken from the
 * office rather than guessed.
 *
 * A project has several production aliases and only some are public: the
 * team-scoped and per-branch ones sit behind Vercel's SSO, so an office handed
 * one of those would meet a Vercel login screen. Rather than pattern-match the
 * hostnames, ask each alias in turn for /api/onboarding/status — the one that
 * answers as the app is by definition the one the office can actually reach.
 */
async function describeOffice(project) {
    const p = await vercelApi(`${VERCEL_API}/v9/projects/${encodeURIComponent(project)}${teamQuery()}`);
    const prod = (p.targets && p.targets.production) || {};
    const candidates = (prod.alias || []).filter((d) => !d.includes('-git-'));
    // Shortest first: the bare production alias beats the team-scoped variants.
    candidates.sort((a, b) => a.length - b.length);
    if (!candidates.length) candidates.push(`${project}.vercel.app`);

    for (const domain of candidates) {
        const url = `https://${domain}`;
        try {
            const res = await fetch(`${url}/api/onboarding/status`, { signal: AbortSignal.timeout(12000) });
            if (!res.ok) continue;
            const j = await res.json(); // throws on the SSO login page, which is HTML
            return { url, name: String(j.officeName || '').trim(), live: true, reachable: true };
        } catch { /* protected, down, or not this app — try the next alias */ }
    }
    // Nothing answered: still worth registering (the office may simply be
    // mid-deploy), but the URL is a best guess and the name has to be typed.
    return { url: `https://${candidates[0]}`, name: '', live: false, reachable: false };
}

async function main() {
    if (!process.env.VERCEL_TOKEN) fail('VERCEL_TOKEN is not set (server/.env, or vercel.com/account/tokens).');
    if (!args.project.length) fail('--project is required, once per office (e.g. --project office-app).');

    console.log(`\n  Control plane : ${CONTROL_PLANE}`);
    console.log(`  Mode          : ${APPLY ? 'APPLY' : 'PLAN ONLY — nothing will be changed'}\n`);

    // Describe every office first, so the plan is complete before anything is
    // registered and a typo in the last project does not leave the first half done.
    const offices = [];
    for (const project of args.project) {
        let d;
        try {
            d = await describeOffice(project);
        } catch (e) {
            fail(`project "${project}": ${e.message}`);
        }
        const name = (args.name && args.project.length === 1) ? String(args.name) : (d.name || project);
        offices.push({ project, id: project, name, url: d.url, live: d.live });
        const note = d.name ? ''
            : (d.reachable ? '   (not onboarded yet — rename in the panel later)'
                           : '   (deployment did not answer — check the URL)');
        console.log(`  ── ${project}`);
        console.log(`     name : ${name}${note}`);
        console.log(`     url  : ${d.url}`);
    }

    if (!APPLY) {
        console.log('\n  Re-run with --apply to:');
        console.log('    1. register each office with the control plane (issuing a check-in secret)');
        console.log('    2. set OFFICE_ID, OFFICE_SECRET and CONTROL_PLANE_URL on its Vercel project (production)');
        console.log('\n  The office starts checking in on its next deployment, once the licence-gate');
        console.log('  code is on the branch it deploys from.\n');
        return;
    }

    const password = process.env.CONTROL_PLANE_ADMIN_PASSWORD
        || await promptPassword('  Control-plane admin password: ');
    if (!password) fail('no password given.');

    const loginRes = await fetch(`${CONTROL_PLANE}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    if (!loginRes.ok) fail('admin login failed — wrong password?');
    const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
    if (!cookie) fail('admin login returned no session cookie.');
    console.log('\n  ✓ signed in to the control plane\n');

    const listed = await fetch(`${CONTROL_PLANE}/api/admin/offices`, { headers: { cookie } }).then((r) => r.json());
    const known = new Set((listed.offices || []).map((o) => o.id));

    for (const o of offices) {
        console.log(`  ── ${o.name}  (${o.project})`);
        if (known.has(o.id)) { console.log('     already registered — skipping\n'); continue; }

        const res = await fetch(`${CONTROL_PLANE}/api/admin/offices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', cookie },
            body: JSON.stringify({ id: o.id, name: o.name, url: o.url }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { console.error(`     ✗ register failed: ${body.error || res.status}\n`); continue; }
        console.log('     ✓ registered');

        const vars = [
            { key: 'CONTROL_PLANE_URL', value: CONTROL_PLANE, type: 'plain' },
            { key: 'OFFICE_ID', value: o.id, type: 'plain' },
            { key: 'OFFICE_SECRET', value: body.secret, type: 'encrypted' },
        ];
        for (const v of vars) {
            try {
                // Production only: preview builds of the shared repo must not
                // report themselves as this office.
                await vercelApi(`${VERCEL_API}/v10/projects/${encodeURIComponent(o.project)}/env${teamQuery()}`, {
                    method: 'POST',
                    body: { key: v.key, value: v.value, type: v.type, target: ['production'] },
                });
                console.log(`     ✓ ${v.key}`);
            } catch (e) {
                if (e.status === 400 && /already exists/i.test(e.message)) {
                    console.log(`     ! ${v.key} already set — left alone (rotate from the panel if it is stale)`);
                } else {
                    console.error(`     ✗ ${v.key}: ${e.message}`);
                    console.error('       the office is registered but not wired up; fix the variable and redeploy.');
                }
            }
        }
        console.log('');
    }

    const after = await fetch(`${CONTROL_PLANE}/api/admin/offices`, { headers: { cookie } }).then((r) => r.json());
    console.log('  Registry now holds:');
    for (const o of after.offices || []) console.log(`    ${String(o.id).padEnd(24)} ${String(o.status).padEnd(11)} ${o.name}`);

    console.log('\n  Next: redeploy each office (or merge the licence-gate branch, which deploys');
    console.log('  them all), then confirm «آخر اتصال» appears on its card in the panel.\n');
}

main().catch((e) => fail(e.message));
