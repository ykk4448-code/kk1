import test from 'node:test';
import assert from 'node:assert/strict';
import {shipmentView} from '../assets/shipment-view.js';
import {routeSegments} from '../assets/routes.js';

const tasks=[1,2,3].map(i=>({id:'L'+i,shipment_id:'S1',leg_index:i,cargo:'医疗物资',weight_kg:1200,transport_mode:i===2?'sea':'road',origin:'N'+i,destination:'N'+(i+1)}));
const timeline=[{task_id:'L1',actual_start_min:0,actual_end_min:10,outcome:'arrived'},{task_id:'L2',actual_start_min:70,actual_end_min:200,outcome:'arrived'},{task_id:'L3',actual_start_min:245,actual_end_min:260,outcome:'arrived'}];
test('one consignment remains in transfer while the next leg waits for loading',()=>{
 const group=shipmentView(tasks,timeline,40)[0];assert.equal(group.status,'transferring');assert.equal(group.completed_legs,1);assert.equal(group.legs[1].status,'waiting');assert.equal(group.weight_kg,1200);
 assert.equal(shipmentView(tasks,timeline,100)[0].status,'in_transit');assert.equal(shipmentView(tasks,timeline,260)[0].status,'delivered');
});
test('missing or failed legs never appear as an end-to-end delivery',()=>{
 assert.equal(shipmentView(tasks,timeline.slice(0,2),1000)[0].status,'unassigned');
 assert.equal(shipmentView(tasks,timeline.map(t=>t.task_id==='L2'?{...t,outcome:'failed'}:t),1000)[0].status,'failed');
});
test('whole consignment geometry excludes carrier reposition and other consignments',()=>{
 const network={edges:[{id:'E0',source:'DEPOT',target:'N1'},{id:'E1',source:'N1',target:'N2'},{id:'E2',source:'N2',target:'N3'}]};
 const plan={assignment_data:[{task_id:'L1',shipment_id:'S1',vehicle_id:'TRUCK',vehicle_code:'T1',reposition_nodes:['DEPOT','N1'],path_nodes:['DEPOT','N1','N2'],path_edges:['E0','E1']},{task_id:'OTHER',shipment_id:'S2',vehicle_id:'SHIP',vehicle_code:'S2',path_nodes:['N2','N3'],path_edges:['E2']}]};
 const segments=routeSegments(network,plan,{scope:'shipment',selectedShipment:'S1'});assert.deepEqual(segments.map(s=>s.edge.id),['E1']);
});
