"""Sally deterministic rules layer (prototype, pure Python, no dependencies, well under 1 MB).
check(line, product) -> {'verdict': 'reject'|'ok'|'unknown', 'reasons': [...], 'flags': {...}, 'line_qty':..., 'product_qty':...}
- size/unit parsing (g, kg, ml, cl, l, pints, oz, lb), multipacks (4 x 330ml, 6 pack, x2), item counts (2 tins, 80 tea bags)
- pack-count maths: compares total requested vs total offered; accepts 0.5x-2x (same band as the production sense check)
- product-type and form mismatch (e.g. coconut milk drink vs tinned coconut milk, olive spread vs olive oil, kitchen roll vs loo roll)
- flags only (never a reject): organic, own-label retailer, premium range, value range (personal-preference features)."""
import re
UNIT = {'g': ('g', 1), 'gram': ('g', 1), 'grams': ('g', 1), 'kg': ('g', 1000), 'kilo': ('g', 1000), 'oz': ('g', 28.35), 'lb': ('g', 453.6), 'lbs': ('g', 453.6),
        'ml': ('ml', 1), 'cl': ('ml', 10), 'l': ('ml', 1000), 'ltr': ('ml', 1000), 'litre': ('ml', 1000), 'litres': ('ml', 1000), 'liter': ('ml', 1000),
        'pint': ('ml', 568), 'pints': ('ml', 568), 'pt': ('ml', 568)}
