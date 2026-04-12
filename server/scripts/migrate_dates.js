const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = require('../db'); // Postgres DB
require('dotenv').config();

const sqlitePath = path.resolve(__dirname, '../../../office_data.db');
const sqliteDB = new sqlite3.Database(sqlitePath);

async function migrate() {
    console.log('--- Starting Optimized Service Dates Migration ---');
    console.log(`Source: ${sqlitePath}`);
    
    // 1. Fetch all records from SQLite
    const legacyRecords = await new Promise((resolve, reject) => {
        sqliteDB.all('SELECT ref, date_reg, date_inscri, id_so FROM clients_record', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    const total = legacyRecords.length;
    console.log(`Found ${total} records in SQLite.`);

    let updatedCount = 0;
    let skippedCount = 0;
    let processedCount = 0;

    const BATCH_SIZE = 50; // Concurrency limit

    async function processBatch(batch) {
        return Promise.all(batch.map(async (legacy) => {
            const notificationDate = legacy.date_reg || '';
            const requestDate = legacy.date_inscri || '';
            const ref = legacy.ref;
            const id_so = legacy.id_so;

            if (!ref) {
                skippedCount++;
                processedCount++;
                return;
            }

            try {
                const query = `
                    UPDATE clients_record 
                    SET date_inscri = ?, date_reg = ?
                    WHERE ref::text = ? AND id_so::text = ?
                `;
                const result = await db.run(query, [notificationDate, requestDate, ref.toString(), id_so.toString()]);
                
                if (result.changes > 0) {
                    updatedCount++;
                } else {
                    skippedCount++;
                }
            } catch (err) {
                console.error(`Error updating ref ${ref}:`, err.message);
            }
            processedCount++;
            if (processedCount % 500 === 0) {
                console.log(`Progress: ${processedCount}/${total} (${Math.round(processedCount/total*100)}%)`);
            }
        }));
    }

    // Run in batches
    for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = legacyRecords.slice(i, i + BATCH_SIZE);
        await processBatch(batch);
    }

    console.log(`--- Migration Finished ---`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped/Not matching: ${skippedCount}`);

    sqliteDB.close();
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
