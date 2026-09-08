export const MOVE={groundAccel:12,groundFriction:7,airAccel:2.2,airCap:1.2,jumpVel:8.4,slideBoost:1.55,slideFriction:1.2,slideMin:.9,slideCooldown:.25,slideJumpKeep:1,softCap:1.9,bhopWindow:.12,gravity:23};

export const ARENA_SOLIDS=[];
function movementSolid(x,z,w,d,bottom,top){ARENA_SOLIDS.push({x,z,w,d,bottom,top})}
movementSolid(0,0,62,62,-1.2,0);for(const x of [-30,30])movementSolid(x,0,1,61,0,4);for(const z of [-30,30])movementSolid(0,z,61,1,0,4);
for(const [x,z,w,d,h] of [[-19,-19,14,13,8],[19,-20,13,11,10],[-21,17,10,16,7],[20,20,13,12,7.5]])movementSolid(x,z,w,d,0,h);
movementSolid(0,0,10,10,0,1.2);movementSolid(0,0,5,5,1.2,1.4);movementSolid(0,0,2.2,2.2,1.35,3.45);
for(let i=0;i<4;i++){movementSolid(0,7-i*.55,5,.56,0,(i+1)*.3);movementSolid(0,-7+i*.55,5,.56,0,(i+1)*.3)}
for(const [x,z] of [[-13,0],[13,1],[0,-20],[1,20]])movementSolid(x,z,7,4,0,3.3);
for(const [x,z,s=2,y=0] of [[-8,-10],[-10,-10],[-9,-10,1.7,2],[10,10,2.4],[13,10],[-20,6],[21,-9],[7,-20,1.8],[-7,21,1.7]])movementSolid(x,z,s,s,y,y+s);
for(const [x,z,w,d] of [[-9,10,5,1],[8,-9,5,1],[-22,-8,1,5],[23,5,1,5]])movementSolid(x,z,w,d,0,1.3);

export const DEPOT_SOLIDS=[];
function depotSolid(x,z,w,d,bottom,top){DEPOT_SOLIDS.push({x,z,w,d,bottom,top})}
depotSolid(0,0,62,62,-1.2,0);for(const x of [-30,30])depotSolid(x,0,1,61,0,4);for(const z of [-30,30])depotSolid(0,z,61,1,0,4);
for(const x of [-21,21]){depotSolid(x,0,11,34,0,4.2);for(let i=0;i<10;i++)depotSolid(x+(x<0?6.2:-6.2),-12+i*1.15,3,1.18,0,(i+1)*.39)}
for(const [x,z,w,d] of [[-8,-18,7,4],[8,18,7,4],[-7,12,4,7],[7,-12,4,7]])depotSolid(x,z,w,d,0,3.3);
for(const [x,z] of [[-8,-4],[8,4],[-7,24],[7,-24]])depotSolid(x,z,2.2,2.2,0,2.2);

const movementClamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function movementBlocked(x,z,r,y,h,solids){return solids.some(s=>s.top>y+.38&&s.bottom<y+h&&x+r>s.x-s.w/2&&x-r<s.x+s.w/2&&z+r>s.z-s.d/2&&z-r<s.z+s.d/2)}
function movementFloorAt(x,z,y,solids){let floor=0;for(const s of solids)if(s.top<=y+.39&&x+.27>s.x-s.w/2&&x-.27<s.x+s.w/2&&z+.27>s.z-s.d/2&&z-.27<s.z+s.d/2)floor=Math.max(floor,s.top);return floor}
function movementAccelerate(state,wishX,wishZ,wishSpeed,accel,dt){const current=state.vx*wishX+state.vz*wishZ,add=wishSpeed-current;if(add<=0)return;const amount=Math.min(accel*dt*wishSpeed,add);state.vx+=wishX*amount;state.vz+=wishZ*amount}
function movementFriction(state,friction,dt){const speed=Math.hypot(state.vx,state.vz);if(speed<.01){state.vx=state.vz=0;return}const scale=Math.max(speed-speed*friction*dt,0)/speed;state.vx*=scale;state.vz*=scale}

