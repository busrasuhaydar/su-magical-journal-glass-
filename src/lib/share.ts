// API'siz paylaşım: telefonda paylaş menüsü (görsel + metin), bilgisayarda X paylaşım bağlantısı + panoya görsel.
// Telefon tarayıcıları paylaşımı yalnız tıklamanın hemen içinde açar; bu yüzden görseller önceden hazırlanır (warmShare)
// ve shareTo içinde navigator.share, hiçbir await beklemeden çağrılır.
import { signedUrl } from './data';
import type { FileRec, SocialPost } from './types';

export const postText = (p: Pick<SocialPost, 'caption_tr' | 'caption_en' | 'hashtags' | 'links' | 'title'>) =>
  [p.caption_tr || p.caption_en || '', (p.hashtags ?? []).join(' '), (p.links ?? []).join(' ')].filter(Boolean).join('\n\n').trim() || p.title;

const pending = new Map<string, Promise<File>>();
const ready = new Map<string, File>();
const keyOf = (m: FileRec) => m.storage_path;

async function loadFile(m: FileRec): Promise<File> {
  const blob = await (await fetch(await signedUrl(m.storage_path))).blob();
  const f = new File([blob], m.title, { type: m.mime || blob.type });
  ready.set(keyOf(m), f);
  return f;
}

/** Görselleri arka planda hazırla (editör açılınca / medya değişince çağrılır). */
export function warmShare(media: FileRec[]) {
  for (const m of media) {
    if (!(m.mime.startsWith('image/') || m.mime.startsWith('video/'))) continue;
    const k = keyOf(m);
    if (ready.has(k) || pending.has(k)) continue;
    pending.set(k, loadFile(m).catch((e) => { pending.delete(k); throw e; }));
    pending.get(k)!.catch(() => { /* sessiz: tıklamada tekrar denenir */ });
  }
}

async function asPng(f: FileRec): Promise<Blob> {
  const blob = (ready.get(keyOf(f)) as Blob | undefined) ?? (await (await fetch(await signedUrl(f.storage_path))).blob());
  if (blob.type === 'image/png') return blob;
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Görsel hazırlanamadı'))), 'image/png'));
}

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
const intentUrl = (text: string) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`;

export type ShareResult = { method: 'sheet' | 'intent' | 'manual'; note: string };

/** Düğme tıklamasının içinde çağrılmalı (tarayıcı izni için). */
export async function shareTo(platform: 'x' | 'instagram', text: string, media: FileRec[]): Promise<ShareResult> {
  const images = media.filter((m) => m.mime.startsWith('image/') || m.mime.startsWith('video/'));
  const mobile = isMobile();
  const picked = images.slice(0, platform === 'x' ? 4 : 10);

  // Instagram metni paylaş menüsünden almaz: önce panoya (beklemeden; paylaşım izni bozulmasın)
  if (platform === 'instagram') { try { void navigator.clipboard.writeText(text).catch(() => {}); } catch { /* yok say */ } }

  // 1) Paylaş menüsü (telefonda görsel + metin birlikte) — await YOK, tıklama izni korunur
  if (picked.length && typeof navigator.canShare === 'function' && typeof navigator.share === 'function') {
    const files = picked.map((m) => ready.get(keyOf(m)));
    if (files.every(Boolean)) {
      const list = files as File[];
      if (navigator.canShare({ files: list })) {
        try {
          await navigator.share({ files: list, text: platform === 'x' ? text : undefined });
          return { method: 'sheet', note: platform === 'instagram' ? 'Açıklama panoya kopyalandı; Instagram’da açıklama alanına yapıştırın.' : 'Paylaş menüsünden X’i seçin.' };
        } catch (e) {
          if ((e as Error).name === 'AbortError') throw e;
          // izin/biçim hatası: aşağıdaki yedeklere düş
        }
      }
    } else {
      warmShare(picked);
      if (mobile) throw new Error('Görseller hazırlanıyor; birkaç saniye sonra tekrar basın.');
    }
  }

  // 2) X
  if (platform === 'x') {
    if (mobile) {
      // Telefonda aynı sekmede aç: evrensel bağlantı X uygulamasını açar (görsel eklenemez; metin hazır gelir)
      window.location.href = intentUrl(text);
      return { method: 'intent', note: 'X açılıyor; metin hazır. Görsel için paylaş menüsünü kullanın.' };
    }
    // Bilgisayar: X paylaşım bağlantısı + ilk görsel panoda
    const img = images.find((m) => m.mime.startsWith('image/'));
    if (img && 'ClipboardItem' in window) {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': asPng(img) })]); } catch { /* izin yoksa atla */ }
    }
    window.open(intentUrl(text), '_blank', 'noopener');
    return { method: 'intent', note: img ? 'Metin hazır. Görsel panoda: gönderi kutusunda ⌘+V ile yapıştırın.' : 'Metin hazır; Gönder’e basın.' };
  }

  // 3) Instagram
  if (mobile) {
    window.location.href = 'instagram://library';
    return { method: 'manual', note: 'Açıklama panoya kopyalandı. Instagram’da görseli seçip açıklamaya yapıştırın.' };
  }
  window.open('https://www.instagram.com/', '_blank', 'noopener');
  return { method: 'manual', note: 'Açıklama panoya kopyalandı. Bilgisayarda Instagram görsel yüklemeyi kendi sitesinden yapar; en kolayı telefondan bu düğmeye basmak.' };
}
