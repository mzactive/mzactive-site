import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';

function setup() {
  const db=new DatabaseSync(':memory:');
  const dir=new URL('./migrations/',import.meta.url);
  for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort((a,b)=>parseInt(a)-parseInt(b))) db.exec(readFileSync(new URL(file,dir),'utf8'));
  const env={DATA_COLLECTION_ENABLED:'true',ADMIN_EMAILS:'admin@example.test',ADMIN_SETUP_KEY:'local',RESEND_API_KEY:'test',EMAIL_FROM:'MZ Active <no-reply@example.test>',PUBLIC_ORIGINS:'https://mzactive.com',DB:{
    prepare(sql){const stmt=db.prepare(sql);let args=[];return{bind(...v){args=v;return this},first(){return stmt.get(...args)},all(){return{results:stmt.all(...args)}},run(){return{meta:stmt.run(...args)}}}},
    batch(items){db.exec('BEGIN');try{const out=items.map(i=>i.run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}},
  }};
  async function call(path,method='GET',body,token,expected=200,admin=false){
    const headers={};if(admin)headers['x-admin-setup-key']=env.ADMIN_SETUP_KEY;if(token)headers.authorization='Bearer '+token;if(body!==undefined)headers['content-type']='application/json';
    const response=await worker.fetch(new Request('https://example.test/api/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
    const raw=await response.text();assert.equal(response.status,expected,method+' '+path+' -> '+raw);return raw?JSON.parse(raw):{};
  }
  return {db,env,call};
}
const password='program-editor-test-password';
async function approvedCoach(call){
  const admin=await call('auth/register','POST',{email:'admin@example.test',password,consent:true},null,201,true);
  const coach=await call('auth/register','POST',{email:'coach@example.test',password,consent:true,provider_type:'coach',display_name:'Coach',city:'Doha'},null,201);
  const profileId=(await call('me/profile','GET',undefined,coach.token)).profile.id;
  await call('me/profile','PUT',{provider_type:'coach',display_name:'Coach',city:'Doha',specialties:['Running'],languages:['English'],bio:'A complete biography for review.',qualifications:'Certified',services:['Training plan'],coaching_mode:'both',program_durations:[1]},coach.token);
  const queue=await call('admin/applications','GET',undefined,admin.token);const app=queue.providers.find(p=>p.id===profileId);
  await call('admin/providers/'+profileId,'PATCH',{status:'approved',verified:true,review_version:app.updated_at},admin.token);
  return coach;
}

test('long programs save every session on the correct date and can be updated', async()=>{
  const {db,call}=setup();const coach=await approvedCoach(call);
  const payload={
    athlete_name:'Athlete',athlete_phone:'55555555',athlete_type:'running',duration_unit:'days',duration_value:10,
    start_date:'2026-11-23',coach_note:'10-day block',
    weeks:[
      {week_start:'2026-11-23',sessions:[{day_key:'monday',sport_type:'run',details:'Easy 5 km'}]},
      {week_start:'2026-11-30',sessions:[{day_key:'monday',sport_type:'strength',details:'Strength A'}]},
    ],
  };
  const saved=await call('dashboard/programs','POST',payload,coach.token,201);
  assert.equal(saved.duration_unit,'days');assert.equal(saved.end_date,'2026-12-02');assert.equal(saved.session_codes.length,2);
  const dates=db.prepare('SELECT session_date,details FROM athlete_program_sessions_v2 WHERE program_id=? ORDER BY sort_order').all(saved.id);
  assert.deepEqual(dates.map(x=>x.session_date),['2026-11-23','2026-11-30']);
  const updated=await call('dashboard/programs/'+saved.id,'PATCH',{...payload,duration_unit:'weeks',duration_value:4,weeks:[{week_start:'2026-11-23',sessions:[{day_key:'monday',sport_type:'run',details:'Easy 6 km'}]},{week_start:'2026-12-07',sessions:[{day_key:'monday',sport_type:'swim',details:'Swim technique'}]}]},coach.token);
  assert.equal(updated.status,'updated');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM athlete_program_sessions_v2 WHERE program_id=?').get(saved.id).count,2);
  assert.equal(db.prepare('SELECT details FROM athlete_program_sessions_v2 WHERE program_id=? ORDER BY sort_order LIMIT 1').get(saved.id).details,'Easy 6 km');
});

test('new MZActive athlete types are accepted and legacy types still load', async()=>{
  const {call}=setup();const coach=await approvedCoach(call);
  for(const athlete_type of ['running','cycling','swimming','fitness','strength','bodybuilding','hyrox','crossfit','general','running_strength','swim_bike','runner','triathlon']){
    const saved=await call('dashboard/programs','POST',{athlete_name:'Athlete',athlete_phone:'55555555',athlete_type,duration_unit:'weeks',duration_value:1,start_date:'2026-11-23',sessions:[{day_key:'monday',sport_type:'run',details:'Easy'}]},coach.token,201);
    assert.equal(saved.athlete_type,athlete_type);
  }
});

test('program drafts persist server-side for the coach', async()=>{
  const {call}=setup();const coach=await approvedCoach(call);
  const payload={duration_unit:'months',duration_value:3,start_date:'2026-11-23',weeks:[{week_start:'2026-11-23',sessions:[{day_key:'monday',sport_type:'run',details:'Draft run'}]}]};
  const saved=await call('dashboard/program-draft','PUT',{payload},coach.token);
  assert.equal(saved.saved,true);
  const loaded=await call('dashboard/program-draft','GET',undefined,coach.token);
  assert.equal(loaded.draft.duration_unit,'months');
  assert.equal(loaded.draft.weeks[0].sessions[0].details,'Draft run');
});
