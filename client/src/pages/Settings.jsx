import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, CheckCircle, AlertCircle, Percent, ScanLine, Download, Building2 } from 'lucide-react';

import API_BASE from '../config';

const API = `${API_BASE}/settings`;

// Office-profile fields → {office_*} merge tags on the CNSS facturation bill.
const OFFICE_FIELDS = [
  { key: 'office_name',    label: 'اسم العدل المنفذ (عربي)' },
  { key: 'office_name_fr', label: 'الاسم (بالفرنسية)', dir: 'ltr' },
  { key: 'office_city',    label: 'المدينة' },
  { key: 'office_phone',   label: 'الهاتف', dir: 'ltr' },
  { key: 'office_fax',     label: 'الفاكس', dir: 'ltr' },
  { key: 'office_tax_id',  label: 'المعرّف الجبائي (MF)', dir: 'ltr' },
  { key: 'office_rib',     label: 'الحساب البنكي (RIB)', dir: 'ltr' },
  { key: 'office_cnss',    label: 'معرّف الصندوق (CNSS)', dir: 'ltr' },
];
const EMPTY_OFFICE = Object.fromEntries(OFFICE_FIELDS.map(f => [f.key, '']));

export default function Settings() {
  const [tva, setTva]           = useState('');
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(true);

  // Office profile
  const [office, setOffice]         = useState(EMPTY_OFFICE);
  const [officeSaved, setOfficeSaved] = useState(false);
  const [officeSaving, setOfficeSaving] = useState(false);

  // Load current settings
  useEffect(() => {
    const token = localStorage.getItem('token');
    Promise.all([
      fetch(API, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()).catch(() => null),
      fetch(`${API}/office/profile`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()).catch(() => null),
    ]).then(([settings, prof]) => {
      setTva(settings?.tva_rate?.value ?? '19');
      if (prof && typeof prof === 'object') setOffice({ ...EMPTY_OFFICE, ...prof });
      setLoading(false);
    });
  }, []);

  const saveOffice = async (e) => {
    e.preventDefault();
    setOfficeSaving(true);
    setOfficeSaved(false);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/office/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(office),
      });
      if (!res.ok) throw new Error('Server error');
      const updated = await res.json();
      setOffice({ ...EMPTY_OFFICE, ...updated });
      setOfficeSaved(true);
      setTimeout(() => setOfficeSaved(false), 3000);
    } catch {
      setError('حدث خطأ أثناء حفظ بيانات المكتب');
    }
    setOfficeSaving(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSaved(false);
    const val = parseFloat(tva);
    if (isNaN(val) || val <= 0 || val > 100) {
      setError('النسبة يجب أن تكون بين 1 و 100');
      return;
    }
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/tva_rate`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ value: String(val) })
      });
      if (!res.ok) throw new Error('Server error');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('حدث خطأ أثناء الحفظ');
    }
  };

  return (
    <div className="animate-fade" dir="rtl">

      {/* Header */}
      <div className="topbar" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <SettingsIcon size={24} style={{ color: 'var(--primary)' }} />
          <h2 style={{ color: 'var(--primary)', margin: 0 }}>الإعدادات</h2>
        </div>
      </div>

      {loading ? (
        <p style={{ opacity: 0.6 }}>جاري التحميل…</p>
      ) : (
        <div style={{ maxWidth: 520 }}>

          {/* TVA Card */}
          <div className="glass" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--primary)' }}>
              <Percent size={18} style={{ marginLeft: '0.4rem', verticalAlign: 'middle' }} />
              نسبة الأداء على القيمة المضافة (أ.ق.م)
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              تُستخدم هذه النسبة لحساب الأجرة الجملية تلقائياً في جميع المحاضر.
              يُطبَّق هذا التعديل فوراً على جميع المحاضر الجديدة التي لم يُحدَّد لها مبلغ صريح.
            </p>

            <form onSubmit={handleSave}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    id="tva-input"
                    type="number"
                    min="1"
                    max="100"
                    step="0.1"
                    value={tva}
                    onChange={e => setTva(e.target.value)}
                    style={{
                      width: '100%',
                      paddingLeft: '2.5rem',
                      fontSize: '1.2rem',
                      fontWeight: 700,
                      letterSpacing: '0.05em'
                    }}
                    required
                  />
                  <span style={{
                    position: 'absolute',
                    left: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--primary)',
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    pointerEvents: 'none'
                  }}>%</span>
                </div>
                <button
                  type="submit"
                  className="btn"
                  style={{ minWidth: 120, padding: '0.75rem 1.25rem', gap: '0.5rem' }}
                >
                  <Save size={18} /> حفظ
                </button>
              </div>

              {/* Feedback */}
              {saved && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.75rem 1rem', borderRadius: '8px',
                  background: 'rgba(34,197,94,0.15)', color: '#4ade80',
                  fontSize: '0.9rem'
                }}>
                  <CheckCircle size={18} />
                  تم الحفظ بنجاح! النسبة الجديدة: {tva}%
                </div>
              )}
              {error && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.75rem 1rem', borderRadius: '8px',
                  background: 'rgba(239,68,68,0.15)', color: '#f87171',
                  fontSize: '0.9rem'
                }}>
                  <AlertCircle size={18} />
                  {error}
                </div>
              )}
            </form>
          </div>

          {/* Office profile card → CNSS facturation letterhead */}
          <div className="glass" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--primary)' }}>
              <Building2 size={18} style={{ marginLeft: '0.4rem', verticalAlign: 'middle' }} />
              بيانات المكتب (ترويسة فاتورة الضمان الاجتماعي)
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              تظهر هذه البيانات في أعلى القائمة الشهرية (الفاتورة) المُرسَلة إلى الصندوق الوطني للضمان الاجتماعي.
            </p>
            <form onSubmit={saveOffice}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {OFFICE_FIELDS.map(f => (
                  <div key={f.key}>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', opacity: 0.8 }}>{f.label}</label>
                    <input type="text" value={office[f.key] || ''} dir={f.dir || 'rtl'}
                      onChange={e => setOffice(prev => ({ ...prev, [f.key]: e.target.value }))}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px' }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn" disabled={officeSaving} style={{ gap: '0.5rem' }}>
                  <Save size={18} /> {officeSaving ? 'جاري الحفظ…' : 'حفظ بيانات المكتب'}
                </button>
                {officeSaved && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#4ade80', fontSize: '0.9rem' }}>
                    <CheckCircle size={18} /> تم الحفظ
                  </span>
                )}
              </div>
            </form>
          </div>

          {/* Scanner setup card */}
          <div className="glass" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--primary)' }}>
              <ScanLine size={18} style={{ marginLeft: '0.4rem', verticalAlign: 'middle' }} />
              أداة المسح الضوئي المباشر
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.7 }}>
              لتفعيل زر «مسح ضوئي مباشر» داخل الملفات، ثبّت أداة الربط على هذا الجهاز مرة واحدة:
              نزّل الحزمة، فك الضغط، ثم شغّل{' '}
              <code style={{ background: 'rgba(var(--primary-rgb),0.08)', padding: '1px 5px', borderRadius: '4px' }}>install-autostart.cmd</code>.
              بعدها يعمل المسح تلقائياً في الخلفية عند كل تشغيل للجهاز.
              <br />
              يتطلب تثبيت <strong>Node.js</strong> وتعريف الماسح الضوئي على هذا الجهاز.
            </p>
            <a
              href="/scan-bridge-setup.zip"
              download
              className="btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', padding: '0.75rem 1.25rem' }}
            >
              <Download size={18} /> تنزيل أداة المسح الضوئي
            </a>
          </div>

          {/* Info card */}
          <div className="glass" style={{ padding: '1.25rem', opacity: 0.75, fontSize: '0.85rem', lineHeight: 1.7 }}>
            <strong>ملاحظة حول الحسابات:</strong><br />
            المجموع = (أصل المحضر + النظائر + النسخة المكتبية + التوجه + التنقل)
            &nbsp;+ (نسخ الأوراق + التسجيل + الترسيم + البريد + المختلفات + أ.ق.م)<br/>
            أ.ق.م = مجموع الشق الأول × <strong>{tva}%</strong>
          </div>

        </div>
      )}
    </div>
  );
}
