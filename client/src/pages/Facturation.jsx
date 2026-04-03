import { useState, useEffect, useCallback, Fragment } from 'react';
import { Search, Printer, FileText, ChevronDown, ChevronUp, CheckSquare, Square } from 'lucide-react';
import Pagination from '../components/Pagination';
import { formatAmount, STATUS_MAP } from '../utils/formatters';
import API_BASE from '../config';

/* ─── config per register type ───────────────────────────────────────────── */
const CONFIG = {
  general: {
    label: 'دفتر عام', api: 'registre', dateField: 'date_reg',
    columns: [
      { key: 'ref',      label: 'العدد' },
      { key: 'de_part',  label: 'طالب الخدمة' },
      { key: 'nom_cl1',  label: 'الطالب' },
      { key: 'nom_cl2',  label: 'المطلوب' },
      { key: 'date_reg', label: 'التاريخ' },
      { key: 'base_fare', label: 'الأجرة', isAmount: true },
      { key: 'tva',       label: 'TVA', isAmount: true },
      { key: 'expenses',  label: 'مصاريف', isAmount: true },
      { key: 'calculated_total', label: 'الجملة', isAmount: true, isTotal: true },
      { key: 'status',    label: 'الحالة' },
    ],
    searchFields: [
      { key: 'ref', placeholder: 'العدد' },
      { key: 'de_part', placeholder: 'طالب الخدمة' },
    ],
  },
  execution: {
    label: 'دفتر التنفيذ', api: 'execution', dateField: 'date_inscri',
    columns: [
      { key: 'ref',         label: 'الملف' },
      { key: 'de_part',     label: 'طالب الخدمة' },
      { key: 'nom_cl1',     label: 'الطالب' },
      { key: 'nom_cl2',     label: 'المطلوب' },
      { key: 'date_inscri', label: 'التاريخ' },
      { key: 'base_fare',   label: 'الأجرة', isAmount: true },
      { key: 'tva',         label: 'TVA', isAmount: true },
      { key: 'expenses',    label: 'مصاريف', isAmount: true },
      { key: 'calculated_total', label: 'الجملة', isAmount: true, isTotal: true },
      { key: 'status',      label: 'الحالة' },
    ],
    searchFields: [
      { key: 'ref', placeholder: 'الملف' },
      { key: 'de_part', placeholder: 'طالب الخدمة' },
    ],
  },
  cnss: {
    label: 'دوسيهات CNSS', api: 'cnss', dateField: null,
    columns: [
      { key: 'num_affaire',   label: 'رقم القضية' },
      { key: 'nom_ste',       label: 'الشركة' },
      { key: 'total_montant', label: 'المبلغ (د.ت)', isAmount: true },
      { key: 'status',        label: 'الحالة' },
    ],
    searchFields: [
      { key: 'nom_ste', placeholder: 'اسم الشركة' },
    ],
  },
};

const PAGE_SIZES = [25, 50, 100, 200];

