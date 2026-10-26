"""Render the table record since a time as the page reads — narration, then each card with one pair of marks per run,
being scene lines and cards, speech — so a reader sees what the novel says. Usage: python tmp/read-page.py "2026-10-26T04:00:00" """
import json, sqlite3, sys

DB = r'C:\Projects\GRO.WTH\app\dev.db'
CAMP = 'cms5z4j6z0000zg48z5vzl2jn'
since = sys.argv[1] if len(sys.argv) > 1 else '2026-10-26T04:00:00'

def marks(kind):
    return ('((', '))') if kind == 'thought' else ('::', '::') if kind == 'action' else ('"', '"')

def merged(segs):
    out = []
    for s in segs:
        if out and out[-1]['kind'] == s['kind'] and s['kind'] != 'speech':
            out[-1] = {'kind': s['kind'], 'text': (out[-1]['text'].strip() + ' ' + s['text'].strip()).strip()}
        else:
            out.append({'kind': s['kind'], 'text': s['text']})
    return out

con = sqlite3.connect(DB)
rows = con.execute("select strftime('%H:%M:%S',createdAt), type, coalesce(characterName, actor), payload from CampaignEvent where campaignId=? and createdAt > ? order by createdAt", (CAMP, since)).fetchall()
for ts, t, who, raw in rows:
    p = json.loads(raw)
    if t == 'game_event' and p.get('eventType') == 'declaration':
        print(f"\n═══ {ts} GM SEED: {p.get('description')}")
        if p.get('narration'): print(f"\n{p['narration']}")
        # cards: order actions/thoughts/speech by their seed sentence position
        seed = p.get('description') or ''
        items = []
        for k in ('actions', 'thoughts'):
            for x in p.get(k) or []:
                src = x.get('sentence') or x.get('text')
                items.append((seed.find(src) if src and seed.find(src) >= 0 else 10**6, len(items), x.get('actorLabel'), 'action' if k == 'actions' else 'thought', x['text']))
        for x in p.get('speech') or []:
            items.append((seed.find(x['text']) if seed.find(x['text']) >= 0 else 10**6, len(items), x.get('speakerLabel'), 'speech', x['text']))
        items.sort()
        cards = []
        for _, _, who2, kind, text in items:
            if cards and cards[-1][0] == who2: cards[-1][1].append({'kind': kind, 'text': text})
            else: cards.append((who2, [{'kind': kind, 'text': text}]))
        for who2, segs in cards:
            print(f"\n<{who2}>")
            for s in merged(segs):
                o, c = marks(s['kind']); print(f"  {o}{s['text']}{c}")
        for m in p.get('monologues') or []:
            print(f"  [inner voice, raw] {m['text'][:400]}")
    elif t == 'game_event':
        print(f"\n═══ {ts} {p.get('eventType')}: {p.get('description')}")
    elif t == 'being_thought':
        print(f"\n--- {ts} {who} (impulse {p.get('impulse')}; heard: {str(p.get('heard'))[:120]!r})")
        if p.get('scene'): print(f"\n{p['scene']}")
        print(f"\n<{who}>")
        segs = p.get('segments') or [{'kind': 'thought', 'text': p.get('thought', '')}]
        for s in merged(segs):
            o, c = marks(s['kind']); print(f"  {o}{s['text']}{c}")
    elif t == 'chat':
        print(f"\n--- {ts} {who} says: \"{p.get('message')}\"")
    else:
        print(f"\n--- {ts} {t} {who}: {raw[:200]}")
print(f"\n[{len(rows)} rows since {since}]")
