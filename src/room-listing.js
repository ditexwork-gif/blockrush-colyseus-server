// Public presentation only. Never return player sessions, IPs or auth material.
export function sanitizeDisplayName(value){return typeof value==='string'?value.replace(/[^a-zA-Z0-9 _-]/g,'').trim().slice(0,16)||'FIGHTER':'FIGHTER';}
export function sanitizeRoomName(value){return typeof value==='string'?Array.from(value.replace(/<[^>]*>/g,'').replace(/[^\p{L}\p{N} _.'’()\-]/gu,'').replace(/\s+/g,' ').trim()).slice(0,48).join(''):'';}
export const defaultRoomName=name=>sanitizeDisplayName(name)+"'s match";
export function publicRoomListing(room,now=Date.now()){
 const m=room.metadata;
 if(room.private===true||room.unlisted===true||m?.public!==true||m?.inviteOnly===true)return null;
 const result={roomId:room.roomId,clients:room.clients,maxClients:room.maxClients,locked:room.locked,map:m.map,mapName:m.mapName,mapHash:m.mapHash,mode:m.mode,phase:m.phase,name:sanitizeRoomName(m.name)};
 if(Array.isArray(m.connectedPlayers))result.connectedPlayers=m.connectedPlayers.slice(0,room.maxClients).map(sanitizeDisplayName);
 if(Number.isFinite(m.roundTimeSeconds))result.roundTimeSeconds=m.roundTimeSeconds;
 if(m.phase==='playing'&&Number.isFinite(m.endsAt))result.timeRemainingSeconds=Math.max(0,Math.ceil((m.endsAt-now)/1000));
 else if(m.phase==='finished')result.timeRemainingSeconds=0;
 if(Number.isInteger(m.botCount)&&m.botCount>=0)result.botCount=m.botCount;
 if(m.map==='custom'&&m.mapPreview)result.mapPreview=m.mapPreview;
 return result;
}
