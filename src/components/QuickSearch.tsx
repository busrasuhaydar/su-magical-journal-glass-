// Hızlı arama (⌘K / Ctrl+K): projeler, sayfalar, görevler, içerikler, kişiler, fırsatlar, fikirler ve sayfalar arası geçiş.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAllPages, useContacts, useIdeas, useOpportunities, usePosts, useProjects, useTasks } from '../lib/data';
import { dayKeyOf, formatRelative, todayKey } from '../lib/dates';
import { useEditors } from './Editors';
import { useNfts } from '../lib/nft';

type Item = { group: string; label: string; hint?: string; icon: string; run: () => void };
const norm = (s: string) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

export function QuickSearch() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); } };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, []);
  return (
    <>
      <button type="button" className="search-btn glass" onClick={() => setOpen(true)} aria-label="Ara (⌘K)" title="Ara (⌘K)"><Search size={18} /></button>
      {open && <Palette onClose={() => setOpen(false)} />}
    </>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const { openTask, openPost, openEvent } = useEditors();
  const projects = useProjects(), pages = useAllPages(), tasks = useTasks(), posts = usePosts(), contacts = useContacts(), opps = useOpportunities(), ideas = useIdeas();
  const nfts = useNfts();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const go = (to: string) => () => { nav(to); onClose(); };
  const act = (f: () => void) => () => { onClose(); f(); };

  const all: Item[] = useMemo(() => [
    { group: 'Hızlı işlemler', label: 'Yeni görev', icon: '＋', run: act(() => openTask({ due_date: todayKey() })) },
    { group: 'Hızlı işlemler', label: 'Yeni içerik (sosyal medya)', icon: '✦', run: act(() => openPost({})) },
    { group: 'Hızlı işlemler', label: 'Yeni etkinlik', icon: '◷', run: act(() => openEvent({})) },
    ...[['Ana Sayfa', '/'], ['Bugün', `/gun/${todayKey()}`], ['Takvim', '/takvim/yil'], ['Görevler', '/gorevler'], ['Projelerim', '/projeler'], ['Sosyal Medya', '/sosyal'],
      ['Sergiler ve Fırsatlar', '/firsatlar'], ['Kişiler', '/kisiler'], ['Fikirler', '/fikirler'], ['Ortak Galeri', '/galeri'], ['Koleksiyonlarım', '/koleksiyonlar'], ['Dosyalar', '/dosyalar'], ['Ayarlar', '/ayarlar']]
      .map(([l, to]) => ({ group: 'Git', label: l, icon: '→', run: go(to) })),
    ...(projects.data ?? []).map((p) => ({ group: 'Projeler', label: p.title, icon: p.icon ?? '✦', run: go(`/projeler/${p.slug}`) })),
    ...(pages.data ?? []).map((pg) => { const p = projects.data?.find((x) => x.id === pg.project_id); return { group: 'Sayfalar', label: pg.title, hint: p?.title, icon: pg.icon ?? '📄', run: go(`/projeler/${p?.slug}/sayfalar/${pg.id}`) }; }),
    ...(tasks.data ?? []).filter((t) => t.status !== 'cancelled').map((t) => { const d = t.starts_at ? dayKeyOf(t.starts_at) : t.due_date; return { group: 'Görevler', label: t.title, hint: [t.status === 'done' ? 'Tamamlandı' : '', d ? formatRelative(d) : ''].filter(Boolean).join(' · '), icon: t.status === 'done' ? '✓' : '○', run: act(() => openTask(t)) }; }),
    ...(posts.data ?? []).map((p) => ({ group: 'İçerikler', label: p.title, hint: p.scheduled_at ? formatRelative(dayKeyOf(p.scheduled_at)) : undefined, icon: '✦', run: act(() => openPost(p)) })),
    ...(opps.data ?? []).map((o) => ({ group: 'Fırsatlar', label: o.title, hint: o.organization ?? undefined, icon: '🏛', run: go(`/firsatlar/${o.id}`) })),
    ...(contacts.data ?? []).map((c) => ({ group: 'Kişiler', label: c.name, hint: c.organization ?? undefined, icon: '☺', run: go('/kisiler') })),
    ...(nfts.data?.items ?? []).map((n) => ({ group: 'NFT eserleri', label: n.name, hint: nfts.data!.collections.find((c) => c.slug === n.c)?.name, icon: '🖼️', run: go(`/koleksiyonlar/${n.c}?eser=${n.contract.slice(0, 10).toLowerCase()}-${n.tokenId}`) })),
    ...(nfts.data?.collections ?? []).map((c) => ({ group: 'Koleksiyonlar', label: c.name, icon: '🖼️', run: go(`/koleksiyonlar/${c.slug}`) })),
    ...(ideas.data ?? []).map((i) => ({ group: 'Fikirler', label: i.title, icon: '💡', run: go('/fikirler') })),
  ], [projects.data, pages.data, tasks.data, posts.data, opps.data, contacts.data, ideas.data, nfts.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return all.filter((i) => i.group === 'Hızlı işlemler' || i.group === 'Git' || i.group === 'Projeler').slice(0, 30);
    return all.filter((i) => norm(`${i.label} ${i.hint ?? ''}`).includes(n)).sort((a, b) => Number(!norm(a.label).startsWith(n)) - Number(!norm(b.label).startsWith(n))).slice(0, 40);
  }, [q, all]);
  useEffect(() => setSel(0), [q]);

  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter') results[sel]?.run();
  };
  let last = '';
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk" role="dialog" aria-label="Hızlı arama">
        <input ref={input} id="cmdk-q" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Ara: proje, görev, içerik, kişi, sayfa…" autoComplete="off" />
        <div className="cmdk-list">
          {results.length === 0 && <p className="small muted" style={{ padding: 12 }}>Sonuç yok.</p>}
          {results.map((r, i) => {
            const head = r.group !== last ? <div className="cmdk-group">{r.group}</div> : null; last = r.group;
            return <div key={i}>{head}<button type="button" className={`cmdk-item${i === sel ? ' on' : ''}`} onMouseEnter={() => setSel(i)} onClick={r.run}><span>{r.icon}</span><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>{r.hint && <span className="k">{r.hint}</span>}</button></div>;
          })}
        </div>
      </div>
    </div>
  );
}
