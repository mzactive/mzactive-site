/* Standalone calendar-first coach workspace. Existing authenticated APIs are the source of truth. */
(()=>{'use strict';
const $=id=>document.getElementById(id),lib=window.MZAExerciseLibrary,video=window.MZAWorkoutVideo;
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const T=(en,ar)=>document.documentElement.lang==='ar'?ar:en;
const btn=(label,fn,cls)=>{const b=node('button',label,cls);b.type='button';b.onclick=fn;return b};
const dateOK=d=>typeof d==='string'&&/^\d{4}-\d\d-\d\d$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'));
const shift=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const mon=d=>shift(d,-((new Date(d+'T00:00:00Z').getUTCDay()+6)%7));
const today=()=>{const x=new Date();return [x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-')};
const fmt=(d,opts)=>new Intl.DateTimeFormat(T('en-GB','ar-QA'),{timeZone:'UTC',...opts}).format(new Date(d+'T00:00:00Z'));
const days=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const sports={run:['Running','الجري'],bike:['Cycling','الدراجات'],swim:['Swimming','السباحة'],strength:['Strength','القوة'],recovery:['Recovery','الاستشفاء'],other:['Other','أخرى']};
let owner='',session='',connections=[],programs=[],teams=[],selected='',week=mon(today()),screen='calendar',drafts={},templates=[],savedWorkouts=[],customExercises=[],busy=false,clipboard=null;
const valid=()=>owner&&session===window.MZActiveAuth.token();
const athlete=()=>connections.find(c=>c.id===selected);
let requests=[],myProfile=null;
function loadConnections(data){const own=(data.connections||[]).filter(c=>c.coach_user_id===owner&&c.athlete_user_id);connections=own.filter(c=>c.status==='accepted'&&c.workspace_status!=='closed');requests=own.filter(c=>c.status==='pending');if(selected&&!connections.some(c=>c.id===selected))selected='';}
const storageKey=()=>owner?'mza-studio-v2-draft:'+owner:'';
const templateKey=()=>owner?'mza-studio-v2-templates:'+owner:'';
const workoutKey=()=>owner?'mza-studio-v2-workouts:'+owner:'';
const customKey=()=>owner?'mza-studio-v2-exercises:'+owner:'';
const allExercises=()=>[...lib.catalog,...customExercises];
let libraryMode='local',libraryBusy=false,libraryRevisions=new Map(),libraryVideos=false;
const collections={exercise:()=>customExercises,workout:()=>savedWorkouts,program:()=>templates};
const localKeys={exercise:customKey,workout:workoutKey,program:templateKey};
const setCollection=(kind,items)=>{if(kind==='exercise')customExercises=items;else if(kind==='workout')savedWorkouts=items;else templates=items};
const revKey=(kind,id)=>kind+':'+id;
function libraryMessage(){return libraryMode==='server'?T('Saved to your MZA account.','يتم الحفظ في حساب MZA الخاص بك.'):libraryMode==='unavailable'?T('Account library unavailable. Editing is paused; reload to reconnect.','مكتبة الحساب غير متاحة. توقف التعديل مؤقتاً؛ أعد التحميل.'):T('Saved in this browser only. Account synchronization is not available yet.','الحفظ في هذا المتصفح فقط. مزامنة الحساب غير متاحة بعد.')}
function libraryError(message){notice(message,true);const d=$('dialog');if(d.open){let p=d.querySelector('.library-error');if(!p){p=node('p',undefined,'library-error info');p.setAttribute('role','alert');d.append(p)}p.textContent=message}}
async function loadAccountLibrary(){
 try{
  const r=await api('/api/dashboard/coach-library');
  if(r.library_version!==1||!Array.isArray(r.items))throw Error('library_unavailable');
  if(!valid())return;
  libraryMode='server';libraryVideos=r.video_links===true;libraryRevisions.clear();
  for(const kind of Object.keys(collections))setCollection(kind,[]);
  for(const row of r.items)if(collections[row.kind]&&row.item?.id===row.id&&Number.isInteger(row.revision)){collections[row.kind]().push(row.item);libraryRevisions.set(revKey(row.kind,row.id),row.revision)}
  try{localStorage.setItem('mza-studio-account-library:'+owner,'1')}catch{}
 }catch{
  if(read(localStorage,'mza-studio-account-library:'+owner,0)===1){libraryMode='unavailable';for(const kind of Object.keys(collections))setCollection(kind,[])}
 }
}
function collectVideoIds(item){return JSON.stringify([item.videoId||'',...(item.exercises||[]).map(e=>e.videoId||''),...(item.sessions||[]).flatMap(w=>[w.videoId||'',...(w.exercises||[]).map(e=>e.videoId||'')])])}
async function saveLibraryItem(kind,item,replace=false){
 if(!valid()||libraryBusy)return false;
 if(libraryMode==='unavailable'){libraryError(libraryMessage());return false}
 if(libraryMode==='server'&&!libraryVideos&&JSON.parse(collectVideoIds(item)).some(Boolean)){libraryError(T('Video storage requires the updated account library. Save your draft and try after the server update.','يتطلب حفظ الفيديو تحديث مكتبة الحساب. احفظ مسودتك وأعد المحاولة بعد تحديث الخادم.'));return false}
 const rows=collections[kind](),found=rows.find(x=>x.id===item.id);
 if((replace&&!found)||(!replace&&found)){libraryError(T('Library item already changed. Reload and retry.','تم تغيير العنصر. أعد التحميل والمحاولة.'));return false}
 const next=replace?rows.map(x=>x.id===item.id?item:x):[...rows,item];
 if(next.length>(kind==='program'?40:150)){libraryError(T('Library item limit reached.','تم بلوغ الحد الأقصى لعناصر المكتبة.'));return false}
 if(libraryMode==='local'){if(!write(localStorage,localKeys[kind](),next))return false;setCollection(kind,next);return true}
 libraryBusy=true;
 try{
  const r=await api('/api/dashboard/coach-library/'+kind+'/'+encodeURIComponent(item.id),'PUT',{revision:replace?libraryRevisions.get(revKey(kind,item.id)):0,item});
  if(!valid()||r.item?.id!==item.id||!Number.isInteger(r.revision))throw Error('save_not_confirmed');
  if(collectVideoIds(item)!==collectVideoIds(r.item))throw Error('video_sync_unsupported');
  libraryRevisions.set(revKey(kind,item.id),r.revision);setCollection(kind,next.map(x=>x.id===item.id?r.item:x));return true;
 }catch{libraryError(T('Account save not confirmed. Reload and retry; your unsaved entry is still open.','لم يتم تأكيد الحفظ في الحساب. أعد التحميل والمحاولة؛ الإدخال غير المحفوظ لا يزال مفتوحاً.'));return false}finally{libraryBusy=false}
}
async function deleteLibraryItem(kind,item){
 if(!valid()||libraryBusy)return false;
 if(libraryMode==='unavailable'){libraryError(libraryMessage());return false}
 const next=collections[kind]().filter(x=>x.id!==item.id);
 if(libraryMode==='local'){if(!write(localStorage,localKeys[kind](),next))return false;setCollection(kind,next);return true}
 libraryBusy=true;
 try{const r=await api('/api/dashboard/coach-library/'+kind+'/'+encodeURIComponent(item.id),'DELETE',{revision:libraryRevisions.get(revKey(kind,item.id))});if(!valid()||r.deleted!==true)throw Error('delete_not_confirmed');libraryRevisions.delete(revKey(kind,item.id));setCollection(kind,next);return true}
 catch{libraryError(T('Delete not confirmed. Reload before trying again.','لم يتم تأكيد الحذف. أعد التحميل قبل المحاولة.'));return false}finally{libraryBusy=false}
}
function browserLibraryItems(kind){const items=read(localStorage,localKeys[kind](),[]);return Array.isArray(items)?items:[]}
function renderLibraryStorage(){
 const bar=node('div',undefined,'library-storage');bar.append(node('span',libraryMessage(),'info'));
 if(libraryMode==='server'&&Object.keys(collections).some(k=>browserLibraryItems(k).length)){
  bar.append(btn(T('Import browser library','استيراد مكتبة المتصفح'),async()=>{
   if(!confirm(T('Import reusable items from this browser? Existing account items will not be overwritten.','استيراد عناصر هذا المتصفح؟ لن يتم استبدال عناصر الحساب الحالية.')))return;
   if(libraryBusy)return;
   let failed=0,imported=0;
   for(const kind of Object.keys(collections)){
    const remaining=[];
    for(const item of browserLibraryItems(kind)){
     if(collections[kind]().some(x=>x.id===item.id)){remaining.push(item);continue}
     if(await saveLibraryItem(kind,item)){imported++}else{remaining.push(item);failed++}
    }
    write(localStorage,localKeys[kind](),remaining);
   }
   if(valid()){render();notice(T('Imported: ','تم الاستيراد: ')+imported+T(' · Unconfirmed: ',' · غير المؤكد: ')+failed,failed>0)}
  }));
 }
 return bar;
}
function notice(msg='',error=false){$('notice').textContent=msg;$('notice').classList.toggle('error',error)}
async function api(path,method='GET',payload){const tok=window.MZActiveAuth.token();if(!tok)throw Error('sign_in_required');const headers={authorization:'Bearer '+tok};if(payload!==undefined)headers['content-type']='application/json';const r=await fetch(window.MZACTIVE_API_BASE+path,{method,headers,cache:'no-store',...(payload===undefined?{}:{body:JSON.stringify(payload)})});let data={};try{data=await r.json()}catch{}if(tok!==window.MZActiveAuth.token())throw Error('session_changed');if(!r.ok){const error=Error(data.error||'request_failed');error.status=r.status;throw error}return data}
function field(label,input){const l=node('label',undefined,'field');l.append(node('span',label),input);return l}
function input(type='text',value=''){const x=node('input');x.type=type;x.value=value;return x}
function read(store,key,fallback){try{return JSON.parse(store.getItem(key)||'null')||fallback}catch{return fallback}}
function write(store,key,value){try{store.setItem(key,JSON.stringify(value));return true}catch{notice(T('Browser storage unavailable. Keep this page open.','تعذر الحفظ في المتصفح. أبق الصفحة مفتوحة.'),true);return false}}
function persist(){if(valid())write(sessionStorage,storageKey(),drafts)}
function key(){return selected+'|'+week}
function draft(){const k=key();if(!drafts[k])drafts[k]={sessions:[],pending:''};return drafts[k]}
function ownDraft(){return draft().sessions}
function parse(s){const lines=String(s.details||'').split('\n');let m={};if(lines[1]?.startsWith('[MZ:')){try{m=JSON.parse(lines[1].slice(4,-1))}catch{}return{title:lines[0],km:m.km||'',minutes:m.minutes||'',exerciseLength:m.exerciseLength,videoId:m.workoutVideoId,notes:lines.slice(2).join('\n')}}return{title:lines[0],notes:lines.slice(1).join('\n'),km:'',minutes:''}}
function published(){const a=athlete();if(!a)return[];return programs.filter(p=>p.athlete_user_id===a.athlete_user_id).flatMap(p=>(p.sessions||[]).map(s=>({...s,date:dateOK(s.session_date)?s.session_date:dateOK(p.week_start)&&days.includes(s.day_key)?shift(mon(p.week_start),days.indexOf(s.day_key)):'',programId:p.id}))).filter(s=>dateOK(s.date))}
function heading(title,sub){const r=node('div',undefined,'heading'),l=node('div');l.append(node('h1',title),node('p',sub));r.append(l);return r}
function titleDialog(title){const d=$('dialog');d.classList.remove('library-drawer');d.replaceChildren();const top=node('div',undefined,'dialog-top'),h=node('h2',title);h.id='dialogTitle';top.append(h,btn(T('Close','إغلاق'),()=>{if(!busy&&!libraryBusy)d.close()}));d.append(top);return d}
function openDialog(d){if(!d.open)d.showModal()}
function selectAthlete(id){if(!valid()||busy||libraryBusy)return;if(id&&!connections.some(c=>c.id===id))return;selected=id;clipboard=null;screen='calendar';notice();render()}
function changeScreen(name){if(busy||libraryBusy)return;screen=name;notice();render()}
function renderNav(){const items=[['calendar','▦',T('Calendar','التقويم')],['athletes','◎',T('Athletes & teams','الرياضيون والفرق')],['exercises','▤',T('Exercises','التمارين')],['sessions','▧',T('Workout library','مكتبة الحصص')],['templates','▧',T('Programs & templates','البرامج والقوالب')],['progress','↗',T('Progress','الأداء')],['profile','◎',T('My profile','ملفي الشخصي')]];$('nav').replaceChildren();for(const [id,icon,label] of items){const b=btn(icon+'  '+label,()=>changeScreen(id));b.dataset.screen=id;b.setAttribute('aria-current',screen===id?'page':'false');$('nav').append(b)}}
function render(){if(!valid())return;renderNav();$('screen').replaceChildren();if(['exercises','sessions','templates'].includes(screen))$('screen').append(renderLibraryStorage());({calendar:renderCalendar,athletes:renderAthletes,exercises:renderExercises,sessions:renderSavedWorkouts,templates:renderTemplates,progress:renderProgress,profile:renderProfile}[screen])()}
function renderCalendar(){const host=$('screen'),a=athlete(),h=heading(T('Training calendar','تقويم التدريب'),T('Plan privately or select an athlete to assign training.','خطط بشكل خاص أو اختر رياضياً لتعيين التدريب.'));host.append(h);
const tools=node('div',undefined,'toolbar'),pick=node('select');pick.id='athleteSelect';pick.append(new Option(T('Private planning — no athlete required','تخطيط خاص — دون رياضي'),''));for(const c of connections)pick.append(new Option(c.athlete_name||T('Athlete','رياضي'),c.id));pick.value=selected;pick.disabled=busy;pick.onchange=()=>selectAthlete(pick.value);
const label=field(T('Calendar for','تقويم'),pick);label.classList.add('grow');tools.append(label,btn('‹',()=>{week=shift(week,-7);render()}),node('strong',fmt(week,{day:'numeric',month:'short'})+' – '+fmt(shift(week,6),{day:'numeric',month:'short',year:'numeric'})),btn('›',()=>{week=shift(week,7);render()}),btn(T('Today','اليوم'),()=>{week=mon(today());render()}));
tools.children[1].setAttribute('aria-label',T('Previous week','الأسبوع السابق'));tools.children[3].setAttribute('aria-label',T('Next week','الأسبوع التالي'));host.append(tools);
if(!a){const intro=node('div',undefined,'planning-banner');const copy=node('div');copy.append(node('strong',T('Your private planning calendar','تقويم التخطيط الخاص بك')),node('p',T('Build and test a week, save it as a reusable program, or copy it to an athlete later. Nothing is sent from this calendar.','أنشئ أسبوعاً واختبره واحفظه كقالب أو انسخه إلى رياضي لاحقاً. لا يُرسل شيء من هذا التقويم.'),'muted'));intro.append(copy,btn(T('My athletes','رياضيوني'),()=>changeScreen('athletes')));host.append(intro)}
const d=draft(),rows=published(),grid=node('div',undefined,'week');grid.id='calendarGrid';
for(let i=0;i<7;i++){const date=shift(week,i),col=node('section',undefined,'day'+(date===today()?' today':''));col.dataset.date=date;const top=node('div',undefined,'day-head');top.append(node('span',fmt(date,{weekday:'short'})),node('b',fmt(date,{day:'numeric'})));col.append(top);
for(const s of rows.filter(s=>s.date===date)){const p=parse(s),card=btn('',()=>viewPublished(s),'workout planned'+(s.completed_at?' done':''));card.append(node('small',T(...(sports[s.sport_type]||sports.other))),node('b',p.title),node('small',s.completed_at?T('Completed','مكتملة'):T('Published','منشورة')));col.append(card)}
for(const s of d.sessions.filter(s=>s.date===date)){const card=btn('',()=>editWorkout(date,s),'workout');card.append(node('small',T(...(sports[s.sport]||sports.other))),node('b',s.title),node('small',T('Draft','مسودة')+' · '+(s.exercises||[]).length+' '+T('exercises','تمارين')));col.append(card)}
const add=btn(T('+ Workout','+ حصة'),()=>editWorkout(date),'add');add.disabled=!!d.pending;const from=btn(T('From library','من المكتبة'),()=>openLibrary(date),'add');from.disabled=!!d.pending;col.append(add,from);if(clipboard&&!d.pending){const paste=btn(T('Paste','لصق'),()=>{if(d.sessions.length>=35){notice(T('Maximum 35 workouts per week.','الحد الأقصى 35 حصة أسبوعياً.'),true);return}d.sessions.push({...structuredClone(clipboard),id:crypto.randomUUID(),date});persist();render()},'add');col.append(paste)}grid.append(col)}
host.append(grid);const legend=node('div',undefined,'legend');for(const [c,l] of [['',T('Draft','مسودة')],['published',T('Published','منشورة')],['complete',T('Completed','مكتملة')]]){const x=node('span');x.append(node('i',undefined,'dot '+c),document.createTextNode(l));legend.append(x)}host.append(legend);
const actions=node('div',undefined,'controls');const library=btn(T('Add from library','أضف من المكتبة'),()=>openLibrary(week));library.disabled=!!d.pending;actions.append(library);const save=btn(T('Save week as template','حفظ الأسبوع كقالب'),()=>saveTemplate());save.disabled=!d.sessions.length||!!d.pending;const publish=btn(d.pending?T('Retry publishing','إعادة محاولة النشر'):T('Send to my athlete','إرسال إلى رياضيّي'),()=>publishDialog(),'primary');publish.disabled=!d.sessions.length||!a;actions.append(save);if(a)actions.append(publish);else{const send=btn(T('Send to my athlete','إرسال إلى رياضيّي'),()=>chooseProgramRecipient(d.sessions),'primary');send.disabled=!d.sessions.length||!connections.length;actions.append(send)}host.append(actions);
if(d.pending)host.append(node('p',T('This draft was saved on the server but publishing did not complete. Retry; editing is locked to avoid duplicate programs.','حُفظت المسودة في الخادم لكن لم يكتمل النشر. أعد المحاولة؛ التعديل مقفل لتجنب التكرار.'),'info'));
}
function appendAthleteWorkoutLink(dialog, id){
 if(!window.MZActiveAuth.isWorkoutId(id))return;
 const url=new URL('/athlete-studio.html',location.origin);
 url.searchParams.set('workout',id);
 const status=node('p',undefined,'info');status.setAttribute('role','status');
 const fallback=input('url',url.href);fallback.readOnly=true;fallback.hidden=true;
 const label=field(T('Athlete workout link','رابط الحصة للرياضي'),fallback);label.hidden=true;
 const copyLink=btn(T('Copy athlete workout link','انسخ رابط الحصة للرياضي'),async()=>{
  try{
   await navigator.clipboard.writeText(url.href);
   status.textContent=T('Link copied. The athlete opens it using their account.','تم نسخ الرابط. يفتحه الرياضي من حسابه.');
  }catch{
   label.hidden=fallback.hidden=false;
   fallback.focus();fallback.select();
   status.textContent=T('Copy this link to share it with the athlete.','انسخ الرابط لمشاركته مع الرياضي.');
  }
 });
 dialog.append(copyLink,label,status);
}
function viewPublished(s){const p=parse(s),d=titleDialog(p.title||T('Workout','حصة'));d.append(node('p',T(...(sports[s.sport_type]||sports.other))+' · '+s.date),node('p',[p.km?p.km+' km':'',p.minutes?p.minutes+' min':''].filter(Boolean).join(' · '),'muted'));const pre=node('p');video.appendInstructions(pre,p.notes,T('Watch demonstration on YouTube','شاهد شرح التمرين على يوتيوب'),p.exerciseLength);video.appendLink(d,p.videoId,T('Watch workout video','شاهد فيديو الحصة'));d.append(pre,node('p',s.completed_at?T('Completed · logged distance and time: ','مكتملة · المسافة والوقت المسجلان: ')+Number(s.actual_km||0)+' km / '+Number(s.duration_minutes||0)+' min':T('Published. Existing workouts are read-only here to protect athlete results.','منشورة. الحصص السابقة للعرض فقط لحماية نتائج الرياضي.'),'info'));appendAthleteWorkoutLink(d,s.id);openDialog(d)}
function editWorkout(date,existing,seedExercise,libraryMode=false){if(!valid()||(!libraryMode&&draft().pending))return;const context=key(),d=titleDialog(T('Workout builder','محرر الحصة')+(libraryMode?'':' · '+fmt(date,{weekday:'long',day:'numeric',month:'short'}))),form=node('form',undefined,'form-grid');const w=existing?structuredClone(existing):{id:crypto.randomUUID(),date,sport:seedExercise?lib.sport[seedExercise.category]:'other',title:seedExercise?T(seedExercise.en,seedExercise.ar):'',km:'',minutes:'',notes:'',exercises:[]};if(seedExercise)w.exercises.push({id:seedExercise.id,category:seedExercise.category,en:seedExercise.en,ar:seedExercise.ar,videoId:seedExercise.videoId||'',sets:'',reps:'',weight:'',distance:'',duration:'',pace:'',rest:''});
form.classList.add('quick-write');const close=d.querySelector('.dialog-top button');close.textContent='×';close.setAttribute('aria-label',T('Close','إغلاق'));close.classList.add('quick-close');
const notes=node('textarea');notes.value=w.notes||'';notes.rows=8;notes.maxLength=1000;notes.placeholder=T('Write the workout just as you would on paper…','اكتب الحصة التدريبية بطريقتك المعتادة…');notes.dir='auto';notes.classList.add('quick-notes');form.append(field(T('Coach instructions','تعليمات المدرب'),notes));
const workoutVideo=input('url',video.url(w.videoId));
workoutVideo.maxLength=500;workoutVideo.dir='ltr';workoutVideo.placeholder='https://www.youtube.com/watch?v=…';
const videoPreview=node('span');
const updateWorkoutVideo=()=>{
 const id=video.idFromUrl(workoutVideo.value);
 workoutVideo.setCustomValidity(workoutVideo.value.trim()&&!id?T('Enter a valid HTTPS YouTube video link.','أدخل رابط فيديو يوتيوب صالحاً وآمناً.'):'');
 videoPreview.replaceChildren();
 video.appendLink(videoPreview,id,T('Preview workout video','معاينة فيديو الحصة'));
 videoPreview.hidden=!id;
 return id;
};
workoutVideo.oninput=updateWorkoutVideo;
updateWorkoutVideo();
form.append(field(T('Workout video link (optional)','رابط فيديو الحصة (اختياري)'),workoutVideo),videoPreview);
const name=input('text',w.title);name.maxLength=120;name.placeholder=T('Optional — generated from your writing','اختياري — يُنشأ من نص الحصة');const sport=node('select');for(const [id,names] of Object.entries(sports))sport.append(new Option(T(...names),id));sport.value=w.sport;const km=input('number',w.km),min=input('number',w.minutes);km.min=min.min='0';km.max='1000';km.step='0.1';min.max='10080';min.step='1';const fields=node('div',undefined,'fields');fields.append(field(T('Workout name','اسم الحصة'),name),field(T('Sport','الرياضة'),sport),field(T('Planned distance (km)','المسافة (كم)'),km),field(T('Planned minutes','المدة (دقائق)'),min));const advanced=node('details',undefined,'quick-options');advanced.append(node('summary',T('Workout details (optional)','تفاصيل الحصة (اختيارية)')),fields);form.append(advanced);
const exercisePanel=node('details',undefined,'quick-options');const exerciseSummary=node('summary');exercisePanel.append(exerciseSummary);exercisePanel.open=!!seedExercise;function updateExerciseSummary(){exerciseSummary.textContent=T('Exercise library','مكتبة التمارين')+(w.exercises.length?' · '+w.exercises.length:'')}updateExerciseSummary();form.append(exercisePanel);
const exerciseList=node('div',undefined,'list');function renderRows(){updateExerciseSummary();exerciseList.replaceChildren();w.exercises.forEach((e,i)=>{const row=node('div',undefined,'exercise-row'),head=node('div',undefined,'controls');head.append(node('strong',T(e.en,e.ar)),btn(T('Remove','حذف'),()=>{w.exercises.splice(i,1);renderRows()},'danger'));row.append(head);const fields=node('div',undefined,'fields');for(const [k,en,ar,type,max] of [['sets','Sets','المجموعات','number',100],['reps','Reps','التكرارات','text',32],['weight','Weight (kg)','الوزن (كغ)','number',1000],['distance','Distance (km)','المسافة (كم)','number',1000],['duration','Duration (min)','المدة (دقائق)','number',10080],['pace','Pace (mm:ss/km)','الوتيرة (دقيقة:ثانية/كم)','text',12],['rest','Rest (sec)','الراحة (ثوانٍ)','number',3600]]){const x=input(type,e[k]||'');if(type==='number'){x.min='0';x.max=String(max);x.step=['weight','distance'].includes(k)?'0.1':'1'}else{x.maxLength=max;if(k==='pace')x.pattern='[0-9]{1,3}:[0-5][0-9]'}x.oninput=()=>e[k]=x.value;fields.append(field(T(en,ar),x))}const v=input('url',video.url(e.videoId));v.maxLength=500;v.placeholder='https://www.youtube.com/watch?v=…';v.oninput=()=>{const id=video.idFromUrl(v.value);v.setCustomValidity(v.value.trim()&&!id?T('Enter a valid HTTPS YouTube video link.','أدخل رابط فيديو يوتيوب صالحاً وآمناً.'):'' );e.videoId=id;preview.hidden=!id;if(id)preview.href=video.url(id)};const preview=node('a',T('Preview video ↗','معاينة الفيديو ↗'),'mza-video-link');preview.target='_blank';preview.rel='noopener noreferrer';preview.href=video.url(e.videoId);preview.hidden=!video.valid(e.videoId);row.append(fields,field(T('YouTube demonstration (optional)','شرح التمرين على يوتيوب (اختياري)'),v),preview);exerciseList.append(row)})}renderRows();exercisePanel.append(exerciseList);
const search=input('search');search.placeholder=T('Search exercise names, muscle or equipment','ابحث باسم التمرين أو العضلة أو المعدات');const results=node('div',undefined,'picker-results');function searchRows(){results.replaceChildren();for(const x of lib.search(search.value,'all',allExercises()).slice(0,20)){const b=btn(T(x.en,x.ar)+' · '+x.equipment,()=>{if(w.exercises.length>=20)return;w.exercises.push({id:x.id,category:x.category,en:x.en,ar:x.ar,videoId:x.videoId||''});if(sport.value==='other'&&lib.sport[x.category])sport.value=lib.sport[x.category];renderRows()});results.append(b)}}search.oninput=searchRows;exercisePanel.addEventListener('toggle',()=>{if(exercisePanel.open&&!results.childElementCount)searchRows()});if(exercisePanel.open)searchRows();exercisePanel.append(field(T('Add exercise','أضف تمريناً'),search),results);
const actions=node('div',undefined,'form-actions'),status=node('p',undefined,'info');status.setAttribute('role','status');const save=node('button',T('Save workout','حفظ الحصة'),'primary');save.type='submit';actions.append(save);if(existing&&!libraryMode){actions.append(btn(T('Save to library','حفظ في المكتبة'),async()=>{if(!confirm(T('Save a reusable copy of the last saved workout? Remove private athlete information first.','حفظ نسخة من الحصة؟ احذف معلومات الرياضي الخاصة أولاً.')))return;if(await storeWorkout(existing,false)){d.close();notice(T('Workout saved to library.','تم حفظ الحصة في المكتبة.'));render()} }),btn(T('Copy','نسخ'),()=>{clipboard=structuredClone(existing);d.close();render()}),btn(T('Delete draft','حذف المسودة'),()=>{if(!confirm(T('Delete this draft workout?','حذف مسودة الحصة؟')))return;draft().sessions=draft().sessions.filter(s=>s.id!==existing.id);persist();d.close();render()},'danger'))}form.append(actions,status);form.onsubmit=async e=>{e.preventDefault();if(!valid()||libraryBusy||(!libraryMode&&(key()!==context||draft().pending)))return;const workoutVideoId=updateWorkoutVideo();if(!workoutVideo.reportValidity())return;const text=notes.value;if(!text.trim()&&!w.exercises.length&&!workoutVideoId){status.textContent=T('Write the workout or add a video or exercise.','اكتب الحصة أو أضف فيديو أو تمريناً.');notes.focus();return}const derive=value=>String(value||'').split(/\r?\n/).find(line=>line.trim())?.trim().slice(0,120)||'';const oldAuto=existing&&existing.title===derive(existing.notes);const explicit=name.value.trim();const title=(!explicit||(oldAuto&&explicit===existing.title))?(derive(text)||T('Workout','حصة')):explicit;Object.assign(w,{title,sport:sport.value,km:km.value,minutes:min.value,notes:text,videoId:workoutVideoId});if(serialize(w).length>1600){status.textContent=T('This workout is too long for the existing program API. Shorten it.','الحصة طويلة على النظام الحالي. اختصرها.');return}if(libraryMode){if(!await storeWorkout(w,!!existing)){status.textContent=T('Could not save workout.','تعذر حفظ الحصة.');return}d.close();notice(T('Workout saved to library.','تم حفظ الحصة في المكتبة.'));render();return}const list=draft().sessions,index=list.findIndex(s=>s.id===w.id);if(index<0){if(list.length>=35){status.textContent=T('Maximum 35 workouts per week.','الحد الأقصى 35 حصة أسبوعياً.');return}list.push(w)}else list[index]=w;persist();d.close();render()};d.append(form);openDialog(d)}
function serialize(w){const desc=(w.exercises||[]).map(e=>(lib.format(e,e,document.documentElement.lang==='ar')+(video.valid(e.videoId)?'\n'+video.url(e.videoId):''))).join('\n');return w.title+'\n[MZ:'+JSON.stringify({km:Number(w.km||0),minutes:Number(w.minutes||0),...(video.valid(w.videoId)?{workoutVideoId:w.videoId}:{}),exerciseLength:desc.length})+']\n'+(desc?desc+'\n':'')+w.notes}
async function refreshAthletes(){const data=await api('/api/connections');loadConnections(data)}
async function decideRequest(c,status){
 if(busy||!valid())return;
 if(status==='declined'&&!confirm(T('Decline this coaching request?','رفض طلب التدريب؟')))return;
 busy=true;
 try{const r=await api('/api/connections/'+encodeURIComponent(c.id),'PATCH',{status});if(!r.updated)throw Error('decision_not_confirmed');await refreshAthletes();notice(T('Request updated.','تم تحديث الطلب.'))}
 catch{notice(T('Request update not confirmed. Refresh requests before retrying.','لم يتم تأكيد تحديث الطلب. حدّث الطلبات قبل المحاولة مجدداً.'),true)}
 finally{busy=false;render()}
}
function renderAthletes(){
 const host=$('screen'),h=heading(T('Athletes & teams','الرياضيون والفرق'),T('Manage coaching relationships in this workspace.','أدر علاقات التدريب من مساحة العمل.'));h.append(btn(T('Refresh','تحديث'),async()=>{if(busy)return;busy=true;try{await refreshAthletes();notice()}catch{notice(T('Could not refresh requests.','تعذر تحديث الطلبات.'),true)}finally{busy=false;render()}}));host.append(h);
 const inbox=node('section',undefined,'panel');inbox.append(node('h2',T('Coaching requests','طلبات التدريب')+' ('+requests.length+')'));
 if(myProfile?.id){
  const guestInbox=node('a',T('Guest messages and requests','رسائل وطلبات الزوار'),'text-link');
  guestInbox.href='/coach.html?id='+encodeURIComponent(myProfile.id)+'#bookings';
  inbox.append(guestInbox);
 }
 for(const c of requests){const row=node('div',undefined,'listrow'),desc=node('div'),actions=node('div',undefined,'controls');desc.append(node('strong',c.athlete_name||T('Athlete','رياضي')),node('small',T('Pending request','طلب قيد المراجعة'),'muted'));actions.append(btn(T('Accept','قبول'),()=>decideRequest(c,'accepted'),'primary'),btn(T('Decline','رفض'),()=>decideRequest(c,'declined')));row.append(desc,actions);inbox.append(row)}
 if(!requests.length)inbox.append(node('p',T('No pending requests.','لا توجد طلبات معلقة.'),'muted'));host.append(inbox);
 const panel=node('section',undefined,'panel');panel.append(node('h2',T('My athletes','رياضيوني')));
 for(const c of connections){const row=node('div',undefined,'listrow'),desc=node('div');desc.append(node('strong',c.athlete_name||T('Athlete','رياضي')),node('small',T('Accepted coaching relationship','علاقة تدريب مقبولة'),'muted'));const actions=node('div',undefined,'controls');actions.append(btn(T('Open calendar','فتح التقويم'),()=>selectAthlete(c.id)),btn(T('Messages','الرسائل'),()=>openMessages(c)));row.append(desc,actions);panel.append(row)}
 if(!connections.length)panel.append(node('p',T('No connected athletes yet. Start building programs in your private calendar.','لا يوجد رياضيون مرتبطون بعد. ابدأ بناء البرامج في تقويمك الخاص.'),'muted'),btn(T('Start planning','ابدأ التخطيط'),()=>selectAthlete(''),'primary'));host.append(panel);
 const group=node('section',undefined,'panel');group.append(node('h2',T('My teams','فرقي')),btn(T('Create team','إنشاء فريق'),createTeam,'primary'));
 for(const team of teams){const row=node('div',undefined,'listrow'),desc=node('div');desc.append(node('strong',team.name),node('small',(team.members||[]).length+' '+T('members','أعضاء'),'muted'));if(team.join_code)desc.append(node('small',T('Join code: ','رمز الانضمام: ')+team.join_code,'muted'));row.append(desc,btn(T('View members','عرض الأعضاء'),()=>{const d=titleDialog(team.name);for(const m of team.members||[])d.append(node('p',m.display_name||T('Member','عضو')));if(!(team.members||[]).length)d.append(node('p',T('No members yet.','لا يوجد أعضاء بعد.'),'muted'));openDialog(d)}));group.append(row)}
 if(!teams.length)group.append(node('p',T('No teams yet.','لا توجد فرق بعد.'),'muted'));host.append(group)
}
async function openMessages(c){
 if(busy||!valid()||!connections.some(x=>x.id===c.id))return;
 const d=titleDialog(T('Messages','الرسائل')+' · '+(c.athlete_name||T('Athlete','رياضي'))),list=node('div',undefined,'list'),f=node('form',undefined,'form-grid'),message=node('textarea'),send=node('button',T('Send message','إرسال رسالة'),'primary'),status=node('p',undefined,'info');
 message.required=true;message.maxLength=2000;message.rows=3;send.type='submit';status.setAttribute('role','status');f.append(field(T('Message','الرسالة'),message),send,status);d.append(list,f);openDialog(d);
 const path='/api/connections/'+encodeURIComponent(c.id)+'/messages';
 async function load(){const data=await api(path);list.replaceChildren();for(const m of data.messages||[]){const row=node('div',undefined,'listrow'),desc=node('div');desc.append(node('strong',m.sender_user_id===owner?T('You','أنت'):(c.athlete_name||T('Athlete','رياضي'))),node('p',m.body||''));row.append(desc);list.append(row)}if(!list.children.length)list.append(node('p',T('No messages yet.','لا توجد رسائل بعد.'),'muted'))}
 busy=true;send.disabled=true;try{await load()}catch{status.textContent=T('Messages unavailable. Reopen to retry.','الرسائل غير متاحة. أعد فتح النافذة.')}finally{busy=false;send.disabled=false}
 f.onsubmit=async e=>{e.preventDefault();if(busy||!valid()||!message.value.trim())return;busy=true;send.disabled=true;try{const r=await api(path,'POST',{body:message.value.trim()});if(!r.id)throw Error('not_confirmed');message.value='';status.textContent=T('Message sent.','تم إرسال الرسالة.');await load()}catch{status.textContent=T('Check the conversation before retrying.','تحقق من المحادثة قبل إعادة المحاولة.')}finally{busy=false;send.disabled=false}};
}
function createTeam(){const d=titleDialog(T('Create team','إنشاء فريق')),f=node('form',undefined,'form-grid'),name=input();name.required=true;name.maxLength=80;const save=node('button',T('Create team','إنشاء فريق'),'primary');save.type='submit';const status=node('p',undefined,'info');status.setAttribute('role','status');f.append(field(T('Team name','اسم الفريق'),name),save,status);f.onsubmit=async e=>{e.preventDefault();if(busy||!valid()||!name.value.trim())return;busy=true;save.disabled=true;try{const r=await api('/api/dashboard/teams','POST',{name:name.value.trim()});if(!r.id)throw Error('not_confirmed');teams.push({...r,is_coach:true,members:[]});d.close();notice(T('Team created.','تم إنشاء الفريق.'));render()}catch{status.textContent=T('Team creation not confirmed. Refresh before retrying.','لم يتم تأكيد إنشاء الفريق. حدّث الصفحة قبل المحاولة.')}finally{busy=false;save.disabled=false}};d.append(f);openDialog(d)}
function renderProfile(){
 const host=$('screen'),p=myProfile||{};host.append(heading(T('My profile','ملفي الشخصي'),T('Your coaching identity and public information.','هويتك التدريبية ومعلوماتك العامة.')));
 const panel=node('section',undefined,'panel'),identity=node('div',undefined,'profile-identity'),avatar=node('div',undefined,'profile-avatar'),title=node('h2',p.display_name||T('Coach','مدرب')),identityText=node('div');
 avatar.textContent=(p.display_name||'MZA').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
 if(p.has_profile_photo&&p.id){const photo=node('img');photo.alt=T('Profile photo','صورة الملف');photo.src=window.MZACTIVE_API_BASE+'/api/providers/'+encodeURIComponent(p.id)+'/photo?v='+encodeURIComponent(p.profile_photo_updated_at||'');photo.onerror=()=>photo.remove();avatar.append(photo)}
 identityText.append(title,node('p',T('Approved coach','مدرب معتمد')+' · '+[p.city,p.country].filter(Boolean).join(' · '),'muted'));identity.append(avatar,identityText);panel.append(identity,node('h3',T('About','نبذة')),node('p',p.bio||T('No biography added yet.','لم تُضف نبذة بعد.')));
 for(const [label,value] of [[T('Specialties','التخصصات'),(p.specialties||[]).join(' · ')],[T('Languages','اللغات'),(p.languages||[]).join(' · ')],[T('Qualifications','المؤهلات'),p.qualifications],[T('Services','الخدمات'),(p.services||[]).join(' · ')]]){if(value){panel.append(node('h3',label),node('p',value))}}
 const actions=node('div',undefined,'controls');if(p.id){const publicLink=node('a',T('View public profile','عرض الملف العام'),'primary');publicLink.href='/coach.html?id='+encodeURIComponent(p.id);actions.append(publicLink)}
 actions.append(btn(T('Edit profile','تعديل الملف'),editProfile));panel.append(actions);host.append(panel)
}
function editProfile(){
 const p=myProfile;if(!p||!valid())return;
 const d=titleDialog(T('Edit profile','تعديل الملف')),f=node('form',undefined,'form-grid'),name=input('text',p.display_name||''),city=input('text',p.city||''),bio=node('textarea');name.required=city.required=true;name.maxLength=100;city.maxLength=80;bio.maxLength=4000;bio.rows=5;bio.value=p.bio||'';
 const save=node('button',T('Save profile','حفظ الملف'),'primary');save.type='submit';const status=node('p',undefined,'info');status.setAttribute('role','status');
 f.append(field(T('Name','الاسم'),name),field(T('City','المدينة'),city),field(T('Biography','النبذة'),bio),node('p',T('This edits your name, city and biography.','يعدّل هذا الاسم والمدينة والنبذة.'),'info'),save,status);
 f.onsubmit=async e=>{e.preventDefault();if(busy||!valid())return;busy=true;save.disabled=true;
 try{const fresh=(await api('/api/me/profile')).profile;if(!fresh||fresh.status!=='approved'||fresh.id!==p.id||fresh.updated_at!==p.updated_at)throw Error('profile_changed');
 const required=['specialties','languages','social_links','public_fields','program_durations'];if(required.some(k=>!Array.isArray(fresh[k])))throw Error('profile_data_incomplete');
 const body={action:fresh.submission_state==='draft'?'draft':'submit',provider_type:fresh.provider_type,display_name:name.value.trim(),city:city.value.trim(),bio:bio.value,country:fresh.country,specialties:fresh.specialties,languages:fresh.languages,experience_years:fresh.experience_years,indicative_rate_qar:fresh.indicative_rate_qar,program_durations:fresh.program_durations,whatsapp_number:fresh.whatsapp_number||'',whatsapp_public:fresh.whatsapp_public===true||fresh.whatsapp_public===1,social_links:fresh.social_links,public_fields:fresh.public_fields};
 const result=await api('/api/me/profile','PUT',body);if(result.status!=='approved')throw Error('profile_not_confirmed');myProfile=(await api('/api/me/profile')).profile;d.close();notice(T('Profile saved.','تم حفظ الملف.'));render()
 }catch{status.textContent=T('Profile save not confirmed. Reload the page before retrying.','لم يتم تأكيد حفظ الملف. أعد تحميل الصفحة قبل المحاولة.')}finally{busy=false;save.disabled=false}};d.append(f);openDialog(d)
}
function renderExercises(){const host=$('screen');host.append(heading(T('Exercise library','مكتبة التمارين'),T('Search movements by name, muscle or equipment.','ابحث بالاسم أو العضلة أو المعدات.')));const box=node('section',undefined,'panel'),controls=node('div',undefined,'controls'),q=input('search'),category=node('select');q.placeholder=T('Search exercises','ابحث عن التمارين');q.setAttribute('aria-label',q.placeholder);category.setAttribute('aria-label',T('Category','التصنيف'));category.append(new Option(T('All categories','كل التصنيفات'),'all'));for(const [id,names] of Object.entries(lib.categories))category.append(new Option(T(...names),id));controls.append(q,category,btn(T('Create exercise','إنشاء تمرين'),createExercise,'primary'));const list=node('div',undefined,'list'),count=node('p',undefined,'muted');function paint(){list.replaceChildren();const items=lib.search(q.value,category.value,allExercises());count.textContent=items.length+' '+T('exercises','تمرين');for(const e of items){const row=node('div',undefined,'listrow'),desc=node('div');desc.append(node('strong',T(e.en,e.ar)),node('small',e.muscle+' · '+e.equipment,'muted'));if(video.valid(e.videoId)){const link=node('a',T('Watch demonstration ↗','شاهد الشرح ↗'),'mza-video-link');link.href=video.url(e.videoId);link.target='_blank';link.rel='noopener noreferrer';desc.append(link)}const add=btn(T('Use in workout','استعمل في حصة'),()=>{const d=titleDialog(T('Choose a day','اختر اليوم')),pick=node('select');for(let i=0;i<7;i++)pick.append(new Option(fmt(shift(week,i),{weekday:'long',day:'numeric',month:'short'}),shift(week,i)));d.append(pick,btn(T('Continue','متابعة'),()=>{const date=pick.value;d.close();screen='calendar';render();editWorkout(date,null,e)},'primary'));openDialog(d)});row.append(desc,add);list.append(row)}}q.oninput=paint;category.onchange=paint;box.append(controls,count,list);host.append(box);paint()}
async function storeWorkout(w,replace){
 if(!valid())return false;
 const copy=structuredClone(w);delete copy.date;copy.id=replace?w.id:crypto.randomUUID();
 return saveLibraryItem('workout',copy,replace);
}
function createExercise(){
 if(!valid())return;
 const d=titleDialog(T('Create exercise','إنشاء تمرين')),f=node('form',undefined,'form-grid'),en=input(),ar=input(),muscle=input(),equipment=input(),cat=node('select'),v=input('url');v.maxLength=500;v.placeholder='https://www.youtube.com/watch?v=…';v.oninput=()=>v.setCustomValidity(v.value.trim()&&!video.idFromUrl(v.value)?T('Enter a valid HTTPS YouTube video link.','أدخل رابط فيديو يوتيوب صالحاً وآمناً.'):'');
 for(const [id,names] of Object.entries(lib.categories))cat.append(new Option(T(...names),id));
 for(const x of [en,ar,muscle,equipment]){x.required=true;x.maxLength=100}
 f.append(field(T('English name','الاسم بالإنجليزية'),en),field(T('Arabic name','الاسم بالعربية'),ar),field(T('Category','التصنيف'),cat),field(T('Target muscles','العضلات المستهدفة'),muscle),field(T('Equipment','المعدات'),equipment),field(T('YouTube demonstration (optional)','شرح التمرين على يوتيوب (اختياري)'),v));
 const save=node('button',T('Save exercise','حفظ التمرين'),'primary');save.type='submit';f.append(save);
 f.onsubmit=async e=>{e.preventDefault();if(!valid()||libraryBusy||customExercises.length>=150)return;const values=[en,ar,muscle,equipment].map(x=>x.value.trim());if(values.some(x=>!x))return;const [eName,aName,m,eq]=values;const item={id:'custom-'+crypto.randomUUID(),category:cat.value,en:eName,ar:aName,muscle:m,equipment:eq,videoId:video.idFromUrl(v.value)};if(await saveLibraryItem('exercise',item)){d.close();render();notice(libraryMessage())}};
 d.append(f);openDialog(d);
}
function addSavedWorkout(date,w){
 if(!valid()||draft().pending||draft().sessions.length>=35)return false;
 if(!dateOK(date)||date<week||date>shift(week,6))return false;
 draft().sessions.push({...structuredClone(w),date,id:crypto.randomUUID()});persist();return true;
}
function openLibrary(date){
 if(draft().pending)return;
 const d=titleDialog(T('Add from library','أضف من المكتبة')),q=input('search'),list=node('div',undefined,'list');d.classList.add('library-drawer');const pick=node('select');for(let i=0;i<7;i++){const v=shift(week,i);pick.append(new Option(fmt(v,{weekday:'long',day:'numeric',month:'short'}),v))}pick.value=date;
 q.placeholder=T('Search saved workouts','ابحث عن الحصص المحفوظة');q.setAttribute('aria-label',q.placeholder);
 function paint(){list.replaceChildren();for(const w of savedWorkouts.filter(x=>x.title.toLowerCase().includes(q.value.trim().toLowerCase()))){const row=node('div',undefined,'listrow'),desc=node('div');desc.append(node('strong',w.title),node('small',T(...(sports[w.sport]||sports.other))+' · '+w.exercises.length+' '+T('exercises','تمارين'),'muted'));row.append(desc,btn(T('Add to calendar','أضف للتقويم'),()=>{if(addSavedWorkout(pick.value,w)){d.close();render()}}));list.append(row)}if(!list.children.length)list.append(node('p',T('No matching saved workouts. Create one in the Workout library.','لا توجد حصص محفوظة مطابقة. أنشئ حصة في مكتبة الحصص.'),'empty'))}
 q.oninput=paint;d.append(field(T('Add to date','أضف إلى التاريخ'),pick),node('h3',T('Saved workouts','الحصص المحفوظة')),q,list,btn(T('Open workout library','افتح مكتبة الحصص'),()=>{d.close();changeScreen('sessions')}));
 const programsList=node('div',undefined,'list');d.append(node('h3',T('Weekly program templates','قوالب البرامج الأسبوعية')),node('p',T('Copies fill the selected calendar week starting Monday.','تبدأ النسخ في يوم الاثنين من الأسبوع المختار.'),'info'),programsList);
 for(const p of templates){const row=node('div',undefined,'listrow');row.append(node('strong',p.name),btn(T('Apply to week','طبق على الأسبوع'),()=>{if(draft().sessions.length||draft().pending){notice(T('Choose an empty draft week first.','اختر أسبوع مسودة فارغاً أولاً.'),true);d.close();return}draft().sessions=p.sessions.map(s=>({...structuredClone(s),id:crypto.randomUUID(),date:shift(week,s.offset)}));persist();d.close();render()}));programsList.append(row)}
 if(!templates.length)programsList.append(node('p',T('No saved program templates.','لا توجد قوالب برامج محفوظة.'),'muted'));paint();openDialog(d);
}
function renderSavedWorkouts(){
 const host=$('screen'),h=heading(T('Workout library','مكتبة الحصص'),T('Create reusable sessions before assigning them to any athlete.','أنشئ حصصاً قابلة لإعادة الاستخدام قبل تعيينها للرياضي.'));h.append(btn(T('Create workout','إنشاء حصة'),()=>editWorkout(week,null,null,true),'primary'));host.append(h);
 const panel=node('section',undefined,'panel'),q=input('search'),list=node('div',undefined,'list');q.placeholder=T('Search workouts','ابحث عن الحصص');q.setAttribute('aria-label',q.placeholder);
 function paint(){list.replaceChildren();for(const w of savedWorkouts.filter(x=>x.title.toLowerCase().includes(q.value.trim().toLowerCase()))){const row=node('div',undefined,'listrow'),desc=node('div');desc.append(node('strong',w.title),node('small',T(...(sports[w.sport]||sports.other))+' · '+w.exercises.length+' '+T('exercises','تمارين'),'muted'));const actions=node('div',undefined,'controls');actions.append(btn(T('Edit','تعديل'),()=>editWorkout(week,w,null,true)),btn(T('Delete','حذف'),async()=>{if(confirm(T('Delete this library workout? Assigned copies will not change.','حذف هذه الحصة؟ لن تتغير النسخ المعينة.'))&&await deleteLibraryItem('workout',w))paint()},'danger'));row.append(desc,actions);list.append(row)}if(!list.children.length)list.append(node('p',T('No saved workouts yet.','لا توجد حصص محفوظة بعد.'),'empty'))}
 q.oninput=paint;panel.append(q,node('p',T('Keep private athlete data out of reusable sessions.','تجنب معلومات الرياضي الخاصة في الحصص.'),'info'),list);host.append(panel);paint();
}
function saveTemplate(){if(!ownDraft().length)return;const d=titleDialog(T('Save reusable week','حفظ أسبوع قابل لإعادة الاستخدام')),name=input('text');name.maxLength=100;name.placeholder=T('Template name','اسم القالب');const status=node('p',undefined,'info');d.append(node('p',T('Remove private athlete information from workout notes before saving a reusable template.','احذف معلومات الرياضي الخاصة من الملاحظات قبل حفظ قالب قابل لإعادة الاستخدام.'),'info'),field(name.placeholder,name),btn(T('Save template','حفظ القالب'),async()=>{const n=name.value.trim();if(!n){status.textContent=T('Enter a name.','أدخل اسماً.');return}if(templates.length>=40){status.textContent=T('Maximum 40 templates.','الحد الأقصى 40 قالباً.');return}const rows=ownDraft().map(s=>({...structuredClone(s),offset:days.indexOf(days[(new Date(s.date+'T00:00:00Z').getUTCDay()+6)%7]),date:undefined}));if(!await saveLibraryItem('program',{id:crypto.randomUUID(),name:n,sessions:rows}))return;d.close();notice(libraryMessage())},'primary'),status);openDialog(d)}
function renderTemplates(){const host=$('screen');host.append(heading(T('Programs & templates','البرامج والقوالب'),T('Reusable weekly programs, separate from athlete calendars.','برامج أسبوعية قابلة لإعادة الاستخدام ومنفصلة عن تقويم الرياضي.')));const box=node('section',undefined,'panel');box.append(node('h2',T('My reusable templates','قوالبي')),btn(T('Create program','إنشاء برنامج'),()=>selectAthlete(''),'primary'));for(const p of templates){const row=node('div',undefined,'listrow'),desc=node('div');desc.append(node('strong',p.name),node('small',p.sessions.length+' '+T('workouts','حصص'),'muted'));row.append(desc,btn(T('Apply to selected week','طبق على الأسبوع المختار'),()=>{if(draft().sessions.length||draft().pending){notice(T('Choose an empty draft week first.','اختر أسبوع مسودة فارغاً أولاً.'),true);return}draft().sessions=p.sessions.map(s=>({...structuredClone(s),id:crypto.randomUUID(),date:shift(week,s.offset)}));persist();screen='calendar';notice(T('Template copied into the draft.','نُسخ القالب إلى المسودة.'));render()}),btn(T('Send to my athlete','إرسال إلى رياضيّي'),()=>chooseProgramRecipient(p.sessions),'primary'),btn(T('Delete','حذف'),async()=>{if(!confirm(T('Delete this template?','حذف هذا القالب؟')))return;if(await deleteLibraryItem('program',p))render()},'danger'));box.append(row)}if(!templates.length)box.append(node('p',T('Create a private draft week and save it as a template. No athlete required.','أنشئ أسبوعاً خاصاً واحفظه كقالب دون الحاجة إلى رياضي.'),'empty'));host.append(box);const prev=node('section',undefined,'panel');prev.append(node('h2',T('Existing programs','البرامج السابقة')));for(const p of programs){const row=node('div',undefined,'listrow'),desc=node('div');desc.append(node('strong',p.athlete_name||T('Program','برنامج')),node('small',(p.start_date||p.week_start||'')+' · '+(p.sessions||[]).length+' '+T('workouts','حصص'),'muted'));row.append(desc);prev.append(row)}host.append(prev)}
function renderProgress(){const host=$('screen'),rows=published(),a=athlete();host.append(heading(T('Performance','الأداء'),a?(a.athlete_name||T('Selected athlete','الرياضي المختار')):T('Select an athlete in Calendar.','اختر رياضياً في التقويم.')));const done=rows.filter(r=>r.completed_at),stats=node('div',undefined,'stats');for(const [v,l] of [[done.length+'/'+rows.length,T('Completed','مكتملة')],[done.reduce((s,r)=>s+Number(r.actual_km||0),0).toFixed(1)+' km',T('Distance logged','المسافة المسجلة')],[done.reduce((s,r)=>s+Number(r.duration_minutes||0),0)+' min',T('Time logged','الوقت المسجل')]]){const x=node('div',undefined,'stat');x.append(node('b',v),document.createTextNode(l));stats.append(x)}host.append(stats);for(const s of done.sort((a,b)=>b.date.localeCompare(a.date))){const row=node('div',undefined,'listrow'),desc=node('div');desc.append(node('strong',parse(s).title),node('small',s.date+' · '+Number(s.actual_km||0)+' km · '+Number(s.duration_minutes||0)+' min','muted'));row.append(desc,btn(T('View','عرض'),()=>viewPublished(s)));host.append(row)}}
function chooseProgramRecipient(sessions){
 if(!valid()||busy||libraryBusy||!sessions.length||!connections.length)return;
 const sourceWeek=week,source=structuredClone(sessions),d=titleDialog(T('Send to my athlete','إرسال إلى رياضيّي')),form=node('form',undefined,'form-grid'),pick=node('select');
 pick.required=true;pick.id='programRecipient';pick.setAttribute('aria-label',T('Athlete','الرياضي'));pick.append(new Option(T('Choose athlete','اختر رياضياً'),''));
 for(const c of connections)pick.append(new Option(c.athlete_name||T('Athlete','رياضي'),c.id));
 const next=node('button',T('Review and send','مراجعة وإرسال'),'primary');next.type='submit';const status=node('p',undefined,'info');status.setAttribute('role','status');
 form.append(field(T('Athlete','الرياضي'),pick),node('p',T('Your original program stays private. An independent copy is prepared for the selected athlete; nothing is sent until you confirm.','يبقى برنامجك الأصلي خاصاً. تُجهز نسخة مستقلة للرياضي المحدد ولا يُرسل شيء حتى تؤكد.'),'info'),next,status);d.append(form);
 form.onsubmit=e=>{e.preventDefault();if(!valid()||busy||libraryBusy||week!==sourceWeek)return;const target=connections.find(c=>c.id===pick.value);if(!target)return;const targetKey=target.id+'|'+sourceWeek;const existing=drafts[targetKey];if(existing?.sessions?.length||existing?.pending){status.textContent=T('This athlete already has a draft for this week. Choose another athlete or manage that draft first.','لدى هذا الرياضي مسودة في هذا الأسبوع. اختر رياضياً آخر أو أدر تلك المسودة أولاً.');return}
 drafts[targetKey]={sessions:source.map(w=>({...structuredClone(w),id:crypto.randomUUID(),date:w.date||shift(sourceWeek,w.offset)})),pending:''};persist();d.close();selectAthlete(target.id);publishDialog()};
 openDialog(d)
}
function publishDialog(){if(!valid()||!athlete()||busy||!ownDraft().length)return;const a=athlete(),context=key(),d=titleDialog(T('Publish training week','نشر أسبوع التدريب'));d.append(node('p',(a.athlete_name||T('Athlete','رياضي'))+' · '+week+' · '+ownDraft().length+' '+T('workouts','حصص')));const f=node('form',undefined,'form-grid'),phone=input('tel');phone.required=!draft().pending;phone.placeholder='+974…';if(!draft().pending)f.append(field(T('Athlete phone (required by current program API)','هاتف الرياضي (مطلوب في النظام الحالي)'),phone));f.append(node('p',T('This publishes the week to the selected athlete account. Existing sessions are not replaced.','ينشر الأسبوع لحساب الرياضي المحدد. لن يتم استبدال الحصص الحالية.'),'info'));const confirmBtn=node('button',T('Publish to athlete','نشر للرياضي'),'primary');confirmBtn.type='submit';const status=node('p',undefined,'info');status.setAttribute('role','status');f.append(confirmBtn,status);d.append(f);f.onsubmit=async e=>{e.preventDefault();if(busy||key()!==context||!valid())return;busy=true;confirmBtn.disabled=true;try{const linked=await api('/api/connections');const c=(linked.connections||[]).find(x=>x.id===a.id&&x.coach_user_id===owner&&x.status==='accepted'&&x.workspace_status!=='closed'&&x.athlete_user_id===a.athlete_user_id);if(!c)throw Error(T('Athlete connection is no longer active.','علاقة الرياضي لم تعد نشطة.'));const current=draft();if(!current.pending){const number=phone.value.trim();if(!number)throw Error(T('Enter the real athlete phone number.','أدخل رقم هاتف الرياضي الحقيقي.'));const sessions=current.sessions.map(s=>({day_key:days[(new Date(s.date+'T00:00:00Z').getUTCDay()+6)%7],sport_type:s.sport,details:serialize(s),session_date:s.date}));if(sessions.some(s=>s.details.length>1600))throw Error(T('A workout exceeds the current API length limit.','إحدى الحصص تتجاوز الحد المسموح.'));const result=await api('/api/dashboard/programs','POST',{athlete_name:a.athlete_name||T('Athlete','رياضي'),athlete_phone:number,athlete_type:'general',team_id:null,athlete_user_id:null,duration_unit:'weeks',duration_value:1,start_date:week,week_start:week,weeks:[{week_start:week,sessions}],coach_note:''});if(!result.id)throw Error('save_failed');current.pending=result.id;persist()}let sent; if(!phone.required){const snapshot=await api('/api/dashboard');const prior=(snapshot.programs||[]).find(p=>p.id===current.pending&&p.athlete_user_id===c.athlete_user_id&&p.sent_at);if(prior)sent={sent:true};}if(!sent)sent=await api('/api/dashboard/programs/'+encodeURIComponent(current.pending)+'/send','POST',{channel:'mzactive',athlete_user_id:c.athlete_user_id});if(!sent.sent)throw Error('publish_not_confirmed');delete drafts[context];persist();d.close();notice(T('Published successfully to the athlete.','تم نشر البرنامج للرياضي.'));try{const data=await api('/api/dashboard');programs=data.programs||[]}catch{notice(T('Published. Refresh to see the updated calendar.','تم النشر. حدّث الصفحة لرؤية التقويم.'))}render()}catch(error){status.textContent=String(error.message||'request_failed');notice(T('Publishing not confirmed. Your draft is retained.','لم يتم تأكيد النشر. تم الاحتفاظ بالمسودة.'),true)}finally{busy=false;confirmBtn.disabled=false;render()}};openDialog(d)}
function labels(){$('classic').textContent=T('My profile','ملفي الشخصي');$('lang').textContent=T('العربية','English');$('logout').textContent=T('Sign out','تسجيل الخروج');$('navTitle').textContent=T('WORKSPACE','مساحة العمل');$('otherTools').textContent=T('Additional tools (legacy)','أدوات إضافية (الواجهة السابقة)')}
function setLang(lang){document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';labels()}
$('classic').onclick=e=>{if(valid()){e.preventDefault();changeScreen('profile')}};
$('lang').onclick=()=>{const lang=T('ar','en');try{localStorage.setItem('mzactive-language-manual',lang)}catch{}setLang(lang);if(valid())render()};
$('logout').onclick=async()=>{if(busy||libraryBusy)return;try{await api('/api/auth/logout','POST',{})}catch{}localStorage.removeItem(window.MZActiveAuth.KEY);sessionStorage.removeItem(window.MZActiveAuth.KEY);location.assign('/dashboard.html#loginForm')};
$('dialog').addEventListener('cancel',e=>{if(busy||libraryBusy)e.preventDefault()});
window.addEventListener('storage',e=>{if(e.key===window.MZActiveAuth.KEY&&!valid())location.reload()});
(async()=>{try{setLang(localStorage.getItem('mzactive-language-manual')==='ar'?'ar':'en');session=window.MZActiveAuth.token();if(!session){location.replace('/dashboard.html#loginForm');return;}const [access,profile,data,link]=await Promise.all([api('/api/me/access'),api('/api/me/profile'),api('/api/dashboard'),api('/api/connections')]);if(access.account_type!=='provider'||!access.user?.id||data.role!=='provider'||profile.profile?.status!=='approved'||!['coach','bodybuilding_coach'].includes(profile.profile.provider_type))throw Error('approved_coach_required');owner=access.user.id;myProfile=profile.profile;loadConnections(link);programs=data.programs||[];teams=(data.teams||[]).filter(t=>t.is_coach);drafts=read(sessionStorage,storageKey(),{});if(!drafts||typeof drafts!=='object'||Array.isArray(drafts))drafts={};templates=read(localStorage,templateKey(),[]);if(!Array.isArray(templates))templates=[];savedWorkouts=read(localStorage,workoutKey(),[]);if(!Array.isArray(savedWorkouts))savedWorkouts=[];customExercises=read(localStorage,customKey(),[]);if(!Array.isArray(customExercises))customExercises=[];await loadAccountLibrary();if(!valid())return;if(connections.length===1)selected=connections[0].id;const entry=new URLSearchParams(location.search).get('view');if(['profile','athletes'].includes(entry))screen=entry;$('gate').hidden=true;$('studio').hidden=false;$('logout').hidden=false;render()}catch(error){
 if(error.status===401&&session&&session===window.MZActiveAuth.token()){
  for(const storage of [sessionStorage,localStorage])if(storage.getItem(window.MZActiveAuth.KEY)===session)storage.removeItem(window.MZActiveAuth.KEY);
  location.replace('/dashboard.html#loginForm');return;
 }
 if(error.message==='session_changed'){location.reload();return}
 const denied=error.message==='approved_coach_required'||error.status===403;
 $('gateMessage').textContent=denied?T('This workspace is available to approved coaches.','مساحة العمل للمدربين المعتمدين فقط.'):T('Your workspace could not load. Please retry. Your account is still signed in.','تعذر تحميل مساحة العمل. أعد المحاولة؛ ما زال حسابك مسجلاً.');
 const link=$('gateAction');link.hidden=false;link.textContent=denied?T('Go to my account','الانتقال إلى حسابي'):T('Try again','أعد المحاولة');link.href=denied?'/dashboard.html?legacy=1':'/coach-studio.html';
 }})();
})();
