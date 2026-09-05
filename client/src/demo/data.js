/*
 * Seed data for the demo build.
 *
 * Everything here is invented. The office, the parties, the CNSS numbers and the
 * debts are all fictional — the demo is public, and the real registers hold named
 * companies and their liabilities.
 *
 * Dates are computed relative to "today" at boot, so the dashboard always has
 * something overdue, something due today and something due this week, however
 * long after this file was written the demo is opened.
 */

const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().split('T')[0];
export const today = () => iso(Date.now());
export const shift = (days) => iso(Date.now() + days * DAY);

/* Month key ("2026-07") n months back, for the CNSS monthly bills. */
const monthBack = (n) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: (k) => iso(new Date(d.getFullYear(), d.getMonth(), k)) };
};

export const OFFICE_PROFILE = {
  office_name: 'Mourad Gaoudi',
  office_name_fr: 'Mourad Gaoudi',
  office_city: 'Sousse',
  office_address: 'Kallalou Building, Office A23, Mohamed Maarouf Street, Sousse',
  office_jurisdiction: 'Court of Appeal of Sousse',
  office_phone: '73 226 226',
  office_fax: '73 226 300',
  office_tax_id: '1301683X/A/P/000',
  office_rib: '05500000022300094016',
  office_cnss: '4543508503 & 550867 - 04',
  cnss_bureau: 'Sousse, Rue de la République, Sousse',
  cnss_region: 'Sousse',
  tva_rate: '19',
};

/* ── General & execution registers ──────────────────────────────────────── */

const PETITIONERS = [
  'National Agricultural Bank', 'Al Amane Insurance Co.', 'Mediterranean Bank',
  'Tunisian Electricity & Gas (STEG)', 'Carthage Real Estate', 'National Trade Office',
  'Sousse Water Authority', 'Zitouna Leasing', 'Maghreb Textiles Ltd',
  'Hannibal Distribution', 'Sahel Medical Supplies', 'Union Bank of Tunisia',
];
const DEFENDANTS = [
  'Mohamed Ben Salah', 'Sami Ayari', 'Yasmine Trading LLC', 'Nizar Trabelsi',
  'Sabah Bakery', 'Hossine Mansouri', 'Imed Gharbi', 'Olfa Ben Youssef',
  'Karim Jelassi', 'Leila Bouazizi', 'Atelier Nour', 'Riadh Chaabane',
  'Sonia Khemiri', 'Garage El Fath', 'Anis Belhadj', 'Cafe Corniche',
];
const ACT_TYPES = [
  'Payment order service', 'Enforcement notice', 'Seizure of movables',
  'Third-party attachment', 'Eviction notice', 'Property inspection report',
  'Protest of unpaid cheque', 'Summons to appear',
];
// Only the four keys the registers' STATUS_MAP knows (utils/formatters.js) — any
// other value falls through to its "cancelled" default and mislabels the row.
const STATUSES = ['has_deposit', 'waiting_payment', 'finished', 'has_deposit', 'waiting_payment'];

/* Deadlines chosen so the triage buckets are never empty. */
const DEADLINE_OFFSETS = [-9, -5, -2, -1, 0, 0, 1, 2, 3, 5, 6, 9, 12, 15, 18, 22, 27, 33, 40, 48];

const feeSet = (seed) => ({
  origine: String(18000 + (seed % 5) * 1500),
  exemple: String(4000 + (seed % 3) * 1000),
  version_bureau: String(3000 + (seed % 4) * 500),
  orientation: String(2500 + (seed % 3) * 750),
  delimitation: String(1200 + (seed % 4) * 300),
  inscri: String(900 + (seed % 3) * 200),
  mobilite: String(4500 + (seed % 5) * 800),
  imprimer: String(600 + (seed % 3) * 150),
  poste: String(1100 + (seed % 4) * 250),
  autre: String((seed % 3) * 500),
});

