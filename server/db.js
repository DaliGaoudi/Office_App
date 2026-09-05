const { createPool } = require('@vercel/postgres');

let pool;

/*
 * The connection string, under either of the two names it arrives as.
 *
 * Vercel's Neon Marketplace integration injects DATABASE_URL when it is connected
 * to a project; this app was written against POSTGRES_URL. Accepting both means a
 * newly provisioned office works with no environment-variable juggling, while
 * existing deployments keep working unchanged.
 */
const connectionString = () => process.env.POSTGRES_URL || process.env.DATABASE_URL;

/**
 * Lazy-Initialize Postgres Pool
 */
const getPool = () => {
    if (!pool && connectionString()) {
        try {
            pool = createPool({ connectionString: connectionString() });
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
        if (!p) throw new Error("Database Pool Not Available. Set POSTGRES_URL or DATABASE_URL.");
        
        let i = 1;
        const pgText = text.replace(/\?/g, () => `$${i++}`);
        const result = await p.query(pgText, params);
        return result.rows;
    },
    
    get: async (text, params = []) => {
        const p = getPool();
        if (!p) throw new Error("Database Pool Not Available. Set POSTGRES_URL or DATABASE_URL.");
        
        let i = 1;
        const pgText = text.replace(/\?/g, () => `$${i++}`);
        const result = await p.query(pgText, params);
        return result.rows[0];
    },
    
    run: async (text, params = []) => {
        const p = getPool();
        if (!p) throw new Error("Database Pool Not Available. Set POSTGRES_URL or DATABASE_URL.");
        
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
