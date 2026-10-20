"""The smooth client replay must agree with the server at event boundaries."""
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from app.replay import assessment_projection, telemetry_at


def test_client_frames_match_server_evidence_at_boundaries():
    nodes = [dict(id='A', lat=26, lon=118, x=0, y=0),
             dict(id='B', lat=24, lon=121, x=90, y=60)]
    vehicles = [dict(id=v, code=v, name=v, home_node='A', status='available',
                     category='drone', range_km=200, capacity_kg=20) for v in ['V', 'W', 'IDLE']]
    assignments = [dict(task_id=v, code=v, vehicle_id=v, vehicle_code=v, cargo='医疗物资',
                        origin='A', destination='B', distance_km=60, weight_kg=10,
                        start_min=2, end_min=62, duration_min=60, deadline_min=100,
                        path_nodes=['A','B'], path_edges=['AB'], reposition_nodes=[])
                   for v in ['V', 'W']]
    events = [dict(code=v, kind=k, node=n, at_min=t) for v in ['V','W'] for k,n,t in
              [('dispatch','A',2),('position','A',2),('position','B',62),('arrived','B',62)]]
    # A failed craft ends at its last recorded position, without an invented arrival.
    events = [e for e in events if not (e['code']=='W' and e['at_min']>2)]
    events += [dict(code='W',kind='failed',node='A',at_min=30)]
    plan = dict(id='P', assignment_data=assignments, summary_data={}, snapshot_data=dict(
        nodes=nodes, edges=[], vehicles=vehicles,
        tasks=[dict(id=v,code=v,weight_kg=10) for v in ['V','W']],
        scenario=dict(network_id='civil-airdrop')))
    run = dict(id='R',events=events,metrics={},iterations=1,seed=7)
    times = [0,1.999,2,2.001,15.5,29.999,30,30.001,60,61.999,62,100]
    payload = dict(assessment=assessment_projection(run,plan,0),
                   frames=[telemetry_at(run,plan,t) for t in times])
    module = (ROOT/'frontend/assets/flight-replay.js').as_uri()
    script = """
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFlightReplay} from MODULE;
const payload=JSON.parse(fs.readFileSync(0,'utf8'));
const at=createFlightReplay(payload.assessment);
for(const expected of payload.frames){
 const actual=at(expected.minute);assert.equal(actual.active_count,expected.active_count);
 for(let i=0;i<actual.vehicles.length;i++)for(const [key,value] of Object.entries(expected.vehicles[i])){
  const observed=actual.vehicles[i][key];
  if(typeof value==='number'){
   const tolerance=['lat','lon','x','y'].includes(key)?1e-6:.051;
   assert.ok(Math.abs(observed-value)<=tolerance,`${expected.minute} ${key}: ${observed} vs ${value}`);
  }else assert.equal(observed,value,`${expected.minute} ${key}`);
 }
}
""".replace('MODULE',json.dumps(module))
    # Server response rounds minute to 2 decimals; preserve the requested sample time.
    for frame,time in zip(payload['frames'],times):
        frame['minute']=time
    result = subprocess.run(['node','--input-type=module','--eval',script],input=json.dumps(payload),
                            capture_output=True,text=True,encoding='utf-8',timeout=15)
    assert result.returncode == 0, result.stderr
