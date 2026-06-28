/*
 * Office profile (letterhead identity) — the bailiff's details merged into the
 * CNSS facturation/list template. Stored as plain key/value rows in app_settings
 * (global, single-office), editable from the Settings page.
 *
 * Keys map 1:1 onto the {office_*} merge tags in template_list.docx.
 */
const db = require('../db');

const OFFICE_KEYS = [
    'office_name',     // اسم العدل المنفذ (عربي)
    'office_name_fr',  // nom en français
    'office_city',     // المدينة (used in the list header date line)
    'office_phone',    // الهاتف
    'office_fax',      // الفاكس
    'office_tax_id',   // المعرّف الجبائي (MF)
    'office_rib',      // الحساب البنكي (RIB)
    'office_cnss',     // معرّف الصندوق (CNSS)
];

// Read the saved office profile; missing keys default to ''.
const getOfficeProfile = async () => {
    const placeholders = OFFICE_KEYS.map(() => '?').join(',');
    const rows = await db.all(`SELECT key, value FROM app_settings WHERE key IN (${placeholders})`, OFFICE_KEYS);
    const out = Object.fromEntries(OFFICE_KEYS.map((k) => [k, '']));
    rows.forEach((r) => { out[r.key] = r.value || ''; });
    return out;
};

module.exports = { OFFICE_KEYS, getOfficeProfile };
