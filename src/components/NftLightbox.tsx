import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckSquare, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, Expand, FilePlus2, Lightbulb, Share2, X } from 'lucide-react';
import { useProjects } from '../lib/data';
import { artKey, copyImage, projectSlug, saveOriginal, shareOriginal, useArtworkPages, type Nft } from '../lib/nft';
import { supabase } from '../lib/supabase';
import { useEditors } from './Editors';
import { useToast } from './ui';

export const nftKey = (n: Nft) => `${n.contract}-${n.tokenId}`;

export function useCopy() {
  const toast = useToast();
  return async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    toast.ok(`${what} kopyalandı`);
  };
}

export function LinkRow({ label, url, compact }: { label: string; url: string; compact?: boolean }) {
  const copy = useCopy();
  return (
    <div className="lrow" onClick={(e) => e.stopPropagation()}>
      <a className={`btn btn-glass btn-sm${compact ? ' lr-a' : ''}`} href={url} target="_blank" rel="noreferrer" title={`${label}'de aç`}>{label === 'OpenSea' ? 'OS' : 'SR'}<ExternalLink size={12} /></a>
      <button type="button" className="btn btn-copy btn-sm icon-only" aria-label={`${label} linkini kopyala`} title={`${label} linkini kopyala`} onClick={() => copy(url, `${label} linki`)}><Copy size={14} /></button>
    </div>
  );
}

export function Card({ n, onOpen }: { n: Nft; onOpen: () => void }) {
  return (
    <article className="nft-card" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="nft-img">{n.thumb && <img src={n.thumb} alt={n.name} loading="lazy" />}<span className="nft-zoom"><Expand size={15} /></span></div>
      <b>{n.name}</b>
      <div className="stack-links">
        <LinkRow label="OpenSea" url={n.opensea} compact />
        {n.superrare && <LinkRow label="SuperRare" url={n.superrare} compact />}
      </div>
    </article>
  );
}

/** Eserle çalışma paneli: sayfalar, hızlı fikir, görev, kaydet/paylaş. */
function Workbench({ n }: { n: Nft }) {
  const projects = useProjects();
  const project = projects.data?.find((p) => p.slug === projectSlug(n.c));
  const pages = useArtworkPages(artKey(n));
  const { openTask } = useEditors();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [idea, setIdea] = useState('');
  const [busy, setBusy] = useState('');
  async function newPage() {
    if (!project) return toast.fail(new Error('Koleksiyon projesi hazırlanıyor, birkaç saniye sonra dene'));
    setBusy('page');
    const { data, error } = await supabase.from('pages').insert({ project_id: project.id, title: `${n.name} · sayfa`, icon: '🖼️', artwork_key: artKey(n), position: pages.length + 1 }).select().single();
    if (error) { setBusy(''); return toast.fail(error); }
    await supabase.from('page_blocks').insert([
      { page_id: data.id, type: 'link', content: { url: n.opensea, title: `${n.name} · OpenSea` }, position: 1 },
      ...(n.superrare ? [{ page_id: data.id, type: 'link', content: { url: n.superrare, title: `${n.name} · SuperRare` }, position: 2 }] : []),
      { page_id: data.id, type: 'h2', content: { text: 'Fikirlerim' }, position: 3 },
      { page_id: data.id, type: 'text', content: { text: '' }, position: 4 },
    ]);
    qc.invalidateQueries({ queryKey: ['pages'] });
    nav(`/koleksiyonlar/${n.c}?sekme=sayfalar&sayfa=${data.id}`);
  }
  async function saveIdea() {
    const v = idea.trim(); if (!v) return;
    const { error } = await supabase.from('ideas').insert({ title: `${n.name}: ${v.split('\n')[0].slice(0, 160)}`, body: `${v}\n\nEser: ${n.opensea}`, category: 'art', project_id: project?.id ?? null });
    if (error) return toast.fail(error);
    setIdea(''); qc.invalidateQueries({ queryKey: ['ideas'] }); toast.ok('Fikir kaydedildi ✦');
  }
  return (
    <div className="wb">
      <b className="small">Bu eserle çalış</b>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'page'} onClick={newPage}><FilePlus2 size={13} />Yeni sayfa</button>
        <button type="button" className="btn btn-glass btn-sm" onClick={() => openTask({ title: `${n.name}: `, project_id: project?.id ?? null, due_date: null })}><CheckSquare size={13} />Görev ekle</button>
        {project && <Link className="btn btn-glass btn-sm" to={`/projeler/${project.slug}`}>Proje</Link>}
      </div>
      {pages.length > 0 && <div className="row" style={{ gap: 6 }}>{pages.map((pg) => <Link key={pg.id} className="chip chip-on-soft" to={`/koleksiyonlar/${n.c}?sekme=sayfalar&sayfa=${pg.id}`}>{pg.icon ?? '📄'} {pg.title}</Link>)}</div>}
      <textarea className="textarea" style={{ minHeight: 60 }} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Bu eser için aklına gelen fikir… (⌘+Enter kaydeder)" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveIdea(); }} />
      <button type="button" className="btn btn-glass btn-sm" style={{ justifySelf: 'start' }} onClick={saveIdea}><Lightbulb size={13} />Fikir olarak kaydet</button>
    </div>
  );
}

