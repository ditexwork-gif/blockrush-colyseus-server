// A lowered platform/ramp/stair cuts a rectangular pit from the default floor.
// Runtime maps translate the authored -6 m baseline to zero, preserving movement physics.
export function mapElevationOffset(map){return map.objects.some(o=>o.y<0&&['platform','ramp','stairs'].includes(o.type))?6:0}
export function groundParts(map){
 if(!mapElevationOffset(map))return [];
 let rectangles=[{left:-map.width/2,right:map.width/2,top:-map.depth/2,bottom:map.depth/2}];
 for(const o of map.objects.filter(o=>o.y<0&&['platform','ramp','stairs'].includes(o.type))){const a=o.rotation*Math.PI/180,w=Math.abs(Math.cos(a))*o.width+Math.abs(Math.sin(a))*o.depth,d=Math.abs(Math.cos(a))*o.depth+Math.abs(Math.sin(a))*o.width,cut={left:o.x-w/2,right:o.x+w/2,top:o.z-d/2,bottom:o.z+d/2};const next=[];
  for(const r of rectangles){const l=Math.max(r.left,cut.left),right=Math.min(r.right,cut.right),t=Math.max(r.top,cut.top),b=Math.min(r.bottom,cut.bottom);if(l>=right||t>=b){next.push(r);continue}if(r.left<l)next.push({...r,right:l});if(right<r.right)next.push({...r,left:right});if(r.top<t)next.push({left:l,right,top:r.top,bottom:t});if(b<r.bottom)next.push({left:l,right,top:b,bottom:r.bottom})}rectangles=next;
 }
 return rectangles.map((r,i)=>({id:'ground-'+i,type:'platform',x:(r.left+r.right)/2,z:(r.top+r.bottom)/2,y:-6,width:r.right-r.left,depth:r.bottom-r.top,height:6,rotation:0,color:'#b8b5a4'}));
}
