const { getStatus } = require('../services/license');

/*
 * Gate the whole API on the office's service status.
 *
 * A suspended office is blocked, not erased: the app refuses to work and shows
 * the provider's message, but the data is untouched and /api/export stays open
 * so the office can take a copy of its own records. That matters most at the end
 * of a contract — the registers are the office's legal work product, and holding
 * them hostage would be both wrong and, for a huissier, a real problem.
 *
 * Reinstating is the same switch in reverse: flip the office back to active in
 * the panel and it is working again within a few minutes, with nothing to
 * restore.
 */

// Paths that answer even while suspended, in the order of why they must:
//   health      — so uptime checks still work
//   license     — so the app can learn *why* it is blocked
//   onboarding  — a fresh deployment must be able to finish setting itself up
//   auth        — the notice is shown to a logged-in user, so login must work
//   backup      — the nightly Vercel cron keeps protecting the data
//   export      — the office's right to a copy of its own records
const ALWAYS_ALLOWED = [
    /^\/api\/health\b/,
    /^\/api\/license\//,
    /^\/api\/onboarding\//,
    /^\/api\/auth\//,
    /^\/api\/backup\b/,
    /^\/api\/export\//,
];

async function licenseGate(req, res, next) {
    if (ALWAYS_ALLOWED.some((re) => re.test(req.path))) return next();

    let state;
    try {
        state = await getStatus();
    } catch (e) {
        // getStatus is written not to throw; if it somehow does, let the request
        // through. An office is never blocked by our own bug.
        console.error('license gate error:', e.message);
        return next();
    }

    if (!state || state.status === 'active') return next();

    res.status(403).json({
        code: 'office_suspended',
        status: state.status,
        error: state.message || 'تم إيقاف الخدمة. يُرجى التواصل مع المزوّد.',
        providerContact: state.providerContact || null,
    });
}

module.exports = licenseGate;
