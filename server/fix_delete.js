require('dotenv').config();
const db = require('./db');
const { createPool } = require('@vercel/postgres');

async function go() {
    try {
        const pool = createPool({ connectionString: process.env.POSTGRES_URL });
        const res = await pool.query("DELETE FROM clients_record WHERE ref = 9545 AND de_part = 'hjfsdghjfsd'");
        console.log("Deleted rows:", res.rowCount);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

go();
