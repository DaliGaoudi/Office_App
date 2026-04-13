const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');
const db = require('../db');
const authenticate = require('../middleware/auth');
const multer = require('multer');

// Polyfill browser APIs required by pdf-parse in serverless environments (Vercel)
if (typeof global.DOMMatrix === 'undefined') { global.DOMMatrix = class DOMMatrix {}; }
if (typeof global.ImageData === 'undefined') { global.ImageData = class ImageData {}; }
if (typeof global.Path2D   === 'undefined') { global.Path2D   = class Path2D {};   }

const pdfParse = require('pdf-parse');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

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

/**
 * AI Tool: Update Act Status
 */
async function updateActStatus(id_so, id_r, status) {
    // Validate that the record belongs to the user
    const row = await db.get(`SELECT id_r FROM clients_record WHERE id_r = ? AND id_so::text = ?`, [id_r, id_so]);
    if (!row) throw new Error("Accès refusé ou acte inexistant.");

    await db.run(`UPDATE clients_record SET status = ? WHERE id_r = ?`, [status, id_r]);
    return { success: true, message: `L'acte ${id_r} a été mis à jour avec le statut: ${status}.` };
}

/**
 * AI Tool: Manage Calendar (Create/Update/Delete)
 */
async function manageCalendar(id_so, action, id_even, data) {
    if (action === 'create') {
        const { title, start, time_even, description, tribunal_even } = data;
        const res = await db.run(
            `INSERT INTO evenement (title, start, time_even, description, tribunal_even, id_so) VALUES (?, ?, ?, ?, ?, ?)`,
            [title, start, time_even, description, tribunal_even, id_so]
        );
        return { success: true, id: res.lastID, message: "Événement créé avec succès." };
    }
    
    // For Update/Delete, verify ownership
    const row = await db.get(`SELECT id_even FROM evenement WHERE id_even = ? AND id_so::text = ?`, [id_even, id_so]);
    if (!row) throw new Error("Événement non trouvé ou accès refusé.");

    if (action === 'delete') {
        await db.run(`DELETE FROM evenement WHERE id_even = ?`, [id_even]);
        return { success: true, message: "Événement supprimé." };
    }
    
    if (action === 'update') {
        const { title, start, time_even, description, tribunal_even } = data;
        await db.run(
            `UPDATE evenement SET title=?, start=?, time_even=?, description=?, tribunal_even=? WHERE id_even=?`,
            [title, start, time_even, description, tribunal_even, id_even]
        );
        return { success: true, message: "Événement mis à jour." };
    }
}

/**
 * AI Tool: Modify Registry Record (Any field)
 */
async function modifyRegistryRecord(id_so, id_r, updates) {
    const row = await db.get(`SELECT id_r FROM clients_record WHERE id_r = ? AND id_so::text = ?`, [id_r, id_so]);
    if (!row) throw new Error("Acte non trouvé ou accès refusé.");

    const keys = Object.keys(updates);
    if (keys.length === 0) return { success: true, message: "Aucune mise à jour fournie." };

    const setStr = keys.map(k => `${k} = ?`).join(', ');
    const params = [...Object.values(updates), id_r];

    await db.run(`UPDATE clients_record SET ${setStr} WHERE id_r = ?`, params);
    return { success: true, message: `L'acte ${id_r} a été mis à jour.` };
}

/**
 * AI Tool: Get Case Intelligence (Record + History)
 */
async function getCaseIntelligence(id_so, id_r) {
    const record = await db.get(`SELECT * FROM clients_record WHERE id_r = ? AND id_so::text = ?`, [id_r, id_so]);
    if (!record) return { error: "Dossier non trouvé." };

    const steps = await db.all(`SELECT * FROM "œuvre_type" WHERE id_o::text = ? ORDER BY date_o ASC`, [id_r]);
    return { record, history: steps };
}

/**
 * AI Tool: Comprehensive Client Search
 */
