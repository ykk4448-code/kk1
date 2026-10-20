/** Route geometry is derived from persisted assignments, never decorative lines. */
export const ROUTE_PALETTE=['#2563b9','#ba572a','#008578','#9b43a4','#69851e','#b33b64','#397eaa','#885e24','#5952b4','#008aa0','#a96906','#725b90','#b14738','#347843','#6b6d21','#a1457d'];

export function routeCatalog(plan){
 const grouped=new Map();
 for(const a of plan?.assignment_data||[]){if(!grouped.has(a.vehicle_id))grouped.set(a.vehicle_id,{id:a.vehicle_id,code:a.vehicle_code,assignments:[]});grouped.get(a.vehicle_id).assignments.push(a);}
 return [...grouped.values()].sort((a,b)=>String(a.id).localeCompare(String(b.id))).map((v,i)=>({...v,color:ROUTE_PALETTE[i%ROUTE_PALETTE.length]}));
}

export function routeSegments(network,plan,{scope='all',selectedVehicle='',selectedTask='',selectedShipment=''}={}){
 const edges=new Map((network?.edges||[]).map(e=>[e.id,e]));
 const catalog=routeCatalog(plan), groups=new Map();
 for(const vehicle of catalog)for(const a of vehicle.assignments){
  if(scope==='vehicle'&&a.vehicle_id!==selectedVehicle)continue;
  if(scope==='task'&&a.task_id!==selectedTask)continue;
  if(scope==='shipment'&&a.shipment_id!==selectedShipment)continue;
  for(let i=scope==='shipment'?Math.max(0,(a.reposition_nodes?.length||1)-1):0;i<(a.path_edges||[]).length;i++){
   const edge=edges.get(a.path_edges[i]);if(!edge)continue;
   const source=a.path_nodes?.[i],target=a.path_nodes?.[i+1];
   if(!((edge.source===source&&edge.target===target)||(edge.source===target&&edge.target===source)))continue;
   const key=`${edge.id}:${vehicle.id}`;
   if(!groups.has(key))groups.set(key,{edge,vehicle_id:vehicle.id,code:vehicle.code,color:vehicle.color,tasks:[],directions:new Set(),selected:false});
   const segment=groups.get(key);if(!segment.tasks.some(t=>t.task_id===a.task_id))segment.tasks.push(a);
   segment.directions.add(source===edge.source?1:-1);segment.selected ||= a.task_id===selectedTask;
  }
 }
 const lanes=new Map();for(const segment of groups.values()){if(!lanes.has(segment.edge.id))lanes.set(segment.edge.id,[]);lanes.get(segment.edge.id).push(segment);}
 const result=[];
 for(const segments of lanes.values())segments.forEach((s,i)=>result.push({...s,directions:[...s.directions],offset:(i-(segments.length-1)/2)*Math.min(5,24/segments.length),shared:segments.length}));
 return result.sort((a,b)=>Number(a.selected)-Number(b.selected));
}
