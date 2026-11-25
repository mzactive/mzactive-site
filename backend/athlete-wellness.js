const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const idOK=s=>typeof s==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(s);
function numeric(v,max){if(v===null||v===undefined||v==='')return null;if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max)throw Error('invalid_entry');return v}
function str(v,max){if(typeof v!=='string'||v.length>max)throw Error('invalid_entry');return v.trim()}
export function cleanWellness(body){
 if(!body||!dateOK(body.date)||!idOK(body.id))throw Error('invalid_entry');
 let data;
 if(body.kind==='meal'){data={name:str(body.name,120),calories:numeric(body.calories,10000),protein:numeric(body.protein,1000),carbs:numeric(body.carbs,1000),fat:numeric(body.fat,1000)};if(!data.name)throw Error('invalid_entry')}
 else if(body.kind==='checkin'){data={sleep:numeric(body.sleep,24),water:numeric(body.water,20),weight:numeric(body.weight,500),notes:str(body.notes||'',500)};if(data.weight===0)throw Error('invalid_entry');if(!data.notes&&[data.sleep,data.water,data.weight].every(v=>v===null))throw Error('invalid_entry')}
 else throw Error('invalid_entry');
 return {id:body.id,date:body.date,kind:body.kind,...data};
}
export async function wellnessApi(request,env,user,reply,readJson,isMemberAccount){
 const send=(v,s=200)=>reply(request,env,v,s);
 if(!await isMemberAccount(env,user)||await env.DB.prepare('SELECT id FROM pacer_profiles WHERE user_id=?').bind(user.id).first())return send({error:'member_account_required'},403);
 const url=new URL(request.url),base='/api/dashboard/wellness';
 if(url.pathname===base&&request.method==='GET'){
  const date=url.searchParams.get('date');
  if(!dateOK(date))return send({error:'invalid_date'},400);
  const rows=await env.DB.prepare('SELECT payload_json FROM athlete_wellness_entries WHERE athlete_user_id=? AND entry_date=? ORDER BY created_at').bind(user.id,date).all();
  return send({version:1,entries:(rows.results||[]).map(x=>JSON.parse(x.payload_json))});
 }
 if(url.pathname===base&&request.method==='POST'){
  let entry;try{entry=cleanWellness(await readJson(request))}catch{return send({error:'invalid_entry'},400)}
  const now=new Date().toISOString();
  const result=await env.DB.prepare('INSERT INTO athlete_wellness_entries(athlete_user_id,entry_id,entry_date,kind,payload_json,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM athlete_wellness_entries WHERE athlete_user_id=? AND entry_date=?)<100 ON CONFLICT(athlete_user_id,entry_id) DO NOTHING').bind(user.id,entry.id,entry.date,entry.kind,JSON.stringify(entry),now,user.id,entry.date).run();
  if(!result.meta?.changes)return send({error:'duplicate_or_daily_limit'},409);
  return send({entry},201);
 }
 const m=/^\/api\/dashboard\/wellness\/([a-zA-Z0-9-]{1,80})$/.exec(url.pathname);
 if(m&&request.method==='DELETE'){
  const result=await env.DB.prepare('DELETE FROM athlete_wellness_entries WHERE athlete_user_id=? AND entry_id=?').bind(user.id,m[1]).run();
  return result.meta?.changes?send({deleted:true}):send({error:'not_found'},404);
 }
 return send({error:'not_found'},404);
}
