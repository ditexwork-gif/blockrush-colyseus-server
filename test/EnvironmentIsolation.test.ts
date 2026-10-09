import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {boot, type ColyseusTestServer} from '@colyseus/testing';
import {Client} from '@colyseus/sdk';
import app from '../src/app.config.js';
import {requestEnvironment,requestAdmission,upgradeAdmission,verifyDevToken} from '../src/environment-admission.js';
const devOrigin='https://dev.blockrift.io',liveOrigin='https://blockrush-arena.dimitrigvianishvili.chatgpt.site';
const secret='test-dev-session-secret-at-least-32-bytes';
function token(origin=devOrigin,exp=Math.floor(Date.now()/1000)+120){const payload=Buffer.from(JSON.stringify({aud:'blockrift-dev',origin,iat:exp-120,exp,jti:'test-session'})).toString('base64url');return payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url')}
describe('BLOCKRIFT server environment isolation',()=>{
 let server:ColyseusTestServer<typeof app>,previous:string|undefined;
 before(async()=>{previous=process.env.DEV_SESSION_SECRET;process.env.DEV_SESSION_SECRET=secret;server=await boot(app)});
 after(async()=>{await server.shutdown();if(previous===undefined)delete process.env.DEV_SESSION_SECRET;else process.env.DEV_SESSION_SECRET=previous});
 beforeEach(async()=>{await server.cleanup()});
 it('requires signed, unexpired, origin-bound DEV authorization',()=>{
  assert.equal(requestEnvironment(liveOrigin),'live');assert.equal(requestEnvironment(devOrigin),'dev');
  assert.throws(()=>requestEnvironment(devOrigin+'.evil.test'));
  assert.equal(verifyDevToken(token(),devOrigin).environment,'dev');
  for(const invalid of [undefined,token().split('.')[0]+'.!'+token().split('.')[1].slice(1),token(devOrigin,Math.floor(Date.now()/1000)-1)])assert.throws(()=>verifyDevToken(invalid,devOrigin));
  assert.throws(()=>verifyDevToken(token(),'https://blockrift-dev.dimitrigvianishvili.chatgpt.site'));
 });
 it('rejects cross-environment matchmaking, join-by-code, reconnection and listings',()=>{
  for(const method of ['create','join','joinOrCreate','joinById','reconnect']){
   const liveTarget=['joinById','reconnect'].includes(method)?'ABC234':'blockrush',devTarget=['joinById','reconnect'].includes(method)?'dev_ABC234':'dev_blockrush';
   assert.throws(()=>requestAdmission(new Request('https://server/matchmake/'+method+'/'+liveTarget,{headers:{origin:devOrigin,authorization:'Bearer '+token()}})));
   assert.throws(()=>requestAdmission(new Request('https://server/matchmake/'+method+'/'+devTarget,{headers:{origin:liveOrigin}})));
   requestAdmission(new Request('https://server/matchmake/'+method+'/'+devTarget,{headers:{origin:devOrigin,authorization:'Bearer '+token()}}));
  }
  assert.throws(()=>requestAdmission(new Request('https://server/rooms',{headers:{origin:devOrigin}})));
  assert.throws(()=>requestAdmission(new Request('https://server/dev/rooms',{headers:{origin:devOrigin}})));
 });
 it('guards WebSocket upgrades, including reconnections, before consuming seats',()=>{
  const req=(id:string)=>new Request('https://server/process/'+id+'?reconnectionToken=stolen');
  assert.equal(upgradeAdmission(req('dev_ABC234'),{headers:new Headers({origin:liveOrigin}),token:token()})?.status,403);
  assert.equal(upgradeAdmission(req('ABC234'),{headers:new Headers({origin:devOrigin}),token:token()})?.status,403);
  assert.equal(upgradeAdmission(req('dev_ABC234'),{headers:new Headers({origin:devOrigin}),token:token()}),undefined);
  assert.equal(upgradeAdmission(req('dev_ABC234'),{headers:new Headers({origin:devOrigin}),token:token(devOrigin,Math.floor(Date.now()/1000)-1)})?.status,403);
 });
 it('creates disjoint rooms and storage, serves disjoint listings, rejects actual cross-environment joins',async()=>{
  const endpoint=server.sdk.getHttpEndpoint('/');
  const live=new Client(endpoint,{headers:{Origin:liveOrigin}}),dev=new Client(endpoint,{headers:{Origin:devOrigin}}),unauthorized=new Client(endpoint,{headers:{Origin:devOrigin}});
  live.auth.token=undefined;dev.auth.token=token();unauthorized.auth.token=undefined;
  const a=await live.create('blockrush',{public:true}),b=await dev.create('dev_blockrush',{public:true});
  assert.match(a.roomId,/^[A-Z2-9]{6}$/);assert.match(b.roomId,/^dev_[A-Z2-9]{6}$/);
  const roomA=server.getRoomById(a.roomId),roomB=server.getRoomById(b.roomId);
  assert.notEqual(roomA.roomIdsKey,roomB.roomIdsKey);assert.equal(roomA.environment,'live');assert.equal(roomB.environment,'dev');
  // Prove the DEV static gate has not bypassed the original instance auth.
  assert.equal(typeof roomB.clients[0].auth.ip,'string');
  const listA=await fetch(endpoint+'rooms',{headers:{Origin:liveOrigin}}),listB=await fetch(endpoint+'dev/rooms',{headers:{Origin:devOrigin,Authorization:'Bearer '+token()}});
  assert.equal(listA.status,200);assert.equal(listB.status,200);
  assert((await listA.json()).rooms.every((r:any)=>!r.roomId.startsWith('dev_')));
  assert((await listB.json()).rooms.every((r:any)=>r.roomId.startsWith('dev_')));
  await assert.rejects(()=>live.joinById(b.roomId));await assert.rejects(()=>dev.joinById(a.roomId));await assert.rejects(()=>unauthorized.joinById(b.roomId));
  await assert.rejects(()=>live.reconnect(b.reconnectionToken));await assert.rejects(()=>dev.reconnect(a.reconnectionToken));
  await a.leave();await b.leave();
 });
 it('reconnects LIVE and authorized DEV to their own existing seats after real socket loss',async()=>{
  const endpoint=server.sdk.getHttpEndpoint('/');
  for(const [name,origin] of [['blockrush',liveOrigin],['dev_blockrush',devOrigin]]){
   const sdk=new Client(endpoint,{headers:{Origin:origin}});if(name==='dev_blockrush')sdk.auth.token=token();
   const room:any=await sdk.create(name,{public:false}),id=room.roomId,session=room.sessionId;
   // Exercise the SDK's real default minimum-uptime gate, rather than overriding it.
   await new Promise(resolve=>setTimeout(resolve,5100));
   const reconnected=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Reconnect timed out')),8000);room.onReconnect(()=>{clearTimeout(timer);resolve()})});
   const socket:any=server.getRoomById(id).clients.find((c:any)=>c.sessionId===session);
   socket.ref.terminate();await reconnected;
   assert.equal(room.roomId,id);assert.equal(room.sessionId,session);assert.equal(server.getRoomById(id).environment,name==='blockrush'?'live':'dev');
   await room.leave();
  }
 });
});
