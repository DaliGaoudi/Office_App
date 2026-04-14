const { createPool } = require('@vercel/postgres');

let pool;

/**
 * Lazy-Initialize Postgres Pool
 */
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

/**
 * Database Abstraction for Postgres
 * Automatically converts SQLite-style '?' placeholders to Postgres '$1, $2, ...'
 */
const db = {
    all: async (text, params = []) => {
        const p = getPool();
        if (!p) throw new Error("Database Pool Not Available. Check status or POSTGRES_URL.");
        
        let i = 1;
        const pgText = text.replace(/\?/g, () => `$${i++}`);
        const result = await p.query(pgText, params);
        return result.rows;
    },
    
    get: async (text, params = []) => {
        const p = getPool();
        if (!p) throw new Error("Database Pool Not Available. Check status or POSTGRES_URL.");
        
        let i = 1;
        const pgText = text.replace(/\?/g, () => `$${i++}`);
        const result = await p.query(pgText, params);
        return result.rows[0];
    },
    
    run: async (text, params = []) => {
        const p = getPool();
        if (!p) throw new Error("Database Pool Not Available. Check status or POSTGRES_URL.");
        
        let i = 1;
        let pgText = text.replace(/\?/g, () => `$${i++}`);
        
        // Ensure INSERTs provide returning clauses if they aren't there
        if (pgText.toLowerCase().trim().startsWith('insert') && !pgText.toLowerCase().includes('returning')) {
            // common id columns used in this project
            pgText += " RETURNING id_r, id_cn, id, id_even, id_tel, id_o";
        }
        
        const result = await p.query(pgText, params);
        const lr = result.rows[0];
        
        return { 
            lastID: lr ? (lr.id_r || lr.id_cn || lr.id || lr.id_even || lr.id_tel || lr.id_o || null) : null,
            changes: result.rowCount 
        };
    }
};

module.exports = db;
