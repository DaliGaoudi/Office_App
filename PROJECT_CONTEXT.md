# Project Context — Huissier / CNSS Office Management Web App

> **Purpose of this file:** a single, self-contained briefing so any future LLM (or developer)
> can understand what this app is, how it's built, and where things live — without re-reading
> the whole tree. Keep it updated when architecture changes.

---

## 1. What this app is

A bilingual (Arabic-first / French) **legal office management system** for a Tunisian
**huissier de justice / عدل منفذ** (judicial enforcement officer / bailiff) — the office of
**الأستاذ مراد القعودي** ("مكتب الأستاذ مراد القعودي"). It digitizes the office's paper registers,
billing, contacts, calendar, and a specialized **CNSS** (الصندوق الوطني للضمان الاجتماعي / Tunisian
social-security fund) debt-recovery workflow.

The whole UI is **right-to-left Arabic**. Currency is the Tunisian dinar handled internally in
**millimes** (integers); display/conversion-to-Arabic-words happens client-side.

> Note: `package.json` calls itself `cnss-scanner-desktop` and mentions Electron, but the live
> product is a **web app** (React SPA + Express API) deployed to **Vercel**. The Electron/desktop
> framing is legacy/aspirational; there is no active `electron/` build in use here.

---

## 2. Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 (Vite SPA), `react-router-dom`, `lucide-react` icons, `recharts` charts. No CSS framework — custom CSS with glassmorphism + light/dark theme via `data-theme`. |
| Backend | Node.js + **Express 5**, JWT auth (`jsonwebtoken`), `bcryptjs`, `multer` (uploads), `morgan` logging. |
| Database | **Vercel Postgres** in production; the code keeps SQLite-style `?` placeholders and a thin shim converts them to `$1,$2,…` (see `server/db.js`). Legacy SQLite files (`office_data.db`) exist but prod is Postgres. |
| AI | **OpenRouter** (OpenAI-compatible SDK, `baseURL: openrouter.ai`), model **`openai/gpt-4o-mini`**. Used for the in-app assistant and CNSS document extraction (vision + PDF text). |
| Docs | **docxtemplater** + **pizzip** generate Word (.docx) acts from templates in `server/assets/`. |
| Deploy | **Vercel** monorepo: `client` (static build) + `server/index.js` (`@vercel/node`). Daily cron `0 3 * * *` → `/api/backup`. |
| Scanning | A local **Scan Bridge** (PowerShell + Windows WIA) lets the browser drive a USB scanner. See `scan-watcher/`. |

---

## 3. Repo layout

```
modern_app/
├── client/                 # React SPA (Vite)
│   ├── src/
│   │   ├── App.jsx         # Auth + Theme context, Sidebar, Layout, ALL routes
│   │   ├── config.js       # API_BASE (the one config every page imports)
│   │   ├── pages/          # one file per screen (see §6)
│   │   ├── components/     # AIAssistant, BillModal, AutocompleteInput, Pagination
│   │   └── utils/          # formatters, numberToArabicWords, cnssScan
│   └── dist/               # built output incl. scan-bridge-setup.zip (committed; Vercel can't build it)
├── server/
│   ├── index.js            # Express entry + route registry (§4)
│   ├── db.js               # Postgres pool + ?→$n placeholder shim
│   ├── middleware/auth.js  # JWT authenticate() → req.user
│   ├── routes/             # one router per domain (§4)
│   ├── services/           # openai, cnssExtract, records, backup
│   ├── utils/logger.js     # logActivity() audit logging
│   ├── scripts/            # one-off migrations / DB maintenance
│   └── assets/             # template_cnss.docx (Word act template)
├── scan-watcher/           # local Scan Bridge (PowerShell/WIA) + optional Node watcher
├── vercel.json             # builds, rewrites, backup cron
└── graphify-out/           # knowledge graph of this repo (query before grepping — see §9)
```

---

## 4. Backend API (mounted in `server/index.js`)

