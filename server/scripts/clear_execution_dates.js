const db = require('../db');

async function run() {
    try {
        console.log("Starting migration to clear Notification Date for Execution records...");
        
        // Identify execution records: those that have an entry in "œuvre_type"
        // Use text comparison to avoid numeric cast errors
        const query = `
            UPDATE clients_record 
            SET date_inscri = NULL 
            WHERE EXISTS (
                SELECT 1 FROM "œuvre_type" o 
                WHERE o.id_o::text = clients_record.id_r::text
            )
        `;
        
        const result = await db.run(query);
        console.log(`Update complete. Records modified: ${result.changes}`);
        
    } catch (e) {
        console.error("Migration fatal error:", e);
    }
}

run();
