// Barbie'nin sihirli günlüğü esintisiyle cam defter süsleri. Hepsi özgün SVG/CSS; yalnız transform/opacity animasyonu.
import { useEffect, useRef, useState } from 'react';

const Defs = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="bk-pink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFB3DA" /><stop offset=".5" stopColor="#FF5CAB" /><stop offset="1" stopColor="#E2278B" /></linearGradient>
      <linearGradient id="bk-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFF1B8" /><stop offset=".45" stopColor="#E7B84F" /><stop offset="1" stopColor="#B9812A" /></linearGradient>
      <linearGradient id="bk-crystal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset=".5" stopColor="#CFE9FF" /><stop offset="1" stopColor="#F4C9FF" /></linearGradient>
      <linearGradient id="bk-wing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE6F5" /><stop offset=".5" stopColor="#FFB0DC" /><stop offset="1" stopColor="#C9A6FF" /></linearGradient>
    </defs>
  </svg>
);

export const Bow = () => (
  <svg className="bk-bow" viewBox="0 0 120 80" aria-hidden="true">
    <path d="M60 40 C40 8 6 4 6 30 C6 56 40 62 60 40Z" fill="url(#bk-pink)" stroke="#fff" strokeWidth="1.5" />
    <path d="M60 40 C80 8 114 4 114 30 C114 56 80 62 60 40Z" fill="url(#bk-pink)" stroke="#fff" strokeWidth="1.5" />
    <path d="M52 44 L34 76 L50 70 L58 52Z M68 44 L86 76 L70 70 L62 52Z" fill="url(#bk-pink)" stroke="#fff" strokeWidth="1.5" />
    <ellipse cx="60" cy="40" rx="10" ry="12" fill="url(#bk-pink)" stroke="#fff" strokeWidth="1.5" />
    <path d="M22 22 C30 16 40 18 46 26" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".7" />
    <path d="M98 22 C90 16 80 18 74 26" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".7" />
  </svg>
);

export const Pendant = () => (
  <svg className="bk-pendant" viewBox="0 0 60 150" aria-hidden="true">
    <path d="M30 0 V58" stroke="url(#bk-gold)" strokeWidth="2.5" />
    <circle cx="30" cy="58" r="5" fill="url(#bk-gold)" />
    <path d="M30 66 C12 84 6 108 30 146 C54 108 48 84 30 66Z" fill="url(#bk-crystal)" stroke="#fff" strokeWidth="1.5" />
    <path d="M30 66 L18 96 L30 146 L42 96Z" fill="#fff" opacity=".35" />
    <path d="M18 96 H42" stroke="#fff" strokeWidth="1" opacity=".7" />
  </svg>
);

export const Lock = () => (
  <svg className="bk-lock" viewBox="0 0 50 90" aria-hidden="true">
    <path d="M6 10 H44 V70 Q25 88 6 70Z" fill="url(#bk-gold)" stroke="#8F5E14" strokeWidth="1.5" />
    <circle cx="25" cy="38" r="8" fill="#6B3B0E" /><path d="M25 42 L21 62 H29Z" fill="#6B3B0E" />
    <path d="M12 16 H38" stroke="#fff" strokeWidth="2" opacity=".6" />
  </svg>
);

export const Butterfly = () => (
  <svg className="bk-bfly" viewBox="0 0 80 60" aria-hidden="true">
    <g className="w l"><path d="M40 30 C26 2 2 6 6 26 C8 40 24 40 40 30Z M40 32 C28 50 14 56 22 44 C28 38 34 36 40 32Z" fill="url(#bk-wing)" stroke="#fff" strokeWidth="1" /></g>
    <g className="w r"><path d="M40 30 C54 2 78 6 74 26 C72 40 56 40 40 30Z M40 32 C52 50 66 56 58 44 C52 38 46 36 40 32Z" fill="url(#bk-wing)" stroke="#fff" strokeWidth="1" /></g>
    <rect x="38.5" y="22" width="3" height="22" rx="1.5" fill="#8A4A86" />
  </svg>
);

// deterministik "rastgele" konumlar (render başına sabit)
const rnd = (i: number, k: number) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const SPARKS = Array.from({ length: 16 }, (_, i) => ({ x: Math.round(rnd(i, 1) * 96) + 2, y: Math.round(rnd(i, 2) * 92) + 2, s: 8 + Math.round(rnd(i, 3) * 12), d: (rnd(i, 4) * 4).toFixed(1), t: (2.6 + rnd(i, 5) * 3).toFixed(1) }));
const PETALS = Array.from({ length: 8 }, (_, i) => ({ x: Math.round(rnd(i, 7) * 100), d: (rnd(i, 8) * 14).toFixed(1), t: (15 + rnd(i, 9) * 9).toFixed(1), s: 10 + Math.round(rnd(i, 10) * 10), r: Math.round(rnd(i, 11) * 360), w: Math.round(30 + rnd(i, 12) * 60) }));

/** Sabit, tıklanmaz süs katmanı: cam çerçeve, pırıltılar, taç yaprakları, kurdele, kolye, kilit, kelebek. */
export function BookDecor() {
  return (
    <div className="bk-decor" aria-hidden="true">
      <Defs />
      <div className="bk-frame" />
      <div className="bk-edge" />
      {SPARKS.map((p, i) => <i key={i} className="bk-spark" style={{ left: `${p.x}%`, top: `${p.y}%`, fontSize: p.s, animationDelay: `${p.d}s`, animationDuration: `${p.t}s` }}>✦</i>)}
      {PETALS.map((p, i) => <i key={i} className="bk-petal" style={{ left: `${p.x}%`, width: p.s, height: p.s * 1.25, animationDelay: `-${p.d}s`, animationDuration: `${p.t}s`, ['--r' as string]: `${p.r}deg`, ['--w' as string]: `${p.w}px` }} />)}
      <Bow />
      <Pendant />
      <Lock />
      <Butterfly />
    </div>
  );
}

/** Açılış: defterin kapağı sol sırttan açılır. Oturum başına bir kez; sade mod / hareketi azalt'ta yok. */
export function BookIntro() {
  const [on, setOn] = useState(() => {
    try {
      if (sessionStorage.getItem('su-intro') === '1') return false;
      if (document.documentElement.classList.contains('simple') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      sessionStorage.setItem('su-intro', '1');
    } catch { /* depolama yoksa yine göster */ }
    return true;
  });
  const cover = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!on) return;
    const c = cover.current, v = veil.current;
    if (!c?.animate || !v?.animate) { setOn(false); return; }
    const a = c.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(0deg)', offset: 0.22 }, { transform: 'rotateY(-118deg)' }], { duration: 1500, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'forwards' });
    v.animate([{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 1500, easing: 'ease-in', fill: 'forwards' });
    a.onfinish = () => setOn(false);
    const t = setTimeout(() => setOn(false), 2200);
    return () => clearTimeout(t);
  }, [on]);
  if (!on) return null;
  return (
    <div className="bi" aria-hidden="true">
      <div className="bi-veil" ref={veil} />
      <div className="bi-cover" ref={cover}>
        <span className="bi-title">Su's<br />Magical<br />Journal</span>
        <i className="bi-s s1">✦</i><i className="bi-s s2">✦</i><i className="bi-s s3">✦</i>
        <div className="bi-lock"><Lock /></div>
      </div>
    </div>
  );
}
