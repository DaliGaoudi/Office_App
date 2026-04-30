import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Filter, Edit, Printer, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Pagination from '../components/Pagination';
import AutocompleteInput from '../components/AutocompleteInput';
import { STATUS_MAP } from '../utils/formatters';

import API_BASE from '../config';

const API = `${API_BASE}/cnss`;

export default function RegistreCNSS() {
  const navigate = useNavigate();

  const [data, setData]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [limit, setLimit]           = useState(25);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(1);


  const [filters, setFilters]       = useState({ nom_ste: '', num_cnss: '', num_affaire: '' });
  const [activeFilters, setActiveFilters] = useState({});

  const [showModal, setShowModal]   = useState(false);
  const [formData, setFormData]     = useState({ nom_ste: '', num_cnss: '', num_affaire: '' });

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
        alert('حدث خطأ: ' + (err.error || 'فشل التحديث'));
      }
    } catch (e) {
      console.error(e);
      alert('خطأ في الاتصال بالخادم');
    }
  };
  
  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الملف؟')) return;
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
        alert('حدث خطأ: ' + (err.error || 'فشل الحذف'));
      }
    } catch (e) {
      console.error(e);
      alert('خطأ في الاتصال بالخادم');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      await fetch(API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      setShowModal(false);
      fetchRecords(page, limit, activeFilters);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="animate-fade">
      {/* ── Toolbar ── */}
      <div className="topbar" style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: 'var(--primary)' }}>ملفات الضمان الاجتماعي</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn" onClick={() => window.print()}><Printer size={18} /> طباعة</button>
          <button className="btn" onClick={() => { setFormData({ nom_ste: '', num_cnss: '', num_affaire: '' }); setShowModal(true); }}>
            <Plus size={18} /> إضافة
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
        <form onSubmit={handleSearch} className="search-wrapper glass" style={{ padding: '1rem', flexWrap: 'wrap', direction: 'rtl', marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <AutocompleteInput placeholder="اسم الشركة"  value={filters.nom_ste}     onChange={e => setFilters({ ...filters, nom_ste: e.target.value })} />
          </div>
          <input type="text" placeholder="رقم CNSS"    value={filters.num_cnss}    onChange={e => setFilters({ ...filters, num_cnss: e.target.value })} />
          <input type="text" placeholder="رقم القضية"  value={filters.num_affaire} onChange={e => setFilters({ ...filters, num_affaire: e.target.value })} />
          <button type="submit" className="btn"><Search size={18} /> بحث</button>
          <button type="button" className="btn" style={{ background: 'rgba(255,255,255,0.08)' }}
            onClick={() => { setFilters({ nom_ste: '', num_cnss: '', num_affaire: '' }); setActiveFilters({}); setPage(1); }}>
            مسح
          </button>
        </form>

      {/* ── Table ── */}
      <div className="glass table-container print-area" style={{ direction: 'rtl' }}>
        {loading ? (
          <p style={{ padding: '2rem', textAlign: 'center', opacity: 0.6 }}>جاري التحميل…</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>رقم القضية</th>
                  <th>اسم الشركة</th>
                  <th className="hide-on-mobile">رقم CNSS</th>
                  <th className="hide-on-mobile">الحالة</th>
                  <th className="no-print">عمل</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>لا توجد نتائج</td></tr>
                ) : data.map(item => (
                  <tr key={item.id_cn}>
                    <td>{item.num_affaire}</td>
                    <td>{item.nom_ste}</td>
                    <td className="hide-on-mobile">{item.num_cnss}</td>
                    <td className="hide-on-mobile" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const s = STATUS_MAP[item.status] || STATUS_MAP.cancelled;
                        return (
                          <div className={`badge badge-${s.color}`} style={{ padding: 0, overflow: 'hidden' }}>
                            <select 
                                value={item.status || 'not_started'} 
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
                    <td className="no-print" style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => navigate(`/record/cnss/${item.id_cn}`)}
                        title="تعديل"
                        style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}>
                        <Edit size={18} />
                      </button>
                      <button onClick={() => handleDelete(item.id_cn)}
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

      {/* ── Add Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass" style={{ padding: '2rem', width: 500, maxWidth: '90%', direction: 'rtl' }}>
            <h3 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>إضافة ملف الضمان الاجتماعي</h3>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input type="text" placeholder="رقم القضية *"  value={formData.num_affaire} onChange={e => setFormData({ ...formData, num_affaire: e.target.value })} required />
              <AutocompleteInput placeholder="اسم الشركة *"  value={formData.nom_ste}     onChange={e => setFormData({ ...formData, nom_ste: e.target.value })} required />
              <input type="text" placeholder="رقم CNSS"      value={formData.num_cnss}    onChange={e => setFormData({ ...formData, num_cnss: e.target.value })} />
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn" style={{ flex: 1 }}>حفظ</button>
                <button type="button" className="btn" style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }} onClick={() => setShowModal(false)}>إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
