const { getOpenAI } = require('./openai');

// Polyfill browser APIs pdf-parse expects in serverless environments (Vercel).
if (typeof global.DOMMatrix === 'undefined') { global.DOMMatrix = class DOMMatrix {}; }
if (typeof global.ImageData === 'undefined') { global.ImageData = class ImageData {}; }
if (typeof global.Path2D === 'undefined') { global.Path2D = class Path2D {}; }
const pdfParse = require('pdf-parse');

// Single source of truth for the "État de Liquidation" extraction prompt, shared
// by /api/ai/extract-cnss (prefill) and /api/cnss/scan (auto-create a record).
const PROMPT = `أنت مساعد متخصص في قراءة وثيقة "État de Liquidation" الصادرة عن الصندوق الوطني للضمان الاجتماعي التونسي (CNSS). الوثيقة ثنائية اللغة (فرنسية/عربية).

استخرج الحقول التالية وأعدها بصيغة JSON فقط — دون أي شرح:
- nom_cl2: اسم المؤجر/المطلوب (يظهر بعد عبارة "l'employeur"، مثل: SARL DICIMOOV).
- cl2_adresse: عنوان المؤجر (الأسطر الواقعة تحت الاسم).
- numcnss: رقم الانخراط بالصندوق — يظهر بعد "affilié sous le numéro". إذا كان مكوّناً من جزأين مثل "612555 00" فأعد الجزء الأول فقط هنا (612555).
- codeng: الرمز الملحق برقم الانخراط (الجزء الثاني، مثل 00). إن لم يوجد فاتركه "".
- numcarte: عدد بطاقة الجبر — يظهر أعلى يمين الوثيقة بعد "بطاقة جبر عدد" (مثل 4621400216).
- datecarte: تاريخ البطاقة كما هو (مثل 21-05-2026).
- semestre: الثلاثية — حوّل "trimestre X de l'année YYYY" إلى الصيغة "0X/YYYY" (مثال: trimestre 4 / année 2021 ← "04/2021").
- dette: المبلغ المطلوب — يظهر بعد "payer le montant de" (مثل "2 959,306"). أعده كرقم عشري بنقطة، دون مسافات أو فواصل (2959.306).

قواعد مهمة: تجاهل أي نص مكتوب باليد. لا تخترع قيمًا؛ اترك الحقل "" إن لم تجده.

صيغة الإجابة (JSON فقط):
{ "nom_cl2":"", "cl2_adresse":"", "numcnss":"", "codeng":"", "numcarte":"", "datecarte":"", "semestre":"", "dette":"" }`;

/**
 * Run the CNSS extraction on an uploaded/scanned état de liquidation.
 * @param {Buffer} buffer   file bytes
 * @param {string} mimetype e.g. 'image/jpeg' or 'application/pdf'
 * @returns {Promise<object>} the extracted fields (nom_cl2, numcnss, numcarte, …)
 */
async function extractCnssFromFile(buffer, mimetype) {
    const messages = [{ role: "system", content: PROMPT }];

    if (mimetype === 'application/pdf') {
        const pdfData = await pdfParse(buffer);
        messages.push({ role: "user", content: `Voici le texte extrait du document:\n\n${pdfData.text}` });
    } else if (mimetype && mimetype.startsWith('image/')) {
        const dataUrl = `data:${mimetype};base64,${buffer.toString('base64')}`;
        messages.push({
            role: "user",
            content: [
                { type: "text", text: "Extrais les champs de cet état de liquidation au format JSON demandé." },
                { type: "image_url", image_url: { url: dataUrl } }
            ]
        });
    } else {
        throw new Error("Type de fichier non supporté. Envoyez un PDF ou une image.");
    }

    const response = await getOpenAI().chat.completions.create({
        model: "openai/gpt-4o-mini",
        messages,
        response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content);
}

module.exports = { extractCnssFromFile };