All under `/api`. Almost every write goes through `logActivity()` (audit log) and is scoped by
**`id_so`** (the office/tenant id baked into the JWT — multi-tenant pattern).

| Mount | File | Responsibility |
|---|---|---|
| `/api/auth` | `routes/auth.js` | Login → JWT (`{ id, role, id_so }`, 1-day expiry). bcrypt passwords. |
| `/api/registre` | `routes/registre.js` | **General register** (table `clients_record`). Search, CRUD, billing list, **TVA cache**. |
| `/api/execution` | `routes/execution.js` | **Execution register** — same `clients_record` table filtered by `is_execution` flag; supports per-record "actions" (`oeuvre_type`). |
| `/api/cnss` | `routes/cnss.js` | **CNSS register** (`cnss` + `cnss_oeuvre`): scan→AI extract→auto-create record, Word act generation. |
| `/api/telephone` | `routes/telephone.js` | Phone directory (`telephone`). |
| `/api/calendar` | `routes/calendar.js` | Events/hearings (`evenement`). |
| `/api/dashboard` | `routes/dashboard.js` | Aggregate stats for the home dashboard. |
| `/api/ai` | `routes/ai.js` | In-app assistant (tool-calling over acts/contacts/calendar) + `/extract-cnss` prefill. |
| `/api/suggestions` | `routes/suggestions.js` | Autocomplete suggestions. |
| `/api/users` | `routes/users.js` | User CRUD (admin only). |
| `/api/portal` | `routes/portal.js` | Client-portal read-only view of their own files. |
| `/api/data-cleaning` | `routes/data-cleaning.js` | Admin DB cleanup tools. |
| `/api/audit` | `routes/audit.js` | Audit log viewer (`audit_logs`). |
| `/api/accounting` | `routes/accounting.js` | Accounting stats (admin). |
| `/api/attachments` | `routes/attachments.js` | File uploads (Vercel Blob or DB fallback) + `scan_targets` (which record a user has open). |
| `/api/backup` | `routes/backup.js` | JSON DB dump; called by the daily Vercel cron. |
| `/api/settings` | `routes/settings.js` | Global settings (`app_settings`, e.g. `tva_rate`). On PUT, flushes the registre TVA cache. |
| `/api/license` | `routes/license.js` | Is this office suspended? Answers the SPA's block screen (§12). |
| `/api/export` | `routes/export.js` | Admin download of the whole database as JSON. Stays open while suspended, on purpose. |

`/api/health` reports whether Postgres or SQLite is active.

Every route above sits behind `middleware/license.js`, which 403s the whole API when the control
plane says the office is suspended — see §12 for the allowlist that survives it.

---

## 5. Data model (key tables)

- **`clients_record`** — the central table (most-connected node). Holds both the **general** and
  **execution** registers, distinguished by an `is_execution` flag. Key cols: `id_r` (PK), `ref`
  (عدد ترتيبي / sequential number), `nom_cl1` (client/requester), `nom_cl2` (defendant), `de_part`,
  dates, `status`, and the **fee breakdown columns** (see billing below), `id_so` (tenant).
- **`cnss`** — CNSS debt records (PK `id_cn`). Fields extracted from the *État de Liquidation*:
  `nom_cl2` (employer/debtor), `numcnss`, `codeng`, `numcarte` (بطاقة جبر number), `datecarte`,
  `semestre`, `dette` (amount owed).
- **`cnss_oeuvre`** — actions/sub-records attached to a CNSS file (PK `id_cn_oe`).
- **`oeuvre_type`** — catalog of action types for execution records.
- **`evenement`** — calendar events (hearings): `title`, `start`, `time_even`, `tribunal_even`.
- **`telephone`** — contacts directory.
- **`admin_admin`** — users (role-based: `superadmin`, `admin`, `user`, `client`).
- **`app_settings`** — key/value globals (notably `tva_rate`).
- **`audit_logs`** — every write operation, via `logActivity()`.
- **`attachments`**, **`scan_targets`** — uploaded files and the "currently open record per user".

