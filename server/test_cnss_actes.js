/*
 * Run: node server/test_cnss_actes.js  (no database, no network)
 *
 * The rules for grouping بطاقات جبر into one محضر (services/cnssActes.js), and the
 * render of a several-card محضر against the real template.
 */
const assert = require('assert');
const PizZip = require('pizzip');
const { checkGrouping, buildActRecord } = require('./services/cnssActes');
const { renderActs } = require('./routes/cnss');

const card = (id, over = {}) => ({
    id_cn_oe: id, numcarte: `C${id}`, semestre: '01/2026', dette: '100.000', datesins: '16/04/2026',
    datecarte: '01/03/2026', nbrreg: '12/2026', date_tabligh: '', id_acte: null, ...over,
});

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

console.log('checkGrouping');

test('free cards that agree → a new محضر, nothing to warn about', () => {
    const r = checkGrouping([card(1), card(2)], [], {});
    assert.deepStrictEqual(r, { mismatches: [], conflicts: [], dateCarteValues: ['01/03/2026'], reprintActeId: null });
});

test('different عدد التضمين is a blocking mismatch', () => {
    const r = checkGrouping([card(1), card(2, { nbrreg: '13/2026' })], [], {});
    assert.strictEqual(r.mismatches.length, 1);
    assert.strictEqual(r.mismatches[0].field, 'nbrreg');
    assert.deepStrictEqual(r.mismatches[0].values, ['12/2026', '13/2026']);
});

test('a blank عدد التضمين does not match a filled one', () => {
    const r = checkGrouping([card(1), card(2, { nbrreg: '' })], [], {});
    assert.strictEqual(r.mismatches[0].field, 'nbrreg');
});

test('different تاريخ التبليغ is a blocking mismatch; spelling of the same day is not', () => {
    const differ = checkGrouping([card(1, { date_tabligh: '2026-05-01' }), card(2, { date_tabligh: '2026-05-02' })], [], {});
    assert.strictEqual(differ.mismatches[0].field, 'date_tabligh');
    const same = checkGrouping([card(1, { date_tabligh: '2026-05-01' }), card(2, { date_tabligh: '01/05/2026' })], [], {});
    assert.strictEqual(same.mismatches.length, 0);
});

test('different تاريخ بطاقة الجبر only warns', () => {
    const r = checkGrouping([card(1), card(2, { datecarte: '02/03/2026' })], [], {});
    assert.strictEqual(r.mismatches.length, 0);
    assert.deepStrictEqual(r.dateCarteValues, ['01/03/2026', '02/03/2026']);
});

test('exactly the cards of one existing محضر → reprint it', () => {
    const a = card(1, { id_acte: 7 }), b = card(2, { id_acte: 7 });
    const r = checkGrouping([a, b], [a, b], { 7: { id_acte: 7, numero: 1 } });
    assert.strictEqual(r.reprintActeId, 7);
    assert.strictEqual(r.conflicts.length, 0);
});

test('part of an existing محضر → conflict saying what moves and what stays', () => {
    const a = card(1, { id_acte: 7 }), b = card(2, { id_acte: 7 }), c = card(3);
    const r = checkGrouping([a, c], [a, b], { 7: { id_acte: 7, numero: 1, date_ajout: 'x' } });
    assert.strictEqual(r.reprintActeId, null);
    assert.deepStrictEqual(r.conflicts, [{ id_acte: 7, numero: 1, date_ajout: 'x', moving: ['C1'], remaining: 1 }]);
});

test('subset of one محضر is a conflict, not a reprint', () => {
    const a = card(1, { id_acte: 7 }), b = card(2, { id_acte: 7 });
    const r = checkGrouping([a], [a, b], { 7: { id_acte: 7, numero: 1 } });
    assert.strictEqual(r.reprintActeId, null);
    assert.strictEqual(r.conflicts[0].remaining, 1);
});

test('a card pointing at a vanished محضر counts as free', () => {
    const r = checkGrouping([card(1, { id_acte: 99 })], [card(1, { id_acte: 99 })], {});
    assert.strictEqual(r.conflicts.length, 0);
    assert.strictEqual(r.reprintActeId, null);
});

console.log('buildActRecord');

test('one row per card, fees summed, shared fields printed once', () => {
    const company = { nom_cl2: 'شركة', numcnss: '1', codeng: '2' };
    const rec = buildActRecord(company, [
        card(1, { fee_original: '30000', fee_post: '200', vat_rate: '19' }),
        card(2, { fee_original: '10000', fee_post: '300', vat_rate: '19', datecarte: '02/03/2026' }),
    ]);
    assert.deepStrictEqual(rec.cards.map((r) => r.num_carte), ['C1', 'C2']);
    assert.strictEqual(rec.num_dossier, '12/2026');
    assert.strictEqual(rec.date_carte, '01/03/2026 و 02/03/2026');
    assert.strictEqual(rec.fee_original, '40,000');
    assert.strictEqual(rec.fee_post, '0,500');
    assert.strictEqual(rec.fee_aqm, '7,600');               // 19% of 40 000 millimes
    assert.strictEqual(rec.fee_total, '48,100');
});

test('a single card still works (old call shape)', () => {
    const rec = buildActRecord({}, card(1));
    assert.strictEqual(rec.cards.length, 1);
    assert.strictEqual(rec.num_carte, 'C1');
});

console.log('render');

test('a two-card محضر renders both rows in one act, no tags left', () => {
    const buf = renderActs([buildActRecord({ nom_cl2: 'شركة' }, [card(1), card(2)])], {});
    const text = new PizZip(buf).file('word/document.xml').asText().replace(/<[^>]+>/g, '');
    assert.ok(text.includes('C1') && text.includes('C2'), 'both card numbers present');
    assert.strictEqual(text.split('محضر إعلام').length - 1, 1, 'exactly one act');
    assert.deepStrictEqual(text.match(/\{[#/]?[a-z_]+\}/g), null, 'no unmerged tags');
});

test('two محاضر in one document stay two acts', () => {
    const buf = renderActs([buildActRecord({}, [card(1), card(2)]), buildActRecord({}, [card(3)])], {});
    const text = new PizZip(buf).file('word/document.xml').asText().replace(/<[^>]+>/g, '');
    assert.strictEqual(text.split('محضر إعلام').length - 1, 2);
    assert.ok(['C1', 'C2', 'C3'].every((n) => text.includes(n)));
});

console.log(`\n${passed} passed.`);
