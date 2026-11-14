# Schmart Platform — prompt for Figma Make

How to use: in Figma Make, first connect Supabase (Make → Supabase → connect your project). Attach the 7 screen images exported from the Claude Design canvas (Share → Export → PNG). Then paste everything below the line as the first prompt.

---

Build "Schmart" — a mobile-first web app that is the digital companion to a physical deck of 52 motivational quote cards. Each physical card has a QR code that opens that card in this app, where the user talks to an AI coach about the quote and leaves with one concrete action for today. UI language: English. The attached images are the approved design: match them closely (layout, spacing, colors, type, copy).

## Design tokens
- Background #FAF8F5, surface #FFFFFF, text #2B2B2B, secondary text #6B665F, borders #E3DDD4 / #EBE5DC, dark surface #2B2B2B.
- Theme colors (cards, chips, avatars): FOCUS #6FCAB5, LEGENDS #8CCBEC, ACTORS #F7A35C, SINGERS #C49AC0, MOVIES #F2D633.
- Fonts (Google Fonts): "Lora" for quotes and headings (weight 500), "Inter" for UI (400/500/600/700). Wordmark "SCHMART": Inter 700, letter-spacing 0.18em.
- Radius: cards 18px, tiles 14px, buttons 14px, chips 999px. Soft shadow on cards: 0 1px 2px rgba(0,0,0,.05), 0 10px 28px rgba(0,0,0,.07).
- Card look: white card with a soft organic color blob in the theme color at top-right and a lighter one at bottom-left, small uppercase theme label (letter-spacing .16em), quote in Lora, person at the bottom. Never show photos of people: use initials in a circle filled with the theme color.
- Max content width 430px, centered on desktop. Touch targets ≥ 44px. Bottom tab bar on Home, Cards, History, Products, Profile.

## Backend (already exists in the connected Supabase — do NOT create tables or edge functions, except where stated)
- View `cards_public` (read with the anon key): `id, theme, kind ('person'|'character'|'action'), person, source_work, quote, color, sort_order, context_short, attribution (json {status, note, source_urls}), talking_points (json array of {id, title, question, angle}), facts (json array), chips (json array of strings)`. 52 rows.
- Table `sources` (read): `card_id, title, url, author, published_date`.
- Table `waitlist` (insert only): `email, product`.
- Edge Function `chat` via `supabase.functions.invoke("chat", { body })`:
  - start: `{ card_id, mode: "quote" | "point" | "person", point_id? }` → `{ chat_id, reply, chips }`
  - send: `{ chat_id, message }` → `{ chat_id, reply, action?, limit? }` — `action` is the agreed "action for today" when the coach sets it.
  - on error: `{ error }`.

## Routes and screens
1. **Home `/`** — header (wordmark, profile icon button). Date line ("Saturday, November 14", today's date). Title "Card of the day". The card of the day = `cards_public` ordered by `sort_order`, index = day-of-year % 52. Buttons: "Unpack with the coach" (dark, opens the chat in quote mode) and "Pick another card" (outline → /cards). Section "HOW IT WORKS" with 3 rows: "Scan the QR on your card", "Unpack it with an AI coach", "One action for today", each with a short line. Section "THEMES": 5 chips with theme color dot and count (Focus 10, Legends 13, Actors 10, Singers 10, Movies 9) → /cards filtered. Dark promo tile "COMING SOON · Course: 30 Days of Discipline · Join the waitlist" → /products.
2. **Cards `/cards`** — title "52 cards", subtitle "Pick the one that speaks to you today.", search input ("Person, movie or theme", filters by person/quote/source_work), theme filter chips ("All · 52" + 5 themes, URL param `?theme=`), 2-column grid of card tiles (theme label, quote clamped to 5 lines, person, chat icon) → `/c/:id`.
3. **Card `/c/:id`** (QR target; must work when opened directly; also accept `?card=:id` on `/` and redirect) — back button, wordmark, share button (Web Share API if available, else copy link). Big card. Attribution banner: if `attribution.status` is `verified` show a green banner "Attribution verified." + `attribution.note`; if `disputed`/`unknown` show an amber banner "Attribution disputed." + note; if `fictional` show "From the film/book: {source_work}". Primary button "Unpack this quote for me" → chat mode quote. Section "DISCUSS A TOPIC": one row button per `talking_points` item (title + chevron) → chat mode point. Dashed button "Learn more about {person}" (for kind=action: "What the science says") → chat mode person. Section "SOURCES": first 2 sources (title · domain, opens in new tab) + "N more sources" expander. Footer note: "The coach talks about the person, never as them. Facts come only from verified sources."
4. **Chat `/c/:id/chat?mode=&point=`** — header with back, initials avatar, person name, "Schmart Coach · {mode label}". The quote pinned small at the top in a tinted box (theme color at ~20%). On open call start; show `reply` as a coach bubble and `chips` as quick replies. Coach bubbles left (white, border), user bubbles right (#2B2B2B, white text). Typing indicator while waiting. Render **bold**. When a response includes `action`, show an "ACTION FOR TODAY" card (cream #FFF7EA, border #F3DCB8) with the action text and a "Done" checkbox. Quick chips under the messages: "Remind me tonight", "Another topic" (back to card), "New card" (→ /cards). Input "Type your reply…" + round send button. Disable input while waiting; on error show a friendly retry message; if `limit` is true hide the input and show "Pick another card".
5. **History `/history`** — title "History", subtitle "{n} chats · {m} actions completed". Search ("Person or action") and filters "All / Action pending / Completed". Chats grouped by "TODAY / YESTERDAY / THIS WEEK / EARLIER": each row = initials avatar in theme color, person, time, mode label, action text, status pill ("Completed" green #E3F5F0 / "Action pending" orange #FDEEDF). Tapping a pending action pill toggles it to Completed. Tapping a row reopens the card.
6. **Products `/products`** — title "Keep growing" + subtitle. Deck tile (fanned mini-cards illustration in the 4 theme colors, "DECK · Schmart Cards 2.0 · 52 cards, 5 themes. Each has a QR code with a personal AI coach.", price "€[PRICE]", button "Buy the deck" → placeholder link). Section "COURSES & COACHING": dark tile "COURSE · COMING SOON · 30 Days of Discipline" with "Join the waitlist"; "1:1 COACHING · Session with Nikita · €[PRICE] · Book a session"; "FOR SCHOOLS & TEAMS · Schmart Workshop · Request a workshop". Waitlist form (email) → insert into `waitlist` with product = 'course-30-days' / 'coaching' / 'workshop' / 'general'; show "You're on the list" on success.
7. **Profile `/profile`** — initials avatar, name (editable, stored locally), "Member since {month}". Dark streak tile: "{n} day streak" + 7 day dots Mo–Su (filled = a chat or completed action that day). Two stat tiles: "Cards opened {x} of 52" with progress bar, "Actions completed {y}". Row "Chat history {n}" → /history. "SETTINGS": "Card of the day at 8:00" toggle (stored locally), "Coach language: English".

## State (v1, no login)
- No sign-up in v1. Store on the device (localStorage): list of chats `{chat_id, card_id, mode, point_title, started_at, action, action_done}`, the user's name, opened card ids. History, Profile, streak and stats are computed from this local data.
- Keep the code structured so Supabase Auth (magic link) can be added later to sync history across devices.

## Quality
- Mobile first (390px), works on desktop with the content column centered.
- Accessible: real buttons and links, labels on inputs, aria-label on icon buttons, text contrast ≥ 4.5:1.
- Loading skeletons for card lists; empty states for History ("Scan a card to start your first chat").
