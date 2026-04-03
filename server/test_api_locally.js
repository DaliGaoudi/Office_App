require('dotenv').config();
const db = require('./db');

async function test() {
    console.log("Testing API Query Locally against Postgres...");
    
    const id_so = '35';
    const limit = 25;
    const offset = 0;

    try {
        console.log("1. Testing General Register List...");
        const query = `SELECT * FROM clients_record WHERE id_so = ? ORDER BY id_r DESC LIMIT ? OFFSET ?`;
        const params = [id_so, limit, offset];
        const rows = await db.all(query, params);
        console.log(`Success! Found ${rows.length} rows.`);

        console.log("2. Testing Execution Register List...");
        const ws = ["c.id_so = ?"];
        const ps = [id_so];
        const execQuery = `SELECT DISTINCT c.*, c.id_r as id_o FROM clients_record c 
                       INNER JOIN "œuvre_type" o ON c.id_r = o.id_o 
                       WHERE ${ws.join(' AND ')} ORDER BY c.id_r DESC LIMIT ? OFFSET ?`;
        const execRows = await db.all(execQuery, [...ps, limit, offset]);
        console.log(`Success! Found ${execRows.length} execution rows.`);

    } catch (err) {
        console.error("FAILED with error:");
        console.error(err);
    } finally {
        await db.close();
    }
}

test();
