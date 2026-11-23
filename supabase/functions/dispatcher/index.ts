// Dağıtıcı: her dakika pg_cron çağırır. Zamanı gelen hatırlatıcıları bildirime çevirir (uygulama içi, web push, e-posta)
// ve zamanı gelen sosyal medya yayınlarını resmî API'lerle yayınlar. Kullanıcı da kendi oturumuyla "şimdi yayınla" / "test" çağırabilir.
import { createClient } from "npm:@supabase/supabase-js@2.46.1";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:5173";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const BACKOFF_MIN = [1, 5, 30, 120];
const PLATFORM_TR: Record<string, string> = { instagram: "Instagram", x: "X", youtube: "YouTube", website: "Web sitesi" };

class PubError extends Error { constructor(msg: string, public transient = false, public reauth = false) { super(msg); } }
class ManualShare extends Error {}

// ── Yardımcılar ────────────────────────────────────────
async function secret(key: string) { const { data } = await db.from("app_secrets").select("value").eq("key", key).maybeSingle(); return data?.value as string | undefined; }

let vapidReady = false;
async function ensureVapid() {
  if (vapidReady) return true;
  let pub = await secret("vapid_public"), priv = await secret("vapid_private");
  if (!pub || !priv) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    const raw = new Uint8Array([4, ...fromB64u(jwk.x!), ...fromB64u(jwk.y!)]);
    pub = b64u(raw); priv = jwk.d!;
    await db.from("app_secrets").upsert([{ key: "vapid_public", value: pub }, { key: "vapid_private", value: priv }]);
  }
  await db.from("app_config").upsert({ key: "vapid_public", value: pub });
  webpush.setVapidDetails("mailto:noreply@example.com", pub, priv);
  vapidReady = true;
  return true;
}

async function deliver(owner: string, n: { kind: string; title: string; body?: string | null; url?: string | null; reminder_id?: string | null }) {
  await db.from("notifications").insert({ owner_id: owner, ...n });
  // Web push
  const { data: subs } = await db.from("push_subscriptions").select("*").eq("owner_id", owner);
  if (subs?.length) {
    await ensureVapid();
    const payload = JSON.stringify({ title: n.title, body: n.body ?? "", url: n.url ?? "/" });
    await Promise.all(subs.map(async (s) => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 }); }
      catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id); else console.error("push", code, (e as Error).message); }
    }));
  }
  // E-posta (Resend anahtarı varsa ve kullanıcı açtıysa)
  const resend = Deno.env.get("RESEND_API_KEY");
  if (resend) {
    const { data: prof } = await db.from("profiles").select("email_notifications").eq("id", owner).maybeSingle();
    if (prof?.email_notifications) {
      const { data: u } = await db.auth.admin.getUserById(owner);
      if (u?.user?.email) {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: Deno.env.get("EMAIL_FROM") ?? "Su's Magical Journal <onboarding@resend.dev>", to: [u.user.email], subject: n.title,
            html: `<div style="font-family:sans-serif"><h2 style="color:#C93A73">${esc(n.title)}</h2><p>${esc(n.body ?? "")}</p>${n.url ? `<p><a href="${APP_URL}${n.url}">Günlükte aç</a></p>` : ""}</div>` }),
        });
        if (!r.ok) console.error("email", r.status, (await r.text()).slice(0, 200));
      }
    }
  }
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// ── Hatırlatıcılar ─────────────────────────────────────
async function processReminders(owner?: string) {
  let q = db.from("reminders").update({ sent_at: new Date().toISOString() }).is("sent_at", null).lte("remind_at", new Date().toISOString());
  if (owner) q = q.eq("owner_id", owner);
  const { data: claimed, error } = await q.select("*, tasks(title, due_date, starts_at), events(title, starts_at), opportunity_dates(opportunity_id)");
  if (error) { console.error("reminders", error.message); return 0; }
  for (const r of claimed ?? []) {
    const title = r.label ?? r.tasks?.title ?? r.events?.title ?? "Hatırlatıcı";
    const day = r.tasks ? (r.tasks.starts_at ?? r.tasks.due_date ?? "").slice(0, 10) : r.events ? r.events.starts_at.slice(0, 10) : null;
    const url = r.opportunity_dates ? `/firsatlar/${r.opportunity_dates.opportunity_id}` : day ? `/gun/${day}` : "/";
    await deliver(r.owner_id, { kind: "reminder", title: r.tasks ? `Görev: ${title}` : r.events ? `Etkinlik: ${title}` : title, body: r.tasks || r.events ? "Hatırlatıcı zamanı geldi." : null, url, reminder_id: r.id });
  }
  return claimed?.length ?? 0;
}