`db.run()` auto-appends a broad `RETURNING id_r, id_cn, id, id_even, id_tel, id_o` so inserts can
report `lastID` regardless of which table — a deliberate cross-table hack worth knowing about.

### Billing / TVA formula (important domain rule)
Total = **Fees + VAT + Expenses**, all in millimes:
- **Fees (الأجور, VAT-applicable):** `origine`, `exemple`, `version_bureau`, `orientation`
- **VAT (TVA):** `round(Fees × tva_rate%)`, default **19%**, configurable via `app_settings.tva_rate`
  (cached in `registre.js`, flushed on settings PUT).
- **Expenses (مصاريف, no VAT):** `delimitation`, `inscri`, `mobilite`, `imprimer`, `poste`, `autre`

This same calculation is duplicated across `RecordDetail`, `BillModal`, and `Facturation`
(the "Financial Calculation Triad" — change all three together).

---

## 6. Frontend pages (`client/src/pages/`)

Routing lives entirely in `App.jsx`. Auth + theme are React contexts; JWT + user persist in
`localStorage`. Role `client` sees only the portal.

| Route | Page | Notes |
|---|---|---|
| `/` | `Dashboard` | Stats overview. |
| `/general` | `RegistreGeneral` | General register table (supports `?ref=` global search). |
| `/execution` | `RegistreExecution` | Execution register. |
| `/cnss` | `RegistreCNSS` | CNSS register table; scan/upload to auto-create records. |
| `/cnss/new`, `/cnss/:id` | `RegistreCNSSDetail` | CNSS record detail; scan next بطاقة, generate Word act. |
| `/record/:type/:id` | `RecordDetail` | Shared detail/CRUD for general & execution. |
| `/facturation/{general,execution,cnss}` | `Facturation` | Billing lists (one component, `type` prop). |
| `/telephone` | `Telephone` | Contacts. |
| `/calendar` | `Calendar` | Events. |
| `/settings` | `Settings` | Globals + download scan-bridge zip. |
| `/users`, `/data-cleaning`, `/audit-logs`, `/accounting` | admin-only | RBAC-gated. |
| `/portal` | `PortalDashboard` | Client role only. |

Shared components: **`AIAssistant`** (floating chat, non-client only), **`BillModal`**,
**`AutocompleteInput`**, **`Pagination`**. Utils: **`formatters`** (`formatAmount`),
**`numberToArabicWords`** (millimes → Arabic words for invoices), **`cnssScan`** (client-side
multi-page PDF / scan handling).

---

## 7. The CNSS flow (the headline feature)

1. User scans or uploads a **بطاقة جبر / État de Liquidation** (image or PDF).
2. `services/cnssExtract.js` sends it to GPT-4o-mini with an Arabic system prompt that extracts
   strict JSON: employer name/address, CNSS number + code, card number, date, semester, debt.
   - Images → vision (base64 data URL); PDFs → text via `pdf-parse` (with serverless DOM polyfills).
3. A `cnss` record is auto-created (prefilled), user reviews/edits.
4. From the register, a **Word act** is generated via docxtemplater against
   `server/assets/template_cnss.docx`.
5. Bulk: a multi-page PDF (one بطاقة per page) is split client-side (pdf.js) and each page runs
   through the same `/scan` flow.

There's also a monthly «قائمة مصاريف محاضر تبليغ بطاقات جبر» Word report and per-card delivery
billing (`الأجور` vs `مصاريف` split, see §5).

---

## 8. Auth, roles & multi-tenancy

- JWT in `Authorization: Bearer <token>`; `authenticate()` decodes to `req.user` with
  `{ id, role, id_so }`. Secret from `JWT_SECRET` (has a legacy fallback default).
- Roles: **`superadmin`**, **`admin`**, **`user`**, **`client`**. `isAdmin` gates accounting,
  audit, data-cleaning, users.
- **`id_so`** = office/tenant id; every data query filters by `id_so::text = ?` for isolation.

---

## 9. Environment / running

