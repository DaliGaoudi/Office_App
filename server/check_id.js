require('dotenv').config();
const db = require('./db');
const { createPool } = require('@vercel/postgres');

async function go() {
    try {
        const pool = createPool({ connectionString: process.env.POSTGRES_URL });
        const res = await pool.query('SELECT MAX(id_r) as m FROM clients_record');
        console.log(res.rows[0]);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

go();
