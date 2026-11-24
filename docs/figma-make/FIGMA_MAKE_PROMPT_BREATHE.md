Add a meditation feature "Breathe". Do not change anything else. Same style as the app.

ENTRY
- In the top header of every page, add a small round icon button on the right (leaf or lotus icon), aria-label "Breathe". It opens /breathe.

PAGE /breathe
- Back arrow + title "Take a minute" + subtitle "Breathe, reset, then start your day."
- Center: a big soft circle (calm green #A8D5C2 → lighter) that animates the breath:
  grows for 4 seconds with text "Breathe in", shrinks for 6 seconds with text "Breathe out". Loop while running.
- Under it: remaining time, large (e.g. "2:47").
- Duration chips: 1 · 3 · 5 · 10 min (default 3, remember last choice in localStorage "schmart_breathe_min").
- Sound chips: Ocean · Rain · Soft noise · Silence (default Ocean, remember in localStorage "schmart_breathe_sound"). Volume slider.
- Buttons: dark "Start" → becomes "Pause" / "Resume"; small text button "Reset".

SOUNDS — generate them in the browser with the Web Audio API (no audio files, no external URLs, no copyrighted music):
- Soft noise: brown noise (integrated white noise), gentle lowpass ~800 Hz.
- Ocean: brown noise → lowpass ~600 Hz, with a slow LFO on the gain (one wave every ~9 seconds, gain 0.25 → 1.0) so it sounds like waves.
- Rain: pink noise → highpass ~1000 Hz + slight random gain flicker.
- Fade in 3 s on start, fade out 3 s on end/pause.
- Bell at start and at the end: synthesized (sine 528 Hz + 1056 Hz at lower volume, exponential decay ~4 s).
- Create/resume the AudioContext only after the user taps Start (needed on iPhone).
- Use the Screen Wake Lock API while running, if available.

"HOW TO MEDITATE" — expandable section under the controls (open on first visit):
1. Sit comfortably with a straight back. Put the phone down.
2. Close your eyes, or look softly at the circle.
3. Breathe in as the circle grows (4 seconds), out as it shrinks (6 seconds).
4. Your mind will wander — that's normal. Notice it and gently come back to the breath. That's the whole exercise.
5. When the bell rings, open your eyes slowly and notice how you feel.

END SCREEN (when the timer finishes)
- "Well done 🌿" + "You took X minutes for yourself today."
- Streak: count days in a row with at least one finished session (localStorage "schmart_breathe_days"), show "🔥 3-day streak".
- Two buttons: dark "Pull today's card" (goes to Home / Card of the day) and outline "Again".

Keep all texts in English.