// ── Token yönetimi ─────────────────────────────────────
async function form(url: string, params: Record<string, string>, headers: Record<string, string> = {}) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(params) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new PubError(`Token yenilenemedi (${r.status}): ${j.error_description ?? j.error?.message ?? j.error ?? ""}`, r.status >= 500, r.status === 400 || r.status === 401);
  return j;
}
async function accessToken(acc: { id: string; platform: string }) {
  const { data: t } = await db.from("social_tokens").select("*").eq("account_id", acc.id).single();
  if (!t) throw new PubError("Hesap tokenı bulunamadı; hesabı yeniden bağlayın.", false, true);
  const soon = t.expires_at && new Date(t.expires_at).getTime() - Date.now() < (acc.platform === "instagram" ? 7 * 86400e3 : 5 * 60e3);
  if (!soon) return t.access_token as string;
  let j: { access_token: string; refresh_token?: string; expires_in?: number };
  if (acc.platform === "x") {
    const id = Deno.env.get("X_CLIENT_ID")!, sec = Deno.env.get("X_CLIENT_SECRET");
    j = await form("https://api.x.com/2/oauth2/token", { grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: id }, sec ? { Authorization: "Basic " + btoa(`${id}:${sec}`) } : {});
  } else if (acc.platform === "youtube") {
    j = await form("https://oauth2.googleapis.com/token", { grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")! });
  } else {
    const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(t.access_token)}`);
    j = await r.json(); if (!r.ok) throw new PubError("Instagram tokenı yenilenemedi; hesabı yeniden bağlayın.", false, true);
  }
  await db.from("social_tokens").update({ access_token: j.access_token, refresh_token: j.refresh_token ?? t.refresh_token, expires_at: j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : null, updated_at: new Date().toISOString() }).eq("account_id", acc.id);
  return j.access_token;
}

// ── Platform yayıncıları ───────────────────────────────
type Media = { url: string; mime: string; size: number; title: string };
type Post = { id: string; title: string; caption_tr: string | null; caption_en: string | null; hashtags: string[]; links: string[]; content_type: string };
const caption = (p: Post) => [p.caption_tr || p.caption_en || "", p.hashtags.join(" "), p.links.join(" ")].filter(Boolean).join("\n\n").trim();

async function check(r: Response, what: string) {
  if (r.ok) return r.json();
  const t = await r.text();
  let msg = t.slice(0, 300); try { const j = JSON.parse(t); msg = j.detail ?? j.error?.message ?? j.title ?? j.errors?.[0]?.message ?? msg; } catch { /* metin */ }
  throw new PubError(`${what} (${r.status}): ${msg}`, r.status === 429 || r.status >= 500, r.status === 401);
}

async function publishX(token: string, p: Post, media: Media[]) {
  let text = caption(p) || p.title;
  if ([...text].length > 280) text = [...text].slice(0, 279).join("") + "…";
  const ids: string[] = [];
  for (const m of media.filter((m) => m.mime.startsWith("image/")).slice(0, 4)) {
    if (m.size > 5 * 1024 * 1024) throw new PubError(`X görselleri en fazla 5 MB olabilir (${m.title}).`);
    const blob = await (await fetch(m.url)).blob();
    const fd = new FormData(); fd.append("media", blob, m.title); fd.append("media_category", "tweet_image");
    const j = await check(await fetch("https://api.x.com/2/media/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd }), "X görsel yükleme");
    ids.push(j.data?.id ?? j.id ?? j.media_id_string);
  }
  const j = await check(await fetch("https://api.x.com/2/tweets", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ text, ...(ids.length ? { media: { media_ids: ids } } : {}) }) }), "X gönderisi");
  return { external_id: j.data.id as string, url: `https://x.com/i/web/status/${j.data.id}` };
}

async function publishInstagram(token: string, igUser: string, p: Post, media: Media[]) {
  const G = "https://graph.instagram.com/v21.0";
  const usable = media.filter((m) => m.mime.startsWith("image/jpeg") || m.mime.startsWith("image/png") || m.mime.startsWith("video/"));
  if (!usable.length) throw new PubError("Instagram en az bir JPEG/PNG görsel veya video ister.");
  const post = (path: string, params: Record<string, string>) => fetch(`${G}${path}`, { method: "POST", body: new URLSearchParams({ ...params, access_token: token }) });
  const waitReady = async (id: string) => {
    for (let i = 0; i < 20; i++) {
      const s = await check(await fetch(`${G}/${id}?fields=status_code&access_token=${encodeURIComponent(token)}`), "Instagram durum");
      if (s.status_code === "FINISHED") return; if (s.status_code === "ERROR") throw new PubError("Instagram medyayı işleyemedi (biçim veya boyut uygun değil).");
      await new Promise((r) => setTimeout(r, 2500));
    }
    throw new PubError("Instagram videoyu henüz işlemedi; tekrar denenecek.", true);
  };
  const item = async (m: Media, extra: Record<string, string>) => {
    const isVid = m.mime.startsWith("video/");
    const j = await check(await post(`/${igUser}/media`, isVid ? { media_type: extra.is_carousel_item ? "VIDEO" : "REELS", video_url: m.url, ...extra } : { image_url: m.url, ...extra }), "Instagram medya");
    if (isVid) await waitReady(j.id);
    return j.id as string;
  };
  let creation: string;
  if (usable.length === 1) creation = await item(usable[0], { caption: caption(p) });
  else {
    const children: string[] = [];
    for (const m of usable.slice(0, 10)) children.push(await item(m, { is_carousel_item: "true" }));
    creation = (await check(await post(`/${igUser}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: caption(p) }), "Instagram kaydırmalı gönderi")).id;
  }
  const pub = await check(await post(`/${igUser}/media_publish`, { creation_id: creation }), "Instagram yayın");
  const info = await fetch(`${G}/${pub.id}?fields=permalink&access_token=${encodeURIComponent(token)}`).then((r) => r.json()).catch(() => ({}));
  return { external_id: pub.id as string, url: (info.permalink as string) ?? null };
}

async function publishYouTube(token: string, p: Post, media: Media[]) {
  const v = media.find((m) => m.mime.startsWith("video/"));
  if (!v) throw new PubError("YouTube için bir video dosyası ekleyin.");
  const meta = { snippet: { title: p.title.slice(0, 100), description: caption(p).slice(0, 5000), tags: p.hashtags.map((h) => h.replace(/^#/, "")).slice(0, 30) }, status: { privacyStatus: "public", selfDeclaredMadeForKids: false } };
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": v.mime, "X-Upload-Content-Length": String(v.size) }, body: JSON.stringify(meta),
  });
  if (!init.ok) await check(init, "YouTube yükleme başlatma");
  const loc = init.headers.get("location")!;
  const src = await fetch(v.url);
  const j = await check(await fetch(loc, { method: "PUT", headers: { "Content-Type": v.mime, "Content-Length": String(v.size) }, body: src.body }), "YouTube yükleme");
  return { external_id: j.id as string, url: `https://youtu.be/${j.id}` };
}

// ── Yayın kuyruğu ──────────────────────────────────────
async function rollup(postId: string) {
  const { data: ts } = await db.from("post_targets").select("status").eq("post_id", postId);
  const s = (ts ?? []).map((t) => t.status);
  const status = s.length && s.every((x) => x === "published") ? "published" : s.some((x) => x === "scheduled" || x === "publishing") ? "publishing" : s.some((x) => x === "awaiting_approval") ? "awaiting_approval" : s.some((x) => x === "failed") ? "failed" : null;
  if (status) await db.from("social_posts").update({ status, ...(status === "published" ? { published_at: new Date().toISOString() } : {}) }).eq("id", postId);
}

async function processPublishing(owner?: string, postId?: string) {
  const now = new Date().toISOString();
  let q = db.from("post_targets").select("*, social_posts!inner(id, owner_id, title, caption_tr, caption_en, hashtags, links, content_type, scheduled_at, deleted_at)")
    .eq("status", "scheduled").is("social_posts.deleted_at", null).lte("social_posts.scheduled_at", now).or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`).limit(20);
  if (owner) q = q.eq("owner_id", owner);
  if (postId) q = q.eq("post_id", postId);
  const { data: due, error } = await q;
  if (error) { console.error("queue", error.message); return 0; }
  let n = 0;
  for (const t of due ?? []) {
    const { data: claimed } = await db.from("post_targets").update({ status: "publishing" }).eq("id", t.id).eq("status", "scheduled").select("id");
    if (!claimed?.length) continue;
    n++;
    const p = t.social_posts as Post & { owner_id: string };
    const label = `${PLATFORM_TR[t.platform]}: ${p.title}`;
    try {
      if (t.platform === "website") throw new ManualShare();
      const { data: acc } = await db.from("social_accounts").select("*").eq("owner_id", t.owner_id).eq("platform", t.platform).maybeSingle();
      if (!acc || acc.status !== "connected") throw new ManualShare();
      const { data: links } = await db.from("file_links").select("position, files(storage_path, mime, size, title, deleted_at)").eq("entity_type", "social_post").eq("entity_id", p.id).order("position");
      const media: Media[] = [];
      for (const l of links ?? []) {
        const f = l.files as unknown as { storage_path: string; mime: string; size: number; title: string; deleted_at: string | null } | null;
        if (!f || f.deleted_at) continue;
        const { data: s } = await db.storage.from("files").createSignedUrl(f.storage_path, 3600);
        if (s) media.push({ url: s.signedUrl, mime: f.mime, size: f.size, title: f.title });
      }
      const token = await accessToken(acc);
      const res = t.platform === "x" ? await publishX(token, p, media) : t.platform === "instagram" ? await publishInstagram(token, acc.external_id, p, media) : await publishYouTube(token, p, media);
      await db.from("post_targets").update({ status: "published", published_url: res.url, external_id: res.external_id, published_at: new Date().toISOString(), error: null, next_attempt_at: null }).eq("id", t.id);
      await deliver(t.owner_id, { kind: "publish", title: `Yayınlandı · ${label}`, body: res.url ?? null, url: "/sosyal" });
    } catch (e) {
      if (e instanceof ManualShare) {
        await db.from("post_targets").update({ status: "awaiting_approval", error: null, next_attempt_at: null }).eq("id", t.id);
        await deliver(t.owner_id, { kind: "publish", title: `Paylaşma zamanı ✦ · ${label}`, body: "Dokunun, içerik paylaşmaya hazır açılsın.", url: `/sosyal?icerik=${p.id}` });
        await rollup(p.id);
        continue;
      }
      const pe = e instanceof PubError ? e : new PubError((e as Error).message, true);
      if (pe.reauth) await db.from("social_accounts").update({ status: "needs_reauth", updated_at: new Date().toISOString() }).eq("owner_id", t.owner_id).eq("platform", t.platform);
      const attempts = (t.attempts ?? 0) + 1;
      if (pe.transient && attempts <= BACKOFF_MIN.length) {
        await db.from("post_targets").update({ status: "scheduled", attempts, error: pe.message, next_attempt_at: new Date(Date.now() + BACKOFF_MIN[attempts - 1] * 60e3).toISOString() }).eq("id", t.id);
      } else {
        await db.from("post_targets").update({ status: "failed", attempts, error: pe.message }).eq("id", t.id);
        await deliver(t.owner_id, { kind: "publish", title: `Yayınlanamadı · ${label}`, body: pe.message, url: "/sosyal" });
      }
    }
    await rollup(p.id);
  }
  return n;
}

// ── Giriş noktası ──────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({}));
  const cronHeader = req.headers.get("x-cron-secret");
  if (cronHeader) {
    if (cronHeader !== (await secret("cron_secret"))) return json({ error: "yetkisiz" }, 401);
    const r = await processReminders(); const p = await processPublishing();
    return json({ reminders: r, published: p });
  }
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } };
  if (!u?.user) return json({ error: "Oturum gerekli." }, 401);
  const owner = u.user.id;
  if (body.action === "vapid") { await ensureVapid(); return json({ public_key: await secret("vapid_public") }); }
  if (body.action === "test") {
    await deliver(owner, { kind: "test", title: "Deneme bildirimi ✦", body: "Bildirimler çalışıyor.", url: "/ayarlar" });
    const { count } = await db.from("push_subscriptions").select("*", { count: "exact", head: true }).eq("owner_id", owner);
    return json({ ok: true, push_devices: count ?? 0, email: !!Deno.env.get("RESEND_API_KEY") });
  }
  if (body.action === "publish_now" && body.post_id) {
    const { data: post } = await db.from("social_posts").select("id, owner_id").eq("id", body.post_id).eq("owner_id", owner).maybeSingle();
    if (!post) return json({ error: "İçerik bulunamadı." }, 404);
    await db.from("social_posts").update({ scheduled_at: new Date().toISOString(), status: "scheduled" }).eq("id", post.id);
    await db.from("post_targets").update({ status: "scheduled", next_attempt_at: null, attempts: 0, error: null }).eq("post_id", post.id).neq("status", "published");
    const n = await processPublishing(owner, post.id);
    const { data: targets } = await db.from("post_targets").select("platform, status, error, published_url").eq("post_id", post.id);
    return json({ processed: n, targets });
  }
  if (body.action === "status") {
    return json({ x: !!Deno.env.get("X_CLIENT_ID"), instagram: !!Deno.env.get("IG_APP_ID"), youtube: !!Deno.env.get("GOOGLE_CLIENT_ID"), email: !!Deno.env.get("RESEND_API_KEY") });
  }
  const r = await processReminders(owner);
  return json({ reminders: r });
});
