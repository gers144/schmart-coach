QA pass — please fix all of the following without changing the visual design. After the changes, run through each item and confirm.

1. HISTORY IS EMPTY (critical). After starting several chats, /history shows "0 chats" and Profile shows 0. Every successful startChat must save {chat_id, card_id, mode, point_title, started_at} to local storage, and every response with a non-empty `action` must update that chat (action, action_done=false). Mark the card as opened when /c/:id is visited. Wrap storage in try/catch with an in-memory fallback so it never crashes. Verify: open a chat, go to History → it is listed; tick Done → "Completed".

2. ATTRIBUTION BANNER per status (currently "unknown" shows "Attribution disputed"):
   - verified → green "Attribution verified." + note
   - likely → green-grey "Attribution likely." + note
   - disputed → amber "Attribution disputed." + note
   - unknown → neutral grey "Origin not confirmed." + note
   - fictional → "From the film/book: {source_work}"
   - not_applicable → no banner

3. Footer text on the card page: replace "Facts come only from verified sources." with "Facts come from the sources listed above."

4. FOCUS (kind = "action") cards all start with "Today is day to:", so tiles look identical. On tiles and the big card, show the part after "Today is day to:" as the headline (e.g. "Call your friend.") with a small label "TODAY IS DAY TO" above it; the rest of the sentence as body text.

5. Action cards show initials "ST" in the avatar. For kind = "action" show a small spark/check icon instead of initials and the label "Daily action" instead of "Small action".

6. Errors: when the API returns an error message (e.g. 429 "Too many new chats…", "The coach is resting…"), show that message text in the chat instead of the generic one. Keep the retry button.

7. Crisis replies: when sendMessage returns `crisis: true`, show the reply in a soft red/pink bubble, never show an action card, and add two buttons under it: "Call 116 123" (tel:116123) and "Emergency 112" (tel:112).

8. Cards search: while a search or theme filter is active, the title should read "{n} cards" for the filtered count (or "No cards found" + "Clear search" button).

9. Products: hide prices that are still "[PRICE]" — show "Coming soon" instead, and make "Buy the deck" / "Book a session" open the waitlist form with the matching product id instead of a dead link.

10. Profile: default name should be "You" (not "Alex"), with a hint "Tap Edit to add your name". The "Card of the day at 8:00" toggle has no real notifications yet — label it "Coming soon" and disable it.

11. Chat: render text inside **double asterisks** as bold and never show raw asterisks. Auto-scroll to the newest message.

12. Card page and chat must work when opened directly by URL (QR): /c/:id and /c/:id/chat?mode=quote. If the card id does not exist show "Card not found" + "Browse the cards".
