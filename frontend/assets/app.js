import {get, post, patch, del, initAuth, login, logout, whoami} from './api.js';
import {esc, icon, num, networkMap, gantt, lineChart, scoreDonut, compareBars} from './charts.js';

const NAV = [
  ['overview','态势总览','dashboard'],['data','基础数据','database'],['rules','规则管理','rules'],
  ['planning','方案规划','route'],['simulation','行动推演','play'],['analytics','评估分析','chart'],['audit','审计日志','shield']
];
const state={page:'overview',scenarioId:null,scenarios:[],network:null,overview:null,tasks:[],plans:[],runs:[],
  plan:null,run:null,strategy:'balanced',algorithm:'astar',playMinute:0,playSpeed:1,playing:false,timer:null,
  showPlan:true,dataTab:'vehicles',selectedNode:null,busy:false};
const main=document.querySelector('#main');
const toastStack=document.querySelector('#toast-stack');
const modalRoot=document.querySelector('#modal-root');
const statusName={available:'就绪',maintenance:'维护中',offline:'离线',online:'正常',open:'畅通',restricted:'受限',closed:'关闭'};
const weatherName={clear:'晴朗',rain:'降雨',wind:'大风',fog:'低能见度'};
const strategyName={balanced:'综合均衡',fastest:'时效优先',safest:'风险优先'};
const dateStr=()=>new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'});
const fmtTime=n=>`${num(n,1)} min`;
const scenario=()=>state.scenarios.find(s=>s.id===state.scenarioId);
const selected=()=>state.run?.metrics||{};
const pct=(v)=>`${num(v,1)}%`;

