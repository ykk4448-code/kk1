import test from 'node:test';
import assert from 'node:assert/strict';
import {routeCatalog,routeSegments} from '../assets/routes.js';

const network={edges:[{id:'e1',source:'a',target:'b'},{id:'e2',source:'b',target:'c'}]};
const assignment=(task,vehicle,nodes,edges)=>({task_id:task,code:task,vehicle_id:vehicle,vehicle_code:vehicle,path_nodes:nodes,path_edges:edges});
const plan={assignment_data:[assignment('t1','v1',['a','b','c'],['e1','e2']),assignment('t2','v2',['b','a'],['e1']),assignment('t3','v1',['b','a'],['e1'])]};

test('all missions remain visible and shared channels occupy distinct lanes',()=>{
 const catalog=routeCatalog(plan);assert.equal(catalog.length,2);assert.notEqual(catalog[0].color,catalog[1].color);
 const segments=routeSegments(network,plan,{selectedTask:'t1',selectedVehicle:'v1'});
 assert.equal(segments.length,3);
 const shared=segments.filter(s=>s.edge.id==='e1');assert.equal(shared.length,2);assert.notEqual(shared[0].offset,shared[1].offset);
 const first=shared.find(s=>s.vehicle_id==='v1');assert.deepEqual(first.directions,[1,-1]);assert.equal(first.tasks.length,2);assert.equal(first.selected,true);
 assert.equal(shared.find(s=>s.vehicle_id==='v2').selected,false);
});
test('scope isolates a vehicle or exact task without replacing the network',()=>{
 const vehicle=routeSegments(network,plan,{scope:'vehicle',selectedVehicle:'v2'});assert.equal(vehicle.length,1);assert.equal(vehicle[0].vehicle_id,'v2');
 const task=routeSegments(network,plan,{scope:'task',selectedTask:'t3'});assert.equal(task.length,1);assert.deepEqual(task[0].directions,[-1]);
 assert.equal(network.edges.length,2);
});
test('invalid topology and absent selected tasks never produce invented paths',()=>{
 assert.deepEqual(routeSegments(network,{assignment_data:[assignment('bad','v1',['a','c'],['e1'])]}),[]);
 assert.deepEqual(routeSegments(network,plan,{scope:'task',selectedTask:'missing'}),[]);
 assert.deepEqual(routeCatalog(null),[]);
});
