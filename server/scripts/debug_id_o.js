const db = require('./db');

async function run() {
    try {
        const rows = await db.all('SELECT id_o FROM "œuvre_type" WHERE id_o IS NOT NULL LIMIT 50');
        console.log('Sample id_o values:', rows.map(r => r.id_o));
    } catch (e) {
        console.error(e);
    }
}

run();
