Switch the app from mock data to the live backend. Change ONLY `src/lib/api.ts` (plus small type tweaks if needed) — keep every screen and the design exactly as they are.

Backend: one HTTPS endpoint, no API key, no Supabase client needed.
`const API = "https://ihqldzoerxgrljmkcxbf.supabase.co/functions/v1/chat";`
Every call is `fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })` and returns JSON. If the response is not ok or has `error`, throw an Error with that message.

Implement:
- `getCards()` → payload `{ op: "cards" }` → returns `{ cards: Card[] }` (52 cards, already sorted by sort_order). Cache the result in memory for the session.
- `getCard(id)` → first look in the cached list; otherwise payload `{ op: "card", card_id: id }` → `{ card: Card | null }`.
- `getSources(cardId)` → payload `{ op: "sources", card_id }` → `{ sources: {title, url}[] }`. Show the domain from the url when title is empty.
- `startChat({card_id, mode, point_id?})` → payload exactly `{ card_id, mode, point_id }` → `{ chat_id, reply, chips }`.
- `sendMessage({chat_id, message})` → payload `{ chat_id, message }` → `{ chat_id, reply, action?, limit? }`. `action` may be null or empty — treat empty as no action. Real replies take 3–10 seconds: keep the typing indicator visible the whole time.
- `joinWaitlist(email, product)` → payload `{ op: "waitlist", email, product }` → `{ ok: true }`.

Data notes:
- Card fields are the same as the mock type. `color` comes lowercase (e.g. "#f2d633") — use it as is.
- `talking_points` is `{ id, title, question }[]` (ids "p1"…"p6"). Use `id` as `point_id` in the URL and in startChat.
- `attribution.status` can also be `"likely"`: show it like verified but with the text "Attribution likely." `not_applicable` → no banner.
- `context_short`, `chips`, `attribution.note` may be empty strings — hide empty elements.
- The theme counts on Home/Cards must be computed from the real list (not hard-coded).
- Card of the day = cards[dayOfYear % cards.length].

Remove the mock data and the fake 1-second replies. On network errors show the existing friendly retry message. Keep everything else unchanged.
