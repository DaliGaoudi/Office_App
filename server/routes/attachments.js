const express = require('express');
const multer = require('multer');
const { put, del } = require('@vercel/blob');
const db = require('../db');
const authenticate = require('../middleware/auth');
const { signedFileUrl, verifyFileUrl } = require('../services/attachmentUrl');

const router = express.Router();

/*
 * Attachments are scanned legal documents — the most sensitive data in the app.
 *
 * Two things were wrong here and both are fixed below:
 *   1. GET /file/:id served the bytes to anyone, unauthenticated, at a sequential
 *      integer id. It is now signature-gated (see services/attachmentUrl.js).
 *   2. Neither `attachments` nor `scan_targets` had an id_so column, so every query
 *      addressed rows by primary key across all offices.
 *
 * `id_so` is stamped on write and required on every read, delete and list. Rows
 * predating the column have a NULL id_so and are invisible until backfilled by
 * scripts/migrate_attachments_tenancy.js — deliberately, since the alternative is
 * treating "tenant unknown" as "visible to everyone".
 */

// Scanned documents are usually a few MB; allow up to 25MB per file.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Which table a record_type lives in, so an upload can be checked against the
// caller's office before anything is attached to it.
const RECORD_SOURCES = {
    registre: { table: 'clients_record', idColumn: 'id_r' },
    execution: { table: 'clients_record', idColumn: 'id_r' },
    general: { table: 'clients_record', idColumn: 'id_r' },
    cnss: { table: 'cnss', idColumn: 'id_cn' },
};

/*
 * One-time attribution of pre-existing attachments to an office.
 *
 * The id_so column is added below, but rows written before it existed have NULL and
 * are invisible to every query here — deliberately, since "tenant unknown" must not
 * mean "visible to everyone". Rather than make that a migration someone has to
 * remember, it runs itself on the first request after deploy.
 *
 * The office is inferred by joining record_id back to the record the file is
 * attached to. Completion is recorded in app_settings so the steady-state cost is a
 * single primary-key lookup rather than a scan on every cold start — this row is the
 * closest thing the project has to a migration ledger.
 */
const BACKFILL_KEY = 'attachments_id_so_backfilled';

const BACKFILL_SOURCES = [
    { types: `'registre','execution','general'`, table: 'clients_record', idColumn: 'id_r' },
    { types: `'cnss'`, table: 'cnss', idColumn: 'id_cn' },
];

