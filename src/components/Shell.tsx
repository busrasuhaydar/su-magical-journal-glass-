import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CalendarHeart, CheckSquare, FolderHeart, Home, Settings, Files, Plus, Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, LogOut, Megaphone, Users, Lightbulb, Landmark, Images, Gem, LayoutGrid } from 'lucide-react';
import { Dialog } from './ui';
import { formatLong, minutesOf, hhmm, todayKey } from '../lib/dates';
import { useProfile } from '../lib/data';
import { currentCity } from '../lib/prefs';
import { supabase } from '../lib/supabase';
import { useEditors } from './Editors';
import { NotificationBell } from './NotificationBell';
import { QuickSearch } from './QuickSearch';

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);
  return now;
}

// Open-Meteo: anahtarsız, Bursa
const WMO: [number[], string, typeof Sun][] = [
  [[0, 1], 'Açık', Sun], [[2, 3], 'Parçalı bulutlu', Cloud], [[45, 48], 'Sisli', CloudFog],
  [[51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], 'Yağmurlu', CloudRain],
  [[71, 73, 75, 77, 85, 86], 'Karlı', CloudSnow], [[95, 96, 99], 'Fırtınalı', CloudLightning],
];
export function useWeather() {
  return useQuery({
    queryKey: ['weather', currentCity().name],
    staleTime: 30 * 60_000,
    retry: 0,
    queryFn: async () => {
      const c = currentCity();
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FIstanbul&forecast_days=1`);
      if (!r.ok) throw new Error('hava durumu');
      const j = await r.json();
      const code = j.current.weather_code as number;
      const m = WMO.find(([codes]) => codes.includes(code)) ?? WMO[1];
      const temp = Math.round(j.current.temperature_2m as number);
      const rain = Math.round((j.daily.precipitation_probability_max?.[0] ?? 0) as number);
      const hi = Math.round(j.daily.temperature_2m_max[0] as number), lo = Math.round(j.daily.temperature_2m_min[0] as number);
      const wind = Math.round(j.current.wind_speed_10m as number);
      const tips: string[] = [];
      if (rain >= 50 || m[1] === 'Yağmurlu') tips.push('Şemsiyeni al ☂');
      if (m[1] === 'Karlı') tips.push('Kar var, sıcak giyin ❄');
      if (m[1] === 'Fırtınalı') tips.push('Fırtına olası, dışarı çıkacaksan dikkat');
      if (temp <= 8) tips.push('Soğuk, mont şart');
      else if (temp <= 16) tips.push('Serin, ince bir ceket iyi olur');
      else if (temp >= 29) tips.push('Sıcak, bol su iç');
      if (wind >= 30) tips.push('Rüzgâr sert');
      if (!tips.length) tips.push(m[1] === 'Açık' ? 'Hava güzel, kısa bir yürüyüş iyi gelir' : 'Çıkmak için uygun bir gün');
      return { city: c.name, temp, feels: Math.round(j.current.apparent_temperature as number), label: m[1], Icon: m[2], rain, hi, lo, wind, tip: tips.join(' · ') };
    },
  });
}

export function Clock() {
  const now = useNow();
  const w = useWeather();
  return (
    <div className="glass clock">
      <div>
        <div className="date">{formatLong(todayKey())}</div>
        <div className="time">{hhmm(minutesOf(now))}</div>
      </div>
      {w.data && (
        <div className="weather" title="Open-Meteo">
          <w.data.Icon size={20} color="var(--orange-500)" />
          <span><b>{w.data.temp}°C</b><br />{w.data.city} · {w.data.label}</span>
        </div>
      )}
    </div>
  );
}

const NAV: [string, string, typeof Home][] = [
  ['/', 'Ana Sayfa', Home], ['/takvim/yil', 'Takvim', CalendarDays], ['/gun', 'Günlük Plan', CalendarHeart],
  ['/gorevler', 'Görevler', CheckSquare], ['/projeler', 'Projelerim', FolderHeart], ['/sosyal', 'Sosyal Medya', Megaphone], ['/firsatlar', 'Sergiler ve Fırsatlar', Landmark],
  ['/kisiler', 'Kişiler', Users], ['/fikirler', 'Fikirler ve Notlar', Lightbulb], ['/galeri', 'Ortak Galeri', Images], ['/koleksiyonlar', 'Koleksiyonlarım', Gem], ['/dosyalar', 'Dosyalar', Files], ['/ayarlar', 'Ayarlar', Settings],
];


/** Sihirli defter efektleri: sayfa çevirme + tıklamada pırıltı. Yalnız transform/opacity (GPU); sade mod ve "hareketi azalt"ta kapalı. */
function useMagicBook(mainRef: React.RefObject<HTMLElement>, sweepRef: React.RefObject<HTMLDivElement>, path: string) {
  const first = useRef(true);
  const off = () => document.documentElement.classList.contains('simple') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (off() || !mainRef.current?.animate) return;
    window.scrollTo({ top: 0 });
    mainRef.current.animate(
      [{ transform: 'perspective(1500px) rotateY(-16deg) translateX(-14px)', opacity: 0.0, transformOrigin: 'left center' },
       { transform: 'perspective(1500px) rotateY(-4deg)', opacity: 1, offset: 0.55, transformOrigin: 'left center' },
       { transform: 'none', opacity: 1, transformOrigin: 'left center' }],
      { duration: 620, easing: 'cubic-bezier(.2,.8,.2,1)' });
    sweepRef.current?.animate(
      [{ transform: 'translateX(-110%)', opacity: 0 }, { opacity: 0.9, offset: 0.35 }, { transform: 'translateX(240%)', opacity: 0 }],
      { duration: 760, easing: 'ease-out' });
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const colors = ['#FF3D8E', '#FFC94D', '#00D9D0', '#fff', '#B58CFF'];
    const burst = (e: PointerEvent) => {
      if (off()) return;
      const t = e.target as HTMLElement | null;
      if (!t?.closest('.btn-primary, .check, .tabbar a, .nav a')) return;
      for (let i = 0; i < 7; i++) {
        const d = document.createElement('i');
        d.setAttribute('aria-hidden', 'true');
        d.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:7px;height:7px;margin:-3px;border-radius:50%;pointer-events:none;z-index:300;background:${colors[i % colors.length]}`;
        document.body.appendChild(d);
        const a = (Math.PI * 2 * i) / 7 + Math.random() * 0.6, r = 26 + Math.random() * 22;
        const an = d.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r}px) scale(.2)`, opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
        an.onfinish = () => d.remove();
      }
    };
    document.addEventListener('pointerdown', burst, { passive: true });
    return () => document.removeEventListener('pointerdown', burst);
  }, []);
}

import { BookDecor, BookIntro } from './BookDecor';

export function Shell() {
  const profile = useProfile();
  const { openTask } = useEditors();
  const nav = useNavigate();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const sweepRef = useRef<HTMLDivElement>(null);
  useMagicBook(mainRef, sweepRef, loc.pathname);
  useEffect(() => { setMore(false); }, [loc.pathname]);
  return (
    <div className="app">
      <BookDecor />
      <BookIntro />
      <aside className="sidebar glass" style={{ borderRadius: 0, borderTop: 0, borderBottom: 0, borderLeft: 0 }}>
        <NavLink to="/" className="brand">Su's Magical Journal</NavLink>
        <div className="hello">
          <b>Merhaba {profile.data?.display_name ?? ''} ♡</b>
          <span className="small muted">Hayallerin her zaman seninle.</span>
        </div>
        <nav className="nav" aria-label="Ana menü">
          {NAV.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === '/'} title={label}><Icon size={18} strokeWidth={1.75} /><span className="lbl">{label}</span></NavLink>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', display: 'grid', gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={() => openTask({ due_date: todayKey() })}><Plus size={16} /><span className="lbl">Hızlı görev</span></button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut().then(() => nav('/'))}><LogOut size={14} /><span className="lbl">Çıkış yap</span></button>
        </div>
      </aside>
      <div className="page-sweep" ref={sweepRef} aria-hidden="true" />
      <main className="main" ref={mainRef}>
        <div className="utilbar"><QuickSearch /><NotificationBell /></div>
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Alt menü">
        <NavLink to="/" end><Home size={22} />Bugün</NavLink>
        <NavLink to="/takvim/ay"><CalendarDays size={22} />Takvim</NavLink>
        <button type="button" onClick={() => openTask({ due_date: todayKey() })} aria-label="Görev ekle"><span className="plus"><Plus size={24} /></span></button>
        <NavLink to="/gorevler"><CheckSquare size={22} />Görevler</NavLink>
        <button type="button" onClick={() => setMore(true)} aria-label="Tüm sayfalar"><LayoutGrid size={22} />Tümü</button>
      </nav>
      {more && (
        <Dialog title="Tüm sayfalar" onClose={() => setMore(false)}>
          <div className="more-grid">
            {NAV.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/'}><Icon size={22} strokeWidth={1.75} /><span>{label}</span></NavLink>)}
            <button type="button" onClick={() => supabase.auth.signOut().then(() => nav('/'))}><LogOut size={22} strokeWidth={1.75} /><span>Çıkış yap</span></button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function PageHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="topbar">
      <h1>{title}</h1>
      <div className="row">{children}</div>
    </div>
  );
}
