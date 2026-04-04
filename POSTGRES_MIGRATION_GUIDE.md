# Postgres Migration & Development Guide

This guide describes how to maintain the **Office App** after its migration from SQLite to **Postgres (Vercel/Neon)**. Follow these rules to extend or improve modules (Calendar, Annuaire, CNSS, etc.) without breaking the application.

## 1. Core Principles
- **Multi-Tenancy**: Every record belongs to an office identified by `id_so`. 
- **Rule**: Every query MUST filter by `id_so = req.user.id_so`.
- **Placeholder Handling**: Use `?` in your JS code; our `db.js` wrapper converts them to `$1, $2...` automatically.
- **Type Safety**: Always cast IDs to text in SQL for consistent comparisons: `id_r::text = ?`.

## 2. Table and Column Names
Postgres is case-sensitive for quoted identifiers.
- **Table Names**: Use double quotes for tables with special characters: `FROM "œuvre_type"`.
- **Column Names**: Standardize on lowercase (e.g. `id_so`, `id_r`), but use double quotes for legacy uppercase columns (e.g. `"TVA"`).

## 3. Creating & Updating (INSERT/UPDATE)
- **Primary Keys**: Postgres doesn't have `lastInsertRowid`. You must use `RETURNING` clauses.
- **Rule**: Append `RETURNING <primary_key_column>` to your INSERT/UPDATE queries.
- **Using `db.js`**: `db.run()` automatically attempts to capture returned IDs and puts them in `result.lastID`.

## 4. Middleware & Auth
- **Always** use the `authenticate` middleware for every route.
- **Never** hardcode `id_so`. Always use `req.user.id_so`.

## 5. Deployment Checklist
- Check **`package.json`**: Ensure all used libraries (e.g., `@vercel/postgres`) are in dependencies.
- **Vercel Console**: Any new secrets must be added to the Environment Variables settings on Vercel.

---
*Created on 2026-04-04*
