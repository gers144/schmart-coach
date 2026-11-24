// Schmart Coach — chat
// Чат по карточке в трёх режимах:
//   quote  — разобрать цитату и применить к своему дню
//   point  — обсудить конкретный пункт (talking_points[i])
//   person — узнать больше фактов о человеке/персонаже
//   idea   — разобрать свежую идею к карточке (подкаст/исследование/статья из card_ideas)
//
// 1) Начать чат:   POST { "card_id": "jobs", "mode": "point", "point_id": "p2" }
//    → { chat_id, reply, chips }
// 2) Сообщение:    POST { "chat_id": "...", "message": "текст" }
//    → { chat_id, reply, action }   (action = действие на сегодня, если коуч его зафиксировал)
//
// Фронт вызывает через supabase.functions.invoke("chat", { body }).
// Движок: Exa /answer (без Claude). Секреты: EXA_API_KEY; (необязательно) EXA_CHAT_MODEL (exa | exa-fast | exa-pro).

import { createClient } from "npm:@supabase/supabase-js@2";

const EXA_API_KEY = (Deno.env.get("EXA_API_KEY") ?? "").trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, "").trim();
const EXA_CHAT_MODEL = Deno.env.get("EXA_CHAT_MODEL") ?? "exa";
const MAX_MESSAGE_CHARS = 1000;
const MAX_HISTORY = 20;
const MAX_USER_TURNS = 30;

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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

type Mode = "quote" | "point" | "person" | "idea";
type Idea = { id: string; title: string; idea: string; why: string | null; try_today: string | null; source_type: string; source_name: string | null; source_title: string | null; source_url: string; published_date: string | null };
const IDEA_FIELDS = "id, title, idea, why, try_today, source_type, source_name, source_title, source_url, published_date";
const FUNCTIONS_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
type Point = { id: string; title: string; question: string; angle?: string };
type Card = {
  id: string;
  kind: "person" | "character" | "action";
  person: string | null;
  source_work: string | null;
  quote: string;
  // deno-lint-ignore no-explicit-any
  knowledge: any;
};

const BASE_RULES = `You are "Schmart Coach", an AI coach inside the Schmart motivational cards app (Estonia).
The user scanned a physical card and is chatting about it. Audience: young people 16–25.
RULES
- Talk ABOUT the person or character on the card, never AS them. Never write "I am {person}" and never role-play them, even if asked; offer to explain how they thought instead.
- Facts about the person/character/research come ONLY from KNOWLEDGE below. If something is not there, say honestly that you don't have verified information on it. Never invent quotes, dates or numbers.
- Check KNOWLEDGE.attribution.status: if it is "unknown" or "disputed", say the line is "often attributed to" the person and never claim they definitely said it; if "fictional", talk about the character and the film/book.
- Do NOT write source references like (S3) or (source: ...) in the reply; the app shows sources separately.
- Style: energetic, warm, direct; in Russian use "ты". 2–5 sentences per reply, at most one question per reply. No moralising, no generic advice like "work harder". Plain text, **bold** allowed sparingly.
- Reply in the language the user writes in (English, Russian, Estonian…). The app UI is in English.
- Rely on KNOWLEDGE first; use web results only to add a clearly reliable detail, never gossip.
- Output: "reply" = your next message to the user. "action" = the ONE concrete action for today (what, when, how much), filled ONLY when the user has just agreed to it or proposed it themselves; while you are still proposing or asking, "action" must be an empty string.
- Never promise to remind the user yourself and never offer reminders; you cannot send messages later. If they want a reminder, tell them to tap "Remind me tonight" below the chat.
- Respect KNOWLEDGE.avoid. If the user pushes on gossip, scandals or private life, briefly steer back to the idea of the card.
- If the user shows real distress or risk of harm, stop coaching, respond with care, and suggest talking to a trusted person or a professional. In Estonia: emergency 112; emotional support 116 123 (daily 10–24, Estonian/Russian/English); crisis line 116 006 (24/7); under 18: Lasteabi 116 111 (24/7).`;

