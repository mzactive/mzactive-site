import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import worker from './worker.js';

test('registered coach can publish, book, edit and re-submit a moderated profile with private images',async () => {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('./migrations/',import.meta.url);
  const files = readdirSync(migrations).filter(f=>f.endsWith('.sql')).sort((a,b)=>parseInt(a)-parseInt(b));
  for (const f of files) db.exec(readFileSync(new URL(f,migrations),'utf8'));
  const env = { DATA_COLLECTION_ENABLED:'true', ADMIN_EMAILS:'admin@example.test', ADMIN_SETUP_KEY:'local-test',
    DB:{
      prepare(sql) {
        const stmt = db.prepare(sql);
        let args = [];
        return {
          bind(...values) { args = values.map(v=>v instanceof ArrayBuffer ? new Uint8Array(v) : v); return this; },
          first() { return stmt.get(...args); },
          all() { return {results:stmt.all(...args)}; },
          run() { return {meta:stmt.run(...args)}; }
        };
      },
      batch(statements) {
        db.exec('BEGIN');
        try { const result = statements.map(s=>s.run()); db.exec('COMMIT'); return result; }
        catch(e) { db.exec('ROLLBACK'); throw e; }
      }
    }
  };
  async function call(path,method='GET',body,token,expected=200) {
    const headers = body?.email===env.ADMIN_EMAILS ? {'x-admin-setup-key':'local-test'} : {};
    if(token) headers.authorization = 'Bearer ' + token;
    const request = new Request('https://example.test/api/'+path,{
      method,headers,body:body instanceof Uint8Array ? body : JSON.stringify(body)
    });
    const result = await worker.fetch(request,env);
    assert.equal(result.status,expected,method+' '+path);
    return result.headers.get('content-type').startsWith('image/') ? new Uint8Array(await result.arrayBuffer()) : result.json();
  }
  const signup = {password:'local-test-password',consent:true,provider_type:'coach'};
  const coach = (await call('auth/register','POST',{...signup,email:'coach@example.test'},null,201)).token;
  const admin = (await call('auth/register','POST',{...signup,email:env.ADMIN_EMAILS},null,201)).token;
  const id = (await call('me/profile','GET',undefined,coach)).profile.id;
  const path = 'providers/'+id;
  const edit = {provider_type:'coach',display_name:'Profile test',specialties:['Running'],languages:['Arabic'],
    bio:'Test biography',qualifications:'Test qualification',services:['Session'],coaching_mode:'both',
    whatsapp_number:'+97455555555',whatsapp_public:true,program_durations:[1]};
  await call('me/profile','PUT',edit,coach);
  const image = new Uint8Array(readFileSync(new URL('../assets/brand/mzactive-logo.webp',import.meta.url)));
  await call('me/profile/photo','PUT',image,coach);
  await call('me/profile/gallery/1','PUT',image,coach);
  await call(path,'GET',undefined,null,404);
  await call(path+'/gallery/1','GET',undefined,null,404);
  assert.deepEqual(await call('admin/'+path+'/gallery/1','GET',undefined,admin),image);
  const queue = await call('admin/applications','GET',undefined,admin);
  assert.equal(queue.providers[0].qualifications,edit.qualifications);
  const review = {status:'approved',verified:true,review_version:queue.providers[0].updated_at};
  await call('admin/'+path,'PATCH',{...review,review_version:'stale'},admin,409);
  await call('admin/'+path,'PATCH',review,admin);
  const {provider:p} = await call(path);
  assert.deepEqual(p.services,edit.services);
  assert.equal(p.verified,true);
  assert.equal(p.coaching_mode,'both');
  assert.equal(p.whatsapp_number,'97455555555');
  assert.deepEqual(p.gallery_slots,[1]);
  assert.deepEqual(await call(path+'/photo'),image);
  assert.deepEqual(await call(path+'/gallery/1'),image);
  const booking = {provider_id:id,customer_name:'Test booking',customer_phone:'55555555',city:'Doha',
    session_type:'training',goal_summary:'Test session',consent:true,program_duration_months:1};
  // Simulate the email provider without sending any real messages.
  const sent = [], originalFetch = globalThis.fetch;
  env.RESEND_API_KEY = 'test-only-key'; env.EMAIL_FROM = 'MZ Active <test@example.test>';
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://api.resend.com/emails');
    sent.push(JSON.parse(options.body));
    return new Response(JSON.stringify({id:'test-email-id'}), {status:200,headers:{'content-type':'application/json'}});
  };
  let saved;
  try { saved = await call('bookings','POST',booking,null,201); }
  finally { globalThis.fetch = originalFetch; delete env.RESEND_API_KEY; delete env.EMAIL_FROM; }
  assert.equal(sent.length,1);
  assert.ok(JSON.stringify(sent[0]).includes('coach@example.test'));
  assert.ok(JSON.stringify(sent[0]).includes(saved.request_id));
  assert.ok((await call('dashboard/bookings','GET',undefined,coach)).bookings.some(b=>b.id===saved.request_id));
  assert.ok((await call('dashboard/notifications','GET',undefined,coach)).notifications.some(n=>n.entity_id===saved.request_id && n.type==='booking_received'));

  const row = db.prepare('SELECT provider_id,status FROM booking_requests WHERE id=?').get(saved.request_id);
  assert.equal(row.provider_id,id); assert.equal(row.status,'received');
  await call('admin/bookings/'+saved.request_id,'PATCH',{status:'accepted'},admin);
  assert.equal(db.prepare('SELECT status FROM booking_requests WHERE id=?').get(saved.request_id).status,'accepted');
  await call('me/profile/gallery/1','PUT',new Uint8Array(),coach);
  await call(path,'GET',undefined,null,404);
  await call('me/profile','PUT',{...edit,public_fields:['bio']},coach);
  await call('admin/'+path,'PATCH',{status:'approved'},admin);
  const {provider:updated} = await call(path);
  assert.equal(updated.verified,false); assert.equal(updated.whatsapp_number,null);
  assert.deepEqual(updated.gallery_slots,[]); assert.equal(updated.has_profile_photo,0);
  const privateBooking = await call('bookings','POST',{...booking,program_duration_months:null},null,201);
  assert.equal(privateBooking.provider_whatsapp,null);
  await call('admin/athletes','GET',undefined,coach,403);
  await call('admin/history','GET',undefined,null,401);
  await call('auth/login','POST',{email:env.ADMIN_EMAILS,password:signup.password});
  await call('admin/bookings/'+saved.request_id,'PATCH',{status:'cancelled'},admin);
  await call('admin/bookings/'+saved.request_id,'PATCH',{status:'accepted'},admin,409);
  const member = await call('auth/register','POST',{...signup,email:'athlete@example.test',account_type:'member'},null,201);
  const plan = await call('dashboard/programs','POST',{athlete_name:'QA',athlete_phone:'+97455555555',athlete_type:'runner',week_start:'2026-11-23',sessions:[{day_key:'monday',sport_type:'run',details:'QA workout'}]},coach,201);
  assert.ok((await call('admin/athletes','GET',undefined,admin)).unlinked.some(p=>p.id===plan.id));
  await call('admin/programs/'+plan.id+'/athlete','PATCH',{athlete_id:member.user.id},admin);
  assert.equal((await call('dashboard','GET',undefined,member.token)).programs[0].sessions[0].details,'QA workout');
  await call('admin/programs/'+plan.id+'/athlete','PATCH',{athlete_id:member.user.id},admin,409);
  const event={scheduledTime:6*3600000};
  env.AI={run:async()=>({response:'Test recommendation'})};
  await worker.scheduled(event,env); await worker.scheduled(event,env);
  let brain=await call('admin/agents','GET',undefined,admin);
  assert.equal(brain.tasks.length,1);assert.equal(brain.pending.length,1);
  assert.equal(JSON.parse(brain.tasks[0].output_json).answer,'Test recommendation');
  await call('admin/agents/'+brain.tasks[0].id,'PATCH',{decision:'approved'},admin);
  await call('admin/agents/'+brain.tasks[0].id,'PATCH',{decision:'rejected'},admin,409);
  delete env.AI;
  await worker.scheduled({scheduledTime:8*3600000},env);
  brain=await call('admin/agents','GET',undefined,admin);
  assert.equal(brain.tasks.filter(t=>t.status==='failed').length,1);
  assert.equal(brain.pending.length,0);
  const history=await call('admin/history','GET',undefined,admin);
  assert.ok(history.events.some(e=>e.entity_type==='registration'));
  assert.ok(history.events.some(e=>e.entity_type==='booking_request'&&e.to_status==='received'));
  await call('admin/'+path,'PATCH',{status:'suspended'},admin);
  await call('me/profile','GET',undefined,coach,401);
  await call('auth/login','POST',{email:'coach@example.test',password:signup.password},null,403);
  await call('admin/'+path,'PATCH',{status:'approved'},admin);
  await call('auth/login','POST',{email:'coach@example.test',password:signup.password});
  db.close();
});
