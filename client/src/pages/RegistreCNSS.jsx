import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Edit, Printer, Trash2, UploadCloud, ScanLine, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Pagination from '../components/Pagination';
import AutocompleteInput from '../components/AutocompleteInput';
import { STATUS_MAP } from '../utils/formatters';

import API_BASE from '../config';
import { compressImage, scanCardFromBridge, createRecordFromCard } from '../utils/cnssScan';

const API = `${API_BASE}/cnss`;

// CNSS amounts (dette) are decimal dinars stored as strings ("2959.306"), NOT
// the integer millimes the general registers use — so format directly.
const fmtDinar = (v) => {
  const n = parseFloat(v);
  if (isNaN(n)) return '0,000';
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: true }).format(n);
};

export default function RegistreCNSS() {
  const navigate = useNavigate();

  const [data, setData]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [limit, setLimit]           = useState(25);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [filters, setFilters]       = useState({ nom_cl2: '', numcnss: '', ref: '' });
  const [activeFilters, setActiveFilters] = useState({});

  const [processing, setProcessing] = useState(null); // message while extracting/creating
  const fileInputRef = useRef(null);

  const fetchRecords = useCallback(async (pg = page, lim = limit, flt = activeFilters) => {
    setLoading(true);
    const token = localStorage.getItem('token');
    const params = new URLSearchParams({ page: pg, limit: lim, ...flt, _t: Date.now() }).toString();
    try {
      const res  = await fetch(`${API}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setData(json.data || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [page, limit, activeFilters]);

  useEffect(() => { fetchRecords(page, limit, activeFilters); }, [page, limit, activeFilters]);

  const handleSearch = (e) => { e.preventDefault(); setPage(1); setActiveFilters({ ...filters }); };
  const handlePageChange  = (pg)  => setPage(pg);
  const handleLimitChange = (lim) => { setLimit(lim); setPage(1); };

  const handleStatusChange = async (id, newStatus) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/${id}/status`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setData(prev => prev.map(item => item.id_cn === id ? { ...item, status: newStatus } : item));
      } else {
        const err = await res.json();
        alert('An error occurred: ' + (err.error || 'Failed to update'));
      }
    } catch (e) {
      console.error(e);
      alert('Error communicating with the server');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this file and every liquidation card attached to it?')) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setData(prev => prev.filter(item => item.id_cn !== id));
        fetchRecords();
      } else {
        const err = await res.json();
        alert('An error occurred: ' + (err.error || 'Failed to delete'));
      }
    } catch (e) {
      console.error(e);
      alert('Error communicating with the server');
    }
  };

  // Send a card image/PDF to the server, which extracts it and auto-creates the
  // record, then jump to the new record for review + act generation. A duplicate
  // the user cancelled files nothing, but still opens the record already holding it.
  const submitCardFile = async (fileOrBlob, filename) => {
    setProcessing('Reading the card and creating the file…');
    try {
      const { id_cn } = await createRecordFromCard(fileOrBlob, filename);
      navigate(`/cnss/${id_cn}`);
    } catch (e) {
      console.error(e);
      alert('Could not create the file: ' + e.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const payload = file.type.startsWith('image/') ? await compressImage(file) : file;
      await submitCardFile(payload, file.name);
    } catch (err) {
      alert('Error processing the file: ' + err.message);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleScan = async () => {
    setProcessing('Scanning…');
    try {
      const blob = await scanCardFromBridge();
      await submitCardFile(blob, 'scan.jpg');
    } catch (err) {
      console.error('Scan error:', err);
      const offline = err instanceof TypeError;
      setProcessing(null);
      alert(offline
        ? 'Could not reach the scanner.\nDownload the Scan Bridge from Settings, run it once, and check the device is connected.'
        : ('Scanning error: ' + err.message));
    }
  };

  // Generate the notification act for a debtor straight from the table —
  // all of its cards in one Word file (one act per page).
  const generateActs = async (item) => {
    if (!Number(item.card_count)) { alert('This debtor has no liquidation cards to generate an act for.'); return; }
    setProcessing('Generating the act…');
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/${item.id_cn}/acts.docx`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert('Act generation failed: ' + (e.error || res.status)); return; }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `acts_${item.nom_cl2 || item.id_cn}.docx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Could not reach the server');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="animate-fade">
      {/* ── Processing overlay (extraction + auto-create) ── */}
      {processing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass" style={{ padding: '2rem 3rem', textAlign: 'center', direction: 'ltr' }}>
            <div style={{ width: 36, height: 36, margin: '0 auto 1rem', border: '3px solid var(--card-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'cnss-spin 0.8s linear infinite' }} />
            <div style={{ fontSize: '1rem', color: 'var(--primary)' }}>{processing}</div>
          </div>
          <style dangerouslySetInnerHTML={{ __html: '@keyframes cnss-spin { to { transform: rotate(360deg); } }' }} />
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="topbar" style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: 'var(--primary)' }}>Social Security Files (CNSS)</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,application/pdf" onChange={handleUpload} />
          <button className="btn" disabled={!!processing} style={{ background: 'var(--primary)' }} onClick={handleScan}>
            <ScanLine size={18} /> Scan liquidation card
          </button>
          <button className="btn" disabled={!!processing} onClick={() => fileInputRef.current && fileInputRef.current.click()}>
            <UploadCloud size={18} /> Upload liquidation card
          </button>
          <button className="btn" style={{ background: 'var(--surface-2)' }} onClick={() => navigate('/cnss/new')}>
            <Plus size={18} /> Add manually
          </button>
          <button className="btn" style={{ background: 'var(--surface-2)' }} onClick={() => window.print()}><Printer size={18} /> Print</button>
        </div>
      </div>

      {/* ── Filters ── */}
      <form onSubmit={handleSearch} className="search-wrapper glass" style={{ padding: '1rem', flexWrap: 'wrap', direction: 'ltr', marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <AutocompleteInput placeholder="Debtor name" value={filters.nom_cl2} onChange={e => setFilters({ ...filters, nom_cl2: e.target.value })} />
        </div>
        <input type="text" placeholder="CNSS affiliation number" value={filters.numcnss} onChange={e => setFilters({ ...filters, numcnss: e.target.value })} />
        <input type="text" placeholder="Ref. no." value={filters.ref} onChange={e => setFilters({ ...filters, ref: e.target.value })} />
        <button type="submit" className="btn"><Search size={18} /> Search</button>
        <button type="button" className="btn" style={{ background: 'var(--surface-2)' }}
          onClick={() => { setFilters({ nom_cl2: '', numcnss: '', ref: '' }); setActiveFilters({}); setPage(1); }}>
          Clear
        </button>
      </form>

      {/* ── Table ── */}
      <div className="glass table-container print-area" style={{ direction: 'ltr' }}>
        {loading ? (
          <p style={{ padding: '2rem', textAlign: 'center', opacity: 0.6 }}>Loading…</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Ref. no.</th>
                  <th>Debtor</th>
                  <th className="hide-on-mobile">Affiliation no.</th>
                  <th className="hide-on-mobile">Cards</th>
                  <th className="hide-on-mobile">Total debt (TND)</th>
                  <th className="hide-on-mobile">Status</th>
                  <th className="no-print">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No results</td></tr>
                ) : data.map(item => (
                  <tr key={item.id_cn} style={{ cursor: 'pointer' }} onClick={() => navigate(`/cnss/${item.id_cn}`)}>
                    <td>{item.ref}</td>
                    <td>{item.nom_cl2}</td>
                    <td className="hide-on-mobile">{item.numcnss}{item.codeng ? ` (${item.codeng})` : ''}</td>
                    <td className="hide-on-mobile">{item.card_count}</td>
                    <td className="hide-on-mobile" style={{ fontWeight: 700, color: 'var(--primary)' }}>{fmtDinar(item.total_dette)}</td>
                    <td className="hide-on-mobile" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const s = STATUS_MAP[item.status] || STATUS_MAP.cancelled;
                        return (
                          <div className={`badge badge-${s.color}`} style={{ padding: 0, overflow: 'hidden' }}>
                            <select
                                value={item.status || 'has_deposit'}
                                onChange={(e) => handleStatusChange(item.id_cn, e.target.value)}
                                style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: 'inherit', cursor: 'pointer', outline: 'none', padding: '0.4rem 0.8rem', width: '100%', fontFamily: 'inherit', appearance: 'none', textAlign: 'center' }}
                            >
                                {Object.entries(STATUS_MAP).map(([key, info]) => (
                                    <option key={key} value={key} style={{ color: '#000' }}>{info.label}</option>
                                ))}
                            </select>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="no-print" style={{ display: 'flex', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => generateActs(item)}
                        title={Number(item.card_count) ? 'Generate act (Word)' : 'No liquidation cards'}
                        disabled={!Number(item.card_count) || !!processing}
                        style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: Number(item.card_count) ? 'pointer' : 'not-allowed', opacity: Number(item.card_count) ? 1 : 0.35 }}>
                        <FileText size={18} />
                      </button>
                      <button onClick={() => navigate(`/cnss/${item.id_cn}`)}
                        title="Edit"
                        style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}>
                        <Edit size={18} />
                      </button>
                      <button onClick={() => handleDelete(item.id_cn)}
                        title="Delete"
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Pagination
              page={page} totalPages={totalPages} total={total} limit={limit}
              onPageChange={handlePageChange} onLimitChange={handleLimitChange}
            />
          </>
        )}
      </div>
    </div>
  );
}