async function backfillTenancy() {
    try {
        const done = await db.get(`SELECT value FROM app_settings WHERE key = ?`, [BACKFILL_KEY]);
        if (done) return;
    } catch {
        // app_settings may not exist yet on a brand-new database; such a database
        // has no attachments to attribute either, so there is nothing to do.
        return;
    }

    let filled = 0;
    for (const src of BACKFILL_SOURCES) {
        const res = await db.run(
            `UPDATE attachments a
                SET id_so = r.id_so::text
               FROM ${src.table} r
              WHERE r.${src.idColumn}::text = a.record_id
                AND a.id_so IS NULL
                AND a.record_type IN (${src.types})
                AND r.id_so IS NOT NULL`
        );
        filled += res.changes || 0;
    }

    await db.run(
        `UPDATE scan_targets s SET id_so = u.id_so::text
           FROM admin_admin u WHERE u.id::text = s.user_id AND s.id_so IS NULL`
    );

    // Anything still unattributed has lost the record it hung off. It stays hidden;
    // scripts/migrate_attachments_tenancy.js --orphans-to <id_so> can adopt it.
    const orphan = await db.get(`SELECT count(*)::int AS n FROM attachments WHERE id_so IS NULL`);
    const orphans = Number(orphan && orphan.n) || 0;

    if (filled) console.log(`[attachments] attributed ${filled} pre-existing attachment(s) to their office`);
    if (orphans) {
        console.warn(
            `[attachments] ${orphans} attachment(s) could not be attributed — their record no longer exists. ` +
            `They stay hidden; adopt with scripts/migrate_attachments_tenancy.js --orphans-to <id_so>.`
        );
    }

    // Recorded even with orphans outstanding, so this doesn't rescan on every cold
    // start; the warning above and the script remain the route for those rows.
    await db.run(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
         RETURNING key`,
        [BACKFILL_KEY, JSON.stringify({ at: new Date().toISOString(), filled, orphans })]
    );
}

// Lazily ensure the tables exist (no separate migration step needed).
let tableReady = false;
async function ensureTable() {
    if (tableReady) return;
    await db.run(`
        CREATE TABLE IF NOT EXISTS attachments (
            id SERIAL PRIMARY KEY,
            record_type TEXT NOT NULL,
            record_id   TEXT NOT NULL,
            filename    TEXT NOT NULL,
            mimetype    TEXT,
            size        INTEGER,
            blob_url    TEXT NOT NULL,
            uploaded_by TEXT,
            created_at  TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    // When Vercel Blob isn't configured, the file bytes are stored here instead
    // and served back via GET /api/attachments/file/:id. Added defensively for
    // tables created before this column existed.
    await db.run(`ALTER TABLE attachments ADD COLUMN IF NOT EXISTS data BYTEA`);
    // The office each document belongs to. Nullable so the column can be added to a
    // populated table; the backfill script fills it from the owning record.
    await db.run(`ALTER TABLE attachments ADD COLUMN IF NOT EXISTS id_so TEXT`);
    // Tracks which record each user currently has open, so an automatic scan
    // (uploaded by the local watcher agent) lands on the right record.
    await db.run(`
        CREATE TABLE IF NOT EXISTS scan_targets (
            user_id     TEXT PRIMARY KEY,
            record_type TEXT NOT NULL,
            record_id   TEXT NOT NULL,
            updated_at  TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    await db.run(`ALTER TABLE scan_targets ADD COLUMN IF NOT EXISTS id_so TEXT`);

    // Attribute rows that predate the id_so column. Never let a failure here take
    // the whole route down: unattributed rows stay hidden, which is the safe
    // direction, and the next cold start retries.
    try {
        await backfillTenancy();
    } catch (e) {
        console.error('[attachments] tenancy backfill failed (rows stay hidden):', e.message);
    }

    tableReady = true;
}

/*
 * Confirm a record exists inside the caller's office before attaching anything to
 * it — otherwise record_id is an unchecked number and an upload could be pinned to
 * another office's file.
 */
async function recordBelongsToCaller(recordType, recordId, idSo) {
    const source = RECORD_SOURCES[recordType];
    if (!source) return false;
    const row = await db.get(
        `SELECT 1 AS ok FROM ${source.table} WHERE ${source.idColumn}::text = ? AND id_so::text = ?`,
        [String(recordId), String(idSo)]
    );
    return Boolean(row);
}

// Shared: persist a buffer and record it against a record.
// Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set; otherwise falls back to
// storing the bytes in Postgres and serving them via GET /api/attachments/file/:id.
async function storeAttachment({ buffer, originalname, mimetype, size, record_type, record_id, uploaded_by, id_so }) {
    const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

    let blob_url = null;
    if (useBlob) {
        const safeName = originalname.replace(/[^\w.\-]+/g, '_');
        const blobPath = `${record_type}/${record_id}/${Date.now()}-${safeName}`;
        const blob = await put(blobPath, buffer, { access: 'public', contentType: mimetype });
        blob_url = blob.url;
    }

    // blob_url is NOT NULL in the schema; for the DB-stored case we insert a
    // placeholder and rewrite it with the row id once we have it.
    const result = await db.run(
        `INSERT INTO attachments (record_type, record_id, filename, mimetype, size, blob_url, uploaded_by, data, id_so)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [record_type, String(record_id), originalname, mimetype, size, blob_url || 'pending', uploaded_by || null, useBlob ? null : buffer, String(id_so)]
    );
    const id = result.lastID;

    if (!useBlob) {
        // Stored unsigned: the signature is minted per response so it can expire.
        blob_url = `/api/attachments/file/${id}`;
        await db.run(`UPDATE attachments SET blob_url = ? WHERE id = ?`, [blob_url, id]);
        blob_url = signedFileUrl(id);
    }

    return {
        id,
        record_type,
        record_id: String(record_id),
        filename: originalname,
        mimetype,
        size,
        blob_url,
        uploaded_by: uploaded_by || null,
    };
}

// A DB-stored attachment's stored URL is a bare path; hand the client a signed one.
// Blob-backed rows already carry an absolute Vercel URL and are returned untouched.
const withSignedUrl = (row) => ({
    ...row,
    blob_url: /^https?:\/\//i.test(row.blob_url || '') ? row.blob_url : signedFileUrl(row.id),
});

/**
 * GET /api/attachments/file/:id?exp=…&sig=…
 * Serve a DB-stored attachment's bytes.
 *
 * Authorised either by a valid signature (the normal path — the client renders this
 * as a plain <a href>, which cannot send an Authorization header) or, for direct API
 * use, by a bearer token whose office matches the row.
 *
 * NOTE: must be declared before "/:recordType/:recordId" so it isn't shadowed.
 */
router.get('/file/:id', async (req, res) => {
    try {
        await ensureTable();
        const { id } = req.params;

        const row = await db.get(`SELECT id_so, filename, mimetype, data FROM attachments WHERE id = ?`, [id]);
        if (!row || !row.data) return res.status(404).send('Not found');

        let allowed = verifyFileUrl(id, req.query.exp, req.query.sig);

        if (!allowed) {
            // Fall back to a bearer token, scoped to the row's office.
            const token = (req.headers['authorization'] || '').split(' ')[1];
            if (token) {
                try {
                    const jwt = require('jsonwebtoken');
                    const { getJwtSecret } = require('../config/secrets');
                    const user = jwt.verify(token, getJwtSecret());
                    allowed = row.id_so != null && String(user.id_so) === String(row.id_so);
                } catch { /* invalid token — stays disallowed */ }
            }
        }

        // 404 rather than 403: don't confirm that an id exists to an unauthorised caller.
        if (!allowed) return res.status(404).send('Not found');

        // node-postgres returns BYTEA as a Buffer; tolerate a hex string too.
        let buf = row.data;
        if (!Buffer.isBuffer(buf)) {
            buf = typeof buf === 'string'
                ? Buffer.from(buf.replace(/^\\x/, ''), 'hex')
                : Buffer.from(buf);
        }

        res.set('Content-Type', row.mimetype || 'application/octet-stream');
        // Filenames may be non-ASCII (Arabic); use RFC5987 encoding.
        res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.filename || 'document')}`);
        res.set('Cache-Control', 'private, max-age=3600');
        res.send(buf);
    } catch (e) {
        console.error('Serve attachment failed:', e);
        res.status(500).send('Failed to load file.');
    }
});

/**
 * GET /api/attachments/:recordType/:recordId
 * List all documents attached to a record, within the caller's office.
 */
router.get('/:recordType/:recordId', authenticate, async (req, res) => {
    try {
        await ensureTable();
        const { recordType, recordId } = req.params;
        const rows = await db.all(
            `SELECT id, record_type, record_id, filename, mimetype, size, blob_url, uploaded_by, created_at
             FROM attachments
             WHERE record_type = ? AND record_id = ? AND id_so::text = ?
             ORDER BY created_at DESC`,
            [recordType, String(recordId), req.user.id_so]
        );
        res.json(rows.map(withSignedUrl));
    } catch (e) {
        console.error('List attachments failed:', e);
        res.status(500).json({ error: 'Failed to load attachments.' });
    }
});

/**
 * POST /api/attachments
 * Upload a scanned document and attach it to a record.
 * Expects multipart form: file, record_type, record_id.
 */
router.post('/', authenticate, upload.single('file'), async (req, res) => {
    try {
        await ensureTable();
        const { record_type, record_id } = req.body;
        if (!req.file) return res.status(400).json({ error: 'No file provided.' });
        if (!record_type || !record_id) return res.status(400).json({ error: 'record_type and record_id are required.' });

        if (!(await recordBelongsToCaller(record_type, record_id, req.user.id_so))) {
            return res.status(404).json({ error: 'Record not found.' });
        }

        const attachment = await storeAttachment({
            buffer: req.file.buffer,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            record_type,
            record_id,
            uploaded_by: req.user?.id ? String(req.user.id) : null,
            id_so: req.user.id_so,
        });
        res.json({ success: true, attachment });
    } catch (e) {
        console.error('Upload attachment failed:', e);
        res.status(500).json({ error: e.message || 'Failed to upload document.' });
    }
});

/**
 * POST /api/attachments/scan-target   body: { record_type, record_id }
 * The web app calls this when a user opens a record, so an automatic scan
 * knows which record to attach to. One active target per user.
 */
router.post('/scan-target', authenticate, async (req, res) => {
    try {
        await ensureTable();
        const { record_type, record_id } = req.body;
        if (!record_type || !record_id) return res.status(400).json({ error: 'record_type and record_id are required.' });

        if (!(await recordBelongsToCaller(record_type, record_id, req.user.id_so))) {
            return res.status(404).json({ error: 'Record not found.' });
        }

        const userId = String(req.user.id);
        await db.run(
            `INSERT INTO scan_targets (user_id, record_type, record_id, id_so, updated_at)
             VALUES (?, ?, ?, ?, NOW())
             ON CONFLICT (user_id) DO UPDATE SET record_type = EXCLUDED.record_type, record_id = EXCLUDED.record_id, id_so = EXCLUDED.id_so, updated_at = NOW()`,
            [userId, record_type, String(record_id), String(req.user.id_so)]
        );
        res.json({ success: true });
    } catch (e) {
        console.error('Set scan target failed:', e);
        res.status(500).json({ error: 'Failed to set scan target.' });
    }
});

/**
 * GET /api/attachments/scan-target
 * Returns the caller's current active record (used by the watcher agent).
 */
router.get('/scan-target', authenticate, async (req, res) => {
    try {
        await ensureTable();
        const row = await db.get(
            `SELECT record_type, record_id, updated_at FROM scan_targets WHERE user_id = ? AND id_so::text = ?`,
            [String(req.user.id), req.user.id_so]
        );
        res.json(row || null);
    } catch (e) {
        console.error('Get scan target failed:', e);
        res.status(500).json({ error: 'Failed to read scan target.' });
    }
});

/**
 * POST /api/attachments/ingest
 * Called by the local watcher agent for each new scan file. No record id needed —
 * the file is attached to the caller's current scan target automatically.
 */
router.post('/ingest', authenticate, upload.single('file'), async (req, res) => {
    try {
        await ensureTable();
        if (!req.file) return res.status(400).json({ error: 'No file provided.' });

        const target = await db.get(
            `SELECT record_type, record_id FROM scan_targets WHERE user_id = ? AND id_so::text = ?`,
            [String(req.user.id), req.user.id_so]
        );
        if (!target) return res.status(409).json({ error: 'No active record. Open a record in the app before scanning.' });

        const attachment = await storeAttachment({
            buffer: req.file.buffer,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            record_type: target.record_type,
            record_id: target.record_id,
            uploaded_by: String(req.user.id),
            id_so: req.user.id_so,
        });
        res.json({ success: true, attachment });
    } catch (e) {
        console.error('Ingest scan failed:', e);
        res.status(500).json({ error: e.message || 'Failed to ingest scan.' });
    }
});

/**
 * DELETE /api/attachments/:id
 * Remove a document (from Blob storage and the database).
 */
router.delete('/:id', authenticate, async (req, res) => {
    try {
        await ensureTable();
        const row = await db.get(
            `SELECT blob_url FROM attachments WHERE id = ? AND id_so::text = ?`,
            [req.params.id, req.user.id_so]
        );
        if (!row) return res.status(404).json({ error: 'Attachment not found.' });

        try {
            if (process.env.BLOB_READ_WRITE_TOKEN) await del(row.blob_url);
        } catch (blobErr) {
            console.warn('Blob delete failed (continuing to remove DB row):', blobErr.message);
        }

        await db.run(`DELETE FROM attachments WHERE id = ? AND id_so::text = ?`, [req.params.id, req.user.id_so]);
        res.json({ success: true });
    } catch (e) {
        console.error('Delete attachment failed:', e);
        res.status(500).json({ error: 'Failed to delete document.' });
    }
});

module.exports = router;
