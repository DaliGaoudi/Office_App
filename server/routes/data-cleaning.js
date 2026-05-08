const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/auth');
const stringSimilarity = require('string-similarity');
const { OpenAI } = require('openai');

// Ensure admin only
const isAdmin = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
        next();
    } else {
        res.status(403).json({ error: 'Access denied' });
    }
};

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
    defaultHeaders: {
        "HTTP-Referer": "https://study-hd.vercel.app",
        "X-Title": "Study HD Office App",
    }
});

router.get('/suggestions', authenticate, isAdmin, async (req, res) => {
    try {
        // Fetch all unique client names and their counts
        const query = `
            SELECT nom_cl1, COUNT(*) as count 
            FROM clients_record 
            WHERE nom_cl1 IS NOT NULL AND nom_cl1 != '' 
            GROUP BY nom_cl1 
            ORDER BY count DESC
        `;
        const rows = await db.all(query);
        const names = rows.map(r => r.nom_cl1.trim());

        if (names.length === 0) {
            return res.json([]);
        }

        const clusters = [];
        const processed = new Set();

        // Simple clustering logic: group names that are > 0.6 similar
        for (let i = 0; i < names.length; i++) {
            const current = names[i];
            if (processed.has(current) || current.length < 3) continue;

            const cluster = [current];
            processed.add(current);

            for (let j = i + 1; j < names.length; j++) {
                const target = names[j];
                if (!processed.has(target) && target.length >= 3) {
                    const similarity = stringSimilarity.compareTwoStrings(current.toLowerCase(), target.toLowerCase());
                    // Higher threshold to avoid false positives
                    if (similarity > 0.65) {
                        cluster.push(target);
                        processed.add(target);
                    }
                }
            }

            if (cluster.length > 1) {
                clusters.push({
                    items: cluster.map(name => {
                        const row = rows.find(r => r.nom_cl1.trim() === name);
                        return { name, count: parseInt(row.count, 10) };
                    })
                });
            }

            // Only process top 20 clusters for performance
            if (clusters.length >= 20) break;
        }

        // Use AI to suggest canonical names for these clusters
        if (clusters.length > 0) {
            const prompt = `You are an AI data cleaning assistant for a Tunisian legal office.
Your task is to review clusters of similar company/person names and suggest the single most "canonical" and correct spelling for each cluster. 
Usually, the canonical name is the one that is most descriptive, correctly spelled (often in Arabic or French), and without typos. 
Return ONLY a JSON array of strings, where each string corresponds to the canonical name for the cluster in the exact order they were provided. Do not include any explanations.

Clusters:
${JSON.stringify(clusters.map(c => c.items.map(i => i.name)), null, 2)}`;

            try {
                const response = await openai.chat.completions.create({
                    model: "openai/gpt-4o-mini",
                    messages: [{ role: "user", content: prompt }],
                    response_format: { type: "json_object" } // Using json object to enforce valid JSON
                });
                
                // Fallback parsing just in case
                let aiSuggestions = [];
                try {
                    let content = response.choices[0].message.content;
                    // Sometimes AI returns {"suggestions": [...] } if response_format=json_object
                    const parsed = JSON.parse(content);
                    if (Array.isArray(parsed)) {
                        aiSuggestions = parsed;
                    } else if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
                        aiSuggestions = parsed.suggestions;
                    } else if (parsed.canonical_names && Array.isArray(parsed.canonical_names)) {
                        aiSuggestions = parsed.canonical_names;
                    } else {
                        // Extract first array
                        const arrValue = Object.values(parsed).find(v => Array.isArray(v));
                        if (arrValue) aiSuggestions = arrValue;
                    }
                } catch (e) {
                    console.error("Failed to parse AI suggestions:", e);
                }

                // Map suggestions back to clusters
                clusters.forEach((cluster, idx) => {
                    // Default to the most frequent name if AI fails or returns weird data
                    const mostFrequent = cluster.items.sort((a, b) => b.count - a.count)[0].name;
                    cluster.canonicalName = aiSuggestions[idx] || mostFrequent;
                });
            } catch (aiErr) {
                console.error("AI Error:", aiErr);
                // Fallback: Use most frequent
                clusters.forEach(cluster => {
                    cluster.canonicalName = cluster.items.sort((a, b) => b.count - a.count)[0].name;
                });
            }
        }

        res.json(clusters);
    } catch (err) {
        console.error("Data cleaning error:", err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Execute the merge
router.post('/merge', authenticate, isAdmin, async (req, res) => {
    try {
        const { merges } = req.body; // Array of { oldNames: [], canonicalName: '' }
        
        if (!merges || !Array.isArray(merges) || merges.length === 0) {
            return res.status(400).json({ error: 'Invalid merge data' });
        }

        let totalUpdated = 0;

        for (const merge of merges) {
            const { oldNames, canonicalName } = merge;
            if (!canonicalName || !oldNames || oldNames.length === 0) continue;

            // Remove the canonical name from oldNames if it's there
            const namesToReplace = oldNames.filter(n => n !== canonicalName);
            if (namesToReplace.length === 0) continue;

            const placeholders = namesToReplace.map(() => '?').join(',');
            const query = `UPDATE clients_record SET nom_cl1 = ? WHERE nom_cl1 IN (${placeholders})`;
            
            const result = await db.run(query, [canonicalName, ...namesToReplace]);
            totalUpdated += result.changes || 0;
        }

        res.json({ success: true, message: `Successfully merged and updated records.`, totalUpdated });
    } catch (err) {
        console.error("Merge error:", err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
