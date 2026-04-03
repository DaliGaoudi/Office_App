import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, CheckCircle, AlertCircle, Percent } from 'lucide-react';

import API_BASE from '../config';

const API = `${API_BASE}/settings`;

export default function Settings() {
  const [tva, setTva]           = useState('');
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(true);

  // Load current settings
  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(API, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setTva(data?.tva_rate?.value ?? '19');
        setLoading(false);
      })
      .catch(() => { setTva('19'); setLoading(false); });
  }, []);

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
