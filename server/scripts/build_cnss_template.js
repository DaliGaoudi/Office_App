/*
 * One-time build step: convert the human-authored Word mail-merge template
 * (Assets/template.docx, which uses «MERGEFIELD» codes) into a docxtemplater
 * template (server/assets/template_cnss.docx, which uses {tag} placeholders).
 *
 * Each MERGEFIELD complex field becomes a single clean run holding {tag}, keeping
 * the field's character formatting (bold/underline/font) but dropping the yellow
 * "fill-here" highlight. The whole body is wrapped in an {#acts}…{/acts} loop so a
 * single template renders either one act (array of 1) or every card (array of N),
 * one per page — the in-app equivalent of Word's publipostage.
 *
 * Re-run after editing Assets/template.docx:  node scripts/build_cnss_template.js
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const SRC = path.join(__dirname, '..', '..', 'Assets', 'template.docx');
const OUT_DIR = path.join(__dirname, '..', 'assets');
const OUT = path.join(OUT_DIR, 'template_cnss.docx');

// Arabic MERGEFIELD name → ASCII docxtemplater tag.
const FIELD_MAP = {
    'عدد_الملف': 'num_dossier',
    'رمز_الإنخراط': 'code_inscription',
    'عدد_الإنخراط_بالصندوق': 'num_affiliation',
    'إسم_المطلوب': 'nom_matloub',
    'العنوان': 'adresse',
    'تاريخ_بطاقة_الجبر': 'date_carte',
    'عدد_بطاقة_الجبر': 'num_carte',
    'الثلاثية': 'trimestre',
    'المبلغ': 'montant',
    'تاريخ_احتساب_الخطايا': 'date_penalite',
};

function convert(xml) {
    // Index every run-element start so we can find the run that opens a field.
    const runStarts = [];
    for (const m of xml.matchAll(/<w:r(?:\s[^>]*)?>/g)) runStarts.push(m.index);

    // Collect each complex MERGEFIELD region: [runStart(before begin) .. </w:r>(after end)].
    const regions = [];
    for (const m of xml.matchAll(/fldCharType="begin"/g)) {
        const begin = m.index;
        const start = runStarts.filter(p => p < begin).pop();
        let end = xml.indexOf('fldCharType="end"', begin);
        end = xml.indexOf('</w:r>', end) + '</w:r>'.length;
        regions.push({ start, end });
    }

    // Replace from the back so earlier indices stay valid.
    let unknown = [];
    for (const { start, end } of regions.reverse()) {
        const region = xml.slice(start, end);
        const instr = (region.match(/<w:instrText[^>]*>([\s\S]*?)<\/w:instrText>/g) || [])
            .map(s => s.replace(/<[^>]+>/g, '')).join('');
        const nameM = instr.match(/MERGEFIELD\s+"?([^"\s]+)"?/);
        const name = nameM && nameM[1];
        const tag = name && FIELD_MAP[name];
        if (!tag) { unknown.push(name || '??'); continue; }

        // Reuse the display run's formatting, minus the yellow highlight.
        const rprM = region.match(/<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*?<\/w:rPr>(?=\s*<w:t[^>]*>«)/);
        const rpr = (rprM ? rprM[0] : '').replace(/<w:highlight[^>]*\/>/g, '');

        const replacement = `<w:r>${rpr}<w:t xml:space="preserve">{${tag}}</w:t></w:r>`;
        xml = xml.slice(0, start) + replacement + xml.slice(end);
    }
    if (unknown.length) throw new Error('Unmapped MERGEFIELD(s): ' + unknown.join(', '));

    // Wrap the body in an {#acts}…{/acts} loop, with a page break per iteration.
    const openLoop = '<w:p><w:r><w:t xml:space="preserve">{#acts}</w:t></w:r></w:p>';
    const closeLoop = '<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t xml:space="preserve">{/acts}</w:t></w:r></w:p>';

    xml = xml.replace(/(<w:body[^>]*>)/, `$1${openLoop}`);
    const sect = xml.lastIndexOf('<w:sectPr');
    if (sect === -1) throw new Error('No final <w:sectPr> found to anchor the loop.');
    xml = xml.slice(0, sect) + closeLoop + xml.slice(sect);

    return xml;
}

const zip = new PizZip(fs.readFileSync(SRC));
const out = convert(zip.file('word/document.xml').asText());
zip.file('word/document.xml', out);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, zip.generate({ type: 'nodebuffer' }));
console.log('Wrote', OUT);
