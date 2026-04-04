const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');
const db = require('../db');
const authenticate = require('../middleware/auth');

// Initialize OpenAI client for OpenRouter
const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
    defaultHeaders: {
        "HTTP-Referer": "https://study-hd.vercel.app", // Optional
        "X-Title": "Study HD Office App", // Optional
    }
});

/**
 * AI Tool: Search Acts
 */
async function searchActs(id_so, query = '') {
    let sql = `SELECT ref, nom_cl1, de_part, date_reg, status FROM clients_record WHERE id_so::text = ?`;
    let params = [id_so];
    if (query) {
        sql += ` AND (nom_cl1 LIKE ? OR de_part LIKE ? OR ref::text LIKE ?)`;
        const p = `%${query}%`;
        params.push(p, p, p);
    }
    sql += ` ORDER BY id_r DESC LIMIT 10`;
    return await db.all(sql, params);
}

/**
 * AI Tool: Search Contacts
 */
async function searchContacts(id_so, query = '') {
    let sql = `SELECT nom, prenom, num_tel1, email_tel FROM telephone WHERE id_so::text = ?`;
    let params = [id_so];
    if (query) {
        sql += ` AND (nom LIKE ? OR prenom LIKE ? OR num_tel1 LIKE ?)`;
        const p = `%${query}%`;
        params.push(p, p, p);
    }
    sql += ` ORDER BY nom ASC LIMIT 10`;
    return await db.all(sql, params);
}

/**
 * AI Tool: Get Calendar
 */
async function getCalendar(id_so) {
    const today = new Date().toISOString().split('T')[0];
    return await db.all(`
        SELECT title, start, time_even, tribunal_even 
        FROM evenement 
        WHERE id_so::text = ? AND start >= ?
        ORDER BY start ASC LIMIT 10
    `, [id_so, today]);
}

router.post('/chat', authenticate, async (req, res) => {
    try {
        const { messages } = req.body;
        const id_so = req.user.id_so;

        const tools = [
            {
                type: "function",
                function: {
                    name: "search_acts",
                    description: "Rechercher des actes ou des dossiers dans le registre général.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Le nom du client ou la référence à chercher" }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "search_contacts",
                    description: "Rechercher un contact dans l'annuaire téléphonique.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Le nom ou le numéro de téléphone" }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_upcoming_events",
                    description: "Obtenir les prochains rendez-vous ou audiences du calendrier.",
                    parameters: { type: "object", properties: {} }
                }
            }
        ];

        const response = await openai.chat.completions.create({
            model: "openai/gpt-4o-mini", // Efficient and smart enough for this
            messages: [
                { role: "system", content: "Tu es l'Assistant IA de l'Étude HD, une application de gestion pour huissier de justice. Tu as accès aux données de l'étude (actes, contacts, calendrier). Réponds de manière professionnelle et concise en français. Si tu ne trouves pas d'information, suggère à l'utilisateur de vérifier manuellement." },
                ...messages
            ],
            tools: tools,
            tool_choice: "auto",
        });

        const responseMessage = response.choices[0].message;

        // Check if the model wants to call a tool
        if (responseMessage.tool_calls) {
            const toolResults = [];
            
            for (const toolCall of responseMessage.tool_calls) {
                const functionName = toolCall.function.name;
                const functionArgs = JSON.parse(toolCall.function.arguments);
                
                let result;
                if (functionName === "search_acts") {
                    result = await searchActs(id_so, functionArgs.query);
                } else if (functionName === "search_contacts") {
                    result = await searchContacts(id_so, functionArgs.query);
                } else if (functionName === "get_upcoming_events") {
                    result = await getCalendar(id_so);
                }
                
                toolResults.push({
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: functionName,
                    content: JSON.stringify(result),
                });
            }

            // Second call with tool results
            const secondResponse = await openai.chat.completions.create({
                model: "openai/gpt-4o-mini",
                messages: [
                    { role: "system", content: "Réponds à l'utilisateur en te basant sur les données extraites." },
                    ...messages,
                    responseMessage,
                    ...toolResults
                ],
            });

            return res.json(secondResponse.choices[0].message);
        }

        res.json(responseMessage);

    } catch (err) {
        console.error("AI Assistant Error:", err);
        res.status(500).json({ error: "Erreur lors de la communication avec l'IA. Vérifiez votre clé API OpenRouter." });
    }
});

module.exports = router;
