import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Check, Plus, Trash2, Edit, UploadCloud, FileText, ScanLine, Unlink } from 'lucide-react';
import { CNSS_STATUS_MAP, CNSS_AWAITING_PRINT, TABLIGH_METHODS } from '../utils/formatters';
import API_BASE from '../config';
import AutocompleteInput from '../components/AutocompleteInput';
import { compressImage, scanCardFromBridge, createRecordFromCard, duplicateMessage } from '../utils/cnssScan';
import { SHARED_KEYS, selectionMismatches, mismatchText, conflictMessage } from '../utils/cnssActes';
import { validateCard, cardErrors, toLatinDigits, errorText } from '../utils/cnssValidate';
import { InlineCardText, InlineCardDate, CheckedCell } from '../components/CnssInlineCells';
import CnssCardModal from '../components/CnssCardModal';
import { EMPTY_CARD, vatMillimes, vatRateOf } from '../utils/cnssCardForm';

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
function deriveDatesins(semestre) {
  const m = /^\s*(\d{1,2})\s*\/\s*(\d{4})\s*$/.exec(toLatinDigits(semestre));
  if (!m) return '';
  const q = parseInt(m[1], 10);
  let y = parseInt(m[2], 10);
  const monthAfter = { 1: '04', 2: '07', 3: '10', 4: '01' }[q];
  if (!monthAfter) return '';
  if (q === 4) y += 1;
  return `16/${monthAfter}/${y}`;
}