Env vars (server): `POSTGRES_URL` (else SQLite fallback), `OPENROUTER_API_KEY` (or `OPENAI_API_KEY`),
`JWT_SECRET`, `PORT` (default 3001). Managed offices also carry `CONTROL_PLANE_URL`, `OFFICE_ID`
and `OFFICE_SECRET` (§12); leave all three unset locally and the licence check is a no-op. The AI client is built lazily via `services/openai.js`, so
the server boots without a key and AI features fail only when used. (`data-cleaning.js` used to
build its own client eagerly, which meant a missing key crashed the whole server at startup —
keep new AI call sites on `getOpenAI()`.)

Dev: root `package.json` has workspace scripts (concurrently/nodemon); client Vite dev server
proxies `/api` to the server on `:3001`. Prod: `vercel.json` rewrites `/api/*` → `server/index.js`
and everything else → the SPA `index.html`.

**Scan Bridge:** users download `scan-bridge-setup.zip` from Settings; a hidden PowerShell server
on `127.0.0.1:17171` drives the scanner via WIA so the browser can scan into a record. The zip is
**committed** in `client/dist/` because Vercel can't build it (regenerate with
`scan-watcher/make-zip.ps1`).

## 10. Knowledge graph (token-saving)

A graphify graph exists at **`graphify-out/graph.json`** (466 nodes / 660 edges). For
architecture/"what calls X"/data-flow questions, **query it before grepping**:
`graphify query "<question>"`. God nodes: `clients_record`, `App()`, `API_BASE`, `oeuvre_type`,
`logActivity`. Rebuild after big changes: `/graphify . --update`.

---

## 11. Provisioning a new office (distributing the app)

The app is distributed as **one isolated deployment per office**: its own Vercel project, its
own Postgres, its own Blob store, its own env vars. `id_so` scopes every data query, but tenancy
is *not* complete — `app_settings` (office letterhead **and** `tva_rate`) has no `id_so`, so two
offices must never share a database.

### Commands

| Script | Purpose |
|---|---|
| `node server/scripts/dump_schema.js` | Regenerate `server/schema.sql` from the connected DB. Read-only. Re-run after any migration. |
| `node server/scripts/provision_office.js --url … --office-id … --admin-user …` | Stand up a new office DB: schema → indexes → office profile + `tva_rate` → first bcrypt admin. Prints the generated password once. |
| `node server/scripts/parameterize_cnss_template.js` | Replace hardcoded office identity in `template_cnss.docx` with `{office_*}` tags. Idempotent; already applied. |
| `node server/scripts/verify_act_render.js` | Render an act for a fictitious office and assert no hardcoded identity or unmerged tags remain. Offline. Run this after touching the template. |
| `node server/scripts/backfill_office_fields.js --url … --office-address … ` | Fill office-profile keys on an **existing** office when new `{office_*}` tags are introduced. Only writes keys that are missing/empty; prints a revert statement. |
| `node server/scripts/migrate_add_indexes.js --url … [--dry-run]` | Add the indexes to an existing office DB (new ones get them from the provisioner). Pre-checks duplicate usernames; all reversible with `DROP INDEX`. |
| `node server/scripts/audit_tenancy.js [--verbose]` | Lint route SQL for queries touching tenant tables without an `id_so` filter. Exits 1 on a finding — run it before every release. |
| `node server/scripts/enroll_office.js --project <name> [--apply]` | Bring an office that **already exists** on Vercel under the control plane (§12): registers it, then writes `OFFICE_ID`/`OFFICE_SECRET`/`CONTROL_PLANE_URL` to its project. Repeat `--project` for several. Plan-only without `--apply`. |

`provision_office.js` refuses to run without an explicit `--url` (never reads `server/.env`, which
points at the live office), refuses a URL matching `POSTGRES_URL`, and refuses a database that
already contains users unless `--force`.

### Per-deployment env vars

`POSTGRES_URL`, `JWT_SECRET` (**unique per office** — no fallback exists any more; the server
refuses to boot hosted without it), `OPENROUTER_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`.

### Office profile → documents

