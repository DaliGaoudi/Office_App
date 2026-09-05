import API_BASE from '../config';

const API = `${API_BASE}/cnss`;

// The local Scan Bridge on the office PC drives the scanner (see scan-watcher/).
export const BRIDGE_URL = localStorage.getItem('scanBridgeUrl') || 'http://127.0.0.1:17171';

// Scanned pages are large near-lossless JPEGs; downscale before the 10MB upload.
const SCAN_MAX_EDGE = 2000, SCAN_JPEG_QUALITY = 0.72;
export function compressImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      const scale = Math.min(1, SCAN_MAX_EDGE / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Image compression failed')), 'image/jpeg', SCAN_JPEG_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not process the image')); };
    img.src = url;
  });
}

// Drive the local scanner bridge and return a compressed JPEG blob of the page.
// A network failure (scanner offline) surfaces as a TypeError from fetch.
export async function scanCardFromBridge() {
  const scanUrl = `${BRIDGE_URL}/scan` + (localStorage.getItem('scanMock') === '1' ? '?mock=1' : '');
  const scanRes = await fetch(scanUrl, { method: 'POST' });
  if (!scanRes.ok) { const info = await scanRes.json().catch(() => ({})); throw new Error(info.error || 'Scanning failed'); }
  return compressImage(await scanRes.blob());
}

// ── Duplicate liquidation card (same card number already filed under the same debtor) ──
// The server refuses to file a second row and answers 409 with the card it found;
// the user decides whether to keep the new one anyway or cancel.
export function duplicateMessage(info) {
  const e = info.existing || {};
  const c = info.company || {};
  return 'This card is already filed under this record:\n\n'
    + `Card no.: ${e.numcarte || '—'}\n`
    + `Quarter: ${e.semestre || '—'}\n`
    + `Principal debt: ${e.dette || '—'} TND\n`
    + (c.nom_cl2 ? `Debtor: ${c.nom_cl2}\n` : '')
    + '\nPress OK to file it again, or Cancel to abort.';
}

const askKeepDuplicate = (info) => window.confirm(duplicateMessage(info));

// POST a card row onto a company. `force: 1` bypasses the duplicate guard.
export async function addCard(id_cn, card) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API}/${id_cn}/cards`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.status);
  return json;
}

// POST a liquidation-card image/PDF to the CNSS scan endpoint, which extracts it and
// auto-creates the record. Returns { id_cn, skipped } — `skipped` is true when the
// page turned out to be a duplicate the user chose not to keep, in which case
// id_cn still points at the record that already holds it. Throws on failure.
export async function createRecordFromCard(fileOrBlob, filename, confirmDuplicate = askKeepDuplicate) {
  const token = localStorage.getItem('token');
  const fd = new FormData();
  fd.append('file', fileOrBlob, filename || 'card.jpg');
  const res = await fetch(`${API}/scan`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const json = await res.json();
  if (res.ok && json.success) return { id_cn: json.id_cn, skipped: false };
  if (res.status === 409 && json.duplicate) {
    // Re-file the card the server already extracted — no second AI extraction.
    if (!confirmDuplicate(json)) return { id_cn: json.id_cn, skipped: true };
    await addCard(json.id_cn, { ...json.card, force: 1 });
    return { id_cn: json.id_cn, skipped: false };
  }
  throw new Error(json.error || res.status);
}
