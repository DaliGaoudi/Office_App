import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Check, Plus, Trash2, Edit, UploadCloud, FileText, Printer, ScanLine, ChevronDown, ChevronLeft } from 'lucide-react';
import { STATUS_MAP } from '../utils/formatters';
import API_BASE from '../config';
import AutocompleteInput from '../components/AutocompleteInput';
import { compressImage, scanCardFromBridge, createRecordFromCard, duplicateMessage } from '../utils/cnssScan';

const API = `${API_BASE}/cnss`;

// CNSS dette is decimal dinars stored as a string ("2959.306").
const fmtDinar = (v) => {
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n);
};

// The penalty-start date follows the quarter: the 16th of the month after the
// quarter ends. Q1→16/04, Q2→16/07, Q3→16/10, Q4→16/01 of the next year.
// semestre is "Q/YYYY" e.g. "04/2021".
export function deriveDatesins(semestre) {
  const m = /^\s*(\d{1,2})\s*\/\s*(\d{4})\s*$/.exec(semestre || '');
  if (!m) return '';
  const q = parseInt(m[1], 10);
  let y = parseInt(m[2], 10);
  const monthAfter = { 1: '04', 2: '07', 3: '10', 4: '01' }[q];
  if (!monthAfter) return '';
  if (q === 4) y += 1;
  return `16/${monthAfter}/${y}`;
}

const EMPTY_COMPANY = { ref: '', nom_cl2: '', cl2_adresse: '', cl2_adresse2: '', numcnss: '', codeng: '', cl2_profession: '', tribunal: '', status: 'has_deposit' };

