// Sosyal medya içerik listesi: merkezde ve proje sekmesinde aynı bileşen, aynı kayıtlar.
import { useMemo, useState } from 'react';
import { Plus, ExternalLink } from 'lucide-react';
import { useProjects } from '../lib/data';
import { dayKeyOf, formatLong, formatRelative, hhmm, minutesOf, todayKey } from '../lib/dates';
import { CONTENT_TYPE_LABEL, PLATFORM_LABEL, POST_STATUS_COLOR, POST_STATUS_LABEL, type Platform, type PostStatus, type SocialPost } from '../lib/types';
import { useEditors } from './Editors';
import { Empty } from './ui';

export function PostList({ posts, projectId, loading }: { posts: SocialPost[]; projectId?: string; loading?: boolean }) {
  const { openPost } = useEditors();
  const projects = useProjects();
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [proj, setProj] = useState('');
  const [view, setView] = useState<'upcoming' | 'all' | 'published'>('upcoming');
  const today = todayKey();

  const list = useMemo(() => posts.filter((p) =>
    (!platform || p.post_targets?.some((t) => t.platform === platform)) && (!status || p.status === status) && (!type || p.content_type === type) && (!proj || p.project_id === proj) &&
    (view === 'all' || (view === 'published' ? p.status === 'published' : p.status !== 'published'))), [posts, platform, status, type, proj, view]);

  const groups = useMemo(() => {
    const m = new Map<string, SocialPost[]>();
    for (const p of list) { const k = p.scheduled_at ? dayKeyOf(p.scheduled_at) : ''; m.set(k, [...(m.get(k) ?? []), p]); }
    const keys = [...m.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : view === 'published' ? b.localeCompare(a) : a.localeCompare(b)));
    return keys.map((k) => ({ k, items: m.get(k)! }));
  }, [list, view]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    posts.filter((p) => p.status !== 'published').forEach((p) => p.post_targets?.forEach((t) => (c[t.platform] = (c[t.platform] ?? 0) + 1)));
    return c;
  }, [posts]);

  return (
    <div style={{ display: 'grid', gap: 'var(--s4)' }}>
      <div className="stat-row">
        {(['instagram', 'x', 'youtube', 'website'] as Platform[]).map((p) => <div key={p} className="stat"><b>{counts[p] ?? 0}</b><span>{PLATFORM_LABEL[p]} · planlı</span></div>)}
        <div className="stat"><b style={{ color: 'var(--bad)' }}>{posts.filter((p) => p.status === 'failed').length}</b><span>Başarısız</span></div>
      </div>
      <div className="row">
        <div className="seg">{([['upcoming', 'Planlanan'], ['published', 'Yayınlanan'], ['all', 'Tümü']] as const).map(([k, l]) => <button type="button" key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
        <select id="pl-plat" className="select" style={{ width: 'auto' }} value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="">Tüm platformlar</option>{Object.entries(PLATFORM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select id="pl-st" className="select" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tüm durumlar</option>{Object.entries(POST_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select id="pl-type" className="select" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)}><option value="">Tüm türler</option>{Object.entries(CONTENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {!projectId && <select id="pl-proj" className="select" style={{ width: 'auto' }} value={proj} onChange={(e) => setProj(e.target.value)}><option value="">Tüm projeler</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>}
        <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => openPost({ project_id: projectId ?? null })}><Plus size={15} />Yeni içerik</button>
      </div>
      {loading ? <p className="muted">Yükleniyor…</p> : groups.length === 0 ? <Empty title="Burada içerik yok">Bir gönderi, Reels, video veya web yazısı planlayın.</Empty> : groups.map(({ k, items }) => (
        <div key={k || 'none'}>
          <h3 style={{ marginBottom: 8, color: k && k < today && view !== 'published' ? 'var(--orange-600)' : undefined }}>{k ? `${formatRelative(k)} · ${formatLong(k).split(' ').slice(-1)[0]}` : 'Tarihsiz'}{k && k < today && view !== 'published' ? ' · tarihi geçti' : ''}</h3>
          <div className="task-list">
            {items.map((p) => {
              const project = projects.data?.find((x) => x.id === p.project_id);
              return (
                <div key={p.id} className="task-row" onClick={() => openPost(p)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openPost(p)}>
                  <span className="dot" style={{ width: 10, height: 10, marginTop: 6, background: POST_STATUS_COLOR[p.status as PostStatus] }} />
                  <div className="t">
                    <b>{p.title}</b>
                    <div className="meta">
                      {p.scheduled_at && <span className="mono">{hhmm(minutesOf(p.scheduled_at))}</span>}
                      <span>{POST_STATUS_LABEL[p.status as PostStatus]}</span>
                      <span>{CONTENT_TYPE_LABEL[p.content_type] ?? p.content_type}</span>
                      {p.post_targets?.map((t) => <span key={t.id} className="chip" style={{ padding: '1px 8px', borderColor: t.status === 'published' ? 'var(--ok)' : undefined }}>{PLATFORM_LABEL[t.platform]}{t.published_url && <a href={t.published_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Yayını aç"><ExternalLink size={11} /></a>}</span>)}
                      {project && !projectId && <span className="chip" style={{ padding: '1px 8px' }}><i className="dot" style={{ background: project.color }} />{project.title}</span>}
                    </div>
                    {(p.caption_tr || p.caption_en) && <div className="small muted" style={{ marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.caption_tr || p.caption_en}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
