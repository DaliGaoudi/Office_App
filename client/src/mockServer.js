/*
 * The demo backend.
 *
 * The demo is a static build with no server behind it: MirageJS answers every
 * /api call in the browser, and a small fetch shim (installed after Mirage, so
 * it runs first and delegates everything else back) covers the two things Mirage
 * is the wrong tool for —
 *
 *   1. the local Scan Bridge on 127.0.0.1:17171, which in the real product drives
 *      a USB scanner over WIA. The demo answers it with one of the sample
 *      liquidation cards in public/demo/, so scanning works with no driver, no
 *      bridge install and no hardware.
 *   2. the .docx downloads, which need a binary body rather than JSON.
 *
 * Because both are intercepted at the network edge, no page or util file needs a
 * demo branch — the app runs exactly the code it runs in production.
 */
import { createServer, Response } from 'miragejs';
import { buildDocx, P, TABLE } from './demo/miniDocx';
import {
  OFFICE_PROFILE, GENERAL_RECORDS, EXECUTION_RECORDS, EXECUTION_ACTIONS,
  CNSS_COMPANIES, CNSS_CARDS, SCAN_SAMPLES, CONTACTS, EVENTS, USERS,
  AUDIT_LOGS, TIMELINE, shift,
} from './demo/data';

/* ── Mutable in-memory state (a reload resets the demo) ─────────────────── */
const db = {
  general: [...GENERAL_RECORDS],
  execution: [...EXECUTION_RECORDS],
  actions: JSON.parse(JSON.stringify(EXECUTION_ACTIONS)),
  cnss: [...CNSS_COMPANIES],
  cards: [...CNSS_CARDS],
  contacts: [...CONTACTS],
  events: [...EVENTS],
  users: [...USERS],
  audit: [...AUDIT_LOGS],
  settings: { ...OFFICE_PROFILE },
  attachments: [],
  scanIndex: 0,
};
const nextId = () => Math.floor(Date.now() % 1e7) + Math.floor(Math.random() * 1000);

/* ── Money ──────────────────────────────────────────────────────────────── */
const int = (v) => parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10) || 0;
const FEE_KEYS = ['origine', 'exemple', 'version_bureau', 'orientation'];
const EXP_KEYS = ['delimitation', 'inscri', 'mobilite', 'imprimer', 'poste', 'autre'];
const vatRate = () => parseFloat(db.settings.tva_rate) || 19;

function billing(rec) {
  const base_fare = FEE_KEYS.reduce((s, k) => s + int(rec[k]), 0);
  const expenses = EXP_KEYS.reduce((s, k) => s + int(rec[k]), 0);
  const tva = Math.round(base_fare * vatRate() / 100);
  return { base_fare, tva, expenses, calculated_total: base_fare + tva + expenses };
}

/*
 * The register tables read a pre-totalled column the server computes in SQL —
 * `salaire` in the general register, `total_salaire` in the execution one (which
 * also carries its actions' fees). Decorate every row the same way.
 */
function withTotals(rec) {
  const b = billing(rec);
  const actions = db.actions[rec.id_r] || [];
  const actionTotal = actions.reduce((s, a) => s + billing(a).calculated_total, 0);
  return {
    ...rec, ...b,
    salaire: b.calculated_total,
    total_salaire: b.calculated_total + actionTotal,
  };
}