// Per-act fee statement, split into two billing sections. Amounts are whole
// millimes (1 TND = 1000 millimes). VAT is applied to the Fees section only.
//   Fees     → VAT-bearing base.
//   Expenses → no VAT.
const AJR_FIELDS = [
  { k: 'fee_original', l: 'Original act' },
  { k: 'fee_counterparts', l: 'Counterparts' },
  { k: 'fee_legal_copy', l: 'Legal copy' },
  { k: 'fee_office_copy', l: 'Office copy' },
  { k: 'fee_movement', l: 'Attendance' },
  { k: 'fee_copies', l: 'Document copies' },
];
const EXP_FIELDS = [
  { k: 'fee_travel', l: 'Travel' },
  { k: 'fee_registration', l: 'Registration' },
  { k: 'fee_stamp', l: 'Stamp duty' },
  { k: 'fee_post', l: 'Postage' },
];
// All manual-input fee columns (the VAT line fee_aqm is derived, not typed).
const FEE_KEYS = [...AJR_FIELDS, ...EXP_FIELDS].map((f) => f.k);
const DEFAULT_VAT_RATE = '19';
const toMillimes = (v) => parseInt(String(v || '').replace(/[^\d]/g, ''), 10) || 0;
const sumKeys = (form, fields) => fields.reduce((s, f) => s + toMillimes(form[f.k]), 0);
// vat_rate is a percentage; blank/invalid → 19% default.
const vatRateOf = (form) => {
  const raw = String(form.vat_rate ?? '').replace(',', '.').trim();
  if (raw === '') return parseFloat(DEFAULT_VAT_RATE);
  const n = parseFloat(raw);
  return isNaN(n) ? parseFloat(DEFAULT_VAT_RATE) : n;
};
const ajrTotalMillimes = (form) => sumKeys(form, AJR_FIELDS);
const expTotalMillimes = (form) => sumKeys(form, EXP_FIELDS);
const vatMillimes = (form) => Math.round(ajrTotalMillimes(form) * vatRateOf(form) / 100);
const grandTotalMillimes = (form) => ajrTotalMillimes(form) + vatMillimes(form) + expTotalMillimes(form);
// millimes → "D DDD,MMM" (Tunisian dinars; comma = millime decimal).
const formatDinar = (millimes) =>
  String(Math.floor(millimes / 1000)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + String(millimes % 1000).padStart(3, '0');

// Normalize a stored date (YYYY-MM-DD or DD/MM/YYYY) to YYYY-MM-DD for <input type="date">.
const toISODate = (s) => {
  s = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};

const EMPTY_CARD = { numcarte: '', datecarte: '', date_tabligh: '', semestre: '', dette: '', pourcentage: '1.5', datesins: '', nbrreg: '',
  vat_rate: DEFAULT_VAT_RATE,
  ...Object.fromEntries(FEE_KEYS.map((k) => [k, ''])) };

// Within a folder, split its cards by whether the act has been served — only
// cards carrying a service date reach the monthly CNSS list, so "Not served" is
// the office's worklist.
const hasTabligh = (card) => String(card.date_tabligh || '').trim() !== '';
const TABLIGH_FILTERS = [
  { k: 'all',     l: 'All',        match: () => true },
  { k: 'with',    l: 'Served',     match: hasTabligh },
  { k: 'without', l: 'Not served', match: (c) => !hasTabligh(c) },
];

export default function RegistreCNSSDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [company, setCompany] = useState(EMPTY_COMPANY);
  const [cards, setCards]     = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  // Card add/edit modal
  const [showCardModal, setShowCardModal]   = useState(false);
  const [editingCardId, setEditingCardId]   = useState(null);
  const [cardForm, setCardForm]             = useState(EMPTY_CARD);
  const [showFees, setShowFees]             = useState(false);

  // Cards table filter: all / served (has a service date) / not served.
  const [tablighFilter, setTablighFilter]   = useState('all');

  // When creating a new company from an AI-scanned paper, keep the extracted
  // card aside and save it automatically right after the company is created.
  const [pendingCard, setPendingCard] = useState(null);

  const [isAILoading, setIsAILoading] = useState(false);
  const fileInputRef = useRef(null);

  // Scanning/uploading the NEXT liquidation card — auto-creates its own record and jumps
  // there, so the user can keep digitising cards without going back to the list.
  const [creatingFromCard, setCreatingFromCard] = useState(null);
  const newCardInputRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      const { cards: c, ...comp } = json;
      setCompany({ ...EMPTY_COMPANY, ...comp });
      setCards(c || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [id, isNew]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setField = (k, v) => setCompany(prev => ({ ...prev, [k]: v }));

  const saveCompany = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(isNew ? API : `${API}/${id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(company)
      });
      const result = await res.json();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      if (isNew) {
        const newId = result.id_cn;
        // Auto-save the AI-extracted card, if any, against the new company.
        if (newId && pendingCard) {
          await fetch(`${API}/${newId}/cards`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(pendingCard)
          });
          setPendingCard(null);
        }
        if (newId) navigate(`/cnss/${newId}`, { replace: true });
      } else {
        fetchData();
      }
    } catch (err) { console.error(err); alert('Error while saving'); }
    setSaving(false);
  };

  const deleteCompany = async () => {
    if (!window.confirm('Permanently delete this debtor and every liquidation card attached to it?')) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) navigate('/cnss');
    } catch (e) { console.error(e); }
  };

  // ── Cards ──
  const openNewCard = () => { setEditingCardId(null); setCardForm(EMPTY_CARD); setShowCardModal(true); };
  const openEditCard = (card) => {
    setEditingCardId(card.id_cn_oe);
    setCardForm({ ...EMPTY_CARD, ...card });
    setShowCardModal(true);
  };

  const setCardField = (k, v) => {
    setCardForm(prev => {
      const next = { ...prev, [k]: v };
      // Auto-fill the penalty date when the quarter changes.
      if (k === 'semestre') next.datesins = deriveDatesins(v) || prev.datesins;
      return next;
    });
  };

  const saveCard = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    // fee_aqm (VAT) is derived from the Fees subtotal × vat_rate — persist the
    // computed value so the stored row matches what the act renders.
    const payload = { ...cardForm, fee_aqm: String(vatMillimes(cardForm)), vat_rate: String(vatRateOf(cardForm)) };
    const send = (body) => fetch(
      editingCardId ? `${API}/cards/${editingCardId}` : `${API}/${id}/cards`,
      {
        method: editingCardId ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );
    try {
      let res = await send(payload);
      // A new card whose card number is already on file — keep it or cancel.
      if (res.status === 409) {
        const info = await res.json();
        if (!info.duplicate || !window.confirm(duplicateMessage(info))) return;
        res = await send({ ...payload, force: 1 });
      }
      if (res.ok) { setShowCardModal(false); fetchData(); }
      else { const err = await res.json(); alert('Error: ' + (err.error || 'Could not save the card')); }
    } catch (err) { console.error(err); }
  };

  // Inline edit of a single card field straight from the cards table (used for
  // the service date). Optimistic local update + persist.
  const saveCardField = async (cardId, patch) => {
    setCards(prev => prev.map(c => c.id_cn_oe === cardId ? { ...c, ...patch } : c));
    const token = localStorage.getItem('token');
    try {
      await fetch(`${API}/cards/${cardId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch (e) { console.error(e); }
  };

  const deleteCard = async (cardId) => {
    if (!window.confirm('Delete this liquidation card?')) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/cards/${cardId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) fetchData();
    } catch (e) { console.error(e); }
  };

  // ── AI extraction from the état de liquidation ──
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsAILoading(true);
    const token = localStorage.getItem('token');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/ai/extract-cnss`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      const result = await res.json();
      if (result.success && result.data) {
        const d = result.data;
        // Prefill the company fields.
        setCompany(prev => ({
          ...prev,
          nom_cl2: d.nom_cl2 || prev.nom_cl2,
          cl2_adresse: d.cl2_adresse || prev.cl2_adresse,
          numcnss: d.numcnss || prev.numcnss,
          codeng: d.codeng || prev.codeng,
        }));
        // Build the extracted card.
        const card = {
          ...EMPTY_CARD,
          numcarte: d.numcarte || '',
          datecarte: d.datecarte || '',
          semestre: d.semestre || '',
          dette: d.dette || '',
          datesins: deriveDatesins(d.semestre) || '',
        };
        if (isNew) {
          // Save it automatically when the new company is saved.
          setPendingCard(card);
          alert('Data extracted. Review the debtor and press Save — the liquidation card will be added automatically.');
        } else {
          // Open the card modal prefilled for review.
          setEditingCardId(null);
          setCardForm(card);
          setShowCardModal(true);
        }
      } else {
        alert('Extraction failed: ' + (result.error || ''));
      }
    } catch (err) {
      console.error('Extraction error:', err);
      alert('Could not reach the AI service');
    }
    setIsAILoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Scan / upload the NEXT liquidation card → auto-create a new record ──
  // Mirrors the list page so the user can keep scanning cards back-to-back.
  const submitNewCard = async (fileOrBlob, filename) => {
    setCreatingFromCard('Reading the card and creating the file…');
    try {
      const { id_cn } = await createRecordFromCard(fileOrBlob, filename);
      if (String(id_cn) === String(id)) fetchData();   // same record — just refresh
      else navigate(`/cnss/${id_cn}`);
    } catch (e) {
      console.error(e);
      alert('Could not create the file: ' + e.message);
    } finally {
      setCreatingFromCard(null);
    }
  };

  const handleScanNewCard = async () => {
    setCreatingFromCard('Scanning…');
    try {
      const blob = await scanCardFromBridge();
      await submitNewCard(blob, 'scan.jpg');
    } catch (err) {
      console.error('Scan error:', err);
      const offline = err instanceof TypeError;
      setCreatingFromCard(null);
      alert(offline
        ? 'Could not reach the scanner.\nDownload the Scan Bridge from Settings, run it once, and check the device is connected.'
        : ('Scanning error: ' + err.message));
    }
  };

  const handleUploadNewCard = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const payload = file.type.startsWith('image/') ? await compressImage(file) : file;
      await submitNewCard(payload, file.name);
    } catch (err) {
      alert('Error processing the file: ' + err.message);
    }
    if (e.target) e.target.value = '';
  };

  // ── Generate the notification act (Word document) ──
  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const generateAct = async (card) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/cards/${card.id_cn_oe}/act.docx`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const err = await res.json().catch(() => ({})); alert('Act generation failed: ' + (err.error || res.status)); return; }
      downloadBlob(await res.blob(), `act_${card.numcarte || card.id_cn_oe}.docx`);
    } catch (e) { console.error(e); alert('Could not reach the server'); }
  };

  const generateAllActs = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/${id}/acts.docx`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const err = await res.json().catch(() => ({})); alert('Act generation failed: ' + (err.error || res.status)); return; }
      downloadBlob(await res.blob(), `acts_${company.nom_cl2 || id}.docx`);
    } catch (e) { console.error(e); alert('Could not reach the server'); }
  };

  if (loading) return <div style={{ padding: '4rem', textAlign: 'center', opacity: 0.5 }}>Loading…</div>;

  const visibleCards = cards.filter(TABLIGH_FILTERS.find(f => f.k === tablighFilter).match);

  const fields = [
    { key: 'ref', label: 'Ref. no.', placeholder: 'auto', readonly: true },
    { key: 'nom_cl2', label: 'Debtor name', auto: true },
    { key: 'numcnss', label: 'CNSS affiliation number' },
    { key: 'codeng', label: 'Affiliation code' },
    { key: 'cl2_adresse', label: 'Address' },
    { key: 'cl2_adresse2', label: 'Address (cont.)' },
    { key: 'cl2_profession', label: 'Trade / activity' },
    { key: 'tribunal', label: 'Court' },
  ];

  return (
    <div className="animate-fade" dir="ltr">
      {/* ── Processing overlay (scanning the next card → auto-create) ── */}
      {creatingFromCard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass" style={{ padding: '2rem 3rem', textAlign: 'center', direction: 'ltr' }}>
            <div style={{ width: 36, height: 36, margin: '0 auto 1rem', border: '3px solid var(--card-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'cnss-spin 0.8s linear infinite' }} />
            <div style={{ fontSize: '1rem', color: 'var(--primary)' }}>{creatingFromCard}</div>
          </div>
          <style dangerouslySetInnerHTML={{ __html: '@keyframes cnss-spin { to { transform: rotate(360deg); } }' }} />
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="topbar no-print" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-main)' }} onClick={() => navigate('/cnss')}>
            <ArrowLeft size={18} /> Back
          </button>
          <h2 style={{ color: 'var(--primary)', margin: 0 }}>
            {isNew ? 'New debtor' : `Debtor #${company.ref}`} {company.nom_cl2 && <span style={{ opacity: 0.7, fontSize: '0.9em' }}>— {company.nom_cl2}</span>}
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,application/pdf" onChange={handleFileUpload} />
          <button className="btn" style={{ background: 'var(--card-bg)', border: '1px solid var(--primary)', color: 'var(--primary)' }}
            onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={isAILoading}>
            {isAILoading ? 'Reading…' : <><UploadCloud size={18} /> Smart scan of liquidation statement</>}
          </button>
          {!isNew && cards.length > 0 && (
            <button className="btn" onClick={generateAllActs} title="Generate every act in one Word file">
              <FileText size={18} /> Generate all acts
            </button>
          )}
        </div>
      </div>

      {/* ── Company form ── */}
      <div className="glass" style={{ padding: '2rem' }}>
        <form onSubmit={saveCompany}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {fields.map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{f.label}</label>
                {f.auto ? (
                  <AutocompleteInput value={company[f.key] || ''} onChange={(e) => setField(f.key, e.target.value)}
                    className="glass" style={{ padding: '0.6rem', background: 'transparent', border: 'none', color: 'var(--text-main)' }} />
                ) : (
                  <input type="text" value={company[f.key] || ''} readOnly={f.readonly} placeholder={f.placeholder}
                    onChange={(e) => setField(f.key, e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', opacity: f.readonly ? 0.6 : 1 }} />
                )}
              </div>
            ))}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Status</label>
              <select value={company.status || 'has_deposit'} onChange={(e) => setField('status', e.target.value)} style={{ width: '100%', padding: '0.6rem' }}>
                {Object.entries(STATUS_MAP).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
              </select>
            </div>
          </div>

          {pendingCard && (
            <div className="glass" style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid var(--primary)', fontSize: '0.9rem' }}>
              Extracted liquidation card awaiting save: no. {pendingCard.numcarte || '—'} — quarter {pendingCard.semestre || '—'} — amount {fmtDinar(pendingCard.dette)} TND.
              It will be saved automatically when you save the debtor.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem', gap: '1rem' }}>
            {!isNew && (
              <button type="button" className="btn" style={{ background: '#ef444420', color: '#ef4444' }} onClick={deleteCompany}>
                <Trash2 size={18} /> Delete
              </button>
            )}
            <button type="submit" className="btn" disabled={saving}>
              {saved ? <Check size={18} /> : <Save size={18} />} {saving ? 'Saving…' : (isNew ? 'Save debtor' : (saved ? 'Saved!' : 'Save changes'))}
            </button>
          </div>
        </form>
      </div>

      {/* ── Liquidation cards ── */}
      {!isNew && (
        <div className="glass" style={{ marginTop: '1.5rem', padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--primary)' }}>
                <Plus size={20} />
                <h3 style={{ margin: 0 }}>Liquidation cards</h3>
              </div>
              {/* ── Service-date filter ── */}
              <div className="no-print" style={{ display: 'flex', gap: '0.25rem', padding: '0.2rem',
                border: '1px solid var(--card-border)', borderRadius: '999px' }}>
                {TABLIGH_FILTERS.map(f => {
                  const on = tablighFilter === f.k;
                  return (
                    <button key={f.k} type="button" onClick={() => setTablighFilter(f.k)}
                      title="Filter this file's cards by service date"
                      style={{ padding: '0.3rem 0.75rem', borderRadius: '999px', border: 'none', cursor: 'pointer',
                        fontSize: '0.8rem', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        background: on ? 'var(--primary)' : 'transparent',
                        color: on ? '#fff' : 'var(--text-muted)' }}>
                      {f.l} ({cards.filter(f.match).length})
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="no-print" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="file" ref={newCardInputRef} style={{ display: 'none' }} accept="image/*,application/pdf" onChange={handleUploadNewCard} />
              <button className="btn" style={{ background: 'var(--primary)' }} onClick={handleScanNewCard} disabled={!!creatingFromCard}
                title="Scan a new liquidation card and create a new debtor file">
                <ScanLine size={18} /> Scan next card
              </button>
              <button className="btn" onClick={() => newCardInputRef.current && newCardInputRef.current.click()} disabled={!!creatingFromCard}
                title="Upload a new liquidation card and create a new debtor file">
                <UploadCloud size={18} /> Upload next card
              </button>
              <button className="btn" onClick={openNewCard}><Plus size={18} /> Add card</button>
            </div>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Card no.</th>
                  <th>Quarter</th>
                  <th>Principal debt (TND)</th>
                  <th>Card date</th>
                  <th>Penalty start</th>
                  <th>Service date</th>
                  <th>File no.</th>
                  <th className="no-print">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleCards.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', opacity: 0.5, padding: '2rem' }}>
                    {cards.length === 0
                      ? 'No liquidation cards — add one or use the smart scan'
                      : 'No cards match this filter'}
                  </td></tr>
                ) : visibleCards.map(card => (
                  <tr key={card.id_cn_oe}>
                    <td style={{ fontWeight: 600 }}>{card.numcarte || '—'}</td>
                    <td>{card.semestre || '—'}</td>
                    <td style={{ color: 'var(--primary)', fontWeight: 700 }}>{fmtDinar(card.dette)}</td>
                    <td>{card.datecarte || '—'}</td>
                    <td>{card.datesins || '—'}</td>
                    <td>
                      <input type="date" value={toISODate(card.date_tabligh)}
                        onChange={(e) => saveCardField(card.id_cn_oe, { date_tabligh: e.target.value })}
                        title="Date the act was served — used in the monthly list"
                        style={{ padding: '0.3rem 0.4rem', borderRadius: '6px', fontSize: '0.85rem' }} />
                    </td>
                    <td>{card.nbrreg || '—'}</td>
                    <td className="no-print">
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn-icon" title="Generate act (Word)" style={{ color: 'var(--primary)' }} onClick={() => generateAct(card)}>
                          <FileText size={16} />
                        </button>
                        <button className="btn-icon" title="Edit" style={{ color: 'var(--text-main)' }} onClick={() => openEditCard(card)}>
                          <Edit size={16} />
                        </button>
                        <button className="btn-icon" title="Delete" style={{ color: '#ef4444' }} onClick={() => deleteCard(card.id_cn_oe)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Card modal ── */}
      {showCardModal && (
        <div className="modal-overlay no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass card animate-scale" style={{ width: 620, maxWidth: '100%', padding: '2rem', maxHeight: '95vh', overflowY: 'auto', borderRadius: '16px' }} dir="ltr">
            <h3 style={{ color: 'var(--primary)', marginBottom: '1.5rem', textAlign: 'center' }}>
              {editingCardId ? 'Edit liquidation card' : 'Add liquidation card'}
            </h3>
            <form onSubmit={saveCard} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
              {[
                { k: 'numcarte', l: 'Liquidation card no.' },
                { k: 'datecarte', l: 'Card date', ph: 'YYYY-MM-DD' },
                { k: 'semestre', l: 'Quarter', ph: '04/2021' },
                { k: 'dette', l: 'Principal debt (TND)', ph: '2959.306' },
                { k: 'pourcentage', l: 'Monthly penalty rate (%)' },
                { k: 'datesins', l: 'Penalty start date (auto)' },
                { k: 'nbrreg', l: 'File no. (entry in execution register)' },
              ].map(f => (
                <div key={f.k}>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', opacity: 0.8 }}>{f.l}</label>
                  <input type="text" value={cardForm[f.k] || ''} placeholder={f.ph || ''}
                    onChange={(e) => setCardField(f.k, e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px' }} />
                </div>
              ))}

              {/* ── Fee statement for the act (collapsed by default) ── */}
              <div style={{ gridColumn: 'span 2', borderTop: '1px solid var(--card-border)', paddingTop: '0.9rem', marginTop: '0.25rem' }}>
                <button type="button" onClick={() => setShowFees((v) => !v)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--primary)', fontWeight: 600 }}>
                    {showFees ? <ChevronDown size={18} /> : <ChevronLeft size={18} />} Fees
                  </span>
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    Total <strong style={{ color: 'var(--primary)' }} dir="ltr">{formatDinar(grandTotalMillimes(cardForm))}</strong> TND
                  </span>
                </button>

                {showFees && (() => {
                  const ajr = ajrTotalMillimes(cardForm);
                  const vat = vatMillimes(cardForm);
                  const exp = expTotalMillimes(cardForm);
                  const sectionHeader = (label) => (
                    <div style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', background: 'var(--surface-2)', borderBottom: '1px solid var(--card-border)' }}>{label}</div>
                  );
                  const feeRow = (f) => {
                    const mm = toMillimes(cardForm[f.k]);
                    return (
                      <div key={f.k} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.3rem 0.85rem', borderBottom: '1px solid var(--card-border)' }}>
                        <label style={{ flex: 1, fontSize: '0.85rem' }}>{f.l}</label>
                        <input type="text" inputMode="numeric" value={cardForm[f.k] || ''} placeholder="0"
                          onChange={(e) => setCardField(f.k, e.target.value.replace(/[^\d]/g, ''))}
                          style={{ width: 110, padding: '0.35rem 0.5rem', borderRadius: '6px', textAlign: 'center' }} />
                        <span style={{ width: 92, textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-muted)' }} dir="ltr">{mm ? formatDinar(mm) : '—'}</span>
                      </div>
                    );
                  };
                  const subtotalRow = (label, mm) => (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.85rem', borderBottom: '1px solid var(--card-border)', fontSize: '0.82rem', fontWeight: 600 }}>
                      <span style={{ opacity: 0.85 }}>{label}</span>
                      <span dir="ltr">{formatDinar(mm)} TND</span>
                    </div>
                  );
                  return (
                  <div style={{ marginTop: '0.85rem', border: '1px solid var(--card-border)', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', padding: '0.35rem 0.85rem', fontSize: '0.72rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--card-border)' }}>
                      <span style={{ flex: 1 }}>Item</span><span style={{ width: 110, textAlign: 'center' }}>Amount (millimes)</span><span style={{ width: 92, textAlign: 'left' }}>TND</span>
                    </div>

                    {/* ── Fees (VAT base) ── */}
                    {sectionHeader('Fees')}
                    {AJR_FIELDS.map(feeRow)}
                    {subtotalRow('Total fees', ajr)}

                    {/* ── VAT — rate editable, amount derived ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.3rem 0.85rem', borderBottom: '1px solid var(--card-border)' }}>
                      <label style={{ flex: 1, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        VAT
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
                          (<input type="text" inputMode="decimal" value={cardForm.vat_rate ?? ''} placeholder={DEFAULT_VAT_RATE}
                            onChange={(e) => setCardField('vat_rate', e.target.value.replace(/[^\d.,]/g, ''))}
                            style={{ width: 44, padding: '0.15rem 0.3rem', borderRadius: '6px', textAlign: 'center', fontSize: '0.8rem' }} />%)
                        </span>
                      </label>
                      <span style={{ width: 110, textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{vat ? vat : '—'}</span>
                      <span style={{ width: 92, textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-muted)' }} dir="ltr">{vat ? formatDinar(vat) : '—'}</span>
                    </div>

                    {/* ── Expenses (no VAT) ── */}
                    {sectionHeader('Expenses')}
                    {EXP_FIELDS.map(feeRow)}
                    {subtotalRow('Total expenses', exp)}

                    {/* ── grand total ── */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.85rem', background: 'var(--surface-2)', fontWeight: 700 }}>
                      <span>Grand total</span>
                      <span style={{ color: 'var(--primary)' }} dir="ltr">{formatDinar(ajr + vat + exp)} TND</span>
                    </div>
                  </div>
                  );
                })()}
              </div>

              <div style={{ gridColumn: 'span 2', display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn" style={{ flex: 1 }}>{editingCardId ? 'Save changes' : 'Add card'}</button>
                <button type="button" className="btn" style={{ flex: 1, background: 'var(--surface-2)' }} onClick={() => setShowCardModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .btn-icon { background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0.7; padding: 0.3rem; }
        .btn-icon:hover { opacity: 1; }
      `}} />
    </div>
  );
}
