# probe: print page-image URL for wiki pages (Fandom API). usage: sil_probe.py wiki title [title...]
import sys, json, urllib.request, urllib.parse
UA={'User-Agent':'Mozilla/5.0 FieldDayTrivia/1.0'}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read()
def pageimg(wiki,title):
    u=f"https://{wiki}.fandom.com/api.php?action=query&titles={urllib.parse.quote(title)}&prop=pageimages&piprop=original&format=json&redirects=1"
    d=json.loads(get(u))
    for p in d['query']['pages'].values():
        return p.get('original',{}).get('source')
if __name__=='__main__':
    wiki=sys.argv[1]
    for t in sys.argv[2:]:
        try: print(t,'|',pageimg(wiki,t))
        except Exception as e: print(t,'ERR',e)

def fsearch(wiki,q,n=8):
    u=f"https://{wiki}.fandom.com/api.php?action=query&list=search&srsearch={urllib.parse.quote(q)}&srnamespace=6&srlimit={n}&format=json"
    return [x['title'] for x in json.loads(get(u))['query']['search']]
