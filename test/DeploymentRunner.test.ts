import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createServer} from 'node:http';
import {WebSocketServer} from 'ws';
import {createOriginAwareWebSocket,proxyFor,needsRefresh,refreshReconnectToken,disconnectOwnedRoom,expectUpgradeForbidden,tokenTiming,RunnerError,classifyFailure} from '../scripts/origin-aware-websocket.mjs';
const origin='https://blockrift-dev.dimitrigvianishvili.chatgpt.site';
const token=(iat:number)=>Buffer.from(JSON.stringify({origin,iat,exp:iat+120})).toString('base64url')+'.test';
describe('Deployment runner transport and credential handling',()=>{
 it('routes remote secure WebSockets through the configured proxy and honors NO_PROXY',()=>{
  const env={HTTPS_PROXY:'http://proxy.test:8080',NO_PROXY:'localhost,127.0.0.1,.internal.test:4173'};
  assert.equal(proxyFor('wss://de-fra-ae0a271a.colyseus.cloud/room',env),env.HTTPS_PROXY);
  assert.equal(proxyFor('ws://localhost:2567/room',env),null);
  assert.equal(proxyFor('ws://127.0.0.1:2567/room',env),null);
  assert.equal(proxyFor('wss://service.internal.test:4173/room',env),null);
  assert.equal(proxyFor('wss://service.internal.test:443/room',env),env.HTTPS_PROXY);
 });
 it('passes the proxy agent and exact Origin to ws instead of silently using direct networking',()=>{
  let received:any,called=false;const agent={testAgent:true};
  class FakeSocket extends EventEmitter{constructor(url:string,options:any){super();received=options;}}
  const Socket=createOriginAwareWebSocket({WebSocket:FakeSocket,env:{HTTPS_PROXY:'http://proxy.test:8080'},agentFactory:()=>{called=true;return agent;}});
  new Socket('wss://server.test/process/dev_ABC234',{headers:{Origin:origin}});
  assert(called);assert.equal(received.agent,agent);assert.equal(received.headers.Origin,origin);
 });
 it('fails explicitly before attempting a direct connection when proxy support is missing',()=>{
  let connected=false;class FakeSocket extends EventEmitter{constructor(){super();connected=true;}}
  const Socket=createOriginAwareWebSocket({WebSocket:FakeSocket,env:{HTTPS_PROXY:'http://proxy.test:8080'}});
  assert.throws(()=>new Socket('wss://server.test/process/ABC234'),(e:any)=>e instanceof RunnerError&&e.code==='RUNNER_PROXY_REQUIRED');assert.equal(connected,false);
 });
 it('sends the expected Origin on an actual WebSocket upgrade and never logs token bytes',async()=>{
  const http=createServer(),wss=new WebSocketServer({server:http});let seenOrigin:string|undefined;
  wss.on('connection',(socket,request)=>{seenOrigin=request.headers.origin;socket.send('ready');});
  await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));const port=(http.address() as any).port,events:any[]=[];
  const Socket=createOriginAwareWebSocket({env:{NO_PROXY:'127.0.0.1'},onEvent:(e:any)=>events.push(e)});
  const auth=token(Math.floor(Date.now()/1000));const socket=new Socket(`ws://127.0.0.1:${port}/process/dev_ABC234?_authToken=${auth}`,{headers:{Origin:origin}});
  try{await new Promise<void>((resolve,reject)=>{socket.once('message',()=>resolve());socket.once('error',reject);});assert.equal(seenOrigin,origin);assert.equal(events[0].origin,origin);assert(events[0].tokenTiming.secondsRemaining>=118&&events[0].tokenTiming.secondsRemaining<=120);assert(!JSON.stringify(events).includes(auth));}
  finally{socket.terminate();await new Promise<void>(resolve=>wss.close(()=>http.close(()=>resolve())));}
 });
 it('refreshes near-expiry credentials and replaces the captured SDK reconnect URL',()=>{
  assert.equal(needsRefresh(token(1000),1010),false);assert.equal(needsRefresh(token(1000),1060),true);
  const fresh=token(Math.floor(Date.now()/1000)),room={connection:{url:'wss://server.test/process/dev_ABC234?_authToken=expired&sessionId=test'}};
  refreshReconnectToken(room,fresh,origin);const url=new URL(room.connection.url);assert.equal(url.searchParams.get('_authToken'),fresh);assert.equal(url.searchParams.get('sessionId'),'test');
  assert.throws(()=>refreshReconnectToken(room,token(1000),origin),/Fresh origin-bound/);
  assert.throws(()=>refreshReconnectToken(room,fresh,'https://dev.blockrift.io'),/Fresh origin-bound/);
 });
 it('distinguishes pre-handshake DNS failure from an explicit server HTTP rejection',()=>{
  assert.deepEqual(classifyFailure(Error(''),[{event:'websocket-network-error',code:'EAI_AGAIN'}]),{kind:'runner-network-error',code:'EAI_AGAIN'});
  assert.deepEqual(classifyFailure(Error(''),[{event:'websocket-http-rejection',status:403}]),{kind:'server-rejection',status:403});
  assert.deepEqual(classifyFailure(new RunnerError('RUNNER_PROXY_REQUIRED','setup')),{kind:'runner-error',code:'RUNNER_PROXY_REQUIRED'});
  assert.equal(classifyFailure(Error('1006')).kind,'unclassified-error');
  assert.equal(classifyFailure(Error('403'),[{event:'websocket-attempt',devRoom:true,tokenPresent:true,origin,tokenTiming:{origin,secondsRemaining:-1}},{event:'websocket-http-rejection',status:403}]).kind,'runner-auth-expired');
  assert.equal(classifyFailure(Error('403'),[{event:'websocket-attempt',devRoom:true,tokenPresent:true,origin:'https://dev.blockrift.io',tokenTiming:{origin,secondsRemaining:100}},{event:'websocket-http-rejection',status:403}]).kind,'runner-auth-mismatch');
  assert.deepEqual(tokenTiming('invalid'),null);
 });
 it('does not wait for a second leave event from an already disconnected room',async()=>{
  await disconnectOwnedRoom({connection:{isOpen:false},leave:()=>{throw Error('Must not call leave twice');}});
  let terminated=false;
  await assert.rejects(()=>disconnectOwnedRoom({connection:{isOpen:true,transport:{ws:{terminate:()=>{terminated=true;}}}},leave:()=>new Promise(()=>{})},20),/did not disconnect/);
  assert(terminated);
 });
 it('requires an actual HTTP 403 for a rejected upgrade and never counts a DNS error as rejection',async()=>{
  class RejectedSocket extends EventEmitter{constructor(){super();queueMicrotask(()=>this.emit('unexpected-response',{}, {statusCode:403}));}terminate(){}}
  class BrokenSocket extends EventEmitter{constructor(){super();queueMicrotask(()=>this.emit('error',Object.assign(Error('DNS'),{code:'EAI_AGAIN'})));}terminate(){}}
  const room={connection:{url:'wss://server.test/process/dev_ABC234?sessionId=fixture'}};
  await expectUpgradeForbidden(room,{origin,WebSocket:RejectedSocket});
  await assert.rejects(()=>expectUpgradeForbidden(room,{origin,WebSocket:BrokenSocket}),(e:any)=>e instanceof RunnerError&&e.code==='EAI_AGAIN');
 });
});
