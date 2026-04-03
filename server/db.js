const { createPool } = require('@vercel/postgres');

let pool;
let db;

// Safe Database Proxy (Lazy Initialization)
// This prevents the server from crashing during deployment/startup
const getPool = () => {
    if (!pool && process.env.POSTGRES_URL) {
        try {
            pool = createPool({ connectionString: process.env.POSTGRES_URL });
            console.log("PRODUCTION: Vercel Postgres Pool Initialized.");
        } catch (e) {
            console.error("FATAL: Failed to create Postgres Pool:", e);
        }
    }
    return pool;
};

if (process.env.POSTGRES_URL) {
    db = {
        all: async (text, params = []) => {
            const p = getPool();
            if (!p) throw new Error("Database Pool Not Available");
            let i = 1;
            const pgText = text.replace(/\?/g, () => `$${i++}`);
            const result = await p.query(pgText, params);
            return result.rows;
        },
        get: async (text, params = []) => {
            const p = getPool();
            if (!p) throw new Error("Database Pool Not Available");
            let i = 1;
            const pgText = text.replace(/\?/g, () => `$${i++}`);
            const result = await p.query(pgText, params);
            return result.rows[0];
        },
        run: async (text, params = []) => {
            const p = getPool();
            if (!p) throw new Error("Database Pool Not Available");
            let i = 1;
            let pgText = text.replace(/\?/g, () => `$${i++}`);
            if (pgText.toLowerCase().includes('insert') && !pgText.toLowerCase().includes('returning')) {
                pgText += " RETURNING id_r, id_cn, id";
            }
            const result = await p.query(pgText, params);
            const lr = result.rows[0];
            return { 
                lastID: lr ? (lr.id_r || lr.id_cn || lr.id || null) : null,
                changes: result.rowCount 
            };
        }
    };
} else {
    // Local SQLite Fallback (Hidden from Vercel)
    db = {
        all: (t, p) => { const s = eval("require('sqlite3')"); return new Promise((rv, rj) => new s.Database('./database_v3.sqlite').all(t, p, (e, r) => e ? rj(e) : rv(r))); },
        get: (t, p) => { const s = eval("require('sqlite3')"); return new Promise((rv, rj) => new s.Database('./database_v3.sqlite').get(t, p, (e, r) => e ? rj(e) : rv(r))); },
        run: (t, p) => { const s = eval("require('sqlite3')"); return new Promise((rv, rj) => new s.Database('./database_v3.sqlite').run(t, p, function(e) { e ? rj(e) : rv({ lastID: this.lastID, changes: this.changes }); })); }
    };
}

module.exports = db;