const EMPTY_COMPANY = { ref: '', nom_cl2: '', cl2_adresse: '', cl2_adresse2: '', numcnss: '', codeng: '', cl2_profession: '', tribunal: '', tabligh_method: '', resultat: '', notes: '', status: CNSS_AWAITING_PRINT };

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
  const [actes, setActes]     = useState([]);   // محاضر of this مطلوب (cnss_acte rows)
  const [selectedIds, setSelectedIds] = useState([]);   // cards ticked for one محضر
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  // Card add/edit modal
  const [showCardModal, setShowCardModal]   = useState(false);
  const [editingCardId, setEditingCardId]   = useState(null);
  const [cardForm, setCardForm]             = useState(EMPTY_CARD);
  const [fieldErrors, setFieldErrors]       = useState({});   // field → message, shown under the input

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

  // `silent` refreshes in place (after generating a محضر) instead of blanking the page.
  const fetchData = useCallback(async (silent = false) => {
    if (isNew) return;
    if (!silent) setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      const { cards: c, ...comp } = json;
      setCompany({ ...EMPTY_COMPANY, ...comp });
      setCards(c || []);
      setActes(json.actes || []);
      // Drop ticks on cards that no longer exist.
      const ids = new Set((c || []).map((x) => x.id_cn_oe));
      setSelectedIds((prev) => prev.filter((x) => ids.has(x)));
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
  const openNewCard = () => { setEditingCardId(null); setCardForm(EMPTY_CARD); setFieldErrors({}); setShowCardModal(true); };
  const openEditCard = (card) => {
    setEditingCardId(card.id_cn_oe);
    setFieldErrors(cardErrors(card));   // a stored value that fails is pointed out straight away
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
    setFieldErrors(prev => {
      const { [k]: _, ...rest } = prev;
      return rest;
    });
  };

  const saveCard = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    // Same rules as the server (utils/cnssValidate.js): stop with each message under
    // its field, otherwise send the canonical values (Latin digits, DD/MM/YYYY, …).
    const { values, errors } = validateCard(cardForm);
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    const form = { ...cardForm, ...values };
    // fee_aqm (VAT) is derived from the الأجور subtotal × vat_rate — persist the
    // computed value so the stored row matches what the act renders.
    const payload = { ...form, fee_aqm: String(vatMillimes(form)), vat_rate: String(vatRateOf(form)) };
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
      if (res.ok) { setShowCardModal(false); fetchData(); return; }
      const err = await res.json().catch(() => ({}));
      if (res.status === 422 && err.fields) setFieldErrors(err.fields);
      else alert('خطأ: ' + (err.error || 'فشل حفظ البطاقة'));
    } catch (err) { console.error(err); }
  };

  // Inline edit of a single card field straight from the cards table (used for
  // تاريخ التبليغ). Optimistic local update + persist. عدد التضمين and تاريخ التبليغ
  // belong to the محضر, so the server copies them to its other cards — mirror that.
  // A refused edit (422) restores the previous values and says why.
  const saveCardField = async (cardId, patch) => {
    const before = cards;
    const acteId = cards.find(c => c.id_cn_oe === cardId)?.id_acte;
    const shared = Object.keys(patch).some(k => SHARED_KEYS.includes(k));
    const apply = (p) => setCards(prev => prev.map(c => (c.id_cn_oe === cardId || (shared && acteId != null && c.id_acte === acteId))
      ? { ...c, ...p } : c));
    apply(patch);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/cards/${cardId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setCards(before); alert(json.fields ? errorText(json.fields) : 'تعذّر الحفظ: ' + (json.error || res.status)); return; }
      if (json.values) apply(json.values);   // the server's canonical form (e.g. Latin digits)
    } catch (e) { console.error(e); setCards(before); alert('خطأ في الاتصال بالخادم'); }
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

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
  const errorOf = async (res) => (await res.json().catch(() => ({}))).error || res.status;

  // ── محاضر: one محضر can cover several cards (rules in utils/cnssActes.js) ──
  // POST cards as one محضر. A 409 is a warning (cards leaving another محضر,
  // differing تاريخ بطاقة الجبر): ask, then resend with force. A 422 is a refusal.
  const generateActe = async (cardIds, filename) => {
    const send = (force) => fetch(`${API}/${id}/actes`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_ids: cardIds, force }),
    });
    try {
      let res = await send(false);
      if (res.status === 409) {
        if (!window.confirm(conflictMessage(await res.json()))) return false;
        res = await send(true);
      }
      if (!res.ok) { alert('فشل توليد المحضر:\n' + await errorOf(res)); return false; }
      downloadBlob(await res.blob(), filename);
      fetchData(true);
      return true;
    } catch (e) { console.error(e); alert('خطأ في الاتصال بالخادم'); return false; }
  };

  const generateSelected = async () => {
    const chosen = cards.filter(c => selectedIds.includes(c.id_cn_oe));
    const name = chosen.map(c => c.numcarte || c.id_cn_oe).join('_');
    if (await generateActe(selectedIds, `محضر_${name}.docx`)) setSelectedIds([]);
  };

  const reprintActe = async (acte) => {
    try {
      const res = await fetch(`${API}/actes/${acte.id_acte}/act.docx`, { headers: authHeaders() });
      if (!res.ok) { alert('فشل توليد المحضر: ' + await errorOf(res)); return; }
      downloadBlob(await res.blob(), `محضر_${acte.numero}_${company.nom_cl2 || id}.docx`);
    } catch (e) { console.error(e); alert('خطأ في الاتصال بالخادم'); }
  };

  // A card already in a محضر reprints that محضر; a free card gets its own.
  const generateAct = (card) => {
    const acte = actes.find(a => a.id_acte === card.id_acte);
    return acte ? reprintActe(acte) : generateActe([card.id_cn_oe], `محضر_${card.numcarte || card.id_cn_oe}.docx`);
  };

  const dissolveActe = async (acte) => {
    if (!window.confirm(`إلغاء تجميع المحضر ${acte.numero}؟\nتعود بطاقاته حرّة ويمكن جمعها في محضر آخر. لا تُحذف أي بطاقة.`)) return;
    try {
      const res = await fetch(`${API}/actes/${acte.id_acte}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) { alert('تعذّر إلغاء التجميع: ' + await errorOf(res)); return; }
      fetchData(true);
    } catch (e) { console.error(e); alert('خطأ في الاتصال بالخادم'); }
  };

  // Every محضر in one file; cards not yet in a محضر each become a one-card محضر.
  const generateAllActs = async () => {
    try {
      const res = await fetch(`${API}/${id}/acts.docx`, { method: 'POST', headers: authHeaders() });
      if (!res.ok) { alert('فشل توليد المحاضر: ' + await errorOf(res)); return; }
      downloadBlob(await res.blob(), `محاضر_${company.nom_cl2 || id}.docx`);
      fetchData(true);
    } catch (e) { console.error(e); alert('خطأ في الاتصال بالخادم'); }
  };

  const toggleSelected = (cardId) => setSelectedIds(prev =>
    prev.includes(cardId) ? prev.filter(x => x !== cardId) : [...prev, cardId]);

  if (loading) return <div style={{ padding: '4rem', textAlign: 'center', opacity: 0.5 }}>جاري التحميل...</div>;

  const visibleCards = cards.filter(TABLIGH_FILTERS.find(f => f.k === tablighFilter).match);

  const acteById = Object.fromEntries(actes.map(a => [a.id_acte, a]));
  const acteSize = (acteId) => cards.filter(c => c.id_acte === acteId).length;
  const selectedCards = cards.filter(c => selectedIds.includes(c.id_cn_oe));
  const selectionBlocked = selectionMismatches(selectedCards);
  // Cards whose stored values fail validation: the server refuses to print them.
  const selectionInvalid = selectedCards.filter(c => Object.keys(cardErrors(c)).length);
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis' }).format(new Date());
  const allVisibleSelected = visibleCards.length > 0 && visibleCards.every(c => selectedIds.includes(c.id_cn_oe));
  const toggleAllVisible = () => {
    const visibleIds = visibleCards.map(c => c.id_cn_oe);
    setSelectedIds(prev => allVisibleSelected
      ? prev.filter(x => !visibleIds.includes(x))
      : [...new Set([...prev, ...visibleIds])]);
  };
  const editingActe = editingCardId && cardForm.id_acte != null ? acteById[cardForm.id_acte] : null;

  const fields = [
    { key: 'ref', label: 'العدد الترتيبي', placeholder: 'تلقائي', readonly: true },
    { key: 'nom_cl2', label: 'اسم المطلوب', auto: true },
    { key: 'numcnss', label: 'عدد الإنخراط بالصندوق' },
    { key: 'codeng', label: 'رمز الإنخراط' },
    { key: 'cl2_adresse', label: 'العنوان' },
    { key: 'cl2_adresse2', label: 'تكملة العنوان' },
    { key: 'cl2_profession', label: 'المهنة / النشاط' },
    { key: 'tribunal', label: 'المحكمة' },
    { key: 'tabligh_method', label: 'طريقة التبليغ', options: TABLIGH_METHODS, placeholder: '— غير محدّد —' },
    { key: 'resultat', label: 'المآل النهائي' },
    // Full width and last, so the الحالة select below it starts a fresh row.
    { key: 'notes', label: 'ملاحظات', textarea: true, span: true },
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
            <button className="btn" onClick={generateAllActs}
              title="كل المحاضر في ملف Word واحد — كل بطاقة غير تابعة لمحضر تصبح محضراً مستقلاً">
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
              <div key={f.key} style={f.span ? { gridColumn: 'span 2' } : null}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{f.label}</label>
                {f.auto ? (
                  <AutocompleteInput value={company[f.key] || ''} onChange={(e) => setField(f.key, e.target.value)}
                    className="glass" style={{ padding: '0.6rem', background: 'transparent', border: 'none', color: 'var(--text-main)' }} />
                ) : f.options ? (
                  <select value={company[f.key] || ''} onChange={(e) => setField(f.key, e.target.value)}
                    style={{ width: '100%', padding: '0.6rem' }}>
                    <option value="">{f.placeholder || '—'}</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.textarea ? (
                  <textarea value={company[f.key] || ''} placeholder={f.placeholder}
                    onChange={(e) => setField(f.key, e.target.value)} rows={3}
                    style={{ width: '100%', padding: '0.6rem', resize: 'vertical', fontFamily: 'inherit' }} />
                ) : (
                  <input type="text" value={company[f.key] || ''} readOnly={f.readonly} placeholder={f.placeholder}
                    onChange={(e) => setField(f.key, e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', opacity: f.readonly ? 0.6 : 1 }} />
                )}
              </div>
            ))}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>الحالة</label>
              <select value={company.status || CNSS_AWAITING_PRINT} onChange={(e) => setField('status', e.target.value)} style={{ width: '100%', padding: '0.6rem' }}>
                {Object.entries(CNSS_STATUS_MAP).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
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

          {/* ── Selection → one محضر ── */}
          {selectedIds.length > 0 && (
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
              padding: '0.6rem 0.9rem', marginBottom: '1rem', borderRadius: '10px',
              border: `1px solid ${selectionBlocked.length ? '#ef4444' : 'var(--primary)'}`, background: 'var(--surface-2)' }}>
              <strong>{selectedIds.length} بطاقة محددة</strong>
              {selectionBlocked.length > 0 ? (
                <span style={{ color: '#ef4444', fontSize: '0.85rem', flex: 1 }}>
                  لا يمكن جمعها في محضر واحد: {mismatchText(selectionBlocked)}
                </span>
              ) : selectionInvalid.length > 0 ? (
                <span style={{ color: '#ef4444', fontSize: '0.85rem', flex: 1 }}>
                  بيانات غير صالحة في البطاقات {selectionInvalid.map(c => c.numcarte || c.id_cn_oe).join('، ')} — صحّحها أولاً (⚠ في الجدول)
                </span>
              ) : <span style={{ flex: 1 }} />}
              <button className="btn" onClick={generateSelected} disabled={selectionBlocked.length > 0 || selectionInvalid.length > 0}
                title={selectionBlocked.length ? 'بطاقات المحضر الواحد يجب أن يكون لها نفس عدد التضمين ونفس تاريخ التبليغ' : 'محضر واحد يذكر كل البطاقات المحددة'}>
                <FileText size={18} /> توليد محضر للبطاقات المحددة
              </button>
              <button className="btn" style={{ background: 'transparent', border: '1px solid var(--card-border)', color: 'var(--text-main)' }}
                onClick={() => setSelectedIds([])}>إلغاء التحديد</button>
            </div>
          )}

          <div className="table-container">
            <table className="cnss-cards">
              <thead>
                <tr>
                  <th className="no-print" style={{ width: '2rem' }}>
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible}
                      disabled={visibleCards.length === 0} title="تحديد كل البطاقات الظاهرة" />
                  </th>
                  <th>عدد التضمين</th>
                  <th>عدد البطاقة</th>
                  <th>الثلاثية</th>
                  <th>أصل الدين (د.ت)</th>
                  <th>تاريخ البطاقة</th>
                  <th>تاريخ احتساب الخطايا</th>
                  <th>تاريخ التبليغ</th>
                  <th>المحضر</th>
                  <th className="no-print">عمل</th>
                </tr>
              </thead>
              <tbody>
                {visibleCards.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', opacity: 0.5, padding: '2rem' }}>
                    {cards.length === 0
                      ? 'لا توجد بطاقات جبر — أضف بطاقة أو استعمل «المسح الذكي»'
                      : 'لا توجد بطاقات مطابقة لهذه التصفية'}
                  </td></tr>
                ) : visibleCards.map(card => {
                  const acte = acteById[card.id_acte];
                  const errs = cardErrors(card);
                  return (
                  <tr key={card.id_cn_oe}>
                    <td className="no-print">
                      <input type="checkbox" checked={selectedIds.includes(card.id_cn_oe)}
                        onChange={() => toggleSelected(card.id_cn_oe)} title="تحديد البطاقة لجمعها في محضر" />
                    </td>
                    <td>
                      <InlineCardText value={card.nbrreg}
                        onCommit={(v) => saveCardField(card.id_cn_oe, { nbrreg: v })}
                        title="عدد التضمين بدفتر التنفيذ — يُحفظ عند الخروج من الخانة أو بالضغط على Enter"
                        placeholder="—" />
                    </td>
                    <td>{card.numcarte || '—'}</td>
                    <CheckedCell error={errs.semestre}>{card.semestre || '—'}</CheckedCell>
                    <CheckedCell error={errs.dette} style={{ color: 'var(--primary)', fontWeight: 700 }}>
                      {errs.dette ? card.dette : fmtDinar(card.dette)}
                    </CheckedCell>
                    <CheckedCell error={errs.datecarte}>{card.datecarte || '—'}</CheckedCell>
                    <CheckedCell error={errs.datesins}>{card.datesins || '—'}</CheckedCell>
                    <td title={errs.date_tabligh || undefined}>
                      <InlineCardDate key={card.date_tabligh || ''} card={card} max={todayISO}
                        onCommit={(v) => saveCardField(card.id_cn_oe, { date_tabligh: v })} />
                    </td>
                    <td>
                      {acte ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap' }}>
                          <span title={`عدد بطاقاته: ${acteSize(acte.id_acte)} — أُنشئ ${acte.date_ajout || ''}`}
                            style={{ padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600,
                              background: 'var(--surface-2)', border: '1px solid var(--primary)', color: 'var(--primary)' }}>
                            محضر {acte.numero}
                          </span>
                          <button className="btn-icon no-print" title="إلغاء تجميع هذا المحضر (تعود بطاقاته حرّة)"
                            style={{ color: 'var(--text-muted)' }} onClick={() => dissolveActe(acte)}>
                            <Unlink size={14} />
                          </button>
                        </div>
                      ) : <span style={{ opacity: 0.5 }}>—</span>}
                    </td>
                    <td className="no-print">
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn-icon" style={{ color: 'var(--primary)' }} onClick={() => generateAct(card)}
                          title={acte ? `إعادة طباعة المحضر ${acte.numero} (Word)` : 'توليد محضر لهذه البطاقة وحدها (Word)'}>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCardModal && (
        <CnssCardModal editing={!!editingCardId} acte={editingActe} acteCount={editingActe ? acteSize(editingActe.id_acte) : 0}
          form={cardForm} setField={setCardField} errors={fieldErrors}
          onSubmit={saveCard} onClose={() => setShowCardModal(false)} />
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .btn-icon { background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0.7; padding: 0.3rem; }
        .btn-icon:hover { opacity: 1; }
        /* Ten columns since the selection + المحضر columns: tighter cells keep عمل on screen. */
        .cnss-cards th, .cnss-cards td { padding: 0.75rem 0.55rem; }
      `}} />
    </div>
  );
}
