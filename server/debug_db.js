require('dotenv').config();
const db = require('./db');

async function debug() {
    try {
        console.log("Checking œuvre_type table structure...");
        const result = await db.all(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'œuvre_type'
        `);
        console.log("Columns:", JSON.stringify(result, null, 2));

        if (result.length === 0) {
            console.log("Table 'œuvre_type' not found. Checking without extension...");
            const result2 = await db.all(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = 'oeuv_type' OR table_name LIKE '%oeuvre%'
            `);
            console.log("Similar tables:", JSON.stringify(result2, null, 2));
        }
    } catch (err) {
        console.error("Debug failed:", err);
    }
}

debug();
