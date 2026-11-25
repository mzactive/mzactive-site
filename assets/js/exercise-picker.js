/* MZA Training Studio: progressive enhancement for the existing workout dialog. */
(() => {
'use strict';
const lib=window.MZAExerciseLibrary;if(!lib)return;
const ar=()=>document.documentElement.lang==='ar';
const tr=(en,a)=>ar()?a:en;
const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
const button=(text,fn)=>{const b=el('button',text);b.type='button';b.className='secondary';b.addEventListener('click',fn);return b;};
let coachKey='',coachToken='';
function owner(){return coachToken===window.MZActiveAuth?.token()&&window.mzStudioDashboard?.role==='provider'?coachKey:'';}
async function authorize(){coachKey='';coachToken='';const button=document.getElementById('studioExerciseLibrary'),picker=document.getElementById('mzaExercisePicker');if(button)button.hidden=true;if(picker){picker.hidden=true;picker.open=false;}const token=window.MZActiveAuth?.token();if(!token||window.mzStudioDashboard?.role!=='provider')return;try{const opts={headers:{authorization:'Bearer '+token},cache:'no-store'};const [a,p]=await Promise.all(['/api/me/access','/api/me/profile'].map(path=>fetch(window.MZACTIVE_API_BASE+path,opts).then(r=>r.ok?r.json():null)));if(token!==window.MZActiveAuth?.token()||window.mzStudioDashboard?.role!=='provider'||!a?.user?.id||a.account_type!=='provider'||!['coach','bodybuilding_coach'].includes(p?.profile?.provider_type)||p.profile.status!=='approved')return;coachKey=String(a.user.id);coachToken=token;if(button)button.hidden=false;if(picker)picker.hidden=false;}catch{}}
document.addEventListener('mzactive:dashboard-loaded',authorize);document.getElementById('signOut')?.addEventListener('click',()=>{coachKey='';coachToken='';const b=document.getElementById('studioExerciseLibrary'),p=document.getElementById('mzaExercisePicker');if(b)b.hidden=true;if(p){p.hidden=true;p.open=false;}});
function storageKey(){const id=owner();return id?'mza-exercise-custom-v1:'+id:'';}
function customs(){const key=storageKey();if(!key)return [];try{const items=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(items)?items.filter(x=>x&&typeof x.en==='string'&&typeof x.ar==='string'&&lib.categories[x.category]&&typeof x.id==='string').slice(0,100):[];}catch{return [];}}
function saveCustom(items){const key=storageKey();if(!key)return false;try{localStorage.setItem(key,JSON.stringify(items));return true;}catch{return false;}}
function mount(parent,onInsert){
const wrap=el('details');wrap.id='mzaExercisePicker';wrap.hidden=true;wrap.className='mza-exercise-picker';wrap.setAttribute('data-language-skip','');
const summary=el('summary'),panel=el('div');panel.className='mza-exercise-panel';wrap.append(summary,panel);parent.before(wrap);
let category='all',query='',selected=null,customOnly=false;
const fields=[['sets','Sets','المجموعات','number','1','100'],['reps','Reps','التكرارات','text'],['weight','Weight (kg)','الوزن (كغ)','number','0','1000'],['distance','Distance (km)','المسافة (كم)','number','0','1000'],['duration','Duration (min)','المدة (دقيقة)','number','0','10080'],['pace','Pace (mm:ss/km)','الوتيرة (دقيقة:ثانية/كم)','text'],['rest','Rest (sec)','الراحة (ثانية)','number','0','3600'],['notes','Coach notes','ملاحظات المدرب','text']];
function render(){
summary.textContent=tr('Add exercise from library','إضافة تمرين من المكتبة');panel.replaceChildren();
const search=el('input');search.type='search';search.placeholder=tr('Search exercises, muscles, equipment…','ابحث عن التمرين أو العضلة أو المعدات…');search.value=query;search.setAttribute('aria-label',search.placeholder);
const filter=el('select');filter.setAttribute('aria-label',tr('Exercise category','تصنيف التمرين'));filter.append(new Option(tr('All categories','كل التصنيفات'),'all'));for(const [key,names] of Object.entries(lib.categories))filter.append(new Option(tr(...names),key));filter.value=category;
const filters=el('div');filters.className='mza-exercise-filters';filters.append(search,filter);
const toggle=button(customOnly?tr('Show all exercises','عرض كل التمارين'):tr('My exercises','تماريني الخاصة'),()=>{customOnly=!customOnly;selected=null;render();});toggle.setAttribute('aria-pressed',String(customOnly));
const list=el('div');list.className='mza-exercise-results';const count=el('p');count.className='muted';count.setAttribute('aria-live','polite');
const details=el('div');details.className='mza-exercise-prescription';
function results(){list.replaceChildren();const own=customs();const items=lib.search(query,category,customOnly?own:[...lib.catalog,...own]);count.textContent=tr('Exercises: ','عدد التمارين: ')+items.length;
for(const item of items){const b=button(ar()?item.ar:item.en,()=>{selected=item;prescription();for(const row of list.children)row.setAttribute('aria-pressed',String(row.dataset.exerciseId===item.id));});b.dataset.exerciseId=item.id;b.setAttribute('aria-pressed',String(selected?.id===item.id));const localized=value=>String(value||'').split(' / ')[ar()?1:0]||String(value||'');const meta=el('small',[item.muscle,item.equipment].filter(Boolean).map(localized).join(' · '));b.append(meta);list.append(b);}if(!items.length)list.append(el('p',tr('No matching exercises.','لا توجد تمارين مطابقة.')));}
function prescription(){details.replaceChildren();if(!selected)return;details.append(el('strong',ar()?selected.ar:selected.en));const grid=el('div');grid.className='mza-exercise-fields';const inputs={};
for(const [key,en,a,type,min,max] of fields){const label=el('label',tr(en,a));const input=el('input');input.type=type;input.dataset.exerciseField=key;if(type==='number'){input.min=min;input.max=max;input.step=key==='weight'||key==='distance'?'0.1':'1';}else{input.maxLength=key==='notes'?160:32;if(key==='pace')input.placeholder='5:30';}label.append(input);grid.append(label);inputs[key]=input;}
const error=el('p');error.className='muted';error.setAttribute('role','status');
const insert=button(tr('Add to workout','أضف إلى الحصة'),()=>{for(const input of Object.values(inputs))if(!input.checkValidity()){input.reportValidity();return;}const values=Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value]));if(values.pace&&!/^\d{1,3}:[0-5]\d$/.test(values.pace.trim())){error.textContent=tr('Use mm:ss for pace, e.g. 5:30.','أدخل الوتيرة بالدقائق والثواني، مثل 5:30.');return;}const result=onInsert(selected,lib.format(selected,values,ar()),lib.sport[selected.category]);error.textContent=result===false?tr('Workout is too long. Shorten the existing text.','الحصة طويلة جداً. اختصر النص الحالي.'):tr('Exercise added. You can add another.','تمت إضافة التمرين. يمكنك إضافة تمرين آخر.');});
details.append(grid,insert,error);
if(selected.id.startsWith('custom-'))details.append(button(tr('Remove from my library','حذف من مكتبتي'),()=>{if(saveCustom(customs().filter(x=>x.id!==selected.id))){selected=null;results();prescription();}else error.textContent=tr('Could not update local library.','تعذر تحديث المكتبة المحلية.');}));}
search.addEventListener('input',()=>{query=search.value;results();});filter.addEventListener('change',()=>{category=filter.value;results();});
const custom=el('details');const customTitle=el('summary',tr('Create my own exercise','إنشاء تمرين خاص بي'));custom.append(customTitle,el('p',tr('Saved on this browser for your coach account; not synced across devices.','يحفظ في هذا المتصفح لحساب المدرب ولا يتزامن بين الأجهزة.')));
const customGrid=el('div');customGrid.className='mza-exercise-fields';const customName=el('input'),customArabic=el('input'),customCategory=el('select');customName.placeholder='English name';customArabic.placeholder='الاسم بالعربية';customName.maxLength=100;customArabic.maxLength=100;customName.setAttribute('aria-label','English name');customArabic.setAttribute('aria-label','الاسم بالعربية');for(const [key,names] of Object.entries(lib.categories))customCategory.append(new Option(tr(...names),key));customCategory.setAttribute('aria-label',tr('Category','التصنيف'));customGrid.append(customName,customArabic,customCategory);
const customStatus=el('p');customStatus.setAttribute('role','status');
custom.append(customGrid,button(tr('Save private exercise','حفظ تمرين خاص'),()=>{const en=customName.value.trim(),a=customArabic.value.trim(),items=customs();if(!en||!a||items.length>=100){customStatus.textContent=tr('Enter both names; maximum 100 exercises.','أدخل الاسمين؛ الحد الأقصى 100 تمرين.');return;}const item={id:'custom-'+(crypto.randomUUID?crypto.randomUUID():Date.now()),en,ar:a,category:customCategory.value,muscle:'',equipment:''};if(!saveCustom([...items,item])){customStatus.textContent=tr('Local storage is unavailable.','التخزين المحلي غير متاح.');return;}customName.value='';customArabic.value='';customStatus.textContent=tr('Saved in your local library.','تم الحفظ في مكتبتك المحلية.');customOnly=true;query='';category='all';selected=item;render();}),customStatus);
panel.append(filters,toggle,count,list,details,custom);results();prescription();
}
wrap.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('input'))event.preventDefault();});
wrap.addEventListener('toggle',()=>{if(wrap.open)render();else panel.replaceChildren();});
document.addEventListener('mzactive:language-change',()=>{if(wrap.open)render();else summary.textContent=tr('Add exercise from library','إضافة تمرين من المكتبة');});
summary.textContent=tr('Add exercise from library','إضافة تمرين من المكتبة');
return {open(){if(!owner())return;query='';category='all';customOnly=false;selected=null;wrap.open=true;render();},reset(){wrap.open=false;panel.replaceChildren();selected=null;query='';category='all';customOnly=false;}};
}
window.MZAExercisePicker={mount};
})();
