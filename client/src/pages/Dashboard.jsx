import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Search, CalendarDays, Clock, Activity, DollarSign,
  ChevronLeft, ChevronRight, X, ExternalLink, AlertCircle,
  CheckCircle2, FileText, MapPin
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import API_BASE from '../config';
import { formatAmount } from '../utils/formatters';

/* ── Constants (hoisted: stable across renders) ───────────────────────── */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DATE_RE = /(\d{4})-(\d{2})-(\d{2})/;

// Real (and legacy) status values seen in the data → label + badge class.
const STATUS_UI = {
  has_deposit:     { label: 'Awaiting service',  cls: 'badge-violet' },
  waiting_payment: { label: 'Awaiting payment', cls: 'badge-amber' },
  not_started:     { label: 'Not started',       cls: 'badge-gray' },
  in_progress:     { label: 'In progress',       cls: 'badge-blue' },
  finished:        { label: 'Completed',         cls: 'badge-green' },
  cancelled:       { label: 'Cancelled',         cls: 'badge-red' },
};
const statusUI = (s) => STATUS_UI[s] || { label: s || 'Unspecified', cls: 'badge-gray' };

/* ── Date helpers (defensive: some date_echeance values are malformed) ── */
function parseDeadline(str) {
  if (!str) return null;
  const m = String(str).match(DATE_RE);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return Date.UTC(y, mo - 1, d);
}
function todayUTC() {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
}
function daysUntil(str) {
  const t = parseDeadline(str);
  if (t === null) return null;
  return Math.round((t - todayUTC()) / 86400000);
}
function relativeText(days) {
  if (days === null) return 'No deadline set';
  if (days < 0) return `${Math.abs(days)} day(s) overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} day(s)`;
}
function shortDate(str) {
  const t = parseDeadline(str);
  if (t === null) return (str || '—');
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/* ── Signature device: the days-countdown numeral ─────────────────────── */
function Countdown({ days }) {
  const cls = days === null ? 'is-unknown' : days < 0 ? 'is-overdue' : days === 0 ? 'is-today' : 'is-soon';
  return (
    <span className={`count tnum ${cls}`} aria-hidden="true">
      {days === null ? (
        <><span className="count-num">—</span><span className="count-unit">no deadline</span></>
      ) : days === 0 ? (
        <><AlertCircle size={22} /><span className="count-tag">today</span></>
      ) : (
        <>
          <span className="count-num">{Math.abs(days)}</span>
          <span className="count-unit">days</span>
          <span className="count-tag">{days < 0 ? 'overdue' : days === 1 ? 'tomorrow' : 'left'}</span>
        </>
      )}
    </span>
  );
}

/* ── Agenda row ───────────────────────────────────────────────────────── */
function AgendaRow({ item, onOpen }) {
  const days = daysUntil(item.date_echeance);
  const rowCls = days === null ? '' : days < 0 ? 'is-overdue' : days === 0 ? 'is-today' : '';
  const st = statusUI(item.status);
  const name = (item.nom_cl1 || '').trim() || '—';
  const against = (item.de_part || '').trim();
  return (
    <button
      type="button"
      className={`agenda-row ${rowCls}`}
      onClick={() => onOpen(item)}
      aria-label={`File no. ${item.ref}, ${name}, ${relativeText(days)}`}
    >
      <Countdown days={days} />
      <span className="agenda-body">
        <span className="agenda-title">{name}{against ? ` v. ${against}` : ''}</span>
        <span className="agenda-meta">
          <span className="agenda-ref">#{item.ref}</span>
          <span className={`badge ${st.cls}`}>{st.label}</span>
          <span>{relativeText(days)}</span>
        </span>
      </span>
      <ChevronLeft className="agenda-chev" size={18} />
    </button>
  );
}

/* ── Triage bucket (clickable filter) ─────────────────────────────────── */
function Triage({ kind, count, label, hint, active, onToggle }) {
  const cls = kind === 'overdue' ? 'is-overdue' : kind === 'today' ? 'is-today' : '';
  return (
    <button type="button" className={`triage ${cls}`} aria-pressed={active} onClick={() => onToggle(kind)}>
      <span className="triage-num tnum">{count}</span>
      <span className="triage-meta">
        <span className="triage-label">{label}</span>
        <span className="triage-hint">{hint}</span>
      </span>
    </button>
  );
}

/* ── Mini calendar (month shape of file deadlines) ────────────────────── */
function MiniCalendar({ deadlines, onPick }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [picked, setPicked] = useState(null);

  const byDate = useMemo(() => {
    const map = {};
    (deadlines || []).forEach((dl) => {
      const t = parseDeadline(dl.date_echeance);
      if (t === null) return;
      const d = new Date(t);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      (map[key] = map[key] || []).push(dl);
    });
    return map;
  }, [deadlines]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const todayKey = new Date().toISOString().split('T')[0];

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(<div key={`e${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const has = byDate[key]?.length > 0;
    const isToday = key === todayKey;
    const isPicked = key === picked;
    cells.push(
      <button
        key={d}
        type="button"
        disabled={!has}
        onClick={() => { setPicked(isPicked ? null : key); }}
        aria-label={has ? `${d} ${MONTHS[month]} — ${byDate[key].length} file(s)` : `${d} ${MONTHS[month]}`}
        style={{
          padding: '0.35rem 0', borderRadius: '8px', border: '1px solid transparent',
          background: isPicked ? 'var(--primary)' : isToday ? 'var(--nav-active-bg)' : 'transparent',
          borderColor: isToday && !isPicked ? 'var(--accent-gold)' : 'transparent',
          color: isPicked ? '#fff' : 'inherit', cursor: has ? 'pointer' : 'default',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
          font: 'inherit', fontWeight: isToday || has ? 700 : 400,
        }}
      >
        <span style={{ fontSize: '0.85rem' }}>{d}</span>
        {has && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: isPicked ? '#fff' : 'var(--status-error)',
          }} />
        )}
      </button>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
        <button className="btn-icon" style={{ width: 32, height: 32 }} onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
        <strong style={{ fontSize: '0.95rem' }}>{MONTHS[month]} {year}</strong>
        <button className="btn-icon" style={{ width: 32, height: 32 }} onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '0.2rem', textAlign: 'center' }}>
        {DAY_INITIALS.map((d, i) => <div key={i} style={{ fontSize: '0.72rem', color: 'var(--text-soft)', fontWeight: 700, paddingBottom: '0.3rem' }}>{d}</div>)}
        {cells}
      </div>
      {picked && byDate[picked] && (
        <div className="animate-fade" style={{ marginTop: '0.9rem', padding: '0.75rem', background: 'var(--surface-inset)', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Deadlines on {shortDate(picked)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 160, overflowY: 'auto' }}>
            {byDate[picked].map((dl) => (
              <button key={dl.id_r} type="button" onClick={() => onPick?.(dl)}
                style={{ font: 'inherit', textAlign: 'start', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.45rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', gap: '0.4rem' }}>
                <span className="agenda-ref">#{dl.ref}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(dl.nom_cl1 || '').trim()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Right-rail cards ─────────────────────────────────────────────────── */
function CollectionCard({ payments }) {
  const expected = payments?.expected || 0;
  const collected = payments?.collected || 0;
  const pct = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0;
  return (
    <section className="glass" style={{ padding: '1.25rem' }} aria-label="Collections this month">
      <h3 className="dash-h"><DollarSign size={18} style={{ color: 'var(--status-success)' }} /> Collections this month</h3>
      <div className="collect-row"><span>Expected</span><span className="val tnum">{formatAmount(expected)} TND</span></div>
      <div className="collect-row"><span>Collected</span><span className="val tnum" style={{ color: 'var(--status-success)' }}>{formatAmount(collected)} TND</span></div>
      <div className="collect-bar"><div className="collect-fill" style={{ width: `${pct}%` }} /></div>
      <div className="collect-pct">{pct}% of expected</div>
    </section>
  );
}

function AppointmentsCard({ items }) {
  return (
    <section className="glass" style={{ padding: '1.25rem' }} aria-label="Appointments this week">
      <h3 className="dash-h"><CalendarDays size={18} style={{ color: 'var(--primary)' }} /> This week's appointments</h3>
      {(!items || items.length === 0) ? (
        <p style={{ fontSize: '0.85rem', margin: 0 }}>No upcoming appointments this week</p>
      ) : items.map((ev) => (
        <div className="mini-row" key={ev.id_even}>
          <div className="mini-date"><div className="d tnum">{new Date(ev.start).getDate() || '—'}</div><div className="m">{MONTHS[new Date(ev.start).getMonth()] || ''}</div></div>
          <div className="mini-body">
            <h5>{ev.title || 'Appointment'}</h5>
            <p><Clock size={12} /> {ev.time_even || '—'}{ev.place ? <> <MapPin size={12} /> {ev.place}</> : ''}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

function ActivityCard({ items }) {
  return (
    <section className="glass" style={{ padding: '1.25rem' }} aria-label="Recent activity">
      <h3 className="dash-h"><Activity size={18} style={{ color: 'var(--text-soft)' }} /> Recent activity</h3>
      {(!items || items.length === 0) ? (
        <p style={{ fontSize: '0.85rem', margin: 0 }}>No recent activity</p>
      ) : items.map((it, i) => (
        <div className="mini-row" key={i}>
          <div className="mini-body">
            <h5>{it.action}</h5>
            <p>{(it.title || '').trim()} • {shortDate(it.date)}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

/* ── Quick-view drawer ────────────────────────────────────────────────── */
function CaseDrawer({ item, onClose, onOpen }) {
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  const days = daysUntil(item.date_echeance);
  const st = statusUI(item.status);
  return (
    <div role="dialog" aria-modal="true" aria-label="File quick view"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-start' }}
      onClick={onClose}>
      <div className="animate-fade" onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 440, height: '100vh', background: 'var(--surface)', borderInlineEnd: '1px solid var(--border)', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: 'var(--glass-shadow)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>File quick view</h2>
          <button ref={closeRef} className="btn-icon" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div style={{ padding: '1rem', borderRadius: 'var(--r-lg)', background: 'var(--nav-active-bg)', border: '1px solid var(--primary)' }}>
          <div className="agenda-ref" style={{ fontSize: '0.8rem' }}>#{item.ref}</div>
          <h3 style={{ margin: '0.4rem 0' }}>{(item.nom_cl1 || '—').trim()}</h3>
          {(item.de_part || '').trim() && <p style={{ margin: 0 }}>v. {item.de_part.trim()}</p>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Field label="Status"><span className={`badge ${st.cls}`}>{st.label}</span></Field>
          <Field label="Deadline">
            <span style={{ color: days !== null && days < 0 ? 'var(--status-error)' : days === 0 ? 'var(--accent-gold)' : 'inherit', fontWeight: 600 }}>
              {shortDate(item.date_echeance)} — {relativeText(days)}
            </span>
          </Field>
          <Field label="Registered"><span>{item.date_reg || '—'}</span></Field>
          <Field label="Total amount"><span className="tnum" style={{ fontSize: '1.15rem', fontWeight: 700 }}>{formatAmount(item.salaire)} TND</span></Field>
          {(item.remarque || '').trim() && (
            <Field label="Notes"><p style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{item.remarque}</p></Field>
          )}
        </div>

        <button className="btn" style={{ marginTop: 'auto' }} onClick={() => onOpen(item)}>
          <ExternalLink size={18} /> Open full record
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <div style={{ fontSize: '0.95rem' }}>{children}</div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState('all'); // all | overdue | today | week
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/dashboard/stats`, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        if (alive) setData(json);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Esc closes the drawer.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const agenda = data?.agenda || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agenda.filter((c) => {
      const d = daysUntil(c.date_echeance);
      const inBucket =
        bucket === 'all' ? true :
        bucket === 'overdue' ? (d !== null && d < 0) :
        bucket === 'today' ? (d === 0) :
        (d !== null && d > 0);
      if (!inBucket) return false;
      if (!q) return true;
      return (c.nom_cl1 || '').toLowerCase().includes(q)
        || (c.nom_cl2 || '').toLowerCase().includes(q)
        || (c.de_part || '').toLowerCase().includes(q)
        || String(c.ref || '').includes(q);
    });
  }, [agenda, search, bucket]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem', color: 'var(--text-muted)' }}>Loading…</div>;
  }

  const t = data?.triage || { overdue: 0, today: 0, week: 0 };
  const now = new Date();
  const dateLabel = `${WEEKDAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const toggle = (k) => setBucket((b) => (b === k ? 'all' : k));

  return (
    <div dir="ltr">
    <div className="dash animate-fade">

      {/* Command bar */}
      <div className="dash-bar">
        <div>
          <div className="dash-date">{dateLabel}</div>
          <div className="dash-sub">
            {t.overdue > 0
              ? <span style={{ color: 'var(--status-error)' }}><b>{t.overdue}</b> overdue file(s)</span>
              : <span style={{ color: 'var(--status-success)' }}>Nothing overdue</span>}
            <span className="sep">•</span>
            <span><b>{t.today}</b> due today</span>
            <span className="sep">•</span>
            <span>{data?.metrics?.activeCount ?? 0} active file(s)</span>
          </div>
        </div>
        <div className="dash-actions">
          <button className="btn" onClick={() => navigate('/record/registre/new')}><Plus size={18} /> New act</button>
          <button className="btn dash-btn-ghost" onClick={() => navigate('/general')}><Search size={18} /> Search register</button>
          <button className="btn dash-btn-ghost" onClick={() => navigate('/calendar')}><CalendarDays size={18} /> Calendar</button>
        </div>
      </div>

      {/* Triage strip */}
      <div className="dash-triage">
        <Triage kind="overdue" count={t.overdue} label="Overdue" hint="past deadline" active={bucket === 'overdue'} onToggle={toggle} />
        <Triage kind="today" count={t.today} label="Today" hint="due today" active={bucket === 'today'} onToggle={toggle} />
        <Triage kind="week" count={t.week} label="This week" hint="within 7 days" active={bucket === 'week'} onToggle={toggle} />
      </div>

      <div className="dash-grid">
        {/* Agenda */}
        <section className="glass" style={{ padding: '1.5rem' }} aria-label="Daily docket">
          <div className="agenda-head">
            <h3 className="dash-h" style={{ margin: 0 }}>
              <FileText size={20} style={{ color: 'var(--primary)' }} /> Daily docket
              {bucket !== 'all' && <button className="badge badge-gray" style={{ cursor: 'pointer', border: 'none', font: 'inherit' }} onClick={() => setBucket('all')}>Show all ✕</button>}
            </h3>
            <div className="agenda-search">
              <Search size={16} />
              <input type="text" placeholder="Search by name or number…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the docket" />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="dash-empty">
              {search ? <p>No results match your search.</p>
                : t.overdue === 0 && t.today === 0
                  ? <><CheckCircle2 size={32} /><p>Every file is within its deadline. Nothing overdue or due today.</p></>
                  : <p>No files in this category.</p>}
            </div>
          ) : (
            <div className="agenda-list">
              {filtered.map((item) => <AgendaRow key={item.id_r} item={item} onOpen={setSelected} />)}
            </div>
          )}

          {t.overdue > filtered.length && bucket === 'all' && !search && (
            <button className="btn dash-btn-ghost" style={{ width: '100%', marginTop: '1rem' }} onClick={() => navigate('/general')}>
              View all files in the general register
            </button>
          )}
        </section>

        {/* Right rail */}
        <div className="dash-rail">
          <CollectionCard payments={data?.payments} />
          <section className="glass" style={{ padding: '1.25rem' }} aria-label="Deadline calendar">
            <h3 className="dash-h"><CalendarDays size={18} style={{ color: 'var(--accent-gold)' }} /> Deadline calendar</h3>
            <MiniCalendar deadlines={data?.calendarDeadlines} onPick={(dl) => navigate(`/record/registre/${dl.id_r}`)} />
          </section>
          <AppointmentsCard items={data?.appointments} />
          <ActivityCard items={data?.timeline} />
        </div>
      </div>
    </div>

      {selected && (
        <CaseDrawer
          item={selected}
          onClose={() => setSelected(null)}
          onOpen={(it) => navigate(`/record/registre/${it.id_r}`)}
        />
      )}
    </div>
  );
}
