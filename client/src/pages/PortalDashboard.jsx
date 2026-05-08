import { useState, useEffect } from 'react';
import { FileText, Search, Activity, Clock, X, Info } from 'lucide-react';
import API_BASE from '../config';

export default function PortalDashboard() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [actions, setActions] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(false);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/portal/records`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('فشل في تحميل الملفات');
      const data = await res.json();
      setRecords(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchActions = async (record) => {
    setSelectedRecord(record);
    setActionsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/portal/records/${record.id}/actions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('فشل في تحميل الإجراءات');
      const data = await res.json();
      setActions(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const closeActionsModal = () => {
    setSelectedRecord(null);
    setActions([]);
  };

  const filteredRecords = records.filter(r => 
    (r.ref && r.ref.toString().includes(search)) ||
    (r.nom_cl2 && r.nom_cl2.includes(search)) ||
    (r.status && r.status.includes(search))
  );

  return (
    <div className="animate-fade" dir="rtl" style={{ padding: '1rem' }}>
      <div className="topbar" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <FileText size={28} style={{ color: 'var(--primary)' }} />
          <div>
            <h2 style={{ color: 'var(--primary)', margin: 0 }}>ملفاتي</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>بوابة الحريف لمتابعة الملفات والإجراءات</p>
          </div>
        </div>
        
        <div style={{ flex: 1, minWidth: '250px', maxWidth: '400px' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
            <Search size={18} style={{ color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="بحث بالعدد، الخصم، أو الحالة..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '0.9rem', width: '100%', outline: 'none', marginRight: '0.5rem' }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <p style={{ opacity: 0.6, textAlign: 'center', padding: '2rem' }}>جاري التحميل…</p>
      ) : error ? (
        <p style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>{error}</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {filteredRecords.map(record => (
            <div 
              key={record.id} 
              className="glass" 
              style={{ 
                padding: '1.5rem', 
                borderRadius: '12px', 
                cursor: 'pointer',
                transition: 'all 0.2s',
                border: '1px solid var(--card-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}
              onClick={() => fetchActions(record)}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  عدد: {record.ref}
                </h3>
                <span className="glass" style={{ padding: '0.2rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', color: record.is_execution ? '#ef4444' : '#3b82f6' }}>
                  {record.is_execution ? 'تنفيذ' : 'عام'}
                </span>
              </div>
              
              <div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '0.2rem' }}>الطالب</div>
                <div style={{ fontWeight: 'bold' }}>{record.nom_cl1 || '-'}</div>
              </div>

              <div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '0.2rem' }}>المطلوب (الخصم)</div>
                <div style={{ fontWeight: 'bold' }}>{record.nom_cl2 || '-'}</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <Clock size={14} />
                  {record.date_s || record.date_ajout || '-'}
                </div>
                {record.status && (
                  <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(255,255,255,0.1)' }}>
                    {record.status}
                  </span>
                )}
              </div>
            </div>
          ))}
          {filteredRecords.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', opacity: 0.5 }}>
              <Info size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
              <p>لا توجد ملفات مرتبطة بحسابك حالياً</p>
            </div>
          )}
        </div>
      )}

      {/* Actions Modal */}
      {selectedRecord && (
        <div className="modal-overlay animate-fade" onClick={closeActionsModal} style={{ zIndex: 1000 }}>
          <div className="modal-content glass-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '95%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Activity size={20} />
                  إجراءات الملف عدد {selectedRecord.ref}
                </h3>
                <div style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '0.2rem' }}>
                  المطلوب: {selectedRecord.nom_cl2}
                </div>
              </div>
              <button className="btn-icon" onClick={closeActionsModal}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ overflowY: 'auto', paddingRight: '0.5rem' }}>
              {actionsLoading ? (
                <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>جاري تحميل الإجراءات…</p>
              ) : actions.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>لا توجد إجراءات مسجلة لهذا الملف حتى الآن</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {actions.map((action, idx) => (
                    <div key={action.id || idx} style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRight: '4px solid var(--primary)', borderRadius: '4px 8px 8px 4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <strong style={{ fontSize: '1.05rem' }}>{action.title}</strong>
                        <span style={{ fontSize: '0.85rem', opacity: 0.7, color: 'var(--primary)' }}>{action.date || action.date_ajout}</span>
                      </div>
                      {action.remarques && (
                        <div style={{ fontSize: '0.9rem', opacity: 0.8, whiteSpace: 'pre-wrap', marginTop: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '4px' }}>
                          {action.remarques}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
