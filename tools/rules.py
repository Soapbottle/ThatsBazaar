"""Turn item card text into replay engine fields.

Each text line is matched against known patterns. A tiered number like "Burn 3/6/9/12"
is resolved for the item's tier. Lines that match become engine fields and are marked
"yes"; lines that only matter outside fights are "n/a"; anything else is "no" (shown on
the page as "Not yet").
"""
import json, re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
ITEMS = json.load(open(os.path.join(HERE, '..', 'items.json')))
ITEMS = {it['slug']: it for it in (ITEMS if isinstance(ITEMS, list) else ITEMS.values()) if isinstance(it, dict)}
NUM = r'([\d.]+(?:/[\d.]+)*)%?'
SEC = r'second(?:\(s\)|s)?'
WORDN = {'an': 1, 'a': 1, 'one': 1, 'two': 2, 'three': 3}

def pick(val, item, tier):
    """'3/6/9/12' -> the value for this tier (tiers start at the item's starting tier)."""
    parts = [float(x) for x in val.split('/')]
    tiers = item.get('tiers') or [tier]
    i = tiers.index(tier) if tier in tiers else len(tiers) - 1
    v = parts[min(i, len(parts) - 1)]
    return int(v) if v == int(v) else v

def count(word):
    return WORDN.get(word.lower(), None) if not word.isdigit() else int(word)

def target(phrase):
    p = phrase.lower()
    if p in ('an item', 'a item'): return {'mode': 'random', 'n': 1}
    if p == 'adjacent items': return {'mode': 'adjacent'}
    if p in ('your other items', 'your items'): return {'mode': 'others'}
    if p == 'the item to the left': return {'mode': 'left'}
    if p == 'the item to the right': return {'mode': 'right'}
    if p == 'an adjacent item': return {'mode': 'adjacentOne'}
    m = re.match(r'(\d+) items?$', p)
    if m: return {'mode': 'random', 'n': int(m.group(1))}
    return None

def CHARGE_ON(tag):
    return tag.capitalize()

