/** AETHER mission-console enhancement.
 * Reuses the assessment API, keeps the original playback engine authoritative.
 * Only mounted inside the secondary action-simulation / assessment workstation.
 */
import {get} from './api.js';

const cache=new Map();
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=t=>`T+${Number(t||0).toFixed(1)}`;
const eventNames={dispatch:'任务派遣',arrived:'交付完成',failed:'任务中断',warning:'环境扰动',position:'位置采样'};
const shown=new Set(['dispatch','arrived','failed','warning']);
let pending=false;

function visibleWorkstation(){
  const desk=document.querySelector('#assessment');
  return desk?.isConnected&&desk.querySelector('.desk-player')?desk:null;
}
function markup(data){
  const total=Math.max(1,Number(data.duration_min)||1);
  return `<div class="ops-time-bookmarks" aria-label="推演时刻快捷定位">
    <b>时间快速定位</b><div class="ops-markers">
    ${[0,.25,.5,.75,1].map(ratio=>`<button type="button" data-ops-seek="${(total*ratio).toFixed(3)}" aria-label="跳至推演进度 ${Math.round(ratio*100)}%">${ratio===0?'开始':ratio===1?'结束':Math.round(ratio*100)+'%'}</button>`).join('')}
    <button type="button" data-ops-warning="true" title="跳到首次环境扰动或中断事件">首个异常 ↗</button></div>
    <span class="ops-keyboard-hint">空格播放 / 暂停 · ← → 逐事件</span>
  </div><section class="ops-incident-board" aria-label="推演事件快速导航">
    <div class="ops-events-title"><div><strong>关键事件索引</strong><small>首次迭代事件 · 点击定位回放时刻</small></div>
      <select data-ops-filter="true" aria-label="筛选关键事件"><option value="all">全部事件</option><option value="warning">仅异常</option><option value="dispatch">任务派遣</option><option value="arrived">交付完成</option></select>
    </div>
    <div class="ops-events-scroll" aria-live="polite" id="ops-event-list"></div>
  </section>`;
}
function eventsFor(data,filter){
  const records=(data?.events||[]).filter(e=>shown.has(e.kind)&&Number.isFinite(Number(e.at_min)));
  return filter==='warning'?records.filter(e=>['warning','failed'].includes(e.kind)):
      filter==='all'?records:records.filter(e=>e.kind===filter);
}
function renderEvents(desk){
  const board=desk.querySelector('.ops-incident-board');
  const list=board?.querySelector('#ops-event-list');
  if(!list)return;
  const data=cache.get(board.dataset.run), filter=board.querySelector('[data-ops-filter]')?.value||'all';
  const events=eventsFor(data,filter);
  list.innerHTML=events.length?events.slice(0,100).map(e=>{
    const text=[e.vehicle||'',e.message||eventNames[e.kind]||e.kind].filter(Boolean).join(' · ');
    return `<button type="button" class="ops-event ${escapeHtml(e.kind)}" data-ops-seek="${Number(e.at_min).toFixed(3)}" aria-label="定位 ${fmt(e.at_min)} ${escapeHtml(text)}"><span class="ops-event-time">${fmt(e.at_min)}</span><span class="ops-event-copy">${escapeHtml(text)}</span></button>`;
  }).join(''):'<span class="ops-event-empty">当前筛选条件下暂无事件。</span>';
  markPast(desk);
}
function markPast(desk){
  const minute=Number(desk.querySelector('#desk-slider')?.value)||0;
  desk.querySelectorAll('.ops-event').forEach(el=>{
    el.classList.toggle('past',Number(el.dataset.opsSeek)<=minute+.001);
  });
}
async function enrich(desk){
  const run=desk.querySelector('#assessment-run')?.value;
  if(!run||desk.querySelector('.ops-incident-board'))return;
  const player=desk.querySelector('.desk-player');
  if(!player||player.dataset.opsPending===run)return;
  player.dataset.opsPending=run;
  try{
    if(!cache.has(run))cache.set(run,await get(`/simulations/${encodeURIComponent(run)}/assessment?minute=0.000`));
    if(!desk.isConnected||!player.isConnected||desk.querySelector('.ops-incident-board')||desk.querySelector('#assessment-run')?.value!==run)return;
    const data=cache.get(run);if(!data?.events||!Number.isFinite(Number(data.duration_min)))return;
    const fragment=document.createElement('div');fragment.innerHTML=markup(data);
    const markers=fragment.firstElementChild,events=fragment.lastElementChild;
    player.parentElement.insertBefore(markers,player);
    const anchor=desk.querySelector('.desk-event-strip');(anchor?.parentElement||player.parentElement).insertBefore(events,anchor||player.nextSibling);
    events.dataset.run=run;
    renderEvents(desk);
  }catch(error){console.warn('任务事件索引不可用：',error?.message||error);}finally{delete player.dataset.opsPending;}
}
function seek(desk,value){
  const slider=desk.querySelector('#desk-slider');if(!slider)return;
  slider.value=String(value);
  slider.dispatchEvent(new Event('input',{bubbles:true}));
  markPast(desk);
}
function scheduleCheck(){
  if(pending)return;
  pending=true;
  queueMicrotask(()=>{pending=false;const desk=visibleWorkstation();if(desk)void enrich(desk);});
}
// The existing controller receives all simulated-time state changes via #desk-slider.
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-ops-seek],[data-ops-warning]');if(!target)return;
  const desk=target.closest('#assessment');if(!desk)return;
  if(target.hasAttribute('data-ops-warning')){
    const run=desk.querySelector('.ops-incident-board')?.dataset.run;
    const event=eventsFor(cache.get(run),'warning')[0];
    if(event)seek(desk,event.at_min);
    else {const filter=desk.querySelector('[data-ops-filter]');if(filter){filter.value='warning';filter.dispatchEvent(new Event('change',{bubbles:true}));}}
  }else seek(desk,target.dataset.opsSeek);
});
document.addEventListener('change',event=>{
  if(event.target.matches('[data-ops-filter]'))renderEvents(event.target.closest('#assessment'));
  if(event.target.id==='assessment-run')scheduleCheck();
});
document.addEventListener('input',event=>{
  if(event.target.id==='desk-slider')markPast(event.target.closest('#assessment'));
});
document.addEventListener('keydown',event=>{
  const desk=visibleWorkstation();if(!desk||event.altKey||event.ctrlKey||event.metaKey)return;
  const active=document.activeElement;
  if(active?.matches('input,select,textarea,[contenteditable="true"]')||document.querySelector('.modal-shade'))return;
  const actions={' ':'play',ArrowLeft:'previous',ArrowRight:'next',Home:'reset'};
  const action=actions[event.key];
  if(action){event.preventDefault();desk.querySelector(`[data-desk="${action}"]`)?.click();}
  if(event.key==='End'){event.preventDefault();seek(desk,desk.querySelector('#desk-slider')?.max||0);}
});
const observer=new MutationObserver(scheduleCheck);
observer.observe(document.body,{childList:true,subtree:true});
scheduleCheck();
