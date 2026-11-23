// Proje çalışma alanının ikincil bölümleri (sosyal medya, kişiler, hafıza, geçmiş).
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { History } from 'lucide-react';
import { PostList } from '../../components/PostList';
import { ConfirmButton, Field, useToast } from '../../components/ui';
import { useContacts, useInteractions, useMemory, usePosts, useProjectContacts, useProjectHistory, useRowMutation } from '../../lib/data';
import { dayKeyOf, formatLong, formatRelative, formatShort, hhmm, minutesOf, todayKey } from '../../lib/dates';
import { CONTACT_CATEGORY_LABEL, INTERACTION_LABEL, MEMORY_KIND_LABEL, type MemoryKind, type Project } from '../../lib/types';

export function SocialTab({ p }: { p: Project }) {
  const posts = usePosts({ projectId: p.id });
  return <section className="glass panel"><PostList posts={posts.data ?? []} projectId={p.id} loading={posts.isLoading} /></section>;
}

// ── Kişiler ────────────────────────────────────────────
export function PeopleTab({ p }: { p: Project }) {
  const contacts = useContacts();
  const pcs = useProjectContacts();
  const inter = useInteractions({ projectId: p.id });
  const mut = useRowMutation('project_contacts', ['project_contacts']);
  const toast = useToast();
  const nav = useNavigate();
  const linked = (pcs.data ?? []).filter((x) => x.project_id === p.id);
  return (
    <div className="day-grid">
      <section className="glass panel" style={{ display: 'grid', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>İlgili kişiler</h2>
          <select id="pp-link" className="select" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value && mut.mutate({ op: 'insert', row: { project_id: p.id, contact_id: e.target.value } }, { onError: (x) => toast.fail(x) })}>
            <option value="">Kişi bağla…</option>{contacts.data?.filter((c) => !linked.some((l) => l.contact_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {linked.length === 0 && <p className="small muted">Bağlı kişi yok. Kişileri <Link to="/kisiler">Kişiler</Link> sayfasından ekleyebilirsiniz.</p>}
        {linked.map((l) => { const c = contacts.data?.find((x) => x.id === l.contact_id); return c && (
          <div key={l.id} className="task-row" onClick={() => nav('/kisiler')}>
            <div className="t"><b>{c.name}</b><div className="meta"><span>{CONTACT_CATEGORY_LABEL[c.category]}</span>{c.organization && <span>{c.organization}</span>}{c.follow_up_date && <span>Takip: {formatRelative(c.follow_up_date)}</span>}</div></div>
            <span onClick={(e) => e.stopPropagation()}><ConfirmButton label="Kaldır" className="btn btn-ghost btn-sm" confirmText="Bağlantı kaldırılsın mı?" onConfirm={() => mut.mutate({ op: 'hard_delete', id: l.id })} /></span>
          </div>
        ); })}
      </section>
      <section className="glass panel">
        <h2 style={{ marginBottom: 10 }}>Bu projeyle ilgili görüşmeler</h2>
        {inter.data?.length === 0 && <p className="small muted">Kayıt yok.</p>}
        <div style={{ display: 'grid', gap: 8 }}>{inter.data?.map((i) => (
          <div key={i.id} className="card"><div className="small muted">{INTERACTION_LABEL[i.kind]} · {formatShort(dayKeyOf(i.occurred_at))} · {contacts.data?.find((c) => c.id === i.contact_id)?.name}</div><b style={{ fontWeight: 600 }}>{i.summary}</b></div>
        ))}</div>
      </section>
    </div>
  );
}

// ── Proje hafızası ─────────────────────────────────────
export function MemoryTab({ p }: { p: Project }) {
  const memory = useMemory(p.id);
  const mut = useRowMutation('memory_entries', ['memory']);
  const toast = useToast();
  const [f, setF] = useState({ kind: 'decision' as MemoryKind, body: '', decided_on: todayKey(), supersedes: '' });
  const [filter, setFilter] = useState('');
  const superseded = useMemo(() => new Set((memory.data ?? []).map((m) => m.supersedes).filter(Boolean)), [memory.data]);
  const list = (memory.data ?? []).filter((m) => !filter || m.kind === filter);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.body.trim()) return toast.fail(new Error('Boş kayıt eklenemez.'));
    try { await mut.mutateAsync({ op: 'insert', row: { project_id: p.id, kind: f.kind, body: f.body.trim(), decided_on: f.decided_on, supersedes: f.supersedes || null } }); setF({ ...f, body: '', supersedes: '' }); toast.ok('Hafızaya eklendi'); }
    catch (x) { toast.fail(x); }
  }
  return (
    <div className="day-grid">
      <section className="glass panel" style={{ display: 'grid', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Proje hafızası</h2>
          <select id="m-filter" className="select" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Tüm kayıtlar</option>{Object.entries(MEMORY_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Hafıza kayıtları değiştirilemez ve silinemez. Bir karar değişirse yeni kayıt ekleyip eskisinin yerini aldığını belirtin; iki kayıt da saklanır.</p>
        {list.length === 0 && <p className="small muted">Kayıt yok.</p>}
        {list.map((m) => (
          <div key={m.id} className="card" style={{ opacity: superseded.has(m.id) ? 0.55 : 1 }}>
            <div className="row small muted" style={{ justifyContent: 'space-between' }}>
              <span><span className="chip">{MEMORY_KIND_LABEL[m.kind]}</span> {formatLong(m.decided_on)}</span>
              {superseded.has(m.id) && <span>Yerini yeni kayıt aldı</span>}
            </div>
            <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{m.body}</p>
            {m.supersedes && <p className="small muted" style={{ margin: '4px 0 0' }}>Önceki kaydın yerini aldı: “{memory.data?.find((o) => o.id === m.supersedes)?.body.slice(0, 80)}”</p>}
            {m.source.startsWith('idea:') && <p className="small muted" style={{ margin: '4px 0 0' }}>Kaynak: Fikirler defteri</p>}
          </div>
        ))}
      </section>
      <section className="glass panel">
        <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
          <h3>Yeni kayıt</h3>
          <Field label="Tür"><select id="m-kind" className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as MemoryKind })}>{Object.entries(MEMORY_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="İçerik"><textarea id="m-body" className="textarea" style={{ minHeight: 120 }} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="ör. Serinin ana malzemesi cam olacak; reçine denemesi bırakıldı." /></Field>
          <Field label="Tarih"><input id="m-date" type="date" className="input" value={f.decided_on} onChange={(e) => setF({ ...f, decided_on: e.target.value })} /></Field>
          <Field label="Şu kaydın yerini alıyor (isteğe bağlı)"><select id="m-sup" className="select" value={f.supersedes} onChange={(e) => setF({ ...f, supersedes: e.target.value })}>
            <option value="">Hiçbiri</option>{memory.data?.filter((m) => !superseded.has(m.id)).map((m) => <option key={m.id} value={m.id}>{MEMORY_KIND_LABEL[m.kind]}: {m.body.slice(0, 50)}</option>)}
          </select></Field>
          <button className="btn btn-primary" disabled={mut.isPending}>Hafızaya ekle</button>
        </form>
      </section>
    </div>
  );
}

// ── Geçmiş (değişiklik günlüğü) ────────────────────────
const TABLE_LABEL: Record<string, string> = { projects: 'Proje', tasks: 'Görev', events: 'Etkinlik', social_posts: 'İçerik', post_targets: 'Platform', project_stages: 'Aşama', notes: 'Not', memory_entries: 'Hafıza', interactions: 'Görüşme', project_contacts: 'Kişi bağlantısı', ideas: 'Fikir' };
function describe(r: { table_name: string; op: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const a = r.after ?? {}, b = r.before ?? {};
  const name = String(a.title ?? a.summary ?? a.body ?? b.title ?? '').slice(0, 70);
  if (r.op === 'INSERT') return `${TABLE_LABEL[r.table_name] ?? r.table_name} eklendi: ${name}`;
  if (r.op === 'DELETE') return `${TABLE_LABEL[r.table_name] ?? r.table_name} silindi: ${name}`;
  if (a.deleted_at && !b.deleted_at) return `${TABLE_LABEL[r.table_name] ?? r.table_name} çöp kutusuna taşındı: ${name}`;
  if (a.status !== b.status) return `${name}: durum ${String(b.status)} → ${String(a.status)}`;
  const changed = Object.keys(a).filter((k) => !['updated_at'].includes(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  return `${name}: ${changed.length ? changed.join(', ') + ' değişti' : 'güncellendi'}`;
}
export function HistoryTab({ p }: { p: Project }) {
  const h = useProjectHistory(p.id);
  return (
    <section className="glass panel">
      <div className="panel-head"><h2 className="row" style={{ gap: 8 }}><History size={20} />Proje geçmişi</h2><span className="small muted">Son 200 değişiklik · orijinal zaman damgalarıyla</span></div>
      {h.data?.length === 0 && <p className="small muted">Kayıt yok.</p>}
      <div style={{ display: 'grid', gap: 4 }}>
        {h.data?.map((r) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr)', gap: 10, fontSize: 13.5, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <span className="mono small muted">{formatShort(dayKeyOf(r.at))} {hhmm(minutesOf(r.at))}</span>
            <span style={{ overflowWrap: 'anywhere' }}>{describe(r)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
