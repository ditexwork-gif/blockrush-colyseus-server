// BLOCKRIFT Map Kit colliders. Local space of each prefab: origin = ground centre, +x east, +z south (map convention), y = base height.
// Same fields as map objects: type block|ramp|ladder, x,y,z centre/base, width(x) depth(z) height(y), dir (ramp HIGH side: N=-z S=+z E=+x W=-x),
// rot = yaw in degrees (only where needed), shoot:false = blocks players but not bullets (see-through).
const B=(x,y,z,w,h,d,o={})=>({type:'block',x,y,z,width:w,height:h,depth:d,...o});
const R=(x,y,z,w,h,d,dir)=>({type:'ramp',x,y,z,width:w,height:h,depth:d,dir});
const L=(x,y,z,w,h,d)=>({type:'ladder',x,y,z,width:w,height:h,depth:d});
const COLLIDERS={
building:[B(0,0,0,8,6.5,6),B(0,6.5,3.2,8.4,.6,.2),B(-.8,6.5,-3.2,6.8,.6,.2),B(-4.1,6.5,0,.2,.6,6.4),B(4.1,6.5,0,.2,.6,6.4),R(-1.4,0,-3.7,8.4,6.5,1.2,'E'),B(3.4,0,-3.7,1.2,6.5,1.2)],
jersey:[B(-2.6,0,0,2.4,1.05,.9),B(0,0,0,2.4,1.05,.9),B(2.6,0,0,2.4,1.05,.9)],
sandbags:[B(-1.92,0,-.49,2.1,1.6,.7,{rot:-28.6}),B(0,0,0,2.1,1.6,.7),B(1.92,0,-.49,2.1,1.6,.7,{rot:28.6})],
ramp:[R(0,0,0,6,2.2,3,'E'),B(4,0,0,2,2.2,3)],
container:[B(0,0,0,6,.2,2.4),B(0,0,-1.15,6,2.6,.15),B(0,0,1.15,6,2.6,.15),B(-2.95,0,0,.15,2.6,2.4),B(0,2.4,0,6,.2,2.4),B(-1.6,.2,0,1.2,1,1)],
tower:[B(-1.3,0,-1.3,.25,5,.25),B(1.3,0,-1.3,.25,5,.25),B(-1.3,0,1.3,.25,5,.25),B(1.3,0,1.3,.25,5,.25),B(0,5,0,3.4,.25,3.4),B(0,5.25,1.65,3.4,1.1,.15),B(0,5.25,-1.65,3.4,1.1,.15),B(-1.65,5.25,0,.15,1.1,3.4),B(1.65,5.25,1.1,.15,1.1,1.1),B(1.65,5.25,-1.1,.15,1.1,1.1),L(1.75,0,0,.4,5.4,.8)],
catwalk:[B(-3.9,0,0,1.4,3.4,1.4),B(3.9,0,0,1.4,3.4,1.4),B(0,3.4,0,9,.25,1.8),B(0,3.65,-.85,9,1,.1),B(0,3.65,.85,9,1,.1),R(6.9,0,0,4.6,3.4,1.4,'W')],
crates:[B(0,0,0,2.4,.31,2.4),B(-.55,.31,-.55,1.1,1.1,1.1),B(.6,.31,-.5,1.1,1.1,1.1),B(-.5,.31,.6,1.1,1.1,1.1),B(0,1.41,-.2,1.1,1.1,1.1),B(3,0,1,2.4,.25,2.4,{rot:23}),B(3,.31,1,.9,.9,.9),B(-2.2,0,1.6,.7,1.2,.7),B(-2.4,0,-.6,.84,1.2,.84),B(-1.6,0,-1.5,.84,1.2,.84),B(-2.7,0,-2,1.2,.84,.84)],
wall:[...[-3.2,3.2].flatMap(cx=>[B(cx,0,0,3.6,1.6,.6),B(cx,2.1,0,3.6,1.2,.6),B(cx-1.25,1.6,0,1.1,.5,.6),B(cx+1.25,1.6,0,1.1,.5,.6),B(cx,3,0,3.6,.3,.8)]),B(-1.1,0,0,.6,1.2,.6),B(1.15,0,0,.5,.6,.6)],
hedgehog:[B(-2,0,0,1.6,1.5,1.6,{shoot:false}),B(0,0,.6,1.6,1.5,1.6,{shoot:false}),B(2,0,-.2,1.6,1.5,1.6,{shoot:false}),B(0,0,-1.4,1.1,.6,.7),B(1.1,0,-1.5,1.1,.6,.7)],
garage:[B(0,0,-3,7,4,.3),B(-3.35,0,0,.3,4,6),B(3.35,0,0,.3,4,6),B(0,4,0,7.4,.3,6.6),B(-2.9,0,3,1.2,4,.3),B(2.9,0,3,1.2,4,.3),B(0,2.4,3,4.6,1.6,.3),B(0,1.0,3.1,4.4,1.4,.15),B(-2,0,-1.8,1.2,1,.8),B(2.2,0,-1.9,.84,1.2,.84)],
hut:[B(0,0,0,5,2.8,4),B(0,2.8,0,5.4,.9,4.4),B(0,3.7,0,5.4,.8,2)],
bunker:[B(0,0,0,6,2.4,5),B(0,2.4,0,6.6,.5,5.6),B(-3.8,0,0,1.6,2.4,5),B(3.8,0,0,1.6,2.4,5),B(-.3,2.9,1.8,2.7,.35,.5)],
fueltank:[B(0,0,0,7.2,3.5,2.8),L(1.5,0,1.55,.6,3.8,.3)],
silos:[B(-1.8,0,0,3,7.5,3),B(1.8,0,0,3,7.5,3),B(0,5,0,2.3,.2,1)],
scaffold:[B(0,2.5,0,4.2,.15,2),B(0,5,0,4.2,.15,2),B(0,2.65,1,4,1,.08),B(0,2.65,-1,4,1,.08),B(0,5.15,1.05,4,1.4,.08),B(0,5.15,-1,4,1,.08),L(2.1,0,0,.4,5.3,.8)],
overpass:[B(-4.4,0,0,1.2,3.2,4),B(4.4,0,0,1.2,3.2,4),B(0,3.2,0,10,.6,4),B(0,3.8,-1.85,10,.6,.3),B(0,3.8,1.85,10,.6,.3),R(-8.5,0,0,7,3.8,4,'E'),B(0,0,0,2.4,1.05,.6)],
stairs:[R(-.275,0,0,4.4,3,2.6,'E'),B(3.425,0,0,3,3,2.6),B(3.425,3,1.25,3,1,.08)],
perch:[B(-1.8,0,-1.8,.35,3.5,.35),B(1.8,0,-1.8,.35,3.5,.35),B(-1.8,0,1.8,.35,3.5,.35),B(1.8,0,1.8,.35,3.5,.35),B(0,3.5,0,4,.3,4),B(0,3.8,-1.94,4,1,.12),B(-1.94,3.8,0,.12,1,4),B(0,3.8,1.96,4,1,.08),B(-.1,3.8,-1.4,2.7,.35,.5),L(2.1,0,0,.4,4.5,.8)],
stall:[B(0,0,.2,3.8,.9,1.6),B(0,2.45,0,3.9,.2,2.6),B(2.6,0,-.6,1,.6,.8)],
fence:[B(-4,0,0,4,2.2,.12,{shoot:false}),B(4,0,0,4,2.2,.12,{shoot:false})],
pipes:[...[-4,0,4].flatMap(x=>[B(x,0,-1,.3,3.6,.3),B(x,0,1,.3,3.6,.3)]),B(0,3.6,-.5,9,.7,.7),B(0,3.6,.5,9,.5,.5),B(0,2.1,0,9,.8,.8),B(0,2.05,.8,9,.4,.4)],
generator:[B(0,0,0,3.4,1.9,1.8),B(2.5,0,-.6,.6,.9,.6)],
car:[B(0,0,0,4.2,1.15,1.9),B(-.2,1.15,0,2.3,.75,1.75)],
trailer:[B(0,0,0,8,1.35,2.5),B(-2.4,1.35,0,2,1.1,2.2),B(-.1,1.35,0,2,1.1,2.2),B(2.2,1.35,0,2,1.1,2.2)],
tent:[B(0,0,0,5,1.6,4),B(0,1.6,0,5,1,2),B(0,0,2.6,2.7,.35,.5)],
billboard:[B(-2,0,0,.3,4,.3),B(2,0,0,.3,4,.3),B(0,4,0,6,2.6,.2),B(0,3.9,.4,6,.12,.6)],
arch:[B(-3.5,0,0,1.4,5,1.4),B(3.5,0,0,1.4,5,1.4),B(0,5,0,8.4,1,1.6)],
rocks:[B(0,0,0,2.6,1.9,2.6),B(2,0,1,1.8,1.3,1.8),B(-1.8,0,.3,1.6,1.2,1.6),B(.8,0,1.4,1.4,1.1,1.4),B(3.2,0,-.8,.9,.7,.9)],
cstack:[B(0,0,0,6,2.6,2.4),B(0,0,-2.5,6,2.6,2.4),B(0,2.6,-1.2,6,2.6,2.4),R(-5.375,0,.2,4.5,2.6,1.3,'E'),B(-2.9375,0,.2,.375,2.6,1.3),B(0,5.2,-.1,6,1,.08),L(2,2.6,.15,.8,2.7,.3)],
};

