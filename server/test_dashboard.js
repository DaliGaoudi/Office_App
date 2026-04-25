require('dotenv').config({ path: './.env' });
const db = require('./db');

async function test() {
    try {
        const id_so = 1; 
        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split('T')[0];
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

        console.log("Testing metrics...");
        const activeCount = await db.get(`SELECT COUNT(*) as count FROM clients_record WHERE id_so::text = ? AND status != 'finished'`, [id_so]);
        const dueToday = await db.get(`SELECT COUNT(*) as count FROM evenement WHERE id_so::text = ? AND debut_date = ?`, [id_so, today]);
        const dueWeek = await db.get(`SELECT COUNT(*) as count FROM evenement WHERE id_so::text = ? AND debut_date >= ? AND debut_date <= ?`, [id_so, today, nextWeekStr]);
        console.log("metrics:", { activeCount, dueToday, dueWeek });
        
        console.log("Testing deadlines...");
        const deadlines = await db.all(`
            SELECT id_even, sujet as title, debut_date as start, show_time as time_even, location as tribunal_even, description 
            FROM evenement 
            WHERE id_so::text = ? AND debut_date >= ? AND debut_date <= ?
            ORDER BY debut_date ASC, show_time ASC 
            LIMIT 15
        `, [id_so, today, nextWeekStr]);
        console.log("deadlines:", deadlines.length);

        console.log("Testing activity...");
        const activity = await db.all(`
            (SELECT 'case' as type, id_r as id, nom_cl1 as title, date_reg as date, 'محضر جديد' as action 
             FROM clients_record WHERE id_so::text = ? ORDER BY id_r DESC LIMIT 5)
            UNION ALL
            (SELECT 'event' as type, id_even as id, sujet as title, debut_date as date, 'موعد جديد' as action 
             FROM evenement WHERE id_so::text = ? ORDER BY id_even DESC LIMIT 5)
            ORDER BY date DESC
            LIMIT 10
        `, [id_so, id_so]);
        console.log("activity:", activity.length);

        console.log("All queries successful!");
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
