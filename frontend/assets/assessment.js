import {createFlightReplay,advanceFlightTime,flightStage,FLIGHT_LABELS,FLIGHT_SPEEDS} from './flight-replay.js';
import {consoleMarkup,comparisonMarkup,DEFAULT_VARIABLES} from './experiment-console.js';
import {get} from './api.js';
import {esc,icon} from './charts.js';
import {geoMapMarkup,renderGeoMap,mapCommand} from './map.js';
import {shipmentView,shipmentMarkup} from './shipment-view.js';
import {missionView} from './mission-view.js';
import {routeCatalog} from './routes.js';

const fmt=(v,d=1)=>v==null?'—':Number(v).toFixed(d);
const stateNames={standby:'等待任务',in_transit:'空投中',delivered:'已交付',failed:'任务中断',unavailable:'不可用'};
const safe=v=>esc(String(v??'').replaceAll('\u6c11\u7528',''));
const clock=v=>`T+${fmt(v,1)}`;

export function assessmentMarkup(context){
 const runs=context.runs||[];
 return `<section class="assessment" id="assessment" aria-label="任务综合评估工作台">
  <div class="assessment-toolbar"><div class="desk-title"><span class="desk-symbol">${icon('chart',19)}</span><div><strong>任务综合评估工作台</strong><small>时序 · 空间 · 运力 · 结果同步分析</small></div></div>
   <div class="desk-actions"><label>推演记录<select id="assessment-run" aria-label="选择评估运行">${runs.map(r=>`<option value="${safe(r.id)}" ${r.id===context.run?.id?'selected':''}>${safe(r.id)} · ${r.iterations} 轮</option>`).join('')||'<option>暂无推演记录</option>'}</select></label><button class="button button-light" data-desk="csv" ${runs.length?'':'disabled'}>${icon('download',15)} 导出结果</button><button class="icon-button" data-desk="fullscreen" aria-label="全屏评估工作台" title="全屏评估工作台">⛶</button></div>
  </div>
  ${context.denseScenario&&context.scenarioId!==context.denseScenario.id?`<div class="desk-data-note"><span>历史相对坐标快照 · ${context.plan?.snapshot_data?.nodes?.length||0} 设施 / ${context.plan?.snapshot_data?.edges?.length||0} 通道</span><button data-desk="dense">查看合成 XY 示意 →</button></div>`:''}
  <div id="desk-content"><div class="desk-loading" role="status"><span class="loading-spinner"></span>正在读取任务快照与推演证据…</div></div>
 </section>`;
}

