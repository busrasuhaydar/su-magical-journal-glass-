// Sergi / açık çağrı duyurusundan yapılandırılmış fırsat kaydı çıkarır.
// Girdi: { text?, url?, pdf_base64? }  ·  Anahtar yalnız sunucuda: ANTHROPIC_API_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MODEL = "claude-sonnet-5-5";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const DATE_KINDS = ["app_open", "deadline", "announcement", "delivery", "install", "opening", "closing"];
const TOOL = {
  name: "save_opportunity",
  description: "Duyurudan çıkarılan fırsat bilgisini kaydeder.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Etkinlik / sergi / çağrı adı, kaynaktaki dilde" },
      kind: { type: "string", enum: ["exhibition", "fair", "open_call", "competition", "residency", "gallery", "program", "event", "grant"] },
      organization: { type: ["string", "null"] }, gallery: { type: ["string", "null"] },
      city: { type: ["string", "null"] }, country: { type: ["string", "null"] },
      fee_amount: { type: ["number", "null"] }, fee_currency: { type: ["string", "null"], enum: ["TRY", "USD", "EUR", "GBP", null] },
      fee_note: { type: ["string", "null"], description: "Ücretle ilgili açıklama (ör. 'ücretsiz', 'eser başına')" },
      requirements: { type: ["string", "null"], description: "Katılım şartları, Türkçe özet" },
      artwork_requirements: { type: ["string", "null"], description: "Eser şartları (boyut, teknik, adet), Türkçe özet" },
      required_documents: { type: "array", items: { type: "string" }, description: "İstenen belgeler, Türkçe kısa adlarla" },
      application_url: { type: ["string", "null"] },
      contact: { type: "object", properties: { name: { type: ["string", "null"] }, email: { type: ["string", "null"] }, phone: { type: ["string", "null"] } } },
      dates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: DATE_KINDS },
            date: { type: "string", description: "YYYY-MM-DD" },
            time: { type: ["string", "null"], description: "Varsa saat ve saat dilimi, kaynaktaki gibi" },
            certainty: { type: "string", enum: ["confirmed", "uncertain", "conflicting"] },
            evidence: { type: "string", description: "Tarihin geçtiği cümlenin birebir alıntısı" },
          },
          required: ["kind", "date", "certainty", "evidence"],
        },
      },
      suggested_tasks: {
        type: "array",
        items: { type: "object", properties: { title: { type: "string" }, days_before_deadline: { type: "integer" }, reason: { type: "string" } }, required: ["title", "days_before_deadline"] },
        description: "Şartlara göre hazırlık görevleri, Türkçe",
      },
      warnings: { type: "array", items: { type: "string" }, description: "Belirsiz, eksik veya çelişkili bilgiler, Türkçe" },
      confidence: { type: "object", additionalProperties: { type: "string", enum: ["high", "medium", "low"] }, description: "Alan adı → güven" },
    },
    required: ["title", "kind", "dates", "required_documents", "warnings", "suggested_tasks"],
  },
};

