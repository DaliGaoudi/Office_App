import { useState, useEffect } from 'react';
import { Database, Wand2, Check, X, AlertTriangle, Search, Info, Edit2 } from 'lucide-react';
import API_BASE from '../config';

export default function DataCleaning() {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [search, setSearch] = useState('');

  const [editingClusterIdx, setEditingClusterIdx] = useState(null);
  const [editName, setEditName] = useState('');

  const fetchSuggestions = async () => {
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/data-cleaning/suggestions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('فشل في جلب اقتراحات الذكاء الاصطناعي');
      const data = await res.json();
      
      const mapped = data.map(cluster => ({
        ...cluster,
        items: cluster.items.map(item => ({ ...item, selected: true })),
        approved: false,
        rejected: false
      }));
      setClusters(mapped);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = (idx) => {
    const newClusters = [...clusters];
    newClusters[idx].approved = true;
    newClusters[idx].rejected = false;
    setClusters(newClusters);
  };

  const handleReject = (idx) => {
    const newClusters = [...clusters];
    newClusters[idx].approved = false;
    newClusters[idx].rejected = true;
    setClusters(newClusters);
  };

  const startEdit = (idx, currentName) => {
    setEditingClusterIdx(idx);
    setEditName(currentName);
  };

  const saveEdit = (idx) => {
    if (!editName.trim()) return;
    const newClusters = [...clusters];
    newClusters[idx].canonicalName = editName.trim();
    setClusters(newClusters);
    setEditingClusterIdx(null);
  };

  const toggleItemSelection = (clusterIdx, itemIdx) => {
    const newClusters = [...clusters];
    newClusters[clusterIdx].items[itemIdx].selected = !newClusters[clusterIdx].items[itemIdx].selected;
    setClusters(newClusters);
  };

  const applyMerges = async () => {
    const mergesToApply = clusters
      .filter(c => c.approved)
      .map(c => {
        const selectedNames = c.items.filter(i => i.selected).map(i => i.name);
        return {
          canonicalName: c.canonicalName,
          oldNames: selectedNames
        };
      })
      .filter(m => m.oldNames.length > 0);

    if (mergesToApply.length === 0) {
      setError('الرجاء الموافقة على بعض الاقتراحات أولاً');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من دمج ${mergesToApply.length} مجموعة؟ هذا الإجراء سيقوم بتغيير البيانات في الدفاتر ولا يمكن التراجع عنه.`)) {
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/data-cleaning/merge`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ merges: mergesToApply })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ أثناء الدمج');
      
      setSuccessMsg(`تم بنجاح! تم تحديث ${data.totalUpdated} ملف في الدفاتر.`);
      
      // Remove approved ones from list
      setClusters(clusters.filter(c => !c.approved));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredClusters = clusters.filter(c => 
    c.canonicalName.includes(search) || 
    c.items.some(i => i.name.includes(search))
  );

  return (
    <div className="animate-fade" dir="rtl" style={{ padding: '1rem' }}>
      <div className="topbar" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Database size={28} style={{ color: 'var(--primary)' }} />
          <div>
            <h2 style={{ color: 'var(--primary)', margin: 0 }}>تنظيف وتوحيد البيانات</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>استخدام الذكاء الاصطناعي لتوحيد أسماء الحرفاء في الدفاتر</p>
          </div>
        </div>
      </div>

      <div className="glass" style={{ padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <Wand2 size={24} style={{ color: '#8b5cf6' }} />
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            هذه الأداة تقوم بالبحث عن الأسماء المتشابهة في الدفاتر (مثال: أخطاء إملائية، أسماء بالفرنسية والعربية لنفس الشركة) وتقترح اسماً واحداً صحيحاً ليتم اعتماده.
            <br />
            <strong>ملاحظة هامة:</strong> الموافقة على الدمج ستقوم بتغيير أسماء الحرفاء في الدفاتر بشكل دائم لتوحيدها.
          </p>
        </div>
        
        <button className="btn" onClick={fetchSuggestions} disabled={loading} style={{ background: '#8b5cf6', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {loading ? 'جاري التحليل...' : (
            <>
              <Wand2 size={18} /> بدء فحص البيانات بالذكاء الاصطناعي
            </>
          )}
        </button>

        {error && <div style={{ color: '#ef4444', marginTop: '1rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle size={18}/> {error}</div>}
        {successMsg && <div style={{ color: '#10b981', marginTop: '1rem', padding: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Check size={18}/> {successMsg}</div>}
      </div>

      {clusters.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>اقتراحات التوحيد ({clusters.length})</h3>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.4rem 0.6rem' }}>
                <Search size={16} style={{ color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  placeholder="بحث..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '0.85rem', outline: 'none', marginRight: '0.5rem' }}
                />
              </div>
              <button 
                className="btn" 
                onClick={applyMerges}
                disabled={loading || clusters.filter(c => c.approved).length === 0}
                style={{ background: '#10b981' }}
              >
                تطبيق {clusters.filter(c => c.approved).length} دمج
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
            {filteredClusters.map((cluster, idx) => (
              <div 
                key={idx} 
                className="glass" 
                style={{ 
                  padding: '1.5rem', 
                  borderRadius: '12px',
                  border: cluster.approved ? '1px solid #10b981' : cluster.rejected ? '1px solid #ef4444' : '1px solid var(--card-border)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {cluster.approved && <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '4px', background: '#10b981' }} />}
                {cluster.rejected && <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '4px', background: '#ef4444' }} />}
                
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>الاسم الموحد المقترح (سيتم تغييره في كل الملفات):</div>
                  
                  {editingClusterIdx === idx ? (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input 
                        type="text" 
                        value={editName} 
                        onChange={e => setEditName(e.target.value)}
                        style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', background: 'var(--bg)', border: '1px solid var(--primary)', color: 'var(--text)', outline: 'none' }}
                      />
                      <button className="btn-icon" onClick={() => saveEdit(idx)} style={{ background: 'var(--primary)', color: 'white', borderRadius: '4px' }}>
                        <Check size={16} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '1.1rem', color: 'var(--primary)' }}>{cluster.canonicalName}</strong>
                      <button className="btn-icon" onClick={() => startEdit(idx, cluster.canonicalName)} title="تعديل الاسم الموحد" style={{ padding: '0.2rem' }}>
                        <Edit2 size={14} style={{ color: 'var(--text-muted)' }} />
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ background: 'rgba(0,0,0,0.1)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>الأسماء الحالية التي سيتم دمجها ({cluster.items.length}):</div>
                  <ul style={{ margin: 0, paddingRight: '0.5rem', listStyle: 'none', fontSize: '0.9rem' }}>
                    {cluster.items.map((item, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', opacity: item.name === cluster.canonicalName && item.selected ? 0.6 : 1 }}>
                        <input 
                          type="checkbox" 
                          checked={item.selected} 
                          onChange={() => toggleItemSelection(idx, i)}
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                        <span style={{ textDecoration: !item.selected ? 'line-through' : 'none', color: !item.selected ? 'var(--text-muted)' : 'inherit' }}>
                          {item.name} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({item.count} ملف)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={() => handleApprove(idx)}
                    style={{ flex: 1, padding: '0.5rem', border: 'none', borderRadius: '6px', cursor: 'pointer', background: cluster.approved ? '#10b981' : 'rgba(16, 185, 129, 0.1)', color: cluster.approved ? 'white' : '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', transition: 'all 0.2s' }}
                  >
                    <Check size={16} /> موافقة
                  </button>
                  <button 
                    onClick={() => handleReject(idx)}
                    style={{ flex: 1, padding: '0.5rem', border: 'none', borderRadius: '6px', cursor: 'pointer', background: cluster.rejected ? '#ef4444' : 'rgba(239, 68, 68, 0.1)', color: cluster.rejected ? 'white' : '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', transition: 'all 0.2s' }}
                  >
                    <X size={16} /> رفض
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
