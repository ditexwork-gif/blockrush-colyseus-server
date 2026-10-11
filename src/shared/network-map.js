import {sanitizeMap} from './map-schema.js';
import {mapColliders} from './map-geometry.js';
import {mapElevationOffset} from './map-ground.js';
import {collisionBlocked} from './movement.js';

// A room owns one immutable map. Authoring metadata/thumbnails never travel.
export const MAP_TRANSFER_LIMIT=48*1024;
export function prepareNetworkMap(value){
 if(!value||typeof value!=='object'||!Array.isArray(value.objects)||value.objects.length>600)throw Error('Invalid arena objects.');
 const ids=new Set();
 for(const o of value.objects){if(!o||typeof o.id!=='string'||!/^[\w-]{1,64}$/.test(o.id)||ids.has(o.id))throw Error('Arena objects need unique IDs.');ids.add(o.id);}
 const clean=sanitizeMap(value);
 if(clean.objects.length!==value.objects.length)throw Error('Unsupported arena object.');
 const map={version:clean.version,id:clean.id,name:clean.name,width:clean.width,depth:clean.depth,theme:clean.theme,modes:clean.modes,objects:clean.objects.map(({group,...object})=>object)};
 const json=JSON.stringify(map);
 if(new TextEncoder().encode(json).length>MAP_TRANSFER_LIMIT)throw Error('Arena exceeds the 48 KiB multiplayer map limit. Reduce its object count.');
 const geometry=networkMapGeometry(map),spawns=map.objects.filter(o=>o.type==='spawn');
 if(spawns.length<6||spawns.length>16)throw Error('Multiplayer arenas need 6–16 spawn points.');
 if(geometry.solids.length>2048)throw Error('Arena collision geometry is too complex for multiplayer.');
 for(const s of spawns){
  if(Math.abs(s.x)>map.width/2-1.85||Math.abs(s.z)>map.depth/2-1.85||collisionBlocked(s.x,s.z,.33,s.y+geometry.offset,1.8,geometry.solids))throw Error('Move arena spawn points away from walls and obstacles.');
 }
 return {map,json,...geometry};
}
export function networkMapGeometry(map){
 const offset=mapElevationOffset(map),hx=map.width/2-1,hz=map.depth/2-1;
 const solids=[{x:0,z:0,w:map.width,d:map.depth,bottom:-1.2,top:0},
  ...[-hx,hx].map(x=>({x,z:0,w:1,d:map.depth-1,bottom:offset,top:4+offset})),
  ...[-hz,hz].map(z=>({x:0,z,w:map.width-1,d:1,bottom:offset,top:4+offset})),
  ...mapColliders(map).map(s=>({...s,bottom:s.bottom+offset,top:s.top+offset}))];
 return {solids,bounds:{halfWidth:hx,halfDepth:hz},offset};
}
export async function networkMapIdentity(value){
 const prepared=prepareNetworkMap(value),digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(prepared.json));
 return {...prepared,mapHash:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')};
}
