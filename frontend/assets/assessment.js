import {get} from './api.js';
import {esc,icon} from './charts.js';
import {geoMapMarkup,renderGeoMap} from './map.js';

const fmt=(v,d=1)=>v==null?'—':Number(v).toFixed(d);
const stateNames={standby:'等待任务',in_transit:'运输中',delivered:'已交付',failed:'任务中断',unavailable:'不可用'};
const safe=v=>esc(String(v??''));
const clock=v=>`T+${fmt(v,1)}`;

export function assessmentMarkup(context){
 const runs=context.runs||[];
 return `<section class="assessment" id="assessment" aria-label="任务综合评估工作台">
  <div class="assessment-toolbar"><div class="desk-title"><span class="desk-symbol">${icon('chart',19)}</span><div><strong>任务综合评估工作台</strong><small>时序 · 空间 · 运力 · 结果同步分析</small></div></div>
   <div class="desk-actions"><label>推演记录<select id="assessment-run" aria-label="选择评估运行">${runs.map(r=>`<option value="${safe(r.id)}" ${r.id===context.run?.id?'selected':''}>${safe(r.id)} · ${r.iterations} 轮</option>`).join('')||'<option>暂无推演记录</option>'}</select></label><button class="button button-light" data-desk="csv" ${runs.length?'':'disabled'}>${icon('download',15)} 导出结果</button><button class="icon-button" data-desk="fullscreen" aria-label="全屏评估工作台" title="全屏评估工作台">⛶</button></div>
  </div>
  <div id="desk-content"><div class="desk-loading" role="status"><span class="loading-spinner"></span>正在读取任务快照与推演证据…</div></div>
 </section>`;
}

