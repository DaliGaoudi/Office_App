const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/auth');

// Middleware to ensure user is a client
const isClient = (req, res, next) => {
    if (req.user && req.user.role === 'client') {
        next();
    } else {
        res.status(403).json({ error: 'Access denied. Clients only.' });
    }
};

// Helper function to get client aliases
const getClientAliases = async (userId) => {
    const user = await db.get(`SELECT societe, client_aliases FROM admin_admin WHERE id = ?`, [userId]);
    let aliases = [];
    if (user.societe && user.societe.trim() !== '') aliases.push(user.societe.trim());
    if (user.client_aliases && user.client_aliases.trim() !== '') {
        const splitAliases = user.client_aliases.split(',').map(s => s.trim()).filter(s => s !== '');
        aliases = [...aliases, ...splitAliases];
    }
    // Remove duplicates
    return [...new Set(aliases)];
};

// Get files for the logged-in client
router.get('/records', authenticate, isClient, async (req, res) => {
    try {
        const aliases = await getClientAliases(req.user.id);
        
        if (aliases.length === 0) {
            return res.json([]); // No aliases, no files
        }

        // Build LIKE clauses for each alias
        const likeClauses = aliases.map(() => `nom_cl1 LIKE ?`).join(' OR ');
        const queryParams = aliases.map(a => `%${a}%`);

        const query = `
            SELECT 
                id_r as id, 
                ref, 
                is_execution, 
                nom_cl1, 
                nom_cl2, 
                tribunal, 
                date_s, 
                status, 
                resultat, 
                date_ajout 
            FROM clients_record 
            WHERE (${likeClauses})
            ORDER BY date_ajout DESC
        `;

        const records = await db.all(query, queryParams);
        res.json(records);
    } catch (err) {
        console.error('Error fetching portal records:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get actions (procédures) for a specific file
router.get('/records/:id/actions', authenticate, isClient, async (req, res) => {
    try {
        const recordId = req.params.id;
        const aliases = await getClientAliases(req.user.id);
        
        if (aliases.length === 0) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        // First, verify the record belongs to the client
        const likeClauses = aliases.map(() => `nom_cl1 LIKE ?`).join(' OR ');
        const recordParams = [recordId, ...aliases.map(a => `%${a}%`)];
        
        const record = await db.get(
            `SELECT id_r FROM clients_record WHERE id_r = ? AND (${likeClauses})`,
            recordParams
        );

        if (!record) {
            return res.status(403).json({ error: 'Access denied or record not found.' });
        }

        // Fetch actions, excluding financial details
        const actions = await db.all(
            `SELECT 
                id, 
                type_operation as title, 
                date_r as date, 
                remarques, 
                date_ajout 
            FROM œuvre_type 
            WHERE id_o = ? 
            ORDER BY date_ajout DESC`,
            [recordId]
        );

        res.json(actions);
    } catch (err) {
        console.error('Error fetching portal actions:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
