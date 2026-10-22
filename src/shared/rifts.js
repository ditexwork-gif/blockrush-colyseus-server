// Shared deterministic portal rules. Rotation 0 faces -Z, matching player yaw.
export const RIFT_COLORS=['#ff6a1a','#2fd4e0','#c8f25a'];
export const riftYaw=r=>(r.rotation||0)*Math.PI/180;
export function riftLocal(r,p){const a=riftYaw(r),c=Math.cos(a),s=Math.sin(a),x=p.x-r.x,z=p.z-r.z;return {side:c*x-s*z,front:-s*x-c*z};}
export function riftPartner(r,rifts){const pair=rifts.filter(x=>x.pair===r.pair);return pair.length===2&&pair[0].end!==pair[1].end?pair.find(x=>x.id!==r.id):null;}
export function riftCanEnter(r,previous,input){const p=riftLocal(r,previous),h=previous.slide>0?1.2:1.8;return !!riftPartner(r,input.rifts||[])&&(previous.time||0)>=(previous.riftCooldownUntil||0)&&p.front>=.25-1e-6&&Math.abs(p.side)<.8&&previous.y+h/2>=r.y&&previous.y+h/2<=r.y+2.4;}
export function riftMovementSolids(previous,input){if(!input.rifts?.length)return input.solids;const pass=new Set(input.rifts.filter(r=>riftCanEnter(r,previous,input)).map(r=>r.id));return input.solids?.filter(s=>!s.riftSurface||!pass.has(s.riftSurface));}
export function traverseRifts(previous,next,input){
 if(!input.rifts?.length||(previous.time||0)<(previous.riftCooldownUntil||0))return next;
 for(const source of input.rifts){if(!riftCanEnter(source,previous,input))continue;const from=riftLocal(source,previous),to=riftLocal(source,next);if(to.front>=.25||to.front>=from.front)continue;
 const t=(from.front-.25)/(from.front-to.front),side=from.side+(to.side-from.side)*t,bodyY=previous.y+(next.y-previous.y)*t+(next.slide>0?.6:.9);if(Math.abs(side)>.8||bodyY<source.y||bodyY>source.y+2.4)continue;
 const dest=riftPartner(source,input.rifts),delta=riftYaw(dest)-riftYaw(source)+Math.PI,c=Math.cos(delta),s=Math.sin(delta),a=riftYaw(dest);
 return {...next,x:dest.x-Math.sin(a)*1.2,y:dest.y+(next.y-source.y),z:dest.z-Math.cos(a)*1.2,vx:c*next.vx+s*next.vz,vz:-s*next.vx+c*next.vz,yaw:(Number(input.yaw)||0)+delta,riftCooldownUntil:next.time+1,riftSerial:(previous.riftSerial||0)+1,riftFrom:source.id,riftTo:dest.id,riftColor:source.color};
 }return next;
}
// Editor warnings, including unobstructed spawn sight-lines and exit floor.
export function validateRifts(map,solids){
 const rifts=map.objects.filter(o=>o.type==='rift'),spawns=map.objects.filter(o=>o.type==='spawn'),warnings=[];
 const floor=(x,z,y)=>{if(y===0&&!map.objects.some(o=>o.y<0&&['platform','ramp','stairs'].includes(o.type)&&Math.abs(x-o.x)<o.width/2&&Math.abs(z-o.z)<o.depth/2))return true;return solids.some(s=>s.type!=='rift'&&s.kind!=='ladder'&&Math.abs(s.top-y)<.1&&Math.abs(Math.cos(s.yaw||0)*(x-s.x)-Math.sin(s.yaw||0)*(z-s.z))<=s.w/2&&Math.abs(Math.sin(s.yaw||0)*(x-s.x)+Math.cos(s.yaw||0)*(z-s.z))<=s.d/2);};
 const blocked=(x,z,y)=>solids.some(s=>s.type!=='rift'&&s.kind!=='ladder'&&s.bottom<y+1.8&&s.top>y+.55&&Math.abs(Math.cos(s.yaw||0)*(x-s.x)-Math.sin(s.yaw||0)*(z-s.z))<s.w/2+.33&&Math.abs(Math.sin(s.yaw||0)*(x-s.x)+Math.cos(s.yaw||0)*(z-s.z))<s.d/2+.33);
 if(new Set(rifts.map(r=>r.pair)).size>3)warnings.push('Maximum three rift pairs per map.');
 for(const r of rifts){const label=r.name||r.id;if(!riftPartner(r,rifts))warnings.push(label+': needs exactly one A and one B.');if(spawns.some(p=>Math.hypot(p.x-r.x,p.y-r.y,p.z-r.z)<12))warnings.push(label+': within 12 m of a spawn.');const a=riftYaw(r),fx=-Math.sin(a),fz=-Math.cos(a);
 let obstruction=false;for(let d=.5;d<=3;d+=.25)for(const side of [-.6,0,.6]){const x=r.x+fx*d+Math.cos(a)*side,z=r.z+fz*d-Math.sin(a)*side;if(Math.abs(x)>map.width/2-1||Math.abs(z)>map.depth/2-1||blocked(x,z,r.y)||!floor(x,z,r.y))obstruction=true;}if(obstruction)warnings.push(label+': needs 3 m of clear floor in front.');
 for(const p of spawns){const start={x:r.x+fx*1.2,z:r.z+fz*1.2},dx=p.x-start.x,dz=p.z-start.z;if(dx*fx+dz*fz<=0)continue;const steps=Math.ceil(Math.hypot(dx,dz)/.25);let occluded=false;for(let i=1;i<steps;i++){const t=i/steps;if(blocked(start.x+dx*t,start.z+dz*t,r.y+(p.y-r.y)*t)){occluded=true;break;}}if(!occluded){warnings.push(label+': exit has a direct view of a spawn.');break;}}
 }return warnings;
}
