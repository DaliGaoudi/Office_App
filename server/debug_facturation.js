const db = require('./db');
require('dotenv').config();

async function debugFacturation() {
    try {
        const id_so = '35'; // User's ID_SO
        console.log(`Checking data for id_so: ${id_so}`);

        // 1. Total records
        const total = await db.get("SELECT COUNT(*) as count FROM clients_record WHERE id_so::text = ?", [id_so]);
        console.log(`Total records in clients_record: ${total.count}`);

        // 2. Records with any financial value in any potential field
        const withFin = await db.get(`SELECT COUNT(*) as count FROM clients_record 
                                      WHERE id_so::text = ? 
                                      AND (salaire::float > 0 OR origine::float > 0 OR exemple::float > 0 OR inscri::float > 0 OR delimitation::float > 0)`, [id_so]);
        console.log(`Records with financial data (> 0): ${withFin.count}`);

        // 3. Execution actions
        const actions = await db.get(`SELECT COUNT(*) as count FROM "œuvre_type" 
                                      WHERE id_so::text = ?`, [id_so]);
        console.log(`Total execution actions ("œuvre_type"): ${actions.count}`);

        // 4. Joined execution records (what the current query does)
        const joined = await db.get(`SELECT COUNT(DISTINCT c.id_r) as count FROM clients_record c 
                                     INNER JOIN "œuvre_type" o ON c.id_r::text = o.id_o::text 
                                     WHERE c.id_so::text = ?`, [id_so]);
        console.log(`Records linked to execution actions: ${joined.count}`);

        process.exit(0);
    } catch (err) {
        console.error("Debug Error:", err);
        process.exit(1);
    }
}

debugFacturation();
