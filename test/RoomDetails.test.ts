import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {boot,type ColyseusTestServer} from '@colyseus/testing';
import {Client} from '@colyseus/sdk';
import {matchMaker} from 'colyseus';
import app from '../src/app.config.js';
import {sanitizeRoomName,publicRoomListing} from '../src/room-listing.js';
import {createStarterMap} from '../src/shared/map-schema.js';
import {networkMapIdentity} from '../src/shared/network-map.js';

describe('Public room details',()=>{
 const liveOrigin='https://blockrush-arena.dimitrigvianishvili.chatgpt.site',devOrigin='https://dev.blockrift.io',secret='room-details-tests-local-secret-32-bytes';
 let server:ColyseusTestServer<typeof app>,previous:string|undefined;
 function token(){const iat=Math.floor(Date.now()/1000),payload=Buffer.from(JSON.stringify({aud:'blockrift-dev',origin:devOrigin,iat,exp:iat+120,jti:'details-test'})).toString('base64url');return payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');}
 function client(dev=false){const sdk=new Client(server.sdk.getHttpEndpoint('/'),{headers:{Origin:dev?devOrigin:liveOrigin}});if(dev)sdk.auth.token=token();return sdk;}
 async function listing(dev=false){const response=await fetch(server.sdk.getHttpEndpoint(dev?'/dev/rooms':'/rooms'),{headers:{Origin:dev?devOrigin:liveOrigin,...(dev?{Authorization:'Bearer '+token()}: {})}});assert.equal(response.status,200);return response.json();}
 before(async()=>{previous=process.env.DEV_SESSION_SECRET;process.env.DEV_SESSION_SECRET=secret;server=await boot(app)});
 after(async()=>{await server.shutdown();if(previous===undefined)delete process.env.DEV_SESSION_SECRET;else process.env.DEV_SESSION_SECRET=previous});
 beforeEach(async()=>{await server.cleanup()});
 it('sanitizes room titles and bounds their length, including control/bidi characters',()=>{assert.equal(sanitizeRoomName('<img src=x> Alpha\u202e\n  Beta!'),'Alpha Beta');assert.equal(sanitizeRoomName('A'.repeat(100)).length,48);assert.equal(sanitizeRoomName({}), '');});
 it('defaults to the host display name, lists human names only and whitelists response fields',async()=>{
  const a=await client().create('blockrush',{public:true,name:'<b>HOST</b>'}),r:any=server.getRoomById(a.roomId);
  let payload=await listing(),row=payload.rooms.find((v:any)=>v.roomId===a.roomId);
  assert.equal(row.name,"bHOSTb's match");assert.deepEqual(row.connectedPlayers,['bHOSTb']);assert.equal(row.roundTimeSeconds,180);assert.equal(row.botCount,0);assert.equal(row.timeRemainingSeconds,undefined);
  const b=await client().joinById(a.roomId,{name:'FRIEND<script>'});payload=await listing();row=payload.rooms.find((v:any)=>v.roomId===a.roomId);
  assert.deepEqual(row.connectedPlayers,['bHOSTb','FRIENDscript']);assert.equal(row.botCount,r.arena.players.filter((p:any)=>p.bot).length);assert(row.botCount>0);assert(row.timeRemainingSeconds>0&&row.timeRemainingSeconds<=row.roundTimeSeconds);
  assert.deepEqual(Object.keys(row).sort(),['roomId','clients','maxClients','locked','map','mapName','mapHash','mode','phase','name','connectedPlayers','roundTimeSeconds','timeRemainingSeconds','botCount'].sort());assert(!JSON.stringify(row).includes(a.sessionId));
  await b.leave();await new Promise(resolve=>setTimeout(resolve,30));row=(await listing()).rooms.find((v:any)=>v.roomId===a.roomId);assert.deepEqual(row.connectedPlayers,['bHOSTb']);await a.leave();
 });
 it('never lists private or unlisted rooms, including their names',async()=>{
  const a=await client().create('blockrush',{public:false,name:'PRIVATE',roomName:'SECRET TITLE'}),b=await client().create('blockrush',{public:true,name:'HIDDEN'}),r:any=server.getRoomById(b.roomId);r._listing.unlisted=true;await matchMaker.driver.persist(r._listing);
  assert.equal((await listing()).rooms.length,0);assert.equal(publicRoomListing({private:true,metadata:{public:true,name:'secret'}}),null);assert.equal(publicRoomListing({unlisted:true,metadata:{public:true}}),null);assert.equal(publicRoomListing({metadata:{public:true,inviteOnly:true}}),null);await a.leave();await b.leave();
 });
 it('sanitizes host-set titles on both endpoints and preserves DEV authorization and isolation',async()=>{
  const a=await client().create('blockrush',{public:true,name:'LIVE',roomName:'<b>LIVE room</b>'}),b=await client(true).create('dev_blockrush',{public:true,name:'DEV',roomName:'<b>DEV room</b>'});
  const l=await listing(),d=await listing(true);assert.deepEqual(l.rooms.map((r:any)=>r.name),['LIVE room']);assert.deepEqual(d.rooms.map((r:any)=>r.name),['DEV room']);assert.deepEqual(d.rooms[0].connectedPlayers,['DEV']);assert.equal(d.capabilities.roomDetails,true);
  const denied=await fetch(server.sdk.getHttpEndpoint('/dev/rooms'),{headers:{Origin:devOrigin}});assert.equal(denied.status,403);await a.leave();await b.leave();
 });
 it('publishes editor preview geometry from the validated map, with no authoring or player ids',async()=>{
  const p=await networkMapIdentity(createStarterMap()),a=await client(true).create('dev_blockrush',{public:true,name:'HOST',map:'custom',mode:'ffa',mapData:p.map,mapHash:p.mapHash});
  const row=(await listing(true)).rooms[0];assert.equal(row.mapHash,p.mapHash);assert.equal(row.mapPreview.width,p.map.width);assert.deepEqual(row.mapPreview.shapes,p.solids.map(({x,z,w,d,top,yaw=0}:any)=>({x,z,w,d,top,yaw})));assert(!JSON.stringify(row.mapPreview).includes('"id"'));await a.leave();
 });
 it('computes remaining time from the real deadline and excludes unrecognized private metadata',()=>{
  const base={roomId:'ABC234',maxClients:8,metadata:{public:true,name:'x',phase:'playing',endsAt:12_000,roundTimeSeconds:180,connectedPlayers:['<HOST>'],token:'secret',hostId:'private',ip:'private'}};
  assert.equal(publicRoomListing(base,10_001).timeRemainingSeconds,2);assert.equal(publicRoomListing(base,20_000).timeRemainingSeconds,0);assert.deepEqual(publicRoomListing(base,10_001).connectedPlayers,['HOST']);assert.equal(publicRoomListing(base).token,undefined);
 });
});