// ---- shared by client AND server (no THREE dependency) ----
export const KIT_SCALE = 1.2;
export const PREFAB_IDS = Object.keys(COLLIDERS);
export const PREFAB_META = {
building:['Two-storey building','buildings'],ramp:['Ramp + landing','movement'],container:['Open container','cover'],tower:['Sniper watchtower','high ground'],catwalk:['Catwalk bridge','high ground'],
jersey:['Jersey barriers','cover'],sandbags:['Sandbag wall','cover'],crates:['Crates + barrels','props'],wall:['Broken concrete wall','cover'],hedgehog:['Tank traps','cover'],
garage:['Garage','buildings'],hut:['Hut','buildings'],bunker:['Bunker','buildings'],fueltank:['Fuel tank','props'],silos:['Twin silos','props'],scaffold:['Scaffolding tower','high ground'],
overpass:['Overpass + underpass','movement'],stairs:['Stair block','movement'],perch:['Sniper perch','high ground'],stall:['Market stall','props'],fence:['Fence + gate','cover'],
pipes:['Pipe rack','props'],generator:['Generator','props'],car:['Car wreck','cover'],trailer:['Flatbed trailer','cover'],tent:['Army tent','props'],billboard:['Billboard','props'],
arch:['Gateway arch','buildings'],rocks:['Rock cluster','cover'],cstack:['Container stack + stairs','high ground']};
const DIRV={N:[0,-1],S:[0,1],E:[1,0],W:[-1,0]};
function dirFrom(dx,dz){if(Math.abs(dx)>Math.abs(dz))return dx>0?'E':'W';return dz>0?'S':'N';}
// Expand one map object {type:'prefab',prefab,x,y,z,rotation(0|90|180|270),scale?} into plain map objects the existing collision code understands.
// Rotation convention = three.js object.rotation.y = rotation°·π/180 (the renderer MUST use the same). Verify on DEV with the building stairs at all 4 rotations.
export function expandPrefab(obj){
 const list=COLLIDERS[obj.prefab];if(!list)return [];
 const s=(obj.scale||1)*KIT_SCALE;const r=((Math.round((obj.rotation||0)/90)*90)%360+360)%360;const t=r*Math.PI/180;const cs=Math.round(Math.cos(t)),sn=Math.round(Math.sin(t));
 return list.map((c,i)=>{const lx=c.x*s,lz=c.z*s;const x=lx*cs+lz*sn,z=-lx*sn+lz*cs;const swap=(r===90||r===270);
  const o={id:`${obj.id||'prefab'}#${i}`,type:c.type,x:obj.x+x,y:(obj.y||0)+c.y*s,z:obj.z+z,width:(swap?c.depth:c.width)*s,depth:(swap?c.width:c.depth)*s,height:c.height*s,rotation:((c.rot||0)+r)%360,name:`${obj.prefab} collider`,invisible:true,fromPrefab:obj.id};
  if(c.type==='ladder'){const [ex,ez]=['fueltank','cstack'].includes(obj.prefab)?[0,-1]:[-1,0];o.exitX=ex*cs+ez*sn;o.exitZ=-ex*sn+ez*cs;}
  if(c.type==='ramp'){const [dx,dz]=DIRV[c.dir];o.dir=dirFrom(dx*cs+dz*sn,-dx*sn+dz*cs);}
  if(c.shoot===false)o.shoot=false;if(c.rot)o.rotation=(c.rot+r)%360;return o;});
}
export { COLLIDERS };
