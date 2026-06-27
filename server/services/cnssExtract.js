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

// The extraction model is configurable so we can A/B different vision models on
// real cards without a redeploy. Default: Gemini 2.5 Pro — strongest at noisy
// bilingual (Arabic/French) OCR of physical/scanned papers. Set CNSS_EXTRACT_MODEL
// to e.g. "google/gemini-2.5-flash" (cheaper) or "anthropic/claude-opus-4.1".
const MODEL = process.env.CNSS_EXTRACT_MODEL || 'google/gemini-2.5-pro';

// Below this many characters of extracted text, a PDF is treated as scanned (no
// text layer) and routed to the vision/OCR path instead of plain text.
const MIN_PDF_TEXT = 40;

/**
 * Run the CNSS extraction on an uploaded/scanned état de liquidation.
 * @param {Buffer} buffer   file bytes
 * @param {string} mimetype e.g. 'image/jpeg' or 'application/pdf'
 * @returns {Promise<object>} the extracted fields (nom_cl2, numcnss, numcarte, …)
 */
async function extractCnssFromFile(buffer, mimetype) {
    const messages = [{ role: "system", content: PROMPT }];

    if (mimetype === 'application/pdf') {
        // Try the embedded text layer first (digital PDFs). pdf-parse can throw on
        // some malformed/scanned files — treat any failure as "no usable text".
        let text = '';
        try { text = (await pdfParse(buffer)).text || ''; } catch { /* fall through to OCR */ }

        if (text.trim().length >= MIN_PDF_TEXT) {
            messages.push({ role: "user", content: `Voici le texte extrait du document:\n\n${text}` });
        } else {
            // Scanned PDF (no text layer): send the file itself so the model reads it
            // visually. OpenRouter routes to the model's native PDF vision when it
            // supports it (Gemini/Claude do), else falls back to its mistral-ocr
            // engine — either way the scanned page gets OCR'd.
            const dataUrl = `data:application/pdf;base64,${buffer.toString('base64')}`;
            messages.push({
                role: "user",
                content: [
                    { type: "text", text: "Extrais les champs de cet état de liquidation au format JSON demandé." },
                    { type: "file", file: { filename: "etat_liquidation.pdf", file_data: dataUrl } }
                ]
            });
        }
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
        model: MODEL,
        messages,
        response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content);
}

module.exports = { extractCnssFromFile };
