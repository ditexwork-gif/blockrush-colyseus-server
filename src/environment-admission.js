import {createHmac,timingSafeEqual} from 'node:crypto';
import {ENV_CONFIG} from './shared/environment-config.js';
export function requestEnvironment(origin){
 if(!origin)return 'live';
 let parsed;try{parsed=new URL(origin)}catch{throw Error('Unrecognized origin')}
 if(parsed.origin!==origin)throw Error('Unrecognized origin');
 const local=['localhost','127.0.0.1','terminal.local'].includes(parsed.hostname);
 if(local&&parsed.protocol==='http:'&&['4173','3000'].includes(parsed.port))return 'dev';
 if(parsed.protocol!=='https:'||parsed.port)throw Error('Unrecognized origin');
 if(ENV_CONFIG.environments.dev.hosts.includes(parsed.hostname))return 'dev';
 if(ENV_CONFIG.environments.live.hosts.includes(parsed.hostname))return 'live';
 throw Error('Unrecognized origin');
}
export function verifyDevToken(token,origin,secret=process.env.DEV_SESSION_SECRET,now=Math.floor(Date.now()/1000)){
 if(requestEnvironment(origin)!=='dev'||!origin||typeof secret!=='string'||secret.length<32||typeof token!=='string'||token.length>2048)throw Error('DEV authorization required');
 const parts=token.split('.');if(parts.length!==2||parts.some(p=>!p||!/^[\w-]+$/.test(p)))throw Error('Invalid DEV token');
 const [payload,sig]=parts,expected=createHmac('sha256',secret).update(payload).digest(),actual=Buffer.from(sig,'base64url');
 if(actual.toString('base64url')!==sig||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('Invalid DEV token');
 const claims=JSON.parse(Buffer.from(payload,'base64url').toString());
 if(claims.aud!=='blockrift-dev'||claims.origin!==origin||!Number.isSafeInteger(claims.iat)||!Number.isSafeInteger(claims.exp)||claims.iat>now+5||claims.exp<=now||claims.exp-claims.iat!==120||typeof claims.jti!=='string')throw Error('Expired or invalid DEV token');
 return {environment:'dev',origin,jti:claims.jti};
}
export function admit(environment,origin,token){
 if(requestEnvironment(origin)!==environment)throw Error('Cross-environment connection rejected');
 return environment==='dev'?verifyDevToken(token,origin):{environment:'live',origin:origin||null};
}
export function requestAdmission(request){
 const url=new URL(request.url),origin=request.headers.get('origin'),environment=requestEnvironment(origin),authorization=request.headers.get('authorization');
 if(request.method==='OPTIONS')return;
 const token=authorization?.startsWith('Bearer ')?authorization.slice(7):null;
 if(url.pathname==='/dev/rooms'){admit('dev',origin,token);return;}
 if(url.pathname==='/rooms'&&environment!=='live')throw Error('Use the DEV room listing');
 if(url.pathname.startsWith('/matchmake/')){
  const [, ,method,name]=url.pathname.split('/');
  const target=['create','join','joinOrCreate'].includes(method)?(name===ENV_CONFIG.environments.dev.roomName?'dev':name===ENV_CONFIG.environments.live.roomName?'live':null):['joinById','reconnect'].includes(method)?(name?.startsWith('dev_')?'dev':'live'):null;
  if(!target)throw Error('Unknown room target');admit(target,origin,token);
 }
}
export function corsPreflight(request){
 if(request.method!=='OPTIONS')return;
 const origin=request.headers.get('origin');requestEnvironment(origin);
 if(!origin)throw Error('Origin required');
 return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Credentials':'true','Vary':'Origin'}});
}
export function upgradeAdmission(request,context){
 try{
  const parts=new URL(request.url).pathname.split('/').filter(Boolean),roomId=parts.at(-1);
  if(parts.length<2)return;
  admit(roomId?.startsWith('dev_')?'dev':'live',context.headers.get('origin'),context.token);
 }catch{return new Response('Forbidden',{status:403})}
}
