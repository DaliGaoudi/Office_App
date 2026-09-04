/*
 * An in-app approximation of how the office's letterhead and act opening will look.
 * Ported from the desktop app, and kept in step with server/assets/template_cnss.docx
 * after that template was parameterized — the jurisdiction, CNSS regional bureau and
 * regional director are merge fields now, so they appear here too.
 *
 * Word headers don't render faithfully in lightweight HTML, so this mirrors the
 * layout rather than converting the .docx. For a pixel-exact check the user
 * downloads the real sample act.
 */
const ph = (v, placeholder) => (v && v.trim() ? v : placeholder);

export default function LetterheadPreview({ profile = {} }) {
  const muted = { color: '#9aa', fontStyle: 'italic' };
  const val = (v, p) => (v && v.trim() ? <span>{v}</span> : <span style={muted}>{p}</span>);

  return (
    <div dir="rtl" style={{
      background: '#fff', color: '#111', borderRadius: 8, padding: '1.6rem 1.8rem',
      fontFamily: '"Times New Roman", serif', lineHeight: 1.9, maxHeight: '46vh', overflowY: 'auto',
      boxShadow: 'inset 0 0 0 1px #e3e3e3',
    }}>
      {/* Letterhead — mirrors word/header1.xml */}
      <div style={{ textAlign: 'center', borderBottom: '2px solid #222', paddingBottom: '0.8rem', marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.95rem' }}>الأستاذ</div>
        <div style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0.15rem 0' }}>{val(profile.officeName, 'اسم العدل المنفذ')}</div>
        <div style={{ fontSize: '0.95rem' }}>العدل المنفذ ب{ph(profile.officeCity, '…')}</div>
        <div style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>{val(profile.officeAddress, 'العنوان')}</div>
        <div style={{ fontSize: '0.85rem' }}>
          الهاتف : {val(profile.officePhone, '—')} &nbsp;–&nbsp; الفاكس : {val(profile.officeFax, '—')}
        </div>
        <div style={{ fontSize: '0.85rem' }}>المعرف الجبائي : {val(profile.taxId, '—')}</div>
      </div>

      {/* Act opening — mirrors the body of template_cnss.docx */}
      <h3 style={{ textAlign: 'center', margin: '0.5rem 0 1rem' }}>محضر إعلام بطـــــاقـــة جــــبـــــر</h3>
      <p style={{ margin: '0 0 0.8rem' }}>
        وبطلب من الصندوق الوطني للضمان الإجتماعي … بواسطة مكتبه الجهوي{' '}
        <b>{ph(profile.cnssBureau, '………')}</b>.
      </p>
      <p style={{ margin: '0 0 0.8rem', textAlign: 'center', fontWeight: 700 }}>
        نحن الأستاذ {ph(profile.officeName, '………')} العدل المنفذ<br />
        بالدائرة القضائية {ph(profile.officeJurisdiction, '………')}<br />
        عنواني {ph(profile.officeAddress, '………')} والممضي أسفله
      </p>
      <p style={{ margin: '0 0 0.8rem' }}>
        … التي قررها وصيرها نافذة المفعول عن الوالي وبتفويض منه المدير الجهوي للشؤون الإجتماعية{' '}
        <b>{ph(profile.cnssRegion, '………')}</b> كالتالي :
      </p>

      {/* Sample card table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'center' }}>
        <thead>
          <tr>{['عدد البطاقة', 'الثلاثية', 'أصل الدين', 'الخطية', 'تاريخ احتساب الخطايا'].map((h) => (
            <th key={h} style={{ border: '1px solid #888', padding: '0.3rem' }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          <tr>{['4621400216', '04/2025', '2959.306', '1.5 %', '16/01/2026'].map((c, i) => (
            <td key={i} style={{ border: '1px solid #888', padding: '0.3rem' }}>{c}</td>
          ))}</tr>
        </tbody>
      </table>
      <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.85rem' }}>العـــــــــدل المنــــفــــــــــــــذ</div>
    </div>
  );
}
