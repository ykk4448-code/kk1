/** Map is the persistent visual floor; business controls live in floating surfaces. */
import {geoMapMarkup,mapCommand,renderGeoMap} from './map.js';

export function workspaceMarkup(body,context){
 const home=context.module==='home';
 return `<div class="map-stage" aria-label="中国地理底图">${geoMapMarkup()}</div><div class="workspace-layer"><div class="workspace-business">${body}</div></div>${home?'':`<div class="workspace-tools" aria-label="工作台布局"><button type="button" data-workspace-tool="panels" aria-pressed="false" title="收起或显示业务面板">收起面板</button><button type="button" data-workspace-tool="wide" title="展开工作面板">展开面板</button>${false?'<button type="button" data-workspace-tool="shipments" title="查看端到端运单与接驳分段">运单</button>':''}<button type="button" data-workspace-tool="schedule" aria-pressed="true" title="显示或隐藏任务列表">任务</button><button type="button" data-workspace-tool="stats" aria-pressed="false" title="显示或隐藏统计曲线">统计</button><button type="button" data-workspace-tool="inspector" title="查看任务和平台详情">详情</button><button type="button" data-workspace-tool="events" title="查看推演事件">事件</button><button type="button" data-workspace-tool="fleet" title="查看参演平台">平台</button></div><div class="workspace-mobile-tabs" aria-label="悬浮面板"><button data-mobile-pane="map" aria-pressed="true">地图</button>${false?'<button data-mobile-pane="shipments" aria-pressed="false">运单</button>':''}<button data-mobile-pane="schedule" aria-pressed="false">任务</button><button data-mobile-pane="inspector" aria-pressed="false">详情</button><button data-mobile-pane="trend" aria-pressed="false">统计</button><button data-mobile-pane="events" aria-pressed="false">事件</button><button data-mobile-pane="fleet" aria-pressed="false">平台</button></div>`}`;
}

export function mountWorkspace(context){
 document.body.classList.add('map-workspace');
 document.body.dataset.workspace=context.module;
 document.body.dataset.workspaceView=context.tab||'';
 document.body.classList.toggle('workspace-has-assessment',Boolean(document.getElementById('assessment')));
 document.body.dataset.mobilePane||='map';
 document.querySelectorAll('[data-mobile-pane]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mobilePane===document.body.dataset.mobilePane)));
 const stage=document.querySelector('.map-stage');
 stage.classList.toggle('map-stage-home',context.module==='home');
 if(context.module==='home')document.body.classList.remove('map-panels-hidden','workspace-sheet-wide');
 document.body.classList.remove('workspace-show-events','workspace-show-fleet','workspace-show-inspector','workspace-show-shipments','workspace-show-stats','workspace-hide-schedule','workspace-show-legend','workspace-show-bookmarks','workspace-show-shipments','map-immersive');
 const collapsed=document.body.classList.contains('map-panels-hidden'),toggle=document.querySelector('[data-workspace-tool=panels]');
 if(toggle){toggle.textContent=collapsed?'显示面板':'收起面板';toggle.setAttribute('aria-pressed',String(collapsed));}
 renderGeoMap(context.network||{nodes:[],edges:[],vehicles:[]},context.city,null,{national:context.module==='home',home:context.module==='home',cities:context.cities,onCity:context.onCity});
}

if(typeof document!=='undefined')document.addEventListener('click',event=>{
 const button=event.target.closest('[data-workspace-tool],[data-mobile-pane]');if(!button)return;
 if(button.dataset.mobilePane){document.body.dataset.mobilePane=button.dataset.mobilePane;document.querySelectorAll('[data-mobile-pane]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));mapCommand('fit');return;}
 const tool=button.dataset.workspaceTool;
 if(['events','fleet','inspector','shipments','schedule','stats'].includes(tool)&&innerWidth<=1150){const pane=tool==='stats'?'trend':tool;document.body.dataset.mobilePane=pane;document.querySelectorAll('[data-mobile-pane]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mobilePane===pane)));mapCommand('fit');return;}
 if(tool==='schedule'){const hidden=document.body.classList.toggle('workspace-hide-schedule');button.setAttribute('aria-pressed',String(!hidden));mapCommand('fit');return;}
 if(['stats','legend','bookmarks'].includes(tool)){const key=tool==='stats'?'workspace-show-stats':tool==='legend'?'workspace-show-legend':'workspace-show-bookmarks';const shown=document.body.classList.toggle(key);button.setAttribute('aria-pressed',String(shown));button.setAttribute('aria-expanded',String(shown));if(tool!=='bookmarks')mapCommand('fit');return;}
 if(tool==='panels'){const hidden=document.body.classList.toggle('map-panels-hidden');button.textContent=hidden?'显示面板':'收起面板';button.setAttribute('aria-pressed',String(hidden));mapCommand('fit');}
 if(tool==='wide'){const wide=document.body.classList.toggle('workspace-sheet-wide');button.textContent=wide?'收窄面板':'展开面板';button.setAttribute('aria-pressed',String(wide));mapCommand('fit');}
 if(tool==='events'||tool==='fleet'||tool==='inspector'||tool==='shipments'){const key='workspace-show-'+tool;const active=document.body.classList.contains(key);document.body.classList.remove('workspace-show-events','workspace-show-fleet','workspace-show-inspector','workspace-show-shipments');document.body.classList.toggle(key,!active);document.querySelectorAll('[data-workspace-tool=events],[data-workspace-tool=fleet],[data-workspace-tool=inspector],[data-workspace-tool=shipments]').forEach(b=>b.setAttribute('aria-pressed',String(document.body.classList.contains('workspace-show-'+b.dataset.workspaceTool))));mapCommand('fit');}
});
