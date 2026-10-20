/** Deterministic presentation of saved first-iteration evidence. No new simulation. */
export const FLIGHT_SPEEDS=[.25,.5,1,2];
export function advanceFlightTime(minute,elapsedMs,speed,duration){
 return Math.min(duration,minute+Math.max(0,Math.min(1000,elapsedMs))/1000*speed);
}
export function flightStage(vehicle){
 if(vehicle.evidence_incomplete)return 'unknown';
 if(vehicle.status==='delivered')return 'delivered';
 if(vehicle.status==='failed')return 'failed';
 if(vehicle.status!=='in_transit')return 'waiting';
 if(vehicle.progress_pct<6)return 'takeoff';
 if(vehicle.progress_pct>=90)return 'release';
 return 'cruise';
}
export const FLIGHT_LABELS={waiting:'等待派遣',takeoff:'起飞爬升',cruise:'途中飞行',release:'空投接近',delivered:'交付完成',failed:'任务中断',unknown:'结果待确认'};

/** Mirror the server replay projection from the same immutable node/position events.
 * Index once, then interpolate every craft on a single clock without network jitter.
 * Completion still requires a recorded arrived/failed event, never a visual phase.
 */
export function createFlightReplay(data){
 const nodes=new Map(data.network.nodes.map(n=>[n.id,n]));
 const geographic=new Set(data.network.nodes.filter(n=>Number.isFinite(n.lat)&&Number.isFinite(n.lon)).map(n=>`${n.lat},${n.lon}`)).size>=2;
 const events=new Map();
 for(const e of [...data.events].sort((a,b)=>a.at_min-b.at_min)){if(!events.has(e.code))events.set(e.code,[]);events.get(e.code).push(e);}
 const missions=new Map();
 for(const t of [...data.timeline].sort((a,b)=>a.actual_start_min-b.actual_start_min||a.code.localeCompare(b.code))){
  const evidence=events.get(t.code)||[];
  const points=[{at_min:t.actual_start_min,node:t.origin},...evidence.filter(e=>e.kind==='position'&&nodes.has(e.node))].sort((a,b)=>a.at_min-b.at_min);
  if(!missions.has(t.vehicle_id))missions.set(t.vehicle_id,[]);
  missions.get(t.vehicle_id).push({...t,points,evidence});
 }
 const coords=id=>Object.fromEntries(['lat','lon','x','y'].map(k=>[k,(!geographic&&['lat','lon'].includes(k))?null:Number.isFinite(nodes.get(id)?.[k])?nodes.get(id)[k]:null]));
 return minute=>{
  const vehicles=data.network.vehicles.map(v=>{
   const tasks=missions.get(v.id)||[];
   let position=coords(v.home_node),node=v.home_node,status=v.status==='available'?'standby':'unavailable';
   let consumed=0,speed=0,load=0,progress=0,code='',cargo='',taskId='',eta=null,completed=0,failed=0,incomplete=false;
   for(const task of tasks){
    const start=task.actual_start_min,end=task.replay_end_min;
    if(minute<start){if(status!=='unavailable')status='standby';break;}
    code=task.code;taskId=task.task_id;
    if(Number.isFinite(task.actual_end_min)&&minute>=end){
     const arrived=task.outcome==='arrived';completed+=Number(arrived);failed+=Number(!arrived);consumed+=task.distance_km||0;
     node=arrived?task.destination:task.evidence.filter(e=>nodes.has(e.node)).at(-1)?.node||task.origin;
     position=coords(node);status=arrived?'delivered':'failed';progress=100;continue;
    }
    progress=Math.min(1,Math.max(0,(minute-start)/Math.max(end-start,.001)));
    consumed+=(task.distance_km||0)*progress;load=task.weight_kg??null;cargo=task.cargo;
    speed=(task.distance_km||0)/Math.max(end-start,.001)*60;eta=Math.max(0,end-minute);status='in_transit';
    incomplete=!Number.isFinite(task.actual_end_min)&&minute>=end;
    let left=task.points[0];
    for(const p of task.points)if(p.at_min<=minute&&p.at_min>left.at_min)left=p;
    const right=task.points.find(p=>p.at_min>minute)||left;
    const a=coords(left.node),b=coords(right.node),ratio=Math.min(1,Math.max(0,(minute-left.at_min)/Math.max(right.at_min-left.at_min,.001)));
    position=Object.fromEntries(Object.keys(a).map(k=>[k,a[k]!=null&&b[k]!=null?a[k]+(b[k]-a[k])*ratio:a[k]]));
    node=left.node;progress*=100;break;
   }
   const remaining=Math.max(0,v.range_km-consumed);
   return {vehicle_id:v.id,code:v.code,name:v.name,category:v.category,capacity_kg:v.capacity_kg,status,
    mission_code:code,task_id:taskId,cargo,current_speed_kmh:speed,current_load_kg:load,
    remaining_range_km:remaining,range_remaining_pct:remaining/Math.max(v.range_km,.001)*100,eta_min:eta,
    ...position,coordinate_system:position.lat!=null&&position.lon!=null?'wgs84':'synthetic_xy',node_id:node,
    completed_tasks:completed,failed_tasks:failed,task_count:tasks.length,progress_pct:progress,evidence_incomplete:incomplete};
  });
  return {run_id:data.run_id,minute,source:'first_iteration_synthetic_events',vehicles,active_count:vehicles.filter(v=>v.status==='in_transit').length};
 };
}
