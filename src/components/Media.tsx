// Ortak medya bileşenleri: küçük görsel, proje seçici (yeni proje oluşturma dahil), galeriden/projeden seçme penceresi,
// "Cihazdan / Galeriden seç / Projeden seç" düğme üçlüsü ve toplu işlem çubuğu.
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, FileText, Film, FolderInput, FolderPlus, FolderSearch, FolderX, Images, Laptop, Music, Plus, Trash2, X } from 'lucide-react';
import { ConfirmButton, Dialog, Empty, useToast } from './ui';
import { addManyToGallery, createQuickProject, moveFiles, removeFromProject, softDeleteFiles, useFileLinks, useFiles, useProjects, useSignedUrl } from '../lib/data';
import type { FileRec, Project } from '../lib/types';

export const kindOf = (m: string) => (m.startsWith('image/') ? 'image' : m.startsWith('video/') ? 'video' : m.startsWith('audio/') ? 'audio' : 'doc');
export const isVisual = (f: FileRec) => f.mime.startsWith('image/') || f.mime.startsWith('video/');

export function Thumb({ file, fit = 'cover' }: { file: FileRec; fit?: 'cover' | 'contain' }) {
  const u = useSignedUrl(file.storage_path);
  const k = kindOf(file.mime);
  if (k === 'image' && u.data) return <img src={u.data} alt={file.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }} />;
  if (k === 'video' && u.data) return <video src={u.data} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }} />;
  const Icon = k === 'audio' ? Music : k === 'video' ? Film : FileText;
  return <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--rose-500)' }}><Icon size={30} /></div>;
}

/** Seçilebilir ızgara öğesi (onay işaretli). */
export function SelectTile({ file, selected, onToggle, caption }: { file: FileRec; selected: boolean; onToggle: () => void; caption?: string }) {
  return (
    <figure className={`pgal-item${selected ? ' sel' : ''}`} onClick={onToggle} style={{ touchAction: 'auto' }} role="checkbox" aria-checked={selected} aria-label={caption || file.title} tabIndex={0}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(); } }}>
      <div className="pgal-img"><Thumb file={file} /></div>
      <span className="pgal-check">{selected && <Check size={14} />}</span>
      <figcaption>{caption || file.title}</figcaption>
    </figure>
  );
}

// ── Proje seçici (yeni proje oluşturabilir) ────────────
export function ProjectPickDialog({ title, exclude = [], only, allowCreate = true, onPick, onClose }: {
  title: string; exclude?: string[]; only?: string[]; allowCreate?: boolean; onPick: (p: Project) => void | Promise<void>; onClose: () => void;
}) {
  const projects = useProjects();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const list = (projects.data ?? []).filter((p) => !exclude.includes(p.id) && (!only || only.includes(p.id)));
  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { const p = await createQuickProject(name); await qc.invalidateQueries({ queryKey: ['projects'] }); toast.ok(`“${p.title}” projesi oluşturuldu`); await onPick(p); }
    catch (x) { toast.fail(x); } finally { setBusy(false); }
  }
  async function choose(p: Project) { setBusy(true); try { await onPick(p); } finally { setBusy(false); } }
  return (
    <Dialog title={title} onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        {allowCreate && (
          <form className="row" onSubmit={create}>
            <input id="pp-new" className="input" style={{ flex: 1, width: 'auto' }} placeholder="Yeni proje adı…" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !name.trim()}><Plus size={14} />Yeni proje oluştur</button>
          </form>
        )}
        <div className="pick-list">
          {list.map((p) => <button type="button" key={p.id} className="task-row" disabled={busy} style={{ border: '1px solid var(--glass-edge)' }} onClick={() => choose(p)}><b>{p.icon ?? '✦'} {p.title}</b></button>)}
          {!list.length && <p className="small muted">{allowCreate ? 'Uygun proje yok; yukarıdan yenisini oluşturabilirsiniz.' : 'Uygun proje yok.'}</p>}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Vazgeç</button></div>
      </div>
    </Dialog>
  );
}

