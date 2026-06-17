const db = require('../db');

/**
 * Logical backup of the whole database: every base table in the public schema,
 * dumped to a plain JS object { created_at, row_count, tables: { name: [rows] } }.
 * Read-only — safe to run any time. Fine for a small office DB; for very large
 * data you'd switch to pg_dump.
 */
async function dumpDatabase() {
    const tables = await db.all(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name`
    );

    const out = { created_at: new Date().toISOString(), row_count: 0, tables: {} };
    for (const t of tables) {
        const rows = await db.all(`SELECT * FROM "${t.table_name}"`);
        out.tables[t.table_name] = rows;
        out.row_count += rows.length;
    }
    return out;
}

/**
 * Upload a dump to Vercel Blob (only if BLOB_READ_WRITE_TOKEN is configured).
 * Uses PRIVATE access — a full DB dump must never be reachable at a public URL;
 * it's retrievable only with the store's token. Returns the URL or null.
 */
async function uploadToBlob(dump) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
    const { put } = require('@vercel/blob');
    const stamp = dump.created_at.replace(/[:.]/g, '-');
    const res = await put(`db-backups/backup-${stamp}.json`, JSON.stringify(dump), {
        access: 'private',
        contentType: 'application/json',
        token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return res.url;
}

module.exports = { dumpDatabase, uploadToBlob };
