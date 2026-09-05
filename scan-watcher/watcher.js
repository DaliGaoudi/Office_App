#!/usr/bin/env node
/**
 * Scan Watcher Agent
 * -------------------
 * Runs in the background on the office PC. Watches the folder your scanner
 * saves to and automatically uploads each new scan to the web app, attaching
 * it to whatever record the user currently has open.
 *
 * The user never selects a file: open the record in the app, put paper in the
 * scanner, press the scanner's Scan button. Done.
 *
 * Setup (one time):
 *   1. Configure your scanner software to "Scan to folder" → set it to WATCH_FOLDER below.
 *   2. Copy config.example.json to config.json and fill in API_BASE, WATCH_FOLDER,
 *      and a long-lived TOKEN (a JWT for the office user — see README).
 *   3. Run:  node watcher.js
 *      (or install as a Windows service / startup task so it's always running.)
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Missing config.json. Copy config.example.json to config.json and fill it in.');
    process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const API_BASE = (cfg.API_BASE || '').replace(/\/$/, '');
const WATCH_FOLDER = cfg.WATCH_FOLDER;
const TOKEN = cfg.TOKEN;
const EXTENSIONS = (cfg.EXTENSIONS || ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif']).map(e => e.toLowerCase());
const STABLE_MS = cfg.STABLE_MS || 2000; // wait until file stops growing before uploading

if (!API_BASE || !WATCH_FOLDER || !TOKEN) {
    console.error('config.json must set API_BASE, WATCH_FOLDER and TOKEN.');
    process.exit(1);
}
if (!fs.existsSync(WATCH_FOLDER)) {
    console.error('WATCH_FOLDER does not exist:', WATCH_FOLDER);
    process.exit(1);
}

console.log(`Scan watcher running.\n  Watching: ${WATCH_FOLDER}\n  Uploading to: ${API_BASE}/attachments/ingest`);

const seen = new Set();

// Wait until a file's size is stable (scanner finished writing it).
function waitUntilStable(filePath) {
    return new Promise((resolve, reject) => {
        let lastSize = -1;
        const check = () => {
            fs.stat(filePath, (err, st) => {
                if (err) return reject(err);
                if (st.size > 0 && st.size === lastSize) return resolve(st.size);
                lastSize = st.size;
                setTimeout(check, STABLE_MS);
            });
        };
        check();
    });
}

async function upload(filePath) {
    const filename = path.basename(filePath);
    try {
        await waitUntilStable(filePath);
        const buffer = fs.readFileSync(filePath);

        // Node 18+ has global FormData/Blob/fetch.
        const form = new FormData();
        form.append('file', new Blob([buffer]), filename);

        const res = await fetch(`${API_BASE}/attachments/ingest`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${TOKEN}` },
            body: form,
        });
        const body = await res.json().catch(() => ({}));

        if (res.ok && body.success) {
            console.log(`✓ Uploaded ${filename} → record ${body.attachment.record_type}/${body.attachment.record_id}`);
            // Optionally move the processed file aside so it isn't re-scanned.
            if (cfg.MOVE_PROCESSED_TO) {
                fs.mkdirSync(cfg.MOVE_PROCESSED_TO, { recursive: true });
                fs.renameSync(filePath, path.join(cfg.MOVE_PROCESSED_TO, filename));
            }
        } else if (res.status === 409) {
            console.warn(`⚠ ${filename}: no record open in the app — skipped. Open a record and re-scan.`);
        } else {
            console.error(`✗ ${filename}: upload failed —`, body.error || res.status);
        }
    } catch (e) {
        console.error(`✗ ${filename}: ${e.message}`);
    }
}

function handleFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!EXTENSIONS.includes(ext)) return;
    if (seen.has(filePath)) return;
    seen.add(filePath);
    upload(filePath).finally(() => {
        // Allow the same filename to be processed again later (after a move/delete).
        setTimeout(() => seen.delete(filePath), 30000);
    });
}

// Pick up files already sitting in the folder at startup, then watch for new ones.
fs.readdirSync(WATCH_FOLDER).forEach(f => handleFile(path.join(WATCH_FOLDER, f)));
fs.watch(WATCH_FOLDER, (event, filename) => {
    if (!filename) return;
    const full = path.join(WATCH_FOLDER, filename);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) handleFile(full);
});