export default function Facturation({ type = 'general' }) {
  const cfg = CONFIG[type] || CONFIG.general;
  const isExecution = type === 'execution';

  // Data
  const [data, setData]             = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [count, setCount]           = useState(0);
  const [loading, setLoading]       = useState(false);

  // Pagination
  const [page, setPage]             = useState(1);
  const [limit, setLimit]           = useState(50);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [filters, setFilters]             = useState({});
  const [activeFilters, setActiveFilters] = useState({});
  const [dateDebut, setDateDebut]         = useState('');
  const [dateFin, setDateFin]             = useState('');
  const [activeDates, setActiveDates]     = useState({ dateDebut: '', dateFin: '' });

  // Execution-specific: Selected actions per file
  // Format: { [fileId]: [selectedActionId1, selectedActionId2, ...] }
  const [selectedActions, setSelectedActions] = useState({});
  const [expandedFiles, setExpandedFiles]     = useState({});

  const fetchData = useCallback(async (pg = 1, lim = limit, flt = activeFilters, dates = activeDates) => {
    setLoading(true);
    const params = new URLSearchParams({ page: pg, limit: lim, ...flt });
    if (dates.dateDebut) params.set('date_debut', dates.dateDebut);
    if (dates.dateFin)   params.set('date_fin',   dates.dateFin);

    try {
      const res  = await fetch(`${API_BASE}/${cfg.api}/facturation/list?${params}`, {
        headers: { Authorization: 'Bearer dummy-token' }
      });
      const json = await res.json();
      const rows = json.data || [];
      setData(rows);
      setGrandTotal(json.total || 0);
      setCount(json.count || 0);
      setTotalPages(json.totalPages || 1);

      // Initialize selected actions for execution
      if (isExecution) {
        const initialSels = { ...selectedActions };
        rows.forEach(file => {
          if (!initialSels[file.id_o]) {
            initialSels[file.id_o] = file.actions ? file.actions.map(a => a.id) : [];
          }
        });
        setSelectedActions(initialSels);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [cfg.api, limit, activeFilters, activeDates, isExecution]);

  useEffect(() => { fetchData(page, limit, activeFilters, activeDates); }, [fetchData, page, limit, activeFilters, activeDates]);
  
  useEffect(() => { 
    setPage(1); setActiveFilters({}); setActiveDates({ dateDebut: '', dateFin: '' }); 
    setFilters({}); setDateDebut(''); setDateFin(''); 
    setSelectedActions({}); setExpandedFiles({});
  }, [type]);

  // Recalculate dynamic totals for execution based on selections
  const currentTotals = isExecution 
    ? data.reduce((acc, file) => {
        const fileSels = selectedActions[file.id_o] || [];
        const selectedActs = (file.actions || []).filter(a => fileSels.includes(a.id));
        
        acc.base += selectedActs.reduce((s, a) => s + (parseFloat(a.base) || 0), 0);
        acc.tva += selectedActs.reduce((s, a) => s + (parseFloat(a.tva) || 0), 0);
        acc.expenses += selectedActs.reduce((s, a) => s + (parseFloat(a.expenses) || 0), 0);
        acc.total += selectedActs.reduce((s, a) => s + (parseFloat(a.total) || 0), 0);
        return acc;
      }, { base: 0, tva: 0, expenses: 0, total: 0 })
    : data.reduce((acc, row) => {
        acc.base += (parseFloat(row.base_fare) || 0);
        acc.tva += (parseFloat(row.tva) || 0);
        acc.expenses += (parseFloat(row.expenses) || 0);
        acc.total += (parseFloat(row.calculated_total || row.total_montant) || 0);
        return acc;
      }, { base: 0, tva: 0, expenses: 0, total: 0 });

  const toggleAction = (fileId, actionId) => {
    const sels = selectedActions[fileId] || [];
    if (sels.includes(actionId)) {
        setSelectedActions({ ...selectedActions, [fileId]: sels.filter(id => id !== actionId) });
    } else {
        setSelectedActions({ ...selectedActions, [fileId]: [...sels, actionId] });
    }
  };

  const selectAllActions = (fileId, actions) => {
    setSelectedActions({ ...selectedActions, [fileId]: actions.map(a => a.id) });
  };

  const deselectAllActions = (fileId) => {
    setSelectedActions({ ...selectedActions, [fileId]: [] });
  };

  const toggleExpand = (fileId) => {
    setExpandedFiles({ ...expandedFiles, [fileId]: !expandedFiles[fileId] });
  };

  return (
    <div className="animate-fade" dir="rtl">
      <div className="topbar no-print" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <FileText size={22} style={{ color: 'var(--primary)' }} />
          <h2 style={{ color: 'var(--primary)', margin: 0 }}>الفوترة — {cfg.label}</h2>
        </div>
        <button className="btn" onClick={() => window.print()} disabled={data.length === 0}>
          <Printer size={18} /> طباعة الفاتورة
        </button>
      </div>

      {/* ── Search panel (No-Print) ── */}
      <form onSubmit={(e) => { e.preventDefault(); setPage(1); setActiveFilters({...filters}); setActiveDates({dateDebut, dateFin}); }} 
        className="glass no-print" style={{ padding:'1rem', marginBottom:'1rem', display:'flex', flexWrap:'wrap', gap:'0.8rem', alignItems: 'flex-end' }}>
        {cfg.searchFields.map(f => (
          <div key={f.key}>
            <label style={{ fontSize:'0.75rem', opacity:0.6 }}>{f.placeholder}</label>
            <input type="text" value={filters[f.key] || ''} onChange={e => setFilters({...filters, [f.key]: e.target.value})} style={{ padding:'0.5rem', width:150 }} />
          </div>
        ))}
        {cfg.dateField && (
            <>
                <div><label style={{ fontSize:'0.75rem', opacity:0.6 }}>من تاريخ</label><input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} /></div>
                <div><label style={{ fontSize:'0.75rem', opacity:0.6 }}>إلى تاريخ</label><input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} /></div>
            </>
        )}
        <button type="submit" className="btn">بحث</button>
      </form>

      {/* ── Results Container ── */}
      <div className="glass table-container">
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(var(--primary-rgb), 0.02)' }}>
            <div style={{ display: 'flex', gap: '2rem' }}>
                <div className="summary-item"><label>عدد الملفات:</label> <strong>{count}</strong></div>
                <div className="summary-item"><label>جملة الأجرة:</label> <strong>{formatAmount(currentTotals.base)}</strong></div>
                <div className="summary-item"><label>جملة TVA:</label> <strong>{formatAmount(currentTotals.tva)}</strong></div>
                <div className="summary-item"><label>جملة المصاريف:</label> <strong>{formatAmount(currentTotals.expenses)}</strong></div>
            </div>
            <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)' }}>المجموع الجملي: {formatAmount(currentTotals.total)} د.ت</span>
            </div>
        </div>

        {loading ? <p style={{ padding: '3rem', textAlign: 'center' }}>جاري التحميل...</p> : (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                    <tr>
                        <th style={{ width: 40 }}>#</th>
                        {cfg.columns.map(c => <th key={c.key}>{c.label}</th>)}
                        {isExecution && <th className="no-print" style={{ width: 60 }}>التفاصيل</th>}
                    </tr>
                </thead>
                <tbody>
                    {data.length === 0 ? (
                        <tr><td colSpan={10} style={{ textAlign:'center', padding:'3rem', opacity:0.5 }}>لا توجد سجلات حالياً</td></tr>
                    ) : data.map((item, idx) => {
                        const fileId = item.id_o || item.id_r;
                        const isExpanded = expandedFiles[fileId];
                        const sels = selectedActions[fileId] || [];
                        const fileTotal = isExecution 
                            ? (item.actions || []).filter(a => sels.includes(a.id)).reduce((s,a) => s + (parseFloat(a.salaire) || 0), 0)
                            : (parseFloat(item.salaire || item.total_montant) || 0);

                        return (
                            <Fragment key={fileId}>
                                <tr style={{ background: isExpanded ? 'rgba(var(--primary-rgb), 0.05)' : 'transparent' }}>
                                    <td>{(page - 1) * limit + idx + 1}</td>
                                    {cfg.columns.map(c => {
                                        let val = item[c.key];
                                        
                                        // Dynamic calculation for execution rows based on current selection
                                        if (isExecution && c.isAmount) {
                                            const sels = selectedActions[fileId] || [];
                                            const selectedActs = (item.actions || []).filter(a => sels.includes(a.id));
                                            if (c.key === 'base_fare') val = selectedActs.reduce((s,a) => s + (a.base || 0), 0);
                                            else if (c.key === 'tva') val = selectedActs.reduce((s,a) => s + (a.tva || 0), 0);
                                            else if (c.key === 'expenses') val = selectedActs.reduce((s,a) => s + (a.expenses || 0), 0);
                                            else if (c.key === 'calculated_total') val = selectedActs.reduce((s,a) => s + (a.total || 0), 0);
                                        }

                                        if (c.key === 'status') {
                                            const s = STATUS_MAP[item.status] || STATUS_MAP.not_started;
                                            return (
                                                <td key={c.key}>
                                                    <span className={`badge badge-${s.color}`}>{s.label}</span>
                                                </td>
                                            );
                                         }

                                         return (
                                             <td key={c.key} style={c.isAmount ? { fontWeight: 700, color: c.isTotal ? 'var(--primary)' : 'inherit', textAlign: 'left' } : {}}>
                                                 {c.isAmount ? formatAmount(val) : (val || '—')}
                                             </td>
                                         );
                                    })}
                                    {isExecution && (
                                        <td className="no-print">
                                            <button className="btn-icon" onClick={() => toggleExpand(fileId)}>
                                                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                            </button>
                                        </td>
                                    )}
                                </tr>
                                
                                {/* ── Linked Actions (Execution Sub-List) ── */}
                                {isExecution && isExpanded && (
                                    <tr className="no-print">
                                        <td colSpan={10} style={{ padding: '0.5rem 1.5rem 1rem' }}>
                                            <div className="glass" style={{ padding: '1.25rem', background: 'rgba(var(--primary-rgb), 0.03)', border: '1px solid rgba(var(--primary-rgb), 0.2)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--primary)' }}>المحاضر المنجزة في هذا الملف:</h4>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button className="btn" style={{ padding: '2px 8px', fontSize: '10px' }} onClick={() => selectAllActions(fileId, item.actions)}>تحديد الكل</button>
                                                        <button className="btn" style={{ padding: '2px 8px', fontSize: '10px', background: 'rgba(255,255,255,0.05)' }} onClick={() => deselectAllActions(fileId)}>إلغاء التحديد</button>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
                                                    {(item.actions || []).map(act => {
                                                        const isSelected = sels.includes(act.id);
                                                        return (
                                                            <div key={act.id} 
                                                                onClick={() => toggleAction(fileId, act.id)}
                                                                className="action-card"
                                                                style={{ 
                                                                    display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', 
                                                                    borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s ease',
                                                                    background: isSelected ? 'rgba(var(--primary-rgb), 0.12)' : 'rgba(255,255,255,0.02)',
                                                                    border: isSelected ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.05)',
                                                                    boxShadow: isSelected ? '0 4px 12px rgba(var(--primary-rgb), 0.15)' : 'none',
                                                                    fontSize: '0.8rem'
                                                                }}>
                                                                <div style={{ color: isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.3)' }}>
                                                                    {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                                                                </div>
                                                                <div style={{ flex: 1 }}>
                                                                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '2px' }}>{act.type_operation}</div>
                                                                    <div style={{ opacity: 0.5, fontSize: '0.7rem' }}>الأجرة: {formatAmount(act.base)} | TVA: {formatAmount(act.tva)} | مصاريف: {formatAmount(act.expenses)}</div>
                                                                </div>
                                                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isSelected ? 'var(--primary)' : 'inherit' }}>
                                                                    {formatAmount(act.total)}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                </Fragment>
                        );
                    })}
                </tbody>
            </table>
        )}

        {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} total={count} limit={limit} 
                onPageChange={setPage} onLimitChange={setLimit} />
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
            .no-print, .sidebar { display: none !important; }
            body { background: white !important; color: black !important; }
            .glass { border: none !important; box-shadow: none !important; }
            table { width: 100% !important; border-collapse: collapse !important; }
            th, td { border: 1px solid #ccc !important; padding: 6px 10px !important; color: black !important; text-align: right !important; }
            th { background: #eee !important; font-weight: bold !important; }
        }
        }
        .summary-item { display: flex; flex-direction: column; gap: 2px; }
        .summary-item label { font-size: 0.75rem; opacity: 0.6; }
        .summary-item strong { font-size: 1rem; }
        .btn-icon { background: transparent; border: none; cursor: pointer; color: var(--text-main); opacity: 0.6; }
        .btn-icon:hover { opacity: 1; }
      `}} />
    </div>
  );
}

