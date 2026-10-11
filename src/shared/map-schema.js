const environmentStorage=undefined; // Server never reads browser storage.
import {mapColliders} from './map-geometry.js';
import {collisionBlocked} from './movement.js';
export const MAP_VERSION = 3;
export const MAP_STORAGE_KEY = 'blockrift-custom-map-v1';

export const TYPES = Object.freeze({
  select: { label: 'Select', color: '#dcff59' },
  wall: { label: 'Wall', width: 8, depth: 1, height: 3, color: '#7f9293' },
  cover: { label: 'Low cover', width: 4, depth: 1.2, height: 1.25, color: '#c3b388' },
  crate: { label: 'Crate', width: 2, depth: 2, height: 2, color: '#b88c57' },
  container: { label: 'Container', width: 7, depth: 4, height: 3.3, color: '#367e83' },
  building: { label: 'Building', width: 12, depth: 10, height: 6, color: '#547b7f' },
  platform: { label: 'Platform', width: 6, depth: 6, height: .6, color: '#b9ad96' },
  block: {label:'Block',width:8,depth:8,height:8,color:'#a79a80'},
  ramp: {label:'Ramp',width:4,depth:8,height:3,color:'#b9ad96'},
  stairs: {label:'Stairs',width:4,depth:6,height:3,color:'#b9ad96'},
  arch: {label:'Arch / doorway',width:8,depth:1,height:5,color:'#b89363'},
  window: {label:'Window wall',width:8,depth:1,height:4,color:'#b89363'},
  zone: {label:'Zone',width:12,depth:12,height:4,color:'#8c5cff'},
  spawn: { label: 'Spawn point', width: 1.4, depth: 1.4, height: 0, color: '#dcff59' }
});

