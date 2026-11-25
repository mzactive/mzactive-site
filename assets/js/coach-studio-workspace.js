/* Dedicated workspace presentation; the dashboard remains the source of truth. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const tr=(en,ar)=>document.documentElement.lang==='ar'?ar:en;
const mode=new URLSearchParams(location.search).get('studio')==='1';
const workspaceURL='dashboard.html?studio=1';
const sections={
 calendar:{en:'Training calendar',ar:'تقويم التدريب',icon:'▦',ids:['whatsappTrainingForm']},
 athletes:{en:'My athletes',ar:'الرياضيون',icon:'◎',ids:['coachMyAthletes']},
 library:{en:'Exercise library',ar:'مكتبة التمارين',icon:'▤',ids:['whatsappTrainingForm']},
 templates:{en:'Program templates',ar:'قوالب البرامج',icon:'▧',ids:['whatsappTrainingForm']},
 history:{en:'Program history',ar:'سجل البرامج',icon:'◷',ids:['flexProgramHistory']},
 analytics:{en:'Performance',ar:'الأداء',icon:'↗',ids:['coachStatistics']},
 messages:{en:'Messages & workspace',ar:'المراسلات ومساحة العمل',icon:'✉',ids:['communityWorkspace']},
 ai:{en:'AI assistant',ar:'المساعد الذكي',icon:'✦',ids:['coachAiPanel','coachPlanAiPanel']},
 profile:{en:'Profile & account',ar:'الملف والحساب',icon:'◉',ids:['myProfilePanel','coachProfilePanel','coachContactPanel']},
 community:{en:'Community & posts',ar:'المجتمع والمنشورات',icon:'◇',ids:['coachCommunityPanel','coachBlogDetails']},
 teams:{en:'Teams',ar:'الفرق',icon:'⊞',ids:['coachTeamCreatePanel','coachTeams']}
};
const managed=[...new Set(Object.values(sections).flatMap(s=>s.ids))];
const element=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
let shell=null,active='calendar',header,heading,nav,link,homeLink,langButton,signout,settings,placeholder,coachPanel,main,oldNodes=[],oldHidden=new Map(),visibility=null;
function authorized(){return window.mzStudioDashboard?.role==='provider'&&window.MZAExercisePicker?.isAuthorized();}
function button(label,action){const b=element('button',label,'secondary');b.type='button';b.addEventListener('click',action);return b;}
function linkToWorkspace(){
 if(mode||!authorized()||$('mzaOpenCoachStudio'))return;
 const parent=$('coachTopNav')?.querySelector('.coach-top-menus');if(!parent)return;
 link=element('a',tr('Open Coach Studio','افتح استوديو المدرب'),'mza-studio-entry');link.id='mzaOpenCoachStudio';link.href=workspaceURL;parent.prepend(link);
 // The existing desktop menu may be hidden on phones.
 const mobile=element('a',tr('Open Coach Studio','افتح استوديو المدرب'),'mza-studio-entry mza-studio-mobile-entry');mobile.id='mzaOpenCoachStudioMobile';mobile.href=workspaceURL;$('coachPanel')?.prepend(mobile);
}
function setSection(key,openTool=true){
 if(!shell||!authorized()||!sections[key])return;
 active=key;const chosen=sections[key];heading.textContent=tr(chosen.en,chosen.ar);
 const visible=new Set(chosen.ids);
 for(const id of managed){const node=$(id);if(node)node.hidden=!visible.has(id);}
 coachPanel.hidden=!chosen.ids.some(id=>coachPanel.contains($(id)));
 for(const item of nav.querySelectorAll('[data-studio-section]')){const selected=item.dataset.studioSection===key;item.setAttribute('aria-current',selected?'page':'false');}
 if(key==='analytics')window.MZActiveCoachDashboard?.renderStatistics?.();
 if(key==='library'&&openTool){const b=$('studioExerciseLibrary');if(b&&!b.hidden)b.click();}
 if(key==='templates'&&openTool){const b=$('programTemplates');if(b&&!b.hidden)b.click();}
 if(openTool)main.scrollIntoView({block:'start'});
}
function renderNavigation(){
 nav.replaceChildren();
 for(const [key,s] of Object.entries(sections)){
   const b=button('',()=>setSection(key));b.dataset.studioSection=key;b.setAttribute('aria-current',active===key?'page':'false');
   const icon=element('span',s.icon,'mza-studio-nav-icon');icon.setAttribute('aria-hidden','true');b.append(icon,element('span',tr(s.en,s.ar)));nav.append(b);
 }
 heading.textContent=tr(sections[active].en,sections[active].ar);homeLink.textContent=tr('Back to MZActive','العودة إلى MZActive');langButton.textContent=tr('العربية','English');signout.textContent=tr('Sign out','تسجيل الخروج');settings.textContent=tr('Settings','الإعدادات');nav.setAttribute('aria-label',tr('Coach Studio sections','أقسام استوديو المدرب'));
}
function mount(){
 if(!authorized())return;
 if(!mode){linkToWorkspace();return;}
 if(shell){setSection(active,false);return;}
 const dashboard=$('dashboard');coachPanel=$('coachPanel');if(!dashboard||!coachPanel)return;
 shell=element('section',undefined,'mza-studio-shell');shell.id='mzaCoachStudio';
 header=element('div',undefined,'mza-studio-header');header.setAttribute('data-language-skip','');const brand=element('div',undefined,'mza-studio-brand');brand.append(element('strong','MZA'),element('span','COACH STUDIO'));
 const actions=element('div',undefined,'mza-studio-header-actions');homeLink=element('a','');homeLink.href='dashboard.html';langButton=button('',()=>$('lang')?.click());settings=button('',()=>window.MZActiveCoachDashboard?.settingsDialog?.());signout=button('',()=>$('signOut')?.click());actions.append(homeLink,langButton,settings,signout);header.append(brand,actions);
 nav=element('nav',undefined,'mza-studio-sidebar');nav.setAttribute('data-language-skip','');main=element('section',undefined,'mza-studio-main');main.tabIndex=-1;heading=element('h1','');heading.id='mzaStudioSectionTitle';heading.setAttribute('data-language-skip','');main.setAttribute('aria-labelledby',heading.id);main.append(heading);
 shell.append(header,nav,main);dashboard.append(shell);
 for(const id of ['myProfilePanel','coachPanel','communityWorkspace']){const node=$(id);if(!node)continue;const marker=document.createComment('mza-studio-original-'+id);node.before(marker);oldNodes.push({node,marker});main.append(node);}
 for(const id of managed){const node=$(id);if(node)oldHidden.set(node,node.hidden);}
 document.body.classList.add('mza-coach-studio-mode');renderNavigation();setSection(active,false);
 // Other existing listeners may refresh the dashboard sections. Reapply this view after refresh.
 visibility=new MutationObserver(()=>{if(!shell||!authorized())return;const wanted=new Set(sections[active].ids);for(const id of managed){const node=$(id);if(node&&node.hidden===wanted.has(id))node.hidden=!wanted.has(id);}const hide=!sections[active].ids.some(id=>coachPanel.contains($(id)));if(coachPanel.hidden!==hide)coachPanel.hidden=hide;});
 visibility.observe(main,{subtree:true,attributes:true,attributeFilter:['hidden']});
}
function unmount(){if(!shell)return;visibility?.disconnect();for(const [node,hidden] of oldHidden)node.hidden=hidden;for(const {node,marker} of oldNodes){marker.replaceWith(node);}coachPanel.hidden=false;shell.remove();shell=null;oldNodes=[];oldHidden.clear();document.body.classList.remove('mza-coach-studio-mode');}
document.addEventListener('mzactive:coach-tools-authorized',mount);
document.addEventListener('mzactive:coach-tools-denied',()=>{unmount();$('mzaOpenCoachStudio')?.remove();$('mzaOpenCoachStudioMobile')?.remove();});
document.addEventListener('mzactive:dashboard-loaded',e=>{if(e.detail?.role!=='provider'){unmount();$('mzaOpenCoachStudio')?.remove();$('mzaOpenCoachStudioMobile')?.remove();}});
document.addEventListener('mzactive:language-change',()=>{if(shell)renderNavigation();if(link)link.textContent=tr('Open Coach Studio','افتح استوديو المدرب');const mobile=$('mzaOpenCoachStudioMobile');if(mobile)mobile.textContent=tr('Open Coach Studio','افتح استوديو المدرب');});
$('signOut')?.addEventListener('click',()=>{unmount();$('mzaOpenCoachStudio')?.remove();$('mzaOpenCoachStudioMobile')?.remove();});
if(authorized())mount();
})();
