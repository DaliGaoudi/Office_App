require('dotenv').config();

async function testFix() {
    const API_BASE = 'http://localhost:5173/api'; // Or whatever the local port is
    // Actually, I can just test against the DB directly or use a mock request since I don't have the server running here easily.
    // However, I can test the DB insertion logic by running the route code in a script.
    
    const db = require('./db');
    
    try {
        console.log("Testing DB insertion logic for oeuvre_type...");
        const id = "306";
        const user = { id: "100", id_so: "1" };
        const action = { type_operation: 'Test Stage', date_r: '2026-04-06', origine: '10', salaire: '50' };

        const keys = [
            'type_operation', 'date_r', 'val_financiere', 'remarques', 'id_o', 'id_user', 'id_so',
            'origine', 'exemple', 'versionbureau', 'mobilite', 'orientation', 'imprimer', 'TVA', 
            'montantpartiel1', 'montantpartiel2', 'salaire', 'inscri', 'delimitation', 'postal', 'autre'
        ];
        
        const data = {};
        keys.forEach(k => {
            if (k === 'id_o') data[k] = parseInt(id);
            else if (k === 'id_user') data[k] = parseInt(user.id);
            else if (k === 'id_so') data[k] = parseInt(user.id_so);
            else if (k === 'date_r' && !action[k]) data[k] = new Date().toISOString().split('T')[0];
            else {
                const val = action[k];
                if (['type_operation', 'date_r', 'remarques'].includes(k)) {
                    data[k] = val || '';
                } else {
                    data[k] = val ? (isNaN(val) ? val : parseFloat(val)) : 0;
                }
            }
        });

        const columns = Object.keys(data);
        const quotedColumns = columns.map(c => `"${c}"`);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
        const query = `INSERT INTO "œuvre_type" (${quotedColumns.join(',')}) VALUES (${placeholders}) RETURNING *`;
        
        console.log("Executing Query:", query);
        console.log("With Params:", Object.values(data));
        
        const result = await db.run(query, Object.values(data));
        console.log("Insertion Successful! ID:", result.lastID);

        // Cleanup
        if (result.lastID) {
            await db.run('DELETE FROM "œuvre_type" WHERE id = $1', [result.lastID]);
            console.log("Test Action Cleaned up.");
        }
    } catch (err) {
        console.error("Test Failed:", err);
        process.exit(1);
    }
}

testFix();