// ── Galeriden / projeden medya seçme penceresi ─────────
export function MediaPickerDialog({ mode, visualOnly, multiple = true, onPick, onClose }: {
  mode: 'gallery' | 'project'; visualOnly?: boolean; multiple?: boolean; onPick: (files: FileRec[]) => void | Promise<void>; onClose: () => void;
}) {
  const files = useFiles();
  const links = useFileLinks();
  const projects = useProjects();
  const [proj, setProj] = useState('');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const projectId = proj || projects.data?.[0]?.id || '';

  const pool = useMemo(() => {
    let list = (files.data ?? []).filter((f) => !visualOnly || isVisual(f));
    if (mode === 'project') {
      const ids = new Set((links.data ?? []).filter((l) => l.entity_type === 'project' && l.entity_id === projectId).map((l) => l.file_id));
      list = list.filter((f) => ids.has(f.id));
    }
    if (kind) list = list.filter((f) => kindOf(f.mime) === kind);
    if (q.trim()) list = list.filter((f) => f.title.toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr')));
    return list;
  }, [files.data, links.data, mode, projectId, kind, q, visualOnly]);

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  async function done(ids: string[]) {
    const recs = (files.data ?? []).filter((f) => ids.includes(f.id));
    if (!recs.length) return;
    setBusy(true);
    try { await onPick(recs); onClose(); } finally { setBusy(false); }
  }
  const kinds: [string, string][] = visualOnly ? [['', 'Tümü'], ['image', 'Görsel'], ['video', 'Video']] : [['', 'Tümü'], ['image', 'Görsel'], ['video', 'Video'], ['audio', 'Ses'], ['doc', 'Belge']];
  return (
    <Dialog title={mode === 'gallery' ? 'Galeriden seç' : 'Projeden seç'} onClose={onClose} wide>
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="row">
          {mode === 'project' && (
            <select id="mp-proj" className="select" style={{ width: 'auto' }} value={projectId} onChange={(e) => { setProj(e.target.value); setSel([]); }}>
              {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.icon ?? '✦'} {p.title}</option>)}
            </select>
          )}
          <div className="seg">{kinds.map(([k, l]) => <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
          <input id="mp-q" className="input" style={{ width: 'auto', flex: 1, minWidth: 120 }} placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="pick-grid">
          {pool.length === 0 ? <Empty title="Medya yok">{mode === 'project' ? 'Bu projenin galerisinde uygun medya yok.' : 'Galeride uygun medya yok.'}</Empty> : (
            <div className="pgal">{pool.map((f) => <SelectTile key={f.id} file={f} selected={sel.includes(f.id)} onToggle={() => (multiple ? toggle(f.id) : done([f.id]))} />)}</div>
          )}
        </div>
        {multiple && (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small muted">{sel.length ? `${sel.length} seçili` : 'Birden çok medya seçebilirsiniz'}
              {pool.length > 0 && <> · <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSel(sel.length === pool.length ? [] : pool.map((f) => f.id))}>{sel.length === pool.length ? 'Seçimi kaldır' : 'Tümünü seç'}</button></>}</span>
            <span className="row"><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Vazgeç</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!sel.length || busy} onClick={() => done(sel)}>{busy ? 'Ekleniyor…' : `Ekle${sel.length ? ` (${sel.length})` : ''}`}</button></span>
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ── "Cihazdan / Galeriden seç / Projeden seç" ──────────
export function MediaSources({ accept, multiple = true, busy, visualOnly, onFiles, onPicked, size = 'sm', id }: {
  accept?: string; multiple?: boolean; busy?: boolean; visualOnly?: boolean; size?: 'sm' | 'xs';
  onFiles: (files: File[]) => void | Promise<void>; onPicked: (files: FileRec[]) => void | Promise<void>; id: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'gallery' | 'project' | null>(null);
  const cls = size === 'xs' ? 'btn btn-ghost btn-sm' : 'btn btn-glass btn-sm';
  return (
    <span className="msrc">
      <button type="button" className={cls} disabled={busy} onClick={() => input.current?.click()}><Laptop size={14} />{busy ? 'Yükleniyor…' : 'Cihazdan'}</button>
      <button type="button" className={cls} disabled={busy} onClick={() => setMode('gallery')}><Images size={14} />Galeriden seç</button>
      <button type="button" className={cls} disabled={busy} onClick={() => setMode('project')}><FolderSearch size={14} />Projeden seç</button>
      <input ref={input} id={id} type="file" multiple={multiple} hidden accept={accept} onChange={(e) => { const fl = Array.from(e.target.files ?? []); e.target.value = ''; if (fl.length) onFiles(multiple ? fl : fl.slice(0, 1)); }} />
      {mode && <MediaPickerDialog mode={mode} visualOnly={visualOnly} multiple={multiple} onPick={onPicked} onClose={() => setMode(null)} />}
    </span>
  );
}

// ── Toplu işlem çubuğu ─────────────────────────────────
export function BulkBar({ selected, total, fromProject, linkedProjects, canCover, onCover, onAll, onClear }: {
  selected: string[]; total: number; fromProject: string | null; linkedProjects: string[];
  canCover?: boolean; onCover?: (fileId: string) => void; onAll: () => void; onClear: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [dlg, setDlg] = useState<'add' | 'move' | 'remove' | null>(null);
  const n = selected.length;
  const refresh = () => { qc.invalidateQueries({ queryKey: ['files'] }); qc.invalidateQueries({ queryKey: ['projects'] }); };
  const run = async (fn: () => Promise<void>, ok: string) => { try { await fn(); refresh(); toast.ok(ok); onClear(); } catch (x) { toast.fail(x); } };
  const pname = (p: Project) => `${p.icon ?? '✦'} ${p.title}`;
  return (
    <div className="bulkbar" role="toolbar" aria-label="Toplu işlemler">
      <b>{n} seçili</b>
      <button type="button" className="btn btn-ghost btn-sm" onClick={n === total ? onClear : onAll}>{n === total ? 'Seçimi kaldır' : `Tümünü seç (${total})`}</button>
      <button type="button" className="btn btn-glass btn-sm" disabled={!n} onClick={() => setDlg('add')}><FolderPlus size={14} />Projeye ekle</button>
      {fromProject && <button type="button" className="btn btn-glass btn-sm" disabled={!n} onClick={() => setDlg('move')}><FolderInput size={14} />Başka projeye taşı</button>}
      {fromProject
        ? <ConfirmButton className="btn btn-ghost btn-sm" label={<><FolderX size={14} />Bu projeden kaldır</>} confirmText={`${n} medya bu projeden kaldırılsın mı? (Dosyalar'da kalır)`}
            onConfirm={() => run(() => removeFromProject(selected, fromProject), 'Projeden kaldırıldı')} />
        : linkedProjects.length > 0 && <button type="button" className="btn btn-ghost btn-sm" disabled={!n} onClick={() => setDlg('remove')}><FolderX size={14} />Projeden kaldır</button>}
      {canCover && n === 1 && onCover && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCover(selected[0])}>Kapak yap</button>}
      <ConfirmButton className="btn btn-ghost btn-sm" label={<><Trash2 size={14} />Sil</>} confirmText={`${n} medya her yerden silinsin mi?`} onConfirm={() => run(() => softDeleteFiles(selected), 'Silindi')} />
      <button type="button" className="btn btn-ghost icon-btn" onClick={onClear} aria-label="Seçimi bitir"><X size={16} /></button>
      {dlg === 'add' && <ProjectPickDialog title={`${n} medyayı projeye ekle`} exclude={fromProject ? [fromProject] : []} onClose={() => setDlg(null)}
        onPick={async (p) => { setDlg(null); await run(() => addManyToGallery(selected, p.id), `${pname(p)} galerisine eklendi`); }} />}
      {dlg === 'move' && fromProject && <ProjectPickDialog title={`${n} medyayı başka projeye taşı`} exclude={[fromProject]} onClose={() => setDlg(null)}
        onPick={async (p) => { setDlg(null); await run(() => moveFiles(selected, fromProject, p.id), `${pname(p)} projesine taşındı`); }} />}
      {dlg === 'remove' && <ProjectPickDialog title="Hangi projeden kaldırılsın?" only={linkedProjects} allowCreate={false} onClose={() => setDlg(null)}
        onPick={async (p) => { setDlg(null); await run(() => removeFromProject(selected, p.id), `${pname(p)} projesinden kaldırıldı`); }} />}
    </div>
  );
}
