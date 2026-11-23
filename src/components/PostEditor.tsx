// Sosyal medya içerik düzenleyicisi. Projeden de merkezden de açılır; her zaman aynı tek kaydı düzenler.
import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Send, X } from 'lucide-react';
import { callDispatcher } from '../lib/notify';
import { postText, shareTo, warmShare } from '../lib/share';
import { useNfts, withWorkName, worksInLinks } from '../lib/nft';
import { useQuery } from '@tanstack/react-query';
import { linkFile, uploadFile, useFileLinks, useFiles, useMarkPublished, useProjects, useSavePost, useSignedUrl, useSocialAccounts, useSoftDeletePost } from '../lib/data';
import { dayKeyOf, hhmm, minutesOf, parseHHMM, toInstant } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { CONTENT_TYPE_LABEL, PLATFORM_LABEL, POST_STATUS_LABEL, type FileRec, type Platform, type PostStatus, type SocialPost } from '../lib/types';
import { ConfirmButton, Dialog, Field, useToast } from './ui';
import { MediaSources } from './Media';

const PLATFORMS: Platform[] = ['instagram', 'x', 'youtube', 'website'];
const X_LIMIT = 280, IG_LIMIT = 2200;

export function PostEditor({ draft, onClose }: { draft: Partial<SocialPost>; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const save = useSavePost();
  const del = useSoftDeletePost();
  const markPub = useMarkPublished();
  const projects = useProjects();
  const files = useFiles();
  const links = useFileLinks();
  const nfts = useNfts();
  const targets = draft.post_targets ?? [];
  const [f, setF] = useState({
    title: draft.title ?? '', project_id: draft.project_id ?? '', content_type: draft.content_type ?? 'post',
    caption_tr: draft.caption_tr ?? '', caption_en: draft.caption_en ?? '', hashtags: (draft.hashtags ?? []).join(' '),
    links: (draft.links ?? []).join('\n'), status: (draft.status ?? 'draft') as PostStatus,
    day: draft.scheduled_at ? dayKeyOf(draft.scheduled_at) : '', time: draft.scheduled_at ? hhmm(minutesOf(draft.scheduled_at)) : '19:00',
    notes: draft.notes ?? '', platforms: targets.length ? targets.map((t) => t.platform) : (['instagram'] as Platform[]),
  });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [ask, setAsk] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const media = draft.id ? (links.data ?? []).filter((l) => l.entity_type === 'social_post' && l.entity_id === draft.id).map((l) => ({ link: l, file: files.data?.find((x) => x.id === l.file_id) })) : [];
  // Telefonda paylaş menüsü tıklamanın hemen içinde açılmalı: görselleri önceden hazırla
  const mediaKey = media.map((m) => m.file?.id).filter(Boolean).join(',');
  useEffect(() => { warmShare(media.map((m) => m.file).filter(Boolean) as FileRec[]); }, [mediaKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const tags = f.hashtags.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`));
  const xLen = (f.caption_tr || f.caption_en).length + (tags.length ? tags.join(' ').length + 1 : 0);

  async function submit(e?: FormEvent): Promise<SocialPost | null> {
    e?.preventDefault(); setErr('');
    if (!f.title.trim()) { setErr('Başlık boş olamaz.'); return null; }
    if (!f.platforms.length) { setErr('En az bir platform seçin.'); return null; }
    let scheduled_at: string | null = null;
    if (f.day) {
      const m = parseHHMM(f.time);
      if (m == null) { setErr('Saat SS:DD biçiminde olmalı.'); return null; }
      scheduled_at = toInstant(f.day, m);
    }
    if ((f.status === 'scheduled' || f.status === 'publishing') && !scheduled_at) { setErr('Zamanlamak için yayın tarihi ve saati seçin.'); return null; }
    try {
      const saved = await save.mutateAsync({
        id: draft.id, title: f.title.trim(), project_id: f.project_id || null, content_type: f.content_type,
        caption_tr: f.caption_tr.trim() || null, caption_en: f.caption_en.trim() || null, hashtags: tags,
        links: f.links.split('\n').map((l) => l.trim()).filter(Boolean), status: f.status, scheduled_at, notes: f.notes.trim() || null, platforms: f.platforms,
      });
      return saved;
    } catch (x) { toast.fail(x); return null; }
  }

  async function share(platform: 'x' | 'instagram') {
    try {
      const mediaFiles = media.map((m) => m.file).filter(Boolean) as FileRec[];
      if (platform === 'instagram' && !mediaFiles.length) return toast.fail(new Error('Instagram için önce bir görsel veya video ekleyin.'));
      if (!draft.id) { const saved = await submit(); if (!saved) return; toast.ok('İçerik kaydedildi'); }
      const linkList = f.links.split('\n').map((l) => l.trim()).filter(Boolean);
      const names = worksInLinks(linkList, nfts.data?.items ?? []).map((w) => w.name);
      const r = await shareTo(platform, withWorkName(postText({ title: f.title, caption_tr: f.caption_tr, caption_en: f.caption_en, hashtags: tags, links: linkList }), names), mediaFiles);
      toast.ok(r.note);
      setAsk(platform);
    } catch (x) { if ((x as Error).name !== 'AbortError') toast.fail(x); }
  }

  async function confirmShare(platform: string, url: string) {
    try {
      let postId = draft.id;
      if (!postId) { const saved = await submit(); if (!saved) return; postId = saved.id; }
      const { error } = await supabase.from('post_shares').insert({ post_id: postId, platform, url: url.trim() || null });
      if (error) throw error;
      const { data: tg } = await supabase.from('post_targets').upsert({ post_id: postId, platform }, { onConflict: 'post_id,platform', ignoreDuplicates: true }).select();
      const target = tg?.[0] ?? (await supabase.from('post_targets').select('*').eq('post_id', postId).eq('platform', platform).single()).data;
      if (target && target.status !== 'published') await markPub.mutateAsync({ targetId: target.id, url });
      ['posts', 'cal', 'year', 'shares'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.ok(`${PLATFORM_LABEL[platform as Platform]} paylaşımı kaydedildi`);
      setAsk(null); setUrls((u) => ({ ...u, share: '' }));
    } catch (x) { toast.fail(x); }
  }

  async function publishNow() {
    const saved = await submit();
    if (!saved) return;
    setBusy(true);
    try {
      const r = await callDispatcher<{ targets: { platform: string; status: string; error: string | null }[] }>({ action: 'publish_now', post_id: saved.id });
      ['posts', 'cal', 'year'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      const ok = r.targets.filter((t) => t.status === 'published').length, bad = r.targets.filter((t) => t.status === 'failed');
      if (bad.length) toast.fail(new Error(bad.map((t) => `${PLATFORM_LABEL[t.platform as Platform]}: ${t.error}`).join(' · ')));
      if (ok) toast.ok(`${ok} platformda yayınlandı`);
      if (!bad.length && !ok) toast.ok('Kuyruğa alındı; birkaç dakika içinde tekrar denenecek');
      onClose();
    } catch (x) { toast.fail(x); } finally { setBusy(false); }
  }

  async function addMedia(input: File[] | FileRec[]) {
    if (!input.length) return;
    setBusy(true);
    try {
      const saved = draft.id ? { id: draft.id } : await submit();
      if (!saved) return;
      for (const item of input) { const rec = item instanceof File ? (await uploadFile(item)).rec : item; await linkFile(rec.id, 'social_post', saved.id); }
      qc.invalidateQueries({ queryKey: ['files'] });
      toast.ok('Medya eklendi');
      if (!draft.id) onClose();
    } catch (x) { toast.fail(x); } finally { setBusy(false); }
  }

  return (
    <Dialog title={draft.id ? 'İçeriği düzenle' : 'Yeni içerik'} onClose={onClose} wide>
      <form onSubmit={async (e) => { if (await submit(e)) { toast.ok(draft.id ? 'İçerik güncellendi' : 'İçerik oluşturuldu'); onClose(); } }} style={{ display: 'grid', gap: 12 }}>
        <div className="grid-3">
          <div style={{ gridColumn: 'span 2' }}><Field label="Başlık (yalnız sizin için)"><input id="po-title" className="input" value={f.title} onChange={set('title')} placeholder="ör. SU'RÉAL CITY açılış duyurusu" /></Field></div>
          <Field label="Proje"><select id="po-proj" className="select" value={f.project_id} onChange={set('project_id')}><option value="">Proje yok</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
        </div>
        <Field label="Platformlar">
          <div className="row">{PLATFORMS.map((p) => (
            <label key={p} className="chip" style={{ cursor: 'pointer', padding: '6px 12px', background: f.platforms.includes(p) ? 'var(--blush-100)' : undefined, borderColor: f.platforms.includes(p) ? 'var(--rose-300)' : undefined }}>
              <input id={`po-pl-${p}`} type="checkbox" checked={f.platforms.includes(p)} onChange={(e) => setF((s) => ({ ...s, platforms: e.target.checked ? [...s.platforms, p] : s.platforms.filter((x) => x !== p) }))} style={{ margin: 0 }} />
              {PLATFORM_LABEL[p]}
            </label>
          ))}</div>
        </Field>
        <div className="grid-3">
          <Field label="İçerik türü"><select id="po-type" className="select" value={f.content_type} onChange={set('content_type')}>{Object.entries(CONTENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Yayın tarihi"><input id="po-day" type="date" className="input" value={f.day} onChange={set('day')} /></Field>
          <Field label="Yayın saati"><input id="po-time" type="time" step={300} className="input" value={f.time} onChange={set('time')} /></Field>
        </div>
        <div className="grid-2">
          <Field label="Türkçe metin"><textarea id="po-tr" className="textarea" style={{ minHeight: 120 }} value={f.caption_tr} onChange={set('caption_tr')} /></Field>
          <Field label="English text"><textarea id="po-en" className="textarea" style={{ minHeight: 120 }} value={f.caption_en} onChange={set('caption_en')} lang="en" /></Field>
        </div>
        <div className="small muted row" style={{ gap: 14 }}>
          {f.platforms.includes('x') && <span style={{ color: xLen > X_LIMIT ? 'var(--bad)' : undefined }}>X: {xLen}/{X_LIMIT}</span>}
          {f.platforms.includes('instagram') && <span style={{ color: Math.max(f.caption_tr.length, f.caption_en.length) > IG_LIMIT ? 'var(--bad)' : undefined }}>Instagram: {Math.max(f.caption_tr.length, f.caption_en.length)}/{IG_LIMIT}</span>}
          {f.platforms.includes('instagram') && tags.length > 30 && <span style={{ color: 'var(--bad)' }}>Instagram en fazla 30 etiket kabul eder</span>}
        </div>
        <div className="grid-2">
          <Field label="Etiketler (boşlukla ayırın)"><input id="po-tags" className="input" value={f.hashtags} onChange={set('hashtags')} placeholder="#surrealcity #dijitalsanat" /></Field>
          <Field label="Bağlantılar (her satıra bir tane)"><textarea id="po-links" className="textarea" style={{ minHeight: 44 }} value={f.links} onChange={set('links')} /></Field>
          <Field label="Eser ekle (adı yazın; paylaşımda adı metnin başına eklenir)">
            <input className="input" list="po-works" placeholder="Eser adı…" onChange={(e) => { const w = nfts.data?.items.find((n) => n.name === e.target.value); if (w) { setF((x) => ({ ...x, links: [x.links, w.superrare ?? w.opensea].filter(Boolean).join('\n') })); e.target.value = ''; } }} />
            <datalist id="po-works">{(nfts.data?.items ?? []).map((n) => <option key={n.contract + n.tokenId} value={n.name} />)}</datalist>
          </Field>
        </div>

        <Field label="Medya">
          <div className="row">
            {media.map(({ link, file }) => file && <MediaThumb key={link.id} file={file} onRemove={async () => { const { error } = await supabase.from('file_links').delete().eq('id', link.id); if (error) toast.fail(error); else qc.invalidateQueries({ queryKey: ['files'] }); }} />)}
            <MediaSources id="po-media" busy={busy} visualOnly accept="image/*,video/*" onFiles={addMedia} onPicked={addMedia} />
            {!draft.id && <span className="small muted">Medya eklemek içeriği önce kaydeder.</span>}
          </div>
        </Field>

        <div className="grid-2">
          <Field label="Durum"><select id="po-status" className="select" value={f.status} onChange={set('status')}>
            {(Object.keys(POST_STATUS_LABEL) as PostStatus[]).filter((s) => s !== 'publishing' && s !== 'published' && s !== 'failed' || s === draft.status).map((s) => <option key={s} value={s}>{POST_STATUS_LABEL[s]}</option>)}
          </select></Field>
          <Field label="Notlar"><input id="po-notes" className="input" value={f.notes} onChange={set('notes')} /></Field>
        </div>
        {f.status === 'scheduled' && <AutoNote platforms={f.platforms} />}

        <div className="share-panel">
          <b className="small">Paylaş</b>
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => share('x')}><Send size={13} />X’te paylaş</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => share('instagram')}><Send size={13} />Instagram’da paylaş</button>
            <button type="button" className="btn btn-glass btn-sm" disabled title="Web sitesi bağlantısı daha sonra eklenecek">Web sitesine gönder · yakında</button>
          </div>
          {ask && (
            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <span className="small" style={{ flex: '1 1 200px' }}><b>{PLATFORM_LABEL[ask as Platform]}’da paylaştınız mı?</b> Kaydederseniz geçmişe eklenir; içerik ve görseller saklı kalır, istediğiniz kadar tekrar paylaşabilirsiniz.</span>
              <input id="po-share-url" className="input" style={{ width: 210, padding: '6px 10px' }} placeholder="Gönderi bağlantısı (isteğe bağlı)" value={urls.share ?? ''} onChange={(e) => setUrls((u) => ({ ...u, share: e.target.value }))} />
              <button type="button" className="btn btn-teal btn-sm" onClick={() => confirmShare(ask, urls.share ?? '')}>Evet, paylaştım</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsk(null)}>Henüz değil</button>
            </div>
          )}
          {draft.id && <ShareHistory postId={draft.id} />}
        </div>
        {targets.length > 0 && (
          <div className="card" style={{ display: 'grid', gap: 8 }}>
            <b className="small">Platform durumu</b>
            {targets.map((t) => (
              <div key={t.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span><b>{PLATFORM_LABEL[t.platform]}</b> · <span className="muted">{POST_STATUS_LABEL[t.status]}</span>{t.error && <span style={{ color: 'var(--bad)' }}> · {t.error}</span>}</span>
                {t.status === 'published' ? (t.published_url ? <a className="small" href={t.published_url} target="_blank" rel="noopener noreferrer">Yayını aç <ExternalLink size={12} /></a> : <span className="small muted">Yayınlandı (bağlantı girilmedi)</span>) : (
                  <span className="row" style={{ gap: 6 }}>
                    <input id={`po-url-${t.id}`} className="input" style={{ width: 220, padding: '6px 10px' }} placeholder="Yayın bağlantısı (isteğe bağlı)" value={urls[t.id] ?? ''} onChange={(e) => setUrls((u) => ({ ...u, [t.id]: e.target.value }))} />
                    <button type="button" className="btn btn-teal btn-sm" onClick={async () => { try { await markPub.mutateAsync({ targetId: t.id, url: urls[t.id] ?? '' }); toast.ok(`${PLATFORM_LABEL[t.platform]}: yayınlandı olarak işaretlendi`); onClose(); } catch (x) { toast.fail(x); } }}>Elle yayınlandı</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {err && <div className="error">{err}</div>}
        <div className="foot">
          <div className="row">{draft.id && draft.status !== 'published' && <ConfirmButton label={<><Send size={14} />Şimdi yayınla</>} className="btn btn-teal" confirmText="Bağlı hesaplarda hemen yayınlansın mı?" onConfirm={publishNow} />}
          {draft.id && <ConfirmButton label="Sil" confirmText="İçerik çöp kutusuna taşınsın mı?" onConfirm={async () => { try { await del.mutateAsync(draft.id!); toast.ok('İçerik silindi'); onClose(); } catch (x) { toast.fail(x); } }} />}</div>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Vazgeç</button>
            <button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Kaydediliyor…' : 'Kaydet'}</button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function MediaThumb({ file, onRemove }: { file: FileRec; onRemove: () => void }) {
  const u = useSignedUrl(file.storage_path);
  return (
    <span style={{ position: 'relative', width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: 'var(--blush-100)', display: 'inline-block' }}>
      {u.data && (file.mime.startsWith('video/') ? <video src={u.data} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={u.data} alt={file.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)}
      <button type="button" onClick={onRemove} aria-label="Medyayı kaldır" style={{ position: 'absolute', top: 2, right: 2, border: 0, borderRadius: 6, background: 'rgba(255,255,255,.9)', cursor: 'pointer', padding: 2, display: 'grid' }}><X size={12} /></button>
    </span>
  );
}

function AutoNote({ platforms }: { platforms: Platform[] }) {
  const acc = useSocialAccounts();
  const auto = platforms.filter((p) => acc.data?.some((a) => a.platform === p && a.status === 'connected'));
  const manual = platforms.filter((p) => !auto.includes(p));
  return (
    <p className="small" style={{ margin: 0 }}>
      {auto.length > 0 && <span style={{ color: 'var(--teal-600)' }}>✓ {auto.map((p) => PLATFORM_LABEL[p]).join(', ')}: saatinde otomatik yayınlanacak. </span>}
      {manual.length > 0 && <span style={{ color: 'var(--orange-600)' }}>{manual.map((p) => PLATFORM_LABEL[p]).join(', ')}: saatinde bildirim gelir; “Paylaş” düğmeleriyle tek tıkla paylaşın. <a href={`${import.meta.env.BASE_URL}ayarlar#hesaplar`}>Hesap bağla</a></span>}
    </p>
  );
}

function ShareHistory({ postId }: { postId: string }) {
  const q = useQuery({ queryKey: ['shares', postId], queryFn: async () => { const { data, error } = await supabase.from('post_shares').select('*').eq('post_id', postId).order('shared_at', { ascending: false }); if (error) throw error; return data as { id: string; platform: Platform; url: string | null; shared_at: string }[]; } });
  if (!q.data?.length) return <span className="small muted">Henüz paylaşılmadı.</span>;
  return (
    <div className="small" style={{ display: 'grid', gap: 2 }}>
      <span className="muted">{q.data.length} kez paylaşıldı:</span>
      {q.data.map((s) => <span key={s.id}>• {PLATFORM_LABEL[s.platform]} · {new Date(s.shared_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}{s.url && <> · <a href={s.url} target="_blank" rel="noopener noreferrer">bağlantı</a></>}</span>)}
    </div>
  );
}