export function mountAssessment(context){
 const el=document.getElementById('assessment');if(!el)return {destroy(){}};
 const controller=new AbortController();const options={signal:controller.signal};
 let disposed=false,data=null,telemetry=null,selected='',selectedTask='',mapMode='overview',routeScope='all',filter='all',query='',minute=context.minute||0,playing=false,speed=.5,timer=0,pending=0,ticket=0,lastError='',layers={facilities:true,links:true,formations:true,routes:true,labels:true};
 const experimentOptions={
  weather:[['clear','晴朗'],['rain','降雨'],['wind','有风'],['fog','低能见度']],
  wind_kmh:[['5','5 km/h'],['8','8 km/h'],['15','15 km/h'],['25','25 km/h'],['40','40 km/h'],['55','55 km/h']],
  rain:[['none','无降雨'],['light','小雨'],['moderate','中雨']],
  cloud_base:[['high','较高'],['medium','中等'],['low','较低']],
  sea_state:[['calm','平稳'],['moderate','中等'],['rough','较大涌浪']],
  payload_profile:[['light','轻载物资'],['standard','标准物资'],['medical','医疗物资']],
  altitude_profile:[['conservative','保守'],['standard','标准'],['high','较高']],
  battery_reserve_pct:[['20','20%'],['30','30%'],['40','40%']],fleet_profile:[['compact','精简'],['standard','标准'],['reinforced','增强']]
 };
 const experimentVars={fleet_profile:'standard',weather:'clear',wind_kmh:'8',rain:'none',cloud_base:'high',sea_state:'calm',payload_profile:'standard',altitude_profile:'standard',battery_reserve_pct:'30'};
 try{
  const saved=JSON.parse(localStorage.getItem('aether-civil-airdrop-experiment-v1')||'null');
  if(saved&&typeof saved==='object')for(const key of Object.keys(experimentOptions)){
   if(experimentOptions[key].some(([value])=>value===saved[key]))experimentVars[key]=saved[key];
  }
 }catch{}
 const recorded=context.run?.experiment_data||{};for(const key of Object.keys(experimentOptions)){if(experimentOptions[key].some(([value])=>value===String(recorded[key])))experimentVars[key]=String(recorded[key]);}

 const $=q=>el.querySelector(q);
 const revealMission=()=>{if(!context.sharedMap||innerWidth<=1150)return;document.body.classList.remove('workspace-show-events','workspace-show-fleet','workspace-show-shipments');document.body.classList.add('workspace-show-inspector');document.querySelectorAll('[data-workspace-tool=inspector],[data-workspace-tool=events],[data-workspace-tool=fleet]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.workspaceTool==='inspector')));};
 const regional=false;let replayFrame=null,lastTick=0;
 const currentVehicle=()=>telemetry?.vehicles?.find(v=>v.vehicle_id===selected);
 const vehicleColor=id=>routeCatalog(context.plan).find(v=>v.id===id)?.color||'#8397a7';
 const selectedMission=()=>data?.timeline.find(t=>t.task_id===selectedTask);
 const taskView=()=>missionView(selectedMission(),data?.events||[],minute,data?.network.nodes||[]);
 const nodeName=id=>data?.network.nodes.find(n=>n.id===id)?.name||id;
 const maxTime=()=>data?.duration_min||1;
 const xPos=t=>Math.max(0,Math.min(1,t/maxTime()))*100;
 const matched=()=>data.timeline.filter(t=>(!selected||filter!=='selected'||t.vehicle_id===selected)&&(!query||`${t.code} ${t.cargo} ${t.vehicle_code}`.toLowerCase().includes(query.toLowerCase()))&&(filter!=='failed'||t.outcome==='failed')&&(filter!=='late'||(t.actual_end_min!=null&&t.actual_end_min>t.deadline_min)));
 function taskStatus(t){if(minute<t.actual_start_min)return 'pending';if(t.actual_end_min==null||minute<t.actual_end_min)return 'active';return t.outcome==='arrived'?'delivered':'failed';}
 function phases(t){
  if(t.task_id!==selectedTask)return '';
  return `<div class="task-phases"><div><span>派遣</span><i style="left:calc(104px + (100% - 122px)*${xPos(t.actual_start_min)/100})"></i><small>${clock(t.actual_start_min)}</small></div><div><span>直达空投段</span><div class="phase-track">${(t.segments||[]).map(segment=>`<b style="left:${xPos(segment.start_min)}%;width:${Math.max(.8,xPos(segment.end_min)-xPos(segment.start_min))}%" title="${safe(nodeName(segment.source))} → ${safe(nodeName(segment.target))} · ${clock(segment.start_min)} — ${clock(segment.end_min)}"></b>`).join('')}</div></div><div><span>${t.outcome==='failed'?'任务中断':'交付'}</span><i class="${t.outcome==='failed'?'failed':''}" style="left:calc(104px + (100% - 122px)*${xPos(t.replay_end_min)/100})"></i><small>${t.actual_end_min==null?'缺少结束事件':clock(t.actual_end_min)}</small></div></div>`;
 }
 function timeline(){
  const rows=matched();const tickCount=5;
  return `<div class="schedule-tools"><input id="desk-search" placeholder="搜索任务 / 平台 / 物资" value="${safe(query)}" aria-label="搜索评估任务"><select id="desk-filter" aria-label="筛选评估任务">${[['all','全部任务'],['selected','选中平台'],['late','延迟交付'],['failed','中断任务']].map(([v,n])=>`<option value="${v}" ${filter===v?'selected':''}>${n}</option>`).join('')}</select></div>
  <div class="schedule-ruler"><span>平台 / 任务</span><div>${Array.from({length:tickCount},(_,i)=>`<small style="left:${i/(tickCount-1)*100}%">${fmt(maxTime()*i/(tickCount-1),0)}</small>`).join('')}</div></div>
  <div class="schedule-scroll">${rows.length?rows.map(t=>`<button class="schedule-row ${selectedTask===t.task_id?'chosen':''}" data-mission="${safe(t.task_id)}" style="--route-color:${vehicleColor(t.vehicle_id)}" aria-label="选择任务 ${safe(t.code)}" aria-pressed="${selectedTask===t.task_id}"><span class="schedule-label"><b>${safe(t.vehicle_code)}</b><small>${safe(t.code)} · ${safe(t.cargo)}</small></span><span class="schedule-track"><span class="planned-bar" style="left:${xPos(t.start_min)}%;width:${Math.max(.8,xPos(t.end_min)-xPos(t.start_min))}%" title="计划 ${clock(t.start_min)} 至 ${clock(t.end_min)}"></span><span class="actual-bar ${t.outcome==='failed'?'interrupted':''}" style="left:${xPos(t.actual_start_min)}%;width:${Math.max(1,xPos(t.replay_end_min)-xPos(t.actual_start_min))}%" title="首次迭代 ${clock(t.actual_start_min)} 至 ${clock(t.actual_end_min)}"></span>${t.incidents.map(at=>`<span class="incident-mark" style="left:${xPos(at)}%" title="环境扰动 ${clock(at)}">!</span>`).join('')}<i class="task-end" style="left:${xPos(t.replay_end_min)}%"></i><i class="schedule-now" style="left:${xPos(minute)}%"></i></span></button>${phases(t)}`).join(''):'<div class="desk-empty">没有符合条件的任务</div>'}</div>
  <div class="schedule-legend"><span><i class="key-planned"></i>计划时段</span><span><i class="key-actual"></i>首次迭代</span><span><i class="key-warning"></i>扰动</span><small>单位：分钟</small></div>`;
 }
 function trend(){
  const w=960,h=120,l=44,r=43,top=12,bottom=28,iw=w-l-r,ih=h-top-bottom,max=Math.max(1,data.total_tasks);
  const px=t=>l+t/maxTime()*iw,py=v=>top+(1-v/100)*ih;
  const points=(key,isPct)=>trendPoints(key,isPct);
  return `<div class="trend-legend"><span><i style="background:#178e93"></i>已结束任务成功率 · 左轴</span><span><i style="background:#3779ce"></i>累计交付 · 右轴</span><span><i style="background:#db9043"></i>累计中断 · 右轴</span><small>成功率 = 交付 / 已结束任务</small></div><svg class="assessment-trend" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="按推演时间统计的已结束任务成功率、累计交付和中断数量；点击曲线定位时间" data-time-chart="true">${[0,25,50,75,100].map(v=>`<line x1="${l}" y1="${py(v)}" x2="${w-r}" y2="${py(v)}" stroke="#e6ecf2"/><text x="${l-9}" y="${py(v)+4}" text-anchor="end">${v}%</text><text x="${w-r+9}" y="${py(v)+4}">${fmt(max*v/100,0)}</text>`).join('')}${[0,1,2,3,4,5,6].map(i=>`<text x="${px(maxTime()*i/6)}" y="${h-6}" text-anchor="middle">T+${fmt(maxTime()*i/6,0)}</text>`).join('')}<polyline data-trend="success_pct" points="${points('success_pct',true)}" stroke="#178e93"/><polyline data-trend="delivered" points="${points('delivered',false)}" stroke="#3779ce"/><polyline data-trend="failed" points="${points('failed',false)}" stroke="#db9043"/><line id="desk-trend-cursor" x1="${px(minute)}" x2="${px(minute)}" y1="${top}" y2="${h-bottom}" stroke="#e16258" stroke-dasharray="4 3"/><rect x="${l}" y="${top}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
 }
 function trendPoints(key,isPct){
  const rows=data.trend.filter(p=>p.minute<=minute&&p[key]!=null),max=Math.max(1,data.total_tasks);
  const xy=(at,value)=>`${44+at/maxTime()*873},${12+(1-(isPct?value:value/max*100)/100)*80}`;
  return rows.flatMap((p,i)=>i?[xy(p.minute,rows[i-1][key]),xy(p.minute,p[key])]:[xy(p.minute,p[key])]).concat(rows.length?[xy(minute,rows.at(-1)[key])]:[]).join(' ');
 }
 function flightDeck(){return `<section class="flight-deck" aria-label="动态投送播放控制"><div class="flight-controls"><div class="flight-title"><i></i><span>动态投送<small>首次迭代 · 事件回放</small></span></div><button id="desk-play" data-desk="play" aria-label="开始动态投送" aria-pressed="false">▶ 开始演示</button><button data-desk="reset" title="回到起点并暂停">↺ 重置</button><label class="flight-speed">速度<select id="desk-speed" aria-label="回放速度">${FLIGHT_SPEEDS.map(v=>`<option value="${v}" ${v===speed?'selected':''}>${v}×${v===.5?' · 慢速':''}</option>`).join('')}</select></label><span class="flight-time"><b id="desk-time">T+0.0</b><span id="desk-time-end"></span></span><span id="flight-play-state" role="status">准备就绪</span></div><div class="flight-stage-counts" id="flight-stage-counts"></div></section>`;}
 function syncPlayback(message=''){
  el.classList.toggle('flight-is-playing',playing);
  document.body.classList.toggle('flight-replay-active',playing);
  const button=$('#desk-play');if(!button)return;
  const ended=minute>=maxTime();button.textContent=playing?'Ⅱ 暂停演示':ended?'↻ 再次演示':minute>0?'▶ 继续演示':'▶ 开始演示';
  button.setAttribute('aria-label',playing?'暂停动态投送':ended?'重新播放动态投送':'开始动态投送');button.setAttribute('aria-pressed',String(playing));
  $('#flight-play-state').textContent=message||(playing?'正在播放':ended?'演示结束':minute>0?'已暂停':'准备就绪');
 }
 function updateFlightStages(){
  const counts={waiting:0,takeoff:0,cruise:0,release:0,delivered:0,failed:0,unknown:0};
  for(const v of telemetry.vehicles)if(v.task_count)counts[flightStage(v)]++;
  $('#flight-stage-counts').innerHTML=Object.entries(counts).filter(([key,value])=>!['failed','unknown'].includes(key)||value).map(([key,value])=>`<span class="flight-phase ${key}"><i></i>${FLIGHT_LABELS[key]}<b>${value}</b></span>`).join('')+`<small>起飞 / 接近为进度分段 · 交付以事件为准</small>`;
 }
 function inspector(){
  const v=currentVehicle(),mission=selectedMission();
  if(!v)return '<div class="desk-empty">选择平台查看状态</div>';
  const civilAirdrop=data.network?.network_id==='civil-airdrop';
  const speedUnit=civilAirdrop?'模型单位/h':'km/h';
  const rangeUnit=civilAirdrop?'模型单位':'km';
  const rangeLabel=civilAirdrop?'剩余模型续航':'剩余模拟航程';
  const position=v.coordinate_system==='wgs84'?`${fmt(v.lon,4)}°E<br>${fmt(v.lat,4)}°N`:`X ${fmt(v.x,1)} / Y ${fmt(v.y,1)}<small>${civilAirdrop?'合成相对坐标':'历史相对坐标'}</small>`;
  return `<div class="inspector-identity"><span class="vehicle-glyph">${icon(v.category==='ship'?'ship':v.category==='drone'?'target':'truck',26)}</span><div><b>${safe(v.code)}</b><small>${v.category==='ship'?'运输货船':v.category==='truck'?'干线货车':v.category==='drone'?'空投无人机':'无人地面平台'}</small></div><span class="state-pill ${v.status}">${stateNames[v.status]||safe(v.status)}</span></div><div class="inspector-position"><span>位置</span><b class="mono">${position}</b></div><div class="inspector-metrics"><div><span>当前速度</span><b>${fmt(v.current_speed_kmh)}<small> ${speedUnit}</small></b></div><div><span>当前载重</span><b>${fmt(v.current_load_kg)}<small> kg</small></b></div></div><div class="range-status"><div><span>剩余燃料 / 电量</span><b>${fmt(v.range_remaining_pct,0)}%</b></div><div class="range-track"><i style="width:${v.range_remaining_pct}%"></i></div><small>电动无人机 · 按模型续航比例折算</small><div class="inspector-endurance"><span>${rangeLabel}</span><b>${fmt(v.remaining_range_km)} ${rangeUnit}</b></div></div><dl class="inspector-facts"><div><dt>当前任务</dt><dd>${safe(v.mission_code||'尚未派遣')}</dd></div><div><dt>装载物资</dt><dd>${safe(v.cargo||'未装载')}</dd></div><div><dt>预计剩余</dt><dd>${v.eta_min==null?'—':fmt(v.eta_min)+' min'}</dd></div><div><dt>任务进度</dt><dd>${fmt(v.progress_pct,0)}%</dd></div><div><dt>已交付 / 分配</dt><dd>${v.completed_tasks} / ${v.task_count}</dd></div></dl>${mission?`<div class="selected-mission"><small>选中任务 · ${safe(mission.code)}</small><b>${safe(mission.cargo)}</b><p>${safe(nodeName(mission.origin))} → ${safe(nodeName(mission.destination))}</p><div>计划 ${clock(mission.start_min)} — ${clock(mission.end_min)}</div><div>截止 ${clock(mission.deadline_min)} · ${fmt(mission.weight_kg)} kg</div></div>`:''}<p class="inspector-footnote">平台状态由首次迭代事件推算，不是实际设备传感数据。</p>`;
 }
 function fleet(){const speedUnit=data.network?.network_id==='civil-airdrop'?'模型单位/h':'km/h';return (telemetry?.vehicles||[]).map(v=>`<button class="fleet-row ${v.vehicle_id===selected?'selected':''}" data-vehicle="${safe(v.vehicle_id)}" aria-pressed="${v.vehicle_id===selected}" style="--route-color:${vehicleColor(v.vehicle_id)}"><span class="fleet-route-key" title="与地图路线同色"></span><span><b>${safe(v.code)}</b><small>${safe(v.mission_code||'待命')}</small></span><span class="fleet-status">${stateNames[v.status]||safe(v.status)}</span><span class="mono">${fmt(v.current_speed_kmh,0)}<small> ${speedUnit}</small></span></button>`).join('');}
 function missionSummary(){
  const mission=selectedMission(),view=taskView();
  if(!mission||!view)return '<div class="mission-focus-empty">选择左侧任务，查看装载、空投与交付过程。</div>';
  const stage=view.stage==='unknown'?'unknown':flightStage({status:view.stage==='pending'?'standby':view.stage==='delivered'?'delivered':view.stage==='failed'?'failed':'in_transit',progress_pct:view.progress}),stageIndex={waiting:0,takeoff:1,cruise:2,release:3,delivered:4,failed:4,unknown:4}[stage];
  const steps=['等待派遣','起飞爬升','途中飞行','空投接近','交付完成'].map(label=>[label]);
  const here=view.stage==='pending'?`等待 ${clock(mission.actual_start_min)} 派遣`:view.stage==='delivered'?`已送达 ${nodeName(mission.destination)}`:view.stage==='failed'?'任务已中断':view.stage==='unknown'?'缺少交付证据，等待确认':`${view.from?.name||'当前通道'} → ${view.next?.name||nodeName(mission.destination)}`;
  return `<div class="mission-focus-heading"><div><span class="mission-focus-code">${safe(mission.code)}</span><strong>${safe(mission.cargo)}</strong><span class="mission-focus-platform">${safe(mission.vehicle_code)} · ${fmt(mission.weight_kg,0)} kg</span></div><span class="mission-phase-badge ${view.stage}">${safe(FLIGHT_LABELS[stage]||view.label)}</span></div>
   <div class="mission-endpoints"><div><i>取</i><span><small>装载区</small><b>${safe(nodeName(mission.origin))}</b></span></div><span class="mission-direction">→</span><div><i>送</i><span><small>接收区</small><b>${safe(nodeName(mission.destination))}</b></span></div></div>
   <ol class="mission-stage-list">${steps.map(([label],i)=>`<li class="${i<stageIndex?'done':i===stageIndex?'current':''} "><i>${i<stageIndex?'✓':i+1}</i><span>${i===4&&view.stage==='failed'?'任务中断':i===4&&view.stage==='unknown'?'结果待确认':label}</span></li>`).join('')}</ol>
   <div class="mission-route-progress"><span>${safe(here)}</span><b>路线 ${fmt(view.progress,0)}%</b><div><i style="width:${view.progress}%"></i></div></div>`;
 }
 function updateMission(){const target=$('#desk-mission-focus');if(target)target.innerHTML=missionSummary();el.querySelectorAll('[data-map-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mapMode===mapMode)));}
 function drawMap(){renderGeoMap(data.network,context.city,context.plan,{cities:context.cities,onCity:context.onCity,routes:true,routeScope,selectedShipment:data.tasks?.find(t=>t.id===selectedTask)?.shipment_id,historical:true,layers,telemetry,minute,run:context.run,selectedVehicle:selected,selectedTask,missionView:mapMode==='focus'?taskView():null,mapMode,animate:playing,formations:[],onSelectVehicle:selectVehicle,onSelectTask:selectTask,onRouteScope:scope=>{routeScope=scope;drawMap();}});}
 function selectTask(id){const row=data.timeline.find(t=>t.task_id===id);if(!row)return;selected=row.vehicle_id;selectedTask=id;revealMission();paintSelection();}
 function selectVehicle(id){selected=id;const current=data.timeline.find(t=>t.vehicle_id===id&&taskStatus(t)==='active')||data.timeline.find(t=>t.vehicle_id===id);selectedTask=current?.task_id||'';revealMission();paintSelection();}
 function paintSelection(){if(disposed||!data)return;$('#desk-schedule').innerHTML=timeline();updateTime();mapCommand('fit');}
 function updateTime(){
  if(!data)return;if(replayFrame)telemetry=replayFrame(minute);context.onMinute?.(minute);
  $('#desk-active').textContent=telemetry.active_count;$('#desk-inspector').innerHTML=inspector();$('#desk-fleet').innerHTML=fleet();updateFlightStages();
  $('#desk-connection').textContent=`事件回放 · ${clock(minute)}`;
  el.querySelectorAll('[data-trend]').forEach(line=>line.setAttribute('points',trendPoints(line.dataset.trend,line.dataset.trend==='success_pct')));
  for(const row of el.querySelectorAll('.schedule-row')){const task=data.timeline.find(t=>t.task_id===row.dataset.mission);if(!task)continue;const status=taskStatus(task);row.dataset.flightStatus=status;row.querySelector('.actual-bar').style.width=`${Math.max(0,xPos(Math.min(minute,task.replay_end_min))-xPos(task.actual_start_min))}%`;}
  const shipments=$('#desk-shipments');if(shipments)shipments.innerHTML=shipmentMarkup(shipmentView(data.tasks,data.timeline,minute),nodeName,selectedTask);
  updateMission();drawMap();
  $('#desk-time').textContent=clock(minute);$('#desk-time-end').textContent=`/ ${fmt(maxTime(),1)} min`;

  el.querySelectorAll('.schedule-now').forEach(n=>n.style.left=`${xPos(minute)}%`);
  const cursor=$('#desk-trend-cursor');cursor?.setAttribute('x1',44+minute/maxTime()*873);cursor?.setAttribute('x2',44+minute/maxTime()*873);
  const stat=[...data.trend].reverse().find(p=>p.minute<=minute)||data.trend[0];
  $('#desk-delivered').textContent=stat.delivered;$('#desk-failed').textContent=stat.failed;$('#desk-completion').textContent=fmt(stat.completion_pct,1)+'%';
  const events=data.events.filter(e=>e.at_min<=minute&&['dispatch','arrived','failed','warning','handover'].includes(e.kind));
  const latest=events[events.length-1];$('#desk-event').innerHTML=latest?`<i class="event-bullet ${safe(latest.level)}"></i><span class="mono">${clock(latest.at_min)}</span> ${safe(latest.vehicle||'')} · ${safe(latest.message)}`:'<i class="event-bullet"></i> 等待首次任务派遣';
 }
 // Keep at most one telemetry request in flight. Fast playback must not
 // discard EVERY response when network latency exceeds the 500 ms clock tick.
 let telemetryBusy=false,telemetryQueued=false;
 async function fetchTelemetry(){
  if(disposed||!context.run)return;
  if(telemetryBusy){telemetryQueued=true;return;}
  telemetryBusy=true;
  const at=minute;
  try{
   const result=await get(`/simulations/${encodeURIComponent(context.run.id)}/telemetry?minute=${at.toFixed(3)}`);
   if(disposed)return;
   // A user seek invalidates stale paused frames. While playing, present the
   // latest available sample and request the current time on the next turn.
   if(!playing&&Math.abs(minute-at)>.05){telemetryQueued=true;return;}
   telemetry=replayFrame?replayFrame(minute):result;lastError='';
   $('#desk-connection').textContent=`仿真回放 · T+${Number(result.minute).toFixed(1)}`;
   $('#desk-connection').classList.remove('sync-error');
   $('#desk-active').textContent=telemetry.active_count;
   $('#desk-inspector').innerHTML=inspector();$('#desk-fleet').innerHTML=fleet();drawMap();
  }catch(error){
   if(disposed)return;
   lastError=error.message;playing=false;clearInterval(timer);
   syncPlayback();
   $('#desk-connection').textContent='状态同步失败 · 点击重试';
   $('#desk-connection').classList.add('sync-error');
  }finally{
   telemetryBusy=false;
   if(!disposed&&telemetryQueued){
    telemetryQueued=false;
    queueMicrotask(()=>{if(!disposed)void fetchTelemetry();});
   }
  }
 }
 function seek(at){minute=Math.max(0,Math.min(maxTime(),Number(at)||0));playing=false;clearInterval(timer);updateTime();syncPlayback();clearTimeout(pending);pending=setTimeout(fetchTelemetry,100);}
 function playback(){
  if(playing){playing=false;clearInterval(timer);updateTime();syncPlayback();return;}
  if(minute>=maxTime())minute=0;
  clearTimeout(pending);playing=true;lastTick=performance.now();updateTime();syncPlayback();
  timer=setInterval(()=>{const now=performance.now();minute=advanceFlightTime(minute,now-lastTick,speed,maxTime());lastTick=now;
   if(minute>=maxTime()){playing=false;clearInterval(timer);}updateTime();syncPlayback();
  },500);
 }
 function download(){
  if(!data)return;const cell=v=>{let s=String(v??'');if(/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
  const cols=['任务编号','空投无人机','物资','载荷 kg','计划开始 min','计划结束 min','实际开始 min','实际结束 min','截止 min','结果','备注','运单','分段','投送方式','前序任务'];
  const rows=data.timeline.map(t=>[t.code,t.vehicle_code,t.cargo,t.weight_kg,t.start_min,t.end_min,t.actual_start_min,t.actual_end_min,t.deadline_min,t.outcome==='arrived'?'已交付':t.outcome==='failed'?'中断':'未知','',t.shipment_id||'',t.leg_index||1,t.transport_mode==='airdrop'?'无人机空投':t.transport_mode==='sea'?'海运':'陆运',t.predecessor_task_id||'']);
  for(const item of data.report.unassigned||[]){const task=data.tasks?.find(t=>t.id===item.task_id);rows.push([item.code,'',task?.cargo||'',task?.weight_kg,'','','','',task?.deadline_min,'未分配',item.reason,task?.shipment_id||'',task?.leg_index||1,task?.transport_mode==='airdrop'?'无人机空投':task?.transport_mode==='sea'?'海运':'陆运',task?.predecessor_task_id||'']);}
  const blob=new Blob(['\uFEFF'+[cols,...rows].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${context.run.id}-评估结果.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
 }
 function experimentSelect(key,label){
  return `<label class="exp-control"><span>${label}</span><select data-exp-var="${key}" aria-label="${label}">${experimentOptions[key].map(([value,title])=>`<option value="${value}" ${experimentVars[key]===value?'selected':''}>${title}</option>`).join('')}</select></label>`;
 }
 function experimentRibbon(){return consoleMarkup(experimentVars,context.run?.seed??context.seed??2026,context.run?.iterations??context.iterations??80);}
 function labOptions(){return {seed:Number($('#lab-seed').value),iterations:Number($('#lab-iterations').value)};}
 function collapseLab(collapsed){const ribbon=$('.experiment-console'),button=$('[data-desk="toggle-lab"]');ribbon.classList.toggle('lab-collapsed',collapsed);button.setAttribute('aria-expanded',String(!collapsed));button.textContent=collapsed?'展开变量':'收起变量';}
 function renderDesk(){
  const report=data.report,m=data.metrics;
  $('#desk-content').innerHTML=`<div class="desk-kpis"><div><span>${regional?'运输分段完成率':'当前任务完成率'}</span><b id="desk-completion">0%</b><small>首次迭代 / 全部任务 ${data.total_tasks} 项</small></div><div><span>累计交付 / 中断</span><b><em id="desk-delivered">0</em><i> / </i><em id="desk-failed">0</em><small>项</small></b><small>随回放时间同步累计</small></div><div><span>执行中无人机</span><b><em id="desk-active">${telemetry.active_count}</em><small> / ${telemetry.vehicles.length} 架</small></b><small>来自当前回放时刻</small></div><div><span>${regional?'运单平均交付率':'多轮平均成功率'}</span><b>${fmt(regional?m.shipment_success_pct:m.success_pct)}<small>%</small></b><small>${data.iterations} 轮 · 种子 ${data.seed??'—'}</small></div><div><span>${regional?'运单准点率':'多轮准点率'}</span><b>${fmt(regional?m.shipment_on_time_pct:m.on_time_pct)}<small>%</small></b><small>综合评分 ${fmt(m.score)} / 100</small></div></div>
  ${flightDeck()}<div class="desk-layout"><section class="desk-panel schedule-panel"><header><div><b>空投任务时序</b><small>AIRDROP MISSIONS</small></div><span class="panel-counter">${data.timeline.length} 项</span></header><div id="desk-schedule">${timeline()}</div></section>
  <section class="desk-panel spatial-panel"><header><div><b>空投态势地图</b><small>MISSION ROUTE & PROGRESS</small></div><span class="live-badge"><i></i> 仿真回放</span></header><div class="mission-map-mode" role="group" aria-label="地图显示范围"><button type="button" data-map-mode="focus" aria-pressed="${mapMode==='focus'}">当前任务</button><button type="button" data-map-mode="overview" aria-pressed="${mapMode==='overview'}">全局态势</button><span>选择左侧任务可聚焦路线</span></div><div class="mission-focus" id="desk-mission-focus">${missionSummary()}</div><div class="desk-map-layers">${[['facilities','设施'],['links','通道'],['routes','路线'],['labels','标注']].map(([k,n])=>`<label><input type="checkbox" data-desk-layer="${k}" checked>${n}</label>`).join('')}<button data-desk="fit" title="适配当前显示范围">${icon('target',14)} 适配范围</button><button data-workspace-tool="legend" aria-expanded="false">路线图例</button></div>${context.sharedMap?'':geoMapMarkup()}<div class="map-status-strip mission-route-legend"><span><i class="route-key traveled"></i>已完成</span><span><i class="route-key remaining"></i>待完成</span><span><i class="route-key reposition"></i>装载准备</span><small>合成通道示意 · 非道路导航轨迹</small></div></section>
  <aside class="desk-panel inspector-panel"><header><div><b>无人机运行详情</b><small>PLATFORM INSPECTOR</small></div></header><div id="desk-inspector">${inspector()}</div></aside></div>
  <div class="desk-bottom"><section class="desk-panel trend-panel"><header><div><b>投送结果统计</b><small>DELIVERY RESULTS OVER TIME</small></div><span class="chart-hint">点击曲线可定位时间</span></header>${trend()}</section><section class="desk-panel fleet-panel"><header><div><b>空投机群</b><small>FLEET STATUS</small></div><span class="panel-counter">${telemetry.vehicles.length} 架</span></header><div id="desk-fleet">${fleet()}</div></section>${regional?`<aside class="desk-panel shipment-panel"><header><b>端到端运单</b><small>陆海接力 · 分段跟踪</small></header><div id="desk-shipments"></div></aside>`:''}</div>
  ${experimentRibbon()}
  <div class="desk-event-strip"><div id="desk-event"></div><button id="desk-connection" data-desk="retry">回放数据已同步</button></div><div class="desk-methodology"><span>${icon('shield',13)} ${safe(data.statistics_note)}</span><span>1× = 1 仿真分钟 / 秒 · 航程、速度和载荷为推算值</span></div>
  ${report.totals.unassigned?`<div class="desk-notice">${report.totals.unassigned} 项任务未分配运力，已纳入完成率分母。请在空投方案中检查约束。</div>`:''}`;
  if(context.sharedMap){const focus=$('#desk-mission-focus');$('.inspector-panel').insertBefore(focus,$('#desk-inspector'));}
  collapseLab(innerWidth<760);updateTime();syncPlayback();
  const ribbon=el.querySelector('.experiment-console');let lastHeight=0;
  const resize=new ResizeObserver(()=>{const h=Math.ceil(ribbon.getBoundingClientRect().height);if(h===lastHeight)return;lastHeight=h;document.body.style.setProperty('--lab-height',h+'px');if(data)mapCommand('fit');});resize.observe(ribbon);controller.signal.addEventListener('abort',()=>resize.disconnect(),{once:true});
 }
 async function load(){
  if(!context.run){$('#desk-content').innerHTML='<div class="desk-empty desk-empty-large"><span>◇</span><b>当前想定还没有仿真记录</b><p>先在联合投送方案中生成方案，再运行空投仿真。结果将自动出现在这里。</p><button class="button button-primary" data-desk="planning">前往空投方案 →</button></div>';return;}
  try{const result=await get(`/simulations/${encodeURIComponent(context.run.id)}/assessment?minute=${minute.toFixed(3)}`);if(disposed)return;data=result;telemetry=result.telemetry;minute=Math.min(Math.max(0,minute),maxTime());replayFrame=createFlightReplay(data);selected=telemetry.vehicles.find(v=>v.task_count)?.vehicle_id||telemetry.vehicles[0]?.vehicle_id||'';selectedTask=data.timeline.find(t=>t.vehicle_id===selected)?.task_id||'';renderDesk();void fetchTelemetry();}
  catch(error){if(!disposed)$('#desk-content').innerHTML=`<div class="desk-empty desk-empty-large"><b>评估数据加载失败</b><p>${safe(error.message)}</p><button class="button button-primary" data-desk="reload">重试加载</button></div>`;}
 }
 el.addEventListener('click',event=>{
  const eventJump=event.target.closest('[data-ops-seek]');if(eventJump){seek(eventJump.dataset.opsSeek);return;}
  if(event.target.closest('[data-ops-first-incident]')){const incident=data.events.find(e=>['warning','failed'].includes(e.kind));if(incident)seek(incident.at_min);return;}
  const tab=event.target.closest('[data-lab-tab]');if(tab){collapseLab(false);el.querySelectorAll('[data-lab-tab]').forEach(b=>b.setAttribute('aria-selected',String(b===tab)));el.querySelectorAll('.lab-pane').forEach(p=>p.hidden=p.id!=='lab-pane-'+tab.dataset.labTab);return;}
  const shipment=event.target.closest('[data-shipment]');if(shipment){const first=data.tasks.filter(t=>t.shipment_id===shipment.dataset.shipment).sort((a,b)=>a.leg_index-b.leg_index)[0];if(first){selectedTask=first.id;selected=data.timeline.find(t=>t.task_id===first.id)?.vehicle_id||selected;mapMode='overview';routeScope='shipment';paintSelection();}return;}
  const mission=event.target.closest('[data-mission]');if(mission){const row=data.timeline.find(t=>t.task_id===mission.dataset.mission);selected=row.vehicle_id;selectedTask=row.task_id;mapMode='focus';revealMission();seek(row.actual_start_min);paintSelection();return;}
  const mapModeButton=event.target.closest('[data-map-mode]');if(mapModeButton){mapMode=mapModeButton.dataset.mapMode;if(mapMode==='focus')revealMission();updateMission();drawMap();return;}
  const vehicle=event.target.closest('[data-vehicle]');if(vehicle){selectVehicle(vehicle.dataset.vehicle);return;}
  const chart=event.target.closest('[data-time-chart]');if(chart){const bounds=chart.getBoundingClientRect();seek(((event.clientX-bounds.left)/bounds.width*960-44)/873*maxTime());return;}
  const action=event.target.closest('[data-desk]')?.dataset.desk;if(!action)return;
  if(action==='toggle-lab'){collapseLab(!$('.experiment-console').classList.contains('lab-collapsed'));return;}
  if(['run-experiment','compare-fleet'].includes(action)){for(const input of [$('#lab-seed'),$('#lab-iterations')]){if(!input.checkValidity()){input.reportValidity();return;}}}
  if(action==='records'){context.onRecords?.();return;}
  if(action==='compare-fleet'){
   const button=event.target.closest('button'),target=$('#lab-comparison-results');button.disabled=true;target.textContent='正在运行三组独立对照实验…';
   Promise.resolve(context.onCompare({...experimentVars},labOptions())).then(records=>{target.innerHTML=comparisonMarkup(records);}).catch(error=>{target.textContent='对比未完成：'+error.message;}).finally(()=>{button.disabled=false;});return;
  }
  if(action==='dense'){context.onDense?.();return;}
  if(action==='play')playback();if(action==='reset')seek(0);if(action==='csv')download();
  if(action==='apply-experiment'){
   const status=$('#desk-experiment-status');
   try{localStorage.setItem('aether-civil-airdrop-experiment-v1',JSON.stringify(experimentVars));if(status){status.textContent='已保存本地变量预设；历史推演未修改。';status.classList.add('is-saved');}}
   catch{if(status)status.textContent='浏览器未允许本地保存，请检查隐私设置。';}
   return;
  }
  if(action==='run-experiment'){
   const status=$('#desk-experiment-status');
   if(typeof context.onExperiment!=='function'){if(status)status.textContent='当前环境不支持写入实验记录。';return;}
   if(status)status.textContent='正在运行实验并保存记录…';
   const params={...experimentVars,wind_kmh:Number(experimentVars.wind_kmh),battery_reserve_pct:Number(experimentVars.battery_reserve_pct)};
   Promise.resolve(context.onExperiment(params,labOptions())).then(()=>{if(status){status.textContent='实验运行完成；记录已提交。';status.classList.add('is-saved');}}).catch(error=>{if(status)status.textContent='实验未完成：'+(error?.message||'请求失败');});
   return;
  }
  if(action==='previous')seek([...data.events].reverse().find(e=>e.at_min<minute-.01)?.at_min||0);
  if(action==='next')seek(data.events.find(e=>e.at_min>minute+.01)?.at_min??maxTime());
  if(action==='retry'){if(lastError)fetchTelemetry();}if(action==='reload')load();if(action==='planning')context.onPlanning?.();
  if(action==='fit'){document.querySelector('[data-map="fit"]')?.click();}
  if(action==='fullscreen'&&context.sharedMap){const expanded=document.body.classList.toggle('map-immersive');const button=$('[data-desk="fullscreen"]');button.setAttribute('aria-label',expanded?'退出评估全屏':'全屏评估工作台');button.title=expanded?'退出评估全屏':'全屏评估工作台';if(data)mapCommand('fit');return;}
  if(action==='fullscreen'){const expanded=el.classList.toggle('assessment-expanded');document.body.classList.toggle('desk-expanded-body',expanded);const button=el.querySelector('[data-desk="fullscreen"]');button.setAttribute('aria-label',expanded?'退出评估全屏':'全屏评估工作台');button.title=expanded?'退出评估全屏':'全屏评估工作台';if(data)drawMap();}
 },options);
 el.addEventListener('assessment-seek',event=>{seek(event.detail.minute);},options);
 el.addEventListener('input',event=>{

  if(event.target.id==='desk-search'){query=event.target.value;const focus=event.target.selectionStart;$('#desk-schedule').innerHTML=timeline();$('#desk-search').focus();$('#desk-search').setSelectionRange(focus,focus);}
 },options);
 el.addEventListener('change',event=>{
  if(event.target.id==='assessment-run')context.onRun?.(event.target.value);
  if(event.target.id==='desk-filter'){filter=event.target.value;$('#desk-schedule').innerHTML=timeline();}
  if(event.target.id==='desk-speed'){if(FLIGHT_SPEEDS.includes(Number(event.target.value)))speed=Number(event.target.value);lastTick=performance.now();}
  if(event.target.dataset.expVar){
   const key=event.target.dataset.expVar;
   if(experimentOptions[key]?.some(([value])=>value===event.target.value)){
    experimentVars[key]=event.target.value;
    const status=$('#desk-experiment-status');if(status){status.textContent='变量已修改；点击运行并记录可创建新实验。';status.classList.remove('is-saved');}
   }
  }
  if(event.target.dataset.deskLayer){layers[event.target.dataset.deskLayer]=event.target.checked;drawMap();}
 },options);
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&el.classList.contains('assessment-expanded')){el.classList.remove('assessment-expanded');document.body.classList.remove('desk-expanded-body');el.querySelector('[data-desk="fullscreen"]').setAttribute('aria-label','全屏评估工作台');drawMap();}},options);
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('map-immersive')){document.body.classList.remove('map-immersive');$('[data-desk="fullscreen"]').setAttribute('aria-label','全屏评估工作台');mapCommand('fit');}},options);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){playing=false;clearInterval(timer);updateTime();syncPlayback('切换页面，已暂停');}},options);
 window.addEventListener('resize',()=>{if(data&&!disposed)drawMap();},options);
 load();
 return {destroy(){document.body.classList.remove('desk-expanded-body','flight-replay-active');disposed=true;ticket++;controller.abort();clearInterval(timer);clearTimeout(pending);}};
}