export const THEMES = Object.freeze({
  daylight: { floor: '#b8b5a4', wall: '#c8b9a0' },
  industrial: { floor: '#8f9992', wall: '#526c6c' },
  night: { floor: '#26343a', wall: '#374a50' },
  desert: { floor: '#d4b77c', wall: '#b89363' }
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clone = value => JSON.parse(JSON.stringify(value));
const hex = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value).toLowerCase() : fallback;
const id = () => `obj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function createStarterMap(width = 120, depth = 120) {
  width = clamp(Math.round(number(width, 120)), 40, 180);
  depth = clamp(Math.round(number(depth, 120)), 40, 180);
  const edgeX = width / 2 - 8, edgeZ = depth / 2 - 8;
  const objects = [
    [-edgeX, -edgeZ], [edgeX, edgeZ], [-edgeX, edgeZ], [edgeX, -edgeZ],
    [0, -edgeZ], [0, edgeZ], [-edgeX, 0], [edgeX, 0]
  ].map(([x, z], index) => ({ id: `spawn-${index + 1}`, type: 'spawn', x, y: 0, z, width: 1.4, depth: 1.4, height: 0, rotation: 0, color: '#dcff59' }));
  const add = (type, x, z, rotation = 0, overrides = {}) => objects.push({ id: id(), type, x, y: 0, z, rotation, ...TYPES[type], ...overrides });
  add('building', -width * .28, -depth * .25, 0, { width: 14, depth: 12, height: 7, color: '#a78362' });
  add('building', width * .28, depth * .25, 0, { width: 14, depth: 12, height: 7, color: '#3f7479' });
  add('container', -width * .18, depth * .12, 90);
  add('container', width * .18, -depth * .12, 90, { color: '#a9563e' });
  add('wall', 0, -depth * .22, 0, { width: 15 });
  add('wall', 0, depth * .22, 0, { width: 15 });
  add('cover', -width * .15, 0, 90);
  add('cover', width * .15, 0, 90);
  add('crate', -5, -5);
  add('crate', 5, 5);
  return { version: MAP_VERSION, id: newMapId(), author: 'Ditex', createdAt: Date.now(), updatedAt: Date.now(), modes: ['ffa','tdm'], groups: [], rotationSnap: 15, meta: {}, name: 'My Arena', width, depth, theme: 'industrial', snap: 2, mapMaxHeight: 40, objects };
}

export function sanitizeMap(value) {
  if (typeof value === 'string') value = JSON.parse(value);
  if (!value || typeof value !== 'object') throw new Error('Map data is missing.');
  if (![1, 2, MAP_VERSION].includes(value.version)) throw new Error(`Unsupported map version: ${value.version ?? 'unknown'}.`);
  const map = {
    version: MAP_VERSION,
    id: safeId(value.id) || legacyMapId(value), author: text(value.author || 'Ditex',64),
    createdAt: Math.max(0,number(value.createdAt)), updatedAt: Math.max(0,number(value.updatedAt)),
    rotationSnap: [0,5,15,45,90].includes(value.rotationSnap) ? value.rotationSnap : 15,
    modes: Array.isArray(value.modes) ? [...new Set(value.modes.filter(x=>['ffa','tdm','gun'].includes(x)))] : ['ffa','tdm'],
    groups: (Array.isArray(value.groups)?value.groups:[]).slice(0,600).filter(g=>g&&safeId(g.id)).map(g=>({id:safeId(g.id),name:text(g.name||'Group',64),locked:g.locked===true,hidden:g.hidden===true})),
    meta: { inDefaultList: value.meta?.inDefaultList !== false, ...(typeof value.meta?.thumbnail==='string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.meta.thumbnail) && value.meta.thumbnail.length<180000 ? {thumbnail:value.meta.thumbnail} : {}) },
    name: String(value.name || 'My Arena').replace(/[<>]/g, '').trim().slice(0, 32) || 'My Arena',
    width: clamp(Math.round(number(value.width ?? value.size?.w, 120)), 40, 180),
    depth: clamp(Math.round(number(value.depth ?? value.size?.d, 120)), 40, 180),
    theme: Object.hasOwn(THEMES,value.theme) ? value.theme : 'industrial',
    snap: [1, 2, 4].includes(number(value.snap ?? value.grid)) ? number(value.snap ?? value.grid) : 2,
    mapMaxHeight: clamp(number(value.mapMaxHeight, 40), 1, 100),
    objects: []
  };
  const source = [...(Array.isArray(value.objects) ? value.objects : []), ...(Array.isArray(value.spawns) ? value.spawns.map(item => ({...item, type:'spawn'})) : [])].slice(0, 600);
  for (const raw of source) {
    if (!raw || !Object.hasOwn(TYPES,raw.type) || raw.type === 'select') continue;
    const defaults = TYPES[raw.type], spawn = raw.type === 'spawn';
    map.objects.push({
      id: String(raw.id || id()).replace(/[^a-z0-9_-]/gi, '').slice(0, 64) || id(),
      type: raw.type,
      x: clamp(number(raw.x), -map.width / 2 + 1, map.width / 2 - 1),
      y: clamp(number(raw.y), ['platform','ramp','stairs','spawn','zone'].includes(raw.type)?-6:0, 100),
      z: clamp(number(raw.z), -map.depth / 2 + 1, map.depth / 2 - 1),
      width: spawn ? defaults.width : clamp(number(raw.width ?? raw.w, defaults.width), .5, 60),
      depth: spawn ? defaults.depth : clamp(number(raw.depth ?? raw.d, defaults.depth), .5, 60),
      height: spawn ? 0 : clamp(number(raw.height ?? raw.h, defaults.height), .2, 18),
      rotation: angle(number(raw.rotation ?? raw.rot)),
      ...(raw.painted===true?{painted:true}:{}),
      name: text(raw.name || '',64), locked: raw.locked===true, hidden: raw.hidden===true,
      ...(map.groups.some(g=>g.id===raw.group)?{group:raw.group}:{}),
      ...(raw.type==='zone'?{zoneType:['bombsite','buy','spawn_a','spawn_b','poi'].includes(raw.zoneType)?raw.zoneType:'poi',label:text(raw.label||'Zone',32)}:{}),
      ...(spawn?{team:['a','b'].includes(raw.team)?raw.team:'any',yaw:angle(number(raw.yaw,Math.atan2(number(raw.x),number(raw.z))*180/Math.PI))}:{}),
      ...(['ramp','stairs'].includes(raw.type)?{dir:['N','E','S','W'].includes(raw.dir)?raw.dir:'N',stepHeight:clamp(number(raw.stepHeight,.5),.1,.55)}:{}),
      ...(['arch','window'].includes(raw.type)?{openingWidth:clamp(number(raw.openingWidth,3),.1,59.6),openingHeight:clamp(number(raw.openingHeight,2.5),.1,17.8),sillHeight:clamp(number(raw.sillHeight,1),0,17.6)}:{}),
      color: hex(raw.color, defaults.color)
    });
  }
  if(value.paintLayer&&typeof value.paintLayer==='object'){const l=value.paintLayer;map.paintLayer={cell:[1,2,4,8].includes(l.cell)?l.cell:map.snap*2,height:clamp(number(l.height,8),.2,18),color:hex(l.color,'#a79a80'),rle:(Array.isArray(l.rle)?l.rle:[]).slice(0,32400).filter(r=>Array.isArray(r)&&r.length===2&&r.every(Number.isInteger)&&r[0]>=0&&r[0]<32400&&r[1]>0&&r[1]<=32400).map(r=>[r[0],r[1]])};}
  const ids=new Set();for(const item of map.objects){if(ids.has(item.id))item.id=id();ids.add(item.id)}
  return map;
}

export function validateMap(value) {
  const map = sanitizeMap(value), errors = [], warnings = [], spawns = map.objects.filter(item => item.type === 'spawn');
  if (spawns.length < 6) errors.push(`Add ${6 - spawns.length} more spawn point${6 - spawns.length === 1 ? '' : 's'} for a six-player practice match.`);
  const solids = map.objects.filter(item => !['spawn','zone'].includes(item.type));
  for (const spawn of spawns) {
    if(Math.abs(spawn.x)>map.width/2-1.85||Math.abs(spawn.z)>map.depth/2-1.85)errors.push('Move spawn points away from the arena boundary walls.');
    const blocked = collisionBlocked(spawn.x,spawn.z,.33,spawn.y,1.8,mapColliders(map));
    if (blocked) errors.push('Move spawn points out of walls, buildings, and cover.');
  }
  for (const item of map.objects) if (item.y + item.height > map.mapMaxHeight) warnings.push(`${TYPES[item.type].label} exceeds the ${map.mapMaxHeight} m height limit.`);
  if (spawns.length > 16) warnings.push('More than 16 spawn points may make respawns difficult to predict.');
  if (solids.length < 4) warnings.push('The arena has very little cover. Add walls or props before combat testing.');
  if (solids.length > 450) warnings.push('This map may be heavy on lower-end devices.');
  return { map, errors: [...new Set(errors)], warnings };
}

export function saveCustomMap(value, storage = environmentStorage) {
  const map = sanitizeMap(value); storage.setItem(MAP_STORAGE_KEY, JSON.stringify(map)); return map;
}

export function loadSavedMap(storage = environmentStorage) {
  try { const value = storage.getItem(MAP_STORAGE_KEY); return value ? sanitizeMap(value) : null; } catch { return null; }
}

export function mapBounds(map) {
  const clean = sanitizeMap(map);
  return { minX: -clean.width / 2, maxX: clean.width / 2, minZ: -clean.depth / 2, maxZ: clean.depth / 2 };
}

export function elevationOrder(objects) { return [...objects].sort((a,b) => (a.y || 0) - (b.y || 0)); }
export function elevationOpacity(y) { return 1 - .45 * clamp(number(y) / 12, 0, 1); }
export function stackSurface(item, objects) {
  const size = objectFootprint(item);
  return objects.filter(other => {
    if (other.id === item.id || ['spawn','zone'].includes(other.type)) return false;
    const target = objectFootprint(other);
    return Math.abs(item.x-other.x) < (size.width+target.width)/2 && Math.abs(item.z-other.z) < (size.depth+target.depth)/2;
  }).sort((a,b) => (b.y+b.height) - (a.y+a.height))[0] || null;
}
export function objectFootprint(item) { const a=item.rotation*Math.PI/180,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));return {width:item.width*c+item.depth*s,depth:item.width*s+item.depth*c}; }


function text(value,max){return String(value).replace(/[<>]/g,'').slice(0,max)}
function safeId(value){return typeof value==='string'?value.replace(/[^a-z0-9_-]/gi,'').slice(0,96):''}
export function newMapId(){return 'map_'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2))}
function legacyMapId(value){let h=2166136261;for(const c of JSON.stringify(value)){h=Math.imul(h^c.charCodeAt(0),16777619)}return 'map_legacy_'+(h>>>0).toString(16)}

function angle(v){return Number((((v%360)+360)%360).toFixed(6))}