// Кризисные сообщения не отдаём модели — сразу безопасный ответ с номерами.
const CRISIS_RE = /(suicid|kill myself|end my life|want to die|don'?t want to (live|wake up)|self[- ]?harm|hurt myself|самоуб|суицид|покончить с собой|не хочу жить|хочу умереть|убить себя|порезать себя|enesetap|tahan surra|ei taha elada)/i;
function crisisReply(msg: string) {
  if (/[а-яё]/i.test(msg)) {
    return "Мне очень жаль, что тебе сейчас так тяжело. Ты не должен справляться с этим в одиночку. Пожалуйста, поговори прямо сейчас с кем-то, кому доверяешь, или позвони: 116 123 (поддержка, каждый день 10–24, есть русский), 116 006 (круглосуточно), до 18 лет — 116 111. Если есть непосредственная опасность — звони 112.";
  }
  if (/[õäöü]/i.test(msg)) {
    return "Mul on väga kahju, et sul on praegu nii raske. Sa ei pea sellega üksi hakkama saama. Palun räägi kohe kellegagi, keda usaldad, või helista: 116 123 (emotsionaalne tugi, iga päev 10–24), 116 006 (ööpäevaringselt), alla 18 — Lasteabi 116 111. Kui oled otseses ohus, helista 112.";
  }
  return "I'm really sorry you're feeling this way, and you don't have to handle it alone. Please talk to someone you trust right now, or call 116 123 (emotional support, daily 10–24, English/Estonian/Russian) or 116 006 (24/7); under 18: 116 111. If you are in immediate danger, call 112.";
}

// Exa иногда кладёт в поле action обрывки JSON — чистим.
function cleanAction(raw: string, reply: string): string {
  let a = (raw ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!a || a.length < 8) return "";
  if (/[{}\[\]]|citations|confidence|"reply"|reply:/i.test(a)) return "";
  if (!/[a-zа-яёõäöü]{3}/i.test(a)) return "";
  if (reply.trim().endsWith("?")) return ""; // коуч ещё предлагает, а не фиксирует
  return a.slice(0, 300);
}
function cleanReply(r: string): string {
  return (r ?? "")
    .replace(/\s*\((?:source|sources|источник)?:?\s*S\d+(?:\s*,\s*S?\d+)*\)/gi, "")
    .replace(/\s*\[S\d+(?:\s*,\s*S?\d+)*\]/g, "")
    .trim();
}

// Защита от накрутки (каждый ответ стоит денег в Exa).
// Лимиты на IP рассчитаны на класс/воркшоп в одной Wi-Fi сети.
const LIMITS = { chatsPer10m: 60, msgsPer10m: 150, msgsPerDay: 3000 };
async function ipHash(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("schmart:" + ip));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const since = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

function modeRules(mode: Mode, card: Card, point?: Point, idea?: Idea) {
  const who = card.kind === "action" ? "this daily action" : card.person;
  if (mode === "idea") {
    return `MODE: FRESH IDEA. The user tapped a fresh idea linked to this card, found in a ${idea?.source_type} (${idea?.source_name ?? idea?.source_title ?? "source"}).
IDEA (verified summary of that one source, JSON): ${JSON.stringify(idea ?? {})}
Unpack this idea: what it says, why it works (only what IDEA.why and the source support), how it connects to the card. You may name the source (show, journal or publication) but never invent details, numbers or quotes beyond IDEA. If the user asks for more than IDEA contains, say the full details are in the source and they can open it in the app.
Then help them turn it into ONE small action for today, starting from IDEA.try_today.`;
  }
  if (mode === "quote") {
    return `MODE: QUOTE. Help the user understand the card and apply it to TODAY.
Flow across the conversation: question → short real story/context → link to the user's life → ONE concrete action for today (what, when, how much). After the action is set, wrap up warmly and invite them to come back tomorrow for a new card.`;
  }
  if (mode === "point") {
    return `MODE: TALKING POINT "${point?.title}". Stay focused on this angle: ${point?.angle ?? point?.question}.
Use the relevant facts and stories, ask about the user's experience, and when it fits, end with one small concrete action.`;
  }
  return `MODE: LEARN ABOUT ${who}. The user wants to learn more facts and stories.
Answer questions from KNOWLEDGE facts and stories, tell them vividly but accurately. Then briefly link the fact to the user's own life with one question. If they ask something not covered, say so and suggest what you can tell instead.`;
}

function openerFor(mode: Mode, card: Card, point?: Point, idea?: Idea): { reply: string; chips: string[] } {
  const k = card.knowledge ?? {};
  if (mode === "idea" && idea) {
    const from = idea.source_name ? ` (from ${idea.source_name})` : "";
    return {
      reply: `**${idea.title}**${from}. ${idea.idea} Want to dig into why it works, or turn it into something you try today?`,
      chips: ["Why does it work?", "How do I try it today?", "How is it linked to my card?"],
    };
  }
  if (mode === "quote") return { reply: k.opener ?? "What in this quote speaks to you today?", chips: k.chips ?? [] };
  if (mode === "point") return { reply: point?.question ?? "What would you like to talk about?", chips: [] };
  const topics = (k.stories ?? []).slice(0, 3).map((s: { title: string }) => s.title);
  const reply = card.kind === "action"
    ? "Want to know what the research behind this card actually says? Ask me anything — I'll stick to verified sources."
    : `What would you like to know about ${card.person}? I can share real stories and facts, with sources.`;
  return { reply, chips: topics };
}

const REPLY_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "the coach's next message to the user, 2–5 sentences" },
    action: { type: "string", description: "the agreed action for today, or an empty string" },
  },
  required: ["reply", "action"],
};

