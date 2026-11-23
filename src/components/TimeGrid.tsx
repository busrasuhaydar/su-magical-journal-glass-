// Gün ve hafta için saatlik ızgara. Fare ve dokunmatikte aynı işaretçi olaylarıyla sürükle / boyutlandır.
import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { Link } from 'react-router-dom';
import { dayKeyOf, formatShort, hhmm, minutesOf, todayKey, toInstant, WEEKDAYS_SHORT, weekdayOf, type DayKey } from '../lib/dates';
import type { CalEvent, Holiday, Task } from '../lib/types';
import { flag } from '../lib/countries';

export const DAY_START = 8 * 60, DAY_END = 23 * 60, SNAP = 15;

export type GridItem = { kind: 'task'; rec: Task } | { kind: 'event'; rec: CalEvent };
type Placed = GridItem & { col: number; start: number; end: number; lane: number; lanes: number };

function hourPx() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour')) || 56;
}

function place(items: GridItem[], days: DayKey[]): Placed[] {
  const out: Placed[] = [];
  days.forEach((d, col) => {
    const dayItems = items.flatMap((it) => {
      const s = it.rec.starts_at!, e = it.rec.ends_at ?? it.rec.starts_at!;
      if (dayKeyOf(s) > d || dayKeyOf(e) < d) return [];
      if (it.kind === 'event' && it.rec.all_day) return [];
      const start = dayKeyOf(s) < d ? 0 : minutesOf(s);
      const end = dayKeyOf(e) > d ? 24 * 60 : Math.max(minutesOf(e), start + SNAP);
      return [{ ...it, col, start, end, lane: 0, lanes: 1 } as Placed];
    }).sort((a, b) => a.start - b.start || b.end - a.end);
    // Çakışan öğeleri yan yana şeritlere yerleştir
    let group: Placed[] = [], groupEnd = -1;
    const flush = () => { const n = Math.max(...group.map((g) => g.lane)) + 1; group.forEach((g) => (g.lanes = n)); group = []; };
    for (const it of dayItems) {
      if (it.start >= groupEnd && group.length) flush();
      const used = new Set(group.filter((g) => g.end > it.start).map((g) => g.lane));
      let lane = 0; while (used.has(lane)) lane++;
      it.lane = lane; group.push(it); groupEnd = Math.max(groupEnd, it.end);
    }
    if (group.length) flush();
    out.push(...dayItems);
  });
  return out;
}

interface Props {
  days: DayKey[];
  items: GridItem[];
  allDay?: Map<DayKey, { label: string; cls: string; onClick?: () => void }[]>;
  holidays?: Map<DayKey, Holiday[]>;
  onMove: (it: GridItem, day: DayKey, start: number, end: number) => void;
  onOpen: (it: GridItem) => void;
  onCreate: (day: DayKey, start: number) => void;
}

type Drag = { id: string; mode: 'move' | 'resize'; it: Placed; x0: number; y0: number; colW: number; dCol: number; dMin: number; moved: boolean };

