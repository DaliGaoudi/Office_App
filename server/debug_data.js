const db = require('./db');
require('dotenv').config();

async function debugData() {
    try {
        const id_so = '35';
        console.log(`Analyzing id_so: ${id_so}`);
        
        // Sample some records to see what the data looks like
        const samples = await db.all(`
            SELECT id_r, ref, nom_cl1, salaire, "TVA", status 
            FROM clients_record 
            WHERE id_so::text = ? 
            LIMIT 10
        `, [id_so]);
        
        console.log("Sample records:");
        console.table(samples);
        
        // Status distribution
        const statuses = await db.all(`
            SELECT status, COUNT(*) as count 
            FROM clients_record 
            WHERE id_so::text = ? 
            GROUP BY status
        `, [id_so]);
        console.log("Status distribution:");
        console.table(statuses);

        // Check for records with ANY non-empty financial fields
        const withCosts = await db.all(`
            SELECT id_r, ref, salaire, "TVA", status 
            FROM clients_record 
            WHERE id_so::text = ? 
            AND (salaire != '' OR "TVA" != '' OR origine != '' OR exemple != '')
            LIMIT 10
        `, [id_so]);
        console.log("Records with non-empty financial fields (potential costs):");
        console.table(withCosts);

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}
debugData();
