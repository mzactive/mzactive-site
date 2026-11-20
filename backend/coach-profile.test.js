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
    const headers = {'x-admin-setup-key':'local-test'};
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
  const saved = await call('bookings','POST',booking,null,201);
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
  db.close();
});