async function searchAllClients(id_so, query) {
    const fromRegistry = await db.all(
        `SELECT id_r, nom_cl1, nom_cl2, de_part, ref FROM clients_record WHERE id_so::text = ? AND (nom_cl1 LIKE ? OR nom_cl2 LIKE ? OR de_part LIKE ?) LIMIT 5`,
        [id_so, `%${query}%`, `%${query}%`, `%${query}%`]
    );
    const fromContacts = await db.all(
        `SELECT id_tel, nom, prenom, num_tel1 FROM telephone WHERE id_so::text = ? AND (nom LIKE ? OR prenom LIKE ?) LIMIT 5`,
        [id_so, `%${query}%`, `%${query}%`]
    );
    return { registryMatches: fromRegistry, contactMatches: fromContacts };
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
                    description: "Rechercher des actes ou des dossiers.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Nom ou référence" }
                        }
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "update_act_status",
                    description: "Changer rapidement le statut d'un acte.",
                    parameters: {
                        type: "object",
                        properties: {
                            id_r: { type: "number" },
                            status: { type: "string", enum: ['not_started', 'has_deposit', 'in_progress', 'completed'] }
                        },
                        required: ["id_r", "status"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "manage_calendar",
                    description: "Ajouter, modifier ou supprimer un événement du calendrier.",
                    parameters: {
                        type: "object",
                        properties: {
                            action: { type: "string", enum: ['create', 'update', 'delete'] },
                            id_even: { type: "number", description: "Requis pour update/delete" },
                            data: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    start: { type: "string", description: "Format YYYY-MM-DD" },
                                    time_even: { type: "string", description: "Format HH:MM" },
                                    description: { type: "string" },
                                    tribunal_even: { type: "string" }
                                }
                            }
                        },
                        required: ["action"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "modify_registry_record",
                    description: "Modifier n'importe quel détail d'un acte (adresse, noms, remarques).",
                    parameters: {
                        type: "object",
                        properties: {
                            id_r: { type: "number" },
                            updates: {
                                type: "object",
                                description: "Champs à mettre à jour (ex: {nom_cl1: 'Nouveau Nom', cl1_adresse: '...' })"
                            }
                        },
                        required: ["id_r", "updates"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "get_case_intelligence",
                    description: "Obtenir l'historique complet d'un dossier pour analyse et résumé.",
                    parameters: {
                        type: "object",
                        properties: { id_r: { type: "number" } },
                        required: ["id_r"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "search_all_clients_comprehensive",
                    description: "Rechercher un client partout (registre et annuaire).",
                    parameters: {
                        type: "object",
                        properties: { query: { type: "string" } },
                        required: ["query"]
                    }
                }
            }
        ];

        const response = await openai.chat.completions.create({
            model: "openai/gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `Tu es l'Intelligence de l'Étude HD. Tu gères le cabinet d'huissier.
                        - Tu as plein accès au calendrier et au registre général.
                        - Tu peux LIRE, CRÉER et MODIFIER des événements et des dossiers.
                        - Tu peux analyser l'historique d'un cas (get_case_intelligence) pour en faire des résumés.
                        - Tu peux auto-compléter des infos si tu les trouves dans l'annuaire lors de la création d'actes.
                        Reste professionnel, précis et confirme toujours les modifications.` 
                },
                ...messages
            ],
            tools: tools,
            tool_choice: "auto",
        });

        const responseMessage = response.choices[0].message;

        if (responseMessage.tool_calls) {
            const toolResults = [];
            
            for (const toolCall of responseMessage.tool_calls) {
                const functionName = toolCall.function.name;
                const functionArgs = JSON.parse(toolCall.function.arguments);
                
                let result;
                try {
                   if (functionName === "search_acts") {
                       result = await searchActs(id_so, functionArgs.query);
                   } else if (functionName === "update_act_status") {
                       result = await updateActStatus(id_so, functionArgs.id_r, functionArgs.status);
                   } else if (functionName === "manage_calendar") {
                       result = await manageCalendar(id_so, functionArgs.action, functionArgs.id_even, functionArgs.data);
                   } else if (functionName === "modify_registry_record") {
                       result = await modifyRegistryRecord(id_so, functionArgs.id_r, functionArgs.updates);
                   } else if (functionName === "get_case_intelligence") {
                       result = await getCaseIntelligence(id_so, functionArgs.id_r);
                   } else if (functionName === "search_all_clients_comprehensive") {
                       result = await searchAllClients(id_so, functionArgs.query);
                   } else if (functionName === "search_contacts") {
                       result = await searchContacts(id_so, functionArgs.query);
                   } else if (functionName === "get_upcoming_events") {
                       result = await getCalendar(id_so);
                   }
                } catch (e) {
                   result = { error: e.message };
                }
                
                toolResults.push({
                    tool_call_id: toolCall.id,
                    role: "tool",
                    name: functionName,
                    content: JSON.stringify(result),
                });
            }

            const secondResponse = await openai.chat.completions.create({
                model: "openai/gpt-4o-mini",
                messages: [
                    { role: "system", content: "Réponds à l'utilisateur avec une synthèse claire des données ou confirme les changements." },
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
        res.status(500).json({ error: "Erreur IA. Vérifiez la configuration OpenRouter." });
    }
});

router.post('/extract', authenticate, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Aucun fichier reçu." });
        }

        const file = req.file;
        const mimeType = file.mimetype;
        let extractionPrompt = `أنت مساعد ذكاء اصطناعي متخصص في قراءة محاضر المعدل المنفذ (huissier de justice) التونسية.

## مهمتك:
استخراج البيانات من الوثيقة المرفقة وإعادتها بصيغة JSON فقط — بدون أي شرح أو نص إضافي.

## قواعد مهمة جدًا:
1. **تجاهل تمامًا أي نص مكتوب باليد** (الخطوط الزرقاء/السوداء الملتوية). ركّز فقط على النص المطبوع أو المكتوب بالآلة.
2. **لا تخترع بيانات** — إذا لم تجد قيمة واضحة، اترك الحقل فارغًا "".
3. **اكتب الأسماء كما هي بالعربية** دون ترجمة.

## دليل موقع كل حقل في الوثيقة:
- **de_part** (طالب الخدمة): الجهة الطالبة — تظهر في عبارة "ويطلب من:" أو "بطلب من:". عادةً شركة أو جهة قدّمت الطلب.
- **nom_cl1**: نفس طالب الخدمة في الغالب (اسم الجهة الطالبة الكامل).
- **nom_cl2** (المطلوب): الجهة المستهدفة بالتبليغ — تظهر في عبارة "توجهت إلى:" أو "حللت مخاطبًا:".
- **remarque**: نوع/عنوان المحضر — يظهر في أعلى الصفحة (مثل: محضر تبليغ مستندات تعقيب، محضر عقلة، محضر حجز...).
- **cl1_adresse**: عنوان الطالب إذا ذُكر.
- **cl2_adresse**: عنوان المطلوب إذا ذُكر (عادةً بعد "توجهت إلى:").
- **tribunal**: اسم المحكمة المذكورة في الوثيقة.
- **date_s**: تاريخ تحرير المحضر — يظهر في عبارة "في اليوم..." أو في نهاية الوثيقة. الصيغة المطلوبة: YYYY-MM-DD.
- **origine**: إجمالي الأتعاب أو المجموع — يظهر في الجدول المالي في أسفل الصفحة في خانة "المجموع" أو "أصل المحضر". أعطني الرقم فقط بدون وحدات.

## صيغة الإجابة المطلوبة (JSON فقط):
{
  "de_part": "",
  "nom_cl1": "",
  "nom_cl2": "",
  "remarque": "",
  "cl1_adresse": "",
  "cl2_adresse": "",
  "tribunal": "",
  "date_s": "",
  "origine": ""
}`;

        let messages = [
            { role: "system", content: extractionPrompt }
        ];

        // Handle PDF Text
        if (mimeType === 'application/pdf') {
            const pdfData = await pdfParse(file.buffer);
            const text = pdfData.text;
            messages.push({
                role: "user",
                content: `Voici le texte extrait du document:\n\n${text}`
            });
        } 
        // Handle Images (JPEG, PNG, WEBP)
        else if (mimeType.startsWith('image/')) {
            const base64Image = file.buffer.toString('base64');
            const dataUrl = `data:${mimeType};base64,${base64Image}`;
            
            messages.push({
                role: "user",
                content: [
                    { type: "text", text: "Extrais les informations de cette image selon le format JSON demandé." },
                    { type: "image_url", image_url: { url: dataUrl } }
                ]
            });
        } else {
            return res.status(400).json({ error: "Type de fichier non supporté. Envoyez un PDF ou une image." });
        }

        const response = await openai.chat.completions.create({
            model: "openai/gpt-4o-mini", // Very capable for OCR and JSON parsing
            messages: messages,
            response_format: { type: "json_object" }
        });

        let jsonResult = response.choices[0].message.content;
        
        try {
            const parsed = JSON.parse(jsonResult);
            res.json({ success: true, data: parsed });
        } catch (e) {
            console.error("Failed to parse JSON cleanly:", jsonResult);
            res.status(500).json({ error: "L'IA a retourné un format invalide." });
        }

    } catch (err) {
        console.error("AI File Extraction Error:", err);
        res.status(500).json({ error: err.message || "Erreur d'extraction IA." });
    }
});

module.exports = router;
