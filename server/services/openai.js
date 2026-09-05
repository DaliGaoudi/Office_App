const { OpenAI } = require('openai');

// Lazily create the OpenAI/OpenRouter client so the server can boot WITHOUT an
// API key. AI features then fail only when actually used, instead of crashing
// the whole server at startup (e.g. local dev without a key). Shared by the AI
// routes and the CNSS extraction service.
let _openai = null;
function getOpenAI() {
    if (!_openai) {
        const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('AI is not configured on the server (set OPENROUTER_API_KEY or OPENAI_API_KEY).');
        }
        _openai = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey,
            defaultHeaders: {
                "HTTP-Referer": "https://study-hd.vercel.app",
                "X-Title": "Study HD Office App",
            }
        });
    }
    return _openai;
}

module.exports = { getOpenAI };
