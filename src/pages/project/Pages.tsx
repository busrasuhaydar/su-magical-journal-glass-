// Alt sayfalar: sınırsız iç içe sayfa, blok tabanlı içerik. Görsel blokları galeriden seçer (kopya yok),
// görev blokları gerçek görev kaydını canlı gösterir.
import { useEffect, useRef, useState, type KeyboardEvent as RKE } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FilePlus2, GripVertical, ImagePlus, Link2, Plus, Trash2, Type, Heading1, Heading2, List, ListOrdered, CheckSquare, Quote, Minus, Paperclip, ListTodo, FileText, Sparkle } from 'lucide-react';
import { addToGallery, uploadFile, usePageBlocks, usePages, useSignedUrl, useTasks } from '../../lib/data';
import { supabase } from '../../lib/supabase';
import { formatRelative, dayKeyOf } from '../../lib/dates';
import type { BlockType, FileRec, Page, PageBlock, Project } from '../../lib/types';
import { useEditors } from '../../components/Editors';
import { TaskRow } from '../../components/TaskRow';
import { ConfirmButton, Dialog, Empty, useToast } from '../../components/ui';
import { MediaSources } from '../../components/Media';
import { Thumb, useProjectGallery } from './Gallery';
import { LinkButton } from './Links';

const TEMPLATES = ['Fikirler', 'Araştırmalar', 'Tasarımlar', 'Toplantı Notları', 'Üretim Süreci', 'Sonuçlar'];
const ICONS = ['📄', '💡', '🔍', '🎨', '🗒️', '🛠️', '🏁', '📸', '✨', '📚'];