function makeRecords(count, isExecution, startId, startRef) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const id = startId + i;
    const dl = DEADLINE_OFFSETS[i % DEADLINE_OFFSETS.length];
    out.push({
      id_r: id,
      ref: startRef + i,
      nom_cl1: PETITIONERS[i % PETITIONERS.length],
      de_part: DEFENDANTS[i % DEFENDANTS.length],
      nom_cl2: DEFENDANTS[i % DEFENDANTS.length],
      remarque: ACT_TYPES[i % ACT_TYPES.length],
      date_reg: shift(-60 + i * 2),
      date_inscri: shift(-58 + i * 2),
      date_echeance: shift(dl),
      status: STATUSES[i % STATUSES.length],
      is_execution: isExecution ? 1 : 0,
      tva_rate: '19',
      avance: String((i % 4) * 25000),
      ...feeSet(i),
      id_so: 'demo_so',
    });
  }
  return out;
}

export const GENERAL_RECORDS = makeRecords(26, false, 1001, 2015);
export const EXECUTION_RECORDS = makeRecords(12, true, 2001, 610);

/* Sub-actions hanging off execution files. */
export const EXECUTION_ACTIONS = EXECUTION_RECORDS.reduce((acc, rec, i) => {
  acc[rec.id_r] = [0, 1].slice(0, (i % 3) + 1).map((n) => ({
    id: rec.id_r * 10 + n,
    id_r: rec.id_r,
    type_operation: ACT_TYPES[(i + n) % ACT_TYPES.length],
    date_r: shift(-40 + i * 2 + n * 6),
    remarques: '',
    ...feeSet(i + n),
    TVA: '19',
  }));
  return acc;
}, {});

/* ── CNSS: debtor companies and their liquidation cards ─────────────────── */

const m1 = monthBack(1);
const m2 = monthBack(2);

export const CNSS_COMPANIES = [
  {
    id_cn: 501, ref: 118, nom_cl2: 'SARL BATIMENT DU SAHEL',
    cl2_adresse: 'Avenue de la République', cl2_adresse2: '4000 Sousse',
    numcnss: '498221', codeng: '00', cl2_profession: 'Building contractor',
    tribunal: 'Court of First Instance, Sousse', status: 'waiting_payment', id_so: 'demo_so',
  },
  {
    id_cn: 502, ref: 119, nom_cl2: 'STE TEXTILE EL FAJR',
    cl2_adresse: 'Zone Industrielle', cl2_adresse2: '5000 Monastir',
    numcnss: '551038', codeng: '00', cl2_profession: 'Garment manufacturing',
    tribunal: 'Court of First Instance, Monastir', status: 'has_deposit', id_so: 'demo_so',
  },
  {
    id_cn: 503, ref: 120, nom_cl2: 'SARL TRANSPORT NAJEH',
    cl2_adresse: 'Route de Tunis km 3', cl2_adresse2: '4023 Sousse',
    numcnss: '607914', codeng: '00', cl2_profession: 'Road haulage',
    tribunal: 'Court of First Instance, Sousse', status: 'waiting_payment', id_so: 'demo_so',
  },
];

const cardFees = {
  fee_original: '7000', fee_counterparts: '3000', fee_legal_copy: '2000',
  fee_office_copy: '2000', fee_movement: '6000', fee_copies: '1000',
  fee_travel: '4500', fee_registration: '1500', fee_stamp: '1000', fee_post: '900',
  fee_aqm: '3990', vat_rate: '19',
};

