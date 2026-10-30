import sys, json, urllib.request, urllib.parse, time
UA={'User-Agent':'FieldDayTriviaBot/1.0 (private party app; contact brandontran3900@gmail.com)'}
def get(u):
    for i in range(4):
        try: return json.loads(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40).read())
        except Exception as e:
            if i==3: raise
            time.sleep(6)
def search(q,n=8):
    d=get("https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=%s&gsrnamespace=6&gsrlimit=%d&prop=imageinfo&iiprop=url|size|extmetadata&iiextmetadatafilter=LicenseShortName|Artist&format=json"%(urllib.parse.quote(q),n))
    out=[]
    for p in d.get('query',{}).get('pages',{}).values():
        ii=p['imageinfo'][0]; m=ii.get('extmetadata',{})
        out.append((p['title'][5:],ii['width'],ii['height'],m.get('LicenseShortName',{}).get('value')))
    return out
if __name__=='__main__':
    for q in sys.argv[1:]:
        try: print(q,'|',search(q))
        except Exception as e: print(q,'ERR',e)
        time.sleep(1.5)
