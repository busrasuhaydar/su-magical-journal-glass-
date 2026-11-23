import { REMINDER_OPTIONS } from '../lib/types';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarHeart, FolderHeart, Files, CalendarDays, Download, RotateCcw } from 'lucide-react';
import { PageHead } from '../components/Shell';
import { Field, useToast } from '../components/ui';
import { useProfile, useSocialAccounts, useUpdateProfile } from '../lib/data';
import { callDispatcher, disablePush, enablePush, pushActive } from '../lib/notify';
import { CITIES, applySimple, getPref, setPref } from '../lib/prefs';
import { HOME_SECTIONS, useHomePrefs, type UiPrefs } from '../lib/ui';
import { supabase } from '../lib/supabase';
import { todayKey } from '../lib/dates';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function SettingsPage() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const toast = useToast();
  const [name, setName] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState('');
  useEffect(() => { setName(profile.data?.display_name ?? ''); }, [profile.data?.display_name]);

  async function exportAll() {
    setExporting(true);
    try {
      const tables = ['profiles', 'projects', 'contacts', 'tasks', 'events', 'reminders', 'files', 'file_links', 'journal_days', 'journal_blocks'];
      const out: Record<string, unknown> = { app: "Su's Magical Journal", exported_at: new Date().toISOString(), version: 1 };
      for (const t of tables) {
        const { data, error } = await supabase.from(t).select('*').limit(10000);
        if (error) throw error;
        out[t] = data;
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      setExportUrl(URL.createObjectURL(blob));
      toast.ok('Dışa aktarım hazır');
    } catch (x) { toast.fail(x); } finally { setExporting(false); }
  }

  return (
    <>
      <PageHead title="Ayarlar" />
      <section className="glass panel">
        <div className="panel-head"><h2>Hızlı erişim</h2></div>
        <div className="row">
          <Link className="btn btn-glass" to={`/gun/${todayKey()}`}><CalendarHeart size={15} />Günlük Plan</Link>
          <Link className="btn btn-glass" to="/takvim/yil"><CalendarDays size={15} />Yıllık takvim</Link>
          <Link className="btn btn-glass" to="/projeler"><FolderHeart size={15} />Projelerim</Link>
          <Link className="btn btn-glass" to="/dosyalar"><Files size={15} />Dosyalar</Link>
        </div>
      </section>

      <section className="glass panel">
        <div className="panel-head"><h2>Profil</h2></div>
        <form className="row" style={{ alignItems: 'end' }} onSubmit={(e) => { e.preventDefault(); update.mutate({ display_name: name.trim() || null }, { onSuccess: () => toast.ok('Kaydedildi'), onError: (x) => toast.fail(x) }); }}>
          <div style={{ flex: '1 1 240px' }}><Field label="Görünen ad"><input id="s-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
          <button className="btn btn-primary">Kaydet</button>
        </form>
        <p className="small muted" style={{ marginBottom: 0 }}>Saat dilimi: Europe/Istanbul · Tarih biçimi: Türkçe</p>
      </section>

      <HomeSettings />
      <PrefSettings />

      <NotificationSettings />
      <AccountSettings />
      <ReminderSettings />

      <section className="glass panel">
        <div className="panel-head"><h2>Verilerim</h2></div>
        <p className="small" style={{ marginTop: 0 }}>Bütün kayıtlarınızı (görevler, etkinlikler, projeler, günlük, dosya listesi) tek bir JSON dosyası olarak indirebilirsiniz. Dosyaların kendisi Supabase Storage'da kalır.</p>
        <div className="row">
          <button type="button" className="btn btn-glass" onClick={exportAll} disabled={exporting}><Download size={15} />{exporting ? 'Hazırlanıyor…' : 'Dışa aktarımı hazırla'}</button>
          {exportUrl && <a className="btn btn-primary" href={exportUrl} download={`su-magical-journal-${todayKey()}.json`}>JSON dosyasını indir</a>}
        </div>
      </section>
    </>
  );
}

