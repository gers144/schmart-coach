# Schmart Coach — talk to your card

![Schmart Coach](assets/og-image-1200x630.png)

**Live demo:** https://schmartcoach.figma.site/ · try a card: https://schmartcoach.figma.site/?card=steve-jobs&view=card

Junction 2026 · Track: **The Internet Butler / Your Personal Assistant (Exa)**

## The problem
**Schmart Cards 2.0** is a printed deck of 52 motivational cards (quotes from legends, actors, singers, movie characters and daily "Today is day to…" actions) that I use with ~35 students in my sales and leadership organisation in Estonia. A card inspires for 10 seconds and then goes in a drawer. Nobody knows the real story behind the quote, a lot of internet quotes are misattributed, and the idea is rarely turned into action.

## What it does
Every printed card has its own QR code. Scanning it opens a personal AI coach for that exact card:

- **Unpack the quote**: one question, the real story, a link to your day, and **one concrete action for today** (saved with a Done checkbox, history and streaks).
- **Discuss a topic**: 4–6 talking points generated per card.
- **Learn more**: facts and stories about the person, the film, or the research behind a daily action.
- **Fresh ideas**: 1–3 recent podcast episodes, studies or expert articles on the card's theme (last 2 years), each with "why it works", "try today" and a link. Tap one and the coach unpacks it with you.
- **Card of the day** on the home screen, so the app also works without a physical card.
- The coach talks **about** the person, never **as** them. No fake celebrity chatbots.

## How Exa does the digging
| Step | Exa endpoint | What happens |
|---|---|---|
| Research (once per card) | `/search` · `type: deep-lite` · `outputSchema` · `excludeDomains` | Finds sources and returns a structured knowledge pack: attribution status, context, 8–12 facts with source URLs, stories, talking points, opener. Quote-collection sites are excluded so attribution is decided on primary sources. |
| Fresh ideas (every 14 days per card) | `/search` · `deep-lite` · `startPublishedDate` (2 years) · `outputSchema` | Finds podcast episodes (incl. Exa's podcast library), studies and expert articles on the card's theme. An idea is kept only if its URL is one of the real search results or grounding citations; if the quote-based search finds nothing, a second search runs on the card's themes. |
| Coaching (every message) | `/answer` · `outputSchema {reply, action}` | Reply grounded in the card's knowledge pack (or the chosen idea) plus live web search. |

Results across the deck: **367 facts, all with a source URL**, ~10 sources per card. Attribution: 17 verified · 2 likely · 4 disputed · 12 origin not confirmed · 7 fictional characters · 10 research-based actions. When the origin is not confirmed, the app says so and the coach says "a line often attributed to…".

Fresh ideas: all 52 cards covered, mostly 3 ideas each from different source types.

Cost: ~$0.012 to research one card, ~$0.014 per fresh-ideas refresh, ~$0.005 per chat message. Replies in 2–4 s. Researching the whole deck plus its ideas cost under $2.

## Safety
- Crisis messages (EN/RU/ET) skip the model and immediately show Estonian helplines (116 123, 116 006, 116 111, 112).
- Refuses role-play as the celebrity, gossip/scandals and prompt-injection attempts.
- Per-IP rate limits and a daily budget cap. No login, no personal data; IPs are stored only as a salted hash.
- Junk/half-JSON "actions" from the model are filtered server-side.
- The coach never promises reminders or anything else the app cannot do.

## How the chat works
One Edge Function, `chat`, does everything. The browser never sees a key.

1. **Start**: `POST {card_id, mode, point_id | idea_id}` → the server picks an opener from the knowledge pack and returns `{chat_id, reply, chips}`.
2. **Message**: `POST {chat_id, message}` → the server builds the prompt from 4 layers:
   - base rules: talk *about* the person, short replies, one action for today, no invented facts, attribution honesty, no promises it cannot keep;
   - mode rules: `quote` · `point` (one talking point) · `person` (facts and stories) · `idea` (one fresh idea and its source);
   - the card's knowledge pack (and the idea, in idea mode);
   - the last 20 messages.
3. Exa `/answer` returns `{reply, action}`. The action is cleaned, saved on the chat and shown as "ACTION FOR TODAY" with a Done checkbox.
4. Before any of this: crisis check (EN/RU/ET → helplines, no model call), rate limits (60 chats / 150 messages per 10 min per hashed IP, 3,000 messages a day overall), 1,000 characters per message, 30 user turns per chat.

Public read API on the same function: `op: cards | card | sources | ideas | waitlist`.

## Architecture
```
Printed card ──QR (QRFY, dynamic)──▶ Front-end (Figma Make, React, HashRouter)
                                         │  POST /functions/v1/chat  (no keys in the browser)
                                         ▼
                              Supabase Edge Function `chat` (Deno)
                               ├─ op: cards / card / sources / ideas / waitlist
                               ├─ start chat → opener from knowledge pack or idea
                               └─ message → Exa /answer → {reply, action}
                                         │            └─ stale ideas → triggers `ingest-ideas` in the background
                                         ▼
                              Supabase Postgres (cards, sources, card_ideas, chats, messages, waitlist, RLS)
                                         ▲
                 `ingest-card` → Exa /search (deep-lite + outputSchema)   `ingest-ideas` → Exa /search (last 2 years)
```

## Repository
| Path | Contents |
|---|---|
| `supabase/schema.sql` | Tables, `cards_public` view, RLS policies, migrations |
| `supabase/seed.sql` | The 52 cards with research hints |
| `supabase/functions/ingest-card` | Exa research pipeline → knowledge pack |
| `supabase/functions/ingest-ideas` | Fresh ideas per card (podcasts, research, articles) with verified links |
| `supabase/functions/chat` | Coach chat (4 modes), public data API, safety and rate limits |
| `ingest-all.sh` | Re-research every card |
| `cards_registry.csv` | All 52 cards with their QR links |
| `docs/figma-make/` | The prompts used to build the front-end in Figma Make |
| `assets/` | Social preview and icon |

## Run it yourself
1. Create a Supabase project, run `supabase/schema.sql` then `supabase/seed.sql`.
2. Deploy the three functions `chat`, `ingest-card`, `ingest-ideas` (Verify JWT off). Secret: `EXA_API_KEY` (optional `ADMIN_TOKEN`, `EXA_INGEST_TYPE`, `EXA_CHAT_MODEL`).
3. Research the cards: `POST /functions/v1/ingest-card {"card_id":"steve-jobs"}` or `bash ingest-all.sh`. Fresh ideas fill themselves the first time a card's ideas are requested, or call `POST /functions/v1/ingest-ideas {"card_id":"steve-jobs"}`.
4. Point the front-end at `https://<project>.supabase.co/functions/v1/chat` (see `docs/figma-make/FIGMA_MAKE_PROMPT_CONNECT.md`).

## In progress
- Share a card as an Instagram Story image (1080×1920, drawn in the browser, Web Share API).
- "Remind me tonight": add the action to the phone calendar (.ics / Google Calendar) and collect emails for future reminders.
- A different card of the day per person, no repeats, preferring unopened cards.
- Removing the attribution box from the card page in favour of a second, sourced quote from the same person.

## Who it's for
Young people aged 16–25: sales students, schools and teams running Schmart workshops. Next: a pilot with 35 students, anonymous device IDs for analytics, then courses and 1:1 coaching inside the app.

Built by **Nikita Vlassenkov**.
