// Schmart Coach — ingest-ideas (только Exa)
// Находит 2–3 свежие идеи к карточке: выпуски подкастов, исследования, статьи экспертов
// за последние 2 года. Каждая идея: суть, почему работает, что попробовать сегодня, ссылка.
//
// Вызов: POST /functions/v1/ingest-ideas   body: { "card_id": "be-grateful" }
//   Без токена — только если у карточки нет идей свежее 14 дней (защита от расходов).
//   С заголовком x-admin-token: <ADMIN_TOKEN> — всегда.
// Секреты: EXA_API_KEY; (необязательно) ADMIN_TOKEN, EXA_IDEAS_TYPE (по умолчанию deep-lite)

import { createClient } from "npm:@supabase/supabase-js@2";

const EXA_API_KEY = (Deno.env.get("EXA_API_KEY") ?? "").trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, "").trim();
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") ?? "";
const SEARCH_TYPE = Deno.env.get("EXA_IDEAS_TYPE") ?? "deep-lite";
const FRESH_DAYS = 14;

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return keys.default ?? Object.values(keys)[0] ?? "";
  } catch {
    return "";
  }
}
const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Агрегаторы цитат, соцсети и форумы — не источник идей.
const EXCLUDE = [
  "brainyquote.com", "goodreads.com", "azquotes.com", "quotefancy.com", "quotes.net", "wisdomquotes.com",
  "everydaypower.com", "lifehack.org", "keepinspiring.me", "addicted2success.com", "positivityblog.com",
  "pinterest.com", "quora.com", "reddit.com", "linkedin.com", "medium.com", "tiktok.com", "instagram.com", "facebook.com", "x.com", "twitter.com",
];
const TYPES = ["podcast", "research", "article", "video"] as const;
type IdeaType = typeof TYPES[number];

type Card = {
  id: string;
  kind: "person" | "character" | "action";
  person: string | null;
  source_work: string | null;
  quote: string;
  // deno-lint-ignore no-explicit-any
  knowledge: any;
};

function topic(card: Card, byTheme = false) {
  const k = card.knowledge ?? {};
  const angles = (k.talking_points ?? []).map((p: { title: string }) => p.title).slice(0, 4).join(", ");
  if (card.kind === "action") return `${card.quote} ${k.context_short ?? ""}`.trim();
  // запасной вариант: только темы, без текста цитаты (цитата тянет сайты-цитатники)
  if (byTheme && angles) return `personal growth themes: ${angles}`;
  return `the idea behind "${card.quote}"${angles ? ` (angles: ${angles})` : ""}`;
}

function buildQuery(card: Card, byTheme = false) {
  return `Recent podcast episodes, scientific studies and expert articles with practical, evidence-based ideas about ${topic(card, byTheme)}`;
}

function systemPrompt(card: Card, byTheme = false) {
  return `You pick fresh, practical ideas for young people (16–25) to grow themselves, their work, relationships and family.
Topic: ${topic(card, byTheme)}.
Find 3–5 DIFFERENT ideas from the search results. Prefer: a podcast episode page or its transcript/show notes, a peer-reviewed study or university/research news, an article by a recognised expert. Published in the last 2 years.
Each idea must come from ONE result in the search results and use that result's exact URL. Never invent a URL, study, number or quote. Paraphrase; never copy more than 10 words.
Fields: title (max 8 words), idea (2 short sentences), why (why it works, 1 sentence), try_today (one small thing to try today, max 15 words), source_name (show, journal or publication), url (the exact URL of that search result), type (podcast, research, article or video). Write in English.`;
}

// Всего 8 полей (лимит Exa — 10 на всю схему).
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["podcast", "research", "article", "video"] },
          title: { type: "string" },
          idea: { type: "string" },
          why: { type: "string" },
          try_today: { type: "string" },
          source_name: { type: "string" },
          url: { type: "string" },
        },
        required: ["type", "title", "idea", "try_today", "url"],
      },
    },
  },
  required: ["ideas"],
};


