"""Produce a standalone read-only AETHER 6.0 civilian airdrop preview with API snapshots.

Preview does not persist writes; real app works at http://localhost:8000.
"""
import os
import base64
from pathlib import Path
import json
import re
import sys
import tempfile
import secrets

ROOT=Path(__file__).resolve().parents[1]
os.environ['DEMO_MODE']='true'
preview_directory=tempfile.TemporaryDirectory(prefix='aether-preview-')
os.environ['DATABASE_URL']='sqlite:///'+str(Path(preview_directory.name)/'preview.sqlite3')
os.environ['SECRET_KEY']=secrets.token_urlsafe(48)
sys.path.insert(0,str(ROOT/'backend'))
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal,engine
from app.models import User
from app.security import hash_password

with TestClient(app) as client:
    build_username='preview-'+secrets.token_hex(8)
    build_password=secrets.token_urlsafe(32)
    with SessionLocal() as db:
        db.add(User(username=build_username,password_hash=hash_password(build_password),role='admin'))
        db.commit()
    token=client.post('/api/v1/auth/login',json={'username':build_username,'password':build_password}).json()['access_token']
    headers={'Authorization':'Bearer '+token}
    paths=['/health','/cities']
    cities=client.get('/api/v1/cities',headers=headers).json()
    for c in cities:
        cid=c['id']
        paths.extend([f'/network?city_id={cid}',f'/scenarios?city_id={cid}',f'/overview?city_id={cid}'])
    scenes=client.get('/api/v1/scenarios',headers=headers).json()
    for s in scenes:
        sid=s['id']
        paths.append(f"/network?city_id={s['city_id']}&network_id={s.get('network_id','baseline')}")
        paths.extend([f'/scenarios/{sid}/tasks',f'/scenarios/{sid}/configuration',f'/plans?scenario_id={sid}&limit=100',f'/simulations?scenario_id={sid}&limit=100',f'/experiments?scenario_id={sid}&limit=100'])
        for plan in client.get('/api/v1/plans',headers=headers,params={'scenario_id':sid,'limit':100}).json():
            paths.append(f"/plans/{plan['id']}")
        for experiment in client.get('/api/v1/experiments',headers=headers,params={'scenario_id':sid,'limit':100}).json():
            paths.append(f"/experiments/{experiment['id']}")
    for scen in scenes:
        for run in client.get('/api/v1/simulations',headers=headers,params={'scenario_id':scen['id']}).json():
            paths.extend([f"/simulations/{run['id']}",f"/simulations/{run['id']}/report",f"/simulations/{run['id']}/telemetry?minute=0.00"])
    for scen in scenes:
        for run in client.get('/api/v1/simulations',headers=headers,params={'scenario_id':scen['id']}).json():
            paths.append(f"/simulations/{run['id']}/assessment?minute=0.000")
    paths.append('/audit?limit=100')
    fixtures={path:client.get('/api/v1'+path,headers=headers).json() for path in paths}
    # A read-only preview needs TIME-DEPENDENT synthetic telemetry, not the
    # old T+0 response for every request. Sample server-calculated trajectories
    # along with event boundaries. The client interpolates between samples.
    replay_frames={}
    for scen in scenes:
        runs=client.get('/api/v1/simulations',headers=headers,params={'scenario_id':scen['id']}).json()
        for run in runs:
            rid=run['id']
            snapshot=fixtures.get(f'/simulations/{rid}/assessment?minute=0.000')
            if not snapshot:
                continue
            duration=float(snapshot.get('duration_min') or 1)
            # Regular samples plus exact event boundaries preserve discrete
            # departures, arrivals and disruptions in the preview.
            minutes={round(duration*i/90,3) for i in range(91)}
            minutes.update(round(float(e['at_min']),3) for e in snapshot.get('events',[])
                           if e.get('kind') in {'dispatch','arrived','failed','warning'} and e.get('at_min') is not None)
            replay_frames[rid]=[]
            for minute in sorted(t for t in minutes if 0<=t<=duration+.001):
                reply=client.get(f'/api/v1/simulations/{rid}/telemetry',headers=headers,params={'minute':minute})
                reply.raise_for_status()
                replay_frames[rid].append(reply.json())