export function simulateMovement(previous,input,dt){
 const state={...previous,x:Number(previous.x)||0,y:Number(previous.y)||0,z:Number(previous.z)||0,vx:Number(previous.vx)||0,vy:Number(previous.vy)||0,vz:Number(previous.vz)||0,grounded:previous.grounded!==false,slide:Number(previous.slide)||0,slideCooldown:Number(previous.slideCooldown)||0,slideQueued:!!previous.slideQueued,landedAt:Number.isFinite(previous.landedAt)?previous.landedAt:-99,time:Number(previous.time)||0},solids=input.map==='depot'?DEPOT_SOLIDS:ARENA_SOLIDS;dt=movementClamp(Number(dt)||0,0,.05);state.time+=dt;state.slide=Math.max(0,state.slide-dt);state.slideCooldown=Math.max(0,state.slideCooldown-dt);
 let forward=movementClamp(Number(input.fwd)||0,-1,1),right=movementClamp(Number(input.right)||0,-1,1);const inputLength=Math.hypot(forward,right);if(inputLength>1){forward/=inputLength;right/=inputLength}
 const yaw=Number.isFinite(input.yaw)?input.yaw:0,speed=movementClamp(Number(input.speed)||8.2,4,12),base=speed*(input.sprint?1.38:1)*(input.aiming?.65:1);let wishX=-Math.sin(yaw)*forward+Math.cos(yaw)*right,wishZ=-Math.cos(yaw)*forward-Math.sin(yaw)*right;const wishLength=Math.hypot(wishX,wishZ);if(wishLength>0){wishX/=wishLength;wishZ/=wishLength}
 if(input.slidePressed){if(!state.grounded)state.slideQueued=true;else if(state.slideCooldown<=0){const current=Math.hypot(state.vx,state.vz);if(current>=2){const boosted=Math.min(current*MOVE.slideBoost,speed*MOVE.softCap);state.vx=state.vx/current*boosted;state.vz=state.vz/current*boosted;state.slide=MOVE.slideMin;state.slideCooldown=MOVE.slideCooldown}}}
 let sliding=state.slide>0;const justLanded=state.grounded&&state.time-(Number(state.landedAt)||-99)<MOVE.bhopWindow;
 if(state.grounded){if(!(input.jump&&justLanded))movementFriction(state,sliding?MOVE.slideFriction:MOVE.groundFriction,dt);if(!sliding&&wishLength>0)movementAccelerate(state,wishX,wishZ,base,MOVE.groundAccel,dt)}else if(wishLength>0)movementAccelerate(state,wishX,wishZ,Math.min(base,MOVE.airCap),MOVE.airAccel,dt);
 let horizontalSpeed=Math.hypot(state.vx,state.vz),cap=speed*MOVE.softCap;if(horizontalSpeed>cap){state.vx*=cap/horizontalSpeed;state.vz*=cap/horizontalSpeed}
 if(input.jump&&state.grounded){state.vy=MOVE.jumpVel;state.grounded=false;if(sliding){state.slide=0;state.vx*=MOVE.slideJumpKeep;state.vz*=MOVE.slideJumpKeep;sliding=false}}
 const height=state.slide>0?1.2:1.8,dx=state.vx*dt,dz=state.vz*dt;if(!movementBlocked(state.x+dx,state.z,.33,state.y,height,solids))state.x+=dx;else state.vx=0;if(!movementBlocked(state.x,state.z+dz,.33,state.y,height,solids))state.z+=dz;else state.vz=0;state.x=movementClamp(state.x,-29,29);state.z=movementClamp(state.z,-29,29);
 const oldY=state.y;state.vy=(Number(state.vy)||0)-MOVE.gravity*dt;state.y+=state.vy*dt;const floor=movementFloorAt(state.x,state.z,oldY,solids);if(state.y<=floor){if(!state.grounded)state.landedAt=state.time;state.y=floor;state.vy=0;state.grounded=true;if(state.slideQueued&&state.slideCooldown<=0){state.slideQueued=false;const current=Math.hypot(state.vx,state.vz);if(current>=2){const boosted=Math.min(current*MOVE.slideBoost,speed*MOVE.softCap);state.vx=state.vx/current*boosted;state.vz=state.vz/current*boosted;state.slide=MOVE.slideMin;state.slideCooldown=MOVE.slideCooldown}}}else state.grounded=false;
 return state;
}
