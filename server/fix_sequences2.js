require('dotenv').config();
const { createPool } = require('@vercel/postgres');

async function fixSequence() {
    const pool = createPool({ connectionString: process.env.POSTGRES_URL });
    try {
        // cnss => id_cn
        await pool.query(`CREATE SEQUENCE IF NOT EXISTS cnss_id_cn_seq;`);
        await pool.query(`SELECT setval('cnss_id_cn_seq', (SELECT COALESCE(MAX(id_cn), 0) FROM cnss));`);
        await pool.query(`ALTER TABLE cnss ALTER COLUMN id_cn SET DEFAULT nextval('cnss_id_cn_seq');`);
        console.log("Sequence attached to id_cn!");

        // oeuvre_type => id
        await pool.query(`CREATE SEQUENCE IF NOT EXISTS oeuvre_type_id_seq;`);
        await pool.query(`SELECT setval('oeuvre_type_id_seq', (SELECT COALESCE(MAX(id), 0) FROM "œuvre_type"));`);
        await pool.query(`ALTER TABLE "œuvre_type" ALTER COLUMN id SET DEFAULT nextval('oeuvre_type_id_seq');`);
        console.log("Sequence attached to oeuvre_type id!");
        
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

fixSequence();
