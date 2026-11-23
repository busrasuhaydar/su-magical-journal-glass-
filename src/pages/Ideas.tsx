import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { FolderHeart, Gem, Plus, Sparkles } from 'lucide-react';
import { useNfts } from '../lib/nft';
import { PageHead } from '../components/Shell';
import { ConfirmButton, Dialog, Empty, Field, useToast } from '../components/ui';
import { useIdeas, useProjects, useRowMutation, useSoftDelete } from '../lib/data';
import { dayKeyOf, formatShort } from '../lib/dates';
import { slugify, supabase } from '../lib/supabase';
import { IDEA_CATEGORY_LABEL, type Idea, type IdeaCategory } from '../lib/types';

export default function IdeasPage() {
  const ideas = useIdeas();
  const projects = useProjects();
  const nfts = useNfts();
  const [cat, setCat] = useState('');
  const [edit, setEdit] = useState<Partial<Idea> | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const list = (ideas.data ?? []).filter((i) => (!cat || i.category === cat) && (showArchived || i.status !== 'archived'));
  return (
    <>
      <PageHead title="Fikirler ve Notlar"><button type="button" className="btn btn-primary" onClick={() => setEdit({ category: (cat || 'art') as IdeaCategory })}><Plus size={15} />Yeni fikir</button></PageHead>
      <div className="row">
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          <button type="button" className={cat === '' ? 'on' : ''} onClick={() => setCat('')}>Tümü</button>
          {(Object.keys(IDEA_CATEGORY_LABEL) as IdeaCategory[]).map((k) => <button type="button" key={k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{IDEA_CATEGORY_LABEL[k]}</button>)}
        </div>
        <label className="row small" style={{ gap: 6, cursor: 'pointer' }}><input id="i-arch" type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Arşivi göster</label>
      </div>
      {!ideas.isLoading && list.length === 0 && <section className="glass panel"><Empty title="Fikir defteri boş">Aklınıza gelen her şeyi buraya yazın; hazır olduğunda projeye dönüştürün.</Empty></section>}
      <div className="cards">
        {list.map((i) => {
          const proj = projects.data?.find((p) => p.id === i.converted_project_id);
          const linked = projects.data?.find((p) => p.id === i.project_id);
          const work = nfts.data?.items.find((n) => i.body && (i.body.includes(n.opensea) || (n.superrare && i.body.includes(n.superrare))));
          return (
            <div key={i.id} className="glass panel proj-card" onClick={() => setEdit(i)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEdit(i)} style={{ opacity: i.status === 'archived' ? 0.6 : 1 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="chip">{IDEA_CATEGORY_LABEL[i.category]}</span><span className="small muted">{formatShort(dayKeyOf(i.created_at))}</span></div>
              <h3>{i.title}</h3>
              {i.body && <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{i.body}</p>}
              {proj && <span className="small" style={{ color: 'var(--teal-600)' }}>✓ Projeye dönüştü: {proj.title}</span>}
              {(linked || work) && <div className="row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
                {linked && <Link className="chip chip-on-soft" to={`/projeler/${linked.slug}`}><FolderHeart size={12} />{linked.title}</Link>}
                {work && <Link className="chip chip-on-soft" to={`/koleksiyonlar/${work.c}?eser=${work.contract.slice(0, 10).toLowerCase()}-${work.tokenId}`}><Gem size={12} />{work.name}</Link>}
              </div>}
            </div>
          );
        })}
      </div>
      {edit && <IdeaEditor draft={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function IdeaEditor({ draft, onClose }: { draft: Partial<Idea>; onClose: () => void }) {
  const mut = useRowMutation('ideas', ['ideas']);
  const del = useSoftDelete('ideas');
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({ title: draft.title ?? '', body: draft.body ?? '', category: (draft.category ?? 'art') as IdeaCategory, status: draft.status ?? 'new' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function persist() {
    const row = { title: f.title.trim(), body: f.body.trim() || null, category: f.category, status: f.status };
    return (await mut.mutateAsync(draft.id ? { op: 'update', id: draft.id, row } : { op: 'insert', row })) as unknown as Idea;
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) return toast.fail(new Error('Başlık boş olamaz.'));
    try { await persist(); toast.ok('Fikir kaydedildi'); onClose(); } catch (x) { toast.fail(x); }
  }
  async function convert() {
    if (!f.title.trim()) return toast.fail(new Error('Başlık boş olamaz.'));
    try {
      const idea = await persist();
      const { data, error } = await supabase.rpc('convert_idea', { p_idea: idea.id, p_slug: `${slugify(f.title)}-${Date.now().toString(36).slice(-4)}` });
      if (error) throw error;
      ['projects', 'ideas', 'memory', 'progress'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      const { data: p } = await supabase.from('projects').select('slug').eq('id', data as string).single();
      toast.ok('Proje oluşturuldu; fikriniz proje hafızasına kaydedildi'); onClose();
      if (p) nav(`/projeler/${p.slug}`);
    } catch (x) { toast.fail(x); }
  }
  return (
    <Dialog title={draft.id ? 'Fikir' : 'Yeni fikir'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <Field label="Başlık"><input id="id-title" className="input" value={f.title} onChange={set('title')} placeholder="ör. Cam küre içinde şehir heykeli" /></Field>
        <Field label="Ayrıntılar"><textarea id="id-body" className="textarea" style={{ minHeight: 140 }} value={f.body} onChange={set('body')} /></Field>
        <div className="grid-2">
          <Field label="Kategori"><select id="id-cat" className="select" value={f.category} onChange={set('category')}>{Object.entries(IDEA_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Durum"><select id="id-st" className="select" value={f.status} onChange={set('status')} disabled={f.status === 'converted'}>
            <option value="new">Yeni</option><option value="developing">Gelişiyor</option><option value="archived">Arşivlendi</option>{f.status === 'converted' && <option value="converted">Projeye dönüştü</option>}
          </select></Field>
        </div>
        <div className="foot">
          <div className="row">
            {draft.id && <ConfirmButton label="Sil" confirmText="Fikir çöp kutusuna taşınsın mı?" onConfirm={async () => { try { await del.mutateAsync(draft.id!); toast.ok('Fikir silindi'); onClose(); } catch (x) { toast.fail(x); } }} />}
            {f.status !== 'converted' && <button type="button" className="btn btn-teal" onClick={convert}><Sparkles size={14} />Projeye dönüştür</button>}
          </div>
          <div className="row"><button type="button" className="btn btn-ghost" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={mut.isPending}>Kaydet</button></div>
        </div>
      </form>
    </Dialog>
  );
}
