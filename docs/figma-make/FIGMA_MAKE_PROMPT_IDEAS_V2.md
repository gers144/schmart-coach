Update the "Fresh ideas" block under the card. The backend changed. Do not change anything else.

DATA
1. On load: POST {chat endpoint} { "op": "ideas", "card_id": "<id>" }
   → { "pinned": Idea | null, "ideas": Idea[] }
   - "pinned" is the main idea of the card (the same one the audio talks about). It never changes.
   - "ideas" are extra ideas (0–2).
2. Button "More fresh ideas": POST { "op": "more_ideas", "card_id": "<id>", "seen": [ids of all ideas already shown] }
   → { "ideas": Idea[], "status": "ok" | "none", "message"?: string }
   This can take up to 30 seconds when it searches for new ideas.

LAYOUT
- Title "Fresh ideas".
- First, the pinned idea as a bigger card with a small label "TODAY'S IDEA · in the audio" (headphones icon). Same content as now: type chip (podcast / research / article / video), title, idea, "Try today", source link, "Unpack with coach".
- Below it, the extra ideas as the normal smaller idea cards.
- Under them a light outline button "More fresh ideas" (sparkles icon).
  - While loading: spinner + "Looking for new podcasts and research…". Disable the button.
  - status "ok": add the new ideas to the list with a short fade-in and keep the button.
  - status "none": show the message in small grey text under the button ("No new ideas yet. Check back in a few days.") and hide the button for this visit.
- Keep the seen ids in memory for this page visit.
- If "pinned" is null, show the extra ideas as before.
- The audio player is not affected.