`app_settings` holds the `OFFICE_KEYS` in `server/services/officeProfile.js`, edited from
الإعدادات. They feed **both** the monthly list (`template_list.docx`) and now the act itself
(`template_cnss.docx`): letterhead (name, city, address, phone, fax, MF) plus the act body
(`office_name`, `office_address`, `office_jurisdiction`, `cnss_bureau`, `cnss_region`).
`year_words` is computed per render by `yearInArabicWords()` — the year used to be hardcoded as
2026 in the template.

**Blank office fields render as blank sentences in a legal document.** Fill الإعدادات before
generating any act for a new office.

### Passwords

bcrypt (`server/services/password.js`). Legacy unsalted-MD5 rows still verify and are
transparently re-hashed on the user's next successful login. Once
`SELECT count(*) FROM admin_admin WHERE password !~ '^\$2[aby]\$'` is 0 everywhere, the legacy
branch can be deleted.

### Tenancy: the rule that keeps offices apart

`id_so` is the only thing separating offices inside a database. **A query that addresses a row
by primary key alone reaches across offices.** Every route query touching `clients_record`,
`cnss`, `cnss_oeuvre`, `evenement`, `telephone`, `œuvre_type`, `admin_admin` or `case_documents`
must carry `id_so::text = ?` — or be justified in the `ALLOWED` list in
`server/scripts/audit_tenancy.js`.

Fixed instances of this bug (all were reachable by an ordinary office admin or portal client):

- `users.js` — list/update/delete addressed users by `id` with no `id_so`, so an admin could
  read, rename, **reset the password of**, or delete a user in another office.
- `portal.js` — the client portal listed records matching a loose `nom_cl1 LIKE %alias%` across
  every office, and its ownership check was equally unscoped.
- `data-cleaning.js` — the duplicate-name merge ran `UPDATE clients_record SET nom_cl1 = …`
  across every office in the database.
- `suggestions.js` — the autocomplete suggested client/defendant names from every office.

There is deliberately **no `superadmin` bypass**: that role grants nothing beyond `admin`
anywhere in the code, so making it cross-tenant would turn "create a superadmin" into a
privilege escalation. Vendor support uses database access, not a UI role. Note the practical
consequence — a superadmin account whose `id_so` differs from the office (e.g. the vendor's own
login) now sees an empty Users page.

> `œuvre_type` really is spelled with the **œ ligature** in Postgres and must be quoted.
> Earlier notes in this document called it `oeuvre_type`; that table does not exist.

### First-run onboarding & per-deployment branding

A new office deployment configures **itself** — no CLI seeding needed. Point an empty
Postgres at a fresh Vercel project and open it: `client/src/pages/Onboarding.jsx` collects the
office details, VAT rate and the first administrator, previews the letterhead
(`components/LetterheadPreview.jsx`) and, on finish, writes everything through
`POST /api/onboarding/complete`. Ported from the desktop app's Onboarding screen.

**The security model is one check.** `/complete` creates an admin account with no
authentication, so it is guarded solely by `isFreshDeployment()` — "does `admin_admin` have
zero rows". One account, created by onboarding or by `provision_office.js`, closes it forever.
There is no flag to reset. `/preview.docx` is gated the same way. The check fails **closed**:
any database error reports "already set up", so a blip can never reopen setup on a live office.

Branding is **runtime**, not build-time: the sidebar heading and browser tab read
`app_settings.office_name` via the public `GET /api/onboarding/status`, resolved in
`client/src/branding.js` and cached in localStorage. One build therefore serves any office.
The fallback is a generic «مكتب العدل المنفذ» — never another office's name. Only the logo is
still an env var (`VITE_OFFICE_LOGO_URL`), falling back to the bundled `assets/logo.png`.

**A new office still needs its schema applied first.** Nothing creates `app_settings` or
`admin_admin` at runtime (only `attachments`/`scan_targets` self-create), so onboarding would
render but fail on submit against a truly empty database. The normal sequence is:

```
node server/scripts/provision_office.js --url "postgres://…" --schema-only
```

