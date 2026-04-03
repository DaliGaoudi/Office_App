const db = require('./db');
require('dotenv').config();

async function testApi() {
    try {
        const user = { id_so: '35', id: 35 };
        console.log("Testing Registre Facturation List API for id_so: 35...");
        
        // Mock the logic from registre.js get('/facturation/list')
        const query = `SELECT id_r, ref, de_part, nom_cl1, nom_cl2, date_reg, remarque, salaire, "TVA" as tva, status,
                             origine, exemple, version_bureau, orientation, mobilite,
                             imprimer, inscri, delimitation, poste, autre
                      FROM clients_record WHERE id_so::text = ? ORDER BY id_r DESC`;
        const params = [user.id_so];
        
        const rows = await db.all(query, params);
        console.log(`Total rows fetched from DB: ${rows.length}`);
        
        // This is the core logic in registre.js
        function computeSalaireBreakdown(row) {
            const rate = 19; 

            const baseRaw = ['origine','exemple','version_bureau','orientation','mobilite']
                .reduce((s, k) => s + (parseInt(row[k]) || 0), 0);
            const expensesRaw = ['imprimer','inscri','delimitation','poste','autre']
                .reduce((s, k) => s + (parseInt(row[k]) || 0), 0);
            const storedTotal = parseFloat(row.salaire) || 0;

            let base, tva, expenses, total;

            if (baseRaw > 0 || expensesRaw > 0) {
                base = baseRaw;
                const storedTVA = parseFloat(row.tva) || 0;
                tva = (storedTVA > 0) ? storedTVA : Math.round(base * rate / 100);
                expenses = expensesRaw;
                total = base + tva + expenses;
            } else if (storedTotal > 0) {
                base = Math.round((storedTotal / (1 + rate / 100)) * 1000) / 1000;
                tva = storedTotal - base;
                expenses = 0;
                total = storedTotal;
            } else {
                base = 0; tva = 0; expenses = 0; total = 0;
            }

            return { total };
        }

        const withValue = (rows || [])
            .map(row => ({ ...row, calculated_total: computeSalaireBreakdown(row).total }))
            .filter(row => row.calculated_total > 0);
            
        console.log(`Rows after filtering by calculated_total > 0: ${withValue.length}`);
        if (withValue.length > 0) {
            console.log("First filtered row sample:", {
                id_r: withValue[0].id_r,
                ref: withValue[0].ref,
                total: withValue[0].calculated_total,
                status: withValue[0].status
            });
        }

        process.exit(0);
    } catch (err) {
        console.error("Test Error:", err);
        process.exit(1);
    }
}
testApi();
