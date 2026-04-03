const db = require('./db');
require('dotenv').config();

async function checkCounts() {
    try {
        const id_so = '35';
        console.log(`Checking counts for id_so: ${id_so}`);

        // 1. General Register with calculated_total > 0
        const rows = await db.all('SELECT * FROM clients_record WHERE id_so::text = ?', [id_so]);
        
        function computeTotal(row) {
            const salaire = parseFloat(row.salaire) || 0;
            const tva = parseFloat(row["TVA"]) || 0;
            const others = ['origine','exemple','version_bureau','orientation','mobilite','imprimer','inscri','delimitation','poste','autre']
                .reduce((s, k) => s + (parseFloat(row[k]) || 0), 0);
            return salaire + tva + others;
        }

        const withCosts = rows.filter(r => computeTotal(r) > 0);
        console.log(`General records with costs > 0: ${withCosts.length}`);

        // 2. Execution actions count
        const actions = await db.get('SELECT COUNT(*) as count FROM "œuvre_type" WHERE id_so::text = ?', [id_so]);
        console.log(`Execution actions in database: ${actions.count}`);

        // 3. Specific status check
        const byStatus = await db.all('SELECT status, COUNT(*) as count FROM clients_record WHERE id_so::text = ? GROUP BY status', [id_so]);
        console.table(byStatus);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkCounts();
