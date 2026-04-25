require('dotenv').config({ path: './.env' });
const db = require('./db');

async function test() {
    try {
        const id_so = 1; 
        const id_user = 1;
        // Insert
        const query = `
            INSERT INTO evenement (sujet, debut_date, show_time, description, location, id_user, id_so)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING id_even
        `;
        const result = await db.run(query, ['Test Title', '2026-04-26', '10:00', 'Test desc', 'Court', id_user, id_so]);
        console.log("Insert result:", result);

        // Retrieve
        const rows = await db.all(`SELECT id_even, sujet as title, debut_date as start, show_time as time_even, location as tribunal_even, description FROM evenement WHERE id_so::text = ? ORDER BY id_even DESC LIMIT 1`, [id_so]);
        console.log("Retrieve result:", rows);

        // Clean up
        if (rows.length > 0 && rows[0].id_even) {
            await db.run(`DELETE FROM evenement WHERE id_even = ?`, [rows[0].id_even]);
            console.log("Deleted test event.");
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
