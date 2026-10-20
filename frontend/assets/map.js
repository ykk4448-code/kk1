/** Shared map for WGS84 snapshots and explicitly labelled legacy synthetic grids. */
import {esc} from './charts.js';
import {routeCatalog,routeSegments} from './routes.js';
import {CHINA_MAP,CITY_MAPS} from './map-data.js';
import {geoProject,geoUnproject,fitGeographic} from './map-math.js';
import {flightStage,FLIGHT_LABELS} from './flight-replay.js';

const mercator=geoProject,inverse=geoUnproject;
let camera={key:'',center:[35,104],zoom:4,basemap:'streets'},saved=null;
const colors={hub:'#246eb9',depot:'#278e9b',critical:'#bf8138',command:'#7961b5',delivery:'#358f78',port:'#128ca8'};
export function geoMapMarkup(){return `<div class="geo-shell">
 <div class="geo-map-options"><span id="geo-map-summary" aria-live="polite"></span><label>路线范围 <select id="geo-route-scope" aria-label="地图路线显示范围"><option value="all">全部任务路线</option><option value="vehicle">选中平台路线</option><option value="task">选中任务路线</option><option value="shipment">整票运单路线</option></select></label></div>
 <div class="geo-map" id="geo-map" role="region" aria-label="投送态势地图，支持缩放与拖动"><div class="geo-grid"></div><svg class="geo-basemap" id="geo-basemap" aria-label="中国及城市行政区划地理底图"></svg><div class="geo-tiles" id="geo-tiles"></div><div class="geo-tile-state" id="geo-tile-state" role="status"></div><svg class="geo-overlay" id="geo-overlay" aria-label="设施、任务路线及平台位置"></svg><div class="geo-city-label"><span class="signal-dot"></span><span id="geo-city-name">态势地图</span><small id="geo-system">WGS84</small></div><div class="geo-basemap-switch" role="group" aria-label="底图类型"><button data-basemap="vector" aria-pressed="true">政区图</button><button data-basemap="streets" aria-pressed="false">街道图</button></div><div class="geo-controls"><button data-map="nation" aria-label="查看中国全图" title="中国全图">中国</button><button data-map="in" aria-label="放大地图" title="放大">+</button><button data-map="out" aria-label="缩小地图" title="缩小">−</button><button data-map="fit" aria-label="适配全部节点" title="适配全部节点">⌖</button></div><div class="geo-scale" id="geo-coords"></div><div class="geo-attribution"><a href="https://datav.aliyun.com/portal/school/atlas/area_selector" target="_blank" rel="noreferrer">DataV.GeoAtlas / 高德</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OSM contributors</a></div></div>
 <div class="geo-route-legend" id="geo-route-legend" aria-label="路线颜色与运输平台"></div><div class="map-legend"><span><i style="background:#246eb9"></i>枢纽</span><span><i style="background:#278e9b"></i>转运站</span><span><i style="background:#bf8138"></i>重点设施</span><span class="map-note">彩线 = 平台任务 · 灰线 = 基础通道</span></div></div>`;}

