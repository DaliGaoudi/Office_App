/*
 * Add the office letterhead (name AR/FR, phone, fax, MF, RIB, CNSS) to the top of
 * the CNSS monthly-list template. The fields are {office_*} merge tags filled from
 * the editable office profile (Settings → services/officeProfile.js).
 *
 * Idempotent: a no-op if the header is already present. Run once after deploying
 * the office-profile feature, or whenever template_list.docx is regenerated:
 *   node scripts/add_office_header_to_list_template.js
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const TEMPLATE = path.join(__dirname, '..', 'assets', 'template_list.docx');

// One RTL Arabic paragraph (centered) holding `text`. sz is in half-points.
const arPara = (text, sz, bold) => {
    const rpr = `<w:rFonts w:hint="cs"/>${bold ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:rtl/>`;
    return `<w:p><w:pPr><w:bidi/><w:jc w:val="center"/><w:rPr>${rpr}</w:rPr></w:pPr>`
        + `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
};
// A centered LTR paragraph (for the Latin/French name).
const ltrPara = (text, sz) =>
    `<w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:pPr>`
    + `<w:r><w:rPr><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const HEADER =
    arPara('الأستاذ {office_name}', 28, true)
    + ltrPara('{office_name_fr}', 22)
    + arPara('الهاتف : {office_phone}   -   الفاكس : {office_fax}', 18)
    + arPara('المعرّف الجبائي : {office_tax_id}   -   الحساب البنكي : {office_rib}   -   معرّف الصندوق : {office_cnss}', 18);

function addOfficeHeader() {
    const zip = new PizZip(fs.readFileSync(TEMPLATE));
    let xml = zip.file('word/document.xml').asText();

    if (xml.includes('{office_name}')) {
        console.log('Office header already present — nothing to do.');
        return false;
    }

    const m = xml.match(/<w:body[^>]*>/);
    if (!m) throw new Error('No <w:body> found in template_list.docx.');
    const at = m.index + m[0].length;
    xml = xml.slice(0, at) + HEADER + xml.slice(at);

    zip.file('word/document.xml', xml);
    fs.writeFileSync(TEMPLATE, zip.generate({ type: 'nodebuffer' }));
    console.log('Office header added to', TEMPLATE);
    return true;
}

module.exports = { addOfficeHeader };

if (require.main === module) addOfficeHeader();
