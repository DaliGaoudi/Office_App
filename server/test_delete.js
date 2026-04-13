require('dotenv').config();
const db = require('./db');

async function test() {
    const row = await db.get('SELECT * FROM clients_record LIMIT 1 OFFSET 10');
    console.log('Deleting row:', row.id_r);
    const id = row.id_r.toString();
    
    // Simulate DELETE route logic
    const r1 = await db.run('DELETE FROM "œuvre_type" WHERE id_o::text = ? AND id_so::text = ?', [id, '35']);
    console.log('Delete oeuvre:', r1);
    
    const r2 = await db.run('DELETE FROM clients_record WHERE id_r::text = ? AND id_so::text = ?', [id, '35']);
    console.log('Delete clients:', r2);
}

test().catch(console.error);
