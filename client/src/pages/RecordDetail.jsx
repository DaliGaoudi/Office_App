import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Save, Check, Plus, Trash2, FileText, Activity, Milestone } from 'lucide-react';
import { formatAmount, STATUS_MAP } from '../utils/formatters';
import API_BASE from '../config';

const API = API_BASE;

export default function RecordDetail() {
    const { type, id } = useParams();
    const navigate = useNavigate();
    const isNew = id === 'new';
    const today = new Date().toISOString().split('T')[0];
    
    const [record, setRecord] = useState(null);
    const [formData, setFormData] = useState({});
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('general');

    // Actions list for execution type
    const [actions, setActions]       = useState([]);
    const [showActionModal, setShowActionModal] = useState(false);
    const [editingActionId, setEditingActionId] = useState(null);
    const [actionForm, setActionForm] = useState({ type_operation: '', date_r: '', remarques: '', origine: '0', exemple: '0', versionbureau: '0', mobilite: '0', orientation: '0', imprimer: '0', inscri: '0', delimitation: '0', postal: '0', autre: '0', TVA: '0', salaire: '0' });

    const fetchRecord = useCallback(async () => {
        if (isNew) {
            const initialState = {
                date_reg: today,
                date_inscri: today,
                date_echeance: '', // Will be calculated
                status: 'not_started',
                acompte: '0',
                origine: '0', exemple: '0', version_bureau: '0', orientation: '0', mobilite: '0',
                imprimer: '0', inscri: '0', delimitation: '0', poste: '0', autre: '0',
                service_petitioner_name: '',
                service_petitioner_contact: '',
                id_r: '' 
            };
            setRecord(initialState);
            setFormData(initialState);
            setLoading(false);
            return;
        }
        setLoading(true);
        const token = localStorage.getItem('token');
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
        const token = localStorage.getItem('token');
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
        const token = localStorage.getItem('token');
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
        const token = localStorage.getItem('token');
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

    const handleSaveAction = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        const method = editingActionId ? 'PUT' : 'POST';
        const url = editingActionId 
            ? `${API_BASE}/execution/${id}/actions/${editingActionId}`
            : `${API_BASE}/execution/${id}/actions`;

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(actionForm)
            });
            if (res.ok) {
                setShowActionModal(false);
                setEditingActionId(null);
                setActionForm({ type_operation: '', date_r: '', remarques: '', origine: '0', exemple: '0', versionbureau: '0', mobilite: '0', orientation: '0', imprimer: '0', inscri: '0', delimitation: '0', postal: '0', autre: '0', TVA: '0', salaire: '0' });
                fetchRecord();
            }
        } catch (e) { console.error(e); }
    };

    const handleEditAction = (act) => {
        setEditingActionId(act.id);
        setActionForm({
            type_operation: act.type_operation || '',
            date_r: act.date_r || '',
            remarques: act.remarques || '',
            origine: act.origine || '0',
            exemple: act.exemple || '0',
            versionbureau: act.versionbureau || '0',
            mobilite: act.mobilite || '0',
            orientation: act.orientation || '0',
            imprimer: act.imprimer || '0',
            inscri: act.inscri || '0',
            delimitation: act.delimitation || '0',
            postal: act.postal || '0',
            autre: act.autre || '0',
            TVA: act.TVA || '0',
            salaire: act.salaire || '0'
        });
        setShowActionModal(true);
    };

    const handleDeleteAction = async (actionId) => {
        if (!confirm('هل أنت متأكد من حذف هذا المحضر؟')) return;
        const token = localStorage.getItem('token');
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
        { id: 'client1', label: 'الطالب' },
        { id: 'client2', label: 'المطلوب' },
        { id: 'financials', label: 'الأجور والمصاريف' }
    ];

    const fieldGroups = {
        general: [
            { key: 'ref', label: 'العدد الترتيبي', placeholder: 'تلقائي' },
            { key: 'remarque', label: 'نوع المحضر' },
            { key: 'date_reg', label: 'تاريخ طلب الخدمة', type: 'date' },
            { key: 'date_echeance', label: 'تاريخ آخر أجل لالتبليغ', type: 'date', readonly: true },
            { key: 'date_inscri', label: 'تاريخ التبليغ', type: 'date' },
            { key: 'de_part', label: 'طالب الخدمة' },
            { key: 'service_petitioner_contact', label: 'بيانات الاتصال' },
            ...(isExecution ? [
                { key: 'tribunal', label: 'المحكمة' },
                { key: 'nombre', label: 'عدد القضية' },
                { key: 'date_s', label: 'تاريخ السند' },
                { key: 'resultat', label: 'المآل النهائي' }
            ] : [])
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
            { key: 'acompte', label: 'تسبقة (د.ت)' },
            { key: 'origine', label: 'أصل المحضر' },
            { key: 'exemple', label: 'نظائر' },
            { key: 'version_bureau', label: 'نسخة مكتب' },
            { key: 'orientation', label: 'التوجه' },
            { key: 'delimitation', label: 'التسجيل' },
            { key: 'inscri', label: 'الترسيم' },
            { key: 'mobilite', label: 'التنقل' },
            { key: 'imprimer', label: 'نسخ أوراق' },
            { key: 'poste', label: 'البريد' },
            { key: 'autre', label: 'المختلفات' },
            { key: 'TVA', label: 'الأداء على القيمة المضافة (VAT)', readonly: true }
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
                        {isExecution ? 'ملف تنفيذ' : 'محضر'} #{record?.ref || id} {formData.remarque && <span style={{ opacity: 0.7, fontSize: '0.9em', marginRight: '0.5rem' }}>— {formData.remarque}</span>}
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
                                {activeTab !== 'financials' ? (
                                    fieldGroups[activeTab].map((field) => (
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
                                                    type={field.type === 'date' ? 'date' : (field.key === 'acompte' || fieldGroups.financials.find(f => f.key === field.key) ? 'number' : 'text')} 
                                                    value={formData[field.key] || ''} 
                                                    readOnly={field.readonly}
                                                    placeholder={field.placeholder}
                                                    onChange={(e) => {
                                                        const newVal = e.target.value;
                                                        const newFormData = {...formData, [field.key]: newVal};
                                                        
                                                        // Auto-calc deadline (date_reg + 5 days)
                                                        if (field.key === 'date_reg') {
                                                            const d = new Date(newVal);
                                                            if (!isNaN(d.getTime())) {
                                                                d.setDate(d.getDate() + 5);
                                                                newFormData.date_echeance = d.toISOString().split('T')[0];
                                                            }
                                                        }

                                                        // Financial Auto-calc logic (Fees + VAT + Expenses)
                                                        if (fieldGroups.financials.find(f => f.key === field.key)) {
                                                            const feeFields = ['origine', 'exemple', 'version_bureau', 'orientation'];
                                                            const expenseFields = ['delimitation', 'inscri', 'mobilite', 'imprimer', 'poste', 'autre'];
                                                            
                                                            const fees = feeFields.reduce((sum, k) => sum + (parseFloat(newFormData[k]) || 0), 0);
                                                            const tva = Math.round(fees * 0.19); // 19% VAT on Fees only
                                                            const exp = expenseFields.reduce((sum, k) => sum + (parseFloat(newFormData[k]) || 0), 0);
                                                            
                                                            newFormData.salaire = (fees + tva + exp).toString();
                                                            newFormData.TVA = tva.toString();
                                                            newFormData.montant_partiel1 = fees.toString();
                                                            newFormData.montant_partiel2 = exp.toString();
                                                        }

                                                        // Auto-transition not_started -> has_deposit if acompte is added
                                                        if (field.key === 'acompte' && parseFloat(newVal) > 0 && (formData.status === 'not_started' || !formData.status)) {
                                                            newFormData.status = 'has_deposit';
                                                        }
                                                        setFormData(newFormData);
                                                    }}
                                                    style={{ width: '100%', padding: '0.6rem', opacity: field.readonly ? 0.6 : 1 }}
                                                />
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        {/* Block 1: Deposit */}
                                        <div className="glass" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>تسبقة (د.ت)</label>
                                            <input type="number" value={formData.acompte || '0'} onChange={(e) => setFormData({...formData, acompte: e.target.value})} style={{ width: '100%', padding: '0.6rem' }} />
                                        </div>

                                        {/* Block 2: Fees (Sum 1) */}
                                        <div className="glass" style={{ padding: '1.5rem', background: 'rgba(var(--primary-rgb), 0.05)', border: '1px solid rgba(var(--primary-rgb), 0.1)' }}>
                                            <h4 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--primary)', fontWeight: 600 }}>الأجور</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                                                {['origine', 'exemple', 'version_bureau', 'orientation'].map(k => (
                                                    <div key={k}>
                                                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', opacity: 0.7 }}>{fieldGroups.financials.find(f => f.key === k).label}</label>
                                                        <input type="number" value={formData[k] || '0'} onChange={(e) => {
                                                            const newVal = e.target.value;
                                                            const newFormData = {...formData, [k]: newVal};
                                                            const fees = ['origine', 'exemple', 'version_bureau', 'orientation'].reduce((s, key) => s + (parseFloat(newFormData[key]) || 0), 0);
                                                            const tva = Math.round(fees * 0.19);
                                                            const exp = ['delimitation', 'inscri', 'mobilite', 'imprimer', 'poste', 'autre'].reduce((s, key) => s + (parseFloat(newFormData[key]) || 0), 0);
                                                            newFormData.salaire = (fees + tva + exp).toString();
                                                            newFormData.TVA = tva.toString();
                                                            newFormData.montant_partiel1 = fees.toString();
                                                            setFormData(newFormData);
                                                        }} style={{ width: '100%', padding: '0.6rem' }} />
                                                    </div>
                                                ))}
                                            </div>
                                            {/* Partial Sum 1 Badge */}
                                            <div className="glass" style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(var(--primary-rgb), 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>مجموع الأجور (Partiel 1):</span>
                                                <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary)' }}>{formatAmount(formData.montant_partiel1 || 0)} د.ت</span>
                                            </div>
                                        </div>

                                        {/* Block 3: VAT Badge */}
                                        <div className="glass" style={{ padding: '1.2rem 1.5rem', border: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>الأداء على القيمة المضافة (VAT 19%):</span>
                                            <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>{formatAmount(formData.TVA || 0)} د.ت</span>
                                        </div>

                                        {/* Block 4: Expenses (Sum 2) */}
                                        <div className="glass" style={{ padding: '1.5rem', background: 'rgba(255,193,7, 0.03)', border: '1px solid rgba(255,193,7, 0.1)' }}>
                                            <h4 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#ffc107', fontWeight: 600 }}>المصاريف</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                                                {['delimitation', 'inscri', 'mobilite', 'imprimer', 'poste', 'autre'].map(k => (
                                                    <div key={k}>
                                                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', opacity: 0.7 }}>{fieldGroups.financials.find(f => f.key === k).label}</label>
                                                        <input type="number" value={formData[k] || '0'} onChange={(e) => {
                                                            const newVal = e.target.value;
                                                            const newFormData = {...formData, [k]: newVal};
                                                            const fees = ['origine', 'exemple', 'version_bureau', 'orientation'].reduce((s, key) => s + (parseFloat(newFormData[key]) || 0), 0);
                                                            const tva = Math.round(fees * 0.19);
                                                            const exp = ['delimitation', 'inscri', 'mobilite', 'imprimer', 'poste', 'autre'].reduce((s, key) => s + (parseFloat(newFormData[key]) || 0), 0);
                                                            newFormData.salaire = (fees + tva + exp).toString();
                                                            newFormData.montant_partiel2 = exp.toString();
                                                            setFormData(newFormData);
                                                        }} style={{ width: '100%', padding: '0.6rem' }} />
                                                    </div>
                                                ))}
                                            </div>
                                            {/* Partial Sum 2 Badge */}
                                            <div className="glass" style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,193,7, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>مجموع المصاريف (Partiel 2):</span>
                                                <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ffc107' }}>{formatAmount(formData.montant_partiel2 || 0)} د.ت</span>
                                            </div>
                                        </div>

                                        {/* Block 5: Grand Total */}
                                        <div className="glass" style={{ marginTop: '1rem', padding: '1.5rem', background: 'var(--primary)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 8px 32px rgba(var(--primary-rgb), 0.3)' }}>
                                            <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>المجموع الجملي المحتسب:</span>
                                            <span style={{ fontSize: '2.5rem', fontWeight: 900 }}>{formatAmount(formData.salaire || 0)} د.ت</span>
                                        </div>
                                    </div>
                                )}

                                {/* Remarks Field (Visible Regardless of Tabs) */}
                                <div style={{ gridColumn: 'span 2', marginTop: '1.5rem', borderTop: '1px solid var(--card-border)', paddingTop: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>ملاحظات</label>
                                    <textarea 
                                        value={formData.resume || ''} 
                                        onChange={(e) => setFormData({...formData, resume: e.target.value})}
                                        className="glass"
                                        style={{ width: '100%', padding: '0.6rem', minHeight: '100px', color: 'var(--text-main)', border: '1px solid var(--card-border)' }}
                                        placeholder="أضف ملاحظاتك هنا..."
                                    />
                                </div>
                            </div>
                            
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
                    <div className="glass" style={{ padding: '2rem', height: '100%', borderRight: '4px solid var(--primary)' }}>
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
                        <button className="btn no-print" onClick={() => { setEditingActionId(null); setActionForm({ type_operation: '', date_r: '', remarques: '', origine: '0', exemple: '0', versionbureau: '0', mobilite: '0', orientation: '0', imprimer: '0', inscri: '0', delimitation: '0', postal: '0', autre: '0', TVA: '0', salaire: '0' }); setShowActionModal(true); }}>
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
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button className="btn-icon" style={{ color: 'var(--primary)' }} onClick={() => handleEditAction(act)}>
                                                    <Activity size={16} />
                                                </button>
                                                <button className="btn-icon" style={{ color: '#ef4444' }} onClick={() => handleDeleteAction(act.id)}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {actions.length > 0 && (
                                <tfoot style={{ borderTop: '2px solid var(--primary)' }}>
                                    <tr>
                                        <td colSpan={4} style={{ textAlign: 'left', fontWeight: 'bold', padding: '1rem' }}>
                                            المجموع الجملي للمصاريف:
                                        </td>
                                        <td style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.2rem' }}>
                                            {formatAmount(actions.reduce((s, a) => s + (parseFloat(a.total) || 0), 0))}
                                        </td>
                                        <td className="no-print"></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}

            {/* ── Add Action Modal ── */}
            {showActionModal && (
                <div className="modal-overlay no-print" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <div className="glass card animate-scale" style={{ width: 600, padding:'2rem', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h3 style={{ color: 'var(--primary)', marginBottom: '1.5rem' }}>
                            {editingActionId ? 'تعديل مرحلة التنفيذ' : 'إضافة مرحلة تنفيذ جديدة'}
                        </h3>
                        <form onSubmit={handleSaveAction} style={{ display:'flex', flexDirection:'column', gap:'1.2rem' }}>
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

                            {/* Financial breakdown for Action */}
                            <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '1rem' }}>
                                <h4 style={{ fontSize: '0.9rem', marginBottom: '1rem', color:'var(--primary)' }}>تفاصيل الأتعاب والمصاريف</h4>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {/* Fees Section */}
                                    <div className="glass" style={{ padding: '1rem', background: 'rgba(var(--primary-rgb), 0.05)', borderRadius: '12px' }}>
                                        <h5 style={{ fontSize: '0.8rem', marginBottom: '0.75rem', opacity: 0.8 }}>الأجور</h5>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                                            {[
                                                {k:'origine', l:'أصل'}, {k:'exemple', l:'نظائر'}, 
                                                {k:'versionbureau', l:'نسخة مكتب'}, {k:'orientation', l:'التوجه'}
                                            ].map(f => (
                                                <div key={f.k}>
                                                    <label style={{ fontSize:'0.65rem', opacity:0.6 }}>{f.l}</label>
                                                    <input type="number" value={actionForm[f.k]} 
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            const newForm = {...actionForm, [f.k]: val};
                                                            const fees = ['origine', 'exemple', 'versionbureau', 'orientation'].reduce((s, k) => s + (parseFloat(newForm[k]) || 0), 0);
                                                            const tva = Math.round(fees * 0.19);
                                                            const expenses = ['inscri', 'delimitation', 'mobilite', 'imprimer', 'postal', 'autre'].reduce((s, k) => s + (parseFloat(newForm[k]) || 0), 0);
                                                            newForm.TVA = tva.toString();
                                                            newForm.salaire = (fees + tva + expenses).toString();
                                                            setActionForm(newForm);
                                                        }} 
                                                        style={{ width:'100%', padding:'0.3rem', fontSize:'0.8rem' }} 
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="glass" style={{ marginTop: '0.75rem', padding: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(var(--primary-rgb), 0.1)' }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>مجموع الأجور (Partiel 1)</span>
                                            <strong style={{ fontSize: '0.9rem', color: 'var(--primary)' }}>{formatAmount(['origine', 'exemple', 'versionbureau', 'orientation'].reduce((s,k) => s + (parseFloat(actionForm[k]) || 0), 0))}</strong>
                                        </div>
                                    </div>

                                    {/* VAT Bridging */}
                                    <div className="glass" style={{ padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--card-border)' }}>
                                        <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>الأداء على القيمة المضافة (VAT 19%)</span>
                                        <strong style={{ fontSize: '1rem', fontWeight: 700 }}>{formatAmount(actionForm.TVA || 0)}</strong>
                                    </div>

                                    {/* Expenses Section */}
                                    <div className="glass" style={{ padding: '1rem', background: 'rgba(255,193,7, 0.03)', borderRadius: '12px' }}>
                                        <h5 style={{ fontSize: '0.8rem', marginBottom: '0.75rem', opacity: 0.8 }}>المصاريف</h5>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                                            {[
                                                {k:'delimitation', l:'التسجيل'}, {k:'inscri', l:'الترسيم'}, {k:'mobilite', l:'التنقل'},
                                                {k:'imprimer', l:'نسخ'}, {k:'postal', l:'البريد'}, {k:'autre', l:'المختلفات'}
                                            ].map(f => (
                                                <div key={f.k}>
                                                    <label style={{ fontSize:'0.65rem', opacity:0.6 }}>{f.l}</label>
                                                    <input type="number" value={actionForm[f.k]} 
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            const newForm = {...actionForm, [f.k]: val};
                                                            const fees = ['origine', 'exemple', 'versionbureau', 'orientation'].reduce((s, k) => s + (parseFloat(newForm[k]) || 0), 0);
                                                            const tva = Math.round(fees * 0.19);
                                                            const expenses = ['inscri', 'delimitation', 'mobilite', 'imprimer', 'postal', 'autre'].reduce((s, k) => s + (parseFloat(newForm[k]) || 0), 0);
                                                            newForm.TVA = tva.toString();
                                                            newForm.salaire = (fees + tva + expenses).toString();
                                                            setActionForm(newForm);
                                                        }} 
                                                        style={{ width:'100%', padding:'0.3rem', fontSize:'0.8rem' }} 
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="glass" style={{ marginTop: '0.75rem', padding: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,193,7, 0.1)' }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>مجموع المصاريف (Partiel 2)</span>
                                            <strong style={{ fontSize: '0.9rem', color: '#ffc107' }}>{formatAmount(['delimitation', 'inscri', 'mobilite', 'imprimer', 'postal', 'autre'].reduce((s,k) => s + (parseFloat(actionForm[k]) || 0), 0))}</strong>
                                        </div>
                                    </div>

                                    {/* Grand Total */}
                                    <div className="glass" style={{ padding: '1rem', background: 'var(--primary)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '1rem', fontWeight: 600 }}>المجموع الجملي والمحتسب:</span>
                                        <span style={{ fontSize: '1.6rem', fontWeight: 900 }}>{formatAmount(actionForm.salaire || 0)} د.ت</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display:'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="submit" className="btn" style={{ flex: 1 }}>
                                    {editingActionId ? 'حفظ التعديلات' : 'إضافة'}
                                </button>
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
