// Güvenlik ağı: simgesi olmayan her .btn düğmesine metnine göre bir simge ekler (kural: hiçbir buton simgesiz kalmaz).
import { renderToStaticMarkup } from 'react-dom/server';
import { ArrowLeft, Check, CirclePlus, Clock, Copy, ExternalLink, FileUp, Lightbulb, Pencil, RotateCcw, Save, Search, Send, Share2, Sparkles, Trash2, X, type LucideIcon } from 'lucide-react';

const RULES: [RegExp, LucideIcon][] = [
  [/sil|kaldır|iptal et/i, Trash2], [/iptal|kapat|vazgeç|hayır/i, X], [/kaydet|güncelle|uygula/i, Save], [/geri|dön|tüm /i, ArrowLeft],
  [/ekle|yeni|oluştur|başla/i, CirclePlus], [/kopyala/i, Copy], [/paylaş|tweet|yayınla|gönder/i, Share2], [/aç\b|git|bağlan|bağla/i, ExternalLink],
  [/seç|yükle|dosya/i, FileUp], [/fikir|öner|başka/i, Lightbulb], [/planla|ertele|bugüne|yarına|saat/i, Clock], [/düzenle|değiştir/i, Pencil],
  [/ara\b|bul/i, Search], [/yenile|sıfırla|tekrar/i, RotateCcw], [/tamam|onayla|evet|yaptım/i, Check], [/gönder|bildirim/i, Send],
];
const cache = new Map<LucideIcon, string>();
const markup = (I: LucideIcon) => { let m = cache.get(I); if (!m) { m = renderToStaticMarkup(<I size={14} />); cache.set(I, m); } return m; };

function decorate(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('button.btn, a.btn, .btn').forEach((b) => {
    if (b.dataset.autoIc || b.querySelector('svg,img') || b.classList.contains('icon-btn') || b.classList.contains('icon-only')) return;
    const t = (b.textContent ?? '').trim();
    if (!t) return;
    const Icon = RULES.find(([re]) => re.test(t))?.[1] ?? Sparkles;
    const s = document.createElement('span');
    s.className = 'auto-ic'; s.setAttribute('aria-hidden', 'true'); s.innerHTML = markup(Icon);
    b.dataset.autoIc = '1';
    b.insertBefore(s, b.firstChild);
  });
}
export function startAutoIcons() {
  let queued = false;
  const run = () => { queued = false; decorate(document); };
  decorate(document);
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } }).observe(document.body, { childList: true, subtree: true });
}
