import {get,post,patch,del,initAuth,login,whoami} from './api.js';
import {esc,num,icon,gantt,lineChart,scoreDonut,compareBars} from './charts.js';
import {renderGeoMap} from './map.js';
import {assessmentMarkup,mountAssessment} from './assessment.js';
import {workspaceMarkup,mountWorkspace} from './workspace.js';
const BRAND_ICON=document.querySelector('.brand-mark img')?.src||'/assets/logo.svg';
let activeAssessment=null;
let selectionTicket=0;
let modalReturnFocus=null;

const MODULES=[
 {id:'data',name:'空投资源',en:'AIRDROP RESOURCES',desc:'合成接收点、空投通道、无人机与审计记录',icon:'database',tabs:[['nodes','接收与补给点'],['edges','空投通道'],['vehicles','无人机资源'],['audit','实验审计']]},
 {id:'scenario',name:'应急场景',en:'CIVIL AID SCENARIO',desc:'民生物资任务、环境假设与无人机资源配置',icon:'rules',tabs:[['list','当前场景'],['tasks','空投任务'],['formations','无人机编组'],['deployment','合成部署图'],['conditions','环境条件'],['facilities','节点状态']]},
 {id:'planning',name:'空投方案',en:'AIRDROP PLANNING',desc:'民用物资分配、直接空投示意与方案归档',icon:'route',tabs:[['workspace','方案编排'],['route','示意路线'],['archive','方案档案']]},
 {id:'simulation',name:'空投仿真',en:'CIVIL AID SIMULATION',desc:'环境变量实验、可复现回放与实验记录',icon:'play',tabs:[['control','实验控制'],['telemetry','仿真状态'],['events','实验日志'],['history','历史运行'],['experiments','实验记录']]},
 {id:'analytics',name:'实验评估',en:'EXPERIMENT ANALYTICS',desc:'空投交付指标、环境变量对比与报告输出',icon:'chart',tabs:[['overview','实验概览'],['transport','空投任务统计'],['delivery','交付结果'],['metrics','实验指标'],['compare','实验对比'],['reports','报告中心']]},
];
const S={module:'home',tabs:{data:'nodes',scenario:'list',planning:'workspace',simulation:'control',analytics:'overview'},city:sessionStorage.getItem('aether_regional_workspace_v2')?(sessionStorage.getItem('aether_city')||'national'):'national',cities:[],network:{nodes:[],edges:[],vehicles:[]},scenarios:[],scenarioId:'',tasks:[],plans:[],runs:[],experiments:[],planId:'',runId:'',overview:{},loading:false,strategy:'balanced',algorithm:'astar',routeFrom:'',routeTo:'',routeData:null,playMinute:0,play:false,playSpeed:1,interval:0,seed:2026,iterations:80,showRoutes:true,search:'',compareIds:[],audits:[],formMode:'',configuration:{objective:'',units:[],layers:{}},telemetry:null,report:null,eventFilter:'all',eventText:'',telemetryTicket:0};
const root=document.getElementById('main');const modal=document.getElementById('modal-root');
const names={port:'归档港口节点',ship:'归档船舶',truck:'归档车辆',road:'归档陆路',sea:'归档海运',airdrop:'无人机空投',available:'可用',maintenance:'维护中',offline:'已停用',online:'运行中',open:'可用',restricted:'受限',closed:'关闭',hub:'合成补给点',depot:'物资站点',critical:'重点接收点',command:'场景节点',delivery:'救援接收点',ugv:'归档地面平台',drone:'民用应急无人机',clear:'晴朗',rain:'降雨',wind:'有风',fog:'低能见度',balanced:'综合均衡',fastest:'时效优先',safest:'稳健策略'};
const city=()=>S.cities.find(c=>c.id===S.city)||S.cities[0];
const scenario=()=>S.scenarios.find(x=>x.id===S.scenarioId);
const plan=()=>S.plans.find(x=>x.id===S.planId)||null;
const run=()=>S.runs.find(x=>x.id===S.runId)||null;
const idName=id=>S.network.nodes.find(n=>n.id===id)?.name||id;
const txt=(v)=>esc(String(v??''));
const nfmt=(v,d=0)=>num(v,d);
function alertUser(msg,isError=false){const node=document.createElement('div');node.className='toast'+(isError?' toast-danger':'');node.innerHTML=`<span>${isError?'⚠':'✓'}</span> ${txt(msg)}`;document.querySelector('#toasts').append(node);setTimeout(()=>node.remove(),4700);}
const fail=e=>{console.error(e);alertUser(e.message||'服务请求失败',true)};
function action(text,act,type='ghost',extra=''){return `<button class="button button-${type}" data-act="${act}" ${extra}>${text}</button>`;}
function badge(text,type='normal'){return `<span class="badge ${type}">${txt(text)}</span>`;}
function heading(no,title,caption,side=''){return `<section class="page-heading"><div><div class="overline"><span class="overline-line"></span> ${no}</div><h1>${title}</h1><p>${caption}</p></div><div class="heading-side">${side}</div></section>`;}
function panel(title,subtitle,body,actions='',clazz=''){return `<section class="card ${clazz}"><div class="card-head"><div><h2>${title}</h2><small>${subtitle}</small></div><div class="card-actions">${actions}</div></div>${body}</section>`;}
function metric(label,value,suffix,note,ico='activity'){return `<div class="metric"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon(ico,19)}</span></div><div class="metric-value">${txt(value)}<span>${suffix}</span></div><div class="metric-bottom">${note}</div></div>`;}
function stats(items){return `<div class="metrics">${items.map(a=>metric(...a)).join('')}</div>`;}
function empty(text,act='',label=''){return `<div class="empty-state"><div class="empty-glyph">◇</div><strong>${text}</strong>${act?action(label,act,'primary'):''}</div>`;}
function mapCard(title='合成空投场景图',sub='相对坐标示意 · 不代表真实地理位置'){return `<section class="map-context-card"><b>${title}</b><small>${sub}</small><label class="toggle"><input type="checkbox" id="route-switch" ${S.showRoutes?'checked':''}><span>显示方案线路</span></label></section>`;}
function renderMap(){renderGeoMap(S.network,city(),plan(),{cities:S.cities,onCity:id=>chooseCity(id).catch(fail),routes:S.showRoutes,layers:S.module==='scenario'?S.configuration.layers:null,formations:S.module==='scenario'?S.configuration.units:null,telemetry:S.module==='simulation'?S.telemetry:null,preview:S.module==='planning'&&S.tabs.planning==='route'?S.routeData:null,minute:S.module==='simulation'?S.playMinute:null,run:run()});}
function tabs(){const m=MODULES.find(m=>m.id===S.module);return `<div class="subnav" aria-label="${m.name}二级功能">${m.tabs.map(([id,label],i)=>`<button data-tab="${id}" class="subnav-button ${S.tabs[m.id]===id?'current':''}"><span class="subnav-index">0${i+1}</span>${label}</button>`).join('')}</div>`;}
function scenarioPicker(){return `<label class="header-filter"><span>当前想定</span><select id="scenario-select" aria-label="选择想定">${S.scenarios.map(x=>`<option value="${txt(x.id)}" ${S.scenarioId===x.id?'selected':''}>${txt(x.name)}</option>`).join('')}</select></label>`;}
function renderNavigation(){
 const current=MODULES.find(m=>m.id===S.module);
 const navigation=document.getElementById('nav');
 // 一级首页不提供侧边栏；二级工作台的导航只包含当前模块自身的功能。
 navigation.innerHTML=current?current.tabs.map(([id,label],i)=>`<button class="rail-link ${S.tabs[current.id]===id?'selected':''}" data-tab="${id}" aria-current="${S.tabs[current.id]===id?'page':'false'}"><span class="rail-icon rail-step">${String(i+1).padStart(2,'0')}</span><span class="rail-link-text">${label}<small>${current.en}</small></span><span class="rail-num">↗</span></button>`).join(''):'';
 document.querySelector('.rail-heading').innerHTML=current?`${current.name} / 二级功能 <span>${String(current.tabs.length).padStart(2,'0')}</span>`:'';
 document.getElementById('breadcrumb').textContent=current?`${current.name} / ${current.tabs.find(t=>t[0]===S.tabs[current.id])?.[1]||''}`:'一级首页';
 document.querySelector('#city-select').innerHTML=S.cities.map(c=>`<option value="${c.id}" ${S.city===c.id?'selected':''}>${c.name} · ${c.province}</option>`).join('');
 document.querySelector('.home-link').textContent='← 返回一级首页';
}
const allowedModule=id=>MODULES.some(m=>m.id===id);
function routeState(){
 const pieces=decodeURIComponent(location.hash.replace(/^#\/?/,'')).split('/').filter(Boolean);
 const module=allowedModule(pieces[0])?pieces[0]:'home';
 const def=MODULES.find(x=>x.id===module);
 const tab=def?.tabs.some(([id])=>id===pieces[1])?pieces[1]:def?.tabs[0]?.[0];
 return {module,tab};
}
function routeHref(module,tab){return module==='home'?'#/home':`#/${module}/${tab||MODULES.find(m=>m.id===module)?.tabs[0][0]}`;}
function writeRoute(replace=false){
 const href=routeHref(S.module,S.tabs[S.module]);
 if(location.hash!==href)history[replace?'replaceState':'pushState'](null,'',href);
}
function syncRoute(){
 const next=routeState();
 S.module=next.module;
 if(next.tab)S.tabs[next.module]=next.tab;
 S.play=false;stopPlayback();
 render();if(next.module==='simulation')loadTelemetry();
}
function selectTab(tab){
 const def=MODULES.find(m=>m.id===S.module);
 if(!def?.tabs.some(([id])=>id===tab))return;
 S.tabs[S.module]=tab;
 writeRoute();
 if(S.module==='data'&&tab==='audit')get('/audit?limit=100').then(a=>{S.audits=a;render();}).catch(fail);
 if(S.module==='simulation'&&tab==='experiments')get('/experiments?scenario_id='+encodeURIComponent(S.scenarioId)+'&limit=100').then(a=>{S.experiments=a;render();}).catch(fail);
 render();if(S.module==='simulation')loadTelemetry();
}
async function refresh(){const slug=encodeURIComponent(S.city);
  const [network,scenarios,overview]=await Promise.all([get(`/network?city_id=${slug}`),get(`/scenarios?city_id=${slug}`),get(`/overview?city_id=${slug}`)]);
  if(slug!==encodeURIComponent(S.city))return;
  S.network=network;S.scenarios=scenarios;S.overview=overview;
  if(!S.scenarioId)S.scenarioId=sessionStorage.getItem('aether_scenario_'+S.city)||'';
  if(!S.scenarios.some(x=>x.id===S.scenarioId))S.scenarioId=S.scenarios.find(x=>x.id==='SCN-CIVIL-AIRDROP')?.id||S.scenarios[0]?.id||'';
  const geoScene=S.scenarios.find(x=>x.id==='SCN-CIVIL-AIRDROP');
  if(geoScene&&S.city!=='national'&&!sessionStorage.getItem('aether_geo_workspace_seen_'+S.city)){S.scenarioId=geoScene.id;sessionStorage.setItem('aether_geo_workspace_seen_'+S.city,'1');}
  sessionStorage.setItem('aether_scenario_'+S.city,S.scenarioId);
  await loadScenario();}
async function loadScenario(){if(!S.scenarioId){S.tasks=[];S.plans=[];S.runs=[];S.experiments=[];S.planId='';S.runId='';S.report=null;S.telemetry=null;S.configuration={objective:'',units:[],layers:{}};return;}
  const sid=encodeURIComponent(S.scenarioId);
  const scope=scenario()?.network_id||'baseline';
  S.network=await get(`/network?city_id=${encodeURIComponent(S.city)}&network_id=${encodeURIComponent(scope)}`);
  const [tasks,plans,runs,configuration,experiments]=await Promise.all([get(`/scenarios/${sid}/tasks`),get(`/plans?scenario_id=${sid}&limit=100`),get(`/simulations?scenario_id=${sid}&limit=100`),get(`/scenarios/${sid}/configuration`),get(`/experiments?scenario_id=${sid}&limit=100`)]);
  if(sid!==encodeURIComponent(S.scenarioId))return;
  S.configuration=configuration;
  S.tasks=tasks;S.plans=plans;S.runs=runs;S.experiments=experiments;
  if(!plans.some(p=>p.id===S.planId))S.planId=plans[0]?.id||'';
  if(!runs.some(r=>r.id===S.runId)||runs.find(r=>r.id===S.runId)?.plan_id!==S.planId)S.runId=runs.find(r=>r.plan_id===S.planId)?.id||'';
  S.report=S.runId?await get(`/simulations/${encodeURIComponent(S.runId)}/report`):null;
  S.telemetry=null;
}
function home(){
 return `<div class="portal-landing" aria-label="一级业务首页">
  <div class="landing-glow landing-glow-a"></div><div class="landing-glow landing-glow-b"></div>
  <div class="landing-inner">
   <div class="landing-masthead"><div class="landing-brand"><span class="landing-logo"><img class="aether-brand-icon" src="${BRAND_ICON}" width="96" height="96" alt="" aria-hidden="true"></span><span><b>AETHER <em>11.0</em></b><small>凌航 · 民用应急空投实验平台</small></span></div><div class="landing-indicator"><span class="landing-pulse"></span> 仿真工作环境 · 非实时数据</div></div>
   <div class="landing-hero"><div class="landing-intro"><div class="overline"><span class="overline-line"></span> CIVIL AID / 民用应急空投</div><h1>民用应急空投<br><span>实验仿真平台</span></h1><p>从环境变量设置、仿真运行到可追溯实验记录，贯通民用救援空投全流程。</p><div class="landing-capabilities"><span>合成跨海示意</span><span>无人机空投</span><span>可复现实验记录</span></div></div><div class="landing-instrument" aria-hidden="true"><div class="instrument-grid"></div><div class="instrument-ring ring-outer"></div><div class="instrument-ring ring-inner"></div><div class="instrument-cross"></div><div class="instrument-core">A<span>SIMULATION</span></div><span class="instrument-corner corner-nw">SYSTEM / AETHER</span><span class="instrument-corner corner-ne">N ↑</span><span class="instrument-corner corner-sw">MISSION ENGINEERING</span><span class="instrument-corner corner-se">SYNTHETIC ENVIRONMENT</span><i class="instrument-node node-a"></i><i class="instrument-node node-b"></i><i class="instrument-node node-c"></i></div></div>
   <div class="landing-section-head"><span>任务工作链 <b>MISSION WORKFLOW</b></span><span>选择子系统 / 05</span></div>
   <nav class="landing-modules" aria-label="五个一级功能入口">${MODULES.map((m,i)=>`<button type="button" class="landing-module" data-page="${m.id}" aria-label="进入${m.name}二级功能"><span class="landing-number">0${i+1}<span> / 05</span></span><span class="landing-module-icon">${icon(m.icon,29)}</span><span class="landing-module-info"><strong>${m.name}</strong><small>${m.en}</small><span class="landing-module-desc">${m.tabs.slice(0,3).map(t=>t[1]).join(' / ')}</span></span><span class="landing-module-arrow" aria-hidden="true">↗</span></button>`).join('')}</nav>
   <div class="landing-footer"><span>AETHER / CIVIL AID AIRDROP LAB</span><span>虚拟场景 · 合成仿真数据</span></div>
  </div></div>`;
}
function dataModule(){const tab=S.tabs.data;let body='';const vehicles=S.network.vehicles,nodes=S.network.nodes,edges=S.network.edges;const xyMode=nodes.length>1&&new Set(nodes.map(n=>`${n.lat},${n.lon}`)).size<2;
  const filters=`<div class="toolbar"><input class="search-input" id="data-search" value="${txt(S.search)}" placeholder="⌕ 搜索名称 / 编号"><span class="muted">共 ${tab==='nodes'?nodes.length:tab==='edges'?edges.length:tab==='audit'?S.audits.length:vehicles.length} 条记录</span>${tab==='audit'?'':action('＋ 新增'+({nodes:'设施',edges:'通道',vehicles:'平台'}[tab]),'create-resource','primary')}</div>`;
  const search=(...values)=>values.some(x=>String(x).toLowerCase().includes(S.search.toLowerCase()));
  if(tab==='nodes')body=`<div class="table-wrap"><table><thead><tr><th>设施编号 / 名称</th><th>设施类型</th><th>位置参考</th><th>健康度</th><th>运行状态</th><th>管理</th></tr></thead><tbody>${nodes.filter(n=>search(n.id,n.name,n.category)).map(n=>`<tr><td><b>${txt(n.name)}</b><small>${txt(n.id)}</small></td><td>${names[n.category]||n.category}</td><td class="mono">${xyMode?`X ${nfmt(n.x,1)} / Y ${nfmt(n.y,1)}<small>历史相对坐标</small>`:`${n.lon.toFixed(4)}°E / ${n.lat.toFixed(4)}°N`}</td><td><span class="health-meter"><i style="width:${n.health}%"></i></span> ${n.health}%</td><td>${badge(names[n.status],n.status==='online'?'success':'danger')}</td><td>${action('编辑','edit-node','small',`data-id="${n.id}"`)} ${action(n.status==='online'?'停用':'启用','node-toggle','small',`data-id="${n.id}"`)}</td></tr>`).join('')}</tbody></table></div>`;
  else if(tab==='edges')body=`<div class="table-wrap"><table><thead><tr><th>通道编号</th><th>连接节点</th><th>模拟距离</th><th>风险因子</th><th>通行状态</th><th>配置</th></tr></thead><tbody>${edges.filter(e=>search(e.id,idName(e.source),idName(e.target))).map(e=>`<tr><td class="mono"><b>${txt(e.id)}</b></td><td>${txt(idName(e.source))}<span class="direction">↔</span>${txt(idName(e.target))}</td><td>${nfmt(e.distance_km,1)} km</td><td class="mono">${(e.risk*100).toFixed(1)}%</td><td>${badge(names[e.status],e.status==='open'?'success':e.status==='closed'?'danger':'warning')}</td><td><select class="inline-select" data-edge-status="${e.id}"><option value="open" ${e.status==='open'?'selected':''}>畅通</option><option value="restricted" ${e.status==='restricted'?'selected':''}>受限</option><option value="closed" ${e.status==='closed'?'selected':''}>封闭</option></select> ${action('编辑参数','edit-edge','small',`data-id="${e.id}"`)}</td></tr>`).join('')}</tbody></table></div>`;
  else if(tab==='vehicles')body=`<div class="table-wrap"><table><thead><tr><th>平台编码 / 装备</th><th>类型</th><th>载荷</th><th>速度</th><th>续航</th><th>驻地</th><th>状态</th><th>管理</th></tr></thead><tbody>${vehicles.filter(v=>search(v.code,v.name)).map(v=>`<tr><td><b>${txt(v.code)}</b><small>${txt(v.name)}</small></td><td>${names[v.category]}</td><td>${nfmt(v.capacity_kg)} kg</td><td>${nfmt(v.speed_kmh)} km/h</td><td>${nfmt(v.range_km)} km</td><td>${txt(idName(v.home_node))}</td><td>${badge(names[v.status],v.status==='available'?'success':'warning')}</td><td>${action('编辑','edit-vehicle','small',`data-id="${v.id}"`)} ${action(v.status==='available'?'置为维护':'恢复可用','vehicle-toggle','small',`data-id="${v.id}"`)}</td></tr>`).join('')}</tbody></table></div>`;
  else body=`<div class="table-wrap"><table><thead><tr><th>操作时间</th><th>操作者</th><th>操作类型</th><th>对象编号</th><th>备注</th></tr></thead><tbody>${S.audits.map(a=>`<tr><td class="mono">${new Date(a.created_at).toLocaleString('zh-CN')}</td><td>${txt(a.actor)}</td><td>${txt(a.action)}</td><td class="mono">${txt(a.subject)}</td><td title="${txt(a.details)}"><small>${txt(a.details).slice(0,80)}</small></td></tr>`).join('')}</tbody></table></div>`;
  return `${heading('01 / FOUNDATION DATA','基础数据管理','统筹当前范围的资源台账、关键设施、双向投送通道和运输能力，所有调整可追溯。',badge('当前范围 · '+city().name,'brand'))}${stats([['地理设施',nodes.length,'处','示例地标定位','target'],['规划通道',edges.length,'条','虚拟双向通道','route'],['运载装备',vehicles.length,'台','多平台编组','truck'],['在线设施',nodes.filter(x=>x.status==='online').length,'处','当前可供调度','activity']])}${tabs()}<div class="layout-2-1">${panel('数据资源台账',`DATA REGISTRY · ${city().name}`,filters+body,'','table-card')}${mapCard('物流设施空间分布','当前路网已叠加在全屏地理底图上')}</div>`;}
function scenarioModule(){const tab=S.tabs.scenario;let body='';const sc=scenario();const nodes=S.network.nodes;
  if(tab==='list'){body=`<div class="scenario-layout"><details class="scenario-catalog"><summary>切换想定 · ${S.scenarios.length} 套可选场景</summary><div class="scenario-list">${S.scenarios.map(s=>`<button class="scenario-item ${s.id===S.scenarioId?'chosen':''}" data-scenario="${txt(s.id)}"><div class="scenario-item-top">${badge(s.id===S.scenarioId?'当前想定':'备选方案',s.id===S.scenarioId?'success':'normal')}<span class="mono">${txt(s.id)}</span></div><h3>${txt(s.name)}</h3><p>${txt(s.description)}</p><div class="scenario-item-foot">${icon('cloud',15)} ${names[s.weather]} <span>风速 ${nfmt(s.wind_kmh)} km/h</span> <span>${S.tasks.length}项可用任务</span></div></button>`).join('')}</div></details><div class="scenario-detail"><div class="detail-label">SELECTED SCENARIO</div><h3>${txt(sc?.name||'未选择想定')}</h3><p>${txt(sc?.description||'')}</p><div class="detail-stat"><span>气象条件</span><b>${names[sc?.weather]||'--'}</b></div><div class="detail-stat"><span>环境风速</span><b>${nfmt(sc?.wind_kmh)} km/h</b></div><div class="detail-stat"><span>能见度</span><b>${nfmt(sc?.visibility_km,1)} km</b></div><div class="detail-stat"><span>参演平台</span><b>${S.configuration.units.length} 台</b></div><div class="detail-stat"><span>当前任务</span><b>${S.tasks.length} 项</b></div><p class="mission-objective">想定目标：${txt(S.configuration.objective||'待填写 · 在力量编组页面配置')}</p><div class="detail-actions">${action('编辑环境规则','go-conditions','primary')}${action('配置任务','go-tasks','light')}${action('设置力量编组','go-formations','light')}</div></div></div>`;}
  if(tab==='tasks')body=`<div class="toolbar"><div><b>当前想定任务</b><small class="muted">分段端点须在当前路网内 · 港口接驳关联前序任务</small></div>${action('＋ 添加投送任务','create-task','primary')}</div><div class="table-wrap"><table><thead><tr><th>编号</th><th>任务物资</th><th>起点 → 终点</th><th>载荷 / 截止时间</th><th>优先级</th><th>操作</th></tr></thead><tbody>${S.tasks.map(t=>`<tr><td class="mono"><b>${txt(t.code)}</b><small>${txt(t.shipment_id||'独立任务')} · ${t.transport_mode==='sea'?'海运':'陆运'}</small></td><td><b>${txt(t.cargo)}</b></td><td>${txt(idName(t.origin))}<span class="direction">→</span>${txt(idName(t.destination))}</td><td>${nfmt(t.weight_kg)} kg <small>${nfmt(t.deadline_min)} min</small></td><td>${badge(`P${t.priority}`,t.priority===1?'danger':t.priority===2?'warning':'normal')}</td><td><div class="table-actions">${action('编辑','edit-task','small',`data-id="${t.id}"`)}${action('删除','delete-task','small danger-text',`data-id="${t.id}"`)}</div></td></tr>`).join('')}</tbody></table></div>`;
  if(tab==='formations'){
    const selected=new Map((S.configuration.units||[]).map(x=>[x.vehicle_id,x.deploy_node]));
    body=`<form id="formation-form" class="mission-form"><div class="mission-head"><div><div class="overline">MISSION FORCE COMPOSITION</div><h3>想定独立力量编组</h3><p>勾选参演运载平台并指定初始部署节点。仅被选中的平台参与下一次联合方案求解；维护中平台不参与分配。</p></div><div>${badge('已编组 '+selected.size+' 台','brand')}</div></div><label>当前想定目标<textarea name="objective" rows="2" maxlength="1000" placeholder="填写任务目的与成功标准">${txt(S.configuration.objective||'')}</textarea></label><div class="table-wrap"><table><thead><tr><th>参演</th><th>装备编号</th><th>类别</th><th>额定载荷</th><th>状态</th><th>初始部署节点</th></tr></thead><tbody>${S.network.vehicles.map(v=>`<tr><td><input type="checkbox" data-unit-check="${txt(v.id)}" ${selected.has(v.id)?'checked':''} aria-label="选择 ${txt(v.code)}"></td><td><b>${txt(v.code)}</b><small>${txt(v.name)}</small></td><td>${names[v.category]}</td><td>${nfmt(v.capacity_kg)} kg</td><td>${badge(names[v.status],v.status==='available'?'success':'warning')}</td><td><select data-unit-node="${txt(v.id)}" aria-label="${txt(v.code)} 部署地点">${nodes.map(n=>`<option value="${txt(n.id)}" ${(selected.get(v.id)||v.home_node)===n.id?'selected':''}>${txt(n.name)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div><div class="form-bottom"><span>编组修改不会覆盖既有方案，必须重新生成方案才能生效。</span><button type="submit" class="button button-primary">保存想定编组与部署 →</button></div></form>`;
  }
  if(tab==='deployment'){
    const layers=S.configuration.layers||{};const labels={facilities:'设施与基础节点',links:'模拟投送通道',formations:'力量部署',routes:'方案路径',labels:'地图文字标注'};
    body=`<div class="mission-deployment"><div>${mapCard('当前想定空间部署图','中国地理底图 / 示例任务节点、运输编组与合成路网')}</div>${panel('地图图层控制','SCENE LAYERS · PERSISTED PER SCENARIO',`<form id="layers-form" class="layers-form"><p>以下开关会保存到当前想定，重新进入页面后仍会保留。</p>${Object.entries(labels).map(([key,label])=>`<label class="layer-row"><span><i class="layer-glyph"></i>${label}</span><input type="checkbox" name="${key}" ${layers[key]?'checked':''}></label>`).join('')}<button type="submit" class="button button-primary full">保存图层设置</button></form><div class="mission-note"><strong>地理数据说明</strong><p>地理底图来自 DataV.GeoAtlas 与 OpenStreetMap；设施为近似示例定位，线路是合成计算网络，不表示真实交通通行能力。</p></div>`,'','plan-controls')}</div>`;
  }
  if(tab==='facilities'){
    body=`<div class="mission-head"><div><div class="overline">CRITICAL INFRASTRUCTURE</div><h3>关键基础设施状态</h3><p>节点健康度、运行状态直接约束后续路径规划。设施状态按路网共用，不属于单一想定私有数据。</p></div><span>${badge('可用 '+nodes.filter(n=>n.status==='online'&&n.health>0).length+'/'+nodes.length,'success')}</span></div><div class="table-wrap"><table><thead><tr><th>设施名称</th><th>类型</th><th>健康度</th><th>运行状态</th><th>操作</th></tr></thead><tbody>${nodes.map(n=>`<tr><td><b>${txt(n.name)}</b><small>${txt(n.id)}</small></td><td>${names[n.category]}</td><td><span class="health-meter"><i style="width:${n.health}%"></i></span> ${n.health}%</td><td>${badge(names[n.status],n.status==='online'?'success':'danger')}</td><td>${action('属性维护','edit-node','small',`data-id="${txt(n.id)}"`)} ${action(n.status==='online'?'停用':'启用','node-toggle','small',`data-id="${txt(n.id)}"`)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  if(tab==='conditions')body=`<div class="condition-layout"><form id="rules-form" class="settings-form"><div class="form-caption">想定环境配置</div><p>环境参数会影响新的路径规划与 Monte Carlo 推演。已有历史方案采用生成时的输入快照，结果不被追溯修改。</p><label>想定名称<input name="name" required minlength="2" maxlength="100" value="${txt(sc?.name)}"></label><label>场景说明<textarea name="description" rows="3" maxlength="2000">${txt(sc?.description)}</textarea></label><div class="form-pair"><label>天气模式<select name="weather">${['clear','rain','wind','fog'].map(w=>`<option value="${w}" ${sc?.weather===w?'selected':''}>${names[w]}</option>`).join('')}</select></label><label>风速（km/h）<input name="wind_kmh" type="number" min="0" max="150" value="${sc?.wind_kmh||12}" step="1" required></label></div><label>能见度（km）<input name="visibility_km" type="number" min="0.1" max="60" step="0.1" value="${sc?.visibility_km||15}" required></label><button class="button button-primary" type="submit">保存环境约束</button></form><div class="conditions-info"><h3>规则影响说明</h3><div><span>01</span><b>天气影响</b><p>雨、雾、大风对规划用时和扰动水平施加不同系数。</p></div><div><span>02</span><b>节点 / 通道约束</b><p>离线设施与封闭通道在下一轮方案生成时自动避让。</p></div><div><span>03</span><b>历史方案可复现</b><p>每份方案保留图结构与气象快照，推演可指定随机种子。</p></div></div></div>`;
  return `${heading('02 / SCENARIO DESIGN','想定管理','面向跨区域与城市保障任务建立完整想定，定义任务、优先级、环境与约束，并管理历史版本。',action('＋ 创建想定','create-scenario','primary'))}${stats([['想定数量',S.scenarios.length,'套','当前范围场景库','file'],['投送任务',S.tasks.length,'项','当前想定配置','target'],['优先任务',S.tasks.filter(x=>x.priority===1).length,'项','P1 紧急等级','alert'],['天气类型',names[sc?.weather]||'--','','当前想定环境','cloud']])}${tabs()}${tab==='deployment'?body:panel(({list:'当前想定与基本信息',tasks:'运输任务编排',formations:'力量编组与设备部署',conditions:'环境条件设置',facilities:'关键基础设施状态'})[tab]||'想定配置','SCENARIO MISSION WORKSPACE',body,'','content-card')}`;}
function scheduleTable(){const a=plan()?.assignment_data||[];return a.length?`<div class="table-wrap"><table><thead><tr><th>任务</th><th>分配平台</th><th>路径</th><th>距离</th><th>预计完成</th><th>截止时间</th></tr></thead><tbody>${a.map(x=>`<tr><td><b>${txt(x.code)}</b><small>${txt(x.cargo)}</small></td><td class="mono">${txt(x.vehicle_code)}</td><td>${txt(idName(x.origin))} → ${txt(idName(x.destination))}</td><td>${nfmt(x.distance_km,1)} km</td><td>${nfmt(x.end_min,1)} min</td><td>${badge(x.on_time_expected?'预计准点':'预计超时',x.on_time_expected?'success':'warning')}</td></tr>`).join('')}</tbody></table></div>`:empty('暂未生成联合方案','generate','开始智能编排');}
function planningModule(){const tab=S.tabs.planning,p=plan(),summary=p?.summary_data||{};let content='';
 if(tab==='workspace'){content=`<div class="workspace-layout">${mapCard('联合投送地理沙盘','地理或历史相对坐标 · 高亮显示已分配的任务路径')}${panel('智能方案求解','SIMULATION PLANNING ENGINE',`<div class="plan-form"><label>规划优化目标</label><div class="segment">${[['balanced','综合均衡'],['fastest','时效优先'],['safest','风险优先']].map(([id,n])=>`<button data-strategy="${id}" class="${S.strategy===id?'on':''}">${n}</button>`).join('')}</div><label>路径搜索算法</label><div class="segment">${[['astar','A* 启发式'],['dijkstra','Dijkstra']].map(([id,n])=>`<button data-algorithm="${id}" class="${S.algorithm===id?'on':''}">${n}</button>`).join('')}</div><div class="formula-note"><span>约束建模</span><p>载重 / 续航 / 任务优先级 / 截止时间 / 路段状态 / 天气</p></div>${action('生成联合投送方案 ↗','generate','primary full')}<div class="plan-summary"><span>规划对象</span><b>${S.tasks.length} 个任务 · ${S.network.vehicles.filter(v=>v.status==='available').length} 台可用平台</b></div></div>`,'','plan-controls')}</div><details class="workspace-disclosure"><summary>方案时序与任务明细 · ${p?.assignment_data?.length||0} 项任务</summary>${panel('方案任务甘特图','MISSION GANTT / SCHEDULE',gantt(p?.assignment_data||[],12),`<span class="muted">${txt(p?.name||'待生成方案')}</span>`)}${panel('投送计划明细','已分配任务调度结果',scheduleTable(),summary.unassigned_count?badge(`${summary.unassigned_count}项未分配`,'warning'):'')}</details>`;}
 if(tab==='route'){const options=S.network.nodes.map(n=>`<option value="${n.id}">${txt(n.name)}</option>`).join('');const rd=S.routeData;content=`<div class="workspace-layout">${mapCard('直接空投示意图','合成节点与直接空投连线 · 不使用真实地理坐标')}${panel('路径可行性分析','A* / DIJKSTRA · INTERACTIVE QUERY',`<form id="route-form" class="plan-form"><label>起点设施<select name="origin">${S.network.nodes.map(n=>`<option value="${n.id}" ${S.routeFrom===n.id?'selected':''}>${txt(n.name)}</option>`).join('')}</select></label><label>终点设施<select name="destination">${S.network.nodes.map((n,i)=>`<option value="${n.id}" ${S.routeTo===n.id||(!S.routeTo&&i===3)?'selected':''}>${txt(n.name)}</option>`).join('')}</select></label>${select('投送类型','transport_mode',[['airdrop','直接无人机空投']])}<label>当前策略 <strong>${names[S.strategy]}</strong> / ${S.algorithm.toUpperCase()}</label><button class="button button-primary full" type="submit">计算路径 →</button></form>${rd?`<div class="route-result"><b>可行路径已找到</b><p>${(rd.transport_modes||[]).map(mode=>names[mode]).join(' → ')}${rd.transport_modes?.includes('airdrop')?' · 合成空投示意，不代表真实航线':''}</p><div><span>模拟距离</span><strong>${nfmt(rd.distance_km,2)} 合成单位</strong></div><div><span>合成风险因子</span><strong>${nfmt(rd.risk*100,2)}%</strong></div><div><span>经过设施</span><strong>${rd.nodes.length} 处</strong></div><p>${rd.nodes.map(idName).map(txt).join(' → ')}</p></div>`:empty('选择两处设施进行线路分析')}<p class="disclaimer">所有连线为抽象合成空投通道，距离仅为模型单位，不是地理距离或可执行航线。</p>`,'','plan-controls')}</div>`;}
 if(tab==='archive'){content=panel('历史方案档案','所有规划结果永久保留输入快照，支持重复推演',`<div class="archive-list">${S.plans.map(p=>`<button class="archive-row ${S.planId===p.id?'active':''}" data-plan="${p.id}"><div class="archive-icon">${icon('route',21)}</div><div><b>${txt(p.name)}</b><small>${txt(p.id)} · ${p.strategy.toUpperCase()} / ${p.algorithm.toUpperCase()}</small></div><span>${p.summary_data.assigned_count}/${p.summary_data.task_count} 项完成</span><span class="mono">${new Date(p.created_at).toLocaleString('zh-CN')}</span><span>→</span></button>`).join('')}</div>`)+panel('选中方案任务','关联任务记录',scheduleTable(),action('开始行动推演','go-simulation','primary'));}
 return `${heading('03 / MISSION PLANNING','联合投送方案','以运输节点网络为基础进行跨平台任务调度，支持路径求解、任务分配、方案比选与可追溯档案。',scenarioPicker())}${stats([['编排任务',S.tasks.length,'项','选中想定任务总数','target'],['已分配任务',summary.assigned_count??'—','项','当前选择方案','check'],['预计总里程',summary.distance_km??'—','km','合成规划路网','route'],['预计完成时间',summary.makespan_min??'—','min','计划最迟结束','clock']])}${tabs()}${content}`;}
const AIRDROP_EXPERIMENT_OPTIONS={
 weather:[['clear','晴朗'],['rain','降雨'],['wind','有风'],['fog','低能见度']],
 wind_kmh:[['5','5 km/h'],['8','8 km/h'],['15','15 km/h'],['25','25 km/h'],['40','40 km/h'],['55','55 km/h']],
 rain:[['none','无降雨'],['light','小雨'],['moderate','中雨']],
 cloud_base:[['high','较高'],['medium','中等'],['low','较低']],
 sea_state:[['calm','平稳'],['moderate','中等'],['rough','较大涌浪']],
 payload_profile:[['light','轻载物资'],['standard','标准物资'],['medical','医疗物资']],
 altitude_profile:[['conservative','保守'],['standard','标准'],['high','较高']],
 battery_reserve_pct:[['20','20%'],['30','30%'],['40','40%']]
};
const AIRDROP_EXPERIMENT_KEY='aether-civil-airdrop-experiment-v1';
function loadAirdropExperimentPreset(){
 const preset={weather:'clear',wind_kmh:'8',rain:'none',cloud_base:'high',sea_state:'calm',payload_profile:'standard',altitude_profile:'standard',battery_reserve_pct:'30'};
 try{const saved=JSON.parse(localStorage.getItem(AIRDROP_EXPERIMENT_KEY)||'null');if(saved&&typeof saved==='object')for(const key of Object.keys(AIRDROP_EXPERIMENT_OPTIONS)){if(AIRDROP_EXPERIMENT_OPTIONS[key].some(([value])=>value===String(saved[key])))preset[key]=String(saved[key]);}}catch{}
 return preset;
}
function airdropExperimentSelect(preset,key,label){
 return `<label class="run-exp-control"><span>${label}</span><select data-exp-var="${key}" aria-label="${label}">${AIRDROP_EXPERIMENT_OPTIONS[key].map(([value,title])=>`<option value="${value}" ${preset[key]===value?'selected':''}>${title}</option>`).join('')}</select></label>`;
}
function runPanel(){
 const r=run(),end=Math.max(1,...(r?.events||[]).map(e=>e.at_min)),preset=loadAirdropExperimentPreset();
 return `<div class="run-panel">
  <div class="run-commands"><div><div class="overline">SIMULATION REPLAY</div><strong>${r?txt(r.id):'等待推演数据'}</strong></div><span class="mono">T+ ${nfmt(S.playMinute,1)} / ${nfmt(end,1)} min</span></div>
  <div class="run-exp-toolbar">
   <div class="run-exp-playback"><button data-act="playback" class="round-play" aria-label="播放或暂停">${S.play?'Ⅱ':'▶'}</button><button class="button button-small" data-act="replay-reset">↺ 复位</button><button class="button button-small" data-act="speed">${S.playSpeed}×</button></div>
   <form id="airdrop-experiment-form" class="run-experiment-form" aria-label="民用应急空投实验变量">
    ${airdropExperimentSelect(preset,'weather','天气')}${airdropExperimentSelect(preset,'wind_kmh','风速')}${airdropExperimentSelect(preset,'rain','降雨')}${airdropExperimentSelect(preset,'cloud_base','云底')}${airdropExperimentSelect(preset,'sea_state','海况')}${airdropExperimentSelect(preset,'payload_profile','载荷')}${airdropExperimentSelect(preset,'altitude_profile','飞行剖面')}${airdropExperimentSelect(preset,'battery_reserve_pct','电量余量')}
    <button type="button" class="button button-ghost run-exp-save" data-act="save-airdrop-preset">保存预设</button><button type="button" class="button button-primary run-exp-save" data-act="run-airdrop-experiment">运行并记录</button>
   </form>
  </div>
  <p class="run-exp-note">保存预设只写入当前浏览器；点击“运行并记录”才会启动仿真并创建独立实验档案。全部路线均为合成示意。</p>
  <div class="run-info"><span>01 / 任务准备</span><span>02 / 空中投送</span><span>03 / 安全返航</span></div>
 </div>`;
}
const operationStatus={standby:'等待任务',in_transit:'投送途中',delivered:'已完成',failed:'任务中断',unavailable:'不可用'};
async function loadTelemetry(){
 const id=S.runId,minute=S.playMinute,ticket=++S.telemetryTicket;
 if(!id){S.telemetry=null;return;}
 try{const data=await get(`/simulations/${encodeURIComponent(id)}/telemetry?minute=${encodeURIComponent(minute.toFixed(2))}`);
   if(ticket!==S.telemetryTicket||S.runId!==id)return;
   S.telemetry=data;
   const block=document.getElementById('telemetry-live');if(block)block.innerHTML=telemetryTable();
   if(S.module==='simulation'&&!document.getElementById('assessment')&&document.getElementById('geo-map'))renderMap();
 }catch(e){fail(e);}
}
function telemetryTable(){const arr=S.telemetry?.vehicles||[];
 return arr.length?`<div class="telemetry-summary"><span><i class="signal-dot"></i> T+ ${nfmt(S.telemetry.minute,1)} min</span><strong>${S.telemetry.active_count} 台执行中 / ${arr.length} 台部署</strong><small>合成事件推算 · 非真实遥测</small></div><div class="table-wrap"><table><thead><tr><th>平台编号</th><th>推演位置</th><th>当前速度</th><th>剩余航程</th><th>当前载荷</th><th>装载物资</th><th>运行状态</th><th>预计剩余时间</th></tr></thead><tbody>${arr.map(x=>`<tr><td><b>${txt(x.code)}</b><small>${txt(x.mission_code||'未分配')}</small></td><td>${x.lat==null?'—':`<span class="mono">${nfmt(x.lat,4)}°N<br>${nfmt(x.lon,4)}°E</span>`}</td><td>${nfmt(x.current_speed_kmh,1)} km/h</td><td>${nfmt(x.remaining_range_km,1)} km</td><td>${nfmt(x.current_load_kg,1)} kg</td><td>${txt(x.cargo||'—')}</td><td>${badge(operationStatus[x.status]||x.status,x.status==='in_transit'?'brand':x.status==='delivered'?'success':'normal')}</td><td>${x.eta_min==null?'—':nfmt(x.eta_min,1)+' min'}</td></tr>`).join('')}</tbody></table></div>`:empty('请选择一条推演记录，查看逐车状态');}
function replayTelemetry(){return panel('平台状态实时视图','SIMULATED FLEET TELEMETRY · FIRST ITERATION',`<div id="telemetry-live">${telemetryTable()}</div>`);}
function eventTable(){const r=run();return (r?.events?.length)?`<div class="event-feed">${r.events.filter(e=>(S.tabs.simulation!=='control'||e.at_min<=S.playMinute)&&(S.eventFilter==='all'||e.kind===S.eventFilter)&&(!S.eventText||(e.message+' '+(e.code||'')+' '+(e.vehicle||'')).toLowerCase().includes(S.eventText.toLowerCase()))).slice(0,200).map(e=>`<div class="event-row"><div class="event-time">T+${nfmt(e.at_min,1)}</div><span class="event-indicator ${e.level}"></span><div><strong>${txt(e.message)}</strong><small>${txt(e.vehicle||e.code||'SYSTEM')} · ${e.kind.toUpperCase()}</small></div></div>`).join('')}</div>`:empty('暂无推演事件，请运行或选择历史推演');}
function experimentsWorkspace(){
 const records=S.experiments||[];
 const form='<form id="experiment-form" class="civil-experiment-form">'+
  '<div class="experiment-form-grid">'+
  '<label>实验名称<input name="name" maxlength="120" required value="民用应急空投实验"></label>'+
  '<label>天气<select name="weather"><option value="clear">晴朗</option><option value="rain">降雨</option><option value="wind">有风</option><option value="fog">低能见度</option></select></label>'+
  '<label>风速（模型输入）<input name="wind_kmh" type="number" min="0" max="60" step="1" value="8" required></label>'+
  '<label>降雨强度<select name="rain"><option value="none">无</option><option value="light">小雨</option><option value="moderate">中雨</option></select></label>'+
  '<label>云底情景<select name="cloud_base"><option value="high">较高</option><option value="medium">中等</option><option value="low">较低</option></select></label>'+
  '<label>海况情景<select name="sea_state"><option value="calm">平稳</option><option value="moderate">中等</option><option value="rough">较大涌浪</option></select></label>'+
  '<label>物资载荷类型<select name="payload_profile"><option value="light">轻载物资</option><option value="standard" selected>标准物资</option><option value="medical">医疗物资</option></select></label>'+
  '<label>飞行剖面假设<select name="altitude_profile"><option value="conservative">保守</option><option value="standard" selected>标准</option><option value="high">较高</option></select></label>'+
  '<label>电量预留<select name="battery_reserve_pct"><option value="20">20%</option><option value="30" selected>30%</option><option value="40">40%</option></select></label>'+
  '<label>规划策略<select name="strategy"><option value="balanced">综合均衡</option><option value="fastest">时效优先</option><option value="safest">稳健策略</option></select></label>'+
  '<label>路径算法<select name="algorithm"><option value="astar">A*</option><option value="dijkstra">Dijkstra</option></select></label>'+
  '<label>随机种子<input name="seed" type="number" min="0" max="2147483647" value="'+S.seed+'" required></label>'+
  '<label>迭代轮数<input name="iterations" type="number" min="1" max="500" value="'+S.iterations+'" required></label>'+
  '</div><label>实验备注<textarea name="notes" rows="2" maxlength="2000" placeholder="记录假设、对照目的或观察结论"></textarea></label>'+
  '<p class="run-exp-note">参数将参与空投方案评分与多轮扰动计算。模型是教学用粗粒度假设，不是飞行性能预测或安全认证。</p>'+
  '<button class="button button-primary" type="submit">运行并保存实验记录 →</button></form>';
 const rows=records.map(function(x){
  const q=x.parameters||{},m=(x.results||{}).metrics||{};
  const weather={clear:'晴朗',rain:'降雨',wind:'有风',fog:'低能见度'}[q.weather]||q.weather||'—';
  const rain={none:'无雨',light:'小雨',moderate:'中雨'}[q.rain]||q.rain||'—';
  return '<tr><td><b>'+txt(x.name)+'</b><small class="mono">'+txt(x.id)+' · '+txt(x.model_version)+'</small>'+(x.notes?'<small>'+txt(x.notes)+'</small>':'')+'</td>'+
   '<td>'+new Date(x.created_at).toLocaleString('zh-CN')+'</td>'+
   '<td>'+txt(weather)+' · 风 '+nfmt(q.wind_kmh,0)+' · '+txt(rain)+'<small>海况 '+txt(q.sea_state)+' · 载荷 '+txt(q.payload_profile)+' · 余量 '+txt(q.battery_reserve_pct)+'%</small></td>'+
   '<td>'+(x.results?.iterations??'—')+' / '+(x.results?.seed??'—')+'</td>'+
   '<td>'+nfmt(m.success_pct,1)+'%</td><td>'+nfmt(m.on_time_pct,1)+'%</td><td>'+nfmt(m.score,1)+'</td>'+
   '<td>'+action('打开回放','view-experiment','small','data-id="'+txt(x.id)+'"')+' '+action('导出 JSON','export-experiment','small','data-id="'+txt(x.id)+'"')+'</td></tr>';
 }).join('');
 const table=records.length?'<div class="table-wrap"><table><thead><tr><th>实验名称 / 编号</th><th>创建时间</th><th>环境与变量</th><th>轮次 / 种子</th><th>成功率</th><th>准点率</th><th>评分</th><th>操作</th></tr></thead><tbody>'+rows+'</tbody></table></div>':empty('还没有实验记录；提交上方参数即可生成第一条记录。');
 return panel('新建可复现实验','参数快照 · 随机种子 · 多轮结果',form)+panel('历史实验记录','每次运行单独保存；修改参数不会覆盖已有记录',table,action('刷新记录','refresh-experiments','light'));
}
function simulationModule(){const tab=S.tabs.simulation,r=run();let content='';
 if(tab==='control')return heading('04 / CIVIL AID SIMULATION','民用空投仿真','底部环境变量栏可直接启动新实验；每次运行都会保存参数快照、随机种子、结果指标与事件记录。',scenarioPicker())+tabs()+'<div class="experiment-intro"><b>实验约定</b><span>合成坐标与抽象距离单位，不代表真实航线；新实验独立存档，不覆盖历史结果。</span>'+action('查看实验记录','show-experiments','light')+'</div>'+assessmentMarkup(deskContext());
 if(tab==='experiments')return heading('04 / EXPERIMENT RECORDS','实验记录','每条记录绑定不可变参数快照、仿真运行、结果指标与模型版本。',scenarioPicker())+tabs()+experimentsWorkspace();
 if(tab==='control')content=`<div class="workspace-layout">${mapCard('城市行动推演沙盘','地理位置与模拟平台事件回放 / 并非实时车辆定位')}${panel('推演参数配置','MONTE CARLO · DETERMINISTIC SEED',`<form id="simulation-form" class="plan-form"><label>使用的方案<select name="plan_id">${S.plans.map(p=>`<option value="${p.id}" ${S.planId===p.id?'selected':''}>${txt(p.name)}</option>`).join('')}</select></label><div class="form-pair"><label>随机种子<input name="seed" type="number" min="0" max="2147483647" value="${S.seed}" required></label><label>推演次数<input name="iterations" type="number" min="1" max="500" value="${S.iterations}" required></label></div><div class="formula-note"><span>仿真引擎</span><p>多轮随机扰动 / 投送准点率 / 任务成功率 / 偶发事件</p></div><button type="submit" class="button button-primary full">开始多轮仿真 →</button></form>`,'','plan-controls')}</div>${panel('动态运行回放','逐时推进 · 事件级可追踪',runPanel())}${replayTelemetry()}${panel('当前事件流水','最近一轮模拟记录',eventTable())}`;
 if(tab==='telemetry')content=`${panel('逐车任务状态回放','拖动时间轴，查看运输平台的推演位置与状态',runPanel())}${replayTelemetry()}${mapCard('平台部署与运动轨迹','当前想定地理底图 · 推演位置为模拟数据')}`;
 if(tab==='events')content=panel('全部推演事件日志','DISPATCH / POSITION / INCIDENT / ARRIVAL',`<div class="event-tools"><label>事件类型<select id="event-filter">${[['all','全部事件'],['dispatch','任务派遣'],['position','位置更新'],['warning','风险告警'],['arrived','到达交付'],['failed','任务中断']].map(([key,title])=>`<option value="${key}" ${S.eventFilter===key?'selected':''}>${title}</option>`).join('')}</select></label><label>搜索事件<input id="event-text" value="${txt(S.eventText)}" placeholder="输入任务 / 平台编号"></label></div>${eventTable()}`);
 if(tab==='history')content=panel('历史推演记录','可重选同一随机种子复现，提供多轮评估比较',`<div class="archive-list">${S.runs.map(x=>`<button class="archive-row ${x.id===S.runId?'active':''}" data-run="${x.id}"><div class="archive-icon">${icon('play',21)}</div><div><b>${txt(x.id)}</b><small>${x.iterations} 轮 · seed: ${x.seed}</small></div><span>得分 ${nfmt(x.metrics.score,1)}</span><span>准点率 ${nfmt(x.metrics.on_time_pct,1)}%</span><span>→</span></button>`).join('')}</div>`);
 return `${heading('04 / ACTION SIMULATION','行动推演','将规划方案转化为可复现的合成运行过程，模拟多平台调度、随机环境扰动及交付事件。',scenarioPicker())}${stats([['推演记录',S.runs.length,'次','历史运行档案','play'],['模拟轮次',r?.iterations??'—','轮','Monte Carlo','activity'],['交付成功率',r?nfmt(r.metrics.success_pct,1):'—','%','合成实验均值','target'],['平均延误',r?nfmt(r.metrics.avg_delay_min,1):'—','min','平均逾期时长','clock']])}${tabs()}${content}`;}
function evaluationModule(){const tab=S.tabs.analytics,r=run(),m=r?.metrics||{};let content='';
 if(tab==='overview')return `${heading('05 / EXPERIMENT ANALYTICS','实验评估','以任务时序和空间态势为核心，回溯每一次派遣、扰动与交付。',scenarioPicker())}${tabs()}${assessmentMarkup(deskContext())}`;

 if(tab==='transport'){
 const report=S.report;const list=report?.transport||[];
 content=`${panel('空投任务统计','AIRDROP TASK PERFORMANCE · FIRST ITERATION',`<div class="mission-head"><div><h3>无人机空投工作量</h3><p>按方案统计每台无人机的任务数、合成距离单位与计划占用时间。</p></div>${badge('当前运行 '+(report?.run_id||'未选'),'brand')}</div><div class="table-wrap"><table><thead><tr><th>无人机平台</th><th>平台类别</th><th>承接任务</th><th>计划运输距离</th><th>计划工作时长</th><th>额定载荷</th></tr></thead><tbody>${list.map(x=>`<tr><td class="mono"><b>${txt(x.code)}</b></td><td>${names[x.category]}</td><td>${x.task_count}</td><td>${nfmt(x.distance_km,2)} km</td><td>${nfmt(x.planned_work_min,1)} min</td><td>${nfmt(x.payload_capacity_kg,1)} kg</td></tr>`).join('')}</tbody></table></div>`)}${panel('空投统计口径','AIRDROP KPI DEFINITIONS',`<div class="evaluation-list"><div><span>方案合成飞行距离</span><b>${nfmt(report?.totals?.distance_km,2)} km</b></div><div><span>已分配任务数量</span><b>${report?.totals?.assigned??0} 项</b></div><div><span>未分配任务数量</span><b>${report?.totals?.unassigned??0} 项</b></div><div><span>全轮次平均完成时长</span><b>${nfmt(m.avg_duration_min,1)} min</b></div></div>` )}`;
 }
 if(tab==='delivery'){
 const report=S.report;const list=report?.deliveries||[];
 content=`${stats([['首次迭代成功交付',report?.totals?.delivered??0,'项','模拟事件验算','check'],['首次迭代失败',report?.totals?.failed??0,'项','异常任务','alert'],['首次迭代准时',report?.totals?.on_time??0,'项','按时限判定','clock'],[S.city==='national'?'整票交付重量':'首次迭代交付重量',(report?.consignment_totals?.weight_kg??report?.totals?.weight_kg)==null?'—':nfmt(report.consignment_totals?.weight_kg??report.totals.weight_kg,1),'kg',S.city==='national'?'按运单去重':'已交付物资','truck']])}${panel('任务级投送结果统计','DELIVERY OUTCOMES · FIRST ITERATION',`<p class="muted">${txt(report?.sampling_note||'请选择历史运行')}</p><div class="table-wrap"><table><thead><tr><th>任务 / 物资</th><th>执行平台</th><th>起点 → 终点</th><th>重量</th><th>交付时刻</th><th>逾期时间</th><th>交付结果</th></tr></thead><tbody>${list.map(x=>`<tr><td><b>${txt(x.code)}</b><small>${txt(x.cargo)}</small></td><td class="mono">${txt(x.vehicle_code)}</td><td>${txt(idName(x.origin))} → ${txt(idName(x.destination))}</td><td>${x.weight_kg==null?'—':nfmt(x.weight_kg,1)+' kg'}</td><td>${x.actual_end_min==null?'—':'T+'+nfmt(x.actual_end_min,1)+' min'}</td><td>${x.delay_min==null?'—':nfmt(x.delay_min,1)+' min'}</td><td>${badge(x.status==='delivered'?(x.on_time?'准时交付':'延迟交付'):x.status==='failed'?'中断':'未结束',x.status==='failed'?'danger':x.on_time?'success':'warning')}</td></tr>`).join('')}</tbody></table></div><div class="mission-note">${(report?.unassigned||[]).length?txt('未分配任务：'+report.unassigned.map(x=>x.code).join('、')):'本次规划已为全部可行任务匹配运力。'}</div>` )}`;
 }
 if(tab==='metrics')content=`<div class="analytics-grid">${panel('综合任务评分','EVALUATION INDEX / 0–100',`<div class="score-card">${scoreDonut(m.score||0)}<div><strong>${m.score>=85?'运行表现良好':m.score>=65?'运行表现中等':'仍需调整方案'}</strong><p>由任务完成率、准点率与扰动事件联合计算；仅在合成模型中有效。</p></div></div>`)}${panel('随机实验收敛曲线','SUCCESS RATE & ON-TIME TREND',lineChart(r?.samples||[]),'<div class="chart-keys"><span>● 成功率</span><span>● 准点率</span></div>')}</div>${panel('评估指标详情','全维度运行效能与资源利用情况',`<div class="evaluation-list">${[['交付成功率','success_pct','%'],['准点交付率','on_time_pct','%'],['运力利用率','fleet_utilization_pct','%'],['平均完成时长','avg_duration_min','min'],['P90 完成时长','p90_duration_min','min'],['平均延误时间','avg_delay_min','min'],['平均扰动次数','avg_incidents','次']].map(([label,k,unit])=>`<div><span>${label}</span><b>${nfmt(m[k],1)} ${unit}</b></div>`).join('')}</div>`)} `;
 if(tab==='compare')content=panel('多次推演方案对比','选择至少两条历史记录进行对比（最多 8 条）',`<div class="compare-toolbar">${S.runs.map(x=>`<label><input type="checkbox" data-compare="${x.id}" ${S.compareIds.includes(x.id)?'checked':''}><span>${txt(x.id)} · ${nfmt(x.metrics.score,1)}分</span></label>`).join('')}</div><div class="compare-viz">${compareBars(S.runs.filter(x=>S.compareIds.includes(x.id)).slice(0,8))}</div>`);
 if(tab==='reports')content=panel('评估报告与数据归档','结果可导出为 JSON、CSV 或通过浏览器打印为 PDF',`<div class="reports-layout"><div class="report-cover"><div class="overline">AETHER / REPORT 3.0</div><h3>联合投送仿真<br>效能评估报告</h3><p>${txt(city()?.name)} · ${txt(scenario()?.name)}</p><div>方案编号 <b>${txt(S.planId||'—')}</b></div><div>推演编号 <b>${txt(S.runId||'—')}</b></div><div>结果评分 <b>${nfmt(m.score,1)} / 100</b></div></div><div class="report-actions"><h3>选择导出格式</h3><p>报告包括场景参数、运力配置、规划任务、随机种子、核心指标和推演样本。请勿将合成数据用于真实指挥。</p>${action('↓ 导出 JSON 全量归档','export-json','primary full')}${action('↓ 导出 CSV 统计样本','export-csv','light full')}${action('↓ 导出投送结果 JSON','export-delivery','light full')}${action('打印评估摘要 / PDF','print-report','ghost full')}</div></div>`);
 return `${heading('05 / PERFORMANCE ANALYTICS','评估分析','结合时效、成功率、载荷分配及可靠性进行综合评价，支持多轮对比与审计级导出。',scenarioPicker())}${stats([['综合评分',r?nfmt(m.score,1):'—','/ 100','当前推演评分','activity'],['任务成功率',r?nfmt(m.success_pct,1):'—','%','仿真成功交付','target'],['准点交付率',r?nfmt(m.on_time_pct,1):'—','%','按任务约束统计','clock'],['运力利用率',r?nfmt(m.fleet_utilization_pct,1):'—','%','平台总任务占比','truck']])}${tabs()}${content}`;}
function deskContext(){return {run:run(),plan:plan(),runs:S.runs,city:city(),cities:S.cities,onCity:id=>chooseCity(id).catch(fail),sharedMap:true,scenarioId:S.scenarioId,denseScenario:null,onDense:()=>{},minute:S.playMinute,onMinute:value=>S.playMinute=value,onPlanning:()=>setPage('planning'),onRun:id=>selectRun(id).catch(fail),onExperiment:params=>createExperimentWithParameters(params).catch(fail)};}
async function selectRun(id){activeAssessment?.destroy();activeAssessment=null;const ticket=++selectionTicket;S.play=false;stopPlayback();S.runId=id;S.planId=run()?.plan_id||S.planId;S.playMinute=0;S.telemetry=null;const report=id?await get(`/simulations/${encodeURIComponent(id)}/report`):null;if(ticket!==selectionTicket)return;S.report=report;render();if(S.module==='simulation'&&S.tabs.simulation!=='control')await loadTelemetry();}
function render(){
 activeAssessment?.destroy();activeAssessment=null;writeRoute(true);
 document.querySelector('.shell').classList.toggle('portal-mode',S.module==='home');document.querySelector('.shell').classList.toggle('workspace-mode',S.module!=='home');
 renderNavigation();const body=S.module==='home'?home():({data:dataModule,scenario:scenarioModule,planning:planningModule,simulation:simulationModule,analytics:evaluationModule}[S.module]||home)();
 const context={module:S.module,tab:S.tabs[S.module],city:city(),cities:S.cities,network:S.network,onCity:id=>chooseCity(id).catch(fail)};
 root.innerHTML=workspaceMarkup(body,context);mountWorkspace(context);document.getElementById('rail').classList.remove('open');
 if(root.querySelector('#assessment'))activeAssessment=mountAssessment(deskContext());
 else if(S.module!=='home')requestAnimationFrame(renderMap);
}
function showDialog(title,help,fields,kind,values={}){modalReturnFocus=document.activeElement;S.formMode=kind;modal.innerHTML=`<div class="modal-shade" data-act="close-modal"><div class="dialog" role="dialog" aria-modal="true" aria-label="${txt(title)}"><div class="dialog-header"><div><small>RESOURCE MANAGER</small><h2>${title}</h2></div><button class="icon-button" data-act="close-modal">✕</button></div><p>${help}</p><form id="resource-form" data-kind="${kind}" class="dialog-form">${fields}<div class="dialog-actions"><button type="button" class="button button-ghost" data-act="close-modal">取消</button><button class="button button-primary" type="submit">保存修改 →</button></div></form></div></div>`;document.querySelector('.shell').inert=true;requestAnimationFrame(()=>(modal.querySelector('input:not([type=hidden]),select,textarea')||modal.querySelector('button'))?.focus());}
const input=(label,name,opts='',required=true)=>`<label>${label}<input name="${name}" ${opts} ${required?'required':''}></label>`;
const select=(label,name,items)=>`<label>${label}<select name="${name}">${items.map(([v,n])=>`<option value="${txt(v)}">${txt(n)}</option>`).join('')}</select></label>`;
const nodesChoices=()=>S.network.nodes.map(n=>[n.id,n.name]);
function createResource(){const t=S.tabs.data;if(t==='nodes')return showDialog('新增合成空投节点','坐标为固定占位值，节点图仅使用相对 XY 布局。编号请使用 AIR-MAIN-（大陆侧）或 AIR-ISLE-（接收侧）前缀。',`${input('合成节点编号','id','maxlength="40" placeholder="AIR-MAIN-NEW"')}${input('节点名称','name','maxlength="80" placeholder="大陆侧合成补给点"')}${select('节点类别','category',[['hub','大陆侧补给枢纽'],['depot','大陆侧物资站'],['critical','重点接收设施'],['command','场景节点'],['delivery','台湾侧救援接收点']])}<input type="hidden" name="lon" value="120"><input type="hidden" name="lat" value="30">${input('相对横坐标 X','x','type="number" min="0" max="100" value="50"')}${input('相对纵坐标 Y','y','type="number" min="0" max="100" value="50"')}${input('健康度 %','health','type="number" min="0" max="100" value="100"')}`,'node');
 if(t==='edges'){const all=nodesChoices();return showDialog('新建直接空投示意通道','只允许大陆侧补给点与台湾侧接收点之间的直接空投连线；距离为抽象模型单位。',`${select('大陆侧补给点','source',all.filter(n=>n.id.startsWith('AIR-MAIN-')))}${select('台湾侧接收点','target',all.filter(n=>n.id.startsWith('AIR-ISLE-')))}<div class="form-pair">${input('合成距离单位','distance_km','type="number" min="0.1" step="0.1" value="45"')}${input('合成风险因子','risk','type="number" min="0" max="0.95" step="0.01" value="0.03"')}</div>${select('通道类型','terrain',[['coastal','跨海示意']])}${select('投送方式','transport_mode',[['airdrop','无人机空投']])}`,'edge');}
 return showDialog('新增民用应急无人机','性能数值是合成仿真输入，不代表真实飞行器规格。',`${input('平台编号','code','maxlength="40" placeholder="UAV-DEMO-07"')}${input('装备名称','name','maxlength="80" placeholder="民用应急无人机"')}${select('装备类别','category',[['drone','民用应急无人机']])}<div class="form-pair">${input('模型载荷上限 kg','capacity_kg','type="number" min="0.1" step="0.1" value="30"')}${input('模型速度单位 / h','speed_kmh','type="number" min="0.1" step="0.1" value="70"')}</div><div class="form-pair">${input('模型续航单位','range_km','type="number" min="0.1" value="140"')}${input('合成可靠度 0–1','reliability','type="number" min="0" max="1" step="0.01" value="0.96"')}</div>${select('合成驻地','home_node',nodesChoices().filter(n=>n.id.startsWith('AIR-MAIN-')))}`,'vehicle');}
function editResource(kind,id){
 if(kind==='node'){
  const n=S.network.nodes.find(x=>x.id===id);if(!n)return;
  return showDialog('编辑合成节点属性','节点位置是固定占位坐标；仅可修改名称和健康度，历史方案快照不会改变。',
  `${input('节点名称','name',`value="${txt(n.name)}" minlength="2" maxlength="80"`)}${input('健康度 0–100','health',`type="number" min="0" max="100" value="${n.health}"`)}<input type="hidden" name="resource_id" value="${txt(n.id)}">`,'node-edit');
 }
 if(kind==='edge'){
  const e=S.network.edges.find(x=>x.id===id);if(!e)return;
  return showDialog('编辑空投示意通道','可修改抽象模型距离单位与风险因子，不代表实际飞行距离。',`${input('合成距离单位','distance_km',`type="number" min="0.01" step="0.01" value="${e.distance_km}"`)}${input('合成风险因子','risk',`type="number" min="0" max="0.95" step="0.001" value="${e.risk}"`)}<input type="hidden" name="resource_id" value="${txt(e.id)}">`,'edge-edit');
 }
 const v=S.network.vehicles.find(x=>x.id===id);if(!v)return;
 showDialog('编辑无人机模型参数','仅影响新建的合成实验，不代表真实飞行器规格。',`${input('装备名称','name',`value="${txt(v.name)}" maxlength="80"`)}<div class="form-pair">${input('载荷 kg','capacity_kg',`type="number" min="0.01" step="0.1" value="${v.capacity_kg}"`)}${input('模型速度单位 / h','speed_kmh',`type="number" min="0.01" step="0.1" value="${v.speed_kmh}"`)}</div><div class="form-pair">${input('模型续航单位','range_km',`type="number" min="0.01" step="0.1" value="${v.range_km}"`)}${input('可靠度','reliability',`type="number" min="0" max="1" step="0.01" value="${v.reliability}"`)}</div><input type="hidden" name="resource_id" value="${txt(v.id)}">`,'vehicle-edit');
}
function newScenario(){showDialog('创建民用应急空投想定','新想定绑定当前合成空投网络；可继续配置民生物资与环境实验。',`${input('想定名称','name','maxlength="100" placeholder="民用应急物资空投对照想定"')}<label>任务描述<textarea name="description" rows="3" maxlength="2000" placeholder="背景、目标和约束"></textarea></label><div class="form-pair">${select('天气条件','weather',[['clear','晴朗'],['rain','降雨'],['wind','大风'],['fog','低能见度']])}${input('风速 km/h','wind_kmh','type="number" min="0" max="150" value="12"')}</div>${input('能见度 km','visibility_km','type="number" min="0.1" max="60" step="0.1" value="15"')}`,'scenario');}
function newTask(task){
 const isEdit=!!task;
 const nodes=nodesChoices();
 const airdrop=S.network.network_id==='civil-airdrop';
 const origins=airdrop?nodes.filter(n=>n.id.startsWith('AIR-MAIN-')):nodes;
 const destinations=airdrop?nodes.filter(n=>n.id.startsWith('AIR-ISLE-')):nodes.slice().reverse();
 const fields=input('投送物资','cargo','maxlength="90" value="'+txt(task?.cargo||'')+'" placeholder="应急医疗物资"')
  +'<div class="form-pair">'+input('物资重量 kg','weight_kg','type="number" min="0.1" max="5000" step="0.1" value="'+(task?.weight_kg||25)+'"')
  +input('截止时长 min','deadline_min','type="number" min="1" max="43200" value="'+(task?.deadline_min||150)+'"')+'</div>'
  +(isEdit?'':select('大陆侧补给点','origin',origins)+select('台湾侧接收点','destination',destinations)
    +select('投送方式','transport_mode',airdrop?[['airdrop','无人机空投']]:[['road','归档陆运'],['sea','归档海运']]))
  +select('紧急优先级','priority',[['1','P1 · 紧急'],['2','P2 · 常规'],['3','P3 · 低优先级']])
  +'<input type="hidden" name="task_id" value="'+txt(task?.id||'')+'">';
 showDialog(isEdit?'编辑空投任务':'新建民用应急物资空投任务',isEdit?'修改物资、重量、截止时长或优先级只影响后续新方案；已保存实验记录不变。':'每项任务必须使用大陆侧补给点到台湾侧接收点之间的直接空投示意通道。',fields,isEdit?'task-edit':'task');
 if(task)modal.querySelector('[name="priority"]').value=task.priority;
}
function hideDialog(){modal.innerHTML='';document.querySelector('.shell').inert=false;if(modalReturnFocus?.isConnected)modalReturnFocus.focus();modalReturnFocus=null;}
const asNum=(o,keys)=>{for(const k of keys)if(k in o)o[k]=Number(o[k]);return o;};
async function submitResource(form){const payload=Object.fromEntries(new FormData(form));const kind=form.dataset.kind;
 if(kind==='node'){payload.city_id=S.city;payload.network_id=S.network.network_id||'civil-airdrop';payload.x=Number(payload.x??50);payload.y=Number(payload.y??50);payload.lon=120;payload.lat=30;asNum(payload,['lon','lat','health','x','y']);await post('/network/nodes',payload);}
 if(kind==='edge'){asNum(payload,['distance_km','risk']);await post('/network/edges',payload);}
 if(kind==='vehicle'){asNum(payload,['capacity_kg','speed_kmh','range_km','reliability']);await post('/vehicles',payload);}
 if(kind==='scenario'){payload.city_id=S.city;payload.network_id=S.network.network_id||'baseline';asNum(payload,['wind_kmh','visibility_km']);const sc=await post('/scenarios',payload);S.scenarioId=sc.id;S.module='scenario';S.tabs.scenario='tasks';}
 if(kind==='node-edit'){const id=payload.resource_id;delete payload.resource_id;asNum(payload,['lon','lat','health']);await patch(`/network/nodes/${id}`,payload);}
 if(kind==='edge-edit'){const id=payload.resource_id;delete payload.resource_id;asNum(payload,['distance_km','risk']);await patch(`/network/edges/${id}`,payload);}
 if(kind==='vehicle-edit'){const id=payload.resource_id;delete payload.resource_id;asNum(payload,['capacity_kg','speed_kmh','range_km','reliability']);await patch(`/vehicles/${id}`,payload);}
 if(kind==='task'){asNum(payload,['weight_kg','deadline_min','priority','leg_index','handover_min']);delete payload.task_id;await post(`/scenarios/${S.scenarioId}/tasks`,payload);}
 if(kind==='task-edit'){const id=payload.task_id;delete payload.task_id;asNum(payload,['weight_kg','deadline_min','priority']);await patch(`/scenarios/${S.scenarioId}/tasks/${id}`,payload);}
 hideDialog();await refresh();render();alertUser('已保存并同步业务数据');}
async function chooseCity(id){if(S.city===id)return;activeAssessment?.destroy();activeAssessment=null;S.playMinute=0;S.city=id;sessionStorage.setItem('aether_city',id);S.scenarioId='';S.telemetry=null;S.report=null;S.planId='';S.runId='';S.routeData=null;S.search='';S.compareIds=[];S.play=false;stopPlayback();await refresh();render();}
async function chooseScenario(id){activeAssessment?.destroy();activeAssessment=null;S.play=false;stopPlayback();S.scenarioId=id;sessionStorage.setItem('aether_scenario_'+S.city,id);S.planId='';S.runId='';S.playMinute=0;await loadScenario();render();if(S.module==='simulation')await loadTelemetry();}
async function generate(){const p=await post('/plans',{scenario_id:S.scenarioId,strategy:S.strategy,algorithm:S.algorithm});S.planId=p.id;await refresh();S.planId=p.id;S.runId='';S.report=null;S.telemetry=null;render();alertUser(`新方案生成成功 · 已分配 ${p.summary_data.assigned_count}/${p.summary_data.task_count} 项任务`);}
async function startSimulation(form){const v=Object.fromEntries(new FormData(form));S.seed=Number(v.seed);S.iterations=Number(v.iterations);S.planId=v.plan_id;const x=await post('/simulations',{plan_id:v.plan_id,seed:S.seed,iterations:S.iterations});await refresh();S.planId=v.plan_id;S.runId=x.id;S.playMinute=0;S.tabs.simulation='control';S.report=await get(`/simulations/${encodeURIComponent(S.runId)}/report`);render();await loadTelemetry();alertUser(`完成 ${x.iterations} 轮推演 · 综合评分 ${nfmt(x.metrics.score,1)}`);}
async function createExperimentWithParameters(parameters,options={}){
 const params={weather:'clear',wind_kmh:8,rain:'none',cloud_base:'high',sea_state:'calm',payload_profile:'standard',altitude_profile:'standard',battery_reserve_pct:30,...parameters};
 params.wind_kmh=Number(params.wind_kmh);params.battery_reserve_pct=Number(params.battery_reserve_pct);
 const seed=Number(options.seed??S.seed),iterations=Number(options.iterations??S.iterations);
 const name=options.name||('空投实验 '+new Date().toLocaleString('zh-CN'));
 const record=await post('/experiments',{scenario_id:S.scenarioId,name,notes:options.notes||'由行动推演实验变量栏启动。',strategy:options.strategy||S.strategy,algorithm:options.algorithm||S.algorithm,seed,iterations,parameters:params});
 S.seed=seed;S.iterations=iterations;await refresh();S.planId=record.plan_id;S.runId=record.run_id;S.playMinute=0;S.play=false;stopPlayback();
 S.report=await get('/simulations/'+encodeURIComponent(S.runId)+'/report');S.experiments=await get('/experiments?scenario_id='+encodeURIComponent(S.scenarioId)+'&limit=100');
 S.module='simulation';S.tabs.simulation='experiments';render();alertUser('实验已保存 '+record.id+' · 成功率 '+nfmt(record.results?.metrics?.success_pct,1)+'%');return record;
}
function setPage(id){if(id!=='home'&&!allowedModule(id))return;S.module=id;S.search='';S.play=false;stopPlayback();writeRoute();render();if(id==='simulation')loadTelemetry();window.scrollTo({top:0,behavior:'instant'});}
function stopPlayback(){clearInterval(S.interval);S.interval=0;}
function play(){stopPlayback();if(!S.play)return;const end=Math.max(1,...(run()?.events||[]).map(e=>e.at_min));S.interval=setInterval(()=>{S.playMinute=Math.min(end,S.playMinute+.7*S.playSpeed);if(S.playMinute>=end){S.play=false;stopPlayback();}if(S.module==='simulation'){render();loadTelemetry();}},400);}
function fileDownload(name,data,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function makeCsv(){const r=run();if(!r)throw new Error('请先执行推演');const cols=['iteration','success_pct','on_time_pct','duration_min','incidents','avg_delay_min','score'];const csv='\uFEFF'+cols.join(',')+'\n'+r.samples.map(s=>cols.map(k=>s[k]).join(',')).join('\n');fileDownload(`${r.id}.csv`,csv,'text/csv;charset=utf-8');}
function makeDelivery(){if(!S.report)throw new Error('请先执行推演');fileDownload(`${S.runId}-delivery.json`,JSON.stringify(S.report,null,2));}
function makeJson(){const r=run();if(!r)throw new Error('请先执行推演');fileDownload(`${r.id}-report.json`,JSON.stringify({city:city(),scenario:scenario(),network:S.network,plan:plan(),simulation:r,disclaimer:'Synthetic logistics graph / approximate landmarks, not operational navigation or safety certification'},null,2));}
async function doAction(act,el){if(act==='close-modal'){hideDialog();return;}if(act==='home-planning'){setPage('planning');return;}if(act==='home-scenario'){setPage('scenario');return;}if(act==='create-resource'){createResource();return;}if(act==='edit-node'){editResource('node',el.dataset.id);return;}if(act==='edit-edge'){editResource('edge',el.dataset.id);return;}if(act==='edit-vehicle'){editResource('vehicle',el.dataset.id);return;}if(act==='create-scenario'){newScenario();return;}if(act==='create-task'){newTask();return;}if(act==='edit-task'){newTask(S.tasks.find(t=>t.id===el.dataset.id));return;}
 if(act==='delete-task'){if(!confirm('确定删除这项任务？历史方案快照仍然保留。'))return;await del(`/scenarios/${S.scenarioId}/tasks/${el.dataset.id}`);await refresh();render();alertUser('任务已删除');return;}
 if(act==='node-toggle'){const n=S.network.nodes.find(n=>n.id===el.dataset.id);await patch(`/network/nodes/${n.id}`,{status:n.status==='online'?'offline':'online'});await refresh();render();return;}
 if(act==='vehicle-toggle'){const v=S.network.vehicles.find(v=>v.id===el.dataset.id);await patch(`/vehicles/${v.id}`,{status:v.status==='available'?'maintenance':'available'});await refresh();render();return;}
 if(act==='go-conditions'){selectTab('conditions');return;}if(act==='go-tasks'){selectTab('tasks');return;}if(act==='go-formations'){selectTab('formations');return;}
 if(act==='generate'){await generate();return;}if(act==='go-simulation'){setPage('simulation');return;}
 if(act==='save-airdrop-preset'){
  const form=root.querySelector('#airdrop-experiment-form');if(!form)return;
  const preset={};form.querySelectorAll('[data-exp-var]').forEach(input=>{preset[input.dataset.expVar]=input.value;});
  try{localStorage.setItem(AIRDROP_EXPERIMENT_KEY,JSON.stringify(preset));alertUser('变量预设已保存到当前浏览器；历史实验未修改。');}
  catch{alertUser('浏览器未允许本地保存，请检查隐私设置。',true);}
  return;
 }
 if(act==='run-airdrop-experiment'){
  const form=root.querySelector('#airdrop-experiment-form');if(!form)return;
  const params={};form.querySelectorAll('[data-exp-var]').forEach(input=>{params[input.dataset.expVar]=input.value;});
  await createExperimentWithParameters(params);return;
 }
 if(act==='show-experiments'){selectTab('experiments');return;}
 if(act==='refresh-experiments'){S.experiments=await get('/experiments?scenario_id='+encodeURIComponent(S.scenarioId)+'&limit=100');render();return;}
 if(act==='view-experiment'){
  const record=await get('/experiments/'+encodeURIComponent(el.dataset.id));S.planId=record.plan_id;S.runId=record.run_id;S.report=await get('/simulations/'+encodeURIComponent(record.run_id)+'/report');S.module='simulation';S.tabs.simulation='control';S.playMinute=0;render();await loadTelemetry();return;
 }
 if(act==='export-experiment'){
  const record=await get('/experiments/'+encodeURIComponent(el.dataset.id));const savedRun=await get('/simulations/'+encodeURIComponent(record.run_id));const savedPlan=await get('/plans/'+encodeURIComponent(record.plan_id));fileDownload(record.id+'.json',JSON.stringify({experiment:record,plan:savedPlan,simulation:savedRun,disclaimer:'合成民用应急空投教学模型；距离为抽象模型单位，不代表真实地理路线或飞行安全结论。'},null,2));return;
 }
 if(act==='playback'){S.play=!S.play;play();render();await loadTelemetry();return;}
 if(act==='replay-reset'){S.play=false;stopPlayback();S.playMinute=0;render();await loadTelemetry();return;}
 if(act==='speed'){S.playSpeed=S.playSpeed===1?2:S.playSpeed===2?4:1;render();return;}
 if(act==='export-json'){makeJson();return;}if(act==='export-delivery'){makeDelivery();return;}if(act==='export-csv'){makeCsv();return;}
 if(act==='print-report'){window.print();return;}}
window.addEventListener('click',async e=>{const home=e.target.closest('[data-home]');if(home){setPage('home');return;}const page=e.target.closest('[data-page]');if(page){setPage(page.dataset.page);return;}
 const sub=e.target.closest('[data-tab]');if(sub){selectTab(sub.dataset.tab);return;}
 const card=e.target.closest('[data-scenario]');if(card){try{await chooseScenario(card.dataset.scenario);}catch(err){fail(err)}return;}
 const choosePlan=e.target.closest('[data-plan]');if(choosePlan){try{S.planId=choosePlan.dataset.plan;await selectRun(S.runs.find(x=>x.plan_id===S.planId)?.id||'');}catch(err){fail(err);}return;}
 const chooseRun=e.target.closest('[data-run]');if(chooseRun){try{await selectRun(chooseRun.dataset.run);}catch(err){fail(err);}return;}
 const node=e.target.closest('[data-node]');if(node){const n=S.network.nodes.find(n=>n.id===node.dataset.node);if(n){const xy=document.querySelector('#geo-system')?.textContent==='SYNTHETIC XY';alertUser(`${n.name} · ${xy?`相对坐标 X ${nfmt(n.x,1)} / Y ${nfmt(n.y,1)}`:`${n.lat.toFixed(3)}°N, ${n.lon.toFixed(3)}°E`} · ${names[n.status]}`);}return;}
 if(e.target.closest('#menu-button')){document.getElementById('rail').classList.toggle('open');return;}
 const button=e.target.closest('[data-act]');if(button){if(button.dataset.act==='close-modal'&&button.classList.contains('modal-shade')&&e.target!==button)return;e.preventDefault();try{await doAction(button.dataset.act,button);}catch(err){fail(err)}return;}
 const strategy=e.target.closest('[data-strategy]');if(strategy){S.strategy=strategy.dataset.strategy;render();return;}
 const algorithm=e.target.closest('[data-algorithm]');if(algorithm){S.algorithm=algorithm.dataset.algorithm;render();return;}
});
window.addEventListener('change',async e=>{try{if(e.target.name==='predecessor_task_id'&&e.target.value){const prev=S.tasks.find(t=>t.id===e.target.value),form=e.target.closest('form');if(prev&&form){for(const [key,value]of Object.entries({shipment_id:prev.shipment_id,leg_index:prev.leg_index+1,cargo:prev.cargo,weight_kg:prev.weight_kg,origin:prev.destination,handover_min:form.elements.transport_mode.value==='sea'?60:45})){if(form.elements[key])form.elements[key].value=value;}}return;}if(e.target.id==='city-select'){await chooseCity(e.target.value);return;}if(e.target.id==='scenario-select'){await chooseScenario(e.target.value);return;}if(e.target.id==='route-switch'){S.showRoutes=e.target.checked;renderMap();return;}if(e.target.id==='play-slider'){render();await loadTelemetry();return;}
 if(e.target.dataset.edgeStatus){await patch(`/network/edges/${e.target.dataset.edgeStatus}`,{status:e.target.value});await refresh();render();alertUser('通道状态已更新');return;}
 if(e.target.id==='event-filter'){S.eventFilter=e.target.value;render();return;}if(e.target.dataset.compare){const id=e.target.dataset.compare;S.compareIds=e.target.checked?[...S.compareIds,id].slice(-8):S.compareIds.filter(x=>x!==id);render();return;}
 }catch(err){fail(err);}});
window.addEventListener('input',e=>{if(e.target.id==='play-slider'){S.playMinute=Number(e.target.value);S.play=false;stopPlayback();const time=root.querySelector('.run-commands>.mono');if(time){const end=Math.max(1,...(run()?.events||[]).map(e=>e.at_min));time.textContent=`T+ ${nfmt(S.playMinute,1)} / ${nfmt(end,1)} min`;}renderMap();loadTelemetry();return;}if(e.target.id==='event-text'){S.eventText=e.target.value;const pos=e.target.selectionStart;render();const t=document.getElementById('event-text');t?.focus();t?.setSelectionRange(pos,pos);return;}if(e.target.id==='data-search'){S.search=e.target.value;const pos=e.target.selectionStart;render();const t=document.getElementById('data-search');t?.focus();t?.setSelectionRange(pos,pos);return;}});
window.addEventListener('submit',async e=>{e.preventDefault();const form=e.target;if(form.dataset.submitting==='true')return;form.dataset.submitting='true';const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;try{if(e.target.id==='resource-form'){await submitResource(e.target);return;}
 if(e.target.id==='formation-form'){
   const units=S.network.vehicles.filter(v=>e.target.querySelector(`[data-unit-check="${v.id}"]`)?.checked)
     .map(v=>({vehicle_id:v.id,deploy_node:e.target.querySelector(`[data-unit-node="${v.id}"]`).value}));
   S.configuration=await patch(`/scenarios/${encodeURIComponent(S.scenarioId)}/configuration`,{objective:e.target.elements.objective.value,units});
   render();alertUser('当前想定力量编组与部署节点已保存，新生成方案将使用此编组');return;
 }
 if(e.target.id==='layers-form'){
   const layers=Object.fromEntries(['facilities','links','formations','routes','labels'].map(k=>[k,!!e.target.elements[k].checked]));
   S.configuration=await patch(`/scenarios/${encodeURIComponent(S.scenarioId)}/configuration`,{layers});
   render();alertUser('想定图层开关已保存');return;
 }
 if(e.target.id==='rules-form'){const a=Object.fromEntries(new FormData(e.target));asNum(a,['wind_kmh','visibility_km']);await patch(`/scenarios/${S.scenarioId}`,a);await refresh();render();alertUser('想定环境与规则已保存');return;}
 if(e.target.id==='route-form'){const a=Object.fromEntries(new FormData(e.target));S.routeFrom=a.origin;S.routeTo=a.destination;const q=new URLSearchParams({...a,city_id:S.city,strategy:S.strategy,algorithm:S.algorithm,weather:scenario()?.weather||'clear'});S.routeData=await get(`/routes/preview?${q}`);render();return;}
 if(e.target.id==='simulation-form'){await startSimulation(e.target);return;}
 if(e.target.id==='experiment-form'){const v=Object.fromEntries(new FormData(e.target));await createExperimentWithParameters({weather:v.weather,wind_kmh:Number(v.wind_kmh),rain:v.rain,cloud_base:v.cloud_base,sea_state:v.sea_state,payload_profile:v.payload_profile,altitude_profile:v.altitude_profile,battery_reserve_pct:Number(v.battery_reserve_pct)},{name:v.name,notes:v.notes,strategy:v.strategy,algorithm:v.algorithm,seed:Number(v.seed),iterations:Number(v.iterations)});return;}
 if(e.target.id==='login-form'){const a=Object.fromEntries(new FormData(e.target));await login(a.username,a.password);await refresh();render();return;}
 }catch(err){fail(err);}finally{delete form.dataset.submitting;if(submit)submit.disabled=false;}});
window.addEventListener('keydown',e=>{
 if(e.key==='Escape'){hideDialog();return;}
 if(e.key==='Tab'&&modal.querySelector('[role="dialog"]')){
  const controls=[...modal.querySelectorAll('button:not([disabled]),input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled])')];
  const first=controls[0],last=controls[controls.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
 }
});
window.addEventListener('popstate',syncRoute);
window.addEventListener('hashchange',syncRoute);
window.addEventListener('resize',()=>{if(!root.querySelector('#assessment')&&root.querySelector('#geo-map')){if(S.module==='home')mountWorkspace({module:'home',city:city(),cities:S.cities,network:S.network});else renderMap();}});
(async()=>{try{if(!await initAuth()){root.innerHTML=`${heading('SECURE SYSTEM','用户身份认证','请使用获授权的账户进入工作台。')}<div class="login-panel"><form id="login-form"><label>用户名<input name="username" autocomplete="username" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><button class="button button-primary" type="submit">登录系统</button></form></div>`;return;}
 S.cities=await get('/cities');if(S.cities.some(c=>c.id==='national')&&!sessionStorage.getItem('aether_regional_workspace_v2')){S.city='national';sessionStorage.setItem('aether_city','national');sessionStorage.setItem('aether_regional_workspace_v2','1');}if(!S.cities.some(c=>c.id===S.city))S.city=S.cities[0]?.id||'wuhan';await refresh();S.compareIds=S.runs.slice(0,3).map(r=>r.id);const initial=routeState();S.module=initial.module;if(initial.tab)S.tabs[initial.module]=initial.tab;render();if(S.module==='simulation')loadTelemetry();}catch(err){console.error(err);root.innerHTML=`${heading('OFFLINE','系统尚未连接','后端接口无法访问，请确认服务已启动。')}<div class="empty-state">${txt(err.message)}<br><button class="button button-primary" onclick="location.reload()">重新连接</button></div>`;}})();
