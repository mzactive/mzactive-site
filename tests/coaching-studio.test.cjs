const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'dashboard.html'),'utf8');
test('all inline and studio JavaScript parses',()=>{for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Function(m[1]);new Function(fs.readFileSync(path.join(root,'assets/js/coaching-studio.js'),'utf8'));new Function(fs.readFileSync(path.join(root,'assets/js/program-document.js'),'utf8'))});
const marker="$('whatsappTrainingForm').addEventListener('submit',async event=>{";
const start=html.indexOf(marker)+marker.length,body=html.slice(start,html.indexOf('\n    });',start));
const readableStart=html.indexOf('    function readableWorkout('),readableEnd=html.indexOf('    function programWhatsAppUrl(',readableStart);
const readable=new Function(html.slice(readableStart,readableEnd)+';return readableWorkout')();
for(const scenario of ['save-only','share','save-fails','refresh-fails','repeat'])test(scenario,async()=>{
  const controls=[{disabled:false},{disabled:false}],fallback={classList:{add(){},remove(){}},removeAttribute(){},textContent:''},events=[];let opened=0,previewed=0;
  const values={trainingClientName:'Example athlete',trainingClientPhone:'12345678',trainingWeekStart:'2026-11-16',programTeam:'',programAthlete:'',athleteType:'runner',weeklyCoachNote:'Comfortable effort'};
  const $=id=>id==='whatsappFallback'?fallback:id==='publicProfileLink'?{classList:{contains:()=>true}}:id==='welcome'?{textContent:'Coach Sara'}:{value:values[id]};
  const details='Easy run\n[MZ:{"km":8,"minutes":45}]\nKeep it easy';
  const card={querySelector:()=>({value:'run'}),querySelectorAll:()=>[]};
  const document={querySelector:s=>({value:s.includes('monday')?details:'',closest:()=>card}),dispatchEvent:e=>events.push(e.type)};
  const api=async(p,options)=>{if(scenario==='save-fails')throw Error('offline');return{session_codes:[{day_key:'monday',sport_type:'run',session_code:'MON-R01',details}]}};
  const payload={weeks:[{days:[{title:'Easy run',lines:['8 km at 6:10/km'],distance:'8 km',duration:'45 min'}]}]};
  const doc={fromForm:()=>payload,save(){},textFallbackUrl:()=> 'https://wa.me/97412345678?text=...'};
  const window={open:()=>{opened++;return null},MZAProgramDocument:doc,MZActiveStudio:{openDocumentPreview(){previewed++}}};
  const handler=new Function('$','whatsappDigits','notice','w','lang','document','window','api','loadDashboard','readableWorkout','Event',`let savedProgramCache=null;return async function(event){${body}}`)($,v=>'974'+v,()=>{},()=>({programSaved:'Saved',trainingFallback:'Open WhatsApp'}),'en',document,window,api,async()=>{if(scenario==='refresh-fails')throw Error('offline')},readable,class{constructor(type){this.type=type}});
  const event={preventDefault(){},submitter:{value:scenario==='save-only'?'save':''},currentTarget:{querySelectorAll:()=>controls}};
  await handler(event);if(scenario==='repeat')await handler(event);
  assert.ok(controls.every(c=>!c.disabled));
  assert.equal(opened,0,'no plain-text WhatsApp popup is opened');
  if(scenario==='save-fails'){assert.equal(events.length,0);return}
  assert.ok(events.includes('mzactive:program-saved'));
  if(scenario==='save-only'){assert.equal(previewed,0);assert.equal(fallback.href,undefined);return}
  assert.equal(previewed,scenario==='repeat'?2:1,'the professional document is previewed before WhatsApp sharing');
  assert.equal(fallback.href,undefined,'no plain-text wa.me link is produced for the main share path');
});

test('Owner, coach, provider and booking pages include mobile viewports and responsive CSS',()=>{
  for(const file of ['admin.html','dashboard.html','providers.html','pacer.html']){
   const source=fs.readFileSync(path.join(root,file),'utf8');
   assert.match(source,/name="viewport"/);
  }
  const admin=fs.readFileSync(path.join(root,'assets/css/admin.css'),'utf8');
  assert.match(admin,/@media\(max-width:760px\)/);
  const dashboard=fs.readFileSync(path.join(root,'dashboard.html'),'utf8');
  assert.match(dashboard,/@media\(max-width:720px\)/);
  const booking=fs.readFileSync(path.join(root,'pacer.html'),'utf8');
  assert.match(booking,/bookingForm|booking-form|<form/i);
});
