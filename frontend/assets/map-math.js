export const geoProject=(lat,lon,z)=>{const size=256*2**z,s=Math.max(-.9999,Math.min(.9999,Math.sin(lat*Math.PI/180)));return [(lon+180)/360*size,(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*size];};
export const geoUnproject=(x,y,z)=>[Math.atan(Math.sinh(Math.PI*(1-2*y/(256*2**z))))*180/Math.PI,x/(256*2**z)*360-180];
export function fitGeographic(points,width,height,padding={left:20,right:20,top:20,bottom:20}){
 if(!points.length)return {center:[35,104],zoom:4};
 const projected=points.map(p=>geoProject(p.lat,p.lon,0)),xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1]);
 const bounds={left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
 const center=geoUnproject((bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2,0);
 const usableWidth=Math.max(80,width-padding.left-padding.right)*.82,usableHeight=Math.max(80,height-padding.top-padding.bottom)*.82;
 let zoom=2;
 for(let z=17;z>=2;z-=.25){if((bounds.right-bounds.left)*2**z<=usableWidth&&(bounds.bottom-bounds.top)*2**z<=usableHeight){zoom=z;break;}}
 return {center,zoom};
}
