// Schmart Coach — ingest-card (только Exa, без Claude)
// Один запрос к Exa /search: Exa ищет источники и сам собирает «пакет знаний»
// по нашей JSON-схеме (outputSchema). Результат сохраняется в Supabase.
//
// Вызов:
//   POST /functions/v1/ingest-card   body: { "card_id": "steve-jobs" }
//   Без токена — только для карточек в статусе draft/error/refresh.
//   refresh = безопасный пересбор: карточка остаётся на сайте, при ошибке старые данные сохраняются.
//   Повторный сбор готовой карточки — с заголовком x-admin-token: <ADMIN_TOKEN>.
//
// Секреты (Supabase → Edge Functions → Secrets):
//   EXA_API_KEY; (необязательно) ADMIN_TOKEN, EXA_INGEST_TYPE (по умолчанию deep-lite)

import { createClient } from "npm:@supabase/supabase-js@2";

const EXA_API_KEY = (Deno.env.get("EXA_API_KEY") ?? "").trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, "").trim();
const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN") ?? "";
const SEARCH_TYPE = Deno.env.get("EXA_INGEST_TYPE") ?? "deep-lite";

// Серверный ключ: старый service_role или новый secret key (SUPABASE_SECRET_KEYS)
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

type Card = {
  id: string;
  theme: string;
  kind: "person" | "character" | "action";
  person: string | null;
  source_work: string | null;
  quote: string;
  exa_queries: string[];
  notes: string | null;
  status: string;
};

// Схема пакета знаний. Exa разрешает максимум 10 полей во всей схеме,
// поэтому поля плоские, а нашу структуру собираем из них в toKnowledge().
const str = { type: "string" };
const strList = { type: "array", items: { type: "string" } };
const KNOWLEDGE_SCHEMA = {
  type: "object",
  properties: {
    attribution_status: { type: "string", enum: ["verified", "likely", "disputed", "unknown", "fictional", "not_applicable"] },
    attribution_note: str,
    context_short: str,
    facts: strList,           // "fact text — https://source"
    stories: strList,         // "Title :: 3–4 sentence summary :: https://source"
    talking_points: strList,  // "Button title :: coach's opening question"
    opener: str,
    chips: strList,
    avoid: strList,
  },
  required: ["attribution_status", "attribution_note", "context_short", "facts", "stories", "talking_points", "opener", "chips"],
};

const URL_RE = /(https?:\/\/[^\s)\]|,;]+)/;
// Сайты-агрегаторы цитат: не доказывают авторство, исключаем из поиска.
const QUOTE_SITES = [
  "brainyquote.com", "goodreads.com", "azquotes.com", "quotefancy.com", "quotes.net", "quotemaster.org",
  "wisdomquotes.com", "quotlr.com", "pinterest.com", "musequotes.com", "quotedtruth.com", "quotepark.com",
  "inspiringquotes.us", "quotesgram.com", "everydaypower.com", "lifehack.org", "keepinspiring.me",
  "quotecatalog.com", "allauthor.com", "quotabulary.com",
  "movemequotes.com", "graciousquotes.com", "whoquoteswhat.com", "succeedfeed.com", "addicted2success.com",
  "thequotes.in", "quotes.lifehack.org", "positivityblog.com", "ranker.com", "quora.com", "reddit.com", "tiktok.com", "instagram.com",
];
// deno-lint-ignore no-explicit-any
function toKnowledge(raw: any) {
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  const facts = list(raw.facts).map((f) => {
    const url = f.match(URL_RE)?.[1] ?? null;
    const text = f.replace(URL_RE, "").replace(/^[\s:—–-]+|[\s:—–-]+$/g, "").trim();
    return { text, source_url: url };
  }).filter((f) => f.text.length > 10);
  const stories = list(raw.stories).map((st) => {
    const parts = st.split("::").map((x) => x.trim());
    const url = st.match(URL_RE)?.[1] ?? null;
    return {
      title: parts[0] ?? "",
      summary: (parts[1] ?? parts[0] ?? "").replace(URL_RE, "").trim(),
      source_url: url,
    };
  });
  const talking_points = list(raw.talking_points).slice(0, 6).map((tp, i) => {
    const parts = tp.split(/\s*(?:::|\||\s[—–]\s)\s*/).map((x) => x.trim()).filter(Boolean);
    let title = parts[0] ?? tp;
    let question = parts[1] ?? "";
    if (!question && title.endsWith("?")) { question = title; title = title.replace(/\?$/, "").split(/\s+/).slice(0, 5).join(" "); }
    if (!question) question = `Let's talk about "${title}". How does it show up in your life right now?`;
    return { id: `p${i + 1}`, title, question };
  });
  return {
    attribution: { status: raw.attribution_status ?? "unknown", note: raw.attribution_note ?? "" },
    context_short: raw.context_short ?? "",
    facts,
    stories,
    talking_points,
    opener: raw.opener ?? "",
    chips: list(raw.chips).slice(0, 3),
    avoid: list(raw.avoid),
  };
}

function subject(card: Card) {
  if (card.kind === "action") return `the daily action card "${card.quote}" (research behind the claim)`;
  if (card.kind === "character") return `the fictional character ${card.person} from ${card.source_work ?? "a film"}`;
  return `${card.person}`;
}

function buildQuery(card: Card) {
  if (card.kind === "action") {
    return `Scientific research and evidence about: ${card.quote}`;
  }
  return `Who really said "${card.quote}"? Source of the quote, and key life stories, interviews and values of ${subject(card)}`;
}

