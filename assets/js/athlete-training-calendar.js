/* MZA athlete calendar: uses the existing authorized dashboard and completion API. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const host=$('athleteProgramsPanel');if(!host)return;
const t=(en,ar)=>document.documentElement.lang==='ar'?ar:en;
const days=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const sports={run:['Run','جري'],bike:['Cycling','دراجات'],swim:['Swimming','سباحة'],strength:['Strength','قوة'],recovery:['Recovery','استشفاء'],other:['Other','أخرى']};
const dateRE=/^\d{4}-\d{2}-\d{2}$/;
function localDate(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function shift(date,n){const d=new Date(date+'T00:00:00Z');if(!Number.isFinite(d.getTime()))return '';d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function monday(date){const d=new Date(date+'T00:00:00Z');return shift(date,-((d.getUTCDay()+6)%7));}
const dateText=(date,options)=>new Intl.DateTimeFormat(t('en-GB','ar-QA'),{timeZone:'UTC',...options}).format(new Date(date+'T00:00:00Z'));
const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
const button=(text,fn)=>{const b=el('button',text,'secondary');b.type='button';b.onclick=fn;return b;};
const panel=el('section',undefined,'panel mza-athlete-calendar');panel.id='mzaAthleteCalendar';panel.hidden=true;panel.setAttribute('data-language-skip','');host.prepend(panel);
const dialog=el('dialog',undefined,'studio-dialog');dialog.id='mzaAthleteWorkout';document.body.append(dialog);
let programs=[],selected='',pending=false;
function sessions(){return programs.flatMap(p=>(p.sessions||[]).map(s=>{const fallback=dateRE.test(p.week_start||'')&&days.includes(s.day_key)?shift(monday(p.week_start),days.indexOf(s.day_key)):'';return {...s,date:dateRE.test(s.session_date||'')?s.session_date:fallback};})).filter(s=>s.date&&s.id);}
function parse(details){const lines=String(details||'').split('\n');let meta={};if(lines[1]?.startsWith('[MZ:')){try{meta=JSON.parse(lines[1].slice(4,-1));}catch{}return{title:lines[0],body:lines.slice(2).join('\n'),meta};}return {title:lines[0],body:lines.slice(1).join('\n'),meta};}
function render(){
 if(window.mzStudioDashboard?.role!=='member'){panel.hidden=true;return;}panel.hidden=false;if(!selected)selected=localDate();panel.replaceChildren();
 const heading=el('h2',t('My training','تدريبي'));const sub=el('p',t('Your assigned workouts, calendar and progress.','حصصك المخصصة وتقويمك وتقدمك.'),'muted');panel.append(heading,sub);
 const rows=sessions(),start=monday(selected),end=shift(start,6),week=rows.filter(s=>s.date>=start&&s.date<=end),done=week.filter(s=>s.completed_at);
 const metrics=el('div',undefined,'mza-athlete-metrics');for(const [value,label] of [[done.length+' / '+week.length,t('Completed this week','حصص مكتملة هذا الأسبوع')],[done.reduce((n,s)=>n+Number(s.actual_km||0),0).toFixed(1)+' km',t('Distance logged','المسافة المسجلة')],[done.reduce((n,s)=>n+Number(s.duration_minutes||0),0)+' min',t('Time logged','المدة المسجلة')]]){const cell=el('div');cell.append(el('strong',value),el('small',label));metrics.append(cell);}panel.append(metrics);
 const nav=el('div',undefined,'mza-athlete-week-nav');const title=el('strong',dateText(start,{day:'numeric',month:'short'})+' — '+dateText(end,{day:'numeric',month:'short',year:'numeric'}));nav.append(button(t('Previous','السابق'),()=>{selected=shift(selected,-7);render();}),title,button(t('Next','التالي'),()=>{selected=shift(selected,7);render();}),button(t('Today','اليوم'),()=>{selected=localDate();render();}));panel.append(nav);
 const strip=el('div',undefined,'mza-athlete-days');for(let i=0;i<7;i++){const date=shift(start,i),count=rows.filter(s=>s.date===date).length,b=button('',()=>{selected=date;render();});b.dataset.athleteDate=date;b.setAttribute('aria-pressed',String(date===selected));b.append(el('span',dateText(date,{weekday:'short'})),el('strong',String(new Date(date+'T00:00:00Z').getUTCDate())),el('small',count?String(count):'–'));strip.append(b);}panel.append(strip);
 const list=el('div',undefined,'mza-athlete-workouts');list.append(el('h3',dateText(selected,{weekday:'long',day:'numeric',month:'long'})));
 const today=rows.filter(s=>s.date===selected);
 if(!today.length)list.append(el('p',t('No assigned workouts for this day.','لا توجد حصص مخصصة لهذا اليوم.'),'muted'));
 for(const session of today){const d=parse(session.details),card=el('article',undefined,'mza-athlete-workout');const state=el('span',session.completed_at?t('Completed','مكتملة'):t('Planned','مخططة'),session.completed_at?'mza-workout-done':'muted');card.append(el('small',t(...(sports[session.sport_type]||sports.other))),el('h4',d.title||t('Workout','حصة')),state);const meta=[d.meta.km?d.meta.km+' km':'',d.meta.minutes?d.meta.minutes+' min':''].filter(Boolean).join(' · ');if(meta)card.append(el('p',meta,'muted'));card.append(button(session.completed_at?t('View / edit log','عرض / تعديل السجل'):t('View workout','عرض الحصة'),()=>openWorkout(session)));list.append(card);}panel.append(list);
 const future=rows.map(s=>s.date).filter(d=>d>=localDate()).sort()[0];if(future&&future!==selected)panel.append(button(t('Next assigned workout','الحصة القادمة'),()=>{selected=future;render();}));
}
function openWorkout(session){
 if(window.mzStudioDashboard?.role!=='member'||pending)return;dialog.replaceChildren();
 const d=parse(session.details),heading=el('h2',d.title||t('Workout','حصة')),body=el('p',undefined,'mza-athlete-instructions'),status=el('p',undefined,'muted');status.setAttribute('role','status');window.MZAWorkoutVideo.appendInstructions(body,d.body,t('Watch demonstration on YouTube ↗','شاهد شرح التمرين على يوتيوب ↗'));
 const km=el('input'),min=el('input');km.type=min.type='number';km.min=min.min='0';km.max='500';km.step='0.1';min.max='720';min.step='1';km.value=session.completed_at?String(session.actual_km||0):'';min.value=session.completed_at?String(session.duration_minutes||0):'';const labelKm=el('label',t('Actual distance (km)','المسافة الفعلية (كم)')),labelMin=el('label',t('Actual duration (min)','المدة الفعلية (دقائق)'));labelKm.append(km);labelMin.append(min);const grid=el('div',undefined,'mza-exercise-fields');grid.append(labelKm,labelMin);
 const save=button(t('Mark completed / save log','تسجيل الحصة كمكتملة'),()=>submit(true));save.dataset.athleteComplete='true';
 const close=button(t('Close','إغلاق'),()=>{if(!pending)dialog.close();});const reset=button(t('Mark incomplete','إلغاء إكمال الحصة'),()=>submit(false));reset.hidden=!session.completed_at;
 async function submit(completed){if(pending||window.mzStudioDashboard?.role!=='member')return;if(completed&&(!km.checkValidity()||!min.checkValidity())){if(!km.checkValidity())km.reportValidity();else min.reportValidity();return;}const token=window.MZActiveAuth?.token();if(!token){status.textContent=t('Sign in again.','سجل الدخول مجدداً.');return;}pending=true;save.disabled=reset.disabled=close.disabled=true;
  try{const res=await fetch(window.MZACTIVE_API_BASE+'/api/dashboard/program-sessions/'+encodeURIComponent(session.id)+'/complete',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({completed,actual_km:Number(km.value||0),duration_minutes:Number(min.value||0)})});const data=await res.json();if(!res.ok)throw Error(data.error||'request_failed');if(token!==window.MZActiveAuth?.token())return;for(const p of programs){const s=(p.sessions||[]).find(x=>x.id===session.id);if(s){s.completed_at=completed?new Date().toISOString():null;s.actual_km=completed?data.actual_km:0;s.duration_minutes=completed?data.duration_minutes:0;}}dialog.close();render();document.dispatchEvent(new CustomEvent('mzactive:athlete-log-updated',{detail:window.mzStudioDashboard}));}catch{status.textContent=t('Could not save. Please try again.','تعذر الحفظ. حاول مرة أخرى.');}finally{pending=false;save.disabled=reset.disabled=close.disabled=false;}}
 dialog.append(heading,body,grid,save,reset,close,status);dialog.showModal();
}
dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault();});
function update(data){if(data?.role!=='member'){panel.hidden=true;programs=[];selected='';return;}programs=data.programs||[];render();}
document.addEventListener('mzactive:dashboard-loaded',e=>update(e.detail));
document.addEventListener('mzactive:language-change',()=>{if(dialog.open&&!pending)dialog.close();render();});
$('signOut')?.addEventListener('click',()=>{panel.hidden=true;panel.replaceChildren();programs=[];selected='';if(dialog.open)dialog.close();});
if(window.mzStudioDashboard)update(window.mzStudioDashboard);
})();
