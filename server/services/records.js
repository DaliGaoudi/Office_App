const db = require('../db');
const { logActivity } = require('../utils/logger');

// Canonical column whitelist for clients_record. Used by both the create
// helper and the AI assistant's modify/create tools so LLM-supplied field
// names can never reach SQL unless they are real columns.
const RECORD_COLUMNS = [
    'id_r', 'montant_partiel1', 'montant_partiel2', 'inscri', 'delimitation', 'poste', 'autre',
    'nom_cl1', 'nom_cl2', 'de_part', 'ref', 'cl1_profession', 'cl1_adresse', 'cl1_avocat',
    'cl1_tel', 'cl1_adressepersonnel', 'cl2_profession', 'cl2_adresse', 'cl2_avocat', 'cl2_tel',
    'cl2_adressepersonnel', 'fin_date', 'remarque', 'date_reg', 'date_inscri', 'origine',
    'exemple', 'imprimer', 'orientation', 'mobilite', 'version_bureau', 'TVA', 'salaire',
    'acompte', 'resume', 'date_ajout', 'id_user', 'id_so', 'status', 'date_s', 'nombre',
    'tribunal', 'resultat', 'tel2_cl1', 'tel2_cl2',
    'service_petitioner_name', 'service_petitioner_contact', 'date_echeance'
];

/**
 * Create a new clients_record. Shared by the registre POST route and the AI
 * assistant's create_record tool so auto-numbering, date_echeance, defaults,
 * the column whitelist, and audit logging live in exactly one place.
 *
 * @param {{id: any, id_so: any}} user  the authenticated user (req.user)
 * @param {object} body                 field/value pairs (only RECORD_COLUMNS are kept)
 * @returns {Promise<object>}           the inserted record incl. id_r
 */
async function createRecord(user, body = {}) {
    const finalRecord = {};

    // 1. Auto-increment ref if not provided
    if (!body.ref) {
        const maxRefRow = await db.get(`SELECT MAX(ref) as max_ref FROM clients_record WHERE id_so = ?`, [user.id_so]);
        finalRecord.ref = (parseInt(maxRefRow?.max_ref) || 0) + 1;
    } else {
        finalRecord.ref = body.ref;
    }

    // 2. Calculate date_echeance (date_reg + 5 days)
    const date_reg = body.date_reg || new Date().toISOString().split('T')[0];
    if (!body.date_echeance && date_reg) {
        try {
            const d = new Date(date_reg);
            if (!isNaN(d.getTime())) {
                d.setDate(d.getDate() + 5);
                finalRecord.date_echeance = d.toISOString().split('T')[0];
            }
        } catch (e) {
            console.error('Error calculating date_echeance:', e);
        }
    }

    RECORD_COLUMNS.forEach(col => {
        if (finalRecord[col] !== undefined) return; // already set (ref or date_echeance)

        const val = body[col];
        if (val !== undefined && val !== null && val !== '') {
            finalRecord[col] = val;
        } else {
            if (col === 'id_user') finalRecord[col] = user.id;
            else if (col === 'id_so') finalRecord[col] = user.id_so;
            else if (col === 'date_ajout') finalRecord[col] = new Date().toLocaleString('fr-FR');
            else if (col === 'status') finalRecord[col] = 'has_deposit';
            else if (['id_r'].includes(col)) {
                // handled by Postgres
            } else if (['nom_cl1', 'nom_cl2', 'de_part', 'date_reg', 'remarque', 'date_s', 'nombre', 'tribunal', 'resultat', 'service_petitioner_name', 'service_petitioner_contact', 'date_echeance', 'date_inscri'].includes(col)) {
                finalRecord[col] = finalRecord[col] || '';
            } else {
                finalRecord[col] = '0';
            }
        }
    });

    const keys = Object.keys(finalRecord).filter(k => finalRecord[k] !== undefined);
    const values = keys.map(k => finalRecord[k]);
    const placeholders = keys.map(() => '?').join(',');
    const quotedKeys = keys.map(k => `"${k}"`);

    let query = `INSERT INTO clients_record (${quotedKeys.join(',')}) VALUES (${placeholders})`;
    if (process.env.POSTGRES_URL) {
        query += ` RETURNING id_r`;
    }

    const result = await db.run(query, values);

    await logActivity(user, 'CREATE', 'RECORD', `إضافة ملف عام جديد عدد ${finalRecord.ref}`);

    return { id_r: result.lastID, ...finalRecord };
}

module.exports = { createRecord, RECORD_COLUMNS };