export function renderGeoMap(network,city,plan,opts={}){
 const el=document.getElementById('geo-map');if(!el)return;
 const nodes=network?.nodes||[],edges=network?.edges||[],fleet=network?.vehicles||[];
 const geographic=nodes.length>0&&nodes.every(n=>Number.isFinite(n.lat)&&Number.isFinite(n.lon))&&new Set(nodes.map(n=>`${n.lat},${n.lon}`)).size>1;
 const shipmentAssignments=opts.routeScope==='shipment'?(plan?.assignment_data||[]).filter(a=>a.shipment_id===opts.selectedShipment):[];
 const shipmentNodes=new Set(shipmentAssignments.flatMap(a=>a.path_nodes.slice(Math.max(0,(a.reposition_nodes?.length||1)-1))));
 const shipmentVehicles=new Set(shipmentAssignments.map(a=>a.vehicle_id));
 const view=opts.missionView,focus=opts.mapMode==='focus'&&view?.path.length>0;
 const key=`${city?.id||'china'}:${geographic?'geo':'xy'}:${opts.run?.id||''}:${focus?opts.selectedTask:'all'}:${nodes.map(n=>n.id).join(',')}:${opts.home?'home':''}:${opts.routeScope==='shipment'?opts.selectedShipment:''}`;
 el.classList.toggle('mission-focused',Boolean(focus));
 if(camera.city!==city?.id){camera.city=city?.id;camera.basemap=city?.id==='national'?'vector':'streets';}
 const w=el.clientWidth||innerWidth,h=el.clientHeight||innerHeight,padding=mapPadding(w,h,opts);
 const labHeight=document.querySelector('.experiment-console')?.getBoundingClientRect().height||0;if(labHeight)padding.bottom=Math.max(padding.bottom,labHeight+95);
 const flightDeck=document.querySelector('.flight-deck');if(flightDeck)padding.top=Math.max(padding.top,flightDeck.getBoundingClientRect().bottom+20);
 if(w>1150)for(const selector of ['.desk-map-layers','.trend-panel']){const panel=document.querySelector(selector);if(panel&&getComputedStyle(panel).display!=='none')padding.bottom=Math.max(padding.bottom,h-panel.getBoundingClientRect().top+12);}
 const cx=(padding.left+w-padding.right)/2,cy=(padding.top+h-padding.bottom)/2;
 function fit(national=false){
  if(national||opts.home){const fitted=fitGeographic([{lat:3,lon:73},{lat:54,lon:135}],w,h,padding);camera.center=fitted.center;camera.zoom=fitted.zoom;return;}
  if(!geographic){camera.center=city?.center||[35,104];camera.zoom=10;return;}
  const fitted=fitGeographic(focus?view.path:shipmentNodes.size?nodes.filter(n=>shipmentNodes.has(n.id)):nodes,w,h,padding);camera.center=fitted.center;camera.zoom=fitted.zoom;
 }
 if(camera.key!==key||camera.size!==`${w}x${h}`){camera.key=key;camera.size=`${w}x${h}`;fit(Boolean(opts.national));}
 const tiles=el.querySelector('#geo-tiles'),svg=el.querySelector('#geo-overlay'),layer=opts.layers||{},visible=k=>layer[k]!==false;
 el.classList.toggle('synthetic-map',!geographic&&!opts.home);
 el.classList.toggle('national-view',camera.zoom<7);
 el.tabIndex=opts.home?-1:0;
 const center=mercator(...camera.center,camera.zoom),left=center[0]-cx,top=center[1]-cy;
 const project=([lon,lat])=>{const p=mercator(lat,lon,camera.zoom);return [p[0]-left,p[1]-top];};
 const legacy={x:padding.left+25,y:padding.top+25,w:Math.max(160,w-padding.left-padding.right-50),h:Math.max(150,h-padding.top-padding.bottom-50)};
 const point=n=>geographic&&Number.isFinite(n.lat)&&Number.isFinite(n.lon)?project([n.lon,n.lat]):[legacy.x+25+(n.x??50)/100*(legacy.w-50),legacy.y+45+(n.y??50)/100*(legacy.h-70)];
 const vector=el.querySelector('#geo-basemap'),baseKey=[key,camera.zoom,left,top,w,h].join(':');
 if(vector.dataset.key!==baseKey){vector.setAttribute('viewBox',`0 0 ${w} ${h}`);vector.innerHTML=renderBoundaries(camera.zoom>7?(CITY_MAPS[city?.id]||CHINA_MAP):CHINA_MAP,project,w,h,camera.zoom)+renderCityReferences(opts.cities||[],project,camera.zoom,!opts.home);vector.dataset.key=baseKey;}
 if(camera.basemap==='streets'&&!opts.home){
  const z=Math.floor(camera.zoom),scale=2**(camera.zoom-z),size=256*scale,tileKey=[z,scale,Math.round(left),Math.round(top),w,h].join(':');
  if(tiles.dataset.key!==tileKey){let html='';const count=2**z;
   for(let x=Math.floor(left/size);x<=Math.floor((left+w)/size);x++)for(let y=Math.floor(top/size);y<=Math.floor((top+h)/size);y++){if(y<0||y>=count)continue;html+=`<img class="geo-tile" draggable="false" alt="" style="left:${x*size-left}px;top:${y*size-top}px;--tile-size:${size}px" src="https://tile.openstreetmap.org/${z}/${((x%count)+count)%count}/${y}.png">`;}
   tiles.innerHTML=html;tiles.dataset.key=tileKey;el.querySelector('#geo-tile-state').textContent='正在加载街道底图…';let loaded=0,failed=0;
   tiles.querySelectorAll('img').forEach(img=>{img.onload=()=>{if(tiles.dataset.key!==tileKey)return;loaded++;el.querySelector('#geo-tile-state').textContent=failed?`街道底图 ${loaded} 张已加载 · 地理边界保留`:'';};img.onerror=()=>{if(tiles.dataset.key!==tileKey)return;failed++;img.style.opacity='0';el.querySelector('#geo-tile-state').textContent='街道图部分不可达 · 地理底图仍可使用';};});
  }
 }else{tiles.innerHTML='';tiles.dataset.key='';el.querySelector('#geo-tile-state').textContent='';}
 const showNetwork=!opts.home&&(camera.zoom>=7||city?.id==='national');
 const byId=Object.fromEntries(nodes.map(n=>[n.id,n]));
 const assignment=plan?.assignment_data?.find(a=>a.task_id===opts.selectedTask);
 const selectedEdges=new Set(focus?assignment?.path_edges||[]:[]),routeEdges=new Set();
 for(const id of opts.preview?.edges||[])selectedEdges.add(id);
 const edgeMarkup=showNetwork?edges.map(e=>{
  const a=byId[e.source],b=byId[e.target];if(!a||!b)return '';
  const chosen=selectedEdges.has(e.id)&&visible('routes'),route=routeEdges.has(e.id);
  if(!visible('links')&&!chosen&&!route)return '';
  if(view&&chosen)return ''; // The selected route is rendered in chronological order below.
  const p=point(a),q=point(b),stroke=e.status==='closed'?'#d95a58':chosen?'#286bdb':route?'#5799ba':e.status==='restricted'?'#cb9749':'#9dabb8';
  return `<line class="geo-network-link" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${stroke}" stroke-width="${chosen?3:route?1.8:1}" stroke-opacity="${focus ? 0.18 : chosen ? 0.95 : route ? 0.55 : 0.3}" ${e.transport_mode==='sea'?'stroke-dasharray="10 5"':e.status==='open'?'':'stroke-dasharray="5 5"'}/>`;
 }).join(''):'';
 const catalog=routeCatalog(plan),scope=opts.routeScope||'all',hasRoutes=showNetwork&&!focus&&opts.routes&&visible('routes');
 const segments=hasRoutes?routeSegments(network,plan,{scope,selectedTask:opts.selectedTask,selectedVehicle:opts.selectedVehicle,selectedShipment:opts.selectedShipment}):[];
 const defs=`<defs>${catalog.map((v,i)=>`<marker id="route-arrow-${i}" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1L7 4L1 7Z" fill="${v.color}"/></marker>`).join('')}</defs>`;
 const overviewRouteMarkup=segments.map(s=>{
  const a=byId[s.edge.source],b=byId[s.edge.target];if(!a||!b)return '';
  let p=point(a),q=point(b);const reverse=s.directions.length===1&&s.directions[0]===-1;if(reverse)[p,q]=[q,p];
  const dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length,offset=s.offset*(reverse?-1:1);
  const margin=Math.min(14,length*.15),start=[p[0]+ux*margin,p[1]+uy*margin],end=[q[0]-ux*margin,q[1]-uy*margin];
  const path=`M${start[0]},${start[1]} Q${(p[0]+q[0])/2-uy*offset*2},${(p[1]+q[1])/2+ux*offset*2} ${end[0]},${end[1]}`;
  const task=s.tasks.find(t=>t.task_id===opts.selectedTask)||s.tasks[0],index=catalog.findIndex(v=>v.id===s.vehicle_id);
  return `<g class="geo-task-route ${s.selected?'selected-route':''}" data-route-vehicle="${esc(s.vehicle_id)}" data-route-task="${esc(task.task_id)}"><title>${esc(s.code)} · ${s.tasks.map(t=>esc(t.code)).join(' / ')} · ${s.shared>1?s.shared+' 台平台共用通道 · ':''}${s.directions.length>1?'含双向任务':'任务方向'}</title>${s.selected?`<path d="${path}" fill="none" stroke="#fff" stroke-width="6" stroke-opacity=".88"/>`:''}<path class="geo-route-stroke" d="${path}" fill="none" stroke="${s.color}" stroke-width="${s.selected?3.3:2.2}" stroke-opacity="${s.selected?1:.8}" ${s.edge.transport_mode==='sea'?'stroke-dasharray="9 5"':''} ${s.directions.length===1?`marker-end="url(#route-arrow-${index})"`:''}/></g>`;
 }).join('');
 const routeLine=(path,clazz)=>path?.length>1?`<polyline class="${clazz}" points="${path.map(n=>point(n).join(',')).join(' ')}"/>`:'';
 let routeMarkup=defs+overviewRouteMarkup;
 if(showNetwork&&view&&visible('routes')){
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
 const dropGlyph='<g class="geo-drop-marker" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M-8 24a8 8 0 0 1 16 0Z M-8 24l6 9M8 24l-6 9M0 24v9"/><rect x="-3" y="33" width="6" height="5" rx="1" fill="#fff"/></g>';
 // Actual traversed portion of each flight, from the same snapshot clock.
 if(!focus&&visible('routes'))for(const v of positions){
  if(v.status!=='in_transit')continue;
  const task=plan?.assignment_data?.find(a=>a.task_id===v.task_id),origin=byId[task?.origin];
  if(!origin)continue;
  const p=point(origin),q=point(v),color=catalog.find(c=>c.id===v.vehicle_id)?.color||'#367ba1';
  routeMarkup+=`<line class="geo-flight-trail" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${color}" stroke-width="4" stroke-opacity=".55"/>`;
 }
 const selectedVehicle=positions.find(v=>v.vehicle_id===opts.selectedVehicle);
 const actorPosition=view?view.position:selectedVehicle;
 const hasActor=actorPosition&&(geographic?Number.isFinite(actorPosition.lat)&&Number.isFinite(actorPosition.lon):Number.isFinite(actorPosition.x)&&Number.isFinite(actorPosition.y));
 const actorPoint=hasActor?point(actorPosition):null;
 const occupied=actorPoint?[{x:actorPoint[0]-25,y:actorPoint[1]-29,w:160,h:65}]:[];
 const labelWidth=text=>[...text].reduce((sum,c)=>sum+(/[\u2e80-\uffff]/.test(c)?14:8),16);
 const important=new Set(assignment?.path_nodes||[]);
 const priority=n=>n.id===assignment?.destination?0:n.id===assignment?.origin?1:n.id===view?.departure?.id?2:important.has(n.id)?3:4;
 const ordered=nodes.slice().sort((a,b)=>priority(a)-priority(b));
 const nodeMarkup=showNetwork&&visible('facilities')?ordered.map(n=>{
  const [x,y]=point(n),c=colors[n.category]||'#4584a9';if(x< -40||y< -40||x>w+40||y>h+40)return '';
  const pickup=n.id===assignment?.origin,drop=n.id===assignment?.destination,departure=n.id===view?.departure?.id&&!pickup;
  const endpoint=Boolean(view&&(pickup||drop||departure));
  const displayLabel=shipmentNodes.size?shipmentNodes.has(n.id):!focus||endpoint||n.id===view?.next?.id;
  let label='';let displayName=city?.id==='national'?n.name.replace(/^[^·]+·/,'').replace(/应急空投区/g,'空投区').replace(/接收区/g,'接收区'):n.name;if(['','城市','首都'].includes(displayName))displayName=n.name.split('·')[0];const text=(view?(drop?'交付 · ':pickup?'取货 · ':departure?'出发 · ':''):'')+displayName,width=labelWidth(text);
  if(visible('labels')&&displayLabel){
   const candidates=[{x:x+17,y:y-14},{x:x-width-17,y:y-14},{x:x-width/2,y:y+21},{x:x-width/2,y:y-46},{x:x-width/2,y:y+55},{x:x+17,y:y+17},{x:x-width-17,y:y+17}];
   const box=candidates.find(b=>b.x>padding.left+6&&b.y>padding.top+6&&b.x+width<w-padding.right-12&&b.y+28<h-padding.bottom-6&&!occupied.some(o=>b.x<o.x+o.w+5&&b.x+width+5>o.x&&b.y<o.y+(o.h||28)+5&&b.y+33>o.y));
   if(box){occupied.push({...box,w:width,h:28});label=`<rect class="geo-node-label-bg ${endpoint?'endpoint':''}" x="${box.x}" y="${box.y}" width="${width}" height="28" rx="4"/><text class="geo-node-label" x="${box.x+8}" y="${box.y+19}">${esc(text)}</text>`;}
  }
  const marker=endpoint?`<circle cx="${x}" cy="${y}" r="13" fill="${drop?'#277768':'#245b85'}" stroke="#fff" stroke-width="3"/><text class="geo-endpoint-glyph" x="${x}" y="${y+5}" text-anchor="middle">${drop?'送':pickup?'取':'始'}</text>`:`<circle cx="${x}" cy="${y}" r="${focus?4:6}" fill="${n.status==='online'?c:'#89949f'}" stroke="#fff" stroke-width="2" opacity="${focus?.55:1}"/>`;
  return `<g class="geo-pin" data-node="${esc(n.id)}" role="button" tabindex="0" aria-label="设施 ${esc(n.name)}"><title>${esc(n.name)}</title>${marker}${label}</g>`;
 }).join(''):'';
 let units='';if(showNetwork&&visible('formations'))for(const u of opts.formations||[]){const n=byId[u.deploy_node];if(!n)continue;const [x,y]=point(n),v=fleet.find(v=>v.id===u.vehicle_id);units+=`<g><rect x="${x-5}" y="${y-25}" width="12" height="12" rx="3" fill="#2b7fbe" stroke="#fff" stroke-width="2"/><title>${esc(v?.code||u.vehicle_id)}</title>${visible('labels')&&camera.zoom>=7?`<text x="${x+10}" y="${y-17}" fill="#1b5c96" font-size="12">${esc(v?.code||u.vehicle_id)}</text>`:''}</g>`;}
 const glyph=v=>v?.category==='ship'?'<path d="M-10 1L-6 7H6L10 1Z M-6 1V-5H6V1 M0-5V-9 M-9 10q3-3 6 0t6 0t6 0"/>':v?.category==='drone'?'<path d="M-7 0h14M0-7v14M-5-5l10 10M5-5l-10 10"/><circle cx="-6" cy="-6" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="6" cy="-6" r="3"/><circle cx="-6" cy="6" r="3"/>':'<rect x="-8" y="-6" width="11" height="9" rx="1"/><path d="M3-3h4l4 4v3H3"/><circle cx="-5" cy="6" r="2"/><circle cx="7" cy="6" r="2"/>';
 const groups=new Map();let moving='';
 if(showNetwork&&!focus)for(const v of positions){
  if(shipmentVehicles.size&&!shipmentVehicles.has(v.vehicle_id))continue;
  if(v.vehicle_id===opts.selectedVehicle&&hasActor)continue;
  if((geographic&&(!Number.isFinite(v.lat)||!Number.isFinite(v.lon)))||(!geographic&&(!Number.isFinite(v.x)||!Number.isFinite(v.y))))continue;
  const [x,y]=point(v),key=v.status==='in_transit'?v.vehicle_id:`${Math.round(x/22)}:${Math.round(y/22)}`;
  if(!groups.has(key))groups.set(key,{x,y,vehicles:[]});groups.get(key).vehicles.push(v);
 }
 for(const group of groups.values()){
  const {x,y,vehicles}=group,v=vehicles[0],stage=flightStage(v),c=vehicles.some(v=>v.status==='failed')?'#b55148':catalog.find(c=>c.id===v.vehicle_id)?.color||'#557f98';
  moving+=`<g class="geo-moving geo-other-vehicle flight-${stage}" data-replay-vehicle="${esc(v.vehicle_id)}" data-fleet-key="${esc(v.vehicle_id)}" data-active="${v.status==='in_transit'}" data-x="${x}" data-y="${y}" role="button" tabindex="0" aria-label="查看平台 ${esc(v.code)}${vehicles.length>1?'，此处共 '+vehicles.length+' 台平台':''}"><title>${vehicles.map(v=>esc(v.code)+' · '+FLIGHT_LABELS[flightStage(v)]).join(' / ')}</title><circle r="13" fill="#fff" stroke="${c}" stroke-width="1.5"/>${vehicles.length>1?`<text y="5" text-anchor="middle" class="geo-cluster-count">${vehicles.length}</text>`:`<g fill="none" stroke="${c}" stroke-width="1.4">${glyph(v)}</g>${stage==='release'?dropGlyph:''}`}</g>`;
 }
 svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
 // Keep the selected actor connected to the SVG so its position interpolates smoothly.
 if(!svg.querySelector('[data-map-layer="network"]'))svg.innerHTML='<g data-map-layer="network"></g><g data-map-layer="route"></g><g data-map-layer="nodes"></g><g data-map-layer="fleet"></g><g data-map-layer="actor"></g>';
 svg.querySelector('[data-map-layer="network"]').innerHTML=(!geographic&&showNetwork?`<rect class="geo-legacy-frame" x="${legacy.x}" y="${legacy.y}" width="${legacy.w}" height="${legacy.h}" rx="12"/><text class="geo-legacy-title" x="${legacy.x+16}" y="${legacy.y+25}">相对位置示意</text>`:'')+edgeMarkup;
 svg.querySelector('[data-map-layer="route"]').innerHTML=routeMarkup;
 svg.querySelector('[data-map-layer="nodes"]').innerHTML=nodeMarkup;
 const fleetLayer=svg.querySelector('[data-map-layer="fleet"]');
 if(!fleetLayer.querySelector('[data-fleet-units]'))fleetLayer.innerHTML='<g data-fleet-units></g><g data-fleet-actors></g>';
 fleetLayer.querySelector('[data-fleet-units]').innerHTML=units;
 const fleetActors=fleetLayer.querySelector('[data-fleet-actors]'),templates=document.createElementNS('http://www.w3.org/2000/svg','g');templates.innerHTML=moving;
 if(!fleetActors.querySelector('[data-airborne]'))fleetActors.innerHTML='<g data-idle-fleet></g><g data-airborne></g>';
 const oldActors=new Map([...fleetActors.querySelectorAll('[data-fleet-key]')].map(n=>[n.dataset.fleetKey,n]));
 const projection=[key,camera.zoom,Math.round(left),Math.round(top)].join(':');
 for(const template of [...templates.children]){
  const id=template.dataset.fleetKey;let actor=oldActors.get(id);oldActors.delete(id);
  if(!actor){actor=template;}else{
   if(actor.innerHTML!==template.innerHTML)actor.innerHTML=template.innerHTML;
   actor.setAttribute('class',template.getAttribute('class'));actor.setAttribute('aria-label',template.getAttribute('aria-label'));
  }
  const bucket=fleetActors.querySelector(template.dataset.active==='true'?'[data-airborne]':'[data-idle-fleet]');if(actor.parentNode!==bucket)bucket.append(actor);
  actor.style.transition=opts.animate&&actor.dataset.projection===projection?'transform 500ms linear':'none';
  actor.style.transform=`translate(${template.dataset.x}px,${template.dataset.y}px)`;actor.dataset.projection=projection;
 }
 for(const actor of oldActors.values())actor.remove();
 const actorLayer=svg.querySelector('[data-map-layer="actor"]');
 if(showNetwork&&hasActor&&selectedVehicle){
  const [x,y]=actorPoint,c=selectedVehicle.status==='failed'?'#b55148':selectedVehicle.status==='delivered'?'#277768':'#245b85';
  let actor=actorLayer.firstElementChild;
  if(!actor||actor.dataset.replayVehicle!==selectedVehicle.vehicle_id){actorLayer.innerHTML=`<g class="geo-moving is-selected" data-replay-vehicle="${esc(selectedVehicle.vehicle_id)}" role="button" tabindex="0" aria-label="查看平台 ${esc(selectedVehicle.code)}"></g>`;actor=actorLayer.firstElementChild;}
  const plateWidth=Math.max(96,labelWidth(selectedVehicle.code)),plateX=x+plateWidth+35<w?25:-plateWidth-25;
  const stage=flightStage(selectedVehicle);actor.dataset.flightStage=stage;
  const actorMarkup=`<title>${esc(selectedVehicle.code)} · ${FLIGHT_LABELS[stage]}</title><circle r="25" fill="${c}" fill-opacity=".13"/><circle r="17" fill="#fff" stroke="${c}" stroke-width="3"/><g fill="none" stroke="${c}" stroke-width="1.7">${glyph(selectedVehicle)}</g>${stage==='release'?dropGlyph:''}<rect x="${plateX}" y="-14" width="${plateWidth}" height="28" rx="4" fill="${c}"/><text class="geo-actor-label" x="${plateX+plateWidth/2}" y="5" text-anchor="middle">${esc(selectedVehicle.code)}</text><text class="geo-flight-label" x="${plateX+plateWidth/2}" y="31" text-anchor="middle">${FLIGHT_LABELS[stage]}</text>`;
  if(actor._flightMarkup!==actorMarkup){actor.innerHTML=actorMarkup;actor._flightMarkup=actorMarkup;}
  actor.style.transition=opts.animate&&actor.dataset.projection===projection?'transform 500ms linear':'none';
  actor.dataset.projection=projection;actor.style.transform=`translate(${x}px,${y}px)`;
 }else actorLayer.innerHTML='';
 el.querySelector('#geo-city-name').textContent=geographic?`${city?.name||'方案快照'} · 行动区域`:`${opts.historical?'方案快照':city?.name||'演示区'} · 任务路网`;
 el.querySelector('#geo-system').textContent=geographic?'区域参考':opts.home?'中国全图':'SYNTHETIC XY';
 el.querySelector('#geo-coords').textContent=geographic?`${camera.center[0].toFixed(4)}°N, ${camera.center[1].toFixed(4)}°E · Z${camera.zoom}`:'相对坐标网格';
 el.querySelector('.geo-attribution').hidden=false;
 saved={network,city,plan,opts};
 const redraw=()=>renderGeoMap(saved.network,saved.city,saved.plan,saved.opts);
 const shell=el.closest('.geo-shell'),summary=shell.querySelector('#geo-map-summary'),scopeSelect=shell.querySelector('#geo-route-scope');
 summary.innerHTML=`<b>${nodes.length}</b> 设施 <span>·</span> <b>${edges.length}</b> 通道 <span>·</span> <b>${plan?.assignment_data?.length||0}</b> 任务`;
 scopeSelect.value=focus?'task':scope;scopeSelect.disabled=focus||!catalog.length;scopeSelect.querySelector('[value="vehicle"]').disabled=!opts.selectedVehicle;scopeSelect.querySelector('[value="task"]').disabled=!opts.selectedTask;scopeSelect.querySelector('[value="shipment"]').disabled=!opts.selectedShipment;scopeSelect.querySelector('[value="shipment"]').hidden=network?.network_id==='civil-airdrop';
 scopeSelect.onchange=()=>{opts.routeScope=scopeSelect.value;if(opts.onRouteScope)opts.onRouteScope(opts.routeScope);else redraw();};
 shell.querySelector('#geo-route-legend').innerHTML=catalog.map(v=>`<button data-route-key="${esc(v.id)}" class="${opts.selectedVehicle===v.id?'active':''}" style="--route-color:${v.color}" aria-pressed="${opts.selectedVehicle===v.id}" title="查看 ${esc(v.code)} 的 ${v.assignments.length} 项任务"><i></i>${esc(v.code)}<small>${v.assignments.length} 项</small></button>`).join('');
 const selectRoute=(vehicleId,taskId)=>{if(opts.onSelectTask&&taskId){opts.onSelectTask(taskId);return;}if(opts.onSelectVehicle){opts.onSelectVehicle(vehicleId);return;}opts.selectedVehicle=vehicleId;opts.selectedTask=taskId||catalog.find(v=>v.id===vehicleId)?.assignments[0]?.task_id;redraw();};
 shell.querySelectorAll('[data-route-key]').forEach(b=>b.onclick=()=>selectRoute(b.dataset.routeKey));
 el.querySelectorAll('[data-route-task]').forEach(g=>g.onclick=e=>{e.stopPropagation();selectRoute(g.dataset.routeVehicle,g.dataset.routeTask);});

 el.querySelectorAll('[data-node]').forEach(g=>g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();g.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
 el.querySelectorAll('[data-replay-vehicle]').forEach(g=>{g.onclick=e=>{e.stopPropagation();opts.onSelectVehicle?.(g.dataset.replayVehicle);};g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();opts.onSelectVehicle?.(g.dataset.replayVehicle);}};});
 let dragging=false;
 const scheduleRedraw=()=>{if(el._redraw)return;el._redraw=requestAnimationFrame(()=>{el._redraw=0;redraw();});};
 el.onpointerdown=e=>{if(e.target.closest('button,a,[data-node],[data-replay-vehicle],[data-route-task],[data-map-city]'))return;el.setPointerCapture(e.pointerId);dragging=true;el._drag={x:e.clientX,y:e.clientY,project:center};el.style.cursor='grabbing';};
 el.onpointermove=e=>{if(!el._drag)return;const dx=e.clientX-el._drag.x,dy=e.clientY-el._drag.y;camera.center=inverse(el._drag.project[0]-dx,el._drag.project[1]-dy,camera.zoom);scheduleRedraw();};
 el.onpointerup=el.onpointercancel=()=>{dragging=false;el._drag=null;el.style.cursor='grab';};
 el.onwheel=e=>{if(e.target.closest('button,select,a'))return;e.preventDefault();const rect=el.getBoundingClientRect(),x=e.clientX-rect.x,y=e.clientY-rect.y,geo=inverse(left+x,top+y,camera.zoom);camera.zoom=Math.max(2,Math.min(17,camera.zoom+(e.deltaY<0?.25:-.25)));const anchor=mercator(...geo,camera.zoom);camera.center=inverse(anchor[0]-x+cx,anchor[1]-y+cy,camera.zoom);scheduleRedraw();};
 el.querySelectorAll('[data-map]').forEach(button=>button.onclick=e=>{e.stopPropagation();if(button.dataset.map==='fit')fit();else if(button.dataset.map==='nation'){camera.basemap='vector';fit(true);}else camera.zoom=Math.max(2,Math.min(17,camera.zoom+(button.dataset.map==='in'?.5:-.5)));redraw();});
 el.querySelectorAll('[data-basemap]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.basemap===camera.basemap));button.onclick=()=>{camera.basemap=button.dataset.basemap;redraw();};});
 el.querySelectorAll('[data-map-city]').forEach(button=>button.onclick=()=>{if(button.dataset.mapCity===city?.id){fit();redraw();}else opts.onCity?.(button.dataset.mapCity);});
 el.onkeydown=e=>{if(e.target!==el)return;const directions={ArrowLeft:[-70,0],ArrowRight:[70,0],ArrowUp:[0,-70],ArrowDown:[0,70]};if(directions[e.key]){e.preventDefault();const [x,y]=directions[e.key];camera.center=inverse(center[0]+x,center[1]+y,camera.zoom);redraw();}if(e.key==='Home'){e.preventDefault();fit(true);redraw();}};
}

function mapPadding(w,h,opts){
 if(opts.home)return w<760?{left:18,right:18,top:25,bottom:h*.57}:{left:Math.min(530,w*.55),right:30,top:70,bottom:40};
 if(document.body.classList.contains('map-panels-hidden'))return {left:30,right:60,top:w<760?295:220,bottom:110};
 if(w<760){const assessment=document.body.classList.contains('workspace-has-assessment');return {left:18,right:48,top:assessment?295:210,bottom:assessment&&document.body.dataset.mobilePane==='map'?110:assessment?h*.44:h*.49+60};}
 if(document.body.classList.contains('workspace-has-assessment')){
  const immersive=document.body.classList.contains('map-immersive');
  if(w<=1150)return {left:30,right:60,top:immersive?200:330,bottom:document.body.dataset.mobilePane==='map'?110:h*.35+110};
  const openRight=['workspace-show-inspector','workspace-show-events','workspace-show-fleet','workspace-show-shipments'].some(key=>document.body.classList.contains(key));
  const stats=document.body.classList.contains('workspace-show-stats'),legend=document.body.classList.contains('workspace-show-legend');
  return {left:document.body.classList.contains('workspace-hide-schedule')?35:365,right:openRight?365:60,top:immersive?h<850?186:201:h<850?254:280,bottom:(stats?315:135)+(legend?95:0)};
 }
 return {left:document.body.classList.contains('workspace-sheet-wide')?Math.min(w*.67,920):Math.min(500,w*.42),right:70,top:190,bottom:120};
}

const featureBounds=new WeakMap();
function renderBoundaries(data,project,w,h,zoom){
 if(!data)return '';
 const fills=['#eef3eb','#e7efeb','#f2f3e8','#e9f0ef','#edf2ee'];
 let labels='';
 const paths=data.features.map((f,index)=>{
  const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  if(!featureBounds.has(f)){const all=polygons.flat(2);featureBounds.set(f,{min:[Math.min(...all.map(p=>p[0])),Math.min(...all.map(p=>p[1]))],max:[Math.max(...all.map(p=>p[0])),Math.max(...all.map(p=>p[1]))]});}
  const bounds=featureBounds.get(f),a=project(bounds.min),b=project(bounds.max);
  if(Math.max(a[0],b[0])<0||Math.min(a[0],b[0])>w||Math.max(a[1],b[1])<0||Math.min(a[1],b[1])>h)return '';
  const path=polygons.map(p=>p.map(r=>r.map((n,i)=>{const p=project(n);return `${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;}).join('')+'Z').join('')).join('');
  const center=f.properties.centroid||f.properties.center;if(center){const p=project(center);if(p[0]>15&&p[0]<w-20&&p[1]>30&&p[1]<h-25)labels+=`<text class="geo-region-label" x="${p[0]}" y="${p[1]}" text-anchor="middle">${esc(f.properties.name)}</text>`;}
  return `<path d="${path}" fill="${fills[index%fills.length]}" fill-rule="evenodd" stroke="#b4c9cf" stroke-width="${zoom>7?1.1:.8}"/>`;
 }).join('');
 return paths+labels;
}

function renderCityReferences(cities,project,zoom,interactive=true){
 if(zoom>=7)return '';
 return cities.filter(c=>c.id!=='national').map(c=>{const p=project([c.center[1],c.center[0]]);return `<g class="geo-city-reference" data-map-city="${esc(c.id)}" ${interactive?`role="button" tabindex="0" aria-label="切换到${esc(c.name)}地理路网"`:""}><circle cx="${p[0]}" cy="${p[1]}" r="5"/><circle cx="${p[0]}" cy="${p[1]}" r="12" fill-opacity=".12"/><text x="${p[0]+12}" y="${p[1]+5}">${esc(c.name)}</text></g>`;}).join('');
}

export function mapCommand(action){if(!saved)return;if(action==='fit')camera.key='';renderGeoMap(saved.network,saved.city,saved.plan,saved.opts);}
