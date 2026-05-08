import { useState, useEffect } from 'react';
import { Eye, Clock, User, Filter, Search, ChevronLeft, ChevronRight, Activity, FileText, Settings, Trash2, Edit2, PlusCircle } from 'lucide-react';
import API_BASE from '../config';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/audit?page=${page}&limit=50&search=${encodeURIComponent(search)}&action_type=${actionFilter}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('فشل في تحميل السجلات');
      const data = await res.json();
      setLogs(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter]);

  // Handle search with debounce
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (page === 1) fetchLogs();
      else setPage(1); // Changing page will trigger fetch
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const getActionIcon = (action) => {
    switch(action) {
      case 'CREATE': return <PlusCircle size={16} color="#10b981" />;
      case 'UPDATE': return <Edit2 size={16} color="#f59e0b" />;
      case 'DELETE': return <Trash2 size={16} color="#ef4444" />;
      case 'VIEW': return <Eye size={16} color="#3b82f6" />;
      default: return <Activity size={16} color="var(--text-muted)" />;
    }
  };

  const getActionLabel = (action) => {
    switch(action) {
      case 'CREATE': return <span style={{ color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>إضافة</span>;
      case 'UPDATE': return <span style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>تعديل</span>;
      case 'DELETE': return <span style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>حذف</span>;
      case 'VIEW': return <span style={{ color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>عرض</span>;
      default: return <span style={{ color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>{action}</span>;
    }
  };

  const getEntityIcon = (entity) => {
    switch(entity) {
      case 'RECORD': return <FileText size={14} />;
      case 'ACTION': return <Activity size={14} />;
      case 'USER': return <User size={14} />;
      case 'CALENDAR': return <Clock size={14} />;
      default: return <Settings size={14} />;
    }
  };

  return (
    <div className="animate-fade" dir="rtl" style={{ padding: '1rem', paddingBottom: '3rem' }}>
      <div className="topbar" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Eye size={28} style={{ color: 'var(--primary)' }} />
          <div>
            <h2 style={{ color: 'var(--primary)', margin: 0 }}>سجل النشاطات (Audit Logs)</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>تتبع جميع الحركات والتغييرات في النظام لضمان الشفافية والمحاسبة</p>
          </div>
        </div>
      </div>

      <div className="glass" style={{ padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
          <Filter size={18} />
          <span style={{ fontSize: '0.9rem' }}>تصفية:</span>
        </div>
        
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="بحث بالاسم أو التفاصيل..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '0.85rem', width: '100%', outline: 'none', marginRight: '0.5rem' }}
            />
          </div>
        </div>

        <select 
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '8px', background: 'var(--bg)', border: '1px solid var(--card-border)', color: 'var(--text)', outline: 'none' }}
        >
          <option value="">كل الحركات</option>
          <option value="CREATE">إضافة</option>
          <option value="UPDATE">تعديل</option>
          <option value="DELETE">حذف</option>
          <option value="VIEW">عرض</option>
        </select>
      </div>

      {loading && page === 1 ? (
        <p style={{ opacity: 0.6, textAlign: 'center', padding: '2rem' }}>جاري تحميل السجلات…</p>
      ) : error ? (
        <p style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>{error}</p>
      ) : (
        <div className="glass" style={{ borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--card-border)' }}>
                  <th style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)', width: '15%' }}>التاريخ والوقت</th>
                  <th style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)', width: '15%' }}>المستخدم</th>
                  <th style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)', width: '10%' }}>الحركة</th>
                  <th style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)', width: '15%' }}>الوحدة</th>
                  <th style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)', width: '45%' }}>التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
                      لا توجد نشاطات مسجلة
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                      <td style={{ padding: '1rem', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.8 }}>
                          <Clock size={14} />
                          {new Date(log.created_at).toLocaleString('fr-FR', { 
                            year: 'numeric', month: '2-digit', day: '2-digit', 
                            hour: '2-digit', minute: '2-digit', second: '2-digit' 
                          })}
                        </div>
                      </td>
                      <td style={{ padding: '1rem', fontWeight: 'bold' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <User size={16} style={{ color: 'var(--primary)' }} />
                          {log.username}
                        </div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {getActionIcon(log.action)}
                          {getActionLabel(log.action)}
                        </div>
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.8 }}>
                          {getEntityIcon(log.entity)}
                          {log.entity}
                        </div>
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.95rem' }}>
                        {log.details}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--card-border)', background: 'rgba(0,0,0,0.1)' }}>
            <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>
              إجمالي السجلات: {total}
            </span>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button 
                  className="btn-icon glass" 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronRight size={18} />
                </button>
                <span style={{ fontSize: '0.85rem', padding: '0 0.5rem' }}>
                  صفحة {page} من {totalPages}
                </span>
                <button 
                  className="btn-icon glass" 
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronLeft size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
