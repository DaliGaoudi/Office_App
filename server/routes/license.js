const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const { getStatus, invalidate } = require('../services/license');

/*
 * What the client asks to decide whether to show the app or the suspension
 * notice. Reachable while suspended (see middleware/license.js) — it is the one
 * endpoint that has to be, or the app could not explain itself.
 *
 * Authenticated, so the provider's message and contact details are not readable
 * by anyone who finds the URL.
 */
router.get('/status', authenticate, async (req, res) => {
    // Admins may force a re-check: after paying, nobody should wait out the
    // cache. Restricted to them so the endpoint cannot be used to hammer the
    // control plane from an ordinary session.
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'superadmin');
    if (isAdmin && req.query.force === '1') invalidate();

    const state = await getStatus();
    res.json({
        status: state.status,
        managed: Boolean(state.managed),
        message: state.status === 'active' ? null : (state.message || null),
        providerContact: state.providerContact || null,
        checkedAt: state.checkedAt || null,
        // Only an admin can act on a suspension, so only an admin is told that
        // exporting is still available.
        canExport: Boolean(isAdmin),
    });
});

module.exports = router;
