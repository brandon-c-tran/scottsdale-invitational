"""Silhouette Showdown asset builder.

Reads scripts/tq/sil.sources.json, downloads the originals to C:/dev/scottsdale/tq-raw/sil/dl, isolates each
subject (source alpha, else rembg), writes the silhouette and the colour reveal (1200x1200 webp, same canvas)
into public/tq/, then python scripts/tq/sil.py content merges scripts/tq/sil.content.json into
worker/triviaQBank/sil.json.   Usage: python scripts/tq/sil.py [build|sheet|content] [id ...]
"""
import sys, os, json, hashlib, urllib.request, urllib.parse
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
RAW = os.environ.get('TQ_RAW', 'C:/dev/scottsdale/tq-raw') + '/sil'
DL = RAW + '/dl'
OUT = os.path.join(REPO, 'public', 'tq')
UA = {'User-Agent': 'Mozilla/5.0 FieldDayTrivia/1.0 (private party app)'}
SIZE, FILL = 1200, 0.80
INK, PAPER = (22, 26, 40), (236, 232, 224)
SALT = 'fd-sil-2026'
os.makedirs(DL, exist_ok=True)
os.makedirs(OUT, exist_ok=True)


def http(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()


def fandom_file(wiki, title):
    u = f"https://{wiki}.fandom.com/api.php?action=query&titles={urllib.parse.quote(title)}&prop=imageinfo&iiprop=url&format=json&redirects=1"
    for p in json.loads(http(u))['query']['pages'].values():
        return p['imageinfo'][0]['url']


def fandom_page(wiki, title):
    u = f"https://{wiki}.fandom.com/api.php?action=query&titles={urllib.parse.quote(title)}&prop=pageimages&piprop=original&format=json&redirects=1"
    for p in json.loads(http(u))['query']['pages'].values():
        return p['original']['source']


def commons_file(title):
    u = f"https://commons.wikimedia.org/w/api.php?action=query&titles={urllib.parse.quote(title)}&prop=imageinfo&iiprop=url&format=json"
    for p in json.loads(http(u))['query']['pages'].values():
        return p['imageinfo'][0]['url']


def resolve(src):
    k = src['kind']
    if k == 'url':
        return src['url']
    if k == 'poke':
        return f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/{src['n']}.png"
    if k == 'mcitem':
        return f"https://raw.githubusercontent.com/misode/mcmeta/assets/assets/minecraft/textures/item/{src['item']}.png"
    if k == 'mcblock':
        return f"https://raw.githubusercontent.com/misode/mcmeta/assets/assets/minecraft/textures/block/{src['item']}.png"
    if k == 'file':
        return fandom_file(src['wiki'], src['file'])
    if k == 'page':
        return fandom_page(src['wiki'], src['title'])
    if k == 'commons':
        return commons_file(src['file'])
    raise ValueError(k)


def download(src):
    url = resolve(src)
    h = hashlib.sha1(url.encode()).hexdigest()[:16]
    p = f"{DL}/{h}"
    if not os.path.exists(p):
        open(p, 'wb').write(http(url))
    return url, p


_sess = None


def rembg_alpha(im):
    global _sess
    from rembg import remove, new_session
    if _sess is None:
        _sess = new_session('bria-rmbg')
    out = remove(im.convert('RGB'), session=_sess)
    return out.split()[3]


def isolate(spec, path):
    im = Image.open(path)
    try:
        im.seek(0)
    except Exception:
        pass
    im = im.convert('RGBA')
    pr = spec.get('process', {})
    if 'crop' in pr:
        im = im.crop(tuple(pr['crop']))
    if pr.get('pixel'):
        s = pr.get('scale', 40)
        im = im.resize((im.width * s, im.height * s), Image.NEAREST)
    a = np.array(im.split()[3])
    transparent = (a < 250).mean()
    mode = pr.get('alpha', 'auto')
    if mode == 'rembg' or (mode == 'auto' and transparent < 0.04):
        im.putalpha(rembg_alpha(im))
    return im


def bbox_alpha(im, thr=40):
    a = np.array(im.split()[3])
    ys, xs = np.where(a > thr)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def clean(im, frac=0.01):
    """drop specks smaller than frac of the largest piece"""
    import cv2
    a = np.array(im.split()[3])
    m = (a > 128).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    if n <= 2:
        return im
    big = st[1:, cv2.CC_STAT_AREA].max()
    keep = np.zeros(n, bool)
    for i in range(1, n):
        keep[i] = st[i, cv2.CC_STAT_AREA] >= big * frac
    a2 = np.where(keep[lab], a, 0).astype(np.uint8)
    im = im.copy()
    im.putalpha(Image.fromarray(a2))
    return im


def canvas(im, spec):
    pr = spec.get('process', {})
    if not pr.get('keepall'):
        im = clean(im)
    x0, y0, x1, y1 = bbox_alpha(im)
    im = im.crop((x0, y0, x1, y1))
    w, h = im.size
    s = SIZE * pr.get('fill', FILL) / max(w, h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    im = im.resize((nw, nh), Image.NEAREST if pr.get('pixel') else Image.LANCZOS)
    a = np.array(im.split()[3]).astype(np.float32)
    soft = np.clip((a - 96) * (255 / 64), 0, 255).astype(np.uint8)
    ox, oy = (SIZE - nw) // 2, (SIZE - nh) // 2
    rev = Image.new('RGB', (SIZE, SIZE), PAPER)
    rev.paste(im.convert('RGB'), (ox, oy), Image.fromarray(a.astype(np.uint8)))
    sil = Image.new('RGB', (SIZE, SIZE), PAPER)
    sil.paste(Image.new('RGB', (nw, nh), INK), (ox, oy), Image.fromarray(soft))
    return sil, rev


def fname(key, tag):
    return hashlib.sha1((key + SALT + tag).encode()).hexdigest()[:12]


def build(ids=None):
    srcs = json.load(open(HERE + '/sil.sources.json', encoding='utf-8'))
    bp = RAW + '/built.json'
    built = json.load(open(bp)) if os.path.exists(bp) else {}
    for spec in srcs:
        if ids and spec['id'] not in ids:
            continue
        try:
            url, p = download(spec['src'])
            im = isolate(spec, p)
            sil, rev = canvas(im, spec)
        except Exception as e:
            print('FAIL', spec['id'], repr(e)[:160])
            continue
        fs, fr = fname(spec['id'], 'q'), fname(spec['id'], 'r')
        sil.save(f"{OUT}/{fs}.webp", 'WEBP', quality=92, method=6)
        rev.save(f"{OUT}/{fr}.webp", 'WEBP', quality=88, method=6)
        built[spec['id']] = {'sil': fs, 'rev': fr, 'url': url}
        print('ok', spec['id'])
    json.dump(built, open(bp, 'w'), indent=1)


def sheet(ids=None, per=12, tag='a'):
    built = json.load(open(RAW + '/built.json'))
    ks = [k for k in built if (not ids or k in ids)]
    cell, cols = 300, 6
    font = None
    try:
        font = ImageFont.truetype('arial.ttf', 15)
    except Exception:
        pass
    for pi in range(0, len(ks), per):
        chunk = ks[pi:pi + per]
        rows = (len(chunk) + 2) // 3
        sh = Image.new('RGB', (cols * cell, rows * (cell + 20)), (255, 255, 255))
        d = ImageDraw.Draw(sh)
        for i, k in enumerate(chunk):
            r, c = divmod(i, 3)
            for j, key in enumerate(('sil', 'rev')):
                t = Image.open(f"{OUT}/{built[k][key]}.webp").resize((cell, cell))
                sh.paste(t, ((c * 2 + j) * cell, r * (cell + 20) + 20))
            d.text((c * 2 * cell + 4, r * (cell + 20) + 2), k, fill=(0, 0, 0), font=font)
        pth = f"{RAW}/contact_{tag}_{pi // per + 1}.jpg"
        sh.save(pth, quality=82)
        print(pth)


POS = [0, 2, 1, 3, 3, 1, 2, 0, 1, 3, 0, 2]


def slug(t):
    import re
    return re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-')


def alive(u):
    import re
    m = re.match(r'https://([a-z0-9-]+)\.fandom\.com/wiki/(.+)$', u)
    if m:
        try:
            q = f"https://{m.group(1)}.fandom.com/api.php?action=query&titles={m.group(2)}&format=json&redirects=1"
            return all('missing' not in pg for pg in json.loads(http(q))['query']['pages'].values())
        except Exception:
            return False
    try:
        urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=20)
        return True
    except Exception:
        return False


def content():
    c = json.load(open(HERE + '/sil.content.json', encoding='utf-8'))
    built = json.load(open(RAW + '/built.json'))
    recs, seen = [], set()
    for i, (aid, tier, subj, prompt, ans, dec, reveal, topics, likely, possible, reach, page) in enumerate(c['rows']):
        b = built[aid]
        if likely == 'LEAGUE':
            likely = c['league']
        pos = POS[i % len(POS)]
        texts = list(dec)
        texts.insert(pos, ans)
        rid = 'sil-' + slug(subj)[:40]
        while rid in seen:
            rid += '-2'
        seen.add(rid)
        srcs = [{'url': b['url'], 'note': 'Original image used for the reveal (isolated and filled for the silhouette)', 'checkedAt': '2026-10-29'}]
        if page and alive(page):
            srcs.append({'url': page, 'note': 'Reference page for the subject', 'checkedAt': '2026-10-29'})
        recs.append({
            'id': rid, 'category': 'sil', 'tier': tier, 'format': 'image', 'prompt': prompt, 'subject': subj,
            'options': [{'id': 'abcd'[k], 'text': t} for k, t in enumerate(texts)], 'answer': 'abcd'[pos],
            'reveal': reveal,
            'media': {'kind': 'image', 'src': f"/tq/{b['sil']}.webp", 'w': SIZE, 'h': SIZE, 'mime': 'image/webp'},
            'revealMedia': {'kind': 'image', 'src': f"/tq/{b['rev']}.webp", 'w': SIZE, 'h': SIZE},
            'sources': srcs, 'verified': {'by': 'web', 'at': '2026-10-29'}, 'status': 'ready',
            'tags': {'topics': topics, 'likely': likely, 'possible': possible, 'reach': reach},
        })
    os.makedirs(os.path.join(REPO, 'worker', 'triviaQBank'), exist_ok=True)
    json.dump(recs, open(os.path.join(REPO, 'worker', 'triviaQBank', 'sil.json'), 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    longest = sum(1 for r in recs if len(r['options'][ord(r['answer']) - 97]['text']) == max(len(o['text']) for o in r['options']))
    print(len(recs), 'records; correct is longest in', longest)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'build'
    ids = sys.argv[2:] or None
    if cmd == 'build':
        build(ids)
    elif cmd == 'sheet':
        sheet(ids)
    elif cmd == 'content':
        content()
