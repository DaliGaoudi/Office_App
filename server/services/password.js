/*
 * Password hashing.
 *
 * Historically this app stored unsalted MD5 hex — inherited from the legacy PHP
 * office system. All NEW passwords are bcrypt. Existing MD5 rows still verify, and
 * `verifyPassword` reports when a stored hash is legacy so the login route can
 * transparently re-hash it with bcrypt on the user's next successful sign-in.
 *
 * Once `SELECT count(*) FROM admin_admin WHERE password !~ '^\$2[aby]\$'` reaches
 * zero for every office, the legacy branch here can be deleted.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const BCRYPT_ROUNDS = 10;

// bcrypt hashes are always $2a$ / $2b$ / $2y$ prefixed; legacy ones are 32 hex chars.
const isBcryptHash = (hash) => typeof hash === 'string' && /^\$2[aby]\$/.test(hash);
const isLegacyMd5Hash = (hash) => typeof hash === 'string' && /^[a-f0-9]{32}$/i.test(hash);

const hashPassword = async (plain) => bcrypt.hash(String(plain), BCRYPT_ROUNDS);

/*
 * Verify `plain` against a stored hash of either generation.
 * Returns { ok, needsUpgrade } — needsUpgrade is true when the password was correct
 * but the stored hash is still legacy MD5.
 */
const verifyPassword = async (plain, storedHash) => {
    if (!storedHash) return { ok: false, needsUpgrade: false };
    const password = String(plain ?? '');

    if (isBcryptHash(storedHash)) {
        return { ok: await bcrypt.compare(password, storedHash), needsUpgrade: false };
    }

    if (isLegacyMd5Hash(storedHash)) {
        const md5 = crypto.createHash('md5').update(password).digest('hex');
        // timingSafeEqual needs equal-length buffers; both are fixed 32-char hex here.
        const ok = crypto.timingSafeEqual(Buffer.from(md5, 'hex'), Buffer.from(storedHash.toLowerCase(), 'hex'));
        return { ok, needsUpgrade: ok };
    }

    return { ok: false, needsUpgrade: false };
};

module.exports = { hashPassword, verifyPassword, isBcryptHash, isLegacyMd5Hash, BCRYPT_ROUNDS };