export function PagesTab({ p, initialPage, onOpenPage }: { p: Project; initialPage?: string; onOpenPage: (id: string | null) => void }) {
  const pages = usePages(p.id);
  const qc = useQueryClient();
  const toast = useToast();
  const sel = initialPage && pages.data?.some((x) => x.id === initialPage) ? initialPage : null;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);

  async function create(parent: string | null, title = 'Adsız sayfa', icon = '📄') {
    const siblings = (pages.data ?? []).filter((x) => x.parent_id === parent);
    const { data, error } = await supabase.from('pages').insert({ project_id: p.id, parent_id: parent, title, icon, position: (siblings.at(-1)?.position ?? 0) + 1 }).select().single();
    if (error) return toast.fail(error);
    qc.invalidateQueries({ queryKey: ['pages'] });
    onOpenPage(data.id);
  }
  const children = (pid: string | null) => (pages.data ?? []).filter((x) => x.parent_id === pid).sort((a, b) => a.position - b.position);
  const Tree = ({ pid, depth }: { pid: string | null; depth: number }) => (
    <>{children(pid).map((pg) => {
      const kids = children(pg.id);
      return (
        <div key={pg.id}>
          <div className={`tree-row${sel === pg.id ? ' on' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
            <button type="button" className="tree-tog" onClick={() => setCollapsed((c) => { const n = new Set(c); n.has(pg.id) ? n.delete(pg.id) : n.add(pg.id); return n; })} aria-label="Aç/kapat" style={{ visibility: kids.length ? 'visible' : 'hidden' }}>
              {collapsed.has(pg.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </button>
            <button type="button" className="tree-title" onClick={() => onOpenPage(pg.id)}>{pg.icon ?? '📄'} {pg.title}</button>
            <button type="button" className="tree-add" onClick={() => create(pg.id)} aria-label="Alt sayfa ekle" title="Alt sayfa ekle"><Plus size={13} /></button>
          </div>
          {!collapsed.has(pg.id) && <Tree pid={pg.id} depth={depth + 1} />}
        </div>
      );
    })}</>
  );

  return (
    <div className="pages-layout">
      <aside className="glass panel pages-tree">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><b>Sayfalar</b><button type="button" className={`btn btn-sm ${newOpen ? 'btn-primary' : 'btn-glass'}`} aria-expanded={newOpen} onClick={() => setNewOpen((o) => !o)}><FilePlus2 size={13} />Yeni</button></div>
        {newOpen && (
          <div className="new-menu">
            <button type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => { setNewOpen(false); create(null); }}>📄 Boş sayfa</button>
            {TEMPLATES.map((t, i) => <button type="button" key={t} className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => { setNewOpen(false); create(null, t, ICONS[i + 1]); }}>{ICONS[i + 1]} {t}</button>)}
          </div>
        )}
        <Tree pid={null} depth={0} />
      </aside>
      {sel ? <PageEditor key={sel} p={p} page={pages.data!.find((x) => x.id === sel)!} allPages={pages.data ?? []} onOpenPage={onOpenPage} onCreateChild={() => create(sel)} />
        : <section className="glass panel"><Empty title="Bir sayfa seçin">Fikirler, araştırmalar, tasarımlar, toplantı notları… Her sayfanın içinde istediğiniz kadar alt sayfa açabilirsiniz.</Empty></section>}
    </div>
  );
}

const BLOCK_MENU: [BlockType, string, typeof Type][] = [
  ['text', 'Metin', Type], ['h1', 'Başlık 1', Heading1], ['h2', 'Başlık 2', Heading2], ['h3', 'Başlık 3', Heading2],
  ['bullet', 'Madde listesi', List], ['numbered', 'Numaralı liste', ListOrdered], ['todo', 'Yapılacak', CheckSquare],
  ['quote', 'Alıntı', Quote], ['callout', 'Vurgu kutusu', Sparkle], ['divider', 'Ayırıcı', Minus],
  ['image', 'Görsel (galeriden)', ImagePlus], ['file', 'Dosya', Paperclip], ['link', 'Bağlantı', Link2], ['task', 'Görev', ListTodo], ['page', 'Sayfa bağlantısı', FileText],
];

function PageEditor({ p, page, allPages, onOpenPage, onCreateChild }: { p: Project; page: Page; allPages: Page[]; onOpenPage: (id: string | null) => void; onCreateChild: () => void }) {
  const blocks = usePageBlocks(page.id);
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(page.title);
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [picker, setPicker] = useState<{ type: 'image' | 'file' | 'task' | 'page'; pos: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const list = blocks.data ?? [];
  const kids = allPages.filter((x) => x.parent_id === page.id);
  const crumbs: Page[] = [];
  for (let c: Page | undefined = page; c; c = allPages.find((x) => x.id === c!.parent_id)) crumbs.unshift(c);
  const refresh = () => qc.invalidateQueries({ queryKey: ['blocks', page.id] });

  const posAfter = (i: number) => { const a = list[i]?.position ?? 0, b = list[i + 1]?.position; return b == null ? a + 1 : (a + b) / 2; };
  async function insert(type: BlockType, pos: number, extra: Partial<PageBlock> = {}) {
    const { error } = await supabase.from('page_blocks').insert({ page_id: page.id, type, position: pos, content: {}, ...extra });
    if (error) toast.fail(error); else refresh();
    setMenuAt(null);
  }
  async function update(id: string, patch: Partial<PageBlock>) {
    const { error } = await supabase.from('page_blocks').update(patch).eq('id', id);
    if (error) toast.fail(error); else refresh();
  }
  async function remove(id: string) { const { error } = await supabase.from('page_blocks').delete().eq('id', id); if (error) toast.fail(error); else refresh(); }
  async function saveTitle() {
    if (title.trim() === page.title) return;
    const { error } = await supabase.from('pages').update({ title: title.trim() || 'Adsız sayfa' }).eq('id', page.id);
    if (error) toast.fail(error); else qc.invalidateQueries({ queryKey: ['pages'] });
  }
  async function dropOn(targetIdx: number) {
    if (!dragId) return;
    const from = list.findIndex((b) => b.id === dragId);
    setDragId(null);
    if (from < 0 || from === targetIdx) return;
    const before = targetIdx > from ? list[targetIdx]?.position : list[targetIdx - 1]?.position ?? (list[0].position - 1);
    const after = targetIdx > from ? list[targetIdx + 1]?.position ?? list[targetIdx].position + 1 : list[targetIdx].position;
    await update(dragId, { position: (before + after) / 2 });
  }
  function choose(type: BlockType, i: number) {
    const pos = i < 0 ? (list[0]?.position ?? 1) - 1 : posAfter(i);
    if (type === 'image' || type === 'file' || type === 'task' || type === 'page') { setPicker({ type, pos }); setMenuAt(null); return; }
    insert(type, pos);
  }
  async function enterAfter(i: number, type: BlockType) {
    const next: BlockType = ['bullet', 'numbered', 'todo'].includes(type) ? type : 'text';
    await insert(next, posAfter(i));
  }

  let num = 0;
  return (
    <section className="glass panel page-editor">
      <div className="small muted row" style={{ gap: 4 }}>
        {crumbs.map((c, i) => <span key={c.id}>{i > 0 && ' / '}<button type="button" className="crumb" onClick={() => onOpenPage(c.id)}>{c.icon} {c.title}</button></span>)}
      </div>
      <div className="row" style={{ alignItems: 'center', gap: 8, marginTop: 8 }}>
        <select id="pg-icon" className="icon-pick" value={page.icon ?? '📄'} onChange={async (e) => { await supabase.from('pages').update({ icon: e.target.value }).eq('id', page.id); qc.invalidateQueries({ queryKey: ['pages'] }); }} aria-label="Sayfa simgesi">
          {ICONS.map((i) => <option key={i}>{i}</option>)}
        </select>
        <input id="pg-title" className="page-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </div>
      <div className="row small muted" style={{ marginBottom: 10 }}>
        <span>Son düzenleme: {formatRelative(dayKeyOf(page.updated_at))}</span>
        <LinkButton fromType="page" fromId={page.id} excludeProject={p.id} />
        <ConfirmButton label={<><Trash2 size={13} />Sayfayı sil</>} className="btn btn-ghost btn-sm" confirmText="Sayfa ve alt sayfaları çöp kutusuna taşınsın mı?"
          onConfirm={async () => { const { error } = await supabase.from('pages').update({ deleted_at: new Date().toISOString() }).eq('id', page.id); if (error) toast.fail(error); else { qc.invalidateQueries({ queryKey: ['pages'] }); onOpenPage(page.parent_id); } }} />
      </div>

      <div className="blocks">
        {list.length === 0 && <button type="button" className="block-empty" onClick={() => setMenuAt(-1)}>Yazmaya başlamak için tıklayın veya bir blok seçin…</button>}
        {menuAt === -1 && <BlockMenu onPick={(t) => choose(t, -1)} onClose={() => setMenuAt(null)} />}
        {list.map((b, i) => {
          num = b.type === 'numbered' ? num + 1 : 0;
          return (
            <div key={b.id} className={`block-row${dragId === b.id ? ' dragging' : ''}`} onDragOver={(e) => dragId && e.preventDefault()} onDrop={() => dropOn(i)}>
              <div className="block-gutter">
                <button type="button" className="bg-btn" onClick={() => setMenuAt(menuAt === i ? null : i)} aria-label="Altına blok ekle"><Plus size={14} /></button>
                <span className="bg-btn" draggable onDragStart={() => setDragId(b.id)} onDragEnd={() => setDragId(null)} aria-label="Sürükle" role="button" tabIndex={-1}><GripVertical size={14} /></span>
              </div>
              <div className="block-body">
                <Block b={b} n={num} p={p} onChange={(patch) => update(b.id, patch)} onEnter={() => enterAfter(i, b.type)} onDelete={() => remove(b.id)} onOpenPage={onOpenPage} />
              </div>
              <button type="button" className="bg-btn del" onClick={() => remove(b.id)} aria-label="Bloğu sil"><Trash2 size={13} /></button>
              {menuAt === i && <BlockMenu onPick={(t) => choose(t, i)} onClose={() => setMenuAt(null)} />}
            </div>
          );
        })}
        {list.length > 0 && <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start', marginTop: 6 }} onClick={() => setMenuAt(list.length - 1)}><Plus size={13} />Blok ekle</button>}
      </div>

      <div style={{ marginTop: 20 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><b className="small">Alt sayfalar</b><button type="button" className="btn btn-glass btn-sm" onClick={onCreateChild}><Plus size={13} />Alt sayfa</button></div>
        <div className="row" style={{ marginTop: 6 }}>{kids.map((k) => <button type="button" key={k.id} className="chip" style={{ cursor: 'pointer', padding: '6px 12px' }} onClick={() => onOpenPage(k.id)}>{k.icon} {k.title}</button>)}{!kids.length && <span className="small muted">Yok</span>}</div>
      </div>
      {picker && <Picker p={p} type={picker.type} pageId={page.id} allPages={allPages} onClose={() => setPicker(null)} onPick={(extra) => { insert(picker.type, picker.pos, extra); setPicker(null); }} />}
    </section>
  );
}

function BlockMenu({ onPick, onClose }: { onPick: (t: BlockType) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', h)); return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div className="block-menu" ref={ref} role="menu">
      {BLOCK_MENU.map(([t, l, I]) => <button type="button" key={t} role="menuitem" onClick={() => onPick(t)}><I size={15} />{l}</button>)}
    </div>
  );
}

function AutoText({ value, onSave, onEnter, onEmptyBackspace, className, placeholder }: { value: string; onSave: (v: string) => void; onEnter?: () => void; onEmptyBackspace?: () => void; className?: string; placeholder?: string }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setV(value), [value]);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }, [v]);
  const key = (e: RKE<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && onEnter) { e.preventDefault(); if (v !== value) onSave(v); onEnter(); }
    if (e.key === 'Backspace' && v === '' && onEmptyBackspace) { e.preventDefault(); onEmptyBackspace(); }
  };
  return <textarea ref={ref} rows={1} className={`block-text ${className ?? ''}`} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} onKeyDown={key} />;
}

function Block({ b, n, p, onChange, onEnter, onDelete, onOpenPage }: { b: PageBlock; n: number; p: Project; onChange: (patch: Partial<PageBlock>) => void; onEnter: () => void; onDelete: () => void; onOpenPage: (id: string) => void }) {
  const text = b.content.text ?? '';
  const save = (t: string) => onChange({ content: { ...b.content, text: t } });
  const common = { value: text, onSave: save, onEnter, onEmptyBackspace: onDelete };
  const tasks = useTasks();
  const gallery = useProjectGallery(p.id);
  switch (b.type) {
    case 'h1': case 'h2': case 'h3': return <AutoText {...common} className={b.type} placeholder="Başlık" />;
    case 'bullet': return <div className="li"><span className="li-mark">•</span><AutoText {...common} placeholder="Liste öğesi" /></div>;
    case 'numbered': return <div className="li"><span className="li-mark">{n}.</span><AutoText {...common} placeholder="Liste öğesi" /></div>;
    case 'todo': return <div className="li"><input id={`td-${b.id}`} type="checkbox" checked={!!b.content.checked} onChange={(e) => onChange({ content: { ...b.content, checked: e.target.checked } })} style={{ marginTop: 6 }} /><AutoText {...common} className={b.content.checked ? 'checked' : ''} placeholder="Yapılacak" /></div>;
    case 'quote': return <div className="quote"><AutoText {...common} placeholder="Alıntı" /></div>;
    case 'callout': return <div className="callout"><span>✦</span><AutoText {...common} placeholder="Önemli bir not" /></div>;
    case 'divider': return <hr className="divider" />;
    case 'link': return <LinkBlock b={b} onChange={onChange} />;
    case 'image': {
      const it = gallery.find((g) => g.file.id === b.file_id);
      return it ? <figure className="img-block"><div><Thumb file={it.file} fit="contain" /></div><figcaption>{it.link.caption || it.file.title}</figcaption></figure> : <p className="small muted">Görsel galeriden kaldırılmış.</p>;
    }
    case 'file': return <FileBlock fileId={b.file_id} />;
    case 'task': {
      const t = tasks.data?.find((x) => x.id === b.task_id);
      return t ? <TaskRow task={t} /> : <p className="small muted">Görev silinmiş.</p>;
    }
    case 'page': return b.ref_page_id ? <button type="button" className="page-link" onClick={() => onOpenPage(b.ref_page_id!)}><FileText size={14} />{b.content.title ?? 'Sayfa'}</button> : null;
    default: return <AutoText {...common} placeholder="Yazın…" />;
  }
}

function LinkBlock({ b, onChange }: { b: PageBlock; onChange: (patch: Partial<PageBlock>) => void }) {
  const [edit, setEdit] = useState(!b.content.url);
  const [url, setUrl] = useState(b.content.url ?? '');
  const [title, setTitle] = useState(b.content.title ?? '');
  if (edit) return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); let u = url.trim(); if (!u) return; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; try { new URL(u); } catch { return; } onChange({ content: { url: u, title: title.trim() || new URL(u).hostname } }); setEdit(false); }}>
      <input id={`lb-t-${b.id}`} className="input" style={{ flex: '1 1 140px', width: 'auto' }} placeholder="Ad" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input id={`lb-u-${b.id}`} className="input" style={{ flex: '2 1 200px', width: 'auto' }} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      <button className="btn btn-primary btn-sm">Ekle</button>
    </form>
  );
  return <a className="card link-card" href={b.content.url} target="_blank" rel="noopener noreferrer" onDoubleClick={(e) => { e.preventDefault(); setEdit(true); }}><Link2 size={16} /><div><b>{b.content.title}</b><div className="small muted">{b.content.url && new URL(b.content.url).hostname}</div></div></a>;
}

function FileBlock({ fileId }: { fileId: string | null }) {
  const qc = useQueryClient();
  const files = qc.getQueryData<{ id: string; title: string; storage_path: string; size: number }[]>(['files']);
  const f = files?.find((x) => x.id === fileId);
  const u = useSignedUrl(f?.storage_path);
  if (!f) return <p className="small muted">Dosya bulunamadı.</p>;
  return <a className="card link-card" href={u.data} target="_blank" rel="noopener noreferrer"><Paperclip size={16} /><b>{f.title}</b></a>;
}

function Picker({ p, type, pageId, allPages, onClose, onPick }: { p: Project; type: 'image' | 'file' | 'task' | 'page'; pageId: string; allPages: Page[]; onClose: () => void; onPick: (extra: Partial<PageBlock>) => void }) {
  const gallery = useProjectGallery(p.id);
  const tasks = useTasks();
  const qc = useQueryClient();
  const toast = useToast();
  const { openTask } = useEditors();
  const [busy, setBusy] = useState(false);
  const pool = type === 'image' ? gallery.filter((g) => g.file.mime.startsWith('image/') || g.file.mime.startsWith('video/')) : gallery;
  async function upload(input: File[] | FileRec[]) {
    if (!input.length) return; setBusy(true);
    try { const first = input[0]; const rec = first instanceof File ? (await uploadFile(first)).rec : first; await addToGallery(rec.id, p.id); qc.invalidateQueries({ queryKey: ['files'] }); onPick({ file_id: rec.id }); toast.ok('Galeriye de eklendi'); }
    catch (x) { toast.fail(x); } finally { setBusy(false); }
  }
  const title = { image: 'Galeriden görsel seçin', file: 'Dosya seçin', task: 'Görev seçin', page: 'Sayfa seçin' }[type];
  return (
    <Dialog title={title} onClose={onClose} wide>
      {(type === 'image' || type === 'file') && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <MediaSources id="pk-in" busy={busy} multiple={false} visualOnly={type === 'image'} accept={type === 'image' ? 'image/*,video/*' : undefined} onFiles={upload} onPicked={upload} />
            <span className="small muted">Seçtiğiniz dosya projenin galerisine de eklenir.</span>
          </div>
          {pool.length === 0 ? <p className="small muted">Galeride uygun dosya yok.</p> : (
            <div className="pgal">{pool.map((g) => <figure key={g.link.id} className="pgal-item" onClick={() => onPick({ file_id: g.file.id })}><div className="pgal-img"><Thumb file={g.file} /></div><figcaption>{g.link.caption || g.file.title}</figcaption></figure>)}</div>
          )}
        </>
      )}
      {type === 'task' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <button type="button" className="btn btn-glass btn-sm" style={{ justifySelf: 'start' }} onClick={() => { onClose(); openTask({ project_id: p.id }); }}><Plus size={13} />Yeni görev oluştur (sonra buradan seçin)</button>
          <div className="task-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
            {(tasks.data ?? []).filter((t) => t.status !== 'cancelled').sort((a, b) => (a.project_id === p.id ? -1 : 0) - (b.project_id === p.id ? -1 : 0)).map((t) => (
              <button type="button" key={t.id} className="task-row" style={{ textAlign: 'left', border: '1px solid var(--glass-edge)' }} onClick={() => onPick({ task_id: t.id })}><div className="t"><b>{t.title}</b><div className="meta">{t.project_id === p.id ? 'Bu proje' : 'Başka proje / genel'}</div></div></button>
            ))}
          </div>
        </div>
      )}
      {type === 'page' && (
        <div className="task-list">{allPages.filter((x) => x.id !== pageId).map((x) => <button type="button" key={x.id} className="task-row" style={{ textAlign: 'left', border: '1px solid var(--glass-edge)' }} onClick={() => onPick({ ref_page_id: x.id, content: { title: `${x.icon ?? ''} ${x.title}`.trim() } })}><b>{x.icon} {x.title}</b></button>)}</div>
      )}
    </Dialog>
  );
}
