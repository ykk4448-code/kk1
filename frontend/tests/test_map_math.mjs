import test from 'node:test';
import assert from 'node:assert/strict';
import {geoProject,geoUnproject,fitGeographic} from '../assets/map-math.js';
import {CHINA_MAP,CITY_MAPS} from '../assets/map-data.js';

test('projection round trips Wuhan, Shanghai and country extents',()=>{
 for(const point of [[30.58,114.3],[31.23,121.47],[54,135],[3,73]])for(const z of [3,5.25,11,16]){
  const round=geoUnproject(...geoProject(...point,z),z);assert.ok(Math.abs(round[0]-point[0])<1e-8);assert.ok(Math.abs(round[1]-point[1])<1e-8);
 }
});
test('fitting respects floating panels instead of centering behind them',()=>{
 const nodes=[{lat:30.48,lon:114.16},{lat:30.78,lon:114.45}],padding={left:330,right:310,top:280,bottom:260};
 const fitted=fitGeographic(nodes,1440,1000,padding),a=geoProject(nodes[0].lat,nodes[0].lon,fitted.zoom),b=geoProject(nodes[1].lat,nodes[1].lon,fitted.zoom);
 assert.ok(Math.abs(a[0]-b[0])<1440-padding.left-padding.right);assert.ok(Math.abs(a[1]-b[1])<1000-padding.top-padding.bottom);
});
test('pinned map includes provinces, Taiwan, Hong Kong, Macao and four city districts',()=>{
 const codes=new Set(CHINA_MAP.features.map(f=>f.properties.adcode));
 for(const code of [110000,420000,710000,810000,820000])assert.ok(codes.has(code));
 assert.equal(CHINA_MAP.features.length,35);
 for(const name of ['wuhan','shanghai','chengdu','shenzhen'])assert.ok(CITY_MAPS[name].features.length>=9);
});
test('the whole country fits above a mobile home sheet without clipping northern provinces',()=>{
 const points=[{lat:3,lon:73},{lat:54,lon:135}],padding={left:18,right:18,top:25,bottom:844*.57};
 const fit=fitGeographic(points,390,844,padding),center=geoProject(...fit.center,fit.zoom);
 const cx=(padding.left+390-padding.right)/2,cy=(padding.top+844-padding.bottom)/2;
 for(const p of points){const projected=geoProject(p.lat,p.lon,fit.zoom);const x=projected[0]-center[0]+cx,y=projected[1]-center[1]+cy;assert.ok(x>=padding.left&&x<=390-padding.right);assert.ok(y>=padding.top&&y<=844-padding.bottom);}
});