export function Lightbox({ items, index, setIndex, onClose }: { items: Nft[]; index: number; setIndex: (i: number) => void; onClose: () => void }) {
  const n = items[index];
  const copy = useCopy();
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const strip = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const go = useCallback((d: number) => setIndex((index + d + items.length) % items.length), [index, items.length, setIndex]);
  useEffect(() => { setLoaded(false); setFailed(false); setZoom(false); setMsg(''); }, [index]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return;
      if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', k);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [go, onClose]);
  useEffect(() => { strip.current?.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }, [index]);
  useEffect(() => { [1, -1].forEach((d) => { const m = items[(index + d + items.length) % items.length]; if (m?.original) new Image().src = m.original; }); }, [index, items]);
  const from = Math.max(0, index - 25), to = Math.min(items.length, index + 26);
  const src = failed || !n.original ? n.thumb : n.original;
  const detail = [n.name, n.description, n.opensea, n.superrare].filter(Boolean).join('\n\n');
  async function save(video = false) { setBusy('save'); const r = await saveOriginal(n, video); toast.ok(r === 'saved' ? 'Orijinal dosya indirildi' : 'Orijinal yeni sekmede açıldı'); setBusy(''); }
  async function copyImg() { setBusy('img'); try { await copyImage(n); toast.ok('Görsel kopyalandı: Cmd+V ile yapıştır'); } catch (x) { toast.fail(x); } setBusy(''); }
  async function share(platform: 'x' | 'instagram') {
    setBusy(platform);
    try {
      const r = await shareOriginal(n, msg, platform);
      toast.ok(r === 'sheet' ? 'Paylaş menüsü açıldı' : platform === 'instagram' ? 'Metin kopyalandı; Instagram’da yapıştır' : r === 'clipboard' ? 'Görsel panoda: gönderi kutusunda ⌘+V ile yapıştır' : 'X açıldı; görseli Orijinali kaydet ile ekle');
    } catch (x) { if ((x as Error).name !== 'AbortError') toast.fail(x); }
    setBusy('');
  }
  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label={n.name}>
      <div className="lb-bg" onClick={onClose} />
      <button type="button" className="lb-x btn btn-glass icon-btn" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
      <button type="button" className="lb-nav l btn btn-glass icon-btn" onClick={() => go(-1)} aria-label="Önceki"><ChevronLeft size={20} /></button>
      <button type="button" className="lb-nav r btn btn-glass icon-btn" onClick={() => go(1)} aria-label="Sonraki"><ChevronRight size={20} /></button>
      <div className="lb-card glass">
        <div className={`lb-stage${zoom ? ' zoom' : ''}`} onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => { if (touch.current != null && !zoom) { const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); } touch.current = null; }}>
          {n.thumb && !loaded && <img className="lb-ph" src={n.thumb} alt="" />}
          {src && <img key={src} className="lb-img" src={src} alt={n.name} onLoad={() => setLoaded(true)} onError={() => { if (!failed && n.thumb) setFailed(true); }} onClick={() => setZoom((z) => !z)} style={{ opacity: loaded ? 1 : 0, cursor: zoom ? 'zoom-out' : 'zoom-in' }} />}
          {!loaded && <span className="lb-spin">Orijinal yükleniyor…</span>}
        </div>
        <div className="lb-info">
          <div className="small muted">{index + 1} / {items.length} · #{n.tokenId.length > 8 ? n.tokenId.slice(-4) : n.tokenId}</div>
          <h2>{n.name}</h2>
          {n.description && <p className="lb-desc">{n.description}</p>}
          <div className="lb-actions">
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => save()}><Download size={13} />{busy === 'save' ? 'İniyor…' : 'Orijinali kaydet'}</button>
              <button type="button" className="btn btn-copy btn-sm" disabled={!!busy} onClick={copyImg}><Copy size={13} />{busy === 'img' ? 'Kopyalanıyor…' : 'Görseli kopyala (Cmd+V)'}</button>
              {n.video && <button type="button" className="btn btn-glass btn-sm" onClick={() => save(true)}><Download size={13} />Video</button>}
            </div>
            <div className="lb-grp"><span className="small muted"><Share2 size={12} /> Paylaş · metnin başına “{n.name}” otomatik eklenir</span>
              <textarea className="textarea" style={{ minHeight: 56 }} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Paylaşım metnin…" />
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => share('x')}>{busy === 'x' ? 'Hazırlanıyor…' : 'X'}</button>
                <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => share('instagram')}>{busy === 'instagram' ? 'Hazırlanıyor…' : 'Instagram'}</button>
              </div></div>
            <div className="lb-grp"><span className="small muted">OpenSea</span>
              <div className="row" style={{ gap: 6 }}><a className="btn btn-glass btn-sm" href={n.opensea} target="_blank" rel="noreferrer" title="OpenSea'de aç">OS <ExternalLink size={13} /></a><button type="button" className="btn btn-copy btn-sm icon-only" title="OpenSea linkini kopyala" aria-label="OpenSea linkini kopyala" onClick={() => copy(n.opensea, 'OpenSea linki')}><Copy size={14} /></button></div></div>
            {n.superrare && <div className="lb-grp"><span className="small muted">SuperRare</span>
              <div className="row" style={{ gap: 6 }}><a className="btn btn-glass btn-sm" href={n.superrare} target="_blank" rel="noreferrer" title="SuperRare'de aç">SR <ExternalLink size={13} /></a><button type="button" className="btn btn-copy btn-sm icon-only" title="SuperRare linkini kopyala" aria-label="SuperRare linkini kopyala" onClick={() => copy(n.superrare!, 'SuperRare linki')}><Copy size={14} /></button></div></div>}
            <div className="row" style={{ gap: 6 }}>
              {n.original && <a className="btn btn-glass btn-sm" href={n.original} target="_blank" rel="noreferrer"><Expand size={13} />Orijinal bağlantı</a>}
              <button type="button" className="btn btn-copy btn-sm icon-only" title="Ad + açıklamayı kopyala" aria-label="Ad ve açıklamayı kopyala" onClick={() => copy(detail, 'Ad ve açıklama')}><Copy size={14} /></button>
            </div>
            <Workbench key={nftKey(n)} n={n} />
          </div>
        </div>
        <div className="lb-strip" ref={strip}>
          {items.slice(from, to).map((m, k) => (
            <button type="button" key={nftKey(m)} className={from + k === index ? 'on' : ''} onClick={() => setIndex(from + k)} aria-label={m.name}>{m.thumb && <img src={m.thumb} alt="" loading="lazy" />}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
