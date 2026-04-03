const { createPool } = require('@vercel/postgres');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const sqliteDb = new sqlite3.Database(path.join(__dirname, 'database_v3.sqlite'));

const pgPool = createPool({
    connectionString: process.env.POSTGRES_URL
});

async function init() {
    console.log("Starting Postgres Initialization...");

    if (!process.env.POSTGRES_URL) {
        console.error("POSTGRES_URL is missing in .env");
        process.exit(1);
    }

    const tablesToMigrate = [
        'admin_admin',
        'app_settings',
        'telephone',
        'evenement',
        'clients_record',
        'œuvre_type',
        'cnss',
        'cnss_oeuvre'
    ];

    for (const tableName of tablesToMigrate) {
        console.log(`Analyzing ${tableName}...`);
        
        const sqliteColumns = await new Promise((resolve, reject) => {
            sqliteDb.all(`PRAGMA table_info("${tableName}")`, [], (err, info) => err ? reject(err) : resolve(info));
        });

        if (!sqliteColumns || sqliteColumns.length === 0) {
            console.warn(`No schema found for ${tableName} locally, skipping.`);
            continue;
        }

        const pgColumns = sqliteColumns.map(col => {
            let type = col.type.toUpperCase();
            if (type.includes('INT')) type = 'INTEGER';
            else if (type.includes('TEXT') || type.includes('CHAR') || type.includes('BLOB')) type = 'TEXT';
            else if (type.includes('REAL') || type.includes('DOUBLE') || type.includes('FLOAT') || type.includes('DECIMAL')) type = 'NUMERIC';
            else if (type.includes('DATE') || type.includes('TIME')) type = 'TIMESTAMPTZ';
            else type = 'TEXT';
            
            if (col.pk === 1) {
                if (type === 'INTEGER') return `"${col.name}" SERIAL PRIMARY KEY`;
                return `"${col.name}" ${type} PRIMARY KEY`;
            }
            return `"${col.name}" ${type}`;
        }).join(', ');

        const createQuery = `CREATE TABLE IF NOT EXISTS "${tableName}" (${pgColumns})`;
        
        try {
            await pgPool.query(createQuery);
            console.log(`Table "${tableName}" verified/created.`);
        } catch (err) {
            console.error(`Error creating table "${tableName}":`, err.message);
        }
    }

    console.log("Postgres Initialization finished.");
    sqliteDb.close();
    await pgPool.end();
}

init().catch(console.error);
