const db = require('../db');

/*
 * Service status: does this office still have the right to use the app?
 *
 * Each office deployment is its own Vercel project and its own database, so
 * there is nothing central to switch off. Instead the deployment asks the
 * control plane (the licence server) what its status is, and blocks itself when
 * told to. The credentials live in the Vercel environment, which only the
 * provider can change — the office cannot silence the check without access to
 * its own Vercel project settings.
 *
 *   CONTROL_PLANE_URL   https://cnss-license-server.vercel.app
 *   OFFICE_ID           the office's slug, its Vercel project name
 *   OFFICE_SECRET       the check-in secret, issued once by the panel
 *
 * FAILING OPEN IS DELIBERATE. If any of those is missing, or the control plane
 * is unreachable, or it does not recognise us, the office keeps working. This is
 * a bailiff's office: a DNS blip on our side must never stop them filing an act.
 * The lever we actually hold is the positive answer "suspended" — an outage
 * cannot forge one, and a cached "suspended" verdict is never downgraded by a
 * failed refresh.
 *
 * The verdict is cached twice: in memory for the life of a warm lambda, and in
 * app_settings so a cold start does not call home on every request.
 */

const STATE_KEY = 'license_state';

/*
 * How long a verdict may be trusted.
 *
 * The control plane sets the cadence, per response, in `recheckInSeconds` — so
 * it can be changed for every office at once by redeploying the licence server,
 * without touching a single office. These are only the fallback for a response
 * that omits it.
 *
 * The clamp is a guard, not a preference: it stops a bad or hostile value from
 * either hammering the control plane (too low) or pinning an office to a stale
 * verdict for a day (too high).
 */
const DEFAULT_ACTIVE_TTL_MS = 60 * 1000;
const DEFAULT_BLOCKED_TTL_MS = 30 * 1000;
const MIN_TTL_MS = 15 * 1000;
const MAX_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4000;

const UNMANAGED = { status: 'active', managed: false, message: null, reason: null, checkedAt: null };

let memo = null;      // last verdict this lambda knows about
let inflight = null;  // dedupe concurrent refreshes within one lambda

const config = () => ({
    url: (process.env.CONTROL_PLANE_URL || '').replace(/\/+$/, ''),
    id: process.env.OFFICE_ID,
    secret: process.env.OFFICE_SECRET,
});

const isConfigured = () => {
    const c = config();
    return Boolean(c.url && c.id && c.secret);
};

const ttlFor = (v) => {
    if (!v) return DEFAULT_ACTIVE_TTL_MS;
    const asked = Number(v.recheckInSeconds);
    if (Number.isFinite(asked) && asked > 0) {
        return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, asked * 1000));
    }
    return v.status !== 'active' ? DEFAULT_BLOCKED_TTL_MS : DEFAULT_ACTIVE_TTL_MS;
};
const isFresh = (v) => Boolean(v && v.checkedAt && (Date.now() - v.checkedAt) < ttlFor(v));

// The deployed commit, which is what identifies a build in the panel. Vercel
// injects it; locally there is nothing useful to report.
const version = () => (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null;

async function readPersisted() {
    try {
        const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [STATE_KEY]);
        return row && row.value ? JSON.parse(row.value) : null;
    } catch (e) {
        return null; // no table yet (pre-onboarding), or the DB is down
    }
}

async function writePersisted(verdict) {
    try {
        await db.run(
            `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
             RETURNING key`,
            [STATE_KEY, JSON.stringify(verdict)]
        );
    } catch (e) {
        console.error('license: could not persist state:', e.message);
    }
}

/*
 * A few numbers for the provider's dashboard — enough to tell a working office
 * from an empty or broken one, and nothing that identifies a single case or
 * person. Always best-effort: a failure here must not stop the check-in.
 */
async function gatherHealth() {
    try {
        const row = await db.get(
            `SELECT (SELECT COUNT(*) FROM clients_record) AS records,
                    (SELECT COUNT(*) FROM cnss)           AS cnss,
                    (SELECT COUNT(*) FROM admin_admin)    AS users`
        );
        return {
            records: Number(row.records) || 0,
            cnss: Number(row.cnss) || 0,
            users: Number(row.users) || 0,
        };
    } catch (e) {
        return {};
    }
}

async function fetchVerdict() {
    const c = config();
    const health = await gatherHealth();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(`${c.url}/api/office/checkin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.secret}` },
            body: JSON.stringify({ officeId: c.id, version: version(), health }),
            signal: controller.signal,
        });

        // 401 means the control plane has no record of us — a wrong or rotated
        // secret, or an office that was deleted from the registry. Unmanaged, so
        // keep working, but say so loudly enough to be noticed in the logs.
        if (res.status === 401) {
            console.warn('license: control plane does not recognise OFFICE_ID/OFFICE_SECRET — running unmanaged');
            return { ...UNMANAGED, checkedAt: Date.now() };
        }
        if (!res.ok) throw new Error(`control plane returned ${res.status}`);

        const j = await res.json();
        return {
            status: ['active', 'suspended', 'terminated'].includes(j.status) ? j.status : 'active',
            managed: true,
            message: j.message || null,
            reason: j.reason || null,
            providerContact: j.providerContact || null,
            // Persisted with the verdict, so a cold start honours the cadence
            // the control plane asked for rather than falling back to a default.
            recheckInSeconds: Number(j.recheckInSeconds) || null,
            checkedAt: Date.now(),
        };
    } finally {
        clearTimeout(timer);
    }
}

/*
 * The current verdict. Never throws and never blocks longer than the fetch
 * timeout; on any error it falls back to the last verdict we hold, and to
 * "active" when we hold none.
 */
async function getStatus() {
    if (!isConfigured()) return UNMANAGED;
    if (isFresh(memo)) return memo;

    if (!memo) memo = await readPersisted();
    if (isFresh(memo)) return memo;

    if (!inflight) {
        inflight = fetchVerdict()
            .then(async (v) => {
                memo = v;
                await writePersisted(v);
                return v;
            })
            .catch((e) => {
                console.error('license: check-in failed:', e.message);
                // Keep the stale verdict rather than inventing one. A failed
                // refresh must not un-suspend an office, nor suspend a good one.
                return memo || UNMANAGED;
            })
            .finally(() => { inflight = null; });
    }
    return inflight;
}

// Force the next getStatus() to call home — used right after login so a
// reinstated office is not held back by a stale cache.
const invalidate = () => { memo = null; };

module.exports = { getStatus, invalidate, isConfigured, STATE_KEY };
