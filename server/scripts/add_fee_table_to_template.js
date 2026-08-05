/*
 * Splice the per-act fee statement (أتعاب) table into the CNSS act template.
 *
 * The mail-merge source (Assets/template.docx → build_cnss_template.js) has no fee
 * table, so we inject one extracted from the same template family. The fragment is
 * a self-contained <w:tbl> holding the 12 {fee_*} tags (assets/cnss_fee_table.fragment.xml).
 * It is placed at the end of each act — inside the {#acts} loop, just before the
 * page break + {/acts} — so the webapp's hard-coded letterhead is left untouched.
 *
 * Idempotent: a no-op if the template already contains the fee table.
 * Run after build_cnss_template.js (which it also calls when used as a module):
 *   node scripts/add_fee_table_to_template.js
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const TEMPLATE = path.join(__dirname, '..', 'assets', 'template_cnss.docx');
const FRAGMENT = path.join(__dirname, '..', 'assets', 'cnss_fee_table.fragment.xml');

// The {#acts} loop close emitted by build_cnss_template.js: a page-break paragraph
// followed by the {/acts} paragraph. We insert the fee table right before it.
const CLOSE_LOOP = '<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t xml:space="preserve">{/acts}</w:t></w:r></w:p>';

// The authored source also keeps a copy of the fee table in the page FOOTER, with
// the original author's amounts typed in as literal text and no merge tags. Word
// repeats a footer on every page, so that stale table printed under every act
// alongside the real one. The tagged copy in the body replaces it entirely.
//
// Only untagged tables are removed, so a correctly tagged table is never touched.
function stripFooterFeeTable(zip) {
    let removed = false;
    Object.keys(zip.files)
        .filter((f) => /^word\/footer\d*\.xml$/.test(f))
        .forEach((f) => {
            let xml = zip.file(f).asText();
            const s = xml.indexOf('<w:tbl>');
            if (s === -1) return;
            const e = xml.indexOf('</w:tbl>', s) + '</w:tbl>'.length;
            if (xml.slice(s, e).includes('{fee_')) return;

            xml = xml.slice(0, s) + xml.slice(e);
            // A footer must still hold at least one block-level element.
            if (!xml.includes('<w:p')) {
                xml = xml.replace('</w:ftr>', '<w:p><w:pPr><w:pStyle w:val="Pieddepage"/></w:pPr></w:p></w:ftr>');
            }
            zip.file(f, xml);
            removed = true;
            console.log('Removed the stale hard-coded fee table from', f);
        });
    return removed;
}

function addFeeTable() {
    const zip = new PizZip(fs.readFileSync(TEMPLATE));
    let xml = zip.file('word/document.xml').asText();

    const footerCleaned = stripFooterFeeTable(zip);

    if (xml.includes('{fee_total}')) {
        // Body table already spliced; still persist any footer cleanup.
        if (footerCleaned) {
            fs.writeFileSync(TEMPLATE, zip.generate({ type: 'nodebuffer' }));
            return true;
        }
        console.log('Fee table already present — nothing to do.');
        return false;
    }

    const fragment = fs.readFileSync(FRAGMENT, 'utf-8').trim();

    if (xml.includes(CLOSE_LOOP)) {
        xml = xml.replace(CLOSE_LOOP, fragment + CLOSE_LOOP);
    } else {
        // Fallback: drop it just before the final section properties.
        const sect = xml.lastIndexOf('<w:sectPr');
        if (sect === -1) throw new Error('Could not find the {/acts} close or a final <w:sectPr> to anchor the fee table.');
        xml = xml.slice(0, sect) + fragment + xml.slice(sect);
    }

    zip.file('word/document.xml', xml);
    fs.writeFileSync(TEMPLATE, zip.generate({ type: 'nodebuffer' }));
    console.log('Fee table spliced into', TEMPLATE);
    return true;
}

module.exports = { addFeeTable };

if (require.main === module) addFeeTable();
