Add a new page "Products" (route /products) and a link to it in the main menu / bottom nav (icon: gift). Do not change anything else. Same style as the app.

PAGE
- Header: "Free AI tools" and the subtitle "Prompts we use every day. Copy, paste into Claude, done."
- One product card for now (build it as a list so we can add more later):

CARD "Daily Focus"
- Tag chips: "FREE" (dark) and "Prompt".
- Title: "Daily Focus — your personal AI planner"
- One line: "Everyone should have this today. Every morning it turns your email and calendar into one clear task list."
- 4 benefit rows with icons:
  - mail: "Finds tasks and deadlines in your last 14 days of email"
  - calendar: "Checks your meetings and conflicts"
  - repeat: "Spots repeating tasks and suggests putting them on schedule"
  - check: "Today, Upcoming, Done and Habits tabs, with weekly goals at the top"
- "How to use" — 3 small numbered steps:
  1. Copy the prompt.
  2. Open Claude and paste it.
  3. Allow Gmail and Calendar when Claude asks. That's it.
- The prompt itself in a grey rounded box (monospace, 13px), collapsed to 6 lines with "Show full prompt". Above the box, a small EN / RU toggle (EN by default).
- Buttons:
  - Dark: "Copy prompt" → copies the visible language version, then shows "Copied ✓" for 2 seconds.
  - Outline: "Open in Claude" → opens https://claude.ai/new?q=<the prompt, URL-encoded> in a new tab.
- Small grey note: "Your data stays in your own Claude account. Schmart never sees it."

PROMPT TEXT — EN:
Build me a personal Daily Focus planner as a web app. Connect my Gmail and Google Calendar with my permission. Every morning, make my task list for the day: look for requests and deadlines in emails from the last 14 days, check them against the replies I've sent, and take my meetings and calendar conflicts into account. If you notice a recurring task, suggest adding it to my schedule.
Make tabs "Today", "Upcoming", "Done" and "Habits". I want to add tasks manually, move them to tomorrow with one button, and mark them as done. Keep the history, my manual changes and habit streaks. Show my goals for the week with checkboxes at the top. Add links to the emails and events right on the tasks.
Make the app easy to use on my phone and private to me only. If you can't connect email, calendar or the morning update in this chat, build a working manual version and tell me what's missing for the automation.

PROMPT TEXT — RU:
Создай мне личный планировщик Daily Focus в виде веб-приложения. Подключи мой Gmail и Google Calendar с моего разрешения. Каждое утро составляй список задач на день: ищи поручения и дедлайны в письмах за последние 14 дней, сверяйся с отправленными ответами и учитывай встречи и пересечения в календаре. Если замечаешь повторяющуюся задачу, предложи добавить её в расписание.
Сделай вкладки «Сегодня», «Предстоящие», «Выполнено» и «Привычки». Я хочу добавлять задачи вручную, переносить их на завтра одной кнопкой и отмечать выполненные. Сохраняй историю, ручные изменения и серии привычек. Вверху покажи мои цели недели с галочками. Ссылки на письма и события добавляй прямо к задачам.
Сделай приложение удобным на телефоне и доступным только мне. Если в этом чате нельзя подключить почту, календарь или утреннее обновление, собери рабочую ручную версию и скажи, чего не хватает для автоматизации.

At the bottom of the page: small text "More free tools coming soon" + the existing email capture ("Get new tools first"), saved via POST { "op": "waitlist", "email", "product": "products" }.
