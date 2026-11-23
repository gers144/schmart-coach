Add a 1-minute audio version of every card ("Listen to this card"). The audio files are ready and hosted on a CDN. Do not change anything else.

DATA
- Index (load once per session and cache in memory):
  GET https://cdn.jsdelivr.net/gh/gers144/schmart-coach@c321a84/audio/en/index.json
  → { "<card_id>": { "duration": 43.1, "chapters": [ { "title": "The card", "start": 0 }, { "title": "The story behind it", "start": 15.2 }, ... ], "transcript": ["...", "...", "...", "..."] } }
- Audio file for a card:
  https://cdn.jsdelivr.net/gh/gers144/schmart-coach@c321a84/audio/en/<card_id>.mp3
- If the card id is not in the index, or the request fails, hide the player. Never block the page.

WHERE
1. Card page (/c/:id): right under the card, above "Unpack this quote for me".
2. Home: under the Card of the day, above "Unpack with the coach".

PLAYER DESIGN (same style as the app)
- White rounded card (16px), thin border, padding 16.
- Left: a round 48px dark play/pause button (#2B2B2B, white icon).
- Right of it: "Listen to this card" (bold 15px) and under it, small grey text "1 min · for your walk or commute". During playback this changes to "0:23 / 0:43".
- A thin progress bar (4px, rounded, grey track, dark fill). Tap or drag it to seek.
- A speed chip at the right: "1×", tap to cycle 1× → 1.25× → 1.5× → 1×.
- Under it, the chapters list: one row per chapter with an icon and its start time.
  Icons: "The card" = quote, "The story behind it" = book, "A fresh idea" = microphone, "Your action for today" = target.
  The current chapter is bold and dark. The others are grey. Tap a row to jump to its start.
- A small "Show transcript" link that expands the 4 transcript paragraphs (14px, grey, line-height 1.6).

BEHAVIOR
- Use one HTML5 <audio> element with preload="none". Load the mp3 only when the user taps play.
- Use the Media Session API so it shows on the lock screen and keeps playing with the screen off: title = card person or action, artist = "Schmart Coach", artwork = the app icon.
- Pause the audio when the user leaves the page or opens the chat.
- When the audio ends, show a small row under the player: "Want to talk it through?" with a dark button "Unpack with coach" (opens the usual quote chat for this card).
- Remember the last speed in localStorage ("schmart_audio_speed").

Keep all texts in English.
