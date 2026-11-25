import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';
import { cleanLibraryItem } from './coach-library.js';
const now=new Date().toISOString();
const movement={id:'custom-one',category:'strength',en:'Band walk',ar:'مشي بالمطاط',muscle:'Glutes',equipment:'Band'};
const workout={id:'workout-one',title:'Strength',sport:'strength',km:'',minutes:'25',notes:'Controlled',exercises:[{...movement,sets:'3',reps:'12',weight:'',distance:'',duration:'',pace:'',rest:'45'}]};
const program={id:'program-one',name:'Week A',sessions:[{...workout,offset:2,date:'2026-11-25'}]};
function setup(){
 const db=new DatabaseSync(':memory:');
 const dir=new URL('./migrations/',import.meta.url);
 for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort((a,b)=>parseInt(a)-parseInt(b)))db.exec(readFileSync(new URL(file,dir),'utf8'));
 const env={DATA_COLLECTION_ENABLED:'true',PUBLIC_ORIGINS:'https://mzactive.com',DB:{prepare(sql){const stmt=db.prepare(sql);let args=[];return{bind(...v){args=v;return this},first(){return stmt.get(...args)},all(){return{results:stmt.all(...args)}},run(){return{meta:stmt.run(...args)}}}}}};
 async function user(id,type,status='approved'){
  db.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)').run(id,id+'@example.test','test','provider',now);
  if(type)db.prepare('INSERT INTO provider_profiles(id,user_id,provider_type,display_name,city,bio,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id+'-profile',id,type,id,'Doha','bio',status,now,now);
  const token=id+'-test-token-12345678901234567890';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const hash=btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(hash,id,Math.floor(Date.now()/1000)+600,now);
  return token;
 }
 async function call(path,method='GET',body,token,expected=200){
  const response=await worker.fetch(new Request('https://api.example.test/api/dashboard/coach-library'+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env);
  const raw=await response.text();assert.equal(response.status,expected,method+' '+path+' '+raw);return JSON.parse(raw);
 }
 return {db,user,call};
}
test('server library scopes records to coach, protects revisions, and preserves other accounts',async()=>{
 const {user,call,db}=setup();
 const a=await user('coach-a','coach'),b=await user('coach-b','bodybuilding_coach');
 const pending=await user('pending','coach','pending'),member=await user('member',null),nutrition=await user('nutrition','nutritionist');
 await call('','GET',undefined,undefined,401);
 for(const token of [pending,member,nutrition])await call('','GET',undefined,token,403);
 assert.deepEqual((await call('','GET',undefined,a)).items,[]);
 for(const [kind,item] of [['exercise',movement],['workout',workout],['program',program]]){
  const r=await call('/'+kind+'/'+item.id,'PUT',{revision:0,item},a);assert.equal(r.revision,1);
 }
 assert.equal((await call('','GET',undefined,a)).items.length,3);
 assert.deepEqual((await call('','GET',undefined,b)).items,[]);
 await call('/workout/'+workout.id,'DELETE',{revision:1},b,409);
 await call('/workout/'+workout.id,'PUT',{revision:1,item:{...workout,title:'Other coach attempt'}},b,409);
 const next=await call('/workout/'+workout.id,'PUT',{revision:1,item:{...workout,title:'Updated'}},a);
 assert.equal(next.revision,2);
 await call('/workout/'+workout.id,'PUT',{revision:1,item:workout},a,409);
 await call('/workout/'+workout.id,'DELETE',{revision:1},a,409);
 assert.equal((await call('/workout/'+workout.id,'DELETE',{revision:2},a)).deleted,true);
 assert.equal(db.prepare('SELECT count(*) AS n FROM coach_library_items').get().n,2);
 const saved=(await call('','GET',undefined,a)).items.find(x=>x.kind==='program');
 assert.equal(saved.item.sessions[0].offset,2);assert.equal(saved.item.sessions[0].date,undefined);
});
test('schema removes unrecognized private fields and rejects malformed records',()=>{
 assert.equal(cleanLibraryItem('workout',workout.id,{...workout,athlete_user_id:'private'}).athlete_user_id,undefined);
 assert.throws(()=>cleanLibraryItem('exercise','different',movement));
 assert.throws(()=>cleanLibraryItem('program',program.id,{...program,sessions:[{...workout,offset:7}]}));
 assert.throws(()=>cleanLibraryItem('workout',workout.id,{...workout,exercises:[{...movement,sets:3}]}));
});