export const CNSS_CARDS = [
  { id_cn_oe: 9001, id_cn: 501, numcarte: '1621400211', datecarte: '2026-01-14', semestre: '02/2022',
    dette: '4218.560', pourcentage: '1.5', datesins: '16/07/2022', nbrreg: '612',
    date_tabligh: m1.day(9), ...cardFees },
  { id_cn_oe: 9002, id_cn: 501, numcarte: '1621400212', datecarte: '2026-01-14', semestre: '03/2022',
    dette: '3907.120', pourcentage: '1.5', datesins: '16/10/2022', nbrreg: '613',
    date_tabligh: m1.day(9), ...cardFees },
  { id_cn_oe: 9003, id_cn: 501, numcarte: '1621400213', datecarte: '2026-02-03', semestre: '04/2022',
    dette: '2884.300', pourcentage: '1.5', datesins: '16/01/2023', nbrreg: '614',
    date_tabligh: '', ...cardFees },
  { id_cn_oe: 9004, id_cn: 502, numcarte: '1621400255', datecarte: '2026-02-11', semestre: '01/2023',
    dette: '6510.900', pourcentage: '1.5', datesins: '16/04/2023', nbrreg: '627',
    date_tabligh: m2.day(17), ...cardFees },
  { id_cn_oe: 9005, id_cn: 502, numcarte: '1621400256', datecarte: '2026-02-11', semestre: '02/2023',
    dette: '5122.480', pourcentage: '1.5', datesins: '16/07/2023', nbrreg: '628',
    date_tabligh: '', ...cardFees },
  { id_cn_oe: 9006, id_cn: 503, numcarte: '1621400290', datecarte: '2026-03-02', semestre: '01/2023',
    dette: '1975.640', pourcentage: '1.5', datesins: '16/04/2023', nbrreg: '641',
    date_tabligh: m1.day(21), ...cardFees },
];

/*
 * The pages a "scan" hands back, paired with what the extraction step reports.
 * The image and the data are two views of the same fictional card, so a demo
 * viewer who opens the scanned page sees the numbers that landed in the form.
 */
export const SCAN_SAMPLES = [
  {
    image: '/demo/liquidation-card-1.svg',
    company: {
      nom_cl2: 'SARL MEDITEX', cl2_adresse: 'Avenue Habib Bourguiba', cl2_adresse2: '4000 Sousse',
      numcnss: '512884', codeng: '00', cl2_profession: 'Textile manufacturing',
      tribunal: 'Court of First Instance, Sousse',
    },
    card: { numcarte: '1621400317', datecarte: '2026-03-12', semestre: '03/2022', dette: '3214.750' },
  },
  {
    image: '/demo/liquidation-card-2.svg',
    company: {
      nom_cl2: 'STE JASMIN TRAVAUX', cl2_adresse: 'Rue Ibn Khaldoun', cl2_adresse2: '5000 Monastir',
      numcnss: '704219', codeng: '00', cl2_profession: 'Public works',
      tribunal: 'Court of First Instance, Monastir',
    },
    card: { numcarte: '1621400318', datecarte: '2026-03-12', semestre: '01/2023', dette: '1876.400' },
  },
  {
    image: '/demo/liquidation-card-3.svg',
    company: {
      nom_cl2: 'SARL OLIVIA FOOD', cl2_adresse: 'Zone Industrielle Sidi Abdelhamid', cl2_adresse2: '4023 Sousse',
      numcnss: '618340', codeng: '00', cl2_profession: 'Food processing',
      tribunal: 'Court of First Instance, Sousse',
    },
    card: { numcarte: '1621400319', datecarte: '2026-03-12', semestre: '02/2023', dette: '5042.900' },
  },
];

/* ── Directory, calendar, users, audit ──────────────────────────────────── */

export const CONTACTS = [
  { id_tel: 1, nom: 'Court of First Instance, Sousse', tel: '73 225 100', fonction: 'Court', email: 'greffe.sousse@justice.tn', adresse: 'Avenue Mohamed V, Sousse' },
  { id_tel: 2, nom: 'Cantonal Court, Monastir', tel: '73 461 220', fonction: 'Court', email: '', adresse: 'Rue de l’Indépendance, Monastir' },
  { id_tel: 3, nom: 'CNSS Regional Office, Sousse', tel: '73 224 810', fonction: 'CNSS', email: 'sousse@cnss.tn', adresse: 'Rue de la République, Sousse' },
  { id_tel: 4, nom: 'Maître Salah Ben Ali', tel: '98 412 663', fonction: 'Lawyer', email: 's.benali@avocat.tn', adresse: 'Sousse' },
  { id_tel: 5, nom: 'National Agricultural Bank — Legal Dept.', tel: '71 831 000', fonction: 'Client', email: 'legal@bna.tn', adresse: 'Tunis' },
  { id_tel: 6, nom: 'Sousse Governorate — Bailiffs Registry', tel: '73 225 900', fonction: 'Administration', email: '', adresse: 'Sousse' },
];

