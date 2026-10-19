/** Tiny dependency-free Web-Mercator/OSM map viewer. WGS84 landmarks, synthetic graph links.
 * Not navigation, positioning, or road traffic data. OSM standard raster tiles require internet.
 */
import {esc} from './charts.js';
let camera={city:'',center:[30.583,114.315],zoom:11};
const project=(lat,lon,z)=>{const n=256*2**z;const s=Math.min(.9999,Math.max(.0001,Math.sin(lat*Math.PI/180)));return [(lon+180)/360*n,(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n];};
const unproject=(x,y,z)=>{const n=256*2**z;const lon=x/n*360-180;const lat=Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI;return [lat,lon];};
const color=c=>({hub:'#9df2bc',depot:'#72b5ff',critical:'#f5be70',command:'#d3bbff',delivery:'#54ddd6'})[c]||'#d5e2e8';
const symbolFor=c=>({hub:'H',depot:'D',critical:'!',command:'C',delivery:'P'})[c]||'•';
let cached={};
export function geoMapMarkup(){return `<div class="geo-shell"><div class="geo-map" id="geo-map" role="application" aria-label="中国城市开放街道地图，支持拖动与缩放"><div class="geo-grid"></div><div class="geo-tiles" id="geo-tiles"></div><svg class="geo-overlay" id="geo-overlay" aria-label="仿真节点和规划通道"></svg><div class="geo-city-label"><span class="signal-dot"></span><span id="geo-city-name">CITY MAP</span><small>WGS84 / OSM</small></div><div class="geo-controls"><button data-map="in" title="放大" aria-label="放大地图">+</button><button data-map="out" title="缩小" aria-label="缩小地图">−</button><button data-map="reset" title="定位城市" aria-label="返回城市中心">⌖</button></div><div class="geo-scale" id="geo-coords">等待地理数据...</div><div class="geo-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors</div></div><div class="map-legend"><span><i style="background:#9df2bc"></i>集散枢纽</span><span><i style="background:#72b5ff"></i>转运站</span><span><i style="background:#f5be70"></i>重点保障</span><span><b style="border-color:#c2fa7e"></b>规划路线</span><span class="map-note">地标坐标为近似示例位置 · 连线为仿真通道</span></div></div>`;}
export function renderGeoMap(network,city,plan,opts={}){
  const el=document.getElementById('geo-map');if(!el||!city)return;
  if(camera.city!==city.id){camera={city:city.id,center:city.center.slice(),zoom:city.zoom};}
  const w=el.clientWidth||800,h=el.clientHeight||520,tiles=el.querySelector('#geo-tiles'),svg=el.querySelector('#geo-overlay');
  const center=project(...camera.center,camera.zoom);const fromX=center[0]-w/2,fromY=center[1]-h/2;
  let html='';const minX=Math.floor(fromX/256),maxX=Math.ceil((fromX+w)/256),minY=Math.floor(fromY/256),maxY=Math.ceil((fromY+h)/256),maxTile=2**camera.zoom;
  for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)if(y>=0&&y<maxTile){
    const tileX=((x%maxTile)+maxTile)%maxTile;
    html+=`<img class="geo-tile" draggable="false" loading="lazy" alt="" style="left:${Math.round(x*256-fromX)}px;top:${Math.round(y*256-fromY)}px" src="https://tile.openstreetmap.org/${camera.zoom}/${tileX}/${y}.png" />`;
  }
  const tileKey=[camera.city,camera.zoom,Math.round(fromX),Math.round(fromY),w,h].join(':');
  if(tiles.dataset.key!==tileKey){tiles.innerHTML=html;tiles.dataset.key=tileKey;}
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  const point=n=>{const [x,y]=project(n.lat,n.lon,camera.zoom);return [x-fromX,y-fromY]};
  const byId=Object.fromEntries((network?.nodes||[]).map(n=>[n.id,n]));
  const routes=new Set(opts.routes?plan?.assignment_data?.flatMap(a=>a.path_edges)||[]:[]);
  for(const id of (opts.preview?.edges||[]))routes.add(id);
  const edges=(network?.edges||[]).map(e=>{const a=byId[e.source],b=byId[e.target];if(!a||!b)return '';const p=point(a),q=point(b);let active=routes.has(e.id);let stroke=e.status==='closed'?'#fa786e':active?'#c0f276':e.status==='restricted'?'#eab56f':'#4e9cba';return `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${stroke}" stroke-width="${active?4:2}" stroke-opacity="${active?1:.62}" ${e.status==='open'?'':'stroke-dasharray="7 6"'} />`;}).join('');
  const nodes=(network?.nodes||[]).map(n=>{const [x,y]=point(n);if(x < -70||y < -70||x>w+70||y>h+70)return '';const c=color(n.category);return `<g class="geo-pin" data-node="${esc(n.id)}"><circle cx="${x}" cy="${y}" r="17" fill="${c}" fill-opacity=".13"/><circle cx="${x}" cy="${y}" r="8" fill="#091b2e" stroke="${c}" stroke-width="2.4"/><text x="${x}" y="${y+3.2}" text-anchor="middle" font-size="9" font-weight="800" fill="${c}">${symbolFor(n.category)}</text><rect x="${x+12}" y="${y-13}" width="${n.name.length*12+12}" height="25" rx="5" fill="#08182a" fill-opacity=".86"/><text x="${x+18}" y="${y+4}" fill="#e5f0fc" font-size="12" font-weight="600">${esc(n.name)}</text></g>`;}).join('');
  let moving='';if(opts.minute!=null&&opts.run?.events){const records=new Map();for(const event of opts.run.events){if(event.kind==='position'&&event.at_min<=opts.minute)records.set(event.vehicle,event);}for(const [name,event] of records){const p=byId[event.node];if(!p)continue;const [x,y]=point(p);moving+=`<g><circle cx="${x}" cy="${y}" r="20" fill="#b9f366" opacity=".2"/><circle cx="${x}" cy="${y}" r="7" fill="#b9f366" stroke="#09222d" stroke-width="2"/><text x="${x+15}" y="${y-16}" fill="#b9f366" font-size="12">${esc(name)}</text></g>`;}}
  svg.innerHTML=edges+nodes+moving;
  el.querySelector('#geo-city-name').textContent=city.name+' · '+city.province;
  el.querySelector('#geo-coords').textContent=`${camera.center[0].toFixed(4)}°N, ${camera.center[1].toFixed(4)}°E  ·  Z${camera.zoom}`;
  cached={network,city,plan,opts};
  el.onpointerdown=e=>{if(e.target.closest('button,a,[data-node]'))return;el.setPointerCapture(e.pointerId);el._drag={x:e.clientX,y:e.clientY,start:center};el.style.cursor='grabbing';};
  el.onpointermove=e=>{if(!el._drag)return;const x=el._drag.start[0]-(e.clientX-el._drag.x),y=el._drag.start[1]-(e.clientY-el._drag.y);camera.center=unproject(x,y,camera.zoom);renderGeoMap(...Object.values(cached));};
  el.onpointerup=()=>{el._drag=null;el.style.cursor='grab';};
  el.onpointercancel=()=>{el._drag=null;el.style.cursor='grab';};
  el.querySelectorAll('[data-map]').forEach(button=>button.onclick=e=>{e.stopPropagation();const action=button.dataset.map;if(action==='reset'){camera.center=city.center.slice();camera.zoom=city.zoom;}else camera.zoom=Math.max(8,Math.min(15,camera.zoom+(action==='in'?1:-1)));renderGeoMap(...Object.values(cached));});
}
