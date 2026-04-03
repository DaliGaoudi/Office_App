const { createPool } = require('@vercel/postgres');

let pool;
let db;

if (process.env.POSTGRES_URL) {
    pool = createPool({ connectionString: process.env.POSTGRES_URL });
    console.log("Using Vercel Postgres Pool.");

    db = {
        query: async (text, params = []) => {
            let i = 1;
            const pgText = text.replace(/\?/g, () => `$${i++}`);
            const result = await pool.query(pgText, params);
            return result;
        },
        all: async (text, params = []) => {
            let i = 1;
            const pgText = text.replace(/\?/g, () => `$${i++}`);
            const result = await pool.query(pgText, params);
            return result.rows;
        },
        get: async (text, params = []) => {
            let i = 1;
            const pgText = text.replace(/\?/g, () => `$${i++}`);
            const result = await pool.query(pgText, params);
            return result.rows[0];
        },
        run: async (text, params = []) => {
            let i = 1;
            let pgText = text.replace(/\?/g, () => `$${i++}`);
            
            // Automatic RETURNING clause only if not already present
            if (pgText.toLowerCase().includes('insert') && !pgText.toLowerCase().includes('returning')) {
                pgText += " RETURNING id_r, id_cn, id";
            }
            
            const result = await pool.query(pgText, params);
            const lr = result.rows[0];
            return { 
                lastID: lr ? (lr.id_r || lr.id_cn || lr.id || null) : null,
                changes: result.rowCount 
            };
        }
    };
} else {
    // Local SQLite fallback
    const sqlite3 = require('sqlite3');
    const path = require('path');
    const localDbPath = path.join(__dirname, 'database_v3.sqlite');
    const sqliteDb = new sqlite3.Database(localDbPath);

    db = {
        all: (text, params) => new Promise((rv, rj) => sqliteDb.all(text, params, (err, rows) => err ? rj(err) : rv(rows))),
        get: (text, params) => new Promise((rv, rj) => sqliteDb.get(text, params, (err, row) => err ? rj(err) : rv(row))),
        run: (text, params) => new Promise((rv, rj) => sqliteDb.run(text, params, function(err) { err ? rj(err) : rv({ lastID: this.lastID, changes: this.changes }); })),
        query: (text, params) => new Promise((rv, rj) => sqliteDb.all(text, params, (err, rows) => err ? rj(err) : rv({ rows })))
    };
}

module.exports = db;
