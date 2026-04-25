require('dotenv').config({ path: './.env' });
const { createPool } = require('@vercel/postgres');

async function fixSchema() {
    const pool = createPool({ connectionString: process.env.POSTGRES_URL });
    try {
        console.log("Checking for null id_even...");
        const nullRes = await pool.query(`SELECT COUNT(*) FROM evenement WHERE id_even IS NULL`);
        console.log("Rows with null id_even:", nullRes.rows[0].count);

        console.log("Assigning temporary IDs to null id_even rows...");
        // Assign a temporary sequential ID starting from max(id_even) + 1
        const maxRes = await pool.query(`SELECT COALESCE(MAX(id_even), 0) as max_id FROM evenement`);
        let nextId = parseInt(maxRes.rows[0].max_id) + 1;
        
        const nullRows = await pool.query(`SELECT ctid FROM evenement WHERE id_even IS NULL`);
        for (let row of nullRows.rows) {
            await pool.query(`UPDATE evenement SET id_even = $1 WHERE ctid = $2`, [nextId++, row.ctid]);
        }
        console.log("Fixed null IDs.");

        console.log("Creating sequence and setting default...");
        // Create sequence if it doesn't exist
        await pool.query(`CREATE SEQUENCE IF NOT EXISTS evenement_id_even_seq`);
        
        // Set sequence to max id
        const finalMax = await pool.query(`SELECT COALESCE(MAX(id_even), 0) as max_id FROM evenement`);
        const maxVal = parseInt(finalMax.rows[0].max_id);
        if (maxVal > 0) {
            await pool.query(`SELECT setval('evenement_id_even_seq', $1)`, [maxVal]);
        }
        
        // Alter column to use sequence
        await pool.query(`ALTER TABLE evenement ALTER COLUMN id_even SET DEFAULT nextval('evenement_id_even_seq')`);
        
        console.log("Setting primary key...");
        // Check if primary key exists
        const pkRes = await pool.query(`
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'evenement' AND constraint_type = 'PRIMARY KEY'
        `);
        if (pkRes.rows.length === 0) {
            await pool.query(`ALTER TABLE evenement ADD PRIMARY KEY (id_even)`);
            console.log("Added primary key to evenement.");
        } else {
            console.log("Primary key already exists.");
        }

        console.log("Schema fix complete.");
    } catch (e) {
        console.error("Error fixing schema:", e);
    } finally {
        await pool.end();
    }
}

fixSchema();
