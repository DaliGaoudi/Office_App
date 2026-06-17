import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Edit, Printer, Trash2, UploadCloud, ScanLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Pagination from '../components/Pagination';
import AutocompleteInput from '../components/AutocompleteInput';
import { STATUS_MAP } from '../utils/formatters';

import API_BASE from '../config';

const API = `${API_BASE}/cnss`;

// The local Scan Bridge on the office PC drives the scanner (see scan-watcher/).
const BRIDGE_URL = localStorage.getItem('scanBridgeUrl') || 'http://127.0.0.1:17171';

// CNSS amounts (dette) are decimal dinars stored as strings ("2959.306"), NOT
// the integer millimes the general registers use — so format directly.
const fmtDinar = (v) => {
  const n = parseFloat(v);
  if (isNaN(n)) return '0,000';
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: true }).format(n);
};

// Scanned pages are large near-lossless JPEGs; downscale before the 10MB upload.
const SCAN_MAX_EDGE = 2000, SCAN_JPEG_QUALITY = 0.72;
function compressImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      const scale = Math.min(1, SCAN_MAX_EDGE / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('فشل ضغط الصورة')), 'image/jpeg', SCAN_JPEG_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذّرت معالجة الصورة')); };
    img.src = url;
  });
}

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
        alert('حدث خطأ: ' + (err.error || 'فشل التحديث'));
      }
    } catch (e) {
      console.error(e);
      alert('خطأ في الاتصال بالخادم');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الملف وكل بطاقات الجبر المرتبطة به؟')) return;
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

  // Send a card image/PDF to the server, which extracts it and auto-creates the
  // record, then jump to the new record for review + act generation.
  const submitCardFile = async (fileOrBlob, filename) => {
    setProcessing('جاري قراءة البطاقة وإنشاء الملف…');
    const token = localStorage.getItem('token');
    const fd = new FormData();
    fd.append('file', fileOrBlob, filename || 'card.jpg');
    try {
      const res = await fetch(`${API}/scan`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const json = await res.json();
      if (res.ok && json.success) {
        navigate(`/cnss/${json.id_cn}`);
      } else {
        alert('تعذّر إنشاء الملف: ' + (json.error || res.status));
      }
    } catch (e) {
      console.error(e);
      alert('خطأ في الاتصال بالخادم');
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
      alert('خطأ في معالجة الملف: ' + err.message);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleScan = async () => {
    setProcessing('جاري المسح الضوئي…');
    try {
      const scanUrl = `${BRIDGE_URL}/scan` + (localStorage.getItem('scanMock') === '1' ? '?mock=1' : '');
      const scanRes = await fetch(scanUrl, { method: 'POST' });
      if (!scanRes.ok) { const info = await scanRes.json().catch(() => ({})); throw new Error(info.error || 'تعذّر المسح الضوئي'); }
      const blob = await compressImage(await scanRes.blob());
      await submitCardFile(blob, 'scan.jpg');
    } catch (err) {
      console.error('Scan error:', err);
      const offline = err instanceof TypeError;
      setProcessing(null);
      alert(offline
        ? 'تعذّر الوصول إلى الماسح الضوئي.\nنزّل «أداة المسح الضوئي» من الإعدادات وشغّلها مرة واحدة، وتأكّد من توصيل الجهاز.'
        : ('خطأ في المسح الضوئي: ' + err.message));
    }
  };

  return (
    <div className="animate-fade">
      {/* ── Processing overlay (extraction + auto-create) ── */}
      {processing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass" style={{ padding: '2rem 3rem', textAlign: 'center', direction: 'rtl' }}>
            <div style={{ width: 36, height: 36, margin: '0 auto 1rem', border: '3px solid var(--card-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'cnss-spin 0.8s linear infinite' }} />
            <div style={{ fontSize: '1rem', color: 'var(--primary)' }}>{processing}</div>
          </div>
          <style dangerouslySetInnerHTML={{ __html: '@keyframes cnss-spin { to { transform: rotate(360deg); } }' }} />
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="topbar" style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: 'var(--primary)' }}>ملفات الضمان الاجتماعي (CNSS)</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,application/pdf" onChange={handleUpload} />
          <button className="btn" disabled={!!processing} style={{ background: 'var(--primary)' }} onClick={handleScan}>
            <ScanLine size={18} /> مسح بطاقة جبر
          </button>
          <button className="btn" disabled={!!processing} onClick={() => fileInputRef.current && fileInputRef.current.click()}>
            <UploadCloud size={18} /> رفع بطاقة جبر
          </button>
          <button className="btn" style={{ background: 'var(--surface-2)' }} onClick={() => navigate('/cnss/new')}>
            <Plus size={18} /> إضافة يدوية
          </button>
          <button className="btn" style={{ background: 'var(--surface-2)' }} onClick={() => window.print()}><Printer size={18} /> طباعة</button>
        </div>
      </div>

      {/* ── Filters ── */}
      <form onSubmit={handleSearch} className="search-wrapper glass" style={{ padding: '1rem', flexWrap: 'wrap', direction: 'rtl', marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <AutocompleteInput placeholder="اسم المطلوب" value={filters.nom_cl2} onChange={e => setFilters({ ...filters, nom_cl2: e.target.value })} />
        </div>
        <input type="text" placeholder="عدد الإنخراط بالصندوق" value={filters.numcnss} onChange={e => setFilters({ ...filters, numcnss: e.target.value })} />
        <input type="text" placeholder="العدد الترتيبي" value={filters.ref} onChange={e => setFilters({ ...filters, ref: e.target.value })} />
        <button type="submit" className="btn"><Search size={18} /> بحث</button>
        <button type="button" className="btn" style={{ background: 'var(--surface-2)' }}
          onClick={() => { setFilters({ nom_cl2: '', numcnss: '', ref: '' }); setActiveFilters({}); setPage(1); }}>
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
                  <th>العدد الترتيبي</th>
                  <th>اسم المطلوب</th>
                  <th className="hide-on-mobile">عدد الإنخراط</th>
                  <th className="hide-on-mobile">عدد البطاقات</th>
                  <th className="hide-on-mobile">إجمالي الدين (د.ت)</th>
                  <th className="hide-on-mobile">الحالة</th>
                  <th className="no-print">عمل</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>لا توجد نتائج</td></tr>
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
                      <button onClick={() => navigate(`/cnss/${item.id_cn}`)}
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
    </div>
  );
}
