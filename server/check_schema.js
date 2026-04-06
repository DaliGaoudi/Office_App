require('dotenv').config({ path: './server/.env' });
const db = require('./db');

async function checkSchema() {
    try {
        console.log("Checking schema for œuvre_type...");
        
        // Check for rows with NULL ID
        const nullRows = await db.all('SELECT * FROM "œuvre_type" WHERE id IS NULL');
        console.log(`Found ${nullRows.length} rows with NULL id.`);
        if (nullRows.length > 0) {
            console.log("Sample NULL row:", nullRows[0]);
        }

        // Check columns
        const columns = await db.all(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'œuvre_type'
        `);
        console.log("Columns in œuvre_type:", columns);

        // Check if there's a primary key
        const pk = await db.all(`
            SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS data_type
            FROM   pg_index i
            JOIN   pg_attribute a ON a.attrelid = i.indrelid
                                 AND a.attnum = ANY(i.indkey)
            WHERE  i.indrelid = '"œuvre_type"'::regclass
            AND    i.indisprimary;
        `);
        console.log("Primary key for œuvre_type:", pk);

    } catch (err) {
        console.error("Error checking schema:", err);
    }
}

checkSchema();