which applies `schema.sql` + indexes and creates **no accounts**, leaving onboarding open. The
full form of the script (with `--office-id`/`--admin-user`) seeds an admin instead, which
CLOSES onboarding permanently — use that only for unattended provisioning.

### Attachments: signed URLs + tenancy

Scanned documents are the most sensitive data in the app, and two things were wrong.

**1. `GET /api/attachments/file/:id` was unauthenticated** — "public by design", because the
client renders the URL as a plain `<a href>` which cannot carry an `Authorization` header. With
Vercel Blob unconfigured, every document is DB-stored and served through that route, so all of
them were readable by anyone at a sequential integer id.

The URL now carries its own authorisation: the authenticated, tenant-scoped list endpoint mints
a short-lived HMAC-signed link (`server/services/attachmentUrl.js`, 6-hour TTL, signed with
`JWT_SECRET`). A bare `/file/:id` is refused with **404**, not 403 — an unauthorised caller
learns nothing about which ids exist. A bearer token whose `id_so` matches the row also works,
for direct API use. **The client needed no change**: it already renders whatever `blob_url` the
list returns.

**2. Neither `attachments` nor `scan_targets` had an `id_so` column.** Both have one now,
required on every read, list and delete, and stamped on write. Uploads additionally verify the
target record belongs to the caller's office before anything is attached to it.

Rows predating the column have `id_so IS NULL` and are **invisible** until attributed — that is
deliberate; the alternative is treating "tenant unknown" as "visible to everyone". The
attribution **runs itself** on the first request after deploy (`backfillTenancy()` in
routes/attachments.js), joining each row back to the record it hangs off and recording
completion in `app_settings.attachments_id_so_backfilled` so the steady-state cost is one
primary-key lookup. **No command to run.**

Rows whose record no longer exists cannot be attributed and stay hidden; that count is logged
and `server/scripts/migrate_attachments_tenancy.js --orphans-to <id_so>` adopts them. That
script is also the way to preview (`--dry-run`) or re-run the migration by hand.

Related fix in `ai.js`: `readCaseDocuments` matched on `record_id` alone, so a CNSS file sharing
a numeric id with a register record would have had its documents read out as that case's. It is
now filtered by `id_so` and `record_type`. Its `extractAttachmentText` also called
`fetch(blob_url)` on a *relative* path, which throws — so the AI had been silently reading
nothing from every DB-stored document. It now loads those bytes straight from the table.

> Still open: Vercel Blob uploads use `access: 'public'`, so once Blob is configured its URLs are
> public and permanent, outside the signing scheme above. Vercel Blob now supports private
> storage; moving to it would need signed reads and a migration of existing URLs.

### Automated office creation

`server/scripts/create_office.js` does everything up to the onboarding form: creates a Neon
project, creates a Vercel project linked to this repo, sets the environment variables, triggers
a production deployment, and applies `schema.sql` + indexes.

```
node server/scripts/create_office.js --name "ben-salah-sfax"           # prints the plan
node server/scripts/create_office.js --name "ben-salah-sfax" --create  # provisions
```

Credentials come from the environment, never arguments (arguments land in shell history and
process listings): `NEON_API_KEY`, `VERCEL_TOKEN`, optional `VERCEL_TEAM_ID`, and
`OPENROUTER_API_KEY` which is copied into the new project.

It deliberately creates **no accounts** — the office's own onboarding screen does that, and
seeding an admin here would close onboarding before it appeared. `JWT_SECRET` is generated fresh
per office: sharing one would let a token from one office be replayed against another, and
attachment link signatures are keyed on it too.

Because a run spends money it prints the plan and exits unless `--create` is passed, refuses a
name that already exists on Vercel, and on a mid-run failure lists every resource it created with
how to delete it — an interrupted run otherwise leaves billable things behind, unnamed.

The index list lives in `services/schemaSetup.js`, shared with `provision_office.js` and
`migrate_add_indexes.js`, so a new office and an existing one cannot drift apart.

