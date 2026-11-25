(() => {
'use strict';
const root=document.getElementById('publicPeopleList'), status=document.getElementById('publicPeopleStatus');
const t=(en,ar)=>window.MZActiveLanguage?.get()==='ar'?ar:en;
let profiles=[];
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function render(){
 root.replaceChildren();
 for(const p of profiles){
  const fields=new Set(p.public_fields||[]);
  const card=el('a',undefined,'public-person');
  card.href=p.provider_type==='pacer'?'pacer.html?provider='+encodeURIComponent(p.id):'coach.html?id='+encodeURIComponent(p.id);
  const avatar=el('div',String(p.display_name||'MZ').slice(0,1).toUpperCase(),'public-person-avatar');
  if(p.has_profile_photo&&fields.has('profile_photo')){
   const photo=el('img');photo.alt='';photo.loading='lazy';photo.src=window.MZACTIVE_API_BASE+'/api/providers/'+encodeURIComponent(p.id)+'/photo';photo.addEventListener('error',()=>photo.remove(),{once:true});avatar.append(photo);
  }
  const info=el('div',undefined,'public-person-info');
  info.append(el('strong',p.display_name),el('small',p.provider_type==='pacer'?t('Pacer','مرافق رياضي'):t('Coach','مدرب')));
  if(fields.has('specialties')&&Array.isArray(p.specialties))info.append(el('small',p.specialties.slice(0,2).join(' · ')));
  card.append(avatar,info);root.append(card);
 }
 status.textContent=profiles.length?'':t('No public profiles to display yet.','لا توجد ملفات عامة لعرضها بعد.');
}
async function load(){status.textContent=t('Loading public profiles…','جارٍ تحميل الملفات العامة…');try{
 const response=await fetch(window.MZACTIVE_API_BASE+'/api/providers',{headers:{accept:'application/json'}});if(!response.ok)throw Error('unavailable');
 const data=await response.json();const eligible=(data.providers||[]).filter(p=>p.id&&p.display_name&&['coach','pacer'].includes(p.provider_type));profiles=[...eligible.filter(p=>p.provider_type==='coach'),...eligible.filter(p=>p.provider_type==='pacer')];render();
 }catch{status.textContent=t('Public profiles are temporarily unavailable.','الملفات العامة غير متاحة مؤقتاً.');}}
 document.addEventListener('mzactive:language-change',()=>{if(profiles.length)render();});load();
})();