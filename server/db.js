const { createPool } = require('@vercel/postgres');
const path = require('path');

let db;

if (process.env.POSTGRES_URL) {
    console.log('Using Vercel Postgres Pool.');
    const pool = createPool({
        connectionString: process.env.POSTGRES_URL
    });

    db = {
        query: async (text, params = []) => {
            let i = 1;
            const pgText = text.replace(/\?/g, () => `$${i++}`);
            const result = await pool.query(pgText, params);
            return {
                rows: result.rows,
                lastID: result.rows[0] ? (result.rows[0].id_r || result.rows[0].id_even || result.rows[0].id_cn || result.rows[0].id || null) : null,
                changes: result.rowCount
            };
        },
        all: async (text, params = []) => (await db.query(text, params)).rows,
        get: async (text, params = []) => (await db.query(text, params)).rows[0],
        run: async (text, params = []) => await db.query(text, params),
        close: () => pool.end()
    };
} else {
    console.log('Using Local SQLite.');
    const sqliteModuleName = 'sqlite3';
    const sqlite3 = require(sqliteModuleName).verbose();
    const sqliteDb = new sqlite3.Database(path.join(__dirname, 'database_v3.sqlite'));
    
    db = {
        query: (text, params = []) => new Promise((resolve, reject) => {
            // Remove Postgres-specific casts for local dev
            const sqliteText = text.replace(/::text/gi, '');
            const isSelect = sqliteText.trim().toUpperCase().startsWith('SELECT');
            const method = isSelect ? 'all' : 'run';
            
            sqliteDb[method](sqliteText, params, function(err, result) {
                if (err) return reject(err);
                resolve({
                    rows: isSelect ? result : [],
                    lastID: this.lastID,
                    changes: this.changes
                });
            });
        }),
        all: async (text, params = []) => (await db.query(text, params)).rows,
        get: async (text, params = []) => {
            const res = await db.query(text, params);
            return res.rows ? res.rows[0] : null;
        },
        run: async (text, params = []) => await db.query(text, params),
        close: () => new Promise((resolve, reject) => {
            sqliteDb.close((err) => err ? reject(err) : resolve());
        })
    };
}

module.exports = db;
