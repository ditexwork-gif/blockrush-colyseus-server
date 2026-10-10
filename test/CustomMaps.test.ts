import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
import {boot,type ColyseusTestServer} from '@colyseus/testing';
import {Client} from '@colyseus/sdk';
import app from '../src/app.config.js';
import {createStarterMap} from '../src/shared/map-schema.js';
import {networkMapIdentity} from '../src/shared/network-map.js';
import {mapRayDistance} from '../src/shared/map-ray.js';
import {simulateMovement} from '../src/shared/movement.js';

describe('Immutable multiplayer editor arenas',()=>{
 const secret='test-custom-map-secret-at-least-32-bytes',origin='https://dev.blockrift.io';
 let previous:string|undefined;
 function sdk(){const c=new Client(server.sdk.getHttpEndpoint('/'),{headers:{Origin:origin}}),iat=Math.floor(Date.now()/1000),payload=Buffer.from(JSON.stringify({aud:'blockrift-dev',origin,iat,exp:iat+120,jti:'custom-map-test'})).toString('base64url');c.auth.token=payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');return c;}
 let server:ColyseusTestServer<typeof app>;
 before(async()=>{previous=process.env.DEV_SESSION_SECRET;process.env.DEV_SESSION_SECRET=secret;server=await boot(app)});
 after(async()=>{await server.shutdown();if(previous===undefined)delete process.env.DEV_SESSION_SECRET;else process.env.DEV_SESSION_SECRET=previous});
 beforeEach(async()=>{await server.cleanup()});
 async function options(publicRoom=false){const p=await networkMapIdentity(createStarterMap());return {map:'custom',mode:'ffa',public:publicRoom,mapData:p.map,mapHash:p.mapHash};}
 it('transfers the same validated arena to a friend without relying on their saved map',async()=>{
  const opts=await options(),client=sdk();
  const host=await client.create('dev_blockrush',opts),friend=await client.joinById(host.roomId,{name:'FRIEND'});
  const a:any=await host.request('snapshot',{}),b:any=await friend.request('snapshot',{});
  assert.equal(a.room.map,'custom');assert.deepEqual(a.room.mapData,b.room.mapData);assert.equal(b.room.mapHash,opts.mapHash);
  const r:any=server.getRoomById(host.roomId);assert(r.arena.players.every((p:any)=>Math.abs(p.pose.x)>29||Math.abs(p.pose.z)>29));
  await host.request('start',{});assert.equal(r.arena.phase,'playing');assert.equal(r.arena.mapData.id,opts.mapData.id);
  await host.leave();await friend.leave();
 });
 it('Quick Play groups equal map revisions and separates different geometry',async()=>{
  const opts=await options(true),client=sdk();
  const a=await client.joinOrCreate('dev_blockrush',opts),b=await client.joinOrCreate('dev_blockrush',opts);
  assert.equal(a.roomId,b.roomId);
  const changed=structuredClone(opts.mapData);changed.name='Other arena';changed.objects.find((o:any)=>o.type==='crate').x+=3;
  const p=await networkMapIdentity(changed),c=await client.joinOrCreate('dev_blockrush',{...opts,mapData:p.map,mapHash:p.mapHash});
  assert.notEqual(a.roomId,c.roomId);assert.equal(server.getRoomById(a.roomId).metadata.mapHash,opts.mapHash);
  const listing:any=await (await fetch(server.sdk.getHttpEndpoint('/dev/rooms'),{headers:{Origin:origin,Authorization:'Bearer '+client.auth.token}})).json();assert(listing.rooms.some((r:any)=>r.map==='custom'&&r.mapHash===opts.mapHash));
  await a.leave();await b.leave();await c.leave();
 });
 it('rejects missing data, a forged checksum and invalid spawn geometry',async()=>{
  const opts=await options();await assert.rejects(()=>server.createRoom('blockrush',opts),/DEV-only/);await assert.rejects(()=>server.createRoom('dev_blockrush',{map:'custom'}));
  await assert.rejects(()=>server.createRoom('dev_blockrush',{...opts,mapHash:'0'.repeat(64)}));
  const bad=structuredClone(opts.mapData);bad.objects=bad.objects.filter((o:any)=>o.type!=='spawn');
  await assert.rejects(()=>server.createRoom('dev_blockrush',{...opts,mapData:bad}));
 });
 it('uses custom geometry for server movement, rotations, ramps and lowered floors',async()=>{
  const map=createStarterMap();map.objects.push({id:'lower-floor',type:'platform',x:0,y:-6,z:0,width:8,depth:8,height:1,rotation:0,color:'#b9ad96'});
  const p=await networkMapIdentity(map);assert.equal(p.offset,6);
  const moved=simulateMovement({x:40,y:6,z:0,vx:0,vy:0,vz:0,grounded:true},{map:'custom',...p,fwd:0,right:1,yaw:0,speed:8.2},1/60);
  assert(moved.x>40,'custom arena bounds are not clamped to built-in +/-29');
  const ramp={x:0,z:0,w:4,d:8,bottom:0,top:4,kind:'ramp',dir:'N',yaw:0};
  assert.equal(mapRayDistance(ramp,{x:0,y:3,z:3},{x:1,y:0,z:0}),Infinity,'ray above low end does not hit the ramp bounding box');
  assert.equal(mapRayDistance(ramp,{x:0,y:5,z:0},{x:0,y:-1,z:0}),3);
  assert.equal(mapRayDistance({x:0,z:0,w:2,d:8,bottom:0,top:4,yaw:Math.PI/2},{x:5,y:1,z:0},{x:-1,y:0,z:0}),1);
 });
 it('reconnects to the same map revision after actual socket loss',async()=>{
  const opts=await options(),client=sdk(),a:any=await client.create('dev_blockrush',opts);
  await new Promise(resolve=>setTimeout(resolve,5100));
  const done=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('reconnect timeout')),8000);a.onReconnect(()=>{clearTimeout(timer);resolve()})});
  const r:any=server.getRoomById(a.roomId);r.clients[0].ref.terminate();await done;
  const data:any=await a.request('snapshot',{});assert.equal(data.room.mapHash,opts.mapHash);assert.deepEqual(data.room.mapData,opts.mapData);await a.leave();
 });
});
