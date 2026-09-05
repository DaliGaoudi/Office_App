/*
 * One-off migration: give the CNSS tables working auto-increment primary keys.
 *
 * The `cnss` and `cnss_oeuvre` tables were ported without a DEFAULT on their id
 * columns (and cnss_oeuvre had no sequence at all), so every INSERT produced a
 * NULL primary key and `RETURNING id_cn` came back null — cards could never link
 * to their company. Both tables are empty, so this is safe to seed from 1.
 *
 * Idempotent: re-running it is a no-op (statements that would clash are caught).
 */
require('dotenv').config();
const db = require('../db');

async function step(label, sql) {
    try {
        await db.run(sql);
        console.log('  ok   :', label);
    } catch (e) {
        console.log('  skip :', label, '->', e.message);
    }
}

(async () => {
    console.log('Fixing cnss.id_cn (sequence cnss_id_cn_seq already exists)…');
    await step('cnss.id_cn DEFAULT', "ALTER TABLE cnss ALTER COLUMN id_cn SET DEFAULT nextval('cnss_id_cn_seq')");
    await step('cnss_id_cn_seq seed', "SELECT setval('cnss_id_cn_seq', (SELECT COALESCE(MAX(id_cn), 0) FROM cnss) + 1, false)");
    await step('cnss PRIMARY KEY', "ALTER TABLE cnss ADD PRIMARY KEY (id_cn)");

    console.log('Fixing cnss_oeuvre.id_cn_oe (creating its sequence)…');
    await step('create cnss_oeuvre_id_cn_oe_seq', "CREATE SEQUENCE IF NOT EXISTS cnss_oeuvre_id_cn_oe_seq");
    await step('cnss_oeuvre.id_cn_oe DEFAULT', "ALTER TABLE cnss_oeuvre ALTER COLUMN id_cn_oe SET DEFAULT nextval('cnss_oeuvre_id_cn_oe_seq')");
    await step('cnss_oeuvre_id_cn_oe_seq seed', "SELECT setval('cnss_oeuvre_id_cn_oe_seq', (SELECT COALESCE(MAX(id_cn_oe), 0) FROM cnss_oeuvre) + 1, false)");
    await step('cnss_oeuvre PRIMARY KEY', "ALTER TABLE cnss_oeuvre ADD PRIMARY KEY (id_cn_oe)");

    console.log('Done.');
    process.exit(0);
})();
