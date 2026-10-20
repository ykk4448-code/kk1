/** Dependency-free SVG charts, accessible performance charts and interface iconography. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
const paths = {
  dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  database:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  rules:'<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>',
  route:'<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h5a5 5 0 0 0 5-5V8M6 6h6"/>',
  play:'<polygon points="8,5 19,12 8,19"/>',
  chart:'<path d="M3 20h18M5 16l5-6 4 3 6-8"/><circle cx="5" cy="16" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="14" cy="13" r="1"/><circle cx="20" cy="5" r="1"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  ship:'<path d="M2 12l3 7h14l3-7-10-4-10 4zM6 10V4h12v6M12 4V1M2 22q3-3 6 0t6 0t6 0"/>',
  truck:'<path d="M3 6h12v11H3zM15 10h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  activity:'<path d="M2 12h4l3-8 5 16 3-8h5"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 18v3h16v-3"/>',
  plus:'<path d="M12 4v16M4 12h16"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  refresh:'<path d="M21 11a9 9 0 0 0-15-6L3 8M3 3v5h5M3 13a9 9 0 0 0 15 6l3-3m0 5v-5h-5"/>',
  layers:'<path d="m12 2 9 5-9 5-9-5 9-5zm-9 10 9 5 9-5m-18 5 9 5 9-5"/>',
  link:'<path d="M10 13a5 5 0 0 0 8 .6l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-8-.6l-3 3a5 5 0 0 0 7 7l2-2"/>',
  settings:'<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8-3 2-2-2-3-3 1-2-2V3H9v3L7 8 4 7l-2 3 2 2-2 2 2 3 3-1 2 2v3h6v-3l2-2 3 1 2-3-2-2z"/>',
  cloud:'<path d="M7 18h12a4 4 0 0 0 0-8h-1a6 6 0 0 0-12-1 5 5 0 0 0 1 9z"/>',
  alert:'<path d="M12 3 2 21h20L12 3zm0 6v5m0 3v1"/>',
  file:'<path d="M5 2h10l5 5v15H5zM15 2v6h5M9 13h7M9 17h7"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  filter:'<path d="M3 5h18M6 12h12M10 19h4"/>',
  x:'<path d="M4 4l16 16M20 4 4 20"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',
};
export const icon = (name, size=16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.activity}</svg>`;
const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
export const num = (value, places=0)=> Number(value||0).toFixed(places);

export function gantt(assignments, limit=7) {
  if(!assignments?.length)return '<div class="empty">暂无运输方案，请先生成规划</div>';
  const selected=assignments.slice(0,limit);
  const max=Math.max(60,...assignments.map(a=>a.end_min))*1.08;
  const times=[0,1,2,3,4].map(i=>`<span>${Math.round(max*i/4)}m</span>`).join('');
  const rows=selected.map((a,i)=>{const left=clamp(a.start_min/max*100,0,100);const width=clamp(a.duration_min/max*100,1,100-left);
    return `<div class="gantt-row"><span class="gantt-name mono">${esc(a.code)}</span><div class="gantt-track"><div class="gantt-bar ${i%3===0?'lime':i%3===2?'orange':''}" style="left:${left}%;width:${width}%" title="${esc(a.vehicle_code)} · ${num(a.duration_min,1)} min"></div></div></div>`;
  }).join('');
  return `<div class="gantt"><div class="gantt-head"><span>任务序列</span><div class="gantt-axis">${times}</div></div>${rows}</div>`;
}

export function lineChart(samples) {
  if(!samples?.length)return '<div class="empty">尚无仿真统计样本</div>';
  const W=520,H=155,left=30,right=7,top=17,bottom=26,innerW=W-left-right,innerH=H-top-bottom;
  const data=samples.filter((_,i)=>i%Math.max(1,Math.floor(samples.length/55))===0);
  const points=(key)=>data.map((s,i)=>`${(left+i/Math.max(1,data.length-1)*innerW).toFixed(2)},${(top+innerH-clamp(s[key],0,100)/100*innerH).toFixed(2)}`).join(' ');
  const a=points('success_pct'),b=points('on_time_pct');
  const grids=[0,25,50,75,100].map(v=>{const y=top+innerH-v/100*innerH;return `<line x1="${left}" x2="${W-right}" y1="${y}" y2="${y}" stroke="#dbe5ef" stroke-dasharray="3 5" stroke-width=".6"/><text x="${left-9}" y="${y+3}" fill="#8296a9" font-size="9" text-anchor="end">${v}</text>`}).join('');
  const xlabels=[0,.25,.5,.75,1].map(v=>`<text x="${left+v*innerW}" y="${H-4}" text-anchor="middle" fill="#8296a9" font-size="9">${Math.round(v*(samples.length-1)+1)}</text>`).join('');
  return `<svg class="line-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="蒙特卡洛各轮次成功率和准点率折线图"><defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2e77bb" stop-opacity=".19"/><stop offset="1" stop-color="#2e77bb" stop-opacity="0"/></linearGradient></defs>${grids}<polygon points="${left},${top+innerH} ${a} ${W-right},${top+innerH}" fill="url(#areaGradient)"/><polyline points="${a}" fill="none" stroke="#2e77bb" stroke-width="2.4" stroke-linejoin="round"/><polyline points="${b}" fill="none" stroke="#19948f" stroke-width="1.8" stroke-dasharray="5 3" stroke-linejoin="round"/>${xlabels}</svg>`;
}
export function scoreDonut(score) {
  const value=clamp(Number(score)||0,0,100);
  const circumference=2*Math.PI*62;
  return `<svg viewBox="0 0 175 175" role="img" aria-label="综合评分 ${num(value,1)} 分"><circle cx="87.5" cy="87.5" r="62" stroke="#e5edf5" stroke-width="10" fill="none"/><circle cx="87.5" cy="87.5" r="62" stroke="#2e77bb" stroke-width="10" stroke-dasharray="${circumference*value/100} ${circumference}" stroke-linecap="round" fill="none" transform="rotate(-90 87.5 87.5)"/><circle cx="87.5" cy="87.5" r="49" stroke="#b5cce0" stroke-width=".75" fill="none" stroke-dasharray="2 4"/><text x="87.5" y="86" font-size="33" text-anchor="middle" fill="#2d5678" font-weight="800">${num(value,1)}</text><text x="87.5" y="105" text-anchor="middle" font-size="9" letter-spacing="2" fill="#88a4ab">SCORE / 100</text></svg>`;
}
export function compareBars(runs) {
  if (!runs?.length) return '<div class="empty">没有可对比的推演记录</div>';
  const metrics=[['score','综合评分',''],['on_time_pct','准点率','%'],['success_pct','成功率','%'],['fleet_utilization_pct','运力利用率','%']];
  return `<div style="display:grid;gap:20px;padding:6px 0 7px">${metrics.map(([key,label,suf])=>`<div><div class="field-title">${label}</div>${runs.map((r,i)=>`<div style="display:grid;grid-template-columns:105px 1fr 55px;align-items:center;gap:12px;margin:8px 0"><span class="mono" style="color:#87a0b0">${esc(r.id.slice(-11))}</span><div class="progress-rail"><span style="width:${clamp(r.metrics[key],0,100)}%;background:${['#2e77bb','#19948f','#7299bf','#c99249'][i%4]}"></span></div><b style="text-align:right;font-size:11px">${num(r.metrics[key],1)}${suf}</b></div>`).join('')}</div>`).join('')}</div>`;
}