export function TimeGrid({ days, items, allDay, holidays, onMove, onOpen, onCreate }: Props) {
  const placed = place(items.filter((i) => i.rec.starts_at), days);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [now, setNow] = useState(() => new Date());
  const today = todayKey();
  const hp = hourPx();
  const minPx = hp / 60;
  const visStart = Math.min(DAY_START, ...placed.map((p) => p.start)), visEnd = Math.max(DAY_END, ...placed.map((p) => Math.min(p.end, 24 * 60)));
  const startHour = Math.floor(visStart / 60), endHour = Math.ceil(visEnd / 60);
  const top = (m: number) => (m - startHour * 60) * minPx;

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  function down(e: RPE, it: Placed, mode: Drag['mode']) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const colW = (bodyRef.current?.getBoundingClientRect().width ?? 0) / days.length;
    setDrag({ id: it.rec.id, mode, it, x0: e.clientX, y0: e.clientY, colW, dCol: 0, dMin: 0, moved: false });
  }
  function move(e: RPE) {
    if (!drag) return;
    const dy = e.clientY - drag.y0, dx = e.clientX - drag.x0;
    const moved = drag.moved || Math.abs(dy) > 4 || Math.abs(dx) > 4;
    const dMin = Math.round(dy / minPx / SNAP) * SNAP;
    const dCol = drag.mode === 'move' && days.length > 1 ? Math.max(-drag.it.col, Math.min(days.length - 1 - drag.it.col, Math.round(dx / drag.colW))) : 0;
    setDrag({ ...drag, dMin, dCol, moved });
  }
  function up() {
    if (!drag) return;
    const { it, mode, dMin, dCol, moved } = drag;
    setDrag(null);
    if (!moved) return onOpen(it);
    const dur = it.end - it.start;
    if (mode === 'move') {
      const start = Math.max(0, Math.min(24 * 60 - dur, it.start + dMin));
      onMove(it, days[it.col + dCol], start, start + dur);
    } else {
      onMove(it, days[it.col], it.start, Math.max(it.start + SNAP, Math.min(24 * 60, it.end + dMin)));
    }
  }

  function bgClick(e: React.MouseEvent, day: DayKey) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const m = Math.floor(((e.clientY - r.top) / minPx + startHour * 60) / 30) * 30;
    onCreate(day, Math.min(m, 23 * 60));
  }

  return (
    <div className="tg" style={{ ['--cols' as string]: days.length }}>
      <div className="tg-head">
        <div />
        {days.map((d) => (
          <div key={d} className={d === today ? 'today' : ''}>
            <Link to={`/gun/${d}`}>{WEEKDAYS_SHORT[weekdayOf(d)]} · {formatShort(d)}</Link>
            {holidays?.get(d)?.filter((h) => h.kind !== 'observance').slice(0, 2).map((h) => (
              <div key={h.id} className="hols" title={`${h.local_name}${h.certainty !== 'confirmed' ? ' (kesinleşmedi)' : ''}`}>{flag(h.country)} {h.local_name}</div>
            ))}
          </div>
        ))}
      </div>
      {allDay && [...allDay.values()].some((v) => v.length) && (
        <div className="tg-allday">
          <div>Tüm gün</div>
          {days.map((d) => (
            <div key={d}>{allDay.get(d)?.map((a, i) => <button type="button" key={i} className={`pill ${a.cls}`} onClick={a.onClick} style={{ border: 0, textAlign: 'left', cursor: 'pointer' }}>{a.label}</button>)}</div>
          ))}
        </div>
      )}
      <div ref={scrollRef} style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'inherit', maxHeight: '70vh', overflowY: 'auto' }}>
        <div className="tg-hours" style={{ paddingTop: 8 }}>
          {Array.from({ length: endHour - startHour }, (_, i) => <div key={i}>{hhmm((startHour + i) * 60)}</div>)}
        </div>
        <div className="tg-body" ref={bodyRef} style={{ paddingTop: 8, height: (endHour - startHour) * hp + 8 }} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)}>
          {days.map((d, col) => (
            <div key={d} className={`tg-col${d === today ? ' today' : ''}`} style={{ gridColumn: col + 1, gridRow: 1, height: (endHour - startHour) * hp }} onClick={(e) => bgClick(e, d)}>
              {d === today && minutesOf(now) >= startHour * 60 && minutesOf(now) <= endHour * 60 && <div className="tg-now" style={{ top: top(minutesOf(now)) }} />}
            </div>
          ))}
          {drag?.moved && (() => {
            const it = drag.it, dur = it.end - it.start;
            const s = drag.mode === 'move' ? Math.max(0, Math.min(24 * 60 - dur, it.start + drag.dMin)) : it.start;
            const e = drag.mode === 'move' ? s + dur : Math.max(it.start + SNAP, it.end + drag.dMin);
            const col = it.col + drag.dCol;
            return <div className="tg-ghost" style={{ top: top(s) + 8, height: (e - s) * minPx, left: `calc(${(col / days.length) * 100}% + 3px)`, width: `calc(${100 / days.length}% - 6px)`, right: 'auto' }}>
              <span className="mono small" style={{ padding: 4, color: 'var(--rose-600)' }}>{hhmm(s)}–{hhmm(e)}</span>
            </div>;
          })()}
          {placed.map((p) => {
            const isDrag = drag?.id === p.rec.id && drag.moved;
            const done = p.kind === 'task' && p.rec.status === 'done';
            const w = 100 / days.length;
            const cls = p.kind === 'event' ? `event ${p.rec.kind}` : 'task';
            return (
              <div key={`${p.kind}-${p.rec.id}-${p.col}`} className={`tg-item ${cls}${done ? ' done' : ''}${isDrag ? ' dragging' : ''}`}
                style={{ top: top(p.start) + 8, height: Math.max((p.end - p.start) * minPx - 2, 20),
                  left: `calc(${p.col * w + (p.lane * w) / p.lanes}% + 3px)`, width: `calc(${w / p.lanes}% - 6px)`, right: 'auto', opacity: isDrag ? 0.35 : undefined }}
                onPointerDown={(e) => down(e, p, 'move')}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p); }}
                tabIndex={0} role="button" aria-label={`${p.rec.title}, ${hhmm(p.start)}–${hhmm(p.end)}`}>
                <b>{p.rec.title}</b>
                <span className="tm">{hhmm(p.start)}–{hhmm(p.end % (24 * 60) || (p.end ? 24 * 60 : 0))}</span>
                <div className="tg-resize" onPointerDown={(e) => down(e, p, 'resize')} aria-hidden />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Taşıma sonucunu kayda uygular: başlangıç/bitiş ISO döndürür. */
export function movedTimes(day: DayKey, start: number, end: number) {
  return { starts_at: toInstant(day, start), ends_at: toInstant(day, Math.min(end, 24 * 60 - 1)) };
}
