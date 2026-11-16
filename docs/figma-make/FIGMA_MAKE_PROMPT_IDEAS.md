Add a "FRESH IDEAS" section: 2–3 fresh ideas from podcasts, research and expert articles linked to the card. The backend is ready. Do not change anything else.

DATA
Use the same Supabase Edge Function we already call for chat (functions/v1/chat):
- Load ideas: POST { "op": "ideas", "card_id": "<id>" }
  → { "ideas": [ { id, title, idea, why, try_today, source_type, source_name, source_title, source_url, published_date } ], "refreshing": boolean }
  source_type is one of "podcast" | "research" | "article" | "video".
- If ideas is empty and refreshing is true, ideas are being found right now. Show the loading state, then call again after 20 seconds, up to 3 times. If ideas are still empty after that, hide the whole section.
- If ideas is empty and refreshing is false, hide the section.

WHERE
1. Home: under the "Unpack with the coach" / "Pick another card" buttons for the Card of the day.
2. Card page (/c/:id): under the "DISCUSS A TOPIC" section, above "SOURCES".

DESIGN (same style as the app)
- Section label: "FRESH IDEAS" (small uppercase grey, like "DISCUSS A TOPIC"), with a subtitle "From podcasts and research on this topic".
- One card per idea, stacked, white, rounded 16, thin border:
  - Top row: a small pill with icon + type ("🎙 Podcast", "🔬 Research", "📰 Article", "▶ Video") in the theme color at ~15%, then source_name in grey, then the month and year of published_date ("Oct 2025") if present.
  - Title: bold, 16px.
  - idea: 14px, max 3 lines (clamp).
  - "Try today:" + try_today, small, in the cream action style (#FFF7EA).
  - Two buttons in one row: primary dark "Unpack with coach" and an outline "Open source ↗" (opens source_url in a new tab).
- Loading state: 2 grey skeleton cards with the text "Finding fresh ideas…".

CHAT WITH AN IDEA
- "Unpack with coach" opens the chat: /c/:id/chat?mode=idea&idea=<idea.id>
- Start the chat with: POST { "card_id": "<id>", "mode": "idea", "idea_id": "<idea.id>" } → { chat_id, reply, chips }. Then send messages as in the other chat modes.
- Chat header label: "Schmart Coach · Fresh idea". In the pinned box at the top, show the idea title plus a small "Open source ↗" link (instead of the quote).
- Everything else (action card, "Done", quick chips, History) works as in the other modes. In History, label this mode "Fresh idea".

Keep all texts in English.
