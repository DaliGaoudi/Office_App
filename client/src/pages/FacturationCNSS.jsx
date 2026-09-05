import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, FileText, CalendarDays } from 'lucide-react';
import API_BASE from '../config';

const API = `${API_BASE}/cnss`;

/*
 * CNSS billing — every liquidation card whose act was served (service date),
 * grouped by month. Each month is its own section with a totals row and a
 * "Print month's bill" button that downloads the Word bill the office sends to
 * CNSS (GET /cnss/list.docx). Data comes from GET /cnss/facturation/months.
 */
export default function FacturationCNSS() {
  const navigate = useNavigate();
  const [months, setMonths]       = useState([]);
  const [grandTotal, setGrand]    = useState('0,000');
  const [loading, setLoading]     = useState(true);
  const [downloading, setDownloading] = useState(null); // "year-month" being generated

  const fetchMonths = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/facturation/months`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setMonths(json.months || []);
      setGrand(json.grandTotal || '0,000');
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchMonths(); }, [fetchMonths]);

  // Download the Word facture for one month.
  const printMonth = async (m) => {
    const key = `${m.year}-${m.month}`;
    setDownloading(key);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/list.docx?year=${m.year}&month=${m.month}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert('Could not generate the bill: ' + (e.error || res.status)); return; }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `CNSS_list_${m.month}_${m.year}.docx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { console.error(e); alert('Could not reach the server'); }
    finally { setDownloading(null); }
  };

  const COLS = [
    { key: 'rang', label: '#' },
    { key: 'nbrreg', label: 'File no.' },
    { key: 'numcarte', label: 'Card no.' },
    { key: 'nom', label: 'Debtor' },
    { key: 'numcnss', label: 'Affiliation no.' },
    { key: 'date_tabligh', label: 'Service date' },
    { key: 'ajr', label: 'Total fees', amount: true },
    { key: 'vat', label: 'VAT', amount: true },
    { key: 'exp', label: 'Total expenses', amount: true },
    { key: 'total', label: 'Act fee', amount: true, total: true },
  ];

  return (
    <div className="animate-fade" dir="ltr">
      {/* ── Toolbar ── */}
      <div className="topbar no-print" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Receipt size={22} style={{ color: 'var(--primary)' }} />
          <h2 style={{ color: 'var(--primary)', margin: 0 }}>CNSS Billing</h2>
        </div>
        <div className="summary-item" style={{ textAlign: 'left' }}>
          <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Grand total, all months</span>
          <strong style={{ fontSize: '1.2rem', color: 'var(--primary)' }} dir="ltr">{grandTotal} TND</strong>
        </div>
      </div>

      {loading ? (
        <p style={{ padding: '3rem', textAlign: 'center', opacity: 0.6 }}>Loading…</p>
      ) : months.length === 0 ? (
        <div className="glass" style={{ padding: '3rem', textAlign: 'center', opacity: 0.7 }}>
          No acts have been served yet. Enter a service date on the liquidation cards and they will appear here, grouped by month.
        </div>
      ) : months.map((m) => {
        const key = `${m.year}-${m.month}`;
        return (
          <div key={key} className="glass table-container" style={{ marginBottom: '1.5rem' }}>
            {/* ── Month header ── */}
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', background: 'rgba(var(--primary-rgb), 0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <CalendarDays size={20} style={{ color: 'var(--primary)' }} />
                <h3 style={{ margin: 0, color: 'var(--primary)' }}>{m.label}</h3>
                <span style={{ fontSize: '0.85rem', opacity: 0.6 }}>({m.count} act(s))</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <span style={{ fontWeight: 700 }}>Total: <span dir="ltr" style={{ color: 'var(--primary)' }}>{m.t_total} TND</span></span>
                <button className="btn no-print" onClick={() => printMonth(m)} disabled={downloading === key}>
                  <FileText size={18} /> {downloading === key ? 'Generating…' : "Print month's bill"}
                </button>
              </div>
            </div>

            {/* ── Month table ── */}
            <table>
              <thead>
                <tr>{COLS.map((c) => <th key={c.key} style={c.amount ? { textAlign: 'left' } : null}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {m.rows.map((row) => (
                  <tr key={row.id_cn_oe} style={{ cursor: 'pointer' }} onClick={() => navigate(`/cnss/${row.id_cn}`)}>
                    {COLS.map((c) => (
                      <td key={c.key} style={c.amount ? { textAlign: 'left', fontWeight: c.total ? 700 : 400, color: c.total ? 'var(--primary)' : 'inherit' } : null} dir={c.amount ? 'ltr' : undefined}>
                        {row[c.key] === '' || row[c.key] == null ? '—' : row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* ── Totals row ── */}
                <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
                  <td colSpan={6} style={{ textAlign: 'left' }}>Grand total</td>
                  <td style={{ textAlign: 'left' }} dir="ltr">{m.t_ajr}</td>
                  <td style={{ textAlign: 'left' }} dir="ltr">{m.t_vat}</td>
                  <td style={{ textAlign: 'left' }} dir="ltr">{m.t_exp}</td>
                  <td style={{ textAlign: 'left', color: 'var(--primary)' }} dir="ltr">{m.t_total}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}

      <style dangerouslySetInnerHTML={{ __html: `
        .summary-item { display: flex; flex-direction: column; gap: 2px; }
      `}} />
    </div>
  );
}
