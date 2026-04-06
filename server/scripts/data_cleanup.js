const { Pool } = require('pg');
require('dotenv').config();

async function cleanup() {
    const pool = new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('--- Starting Action ID Cleanup ---');
        
        // 1. Get current max ID
        const maxRes = await pool.query('SELECT MAX(id) as maxid FROM "œuvre_type"');
        let currentMax = parseInt(maxRes.rows[0].maxid) || 0;
        console.log(`Current Maximum ID: ${currentMax}`);

        // 2. Find rows with NULL ID
        const nullRows = await pool.query('SELECT ctid, id_o, type_operation FROM "œuvre_type" WHERE id IS NULL');
        console.log(`Found ${nullRows.rowCount} rows with NULL ID.`);

        for (const row of nullRows.rows) {
            currentMax++;
            console.log(`Updating row for Record ${row.id_o} (${row.type_operation}) with new ID: ${currentMax}`);
            // Use ctid for precise row identification in Postgres when PK is null
            await pool.query('UPDATE "œuvre_type" SET id = $1 WHERE ctid = $2', [currentMax, row.ctid]);
        }

        console.log('--- Cleanup Complete ---');
    } catch (err) {
        console.error('Cleanup failed:', err);
    } finally {
        await pool.end();
    }
}

cleanup();
