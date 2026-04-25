require('dotenv').config({ path: './.env' });
const db = require('./db');

async function test() {
    try {
        const pool = db.getPool || (await db.all(`SELECT 1`)); // Just ensure pool initialized
        const res = await db.all(`
            SELECT column_name, column_default, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'evenement' AND column_name = 'id_even'
        `);
        console.log("id_even definition:", res);
        
        // Let's also check if there is a primary key
        const pk = await db.all(`
            SELECT a.attname
            FROM   pg_index i
            JOIN   pg_attribute a ON a.attrelid = i.indrelid
                                 AND a.attnum = ANY(i.indkey)
            WHERE  i.indrelid = 'evenement'::regclass
            AND    i.indisprimary;
        `);
        console.log("Primary Key:", pk);

    } catch (e) {
        console.error("Error:", e);
    }
}

test();
