/** AETHER 7.0 · mission-console interactions.
 * Enhancement only: #desk-slider remains the ONE playback source of truth.
 * All events come from the saved, synthetic first simulation iteration.
 */
import {get} from './api.js';

const EVENTS=new Set(['dispatch','arrived','failed','warning']);
const EVENT_LABELS={dispatch:'任务派遣',arrived:'交付完成',failed:'任务中断',warning:'环境扰动'};
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const atLabel=value=>`T+${Math.max(0,Number(value)||0).toFixed(1)}`;
export function normalizedEvents(data){
  return (Array.isArray(data?.events)?data.events:[])
    .filter(e=>e&&EVENTS.has(e.kind)&&Number.isFinite(Number(e.at_min))&&Number(e.at_min)>=0)
    .map((e,index)=>({...e,at_min:Number(e.at_min),_index:index}))
    .sort((a,b)=>a.at_min-b.at_min||a._index-b._index);
}
export function filterEvents(events,{filter='all',query=''}={}){
  const needle=String(query).trim().toLocaleLowerCase();
  return events.filter(e=>{
    if(filter==='incident'&&!['warning','failed'].includes(e.kind))return false;
    if(['dispatch','arrived'].includes(filter)&&e.kind!==filter)return false;
    return !needle||[e.vehicle,e.message,e.kind,EVENT_LABELS[e.kind],atLabel(e.at_min)]
      .some(v=>String(v??'').toLocaleLowerCase().includes(needle));
  });
}
const cache=new Map();
const MAX_CACHED_RUNS=8;
let scheduled=false;
let currentView=null;
let pendingRequest=null;
const state={filter:'all',query:'',limit:48,inspectorOpen:true};
const station=()=>{const desk=document.querySelector('#assessment');return desk?.isConnected&&desk.querySelector('.desk-player')?desk:null;};
function cachedRun(id){if(!cache.has(id))return null;const data=cache.get(id);cache.delete(id);cache.set(id,data);return data;}
function storeRun(id,data){cache.set(id,data);if(cache.size>MAX_CACHED_RUNS)cache.delete(cache.keys().next().value);}
function getRun(id){
  const saved=cachedRun(id);if(saved)return Promise.resolve(saved);
  return get(`/simulations/${encodeURIComponent(id)}/assessment?minute=0.000`).then(data=>{
    if(!Array.isArray(data?.events)||!Number.isFinite(Number(data.duration_min)))throw Error('当前记录缺少有效的回放事件');
    storeRun(id,data);return data;
  });
}
function htmlEvent(e){
  const subtitle=[e.vehicle,e.message||EVENT_LABELS[e.kind]].filter(Boolean).join(' · ');
  return `<button type="button" class="ops-event ops-event-v7 ${safe(e.kind)}" data-ops-seek="${e.at_min}" data-ops-event-index="${e._index}" aria-label="定位 ${atLabel(e.at_min)} ${safe(subtitle)}">
    <span class="ops-event-type">${safe(EVENT_LABELS[e.kind])}</span>
    <span class="ops-event-time">${atLabel(e.at_min)}</span>
    <span class="ops-event-copy">${safe(subtitle)}</span>
  </button>`;
}
function eventStats(events){const issues=events.filter(e=>e.kind==='failed'||e.kind==='warning').length;return `<span>${events.length} 条记录</span><span class="ops-stat-separator">/</span><span>${issues} 条异常</span>`;}
function scaffold(data){
 const duration=Math.max(1,Number(data.duration_min)||1),evs=normalizedEvents(data);
 return `<section class="ops-v7-header" aria-label="回放事件导航">
    <div class="ops-v7-heading"><div><small>SIMULATED EVENT LOG</small><h3>关键事件导航</h3><p>基于已保存的首次迭代事件 · 非实时监控</p></div><div class="ops-v7-event-stats">${eventStats(evs)}</div></div>
    <div class="ops-v7-tools"><label class="ops-v7-search-label">搜索事件 <input type="search" class="ops-v7-search" placeholder="任务 / 平台 / 事件" aria-label="按任务、平台或事件关键词检索"></label>
      <label class="ops-v7-filter-label">事件类别 <select class="ops-v7-filter" aria-label="筛选事件类别"><option value="all">全部</option><option value="incident">异常</option><option value="dispatch">派遣</option><option value="arrived">交付</option></select></label>
      <button type="button" class="ops-v7-jump" data-ops-first-incident>定位首个异常</button></div>
    <div class="ops-v7-list" id="ops-v7-list" aria-label="可定位的回放事件列表"></div>
    <div class="ops-v7-footer"><span class="ops-v7-count" aria-live="polite"></span><button type="button" class="ops-v7-more" data-ops-more hidden>查看更多事件 ↓</button></div>
 </section><div class="ops-v7-player-top"><span class="ops-v7-clock-label">当前仿真时刻</span><strong class="ops-v7-clock">${atLabel(0)}</strong>
    <div class="ops-v7-bookmarks" aria-label="时间快捷定位">${[0,.25,.5,.75,1].map(r=>`<button type="button" data-ops-seek="${(duration*r).toFixed(3)}" aria-label="跳到${Math.round(100*r)}%">${r===0?'起点':r===1?'终点':`${Math.round(r*100)}%`}</button>`).join('')}</div>
    <span class="ops-v7-hotkeys">空格播放 / 暂停 · ← → 跳事件</span>
 </div>`;
}
function eventList(desk){
 const board=desk.querySelector('.ops-v7-header');if(!board)return;
 const runId=board.dataset.run;
 const data=cachedRun(runId);if(!data)return;
 const all=normalizedEvents(data),matched=filterEvents(all,state);
 const count=matched.length;
 const list=board.querySelector('#ops-v7-list');
 list.innerHTML=matched.length?matched.slice(0,state.limit).map(htmlEvent).join(''):`<div class="ops-v7-noresults"><b>没有匹配的事件</b><span>试试清空搜索词或切换事件类别。</span></div>`;
 board.querySelector('.ops-v7-count').textContent=`显示 ${Math.min(count,state.limit)} / ${count} 条 · 总计 ${all.length} 条`;
 board.querySelector('.ops-v7-more').hidden=count<=state.limit;
 timeSync(desk);
}
function timeSync(desk){
 const slider=desk?.querySelector('#desk-slider');if(!slider)return;
 const minute=Math.max(0,Number(slider.value)||0);
 const clock=desk.querySelector('.ops-v7-clock');if(clock)clock.textContent=atLabel(minute);
 const max=Math.max(1,Number(slider.max)||1);
 desk.querySelectorAll('.ops-v7-bookmarks [data-ops-seek]').forEach(el=>el.classList.toggle('is-reached',Number(el.dataset.opsSeek)<=minute+.0001));
 desk.querySelectorAll('.ops-event-v7').forEach(el=>{
   const delta=minute-Number(el.dataset.opsSeek);
   el.classList.toggle('is-past',delta>=-.001);
   el.classList.toggle('is-current',delta>=-.001&&delta<Math.max(.3,max/80));
 });
}
function seek(desk,to){const slider=desk.querySelector('#desk-slider');if(!slider)return;const max=Math.max(0,Number(slider.max)||0);slider.value=String(Math.max(0,Math.min(max,Number(to)||0)));slider.dispatchEvent(new Event('input',{bubbles:true}));timeSync(desk);}
function mount(desk,data,run){
 if(!desk?.isConnected||desk.querySelector('.ops-v7-header')||desk.querySelector('#assessment-run')?.value!==run)return;
 const player=desk.querySelector('.desk-player');if(!player)return;
 const wrapper=document.createElement('div');wrapper.innerHTML=scaffold(data);
 const board=wrapper.firstElementChild,tools=wrapper.lastElementChild;
 board.dataset.run=run;
 const eventStrip=desk.querySelector('.desk-event-strip');
 (eventStrip?.parentElement||player.parentElement).insertBefore(board,eventStrip||player);
 player.parentElement.insertBefore(tools,player);
 const mapTools=desk.querySelector('.desk-map-layers');
 if(mapTools&&!mapTools.querySelector('[data-ops-inspector]')){
   const toggle=document.createElement('button');toggle.type='button';toggle.className='ops-v7-inspector-toggle';toggle.dataset.opsInspector='true';toggle.setAttribute('aria-controls','desk-inspector');mapTools.append(toggle);
 }
 desk.classList.toggle('ops-v7-inspector-hidden',!state.inspectorOpen);
 updateInspectorToggle(desk);
 eventList(desk);timeSync(desk);
}
function updateInspectorToggle(desk){const el=desk.querySelector('[data-ops-inspector]');if(!el)return;el.textContent=state.inspectorOpen?'隐藏详情':'查看平台详情';el.setAttribute('aria-expanded',String(state.inspectorOpen));}
function queueCheck(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;const desk=station();if(desk)void ensure(desk);});}
async function ensure(desk){
 const player=desk.querySelector('.desk-player'),run=desk.querySelector('#assessment-run')?.value;
 if(!run||!player||desk.querySelector('.ops-v7-header')||player.dataset.opsV7Pending===run)return;
 player.dataset.opsV7Pending=run;
 const token={player,run};pendingRequest=token;
 try{const data=await getRun(run);if(pendingRequest!==token||!desk.isConnected||!player.isConnected)return;mount(desk,data,run);}
 catch(error){if(pendingRequest!==token)return;const node=desk.querySelector('.ops-v7-error')||document.createElement('div');node.className='ops-v7-error';node.innerHTML=`事件索引加载失败：${safe(error?.message||'未知错误')} <button type="button" data-ops-retry>重试</button>`;player.parentElement.insertBefore(node,player);}
 finally{if(player.isConnected)delete player.dataset.opsV7Pending;if(pendingRequest===token)pendingRequest=null;}
}
if(typeof document!=='undefined'){
 document.addEventListener('click',event=>{
   const button=event.target.closest('[data-ops-seek], [data-ops-first-incident], [data-ops-more], [data-ops-inspector], [data-ops-retry]');if(!button)return;
   const desk=button.closest('#assessment');if(!desk)return;
   if(button.hasAttribute('data-ops-seek'))seek(desk,button.dataset.opsSeek);
   else if(button.hasAttribute('data-ops-first-incident')){
     const data=cachedRun(desk.querySelector('.ops-v7-header')?.dataset.run),first=normalizedEvents(data).find(e=>e.kind==='warning'||e.kind==='failed');
     if(first)seek(desk,first.at_min);
     else {const filter=desk.querySelector('.ops-v7-filter');if(filter){state.filter='incident';filter.value='incident';eventList(desk);}}
   }else if(button.hasAttribute('data-ops-more')){state.limit+=48;eventList(desk);}
   else if(button.hasAttribute('data-ops-inspector')){state.inspectorOpen=!state.inspectorOpen;desk.classList.toggle('ops-v7-inspector-hidden',!state.inspectorOpen);updateInspectorToggle(desk);}
   else if(button.hasAttribute('data-ops-retry')){cache.delete(desk.querySelector('#assessment-run')?.value);desk.querySelector('.ops-v7-error')?.remove();void ensure(desk);}
 });
 document.addEventListener('input',event=>{
   if(event.target.matches('.ops-v7-search')){const desk=event.target.closest('#assessment');state.query=event.target.value;state.limit=48;eventList(desk);}
   if(event.target.id==='desk-slider')timeSync(event.target.closest('#assessment'));
 });
 document.addEventListener('change',event=>{
   if(event.target.matches('.ops-v7-filter')){state.filter=event.target.value;state.limit=48;eventList(event.target.closest('#assessment'));}
   if(event.target.id==='assessment-run'){state.filter='all';state.query='';state.limit=48;queueCheck();}
 });
 document.addEventListener('keydown',event=>{
   const desk=station();if(!desk||event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return;
   if(document.activeElement?.closest('button,a,input,select,textarea,[contenteditable="true"]')||document.querySelector('.modal-shade'))return;
   const shortcuts={' ':'play',ArrowLeft:'previous',ArrowRight:'next',Home:'reset'};
   if(shortcuts[event.key]){event.preventDefault();desk.querySelector(`[data-desk="${shortcuts[event.key]}"]`)?.click();}
   if(event.key==='End'){event.preventDefault();seek(desk,desk.querySelector('#desk-slider')?.max||0);}
 });
 const observer=new MutationObserver(queueCheck);
 observer.observe(document.body,{childList:true,subtree:true});
 // Playback changes the input.value property without dispatching an input event.
 // Poll only this cheap text/marker projection; NEVER refetch telemetry or mutate playback time.
 const ticker=()=>{if(document.visibilityState!=='hidden'){const desk=station();if(desk)timeSync(desk);}};
 setInterval(ticker,300);
 queueCheck();
}
