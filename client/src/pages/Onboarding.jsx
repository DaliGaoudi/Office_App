import { useState } from 'react';
import { Building2, KeyRound, Eye, FileText, ArrowRight, ArrowLeft, Check, AlertCircle } from 'lucide-react';
import API_BASE from '../config';
import LetterheadPreview from '../components/LetterheadPreview';

/*
 * First-run setup for a new office deployment. Ported from the desktop app's
 * Onboarding screen, with the differences the web version needs:
 *
 *  - the administrator account is created here, so username + password are REQUIRED
 *    (the desktop app had a single optional local password);
 *  - the extra act fields added when template_cnss.docx was parameterized
 *    (jurisdiction, CNSS bureau, CNSS region) are collected, since a blank one
 *    renders as a blank sentence in a legal document;
 *  - "open in Word" becomes a .docx download — a browser can't launch Word.
 *
 * This screen is only reachable while the deployment has no user accounts at all.
 */
const API = `${API_BASE}/onboarding`;

const EMPTY = {
  officeName: '', officeNameFr: '', officeCity: '', officeAddress: '',
  officePhone: '', officeFax: '', taxId: '', officeRib: '', officeCnss: '',
  officeJurisdiction: '', cnssBureau: '', cnssRegion: '',
};

// `wide` fields span both grid columns.
const FIELDS = [
  { k: 'officeName', label: 'اسم العدل المنفذ (الإسم الكامل)', ph: 'مثال: صلاح بن علي', wide: true },
  { k: 'officeNameFr', label: 'الاسم باللاتينية (للترويسة الفرنسية)', ph: 'Salah Ben Ali', dir: 'ltr' },
  { k: 'officeCity', label: 'المدينة', ph: 'مثال: سوسة' },
  { k: 'officeAddress', label: 'العنوان (كما يُكتب في المحضر)', ph: 'عمارة …، مكتب …، شارع …، المدينة', wide: true },
  { k: 'officeJurisdiction', label: 'الدائرة القضائية', ph: 'مثال: لمحكمة الإستئناف بسوسة', wide: true },
  { k: 'officePhone', label: 'الهاتف', dir: 'ltr' },
  { k: 'officeFax', label: 'الفاكس', dir: 'ltr' },
  { k: 'taxId', label: 'المعرف الجبائي', ph: '1301683X/A/P/000', dir: 'ltr' },
  { k: 'officeRib', label: 'الحساب البنكي (RIB)', ph: '05500000022300094016', dir: 'ltr' },
  { k: 'officeCnss', label: 'معرّف الصندوق (CNSS)', ph: '4543508503 & 550867 - 04', dir: 'ltr' },
  { k: 'cnssBureau', label: 'المكتب الجهوي للصندوق', ph: 'مثال: بسوسة الكائن بشارع الجمهورية بسوسة', wide: true },
  { k: 'cnssRegion', label: 'جهة المدير الجهوي للشؤون الإجتماعية', ph: 'مثال: بسوسة' },
];

const labelStyle = { display: 'block', marginBottom: '0.35rem', color: 'var(--text-muted)', fontSize: '0.8rem' };
const inputStyle = { width: '100%', padding: '0.55rem', borderRadius: '8px' };

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState('details'); // details | preview
  const [form, setForm] = useState(EMPTY);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [tvaRate, setTvaRate] = useState('19');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // The account is what lets anyone in, so it is the only hard requirement.
  const accountValid = () => {
    if (!username.trim()) { setError('اسم المستخدم مطلوب.'); return false; }
    if (password.length < 8) { setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.'); return false; }
    if (password !== confirm) { setError('كلمتا المرور غير متطابقتين.'); return false; }
    setError('');
    return true;
  };

  const complete = async () => {
    if (!accountValid()) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, username: username.trim(), password, tvaRate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'تعذّر إتمام الإعداد. حاول مرة أخرى.'); setBusy(false); return; }
      onComplete(form.officeName);
    } catch {
      setError('خطأ في الاتصال بالخادم.');
      setBusy(false);
    }
  };

  // Download a sample act built from the details currently on screen.
  const downloadPreview = async () => {
    setError('');
    try {
      const res = await fetch(`${API}/preview.docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { setError('تعذّر توليد المعاينة.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'نموذج-محضر.docx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('خطأ في الاتصال بالخادم.');
    }
  };

  const errorBox = error ? (
    <p style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem',
      padding: '0.7rem 1rem', borderRadius: '8px', marginTop: '1rem',
      border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444',
    }}>
      <AlertCircle size={16} /> {error}
    </p>
  ) : null;

  return (
    <div className="animate-fade" dir="rtl" style={{ maxWidth: 860, margin: '2rem auto', padding: '0 1rem' }}>
      {step === 'details' && (
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h2 style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: 0 }}>
            <Building2 size={24} /> إعداد المكتب
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 0, lineHeight: 1.7 }}>
            مرحباً. هذه هي المرة الأولى التي يُفتح فيها هذا التنصيب. تظهر البيانات التالية في ترويسة
            المحاضر والقوائم التي يولّدها البرنامج، ويمكن تعديلها لاحقاً من الإعدادات.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {FIELDS.map((f) => (
              <div key={f.k} style={f.wide ? { gridColumn: 'span 2' } : null}>
                <label style={labelStyle}>{f.label}</label>
                <input
                  style={inputStyle}
                  dir={f.dir || 'rtl'}
                  value={form[f.k]}
                  placeholder={f.ph || ''}
                  onChange={(e) => set(f.k, e.target.value)}
                />
              </div>
            ))}
            <div>
              <label style={labelStyle}>نسبة الأداء على القيمة المضافة (%)</label>
              <input style={inputStyle} dir="ltr" value={tvaRate} onChange={(e) => setTvaRate(e.target.value)} />
            </div>
          </div>

          <h3 style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.75rem' }}>
            <KeyRound size={18} /> حساب المدير
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
            هذا هو الحساب الذي ستدخل به إلى البرنامج. يمكنك إضافة بقية المستخدمين لاحقاً.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>اسم المستخدم</label>
              <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>كلمة المرور</label>
              <input style={inputStyle} type="password" dir="ltr" value={password}
                placeholder="8 أحرف على الأقل" onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>تأكيد كلمة المرور</label>
              <input style={inputStyle} type="password" dir="ltr" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} />
            </div>
          </div>

          {errorBox}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.75rem' }}>
            <button className="btn" disabled={busy} onClick={() => { if (accountValid()) setStep('preview'); }}>
              معاينة النموذج <ArrowLeft size={18} />
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h2 style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: 0 }}>
            <Eye size={24} /> معاينة المحضر
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 0, lineHeight: 1.7 }}>
            هكذا ستظهر ترويستك في المحاضر. للمعاينة الدقيقة حمّل نموذج المحضر وافتحه في Word.
            كل حقل تتركه فارغاً سيظهر فراغاً في المحضر.
          </p>

          <LetterheadPreview profile={form} />

          {errorBox}

          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn" style={{ background: 'var(--surface-2)' }} disabled={busy} onClick={() => setStep('details')}>
                <ArrowRight size={18} /> رجوع
              </button>
              <button className="btn" style={{ background: 'var(--surface-2)' }} disabled={busy} onClick={downloadPreview}>
                <FileText size={18} /> تحميل نموذج المحضر
              </button>
            </div>
            <button className="btn" disabled={busy} onClick={complete}>
              <Check size={18} /> {busy ? 'جاري الإعداد…' : 'إنهاء والدخول'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
