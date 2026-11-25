/* A private, owner-scoped, revision-checked library. Never shares athlete data. */
const kinds=new Set(['exercise','workout','program']);
const categories=new Set(['strength','core','run','mobility','bike','swim','recovery']);
const sports=new Set(['strength','run','bike','swim','recovery','other']);
const idOK=x=>typeof x==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(x);
function cleanText(v,max,required=false){
 if(v==null&&!required)return '';
 if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw Error('invalid_library_item');
 return v.trim();
}
function exercise(x){
 if(!x||!idOK(x.id)||!categories.has(x.category))throw Error('invalid_library_item');
 const videoId=cleanText(x.videoId,11);if(videoId&&!/^[A-Za-z0-9_-]{11}$/.test(videoId))throw Error('invalid_library_item');
 return {id:x.id,category:x.category,en:cleanText(x.en,120,true),ar:cleanText(x.ar,120,true),muscle:cleanText(x.muscle,120),equipment:cleanText(x.equipment,120),...(videoId?{videoId}:{})};
}
function workout(x){
 if(!x||!idOK(x.id)||!sports.has(x.sport)||!Array.isArray(x.exercises)||x.exercises.length>20)throw Error('invalid_library_item');
 const result={id:x.id,title:cleanText(x.title,120,true),sport:x.sport,km:cleanText(x.km,12),minutes:cleanText(x.minutes,12),notes:cleanText(x.notes,1000),exercises:x.exercises.map(e=>{
  const value=exercise(e);
  for(const k of ['sets','reps','weight','distance','duration','pace','rest'])value[k]=cleanText(e[k],32);
  return value;
 })};
 if(!result.notes&&!result.exercises.length)throw Error('invalid_library_item');
 return result;
}
export function cleanLibraryItem(kind,id,body){
 if(!kinds.has(kind)||!idOK(id)||!body||body.id!==id)throw Error('invalid_library_item');
 if(kind==='exercise')return exercise(body);
 if(kind==='workout')return workout(body);
 if(!Array.isArray(body.sessions)||!body.sessions.length||body.sessions.length>35)throw Error('invalid_library_item');
 return {id,name:cleanText(body.name,100,true),sessions:body.sessions.map(s=>{
  if(!Number.isInteger(s.offset)||s.offset<0||s.offset>6)throw Error('invalid_library_item');
  return {...workout(s),offset:s.offset};
 })};
}
const unpack=row=>({kind:row.kind,id:row.item_id,revision:row.revision,updated_at:row.updated_at,item:JSON.parse(row.payload_json)});
export async function coachLibraryApi(request,env,user,reply,readJson){
 const send=(body,status=200)=>reply(request,env,body,status);
 const profile=user.role==='provider'&&await env.DB.prepare("SELECT id FROM provider_profiles WHERE user_id=? AND status='approved' AND provider_type IN ('coach','bodybuilding_coach')").bind(user.id).first();
 if(!profile)return send({error:'approved_coach_required'},403);
 const path=new URL(request.url).pathname,base='/api/dashboard/coach-library';
 if(path===base&&request.method==='GET'){
  const rows=await env.DB.prepare('SELECT kind,item_id,payload_json,revision,updated_at FROM coach_library_items WHERE coach_user_id=? ORDER BY kind,item_id').bind(user.id).all();
  return send({library_version:1,video_links:true,items:(rows.results||[]).map(unpack)});
 }
 const match=/^\/api\/dashboard\/coach-library\/(exercise|workout|program)\/([a-zA-Z0-9-]{1,80})$/.exec(path);
 if(!match||!['PUT','DELETE'].includes(request.method))return send({error:'not_found'},404);
 const [,kind,id]=match,body=await readJson(request),revision=body?.revision;
 if(!Number.isInteger(revision)||revision<0||revision>2147483646)return send({error:'invalid_revision'},400);
 const key=[user.id,kind,id];
 if(request.method==='DELETE'){
  if(!revision)return send({error:'invalid_revision'},400);
  const result=await env.DB.prepare('DELETE FROM coach_library_items WHERE coach_user_id=? AND kind=? AND item_id=? AND revision=?').bind(...key,revision).run();
  if(!result.meta?.changes)return send({error:'library_conflict'},409);
  return send({deleted:true});
 }
 let item;try{item=cleanLibraryItem(kind,id,body.item)}catch{return send({error:'invalid_library_item'},400)}
 const json=JSON.stringify(item);
 if(new TextEncoder().encode(json).length>14000)return send({error:'library_item_too_large'},400);
 const now=new Date().toISOString();
 if(revision===0){
  const limit=kind==='program'?40:150;
  const result=await env.DB.prepare('INSERT INTO coach_library_items(coach_user_id,kind,item_id,payload_json,revision,updated_at) SELECT ?,?,?,?,1,? WHERE (SELECT COUNT(*) FROM coach_library_items WHERE coach_user_id=? AND kind=?) < ? ON CONFLICT(coach_user_id,kind,item_id) DO NOTHING').bind(...key,json,now,user.id,kind,limit).run();
  if(!result.meta?.changes)return send({error:'library_conflict_or_limit'},409);
 }else{
  const result=await env.DB.prepare('UPDATE coach_library_items SET payload_json=?,revision=revision+1,updated_at=? WHERE coach_user_id=? AND kind=? AND item_id=? AND revision=?').bind(json,now,...key,revision).run();
  if(!result.meta?.changes)return send({error:'library_conflict'},409);
 }
 return send({item,kind,id,revision:revision+1,updated_at:now});
}
