import { useRef, useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Music, Film, Upload, Download } from 'lucide-react';
import { PageHead } from '../components/Shell';
import { ConfirmButton, Empty, formatBytes, useToast } from '../components/ui';
import { linkFile, uploadFile, useFileLinks, useFiles, useProjects, useSignedUrl, useSoftDelete } from '../lib/data';
import { dayKeyOf, formatShort } from '../lib/dates';
import { supabase } from '../lib/supabase';
import type { FileRec } from '../lib/types';

export default function FilesPage() {
  const files = useFiles();
  const links = useFileLinks();
  const projects = useProjects();
  const qc = useQueryClient();
  const toast = useToast();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    let reused = 0;
    try {
      for (const f of Array.from(list)) { const r = await uploadFile(f); if (r.reused) reused++; }
      qc.invalidateQueries({ queryKey: ['files'] });
      toast.ok(reused ? `Yüklendi (${reused} dosya zaten vardı)` : 'Dosyalar yüklendi');
    } catch (x) { toast.fail(x); } finally { setBusy(false); }
  }
  const linksOf = (id: string) => (links.data ?? []).filter((l) => l.file_id === id);
  const list = (files.data ?? []).filter((f) => !filter || (filter === 'image' ? f.mime.startsWith('image/') : filter === 'video' ? f.mime.startsWith('video/') : filter === 'audio' ? f.mime.startsWith('audio/') : !/^(image|video|audio)\//.test(f.mime)));

  return (
    <>
      <PageHead title="Dosyalar">
        <div className="seg">{[['', 'Tümü'], ['image', 'Görsel'], ['video', 'Video'], ['audio', 'Ses'], ['doc', 'Belge']].map(([k, l]) => <button type="button" key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
      </PageHead>
      <div className={`dropzone glass${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e: DragEvent) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}>
        <Upload size={18} /> {busy ? 'Yükleniyor…' : 'Dosyaları buraya bırakın'} <button type="button" className="btn btn-glass btn-sm" disabled={busy} onClick={() => ref.current?.click()}>Dosya seç</button>
        <input ref={ref} id="f-input" type="file" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        <div className="small">Her dosya bir kez saklanır ve birden çok projeye bağlanabilir. Dosyalar size özel, şifreli bağlantıyla açılır.</div>
      </div>
      {files.data?.length === 0 && <section className="glass panel"><Empty title="Henüz dosya yok" /></section>}
      <div className="file-grid">
        {list.map((f) => <FileCard key={f.id} f={f} linked={linksOf(f.id)} projects={projects.data ?? []}
          onLink={async (pid) => { try { await linkFile(f.id, 'project', pid); qc.invalidateQueries({ queryKey: ['files'] }); toast.ok('Projeye bağlandı'); } catch (x) { toast.fail(x); } }}
          onUnlink={async (lid) => { const { error } = await supabase.from('file_links').delete().eq('id', lid); if (error) toast.fail(error); else qc.invalidateQueries({ queryKey: ['files'] }); }} />)}
      </div>
    </>
  );
}

function FileCard({ f, linked, projects, onLink, onUnlink }: {
  f: FileRec; linked: { id: string; entity_type: string; entity_id: string }[]; projects: { id: string; title: string; color: string }[];
  onLink: (pid: string) => void; onUnlink: (lid: string) => void;
}) {
  const u = useSignedUrl(f.storage_path);
  const del = useSoftDelete('files');
  const toast = useToast();
  const projLinks = linked.filter((l) => l.entity_type === 'project');
  const Icon = f.mime.startsWith('audio/') ? Music : f.mime.startsWith('video/') ? Film : FileText;
  return (
    <div className="glass file-card">
      <div className="thumb">{f.mime.startsWith('image/') && u.data ? <img src={u.data} alt={f.title} loading="lazy" /> : <Icon size={30} />}</div>
      <b>{f.title}</b>
      <span className="small muted">{formatBytes(f.size)} · {formatShort(dayKeyOf(f.created_at))}{linked.some((l) => l.entity_type === 'journal_day') ? ' · günlükte' : ''}</span>
      <div className="row" style={{ gap: 4 }}>
        {projLinks.map((l) => { const p = projects.find((x) => x.id === l.entity_id); return p ? <span key={l.id} className="chip"><i className="dot" style={{ background: p.color }} />{p.title}<button type="button" onClick={() => onUnlink(l.id)} aria-label="Bağlantıyı kaldır" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, marginLeft: 2 }}>×</button></span> : null; })}
      </div>
      {projects.length > 0 && (
        <select id={`fl-${f.id}`} className="select" value="" onChange={(e) => e.target.value && onLink(e.target.value)} style={{ padding: '6px 8px', fontSize: 12.5 }}>
          <option value="">Projeye bağla…</option>
          {projects.filter((p) => !projLinks.some((l) => l.entity_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      )}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        {u.data ? <a className="btn btn-ghost btn-sm" href={u.data} target="_blank" rel="noopener noreferrer"><Download size={13} />Aç</a> : <span />}
        <ConfirmButton label="Sil" className="btn btn-ghost btn-sm" confirmText="Silinsin mi?" onConfirm={async () => { try { await del.mutateAsync(f.id); toast.ok('Dosya çöp kutusuna taşındı'); } catch (x) { toast.fail(x); } }} />
      </div>
    </div>
  );
}
