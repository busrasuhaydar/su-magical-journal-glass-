// Cihaza özel tercihler (localStorage): şehir, odak süresi, sade görünüm.
export const CITIES: Record<string, { name: string; lat: number; lon: number }> = {
  bursa: { name: 'Bursa', lat: 40.19, lon: 29.06 }, istanbul: { name: 'İstanbul', lat: 41.01, lon: 28.98 }, ankara: { name: 'Ankara', lat: 39.93, lon: 32.86 },
  izmir: { name: 'İzmir', lat: 38.42, lon: 27.14 }, antalya: { name: 'Antalya', lat: 36.9, lon: 30.7 }, eskisehir: { name: 'Eskişehir', lat: 39.78, lon: 30.52 },
};
export function getPref(k: string, d: string) { try { return localStorage.getItem(`su:${k}`) ?? d; } catch { return d; } }
export function setPref(k: string, v: string) { try { localStorage.setItem(`su:${k}`, v); } catch { /* yok say */ } }
export const currentCity = () => CITIES[getPref('city', 'bursa')] ?? CITIES.bursa;
export function applySimple() { document.documentElement.classList.toggle('simple', getPref('simple', '0') === '1'); }
