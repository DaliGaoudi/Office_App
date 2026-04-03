const { createPool } = require('@vercel/postgres');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const sqliteDb = new sqlite3.Database(path.join(__dirname, 'database_v3.sqlite'));

const pgPool = createPool({
    connectionString: process.env.POSTGRES_URL
});

async function migrateTable(tableName, idCol) {
    console.log(`Migrating ${tableName}...`);
    
    // 1. Get all data from SQLite
    const rows = await new Promise((resolve, reject) => {
        sqliteDb.all(`SELECT * FROM "${tableName}"`, [], (err, data) => err ? reject(err) : resolve(data));
    });

    if (rows.length === 0) {
        console.log(`No data in ${tableName}.`);
        return;
    }

    // 2. Prepare PG Insert
    const keys = Object.keys(rows[0]);
    const columns = keys.map(k => `"${k}"`).join(',');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
    const query = `INSERT INTO "${tableName}" (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

    // 3. Insert in batches
    for (const row of rows) {
        const values = keys.map(k => row[k]);
        try {
            await pgPool.query(query, values);
        } catch (err) {
            console.error(`Error inserting row in ${tableName}:`, err.message);
        }
    }
    console.log(`Migrated ${rows.length} rows to ${tableName}.`);
}

async function run() {
    if (!process.env.POSTGRES_URL) {
        console.error("POSTGRES_URL environment variable is missing!");
        process.exit(1);
    }

    try {
        // Order matters if there are foreign keys (though here there aren't many explicit ones)
        const tables = [
            'admin_admin',
            'app_settings',
            'telephone',
            'evenement',
            'clients_record',
            'œuvre_type',
            'cnss',
            'cnss_oeuvre'
        ];

        for (const table of tables) {
            await migrateTable(table);
        }

        console.log("Migration finished successfully!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        sqliteDb.close();
        await pgPool.end();
    }
}

run();
