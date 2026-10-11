// Intersect the convex box/ramp in its authored local coordinates.
export function mapRayDistance(solid,origin,direction,maxDistance=220){
 const yaw=solid.yaw||0,c=Math.cos(yaw),s=Math.sin(yaw),dx=origin.x-solid.x,dz=origin.z-solid.z;
 const p={x:c*dx-s*dz,y:origin.y,z:s*dx+c*dz},v={x:c*direction.x-s*direction.z,y:direction.y,z:s*direction.x+c*direction.z};
 let near=0,far=maxDistance;
 const planes=[[1,0,0,solid.w/2],[-1,0,0,solid.w/2],[0,0,1,solid.d/2],[0,0,-1,solid.d/2],[0,-1,0,-solid.bottom]];
 if(solid.kind==='ramp'){
  const rise=solid.top-solid.bottom,dir=solid.dir||'N',east=['E','W'].includes(dir),sign=['E','S'].includes(dir)?1:-1,slope=sign*rise/(east?solid.w:solid.d);
  planes.push([east?-slope:0,1,east?0:-slope,solid.bottom+rise/2]);
 }else planes.push([0,1,0,solid.top]);
 for(const [x,y,z,limit] of planes){const distance=limit-(x*p.x+y*p.y+z*p.z),speed=x*v.x+y*v.y+z*v.z;if(Math.abs(speed)<1e-9){if(distance<0)return Infinity;continue;}const t=distance/speed;if(speed>0)far=Math.min(far,t);else near=Math.max(near,t);if(near>far)return Infinity;}
 return near<=maxDistance?near:Infinity;
}
