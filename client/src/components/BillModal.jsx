import { useRef } from 'react';
import { X, Printer } from 'lucide-react';
import { numberToArabicWords } from '../utils/numberToArabicWords';

/* ─── helpers ──────────────────────────────────────────────── */

/**
 * formatAmount for the bill: DB stores as millimes (integer).
 * Display: 173.340  (3 decimal places, dot separator)
 */
function billFormat(millimes) {
  const n = Math.round(parseFloat(millimes) || 0);
  const dinars = Math.floor(n / 1000);
  const mills  = n % 1000;
  return `${dinars}.${String(mills).padStart(3, '0')}`;
}

/**
 * Format an ISO/SQL date string to DD/MM/YYYY
 */
function fmtDate(raw) {
  if (!raw) return '—';
  // Already in DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  // ISO YYYY-MM-DD
  const [y, m, d] = raw.split(/[-\/]/);
  if (d) return `${d}/${m}/${y}`;
  return raw;
}

/**
 * Current Arabic date string: سوسة في DD MMMM YYYY
 */
const ARABIC_MONTHS = [
  'جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان',
  'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];
function todayArabic() {
  const now = new Date();
  return `سوسة في ${now.getDate()} ${ARABIC_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

/* ─── Component ─────────────────────────────────────────────── */

/**
 * BillModal
 *
 * Props:
 *  - record  : the main record object (for header: client name, address, reference)
 *  - actions : array of execution actions (for execution records) — optional
 *  - records : array of facturation row items for multi-record general bills — optional
 *             when provided with 2+ items, each becomes one bill row using pre-computed amounts
 *  - onClose : callback to close the modal
 */
export default function BillModal({ record, actions = [], records = [], onClose }) {
  const printRef = useRef(null);

  // For multi-record mode, derive the header record from the first item
  const headerRecord = records.length > 0 ? records[0] : record;

  if (!headerRecord) return null;

  const isMulti     = records.length > 0;
  const isExecution = !isMulti && Boolean(actions && actions.length > 0);

  /* ── Build table rows ───────────────────────────────────────── */
  let rows = [];

  if (isMulti) {
    // Multi-record general bill — use pre-computed amounts already in millimes
    rows = records.map((r, idx) => ({
      idx:       idx + 1,
      ref:       r.ref || '—',
      operation: r.remarque || '—',
      target:    r.nom_cl2 || '—',
      date:      fmtDate(r.date_inscri),
      fees:      r.base_fare     || 0,
      tva:       r.tva           || 0,
      expenses:  r.expenses      || 0,
      total:     r.calculated_total || 0,
    }));
  } else if (isExecution) {
    // Each action is a row — field names match œuvre_type table columns
    rows = actions.map((act, idx) => {
      const fees     = ['origine','exemple','versionbureau','orientation']
        .reduce((s, k) => s + (parseInt(act[k]) || 0), 0);
      const tva      = Math.round(fees * 0.19);
      const expenses = ['delimitation','inscri','mobilite','imprimer','poste','autre']
        .reduce((s, k) => s + (parseInt(act[k]) || 0), 0);
      // Fallback: use pre-computed total from backend if breakdown yields 0
      const computed = fees + tva + expenses;
      const total    = computed > 0 ? computed : (parseInt(act.total) || parseInt(act.salaire) || 0);

      // For fallback rows, distribute total across fees column
      const displayFees     = computed > 0 ? fees     : total;
      const displayTva      = computed > 0 ? tva      : 0;
      const displayExpenses = computed > 0 ? expenses : 0;

      return {
        idx:          idx + 1,
        ref:          act.id || '—',
        operation:    act.type_operation || '—',
        target:       record.nom_cl2 || '—',
        date:         fmtDate(act.date_r),
        fees:         displayFees,
        tva:          displayTva,
        expenses:     displayExpenses,
        total,
      };
    });
  } else {
    // General record: single row
    const fees     = ['origine','exemple','version_bureau','orientation']
      .reduce((s, k) => s + (parseInt(record[k]) || 0), 0);
    const tva      = Math.round(fees * 0.19);
    const expenses = ['delimitation','inscri','mobilite','imprimer','poste','autre']
      .reduce((s, k) => s + (parseInt(record[k]) || 0), 0);
    const total    = fees + tva + expenses;

    rows = [{
      idx:       1,
      ref:       record.ref || '—',
      operation: record.remarque || '—',
      target:    record.nom_cl2 || '—',
      date:      fmtDate(record.date_inscri),
      fees,
      tva,
      expenses,
      total,
    }];
  }


  /* ── Column totals ─────────────────────────────────────────── */
  const totalFees     = rows.reduce((s, r) => s + r.fees,     0);
  const totalTva      = rows.reduce((s, r) => s + r.tva,      0);
  const totalExpenses = rows.reduce((s, r) => s + r.expenses, 0);
  const grandTotal    = rows.reduce((s, r) => s + r.total,    0);

  // grandTotal is already in millimes (integer)
  const amountWords = numberToArabicWords(grandTotal);

  /* ── Print handler ─────────────────────────────────────────── */
  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8"/>
        <title>قائمة مصاريف وأجور محاضر</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Cairo', 'Amiri', Arial, sans-serif; direction: rtl; background: white; color: #000; font-size: 12pt; padding: 0; }
          .bill-page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 12mm 15mm 10mm; position: relative; }
          .bill-header { text-align: center; border-bottom: 3px double #000; padding-bottom: 8px; margin-bottom: 14px; }
          .bill-header h1 { font-size: 18pt; font-weight: 700; letter-spacing: 1px; }
          .bill-header h2 { font-size: 13pt; font-weight: 600; margin-top: 2px; }
          .bill-header h3 { font-size: 11pt; font-weight: 400; margin-top: 2px; }
          .bill-meta { margin-bottom: 12px; }
          .bill-meta .title-row { font-size: 15pt; font-weight: 700; text-align: center; margin-bottom: 10px; text-decoration: underline; letter-spacing: 2px; }
          .bill-meta table { width: 100%; border-collapse: collapse; }
          .bill-meta td { padding: 3px 6px; font-size: 11pt; }
          .bill-meta td:first-child { font-weight: 700; width: 120px; }
          table.data-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10pt; }
          table.data-table th { background: #e8e8e8; border: 1px solid #555; padding: 5px 6px; text-align: center; font-weight: 700; font-size: 9.5pt; white-space: nowrap; }
          table.data-table td { border: 1px solid #555; padding: 5px 6px; text-align: center; vertical-align: middle; }
          table.data-table tr:nth-child(even) { background: #f9f9f9; }
          table.data-table tfoot td { font-weight: 700; background: #d0d0d0; }
          .amount-words { margin-top: 14px; border: 1px solid #333; padding: 8px 12px; font-size: 11pt; font-weight: 600; text-align: center; background: #f5f5f5; }
          .signature { text-align: center; margin-top: 24px; font-size: 13pt; font-weight: 700; }
          .bill-footer { position: fixed; bottom: 8mm; left: 15mm; right: 15mm; border-top: 2px solid #000; padding-top: 6px; text-align: center; font-size: 8pt; }
          @media print {
            @page { size: A4; margin: 0; }
            body { padding: 0; }
            .bill-page { padding: 12mm 15mm 30mm; }
          }
        </style>
      </head>
      <body>
        ${content}
      </body>
      </html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 600);
  };

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <>
      {/* ── Backdrop ── */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          zIndex: 1100, backdropFilter: 'blur(4px)'
        }}
      />

      {/* ── Modal shell ── */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1101,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        overflow: 'auto', padding: '2rem 1rem'
      }}>
        <div style={{
          width: '820px', maxWidth: '100%',
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: '18px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          overflow: 'hidden'
        }}>
          {/* ── Modal Header bar ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--card-border)',
            background: 'rgba(var(--primary-rgb),0.06)'
          }}>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--primary)' }}>
              قائمة مصاريف وأجور محاضر{isMulti ? ` (مجمعة — ${records.length} ملفات)` : ''}
            </span>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                onClick={handlePrint}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.5rem 1.2rem', border: 'none', borderRadius: '10px',
                  background: 'var(--primary)', color: 'white',
                  fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(var(--primary-rgb),0.3)',
                  fontFamily: 'inherit'
                }}
              >
                <Printer size={17} /> طباعة الفاتورة
              </button>
              <button
                onClick={onClose}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--text-muted)', cursor: 'pointer', padding: '4px'
                }}
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {/* ── Bill preview ── */}
          <div style={{ padding: '1.5rem', overflow: 'auto' }}>
            <div
              ref={printRef}
              style={{
                background: 'white', color: '#000',
                fontFamily: "'Cairo', 'Amiri', Arial, sans-serif",
                direction: 'rtl',
                padding: '14mm 16mm 12mm',
                width: '100%',
                fontSize: '11pt',
                lineHeight: 1.6
              }}
            >
              {/* ── Letterhead header ── */}
              <div className="bill-header" style={{
                textAlign: 'center',
                borderBottom: '3px double #000',
                paddingBottom: '10px',
                marginBottom: '14px'
              }}>
                <div style={{ fontSize: '18pt', fontWeight: 700, letterSpacing: '1px' }}>
                  مكـــتــب الأستـــاذ
                </div>
                <div style={{ fontSize: '17pt', fontWeight: 700, marginTop: '2px' }}>
                  مـــراد القــعــودي
                </div>
                <div style={{ fontSize: '12pt', fontWeight: 500, marginTop: '4px' }}>
                  العدل المنفذ بسوسة
                </div>
              </div>

              {/* ── Date + title ── */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ textAlign: 'right', fontWeight: 600, marginBottom: '8px', fontSize: '11pt' }}>
                  {todayArabic()}
                </div>
                <div style={{
                  textAlign: 'center', fontSize: '15pt', fontWeight: 700,
                  textDecoration: 'underline', letterSpacing: '2px', marginBottom: '12px'
                }}>
                  قائـــمـــة مصـاريف وأجور محاضر
                </div>

                {/* Client info block */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11pt' }}>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 700, width: '110px', paddingBottom: '4px', whiteSpace: 'nowrap' }}>الحريف :</td>
                      <td style={{ paddingBottom: '4px' }}>{headerRecord.de_part || headerRecord.nom_cl1 || '—'}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700, paddingBottom: '4px' }}>العنوان :</td>
                      <td style={{ paddingBottom: '4px' }}>{headerRecord.cl1_adresse || '—'}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 700 }}>المرجع :</td>
                      <td>{isMulti ? `ملفات متعددة (${records.length})` : (headerRecord.remarque || headerRecord.nom_cl2 || '—')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ── Data table ── */}
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                marginTop: '12px', fontSize: '10pt'
              }}>
                <thead>
                  <tr>
                    {[
                      'العدد الرتبي', 'عدد التضمين', 'نوع العملية',
                      'المتوجه إليه', 'تاريخ المحضر',
                      'مجموع الأجور', 'أ ق م', 'مجموع المصاريف', 'أجرة المحضر بالدينار'
                    ].map(h => (
                      <th key={h} style={{
                        background: '#e0e0e0', border: '1px solid #555',
                        padding: '5px 6px', textAlign: 'center',
                        fontWeight: 700, fontSize: '9pt', whiteSpace: 'nowrap'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f7f7f7' }}>
                      <td style={tdStyle}>{row.idx}</td>
                      <td style={tdStyle}>{row.ref}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{row.operation}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{row.target}</td>
                      <td style={tdStyle}>{row.date}</td>
                      <td style={tdStyle}>{billFormat(row.fees)}</td>
                      <td style={tdStyle}>{billFormat(row.tva)}</td>
                      <td style={tdStyle}>{billFormat(row.expenses)}</td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{billFormat(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, fontWeight: 700, background: '#d0d0d0', textAlign: 'center' }}>
                      المجموع :
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700, background: '#d0d0d0' }}>{billFormat(totalFees)}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, background: '#d0d0d0' }}>{billFormat(totalTva)}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, background: '#d0d0d0' }}>{billFormat(totalExpenses)}</td>
                    <td style={{ ...tdStyle, fontWeight: 800, background: '#c8c8c8' }}>{billFormat(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>

              {/* ── Amount in words ── */}
              <div style={{
                marginTop: '14px', border: '1px solid #333',
                padding: '8px 14px', fontSize: '11pt', fontWeight: 600,
                textAlign: 'center', background: '#f5f5f5', borderRadius: '4px'
              }}>
                أوقفت هذه القائمة على مبلغ قدره : {amountWords}.
              </div>

              {/* ── Signature ── */}
              <div style={{ textAlign: 'center', marginTop: '28px', fontSize: '13pt', fontWeight: 700 }}>
                العـدل المنفـذ
              </div>

              {/* ── Letterhead footer ── */}
              <div style={{
                marginTop: '40px', borderTop: '2px solid #000',
                paddingTop: '8px', textAlign: 'center', fontSize: '8.5pt',
                color: '#333'
              }}>
                <div>عمارة قلولو – مكتب عدد A23 - شارع محمد معروف – 4000 سوسة</div>
                <div>الهاتف : 73226226 – الفاكس : 73226300 - البريد الإلكتروني : mourad.gaoudi@gmail.com</div>
                <div>ب ت و عدد 02983329 - المعرف الجبائي 1301683X/A/P/000</div>
                <div>الحساب البنكي : البنك التونسي 05500000022300094016</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── shared cell style ─────────────────────────────────────── */
const tdStyle = {
  border: '1px solid #555',
  padding: '5px 6px',
  textAlign: 'center',
  verticalAlign: 'middle'
};
