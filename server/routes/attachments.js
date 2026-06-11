const express = require('express');
const multer = require('multer');
const { put, del } = require('@vercel/blob');
const db = require('../db');
const authenticate = require('../middleware/auth');

const router = express.Router();

// Scanned documents are usually a few MB; allow up to 25MB per file.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

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
    tableReady = true;
}

// Shared: upload a buffer to Blob and record it against a record.
async function storeAttachment({ buffer, originalname, mimetype, size, record_type, record_id, uploaded_by }) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        throw new Error('Blob storage is not configured (missing BLOB_READ_WRITE_TOKEN).');
    }
    const safeName = originalname.replace(/[^\w.\-]+/g, '_');
    const blobPath = `${record_type}/${record_id}/${Date.now()}-${safeName}`;
    const blob = await put(blobPath, buffer, { access: 'public', contentType: mimetype });

    const result = await db.run(
        `INSERT INTO attachments (record_type, record_id, filename, mimetype, size, blob_url, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [record_type, String(record_id), originalname, mimetype, size, blob.url, uploaded_by || null]
    );
    return {
        id: result.lastID,
        record_type,
        record_id: String(record_id),
        filename: originalname,
        mimetype,
        size,
        blob_url: blob.url,
        uploaded_by: uploaded_by || null,
    };
}

/**
 * GET /api/attachments/:recordType/:recordId
 * List all documents attached to a record.
 */
router.get('/:recordType/:recordId', authenticate, async (req, res) => {
    try {
        await ensureTable();
        const { recordType, recordId } = req.params;
        const rows = await db.all(
            `SELECT id, record_type, record_id, filename, mimetype, size, blob_url, uploaded_by, created_at
             FROM attachments
             WHERE record_type = ? AND record_id = ?
             ORDER BY created_at DESC`,
            [recordType, String(recordId)]
        );
        res.json(rows);
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

        const attachment = await storeAttachment({
            buffer: req.file.buffer,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            record_type,
            record_id,
            uploaded_by: req.user?.id ? String(req.user.id) : null,
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
        const userId = String(req.user.id);
        await db.run(
            `INSERT INTO scan_targets (user_id, record_type, record_id, updated_at)
             VALUES (?, ?, ?, NOW())
             ON CONFLICT (user_id) DO UPDATE SET record_type = EXCLUDED.record_type, record_id = EXCLUDED.record_id, updated_at = NOW()`,
            [userId, record_type, String(record_id)]
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
        const row = await db.get(`SELECT record_type, record_id, updated_at FROM scan_targets WHERE user_id = ?`, [String(req.user.id)]);
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

        const target = await db.get(`SELECT record_type, record_id FROM scan_targets WHERE user_id = ?`, [String(req.user.id)]);
        if (!target) return res.status(409).json({ error: 'No active record. Open a record in the app before scanning.' });

        const attachment = await storeAttachment({
            buffer: req.file.buffer,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            record_type: target.record_type,
            record_id: target.record_id,
            uploaded_by: String(req.user.id),
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
        const row = await db.get(`SELECT blob_url FROM attachments WHERE id = ?`, [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Attachment not found.' });

        try {
            if (process.env.BLOB_READ_WRITE_TOKEN) await del(row.blob_url);
        } catch (blobErr) {
            console.warn('Blob delete failed (continuing to remove DB row):', blobErr.message);
        }

        await db.run(`DELETE FROM attachments WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        console.error('Delete attachment failed:', e);
        res.status(500).json({ error: 'Failed to delete document.' });
    }
});

module.exports = router;
