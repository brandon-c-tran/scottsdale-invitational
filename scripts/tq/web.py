"""Internet Archaeology asset builder. python scripts/tq/web.py [build|sheet|content]
Reads web.sources.json (Wikimedia Commons, Fandom wiki screenshots, Wayback captures rendered by web_shot.py),
downloads to C:/dev/scottsdale/tq-raw/web/dl, crops the question image (title, logo, watermark removed),
keeps the full capture as the reveal when cropped, writes webp into public/tq/, then merges web.content.json
into worker/triviaQBank/web.json."""
import sys, os, json, hashlib, time, urllib.request, urllib.parse
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
RAW = os.environ.get('TQ_RAW', 'C:/dev/scottsdale/tq-raw') + '/web'; DL = RAW + '/dl'; OUT = REPO + '/public/tq'
UA = {'User-Agent': 'FieldDayTriviaBot/1.0 (private party app; contact brandontran3900@gmail.com)'}
SALT = 'fd-web-2026'; MAXE = 1600
os.makedirs(DL, exist_ok=True); os.makedirs(OUT, exist_ok=True)
def http(u):
    for i in range(4):
        try: return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=90).read()
        except Exception:
            if i == 3: raise
            time.sleep(5)
def info(src):
    k = src['kind']
    if k == 'commons':
        u = 'https://commons.wikimedia.org/w/api.php?action=query&titles=%s&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=%d&format=json' % (urllib.parse.quote('File:' + src['file']), 2400)
        p = list(json.loads(http(u))['query']['pages'].values())[0]['imageinfo'][0]
        m = p.get('extmetadata', {})
        return (p.get('thumburl') or p['url']), p['descriptionurl'], 'Wikimedia Commons, ' + m.get('LicenseShortName', {}).get('value', '')
    if k == 'fandom':
        u = f"https://{src['wiki']}.fandom.com/api.php?action=query&titles={urllib.parse.quote('File:' + src['file'])}&prop=imageinfo&iiprop=url&format=json"
        p = list(json.loads(http(u))['query']['pages'].values())[0]['imageinfo'][0]
        return p['url'], f"https://{src['wiki']}.fandom.com/wiki/File:{urllib.parse.quote(src['file'].replace(' ', '_'))}", 'Fandom wiki screenshot'
    if k == 'wayback':
        j = json.load(open(f"{RAW}/shots/{src['name']}.json"))
        return None, j['wayback'], 'Internet Archive Wayback Machine capture (' + j['ts'] + '), rendered'
def fetch(spec):
    src = spec['src']; url, page, note = info(src)
    if src['kind'] == 'wayback': return f"{RAW}/shots/{src['name']}.png", url, page, note
    p = f"{DL}/{hashlib.sha1(url.encode()).hexdigest()[:16]}"
    if not os.path.exists(p): open(p, 'wb').write(http(url)); time.sleep(1)
    return p, url, page, note
def fit(im):
    im = im.convert('RGB'); s = MAXE / max(im.size)
    return im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS) if s < 1 else im
def name(k, t): return hashlib.sha1((k + SALT + t).encode()).hexdigest()[:12]
def build(ids=None):
    S = json.load(open(HERE + '/web.sources.json')); bp = RAW + '/built.json'
    B = json.load(open(bp)) if os.path.exists(bp) else {}
    for s in S:
        if ids and s['id'] not in ids: continue
        try:
            p, url, page, note = fetch(s); im = Image.open(p); im.seek(0) if hasattr(im, 'seek') else None
            im = im.convert('RGB'); q = im.crop(tuple(s['qcrop'])) if s.get('qcrop') else im
            r = {'id': s['id'], 'w': 0}
            fq = name(s['id'], 'q'); qi = fit(q); qi.save(f'{OUT}/{fq}.webp', 'WEBP', quality=86, method=6)
            B[s['id']] = {'q': fq, 'qw': qi.width, 'qh': qi.height, 'url': page, 'note': note}
            if s.get('qcrop'):
                fr = name(s['id'], 'r'); ri = fit(im); ri.save(f'{OUT}/{fr}.webp', 'WEBP', quality=86, method=6)
                B[s['id']].update(r=fr, rw=ri.width, rh=ri.height)
            print('ok', s['id'], B[s['id']]['qw'], B[s['id']]['qh'])
        except Exception as e: print('FAIL', s['id'], repr(e)[:150])
    json.dump(B, open(bp, 'w'), indent=1)
