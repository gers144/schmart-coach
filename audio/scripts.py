import json, re
d = json.load(open('/home/claude/gh-schmart/audio/cards_data.json'))
def clean(t):
    t = (t or '').replace('“','"').replace('”','"').replace('’',"'").replace('‘',"'").replace('—',', ').replace('–',', ')
    return re.sub(r'\s+',' ',t).strip()
def sentences(t, n):
    s = re.split(r'(?<=[.!?])\s+', clean(t)); return ' '.join(s[:n])
def themeword(th):
    return {'FOCUS':'daily focus','LEGENDS':'legends','ACTORS':'actors','SINGERS':'singers','MOVIES':'movies'}.get(th, th.lower())
out = {}
for c in d:
    q = clean(c['quote']).rstrip()
    if c['kind']=='action':
        m = re.match(r'Today is day to:?\s*(.*)', q, re.I)
        body = m.group(1) if m else q
        first, _, rest = body.partition('.')
        part1 = f"Good morning. Today is a day to {first.strip()[0].lower()+first.strip()[1:]}. {rest.strip()}".strip()
    else:
        who = c['person']
        if c['att']=='fictional':
            work = re.sub(r'\s*\(.*?\)', '', c.get('work') or '').strip()
            lead = f"From {work}, {who} says:" if work else f"{who} says:"
        elif c['att'] in ('verified','likely'):
            lead = f"{who} once said:"
        else:
            lead = f"Here's a line often attributed to {who}:"
        part1 = f"Good morning. Today's card comes from the {themeword(c['theme'])} set. {lead} {q}"
    part2 = sentences(c['ctx'], 2)
    ideas = c['ideas']
    idea = next((x for x in ideas if x['t'] in ('research','podcast')), ideas[0] if ideas else None)
    if idea:
        src = clean(idea.get('s') or '')
        kind = {'research':'a recent study','podcast':'a recent podcast','article':'a recent article','video':'a recent video'}[idea['t']]
        ok_name = idea['t']=='podcast' and src and len(src)<50 and not re.search(r'\.(com|org|net|io)|article|journal|pmc|blog', src, re.I)
        frm = f"{kind}, {src}" if ok_name else kind
        part3 = f"Here's a fresh idea from {frm}. {sentences(idea['i'],2)}"
        act = clean(idea.get('tr') or '')
    else:
        tp = c['tp'][0] if c['tp'] else ''
        part3 = f"Think about this today: {tp}." if tp else ''
        act = ''
    if not act:
        act = "pick one small step from this card and do it before lunch."
    act = act[0].lower()+act[1:] if act else act
    part4 = f"Your action for today: {act.rstrip('.')}. Have a great day."
    out[c['id']] = [p for p in [part1, part2, part3, part4] if p]
json.dump(out, open('scripts.json','w'), indent=1, ensure_ascii=False)
words = {k: sum(len(' '.join(v).split()) for _ in [0]) for k,v in out.items()}
print('cards', len(out), 'words min/avg/max', min(words.values()), sum(words.values())//len(words), max(words.values()))
for k in ['jared-leto','be-grateful','dumbledore']:
    print('\n==', k); print('\n'.join(out[k]))
