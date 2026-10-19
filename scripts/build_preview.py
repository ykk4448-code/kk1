"""Build an entirely self-contained design-preview (without mocking actual app files).
Used only by local screenshot smoke tests when browsers cannot reach localhost.
"""
import json
import os
os.environ.setdefault("DEMO_MODE", "true")
import re
import sys
from pathlib import Path
from html import escape

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from fastapi.testclient import TestClient
from app.main import app

with TestClient(app) as client:
    tok=client.post('/api/v1/auth/login',json={'username':'admin','password':'demo123456'}).json()['access_token']
    headers={'Authorization':'Bearer '+tok}
    paths=['/health','/scenarios','/network','/overview']
    for id in ('SCN-001','SCN-002','SCN-003'):
        paths.extend([f'/scenarios/{id}/tasks',f'/plans?scenario_id={id}',f'/simulations?scenario_id={id}'])
    paths.append('/audit')
    fixtures={p:client.get('/api/v1'+p,headers=headers).json() for p in paths}
html=(ROOT/'frontend/index.html').read_text()
css=(ROOT/'frontend/assets/styles.css').read_text()
html=html.replace('<link rel="stylesheet" href="/assets/styles.css" />','<style>'+css+'</style>')
api=re.sub(r'\bexport\s+(?=async|const|function)','',(ROOT/'frontend/assets/api.js').read_text())
charts=re.sub(r'\bexport\s+(?=async|const|function)','',(ROOT/'frontend/assets/charts.js').read_text())
script=re.sub(r'^import\s+.*?;\s*$', '', (ROOT/'frontend/assets/app.js').read_text(),flags=re.M)
fixture_json=json.dumps(fixtures,ensure_ascii=False)
prelude='''
window.fetch=async function(url,options={}){
 const path=String(url).replace(/^\\/api\\/v1/,'');
 if(path==='/auth/login')return {ok:true,status:200,json:async()=>({access_token:'fake-local-session',token_type:'bearer',user:{username:'admin',role:'admin'}})};
 if(path==='/auth/me')return {ok:true,status:200,json:async()=>({username:'admin',role:'admin'})};
 const data=MOCK_PAYLOAD[path];
 if(data===undefined)return {ok:false,status:404,json:async()=>({detail:'Not implemented in static preview'})};
 return {ok:true,status:200,json:async()=>structuredClone(data)};
};
'''
combined=f'const MOCK_PAYLOAD={fixture_json};\n'+prelude+api+'\n'+charts+'\n'+script
html=html.replace('<script type="module" src="/assets/app.js"></script>','<script>'+combined+'</script>')
out=ROOT/'preview.html'
out.write_text(html)
print('Built',out,round(out.stat().st_size/1024),'KB')