export function mountAssessment(context){
 const el=document.getElementById('assessment');if(!el)return {destroy(){}};
 const controller=new AbortController();const options={signal:controller.signal};
 let disposed=false,data=null,telemetry=null,selected='',selectedTask='',filter='all',query='',minute=context.minute||0,playing=false,speed=4,timer=0,pending=0,ticket=0,lastError='',layers={facilities:true,links:true,formations:true,routes:true,labels:true};
 const $=q=>el.querySelector(q);
 const currentVehicle=()=>telemetry?.vehicles?.find(v=>v.vehicle_id===selected);
 const selectedMission=()=>data?.timeline.find(t=>t.task_id===selectedTask);
 const nodeName=id=>data?.network.nodes.find(n=>n.id===id)?.name||id;
 const maxTime=()=>data?.duration_min||1;
 const xPos=t=>Math.max(0,Math.min(1,t/maxTime()))*100;
 const matched=()=>data.timeline.filter(t=>(!selected||filter!=='selected'||t.vehicle_id===selected)&&(!query||`${t.code} ${t.cargo} ${t.vehicle_code}`.toLowerCase().includes(query.toLowerCase()))&&(filter!=='failed'||t.outcome==='failed')&&(filter!=='late'||(t.actual_end_min!=null&&t.actual_end_min>t.deadline_min)));
 function taskStatus(t){if(minute<t.actual_start_min)return 'pending';if(t.actual_end_min==null||minute<t.actual_end_min)return 'active';return t.outcome==='arrived'?'delivered':'failed';}
 function phases(t){
  if(t.task_id!==selectedTask)return '';
  return `<div class="task-phases"><div><span>派遣</span><i style="left:calc(104px + (100% - 122px)*${xPos(t.actual_start_min)/100})"></i><small>${clock(t.actual_start_min)}</small></div><div><span>运输航段</span><div class="phase-track">${(t.segments||[]).map(segment=>`<b style="left:${xPos(segment.start_min)}%;width:${Math.max(.8,xPos(segment.end_min)-xPos(segment.start_min))}%" title="${safe(nodeName(segment.source))} → ${safe(nodeName(segment.target))} · ${clock(segment.start_min)} — ${clock(segment.end_min)}"></b>`).join('')}</div></div><div><span>${t.outcome==='failed'?'任务中断':'交付'}</span><i class="${t.outcome==='failed'?'failed':''}" style="left:calc(104px + (100% - 122px)*${xPos(t.replay_end_min)/100})"></i><small>${t.actual_end_min==null?'缺少结束事件':clock(t.actual_end_min)}</small></div></div>`;
 }
 function timeline(){
  const rows=matched();const tickCount=5;
  return `<div class="schedule-tools"><input id="desk-search" placeholder="搜索任务 / 平台 / 物资" value="${safe(query)}" aria-label="搜索评估任务"><select id="desk-filter" aria-label="筛选评估任务">${[['all','全部任务'],['selected','选中平台'],['late','延迟交付'],['failed','中断任务']].map(([v,n])=>`<option value="${v}" ${filter===v?'selected':''}>${n}</option>`).join('')}</select></div>
  <div class="schedule-ruler"><span>平台 / 任务</span><div>${Array.from({length:tickCount},(_,i)=>`<small style="left:${i/(tickCount-1)*100}%">${fmt(maxTime()*i/(tickCount-1),0)}</small>`).join('')}</div></div>
  <div class="schedule-scroll">${rows.length?rows.map(t=>`<button class="schedule-row ${selectedTask===t.task_id?'chosen':''}" data-mission="${safe(t.task_id)}" aria-label="选择任务 ${safe(t.code)}" aria-pressed="${selectedTask===t.task_id}"><span class="schedule-label"><b>${safe(t.vehicle_code)}</b><small>${safe(t.code)} · ${safe(t.cargo)}</small></span><span class="schedule-track"><span class="planned-bar" style="left:${xPos(t.start_min)}%;width:${Math.max(.8,xPos(t.end_min)-xPos(t.start_min))}%" title="计划 ${clock(t.start_min)} 至 ${clock(t.end_min)}"></span><span class="actual-bar ${t.outcome==='failed'?'interrupted':''}" style="left:${xPos(t.actual_start_min)}%;width:${Math.max(1,xPos(t.replay_end_min)-xPos(t.actual_start_min))}%" title="首次迭代 ${clock(t.actual_start_min)} 至 ${clock(t.actual_end_min)}"></span>${t.incidents.map(at=>`<span class="incident-mark" style="left:${xPos(at)}%" title="环境扰动 ${clock(at)}">!</span>`).join('')}<i class="task-end" style="left:${xPos(t.replay_end_min)}%"></i><i class="schedule-now" style="left:${xPos(minute)}%"></i></span></button>${phases(t)}`).join(''):'<div class="desk-empty">没有符合条件的任务</div>'}</div>
  <div class="schedule-legend"><span><i class="key-planned"></i>计划时段</span><span><i class="key-actual"></i>首次迭代</span><span><i class="key-warning"></i>扰动</span><small>单位：分钟</small></div>`;
 }
 function trend(){
  const w=960,h=120,l=44,r=43,top=12,bottom=28,iw=w-l-r,ih=h-top-bottom,max=Math.max(1,data.total_tasks);
  const px=t=>l+t/maxTime()*iw,py=v=>top+(1-v/100)*ih;
  const points=(key,isPct)=>data.trend.filter(p=>p[key]!=null).map(p=>`${px(p.minute)},${py(isPct?p[key]:p[key]/max*100)}`).join(' ');
  return `<div class="trend-legend"><span><i style="background:#178e93"></i>已结束任务成功率 · 左轴</span><span><i style="background:#3779ce"></i>累计交付 · 右轴</span><span><i style="background:#db9043"></i>累计中断 · 右轴</span><small>成功率 = 交付 / 已结束任务</small></div><svg class="assessment-trend" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="按推演时间统计的已结束任务成功率、累计交付和中断数量；点击曲线定位时间" data-time-chart="true">${[0,25,50,75,100].map(v=>`<line x1="${l}" y1="${py(v)}" x2="${w-r}" y2="${py(v)}" stroke="#e6ecf2"/><text x="${l-9}" y="${py(v)+4}" text-anchor="end">${v}%</text><text x="${w-r+9}" y="${py(v)+4}">${fmt(max*v/100,0)}</text>`).join('')}${[0,1,2,3,4,5,6].map(i=>`<text x="${px(maxTime()*i/6)}" y="${h-6}" text-anchor="middle">T+${fmt(maxTime()*i/6,0)}</text>`).join('')}<polyline points="${points('success_pct',true)}" stroke="#178e93"/><polyline points="${points('delivered',false)}" stroke="#3779ce"/><polyline points="${points('failed',false)}" stroke="#db9043"/><line id="desk-trend-cursor" x1="${px(minute)}" x2="${px(minute)}" y1="${top}" y2="${h-bottom}" stroke="#e16258" stroke-dasharray="4 3"/><rect x="${l}" y="${top}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
 }
 function inspector(){
  const v=currentVehicle(),mission=selectedMission();
  if(!v)return '<div class="desk-empty">选择平台查看状态</div>';
  const position=v.coordinate_system==='wgs84'?`${fmt(v.lon,4)}°E<br>${fmt(v.lat,4)}°N`:`X ${fmt(v.x,1)} / Y ${fmt(v.y,1)}<small>历史相对坐标</small>`;
  return `<div class="inspector-identity"><span class="vehicle-glyph">${icon(v.category==='drone'?'target':'truck',26)}</span><div><b>${safe(v.code)}</b><small>${v.category==='drone'?'无人航空平台':'无人地面平台'}</small></div><span class="state-pill ${v.status}">${stateNames[v.status]||safe(v.status)}</span></div><div class="inspector-position"><span>推演位置</span><b class="mono">${position}</b></div><div class="inspector-metrics"><div><span>当前速度</span><b>${fmt(v.current_speed_kmh)}<small> km/h</small></b></div><div><span>当前载荷</span><b>${fmt(v.current_load_kg)}<small> kg</small></b></div></div><div class="range-status"><div><span>剩余模拟航程</span><b>${fmt(v.remaining_range_km)} km</b></div><div class="range-track"><i style="width:${v.range_remaining_pct}%"></i></div><small>${fmt(v.range_remaining_pct,0)}% · 由计划里程推算</small></div><dl class="inspector-facts"><div><dt>当前任务</dt><dd>${safe(v.mission_code||'尚未派遣')}</dd></div><div><dt>装载物资</dt><dd>${safe(v.cargo||'未装载')}</dd></div><div><dt>预计剩余</dt><dd>${v.eta_min==null?'—':fmt(v.eta_min)+' min'}</dd></div><div><dt>任务进度</dt><dd>${fmt(v.progress_pct,0)}%</dd></div><div><dt>已交付 / 分配</dt><dd>${v.completed_tasks} / ${v.task_count}</dd></div></dl>${mission?`<div class="selected-mission"><small>选中任务 · ${safe(mission.code)}</small><b>${safe(mission.cargo)}</b><p>${safe(nodeName(mission.origin))} → ${safe(nodeName(mission.destination))}</p><div>计划 ${clock(mission.start_min)} — ${clock(mission.end_min)}</div><div>截止 ${clock(mission.deadline_min)} · ${fmt(mission.weight_kg)} kg</div></div>`:''}<p class="inspector-footnote">平台状态由首次迭代事件推算，不是实际设备传感数据。</p>`;
 }
 function fleet(){return (telemetry?.vehicles||[]).map(v=>`<button class="fleet-row ${v.vehicle_id===selected?'selected':''}" data-vehicle="${safe(v.vehicle_id)}" aria-pressed="${v.vehicle_id===selected}"><span class="fleet-dot ${v.status}"></span><span><b>${safe(v.code)}</b><small>${safe(v.mission_code||'待命')}</small></span><span class="fleet-status">${stateNames[v.status]||safe(v.status)}</span><span class="mono">${fmt(v.current_speed_kmh,0)}<small> km/h</small></span></button>`).join('');}
 function drawMap(){renderGeoMap(data.network,context.city,context.plan,{routes:true,layers,telemetry,minute,run:context.run,selectedVehicle:selected,selectedTask,formations:[],onSelectVehicle:selectVehicle});}
 function selectVehicle(id){selected=id;const current=data.timeline.find(t=>t.vehicle_id===id&&taskStatus(t)==='active')||data.timeline.find(t=>t.vehicle_id===id);selectedTask=current?.task_id||'';paintSelection();}
 function paintSelection(){if(disposed||!data)return;$('#desk-inspector').innerHTML=inspector();$('#desk-fleet').innerHTML=fleet();$('#desk-schedule').innerHTML=timeline();drawMap();}
 function updateTime(){
  if(!data)return;context.onMinute?.(minute);
  $('#desk-time').textContent=clock(minute);$('#desk-time-end').textContent=`/ ${fmt(maxTime(),1)} min`;
  const slider=$('#desk-slider');slider.value=minute;slider.style.setProperty('--progress',`${xPos(minute)}%`);
  el.querySelectorAll('.schedule-now').forEach(n=>n.style.left=`${xPos(minute)}%`);
  const cursor=$('#desk-trend-cursor');cursor?.setAttribute('x1',44+minute/maxTime()*873);cursor?.setAttribute('x2',44+minute/maxTime()*873);
  const stat=[...data.trend].reverse().find(p=>p.minute<=minute)||data.trend[0];
  $('#desk-delivered').textContent=stat.delivered;$('#desk-failed').textContent=stat.failed;$('#desk-completion').textContent=fmt(stat.completion_pct,1)+'%';
  const events=data.events.filter(e=>e.at_min<=minute&&['dispatch','arrived','failed','warning'].includes(e.kind));
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
   telemetry=result;lastError='';
   $('#desk-connection').textContent=`仿真回放 · T+${Number(result.minute).toFixed(1)}`;
   $('#desk-connection').classList.remove('sync-error');
   $('#desk-active').textContent=result.active_count;
   $('#desk-inspector').innerHTML=inspector();$('#desk-fleet').innerHTML=fleet();drawMap();
  }catch(error){
   if(disposed)return;
   lastError=error.message;playing=false;clearInterval(timer);
   $('#desk-play').textContent='▶';$('#desk-play').setAttribute('aria-label','播放回放');
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
 function seek(at){minute=Math.max(0,Math.min(maxTime(),Number(at)||0));playing=false;clearInterval(timer);$('#desk-play').textContent='▶';$('#desk-play').setAttribute('aria-label','播放回放');updateTime();clearTimeout(pending);pending=setTimeout(fetchTelemetry,100);}
 function playback(){
  if(playing){playing=false;clearInterval(timer);}else{if(minute>=maxTime())minute=0;playing=true;timer=setInterval(()=>{minute=Math.min(maxTime(),minute+speed*.5);updateTime();fetchTelemetry();if(minute>=maxTime()){playing=false;clearInterval(timer);$('#desk-play').textContent='▶';$('#desk-play').setAttribute('aria-label','播放回放');}},500);}
  $('#desk-play').textContent=playing?'Ⅱ':'▶';$('#desk-play').setAttribute('aria-label',playing?'暂停回放':'播放回放');
 }
 function download(){
  if(!data)return;const cell=v=>{let s=String(v??'');if(/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
  const cols=['任务编号','运输平台','物资','载荷 kg','计划开始 min','计划结束 min','实际开始 min','实际结束 min','截止 min','结果','备注'];
  const rows=data.timeline.map(t=>[t.code,t.vehicle_code,t.cargo,t.weight_kg,t.start_min,t.end_min,t.actual_start_min,t.actual_end_min,t.deadline_min,t.outcome==='arrived'?'已交付':t.outcome==='failed'?'中断':'未知','']);
  for(const item of data.report.unassigned||[]){const task=data.tasks?.find(t=>t.id===item.task_id);rows.push([item.code,'',task?.cargo||'',task?.weight_kg,'','','','',task?.deadline_min,'未分配',item.reason]);}
  const blob=new Blob(['\uFEFF'+[cols,...rows].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${context.run.id}-评估结果.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
 }
 function renderDesk(){
  const report=data.report,m=data.metrics;
  $('#desk-content').innerHTML=`<div class="desk-kpis"><div><span>当前任务完成率</span><b id="desk-completion">0%</b><small>首次迭代 / 全部任务 ${data.total_tasks} 项</small></div><div><span>累计交付 / 中断</span><b><em id="desk-delivered">0</em><i> / </i><em id="desk-failed">0</em><small>项</small></b><small>随回放时间同步累计</small></div><div><span>执行中平台</span><b><em id="desk-active">${telemetry.active_count}</em><small> / ${telemetry.vehicles.length} 台</small></b><small>来自当前回放时刻</small></div><div><span>多轮平均成功率</span><b>${fmt(m.success_pct)}<small>%</small></b><small>${data.iterations} 轮 · 种子 ${data.seed??'—'}</small></div><div><span>多轮准点率</span><b>${fmt(m.on_time_pct)}<small>%</small></b><small>综合评分 ${fmt(m.score)} / 100</small></div></div>
  <div class="desk-layout"><section class="desk-panel schedule-panel"><header><div><b>运输任务时序</b><small>TRANSPORT SCHEDULE</small></div><span class="panel-counter">${data.timeline.length} 项</span></header><div id="desk-schedule">${timeline()}</div></section>
  <section class="desk-panel spatial-panel"><header><div><b>投送行动态势</b><small>SPATIAL SITUATION</small></div><span class="live-badge"><i></i> 仿真回放</span></header><div class="desk-map-layers">${[['facilities','设施'],['links','通道'],['routes','路线'],['labels','标注']].map(([k,n])=>`<label><input type="checkbox" data-desk-layer="${k}" checked>${n}</label>`).join('')}<button data-desk="fit" title="适配全部节点">${icon('target',14)} 全域</button></div>${geoMapMarkup()}<div class="map-status-strip"><span><i class="legend-line blue"></i>选中任务路径</span><span><i class="legend-dot teal"></i>运行平台</span><span><i class="legend-dot red"></i>异常平台</span><small>点击平台查看详情</small></div></section>
  <aside class="desk-panel inspector-panel"><header><div><b>平台运行详情</b><small>PLATFORM INSPECTOR</small></div></header><div id="desk-inspector">${inspector()}</div></aside></div>
  <div class="desk-bottom"><section class="desk-panel trend-panel"><header><div><b>投送结果统计</b><small>DELIVERY RESULTS OVER TIME</small></div><span class="chart-hint">点击曲线可定位时间</span></header>${trend()}</section><section class="desk-panel fleet-panel"><header><div><b>参演平台</b><small>FLEET STATUS</small></div><span class="panel-counter">${telemetry.vehicles.length} 台</span></header><div id="desk-fleet">${fleet()}</div></section></div>
  <div class="desk-player"><button id="desk-play" class="desk-play" data-desk="play" aria-label="播放回放">▶</button><button class="player-step" data-desk="previous" aria-label="上一个事件" title="上一个事件">|◀</button><button class="player-step" data-desk="next" aria-label="下一个事件" title="下一个事件">▶|</button><strong class="mono" id="desk-time">${clock(minute)}</strong><span class="mono" id="desk-time-end">/ ${fmt(maxTime())} min</span><input id="desk-slider" type="range" min="0" max="${maxTime()}" step=".01" value="${minute}" aria-label="评估回放时间"><label class="speed-label">回放速度<select id="desk-speed" aria-label="回放速度"><option value="1">1×</option><option value="4" selected>4×</option><option value="16">16×</option></select></label><button class="player-step" data-desk="reset" aria-label="重置回放" title="重置回放">↺</button></div>
  <div class="desk-event-strip"><div id="desk-event"></div><button id="desk-connection" data-desk="retry">回放数据已同步</button></div><div class="desk-methodology"><span>${icon('shield',13)} ${safe(data.statistics_note)}</span><span>1× = 1 仿真分钟 / 秒 · 航程、速度和载荷为推算值</span></div>
  ${report.totals.unassigned?`<div class="desk-notice">${report.totals.unassigned} 项任务未分配运力，已纳入完成率分母。请在联合投送方案中检查约束。</div>`:''}`;
  updateTime();drawMap();
 }
 async function load(){
  if(!context.run){$('#desk-content').innerHTML='<div class="desk-empty desk-empty-large"><span>◇</span><b>当前想定还没有推演记录</b><p>先在联合投送方案中生成方案，再运行行动推演。结果将自动出现在这里。</p><button class="button button-primary" data-desk="planning">前往方案规划 →</button></div>';return;}
  try{const result=await get(`/simulations/${encodeURIComponent(context.run.id)}/assessment?minute=${minute.toFixed(3)}`);if(disposed)return;data=result;telemetry=result.telemetry;minute=Math.min(minute,maxTime());selected=telemetry.vehicles.find(v=>v.task_count)?.vehicle_id||telemetry.vehicles[0]?.vehicle_id||'';selectedTask=data.timeline.find(t=>t.vehicle_id===selected)?.task_id||'';renderDesk();}
  catch(error){if(!disposed)$('#desk-content').innerHTML=`<div class="desk-empty desk-empty-large"><b>评估数据加载失败</b><p>${safe(error.message)}</p><button class="button button-primary" data-desk="reload">重试加载</button></div>`;}
 }
 el.addEventListener('click',event=>{
  const mission=event.target.closest('[data-mission]');if(mission){const row=data.timeline.find(t=>t.task_id===mission.dataset.mission);selected=row.vehicle_id;selectedTask=row.task_id;seek(row.actual_start_min);paintSelection();return;}
  const vehicle=event.target.closest('[data-vehicle]');if(vehicle){selectVehicle(vehicle.dataset.vehicle);return;}
  const chart=event.target.closest('[data-time-chart]');if(chart){const bounds=chart.getBoundingClientRect();seek(((event.clientX-bounds.left)/bounds.width*960-44)/873*maxTime());return;}
  const action=event.target.closest('[data-desk]')?.dataset.desk;if(!action)return;
  if(action==='play')playback();if(action==='reset')seek(0);if(action==='csv')download();
  if(action==='previous')seek([...data.events].reverse().find(e=>e.at_min<minute-.01)?.at_min||0);
  if(action==='next')seek(data.events.find(e=>e.at_min>minute+.01)?.at_min??maxTime());
  if(action==='retry'){if(lastError)fetchTelemetry();}if(action==='reload')load();if(action==='planning')context.onPlanning?.();
  if(action==='fit'){el.querySelector('[data-map="fit"]')?.click();}
  if(action==='fullscreen'){const expanded=el.classList.toggle('assessment-expanded');document.body.classList.toggle('desk-expanded-body',expanded);const button=el.querySelector('[data-desk="fullscreen"]');button.setAttribute('aria-label',expanded?'退出评估全屏':'全屏评估工作台');button.title=expanded?'退出评估全屏':'全屏评估工作台';if(data)drawMap();}
 },options);
 el.addEventListener('input',event=>{
  if(event.target.id==='desk-slider')seek(event.target.value);
  if(event.target.id==='desk-search'){query=event.target.value;const focus=event.target.selectionStart;$('#desk-schedule').innerHTML=timeline();$('#desk-search').focus();$('#desk-search').setSelectionRange(focus,focus);}
 },options);
 el.addEventListener('change',event=>{
  if(event.target.id==='assessment-run')context.onRun?.(event.target.value);
  if(event.target.id==='desk-filter'){filter=event.target.value;$('#desk-schedule').innerHTML=timeline();}
  if(event.target.id==='desk-speed')speed=Number(event.target.value);
  if(event.target.dataset.deskLayer){layers[event.target.dataset.deskLayer]=event.target.checked;drawMap();}
 },options);
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&el.classList.contains('assessment-expanded')){el.classList.remove('assessment-expanded');document.body.classList.remove('desk-expanded-body');el.querySelector('[data-desk="fullscreen"]').setAttribute('aria-label','全屏评估工作台');drawMap();}},options);
 window.addEventListener('resize',()=>{if(data&&!disposed)drawMap();},options);
 load();
 return {destroy(){document.body.classList.remove('desk-expanded-body');disposed=true;ticket++;controller.abort();clearInterval(timer);clearTimeout(pending);}};
}
