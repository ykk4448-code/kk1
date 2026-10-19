"""Produce a standalone read-only AETHER 4.0 HTML preview with live demo API snapshots.

Preview does not persist writes; real app works at http://localhost:8000.
"""
import os
from pathlib import Path
import json
import re
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
os.environ['DEMO_MODE']='true'
os.environ['DATABASE_URL']='sqlite:///'+str(Path(tempfile.gettempdir())/'aether_v4_preview.sqlite3')
sys.path.insert(0,str(ROOT/'backend'))
from fastapi.testclient import TestClient
from app.main import app

with TestClient(app) as client:
    token=client.post('/api/v1/auth/login',json={'username':'admin','password':'demo123456'}).json()['access_token']
    headers={'Authorization':'Bearer '+token}
    paths=['/health','/cities']
    cities=client.get('/api/v1/cities',headers=headers).json()
    for c in cities:
        cid=c['id']
        paths.extend([f'/network?city_id={cid}',f'/scenarios?city_id={cid}',f'/overview?city_id={cid}'])
    scenes=client.get('/api/v1/scenarios',headers=headers).json()
    for s in scenes:
        sid=s['id']
        paths.extend([f'/scenarios/{sid}/tasks',f'/scenarios/{sid}/configuration',f'/plans?scenario_id={sid}&limit=100',f'/simulations?scenario_id={sid}&limit=100'])
    for scen in scenes:
        for run in client.get('/api/v1/simulations',headers=headers,params={'scenario_id':scen['id']}).json():
            paths.extend([f"/simulations/{run['id']}/report",f"/simulations/{run['id']}/telemetry?minute=0.00"])
    for scen in scenes:
        for run in client.get('/api/v1/simulations',headers=headers,params={'scenario_id':scen['id']}).json():
            paths.append(f"/simulations/{run['id']}/assessment?minute=0.000")
    paths.append('/audit?limit=100')
    fixtures={path:client.get('/api/v1'+path,headers=headers).json() for path in paths}

html=(ROOT/'frontend/index.html').read_text(encoding='utf-8')
css=(ROOT/'frontend/assets/styles.css').read_text(encoding='utf-8')
html=html.replace('<link rel="stylesheet" href="/assets/styles.css">','<style>'+css+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/workbench.css">','<style>'+(ROOT/'frontend/assets/workbench.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/design-v5.css">','<style>'+(ROOT/'frontend/assets/design-v5.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/mission-v6.css">','<style>'+(ROOT/'frontend/assets/mission-v6.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/mission-v7.css">','<style>'+(ROOT/'frontend/assets/mission-v7.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/cartographic-v8.css">','<style>'+(ROOT/'frontend/assets/cartographic-v8.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/lightblue-v9.css">','<style>'+(ROOT/'frontend/assets/lightblue-v9.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/engineering-v10.css">','<style>'+(ROOT/'frontend/assets/engineering-v10.css').read_text(encoding='utf-8')+'</style>')
# Frontend sources are ES modules. In preview only, flatten imports and exports
# into one classic script. This is a read-only rendering snapshot, not product code.
chunks=[]
for name in ['api.js','charts.js','map.js','assessment.js','app.js']:
    js=(ROOT/'frontend/assets'/name).read_text(encoding='utf-8')
    js=re.sub(r'^import\s+.+?;\s*$', '', js,flags=re.MULTILINE)
    js=re.sub(r'\bexport\s+(?=async|const|function|class|let)', '', js)
    chunks.append(js)
prelude='''const MOCK_PAYLOAD=__JSON__;
window.fetch=async function(url,options={}){
  const path=String(url).replace(/^\\/api\\/v1/,'');
  if(path==='/auth/login')return {ok:true,status:200,json:async()=>({access_token:'preview-token',user:{username:'admin',role:'admin'}})};
  if(path==='/auth/me')return {ok:true,status:200,json:async()=>({username:'admin',role:'admin'})};
  const data=MOCK_PAYLOAD[path] ?? (path.includes('/telemetry?minute=')?MOCK_PAYLOAD[path.split('?')[0]+'?minute=0.00']:(path.includes('/assessment?minute=')?MOCK_PAYLOAD[path.split('?')[0]+'?minute=0.000']:undefined));
  if(data===undefined)return {ok:false,status:501,json:async()=>({detail:'离线预览为只读快照，请启动正式服务执行写操作'})};
  return {ok:true,status:200,json:async()=>structuredClone(data)};
};'''
prelude=prelude.replace('__JSON__',json.dumps(fixtures,ensure_ascii=False,separators=(',',':')))
js=prelude+'\n'+'\n'.join(chunks)
html=html.replace('<script type="module" src="/assets/app.js"></script>','<script>'+js+'</script>')
mission_js=(ROOT/'frontend/assets/mission-v7.js').read_text(encoding='utf-8').replace("import {get} from './api.js';",'').replace('export function ','function ')
html=html.replace('<script type="module" src="/assets/mission-v7.js"></script>','<script>'+mission_js+'</script>')
html=html.replace('<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">','')
out=ROOT/'preview.html'
out.write_text(html,encoding='utf-8')
print(f'Wrote {out} ({out.stat().st_size/1024:.1f} KB)')
