"""Pin educational GeoAtlas boundaries; convert AMap GCJ-02 to WGS84 reference."""
import hashlib
import json
import math
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE='https://geo.datav.aliyun.com/areas_v3/bound/'
DATA={'china':'100000','wuhan':'420100','shanghai':'310000','chengdu':'510100','shenzhen':'440300'}

def delta(lon,lat):
    x,y=lon-105,lat-35
    dlat=-100+2*x+3*y+.2*y*y+.1*x*y+.2*math.sqrt(abs(x))
    dlat+=(20*math.sin(6*x*math.pi)+20*math.sin(2*x*math.pi))*2/3
    dlat+=(20*math.sin(y*math.pi)+40*math.sin(y/3*math.pi))*2/3
    dlat+=(160*math.sin(y/12*math.pi)+320*math.sin(y*math.pi/30))*2/3
    dlon=300+x+2*y+.1*x*x+.1*x*y+.1*math.sqrt(abs(x))
    dlon+=(20*math.sin(6*x*math.pi)+20*math.sin(2*x*math.pi))*2/3
    dlon+=(20*math.sin(x*math.pi)+40*math.sin(x/3*math.pi))*2/3
    dlon+=(150*math.sin(x/12*math.pi)+300*math.sin(x/30*math.pi))*2/3
    rad=lat*math.pi/180; magic=1-.00669342162296594323*math.sin(rad)**2
    return dlon*180/(6378245/math.sqrt(magic)*math.cos(rad)*math.pi), dlat*180/(6378245*(1-.00669342162296594323)/(magic**1.5)*math.pi)

def wgs84(point):
    lon,lat=point[:2]
    if not (72.004<=lon<=137.8347 and .8293<=lat<=55.8271): return point
    x,y=lon,lat
    for _ in range(4):
        dx,dy=delta(x,y);x-=x+dx-lon;y-=y+dy-lat
    return [round(x,6),round(y,6)]+point[2:]

def coordinates(value):
    if len(value)>=2 and isinstance(value[0],(int,float)):return wgs84(value)
    return [coordinates(v) for v in value]

def download(item):
    name,code=item;url=BASE+code+'_full.json'
    with urllib.request.urlopen(url,timeout=45) as r:raw=r.read()
    data=json.loads(raw)
    assert data['type']=='FeatureCollection' and data['features']
    for f in data['features']:
        f['geometry']['coordinates']=coordinates(f['geometry']['coordinates'])
        for key in ('center','centroid'):
            if f['properties'].get(key):f['properties'][key]=wgs84(f['properties'][key])
    return name,data,{'url':url,'original_sha256':hashlib.sha256(raw).hexdigest(),'features':len(data['features'])}

def main():
    root=Path(__file__).resolve().parents[1]
    with ThreadPoolExecutor(max_workers=3) as pool:items=list(pool.map(download,DATA.items()))
    loaded={name:data for name,data,_ in items}
    sources={name:source for name,_,source in items}
    assert len(loaded['china']['features'])>=34
    path=root/'frontend/assets/map-data.js'
    text='/** Educational geographic boundaries: DataV GeoAtlas / AMap. See docs/map-workspace.md. */\n'
    text+='export const CHINA_MAP='+json.dumps(loaded.pop('china'),ensure_ascii=False,separators=(',',':'))+';\n'
    text+='export const CITY_MAPS='+json.dumps(loaded,ensure_ascii=False,separators=(',',':'))+';\n'
    text+='export const MAP_SOURCES='+json.dumps(sources,separators=(',',':'))+';\n'
    path.write_bytes(text.encode('utf-8'))
    (root/'docs/map-data-sources.json').write_bytes((json.dumps(sources,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'bytes':path.stat().st_size,'sources':sources},ensure_ascii=True))

if __name__=='__main__':main()
