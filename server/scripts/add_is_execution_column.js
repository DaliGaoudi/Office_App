const db = require('../db');

async function run() {
    try {
        console.log("Starting migration: Adding is_execution column...");
        
        // 1. Add the column
        // Note: IF NOT EXISTS is not standard for columns in PG but we can check if it fails or use a query
        try {
            await db.run('ALTER TABLE clients_record ADD COLUMN is_execution BOOLEAN DEFAULT FALSE');
            console.log("Column 'is_execution' added successfully.");
        } catch (e) {
            if (e.message.includes('already exists')) {
                console.log("Column 'is_execution' already exists, skipping addition.");
            } else {
                throw e;
            }
        }
        
        // 2. Populate existing execution records
        // Any record that has at least one entry in œuvre_type should be marked as is_execution = true
        const updateQuery = `
            UPDATE clients_record 
            SET is_execution = TRUE 
            WHERE EXISTS (
                SELECT 1 FROM "œuvre_type" o 
                WHERE o.id_o::text = clients_record.id_r::text
            )
        `;
        
        const result = await db.run(updateQuery);
        console.log(`Migration complete. Records marked as execution: ${result.changes}`);
        
    } catch (e) {
        console.error("Migration fatal error:", e);
    }
}

run();
