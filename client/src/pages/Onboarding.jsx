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
  { k: 'officeName', label: 'Bailiff name (full name)', ph: 'e.g. Salah Ben Ali', wide: true },
  { k: 'officeNameFr', label: 'Name in Latin script (French letterhead)', ph: 'Salah Ben Ali', dir: 'ltr' },
  { k: 'officeCity', label: 'City', ph: 'e.g. Sousse' },
  { k: 'officeAddress', label: 'Address (as printed on the act)', ph: 'Building …, Office …, Street …, City', wide: true },
  { k: 'officeJurisdiction', label: 'Judicial district', ph: 'e.g. Court of Appeal of Sousse', wide: true },
  { k: 'officePhone', label: 'Phone', dir: 'ltr' },
  { k: 'officeFax', label: 'Fax', dir: 'ltr' },
  { k: 'taxId', label: 'Tax ID', ph: '1301683X/A/P/000', dir: 'ltr' },
  { k: 'officeRib', label: 'Bank account (RIB)', ph: '05500000022300094016', dir: 'ltr' },
  { k: 'officeCnss', label: 'CNSS identifier', ph: '4543508503 & 550867 - 04', dir: 'ltr' },
  { k: 'cnssBureau', label: 'CNSS regional office', ph: 'e.g. Sousse, Rue de la République, Sousse', wide: true },
  { k: 'cnssRegion', label: 'Regional Director of Social Affairs — region', ph: 'e.g. Sousse' },
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
    if (!username.trim()) { setError('A username is required.'); return false; }
    if (password.length < 8) { setError('The password must be at least 8 characters.'); return false; }
    if (password !== confirm) { setError('The passwords do not match.'); return false; }
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
      if (!res.ok) { setError(data.error || 'Setup could not be completed. Please try again.'); setBusy(false); return; }
      onComplete(form.officeName);
    } catch {
      setError('Could not reach the server.');
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
      if (!res.ok) { setError('Could not generate the preview.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sample-act.docx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not reach the server.');
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
    /*
     * #root is `height: 100vh; overflow: hidden` — inside the app the scrolling is
     * done by .main-content. This screen renders outside that layout, so it needs
     * its own scroll container or the form is simply clipped at the fold.
     */
    <div style={{ flex: 1, height: '100vh', overflowY: 'auto', overflowX: 'hidden' }}>
    <div className="animate-fade" dir="ltr" style={{ maxWidth: 860, margin: '2rem auto', padding: '0 1rem 3rem' }}>
      {step === 'details' && (
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h2 style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: 0 }}>
            <Building2 size={24} /> Office setup
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 0, lineHeight: 1.7 }}>
            Welcome. This is the first time this installation has been opened. The details below appear on the
            letterhead of the acts and lists the software generates, and can be changed later in Settings.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {FIELDS.map((f) => (
              <div key={f.k} style={f.wide ? { gridColumn: 'span 2' } : null}>
                <label style={labelStyle}>{f.label}</label>
                <input
                  style={inputStyle}
                  dir={f.dir || 'ltr'}
                  value={form[f.k]}
                  placeholder={f.ph || ''}
                  onChange={(e) => set(f.k, e.target.value)}
                />
              </div>
            ))}
            <div>
              <label style={labelStyle}>Value added tax rate (%)</label>
              <input style={inputStyle} dir="ltr" value={tvaRate} onChange={(e) => setTvaRate(e.target.value)} />
            </div>
          </div>

          <h3 style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.75rem' }}>
            <KeyRound size={18} /> Administrator account
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
            This is the account you will sign in with. You can add the other users later.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Username</label>
              <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Password</label>
              <input style={inputStyle} type="password" dir="ltr" value={password}
                placeholder="At least 8 characters" onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Confirm password</label>
              <input style={inputStyle} type="password" dir="ltr" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} />
            </div>
          </div>

          {errorBox}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.75rem' }}>
            <button className="btn" disabled={busy} onClick={() => { if (accountValid()) setStep('preview'); }}>
              Preview the template <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h2 style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: 0 }}>
            <Eye size={24} /> Act preview
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 0, lineHeight: 1.7 }}>
            This is how your letterhead will appear on the acts. For an exact preview, download the sample act and
            open it in Word. Any field you leave blank will appear blank on the act.
          </p>

          <LetterheadPreview profile={form} />

          {errorBox}

          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn" style={{ background: 'var(--surface-2)' }} disabled={busy} onClick={() => setStep('details')}>
                <ArrowLeft size={18} /> Back
              </button>
              <button className="btn" style={{ background: 'var(--surface-2)' }} disabled={busy} onClick={downloadPreview}>
                <FileText size={18} /> Download sample act
              </button>
            </div>
            <button className="btn" disabled={busy} onClick={complete}>
              <Check size={18} /> {busy ? 'Setting up…' : 'Finish and sign in'}
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
