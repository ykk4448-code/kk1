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
 const key=`${city?.id||'snapshot'}:${geographic?'geo':'xy'}`;
 const w=el.clientWidth||800,h=el.clientHeight||450;
 function fit(){
  if(!geographic){camera.center=[50,50];camera.zoom=0;return;}
  const lats=nodes.map(n=>n.lat),lons=nodes.map(n=>n.lon);camera.center=[(Math.min(...lats)+Math.max(...lats))/2,(Math.min(...lons)+Math.max(...lons))/2];
  for(let zoom=15;zoom>=7;zoom--){const a=mercator(Math.min(...lats),Math.min(...lons),zoom),b=mercator(Math.max(...lats),Math.max(...lons),zoom);if(Math.abs(a[0]-b[0])<w*.74&&Math.abs(a[1]-b[1])<h*.72){camera.zoom=zoom;return;}}camera.zoom=7;
 }
 if(camera.key!==key){camera.key=key;fit();}
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
 const edgeMarkup=edges.map(e=>{const a=byId[e.source],b=byId[e.target];if(!a||!b)return '';const chosen=selectedEdges.has(e.id)&&visible('routes'),route=routeEdges.has(e.id);if(!visible('links')&&!chosen&&!route)return '';const p=point(a),q=point(b),stroke=e.status==='closed'?'#d95a58':chosen?'#286bdb':route?'#5799ba':e.status==='restricted'?'#cb9749':'#9dabb8';return `<g><line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="#fff" stroke-width="${chosen?7:4}" stroke-opacity=".85"/><line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${stroke}" stroke-width="${chosen?3.8:route?2.6:1.5}" stroke-opacity="${assignment && !chosen ? .5 : .9}" ${e.status==='open'?'':'stroke-dasharray="5 4"'}/></g>`;}).join('');
 const occupied=[];
 const important=new Set(assignment?.path_nodes||[]);
 const ordered=nodes.slice().sort((a,b)=>Number(important.has(b.id))-Number(important.has(a.id)));
 const nodeMarkup=visible('facilities')?ordered.map(n=>{
  const [x,y]=point(n),c=colors[n.category]||'#4584a9';if(x< -40||y< -40||x>w+40||y>h+40)return '';
  let label='';const width=n.name.length*11+12;
  if(visible('labels')){
   const candidates=[{x:x+10,y:y-12},{x:x+10,y:y+6},{x:x-width-10,y:y-12}];
   const box=candidates.find(b=>b.x>3&&b.y>40&&b.x+width<w-35&&b.y+22<h-32&&!occupied.some(o=>b.x<o.x+o.w+3&&b.x+width+3>o.x&&b.y<o.y+25&&b.y+25>o.y));
   if(box){occupied.push({...box,w:width});label=`<rect x="${box.x}" y="${box.y}" width="${width}" height="22" rx="3" fill="#fff" fill-opacity=".93"/><text x="${box.x+6}" y="${box.y+15}" fill="#384b61" font-size="11" font-weight="600">${esc(n.name)}</text>`;}
  }
  return `<g class="geo-pin" data-node="${esc(n.id)}" role="button" tabindex="0" aria-label="设施 ${esc(n.name)}"><title>${esc(n.name)}</title><circle cx="${x}" cy="${y}" r="11" fill="#fff" fill-opacity=".85"/><circle cx="${x}" cy="${y}" r="5" fill="${n.status==='online'?c:'#89949f'}" stroke="#fff" stroke-width="1.7"/>${label}</g>`;
 }).join(''):'';
 let units='';if(visible('formations'))for(const u of opts.formations||[]){const n=byId[u.deploy_node];if(!n)continue;const [x,y]=point(n),v=fleet.find(v=>v.id===u.vehicle_id);units+=`<g><rect x="${x-5}" y="${y-25}" width="12" height="12" rx="3" fill="#2b7fbe" stroke="#fff" stroke-width="2"/><text x="${x+10}" y="${y-17}" fill="#1b5c96" font-size="10">${esc(v?.code||u.vehicle_id)}</text></g>`;}
 const positions=opts.telemetry?.vehicles||[];
 const groups=new Map();let moving='';
 for(const v of positions){
  if((geographic&&(v.lat==null||v.lon==null))||(!geographic&&(v.x==null||v.y==null)))continue;
  let [x,y]=point(v);const clusterKey=`${Math.round(x/15)}:${Math.round(y/15)}`,offset=groups.get(clusterKey)||0;groups.set(clusterKey,offset+1);if(offset){x+=Math.cos(offset*2.4)*17;y+=Math.sin(offset*2.4)*17;}
  const chosen=opts.selectedVehicle===v.vehicle_id,c=v.status==='failed'?'#d95855':chosen?'#2169d2':'#1b9391';
  const glyph=v.category==='drone'?'<path d="M-7 0h14M0-7v14M-5-5l10 10M5-5l-10 10"/><circle cx="-6" cy="-6" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="6" cy="-6" r="3"/><circle cx="-6" cy="6" r="3"/>':'<rect x="-7" y="-5" width="10" height="8" rx="1"/><path d="M3-2h3l3 3v2H3"/><circle cx="-4" cy="5" r="2"/><circle cx="6" cy="5" r="2"/>';
  moving+=`<g class="geo-moving ${chosen?'is-selected':''}" data-replay-vehicle="${esc(v.vehicle_id)}" role="button" tabindex="0" aria-label="查看平台 ${esc(v.code)}"><title>${esc(v.code)} · ${esc(v.mission_code||'待命')} · ${v.current_speed_kmh} km/h</title><circle cx="${x}" cy="${y}" r="${chosen?22:16}" fill="${c}" fill-opacity=".13"/><circle cx="${x}" cy="${y}" r="12" fill="#fff" stroke="${c}" stroke-width="${chosen?2.7:1.6}"/><g transform="translate(${x} ${y})" fill="none" stroke="${c}" stroke-width="1.3">${glyph}</g>${chosen?`<rect x="${x-38}" y="${y+22}" rx="4" width="76" height="21" fill="${c}"/><text x="${x}" y="${y+36}" text-anchor="middle" fill="#fff" font-size="10" font-weight="700">${esc(v.code)}</text>`:''}</g>`;
 }
 svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.innerHTML=edgeMarkup+nodeMarkup+units+moving;
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
