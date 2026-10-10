import {groundParts} from './map-ground.js';
// Shared, dependency-free shape expansion. Local +Y rotation matches Three.js.
export function objectCollider(item){const angle=item.rotation*Math.PI/180,quarter=Math.abs(item.rotation/90-Math.round(item.rotation/90))<1e-8,swap=Math.round(item.rotation/90)%2!==0;return {id:item.id,x:item.x,z:item.z,w:quarter&&swap?item.depth:item.width,d:quarter&&swap?item.width:item.depth,bottom:item.y,top:item.y+item.height,...(!quarter?{yaw:angle}:{})};}
export function expandObject(o){
 if(o.type==='spawn'||o.type==='zone')return [];
 const a=o.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),out=[];
 const box=(x,z,w,d,bottom,top)=>out.push({id:o.id,x:o.x+c*x+s*z,z:o.z-s*x+c*z,w,d,bottom:o.y+bottom,top:o.y+top,yaw:a,color:o.color,type:o.type});
 if(o.type==='ramp')return [{id:o.id,kind:'ramp',x:o.x,z:o.z,w:o.width,d:o.depth,bottom:o.y,top:o.y+o.height,yaw:a,dir:o.dir||'N',color:o.color,type:o.type}];
 if(o.type==='stairs'){const count=Math.ceil(o.height/Math.min(.55,o.stepHeight||.5)),east=['E','W'].includes(o.dir),length=east?o.width:o.depth,sign=['N','W'].includes(o.dir||'N')?-1:1;for(let i=0;i<count;i++){const p=sign*(-length/2+length/count*(i+.5));box(east?p:0,east?0:p,east?length/count:o.width,east?o.depth:length/count,0,(i+1)*o.height/count)}return out;}
 if(o.type==='arch'||o.type==='window'){if(o.height<.6||o.width<.6){box(0,0,o.width,o.depth,0,o.height);return out;}const ow=Math.min(o.width-.4,o.openingWidth||o.width*.55),sill=o.type==='window'?Math.min(o.height-.4,o.sillHeight??1):0,oh=Math.min(o.height-sill-.2,o.openingHeight||o.height*.65),post=(o.width-ow)/2;box(-(ow+post)/2,0,post,o.depth,0,o.height);box((ow+post)/2,0,post,o.depth,0,o.height);box(0,0,ow,o.depth,sill+oh,o.height);if(sill>0)box(0,0,ow,o.depth,0,sill);return out;}
 return [{...objectCollider(o),color:o.color,type:o.type}];
}
export function mapColliders(map){return [...map.objects,...groundParts(map)].flatMap(expandObject);}
