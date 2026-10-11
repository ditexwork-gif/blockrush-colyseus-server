import {createRequire} from 'node:module';
import NodeWebSocket from 'ws';

export class RunnerError extends Error {
 constructor(code,message){super(message);this.name='RunnerError';this.code=code;}
}
export function bypassProxy(hostname,port,noProxy=''){
 return noProxy.split(',').some(entry=>{
  const rule=entry.trim().toLowerCase();if(rule==='*')return true;if(!rule)return false;
  const [host,requiredPort]=rule.split(':');if(requiredPort&&requiredPort!==String(port))return false;
  const name=host.replace(/^\./,'');return hostname===name||hostname.endsWith('.'+name);
 });
}
export function proxyFor(url,env=process.env){
 const target=new URL(url),port=target.port||(target.protocol==='wss:'?'443':'80');
 if(bypassProxy(target.hostname,port,env.NO_PROXY||env.no_proxy||''))return null;
 return target.protocol==='wss:'?(env.WSS_PROXY||env.wss_proxy||env.HTTPS_PROXY||env.https_proxy||env.ALL_PROXY||env.all_proxy||null):(env.WS_PROXY||env.ws_proxy||env.HTTP_PROXY||env.http_proxy||env.ALL_PROXY||env.all_proxy||null);
}
export function tokenTiming(token,now=Math.floor(Date.now()/1000)){
 try{const d=JSON.parse(Buffer.from(token.split('.')[0],'base64url'));return {issuedAt:d.iat,expiresAt:d.exp,secondsRemaining:d.exp-now,origin:d.origin};}catch{return null;}
}
export function needsRefresh(token,now=Math.floor(Date.now()/1000),margin=60){const d=tokenTiming(token,now);return !d||d.secondsRemaining<=margin;}
export function refreshReconnectToken(room,token,origin){
 const timing=tokenTiming(token);if(!timing||timing.origin!==origin||timing.secondsRemaining<=0)throw new RunnerError('RUNNER_AUTH_EXPIRED','Fresh origin-bound DEV token required before reconnect.');
 const url=new URL(room.connection.url);url.searchParams.set('_authToken',token);room.connection.url=url.toString();
}
export async function disconnectOwnedRoom(room,timeoutMs=3000){
 if(!room.connection?.isOpen)return;
 let timer;
 try{await Promise.race([room.leave(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new RunnerError('RUNNER_CLEANUP_TIMEOUT','Owned diagnostic client did not disconnect.')),timeoutMs);})]);}
 finally{clearTimeout(timer);if(room.connection?.isOpen)room.connection.transport.ws.terminate();}
}
export async function expectUpgradeForbidden(room,{origin,token,WebSocket=globalThis.WebSocket,timeoutMs=15000}){
 const url=new URL(room.connection.url);if(token===undefined)url.searchParams.delete('_authToken');else url.searchParams.set('_authToken',token);
 return new Promise((resolve,reject)=>{
  let responseSeen=false;const socket=new WebSocket(url.toString(),{headers:{Origin:origin}});
  const timer=setTimeout(()=>finish(new RunnerError('RUNNER_UPGRADE_TIMEOUT','No upgrade response received.')),timeoutMs);
  const finish=error=>{clearTimeout(timer);socket.terminate();error?reject(error):resolve();};
  socket.once('unexpected-response',(_,response)=>{responseSeen=true;if(response.statusCode===403)finish();else finish(new Error('Expected HTTP 403 on unauthorized upgrade; got '+response.statusCode));});
  socket.once('open',()=>finish(new Error('Unauthorized WebSocket upgrade succeeded.')));
  socket.once('error',error=>{if(!responseSeen)finish(new RunnerError(error.code||'RUNNER_NETWORK_ERROR','Upgrade check could not reach the server.'));});
  socket.once('close',()=>{if(!responseSeen)finish(new RunnerError('RUNNER_UPGRADE_CLOSED','Upgrade closed without an HTTP response.'));});
 });
}
export function createOriginAwareWebSocket({WebSocket=NodeWebSocket,agentFactory,env=process.env,onEvent=()=>{}}={}){
 return class OriginAwareWebSocket extends WebSocket {
  constructor(url,options={}){
   const target=new URL(url),proxy=proxyFor(url,env),origin=options.headers?.Origin||options.headers?.origin||null;
   if(proxy&&!agentFactory)throw new RunnerError('RUNNER_PROXY_REQUIRED','A configured proxy requires https-proxy-agent in the runner. Do not fall back to direct networking.');
   const timing=tokenTiming(target.searchParams.get('_authToken')||'');
   onEvent({event:'websocket-attempt',origin,devRoom:target.pathname.split('/').at(-1)?.startsWith('dev_')||false,proxy:!!proxy,tokenPresent:target.searchParams.has('_authToken'),tokenTiming:timing});
   super(url,{...options,...(proxy?{agent:agentFactory(proxy)}:{})});
   this.on('error',error=>onEvent({event:'websocket-network-error',code:error.code||null}));
   this.on('unexpected-response',(_,response)=>{
    onEvent({event:'websocket-http-rejection',status:response.statusCode});response.resume();this.terminate();
   });
  }
 };
}
export function loadProxyAgent(env=process.env){
 const require=createRequire(import.meta.url);
 try{const {HttpsProxyAgent}=require(env.BLOCKRIFT_PROXY_AGENT_MODULE||'https-proxy-agent');return url=>new HttpsProxyAgent(url);}
 catch{if(env.WSS_PROXY||env.wss_proxy||env.HTTPS_PROXY||env.https_proxy||env.WS_PROXY||env.ws_proxy||env.ALL_PROXY||env.all_proxy)throw new RunnerError('RUNNER_PROXY_REQUIRED','Install https-proxy-agent for the test runner or set BLOCKRIFT_PROXY_AGENT_MODULE to an existing installation.');return undefined;}
}
export function classifyFailure(error,events=[]){
 const attempt=[...events].reverse().find(e=>e.event==='websocket-attempt');
 if(attempt?.devRoom&&attempt.tokenTiming?.secondsRemaining<=0)return {kind:'runner-auth-expired'};
 if(attempt?.devRoom&&(!attempt.tokenPresent||!attempt.tokenTiming||attempt.origin!==attempt.tokenTiming.origin))return {kind:'runner-auth-mismatch'};
 const rejection=[...events].reverse().find(e=>e.event==='websocket-http-rejection');
 if(rejection)return {kind:'server-rejection',status:rejection.status};
 const network=[...events].reverse().find(e=>e.event==='websocket-network-error'&&e.code);
 if(network)return {kind:'runner-network-error',code:network.code};
 if(error instanceof RunnerError)return {kind:'runner-error',code:error.code};
 if(error?.name==='AssertionError')return {kind:'assertion-failed'};
 return {kind:'unclassified-error',code:error?.code||null};
}
