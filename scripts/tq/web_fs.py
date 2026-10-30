import sys, json, urllib.request, urllib.parse, time
UA={'User-Agent':'FieldDayTriviaBot/1.0 (private party app; contact brandontran3900@gmail.com)'}
def get(u):
    for i in range(4):
        try: return json.loads(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40).read())
        except Exception as e:
            if i==3: raise
            time.sleep(5)
def search(wiki,q,n=10):
    d=get(f"https://{wiki}.fandom.com/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(q)}&gsrnamespace=6&gsrlimit={n}&prop=imageinfo&iiprop=url|size&format=json")
    out=[]
    for p in d.get('query',{}).get('pages',{}).values():
        ii=p['imageinfo'][0]; out.append((p['title'],ii['width'],ii['height']))
    return out
if __name__=='__main__':
    for w,q in zip(sys.argv[1::2],sys.argv[2::2]):
        try: print(w,'|',q,'|',search(w,q))
        except Exception as e: print(w,q,'ERR',e)