function htmlToText(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d|tr)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Yalnız POST desteklenir." }, 405);
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Yapay zekâ anahtarı tanımlı değil. Supabase panelinde Edge Function sırlarına ANTHROPIC_API_KEY ekleyin." }, 503);

  let body: { text?: string; url?: string; pdf_base64?: string };
  try { body = await req.json(); } catch { return json({ error: "Geçersiz istek gövdesi." }, 400); }

  let sourceText = (body.text ?? "").trim();
  if (body.url) {
    let u: URL;
    try { u = new URL(body.url); } catch { return json({ error: "Bağlantı geçersiz." }, 400); }
    if (!["http:", "https:"].includes(u.protocol)) return json({ error: "Yalnız http/https bağlantıları desteklenir." }, 400);
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|metadata)/i.test(u.hostname)) return json({ error: "Bu adres desteklenmiyor." }, 400);
    try {
      const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (compatible; JournalBot/1.0)", Accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
      if (!r.ok) return json({ error: `Sayfa açılamadı (HTTP ${r.status}). Metni kopyalayıp yapıştırmayı deneyin.` }, 422);
      const ct = r.headers.get("content-type") ?? "";
      if (ct.includes("application/pdf")) {
        const buf = new Uint8Array(await r.arrayBuffer());
        let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        body.pdf_base64 = btoa(bin);
      } else {
        sourceText = htmlToText(await r.text()).slice(0, 80000);
        if (sourceText.length < 200) return json({ error: "Sayfadan yeterli metin okunamadı (sayfa giriş istiyor veya içerik JavaScript ile yükleniyor olabilir). Metni yapıştırmayı deneyin." }, 422);
      }
    } catch (e) { return json({ error: `Sayfa okunamadı: ${(e as Error).message}` }, 422); }
  }
  if (!sourceText && !body.pdf_base64) return json({ error: "Metin, PDF veya bağlantı gerekli." }, 400);
  if (body.pdf_base64 && body.pdf_base64.length > 30_000_000) return json({ error: "PDF çok büyük (en fazla ~20 MB)." }, 413);

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  const system = `Sen bir sanatçının asistanısın. Sergi, sanat fuarı, açık çağrı, yarışma, rezidans ve galeri başvurusu duyurularını analiz edip yapılandırılmış kayda dönüştürürsün.
Kurallar:
- Yalnız kaynakta yazanı çıkar. Bilgi yoksa null veya boş liste bırak. ASLA tahmin edip uydurma.
- Bugün ${today} (Europe/Istanbul). Yılı yazılmamış tarihleri en makul yıla yerleştir ama certainty="uncertain" yap ve warnings'e yaz.
- Kaynakta birbiriyle çelişen tarihler varsa certainty="conflicting" yap ve iki değeri de warnings'te belirt.
- "Ekim sonu", "bahar" gibi kesin olmayan ifadeler için tarih uydurma; bunları warnings'e yaz. Kesin gün yoksa dates'e ekleme.
- Her tarih için evidence alanına kaynaktaki cümleyi birebir alıntıla.
- Saat dilimi belirtilmişse time alanına yaz (ör. "23:59 CET").
- required_documents: CV, biyografi, sanatçı beyanı, portfolyo, eser görselleri, eser açıklamaları, başvuru formu, kimlik vb. Türkçe kısa adlarla.
- suggested_tasks: Şartlara göre geriye doğru planlanmış hazırlık görevleri (Türkçe). days_before_deadline son başvurudan kaç gün önce bitmesi gerektiğini belirtir. Ücret varsa "Başvuru ücretini öde", eser teslimi varsa "Eser teslimatını planla", sergi açılışı varsa "Sergi tanıtımını hazırla" gibi.
- warnings ve özetler Türkçe olsun; title kaynaktaki dilde kalsın.
- confidence: title, dates, fee, requirements, contact alanları için high/medium/low.`;

  const content: unknown[] = [];
  if (body.pdf_base64) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: body.pdf_base64 } });
  content.push({ type: "text", text: sourceText ? `Duyuru metni:\n\n${sourceText}` : "Ekteki PDF duyurusunu analiz et." });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4096, system, tools: [TOOL], tool_choice: { type: "tool", name: TOOL.name }, messages: [{ role: "user", content }] }),
  });
  if (!r.ok) {
    const t = await r.text();
    const msg = r.status === 401 ? "Yapay zekâ anahtarı geçersiz." : r.status === 429 ? "Yapay zekâ servisi şu an yoğun, biraz sonra tekrar deneyin." : `Yapay zekâ servisi hata verdi (${r.status}).`;
    console.error("anthropic", r.status, t.slice(0, 500));
    return json({ error: msg }, 502);
  }
  const out = await r.json();
  const tool = (out.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  if (!tool) return json({ error: "Duyurudan yapılandırılmış bilgi çıkarılamadı." }, 422);
  const data = tool.input;
  // Güvenlik: geçersiz tarihleri ele, uyar
  data.dates = (data.dates ?? []).filter((d: { date: string; kind: string }) => {
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(d.date) && !isNaN(Date.parse(d.date)) && DATE_KINDS.includes(d.kind);
    if (!ok) (data.warnings ??= []).push(`Okunamayan bir tarih atlandı: ${d.date}`);
    return ok;
  });
  return json({ data, model: MODEL, source_text: sourceText || null });
});