def parse_line(t, item, tier):
    """Return (fields, status, why)."""
    P = lambda v: pick(v, item, tier)
    s = t.strip()
    if re.match(r'^Passive: (When you (buy|sell|visit)|At the start of each day|When you buy or upgrade|When this is transformed|Sells for)', s) or re.search(r'permanently|XP|Gold\b|reroll|Encounters|Catalyst|Stash', s):
        return {}, 'n/a', 'Outside fights.'
    m = re.match(r'^Active: Deal ' + NUM + r' [Dd]amage$', s)
    if m: return {'dmg': P(m.group(1))}, 'yes', ''
    m = re.match(r'^Active: (Burn|Poison|Shield|Heal|Regen) ' + NUM + r'$', s)
    if m: return {m.group(1).lower(): P(m.group(2))}, 'yes', ''
    m = re.match(r'^Active: (Burn|Poison) both Players ' + NUM + r'$', s)
    if m: return {m.group(1).lower() + 'Both': P(m.group(2))}, 'yes', ''
    m = re.match(r'^Active: (Haste|Slow|Freeze|Charge) (an item|a item|adjacent items|your other items|the item to the left|the item to the right|an adjacent item|\d+ items?) (?:for )?' + NUM + r' ' + SEC + r'$', s)
    if m:
        tg = target(m.group(2))
        if tg: return {m.group(1).lower() + 'Act': {**tg, 'amt': P(m.group(3))}}, 'yes', ''
    m = re.match(r'^Active: Your items gain ' + NUM + r' Damage$', s)
    if m: return {'allDmgGain': P(m.group(1))}, 'yes', ''
    m = re.match(r'^Active: Adjacent items gain ' + NUM + r' Crit Chance$', s)
    if m: return {'adjCritGain': P(m.group(1))}, 'yes', ''
    if re.match(r'^Active: This starts Flying$', s) or re.match(r'^Passive: At the start of each fight, this starts Flying$', s):
        return {'flies': True}, 'yes', 'Slows and freezes on it last half as long.'
    m = re.match(r'^Passive: This has \+' + NUM + r' Multicast$', s)
    if m: return {'mcBonus': P(m.group(1))}, 'yes', ''
    m = re.match(r'^Passive: When you (Slow|Burn|Shield|Freeze|Haste|Poison|Heal|Crit), Charge this ' + NUM + r' ' + SEC + r'$', s)
    if m: return {'chargeOnOwn': {'ev': m.group(1).lower(), 'amt': P(m.group(2))}}, 'yes', ''
    m = re.match(r'^Passive: When you (Slow|Burn|Freeze|Haste|Crit), this gains ' + NUM + r' Damage$', s)
    if m: return {'dmgOnOwn': {'ev': m.group(1).lower(), 'amt': P(m.group(2))}}, 'yes', ''
    m = re.match(r'^Passive: When you use any item to the left, Charge this ' + NUM + r' ' + SEC + r'$', s)
    if m: return {'chargeOnUseLeft': P(m.group(1))}, 'yes', ''
    m = re.match(r'^Passive: When you use an adjacent item, Charge this ' + NUM + r' ' + SEC + r'$', s)
    if m: return {'chargeOnUseAdj': P(m.group(1))}, 'yes', ''
    m = re.match(r'^Passive: When you use (?:another |a |an )?(Small item|[A-Z][a-z]+)(?: item)?(?: or ([A-Z][a-z]+))?, Charge this ' + NUM + r' ' + SEC + r'$', s)
    if m:
        a, b = m.group(1), m.group(2); sizes, tags = [], []
        for w in (a, b):
            if not w: continue
            if w == 'Small item': sizes.append(1)
            elif w == 'Medium': sizes.append(2)
            elif w == 'Large': sizes.append(3)
            else: tags.append(w)
        return {'chargeOnUse': {'sizes': sizes, 'tags': tags, 'amt': P(m.group(3))}}, 'yes', ''
    m = re.match(r'^Passive: When an enemy uses an item, Charge this ' + NUM + r' ' + SEC + r'$', s)
    if m: return {'chargeOnEnemyUse': P(m.group(1))}, 'yes', ''
    m = re.match(r'^Passive: When an adjacent item Hastes or Slows, Charge this ' + NUM + r' ' + SEC + r'$', s)
    if m: return {'chargeOnAdjHaste': P(m.group(1))}, 'yes', ''
    if re.match(r'^Passive: (Adjacent items have|Your items have|Your [A-Z][a-z]+s? have|The item to the (left|right) has|This has) \+', s) or re.match(r'^Passive: (Adjacent items\'|Your [A-Za-z ]+\') Cooldowns are reduced', s):
        return {}, 'yes', 'A board bonus: already in the stats BazaarHub shows.'
    return {}, 'no', 'This rule isn\'t modelled yet.'

def item_rules(slug, tier):
    it = ITEMS[slug]
    cd = it.get('cd')
    if isinstance(cd, list):
        tiers = it.get('tiers') or [tier]; cd = cd[min(tiers.index(tier) if tier in tiers else 0, len(cd) - 1)]
    out = {'slug': slug, 'name': it['name'], 'tier': tier, 'size': {'SMALL': 1, 'MEDIUM': 2, 'LARGE': 3}.get(it.get('size'), 1),
           'tags': it.get('tags', []), 'cd': cd or 0, 'text': []}
    mc = (it.get('panel', {}).get(tier) or {}).get('Multicast', 1)
    if mc and mc > 1: out['multicast'] = mc
    for line in it.get('text') or []:
        f, st, why = parse_line(line, it, tier)
        if 'mcBonus' in f: out['multicast'] = out.get('multicast', 1) + f.pop('mcBonus')
        out.update(f)
        shown = re.sub(r'\s*' + NUM + r'(?=\s|$)', lambda m: ' ' + str(pick(m.group(1), it, tier)) if '/' in m.group(1) else m.group(0), line)
        out['text'].append([shown, st, why])
    return out

def coverage():
    tot = full = lines = ok = 0
    for slug, it in ITEMS.items():
        tier = (it.get('tiers') or ['Bronze'])[0]
        r = item_rules(slug, tier); tot += 1
        sts = [x[1] for x in r['text']]
        lines += len(sts); ok += sum(1 for x in sts if x != 'no')
        full += all(x != 'no' for x in sts)
    print(f'items {tot}, fully modelled {full} ({full*100//tot}%), lines {ok}/{lines} ({ok*100//lines}%)')

if __name__ == '__main__':
    if len(sys.argv) > 2: print(json.dumps(item_rules(sys.argv[1], sys.argv[2]), indent=1))
    else: coverage()