function toast(message,error=false) {
  const node=document.createElement('div');node.className='toast'+(error?' error':'');node.textContent=message;
  toastStack.append(node);window.setTimeout(()=>node.remove(),4200);
}
function alertError(e){toast(e?.message||'操作失败，请重试',true);console.error(e);}
function setBusy(yes){state.busy=yes;document.querySelectorAll('[data-action="generate"],[data-action="simulate"]').forEach(b=>b.disabled=yes);}
const btn=(text,action,kind='btn-ghost',extra='')=>`<button class="btn ${kind}" data-action="${action}" ${extra}>${text}</button>`;
function title(eyebrow,title,description,actions='') {
  return `<div class="heading-row"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="page-description">${esc(description)}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function panel(label,subtitle,body,actions='',className=''){
  return `<section class="panel ${className}"><div class="panel-header"><div class="panel-heading"><h2 class="panel-title">${esc(label)}</h2><div class="panel-subtitle">${esc(subtitle)}</div></div><div class="panel-header-actions">${actions}</div></div>${body}</section>`;
}
function scenarioSelect(){return `<select class="page-select" id="scenario-select" aria-label="选择仿真场景">${state.scenarios.map(s=>`<option value="${esc(s.id)}" ${s.id===state.scenarioId?'selected':''}>${esc(s.name)}</option>`).join('')}</select>`;}
function navRender(){document.querySelector('#nav').innerHTML=`<div class="nav-group">${NAV.map(([page,name,ico],i)=>`<button type="button" class="nav-link ${page===state.page?'active':''}" data-page="${page}" aria-current="${page===state.page?'page':'false'}"><span class="nav-icon">${icon(ico)}</span><span class="nav-name">${esc(name)}</span><span class="nav-no">0${i+1}</span></button>`).join('')}</div>`;
 document.querySelector('#breadcrumb').textContent=NAV.find(i=>i[0]===state.page)?.[1]||'总览';document.querySelector('#today').textContent=dateStr();}

async function loadCore(){
  const [scenarios,network,overview]=await Promise.all([get('/scenarios'),get('/network'),get('/overview')]);
  state.scenarios=scenarios;state.network=network;state.overview=overview;
  if(!scenarios.some(s=>s.id===state.scenarioId))state.scenarioId=scenarios[0]?.id||null;
  await loadScenario();
}
async function loadScenario(){
  if(!state.scenarioId){state.tasks=[];state.plans=[];state.runs=[];state.plan=null;state.run=null;return;}
  const id=encodeURIComponent(state.scenarioId);
  const [tasks,plans,runs]=await Promise.all([get(`/scenarios/${id}/tasks`),get(`/plans?scenario_id=${id}`),get(`/simulations?scenario_id=${id}`)]);
  state.tasks=tasks;state.plans=plans;state.runs=runs;
  state.plan=plans.find(p=>p.id===state.plan?.id)||plans[0]||null;
  state.run=runs.find(r=>r.id===state.run?.id)||runs.find(r=>r.plan_id===state.plan?.id)||runs[0]||null;
  state.playMinute=0;
}

function kpi(label,value,unit,note,ico,tone=''){
 return `<div class="kpi-card"><div class="kpi-top"><span class="kpi-label">${esc(label)}</span><span class="kpi-icon ${tone}">${icon(ico)}</span></div><div class="kpi-value">${esc(value)}<span class="unit">${esc(unit)}</span></div><div class="kpi-foot"><span class="stat-up">↗</span>${esc(note)}</div></div>`;
}
function dashboardKpis(){const m=selected();return `<div class="kpi-grid">${kpi('任务执行成功率',num(m.success_pct ?? 0,1),'%','多轮随机推演均值','target')}${kpi('任务准点交付率',num(m.on_time_pct ?? 0,1),'%','按任务截止时间计算','clock','aqua')}${kpi('在线无人运载平台',num(state.overview?.available_vehicles),`/ ${state.overview?.vehicle_count||0}`,'跨平台协同调度','truck','blue')}${kpi('综合系统评分',num(m.score??0,1),'/ 100','效率 · 时效 · 可靠性','activity','orange')}</div>`;}
function mapPanel(){return panel('数字孪生投送沙盘','虚拟路网拓扑 / 关键设施实时态势',networkMap(state.network,state.plan,state.run,state.playMinute,state.showPlan),`<span class="live-tag">● TOPOLOGY ONLINE</span>${btn(state.showPlan?'隐藏规划':'显示规划','toggle-plan','btn-small btn-ghost')}`,'map-panel');}
function scenarioContext(){const s=scenario();return s?`<div class="scenario-description">${icon('cloud',22)}<div><strong>当前任务环境 / ${esc(s.name)}</strong><br>${esc(s.description)} · ${esc(weatherName[s.weather])} / 风速 ${num(s.wind_kmh)} km/h / 能见度 ${num(s.visibility_km,1)} km</div></div>`:'';}
function controlPanel(){const s=scenario();if(!s)return '';
 return panel('仿真任务配置','基于图搜索与多平台运力约束',`<div class="control-body"><div class="control-section"><div class="field-title">方案优化策略 <small>PLANNING POLICY</small></div><div class="segment">${[['balanced','综合均衡'],['fastest','时效优先'],['safest','风险优先']].map(([id,label])=>`<button data-strategy="${id}" class="${state.strategy===id?'selected':''}">${label}</button>`).join('')}</div><div class="field-help">按路径代价、通行风险、到达时间联合评分并分配平台</div></div><div class="control-section"><div class="field-title">路线寻优算法 <small>GRAPH SEARCH</small></div><div class="segment"><button data-algorithm="astar" class="${state.algorithm==='astar'?'selected':''}">A* 启发搜索</button><button data-algorithm="dijkstra" class="${state.algorithm==='dijkstra'?'selected':''}">Dijkstra</button></div></div><div class="control-section"><div class="field-title">仿真环境 <small>ENVIRONMENT</small></div><div class="form-row"><label class="form-field">天气条件<input class="form-control" value="${esc(weatherName[s.weather])}" readonly /></label><label class="form-field">环境风速<input class="form-control" value="${num(s.wind_kmh)} km/h" readonly /></label></div><div class="field-help">环境参数可在「规则管理」修改，并影响下一次方案与推演。</div></div><div class="control-cta">${btn(`${icon('route',16)} 生成新投送方案`,'generate','btn-primary btn-block')}${btn(`${icon('play',15)} 执行蒙特卡洛推演`,'simulate','btn-outline-lime btn-block',!state.plan?'disabled':'')}<div class="control-meta">${state.plan?`${esc(state.plan.id)} · ${state.plan.summary_data.assigned_count} 项已规划任务`:'等待生成方案'}<br>随机种子 2026 · 80 轮迭代 · 合成实验数据</div></div></div>`, `<span class="soft-tag">CONFIG READY</span>`,'control-panel');
}
function ganttPanel(){return panel('任务甘特图','投送顺序、运力占用与预计完成区间',`<div class="panel-body">${gantt(state.plan?.assignment_data)}<div class="chart-foot"><span>按预计完成时间排序展示</span><span class="text-aqua">${state.plan?.summary_data.assigned_count||0} TASKS PLANNED</span></div></div>`,`<span class="soft-tag">GANTT / ETA</span>`);}
function reliabilityPanel(){return panel('蒙特卡洛可靠性分析','多轮推演的成功率与准点率分布',`<div class="panel-body"><div class="chart-wrap">${lineChart(state.run?.samples)}</div><div class="chart-foot"><div class="chart-legend"><span><i></i> 交付成功率</span><span><i class="aqua"></i> 准点率</span></div><span>${state.run?.iterations||0} ITERATIONS</span></div></div>`,`<span class="soft-tag">A*-SIM</span>`);}
function tableTasks(){const n=Object.fromEntries((state.network?.nodes||[]).map(n=>[n.id,n.name]));
 if(!state.tasks.length)return '<div class="empty"><div class="empty-icon">◇</div>暂无任务，请新增任务</div>';
 return `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>任务编号</th><th>物资 / 载荷</th><th>起点 → 终点</th><th>时限</th><th>优先级</th><th>规划状态</th><th>操作</th></tr></thead><tbody>${state.tasks.map(t=>{const assigned=state.plan?.assignment_data.find(a=>a.task_id===t.id);
 return `<tr><td><span class="cell-main mono">${esc(t.code)}</span><span class="cell-muted">${esc(t.id)}</span></td><td><span class="cell-main">${esc(t.cargo)}</span><span class="cell-muted">${num(t.weight_kg)} kg</span></td><td>${esc(n[t.origin]||t.origin)}<span class="cell-muted">↓ ${esc(n[t.destination]||t.destination)}</span></td><td class="mono">${num(t.deadline_min)} min</td><td><span class="priority p${t.priority}">${['','P1 紧急','P2 常规','P3 低'][t.priority]}</span></td><td>${assigned?'<span class="badge-status">已分配</span>':'<span class="badge-status warn">待优化</span>'}</td><td><button class="btn btn-small btn-ghost" data-action="delete-task" data-id="${esc(t.id)}" aria-label="删除任务 ${esc(t.code)}">${icon('x',12)}</button></td></tr>`}).join('')}</tbody></table></div>`;
}
function dashboard(){return `${title('MISSION INTELLIGENCE','任务态势总览','面向复杂运输任务的多平台协同规划、实时沙盘与仿真决策。',scenarioSelect()+btn(`${icon('plus')} 新建场景`,'new-scenario'))}${dashboardKpis()}<div class="dashboard-grid">${mapPanel()}${controlPanel()}</div><div class="below-grid">${ganttPanel()}${reliabilityPanel()}</div>${panel('投送任务清单','根据当前方案自动展示任务规划状态',tableTasks(),btn(`${icon('plus')} 新增投送任务`,'add-task','btn-small btn-outline-lime'),'table-panel')}`;}

function dataPanel(){const tabs=[['vehicles','运力平台'],['nodes','关键设施'],['edges','路网通道'],['tasks','任务数据']];let body='';
 if(state.dataTab==='vehicles'){body=`<div class="data-table-wrap"><table class="data-table"><thead><tr><th>平台编号</th><th>装备名称 / 类别</th><th>运载能力</th><th>移动速度</th><th>最大续航</th><th>可靠度</th><th>运行状态</th><th>操作</th></tr></thead><tbody>${state.network.vehicles.map(v=>`<tr><td class="mono text-aqua">${esc(v.code)}</td><td><span class="cell-main">${esc(v.name)}</span><span class="cell-muted">${v.category==='ugv'?'地面无人平台 · UGV':'空中无人平台 · UAV'}</span></td><td>${num(v.capacity_kg)} kg</td><td>${num(v.speed_kmh)} km/h</td><td>${num(v.range_km)} km</td><td class="text-lime">${pct(v.reliability*100)}</td><td><span class="badge-status ${v.status==='available'?'':'warn'}">${statusName[v.status]||v.status}</span></td><td><button class="btn btn-small" data-action="vehicle-toggle" data-id="${esc(v.id)}">${v.status==='available'?'置为维护':'恢复就绪'}</button></td></tr>`).join('')}</tbody></table></div>`;
 }else if(state.dataTab==='nodes'){body=`<div class="data-table-wrap"><table class="data-table"><thead><tr><th>设施代码</th><th>名称</th><th>类别</th><th>相对坐标</th><th>设施健康度</th><th>状态</th></tr></thead><tbody>${state.network.nodes.map(n=>`<tr><td class="mono text-aqua">${esc(n.id)}</td><td><span class="cell-main">${esc(n.name)}</span></td><td>${esc(n.category)}</td><td class="mono">${num(n.x)}, ${num(n.y)}</td><td><span class="text-lime">${n.health}%</span></td><td><select class="form-control" style="padding:5px;min-height:31px" data-node-status="${esc(n.id)}"><option value="online" ${n.status==='online'?'selected':''}>正常</option><option value="offline" ${n.status==='offline'?'selected':''}>离线</option></select></td></tr>`).join('')}</tbody></table></div>`;
 }else if(state.dataTab==='edges'){body=`<div class="data-table-wrap"><table class="data-table"><thead><tr><th>路段</th><th>通行节点</th><th>距离</th><th>环境类别</th><th>风险因子</th><th>通行状态</th><th>调整</th></tr></thead><tbody>${state.network.edges.map(e=>`<tr><td class="mono text-aqua">${esc(e.id)}</td><td class="mono">${esc(e.source)} ↔ ${esc(e.target)}</td><td>${num(e.distance_km,1)} km</td><td>${esc(e.terrain)}</td><td>${pct(e.risk*100)}</td><td><span class="badge-status ${e.status==='open'?'':e.status==='closed'?'off':'warn'}">${statusName[e.status]}</span></td><td><select class="form-control" style="padding:5px;min-height:31px" data-edge="${esc(e.id)}"><option value="open" ${e.status==='open'?'selected':''}>畅通</option><option value="restricted" ${e.status==='restricted'?'selected':''}>受限</option><option value="closed" ${e.status==='closed'?'selected':''}>关闭</option></select></td></tr>`).join('')}</tbody></table></div>`;
 }else body=tableTasks();
 return `${title('DATA FOUNDATION','基础数据中心','统一管理地面与空中平台、关键基础设施、通行网络和投送任务。',scenarioSelect()+btn(`${icon('download')} 导出数据`,'export-data'))}${scenarioContext()}<div class="kpi-grid">${kpi('设施节点',state.network.nodes.length,'处','空间化设施目录','database')}${kpi('路网通道',state.network.edges.length,'条','双向路网连通性','route','aqua')}${kpi('可用运力',state.network.vehicles.filter(v=>v.status==='available').length,'台','可参与仿真任务','truck','blue')}${kpi('场景任务',state.tasks.length,'项','含多级优先级','target','orange')}</div>${panel('基础资源台账','修改道路或车辆状态后重新生成方案，保证可追溯性',`<div class="segment" style="margin:0 21px 20px;max-width:480px">${tabs.map(([id,label])=>`<button data-data-tab="${id}" class="${state.dataTab===id?'selected':''}">${label}</button>`).join('')}</div>${body}`,state.dataTab==='tasks'?btn(`${icon('plus')} 新增任务`,'add-task','btn-small btn-primary'):btn(`${icon('plus')} 新增资源`,'add-resource','btn-small btn-primary'),'table-panel')}`;
}

function rules(){const s=scenario();if(!s)return '<div class="empty">请先创建一个场景</div>';
 return `${title('SCENARIO CONFIGURATION','规则与环境管理','控制天气、能见度、基础设施通行条件和调度偏好，并保留方案快照。',scenarioSelect()+btn(`${icon('plus')} 新建场景`,'new-scenario'))}${scenarioContext()}<div class="inner-grid">${panel('运行环境参数','修改以下参数以改变后续路径寻优与推演扰动',`<div class="panel-body"><form class="form-stack" data-form="rules"><div class="form-row"><label>场景名称<input class="form-control" name="name" required minlength="2" value="${esc(s.name)}" /></label><label>天气模式<select class="form-control" name="weather">${Object.entries(weatherName).map(([id,v])=>`<option value="${id}" ${s.weather===id?'selected':''}>${v}</option>`).join('')}</select></label></div><div class="form-row"><label>环境风速 (km/h)<input class="form-control" name="wind_kmh" type="number" step="1" min="0" max="150" value="${num(s.wind_kmh)}" required /></label><label>有效能见度 (km)<input class="form-control" name="visibility_km" type="number" step=".1" min=".1" max="60" value="${num(s.visibility_km,1)}" required /></label></div><label>方案描述<input class="form-control" name="description" maxlength="2000" value="${esc(s.description)}" /></label><div class="form-actions">${btn(`${icon('check')} 保存环境设置`,'form-submit','btn-primary','type="submit"')}</div></form><div class="small-note">说明：修改规则不会回写历史方案；请重新生成方案并运行新的仿真，以便对比结果。</div></div>`,`<span class="soft-tag">WEATHER MODEL</span>`)}${panel('约束与风险策略','策略说明 / 模型边界',`<div class="panel-body"><div class="event-list">${[['可行性约束','载荷上限、平台续航、道路通行状态、恶劣天气限制。'],['路径求解','支持 A* 启发式搜索和 Dijkstra 最短路径；关闭路段不会参与搜索。'],['时间约束','按截止时间、装载时间、车辆状态和气象系数估算到达时刻。'],['统计方式','带种子的可复现蒙特卡洛扰动；输出成功率、准点率、P90、综合分。'],['使用边界','此系统使用虚拟路网与合成风险模型，不代表真实交通或飞行安全认证。']].map(([a,b])=>`<div class="event-item"><div class="event-marker"></div><div class="event-content"><strong>${a}</strong><p>${b}</p></div></div>`).join('')}</div></div>`,`<span class="soft-tag">SIMULATION RULESET</span>`)}</div>${panel('路网限制与设施影响','可在基础数据中直接更改每一条路段的开放状态',`<div class="panel-body"><div class="mini-stat-row">${[['畅通道路',state.network.edges.filter(e=>e.status==='open').length],['受限道路',state.network.edges.filter(e=>e.status==='restricted').length],['关闭道路',state.network.edges.filter(e=>e.status==='closed').length]].map(([a,b])=>`<div class="mini-stat"><span>${a}</span><strong>${b}</strong></div>`).join('')}</div><div style="margin-top:20px">${btn(`${icon('settings')} 打开路网编辑`,'go-edges')}</div></div>`,'','table-panel')}`;
}

function planTable(){const assignments=state.plan?.assignment_data||[];if(!assignments.length)return '<div class="empty">尚无可行规划任务</div>';
 return `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>任务编号</th><th>执行平台</th><th>路由节点</th><th>距离</th><th>起始时刻</th><th>预计抵达</th><th>路径风险</th><th>时限评价</th></tr></thead><tbody>${assignments.map(a=>`<tr><td class="mono text-aqua">${esc(a.code)}</td><td class="cell-main">${esc(a.vehicle_code)}</td><td><span class="cell-main mono">${esc(a.origin)} → ${esc(a.destination)}</span><span class="cell-muted">${a.path_nodes.length} 个节点 / ${a.path_edges.length} 条路段</span></td><td>${num(a.distance_km,1)} km</td><td>${fmtTime(a.start_min)}</td><td>${fmtTime(a.end_min)}</td><td>${pct(a.risk*100)}</td><td><span class="badge-status ${a.on_time_expected?'':'warn'}">${a.on_time_expected?'预计准点':'预计超时'}</span></td></tr>`).join('')}</tbody></table></div>`;
}
function planning(){const p=state.plan;return `${title('MISSION PLANNING','智能投送方案规划','运用图搜索算法、运力约束与时间窗调度，生成可追溯的任务执行方案。',scenarioSelect()+btn(`${icon('refresh')} 重新生成`,'generate','btn-primary'))}${scenarioContext()}<div class="kpi-grid">${kpi('成功分配任务',p?.summary_data.assigned_count||0,`/ ${state.tasks.length}`,'覆盖所有可行任务','target')}${kpi('计划总航程',num(p?.summary_data.distance_km||0,1),'km','含调度及驶入路径','route','aqua')}${kpi('计划收敛时间',num(p?.summary_data.makespan_min||0,1),'min','最后一项任务抵达','clock','blue')}${kpi('方案准点率',num(p?.summary_data.estimated_on_time_pct||0,1),'%','生成时的静态估算','chart','orange')}</div><div class="dashboard-grid">${mapPanel()}${controlPanel()}</div>${panel('当前方案执行矩阵',p?`${p.id} · ${strategyName[p.strategy]} · ${p.algorithm.toUpperCase()}`:'等待规划器输出',planTable(),`<span class="soft-tag">${p?.assignment_data.length||0} ASSIGNMENTS</span>`,'table-panel')}${panel('历史方案版本','每次生成均保存快照，后续仿真与方案绑定',`<div class="panel-body">${(state.plans||[]).slice(0,7).map(v=>`<div class="sim-run-card ${p?.id===v.id?'selected':''}"><div><h3>${esc(v.name)}</h3><p>${esc(v.id)} · ${esc(v.algorithm.toUpperCase())} · ${new Date(v.created_at).toLocaleString('zh-CN')}</p></div>${btn(p?.id===v.id?'当前方案':'查看方案','choose-plan','btn-small',`data-id="${esc(v.id)}"`)}</div>`).join('')||'<div class="empty">尚无历史方案</div>'}</div>`,'','table-panel')}`;
}

function playback(){const end=Math.max(1,...(state.run?.events||[]).map(e=>e.at_min));return `<div class="panel-body"><div class="control-inline" style="justify-content:space-between;margin-bottom:11px"><div class="control-inline">${btn(state.playing?`${icon('pause')} 暂停`:`${icon('play')} 回放`,'playback','btn-small btn-primary')}${btn(`${icon('refresh')} 重置`,'reset-play','btn-small')}${btn(`${state.playSpeed}× 速度`,'speed','btn-small')}</div><strong class="mono text-aqua">T + ${num(state.playMinute,1)} / ${num(end,1)} MIN</strong></div><input aria-label="仿真回放进度" type="range" class="form-control" id="play-slider" min="0" max="${end}" step=".5" value="${state.playMinute}" /><div class="chart-foot"><span>0 min / 起始</span><span>时间轴可拖动 · 支持暂停</span><span>${num(end,0)} min / 完成</span></div></div>`;}
function eventFeed(){return `<div class="panel-body"><div class="event-list">${(state.run?.events||[]).filter(e=>e.kind!=='position').slice(0,26).map(e=>`<div class="event-item"><div class="event-marker ${e.kind==='warning'?'warning':e.kind==='arrived'?'arrived':''}"></div><div class="event-content"><strong>${esc(e.message)}</strong><p>${esc(e.vehicle)} · ${esc(e.code)}</p></div><span class="event-time">+${num(e.at_min,1)}m</span></div>`).join('')||'<div class="empty">暂无事件</div>'}</div></div>`;}
function simulation(){const m=selected();return `${title('MISSION EXECUTION','行动推演中心','使用 A*-SIM 引擎生成可重现的任务时间线、执行事件和多轮统计样本。',scenarioSelect()+btn(`${icon('play')} 执行新一轮推演`,'simulate','btn-primary',state.plan?'':'disabled'))}${scenarioContext()}<div class="kpi-grid">${kpi('运行迭代',state.run?.iterations||0,'轮','固定种子可重复运行','refresh')}${kpi('平均延迟',num(m.avg_delay_min||0,1),'min','随机环境扰动造成','clock','aqua')}${kpi('路网风险事件',num(m.avg_incidents||0,2),'次/轮','模型估计均值','alert','orange')}${kpi('P90 完成时间',num(m.p90_duration_min||0,1),'min','90% 样本不超过此时间','activity','blue')}</div><div class="inner-grid">${panel('时空演化沙盘','随时间轴回放运输节点、设施与移动平台',networkMap(state.network,state.plan,state.run,state.playMinute,true)+playback(),`<span class="live-tag">● REPLAY ENGINE</span>`,'map-panel')}${panel('推演事件序列','调度、节点到达、环境扰动与交付结果',eventFeed(),`<span class="soft-tag">${state.run?.events?.length||0} EVENTS</span>`)}</div><div class="below-grid">${ganttPanel()}${reliabilityPanel()}</div>`;}

function analytics(){const m=selected();const runs=state.runs;return `${title('EVALUATION & INSIGHTS','效能评估与方案对比','通过大量可重现样本比较任务成功率、准点率、运力效率及环境敏感性。',scenarioSelect()+btn(`${icon('download')} 导出评估报告`,'export-report','btn-primary'))}${dashboardKpis()}<div class="analysis-grid">${panel('综合效能评分','模型权重：成功交付 48% / 准点 35% / 安全 17%',`<div class="panel-body"><div class="score-section"><div class="score-ring">${scoreDonut(m.score)}</div><div class="score-breakdown">${[['投送完成率',m.success_pct],['任务准点率',m.on_time_pct],['运力利用率',m.fleet_utilization_pct]].map(([label,value])=>`<div><div class="breakdown-line"><span>${label}</span><b>${pct(value||0)}</b></div><div class="progress-rail"><span style="width:${Math.max(0,Math.min(100,value||0))}%"></span></div></div>`).join('')}</div></div></div>`)}${reliabilityPanel()}</div><div class="below-grid">${panel('多方案横向对比','比较同一场景最近四次仿真输出',`<div class="panel-body">${compareBars(runs.slice(0,4))}</div>`,`<span class="soft-tag">COMPARATIVE ANALYSIS</span>`)}${panel('仿真版本归档','历史记录保留参数、迭代次数、结果与事件样本',`<div class="panel-body">${runs.slice(0,5).map(r=>`<div class="sim-run-card ${state.run?.id===r.id?'selected':''}"><div><h3>${esc(r.id)}</h3><p>SEED ${r.seed} · ${r.iterations} 轮 · ${new Date(r.created_at).toLocaleString('zh-CN')}</p></div><div style="display:flex;align-items:center;gap:12px"><span class="run-score">${num(r.metrics.score,1)}</span>${btn('查看','choose-run','btn-small',`data-id="${esc(r.id)}"`)}</div></div>`).join('')||'<div class="empty">暂无仿真记录</div>'}</div>`,'','') }</div>${panel('研究边界与模型解释','所有指标均基于虚构网络和合成干扰参数，不等价于现实可靠性认证',`<div class="panel-body"><div class="mini-stat-row"><div class="mini-stat"><span>采样数量</span><strong>${state.run?.iterations||0} <small>轮</small></strong></div><div class="mini-stat"><span>平均完成用时</span><strong>${num(m.avg_duration_min||0,1)} <small>min</small></strong></div><div class="mini-stat"><span>风险事件均值</span><strong>${num(m.avg_incidents||0,2)}</strong></div></div><p class="small-note" style="margin:15px 0 0">评估使用独立蒙特卡洛迭代；相同的规划快照、随机种子及环境数据可得到相同的输出。道路参数变更后，旧规划仍可审计，但请重新生成规划以获得一致的当前环境估计。</p></div>`,'','table-panel')}`;}

async function audit(){main.innerHTML=`${title('GOVERNANCE & AUDIT','审计与操作追溯','追踪场景、路网、方案生成和仿真运行的关键操作，支持治理复核。')}${panel('系统审计轨迹','只记录应用内重要写入操作，不包含用户密码',`<div class="loading-screen" style="height:200px"><span class="spinner"></span> 正在读取日志</div>`,'','table-panel')}`;
 try{const logs=await get('/audit');main.innerHTML=`${title('GOVERNANCE & AUDIT','审计与操作追溯','追踪场景、路网、方案生成和仿真运行的关键操作，支持治理复核。')}${panel('系统审计轨迹',`当前显示最近 ${logs.length} 条操作记录`,`<div class="data-table-wrap"><table class="data-table"><thead><tr><th>时间</th><th>操作主体</th><th>动作</th><th>资源</th><th>数据快照</th></tr></thead><tbody>${logs.map(a=>`<tr><td class="mono">${new Date(a.created_at).toLocaleString('zh-CN')}</td><td>${esc(a.actor)}</td><td class="text-aqua mono">${esc(a.action)}</td><td class="mono">${esc(a.subject)}</td><td class="mono" style="max-width:260px;overflow:hidden;text-overflow:ellipsis">${esc(a.details)}</td></tr>`).join('')}</tbody></table></div>`,`<span class="soft-tag">IMMUTABLE EVENTS*</span>`,'table-panel')}<p class="small-note">* 应用层仅追加审计记录；SQLite 数据库管理员仍可能修改底层数据。正式环境应配置独立审计存储。</p>`;}
 catch(e){main.innerHTML=`${title('GOVERNANCE','审计日志',e.message)}<div class="empty">需要管理员权限</div>`;}
}
function render(){navRender();if(!state.scenarios.length){main.innerHTML=title('START','仿真控制台','没有场景数据，请确认后端初始化配置。',btn('新建场景','new-scenario','btn-primary'));return;}
 if(state.page==='audit'){audit();return;}
 main.innerHTML=({overview:dashboard,data:dataPanel,rules,planning,simulation,analytics}[state.page]||dashboard)();
 attachMapClicks();
}
function attachMapClicks(){document.querySelectorAll('.map-node').forEach(n=>{n.setAttribute('tabindex','0');n.setAttribute('role','button');n.setAttribute('aria-label',`查看设施 ${n.dataset.node}`);});}
function showModal(heading,sub,inner,formType){modalRoot.className='modal-root-active';modalRoot.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(heading)}"><h2>${esc(heading)}</h2><p class="modal-sub">${esc(sub)}</p><form class="form-stack" data-form="${formType}">${inner}<div class="form-actions">${btn('取消','close-modal')}${btn('保存并提交','form-submit','btn-primary','type="submit"')}</div></form></div>`;}
function closeModal(){modalRoot.className='modal-root';modalRoot.innerHTML='';}
function addTaskModal(){const n=state.network.nodes.map(n=>`<option value="${esc(n.id)}">${esc(n.id)} · ${esc(n.name)}</option>`).join('');
 showModal('新建投送任务','为当前仿真场景添加一个具备载荷、起讫节点与时限约束的任务。',`<label>物资名称<input class="form-control" name="cargo" required minlength="2" maxlength="90" placeholder="如：关键传感器组件" /></label><div class="form-row"><label>载荷重量 (kg)<input class="form-control" type="number" min=".1" max="5000" name="weight_kg" value="35" step=".1" required/></label><label>任务时限 (min)<input class="form-control" type="number" min="1" max="1440" name="deadline_min" value="120" required /></label></div><div class="form-row"><label>起始节点<select class="form-control" name="origin">${n}</select></label><label>交付节点<select class="form-control" name="destination">${state.network.nodes.slice(1).concat(state.network.nodes.slice(0,1)).map(n=>`<option value="${esc(n.id)}">${esc(n.id)} · ${esc(n.name)}</option>`).join('')}</select></label></div><label>任务优先级<select class="form-control" name="priority"><option value="1">P1 · 紧急</option><option selected value="2">P2 · 常规</option><option value="3">P3 · 低</option></select></label>`,'task');}