/* millimes → "D DDD,MMM" */
const dinar = (mm) =>
  String(Math.floor(mm / 1000)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + String(mm % 1000).padStart(3, '0');

/* ── Card fee columns (the CNSS act statement) ──────────────────────────── */
const CARD_AJR = ['fee_original', 'fee_counterparts', 'fee_legal_copy', 'fee_office_copy', 'fee_movement', 'fee_copies'];
const CARD_EXP = ['fee_travel', 'fee_registration', 'fee_stamp', 'fee_post'];
function cardTotals(card) {
  const ajr = CARD_AJR.reduce((s, k) => s + int(card[k]), 0);
  const exp = CARD_EXP.reduce((s, k) => s + int(card[k]), 0);
  const vat = Math.round(ajr * (parseFloat(card.vat_rate) || 19) / 100);
  return { ajr, vat, exp, total: ajr + vat + exp };
}

/* Default fee statement applied to a freshly scanned card. */
const cardFeeDefaults = () => ({
  fee_original: '7000', fee_counterparts: '3000', fee_legal_copy: '2000',
  fee_office_copy: '2000', fee_movement: '6000', fee_copies: '1000',
  fee_travel: '4500', fee_registration: '1500', fee_stamp: '1000', fee_post: '900',
  fee_aqm: '3990', vat_rate: '19',
});

/* Same rule as the app: the 16th of the month after the quarter closes. */
function derivePenaltyDate(semestre) {
  const m = /^\s*(\d{1,2})\s*\/\s*(\d{4})\s*$/.exec(semestre || '');
  if (!m) return '';
  const q = parseInt(m[1], 10);
  let y = parseInt(m[2], 10);
  const monthAfter = { 1: '04', 2: '07', 3: '10', 4: '01' }[q];
  if (!monthAfter) return '';
  if (q === 4) y += 1;
  return `16/${monthAfter}/${y}`;
}

/* ── Query helpers ──────────────────────────────────────────────────────── */
function paginate(rows, qp) {
  const page = parseInt(qp.page, 10) || 1;
  const limit = parseInt(qp.limit, 10) || 25;
  const start = (page - 1) * limit;
  return {
    data: rows.slice(start, start + limit),
    total: rows.length,
    page,
    totalPages: Math.max(1, Math.ceil(rows.length / limit)),
  };
}

const matches = (row, qp, fields) =>
  fields.every((f) => {
    const needle = (qp[f] || '').trim().toLowerCase();
    if (!needle) return true;
    return String(row[f] ?? '').toLowerCase().includes(needle);
  });

const body = (request) => { try { return JSON.parse(request.requestBody || '{}'); } catch { return {}; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── CNSS derived views ─────────────────────────────────────────────────── */
const cardsOf = (id_cn) => db.cards.filter((c) => String(c.id_cn) === String(id_cn));

const cnssRow = (co) => {
  const cards = cardsOf(co.id_cn);
  return {
    ...co,
    card_count: cards.length,
    total_dette: cards.reduce((s, c) => s + (parseFloat(c.dette) || 0), 0).toFixed(3),
  };
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function cnssMonths() {
  const served = db.cards.filter((c) => String(c.date_tabligh || '').trim() !== '');
  const groups = {};
  served.forEach((c) => {
    const d = new Date(c.date_tabligh);
    if (isNaN(d.getTime())) return;
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const key = `${year}-${month}`;
    const co = db.cnss.find((x) => String(x.id_cn) === String(c.id_cn)) || {};
    const t = cardTotals(c);
    groups[key] = groups[key] || {
      year, month, label: `${MONTH_NAMES[month - 1]} ${year}`, count: 0,
      _ajr: 0, _vat: 0, _exp: 0, _total: 0, rows: [],
    };
    const g = groups[key];
    g.count += 1;
    g._ajr += t.ajr; g._vat += t.vat; g._exp += t.exp; g._total += t.total;
    g.rows.push({
      rang: g.rows.length + 1,           // the bill numbers its lines within the month
      id_cn_oe: c.id_cn_oe, id_cn: c.id_cn,
      nbrreg: c.nbrreg, numcarte: c.numcarte,
      nom: co.nom_cl2 || '—', numcnss: co.numcnss || '—',
      date_tabligh: c.date_tabligh,
      ajr: dinar(t.ajr), vat: dinar(t.vat), exp: dinar(t.exp), total: dinar(t.total),
    });
  });
  const months = Object.values(groups)
    .sort((a, b) => (b.year - a.year) || (b.month - a.month))
    .map((g) => ({
      ...g,
      t_ajr: dinar(g._ajr), t_vat: dinar(g._vat), t_exp: dinar(g._exp), t_total: dinar(g._total),
    }));
  const grand = months.reduce((s, m) => s + m._total, 0);
  return { months, grandTotal: dinar(grand) };
}

/* ── Word documents ─────────────────────────────────────────────────────── */
const O = () => db.settings;

function actBlocks(company, card, pageBreak) {
  const t = cardTotals(card);
  return [
    P('Maître ' + (O().office_name || ''), { bold: true, align: 'center', size: 26, pageBreakBefore: pageBreak }),
    P('Judicial Enforcement Officer, ' + (O().office_city || ''), { align: 'center', size: 20 }),
    P(O().office_address || '', { align: 'center', size: 18 }),
    P(`Phone: ${O().office_phone || '—'} — Fax: ${O().office_fax || '—'} — Tax ID: ${O().office_tax_id || '—'}`,
      { align: 'center', size: 16, spaceAfter: 300 }),
    P('NOTIFICATION ACT — LIQUIDATION CARD', { bold: true, align: 'center', size: 28, spaceAfter: 300 }),
    P(`At the request of the National Social Security Fund, through its regional office of ${O().cnss_bureau || '………'},`),
    P(`We, Maître ${O().office_name || '………'}, Judicial Enforcement Officer of the judicial district of `
      + `${O().office_jurisdiction || '………'}, of ${O().office_address || '………'}, undersigned,`),
    P(`have notified: ${company.nom_cl2 || '………'}, ${company.cl2_adresse || ''} ${company.cl2_adresse2 || ''}, `
      + `affiliated under number ${company.numcnss || '—'}${company.codeng ? ' / ' + company.codeng : ''},`),
    P('of the liquidation card issued against it, rendered enforceable on behalf of the Governor and by his '
      + `delegation by the Regional Director of Social Affairs of ${O().cnss_region || '………'}, as follows:`,
      { spaceAfter: 240 }),
    TABLE(
      ['Card no.', 'Quarter', 'Principal debt (TND)', 'Monthly penalty', 'Penalty start date'],
      [[card.numcarte || '—', card.semestre || '—', card.dette || '—',
        (card.pourcentage || '1.5') + ' %', card.datesins || '—']]
    ),
    P('', { spaceAfter: 240 }),
    P('Statement of fees and expenses', { bold: true, size: 22 }),
    TABLE(
      ['Item', 'Amount (TND)'],
      [
        ['Total fees', dinar(t.ajr)],
        [`VAT (${card.vat_rate || 19}%)`, dinar(t.vat)],
        ['Total expenses', dinar(t.exp)],
        ['Grand total', dinar(t.total)],
      ]
    ),
    P('', { spaceAfter: 300 }),
    P('THE JUDICIAL ENFORCEMENT OFFICER', { align: 'center', size: 20 }),
  ];
}

function monthlyListBlocks(month) {
  const rows = month.rows.map((r) => [
    r.nbrreg || '—', r.numcarte || '—', r.nom, r.numcnss, r.date_tabligh, r.total,
  ]);
  return [
    P('Maître ' + (O().office_name || ''), { bold: true, align: 'center', size: 26 }),
    P(O().office_address || '', { align: 'center', size: 18 }),
    P(`Phone: ${O().office_phone || '—'} — Fax: ${O().office_fax || '—'}`, { align: 'center', size: 16 }),
    P(`Tax ID: ${O().office_tax_id || '—'} — RIB: ${O().office_rib || '—'}`, { align: 'center', size: 16, spaceAfter: 300 }),
    P(`Statement of fees for liquidation-card notification acts — ${month.label}`,
      { bold: true, align: 'center', size: 26, spaceAfter: 300 }),
    TABLE(['File no.', 'Card no.', 'Debtor', 'Affiliation no.', 'Service date', 'Act fee (TND)'], rows),
    P('', { spaceAfter: 200 }),
    P(`Fees: ${month.t_ajr}   VAT: ${month.t_vat}   Expenses: ${month.t_exp}   Grand total: ${month.t_total} TND`,
      { bold: true, align: 'right', size: 20 }),
    P('', { spaceAfter: 300 }),
    P('THE JUDICIAL ENFORCEMENT OFFICER', { align: 'center', size: 20 }),
  ];
}

/* ── The demo's answer to "scan a page" ─────────────────────────────────── */
const nextSample = () => SCAN_SAMPLES[db.scanIndex % SCAN_SAMPLES.length];
const advanceSample = () => { db.scanIndex += 1; };

/*
 * Runs before Mirage's own fetch patch, so it sees the request first: the scan
 * bridge and the .docx endpoints are handled here, everything else falls through
 * to Mirage (and from there to the real network for static assets).
 */
function installFetchShim() {
  const passthrough = window.fetch.bind(window);
  // The browser's Response, not the Mirage one imported above: these bodies are
  // read back with .ok / .blob() by ordinary application code.
  const Res = window.Response;

  window.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : (input && input.url) || '');

    /* The local scan bridge: hand back a sample liquidation card. */
    if (url.includes('127.0.0.1:17171') || url.includes('localhost:17171')) {
      await wait(900);                       // the feel of a sheet going through
      const sample = nextSample();
      // Rebuild the Blob with an explicit type: what comes back through Mirage's
      // passthrough has none, and a typeless Blob will not decode as an image.
      const bytes = await passthrough(sample.image).then((r) => r.arrayBuffer());
      const svg = new Blob([bytes], { type: 'image/svg+xml' });
      return new Res(svg, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });
    }

    /* Word downloads. */
    if (/\.docx(\?|$)/.test(url)) {
      await wait(600);
      let blocks;

      const listMatch = /\/cnss\/list\.docx\?year=(\d+)&month=(\d+)/.exec(url);
      const allActs = /\/cnss\/(\d+)\/acts\.docx/.exec(url);
      const oneAct = /\/cnss\/cards\/(\d+)\/act\.docx/.exec(url);

      if (listMatch) {
        const { months } = cnssMonths();
        const m = months.find((x) => String(x.year) === listMatch[1] && String(x.month) === listMatch[2]);
        if (!m) return new Res(JSON.stringify({ error: 'No acts for that month' }), { status: 404 });
        blocks = monthlyListBlocks(m);
      } else if (allActs) {
        const co = db.cnss.find((c) => String(c.id_cn) === allActs[1]);
        const cards = cardsOf(allActs[1]);
        if (!co || cards.length === 0) {
          return new Res(JSON.stringify({ error: 'No liquidation cards' }), { status: 404 });
        }
        blocks = cards.flatMap((card, i) => actBlocks(co, card, i > 0));
      } else if (oneAct) {
        const card = db.cards.find((c) => String(c.id_cn_oe) === oneAct[1]);
        const co = card && db.cnss.find((c) => String(c.id_cn) === String(card.id_cn));
        if (!card || !co) return new Res(JSON.stringify({ error: 'Card not found' }), { status: 404 });
        blocks = actBlocks(co, card, false);
      } else {
        /* Onboarding's sample-act preview. */
        blocks = actBlocks(
          { nom_cl2: 'SAMPLE COMPANY LTD', cl2_adresse: 'Sample street', cl2_adresse2: 'Sousse', numcnss: '000000', codeng: '00' },
          { numcarte: '0000000000', semestre: '01/2024', dette: '0.000', pourcentage: '1.5', datesins: '16/04/2024', vat_rate: '19' },
          false
        );
      }

      return new Res(buildDocx(blocks), {
        status: 200,
        headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      });
    }

    return passthrough(input, init);
  };
}

/* ── Mirage ─────────────────────────────────────────────────────────────── */
export function makeServer({ environment = 'development' } = {}) {
  const server = createServer({
    environment,

    routes() {
      this.timing = 220;                       // enough to show the app's loading states
      this.passthrough((request) => !request.url.includes('/api/'));
      this.namespace = 'api';

      /* ── Boot: branding, licence, auth ── */
      this.get('/onboarding/status', () => ({
        needsOnboarding: false,
        officeName: '',                        // falls back to the generic demo label
      }));
      this.post('/onboarding/complete', () => ({ success: true }));

      this.get('/license/status', () => ({
        status: 'active', message: '', providerContact: '', canExport: true,
      }));

      this.post('/auth/login', (schema, request) => {
        const { username, password } = body(request);
        if (username === 'demo' && password === 'demo') {
          return { user: db.users[0], token: 'demo-jwt-token' };
        }
        return new Response(401, {}, { error: 'Invalid credentials. Use demo / demo.' });
      });
      this.get('/auth/verify', () => ({ user: db.users[0] }));

      /* ── Settings ── */
      this.get('/settings', () => ({ ...db.settings }));
      this.put('/settings', (schema, request) => {
        Object.assign(db.settings, body(request));
        return { success: true };
      });
      this.get('/settings/tva_rate', () => ({ tva_rate: db.settings.tva_rate }));
      this.get('/settings/office/profile', () => ({
        officeName: db.settings.office_name, officeNameFr: db.settings.office_name_fr,
        officeCity: db.settings.office_city, officeAddress: db.settings.office_address,
        officeJurisdiction: db.settings.office_jurisdiction, officePhone: db.settings.office_phone,
        officeFax: db.settings.office_fax, taxId: db.settings.office_tax_id,
        officeRib: db.settings.office_rib, officeCnss: db.settings.office_cnss,
        cnssBureau: db.settings.cnss_bureau, cnssRegion: db.settings.cnss_region,
        ...db.settings,
      }));
      this.put('/settings/office/profile', (schema, request) => {
        Object.assign(db.settings, body(request));
        return { success: true };
      });

      this.get('/suggestions/names', () => ({
        names: [...new Set([
          ...db.general.map((r) => r.nom_cl1),
          ...db.general.map((r) => r.nom_cl2),
          ...db.cnss.map((c) => c.nom_cl2),
        ])].filter(Boolean),
      }));

      /* ── Dashboard ── */
      this.get('/dashboard/stats', () => {
        const days = (d) => {
          if (!d) return null;
          return Math.round((new Date(d) - new Date(new Date().toDateString())) / 86400000);
        };
        const open = db.general.filter((r) => r.status !== 'finished');
        const triage = {
          overdue: open.filter((r) => { const n = days(r.date_echeance); return n !== null && n < 0; }).length,
          today: open.filter((r) => days(r.date_echeance) === 0).length,
          week: open.filter((r) => { const n = days(r.date_echeance); return n !== null && n > 0 && n <= 7; }).length,
        };
        const expected = db.general.reduce((s, r) => s + billing(r).calculated_total, 0);
        return {
          metrics: { activeCount: open.length },
          triage,
          agenda: open
            .map(withTotals)
            .sort((a, b) => String(a.date_echeance).localeCompare(String(b.date_echeance)))
            .slice(0, 14),
          calendarDeadlines: open
            .filter((r) => r.date_echeance)
            .map((r) => ({ id_r: r.id_r, ref: r.ref, nom_cl1: r.nom_cl1, date_echeance: r.date_echeance })),
          appointments: db.events.filter((e) => {
            const n = days(e.start);
            return n !== null && n >= 0 && n <= 7;
          }),
          payments: { expected, collected: Math.round(expected * 0.61) },
          timeline: TIMELINE,
        };
      });

      /* ── General & execution registers ── */
      const registerRoutes = (path, store) => {
        this.get(`${path}/facturation/list`, (schema, request) => {
          const qp = request.queryParams;
          const rows = store()
            .filter((r) => matches(r, qp, ['ref', 'de_part', 'nom_cl1', 'nom_cl2']))
            .map((r) => ({ ...withTotals(r), actions: db.actions[r.id_r] || [] }));
          const out = paginate(rows, qp);
          out.total = rows.reduce((s, r) => s + r.calculated_total, 0);
          out.count = rows.length;
          return out;
        });

        this.get(path, (schema, request) => {
          const qp = request.queryParams;
          const rows = store()
            .filter((r) => matches(r, qp, ['ref', 'de_part', 'nom_cl1', 'nom_cl2']))
            .map(withTotals)
            .sort((a, b) => b.ref - a.ref);
          return paginate(rows, qp);
        });

        this.get(`${path}/:id`, (schema, request) => {
          const rec = store().find((r) => String(r.id_r) === request.params.id);
          return rec ? withTotals(rec) : new Response(404, {}, { error: 'Not found' });
        });

        this.post(path, (schema, request) => {
          const rec = {
            id_r: nextId(),
            ref: Math.max(0, ...store().map((r) => parseInt(r.ref, 10) || 0)) + 1,
            status: 'has_deposit', date_reg: shift(0), id_so: 'demo_so',
            ...body(request),
          };
          store().unshift(rec);
          return { success: true, id_r: rec.id_r, lastID: rec.id_r, ...rec };
        });

        this.put(`${path}/:id`, (schema, request) => {
          const rec = store().find((r) => String(r.id_r) === request.params.id);
          if (!rec) return new Response(404, {}, { error: 'Not found' });
          Object.assign(rec, body(request));
          return { success: true, ...rec };
        });

        this.patch(`${path}/:id/status`, (schema, request) => {
          const rec = store().find((r) => String(r.id_r) === request.params.id);
          if (rec) rec.status = body(request).status;
          return { success: true };
        });

        this.delete(`${path}/:id`, (schema, request) => {
          const arr = store();
          const i = arr.findIndex((r) => String(r.id_r) === request.params.id);
          if (i >= 0) arr.splice(i, 1);
          return { success: true };
        });
      };

      registerRoutes('/registre', () => db.general);
      registerRoutes('/execution', () => db.execution);

      /* Execution sub-actions */
      this.get('/execution/:id/actions', (schema, request) => db.actions[request.params.id] || []);
      this.post('/execution/:id/actions', (schema, request) => {
        const id = request.params.id;
        const act = { id: nextId(), id_r: id, ...body(request) };
        db.actions[id] = db.actions[id] || [];
        db.actions[id].push(act);
        return { success: true, ...act };
      });
      this.put('/execution/:id/actions/:actionId', (schema, request) => {
        const list = db.actions[request.params.id] || [];
        const act = list.find((a) => String(a.id) === request.params.actionId);
        if (act) Object.assign(act, body(request));
        return { success: true };
      });
      this.delete('/execution/:id/actions/:actionId', (schema, request) => {
        const list = db.actions[request.params.id] || [];
        const i = list.findIndex((a) => String(a.id) === request.params.actionId);
        if (i >= 0) list.splice(i, 1);
        return { success: true };
      });

      /* ── CNSS ── */
      this.get('/cnss/facturation/months', () => cnssMonths());

      this.get('/cnss', (schema, request) => {
        const qp = request.queryParams;
        const rows = db.cnss
          .filter((c) => matches(c, qp, ['nom_cl2', 'numcnss', 'ref']))
          .map(cnssRow)
          .sort((a, b) => b.ref - a.ref);
        return paginate(rows, qp);
      });

      this.get('/cnss/:id', (schema, request) => {
        const co = db.cnss.find((c) => String(c.id_cn) === request.params.id);
        if (!co) return new Response(404, {}, { error: 'Not found' });
        return { ...co, cards: cardsOf(co.id_cn) };
      });

      this.post('/cnss', (schema, request) => {
        const co = {
          id_cn: nextId(),
          ref: Math.max(0, ...db.cnss.map((c) => parseInt(c.ref, 10) || 0)) + 1,
          status: 'has_deposit', id_so: 'demo_so',
          ...body(request),
        };
        db.cnss.unshift(co);
        return { success: true, id_cn: co.id_cn, ...co };
      });

      this.put('/cnss/:id', (schema, request) => {
        const co = db.cnss.find((c) => String(c.id_cn) === request.params.id);
        if (!co) return new Response(404, {}, { error: 'Not found' });
        Object.assign(co, body(request));
        return { success: true, ...co };
      });

      this.patch('/cnss/:id/status', (schema, request) => {
        const co = db.cnss.find((c) => String(c.id_cn) === request.params.id);
        if (co) co.status = body(request).status;
        return { success: true };
      });

      this.delete('/cnss/:id', (schema, request) => {
        const i = db.cnss.findIndex((c) => String(c.id_cn) === request.params.id);
        if (i >= 0) db.cnss.splice(i, 1);
        db.cards = db.cards.filter((c) => String(c.id_cn) !== request.params.id);
        return { success: true };
      });

      /* Cards */
      this.post('/cnss/:id/cards', (schema, request) => {
        const attrs = body(request);
        const id_cn = request.params.id;
        if (!attrs.force && attrs.numcarte) {
          const dup = db.cards.find((c) => String(c.id_cn) === String(id_cn)
            && String(c.numcarte) === String(attrs.numcarte));
          if (dup) {
            const co = db.cnss.find((c) => String(c.id_cn) === String(id_cn));
            return new Response(409, {}, { duplicate: true, existing: dup, company: co, card: attrs, id_cn });
          }
        }
        const card = { id_cn_oe: nextId(), id_cn, ...attrs };
        delete card.force;
        db.cards.push(card);
        return { success: true, id_cn_oe: card.id_cn_oe };
      });

      this.put('/cnss/cards/:cardId', (schema, request) => {
        const card = db.cards.find((c) => String(c.id_cn_oe) === request.params.cardId);
        if (!card) return new Response(404, {}, { error: 'Not found' });
        Object.assign(card, body(request));
        return { success: true };
      });

      this.delete('/cnss/cards/:cardId', (schema, request) => {
        const i = db.cards.findIndex((c) => String(c.id_cn_oe) === request.params.cardId);
        if (i >= 0) db.cards.splice(i, 1);
        return { success: true };
      });

      /*
       * Scan → extract → auto-create, the headline CNSS workflow.
       *
       * The real endpoint sends the uploaded page to GPT-4o-mini with an Arabic
       * prompt and files whatever comes back. Here the sample cards carry their
       * own known-good extraction, so the demo shows the same three steps —
       * read, file, open — without an API key or a scanner.
       */
      this.post('/cnss/scan', async () => {
        await wait(1600);                      // the extraction the real app pays for
        const sample = nextSample();
        advanceSample();

        let co = db.cnss.find((c) => c.numcnss === sample.company.numcnss);
        if (!co) {
          co = {
            id_cn: nextId(),
            ref: Math.max(0, ...db.cnss.map((c) => parseInt(c.ref, 10) || 0)) + 1,
            status: 'has_deposit', id_so: 'demo_so',
            ...sample.company,
          };
          db.cnss.unshift(co);
        }

        const existing = db.cards.find((c) => String(c.id_cn) === String(co.id_cn)
          && c.numcarte === sample.card.numcarte);
        if (existing) {
          return new Response(409, {}, {
            duplicate: true, existing, company: co, id_cn: co.id_cn,
            card: { ...sample.card, ...cardFeeDefaults() },
          });
        }

        db.cards.push({
          id_cn_oe: nextId(), id_cn: co.id_cn,
          ...sample.card, pourcentage: '1.5', date_tabligh: '',
          datesins: derivePenaltyDate(sample.card.semestre),
          nbrreg: String(600 + db.cards.length),
          ...cardFeeDefaults(),
        });

        return { success: true, id_cn: co.id_cn };
      });

      /* ── AI ── */
      this.post('/ai/extract-cnss', async () => {
        await wait(1500);
        const sample = nextSample();
        advanceSample();
        return { success: true, data: { ...sample.company, ...sample.card } };
      });

      this.post('/ai/extract', async () => {
        await wait(1200);
        return {
          success: true,
          data: { nom_cl1: 'Mediterranean Bank', nom_cl2: 'Karim Jelassi', origine: '19500' },
        };
      });

      this.post('/ai/chat', async () => {
        await wait(700);
        return {
          response:
            'This is the demo build, so I am answering from a script rather than a model. '
            + 'In the full product this assistant runs on a language model with tool access to '
            + 'the registers, the contacts directory and the calendar: it can find a file by '
            + 'party name, summarise the documents attached to it, draft an act, add a contact '
            + 'or book a hearing — and every one of those writes lands in the audit log.',
        };
      });

      /* ── Directory & calendar ── */
      this.get('/telephone', () => ({ data: db.contacts, total: db.contacts.length }));
      this.post('/telephone', (schema, request) => {
        const c = { id_tel: nextId(), ...body(request) };
        db.contacts.push(c);
        return { success: true, ...c };
      });
      this.put('/telephone/:id', (schema, request) => {
        const c = db.contacts.find((x) => String(x.id_tel) === request.params.id);
        if (c) Object.assign(c, body(request));
        return { success: true };
      });
      this.delete('/telephone/:id', (schema, request) => {
        const i = db.contacts.findIndex((x) => String(x.id_tel) === request.params.id);
        if (i >= 0) db.contacts.splice(i, 1);
        return { success: true };
      });

      this.get('/calendar', () => ({ data: db.events, total: db.events.length }));
      this.post('/calendar', (schema, request) => {
        const e = { id_even: nextId(), ...body(request) };
        db.events.push(e);
        return { success: true, ...e };
      });
      this.put('/calendar/:id', (schema, request) => {
        const e = db.events.find((x) => String(x.id_even) === request.params.id);
        if (e) Object.assign(e, body(request));
        return { success: true };
      });
      this.delete('/calendar/:id', (schema, request) => {
        const i = db.events.findIndex((x) => String(x.id_even) === request.params.id);
        if (i >= 0) db.events.splice(i, 1);
        return { success: true };
      });

      /* ── Admin ── */
      this.get('/users', () => db.users);
      this.post('/users', (schema, request) => {
        const u = { id: nextId(), id_so: 'demo_so', ...body(request) };
        delete u.password;
        db.users.push(u);
        return { success: true, ...u };
      });
      this.put('/users/:id', (schema, request) => {
        const u = db.users.find((x) => String(x.id) === request.params.id);
        if (u) { const b = body(request); delete b.password; Object.assign(u, b); }
        return { success: true };
      });
      this.delete('/users/:id', (schema, request) => {
        const i = db.users.findIndex((x) => String(x.id) === request.params.id);
        if (i >= 0) db.users.splice(i, 1);
        return { success: true };
      });

      this.get('/audit', (schema, request) => paginate(db.audit, request.queryParams));

      /*
       * Accounting reads { totals: {base,tva,expenses,total} } plus a `monthly`
       * series keyed monthName/base/tva/expenses/total, and asks per year.
       */
      this.get('/accounting/stats', (schema, request) => {
        const year = parseInt(request.queryParams.year, 10) || new Date().getFullYear();
        const rows = db.general.concat(db.execution);

        const empty = () => MONTH_NAMES.map((monthName) => ({ monthName, base: 0, tva: 0, expenses: 0, total: 0 }));
        const monthly = empty();

        rows.forEach((r, i) => {
          const d = new Date(r.date_reg);
          const rowYear = isNaN(d.getTime()) ? year : d.getFullYear();
          if (rowYear !== year) return;
          const b = billing(r);
          const m = monthly[isNaN(d.getTime()) ? i % 12 : d.getMonth()];
          // Millimes, like the real route: the page's formatAmount divides by 1000.
          m.base += b.base_fare;
          m.tva += b.tva;
          m.expenses += b.expenses;
          m.total += b.calculated_total;
        });

        const totals = monthly.reduce((acc, m) => ({
          base: acc.base + m.base, tva: acc.tva + m.tva,
          expenses: acc.expenses + m.expenses, total: acc.total + m.total,
        }), { base: 0, tva: 0, expenses: 0, total: 0 });

        return { year, totals, monthly };
      });

      this.get('/data-cleaning/suggestions', () => ([
          {
            id: 1, canonical: 'National Agricultural Bank',
            items: [
              { id_r: 1001, name: 'National Agricultural Bank', count: 9 },
              { id_r: 1013, name: 'National Agricultural Bank ', count: 3 },
              { id_r: 1021, name: 'Nat. Agricultural Bank', count: 2 },
            ],
          },
          {
            id: 2, canonical: 'Tunisian Electricity & Gas (STEG)',
            items: [
              { id_r: 1004, name: 'Tunisian Electricity & Gas (STEG)', count: 6 },
              { id_r: 1016, name: 'STEG', count: 4 },
            ],
          },
      ]));
      this.post('/data-cleaning/merge', () => ({ success: true, merged: 2 }));

      /* ── Client portal ── */
      this.get('/portal/records', () => db.general
        .filter((r) => r.nom_cl1 === 'National Agricultural Bank')
        .map((r) => ({ ...withTotals(r), id: r.id_r })));
      this.get('/portal/records/:id/actions', (schema, request) => db.actions[request.params.id] || []);

      /* ── Attachments ── */
      this.get('/attachments/:type/:id', (schema, request) =>
        db.attachments.filter((a) => String(a.record_id) === request.params.id
          && a.record_type === request.params.type));
      this.post('/attachments', (schema, request) => {
        const att = {
          id: nextId(), filename: 'scanned-document.pdf', record_id: null,
          record_type: 'registre', created_at: shift(0),
          blob_url: '#demo-document', size: 148000,
        };
        try {
          const fd = request.requestBody;
          att.filename = fd.get('file')?.name || att.filename;
          att.record_id = fd.get('record_id');
          att.record_type = fd.get('record_type') || 'registre';
        } catch { /* not FormData — keep the defaults */ }
        db.attachments.push(att);
        return { success: true, ...att };
      });
      this.delete('/attachments/:id', (schema, request) => {
        const i = db.attachments.findIndex((a) => String(a.id) === request.params.id);
        if (i >= 0) db.attachments.splice(i, 1);
        return { success: true };
      });
      this.post('/attachments/scan-target', () => ({ success: true }));

      /* ── Export ── */
      this.get('/export/data', () => ({
        exportedAt: new Date().toISOString(),
        office: db.settings,
        clients_record: db.general.concat(db.execution),
        cnss: db.cnss, cnss_oeuvre: db.cards,
        telephone: db.contacts, evenement: db.events,
        admin_admin: db.users, audit_logs: db.audit,
      }));

      this.get('/health', () => ({ ok: true, database: 'demo (in-browser)' }));

      /* Anything not modelled above answers empty rather than erroring. */
      this.get('/*', () => ({ data: [], total: 0 }));
      this.post('/*', () => ({ success: true }));
      this.put('/*', () => ({ success: true }));
      this.delete('/*', () => ({ success: true }));
    },
  });

  installFetchShim();
  return server;
}
