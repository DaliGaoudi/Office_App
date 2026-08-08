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

// "تاريخ احتساب الخطايا" follows the quarter: the 16th of the month after the
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
// millimes (1 د.ت = 1000 مليم). VAT (أ ق م) is applied to the الأجور section only.
//   الأجور  → VAT-bearing base.
//   مصاريف  → no VAT.
const AJR_FIELDS = [
  { k: 'fee_original', l: 'أصل المحضر' },
  { k: 'fee_counterparts', l: 'النظائر' },
  { k: 'fee_legal_copy', l: 'النسخة القانونية' },
  { k: 'fee_office_copy', l: 'النسخة المكتبية' },
  { k: 'fee_movement', l: 'التوجه' },
  { k: 'fee_copies', l: 'نسخ الأوراق' },
];
const EXP_FIELDS = [
  { k: 'fee_travel', l: 'التنقل' },
  { k: 'fee_registration', l: 'التسجيل' },
  { k: 'fee_stamp', l: 'الترسيم' },
  { k: 'fee_post', l: 'البريد' },
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

// Within a folder, split its cards by whether the محضر has been delivered — only
// cards carrying a تاريخ التبليغ reach the monthly CNSS list, so "غير مُبلَّغة" is
// the office's worklist.
const hasTabligh = (card) => String(card.date_tabligh || '').trim() !== '';
const TABLIGH_FILTERS = [
  { k: 'all',     l: 'الكل',        match: () => true },
  { k: 'with',    l: 'مُبلَّغة',      match: hasTabligh },
  { k: 'without', l: 'غير مُبلَّغة',  match: (c) => !hasTabligh(c) },
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

  // Cards table filter: all / delivered (has تاريخ التبليغ) / not delivered.
  const [tablighFilter, setTablighFilter]   = useState('all');

  // When creating a new company from an AI-scanned paper, keep the extracted
  // card aside and save it automatically right after the company is created.
  const [pendingCard, setPendingCard] = useState(null);

  const [isAILoading, setIsAILoading] = useState(false);
  const fileInputRef = useRef(null);

  // Scanning/uploading the NEXT بطاقة جبر — auto-creates its own record and jumps
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
    } catch (err) { console.error(err); alert('خطأ أثناء الحفظ'); }
    setSaving(false);
  };

  const deleteCompany = async () => {
    if (!window.confirm('حذف هذا المطلوب وكل بطاقات الجبر المرتبطة به نهائياً؟')) return;
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
    // fee_aqm (VAT) is derived from the الأجور subtotal × vat_rate — persist the
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
      // A new card whose عدد البطاقة is already on file — keep it or cancel.
      if (res.status === 409) {
        const info = await res.json();
        if (!info.duplicate || !window.confirm(duplicateMessage(info))) return;
        res = await send({ ...payload, force: 1 });
      }
      if (res.ok) { setShowCardModal(false); fetchData(); }
      else { const err = await res.json(); alert('خطأ: ' + (err.error || 'فشل حفظ البطاقة')); }
    } catch (err) { console.error(err); }
  };

  // Inline edit of a single card field straight from the cards table (used for
  // تاريخ التبليغ). Optimistic local update + persist.
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
    if (!window.confirm('حذف بطاقة الجبر هذه؟')) return;
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
          alert('تم استخراج البيانات. راجِع المطلوب واضغط «حفظ» — ستُضاف بطاقة الجبر تلقائياً.');
        } else {
          // Open the card modal prefilled for review.
          setEditingCardId(null);
          setCardForm(card);
          setShowCardModal(true);
        }
      } else {
        alert('فشلت عملية الاستخراج: ' + (result.error || ''));
      }
    } catch (err) {
      console.error('Extraction error:', err);
      alert('خطأ في الاتصال بخادم الذكاء الاصطناعي');
    }
    setIsAILoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Scan / upload the NEXT بطاقة جبر → auto-create a new record ──
  // Mirrors the list page so the user can keep scanning cards back-to-back.
  const submitNewCard = async (fileOrBlob, filename) => {
    setCreatingFromCard('جاري قراءة البطاقة وإنشاء الملف…');
    try {
      const { id_cn } = await createRecordFromCard(fileOrBlob, filename);
      if (String(id_cn) === String(id)) fetchData();   // same record — just refresh
      else navigate(`/cnss/${id_cn}`);
    } catch (e) {
      console.error(e);
      alert('تعذّر إنشاء الملف: ' + e.message);
    } finally {
      setCreatingFromCard(null);
    }
  };

  const handleScanNewCard = async () => {
    setCreatingFromCard('جاري المسح الضوئي…');
    try {
      const blob = await scanCardFromBridge();
      await submitNewCard(blob, 'scan.jpg');
    } catch (err) {
      console.error('Scan error:', err);
      const offline = err instanceof TypeError;
      setCreatingFromCard(null);
      alert(offline
        ? 'تعذّر الوصول إلى الماسح الضوئي.\nنزّل «أداة المسح الضوئي» من الإعدادات وشغّلها مرة واحدة، وتأكّد من توصيل الجهاز.'
        : ('خطأ في المسح الضوئي: ' + err.message));
    }
  };

  const handleUploadNewCard = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const payload = file.type.startsWith('image/') ? await compressImage(file) : file;
      await submitNewCard(payload, file.name);
    } catch (err) {
      alert('خطأ في معالجة الملف: ' + err.message);
    }
    if (e.target) e.target.value = '';
  };

  // ── Generate the "محضر إعلام بطاقة جبر" Word document ──
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
      if (!res.ok) { const err = await res.json().catch(() => ({})); alert('فشل توليد المحضر: ' + (err.error || res.status)); return; }
      downloadBlob(await res.blob(), `محضر_${card.numcarte || card.id_cn_oe}.docx`);
    } catch (e) { console.error(e); alert('خطأ في الاتصال بالخادم'); }
  };

  const generateAllActs = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/${id}/acts.docx`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const err = await res.json().catch(() => ({})); alert('فشل توليد المحاضر: ' + (err.error || res.status)); return; }
      downloadBlob(await res.blob(), `محاضر_${company.nom_cl2 || id}.docx`);
    } catch (e) { console.error(e); alert('خطأ في الاتصال بالخادم'); }
  };

  if (loading) return <div style={{ padding: '4rem', textAlign: 'center', opacity: 0.5 }}>جاري التحميل...</div>;

  const visibleCards = cards.filter(TABLIGH_FILTERS.find(f => f.k === tablighFilter).match);

  const fields = [
    { key: 'ref', label: 'العدد الترتيبي', placeholder: 'تلقائي', readonly: true },
    { key: 'nom_cl2', label: 'اسم المطلوب', auto: true },
    { key: 'numcnss', label: 'عدد الإنخراط بالصندوق' },
    { key: 'codeng', label: 'رمز الإنخراط' },
    { key: 'cl2_adresse', label: 'العنوان' },
    { key: 'cl2_adresse2', label: 'تكملة العنوان' },
    { key: 'cl2_profession', label: 'المهنة / النشاط' },
    { key: 'tribunal', label: 'المحكمة' },
  ];

  return (
    <div className="animate-fade" dir="rtl">
      {/* ── Processing overlay (scanning the next card → auto-create) ── */}
      {creatingFromCard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass" style={{ padding: '2rem 3rem', textAlign: 'center', direction: 'rtl' }}>
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
            <ArrowLeft size={18} /> رجوع
          </button>
          <h2 style={{ color: 'var(--primary)', margin: 0 }}>
            {isNew ? 'مطلوب جديد' : `المطلوب #${company.ref}`} {company.nom_cl2 && <span style={{ opacity: 0.7, fontSize: '0.9em' }}>— {company.nom_cl2}</span>}
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,application/pdf" onChange={handleFileUpload} />
          <button className="btn" style={{ background: 'var(--card-bg)', border: '1px solid var(--primary)', color: 'var(--primary)' }}
            onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={isAILoading}>
            {isAILoading ? 'جاري القراءة...' : <><UploadCloud size={18} /> مسح ذكي لحالة التصفية</>}
          </button>
          {!isNew && cards.length > 0 && (
            <button className="btn" onClick={generateAllActs} title="توليد كل المحاضر في ملف Word واحد">
              <FileText size={18} /> توليد كل المحاضر
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
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>الحالة</label>
              <select value={company.status || 'has_deposit'} onChange={(e) => setField('status', e.target.value)} style={{ width: '100%', padding: '0.6rem' }}>
                {Object.entries(STATUS_MAP).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
              </select>
            </div>
          </div>

          {pendingCard && (
            <div className="glass" style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid var(--primary)', fontSize: '0.9rem' }}>
              بطاقة جبر مُستخرجة بانتظار الحفظ: عدد {pendingCard.numcarte || '—'} — الثلاثية {pendingCard.semestre || '—'} — المبلغ {fmtDinar(pendingCard.dette)} د.ت.
              ستُحفظ تلقائياً عند حفظ المطلوب.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem', gap: '1rem' }}>
            {!isNew && (
              <button type="button" className="btn" style={{ background: '#ef444420', color: '#ef4444' }} onClick={deleteCompany}>
                <Trash2 size={18} /> حذف
              </button>
            )}
            <button type="submit" className="btn" disabled={saving}>
              {saved ? <Check size={18} /> : <Save size={18} />} {saving ? 'جاري الحفظ...' : (isNew ? 'حفظ المطلوب' : (saved ? 'تم الحفظ!' : 'حفظ التعديلات'))}
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
                <h3 style={{ margin: 0 }}>بطاقات الجبر</h3>
              </div>
              {/* ── تاريخ التبليغ filter ── */}
              <div className="no-print" style={{ display: 'flex', gap: '0.25rem', padding: '0.2rem',
                border: '1px solid var(--card-border)', borderRadius: '999px' }}>
                {TABLIGH_FILTERS.map(f => {
                  const on = tablighFilter === f.k;
                  return (
                    <button key={f.k} type="button" onClick={() => setTablighFilter(f.k)}
                      title="تصفية بطاقات هذا الملف حسب تاريخ التبليغ"
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
                title="مسح بطاقة جبر جديدة وإنشاء ملف مطلوب جديد">
                <ScanLine size={18} /> مسح بطاقة جبر تالية
              </button>
              <button className="btn" onClick={() => newCardInputRef.current && newCardInputRef.current.click()} disabled={!!creatingFromCard}
                title="رفع بطاقة جبر جديدة وإنشاء ملف مطلوب جديد">
                <UploadCloud size={18} /> رفع بطاقة جبر تالية
              </button>
              <button className="btn" onClick={openNewCard}><Plus size={18} /> إضافة بطاقة</button>
            </div>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>عدد البطاقة</th>
                  <th>الثلاثية</th>
                  <th>أصل الدين (د.ت)</th>
                  <th>تاريخ البطاقة</th>
                  <th>تاريخ احتساب الخطايا</th>
                  <th>تاريخ التبليغ</th>
                  <th>عدد الملف</th>
                  <th className="no-print">عمل</th>
                </tr>
              </thead>
              <tbody>
                {visibleCards.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', opacity: 0.5, padding: '2rem' }}>
                    {cards.length === 0
                      ? 'لا توجد بطاقات جبر — أضف بطاقة أو استعمل «المسح الذكي»'
                      : 'لا توجد بطاقات مطابقة لهذه التصفية'}
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
                        title="تاريخ تبليغ المحضر — يُستعمل في القائمة الشهرية"
                        style={{ padding: '0.3rem 0.4rem', borderRadius: '6px', fontSize: '0.85rem' }} />
                    </td>
                    <td>{card.nbrreg || '—'}</td>
                    <td className="no-print">
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn-icon" title="توليد المحضر (Word)" style={{ color: 'var(--primary)' }} onClick={() => generateAct(card)}>
                          <FileText size={16} />
                        </button>
                        <button className="btn-icon" title="تعديل" style={{ color: 'var(--text-main)' }} onClick={() => openEditCard(card)}>
                          <Edit size={16} />
                        </button>
                        <button className="btn-icon" title="حذف" style={{ color: '#ef4444' }} onClick={() => deleteCard(card.id_cn_oe)}>
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
          <div className="glass card animate-scale" style={{ width: 620, maxWidth: '100%', padding: '2rem', maxHeight: '95vh', overflowY: 'auto', borderRadius: '16px' }} dir="rtl">
            <h3 style={{ color: 'var(--primary)', marginBottom: '1.5rem', textAlign: 'center' }}>
              {editingCardId ? 'تعديل بطاقة جبر' : 'إضافة بطاقة جبر'}
            </h3>
            <form onSubmit={saveCard} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
              {[
                { k: 'numcarte', l: 'عدد بطاقة الجبر' },
                { k: 'datecarte', l: 'تاريخ بطاقة الجبر', ph: 'YYYY-MM-DD' },
                { k: 'semestre', l: 'الثلاثية', ph: '04/2021' },
                { k: 'dette', l: 'أصل الدين (د.ت)', ph: '2959.306' },
                { k: 'pourcentage', l: 'نسبة الخطية في الشهر (%)' },
                { k: 'datesins', l: 'تاريخ احتساب الخطايا (تلقائي)' },
                { k: 'nbrreg', l: 'عدد الملف (التضمين بدفتر التنفيذ)' },
              ].map(f => (
                <div key={f.k}>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', opacity: 0.8 }}>{f.l}</label>
                  <input type="text" value={cardForm[f.k] || ''} placeholder={f.ph || ''}
                    onChange={(e) => setCardField(f.k, e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px' }} />
                </div>
              ))}

              {/* ── الأجور — the act's fee statement (collapsed by default) ── */}
              <div style={{ gridColumn: 'span 2', borderTop: '1px solid var(--card-border)', paddingTop: '0.9rem', marginTop: '0.25rem' }}>
                <button type="button" onClick={() => setShowFees((v) => !v)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--primary)', fontWeight: 600 }}>
                    {showFees ? <ChevronDown size={18} /> : <ChevronLeft size={18} />} الأجور
                  </span>
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    المجموع <strong style={{ color: 'var(--primary)' }} dir="ltr">{formatDinar(grandTotalMillimes(cardForm))}</strong> د.ت
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
                      <span dir="ltr">{formatDinar(mm)} د.ت</span>
                    </div>
                  );
                  return (
                  <div style={{ marginTop: '0.85rem', border: '1px solid var(--card-border)', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', padding: '0.35rem 0.85rem', fontSize: '0.72rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--card-border)' }}>
                      <span style={{ flex: 1 }}>البيان</span><span style={{ width: 110, textAlign: 'center' }}>المبلغ (مليم)</span><span style={{ width: 92, textAlign: 'left' }}>د.ت</span>
                    </div>

                    {/* ── الأجور (VAT base) ── */}
                    {sectionHeader('الأجور')}
                    {AJR_FIELDS.map(feeRow)}
                    {subtotalRow('مجموع الأجور', ajr)}

                    {/* ── أ ق م (VAT) — rate editable, amount derived ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.3rem 0.85rem', borderBottom: '1px solid var(--card-border)' }}>
                      <label style={{ flex: 1, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        أ ق م
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
                          (<input type="text" inputMode="decimal" value={cardForm.vat_rate ?? ''} placeholder={DEFAULT_VAT_RATE}
                            onChange={(e) => setCardField('vat_rate', e.target.value.replace(/[^\d.,]/g, ''))}
                            style={{ width: 44, padding: '0.15rem 0.3rem', borderRadius: '6px', textAlign: 'center', fontSize: '0.8rem' }} />%)
                        </span>
                      </label>
                      <span style={{ width: 110, textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{vat ? vat : '—'}</span>
                      <span style={{ width: 92, textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-muted)' }} dir="ltr">{vat ? formatDinar(vat) : '—'}</span>
                    </div>

                    {/* ── مصاريف (no VAT) ── */}
                    {sectionHeader('مصاريف')}
                    {EXP_FIELDS.map(feeRow)}
                    {subtotalRow('مجموع المصاريف', exp)}

                    {/* ── grand total ── */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.85rem', background: 'var(--surface-2)', fontWeight: 700 }}>
                      <span>المجموع العام</span>
                      <span style={{ color: 'var(--primary)' }} dir="ltr">{formatDinar(ajr + vat + exp)} د.ت</span>
                    </div>
                  </div>
                  );
                })()}
              </div>

              <div style={{ gridColumn: 'span 2', display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn" style={{ flex: 1 }}>{editingCardId ? 'حفظ التعديلات' : 'إضافة البطاقة'}</button>
                <button type="button" className="btn" style={{ flex: 1, background: 'var(--surface-2)' }} onClick={() => setShowCardModal(false)}>إلغاء</button>
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
