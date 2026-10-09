/*
 * Rendering «محضر إعلام بطاقة جبر» Word documents from template_cnss.docx.
 *
 * Moved out of routes/cnss.js, which builds the act records (services/cnssActes.js)
 * and calls renderActs(). This file only knows docx: the {#acts} loop, one page
 * and one fee-table footer per act.
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { yearInArabicWords } = require('./numberToArabicWords');

// ───────── "محضر إعلام بطاقة جبر" generation (publipostage replacement) ─────────
// Built once from Assets/template.docx by scripts/build_cnss_template.js.
const TEMPLATE_PATH = path.join(__dirname, '..', 'assets', 'template_cnss.docx');

// The acts loop ends with this paragraph so each محضر starts on a fresh page. The
// render converts each one into a section break (see perActFooters).
const PAGE_BREAK_P = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

// A valid but empty footer, used to park the footer part while docxtemplater runs
// so it never sees (and blanks out) the {fee_*} tags we fill per act ourselves.
const EMPTY_FOOTER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
    + '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:p><w:pPr><w:pStyle w:val="Pieddepage"/></w:pPr></w:p></w:ftr>';

const FOOTER_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml';
const FOOTER_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';

const xmlEscape = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Fill one act's amounts into a copy of the tagged fee-table footer. Any tag the
// act doesn't carry resolves to '' — same contract as docxtemplater's nullGetter.
const fillFooter = (footerXml, act) =>
    footerXml.replace(/\{([a-z_]+)\}/g, (_, key) => xmlEscape(act[key]));

/*
 * Give every محضر its own section, so every محضر gets its own footer.
 *
 * A footer is the only thing Word pins to the bottom of the page, but footers
 * belong to a SECTION — one shared footer would print the first act's fees under
 * every act. So: turn each inter-act page break into a section break, and hand
 * each section a generated footer part holding that act's amounts.
 *
 * Returns false (leaving the document untouched) if the template doesn't have the
 * shape we expect.
 */
function perActFooters(zip, acts, footerTpl) {
    const docPart = zip.file('word/document.xml');
    const relsPart = zip.file('word/_rels/document.xml.rels');
    const ctPart = zip.file('[Content_Types].xml');
    if (!docPart || !relsPart || !ctPart || !footerTpl) return false;

    let xml = docPart.asText();
    let rels = relsPart.asText();
    let ct = ctPart.asText();

    // The body-level sectPr is the LAST one; it defines the final section.
    const sectStart = xml.lastIndexOf('<w:sectPr');
    const sectEnd = xml.indexOf('</w:sectPr>', sectStart);
    if (sectStart === -1 || sectEnd === -1) return false;
    const bodySect = xml.slice(sectStart, sectEnd + '</w:sectPr>'.length);

    let nextRel = Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1]));
    let nextFooter = Math.max(0, ...Object.keys(zip.files)
        .map((f) => /^word\/footer(\d+)\.xml$/.exec(f)).filter(Boolean).map((m) => +m[1]));

    const footerRelIds = acts.map((act) => {
        const relId = `rId${++nextRel}`;
        const name = `footer${++nextFooter}.xml`;
        zip.file(`word/${name}`, fillFooter(footerTpl, act));
        rels = rels.replace('</Relationships>',
            `<Relationship Id="${relId}" Type="${FOOTER_REL}" Target="${name}"/></Relationships>`);
        ct = ct.replace('</Types>',
            `<Override PartName="/word/${name}" ContentType="${FOOTER_CT}"/></Types>`);
        return relId;
    });

    // A section's own sectPr, cloned from the body one with its footer swapped.
    // CT_SectPr order: header/footerReference first, then type, then pgSz/pgMar…
    const sectionFor = (relId) => bodySect
        .replace(/<w:footerReference\b[^>]*\/>/g, '')
        .replace(/(<w:headerReference\b[^>]*\/>)/, `$1<w:footerReference w:type="default" r:id="${relId}"/>`)
        .replace(/(<w:footerReference\b[^>]*\/>)/, '$1<w:type w:val="nextPage"/>');

    // Each inter-act page break becomes a section break carrying that act's footer.
    // The final act needs no break — the body-level sectPr closes it.
    let i = -1;
    xml = xml.split(PAGE_BREAK_P).reduce((acc, chunk, idx, parts) => {
        if (idx === parts.length - 1) return acc + chunk;
        i += 1;
        const brk = i < footerRelIds.length - 1
            ? `<w:p><w:pPr>${sectionFor(footerRelIds[i])}</w:pPr></w:p>`
            : ''; // trailing break after the last act — drop it entirely
        return acc + chunk + brk;
    }, '');

    // The last section is the body-level sectPr; point it at the last act's footer.
    xml = xml.slice(0, xml.lastIndexOf('<w:sectPr'))
        + sectionFor(footerRelIds[footerRelIds.length - 1]).replace('<w:type w:val="nextPage"/>', '')
        + xml.slice(xml.indexOf('</w:sectPr>', xml.lastIndexOf('<w:sectPr')) + '</w:sectPr>'.length);

    zip.file('word/document.xml', xml);
    zip.file('word/_rels/document.xml.rels', rels);
    zip.file('[Content_Types].xml', ct);
    return true;
}

/*
 * Render one Word document containing `acts` (1 → single act, N → one per page).
 *
 * `office` carries the letterhead identity printed in the body of every محضر —
 * the bailiff's name, address, judicial circuit and the CNSS regional bureau. These
 * were once hardcoded in the template; they are merge tags now, so each deployment
 * prints its own office (see services/officeProfile.js). Those tags appear both
 * inside the {#acts} loop and in the letterhead header, so the office is supplied
 * at both scopes below.
 *
 * nullGetter keeps any unfilled tag (e.g. a blank fee cell) from throwing.
 */
const renderActs = (records, office = {}) => {
    const yearWords = yearInArabicWords(new Date().getFullYear());
    // Act fields win over office fields, so a future per-act override stays possible.
    const acts = records.map((act) => ({ ...office, year_words: yearWords, ...act }));

    const zip = new PizZip(fs.readFileSync(TEMPLATE_PATH));

    // Park the tagged fee-table footer so docxtemplater doesn't blank its {fee_*}
    // tags; each act gets its own filled copy afterwards.
    const footerName = Object.keys(zip.files).find((f) => /^word\/footer\d*\.xml$/.test(f));
    const footerTpl = footerName ? zip.file(footerName).asText() : null;
    if (footerName) zip.file(footerName, EMPTY_FOOTER);

    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
    // The office also goes in at root scope: the letterhead's {office_*} tags live in
    // the header, which is outside the {#acts} loop and so can't see per-act values.
    doc.render({ acts, ...office, year_words: yearWords });

    const out = doc.getZip();
    if (!perActFooters(out, acts, footerTpl)) {
        // Unrecognised template: fall back to just dropping the trailing break.
        const xml = out.file('word/document.xml').asText();
        const last = xml.lastIndexOf(PAGE_BREAK_P);
        if (last !== -1) out.file('word/document.xml', xml.slice(0, last) + xml.slice(last + PAGE_BREAK_P.length));
        if (footerName) out.file(footerName, footerTpl.replace(/\{[a-z_]+\}/g, ''));
    }
    return out.generate({ type: 'nodebuffer' });
};

module.exports = { renderActs };
