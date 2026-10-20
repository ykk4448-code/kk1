import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlightReplay,advanceFlightTime,flightStage} from '../assets/flight-replay.js';

const fixture=()=>({run_id:'R',network:{nodes:[{id:'A',lat:26,lon:118,x:0,y:0},{id:'B',lat:24,lon:121,x:90,y:60}],vehicles:[{id:'V',code:'UAV-1',category:'drone',home_node:'A',status:'available',range_km:200},{id:'W',code:'UAV-2',category:'drone',home_node:'A',status:'available',range_km:200}]},timeline:[{code:'T',task_id:'T',vehicle_id:'V',origin:'A',destination:'B',cargo:'医疗物资',weight_kg:10,distance_km:60,actual_start_min:2,replay_end_min:62,actual_end_min:62,outcome:'arrived'}],events:[{kind:'position',code:'T',node:'A',at_min:2},{kind:'position',code:'T',node:'B',at_min:62},{kind:'arrived',code:'T',node:'B',at_min:62}]});
test('continuous fleet projection preserves evidence, idle vehicles and exact end boundaries',()=>{
 const data=fixture(),before=JSON.stringify(data),at=createFlightReplay(data);
 assert.equal(at(0).vehicles[0].status,'standby');
 const halfway=at(32).vehicles[0];assert.equal(halfway.lat,25);assert.equal(halfway.lon,119.5);assert.equal(halfway.progress_pct,50);assert.equal(halfway.remaining_range_km,170);assert.equal(halfway.eta_min,30);
 assert.equal(at(32.1).vehicles[0].lat,25-(.1/30));
 assert.equal(at(61.999).vehicles[0].status,'in_transit');
 assert.equal(at(62).vehicles[0].status,'delivered');assert.equal(at(62).vehicles[0].current_load_kg,0);assert.equal(at(62).vehicles[0].current_speed_kmh,0);
 assert.equal(at(62).vehicles[1].status,'standby');assert.equal(at(62).active_count,0);
 assert.equal(at(0).vehicles[0].lon,118);assert.equal(JSON.stringify(data),before);
});
test('missing arrival never fabricates completion; failure stops at saved evidence',()=>{
 const data=fixture();data.timeline[0].actual_end_min=null;data.timeline[0].outcome='unknown';
 assert.equal(createFlightReplay(data)(80).vehicles[0].status,'in_transit');
 assert.equal(flightStage(createFlightReplay(data)(80).vehicles[0]),'unknown');
 data.timeline[0].actual_end_min=32;data.timeline[0].replay_end_min=32;data.timeline[0].outcome='failed';data.events=data.events.filter(e=>e.at_min<32);data.events.push({kind:'failed',code:'T',node:'A',at_min:32});
 assert.equal(createFlightReplay(data)(80).vehicles[0].status,'failed');assert.equal(createFlightReplay(data)(80).vehicles[0].lon,118);
});
test('legacy XY positions do not acquire invented geography',()=>{
 const data=fixture();for(const n of data.network.nodes){n.lat=0;n.lon=0;}
 const v=createFlightReplay(data)(32).vehicles[0];assert.equal(v.lat,null);assert.equal(v.lon,null);assert.equal(v.x,45);assert.equal(v.coordinate_system,'synthetic_xy');
});
test('slow wall-clock playback clamps background gaps and never overshoots',()=>{
 assert.equal(advanceFlightTime(0,500,.5,90),.25);assert.equal(advanceFlightTime(0,500,.25,90),.125);
 assert.equal(advanceFlightTime(0,30000,.5,90),.5);assert.equal(advanceFlightTime(89.9,500,2,90),90);
 assert.equal(flightStage({status:'in_transit',progress_pct:1}),'takeoff');assert.equal(flightStage({status:'in_transit',progress_pct:50}),'cruise');assert.equal(flightStage({status:'in_transit',progress_pct:95}),'release');assert.equal(flightStage({status:'delivered',progress_pct:100}),'delivered');
});