NUM = r'(\d+(?:\.\d+)?)'
UNIT_RE = re.compile(NUM + r'\s*(kg|kilo|grams?|g|oz|lbs?|ml|cl|ltr|litres?|liter|l|pints?|pt)\b', re.I)
MULTI_RE = re.compile(r'(\d+)\s*[x×]\s*' + NUM + r'\s*(kg|grams?|g|ml|cl|l|ltr)\b', re.I)
PACK_RE = re.compile(r'(\d+)\s*(?:-\s*)?(?:pack|pk|rolls?|bags|tea bags|sheets|eggs|tins|cans|bottles|pieces|pcs|count|ct)\b|\bpack of (\d+)|\bx\s?(\d+)\b|\b(\d+)\s*x\b(?!\s*\d)', re.I)
WORDNUM = {'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'six': 6, 'twelve': 12, 'dozen': 12, 'half dozen': 6}
LEADCOUNT_RE = re.compile(r'^\s*(\d+|a|an|one|two|three|four|six|twelve|dozen)\s+(?!x\b)(?!(?:kg|g|ml|l|cl|pints?|oz|lb)\b)([a-z])', re.I)

def parse_qty(text: str):
    t = text.lower().replace(',', '')
    m = MULTI_RE.search(t)
    if m:
        u, f = UNIT[m.group(3).lower().rstrip('s') if m.group(3).lower() not in UNIT else m.group(3).lower()]
        return {'per': float(m.group(2)) * f, 'unit': u, 'count': int(m.group(1)), 'total': int(m.group(1)) * float(m.group(2)) * f}
    size = None; m = UNIT_RE.search(t)
    if m:
        key = m.group(2).lower(); key = key if key in UNIT else key.rstrip('s')
        u, f = UNIT[key]; size = (float(m.group(1)) * f, u)
    count = None; pm = PACK_RE.search(t)
    if pm: count = int(next(g for g in pm.groups() if g))
    if count is None:
        lm = LEADCOUNT_RE.match(t)
        if lm: count = int(lm.group(1)) if lm.group(1).isdigit() else WORDNUM[lm.group(1)]
    if size: return {'per': size[0], 'unit': size[1], 'count': count or 1, 'total': size[0] * (count or 1), 'explicit_count': count is not None}
    if count: return {'per': None, 'unit': 'item', 'count': count, 'total': float(count)}
    return None

# product types: first matching pattern wins, ordered most specific first. Types in the same group are compatible.
TYPES = [
    ('kitchen roll', r'kitchen (roll|towel)|paper towel'), ('wet wipes', r'moist toilet|toilet tissue wipes|wet wipes|baby wipes|flushable wipes'),
    ('toilet roll', r'toilet (roll|tissue|paper)|loo roll|bathroom tissue'),
    ('coconut drink', r'coconut (milk )?drink|coconut m[iy]lk alternative|dairy free coconut'), ('coconut milk tin', r'coconut milk|coconut cream'),
    ('olive spread', r'olive (spread|buttery)|spreadable'), ('olives', r'\bolives\b'), ('cooking spray', r'\bspray\b'), ('olive oil', r'olive oil'),
    ('crisps', r'\bcrisps?\b|\bchips\b(?!.*fish)'), ('yogurt coated', r'yogh?urt coated'), ('cheddar', r'cheddar|cheese(?!.*(crisp|onion|cake|sauce))'),
    ('milk', r'(semi[- ]?skimmed|skimmed|whole|full fat|1%)?\s*milk\b'), ('yoghurt', r'yogh?o?urt'), ('loose tea', r'loose (leaf )?tea|\bloose leaf\b'),
    ('tea bags', r'tea ?bags?|\btea\b'), ('rice', r'\brice\b'), ('washing up spray', r'(power )?spray.*(lemon|washing|dish)|skip the soak'),
    ('washing up liquid', r'washing[- ]up liquid|dish(washing)? liquid|fairy liquid'), ('butter', r'\bbutter\b'), ('bread', r'\bbread\b|\bloaf\b'),
    ('eggs', r'\beggs?\b'), ('pasta', r'pasta|spaghetti|penne|fusilli'), ('chicken', r'chicken'), ('bananas', r'banana'), ('juice', r'\bjuice\b'),
]
COMPAT = [{'toilet roll'}, {'olive oil'}, {'tea bags', 'loose tea'} - {'loose tea'}, {'cheddar'}]  # placeholder; equality is the default test
def ptype(text: str):
    t = text.lower()
    for name, pat in TYPES:
        if re.search(pat, t): return name
    return None
FORM_WORDS = ['frozen', 'dried', 'tinned|canned|in tins?', 'powder|powdered', 'sliced', 'grated', 'smoked', 'concentrate', 'flavoured|flavor', 'spray', 'drink']
def forms(text): t = text.lower(); return {w.split('|')[0] for w in FORM_WORDS if re.search(r'\b(' + w + r')\b', t)}
OWN = r"\b(tesco|sainsbury'?s|asda|morrisons|waitrose|essential waitrose|m&s|marks|co-?op|ocado|aldi|lidl|iceland)\b"
PREMIUM = r'\b(finest|taste the difference|extra special|the best|specially selected|deluxe|no\.? ?1|signature|collection)\b'
VALUE = r'\b(essential|just essentials|smart price|everyday|stockwell|hubbards|value|basics)\b'

def check(line: str, product: str):
    reasons = []; lq, pq = parse_qty(line), parse_qty(product); lt, pt = ptype(line), ptype(product)
    flags = {'organic': bool(re.search(r'\borganic\b', product, re.I)) and not re.search(r'\borganic\b', line, re.I),
             'own_label': bool(re.search(OWN, product, re.I)), 'premium': bool(re.search(PREMIUM, product, re.I)) and not re.search(PREMIUM, line, re.I),
             'value_range': bool(re.search(VALUE, product, re.I))}
    if lt and pt and lt != pt: reasons.append(f'type mismatch: {lt} vs {pt}')
    lf, pf = forms(line), forms(product)
    extra = (pf - lf) - {'drink'} if lt == pt else set()
    if 'drink' in pf and 'drink' not in lf and lt and 'drink' not in lt: extra.add('drink')
    if extra and lt and pt: reasons.append('form mismatch: ' + ','.join(sorted(extra)))
    ratio = None
    if lq and pq:
        if lq['unit'] == pq['unit']:
            ratio = pq['total'] / lq['total'] if lq['total'] else None
        elif lq['unit'] == 'item' and pq['unit'] != 'item':  # "2 tins coconut milk" vs one 400ml tin
            ratio = pq['count'] / lq['count']
        if ratio is not None and not (0.5 <= ratio <= 2.0):
            reasons.append(f'size/pack: offered {ratio:.2f}x of requested')
    verdict = 'reject' if reasons else ('ok' if (lt and pt and lt == pt and (ratio is not None or not lq)) else 'unknown')
    return {'verdict': verdict, 'reasons': reasons, 'flags': flags, 'line_type': lt, 'product_type': pt, 'ratio': ratio, 'line_qty': lq, 'product_qty': pq}
