import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { CalendarCheck, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { PageHead } from '../components/Shell';
import { useEditors } from '../components/Editors';
import { TimeGrid, movedTimes, type GridItem } from '../components/TimeGrid';
import { useToast } from '../components/ui';
import { useCalendarRange, useHolidays, useSaveEvent, useSaveTask, useYearEntries, type CalData } from '../lib/data';
import {
  addDays, addMonths, dayKeyOf, endOfMonth, formatLong, formatShort, hhmm, isValidKey, key, minutesOf, monthMatrix, MONTHS,
  parseKey, startOfMonth, startOfWeek, todayKey, WEEKDAYS, WEEKDAYS_MIN, WEEKDAYS_SHORT, weekdayOf, type DayKey,
} from '../lib/dates';
import { countryName, flag } from '../lib/countries';
import { OPP_DATE_LABEL, type CalEvent, type Holiday, type SocialPost, type Task } from '../lib/types';

const VIEWS: [string, string][] = [['yil', 'Yıl'], ['ay', 'Ay'], ['hafta', 'Hafta'], ['gun', 'Gün'], ['ajanda', 'Ajanda']];

export default function CalendarPage() {
  const { view = 'yil', date } = useParams();
  const d = isValidKey(date) ? date : todayKey();
  if (view === 'gun') return <Navigate to={`/gun/${d}`} replace />;
  if (!VIEWS.some(([v]) => v === view)) return <Navigate to="/takvim/yil" replace />;
  return <CalendarInner view={view} d={d} />;
}

function CalendarInner({ view, d }: { view: string; d: DayKey }) {
  const nav = useNavigate();
  const { openTask, openEvent } = useEditors();
  const { y } = parseKey(d);
  const step = (n: number) => {
    const next = view === 'yil' ? key(y + n, 0, 1) : view === 'ay' ? addMonths(startOfMonth(d), n) : view === 'hafta' ? addDays(d, 7 * n) : addDays(d, 30 * n);
    nav(`/takvim/${view}/${next}`);
  };
  const title = view === 'yil' ? `${y} Takvimi` : view === 'ay' ? `${MONTHS[parseKey(d).m]} ${y}` : view === 'hafta' ? `${formatShort(startOfWeek(d))} – ${formatShort(addDays(startOfWeek(d), 6))} ${parseKey(addDays(startOfWeek(d), 6)).y}` : `Ajanda · ${formatShort(d)}'dan itibaren`;

  return (
    <>
      <PageHead title={title}>
        <div className="seg" role="tablist" aria-label="Takvim görünümü">
          {VIEWS.map(([v, l]) => <Link key={v} role="tab" aria-selected={v === view} className={v === view ? 'on' : ''} to={`/takvim/${v}/${d}`}>{l}</Link>)}
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="btn btn-glass icon-btn" onClick={() => step(-1)} aria-label="Önceki"><ChevronLeft size={18} /></button>
          <button type="button" className="btn btn-glass btn-sm" onClick={() => nav(`/takvim/${view}/${todayKey()}`)}><CalendarCheck size={14} />Bugün</button>
          <button type="button" className="btn btn-glass icon-btn" onClick={() => step(1)} aria-label="Sonraki"><ChevronRight size={18} /></button>
        </div>
        <button type="button" className="btn btn-glass" onClick={() => openEvent({ starts_at: undefined })}><Plus size={15} />Etkinlik</button>
        <button type="button" className="btn btn-primary" onClick={() => openTask({ due_date: d })}><Plus size={15} />Görev</button>
      </PageHead>
      {view === 'yil' && <YearView year={y} />}
      {view === 'ay' && <MonthView d={d} />}
      {view === 'hafta' && <WeekView d={d} />}
      {view === 'ajanda' && <AgendaView d={d} />}
    </>
  );
}

function Legend() {
  return (
    <div className="legend">
      <span><i className="k-task" />Görev</span><span><i className="k-event" />Etkinlik</span><span><i className="k-post" />Sosyal yayın</span><span><i className="k-exhibition" />Sergi / başvuru / kilometre taşı</span><span><i className="k-deadline" />Takip</span><span><i className="k-done" />Tamamlanan</span>
      <span><i className="k-holiday" />Türkiye tatili</span><span><i className="k-foreign" />ABD tatili</span>
      <span>Kesik kenar: tarihi kesinleşmedi</span>
    </div>
  );
}

// ── Yıl ────────────────────────────────────────────────
function YearView({ year }: { year: number }) {
  const nav = useNavigate();
  const entries = useYearEntries(year);
  const hol = useHolidays(`${year}-01-01`, `${year}-12-31`);
  const today = todayKey();
  const byDay = new Map<DayKey, { task: number; event: number; done: number; post: number; followup: number; opp: number }>();
  for (const e of entries.data ?? []) {
    const k = dayKeyOf(e.starts_at);
    const c = byDay.get(k) ?? { task: 0, event: 0, done: 0, post: 0, followup: 0, opp: 0 };
    if (e.kind === 'task') { if (e.status === 'done') c.done++; else c.task++; }
    else if (e.kind === 'post') c.post++;
    else if (e.kind === 'followup') c.followup++;
    else if (e.kind === 'opportunity' || e.kind === 'milestone') c.opp++;
    else c.event++;
    byDay.set(k, c);
  }
  return (
    <section className="glass panel">
      <div className="panel-head"><Legend /><span className="small muted">{year} {year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? '· artık yıl, 366 gün' : '· 365 gün'}</span></div>
      <div className="year-grid">
        {MONTHS.map((name, m) => (
          <div key={m} className={`mini-month${today.startsWith(`${year}-${String(m + 1).padStart(2, '0')}`) ? ' current' : ''}`}>
            <h3><Link to={`/takvim/ay/${key(year, m, 1)}`}>{name}</Link></h3>
            <div className="mm-grid">
              {WEEKDAYS_MIN.map((w, i) => <span key={i} className="wd">{w}</span>)}
              {monthMatrix(year, m).map((k, i) => {
                if (!k) return <span key={i} />;
                const hs = hol.byDay.get(k) ?? [];
                const trHol = hs.some((h) => h.country === 'TR' && h.kind !== 'observance');
                const foreign = !trHol && hs.some((h) => h.country !== 'TR' && h.kind === 'public');
                const c = byDay.get(k);
                const cls = ['mm-day', k < today && 'past', weekdayOf(k) >= 5 && 'weekend', trHol && 'hol', foreign && 'hol-foreign', k === today && 'today'].filter(Boolean).join(' ');
                const tip = [formatLong(k), ...hs.filter((h) => h.kind !== 'observance' || h.country === 'TR').slice(0, 6).map((h) => `${flag(h.country)} ${h.local_name}`), hs.length > 6 ? `+${hs.length - 6} tatil daha` : '',
                  c ? `${c.task + c.done} görev, ${c.event} etkinlik, ${c.post} yayın${c.followup ? `, ${c.followup} takip` : ''}` : ''].filter(Boolean).join('\n');
                return (
                  <button type="button" key={k} className={cls} title={tip} aria-label={tip} onClick={() => nav(`/gun/${k}`)}>
                    {parseKey(k).d}
                    {c && <span className="dots">{c.task > 0 && <i className="k-task" />}{c.event > 0 && <i className="k-event" />}{c.opp > 0 && <i className="k-exhibition" />}{c.post > 0 && <i className="k-post" />}{c.followup > 0 && <i className="k-deadline" />}{c.done > 0 && <i className="k-done" />}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Ortak: güne düşen öğeler ───────────────────────────
type Pill = { id: string; label: string; cls: string; sort: number; onClick?: () => void };
function pillsFor(day: DayKey, data: CalData | undefined, hols: Holiday[], openTask: (t: Task) => void, openEvent: (e: CalEvent) => void, openPost?: (p: SocialPost) => void): Pill[] {
  const out: Pill[] = [];
  const tr = hols.filter((h) => h.country === 'TR');
  const foreign = hols.filter((h) => h.country !== 'TR' && h.kind === 'public');
  tr.forEach((h) => out.push({ id: h.id, label: `${h.kind === 'half_day' ? '½ ' : ''}${h.local_name}`, cls: `hol${h.certainty !== 'confirmed' ? ' uncertain' : ''}`, sort: -2 }));
  if (foreign.length) {
    const names = [...new Set(foreign.map((h) => h.name))];
    out.push({ id: 'f' + day, label: `${foreign.slice(0, 3).map((h) => flag(h.country)).join('')} ${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ''}`, cls: 'hol foreign', sort: -1 });
  }
  for (const e of data?.events ?? []) {
    if (dayKeyOf(e.starts_at) <= day && dayKeyOf(e.ends_at) >= day)
      out.push({ id: e.id, label: `${e.all_day ? '' : hhmm(minutesOf(e.starts_at)) + ' '}${e.title}`, cls: 'event', sort: e.all_day ? 0 : minutesOf(e.starts_at), onClick: () => openEvent(e) });
  }
  for (const t of data?.tasks ?? []) {
    const k = t.starts_at ? dayKeyOf(t.starts_at) : t.due_date;
    if (k === day && t.status !== 'cancelled')
      out.push({ id: t.id, label: `${t.starts_at ? hhmm(minutesOf(t.starts_at)) + ' ' : ''}${t.title}`, cls: `task${t.status === 'done' ? ' done' : ''}`, sort: t.starts_at ? minutesOf(t.starts_at) : 1, onClick: () => openTask(t) });
  }
  for (const d of data?.oppDates ?? []) {
    if (d.day === day && d.opportunities) {
      const confirmed = ['accepted', 'exhibiting', 'completed'].includes(d.opportunities.status);
      out.push({ id: d.id, label: `🏛 ${OPP_DATE_LABEL[d.kind]}: ${d.opportunities.title}`, cls: `opp${confirmed ? ' confirmed' : ''}${d.certainty !== 'confirmed' ? ' uncertain' : ''}`, sort: d.kind === 'deadline' ? -0.5 : 0.5, onClick: () => { window.location.assign(`${import.meta.env.BASE_URL}firsatlar/${d.opportunity_id}`); } });
    }
  }
  for (const x of data?.extras ?? []) {
    if (x.day === day) out.push({ id: x.id, label: x.label, cls: `extra ${x.kind}`, sort: 2, onClick: x.href ? () => { window.location.assign(`${import.meta.env.BASE_URL}${x.href}`); } : undefined });
  }
  for (const p of data?.posts ?? []) {
    if (p.scheduled_at && dayKeyOf(p.scheduled_at) === day)
      out.push({ id: p.id, label: `${hhmm(minutesOf(p.scheduled_at))} ✦ ${p.title}`, cls: `post${p.status === 'published' ? ' done' : ''}`, sort: minutesOf(p.scheduled_at), onClick: openPost ? () => openPost(p) : undefined });
  }
  return out.sort((a, b) => a.sort - b.sort);
}

// ── Ay ─────────────────────────────────────────────────
function MonthView({ d }: { d: DayKey }) {
  const nav = useNavigate();
  const { openTask, openEvent, openPost } = useEditors();
  const { y, m } = parseKey(d);
  const cells = monthMatrix(y, m);
  const first = startOfWeek(startOfMonth(d)), last = addDays(first, cells.length - 1);
  const data = useCalendarRange(first, last);
  const hol = useHolidays(first, last);
  const today = todayKey();
  return (
    <section className="glass panel">
      <div className="panel-head"><Legend /></div>
      <div className="month-grid">
        {WEEKDAYS_SHORT.map((w) => <div key={w} className="wd">{w}</div>)}
        {cells.map((_, i) => {
          const k = addDays(first, i);
          const out = k < startOfMonth(d) || k > endOfMonth(d);
          const pills = pillsFor(k, data.data, hol.byDay.get(k) ?? [], openTask, openEvent, openPost);
          return (
            <div key={k} className={`mcell${out ? ' out' : ''}${k === today ? ' today' : ''}${k < today ? ' past' : ''}`} onClick={() => nav(`/gun/${k}`)} role="button" tabIndex={0} aria-label={formatLong(k)} onKeyDown={(e) => e.key === 'Enter' && nav(`/gun/${k}`)}>
              <span className="num">{parseKey(k).d}</span>
              {pills.slice(0, 3).map((p) => (
                <span key={p.id} className={`pill ${p.cls}`} title={p.label} onClick={p.onClick ? (e) => { e.stopPropagation(); p.onClick!(); } : undefined}>{p.label}</span>
              ))}
              {pills.length > 3 && <span className="more">+{pills.length - 3} daha</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Hafta ──────────────────────────────────────────────
export function useGridHandlers() {
  const saveTask = useSaveTask();
  const saveEvent = useSaveEvent();
  const toast = useToast();
  return async (it: GridItem, day: DayKey, start: number, end: number) => {
    const t = movedTimes(day, start, end);
    try {
      if (it.kind === 'task') await saveTask.mutateAsync({ id: it.rec.id, title: it.rec.title, ...t, due_date: day });
      else await saveEvent.mutateAsync({ id: it.rec.id, title: it.rec.title, ...t });
      toast.ok(`${it.rec.title} · ${formatShort(day)} ${hhmm(start)}–${hhmm(end)}`);
    } catch (x) { toast.fail(x); }
  };
}

export function gridItems(data?: CalData): GridItem[] {
  return [
    ...(data?.tasks ?? []).filter((t) => t.starts_at && t.status !== 'cancelled').map((rec) => ({ kind: 'task' as const, rec })),
    ...(data?.events ?? []).map((rec) => ({ kind: 'event' as const, rec })),
  ];
}

function WeekView({ d }: { d: DayKey }) {
  const { openTask, openEvent, openPost } = useEditors();
  const start = startOfWeek(d);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const data = useCalendarRange(days[0], days[6]);
  const hol = useHolidays(days[0], days[6]);
  const onMove = useGridHandlers();
  const allDay = new Map(days.map((k) => [k, [
    ...(data.data?.events ?? []).filter((e) => e.all_day && dayKeyOf(e.starts_at) <= k && dayKeyOf(e.ends_at) >= k).map((e) => ({ label: e.title, cls: 'event', onClick: () => openEvent(e) })),
    ...(data.data?.tasks ?? []).filter((t) => !t.starts_at && t.due_date === k && t.status !== 'cancelled').map((t) => ({ label: t.title, cls: `task${t.status === 'done' ? ' done' : ''}`, onClick: () => openTask(t) })),
    ...(data.data?.extras ?? []).filter((x) => x.day === k).map((x) => ({ label: x.label, cls: `extra ${x.kind}`, onClick: x.href ? () => { window.location.assign(`${import.meta.env.BASE_URL}${x.href}`); } : (() => {}) })),
    ...(data.data?.posts ?? []).filter((p) => p.scheduled_at && dayKeyOf(p.scheduled_at) === k).map((p) => ({ label: `${hhmm(minutesOf(p.scheduled_at!))} ✦ ${p.title}`, cls: `post${p.status === 'published' ? ' done' : ''}`, onClick: () => openPost(p) })),
  ]]));
  return (
    <section className="glass panel">
      <TimeGrid days={days} items={gridItems(data.data)} allDay={allDay} holidays={hol.byDay} onMove={onMove}
        onOpen={(it) => (it.kind === 'task' ? openTask(it.rec) : openEvent(it.rec))}
        onCreate={(day, s) => openTask({ due_date: day, starts_at: movedTimes(day, s, s + 60).starts_at, ends_at: movedTimes(day, s, s + 60).ends_at })} />
      <p className="small muted" style={{ marginTop: 10 }}>Bir öğeyi sürükleyerek başka saate veya güne taşıyın; alt kenarından çekerek süresini değiştirin. Boş alana tıklayınca yeni görev açılır.</p>
    </section>
  );
}

// ── Ajanda ─────────────────────────────────────────────
function AgendaView({ d }: { d: DayKey }) {
  const { openTask, openEvent, openPost } = useEditors();
  const end = addDays(d, 29);
  const data = useCalendarRange(d, end);
  const hol = useHolidays(d, end);
  const today = todayKey();
  const days = Array.from({ length: 30 }, (_, i) => addDays(d, i));
  const rows = days.map((k) => ({ k, pills: pillsFor(k, data.data, hol.byDay.get(k) ?? [], openTask, openEvent, openPost) })).filter((r) => r.pills.length);
  return (
    <section className="glass panel">
      {data.isLoading ? <p className="muted">Yükleniyor…</p> : rows.length === 0 ? <p className="empty">Bu 30 günde kayıt yok.</p> : rows.map(({ k, pills }) => (
        <div key={k} className={`agenda-day${k === today ? ' today' : ''}`}>
          <div className="d"><Link to={`/gun/${k}`}><b>{parseKey(k).d}</b><span className="small muted">{MONTHS[parseKey(k).m]} · {WEEKDAYS[weekdayOf(k)]}</span></Link></div>
          <div style={{ display: 'grid', gap: 4 }}>
            {pills.map((p) => <span key={p.id} className={`pill ${p.cls}`} style={{ cursor: p.onClick ? 'pointer' : 'default', fontSize: 13, padding: '5px 10px' }} onClick={p.onClick}>{p.label}</span>)}
            {(hol.byDay.get(k) ?? []).filter((h) => h.country !== 'TR' && h.kind === 'public').length > 1 && (
              <span className="small muted">{(hol.byDay.get(k) ?? []).filter((h) => h.country !== 'TR' && h.kind === 'public').map((h) => `${flag(h.country)} ${countryName(h.country)}`).join(' · ')}</span>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