> Note this provisions Neon **directly**, so those databases are billed through your Neon account
> rather than appearing under Vercel Storage. Offices created by hand through the Vercel
> Marketplace integration sit in a different place; pick one and stay consistent.

**Provisioning notes learned the hard way:**

- A Neon organization created through Vercel is *managed by Vercel*, and Neon's own API refuses
  project creation on it (`404 action restricted`). The database therefore goes through
  `vercel integration add neon`, not the Neon API.
- The integration injects the connection string itself; `server/db.js` accepts `POSTGRES_URL`
  or `DATABASE_URL` so it works whichever name arrives.
- Vercel's default `ssoProtection` is `all_except_custom_domains`, so the deployment-specific
  URL (`<project>-<hash>.vercel.app`) demands a Vercel login. Give the office the production
  alias `https://<project>.vercel.app`, which is public.

---

## 12. Client management & suspension (the control plane)

Offices are sold, so they can also be switched off. Because each office is its **own** Vercel
project and its **own** database, there is nothing central to turn off — so the deployment asks a
control plane whether it is still allowed to run, and blocks itself when told no.

### Where the panel lives

`../cnss-license-server` — the same server and the same `/admin` page that already manages
desktop licences, now with two tabs: **تراخيص سطح المكتب** (unchanged) and **مكاتب الويب** (new).
One password, one deployment, one list of paying customers.

| Piece | File |
|---|---|
| Registry schema + queries (`offices`, `office_payments`) | `cnss-license-server/lib/offices.js` |
| Check-in + admin endpoints | `cnss-license-server/api/index.js` |
| Offices tab markup/JS | `cnss-license-server/lib/admin-offices.js` |

### How enforcement works

1. The panel registers an office and issues a **check-in secret**, shown once. (For an office
   that already exists, `enroll_office.js` does the registration *and* the wiring in one go —
   it reads the office's public URL and name off the live deployment rather than guessing.)
2. `create_office.js --office-secret … --control-plane …` bakes `OFFICE_ID`, `OFFICE_SECRET` and
   `CONTROL_PLANE_URL` into the new Vercel project (production target only, so preview builds of
   the shared repo don't impersonate an office).
3. The office server calls `POST /api/office/checkin` at most every 15 min (3 min while blocked),
   reporting its commit and a few row counts. The verdict is cached in memory **and** in
   `app_settings.license_state`, so a cold lambda doesn't call home on every request.
4. `server/middleware/license.js` returns **403 `office_suspended`** for everything except the
   allowlist; the SPA swaps the whole app for `components/SuspendedNotice.jsx`.

| Status | Effect on the office |
|---|---|
| `active` | Normal. |
| `suspended` | Blocked with the provider's Arabic message. Data untouched, reversible. |
| `terminated` | Same block, different wording — contract over rather than unpaid. |

### It fails OPEN, deliberately

Missing env vars, an unreachable control plane, or a 401 (unknown office / rotated secret) all
leave the office **working**. This is a bailiff's office; an outage on our side must not stop them
filing an act. The lever we hold is the positive answer `"suspended"`, which an outage cannot
forge — and a cached suspension is never lifted by a *failed* refresh, only by a successful one.

### Still reachable while suspended

`/api/health`, `/api/license/status`, `/api/onboarding/*`, `/api/auth/*`, `/api/backup` (cron) and
**`/api/export/data`**. That last one is the point: `server/routes/export.js` lets the office's
admin download the complete database as JSON even after termination. The registers are the
office's legal work product — withholding them would be indefensible, and for a huissier, a real
problem.

### Billing

`office_payments` is a ledger; recording a payment with «يغطّي إلى» moves the office's `next_due`,
which is what clears the overdue flag in the panel. Suspension is **manual** — nothing
auto-suspends on an overdue date; the panel just shows «متأخر N يوماً» so you can decide.

### Testing

`node server/test_license_gate.js` — stubs the database and stands up a fake control plane, then
asserts the whole matrix: active passes, suspended blocks, the allowlist survives, an outage
doesn't un-suspend, and an unknown/unconfigured office fails open. No database, no real network.
