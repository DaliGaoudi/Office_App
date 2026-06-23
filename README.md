# مكتب الأستاذ مراد القعودي — Office Management Web App

A bilingual (Arabic-RTL / French) management system for a Tunisian **huissier de justice /
عدل منفذ** (judicial enforcement officer). It digitizes the office's paper registers, billing,
contacts, and calendar, and includes a specialized **CNSS** (social-security debt recovery)
workflow with AI document extraction and Word-act generation.

> 📘 **Full architecture & domain briefing:** [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md)
> — read it first (it's also the file to hand to any LLM working on this repo).

## Stack

- **Frontend:** React 18 + Vite SPA (`client/`), react-router, lucide-react, recharts. Custom RTL CSS, light/dark theme.
- **Backend:** Node + Express 5 (`server/`), JWT auth, Postgres (Vercel) with a `?`→`$n` shim, multer uploads.
- **AI:** OpenRouter (`openai/gpt-4o-mini`) — in-app assistant + CNSS *État de Liquidation* extraction.
- **Docs:** docxtemplater generates Word acts from `server/assets/`.
- **Deploy:** Vercel monorepo (static client + `server/index.js` serverless), daily backup cron.

## Layout

```
client/        React SPA (App.jsx = routes + auth/theme context; pages/, components/, utils/)
server/        Express API (index.js entry, routes/, services/, db.js, middleware/auth.js)
scan-watcher/  Local Scan Bridge (PowerShell + Windows WIA) so the browser can drive a scanner
graphify-out/  Knowledge graph of the repo — query before grepping
```

## Running locally

Set server env vars: `POSTGRES_URL`, `OPENROUTER_API_KEY` (or `OPENAI_API_KEY`), `JWT_SECRET`,
optional `PORT` (default 3001). Use the root `package.json` workspace scripts to run the API and
the Vite client together (the client proxies `/api` to `:3001`). The server boots without an AI
key — AI features just fail when used. See [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) §9 for details.

## Key concepts

- **Roles:** `superadmin` / `admin` / `user` / `client`; data is tenant-scoped by `id_so`.
- **Registers:** general & execution share the `clients_record` table (via `is_execution`); CNSS uses `cnss` / `cnss_oeuvre`.
- **Billing:** Total = Fees + VAT (default 19%, configurable) + Expenses, in **millimes**.
  This formula is duplicated across `RecordDetail`, `BillModal`, and `Facturation` — change all three together.
