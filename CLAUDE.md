# CLAUDE.md

Guidance for Claude Code (and other LLMs) working in this repository.

## Start here

**Read [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) first.** It is the full, self-contained briefing
on what this app is, its stack, API routes, data model, and the CNSS workflow. Everything below is
a quick orientation — the context doc is the source of truth.

## What this is

A bilingual (Arabic-RTL / French) office-management web app for a Tunisian huissier de justice
(عدل منفذ): registers, billing, contacts, calendar, and a CNSS social-security debt-recovery
workflow with AI extraction and Word-act generation. React 18 (Vite) SPA + Express 5 API on Vercel
Postgres, deployed to Vercel.

## Conventions & gotchas

- **UI is right-to-left Arabic.** New UI strings are Arabic; match surrounding tone.
- **Money is in millimes (integers).** Display/word conversion happens client-side (`utils/`).
- **Billing formula** (Fees + VAT + Expenses) is duplicated across `RecordDetail`, `BillModal`,
  and `Facturation` — change all three together (see PROJECT_CONTEXT §5).
- **DB:** code uses SQLite-style `?` placeholders; `server/db.js` rewrites them to `$1,$2,…` for
  Postgres. `db.run()` auto-appends a multi-table `RETURNING` clause.
- **Multi-tenancy:** every data query filters by `id_so` (from the JWT). Don't drop it.
- **Writes are audit-logged** via `logActivity()` — keep new write endpoints logged.
- `package.json` is named `cnss-scanner-desktop` and mentions Electron, but the live product is
  the **web app**; ignore the desktop framing.
- `client/dist/scan-bridge-setup.zip` is committed on purpose (Vercel can't build it); regenerate
  with `scan-watcher/make-zip.ps1`.

## Knowledge graph (token-saving)

A graphify graph exists at `graphify-out/graph.json`. For architecture / "what calls X" /
data-flow questions, run `graphify query "<question>"` **before** grepping broadly. Rebuild after
substantial changes with `/graphify . --update`.
