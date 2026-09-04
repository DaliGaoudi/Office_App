/*
 * reset_password.js — set a user's password directly, for when nobody can get in.
 *
 * Passwords are one-way hashed, so a forgotten one can only be replaced. This is
 * the break-glass tool: it needs database access, which means it is available to
 * whoever operates the deployment and to nobody else.
 *
 *   node server/scripts/reset_password.js --username "مراد القعودي"
 *   node server/scripts/reset_password.js --username hanen --password "chosen one"
 *   node server/scripts/reset_password.js --list
 *
 * With no --password a strong one is generated and printed once. The new hash is
 * always bcrypt, so resetting also clears a legacy MD5 row.
 *
 * Defaults to POSTGRES_URL in server/.env; --url points it at another office.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const { createPool } = require('@vercel/postgres');
const { hashPassword } = require('../services/password');

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
const fail = (msg) => { console.error(`\n  ✗ ${msg}\n`); process.exit(1); };

// Readable off a printed sheet: no ambiguous glyphs.
const generatePassword = (len = 14) => {
    const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.randomBytes(len)).map((b) => alphabet[b % alphabet.length]).join('');
};

async function main() {
    let url = args.url;
    let source = '--url';
    if (!url || url === true) { url = process.env.POSTGRES_URL; source = 'server/.env'; }
    if (!url) fail('no database URL: pass --url, or set POSTGRES_URL in server/.env.');

    const pool = createPool({ connectionString: url });
    const host = (url.match(/@([^/:]+)/) || [])[1] || '(unknown host)';
    console.log(`\n  Database: ${host}  (from ${source})`);

    const { rows: users } = await pool.query(
        `SELECT id, username, role, id_so,
                CASE WHEN password ~ '^\\$2[aby]\\$' THEN 'bcrypt' ELSE 'legacy' END AS hash
           FROM admin_admin ORDER BY id`
    );

    if (args.list) {
        console.log('\n  Accounts:');
        for (const u of users) {
            // Usernames can carry stray whitespace, which is invisible at a login
            // prompt and makes the account effectively unusable — show it.
            const odd = u.username !== u.username.trim() ? '   ← has leading/trailing whitespace' : '';
            console.log(`    ${String(u.id).padEnd(4)} ${JSON.stringify(u.username).padEnd(28)} ${u.role.padEnd(11)} id_so=${String(u.id_so).padEnd(4)} ${u.hash}${odd}`);
        }
        console.log('');
        await pool.end();
        return;
    }

    const username = args.username;
    if (!username || username === true) {
        fail('--username is required. Run with --list to see the accounts.');
    }

    // Match on the trimmed name too, so an account whose stored username carries a
    // stray tab can still be addressed by what a human would type.
    const target = users.find((u) => u.username === username)
        || users.find((u) => u.username.trim() === String(username).trim());
    if (!target) {
        fail(`no account named ${JSON.stringify(username)}. Run with --list to see the accounts.`);
    }

    const password = args.password && args.password !== true ? String(args.password) : generatePassword();
    if (password.length < 8) fail('password must be at least 8 characters.');

    await pool.query(`UPDATE admin_admin SET password = $1 WHERE id = $2`, [await hashPassword(password), target.id]);

    console.log('\n  ────────────────────────────────────────────────');
    console.log('   Password reset — shown once:');
    console.log(`     username : ${target.username}`);
    console.log(`     password : ${password}`);
    console.log(`     role     : ${target.role}   id_so: ${target.id_so}`);
    console.log('  ────────────────────────────────────────────────');
    if (target.username !== target.username.trim()) {
        console.log('\n  ! This username has stray whitespace. Type it exactly, or rename the');
        console.log('    account from the Users page once you are in.');
    }
    console.log('\n  Change it after logging in.\n');

    await pool.end();
}

main().catch((e) => { console.error('\n  ✗ Reset failed:', e.message, '\n'); process.exit(1); });
