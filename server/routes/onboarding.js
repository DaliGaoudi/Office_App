const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPassword } = require('../services/password');
const { OFFICE_KEYS, getOfficeProfile } = require('../services/officeProfile');
const { logActivity } = require('../utils/logger');

/*
 * First-run onboarding for a NEW office deployment.
 *
 * Ported from the desktop app's Onboarding screen, but the web version has to be
 * far more careful: the desktop app is a single local process behind a license
 * activation, while this is a public URL. `POST /complete` creates an administrator
 * account without any authentication, so the ONLY thing standing between the
 * internet and an admin account on someone's office is the "no users exist yet"
 * check in `isFreshDeployment()`.
 *
 * That check is deliberately the narrowest possible: a single row in admin_admin —
 * created by onboarding itself, or by provision_office.js — closes this door
 * permanently. There is no flag an operator can flip back, and no way to re-run it.
 */

const SETUP_DONE_KEY = 'onboarding_done';

// Map the client's camelCase form fields onto the app_settings keys.
const FIELD_TO_KEY = {
    officeName: 'office_name',
    officeNameFr: 'office_name_fr',
    officeCity: 'office_city',
    officeAddress: 'office_address',
    officePhone: 'office_phone',
    officeFax: 'office_fax',
    taxId: 'office_tax_id',
    officeRib: 'office_rib',
    officeCnss: 'office_cnss',
    officeJurisdiction: 'office_jurisdiction',
    cnssBureau: 'cnss_bureau',
    cnssRegion: 'cnss_region',
};

/*
 * True only while the deployment has no user accounts at all.
 *
 * A missing admin_admin table also counts as fresh — a database that has had
 * schema.sql applied but nothing seeded. Any error other than "table not found"
 * is treated as NOT fresh, so a transient database failure can never open the
 * onboarding door on a live office.
 */
async function isFreshDeployment() {
    try {
        const row = await db.get(`SELECT COUNT(*)::int AS n FROM admin_admin`);
        return Number(row && row.n) === 0;
    } catch (err) {
        if (/relation .* does not exist/i.test(err.message || '')) return true;
        console.error('Onboarding freshness check failed:', err.message);
        return false;
    }
}

/*
 * Public status. Also serves the office display name, which is how the client
 * brands itself (sidebar heading + browser tab) — that name has to be readable
 * before anyone logs in, and it is already public on every act the office issues.
 */
router.get('/status', async (req, res) => {
    try {
        const needsOnboarding = await isFreshDeployment();
        let officeName = '';
        if (!needsOnboarding) {
            try {
                const row = await db.get(`SELECT value FROM app_settings WHERE key = 'office_name'`);
                officeName = (row && row.value) || '';
            } catch { /* settings table may not exist yet */ }
        }
        res.json({ needsOnboarding, officeName });
    } catch (err) {
        console.error('Onboarding status error:', err);
        // Fail closed: never report a live office as needing setup.
        res.json({ needsOnboarding: false, officeName: '' });
    }
});

/*
 * Complete first-run setup: office profile + VAT rate + the first administrator.
 * Public, and callable exactly once per deployment.
 */
router.post('/complete', async (req, res) => {
    try {
        if (!(await isFreshDeployment())) {
            return res.status(409).json({ error: 'تم إعداد هذا التنصيب مسبقاً.' });
        }

        const b = req.body || {};
        const username = String(b.username || '').trim();
        const password = String(b.password || '');

        if (!username) return res.status(400).json({ error: 'اسم المستخدم مطلوب.' });
        if (password.length < 8) {
            return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' });
        }

        // Office profile — every key written, blank when not supplied, so the
        // Settings page shows a complete form afterwards.
        const profile = Object.fromEntries(OFFICE_KEYS.map((k) => [k, '']));
        for (const [field, key] of Object.entries(FIELD_TO_KEY)) {
            if (b[field] !== undefined) profile[key] = String(b[field]).slice(0, 400);
        }

        const tvaRaw = String(b.tvaRate == null ? '' : b.tvaRate).replace(',', '.').trim();
        const tvaRate = tvaRaw === '' || isNaN(parseFloat(tvaRaw)) ? '19' : String(parseFloat(tvaRaw));

        const upsert = `INSERT INTO app_settings (key, value, updated_at)
                        VALUES (?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(key) DO UPDATE
                          SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
                        RETURNING key`;
        for (const [key, value] of Object.entries(profile)) await db.run(upsert, [key, value]);
        await db.run(upsert, ['tva_rate', tvaRate]);

        // The office's tenant id. Each office has its own database, so a fixed '1'
        // is enough — id_so still has to be present and consistent because every
        // data query filters on it.
        const idSo = '1';

        // Create the administrator LAST: this insert is what closes onboarding, so
        // nothing should be able to fail after it and leave the door open.
        await db.run(
            `INSERT INTO admin_admin (username, password, role, societe, id_so)
             VALUES (?, ?, 'admin', ?, ?) RETURNING id`,
            [username, await hashPassword(password), profile.office_name || '', idSo]
        );

        await db.run(upsert, [SETUP_DONE_KEY, new Date().toISOString()]);

        await logActivity(
            { id: null, username, id_so: idSo },
            'CREATE', 'USER', `إتمام الإعداد الأولي للمكتب وإنشاء حساب المدير: ${username}`
        ).catch(() => {});

        res.status(201).json({ ok: true, profile: await getOfficeProfile() });
    } catch (err) {
        console.error('Onboarding complete error:', err);
        res.status(500).json({ error: 'تعذّر إتمام الإعداد.' });
    }
});

/*
 * Sample act rendered with the details currently typed into the form (not yet
 * saved), so the office can check its letterhead before committing. The desktop
 * app opens Word directly; a browser gets a download instead.
 *
 * Gated on the same freshness check — once the office is set up this endpoint is
 * closed, so it can never be used to generate acts without logging in.
 */
router.post('/preview.docx', async (req, res) => {
    try {
        if (!(await isFreshDeployment())) {
            return res.status(409).json({ error: 'تم إعداد هذا التنصيب مسبقاً.' });
        }

        // Required lazily: routes/cnss.js pulls in the AI/extraction stack, which
        // need not be loadable for onboarding to work.
        const { renderActs, buildActRecord } = require('./cnss');

        const b = req.body || {};
        const office = {};
        for (const [field, key] of Object.entries(FIELD_TO_KEY)) {
            office[key] = b[field] === undefined ? '' : String(b[field]).slice(0, 400);
        }

        const sampleCompany = {
            nom_cl2: 'شركة نموذجية ش.م.م',
            numcnss: '4543508503',
            codeng: '04',
            cl2_adresse: 'المنطقة الصناعية',
            cl2_adresse2: office.office_city || '',
        };
        const sampleCard = {
            nbrreg: '2026/1', numcarte: '4621400216', datecarte: '12/03/2026',
            semestre: '04/2025', dette: '2959.306', datesins: '16/01/2026',
            fee_original: '5000', fee_copies: '1500', fee_post: '2000',
        };

        const buf = renderActs([buildActRecord(sampleCompany, sampleCard)], office);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', 'attachment; filename="preview.docx"');
        res.send(buf);
    } catch (err) {
        console.error('Onboarding preview error:', err);
        res.status(500).json({ error: 'تعذّر توليد المعاينة.' });
    }
});

module.exports = router;
