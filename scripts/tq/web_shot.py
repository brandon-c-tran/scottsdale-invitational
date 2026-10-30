"""Render Wayback Machine captures to PNG with headless Chrome. usage: web_shot.py name url YYYYMMDD [w h]"""
import sys, os, json, subprocess, urllib.request, urllib.parse
RAW = os.environ.get('TQ_RAW', 'C:/dev/scottsdale/tq-raw') + '/web/shots'
CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
UA = {'User-Agent': 'Mozilla/5.0 FieldDayTrivia/1.0'}
def snapshot(url, ts):
    u = 'https://archive.org/wayback/available?url=%s&timestamp=%s' % (urllib.parse.quote(url, safe=''), ts)
    d = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40).read())
    c = d.get('archived_snapshots', {}).get('closest')
    return (c['timestamp'], c['url']) if c and c.get('available') else (None, None)
def shot(name, url, ts, w=1280, h=900, budget=25000):
    os.makedirs(RAW, exist_ok=True)
    t, _ = snapshot(url, ts)
    if not t: print('NOSNAP', name); return None
    out = f'{RAW}/{name}.png'
    wb = f'https://web.archive.org/web/{t}if_/{url}'
    subprocess.run([CH, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--window-size={w},{h}',
                    f'--virtual-time-budget={budget}', f'--screenshot={out}', wb], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    print('shot', name, t, os.path.exists(out)); 
    json.dump({'name': name, 'url': url, 'ts': t, 'wayback': wb}, open(f'{RAW}/{name}.json', 'w'))
    return t
if __name__ == '__main__':
    n, u, ts = sys.argv[1:4]
    shot(n, u, ts, *(int(x) for x in sys.argv[4:6]))
