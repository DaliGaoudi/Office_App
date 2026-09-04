/*
 * verify_act_render.js — prove a محضر إعلام بطاقة جبر renders correctly for an
 * office that is NOT the one the template was authored for.
 *
 * This is the check that matters for distributing the app: it fails loudly if the
 * template ever regains hardcoded office identity, or if an {office_*} tag stops
 * being merged. Runs entirely offline — no database, no network.
 *
 *   node server/scripts/verify_act_render.js [--out <file.docx>]
 *
 * Exit code 0 = the act carries the fictitious office and nothing was left unmerged.
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const { renderActs, buildActRecord } = require('../routes/cnss');

// A deliberately distinctive office — none of these strings appear in the template.
const OFFICE = {
    office_name: 'سعاد بن عمار',
    office_name_fr: 'Souad Ben Ammar',
    office_city: 'صفاقس',
    office_phone: '74 111 222',
    office_fax: '74 111 223',
    office_tax_id: '9998887/X/M/000',
    office_rib: '11 222 3333333333333 44',
    office_cnss: '778899',
    office_address: 'نهج الحبيب ثامر ، عمارة النور ، مكتب ب 7 ، صفاقس',
    office_jurisdiction: 'لمحكمة الإستئناف بصفاقس',
    cnss_bureau: 'بصفاقس الكائن بشارع علي البلهوان بصفاقس',
    cnss_region: 'بصفاقس',
};

const COMPANY = {
    nom_cl2: 'شركة الأمل للصناعات',
    numcnss: '123456-78',
    codeng: 'ENG-42',
    cl2_adresse: 'المنطقة الصناعية',
    cl2_adresse2: 'صفاقس',
};

const CARD = {
    nbrreg: '2026/117',
    numcarte: 'BJ-9931',
    datecarte: '12/03/2026',
    semestre: '04/2025',
    dette: '4520.750',
    datesins: '16/01/2026',
};

const textOfDocx = (buf) => {
    const zip = new PizZip(buf);
    return Object.keys(zip.files)
        .filter((f) => /^word\/(document|footer\d*|header\d*)\.xml$/.test(f))
        .map((f) => zip.file(f).asText())
        .join('\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
};

function main() {
    const outArgIdx = process.argv.indexOf('--out');
    const outPath = outArgIdx !== -1 ? process.argv[outArgIdx + 1] : null;

    const buf = renderActs([buildActRecord(COMPANY, CARD)], OFFICE);
    const text = textOfDocx(buf);

    const failures = [];

    // 1. Every office value the act should carry is actually on the page.
    const mustAppear = [
        ['office_name', OFFICE.office_name],
        ['office_address', OFFICE.office_address],
        ['office_jurisdiction', OFFICE.office_jurisdiction],
        ['cnss_bureau', OFFICE.cnss_bureau],
        ['cnss_region', OFFICE.cnss_region],
    ];
    for (const [key, value] of mustAppear) {
        if (!text.includes(value)) failures.push(`${key}: "${value}" is missing from the rendered act`);
    }

    // 2. The original office must be gone — this is the regression that would put
    //    one client's name on another client's legal document.
    for (const ghost of ['مراد القعودي', 'عمارة قلولو', 'محمد معروف']) {
        if (text.includes(ghost)) failures.push(`hardcoded identity "${ghost}" is still in the template`);
    }

    // 3. The year must be spelled, not left as a tag or stuck at 2026.
    const { yearInArabicWords } = require('../services/numberToArabicWords');
    const expectedYear = yearInArabicWords(new Date().getFullYear());
    if (!text.includes(expectedYear)) failures.push(`year "${expectedYear}" is missing from the rendered act`);

    // 4. Nothing left unmerged.
    const leftover = [...new Set((text.match(/\{[a-z_#/][a-z_]*\}/gi) || []))];
    if (leftover.length) failures.push(`unmerged tags remain: ${leftover.join(', ')}`);

    // 5. The card data still merges (guards against breaking the act while fixing it).
    for (const [key, value] of [['num_carte', CARD.numcarte], ['nom_matloub', COMPANY.nom_cl2]]) {
        if (!text.includes(value)) failures.push(`${key}: "${value}" is missing — act data no longer merges`);
    }

    if (outPath) { fs.writeFileSync(outPath, buf); console.log(`  wrote ${path.resolve(outPath)}`); }

    if (failures.length) {
        console.error('\n✗ Act render verification FAILED:');
        failures.forEach((f) => console.error(`    - ${f}`));
        process.exit(1);
    }

    console.log('\n✓ Act renders correctly for a different office.');
    console.log(`    office     : ${OFFICE.office_name} — ${OFFICE.office_city}`);
    console.log(`    circuit    : ${OFFICE.office_jurisdiction}`);
    console.log(`    year       : ${expectedYear}`);
    console.log(`    no leftover tags, no trace of the original office.\n`);
}

main();
