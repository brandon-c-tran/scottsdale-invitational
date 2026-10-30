"""List non-logo images on English Wikipedia pages (screenshots). usage: web_wp.py title ..."""
import sys, json, urllib.request, urllib.parse
UA={'User-Agent':'Mozilla/5.0 FieldDayTrivia/1.0'}
def get(u): return json.loads(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40).read())
def images(title):
    d=get('https://en.wikipedia.org/w/api.php?action=query&titles=%s&prop=images&imlimit=60&format=json&redirects=1'%urllib.parse.quote(title))
    for p in d['query']['pages'].values():
        return [i['title'] for i in p.get('images',[])]
    return []
if __name__=='__main__':
    for t in sys.argv[1:]:
        try: print(t,'=>',[i[5:] for i in images(t) if not any(k in i.lower() for k in ('icon','symbol','logo','commons-logo','wiki','edit-','question','ambox','padlock','folder','portal'))])
        except Exception as e: print(t,'ERR',e)
