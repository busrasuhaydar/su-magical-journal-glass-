// Sosyal hesap bağlama (OAuth). POST {action:'start', platform, return_to} → yetki adresi döner.
// GET ?code&state (sağlayıcıdan dönüş) → token sunucuda saklanır, uygulamaya geri yönlendirilir.
import { createClient } from "npm:@supabase/supabase-js@2.46.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CALLBACK = `${SUPABASE_URL}/functions/v1/oauth`;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const rand = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const ALLOWED_RETURN = /^(http:\/\/localhost(:\d+)?|http:\/\/127\.0\.0\.1(:\d+)?|https:\/\/[a-z0-9.-]+)$/i;

const CFG = {
  x: { env: ["X_CLIENT_ID"], name: "X" },
  instagram: { env: ["IG_APP_ID", "IG_APP_SECRET"], name: "Instagram" },
  youtube: { env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], name: "YouTube" },
} as const;
type P = keyof typeof CFG;

async function authorizeUrl(platform: P, state: string, verifier: string) {
  if (platform === "x") {
    const challenge = b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    return "https://x.com/i/oauth2/authorize?" + new URLSearchParams({ response_type: "code", client_id: Deno.env.get("X_CLIENT_ID")!, redirect_uri: CALLBACK, scope: "tweet.read tweet.write users.read media.write offline.access", state, code_challenge: challenge, code_challenge_method: "S256" });
  }
  if (platform === "instagram") {
    return "https://www.instagram.com/oauth/authorize?" + new URLSearchParams({ client_id: Deno.env.get("IG_APP_ID")!, redirect_uri: CALLBACK, response_type: "code", scope: "instagram_business_basic,instagram_business_content_publish", state });
  }
  return "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({ client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, redirect_uri: CALLBACK, response_type: "code", scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly", access_type: "offline", prompt: "consent", state });
}

async function post(url: string, params: Record<string, string>, headers: Record<string, string> = {}) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(params) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description ?? j.error_message ?? j.error?.message ?? j.error ?? `HTTP ${r.status}`);
  return j;
}

async function exchange(platform: P, code: string, verifier: string | null) {
  if (platform === "x") {
    const id = Deno.env.get("X_CLIENT_ID")!, sec = Deno.env.get("X_CLIENT_SECRET");
    const t = await post("https://api.x.com/2/oauth2/token", { grant_type: "authorization_code", code, redirect_uri: CALLBACK, code_verifier: verifier!, client_id: id }, sec ? { Authorization: "Basic " + btoa(`${id}:${sec}`) } : {});
    const me = await fetch("https://api.x.com/2/users/me", { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json());
    return { token: t.access_token, refresh: t.refresh_token ?? null, expires_in: t.expires_in, name: me.data?.username ? `@${me.data.username}` : null, external_id: me.data?.id ?? null, scopes: t.scope };
  }
  if (platform === "instagram") {
    const s = await post("https://api.instagram.com/oauth/access_token", { client_id: Deno.env.get("IG_APP_ID")!, client_secret: Deno.env.get("IG_APP_SECRET")!, grant_type: "authorization_code", redirect_uri: CALLBACK, code });
    const l = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(Deno.env.get("IG_APP_SECRET")!)}&access_token=${encodeURIComponent(s.access_token)}`).then((r) => r.json());
    if (!l.access_token) throw new Error("Uzun süreli Instagram tokenı alınamadı.");
    const me = await fetch(`https://graph.instagram.com/v21.0/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(l.access_token)}`).then((r) => r.json());
    if (me.account_type && !["BUSINESS", "MEDIA_CREATOR", "CREATOR"].includes(me.account_type)) throw new Error("Instagram hesabı İşletme veya İçerik Üreticisi hesabı olmalı. Instagram ayarlarından profesyonel hesaba geçin.");
    return { token: l.access_token, refresh: null, expires_in: l.expires_in, name: me.username ? `@${me.username}` : null, external_id: String(me.user_id ?? s.user_id), scopes: "instagram_business_basic,instagram_business_content_publish", meta: { account_type: me.account_type } };
  }
  const t = await post("https://oauth2.googleapis.com/token", { grant_type: "authorization_code", code, redirect_uri: CALLBACK, client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")! });
  const ch = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json());
  const c = ch.items?.[0];
  if (!c) throw new Error("Bu Google hesabına bağlı bir YouTube kanalı bulunamadı.");
  return { token: t.access_token, refresh: t.refresh_token ?? null, expires_in: t.expires_in, name: c.snippet?.title ?? null, external_id: c.id, scopes: t.scope };
}

const back = (to: string, params: Record<string, string>) => Response.redirect(`${to}/ayarlar?${new URLSearchParams(params)}#hesaplar`, 302);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  // Sağlayıcıdan dönüş
  if (req.method === "GET") {
    const state = url.searchParams.get("state"), code = url.searchParams.get("code"), err = url.searchParams.get("error_description") ?? url.searchParams.get("error");
    if (!state) return new Response("Eksik parametre", { status: 400 });
    const { data: st } = await db.from("oauth_states").delete().eq("state", state).select("*").maybeSingle();
    if (!st) return new Response("Bağlantı isteği bulunamadı veya süresi doldu. Uygulamadan yeniden deneyin.", { status: 400 });
    if (Date.now() - new Date(st.created_at).getTime() > 15 * 60e3) return back(st.return_to, { hata: "Bağlantı isteğinin süresi doldu, yeniden deneyin." });
    if (err || !code) return back(st.return_to, { hata: err ?? "İzin verilmedi." });
    try {
      const r = await exchange(st.platform as P, code, st.code_verifier);
      const { data: acc, error } = await db.from("social_accounts").upsert({ owner_id: st.owner_id, platform: st.platform, account_name: r.name, external_id: r.external_id, status: "connected", scopes: r.scopes ?? null, meta: (r as { meta?: unknown }).meta ?? {}, connected_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "owner_id,platform" }).select().single();
      if (error) throw error;
      await db.from("social_tokens").upsert({ account_id: acc.id, access_token: r.token, refresh_token: r.refresh, expires_at: r.expires_in ? new Date(Date.now() + r.expires_in * 1000).toISOString() : null, updated_at: new Date().toISOString() });
      return back(st.return_to, { baglandi: st.platform });
    } catch (e) {
      return back(st.return_to, { hata: `${CFG[st.platform as P].name} bağlanamadı: ${(e as Error).message}` });
    }
  }

  // Uygulamadan başlatma
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } };
  if (!u?.user) return json({ error: "Oturum gerekli." }, 401);
  const body = await req.json().catch(() => ({}));
  const platform = body.platform as P;
  if (!(platform in CFG)) return json({ error: "Desteklenmeyen platform." }, 400);
  const missing = CFG[platform].env.filter((k) => !Deno.env.get(k));
  if (missing.length) return json({ error: `${CFG[platform].name} için geliştirici uygulaması henüz tanımlı değil.`, missing, callback: CALLBACK }, 503);
  const returnTo = String(body.return_to ?? "").replace(/\/$/, "");
  if (!ALLOWED_RETURN.test(returnTo)) return json({ error: "Geçersiz dönüş adresi." }, 400);
  const state = rand(24), verifier = platform === "x" ? rand(48) : null;
  await db.from("oauth_states").delete().lt("created_at", new Date(Date.now() - 3600e3).toISOString());
  const { error } = await db.from("oauth_states").insert({ state, owner_id: u.user.id, platform, code_verifier: verifier, return_to: returnTo });
  if (error) return json({ error: error.message }, 500);
  return json({ url: await authorizeUrl(platform, state, verifier ?? "") });
});
