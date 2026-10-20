import {esc} from './charts.js';

export function shipmentView(tasks,timeline,minute){
 const grouped=new Map(),records=new Map(timeline.map(t=>[t.task_id,t]));
 for(const t of tasks||[]){if(!t.shipment_id)continue;if(!grouped.has(t.shipment_id))grouped.set(t.shipment_id,[]);grouped.get(t.shipment_id).push(t);}
 return [...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([id,tasks])=>{
  const legs=tasks.slice().sort((a,b)=>a.leg_index-b.leg_index).map(t=>{
   const r=records.get(t.id);let status=r?'waiting':'unassigned';
   if(r&&minute>=r.actual_start_min){status=r.actual_end_min!=null&&minute>=r.actual_end_min?(r.outcome==='arrived'?'delivered':'failed'):'in_transit';}
   return {...t,status,vehicle_code:r?.vehicle_code||'',end_min:r?.actual_end_min??r?.end_min};
  });
  const states=legs.map(l=>l.status),status=states.includes('failed')?'failed':states.includes('unassigned')?'unassigned':states.every(s=>s==='delivered')?'delivered':states.includes('delivered')&&!states.includes('in_transit')?'transferring':states.some(s=>s==='in_transit'||s==='delivered')?'in_transit':'waiting';
  return {id,cargo:legs[0].cargo,weight_kg:legs[0].weight_kg,origin:legs[0].origin,destination:legs.at(-1).destination,status,legs,completed_legs:states.filter(s=>s==='delivered').length};
 });
}

export function shipmentMarkup(groups,nodeName,selectedTask){
 const names={waiting:'待衔接',transferring:'接驳中',in_transit:'运输中',delivered:'已交付',failed:'链路中断',unassigned:'待规划'};
 const complete=groups.filter(g=>g.status==='delivered').length;
 return `<div class="shipment-overview"><b>${complete} / ${groups.length} 票已交付</b><small>陆运 → 港口交接 → 海运 → 末端配送</small></div>`+groups.map(g=>`<details class="shipment-row" ${g.legs.some(l=>l.id===selectedTask)?'open':''}><summary><b>${esc(g.id)} · ${esc(g.cargo)}</b><span class="shipment-status ${g.status}">${names[g.status]}</span><small>${esc(nodeName(g.origin))} → ${esc(nodeName(g.destination))}</small><small>${g.weight_kg.toLocaleString()} kg · ${g.completed_legs}/${g.legs.length} 段</small></summary><button class="shipment-route-button" data-shipment="${esc(g.id)}">查看整票运输路径 →</button><ol>${g.legs.map(l=>`<li class="${l.status}"><button data-mission="${esc(l.id)}" aria-label="查看运单分段 ${esc(l.code)}"><span>${l.leg_index}. ${l.transport_mode==='sea'?'海运':'陆运'} · ${names[l.status]}</span><b>${esc(nodeName(l.origin))} → ${esc(nodeName(l.destination))}</b><small>${esc(l.vehicle_code||'尚未分配')} ${l.handover_min?`· 接驳 ${l.handover_min} min`:''}${l.end_min!=null?` · 预计/记录 ${Number(l.end_min/60).toFixed(1)} h`:''}</small></button></li>`).join('')}</ol></details>`).join('');
}
