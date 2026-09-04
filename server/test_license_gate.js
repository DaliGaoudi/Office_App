/*
 * Run: node server/test_license_gate.js  (no database, no network beyond localhost)
 *
 * End-to-end check of the office-side licence gate against a stub control plane.
 * Stubs server/db.js so nothing touches a real database.
 */
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = __dirname;
const dbPath = require.resolve(path.join(ROOT, 'db.js'));

// In-memory stand-in for app_settings + the health counts.
const settings = new Map();
require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
        get: async (sql, params) => {
            if (/app_settings/.test(sql)) {
                const v = settings.get(params[0]);
                return v ? { value: v } : undefined;
            }
            return { records: 42, cnss: 7, users: 3 };
        },
        run: async (sql, params) => { settings.set(params[0], params[1]); return {}; },
        all: async () => [],
    },
};

// ── stub control plane ────────────────────────────────────────────────────────
let verdict = { status: 'active' };
let checkins = 0;
let lastBody = null;
let down = false;

const stub = http.createServer((req, res) => {
    if (down) { req.socket.destroy(); return; }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
        checkins++;
        lastBody = JSON.parse(body || '{}');
        if ((req.headers.authorization || '') !== 'Bearer s3cret') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'unknown_office' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: verdict.status,
            message: verdict.message || null,
            providerContact: '+216 00 000 000',
            recheckInSeconds: 900,
        }));
    });
});

const run = async () => {
    await new Promise((r) => stub.listen(0, r));
    const port = stub.address().port;

    process.env.CONTROL_PLANE_URL = `http://127.0.0.1:${port}`;
    process.env.OFFICE_ID = 'test-office';
    process.env.OFFICE_SECRET = 's3cret';

    const license = require(path.join(ROOT, 'services', 'license.js'));
    const gate = require(path.join(ROOT, 'middleware', 'license.js'));

    // Drive the middleware directly with a minimal req/res pair.
    const call = (p, method = 'GET') => new Promise((resolve) => {
        const res = {
            statusCode: 200,
            status(c) { this.statusCode = c; return this; },
            json(b) { resolve({ status: this.statusCode, body: b, blocked: true }); },
        };
        gate({ path: p, method }, res, () => resolve({ status: 200, blocked: false }));
    });

    let r;

    // 1. active → everything through
    r = await call('/api/registre', 'POST');
    assert.strictEqual(r.blocked, false, 'active office must not be blocked');
    assert.strictEqual(checkins, 1, 'one check-in');
    assert.deepStrictEqual(lastBody.health, { records: 42, cnss: 7, users: 3 }, 'health reported');
    assert.strictEqual(lastBody.officeId, 'test-office');
    console.log('✓ active office passes, health reported');

    // 2. suspend → blocked with the provider's message
    verdict = { status: 'suspended', message: 'لم يتم خلاص المستحقات.' };
    license.invalidate();
    settings.clear();
    r = await call('/api/registre', 'POST');
    assert.strictEqual(r.blocked, true, 'suspended office must be blocked');
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.body.code, 'office_suspended');
    assert.strictEqual(r.body.error, 'لم يتم خلاص المستحقات.');
    console.log('✓ suspended office blocked with the provider message');

    // 3. reads are blocked too, but the allowlist is not
    assert.strictEqual((await call('/api/cnss')).blocked, true, 'GETs are blocked as well');
    for (const p of ['/api/health', '/api/license/status', '/api/auth/login', '/api/export/data', '/api/backup', '/api/onboarding/status']) {
        assert.strictEqual((await call(p)).blocked, false, `${p} must stay reachable`);
    }
    console.log('✓ login, status, export, backup and onboarding stay reachable while suspended');

    // 4. control plane unreachable, cached verdict STALE → the suspension holds.
    // Ageing the persisted verdict is what forces the refresh to be attempted;
    // without it the cache answers and the outage path is never reached.
    down = true;
    license.invalidate();
    const stale = JSON.parse(settings.get('license_state'));
    stale.checkedAt = Date.now() - 24 * 3600 * 1000;
    settings.set('license_state', JSON.stringify(stale));
    r = await call('/api/registre', 'POST');
    assert.strictEqual(r.blocked, true, 'an outage must not un-suspend an office');
    console.log('✓ an outage does not un-suspend a suspended office');

    // 5. …and an office with no cached verdict fails OPEN
    down = true;
    license.invalidate();
    settings.clear();
    r = await call('/api/registre', 'POST');
    assert.strictEqual(r.blocked, false, 'with no verdict at all, fail open');
    console.log('✓ with no known verdict and no control plane, the office keeps working');

    // 6. wrong secret → treated as unmanaged, office keeps working
    down = false;
    process.env.OFFICE_SECRET = 'wrong';
    license.invalidate();
    settings.clear();
    r = await call('/api/registre', 'POST');
    assert.strictEqual(r.blocked, false, 'a rejected office must fail open');
    console.log('✓ a rejected/unknown office fails open');

    // 7. unconfigured deployment (a local checkout) never calls home
    delete process.env.CONTROL_PLANE_URL;
    license.invalidate();
    const before = checkins;
    r = await call('/api/registre', 'POST');
    assert.strictEqual(r.blocked, false);
    assert.strictEqual(checkins, before, 'no check-in when unconfigured');
    console.log('✓ an unconfigured deployment never calls home');

    stub.close();
    console.log('\nAll licence-gate checks passed.');
};

run().catch((e) => { console.error('FAILED:', e.message); stub.close(); process.exit(1); });