const PODCAST_HOSTS = ["podcasts.apple.com", "open.spotify.com", "youtube.com", "youtu.be"];
const isBadLink = (u: string) => /exa\.ai\/library|linkedin\.com/i.test(u);
// Идеи из ранней версии парсера: в try_today попадало имя источника, idea обрезана.
const wc = (t: string | null | undefined) => (t ?? "").trim().split(/\s+/).filter(Boolean).length;
const isMalformed = (x: { idea: string; try_today: string | null }) => wc(x.try_today) < 4 || wc(x.idea) < 8 || !/[.!?]$/.test((x.idea ?? "").trim());
const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9а-я ]/gi, " ").split(/\s+/).filter((w) => w.length > 2));

// Ссылка на библиотеку подкастов Exa → ищем тот же выпуск на Apple Podcasts / Spotify / YouTube.
async function originalPodcastUrl(episodeTitle: string, show: string | null): Promise<string | null> {
  if (!episodeTitle) return null;
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": EXA_API_KEY },
      body: JSON.stringify({ query: `${show ?? ""} ${episodeTitle}`.trim(), type: "auto", numResults: 5, includeDomains: PODCAST_HOSTS }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const want = words(episodeTitle);
    // deno-lint-ignore no-explicit-any
    for (const r of (data?.results ?? []) as any[]) {
      const got = words(String(r?.title ?? ""));
      const overlap = [...want].filter((w) => got.has(w)).length / Math.max(1, want.size);
      if (overlap >= 0.5 && r?.url) return String(r.url);
    }
  } catch { /* оставляем исходную ссылку */ }
  return null;
}