function buildSystemPrompt(card: Card) {
  return `You build a verified "knowledge pack" for an AI coach in the Schmart motivational cards app (audience 16–25).
The card shows: "${card.quote}" — about ${subject(card)}.
Editor notes (leads to verify, NOT facts): ${card.notes ?? "none"}.
Research hints: ${card.exa_queries.join(" | ")}.
Rules:
- Use only what the sources support; put the source URL on every fact and story. If sources disagree or are weak, say so in attribution.note.
- attribution_status: "verified" ONLY if a primary or reputable source (the speech/interview/book itself, an official site, a major news outlet, Quote Investigator, Wikiquote's sourced section) shows this person said it; "likely" if only secondary sources agree; "disputed" if it is also credited to someone else or Quote Investigator/Wikiquote marks it misattributed; "unknown" if no reliable origin; "fictional" for film/book characters (name the film/book and year); "not_applicable" for action cards. Quote-collection websites never count as proof.
- Prefer primary sources (speeches, interviews, books, official sites, studies) over quote websites.
- Paraphrase; never copy more than 12 words from a source. No gossip, court cases, scandals or private-life details.
- facts: 8–12 items, each written as "https://full-source-url :: fact in one sentence". EVERY fact MUST start with the full URL of the page that supports it.
- stories: 3–5 items, each "Short title :: 3–4 sentence summary :: https://full-source-url".
- talking_points: 4–6 items, each "2–5 word button title :: the coach's opening question for this angle".
- opener: 2–3 sentences of context + 1 question. chips: 3 short quick replies. avoid: topics to stay away from.
- Write everything in English.`;
}

async function exaSearch(card: Card) {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": EXA_API_KEY },
    body: JSON.stringify({
      query: buildQuery(card),
      type: SEARCH_TYPE,
      numResults: 10,
      systemPrompt: buildSystemPrompt(card),
      outputSchema: KNOWLEDGE_SCHEMA,
      contents: { highlights: true },
      excludeDomains: QUOTE_SITES,
    }),
  });
  if (!res.ok) throw new Error(`Exa ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return await res.json();
}

function parseContent(content: unknown) {
  if (content && typeof content === "object") return content as Record<string, unknown>;
  if (typeof content === "string") {
    const s = content.indexOf("{"), e = content.lastIndexOf("}");
    if (s >= 0 && e > s) return JSON.parse(content.slice(s, e + 1));
  }
  throw new Error("Exa returned no structured output");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const isAdmin = !!ADMIN_TOKEN && req.headers.get("x-admin-token") === ADMIN_TOKEN;
  if (!EXA_API_KEY) return json({ error: "EXA_API_KEY secret is missing" }, 500);

  let cardId = "";
  try {
    cardId = String((await req.json()).card_id ?? "");
  } catch { /* empty body */ }
  if (!cardId) return json({ error: "card_id is required" }, 400);

  const { data: card, error } = await sb.from("cards")
    .select("id, theme, kind, person, source_work, quote, exa_queries, notes, status")
    .eq("id", cardId).single<Card>();
  if (error || !card) return json({ error: `card '${cardId}' not found` }, 404);
  const isRefresh = card.status === "refresh" || (isAdmin && card.status === "ready");
  if (!isAdmin && !["draft", "error", "refresh"].includes(card.status)) {
    return json({ error: "card already processed; re-ingest needs x-admin-token" }, 401);
  }

  if (!isRefresh) {
    await sb.from("cards").update({ status: "ingesting", error: null, updated_at: new Date().toISOString() })
      .eq("id", card.id);
  }

  try {
    const data = await exaSearch(card);
    // deno-lint-ignore no-explicit-any
    const knowledge: any = toKnowledge(parseContent(data?.output?.content));
    if (knowledge.talking_points.length < 2 || !knowledge.opener) throw new Error("Exa returned an incomplete knowledge pack");

    // Источники: результаты поиска (с выдержками)
    // deno-lint-ignore no-explicit-any
    const results = (data?.results ?? []) as any[];
    const sources = results.filter((r) => r?.url).map((r) => ({
      card_id: card.id,
      url: String(r.url),
      title: r.title ?? null,
      author: r.author ?? null,
      published_date: r.publishedDate ?? null,
      text: Array.isArray(r.highlights) ? r.highlights.join("\n\n") : (r.text ?? null),
      query: buildQuery(card),
    }));
    const unique = [...new Map(sources.map((s) => [s.url, s])).values()];
    await sb.from("sources").delete().eq("card_id", card.id);
    if (unique.length) {
      const { error: srcErr } = await sb.from("sources").insert(unique);
      if (srcErr) throw new Error(`save sources: ${srcErr.message}`);
    }

    knowledge.sources = unique.map((s, i) => ({ ref: `S${i + 1}`, title: s.title, url: s.url }));
    knowledge.grounding = data?.output?.grounding ?? null;
    knowledge.built_with = { engine: `exa/${SEARCH_TYPE}`, at: new Date().toISOString(), cost: data?.costDollars ?? null };

    const { error: upErr } = await sb.from("cards").update({
      knowledge,
      status: "ready",
      error: null,
      ingested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", card.id);
    if (upErr) throw new Error(`save knowledge: ${upErr.message}`);

    return json({
      ok: true,
      card_id: card.id,
      sources: unique.length,
      attribution: knowledge.attribution,
      talking_points: knowledge.talking_points.map((p: { title: string }) => p.title),
      cost: data?.costDollars ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // При пересборе готовая карточка остаётся на сайте со старыми данными.
    await sb.from("cards").update({ status: isRefresh ? "ready" : "error", error: message, updated_at: new Date().toISOString() })
      .eq("id", card.id);
    return json({ ok: false, card_id: card.id, error: message }, 500);
  }
});
