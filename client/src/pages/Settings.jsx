import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, CheckCircle, AlertCircle, Percent, ScanLine, Download, Building2 } from 'lucide-react';

import API_BASE from '../config';

const API = `${API_BASE}/settings`;

// In the demo there is no office PC and no scanner: the scan buttons are served
// by the demo layer, so this page must not send anyone off to install a bridge.
const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

// Office-profile fields → {office_*} merge tags on the CNSS facturation bill
// AND in the body of every liquidation-card notification act (see server/services/officeProfile.js).
const OFFICE_FIELDS = [
  { key: 'office_name',    label: 'Bailiff name' },
  { key: 'office_name_fr', label: 'Name (French)', dir: 'ltr' },
  { key: 'office_city',    label: 'City' },
  { key: 'office_phone',   label: 'Phone', dir: 'ltr' },
  { key: 'office_fax',     label: 'Fax', dir: 'ltr' },
  { key: 'office_tax_id',  label: 'Tax ID (MF)', dir: 'ltr' },
  { key: 'office_rib',     label: 'Bank account (RIB)', dir: 'ltr' },
  { key: 'office_cnss',    label: 'CNSS identifier', dir: 'ltr' },

  // Printed inside the act itself — leaving these blank empties those sentences.
  { key: 'office_address',      label: 'Office address (as printed on the act)', hint: 'e.g. Kallalou Building, Office A23, Mohamed Maarouf Street, Sousse' },
  { key: 'office_jurisdiction', label: 'Judicial district', hint: 'e.g. Court of Appeal of Sousse' },
  { key: 'cnss_bureau',         label: 'CNSS regional office', hint: 'e.g. Sousse, Rue de la République, Sousse' },
  { key: 'cnss_region',         label: 'Regional Director of Social Affairs — region', hint: 'e.g. Sousse' },
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
      setError('Error while saving the office details');
    }
    setOfficeSaving(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSaved(false);
    const val = parseFloat(tva);
    if (isNaN(val) || val <= 0 || val > 100) {
      setError('The rate must be between 1 and 100');
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
      setError('Error during save');
    }
  };

  return (
    <div className="animate-fade">

      {/* Header */}
      <div className="topbar" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <SettingsIcon size={24} style={{ color: 'var(--primary)' }} />
          <h2 style={{ color: 'var(--primary)', margin: 0 }}>Settings</h2>
        </div>
      </div>

      {loading ? (
        <p style={{ opacity: 0.6 }}>Loading...</p>
      ) : (
        <div style={{ maxWidth: 520 }}>

          {/* TVA Card */}
          <div className="glass" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--primary)' }}>
              <Percent size={18} style={{ marginLeft: '0.4rem', verticalAlign: 'middle' }} />
              Value Added Tax (VAT) Rate
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              This rate is used to automatically calculate the total fee in all records.
              This change takes effect immediately for all new records without an explicit amount.
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
                  <Save size={18} /> Save
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
                  Saved successfully! New rate: {tva}%
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
              Office details (CNSS bill letterhead)
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              These details appear at the top of the monthly list (the bill) sent to the National Social Security
              Fund, and the last fields are merged into the body of every notification act. Set them before generating any act.
            </p>
            <form onSubmit={saveOffice}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {OFFICE_FIELDS.map(f => (
                  <div key={f.key}>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', opacity: 0.8 }}>{f.label}</label>
                    <input type="text" value={office[f.key] || ''} dir={f.dir || 'ltr'}
                      onChange={e => setOffice(prev => ({ ...prev, [f.key]: e.target.value }))}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px' }} />
                    {f.hint && (
                      <span style={{ display: 'block', marginTop: '0.3rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {f.hint}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn" disabled={officeSaving} style={{ gap: '0.5rem' }}>
                  <Save size={18} /> {officeSaving ? 'Saving…' : 'Save office details'}
                </button>
                {officeSaved && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#4ade80', fontSize: '0.9rem' }}>
                    <CheckCircle size={18} /> Saved
                  </span>
                )}
              </div>
            </form>
          </div>

          {/* Scanner setup card */}
          <div className="glass" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--primary)' }}>
              <ScanLine size={18} style={{ marginLeft: '0.4rem', verticalAlign: 'middle' }} />
              Direct scanning tool
            </h3>
            {DEMO ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 0, lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--primary)' }}>Simulated in this demo.</strong> Every scan button already
                works — it returns a sample liquidation card instead of driving a scanner, so you can run the whole
                workflow without installing anything.
                <br /><br />
                In the installed product this card is where the office downloads the Scan Bridge: a small helper that
                runs once on the office PC and lets the browser drive a USB scanner over WIA. It needs{' '}
                <strong>Node.js</strong> and the scanner&rsquo;s own driver on that machine — which is exactly why it
                is stubbed out here.
              </p>
            ) : (
              <>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.7 }}>
                  To enable the direct-scan button inside files, install the bridge tool on this machine once:
                  download the package, unzip it, then run{' '}
                  <code style={{ background: 'rgba(var(--primary-rgb),0.08)', padding: '1px 5px', borderRadius: '4px' }}>install-autostart.cmd</code>.
                  After that, scanning runs automatically in the background on every start-up.
                  <br />
                  Requires <strong>Node.js</strong> and the scanner driver installed on this machine.
                </p>
                <a
                  href="/scan-bridge-setup.zip"
                  download
                  className="btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', padding: '0.75rem 1.25rem' }}
                >
                  <Download size={18} /> Download the scanning tool
                </a>
              </>
            )}
          </div>

          {/* Info card */}
          <div className="glass" style={{ padding: '1.25rem', opacity: 0.75, fontSize: '0.85rem', lineHeight: 1.7 }}>
            <strong>Calculation Note:</strong><br />
            Total = (Base + Copies + Office Copy + Orientation + Transport)
            &nbsp;+ (Paper Copies + Registration + Inscription + Post + Others + VAT)<br/>
            VAT = Sum of First Part × <strong>{tva}%</strong>
          </div>

        </div>
      )}
    </div>
  );
}
