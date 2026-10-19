/** Shared map for WGS84 snapshots and explicitly labelled legacy synthetic grids. */
import {esc} from './charts.js';

const mercator=(lat,lon,z)=>{const size=256*2**z,s=Math.max(-.9999,Math.min(.9999,Math.sin(lat*Math.PI/180)));return [(lon+180)/360*size,(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*size];};
const inverse=(x,y,z)=>[Math.atan(Math.sinh(Math.PI*(1-2*y/(256*2**z))))*180/Math.PI,x/(256*2**z)*360-180];
let camera={key:'',center:[30.58,114.3],zoom:11},saved=null;
const colors={hub:'#246eb9',depot:'#278e9b',critical:'#bf8138',command:'#7961b5',delivery:'#358f78'};
export function geoMapMarkup(){return `<div class="geo-shell"><div class="geo-map" id="geo-map" role="region" aria-label="投送态势地图，支持缩放与拖动"><div class="geo-grid"></div><div class="geo-tiles" id="geo-tiles"></div><svg class="geo-overlay" id="geo-overlay" aria-label="设施、任务路线及平台位置"></svg><div class="geo-city-label"><span class="signal-dot"></span><span id="geo-city-name">态势地图</span><small id="geo-system">WGS84</small></div><div class="geo-controls"><button data-map="in" aria-label="放大地图" title="放大">+</button><button data-map="out" aria-label="缩小地图" title="缩小">−</button><button data-map="fit" aria-label="适配全部节点" title="适配全部节点">⌖</button></div><div class="geo-scale" id="geo-coords"></div><div class="geo-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors</div></div><div class="map-legend"><span><i style="background:#246eb9"></i>枢纽</span><span><i style="background:#278e9b"></i>转运站</span><span><i style="background:#bf8138"></i>重点设施</span><span class="map-note">近似位置 / 合成规划通道</span></div></div>`;}

export function renderGeoMap(network,city,plan,opts={}){
 const el=document.getElementById('geo-map');if(!el)return;
 const nodes=network?.nodes||[],edges=network?.edges||[],fleet=network?.vehicles||[];
 const geographic=nodes.length>0&&nodes.every(n=>Number.isFinite(n.lat)&&Number.isFinite(n.lon))&&new Set(nodes.map(n=>`${n.lat},${n.lon}`)).size>1;
 const view=opts.missionView,focus=opts.mapMode==='focus'&&view?.path.length>0;
 const key=`${city?.id||'snapshot'}:${geographic?'geo':'xy'}:${opts.run?.id||''}:${focus?opts.selectedTask:'all'}`;
 el.classList.toggle('mission-focused',Boolean(focus));
 const w=el.clientWidth||800,h=el.clientHeight||450;
 function fit(){
  if(!geographic){camera.center=[50,50];camera.zoom=0;return;}
  const fitted=focus?view.path:nodes;
  const lats=fitted.map(n=>n.lat),lons=fitted.map(n=>n.lon);camera.center=[(Math.min(...lats)+Math.max(...lats))/2,(Math.min(...lons)+Math.max(...lons))/2];
  for(let zoom=15;zoom>=7;zoom--){const a=mercator(Math.min(...lats),Math.min(...lons),zoom),b=mercator(Math.max(...lats),Math.max(...lons),zoom);if(Math.abs(a[0]-b[0])<w*.74&&Math.abs(a[1]-b[1])<h*.72){camera.zoom=zoom;return;}}camera.zoom=7;
 }
 if(camera.key!==key||camera.size!==`${w}x${h}`){camera.key=key;camera.size=`${w}x${h}`;fit();}
 const tiles=el.querySelector('#geo-tiles'),svg=el.querySelector('#geo-overlay'),layer=opts.layers||{},visible=k=>layer[k]!==false;
 el.classList.toggle('synthetic-map',!geographic);
 const center=geographic?mercator(...camera.center,camera.zoom):[0,0],left=center[0]-w/2,top=center[1]-h/2;
 const xyBounds={xmin:Math.min(0,...nodes.map(n=>n.x||0)),xmax:Math.max(100,...nodes.map(n=>n.x||0)),ymin:Math.min(0,...nodes.map(n=>n.y||0)),ymax:Math.max(100,...nodes.map(n=>n.y||0))};
 const point=n=>{
  if(geographic&&n.lat!=null&&n.lon!=null){const p=mercator(n.lat,n.lon,camera.zoom);return [p[0]-left,p[1]-top];}
  const scale=2**camera.zoom;return [w/2+((n.x??50)-camera.center[1])/(xyBounds.xmax-xyBounds.xmin)*Math.max(w-110,100)*scale,h/2+((n.y??50)-camera.center[0])/(xyBounds.ymax-xyBounds.ymin)*Math.max(h-95,80)*scale];
 };
 if(geographic){
  const tileKey=[key,camera.zoom,Math.round(left),Math.round(top),w,h].join(':');
  if(tiles.dataset.key!==tileKey){let html='';const count=2**camera.zoom;
   for(let x=Math.floor(left/256);x<=Math.ceil((left+w)/256);x++)for(let y=Math.floor(top/256);y<=Math.ceil((top+h)/256);y++){if(y<0||y>=count)continue;html+=`<img class="geo-tile" draggable="false" loading="lazy" alt="" style="left:${x*256-left}px;top:${y*256-top}px" src="https://tile.openstreetmap.org/${camera.zoom}/${((x%count)+count)%count}/${y}.png">`;}
   tiles.innerHTML=html;tiles.dataset.key=tileKey;tiles.querySelectorAll('img').forEach(img=>img.onerror=()=>{el.classList.add('map-offline');img.style.opacity='0';});
  }
 }else{tiles.innerHTML='';tiles.dataset.key='';el.classList.remove('map-offline');}
 const byId=Object.fromEntries(nodes.map(n=>[n.id,n]));
 const assignment=plan?.assignment_data?.find(a=>a.task_id===opts.selectedTask);
 const selectedEdges=new Set(assignment?.path_edges||[]),routeEdges=new Set(opts.routes&&visible('routes')?plan?.assignment_data?.flatMap(a=>a.path_edges)||[]:[]);
 for(const id of opts.preview?.edges||[])selectedEdges.add(id);
 const edgeMarkup=edges.map(e=>{
  const a=byId[e.source],b=byId[e.target];if(!a||!b)return '';
  const chosen=selectedEdges.has(e.id)&&visible('routes'),route=routeEdges.has(e.id);
  if(!visible('links')&&!chosen&&!route)return '';
  if(view&&chosen)return ''; // The selected route is rendered in chronological order below.
  const p=point(a),q=point(b),stroke=e.status==='closed'?'#d95a58':chosen?'#286bdb':route?'#5799ba':e.status==='restricted'?'#cb9749':'#9dabb8';
  return `<line class="geo-network-link" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${stroke}" stroke-width="${chosen?3:route?1.8:1}" stroke-opacity="${focus ? 0.18 : chosen ? 0.95 : route ? 0.55 : 0.3}" ${e.status==='open'?'':'stroke-dasharray="5 5"'}/>`;
 }).join('');
 const routeLine=(path,clazz)=>path?.length>1?`<polyline class="${clazz}" points="${path.map(n=>point(n).join(',')).join(' ')}"/>`:'';
 let routeMarkup='';
 if(view&&visible('routes')){
  routeMarkup=routeLine(view.path,'mission-route-casing')+routeLine(view.path,'mission-route-base')+routeLine(view.remaining,'mission-route-remaining');
  if(view.hasReposition&&assignment?.reposition_nodes?.length>1)routeMarkup+=routeLine(assignment.reposition_nodes.map(id=>byId[id]).filter(Boolean),'mission-route-reposition');
  routeMarkup+=routeLine(view.traveled,'mission-route-traveled');
  for(let i=0;i<view.path.length-1;i++){
   const p=point(view.path[i]),q=point(view.path[i+1]);if(Math.hypot(q[0]-p[0],q[1]-p[1])<55)continue;
   const angle=Math.atan2(q[1]-p[1],q[0]-p[0])*180/Math.PI;
   routeMarkup+=`<path class="mission-route-arrow" d="M-7-5L0 0L-7 5" transform="translate(${(p[0]+q[0])/2} ${(p[1]+q[1])/2}) rotate(${angle})"/>`;
  }
 }
 const positions=opts.telemetry?.vehicles||[];
 const selectedVehicle=positions.find(v=>v.vehicle_id===opts.selectedVehicle);
 const actorPosition=view?view.position:selectedVehicle;
 const hasActor=actorPosition&&(geographic?Number.isFinite(actorPosition.lat)&&Number.isFinite(actorPosition.lon):Number.isFinite(actorPosition.x)&&Number.isFinite(actorPosition.y));
 const actorPoint=hasActor?point(actorPosition):null;
 const occupied=actorPoint?[{x:actorPoint[0]-25,y:actorPoint[1]-29,w:160,h:65}]:[];
 const labelWidth=text=>[...text].reduce((sum,c)=>sum+(/[\u2e80-\uffff]/.test(c)?14:8),16);
 const important=new Set(assignment?.path_nodes||[]);
 const priority=n=>n.id===assignment?.destination?0:n.id===assignment?.origin?1:n.id===view?.departure?.id?2:important.has(n.id)?3:4;
 const ordered=nodes.slice().sort((a,b)=>priority(a)-priority(b));
 const nodeMarkup=visible('facilities')?ordered.map(n=>{
  const [x,y]=point(n),c=colors[n.category]||'#4584a9';if(x< -40||y< -40||x>w+40||y>h+40)return '';
  const pickup=n.id===assignment?.origin,drop=n.id===assignment?.destination,departure=n.id===view?.departure?.id&&!pickup;
  const endpoint=Boolean(view&&(pickup||drop||departure));
  const displayLabel=!focus||endpoint||n.id===view?.next?.id;
  let label='';const text=(view?(drop?'交付 · ':pickup?'取货 · ':departure?'出发 · ':''):'')+n.name,width=labelWidth(text);
  if(visible('labels')&&displayLabel){
   const candidates=[{x:x+17,y:y-14},{x:x-width-17,y:y-14},{x:x-width/2,y:y+21},{x:x-width/2,y:y-46},{x:x-width/2,y:y+55},{x:x+17,y:y+17},{x:x-width-17,y:y+17}];
   const box=candidates.find(b=>b.x>5&&b.y>65&&b.x+width<w-44&&b.y+28<h-34&&!occupied.some(o=>b.x<o.x+o.w+5&&b.x+width+5>o.x&&b.y<o.y+(o.h||28)+5&&b.y+33>o.y));
   if(box){occupied.push({...box,w:width,h:28});label=`<rect class="geo-node-label-bg ${endpoint?'endpoint':''}" x="${box.x}" y="${box.y}" width="${width}" height="28" rx="4"/><text class="geo-node-label" x="${box.x+8}" y="${box.y+19}">${esc(text)}</text>`;}
  }
  const marker=endpoint?`<circle cx="${x}" cy="${y}" r="13" fill="${drop?'#277768':'#245b85'}" stroke="#fff" stroke-width="3"/><text class="geo-endpoint-glyph" x="${x}" y="${y+5}" text-anchor="middle">${drop?'送':pickup?'取':'始'}</text>`:`<circle cx="${x}" cy="${y}" r="${focus?4:6}" fill="${n.status==='online'?c:'#89949f'}" stroke="#fff" stroke-width="2" opacity="${focus?.55:1}"/>`;
  return `<g class="geo-pin" data-node="${esc(n.id)}" role="button" tabindex="0" aria-label="设施 ${esc(n.name)}"><title>${esc(n.name)}</title>${marker}${label}</g>`;
 }).join(''):'';
 let units='';if(visible('formations'))for(const u of opts.formations||[]){const n=byId[u.deploy_node];if(!n)continue;const [x,y]=point(n),v=fleet.find(v=>v.id===u.vehicle_id);units+=`<g><rect x="${x-5}" y="${y-25}" width="12" height="12" rx="3" fill="#2b7fbe" stroke="#fff" stroke-width="2"/><text x="${x+10}" y="${y-17}" fill="#1b5c96" font-size="12">${esc(v?.code||u.vehicle_id)}</text></g>`;}
 const glyph=v=>v?.category==='drone'?'<path d="M-7 0h14M0-7v14M-5-5l10 10M5-5l-10 10"/><circle cx="-6" cy="-6" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="6" cy="-6" r="3"/><circle cx="-6" cy="6" r="3"/>':'<rect x="-8" y="-6" width="11" height="9" rx="1"/><path d="M3-3h4l4 4v3H3"/><circle cx="-5" cy="6" r="2"/><circle cx="7" cy="6" r="2"/>';
 const groups=new Map();let moving='';
 if(!focus)for(const v of positions){
  if(v.vehicle_id===opts.selectedVehicle&&hasActor)continue;
  if((geographic&&(!Number.isFinite(v.lat)||!Number.isFinite(v.lon)))||(!geographic&&(!Number.isFinite(v.x)||!Number.isFinite(v.y))))continue;
  const [x,y]=point(v),key=`${Math.round(x/22)}:${Math.round(y/22)}`;
  if(!groups.has(key))groups.set(key,{x,y,vehicles:[]});groups.get(key).vehicles.push(v);
 }
 for(const group of groups.values()){
  const {x,y,vehicles}=group,v=vehicles[0],c=vehicles.some(v=>v.status==='failed')?'#b55148':'#557f98';
  moving+=`<g class="geo-moving geo-other-vehicle" data-replay-vehicle="${esc(v.vehicle_id)}" role="button" tabindex="0" aria-label="查看平台 ${esc(v.code)}${vehicles.length>1?'，此处共 '+vehicles.length+' 台平台':''}" transform="translate(${x} ${y})"><title>${vehicles.map(v=>esc(v.code)+' · '+esc(v.mission_code||'待命')).join(' / ')}</title><circle r="13" fill="#fff" stroke="${c}" stroke-width="1.5"/>${vehicles.length>1?`<text y="5" text-anchor="middle" class="geo-cluster-count">${vehicles.length}</text>`:`<g fill="none" stroke="${c}" stroke-width="1.4">${glyph(v)}</g>`}</g>`;
 }
 svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
 // Keep the selected actor connected to the SVG so its position interpolates smoothly.
 if(!svg.querySelector('[data-map-layer="network"]'))svg.innerHTML='<g data-map-layer="network"></g><g data-map-layer="route"></g><g data-map-layer="nodes"></g><g data-map-layer="fleet"></g><g data-map-layer="actor"></g>';
 svg.querySelector('[data-map-layer="network"]').innerHTML=edgeMarkup;
 svg.querySelector('[data-map-layer="route"]').innerHTML=routeMarkup;
 svg.querySelector('[data-map-layer="nodes"]').innerHTML=nodeMarkup;
 svg.querySelector('[data-map-layer="fleet"]').innerHTML=units+moving;
 const actorLayer=svg.querySelector('[data-map-layer="actor"]');
 if(hasActor&&selectedVehicle){
  const [x,y]=actorPoint,c=view?.stage==='failed'?'#b55148':view?.stage==='delivered'?'#277768':'#245b85';
  let actor=actorLayer.firstElementChild;
  if(!actor||actor.dataset.replayVehicle!==selectedVehicle.vehicle_id){actorLayer.innerHTML=`<g class="geo-moving is-selected" data-replay-vehicle="${esc(selectedVehicle.vehicle_id)}" role="button" tabindex="0" aria-label="查看平台 ${esc(selectedVehicle.code)}"></g>`;actor=actorLayer.firstElementChild;}
  const plateWidth=Math.max(96,labelWidth(selectedVehicle.code)),plateX=x+plateWidth+35<w?25:-plateWidth-25;
  actor.innerHTML=`<title>${esc(selectedVehicle.code)} · ${esc(view?.label||selectedVehicle.status)}</title><circle r="25" fill="${c}" fill-opacity=".13"/><circle r="17" fill="#fff" stroke="${c}" stroke-width="3"/><g fill="none" stroke="${c}" stroke-width="1.7">${glyph(selectedVehicle)}</g><rect x="${plateX}" y="-14" width="${plateWidth}" height="28" rx="4" fill="${c}"/><text class="geo-actor-label" x="${plateX+plateWidth/2}" y="5" text-anchor="middle">${esc(selectedVehicle.code)}</text>`;
  const projection=[key,camera.zoom,Math.round(left),Math.round(top)].join(':');
  actor.style.transition=opts.animate&&actor.dataset.projection===projection?'transform 460ms linear':'none';
  actor.dataset.projection=projection;actor.style.transform=`translate(${x}px,${y}px)`;
 }else actorLayer.innerHTML='';
 el.querySelector('#geo-city-name').textContent=geographic?`${city?.name||'方案快照'} · 行动区域`:'历史任务 · 虚拟路网';
 el.querySelector('#geo-system').textContent=geographic?'WGS84 / OSM':'SYNTHETIC XY';
 el.querySelector('#geo-coords').textContent=geographic?`${camera.center[0].toFixed(4)}°N, ${camera.center[1].toFixed(4)}°E · Z${camera.zoom}`:'相对坐标网格 · 不代表真实地理位置';
 el.querySelector('.geo-attribution').hidden=!geographic;
 saved={network,city,plan,opts};
 const redraw=()=>renderGeoMap(saved.network,saved.city,saved.plan,saved.opts);
 el.querySelectorAll('[data-node]').forEach(g=>g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();g.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
 el.querySelectorAll('[data-replay-vehicle]').forEach(g=>{g.onclick=e=>{e.stopPropagation();opts.onSelectVehicle?.(g.dataset.replayVehicle);};g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();opts.onSelectVehicle?.(g.dataset.replayVehicle);}};});
 el.onpointerdown=e=>{if(e.target.closest('button,a,[data-node],[data-replay-vehicle]'))return;el.setPointerCapture(e.pointerId);el._drag={x:e.clientX,y:e.clientY,center:camera.center.slice(),project:center};el.style.cursor='grabbing';};
 el.onpointermove=e=>{if(!el._drag)return;const dx=e.clientX-el._drag.x,dy=e.clientY-el._drag.y;if(geographic)camera.center=inverse(el._drag.project[0]-dx,el._drag.project[1]-dy,camera.zoom);else camera.center=[el._drag.center[0]-dy/(h-95)*100/2**camera.zoom,el._drag.center[1]-dx/(w-110)*100/2**camera.zoom];redraw();};
 el.onpointerup=el.onpointercancel=()=>{el._drag=null;el.style.cursor='grab';};
 el.querySelectorAll('[data-map]').forEach(button=>button.onclick=e=>{e.stopPropagation();if(button.dataset.map==='fit')fit();else camera.zoom=Math.max(geographic?7:-1,Math.min(geographic?16:3,camera.zoom+(button.dataset.map==='in'?1:-1)));redraw();});
}