const norm = (u: string) => {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/$/, "")).toLowerCase();
  } catch {
    return u.toLowerCase();
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!EXA_API_KEY) return json({ error: "EXA_API_KEY secret is missing" }, 500);
  const isAdmin = !!ADMIN_TOKEN && req.headers.get("x-admin-token") === ADMIN_TOKEN;

  let cardId = "";
  try { cardId = String((await req.json()).card_id ?? ""); } catch { /* empty */ }
  if (!cardId) return json({ error: "card_id is required" }, 400);

  const { data: card } = await sb.from("cards")
    .select("id, kind, person, source_work, quote, knowledge, status")
    .eq("id", cardId).single();
  if (!card || !["ready", "refresh"].includes(card.status)) return json({ error: "card not found or not ready" }, 404);

  if (!isAdmin) {
    const { data: last } = await sb.from("card_ideas").select("batch_at")
      .eq("card_id", cardId).order("batch_at", { ascending: false }).limit(1).maybeSingle();
    if (last && Date.now() - new Date(last.batch_at).getTime() < FRESH_DAYS * 864e5) {
      // исключение: в текущей подборке есть ссылки на LinkedIn или библиотеку Exa — пересобираем
      const { data: cur } = await sb.from("card_ideas").select("source_url, idea, try_today").eq("card_id", cardId).eq("batch_at", last.batch_at);
      if (!(cur ?? []).some((x: { source_url: string; idea: string; try_today: string | null }) => isBadLink(x.source_url) || isMalformed(x))) {
        return json({ ok: true, skipped: "ideas are still fresh" });
      }
    }
  }
  await sb.from("cards").update({ ideas_requested_at: new Date().toISOString() }).eq("id", cardId);

  try {
    let parsed: Record<string, unknown>[] = [];
    let raw: unknown[] = [];
    // deno-lint-ignore no-explicit-any
    let results = new Map<string, any>();
    let totalCost = 0;
    for (const byTheme of [false, true]) {
      const start = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10);
      const res = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": EXA_API_KEY },
        body: JSON.stringify({
          query: buildQuery(card as Card, byTheme),
          type: SEARCH_TYPE,
          numResults: 12,
          startPublishedDate: start,
          excludeDomains: EXCLUDE,
          systemPrompt: systemPrompt(card as Card, byTheme),
          outputSchema: OUTPUT_SCHEMA,
          contents: { highlights: true },
        }),
      });
      if (!res.ok) throw new Error(`Exa ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();

      let content = data?.output?.content;
      if (typeof content === "string") {
        const s = content.indexOf("{"), e = content.lastIndexOf("}");
        content = s >= 0 && e > s ? JSON.parse(content.slice(s, e + 1)) : {};
      }
      // deno-lint-ignore no-explicit-any
      raw = Array.isArray(content?.ideas) ? content.ideas : [];
      // Ссылка должна быть среди реальных результатов поиска — иначе идею выбрасываем.
      // deno-lint-ignore no-explicit-any
      results = new Map<string, any>(((data?.results ?? []) as any[]).filter((r) => r?.url).map((r) => [norm(r.url), r]));
      // Источники, которые Exa реально прочитал для ответа (grounding), тоже считаются проверенными.
      // deno-lint-ignore no-explicit-any
      const grounding = (data?.output?.grounding ?? []) as any[];
      for (const g of grounding) {
        for (const c of (g?.citations ?? [])) {
          if (c?.url && !results.has(norm(c.url))) results.set(norm(c.url), { url: c.url, title: c.title ?? null, publishedDate: null });
        }
      }
      const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
      parsed = (raw as any[]).map((it) => {
        const url = String(it?.url ?? "").match(/https?:\/\/[^\s)\]]+/)?.[0] ?? "";
        const hit = results.get(norm(url));
        const type = String(it?.type ?? "").toLowerCase();
        if (!hit || !clip(it?.title, 120) || !clip(it?.idea, 500)) return null;
        return {
          card_id: cardId,
          source_type: (TYPES as readonly string[]).includes(type) ? type : "article",
          title: clip(it.title, 120),
          idea: clip(it.idea, 500),
          why: clip(it.why, 300),
          try_today: clip(String(it.try_today ?? "").replace(/^try today:\s*/i, ""), 200),
          source_name: clip(it.source_name, 120),
          source_title: hit.title ?? null,
          source_url: String(hit.url),
          published_date: hit.publishedDate ? String(hit.publishedDate).slice(0, 10) : null,
        };
      }).filter(Boolean) as Record<string, unknown>[];
      totalCost += Number(data?.costDollars?.total ?? 0);
      if (parsed.length) break;
    }

    // До 3 идей, по возможности разных типов, без повторов источника.
    let picked: Record<string, unknown>[] = [];
    const seenUrl = new Set<string>();
    for (const pass of [true, false]) {
      for (const it of parsed) {
        if (picked.length >= 3) break;
        if (seenUrl.has(norm(String(it.source_url)))) continue;
        if (pass && picked.some((x) => x.source_type === it.source_type)) continue;
        picked.push(it);
        seenUrl.add(norm(String(it.source_url)));
      }
    }
    for (const it of picked) {
      if (/exa\.ai\/library/i.test(String(it.source_url))) {
        const orig = await originalPodcastUrl(String(it.source_title ?? ""), (it.source_name as string) ?? null);
        if (orig) it.source_url = orig;
      }
    }
    picked = picked.filter((it) => !isBadLink(String(it.source_url)) && !isMalformed(it as { idea: string; try_today: string | null }));
    if (!picked.length) {
      throw new Error(`no ideas with a verifiable source | lines=${raw.length} | sample=${JSON.stringify(raw[0] ?? null).slice(0, 300)} | urls=${[...results.keys()].slice(0, 6).join(" , ")}`);
    }

    const batch_at = new Date().toISOString();
    const { error } = await sb.from("card_ideas").insert(picked.map((x) => ({ ...x, batch_at })));
    if (error) throw new Error(`save ideas: ${error.message}`);
    return json({ ok: true, card_id: cardId, ideas: picked.map((x) => `${x.source_type}: ${x.title}`), cost: { total: Number(totalCost.toFixed(4)) } });
  } catch (e) {
    return json({ ok: false, card_id: cardId, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
