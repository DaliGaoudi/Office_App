/*
 * Standing up an office database: the schema, and the indexes the inherited
 * schema never had.
 *
 * Shared so the index list lives in exactly one place — it is applied by
 * provision_office.js (new office, by hand), create_office.js (new office, fully
 * automated) and migrate_add_indexes.js (office already deployed).
 */
const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '..', 'schema.sql');

/*
 * `admin_admin` has no primary key and no unique username, so nothing stops two
 * accounts sharing a login name. Every request filters by id_so, which without
 * these is a sequential scan.
 */
const HARDENING_INDEXES = [
    { name: 'admin_admin_username_key', table: 'admin_admin', ddl: `CREATE UNIQUE INDEX IF NOT EXISTS admin_admin_username_key ON admin_admin (username)` },
    { name: 'clients_record_id_so_idx', table: 'clients_record', ddl: `CREATE INDEX IF NOT EXISTS clients_record_id_so_idx ON clients_record (id_so)` },
    { name: 'clients_record_ref_idx', table: 'clients_record', ddl: `CREATE INDEX IF NOT EXISTS clients_record_ref_idx ON clients_record (ref)` },
    { name: 'cnss_id_so_idx', table: 'cnss', ddl: `CREATE INDEX IF NOT EXISTS cnss_id_so_idx ON cnss (id_so)` },
    { name: 'cnss_oeuvre_id_cn_idx', table: 'cnss_oeuvre', ddl: `CREATE INDEX IF NOT EXISTS cnss_oeuvre_id_cn_idx ON cnss_oeuvre (id_cn)` },
    { name: 'evenement_id_so_idx', table: 'evenement', ddl: `CREATE INDEX IF NOT EXISTS evenement_id_so_idx ON evenement (id_so)` },
    { name: 'telephone_id_so_idx', table: 'telephone', ddl: `CREATE INDEX IF NOT EXISTS telephone_id_so_idx ON telephone (id_so)` },
    { name: 'audit_logs_created_at_idx', table: 'audit_logs', ddl: `CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC)` },
    { name: 'attachments_record_idx', table: 'attachments', ddl: `CREATE INDEX IF NOT EXISTS attachments_record_idx ON attachments (id_so, record_type, record_id)` },
];

const readSchema = () => {
    if (!fs.existsSync(SCHEMA_PATH)) {
        throw new Error(`${SCHEMA_PATH} not found — generate it with: node server/scripts/dump_schema.js`);
    }
    return fs.readFileSync(SCHEMA_PATH, 'utf8');
};

// Apply schema.sql. Every statement is CREATE ... IF NOT EXISTS, so this is safe
// to re-run on a database that is already set up.
const applySchema = async (pool) => { await pool.query(readSchema()); };

/*
 * Apply the indexes, reporting each rather than failing the run. The unique
 * username index legitimately fails on a database that already has duplicates,
 * and that should not stop the rest.
 */
const applyIndexes = async (pool, log = console) => {
    const created = [];
    for (const { name, ddl } of HARDENING_INDEXES) {
        try { await pool.query(ddl); created.push(name); }
        catch (e) { log.warn(`  ! index ${name} skipped (${e.message.split('\n')[0]})`); }
    }
    return created;
};

module.exports = { SCHEMA_PATH, HARDENING_INDEXES, readSchema, applySchema, applyIndexes };