function addResourceModal(){
 const nodes=state.network.nodes.map(n=>`<option value="${esc(n.id)}">${esc(n.id)} · ${esc(n.name)}</option>`).join('');
 if(state.dataTab==='nodes'){
  showModal('新建基础设施节点','节点坐标基于虚拟 100 × 100 路网，不代表实际 GPS 坐标。',`<div class="form-row"><label>节点编码<input class="form-control" name="id" pattern="[A-Za-z0-9_-]+" minlength="2" maxlength="40" placeholder="N13" required /></label><label>设施类别<select class="form-control" name="category"><option value="depot">转运站</option><option value="hub">枢纽</option><option value="delivery">配送点</option><option value="critical">重要设施</option><option value="command">指挥中心</option></select></label></div><label>设施名称<input class="form-control" name="name" minlength="2" maxlength="80" placeholder="例如：西部接驳站" required /></label><div class="form-row"><label>横坐标 X<input class="form-control" type="number" name="x" min="0" max="100" value="45" required /></label><label>纵坐标 Y<input class="form-control" type="number" name="y" min="0" max="100" value="75" required /></label></div><label>设施健康度（0–100）<input class="form-control" type="number" name="health" min="0" max="100" value="100" required /></label>`,'node');
 }else if(state.dataTab==='edges'){
  showModal('新建双向通行路段','连接两处既有设施，规划器将自动将该路径纳入图搜索。',`<div class="form-row"><label>起点<select class="form-control" name="source">${nodes}</select></label><label>终点<select class="form-control" name="target">${state.network.nodes.slice(1).concat(state.network.nodes.slice(0,1)).map(n=>`<option value="${esc(n.id)}">${esc(n.id)} · ${esc(n.name)}</option>`).join('')}</select></label></div><div class="form-row"><label>路段长度（km）<input class="form-control" type="number" name="distance_km" min=".1" step=".1" value="12" required /></label><label>风险因子（0–0.95）<input class="form-control" type="number" name="risk" min="0" max=".95" step=".01" value=".05" required /></label></div><label>路段环境<select class="form-control" name="terrain"><option value="urban">城市</option><option value="coastal">滨海</option><option value="mountain">山地</option><option value="rural">乡村</option></select></label>`,'edge');
 }else if(state.dataTab==='vehicles'){
  showModal('新增无人运载平台','添加符合运力、速度、续航及可靠度约束的运输资源。',`<div class="form-row"><label>平台编号<input class="form-control" name="code" placeholder="UGV-999" minlength="3" maxlength="40" required /></label><label>平台类型<select class="form-control" name="category"><option value="ugv">地面无人运输车</option><option value="drone">空中配送无人机</option></select></label></div><label>平台名称<input class="form-control" name="name" placeholder="例如：重载运载平台 C" minlength="2" maxlength="80" required /></label><div class="form-row"><label>载重上限 kg<input class="form-control" type="number" min=".1" name="capacity_kg" value="400" required /></label><label>行驶速度 km/h<input class="form-control" type="number" min=".1" name="speed_kmh" value="55" required /></label></div><div class="form-row"><label>单次续航 km<input class="form-control" type="number" min=".1" name="range_km" value="160" required /></label><label>可靠度（0–1）<input class="form-control" type="number" min="0" max="1" step=".01" name="reliability" value=".96" required /></label></div><label>初始驻地<select class="form-control" name="home_node">${nodes}</select></label>`,'vehicle');
 }
}
function addScenarioModal(){showModal('创建仿真场景','设置环境参数与场景基础信息。新建场景默认没有任务。',`<label>场景名称<input class="form-control" name="name" required minlength="2" maxlength="100" placeholder="例如：城市应急配送方案" /></label><label>场景说明<input class="form-control" name="description" maxlength="2000" placeholder="描述任务目标与边界" /></label><div class="form-row"><label>天气模式<select class="form-control" name="weather">${Object.entries(weatherName).map(([a,b])=>`<option value="${a}">${b}</option>`).join('')}</select></label><label>风速 km/h<input class="form-control" name="wind_kmh" type="number" min="0" max="150" value="12" required /></label></div><label>能见度 km<input class="form-control" name="visibility_km" type="number" min=".1" max="60" step=".1" value="15" required /></label>`,'scenario');}
async function update(){await loadCore();render();}
async function execute(action,target){
 try {
  if(action==='close-modal'){closeModal();return;}
  if(action==='new-scenario'){addScenarioModal();return;}
  if(action==='add-task'){addTaskModal();return;}
  if(action==='add-resource'){addResourceModal();return;}
  if(action==='generate'){
   setBusy(true);const plan=await post('/plans',{scenario_id:state.scenarioId,strategy:state.strategy,algorithm:state.algorithm});
   state.plan=plan;state.run=null;toast(`方案已生成：成功分配 ${plan.summary_data.assigned_count}/${plan.summary_data.task_count} 项任务`);
   await update();state.plan=state.plans.find(p=>p.id===plan.id)||plan;state.run=null;render();return;
  }
  if(action==='simulate'){
   if(!state.plan)throw new Error('请先生成投送方案');setBusy(true);
   const run=await post('/simulations',{plan_id:state.plan.id,seed:2026,iterations:80});state.run=run;
   await update();state.run=run;state.page='simulation';state.playMinute=0;
   toast(`推演完成：${run.iterations} 轮，综合评分 ${num(run.metrics.score,1)}`);render();return;
  }
  if(action==='toggle-plan'){state.showPlan=!state.showPlan;render();return;}
  if(action==='vehicle-toggle'){const v=state.network.vehicles.find(v=>v.id===target.dataset.id);if(!v)return;
   await patch(`/vehicles/${encodeURIComponent(v.id)}`,{status:v.status==='available'?'maintenance':'available'});toast(`平台 ${v.code} 状态已更新`);await update();return;}
  if(action==='delete-task'){
   if(!confirm('确定删除此投送任务吗？历史方案仍保留该任务的快照。'))return;
   await del(`/scenarios/${encodeURIComponent(state.scenarioId)}/tasks/${encodeURIComponent(target.dataset.id)}`);toast('任务已删除');await update();return;
  }
  if(action==='choose-plan'){state.plan=state.plans.find(p=>p.id===target.dataset.id)||state.plan;state.run=state.runs.find(r=>r.plan_id===state.plan.id)||null;render();return;}
  if(action==='choose-run'){state.run=state.runs.find(r=>r.id===target.dataset.id)||state.run;state.plan=state.plans.find(p=>p.id===state.run.plan_id)||state.plan;render();return;}
  if(action==='export-data'){download(`${state.scenarioId}-network.json`,JSON.stringify({scenario:scenario(),nodes:state.network.nodes,edges:state.network.edges,vehicles:state.network.vehicles,tasks:state.tasks},null,2),'application/json');toast('场景数据已导出');return;}
  if(action==='export-report'){if(!state.run)throw new Error('暂无可导出的评估');download(`${state.run.id}-report.json`,JSON.stringify({scenario:scenario(),plan:state.plan,simulation:state.run,notes:'Synthetic virtual network; not real-world safety validation.'},null,2),'application/json');toast('评估数据已导出');return;}
  if(action==='go-edges'){state.page='data';state.dataTab='edges';render();return;}
  if(action==='playback'){state.playing=!state.playing;play();render();return;}
  if(action==='reset-play'){state.playing=false;stopPlayback();state.playMinute=0;render();return;}
  if(action==='speed'){state.playSpeed=state.playSpeed===1?2:state.playSpeed===2?4:1;render();return;}
 } catch(e){alertError(e);} finally {setBusy(false);}
}
function download(filename,text,type){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function stopPlayback(){if(state.timer)clearInterval(state.timer);state.timer=null;}
function play(){stopPlayback();if(!state.playing)return;
 const events=state.run?.events||[];const end=Math.max(1,...events.map(e=>e.at_min));
 state.timer=setInterval(()=>{state.playMinute=Math.min(end,state.playMinute+.6*state.playSpeed);if(state.playMinute>=end){state.playing=false;stopPlayback();}if(state.page==='simulation')render();},300);
}

async function submitForm(form){const type=form.dataset.form;
 const fields=Object.fromEntries(new FormData(form).entries());try {
  if(type==='scenario'){
    const created=await post('/scenarios',{...fields,wind_kmh:Number(fields.wind_kmh),visibility_km:Number(fields.visibility_km)});
    state.scenarioId=created.id;state.plan=null;state.run=null;state.page='data';state.dataTab='tasks';toast('新场景已建立，请添加投送任务');
  } else if(type==='task'){
    await post(`/scenarios/${encodeURIComponent(state.scenarioId)}/tasks`,{...fields,weight_kg:Number(fields.weight_kg),deadline_min:Number(fields.deadline_min),priority:Number(fields.priority)});
    toast('任务已添加；生成新方案以纳入规划');
  } else if(type==='node'){
    await post('/network/nodes',{...fields,x:Number(fields.x),y:Number(fields.y),health:Number(fields.health)});
    toast('节点已创建，现可连接新路段');
  } else if(type==='edge'){
    await post('/network/edges',{...fields,distance_km:Number(fields.distance_km),risk:Number(fields.risk)});
    toast('双向路段已成功加入网络');
  } else if(type==='vehicle'){
    await post('/vehicles',{...fields,capacity_kg:Number(fields.capacity_kg),speed_kmh:Number(fields.speed_kmh),range_km:Number(fields.range_km),reliability:Number(fields.reliability)});
    toast('新运载平台已纳入运力台账');
  } else if(type==='rules'){
    await patch(`/scenarios/${encodeURIComponent(state.scenarioId)}`,{...fields,wind_kmh:Number(fields.wind_kmh),visibility_km:Number(fields.visibility_km)});
    toast('场景规则已保存；新规则将在下一轮规划中生效');
  }
  closeModal();await update();
 }catch(e){alertError(e);}}
function showLogin(){
 main.innerHTML=`${title('AUTHORIZED ACCESS','AETHER 系统登录','演示模式之外需要受授权的管理员或规划员账号。')}<div class="panel" style="max-width:420px"><div class="panel-header"><h2 class="panel-title">用户身份验证</h2></div><div class="panel-body"><form class="form-stack" id="login-form"><label>用户名<input class="form-control" name="username" autocomplete="username" required /></label><label>密码<input class="form-control" type="password" name="password" autocomplete="current-password" required /></label><button class="btn btn-primary btn-block" type="submit">登录平台</button></form></div></div>`;
}

window.addEventListener('click',async e=>{
 const pageButton=e.target.closest('[data-page]');if(pageButton){state.page=pageButton.dataset.page;state.playing=false;stopPlayback();render();document.querySelector('#sidebar').classList.remove('mobile-open');window.scrollTo({top:0,behavior:'smooth'});return;}
 const seg=e.target.closest('[data-strategy]');if(seg){state.strategy=seg.dataset.strategy;render();return;}
 const alg=e.target.closest('[data-algorithm]');if(alg){state.algorithm=alg.dataset.algorithm;render();return;}
 const tab=e.target.closest('[data-data-tab]');if(tab){state.dataTab=tab.dataset.dataTab;render();return;}
 if(e.target.closest('#menu-toggle')){document.querySelector('#sidebar').classList.toggle('mobile-open');return;}
 if(e.target.closest('#modal-root') && e.target===modalRoot){closeModal();return;}
 const node=e.target.closest('[data-node]');if(node){const n=state.network?.nodes.find(x=>x.id===node.dataset.node);if(n)toast(`${n.name} · ${n.id} | 设施健康 ${n.health}% | ${statusName[n.status]}`);return;}
 const action=e.target.closest('[data-action]');if(action)await execute(action.dataset.action,action);
});
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
window.addEventListener('change',async e=>{
 if(e.target.id==='scenario-select'){state.scenarioId=e.target.value;state.plan=null;state.run=null;state.playing=false;stopPlayback();try{await loadScenario();render();}catch(err){alertError(err);}return;}
 if(e.target.matches('[data-edge]')){try{await patch(`/network/edges/${encodeURIComponent(e.target.dataset.edge)}`,{status:e.target.value});toast('路段状态已更新；请生成新规划');await update();}catch(err){alertError(err);}return;}
 if(e.target.matches('[data-node-status]')){try{await patch(`/network/nodes/${encodeURIComponent(e.target.dataset.nodeStatus)}`,{status:e.target.value});toast('设施状态已更新；新规划将避让离线节点');await update();}catch(err){alertError(err);}return;}
});
window.addEventListener('input',e=>{if(e.target.id==='play-slider'){state.playMinute=Number(e.target.value);state.playing=false;stopPlayback();render();}});
window.addEventListener('submit',async e=>{if(e.target.matches('form[data-form]')){e.preventDefault();await submitForm(e.target);}else if(e.target.id==='login-form'){e.preventDefault();try{const form=new FormData(e.target);await login(form.get('username'),form.get('password'));await loadCore();render();}catch(err){alertError(err);}}});

(async()=>{try{if(!await initAuth()){showLogin();return;}await loadCore();render();}catch(e){console.error(e);main.innerHTML=`${title('INITIALIZATION FAILURE','服务尚不可用','后端服务未能初始化，请检查接口连通性。')}<div class="scenario-description">${icon('alert',20)} ${esc(e.message)}</div>${btn(`${icon('refresh')} 重试连接`,'reload','btn-primary')}`;document.querySelector('[data-action="reload"]')?.addEventListener('click',()=>location.reload());}})();
