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

  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters]       = useState({ ref: '', nom_cl1: '', de_part: '' });
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
  
  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الملف التنفيذي وكل ما يتعلق به؟')) return;
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
        alert('حدث خطأ: ' + (err.error || 'فشل الحذف'));
      }
    } catch (e) {
      console.error(e);
      alert('خطأ في الاتصال بالخادم');
    }
  };


  return (
    <div className="animate-fade">
      {/* ── Toolbar ── */}
      <div className="topbar" style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: 'var(--primary)' }}>دفتر التنفيذ</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn" style={{ background: 'var(--card-bg)' }} onClick={() => setShowFilters(!showFilters)}>
            <Filter size={18} /> بحث
          </button>
          <button className="btn" onClick={() => window.print()}><Printer size={18} /> طباعة</button>
          <button className="btn" onClick={() => navigate('/record/execution/new')}>
            <Plus size={18} /> إضافة محضر
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      {showFilters && (
        <form onSubmit={handleSearch} className="search-wrapper glass" style={{ padding: '1rem', flexWrap: 'wrap', direction: 'rtl', marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
          <input type="text" placeholder="العدد الترتيبي"   value={filters.ref}        onChange={e => setFilters({ ...filters, ref: e.target.value })} />
          <div style={{ flex: 1, minWidth: '150px' }}>
            <AutocompleteInput placeholder="طالب الخدمة" value={filters.de_part} onChange={e => setFilters({ ...filters, de_part: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <AutocompleteInput placeholder="اسم الطالب" value={filters.nom_cl1} onChange={e => setFilters({ ...filters, nom_cl1: e.target.value })} />
          </div>

          <button type="submit" className="btn"><Search size={18} /> بحث</button>
          <button type="button" className="btn" style={{ background: 'rgba(255,255,255,0.08)' }}
            onClick={() => { setFilters({ ref: '', nom_cl1: '', de_part: '' }); setActiveFilters({}); setPage(1); }}>
            مسح
          </button>
        </form>
      )}

      {/* ── Table ── */}
      <div className="glass table-container print-area" style={{ direction: 'rtl' }}>
        {loading ? (
          <p style={{ padding: '2rem', textAlign: 'center', opacity: 0.6 }}>جاري التحميل…</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>العدد الترتيبي</th>
                  <th>طالب الخدمة</th>
                  <th>الطالب</th>
                  <th>المطلوب</th>

                  <th>نوع المحضر</th>
                  <th>المبلغ الجملي</th>
                  <th>الحالة</th>
                  <th className="no-print">عمل</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>لا توجد نتائج</td></tr>
                ) : data.map(item => (
                  <tr key={item.id_o}>
                    <td>{item.ref}</td>
                    <td>{item.de_part}</td>
                    <td>{item.nom_cl1}</td>
                    <td>{item.nom_cl2}</td>

                    <td>{item.remarque}</td>
                    <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{formatAmount(item.total_salaire)}</td>
                    <td>
                      {(() => {
                        const s = STATUS_MAP[item.status] || STATUS_MAP.cancelled;
                        return <span className={`badge badge-${s.color}`}>{s.label}</span>;
                      })()}
                    </td>
                    <td className="no-print" style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => navigate(`/record/execution/${item.id_o}`)}
                        title="تعديل"
                        style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}>
                        <Edit size={18} />
                      </button>
                      <button onClick={() => handleDelete(item.id_o)}
                        title="حذف"
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
