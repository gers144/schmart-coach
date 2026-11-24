On the /products page, add a second product card BELOW "Daily Focus". Do not change anything else. Same card style.

Section label above it (small grey caps): "SCHMART PRODUCTS"

CARD "Purrfect Cat-titude"
- Tag chips: "PAPER PLANNER" (dark) and "Available to order".
- Image (rounded 16px, full card width, object-fit cover, max height 320px):
  https://cdn.jsdelivr.net/gh/gers144/schmart-coach@2ad26eb/assets/products/purrfect-cat-titude.jpg
- Title: "Purrfect Cat-titude — weekly planner"
- One line: "The paper version of Daily Focus. One page a week: goals, tasks, check-list."
- "How to use" — 3 numbered steps:
  1. Set your 3 main goals for the week and break them into smaller tasks.
  2. Write down everything you need to do this week, including the important tasks.
  3. Mark your small daily tasks (call mom, pay the electricity bill…).
- "Why it works" — 2 short rows with icons:
  - target: "Clarity, focus and accountability — you see your progress towards your goals."
  - refresh: "The real power is reflection: every Sunday look back at your week and get better at time management."
- Small quote block (light green background, rounded): "Without a plan, your day is a winding mountain road: you end up doing unimportant things, get exhausted — and accomplish nothing."
- Footer line in small italic grey: "You do not rise to the level of your goals, you fall to the level of your systems. — James Clear"

ORDER (email capture inside the card)
- Text: "Want one? Leave your email and we'll send you how to get it."
- Email input + dark button "I want it".
- On submit: POST to the same chat endpoint { "op": "waitlist", "email": "<email>", "product": "purrfect-cat-titude" }.
- Success: replace the form with "Thanks! We'll email you soon 🐾".
- Invalid email: small red text "Please enter a valid email."
- Save in localStorage "schmart_ordered_purrfect" so the form stays in the success state on the next visit.