html=(ROOT/'frontend/index.html').read_text(encoding='utf-8')
logo_uri='data:image/svg+xml;base64,'+base64.b64encode((ROOT/'frontend/assets/logo.svg').read_bytes()).decode('ascii')
html=html.replace('/assets/logo.svg',logo_uri)
css=(ROOT/'frontend/assets/styles.css').read_text(encoding='utf-8')
html=html.replace('<link rel="stylesheet" href="/assets/styles.css">','<style>'+css+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/workbench.css">','<style>'+(ROOT/'frontend/assets/workbench.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/design-v5.css">','<style>'+(ROOT/'frontend/assets/design-v5.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/mission-v6.css">','<style>'+(ROOT/'frontend/assets/mission-v6.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/mission-v7.css">','<style>'+(ROOT/'frontend/assets/mission-v7.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/cartographic-v8.css">','<style>'+(ROOT/'frontend/assets/cartographic-v8.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/lightblue-v9.css">','<style>'+(ROOT/'frontend/assets/lightblue-v9.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/engineering-v10.css">','<style>'+(ROOT/'frontend/assets/engineering-v10.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/map-workspace.css">','<style>'+(ROOT/'frontend/assets/map-workspace.css').read_text(encoding='utf-8')+'</style>')
# Frontend sources are ES modules. In preview only, flatten imports and exports
# into one classic script. This is a read-only rendering snapshot, not product code.
chunks=[]
for name in ['api.js','charts.js','mission-view.js','routes.js','map-data.js','map-math.js','map.js','workspace.js','shipment-view.js','experiment-console.js','flight-replay.js','assessment.js','navigation.js','app.js']:
    js=(ROOT/'frontend/assets'/name).read_text(encoding='utf-8')
    if name=='api.js':
        # A snapshot client has no authentication flow, token, or write access.
        js="""const previewIdentity={username:'offline-preview',role:'viewer'};
const get=async path=>{const response=await fetch('/api/v1'+path);const data=await response.json();if(!response.ok)throw new Error(data.detail||'快照数据不可用');return data;};
const previewWrite=async()=>{throw new Error('离线预览为只读快照，请启动服务运行实验');};
const post=previewWrite,patch=previewWrite,del=previewWrite,login=previewWrite;
const whoami=()=>previewIdentity;
const initAuth=async()=>previewIdentity;"""

    js=re.sub(r'^import\s+.+?;\s*$', '', js,flags=re.MULTILINE)
    js=re.sub(r'\bexport\s+(?=async|const|function|class|let)', '', js)
    chunks.append(js)
prelude='''const MOCK_PAYLOAD=__JSON__;
const MOCK_FRAMES=__FRAMES__;
// Preview-only interpolation of server-generated synthetic telemetry samples.
// Live deployments always request the actual /telemetry endpoint.
function previewTelemetry(path){
  const [base,query='']=path.split('?');
  if(!base.startsWith('/simulations/')||!base.endsWith('/telemetry'))return undefined;
  const rid=base.split('/')[2],frames=MOCK_FRAMES[rid];
  if(!frames||!frames.length)return undefined;
  const requested=Number(new URLSearchParams(query).get('minute')||0);
  const t=Math.min(frames[frames.length-1].minute,Math.max(0,Number.isFinite(requested)?requested:0));
  let low=0,high=frames.length-1;
  while(high-low>1){const mid=(low+high)>>1;if(frames[mid].minute<=t)low=mid;else high=mid;}
  const a=frames[low],b=frames[high];
  if(t>=b.minute)low=high;
  const left=frames[low],right=frames[Math.min(low+1,frames.length-1)];
  const out=structuredClone(left);
  const span=right.minute-left.minute,blend=span>0?Math.max(0,Math.min(1,(t-left.minute)/span)):0;
  if(blend>0&&blend<1){
    const nextById=new Map(right.vehicles.map(v=>[v.vehicle_id,v]));
    for(const vehicle of out.vehicles){
      const next=nextById.get(vehicle.vehicle_id);
      // Do not interpolate across dispatch, task, outcome or failure changes.
      if(!next||vehicle.status!=='in_transit'||next.status!=='in_transit'||vehicle.task_id!==next.task_id)continue;
      for(const key of ['lat','lon','x','y','current_speed_kmh','current_load_kg','remaining_range_km','range_remaining_pct','eta_min','progress_pct']){
        if(typeof vehicle[key]==='number'&&typeof next[key]==='number')
          vehicle[key]=Number((vehicle[key]+(next[key]-vehicle[key])*blend).toFixed(key==='lat'||key==='lon'?6:2));
      }
    }
  }
  out.minute=Number(t.toFixed(2));
  out.active_count=out.vehicles.filter(v=>v.status==='in_transit').length;
  out.position_note='离线预览：基于后端生成的仿真时刻样本插值；非实时设备数据';
  return out;
}
window.fetch=async function(url,options={}){
  const path=String(url).replace(/^\\/api\\/v1/,'');
  if((options.method||'GET')!=='GET')return {ok:false,status:405,json:async()=>({detail:'离线快照仅支持读取'})};
  let data;
  if(path.includes('/telemetry?minute=')){
    data=previewTelemetry(path);
  }else if(path.includes('/assessment?minute=')){
    const [base,query='']=path.split('?');
    const minute=new URLSearchParams(query).get('minute')||'0';
    const fixture=MOCK_PAYLOAD[base+'?minute=0.000'];
    if(fixture){data=structuredClone(fixture);data.telemetry=previewTelemetry(base.replace('/assessment','/telemetry')+'?minute='+minute);}
  }else{
    data=MOCK_PAYLOAD[path];
  }
  if(data===undefined)return {ok:false,status:501,json:async()=>({detail:'离线预览为只读快照，请启动正式服务执行写操作'})};
  return {ok:true,status:200,json:async()=>structuredClone(data)};
};'''
prelude=prelude.replace('__JSON__',json.dumps(fixtures,ensure_ascii=False,separators=(',',':')))
prelude=prelude.replace('__FRAMES__',json.dumps(replay_frames,ensure_ascii=False,separators=(',',':')))
html=html.replace('<link rel="stylesheet" href="/assets/map-comfort.css">','<style>'+(ROOT/'frontend/assets/map-comfort.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/regional.css">','<style>'+(ROOT/'frontend/assets/regional.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/platform.css">','<style>'+(ROOT/'frontend/assets/platform.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/airdrop-lab.css">','<style>'+(ROOT/'frontend/assets/airdrop-lab.css').read_text(encoding='utf-8')+'</style>')
html=html.replace('<link rel="stylesheet" href="/assets/aviation-home.css">','<style>'+(ROOT/'frontend/assets/aviation-home.css').read_text(encoding='utf-8')+'</style>')
js=prelude+'\n'+'\n'.join(chunks)
html=html.replace('<script type="module" src="/assets/app.js"></script>','<script>'+js+'</script>')
mission_js=(ROOT/'frontend/assets/mission-v7.js').read_text(encoding='utf-8').replace("import {get} from './api.js';",'').replace('export function ','function ')
mission_js='(function(){\n'+mission_js+'\n})();'  # Keep module-local names such as safe/cache isolated.
html=html.replace('<script type="module" src="/assets/mission-v7.js"></script>','<script>'+mission_js+'</script>')
html=html.replace('<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">','')
# Keep the generated aviation artwork available in the standalone offline preview.
hero_uri='data:image/webp;base64,'+base64.b64encode((ROOT/'frontend/assets/aviation-hero.webp').read_bytes()).decode('ascii')
html=html.replace('/assets/aviation-hero.webp',hero_uri)
out=ROOT/'preview.html'
out.write_text(html,encoding='utf-8')
print(f'Wrote {out} ({out.stat().st_size/1024:.1f} KB)')

engine.dispose()
preview_directory.cleanup()
