import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Filter, Edit, Printer, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Pagination from '../components/Pagination';
import AutocompleteInput from '../components/AutocompleteInput';
import { formatAmount, STATUS_MAP } from '../utils/formatters';

import API_BASE from '../config';

const API = `${API_BASE}/execution`;

export default function RegistreExecution() {
  const navigate = useNavigate();

  const [data, setData]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [limit, setLimit]           = useState(25);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(1);


  const [filters, setFilters]       = useState({ ref: '', nom_cl1: '', de_part: '', date_inscri: '' });
  const [activeFilters, setActiveFilters] = useState({});

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
        setData(prev => prev.map(item => item.id_o === id ? { ...item, status: newStatus } : item));
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
    if (!window.confirm('Are you sure you want to delete this execution file and all related data?')) return;
    const token = localStorage.getItem('token');
    
    try {
      const res = await fetch(`${API}/${id}`, { 
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setData(prev => prev.filter(item => item.id_o !== id));
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


  return (
    <div className="animate-fade">
      {/* ── Toolbar ── */}
      <div className="topbar" style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: 'var(--primary)' }}>Execution</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn" onClick={() => window.print()}><Printer size={18} /> Print</button>
          <button className="btn" onClick={() => navigate('/record/execution/new')}>
            <Plus size={18} /> Add Record
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
        <form onSubmit={handleSearch} className="search-wrapper glass" style={{ padding: '1rem', flexWrap: 'wrap', direction: 'ltr', marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
          <input type="text" placeholder="Reference Number"   value={filters.ref}        onChange={e => setFilters({ ...filters, ref: e.target.value })} />
          <div style={{ flex: 1, minWidth: '150px' }}>
            <AutocompleteInput placeholder="Service Requester" value={filters.de_part} onChange={e => setFilters({ ...filters, de_part: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <AutocompleteInput placeholder="Applicant Name" value={filters.nom_cl1} onChange={e => setFilters({ ...filters, nom_cl1: e.target.value })} />
          </div>
          <input type="text" placeholder="Record Notification Date (YYYY-MM-DD)" value={filters.date_inscri || ''} onChange={e => setFilters({ ...filters, date_inscri: e.target.value })} />

          <button type="submit" className="btn"><Search size={18} /> Search</button>
          <button type="button" className="btn" style={{ background: 'var(--surface-2)' }}
            onClick={() => { setFilters({ ref: '', nom_cl1: '', de_part: '', date_inscri: '' }); setActiveFilters({}); setPage(1); }}>
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
                  <th>Reference Number</th>
                  <th className="hide-on-mobile">Service Requester</th>
                  <th>Applicant</th>
                  <th className="hide-on-mobile">Defendant</th>

                  <th className="hide-on-mobile">Record Type</th>
                  <th className="hide-on-mobile">Total Amount</th>
                  <th>Status</th>
                  <th className="no-print">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No results</td></tr>
                ) : data.map(item => (
                  <tr key={item.id_o}>
                    <td>{item.ref}</td>
                    <td className="hide-on-mobile">{item.de_part}</td>
                    <td>{item.nom_cl1}</td>
                    <td className="hide-on-mobile">{item.nom_cl2}</td>

                    <td className="hide-on-mobile">{item.remarque}</td>
                    <td className="hide-on-mobile" style={{ fontWeight: 700, color: 'var(--primary)' }}>{formatAmount(item.total_salaire)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const s = STATUS_MAP[item.status] || STATUS_MAP.cancelled;
                        return (
                          <div className={`badge badge-${s.color}`} style={{ padding: 0, overflow: 'hidden' }}>
                            <select 
                                value={item.status || 'not_started'} 
                                onChange={(e) => handleStatusChange(item.id_o, e.target.value)}
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
                    <td className="no-print" style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => navigate(`/record/execution/${item.id_o}`)}
                        title="Edit"
                        style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}>
                        <Edit size={18} />
                      </button>
                      <button onClick={() => handleDelete(item.id_o)}
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