function ReminderSettings() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['reminder_settings'], queryFn: async () => { const { data } = await supabase.from('reminder_settings').select('*').maybeSingle(); return data as { deadline_offsets: number[]; other_offsets: number[] } | null; } });
  const [dl, setDl] = useState('');
  const [ot, setOt] = useState('');
  useEffect(() => { setDl((q.data?.deadline_offsets ?? [30, 14, 7, 3, 0]).join(', ')); setOt((q.data?.other_offsets ?? [1, 0]).join(', ')); }, [q.data]);
  const parse = (s: string) => [...new Set(s.split(/[,\s]+/).filter(Boolean).map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 365).sort((a, b) => b - a);
  async function save() {
    const d = parse(dl), o = parse(ot);
    if (!d.length) return toast.fail(new Error('Son başvuru için en az bir gün girin (ör. 30, 14, 7, 3, 0).'));
    const { error } = await supabase.from('reminder_settings').upsert({ deadline_offsets: d, other_offsets: o }, { onConflict: 'owner_id' });
    if (error) return toast.fail(error);
    qc.invalidateQueries({ queryKey: ['reminder_settings'] }); toast.ok('Hatırlatıcı ayarları kaydedildi');
  }
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>Başvuru hatırlatıcıları</h2></div>
      <div className="grid-2">
        <Field label="Son başvurudan kaç gün önce (virgülle)"><input id="rs-dl" className="input" value={dl} onChange={(e) => setDl(e.target.value)} /></Field>
        <Field label="Sonuç, teslim, kurulum, açılış için"><input id="rs-ot" className="input" value={ot} onChange={(e) => setOt(e.target.value)} /></Field>
      </div>
      <div className="row" style={{ marginTop: 10 }}><button type="button" className="btn btn-primary btn-sm" onClick={save}>Kaydet</button><span className="small muted">0 = günün kendisi. Yeni eklenen veya değişen tarihlere uygulanır.</span></div>
    </section>
  );
}

function NotificationSettings() {
  const toast = useToast();
  const qc = useQueryClient();
  const profile = useProfile();
  const update = useUpdateProfile();
  const [active, setActive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailReady, setEmailReady] = useState<boolean | null>(null);
  useEffect(() => { pushActive().then(setActive); callDispatcher<{ email: boolean }>({ action: 'status' }).then((s) => setEmailReady(s.email)).catch(() => setEmailReady(null)); }, []);
  async function toggle() {
    setBusy(true);
    try {
      if (active) { await disablePush(); setActive(false); toast.ok('Bu cihazda bildirimler kapatıldı'); }
      else {
        const r = await enablePush();
        if (r === 'ok') { setActive(true); toast.ok('Bu cihazda bildirimler açıldı'); }
        else if (r === 'denied') toast.fail(new Error('Tarayıcı izin vermedi. Adres çubuğundaki site ayarlarından bildirim iznini açın.'));
        else toast.fail(new Error('Bu tarayıcı web bildirimlerini desteklemiyor. iPhone’da önce uygulamayı Ana Ekrana ekleyin.'));
      }
    } catch (x) { toast.fail(x); } finally { setBusy(false); }
  }
  async function test() {
    try { const r = await callDispatcher<{ push_devices: number }>({ action: 'test' }); qc.invalidateQueries({ queryKey: ['notifications'] }); toast.ok(`Deneme bildirimi gönderildi · ${r.push_devices} cihaz`); } catch (x) { toast.fail(x); }
  }
  return (
    <section className="glass panel" style={{ display: 'grid', gap: 12 }}>
      <div className="panel-head" style={{ marginBottom: 0 }}><h2>Bildirimler</h2><button type="button" className="btn btn-glass btn-sm" onClick={test}>Deneme bildirimi gönder</button></div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span><b>Bu cihazda tarayıcı bildirimleri</b><br /><span className="small muted">{active == null ? 'Kontrol ediliyor…' : active ? 'Açık · uygulama kapalıyken de hatırlatıcılar gelir.' : 'Kapalı'}</span></span>
        <button type="button" className={`btn ${active ? 'btn-glass' : 'btn-primary'}`} disabled={busy || active == null} onClick={toggle}>{active ? 'Kapat' : 'Aç'}</button>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span><b>E-posta bildirimleri</b><br /><span className="small muted">{emailReady === false ? 'E-posta servisi bağlı değil (Supabase sırlarına RESEND_API_KEY eklenmeli).' : 'Hatırlatıcılar hesabınızın e-posta adresine de gönderilir.'}</span></span>
        <label className="row small" style={{ gap: 6, cursor: emailReady === false ? 'not-allowed' : 'pointer' }}><input id="n-email" type="checkbox" disabled={emailReady === false} checked={!!profile.data?.email_notifications} onChange={(e) => update.mutate({ email_notifications: e.target.checked } as never)} />Açık</label>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Uygulama içi bildirimler her zaman açık; sağ üstteki zilde görünür. Zamanlayıcı dakikada bir çalışır.</p>
    </section>
  );
}

