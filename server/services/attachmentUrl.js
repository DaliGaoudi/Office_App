/*
 * Signed URLs for DB-stored attachments.
 *
 * When Vercel Blob isn't configured the file bytes live in Postgres and are served
 * by GET /api/attachments/file/:id. That route used to be public "by design" — the
 * client renders the URL as a plain <a href>, which cannot carry an Authorization
 * header, so authenticating it the normal way would have broken every document link.
 *
 * The consequence was that every scanned act was readable by anyone who could reach
 * the domain, at a sequential integer id.
 *
 * So the URL itself carries the authorisation: the authenticated, tenant-scoped list
 * endpoint hands out a short-lived HMAC-signed link. A bare /file/:id with no valid
 * signature is refused. The link still works in a plain <a href>, a new tab, or an
 * <img>, and it expires.
 */
const crypto = require('crypto');
const { getJwtSecret } = require('../config/secrets');

// Long enough to open a record and read its documents at leisure; short enough that
// a link pasted somewhere it shouldn't be stops working the same day.
const TTL_SECONDS = 6 * 60 * 60;

const sign = (id, exp) =>
    crypto.createHmac('sha256', getJwtSecret())
        .update(`${id}.${exp}`)
        .digest('base64url');

/*
 * Build the relative URL the client should use for an attachment's bytes.
 * `id_so` is bound into nothing here — the signature only proves the link was
 * issued by a request that had already passed the tenant check.
 */
const signedFileUrl = (id) => {
    const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
    return `/api/attachments/file/${id}?exp=${exp}&sig=${sign(id, exp)}`;
};

/*
 * Verify a request's ?exp / ?sig against an attachment id.
 * Returns true only for an untampered, unexpired signature.
 */
const verifyFileUrl = (id, exp, sig) => {
    if (!exp || !sig) return false;

    const expNum = Number(exp);
    if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;

    const expected = sign(id, exp);
    const a = Buffer.from(String(sig));
    const b = Buffer.from(expected);
    // timingSafeEqual throws on length mismatch, which is itself a failed compare.
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = { signedFileUrl, verifyFileUrl, TTL_SECONDS };
