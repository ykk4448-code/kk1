"""Selected-task presentation follows saved evidence, including return visits and missing data."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def test_route_phases_positions_and_terminal_evidence():
    source = (ROOT / 'frontend/assets/mission-view.js').read_text(encoding='utf-8')
    source = source.replace('export function ', 'function ')
    checks = r'''
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const nodes = [{id:'H',x:0,y:0},{id:'A',x:10,y:0},{id:'D',x:30,y:0}];
const mission = {code:'T1',origin:'A',destination:'D',actual_start_min:2,
  actual_end_min:32,replay_end_min:32,outcome:'arrived',
  path_nodes:['H','A','H','D'],reposition_nodes:['H','A']};
const events = ['H','A','H','D'].map((node,i)=>({kind:'position',code:'T1',node,at_min:2+i*10}));
const before = JSON.stringify({mission,events,nodes});
assert(missionView(null,events,0,nodes) === null,'No selected task must remain empty');
let view = missionView(mission,events,0,nodes);
assert(view.stage==='pending' && view.position===null && view.progress===0,'Pending tasks cannot have an invented moving actor');
view = missionView(mission,events,7,nodes);
assert(view.stage==='reposition' && view.position.x===5,'Empty reposition must precede delivery');
assert(view.position.lat===null && view.position.lon===null,'Legacy XY must never acquire invented geographic coordinates');
view = missionView(mission,events,17,nodes);
assert(view.stage==='transport' && view.position.x===5,'Passing the pickup must change the phase');
view = missionView(mission,events,27,nodes);
assert(view.index===2 && view.position.x===15,'Repeated nodes must use chronological event order');
assert(view.traveled[1].id==='A' && view.traveled[2].id==='H','The traveled trace must preserve the return visit');
view = missionView(mission,events,50,nodes);
assert(view.stage==='delivered' && view.progress===100 && view.position.id==='D' && view.remaining.length===0,'Arrival evidence must terminate the route at the delivery node');
view = missionView({...mission,actual_end_min:null,outcome:'unknown'},events,50,nodes);
assert(view.stage==='unknown' && view.progress<100,'Elapsed time alone cannot fabricate a delivery');
const failed = {...mission,actual_end_min:17.5,outcome:'failed'};
assert(missionView(failed,events,20,nodes).position.x===missionView(failed,events,80,nodes).position.x,'A failed task must stop advancing');
view = missionView({...mission,actual_start_min:0},events,1,nodes);
assert(view.position===null,'The first future position cannot be rendered as an observed current location');
assert(JSON.stringify({mission,events,nodes})===before,'Rendering must not mutate saved evidence');
console.log('Mission phases / return visits / terminal evidence: PASS');
'''
    result = subprocess.run(['node', '--input-type=module', '--eval', source + checks],
                            capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