def sheet():
    B = json.load(open(RAW + '/built.json')); ks = list(B); W, H = 480, 330
    sh = Image.new('RGB', (W * 4, H * ((len(ks) + 3) // 4)), 'white'); d = ImageDraw.Draw(sh)
    for i, k in enumerate(ks):
        im = Image.open(f"{OUT}/{B[k]['q']}.webp"); im.thumbnail((W, H - 16)); sh.paste(im, ((i % 4) * W, (i // 4) * H + 16)); d.text(((i % 4) * W + 3, (i // 4) * H + 2), k, fill=(0, 0, 0))
    sh.save(RAW + '/contact_web.jpg', quality=82); print(RAW + '/contact_web.jpg')
POS = [1, 3, 0, 2, 2, 0, 3, 1, 0, 2, 1, 3]


def content():
    c = json.load(open(HERE + '/web.content.json', encoding='utf-8'))
    B = json.load(open(RAW + '/built.json')) if os.path.exists(RAW + '/built.json') else {}
    recs, seen = [], set()
    for i, (slug, tier, fmt, prompt, subj, ans, dec, reveal, ak, topics, likely, possible, reach, wps, status) in enumerate(c['rows']):
        pos = POS[i % len(POS)]
        texts = list(dec)
        texts.insert(pos, ans)
        rid = 'web-' + slug[:42]
        assert rid not in seen, rid
        seen.add(rid)
        srcs = [{'url': 'https://en.wikipedia.org/wiki/' + w, 'note': 'Wikipedia article, checked for the facts in the reveal', 'checkedAt': '2026-10-29'} for w in wps]
        rec = {'id': rid, 'category': 'web', 'tier': tier, 'format': fmt, 'prompt': prompt, 'subject': subj,
               'options': [{'id': 'abcd'[k], 'text': t} for k, t in enumerate(texts)], 'answer': 'abcd'[pos], 'reveal': reveal}
        if ak:
            b = B[ak]
            rec['media'] = {'kind': 'image', 'src': f"/tq/{b['q']}.webp", 'w': b['qw'], 'h': b['qh'], 'mime': 'image/webp'}
            if b.get('r'):
                rec['revealMedia'] = {'kind': 'image', 'src': f"/tq/{b['r']}.webp", 'w': b['rw'], 'h': b['rh']}
            srcs.append({'url': b['url'], 'note': 'Image source: ' + b['note'], 'checkedAt': '2026-10-29'})
        rec['sources'] = srcs
        rec['verified'] = {'by': 'web', 'at': '2026-10-29'} if wps else {'by': 'suggested', 'at': '2026-10-29'}
        rec['status'] = status
        rec['tags'] = {'topics': topics, 'likely': likely, 'possible': possible, 'reach': reach}
        if status == 'confirm':
            rec['notes'] = 'Quote written from memory; not checked against a dated source. Confirm before using.'
        recs.append(rec)
    json.dump(recs, open(REPO + '/worker/triviaQBank/web.json', 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    from collections import Counter
    print(len(recs), dict(sorted(Counter(r['tier'] for r in recs).items())), 'image', sum(1 for r in recs if 'media' in r))
    print('correct longest:', sum(1 for r in recs if len(r['options'][ord(r['answer']) - 97]['text']) == max(len(o['text']) for o in r['options'])))


if __name__ == '__main__':
    c = sys.argv[1] if len(sys.argv) > 1 else 'build'
    if c == 'build': build(sys.argv[2:] or None)
    elif c == 'sheet': sheet()
    elif c == 'content': content()
