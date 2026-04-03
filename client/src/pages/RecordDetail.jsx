import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Save, Check, Plus, Trash2, FileText, Activity, Milestone } from 'lucide-react';
import { formatAmount, STATUS_MAP } from '../utils/formatters';

const API_BASE = 'http://localhost:3001/api';

export default function RecordDetail() {
    const { type, id } = useParams();
    const navigate = useNavigate();
    const isNew = id === 'new';
    
    const [record, setRecord] = useState(null);
    const [formData, setFormData] = useState({});
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('general');

    // Actions list for execution type
    const [actions, setActions]       = useState([]);
    const [showActionModal, setShowActionModal] = useState(false);
    const [actionForm, setActionForm] = useState({ type_operation: '', date_r: '', remarques: '', origine: '0', exemple: '0', versionbureau: '0', mobilite: '0', orientation: '0', imprimer: '0', inscri: '0', delimitation: '0', postal: '0', autre: '0', TVA: '0', salaire: '0' });

    const fetchRecord = useCallback(async () => {
        if (isNew) {
            const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');
            const initialState = {
                date_reg: today,
                date_inscri: today,
                status: 'not_started',
                acompte: '0',
                origine: '0', exemple: '0', version_bureau: '0', orientation: '0', mobilite: '0',
                imprimer: '0', inscri: '0', delimitation: '0', poste: '0', autre: '0',
                id_r: '' // Manual input
            };
            setRecord(initialState);
            setFormData(initialState);
            setLoading(false);
            return;
        }
        setLoading(true);
        const token = localStorage.getItem('token') || 'dummy-token';
        try {
            const res = await fetch(`${API_BASE}/${type}/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            setRecord(json);
            setFormData(json);
            
            if (type === 'execution') {
                const actRes = await fetch(`${API_BASE}/execution/${id}/actions`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const actJson = await actRes.json();
                setActions(actJson || []);
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [type, id, isNew]);

    useEffect(() => { fetchRecord(); }, [fetchRecord]);

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        setIsSaving(true);
        const token = localStorage.getItem('token') || 'dummy-token';
        const method = isNew ? 'POST' : 'PUT';
        const url = isNew ? `${API_BASE}/${type}` : `${API_BASE}/${type}/${id}`;
        
        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const result = await res.json();
            
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
            
            if (isNew) {
                const newId = result.id_r || result.id || result.id_cn || result.id_e;
                if (newId) {
                    navigate(`/record/${type}/${newId}`, { replace: true });
                }
            } else {
                fetchRecord();
            }
        } catch (e) { console.error(e); }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!window.confirm('هل أنت متأكد من حذف هذا الملف نهائياً؟ لا يمكن التراجع عن هذه العملية.')) return;
        const token = localStorage.getItem('token') || 'dummy-token';
        try {
            const res = await fetch(`${API_BASE}/${type}/${id}`, { 
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                alert('تم حذف الملف بنجاح');
                navigate(type === 'execution' ? '/execution' : '/general');
            } else {
                const error = await res.json();
                alert('فشل الحذف: ' + error.error);
            }
        } catch (err) {
            console.error('Delete error:', err);
            alert('حدث خطأ أثناء الاتصال بالخادم');
        }
    };

    const updateStatus = async (newStatus) => {
        const token = localStorage.getItem('token') || 'dummy-token';
        try {
            await fetch(`${API_BASE}/registre/${id}/status`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            setFormData({ ...formData, status: newStatus });
            setRecord({ ...record, status: newStatus });
        } catch (e) { console.error(e); }
    };

    const handleAddAction = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token') || 'dummy-token';
        try {
            await fetch(`${API_BASE}/execution/${id}/actions`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(actionForm)
            });
            setShowActionModal(false);
            fetchRecord();
        } catch (e) { console.error(e); }
    };

    const handleDeleteAction = async (actionId) => {
        if (!confirm('هل أنت متأكد من حذف هذا المحضر؟')) return;
        const token = localStorage.getItem('token') || 'dummy-token';
        try {
            await fetch(`${API_BASE}/execution/${id}/actions/${actionId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchRecord();
        } catch (e) { console.error(e); }
    };

    if (loading) return <div style={{padding:'4rem', textAlign:'center', opacity:0.5}}>جاري التحميل...</div>;
    if (!record && !isNew) return <div style={{padding:'4rem', textAlign:'center', color:'var(--error)'}}>الملف غير موجود</div>;

    const isExecution = type === 'execution';

    const tabConfig = [
        { id: 'general', label: 'المعلومات العامة' },
        { id: 'client1', label: 'طالب الخدمة' },
        { id: 'client2', label: 'المطلوب' },
        { id: 'financials', label: 'المصاريف والخدمات' }
    ];

    const fieldGroups = {
        general: [
            { key: 'id_r', label: 'الرقم بجليد المحاضر (ID)', type: 'number' },
            { key: 'ref', label: 'العدد الترتيبي' },
            { key: 'date_reg', label: 'تاريخ المحضر' },
            { key: 'de_part', label: 'طالب الخدمة (جهة)' },
            { key: 'remarque', label: 'نوع المحضر/ملاحظات', type: 'textarea' },
            { key: 'tribunal', label: 'المحكمة' },
            { key: 'nombre', label: 'عدد القضية' },
            { key: 'date_s', label: 'تاريخ السند' },
            { key: 'resultat', label: 'المآل النهائي' }
        ],
        client1: [
            { key: 'nom_cl1', label: 'اسم الطالب' },
            { key: 'cl1_profession', label: 'المهنة' },
            { key: 'cl1_adresse', label: 'العنوان' },
            { key: 'cl1_tel', label: 'الهاتف 1' },
            { key: 'tel2_cl1', label: 'الهاتف 2' },
            { key: 'cl1_avocat', label: 'المحامي' }
        ],
        client2: [
            { key: 'nom_cl2', label: 'اسم المطلوب' },
            { key: 'cl2_profession', label: 'المهنة' },
            { key: 'cl2_adresse', label: 'العنوان' },
            { key: 'cl2_tel', label: 'الهاتف 1' },
            { key: 'tel2_cl2', label: 'الهاتف 2' },
            { key: 'cl2_avocat', label: 'المحامي' }
        ],
        financials: [
            { key: 'acompte', label: 'تسبقة (Dinar)' },
            { key: 'origine', label: 'أصل (Origine)' },
            { key: 'exemple', label: 'نظير (Exemple)' },
            { key: 'version_bureau', label: 'نسخة مكتب' },
            { key: 'orientation', label: 'إرشاد (Orientation)' },
            { key: 'mobilite', label: 'تنقل (Mobilité)' },
            { key: 'imprimer', label: 'مطبوعات' },
            { key: 'inscri', label: 'ترسيم' },
            { key: 'delimitation', label: 'تحرير' },
            { key: 'poste', label: 'بريد' },
            { key: 'autre', label: 'أخرى (Autre)' }
        ]
    };

    return (
        <div className="animate-fade" dir="rtl">
            <div className="topbar no-print" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button className="btn" style={{ background: 'rgba(255,255,255,0.1)' }} onClick={() => navigate(-1)}>
                        <ArrowLeft size={18} /> رجوع
                    </button>
                    <h2 style={{color: 'var(--primary)', margin: 0}}>
                        {isExecution ? 'ملف تنفيذ' : 'محضر'} #{record?.ref || id}
                    </h2>
                </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.4rem 1rem', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
                        <Milestone size={16} />
                        <select 
                            value={formData.status || 'not_started'} 
                            onChange={(e) => updateStatus(e.target.value)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '0.9rem', cursor: 'pointer', outline: 'none' }}
                        >
                            {Object.entries(STATUS_MAP).map(([key, info]) => (
                                <option key={key} value={key} style={{ background: '#1a1a1a' }}>{info.label}</option>
                            ))}
                        </select>
                    </div>
                    <button className="btn" onClick={() => window.print()}>
                        <Printer size={18} /> طباعة الملف
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: (isExecution && !isNew) ? '1fr 340px' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
                
                <div style={{ flex: 1 }}>
                    {/* ── Tabs Navigation ── */}
                    <div className="glass" style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto' }}>
                        {tabConfig.map(tab => (
                            <button 
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className="btn"
                                style={{ 
                                    background: activeTab === tab.id ? 'var(--primary)' : 'transparent',
                                    color: activeTab === tab.id ? 'white' : 'var(--text-main)',
                                    border: 'none',
                                    whiteSpace: 'nowrap',
                                    flex: 1
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* ── Main Form (Tabbed Content) ── */}
                    <div className="glass" style={{ padding: '2rem', position: 'relative' }}>
                        <form onSubmit={handleSave}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                {fieldGroups[activeTab].map((field) => (
                                    <div key={field.key} style={{ gridColumn: field.type === 'textarea' ? 'span 2' : 'span 1' }}>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                            {field.label}
                                        </label>
                                        {field.type === 'textarea' ? (
                                            <textarea 
                                                value={formData[field.key] || ''} 
                                                onChange={(e) => setFormData({...formData, [field.key]: e.target.value})}
                                                className="glass"
                                                style={{ width: '100%', padding: '0.6rem', minHeight: '100px', color: 'var(--text-main)', border: '1px solid var(--card-border)' }}
                                            />
                                        ) : (
                                            <input 
                                                type={field.key === 'acompte' || fieldGroups.financials.find(f => f.key === field.key) ? 'number' : 'text'} 
                                                value={formData[field.key] || ''} 
                                                onChange={(e) => {
                                                    const newVal = e.target.value;
                                                    const newFormData = {...formData, [field.key]: newVal};
                                                    
                                                    // Financial Auto-calc logic
                                                    if (fieldGroups.financials.find(f => f.key === field.key)) {
                                                        const baseFields = ['origine', 'exemple', 'version_bureau', 'orientation', 'mobilite'];
                                                        const expenseFields = ['imprimer', 'inscri', 'delimitation', 'poste', 'autre'];
                                                        
                                                        const base = baseFields.reduce((sum, k) => sum + (parseFloat(newFormData[k]) || 0), 0);
                                                        const tva = Math.round(base * 0.19); // Standard 19%
                                                        const exp = expenseFields.reduce((sum, k) => sum + (parseFloat(newFormData[k]) || 0), 0);
                                                        
                                                        newFormData.salaire = (base + tva + exp).toString();
                                                        newFormData.TVA = tva.toString();
                                                    }

                                                    // Auto-transition not_started -> has_deposit if acompte is added
                                                    if (field.key === 'acompte' && parseFloat(newVal) > 0 && (formData.status === 'not_started' || !formData.status)) {
                                                        newFormData.status = 'has_deposit';
                                                    }
                                                    setFormData(newFormData);
                                                }}
                                                style={{ width: '100%', padding: '0.6rem' }}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>

                            {activeTab === 'financials' && (
                                <div className="glass" style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(var(--primary-rgb), 0.05)', border: '1px solid var(--primary)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ color: 'var(--primary)', fontWeight: 'bold' }}>المجموع الجملي المحتسب:</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{formatAmount(formData.salaire || 0)} د.ت</div>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.5rem' }}>
                                        (الأصل + TVA 19% + المصاريف)
                                    </div>
                                </div>
                            )}
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', gap: '1rem' }}>
                                {activeTab !== 'financials' ? (
                                    <button type="button" className="btn" style={{ background: 'rgba(255,255,255,0.05)' }} 
                                        onClick={() => {
                                            const idx = tabConfig.findIndex(t => t.id === activeTab);
                                            setActiveTab(tabConfig[idx+1].id);
                                        }}>
                                        التالي
                                    </button>
                                ) : <div></div>}
                                
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    {!isNew && (
                                        <button type="button" className="btn" style={{ background: '#ef444420', color: '#ef4444' }} onClick={handleDelete}>
                                            <Trash2 size={18} /> حذف
                                        </button>
                                    )}
                                    <button type="submit" className="btn" style={{ width: 'auto' }} disabled={isSaving}>
                                        {saved ? <Check size={18} /> : <Save size={18} />} 
                                        {isSaving ? 'جاري الحفظ...' : (isNew ? 'إضافة الملف' : (saved ? 'تم الحفظ!' : 'حفظ التعديلات'))}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>

                {/* ── Side Info (for Execution) ── */}
                {(isExecution && !isNew) && (
                    <div className="glass" style={{ padding: '2rem', height: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', color: 'var(--primary)' }}>
                            <Activity size={20} />
                            <h3 style={{ margin: 0 }}>إحصاءات الملف</h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="glass" style={{ padding: '1rem', textAlign: 'center' }}>
                                <span style={{ fontSize: '0.8rem', opacity: 0.6, display: 'block' }}>عدد المحاضر</span>
                                <strong style={{ fontSize: '1.5rem' }}>{actions.length}</strong>
                            </div>
                            <div className="glass" style={{ padding: '1rem', textAlign: 'center', border: '1px solid rgba(var(--primary-rgb), 0.3)' }}>
                                <span style={{ fontSize: '0.8rem', opacity: 0.6, display: 'block' }}>المجموع الجملي للمصاريف</span>
                                <strong style={{ fontSize: '1.5rem', color: 'var(--primary)' }}>
                                    {formatAmount(actions.reduce((s,a) => s + (parseFloat(a.total) || 0), 0))} د.ت
                                </strong>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Linked Actions (Execution Actions Table) ── */}
            {isExecution && (
                <div className="glass" style={{ marginTop: '1.5rem', padding: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--primary)' }}>
                            <Plus size={20} />
                            <h3 style={{ margin: 0 }}>مراحل التنفيذ (المحاضر المرتبطة)</h3>
                        </div>
                        <button className="btn no-print" onClick={() => setShowActionModal(true)}>
                            <Plus size={18} /> إضافة مرحلة
                        </button>
                    </div>

                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>نوع العملية</th>
                                    <th>التاريخ</th>
                                    <th>ملاحظات</th>
                                    <th>المبلغ (د.ت)</th>
                                    <th className="no-print">عمل</th>
                                </tr>
                            </thead>
                            <tbody>
                                {actions.length === 0 ? (
                                    <tr><td colSpan={6} style={{ textAlign:'center', opacity:0.5, padding:'2rem' }}>لا توجد محاضر مرتبطة بهذا الملف</td></tr>
                                ) : actions.map((act, idx) => (
                                    <tr key={act.id}>
                                        <td style={{ opacity: 0.5 }}>{idx + 1}</td>
                                        <td style={{ fontWeight: 600 }}>{act.type_operation || '—'}</td>
                                        <td>{act.date_r || '—'}</td>
                                        <td style={{ fontSize: '0.85rem', opacity: 0.8 }}>{act.remarques || '—'}</td>
                                        <td style={{ color: 'var(--primary)', fontWeight: 700 }}>
                                            {formatAmount(act.total)}
                                        </td>
                                        <td className="no-print">
                                            <button className="btn-icon" style={{ color: '#ef4444' }} onClick={() => handleDeleteAction(act.id)}>
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Add Action Modal ── */}
            {showActionModal && (
                <div className="modal-overlay no-print" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <div className="glass card animate-scale" style={{ width: 600, padding:'2rem', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h3 style={{ color: 'var(--primary)', marginBottom: '1.5rem' }}>إضافة مرحلة تنفيذ جديدة</h3>
                        <form onSubmit={handleAddAction} style={{ display:'flex', flexDirection:'column', gap:'1.2rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display:'block', marginBottom:'0.3rem', fontSize:'0.8rem', opacity:0.7 }}>نوع العملية</label>
                                    <input type="text" placeholder="مثال: تبليغ، عقلة..." value={actionForm.type_operation} onChange={e => setActionForm({...actionForm, type_operation: e.target.value})} required style={{ width:'100%' }} />
                                </div>
                                <div>
                                    <label style={{ display:'block', marginBottom:'0.3rem', fontSize:'0.8rem', opacity:0.7 }}>التاريخ</label>
                                    <input type="text" placeholder="YYYY/MM/DD" value={actionForm.date_r} onChange={e => setActionForm({...actionForm, date_r: e.target.value})} style={{ width:'100%' }} />
                                </div>
                            </div>
                            
                            <div>
                                <label style={{ display:'block', marginBottom:'0.3rem', fontSize:'0.8rem', opacity:0.7 }}>ملاحظات</label>
                                <textarea className="glass" style={{ width:'100%', height: 80, padding:'0.6rem', color:'var(--text-main)', border:'1px solid var(--card-border)' }}
                                    value={actionForm.remarques} onChange={e => setActionForm({...actionForm, remarques: e.target.value})} />
                            </div>

                            {/* Financial breakdown */}
                            <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '1rem' }}>
                                <h4 style={{ fontSize: '0.9rem', marginBottom: '1rem', color:'var(--primary)' }}>تفاصيل الأتعاب (للحساب التلقائي)</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem' }}>
                                    {['origine', 'exemple', 'versionbureau', 'mobilite', 'orientation', 'imprimer', 'inscri', 'delimitation', 'postal', 'autre'].map(f => (
                                        <div key={f}>
                                            <label style={{ fontSize:'0.7rem', opacity:0.6 }}>{f}</label>
                                            <input type="number" step="1" value={actionForm[f]} onChange={e => setActionForm({...actionForm, [f]: e.target.value})} style={{ width:'100%', padding:'0.4rem', fontSize:'0.85rem' }} />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display:'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="submit" className="btn" style={{ flex: 1 }}>إضافة</button>
                                <button type="button" className="btn" style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }} onClick={() => setShowActionModal(false)}>إلغاء</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{__html: `
                @media print {
                    .no-print, .sidebar { display: none !important; }
                    .main-content { margin: 0 !important; width: 100% !important; padding: 0 !important; }
                    .glass { background: transparent !important; border: 1px solid #eee !important; box-shadow: none !important; color: black !important; padding: 1rem !important; }
                    body { background: white !important; color: black !important; }
                    input, textarea { border: none !important; background: transparent !important; color: black !important; font-weight: bold; }
                    h2, h3 { color: black !important; margin: 5px 0 !important; }
                    table { width: 100% !important; border-collapse: collapse !important; }
                    th, td { border: 1px solid #ccc !important; padding: 5px 8px !important; color: black !important; text-align: right !important; }
                }
                .btn-icon { background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0.7; }
                .btn-icon:hover { opacity: 1; }
            `}} />
        </div>
    );
}
