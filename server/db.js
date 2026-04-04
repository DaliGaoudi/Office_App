const { createPool } = require('@vercel/postgres');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let pool;
let localDb;

/**
 * Initialize Database (Postgres for Production, SQLite for Local)
 */
const getDb = () => {
    // 1. Check for Postgres (Vercel)
    if (process.env.POSTGRES_URL) {
        if (!pool) {
            try {
                pool = createPool({ connectionString: process.env.POSTGRES_URL });
                console.log("PRODUCTION: Vercel Postgres Pool Initialized.");
            } catch (e) {
                console.error("FATAL: Failed to create Postgres Pool:", e);
            }
        }
        return { type: 'postgres', connection: pool };
    }

    // 2. Fallback to SQLite (Local)
    if (!localDb) {
        const dbPath = path.join(__dirname, 'database_v3.sqlite');
        localDb = new sqlite3.Database(dbPath, (err) => {
            if (err) console.error("FATAL: Local SQLite Connection Failed:", err);
            else console.log("DEVELOPMENT: Local SQLite Initialized.");
        });
    }
    return { type: 'sqlite', connection: localDb };
};

const db = {
    all: (text, params = []) => {
        const { type, connection } = getDb();
        return new Promise((resolve, reject) => {
            if (type === 'postgres') {
                let i = 1;
                const pgText = text.replace(/\?/g, () => `$${i++}`);
                connection.query(pgText, params)
                    .then(res => resolve(res.rows))
                    .catch(reject);
            } else {
                connection.all(text, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            }
        });
    },
    
    get: (text, params = []) => {
        const { type, connection } = getDb();
        return new Promise((resolve, reject) => {
            if (type === 'postgres') {
                let i = 1;
                const pgText = text.replace(/\?/g, () => `$${i++}`);
                connection.query(pgText, params)
                    .then(res => resolve(res.rows[0]))
                    .catch(reject);
            } else {
                connection.get(text, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            }
        });
    },
    
    run: (text, params = []) => {
        const { type, connection } = getDb();
        return new Promise((resolve, reject) => {
            if (type === 'postgres') {
                let i = 1;
                let pgText = text.replace(/\?/g, () => `$${i++}`);
                if (pgText.toLowerCase().trim().startsWith('insert') && !pgText.toLowerCase().includes('returning')) {
                    pgText += " RETURNING id_r, id_cn, id, id_even, id_tel, id_p, id_g";
                }
                connection.query(pgText, params)
                    .then(res => {
                        const lr = res.rows[0];
                        resolve({ 
                            lastID: lr ? (lr.id_r || lr.id_cn || lr.id || lr.id_even || lr.id_tel || lr.id_p || lr.id_g || null) : null,
                            changes: res.rowCount 
                        });
                    })
                    .catch(reject);
            } else {
                connection.run(text, params, function(err) {
                    if (err) reject(err);
                    else resolve({ lastID: this.lastID, changes: this.changes });
                });
            }
        });
    }
};

module.exports = db;
