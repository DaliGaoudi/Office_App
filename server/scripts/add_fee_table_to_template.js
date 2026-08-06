/*
 * Tag the per-act fee statement (أتعاب) table in the CNSS act template.
 *
 * The table lives in the page FOOTER, where the authored source (Assets/template.docx)
 * already puts it — a footer is the only thing Word pins to the bottom of the page.
 * In the body it would just trail the act's text and sit mid-page, and a floating
 * table (tblpPr) wrecks pagination outright. This script only swaps the source's
 * hard-coded amounts for {fee_*} merge tags; it does not move the table.
 *
 * A footer belongs to a SECTION, so one shared footer would print the first act's
 * fees under every act. That is solved at render time: routes/cnss.js gives each
 * محضر its own section with its own filled copy of this footer.
 *
 * If the source footer has no table (a template from elsewhere), the self-contained
 * fallback in assets/cnss_fee_table.fragment.xml is inserted instead.
 *
 * Idempotent. Run after build_cnss_template.js (which also calls it as a module):
 *   node scripts/add_fee_table_to_template.js
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const TEMPLATE = path.join(__dirname, '..', 'assets', 'template_cnss.docx');
const FRAGMENT = path.join(__dirname, '..', 'assets', 'cnss_fee_table.fragment.xml');

// Value-row cell (column) index → merge field, right-to-left across the table.
const FEE_TAGS = [
    '{fee_total}',        // 0  المجموع (auto-summed)
    '{fee_post}',         // 1  البريد
    '{fee_stamp}',        // 2  الترسيم
    '{fee_registration}', // 3  التسجيل
    '{fee_travel}',       // 4  التنقل
    '{fee_aqm}',          // 5  أ ق م
    '{fee_copies}',       // 6  نسخ الأوراق
    '{fee_movement}',     // 7  التوجه
    '{fee_office_copy}',  // 8  النسخة المكتبية
    '{fee_legal_copy}',   // 9  النسخة القانونية
    '{fee_counterparts}', // 10 النظائر
    '{fee_original}',     // 11 أصل المحضر
];

const WT = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/;

function fillCell(cellInner, tag) {
    if (WT.test(cellInner)) {
        return cellInner.replace(/(<w:t(?:\s[^>]*)?>)[\s\S]*?(<\/w:t>)/, `$1${tag}$2`);
    }
    // Empty cell → inject a centred RTL run before the paragraph close.
    const run = `<w:r><w:rPr><w:rFonts w:hint="cs"/><w:rtl/></w:rPr><w:t>${tag}</w:t></w:r>`;
    return cellInner.replace('</w:p>', run + '</w:p>');
}

// Replace the value row's cell contents with the {fee_*} tags.
function tagFeeTable(tblXml) {
    const rows = tblXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g); // [headerRow, valueRow]
    if (!rows || rows.length < 2) throw new Error('Fee table does not have the expected 2 rows.');
    const valueRow = rows[1];
    let ci = -1;
    const newValueRow = valueRow.replace(/<w:tc>([\s\S]*?)<\/w:tc>/g, (full, inner) => {
        ci += 1;
        return '<w:tc>' + fillCell(inner, FEE_TAGS[ci] || '') + '</w:tc>';
    });
    return tblXml.replace(valueRow, newValueRow);
}

function addFeeTable() {
    const zip = new PizZip(fs.readFileSync(TEMPLATE));

    const footerName = Object.keys(zip.files).find((f) => /^word\/footer\d*\.xml$/.test(f));
    if (!footerName) throw new Error('Template has no footer part to hold the fee table.');
    let footer = zip.file(footerName).asText();

    if (footer.includes('{fee_total}')) {
        console.log('Fee table already tagged — nothing to do.');
        return false;
    }

    const s = footer.indexOf('<w:tbl>');
    if (s !== -1) {
        const e = footer.indexOf('</w:tbl>', s) + '</w:tbl>'.length;
        footer = footer.slice(0, s) + tagFeeTable(footer.slice(s, e)) + footer.slice(e);
        console.log('Tagged the fee table in', footerName);
    } else {
        const fragment = fs.readFileSync(FRAGMENT, 'utf-8').trim();
        footer = footer.replace('</w:ftr>', fragment + '</w:ftr>');
        console.log('No table in', footerName, '— inserted the fallback fragment.');
    }

    zip.file(footerName, footer);

    // The body must NOT also carry a fee table (an older build spliced one in).
    let doc = zip.file('word/document.xml').asText();
    const bs = doc.indexOf('{fee_total}');
    if (bs !== -1) {
        const ts = doc.lastIndexOf('<w:tbl>', bs);
        const te = doc.indexOf('</w:tbl>', bs) + '</w:tbl>'.length;
        doc = doc.slice(0, ts) + doc.slice(te);
        zip.file('word/document.xml', doc);
        console.log('Removed the stale fee table from the act body.');
    }

    fs.writeFileSync(TEMPLATE, zip.generate({ type: 'nodebuffer' }));
    console.log('Fee table ready in', TEMPLATE);
    return true;
}

module.exports = { addFeeTable };

if (require.main === module) addFeeTable();
