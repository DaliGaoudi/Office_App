import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Save, Check, Plus, Trash2, FileText, Activity, Milestone, UploadCloud, Receipt, ScanLine } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { formatAmount, STATUS_MAP } from '../utils/formatters';
import API_BASE from '../config';
import AutocompleteInput from '../components/AutocompleteInput';
import BillModal from '../components/BillModal';
import { compressImage } from '../utils/cnssScan';

const API = API_BASE;

// Scanned pages come off the scanner as large near-lossless JPEGs. We downscale
// and re-encode them in the browser before bundling into a PDF, which cuts a
// ~12MB page down to a few hundred KB.
const SCAN_MAX_EDGE = 2000;       // px on the long side
const SCAN_JPEG_QUALITY = 0.72;

function compressScan(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let w = img.naturalWidth, h = img.naturalHeight;
            const scale = Math.min(1, SCAN_MAX_EDGE / Math.max(w, h));
            w = Math.round(w * scale);
            h = Math.round(h * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';            // flatten any alpha to white
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            resolve({ dataUrl: canvas.toDataURL('image/jpeg', SCAN_JPEG_QUALITY), w, h });
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not process the scanned image')); };
        img.src = url;
    });
}

export default function RecordDetail() {
    const { type, id } = useParams();
    const navigate = useNavigate();
    const isNew = id === 'new';
    const isExecution = type === 'execution';
    const today = new Date().toISOString().split('T')[0];
    
    const [record, setRecord] = useState(null);
    const [formData, setFormData] = useState({});
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showBill, setShowBill] = useState(false);
    const [activeTab, setActiveTab] = useState('general');

    const [actions, setActions]       = useState([]);
    const [showActionModal, setShowActionModal] = useState(false);
    const [editingActionId, setEditingActionId] = useState(null);
    const [actionForm, setActionForm] = useState({ type_operation: '', date_r: '', remarques: '', origine: '0', exemple: '0', versionbureau: '0', mobilite: '0', orientation: '0', imprimer: '0', inscri: '0', delimitation: '0', postal: '0', autre: '0', TVA: '0', salaire: '0' });

    // AI File Upload
    const [isAILoading, setIsAILoading] = useState(false);
    const fileInputRef = useRef(null);

    // Scanned documents (attachments)
    const [attachments, setAttachments] = useState([]);
    const [isUploadingDoc, setIsUploadingDoc] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [scannedPages, setScannedPages] = useState([]); // pending pages for the current PDF
    const [isSavingPdf, setIsSavingPdf] = useState(false);
    const docInputRef = useRef(null);

    // The local Scan Bridge runs on the office PC and talks to the scanner.
    // Overridable per-machine via localStorage('scanBridgeUrl').
    const BRIDGE_URL = localStorage.getItem('scanBridgeUrl') || 'http://127.0.0.1:17171';

    const fetchRecord = useCallback(async () => {
        if (isNew) {
            const initialState = {
                date_reg: today,
                date_echeance: '', // Will be calculated
                date_inscri: '',
                status: 'has_deposit',
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
            const recordData = { ...json };
            if (recordData.date_inscri === '0') recordData.date_inscri = '';
            setRecord(recordData);
            setFormData(recordData);
            
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
        if (!window.confirm('Are you sure you want to permanently delete this record? This action cannot be undone.')) return;
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_BASE}/${type}/${id}`, { 
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                alert('Record deleted successfully');
                navigate(type === 'execution' ? '/execution' : '/general');
            } else {
                const error = await res.json();
                alert('Failed to delete: ' + error.error);
            }
        } catch (err) {
            console.error('Delete error:', err);
            alert('A server communication error occurred');
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
        if (!confirm('Are you sure you want to delete this report?')) return;
        const token = localStorage.getItem('token');
        try {
            await fetch(`${API_BASE}/execution/${id}/actions/${actionId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchRecord();
        } catch (e) { console.error(e); }
    };

    // Send an image/PDF (uploaded file or scanned page) to the AI extractor and
    // merge the recognized fields into the form. Shared by both the file-upload
    // and the direct-scan smart-scan buttons.
    const runAIExtraction = async (fileOrBlob, filename) => {
        setIsAILoading(true);
        const token = localStorage.getItem('token');
        const fd = new FormData();
        fd.append('file', fileOrBlob, filename || fileOrBlob.name || 'scan.jpg');

        try {
            const res = await fetch(`${API_BASE}/ai/extract`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }, // Note: No Content-Type for FormData
                body: fd
            });
            const result = await res.json();

            if (result.success && result.data) {
                const incoming = result.data;
                // Merge safely. Convert numbers dynamically.
                const updated = { ...formData };
                if (incoming.de_part) updated.de_part = incoming.de_part;
                if (incoming.nom_cl1) updated.nom_cl1 = incoming.nom_cl1;
                if (incoming.nom_cl2) updated.nom_cl2 = incoming.nom_cl2;
                if (incoming.remarque) updated.remarque = incoming.remarque;
                if (incoming.cl1_adresse) updated.cl1_adresse = incoming.cl1_adresse;
                if (incoming.cl2_adresse) updated.cl2_adresse = incoming.cl2_adresse;
                if (incoming.tribunal) updated.tribunal = incoming.tribunal;
                if (incoming.date_s) updated.date_s = incoming.date_s;
                
                // If origine is extracted
                if (incoming.origine && !isNaN(incoming.origine)) {
                    updated.origine = incoming.origine.toString();
                    
                    // Trigger financial recaculation
                    const fees = parseFloat(updated.origine) + (parseFloat(updated.exemple)||0) + (parseFloat(updated.version_bureau)||0) + (parseFloat(updated.orientation)||0);
                    const tva = Math.round(fees * 0.19);
                    const exp = ['delimitation', 'inscri', 'mobilite', 'imprimer', 'poste', 'autre'].reduce((s, k) => s + (parseFloat(updated[k]) || 0), 0);
                    updated.TVA = tva.toString();
                    updated.salaire = (fees + tva + exp).toString();
                    updated.montant_partiel1 = fees.toString();
                    updated.montant_partiel2 = exp.toString();
                }

                setFormData(updated);
                alert("Data extracted successfully! Please review it.");
            } else {
                alert("Extraction failed: " + (result.error || ""));
            }
        } catch (e) {
            console.error("Extraction error:", e);
            alert("AI server communication error");
        }
        setIsAILoading(false);
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        await runAIExtraction(file, file.name);
        // Reset file input so the same file can be re-selected if needed.
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ── Smart scan via the local scanner ──
    // Drives the Scan Bridge to capture one page, compresses it, then feeds it to
    // the AI extractor — the scanner equivalent of the file-upload smart scan.
    const handleSmartScan = async () => {
        setIsAILoading(true);
        let blob;
        try {
            const scanUrl = `${BRIDGE_URL}/scan` + (localStorage.getItem('scanMock') === '1' ? '?mock=1' : '');
            const scanRes = await fetch(scanUrl, { method: 'POST' });
            if (!scanRes.ok) {
                const info = await scanRes.json().catch(() => ({}));
                throw new Error(info.error || 'Scanning failed');
            }
            // Downscale the near-lossless scan to stay under the 10MB upload limit.
            blob = await compressImage(await scanRes.blob());
        } catch (err) {
            console.error('Smart scan error:', err);
            const offline = err instanceof TypeError;
            alert(offline
                ? 'Could not reach the scanner.\nIf this is the first time on this machine, download the Scan Bridge from the Settings page, run install-autostart.cmd once, and check the scanner is connected.'
                : ('Scanning error: ' + err.message));
            setIsAILoading(false);
            return;
        }
        await runAIExtraction(blob, 'scan.jpg');
    };

    // ── Scanned documents ──
    const fetchAttachments = useCallback(async () => {
        if (isNew) return;
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_BASE}/attachments/${type}/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setAttachments(await res.json());
        } catch (e) { console.error('Failed to load documents', e); }
    }, [type, id, isNew]);

    useEffect(() => { fetchAttachments(); }, [fetchAttachments]);

    // Register this record as the active scan target, then poll so documents
    // scanned via the local watcher agent appear automatically (no refresh).
    useEffect(() => {
        if (isNew) return;
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

        fetch(`${API_BASE}/attachments/scan-target`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ record_type: type, record_id: id })
        }).catch(() => {});

        const interval = setInterval(() => { fetchAttachments(); }, 5000);
        return () => clearInterval(interval);
    }, [type, id, isNew, fetchAttachments]);

    const handleDocumentUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsUploadingDoc(true);
        const token = localStorage.getItem('token');
        const fd = new FormData();
        fd.append('file', file);
        fd.append('record_type', type);
        fd.append('record_id', id);
        try {
            const res = await fetch(`${API_BASE}/attachments`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: fd
            });
            const result = await res.json();
            if (result.success) {
                await fetchAttachments();
            } else {
                alert('Document upload failed: ' + (result.error || ''));
            }
        } catch (err) {
            console.error('Document upload error:', err);
            alert('Could not reach the server');
        }
        setIsUploadingDoc(false);
        if (docInputRef.current) docInputRef.current.value = '';
    };

    // ── Direct scan ──
    // Asks the local Scan Bridge to scan one page, compresses it, and adds it to
    // the pending batch. Pages are combined into a single PDF on save.
    const handleScanPage = async () => {
        setIsScanning(true);
        try {
            // For local testing without a scanner: set localStorage.scanMock = '1'
            // and the bridge returns a generated test page.
            const scanUrl = `${BRIDGE_URL}/scan` + (localStorage.getItem('scanMock') === '1' ? '?mock=1' : '');
            const scanRes = await fetch(scanUrl, { method: 'POST' });
            if (!scanRes.ok) {
                const info = await scanRes.json().catch(() => ({}));
                throw new Error(info.error || 'Scanning failed');
            }
            const blob = await scanRes.blob();
            const page = await compressScan(blob);
            setScannedPages(prev => [...prev, page]);
        } catch (err) {
            console.error('Scan page error:', err);
            // A network/TypeError almost always means the bridge isn't running.
            const offline = err instanceof TypeError;
            alert(offline
                ? 'Could not reach the scanner.\nIf this is the first time on this machine, download the Scan Bridge from the Settings page, run install-autostart.cmd once, and check the scanner is connected.'
                : ('Scanning error: ' + err.message));
        } finally {
            setIsScanning(false);
        }
    };

    const removeScannedPage = (idx) => setScannedPages(prev => prev.filter((_, i) => i !== idx));

    // Name the file after the record's number, e.g. 9050.pdf. Append -2, -3… if
    // a file with that name is already attached.
    const buildPdfFilename = () => {
        const base = (String(record?.ref || id).trim() || 'document').replace(/[\\/:*?"<>|]+/g, '_');
        const existing = new Set(attachments.map(a => a.filename));
        let name = `${base}.pdf`;
        for (let n = 2; existing.has(name); n++) name = `${base}-${n}.pdf`;
        return name;
    };

    // Combine the scanned pages into one PDF and upload it to this record.
    const handleSavePdf = async () => {
        if (scannedPages.length === 0) return;
        setIsSavingPdf(true);
        try {
            const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            scannedPages.forEach((p, i) => {
                if (i > 0) pdf.addPage();
                const ratio = Math.min(pageW / p.w, pageH / p.h);
                const w = p.w * ratio, h = p.h * ratio;
                pdf.addImage(p.dataUrl, 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h);
            });
            const pdfBlob = pdf.output('blob');
            const filename = buildPdfFilename();

            const token = localStorage.getItem('token');
            const fd = new FormData();
            fd.append('file', pdfBlob, filename);
            fd.append('record_type', type);
            fd.append('record_id', id);

            const up = await fetch(`${API_BASE}/attachments`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: fd
            });
            const result = await up.json();
            if (result.success) {
                setScannedPages([]);
                await fetchAttachments();
            } else {
                alert('Document upload failed: ' + (result.error || ''));
            }
        } catch (err) {
            console.error('Save PDF error:', err);
            alert('Error creating or uploading the PDF: ' + err.message);
        } finally {
            setIsSavingPdf(false);
        }
    };

    const handleDeleteAttachment = async (attId) => {
        if (!confirm('Delete this document?')) return;
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_BASE}/attachments/${attId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setAttachments(prev => prev.filter(a => a.id !== attId));
        } catch (err) { console.error('Delete failed', err); }
    };

    if (loading) return <div style={{padding:'4rem', textAlign:'center', opacity:0.5}}>Loading…</div>;
    if (!record && !isNew) return <div style={{padding:'4rem', textAlign:'center', color:'var(--error)'}}>File not found</div>;



    const tabConfig = [
        { id: 'general', label: 'General information' },
        { id: 'client1', label: 'Petitioner' },
        { id: 'client2', label: 'Defendant' },
        ...(!isExecution ? [{ id: 'financials', label: 'Fees & expenses' }] : []),
        ...(!isNew ? [{ id: 'documents', label: 'Scanned documents' }] : [])
    ];

    const fieldGroups = {
        general: [
            { key: 'ref', label: 'Reference Number', placeholder: 'Auto' },
            { key: 'remarque', label: 'Record Type' },
            { key: 'date_reg', label: 'Service Request Date', type: 'date' },
            { key: 'date_echeance', label: 'Last Notification Deadline', type: 'date', readonly: true },
            { key: 'date_inscri', label: 'Notification Date', type: 'date' },

            { key: 'de_part', label: 'Petitioner' },
            { key: 'service_petitioner_contact', label: 'Contact Info' },
            ...(isExecution ? [
                { key: 'tribunal', label: 'Court' },
                { key: 'nombre', label: 'Case Number' },
                { key: 'date_s', label: 'Document Date' },
                { key: 'resultat', label: 'Final Outcome' }
            ] : [])
        ],
        client1: [
            { key: 'nom_cl1', label: 'Petitioner Name' },
            { key: 'cl1_profession', label: 'Profession' },
            { key: 'cl1_adresse', label: 'Address' },
            { key: 'cl1_tel', label: 'Phone 1' },
            { key: 'tel2_cl1', label: 'Phone 2' },
            { key: 'cl1_avocat', label: 'Lawyer' }
        ],
        client2: [
            { key: 'nom_cl2', label: 'Respondent Name' },
            { key: 'cl2_profession', label: 'Profession' },
            { key: 'cl2_adresse', label: 'Address' },
            { key: 'cl2_tel', label: 'Phone 1' },
            { key: 'tel2_cl2', label: 'Phone 2' },
            { key: 'cl2_avocat', label: 'Lawyer' }
        ],
        financials: [
            { key: 'acompte', label: 'Deposit (TND)' },
            { key: 'origine', label: 'Base Fee' },
            { key: 'exemple', label: 'Copies' },
            { key: 'version_bureau', label: 'Office Copy' },
            { key: 'orientation', label: 'Orientation' },
            { key: 'delimitation', label: 'Registration' },
            { key: 'inscri', label: 'Inscription' },
            { key: 'mobilite', label: 'Transport' },
            { key: 'imprimer', label: 'Paper Copies' },
            { key: 'poste', label: 'Post' },
            { key: 'autre', label: 'Others' },
            { key: 'TVA', label: 'Value Added Tax (VAT)', readonly: true }
        ]
    };

    return (
        <div className="animate-fade">
            <div className="topbar no-print" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button className="btn" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-main)' }} onClick={() => navigate(-1)}>
                        <ArrowLeft size={18} /> Back
                    </button>
                    <h2 style={{color: 'var(--primary)', margin: 0}}>
                        {isExecution ? 'Execution File' : 'Record'} #{record?.ref || id} {formData.remarque && <span style={{ opacity: 0.7, fontSize: '0.9em', marginRight: '0.5rem' }}>— {formData.remarque}</span>}
                    </h2>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        style={{ display: 'none' }} 
                        accept="image/*,application/pdf" 
                        onChange={handleFileUpload} 
                    />
                    <button
                        className="btn"
                        style={{ background: 'var(--card-bg)', border: '1px solid var(--primary)', color: 'var(--primary)' }}
                        onClick={() => fileInputRef.current && fileInputRef.current.click()}
                        disabled={isAILoading}
                    >
                        {isAILoading ? 'Reading...' : <><UploadCloud size={18} /> Smart Scan (AI)</>}
                    </button>
                    <button
                        className="btn"
                        style={{ background: 'var(--card-bg)', border: '1px solid var(--primary)', color: 'var(--primary)' }}
                        onClick={handleSmartScan}
                        disabled={isAILoading}
                        title="Scan the act and extract its data automatically"
                    >
                        {isAILoading ? 'Reading…' : <><ScanLine size={18} /> Smart scan</>}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface-2)', padding: '0.4rem 1rem', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
                        <Milestone size={16} />
                        <select 
                            value={formData.status || 'not_started'} 
                            onChange={(e) => updateStatus(e.target.value)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '0.9rem', cursor: 'pointer', outline: 'none' }}
                        >
                            {Object.entries(STATUS_MAP).map(([key, info]) => (
                                <option key={key} value={key} style={{ background: 'var(--card-bg)', color: 'var(--text-main)' }}>{info.label}</option>
                            ))}
                        </select>
                    </div>
                    {!isNew && (
                        <button
                            className="btn"
                            style={{ background: 'rgba(var(--primary-rgb),0.15)', border: '1px solid var(--primary)', color: 'var(--primary)' }}
                            onClick={() => setShowBill(true)}
                        >
                            <Receipt size={18} /> Print Invoice
                        </button>
                    )}
                    <button className="btn" onClick={() => window.print()}>
                        <Printer size={18} /> Print Record
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
                                {activeTab === 'documents' ? (
                                    <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        <input
                                            type="file"
                                            ref={docInputRef}
                                            style={{ display: 'none' }}
                                            accept="image/*,application/pdf"
                                            onChange={handleDocumentUpload}
                                        />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                            <button
                                                type="button"
                                                className="btn-primary"
                                                disabled={isScanning || isSavingPdf}
                                                onClick={handleScanPage}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                            >
                                                {isScanning ? 'Scanning…' : <><ScanLine size={18} /> Scan page</>}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isScanning || isUploadingDoc || isSavingPdf}
                                                onClick={() => docInputRef.current && docInputRef.current.click()}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                    padding: '0.6rem 1.1rem', borderRadius: '10px',
                                                    border: '1px solid var(--card-border)', background: 'transparent',
                                                    color: 'var(--text-main)', cursor: 'pointer', fontFamily: 'inherit',
                                                    fontWeight: 600, fontSize: '0.9rem'
                                                }}
                                            >
                                                {isUploadingDoc ? 'Uploading…' : <><UploadCloud size={18} /> Upload file</>}
                                            </button>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                Press “Scan page” for each sheet, then “Save PDF” to merge them into one file named after the file number. Or upload an existing file.
                                            </span>
                                        </div>

                                        {scannedPages.length > 0 && (
                                            <div className="glass" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', border: '1px solid var(--primary)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--primary)', fontSize: '0.9rem' }}>
                                                        Pages awaiting save: {scannedPages.length} — will be saved as {String(record?.ref || id)}.pdf
                                                    </span>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button
                                                            type="button"
                                                            className="btn-primary"
                                                            disabled={isSavingPdf || isScanning}
                                                            onClick={handleSavePdf}
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                                        >
                                                            {isSavingPdf ? 'Saving…' : <><FileText size={16} /> Save PDF ({scannedPages.length})</>}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={isSavingPdf}
                                                            onClick={() => setScannedPages([])}
                                                            style={{
                                                                padding: '0.5rem 1rem', borderRadius: '10px',
                                                                border: '1px solid var(--card-border)', background: 'transparent',
                                                                color: 'var(--text-main)', cursor: 'pointer', fontFamily: 'inherit',
                                                                fontWeight: 600, fontSize: '0.85rem'
                                                            }}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                                                    {scannedPages.map((p, idx) => (
                                                        <div key={idx} style={{ position: 'relative', width: 80, height: 110, border: '1px solid var(--card-border)', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
                                                            <img src={p.dataUrl} alt={`Page ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            <span style={{ position: 'absolute', bottom: 2, right: 4, fontSize: '0.7rem', color: '#000', background: 'rgba(255,255,255,0.85)', padding: '0 4px', borderRadius: 4 }}>{idx + 1}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeScannedPage(idx)}
                                                                title="Delete page"
                                                                style={{ position: 'absolute', top: 2, left: 2, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {attachments.length === 0 ? (
                                            <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
                                                No documents attached yet
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                {attachments.map(att => (
                                                    <div key={att.id} className="glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', gap: '1rem' }}>
                                                        <a
                                                            href={att.blob_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-main)', textDecoration: 'none', flex: 1, minWidth: 0 }}
                                                        >
                                                            <FileText size={18} style={{ flexShrink: 0 }} />
                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.filename}</span>
                                                        </a>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                {att.size ? (att.size / 1024).toFixed(0) + ' KB' : ''}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteAttachment(att.id)}
                                                                style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', display: 'flex' }}
                                                                title="Delete"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : activeTab !== 'financials' ? (
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
                                            ) : (field.key === 'de_part' || field.key === 'nom_cl1' || field.key === 'nom_cl2') ? (
                                                <AutocompleteInput 
                                                    value={formData[field.key] || ''} 
                                                    placeholder={field.placeholder}
                                                    onChange={(e) => setFormData({...formData, [field.key]: e.target.value})}
                                                    style={{ padding: '0.6rem', background: 'transparent', border: 'none', color: 'var(--text-main)' }}
                                                    className="glass"
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

                                                        // Auto-transition to has_deposit if acompte is added (now default, but kept for robustness)
                                                        if (field.key === 'acompte' && parseFloat(newVal) > 0 && (!formData.status || formData.status === 'not_started')) {
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
                                        <div className="glass" style={{ padding: '1rem', background: 'var(--surface-subtle)' }}>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Advance (TND)</label>
                                            <input type="number" value={formData.acompte || '0'} onChange={(e) => setFormData({...formData, acompte: e.target.value})} style={{ width: '100%', padding: '0.6rem' }} />
                                        </div>

                                        {/* Block 2: Fees (Sum 1) */}
                                        <div className="glass" style={{ padding: '1.5rem', background: 'rgba(var(--primary-rgb), 0.05)', border: '1px solid rgba(var(--primary-rgb), 0.1)' }}>
                                            <h4 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--primary)', fontWeight: 600 }}>Fees</h4>
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
                                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Fees Total (Partiel 1):</span>
                                                <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary)' }}>{formatAmount(formData.montant_partiel1 || 0)} TND</span>
                                            </div>
                                        </div>

                                        {/* Block 3: VAT Badge */}
                                        <div className="glass" style={{ padding: '1.2rem 1.5rem', border: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>Value Added Tax (VAT 19%):</span>
                                            <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>{formatAmount(formData.TVA || 0)} TND</span>
                                        </div>

                                        {/* Block 4: Expenses (Sum 2) */}
                                        <div className="glass" style={{ padding: '1.5rem', background: 'rgba(255,193,7, 0.03)', border: '1px solid rgba(255,193,7, 0.1)' }}>
                                            <h4 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#ffc107', fontWeight: 600 }}>Expenses</h4>
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
                                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Expenses Total (Partiel 2):</span>
                                                <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ffc107' }}>{formatAmount(formData.montant_partiel2 || 0)} TND</span>
                                            </div>
                                        </div>

                                        {/* Block 5: Grand Total */}
                                        <div className="glass" style={{ marginTop: '1rem', padding: '1.5rem', background: 'var(--primary)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 8px 32px rgba(var(--primary-rgb), 0.3)' }}>
                                            <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>Calculated Grand Total:</span>
                                            <span style={{ fontSize: '2.5rem', fontWeight: 900 }}>{formatAmount(formData.salaire || 0)} TND</span>
                                        </div>
                                    </div>
                                )}

                                {/* Remarks Field (Visible Regardless of Tabs) */}
                                <div style={{ gridColumn: 'span 2', marginTop: '1.5rem', borderTop: '1px solid var(--card-border)', paddingTop: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Remarks</label>
                                    <textarea 
                                        value={formData.resume || ''} 
                                        onChange={(e) => setFormData({...formData, resume: e.target.value})}
                                        className="glass"
                                        style={{ width: '100%', padding: '0.6rem', minHeight: '100px', color: 'var(--text-main)', border: '1px solid var(--card-border)' }}
                                        placeholder="Add your remarks here..."
                                    />
                                </div>
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', gap: '1rem' }}>
                                {tabConfig.findIndex(t => t.id === activeTab) < tabConfig.length - 1 ? (
                                    <button type="button" className="btn" style={{ background: 'var(--surface-2)' }} 
                                        onClick={() => {
                                            const idx = tabConfig.findIndex(t => t.id === activeTab);
                                            setActiveTab(tabConfig[idx+1].id);
                                        }}>
                                        Next
                                    </button>
                                ) : <div></div>}
                                
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    {!isNew && (
                                        <button type="button" className="btn" style={{ background: '#ef444420', color: '#ef4444' }} onClick={handleDelete}>
                                            <Trash2 size={18} /> Delete
                                        </button>
                                    )}
                                    <button type="submit" className="btn" style={{ width: 'auto' }} disabled={isSaving}>
                                        {saved ? <Check size={18} /> : <Save size={18} />} 
                                        {isSaving ? 'Saving...' : (isNew ? 'Add Record' : (saved ? 'Saved!' : 'Save Changes'))}
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
                            <h3 style={{ margin: 0 }}>Record Stats</h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="glass" style={{ padding: '1rem', textAlign: 'center' }}>
                                <span style={{ fontSize: '0.8rem', opacity: 0.6, display: 'block' }}>Number of Reports</span>
                                <strong style={{ fontSize: '1.5rem' }}>{actions.length}</strong>
                            </div>
                            <div className="glass" style={{ padding: '1rem', textAlign: 'center', border: '1px solid rgba(var(--primary-rgb), 0.3)' }}>
                                <span style={{ fontSize: '0.8rem', opacity: 0.6, display: 'block' }}>Total Expenses</span>
                                <strong style={{ fontSize: '1.5rem', color: 'var(--primary)' }}>
                                    {formatAmount(actions.reduce((s,a) => s + (parseFloat(a.total) || 0), 0))} TND
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
                            <h3 style={{ margin: 0 }}>Execution Phases (Linked Reports)</h3>
                        </div>
                        <button className="btn no-print" onClick={() => { setEditingActionId(null); setActionForm({ type_operation: '', date_r: '', remarques: '', origine: '0', exemple: '0', versionbureau: '0', mobilite: '0', orientation: '0', imprimer: '0', inscri: '0', delimitation: '0', postal: '0', autre: '0', TVA: '0', salaire: '0' }); setShowActionModal(true); }}>
                            <Plus size={18} /> Add Phase
                        </button>
                    </div>

                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Operation Type</th>
                                    <th>Date</th>
                                    <th>Remarks</th>
                                    <th>Amount (TND)</th>
                                    <th className="no-print">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {actions.length === 0 ? (
                                    <tr><td colSpan={6} style={{ textAlign:'center', opacity:0.5, padding:'2rem' }}>No reports linked to this record</td></tr>
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
                                            Total Expenses:
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
                <div className="modal-overlay no-print" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding: '1rem' }}>
                    <div className="glass card animate-scale" style={{ width: 700, maxWidth: '100%', padding:'2rem', maxHeight: '95vh', overflowY: 'auto', borderRadius: '16px', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ color: 'var(--primary)', marginBottom: '1.5rem', textAlign: 'center', fontSize: '1.3rem' }}>
                            {editingActionId ? 'Edit Execution Phase' : 'Add New Execution Phase'}
                        </h3>
                        <form onSubmit={handleSaveAction} style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                                <div>
                                    <label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.85rem', opacity:0.8, fontWeight: 500 }}>Operation Type</label>
                                    <input type="text" placeholder="e.g., Notification, Seizure..." value={actionForm.type_operation} onChange={e => setActionForm({...actionForm, type_operation: e.target.value})} required style={{ width:'100%', padding: '0.6rem', borderRadius: '8px' }} />
                                </div>
                                <div>
                                    <label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.85rem', opacity:0.8, fontWeight: 500 }}>Date</label>
                                    <input type="text" placeholder="YYYY/MM/DD" value={actionForm.date_r} onChange={e => setActionForm({...actionForm, date_r: e.target.value})} style={{ width:'100%', padding: '0.6rem', borderRadius: '8px' }} />
                                </div>
                            </div>
                            
                            <div>
                                <label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.85rem', opacity:0.8, fontWeight: 500 }}>Remarks</label>
                                <textarea className="glass" style={{ width:'100%', height: 80, padding:'0.8rem', color:'var(--text-main)', border:'1px solid var(--card-border)', borderRadius: '8px', resize: 'vertical' }}
                                    value={actionForm.remarques} onChange={e => setActionForm({...actionForm, remarques: e.target.value})} />
                            </div>

                            {/* Financial breakdown for Action */}
                            <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '1.5rem' }}>
                                <h4 style={{ fontSize: '1rem', marginBottom: '1.2rem', color:'var(--primary)' }}>Fees and Expenses Details</h4>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                    {/* Fees Section */}
                                    <div className="glass" style={{ padding: '1.2rem', background: 'rgba(var(--primary-rgb), 0.05)', borderRadius: '12px' }}>
                                        <h5 style={{ fontSize: '0.9rem', marginBottom: '1rem', opacity: 0.9 }}>Fees</h5>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.8rem' }}>
                                            {[
                                                {k:'origine', l:'Base Fee'}, {k:'exemple', l:'Copies'}, 
                                                {k:'versionbureau', l:'Office Copy'}, {k:'orientation', l:'Orientation'}
                                            ].map(f => (
                                                <div key={f.k}>
                                                    <label style={{ fontSize:'0.75rem', opacity:0.7, display: 'block', marginBottom: '0.3rem' }}>{f.l}</label>
                                                    <input type="number" value={actionForm[f.k]} 
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            const newForm = {...actionForm, [f.k]: val};
                                                            const fees = ['origine', 'exemple', 'versionbureau', 'orientation'].reduce((s, k) => s + (parseFloat(newForm[k]) || 0), 0);
                                                            const tva = Math.round(fees * 0.19);
                                                            const expenses = ['inscri', 'delimitation', 'mobilite', 'imprimer', 'postal', 'autre'].reduce((s, k) => s + (parseFloat(newForm[k]) || 0), 0);
                                                            newForm.TVA = tva.toString();
                                                            newForm.salaire = (fees + tva + expenses).toString();
                                                            newForm.montantpartiel1 = fees.toString();
                                                            newForm.montantpartiel2 = expenses.toString();
                                                            setActionForm(newForm);
                                                        }} 
                                                        style={{ width:'100%', padding:'0.5rem', fontSize:'0.9rem', borderRadius: '6px' }} 
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="glass" style={{ marginTop: '1rem', padding: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(var(--primary-rgb), 0.1)', borderRadius: '8px' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Fees Total (Partiel 1)</span>
                                            <strong style={{ fontSize: '1rem', color: 'var(--primary)' }}>{formatAmount(['origine', 'exemple', 'versionbureau', 'orientation'].reduce((s,k) => s + (parseFloat(actionForm[k]) || 0), 0))}</strong>
                                        </div>
                                    </div>

                                    {/* VAT Bridging */}
                                    <div className="glass" style={{ padding: '0.8rem 1.2rem', background: 'var(--surface-subtle)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--card-border)' }}>
                                        <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>Value added tax (VAT 19%)</span>
                                        <strong style={{ fontSize: '1.1rem', fontWeight: 700 }}>{formatAmount(actionForm.TVA || 0)}</strong>
                                    </div>

                                    {/* Expenses Section */}
                                    <div className="glass" style={{ padding: '1.2rem', background: 'rgba(255,193,7, 0.03)', borderRadius: '12px' }}>
                                        <h5 style={{ fontSize: '0.9rem', marginBottom: '1rem', opacity: 0.9 }}>Expenses</h5>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.8rem' }}>
                                            {[
                                                {k:'delimitation', l:'Registration'}, {k:'inscri', l:'Inscription'}, {k:'mobilite', l:'Transport'},
                                                {k:'imprimer', l:'Copies'}, {k:'postal', l:'Post'}, {k:'autre', l:'Others'}
                                            ].map(f => (
                                                <div key={f.k}>
                                                    <label style={{ fontSize:'0.75rem', opacity:0.7, display: 'block', marginBottom: '0.3rem' }}>{f.l}</label>
                                                    <input type="number" value={actionForm[f.k]} 
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            const newForm = {...actionForm, [f.k]: val};
                                                            const fees = ['origine', 'exemple', 'versionbureau', 'orientation'].reduce((s, k) => s + (parseFloat(newForm[k]) || 0), 0);
                                                            const tva = Math.round(fees * 0.19);
                                                            const expenses = ['inscri', 'delimitation', 'mobilite', 'imprimer', 'postal', 'autre'].reduce((s, k) => s + (parseFloat(newForm[k]) || 0), 0);
                                                            newForm.TVA = tva.toString();
                                                            newForm.salaire = (fees + tva + expenses).toString();
                                                            newForm.montantpartiel1 = fees.toString();
                                                            newForm.montantpartiel2 = expenses.toString();
                                                            setActionForm(newForm);
                                                        }} 
                                                        style={{ width:'100%', padding:'0.5rem', fontSize:'0.9rem', borderRadius: '6px' }} 
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="glass" style={{ marginTop: '1rem', padding: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,193,7, 0.1)', borderRadius: '8px' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Expenses Total (Partiel 2)</span>
                                            <strong style={{ fontSize: '1rem', color: '#ffc107' }}>{formatAmount(['delimitation', 'inscri', 'mobilite', 'imprimer', 'postal', 'autre'].reduce((s,k) => s + (parseFloat(actionForm[k]) || 0), 0))}</strong>
                                        </div>
                                    </div>

                                    {/* Grand Total */}
                                    <div className="glass" style={{ padding: '1.2rem', background: 'var(--primary)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '12px' }}>
                                        <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Calculated Grand Total:</span>
                                        <span style={{ fontSize: '1.8rem', fontWeight: 900 }}>{formatAmount(actionForm.salaire || 0)} <span style={{ fontSize: '1rem', fontWeight: 400 }}>TND</span></span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display:'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="submit" className="btn" style={{ flex: 1, padding: '0.8rem', fontSize: '1rem' }}>
                                    {editingActionId ? 'Save Changes' : 'Add Phase'}
                                </button>
                                <button type="button" className="btn" style={{ flex: 1, background: 'var(--surface-2)', padding: '0.8rem', fontSize: '1rem' }} onClick={() => setShowActionModal(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Bill Modal ── */}
            {showBill && (
                <BillModal
                    record={formData}
                    actions={isExecution ? actions : []}
                    onClose={() => setShowBill(false)}
                />
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
