import { useState } from 'react';
import { ShieldAlert, Download, RefreshCw, LogOut } from 'lucide-react';
import API_BASE from '../config';

/*
 * What an office sees when the provider has suspended it, or the contract has
 * ended. It replaces the whole app — there is no way past it — but it is not a
 * dead end: an administrator can still download the office's complete data, and
 * "Try again" picks up a reinstatement within seconds of it being made.
 *
 * The message comes from the control plane, written by the provider, so it says
 * the actual reason (unpaid invoice, ended contract) rather than a generic
 * error. `status` distinguishes a suspension that will be lifted from a contract
 * that is over.
 */
export default function SuspendedNotice({ status, message, providerContact, canExport, onRetry, onLogout }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const terminated = status === 'terminated';

  const exportData = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/export/data`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error('Could not export the data.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `office-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'Could not export the data.');
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    setBusy(true);
    setError('');
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem', background: 'var(--bg-main)',
    }}>
      <div className="glass" style={{ maxWidth: '620px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
        <ShieldAlert size={56} strokeWidth={1.5} style={{ color: 'var(--accent-gold)', marginBottom: '1rem' }} />

        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>
          {terminated ? 'The contract has ended and the service is stopped' : 'The service is temporarily suspended'}
        </h1>

        <p style={{ color: 'var(--text-muted)', lineHeight: 1.9, marginBottom: '1.5rem' }}>
          {message || 'The service has been suspended. Please contact the provider to settle the account.'}
        </p>

        {providerContact && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Contact: <span dir="ltr">{providerContact}</span>
          </p>
        )}

        {/* Data is preserved through a suspension; saying so plainly is the
            difference between a billing dispute and a panic. */}
        <p style={{
          color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.8,
          background: 'var(--bg-main)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '0.9rem', marginBottom: '1.5rem',
        }}>
          Your data is fully preserved and untouched. As soon as the suspension is lifted, everything resumes as before.
          {canExport && ' You can download a complete copy of your records at any time.'}
        </p>

        {error && (
          <p style={{ color: 'var(--danger, #e5484d)', fontSize: '0.9rem', marginBottom: '1rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {canExport && (
            <button className="btn" onClick={exportData} disabled={busy}>
              <Download size={18} /> Download a copy of the data
            </button>
          )}
          <button
            className="btn"
            onClick={retry}
            disabled={busy}
            style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' }}
          >
            <RefreshCw size={18} /> Try again
          </button>
          <button
            className="btn"
            onClick={onLogout}
            style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
