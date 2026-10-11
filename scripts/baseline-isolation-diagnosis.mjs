import readline from 'node:readline';
import assert from 'node:assert/strict';
import {createOriginAwareWebSocket,loadProxyAgent,tokenTiming,needsRefresh,refreshReconnectToken,disconnectOwnedRoom,classifyFailure} from './origin-aware-websocket.mjs';
const events=[];globalThis.WebSocket=createOriginAwareWebSocket({agentFactory:loadProxyAgent(),onEvent:e=>{events.push(e);console.log(JSON.stringify(e));}});
const {Client}=await import('@colyseus/sdk');
const rl=readline.createInterface({input:process.stdin});console.log('Ready for hidden authentication JSON');const input=await new Promise(resolve=>rl.once('line',resolve));rl.close();
const {bypass}=JSON.parse(input),endpoint='https://de-fra-ae0a271a.colyseus.cloud',devOrigin='https://blockrift-dev.dimitrigvianishvili.chatgpt.site',liveOrigin='https://blockrush-arena.dimitrigvianishvili.chatgpt.site';
const rooms=[],delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));let token,live,dev;
async function renew(){const r=await fetch(devOrigin+'/api/dev-session',{method:'POST',headers:{Origin:devOrigin,'OAI-Sites-Authorization':'Bearer '+bypass}});assert.equal(r.status,200);token=(await r.json()).token;console.log(JSON.stringify({event:'dev-token-minted',...tokenTiming(token)}));if(dev)dev.auth.token=token;}
function client(origin){return new Client(endpoint,{headers:{Origin:origin}});}
async function own(p){const r=await p;rooms.push(r);r.onMessage('*',()=>{});return r;}
async function list(origin,devRoute=false,auth=token){return fetch(endpoint+(devRoute?'/dev/rooms':'/rooms'),{headers:{Origin:origin,...(auth?{Authorization:'Bearer '+auth}:{})}});}
async function check(name,fn){events.length=0;if(dev&&needsRefresh(token))await renew();await fn();console.log(JSON.stringify({check:name,result:'PASS'}));}
async function reconnect(room,isDev){if(isDev){await renew();refreshReconnectToken(room,token,devOrigin);}await delay(5200);const id=room.roomId,seat=room.sessionId;const done=new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Reconnection timeout')),15000);room.onReconnect(()=>{clearTimeout(t);resolve();});});room.connection.transport.ws.terminate();await done;assert.equal(room.roomId,id);assert.equal(room.sessionId,seat);assert((await room.request('snapshot',{})).room);}
try{
 await renew();live=client(liveOrigin);dev=client(devOrigin);dev.auth.token=token;let a,b,c,d;
 await check('Origin-aware LIVE create/join/start',async()=>{a=await own(live.create('blockrush',{public:false,map:'foundry',mode:'ffa',name:'DIAGLIVE'}));b=await own(live.joinById(a.roomId,{name:'DIAGFRIEND'}));assert.equal((await a.request('start',{})).room.phase,'playing');});
 await check('Origin-aware DEV create/join/start',async()=>{c=await own(dev.create('dev_blockrush',{public:false,map:'foundry',mode:'ffa',name:'DIAGDEV'}));d=await own(dev.joinById(c.roomId,{name:'DIAGDEVFRIEND'}));assert.match(c.roomId,/^dev_[A-Z2-9]{6}$/);assert.equal((await c.request('start',{})).room.phase,'playing');});
 await check('Cross-environment join/reconnect rejected',async()=>{await assert.rejects(()=>live.joinById(c.roomId));await assert.rejects(()=>dev.joinById(a.roomId));await assert.rejects(()=>live.reconnect(c.reconnectionToken));await assert.rejects(()=>dev.reconnect(a.reconnectionToken));});
 await check('Listings isolated and private rooms excluded',async()=>{const lr=await list(liveOrigin,false,null),dr=await list(devOrigin,true);assert.equal(lr.status,200);assert.equal(dr.status,200);const l=await lr.json(),d=await dr.json();assert(l.rooms.every(x=>!x.roomId.startsWith('dev_')));assert(d.rooms.every(x=>x.roomId.startsWith('dev_')));assert(!l.rooms.some(x=>x.roomId===a.roomId));assert(!d.rooms.some(x=>x.roomId===c.roomId));assert(!d.capabilities?.editorMaps);});
 await check('Missing/invalid/wrong-origin DEV token rejected',async()=>{assert.equal((await list(devOrigin,true,null)).status,403);assert.equal((await list(devOrigin,true,'invalid')).status,403);await renew();assert.equal((await list('https://dev.blockrift.io',true)).status,403);});
 await check('LIVE socket-loss reconnect',()=>reconnect(a,false));
 await check('DEV socket-loss reconnect with fresh upgrade token',()=>reconnect(c,true));
 console.log(JSON.stringify({result:'ALL BASELINE DIAGNOSIS CHECKS PASSED'}));
}catch(e){console.log(JSON.stringify({result:'CHECK DID NOT PASS',classification:classifyFailure(e,events),message:e.message}));process.exitCode=1;}finally{for(const r of rooms){try{await disconnectOwnedRoom(r);}catch(error){console.log(JSON.stringify({event:'runner-cleanup-error',code:error.code}));process.exitCode=2;}}console.log('Owned diagnostic clients disconnected');}
