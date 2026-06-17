import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Check, Plus, Trash2, Edit, UploadCloud, FileText, Printer } from 'lucide-react';
import { STATUS_MAP } from '../utils/formatters';
import API_BASE from '../config';
import AutocompleteInput from '../components/AutocompleteInput';

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
const EMPTY_CARD = { numcarte: '', datecarte: '', semestre: '', dette: '', pourcentage: '1.5', datesins: '', nbrreg: '' };

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

  // When creating a new company from an AI-scanned paper, keep the extracted
  // card aside and save it automatically right after the company is created.
  const [pendingCard, setPendingCard] = useState(null);

  const [isAILoading, setIsAILoading] = useState(false);
  const fileInputRef = useRef(null);

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
    try {
      const res = await fetch(
        editingCardId ? `${API}/cards/${editingCardId}` : `${API}/${id}/cards`,
        {
          method: editingCardId ? 'PUT' : 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(cardForm)
        }
      );
      if (res.ok) { setShowCardModal(false); fetchData(); }
      else { const err = await res.json(); alert('خطأ: ' + (err.error || 'فشل حفظ البطاقة')); }
    } catch (err) { console.error(err); }
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
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--primary)' }}>
              <Plus size={20} />
              <h3 style={{ margin: 0 }}>بطاقات الجبر</h3>
            </div>
            <button className="btn no-print" onClick={openNewCard}><Plus size={18} /> إضافة بطاقة</button>
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
                  <th>عدد الملف</th>
                  <th className="no-print">عمل</th>
                </tr>
              </thead>
              <tbody>
                {cards.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', opacity: 0.5, padding: '2rem' }}>لا توجد بطاقات جبر — أضف بطاقة أو استعمل «المسح الذكي»</td></tr>
                ) : cards.map(card => (
                  <tr key={card.id_cn_oe}>
                    <td style={{ fontWeight: 600 }}>{card.numcarte || '—'}</td>
                    <td>{card.semestre || '—'}</td>
                    <td style={{ color: 'var(--primary)', fontWeight: 700 }}>{fmtDinar(card.dette)}</td>
                    <td>{card.datecarte || '—'}</td>
                    <td>{card.datesins || '—'}</td>
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
