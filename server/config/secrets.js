/*
 * Secrets resolution, in one place.
 *
 * JWT_SECRET used to fall back to a hardcoded string that lived in the repo, which
 * meant anyone with the source could mint a valid token for any office. In a hosted
 * environment that fallback is now a hard failure; locally it degrades to a random
 * per-process secret (tokens simply don't survive a restart, which is fine for dev).
 */
const crypto = require('crypto');

const isHosted = () => Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';

let cachedDevSecret;

const getJwtSecret = () => {
    const fromEnv = process.env.JWT_SECRET;
    if (fromEnv && fromEnv.trim()) return fromEnv;

    if (isHosted()) {
        throw new Error(
            'JWT_SECRET is not set. Refusing to sign or verify tokens with a default secret. ' +
            'Set JWT_SECRET in this deployment\'s environment variables.'
        );
    }

    if (!cachedDevSecret) {
        cachedDevSecret = crypto.randomBytes(32).toString('hex');
        console.warn('[secrets] JWT_SECRET not set — using a random development secret. Tokens will not survive a restart.');
    }
    return cachedDevSecret;
};

module.exports = { getJwtSecret };