const PLATFORMS: { key: 'instagram' | 'x' | 'youtube'; name: string; needs: string; help: string }[] = [
  { key: 'instagram', name: 'Instagram', needs: 'IG_APP_ID, IG_APP_SECRET', help: 'Meta for Developers’ta “Instagram API with Instagram Login” ürünü olan bir uygulama. Hesabınız İşletme veya İçerik Üreticisi olmalı. Yayın izni (instagram_business_content_publish) Meta uygulama incelemesi gerektirebilir.' },
  { key: 'x', name: 'X', needs: 'X_CLIENT_ID, X_CLIENT_SECRET', help: 'developer.x.com’da OAuth 2.0 açık bir uygulama (Read and write). Yazma erişimi X’in ücretli API planına bağlı olabilir.' },
  { key: 'youtube', name: 'YouTube', needs: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET', help: 'Google Cloud’da YouTube Data API v3 etkin bir proje ve OAuth istemcisi. Google denetiminden geçmemiş projelerden yüklenen videolar gizli kalır.' },
];
function AccountSettings() {
  const accounts = useSocialAccounts();
  const toast = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Record<string, boolean> | null>(null);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(() => location.hash === '#hesaplar' || new URLSearchParams(location.search).has('baglandi') || new URLSearchParams(location.search).has('hata'));
  const callback = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth`;
  useEffect(() => {
    callDispatcher<Record<string, boolean>>({ action: 'status' }).then(setStatus).catch(() => setStatus(null));
    const p = new URLSearchParams(location.search);
    if (p.get('baglandi')) toast.ok(`${p.get('baglandi')} hesabı bağlandı`);
    if (p.get('hata')) toast.fail(new Error(p.get('hata')!));
    if (p.get('baglandi') || p.get('hata')) history.replaceState(null, '', `${import.meta.env.BASE_URL}ayarlar#hesaplar`);
  }, [toast]);
  async function connect(platform: string) {
    setBusy(platform);
    try {
      const { data, error } = await supabase.functions.invoke('oauth', { body: { platform, return_to: location.origin + import.meta.env.BASE_URL.replace(/\/$/, '') } });
      if (error) { let msg = error.message; try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error + (j.missing ? ` Gerekli: ${j.missing.join(', ')}.` : ''); } catch { /* yok say */ } throw new Error(msg); }
      location.assign(data.url);
    } catch (x) { toast.fail(x); setBusy(''); }
  }
  async function disconnect(id: string) {
    const { error } = await supabase.from('social_accounts').delete().eq('id', id);
    if (error) toast.fail(error); else { qc.invalidateQueries({ queryKey: ['social_accounts'] }); toast.ok('Bağlantı kesildi'); }
  }
  return (
    <section className="glass panel" id="hesaplar" style={{ display: 'grid', gap: 12 }}>
      <button type="button" className="acc-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <h2>Sosyal medya hesapları</h2>
        <span className="row" style={{ gap: 8 }}>
          {PLATFORMS.map((pl) => { const a = accounts.data?.find((x) => x.platform === pl.key); return <span key={pl.key} className="chip" style={{ color: a?.status === 'connected' ? 'var(--ok)' : undefined }}>{pl.name} · {a ? (a.status === 'connected' ? 'bağlı' : 'yeniden bağla') : 'bağlı değil'}</span>; })}
          <span className="acc-chev" style={{ transform: open ? 'rotate(180deg)' : undefined }}>⌄</span>
        </span>
      </button>
      {open && <>
      <p className="small muted" style={{ margin: 0 }}>Zamanlanan içerikler bağlı hesaplarda saatinde otomatik yayınlanır. Bağlı olmayan platformlar için saatinde bildirim alırsınız ve elle yayınlayıp işaretlersiniz. Tokenlar yalnız sunucuda saklanır.</p>
      {PLATFORMS.map((pl) => {
        const acc = accounts.data?.find((a) => a.platform === pl.key);
        const configured = status?.[pl.key];
        return (
          <div key={pl.key} className="card acc-row">
            <div style={{ minWidth: 0 }}>
              <b>{pl.name}</b>{' '}
              {acc ? <span className="chip" style={{ color: acc.status === 'connected' ? 'var(--ok)' : 'var(--bad)' }}>{acc.status === 'connected' ? `Bağlı · ${acc.account_name ?? ''}` : 'Yeniden bağlanmalı'}</span>
                : configured === false ? <span className="chip">Geliştirici uygulaması tanımlı değil</span> : <span className="chip">Bağlı değil</span>}
              {!acc && configured === false && <p className="small muted" style={{ margin: '6px 0 0' }}>{pl.help} Supabase → Edge Functions → Secrets’a <code>{pl.needs}</code> ekleyin. Yönlendirme adresi: <code style={{ userSelect: 'all' }}>{callback}</code></p>}
            </div>
            <div className="row">
              {acc && <button type="button" className="btn btn-ghost btn-sm" onClick={() => disconnect(acc.id)}>Bağlantıyı kes</button>}
              <button type="button" className="btn btn-primary btn-sm" disabled={busy === pl.key || configured === false} onClick={() => connect(pl.key)}>{busy === pl.key ? 'Yönlendiriliyor…' : acc ? 'Yeniden bağla' : 'Bağla'}</button>
            </div>
          </div>
        );
      })}
      <div className="card acc-row"><div><b>Web sitesi</b> <span className="chip">Elle yayın</span><p className="small muted" style={{ margin: '6px 0 0' }}>Sitenizin altyapısını söylediğinizde (WordPress vb.) otomatik yayın eklenebilir.</p></div></div>
      </>}
    </section>
  );
}

function PrefSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const [city, setCity] = useState(() => getPref('city', 'bursa'));
  const [simple, setSimple] = useState(() => getPref('simple', '0') === '1');
  const [defRem, setDefRem] = useState(() => getPref('defaultReminder', ''));
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>Görünüm ve tercihler</h2><span className="small muted">Bu cihaza özel</span></div>
      <div className="grid-2">
        <Field label="Hava durumu şehri">
          <select className="select" value={city} onChange={(e) => { setCity(e.target.value); setPref('city', e.target.value); qc.invalidateQueries({ queryKey: ['weather'] }); toast.ok('Şehir güncellendi'); }}>
            {Object.entries(CITIES).map(([k, c]) => <option key={k} value={k}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Görünüm">
          <label className="row small" style={{ cursor: 'pointer', minHeight: 42 }}>
            <input type="checkbox" checked={simple} onChange={(e) => { setSimple(e.target.checked); setPref('simple', e.target.checked ? '1' : '0'); applySimple(); }} />
            Sade mod (cam bulanıklığını kapat, daha hızlı)
          </label>
        </Field>
        <Field label="Yeni görevlerde varsayılan hatırlatıcı">
          <select className="select" value={defRem} onChange={(e) => { setDefRem(e.target.value); setPref('defaultReminder', e.target.value); toast.ok('Varsayılan hatırlatıcı güncellendi'); }}>
            {REMINDER_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>Takvimde yalnız Türkiye ve Amerika tatilleri gösterilir. 2026 ve 2027 dinî bayramları Diyanet takvimiyle kesinleşti; 2028 bayramları Diyanet yayımlayana kadar “kesinleşmedi” görünür.</p>
    </section>
  );
}

/** Ana sayfa: kart başlıklarını yeniden adlandır, kartları göster/gizle, Boston saati. Hesapla eşitlenir. */
function HomeSettings() {
  const hp = useHomePrefs();
  const update = useUpdateProfile();
  const toast = useToast();
  const [titles, setTitles] = useState<Record<string, string>>({});
  useEffect(() => { setTitles(hp.ui.titles ?? {}); }, [hp.ui.titles]);
  const save = (patch: Partial<UiPrefs>) => update.mutate({ ui_prefs: { ...hp.ui, ...patch } }, { onError: (e) => toast.fail(e) });
  const toggle = (k: string) => { const hide = new Set(hp.ui.hide ?? []); hide.has(k) ? hide.delete(k) : hide.add(k); save({ hide: [...hide] }); };
  return (
    <section className="glass panel">
      <div className="panel-head"><h2>Ana sayfa</h2><button type="button" className="btn btn-glass btn-sm" onClick={() => { setTitles({}); save({ titles: {}, hide: [] }); }}><RotateCcw size={13} />Varsayılana dön</button></div>
      <p className="small muted" style={{ marginTop: 0 }}>Kart başlıklarını istediğin gibi yaz, istemediğin kartı gizle. Değişiklikler telefonda ve bilgisayarda aynı olur.</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {HOME_SECTIONS.map(([k, def]) => (
          <div key={k} className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
            <input type="checkbox" aria-label={`${def} göster`} checked={!(hp.ui.hide ?? []).includes(k)} onChange={() => toggle(k)} />
            <input className="input" value={titles[k] ?? ''} placeholder={def} onChange={(e) => setTitles((t) => ({ ...t, [k]: e.target.value }))}
              onBlur={() => { if ((hp.ui.titles?.[k] ?? '') !== (titles[k] ?? '')) save({ titles: { ...(hp.ui.titles ?? {}), [k]: (titles[k] ?? '').trim() } }); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          </div>
        ))}
        <label className="row small" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={hp.boston} onChange={(e) => save({ boston: e.target.checked })} />
          🇺🇸 Ana sayfada küçük Boston saati göster
        </label>
      </div>
    </section>
  );
}
