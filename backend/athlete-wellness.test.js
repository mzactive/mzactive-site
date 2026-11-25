import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import worker from './worker.js';
import {cleanWellness} from './athlete-wellness.js';
test('private wellness entries are isolated by athlete and can be deleted',async()=>{
 const db=new DatabaseSync(':memory:'),dir=new URL('./migrations/',import.meta.url);
 for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort((a,b)=>parseInt(a)-parseInt(b)))db.exec(readFileSync(new URL(file,dir),'utf8'));
 const env={DATA_COLLECTION_ENABLED:'true',PUBLIC_ORIGINS:'https://mzactive.com',DB:{prepare(sql){const stmt=db.prepare(sql);let args=[];return{bind(...v){args=v;return this},first(){return stmt.get(...args)},all(){return{results:stmt.all(...args)}},run(){return{meta:stmt.run(...args)}}}}}};
 async function user(id,coach=false){const now=new Date().toISOString();db.prepare('INSERT INTO users(id,email,password_hash,role,created_at) VALUES(?,?,?,?,?)').run(id,id+'@example.test','test','provider',now);if(coach)db.prepare('INSERT INTO provider_profiles(id,user_id,provider_type,display_name,city,bio,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id+'-profile',id,'coach',id,'Doha','bio','approved',now,now);const token=id+'-wellness-token-12345678901234567890';const hash=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(hash,id,Math.floor(Date.now()/1000)+600,now);return token}
 async function call(path,method,token,body,expected=200){const res=await worker.fetch(new Request('https://api.example.test/api/dashboard/wellness'+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env);const raw=await res.text();assert.equal(res.status,expected,raw);return JSON.parse(raw)}
 const a=await user('athlete-a'),b=await user('athlete-b'),c=await user('coach-a',true),date='2026-11-25',query='?date='+date;
 const pacer=await user('pacer-a');db.prepare('INSERT INTO pacer_profiles(id,user_id,display_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('pacer-profile','pacer-a','Pacer','pacer@example.test',new Date().toISOString(),new Date().toISOString());await call(query,'GET',pacer,undefined,403);await call(query,'GET',undefined,undefined,401);await call(query,'GET',c,undefined,403);
 const meal={id:'meal-a',date,kind:'meal',name:'Lunch',calories:400,protein:20,carbs:null,fat:10,athlete_user_id:'athlete-b'};
 const saved=await call('','POST',a,meal,201);assert.equal(saved.entry.athlete_user_id,undefined);assert.equal(saved.entry.carbs,null);
 await call('','POST',a,meal,409);assert.equal((await call(query,'GET',b)).entries.length,0);
 await call('/meal-a','DELETE',b,undefined,404);await call(query,'GET',c,undefined,403);
 await call('','POST',a,{id:'checkin-a',date,kind:'checkin',sleep:8,water:2,weight:null,notes:'rested'},201);
 assert.equal((await call(query,'GET',a)).entries.length,2);await call('/meal-a','DELETE',a);assert.equal((await call(query,'GET',a)).entries.length,1);
});
test('malformed values and impossible dates rejected',()=>{
 assert.throws(()=>cleanWellness({id:'a',date:'2026-02-31',kind:'meal',name:'A'}));
 assert.throws(()=>cleanWellness({id:'a',date:'2026-11-25',kind:'checkin',sleep:25}));
 assert.throws(()=>cleanWellness({id:'a',date:'2026-11-25',kind:'meal',name:'A',protein:-1}));
 assert.equal(cleanWellness({id:'a',date:'2026-11-25',kind:'meal',name:'A'}).calories,null);
});