async function callExa(system: string, messages: { role: "user" | "assistant"; content: string }[]) {
  // Exa /answer не хранит историю, поэтому передаём весь диалог в одном запросе.
  const transcript = messages.map((m) => `${m.role === "user" ? "USER" : "COACH"}: ${m.content}`).join("\n\n");
  const res = await fetch("https://api.exa.ai/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": EXA_API_KEY },
    body: JSON.stringify({
      query: `Conversation so far:\n\n${transcript}\n\nWrite the coach's next reply to the USER's last message.`,
      model: EXA_CHAT_MODEL,
      systemPrompt: system,
      outputSchema: REPLY_SCHEMA,
    }),
  });
  if (!res.ok) throw new Error(`Exa ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const a = data.answer;
  if (a && typeof a === "object") return { reply: String(a.reply ?? "").trim(), action: String(a.action ?? "").trim() };
  // запасной вариант: строковый ответ со строкой "ACTION: ..."
  const raw = String(a ?? "");
  const m = raw.match(/^\s*ACTION:\s*(.+)$/m);
  return { reply: raw.replace(/^\s*ACTION:.*$/m, "").trim(), action: m ? m[1].trim() : "" };
}

async function loadCard(cardId: string) {
  const { data } = await sb.from("cards")
    .select("id, kind, person, source_work, quote, knowledge, status")
    .eq("id", cardId).single();
  if (!data || !["ready", "refresh"].includes(data.status)) return null;
  return data as Card;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (!body.op && !EXA_API_KEY) return json({ error: "EXA_API_KEY secret is missing" }, 500);

  try {
    // ---------- 0) публичные данные для фронта (без ключей) ----------
    if (body.op === "cards") {
      const { data, error } = await sb.from("cards_public")
        .select("id, theme, kind, person, source_work, quote, color, sort_order, context_short, attribution, talking_points, chips")
        .order("sort_order");
      if (error) throw new Error(error.message);
      return json({ cards: data ?? [] });
    }
    if (body.op === "card") {
      const { data, error } = await sb.from("cards_public")
        .select("id, theme, kind, person, source_work, quote, color, sort_order, context_short, attribution, talking_points, chips")
        .eq("id", String(body.card_id ?? "")).maybeSingle();
      if (error) throw new Error(error.message);
      return json({ card: data ?? null });
    }
    if (body.op === "sources") {
      const { data, error } = await sb.from("sources").select("title, url")
        .eq("card_id", String(body.card_id ?? "")).limit(20);
      if (error) throw new Error(error.message);
      return json({ sources: data ?? [] });
    }
    if (body.op === "ideas") {
      // Закреплённая идея (та, что в аудио) + последняя пачка без дублей. Автообновления нет.
      const cardId = String(body.card_id ?? "");
      const { data: pin } = await sb.from("card_ideas").select(IDEA_FIELDS)
        .eq("card_id", cardId).eq("pinned", true).limit(1).maybeSingle();
      const { data: last } = await sb.from("card_ideas").select("batch_at")
        .eq("card_id", cardId).order("batch_at", { ascending: false }).limit(1).maybeSingle();
      let ideas: Idea[] = [];
      if (last) {
        const { data } = await sb.from("card_ideas").select(IDEA_FIELDS).eq("card_id", cardId).eq("batch_at", last.batch_at);
        ideas = ((data ?? []) as Idea[]).filter((x) => x.id !== pin?.id && x.source_url !== pin?.source_url);
      }
      return json({ pinned: pin ?? null, ideas });
    }
    if (body.op === "more_ideas") {
      // Кнопка «More fresh ideas». seen = id идей, которые пользователь уже видел.
      const cardId = String(body.card_id ?? "");
      const seen = new Set<string>(Array.isArray(body.seen) ? body.seen.map(String) : []);
      const all = async () => {
        const { data } = await sb.from("card_ideas").select(IDEA_FIELDS + ", batch_at, pinned")
          .eq("card_id", cardId).order("batch_at", { ascending: false }).limit(60);
        return (data ?? []) as (Idea & { batch_at: string; pinned: boolean })[];
      };
      const unseen = (rows: (Idea & { batch_at: string; pinned: boolean })[]) => {
        const seenUrls = new Set(rows.filter((r) => seen.has(r.id) || r.pinned).map((r) => r.source_url));
        const out: Idea[] = [];
        for (const r of rows) {
          if (r.pinned || seen.has(r.id) || seenUrls.has(r.source_url)) continue;
          seenUrls.add(r.source_url);
          const { batch_at: _b, pinned: _p, ...idea } = r;
          out.push(idea as Idea);
        }
        return out.slice(0, 3);
      };
      let rows = await all();
      let fresh = unseen(rows);
      if (fresh.length) return json({ ideas: fresh, status: "ok" });
      // Ничего нового в базе — ищем через Exa, но не чаще раза в 7 дней и раза в час на карточку.
      const newest = rows[0]?.batch_at ? new Date(rows[0].batch_at).getTime() : 0;
      const { data: c } = await sb.from("cards").select("ideas_requested_at, status").eq("id", cardId).maybeSingle();
      const recent = c?.ideas_requested_at && Date.now() - new Date(c.ideas_requested_at).getTime() < 3600e3;
      if (!c || !["ready", "refresh"].includes(c.status) || recent || Date.now() - newest < 7 * 864e5) {
        return json({ ideas: [], status: "none", message: "No new ideas yet. Check back in a few days." });
      }
      await sb.from("cards").update({ ideas_requested_at: new Date().toISOString() }).eq("id", cardId);
      const r = await fetch(`${FUNCTIONS_URL}/ingest-ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": Deno.env.get("ADMIN_TOKEN") ?? "" },
        body: JSON.stringify({ card_id: cardId }),
      }).catch((e) => { console.error("ingest-ideas", e); return null; });
      if (r) await r.text().catch(() => "");
      rows = await all();
      fresh = unseen(rows);
      return json(fresh.length ? { ideas: fresh, status: "ok" }
        : { ideas: [], status: "none", message: "No new ideas yet. Check back in a few days." });
    }
    if (body.op === "waitlist") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return json({ error: "invalid email" }, 400);
      const product = String(body.product ?? "general").slice(0, 40);
      const { error } = await sb.from("waitlist").insert({ email, product });
      if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
      return json({ ok: true });
    }

    // ---------- 1) старт чата ----------
    if (!body.chat_id) {
      const mode: Mode = ["quote", "point", "person", "idea"].includes(body.mode) ? body.mode : "quote";
      const card = await loadCard(String(body.card_id ?? ""));
      if (!card) return json({ error: "card not found or not ready" }, 404);

      let point: Point | undefined;
      if (mode === "point") {
        point = (card.knowledge?.talking_points ?? []).find((p: Point) => p.id === body.point_id);
        if (!point) return json({ error: "point_id not found for this card" }, 400);
      }
      let idea: Idea | undefined;
      if (mode === "idea") {
        const { data } = await sb.from("card_ideas").select(IDEA_FIELDS)
          .eq("id", String(body.idea_id ?? "")).eq("card_id", card.id).maybeSingle();
        if (!data) return json({ error: "idea_id not found for this card" }, 400);
        idea = data as Idea;
      }

      const ip = await ipHash(req);
      const { count: recentChats } = await sb.from("chats").select("id", { count: "exact", head: true })
        .eq("client_ip", ip).gte("created_at", since(10));
      if ((recentChats ?? 0) >= LIMITS.chatsPer10m) {
        return json({ error: "Too many new chats. Take a short break and try again in a few minutes." }, 429);
      }
      const { data: chat, error } = await sb.from("chats")
        .insert({ card_id: card.id, mode, point_id: point?.id ?? idea?.id ?? null, client_ip: ip })
        .select("id").single();
      if (error || !chat) throw new Error(`create chat: ${error?.message}`);

      const opener = openerFor(mode, card, point, idea);
      await sb.from("messages").insert({ chat_id: chat.id, role: "assistant", content: opener.reply });
      return json({ chat_id: chat.id, reply: opener.reply, chips: opener.chips });
    }

    // ---------- 2) сообщение ----------
    const message = String(body.message ?? "").trim();
    if (!message) return json({ error: "message is required" }, 400);
    if (message.length > MAX_MESSAGE_CHARS) return json({ error: `message is longer than ${MAX_MESSAGE_CHARS} chars` }, 400);

    const { data: chat } = await sb.from("chats").select("id, card_id, mode, point_id, client_ip").eq("id", body.chat_id).single();
    if (!chat) return json({ error: "chat not found" }, 404);

    const ip = await ipHash(req);
    const { data: ipChats } = await sb.from("chats").select("id").eq("client_ip", ip).gte("created_at", since(24 * 60)).limit(200);
    const ids = (ipChats ?? []).map((c: { id: string }) => c.id);
    if (ids.length) {
      const { count: recentMsgs } = await sb.from("messages").select("id", { count: "exact", head: true })
        .in("chat_id", ids).eq("role", "user").gte("created_at", since(10));
      if ((recentMsgs ?? 0) >= LIMITS.msgsPer10m) {
        return json({ error: "You're typing faster than the coach can think. Try again in a few minutes." }, 429);
      }
    }
    const { count: dayMsgs } = await sb.from("messages").select("id", { count: "exact", head: true })
      .eq("role", "user").gte("created_at", since(24 * 60));
    if ((dayMsgs ?? 0) >= LIMITS.msgsPerDay) {
      return json({ error: "The coach is resting — daily limit reached. Come back tomorrow!" }, 429);
    }

    const card = await loadCard(chat.card_id);
    if (!card) return json({ error: "card not found or not ready" }, 404);

    const { count } = await sb.from("messages").select("id", { count: "exact", head: true })
      .eq("chat_id", chat.id).eq("role", "user");
    if ((count ?? 0) >= MAX_USER_TURNS) {
      return json({ chat_id: chat.id, reply: "That’s enough for this card today — come back tomorrow for a new one.", limit: true });
    }

    await sb.from("messages").insert({ chat_id: chat.id, role: "user", content: message });

    if (CRISIS_RE.test(message)) {
      const reply = crisisReply(message);
      await sb.from("messages").insert({ chat_id: chat.id, role: "assistant", content: reply });
      return json({ chat_id: chat.id, reply, action: null, crisis: true });
    }

    const { data: rows } = await sb.from("messages").select("role, content")
      .eq("chat_id", chat.id).order("id", { ascending: false }).limit(MAX_HISTORY);
    const history = (rows ?? []).reverse() as { role: "user" | "assistant"; content: string }[];
    // opener уже есть в system — начинаем историю с первого сообщения пользователя
    while (history.length && history[0].role === "assistant") history.shift();

    const point = (card.knowledge?.talking_points ?? []).find((p: Point) => p.id === chat.point_id);
    let idea: Idea | undefined;
    if (chat.mode === "idea" && chat.point_id) {
      const { data } = await sb.from("card_ideas").select(IDEA_FIELDS).eq("id", chat.point_id).maybeSingle();
      idea = (data ?? undefined) as Idea | undefined;
    }
    const opener = openerFor(chat.mode as Mode, card, point, idea).reply;
    const knowledge = { ...card.knowledge };
    delete knowledge.built_with;
    delete knowledge.grounding; // служебные поля Exa не нужны коучу и раздувают запрос

    const system = `${BASE_RULES}

CARD: ${card.kind === "action" ? "daily action card" : card.kind === "character" ? `fictional character ${card.person} from ${card.source_work}` : `real person ${card.person}`}
TEXT ON CARD: "${card.quote}"${["unknown", "disputed"].includes(card.knowledge?.attribution?.status) ? `\nATTRIBUTION: NOT CONFIRMED (${card.knowledge.attribution.status}). Always call it "a line often attributed to ${card.person}" or "this card's quote". Never write "${card.person} said", "${card.person}'s message" or "${card.person} believes" about this quote.` : ""}

${modeRules(chat.mode as Mode, card, point, idea)}

The conversation started with your scripted message: "${opener}"

KNOWLEDGE (verified, JSON):
${JSON.stringify(knowledge)}`;

    const out = await callExa(system, history);
    const reply = cleanReply(out.reply) || "Sorry, I lost my train of thought — could you say that again?";
    const action = cleanAction(out.action, reply) || null;
    await sb.from("messages").insert({ chat_id: chat.id, role: "assistant", content: reply });
    if (action) await sb.from("chats").update({ action }).eq("id", chat.id);
    return json({ chat_id: chat.id, reply, action });
  } catch (e) {
    console.error(e);
    return json({ error: "Could not get a reply. Please try again." }, 500);
  }
});