export const EVENTS = [
  { id_even: 1, title: 'Enforcement hearing — file #2018', start: shift(0), time_even: '09:30', tribunal_even: 'Court of First Instance, Sousse', place: 'Sousse', type: 'audience' },
  { id_even: 2, title: 'Service of writ — Sabah Bakery', start: shift(1), time_even: '11:00', tribunal_even: 'Cantonal Court, Monastir', place: 'Monastir', type: 'deadline' },
  { id_even: 3, title: 'Seizure of movables — Garage El Fath', start: shift(3), time_even: '14:15', tribunal_even: 'Court of First Instance, Sousse', place: 'Sousse', type: 'audience' },
  { id_even: 4, title: 'Property inspection — Carthage Real Estate', start: shift(5), time_even: '10:00', tribunal_even: 'Grombalia', place: 'Grombalia', type: 'audience' },
  { id_even: 5, title: 'CNSS monthly list submission', start: shift(8), time_even: '08:45', tribunal_even: 'CNSS Sousse', place: 'Sousse', type: 'deadline' },
];

export const USERS = [
  { id: 1, username: 'demo', role: 'superadmin', nom: 'Demo Administrator', id_so: 'demo_so' },
  { id: 2, username: 'clerk', role: 'user', nom: 'Office Clerk', id_so: 'demo_so' },
  { id: 3, username: 'accounts', role: 'admin', nom: 'Accounts Manager', id_so: 'demo_so' },
  { id: 4, username: 'bna.client', role: 'client', nom: 'National Agricultural Bank', alias: 'National Agricultural Bank', id_so: 'demo_so' },
];

export const AUDIT_LOGS = [
  { id: 1, created_at: `${shift(0)} 14:20:11`, username: 'demo', action: 'CREATE', module: 'CNSS', details: 'Liquidation card 1621400290 filed under SARL TRANSPORT NAJEH' },
  { id: 2, created_at: `${shift(0)} 11:05:47`, username: 'clerk', action: 'UPDATE', module: 'General register', details: 'File #2018 status → In progress' },
  { id: 3, created_at: `${shift(-1)} 16:40:02`, username: 'accounts', action: 'CREATE', module: 'Billing', details: 'Fee statement issued — Al Amane Insurance Co.' },
  { id: 4, created_at: `${shift(-1)} 09:15:38`, username: 'demo', action: 'VIEW', module: 'Audit', details: 'Opened the audit log' },
  { id: 5, created_at: `${shift(-2)} 15:02:20`, username: 'clerk', action: 'DELETE', module: 'Directory', details: 'Removed a duplicate contact' },
  { id: 6, created_at: `${shift(-2)} 10:48:55`, username: 'demo', action: 'UPDATE', module: 'Settings', details: 'VAT rate confirmed at 19%' },
];

export const TIMELINE = [
  { type: 'case', action: 'Act created', title: 'Enforcement notice #2041 — National Agricultural Bank', date: shift(0) },
  { type: 'payment', action: 'Payment recorded', title: 'Partial settlement 1,250 TND — file #2035', date: shift(0) },
  { type: 'case', action: 'Status updated', title: 'File #2030 → In progress', date: shift(-1) },
  { type: 'payment', action: 'Invoice issued', title: 'Fee statement — Al Nour Trading Co.', date: shift(-1) },
  { type: 'cnss', action: 'Liquidation card scanned', title: 'SARL TRANSPORT NAJEH — card 1621400290', date: shift(-2) },
];
