/* Dedicated workspace presentation; the dashboard remains the source of truth. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const tr=(en,ar)=>document.documentElement.lang==='ar'?ar:en;
const params=new URLSearchParams(location.search);const legacy=params.get('legacy')==='1';const deepLink=params.has('connection')||params.has('program')||!!(location.hash&&!['#loginForm','#registerForm','#signup','#login'].includes(location.hash));const mode=legacy&&params.get('studio')==='1';
const workspaceURL='/coach-studio.html';
const sections={
 calendar:{en:'Training calendar',ar:'تقويم التدريب',icon:'▦',ids:['whatsappTrainingForm']},
 athletes:{en:'My athletes',ar:'الرياضيون',icon:'◎',ids:['coachMyAthletes']},
 library:{en:'Exercises',ar:'التمارين',icon:'▤',ids:['mzaExerciseBrowser']},
 templates:{en:'Programs',ar:'البرامج والقوالب',icon:'▧',ids:['mzaTemplateBrowser']},
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
let exerciseBrowser,templateBrowser,setup,toolbarMore,libraryShortcut;let shell=null,active='calendar',header,heading,nav,link,homeLink,langButton,signout,settings,placeholder,coachPanel,main,oldNodes=[],oldHidden=new Map(),visibility=null;
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
 if(key==='library')renderExercises();
 if(key==='templates')renderTemplates();
 if(openTool)main.scrollIntoView({block:'start'});
}
function renderNavigation(){
 nav.replaceChildren();
 const primary=['calendar','athletes','templates','library','history'];
 const advanced=element('details',undefined,'mza-nav-more');advanced.append(element('summary',tr('More tools','أدوات إضافية')));
 for(const [key,s] of Object.entries(sections)){
   const b=button('',()=>setSection(key));b.dataset.studioSection=key;b.setAttribute('aria-current',active===key?'page':'false');
   const icon=element('span',s.icon,'mza-studio-nav-icon');icon.setAttribute('aria-hidden','true');b.append(icon,element('span',tr(s.en,s.ar)));(primary.includes(key)?nav:advanced).append(b);
 }
 nav.append(advanced);advanced.open=!primary.includes(active);heading.textContent=tr(sections[active].en,sections[active].ar);homeLink.textContent=tr('Classic dashboard','لوحة التحكم السابقة');langButton.textContent=tr('العربية','English');signout.textContent=tr('Sign out','تسجيل الخروج');settings.textContent=tr('Settings','الإعدادات');nav.setAttribute('aria-label',tr('Coach Studio sections','أقسام استوديو المدرب'));
}
function renderExercises(){
 if(!exerciseBrowser||!authorized())return;
 exerciseBrowser.replaceChildren();
 const intro=element('p',tr('Search your exercise library and add a movement to a workout.','ابحث في مكتبة التمارين وأضف تمريناً إلى حصة.'),'mza-library-intro');
 const controls=element('div',undefined,'mza-library-controls'),search=element('input'),filter=element('select'),day=element('select');
 search.type='search';search.placeholder=tr('Search exercises','ابحث عن التمارين');search.setAttribute('aria-label',search.placeholder);
 filter.setAttribute('aria-label',tr('Category','التصنيف'));filter.append(new Option(tr('All categories','كل التصنيفات'),'all'));
 const lib=window.MZAExerciseLibrary;for(const [key,names] of Object.entries(lib.categories))filter.append(new Option(tr(...names),key));
 day.setAttribute('aria-label',tr('Add to day','أضف إلى اليوم'));const days=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];const en=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],ar=['الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت','الأحد'];days.forEach((d,i)=>day.append(new Option(tr(en[i],ar[i]),d)));
 const count=element('p','','muted'),list=element('div',undefined,'mza-library-list');count.setAttribute('role','status');
 function paint(){list.replaceChildren();const items=lib.search(search.value,filter.value,[...lib.catalog,...(window.MZAExercisePicker?.listCustom()||[])]);count.textContent=items.length+' '+tr('exercises','تمرين');for(const x of items){const row=element('article',undefined,'mza-library-row');const name=element('strong',tr(x.en,x.ar)),meta=element('small',tr(...(lib.categories[x.category]||['Other','أخرى'])),'muted');const desc=element('div');desc.append(name,meta);const add=button(tr('Add to workout','أضف إلى الحصة'),()=>{setSection('calendar',false);window.MZActiveStudio?.openExercise(day.value,x.id);});row.append(desc,add);list.append(row);}if(!items.length)list.append(element('p',tr('No matching exercises','لا توجد تمارين مطابقة'),'muted'));}
 search.oninput=paint;filter.onchange=paint;controls.append(search,filter,day);
 const custom=button(tr('Manage my exercises','إدارة تماريني'),()=>{setSection('calendar',false);$('studioExerciseLibrary')?.click();});
 exerciseBrowser.append(intro,controls,count,list,custom);paint();
}
function renderTemplates(){
 if(!templateBrowser||!authorized())return;templateBrowser.replaceChildren();
 const editor=window.MZActiveProgramEditor,top=element('div',undefined,'mza-library-controls');
 const create=button(tr('Create program','إنشاء برنامج'),()=>{setSection('calendar',false);$('studioNewProgram')?.click();});
 const save=button(tr('Save current as template','حفظ الحالي كقالب'),()=>{$('programTemplates')?.click();});
 top.append(create,save);const intro=element('p',tr('Reusable programs. Choose an empty calendar draft and its start date before applying a copy. Templates are saved on this browser.','برامج قابلة لإعادة الاستخدام. اختر مسودة تقويم فارغة وتاريخ البداية قبل تطبيق نسخة. القوالب محفوظة في هذا المتصفح.'),'mza-library-intro');
 const list=element('div',undefined,'mza-library-list'),status=element('p','','muted');status.setAttribute('role','status');
 for(const item of editor?.listTemplates()||[]){const row=element('article',undefined,'mza-library-row'),desc=element('div');desc.append(element('strong',item.name),element('small',item.sessions.length+' '+tr('workouts','حصص')+' · '+item.duration+' '+tr(...({days:['days','أيام'],weeks:['weeks','أسابيع'],months:['months','أشهر']}[item.unit]||['',''])),'muted'));row.append(desc,button(tr('Add to calendar','أضف إلى التقويم'),()=>{if(editor.useTemplate(item.id))setSection('calendar',false);else status.textContent=tr('Start an empty new program first. No existing workouts were changed.','ابدأ برنامجاً جديداً فارغاً أولاً. لم تتغير الحصص الموجودة.');}));list.append(row);}
 if(!list.children.length)list.append(element('p',tr('No templates yet. Create workouts, then save the program as a template.','لا توجد قوالب بعد. أنشئ حصصاً ثم احفظ البرنامج كقالب.'),'muted'));
 templateBrowser.append(top,intro,status,list);
}
function updateSetupLabels(){if(!setup)return;setup.querySelector('summary').textContent=tr('Program settings · athlete, start date, duration','إعدادات البرنامج · الرياضي، البداية، المدة');if(toolbarMore)toolbarMore.querySelector('summary').textContent=tr('More calendar tools','أدوات التقويم الإضافية');if(libraryShortcut)libraryShortcut.textContent=tr('Add from library','أضف من المكتبة');}
function simplifyEditor(){
 const form=$('whatsappTrainingForm'),workspace=form?.querySelector('.studio-workspace'),toolbar=workspace?.querySelector('.studio-toolbar');if(!form||!workspace||!toolbar)return;
 setup=element('details',undefined,'mza-program-setup');setup.id='mzaProgramSetup';setup.append(element('summary'));setup.open=true;const grid=element('div',undefined,'mza-setup-grid');setup.append(grid);form.insertBefore(setup,workspace);
 for(const node of [...form.children]){if(node===setup||node===workspace||node.classList.contains('studio-sources')||node.classList.contains('studio-savebar')||node.tagName==='H2'||node.tagName==='P')continue;const marker=document.createComment('mza-setup-field');node.before(marker);node._mzaSetupMarker=marker;grid.append(node);}
 toolbarMore=element('details',undefined,'mza-calendar-more');toolbarMore.append(element('summary'));const inner=element('div',undefined,'mza-calendar-more-body');toolbarMore.append(inner);toolbar.append(toolbarMore);libraryShortcut=button(tr('Add from library','أضف من المكتبة'),()=>setSection('library'));libraryShortcut.id='mzaAddFromLibrary';toolbar.insertBefore(libraryShortcut,toolbarMore);
 for(const node of [toolbar.querySelector('.studio-tabs'),$('programWeekShortcuts'),$('programTemplates')]){if(!node)continue;const marker=document.createComment('mza-toolbar-field');node.before(marker);node._mzaToolbarMarker=marker;inner.append(node);}
 updateSetupLabels();
}
function restoreEditor(){libraryShortcut?.remove();libraryShortcut=null;if(setup){for(const node of [...setup.querySelector('.mza-setup-grid').children])node._mzaSetupMarker?.replaceWith(node);setup.remove();setup=null;}if(toolbarMore){for(const node of [...toolbarMore.querySelector('.mza-calendar-more-body').children])node._mzaToolbarMarker?.replaceWith(node);toolbarMore.remove();toolbarMore=null;}}
function mount(){
 if(!authorized())return;
 if(!legacy&&!deepLink){location.replace(workspaceURL);return;}
 if(!mode){linkToWorkspace();return;}
 if(shell){setSection(active,false);return;}
 const dashboard=$('dashboard');coachPanel=$('coachPanel');if(!dashboard||!coachPanel)return;
 shell=element('section',undefined,'mza-studio-shell');shell.id='mzaCoachStudio';
 header=element('div',undefined,'mza-studio-header');header.setAttribute('data-language-skip','');const brand=element('div',undefined,'mza-studio-brand');brand.append(element('strong','MZA'),element('span','COACH STUDIO'));
 const actions=element('div',undefined,'mza-studio-header-actions');homeLink=element('a','');homeLink.href='dashboard.html?legacy=1&studio=0';langButton=button('',()=>$('lang')?.click());settings=button('',()=>window.MZActiveCoachDashboard?.settingsDialog?.());signout=button('',()=>$('signOut')?.click());const nextStudio=element('a',tr('New Coach Studio','استوديو المدرب الجديد'));nextStudio.id='mzaCoachStudioV2Link';nextStudio.href='/coach-studio.html';actions.append(nextStudio,homeLink,langButton,settings,signout);header.append(brand,actions);
 nav=element('nav',undefined,'mza-studio-sidebar');nav.setAttribute('data-language-skip','');main=element('section',undefined,'mza-studio-main');main.tabIndex=-1;heading=element('h1','');heading.id='mzaStudioSectionTitle';heading.setAttribute('data-language-skip','');main.setAttribute('aria-labelledby',heading.id);main.append(heading);
 shell.append(header,nav,main);dashboard.append(shell);
 exerciseBrowser=element('section',undefined,'mza-library-page');exerciseBrowser.id='mzaExerciseBrowser';exerciseBrowser.hidden=true;templateBrowser=element('section',undefined,'mza-library-page');templateBrowser.id='mzaTemplateBrowser';templateBrowser.hidden=true;main.append(exerciseBrowser,templateBrowser);
 for(const id of ['notice','myProfilePanel','coachPanel','communityWorkspace']){const node=$(id);if(!node)continue;const marker=document.createComment('mza-studio-original-'+id);node.before(marker);oldNodes.push({node,marker});main.append(node);}
 for(const id of managed){const node=$(id);if(node)oldHidden.set(node,node.hidden);}
 simplifyEditor();document.body.classList.add('mza-coach-studio-mode');renderNavigation();setSection(active,false);
 // Other existing listeners may refresh the dashboard sections. Reapply this view after refresh.
 visibility=new MutationObserver(()=>{if(!shell||!authorized())return;const wanted=new Set(sections[active].ids);for(const id of managed){const node=$(id);if(node&&node.hidden===wanted.has(id))node.hidden=!wanted.has(id);}const hide=!sections[active].ids.some(id=>coachPanel.contains($(id)));if(coachPanel.hidden!==hide)coachPanel.hidden=hide;});
 visibility.observe(main,{subtree:true,attributes:true,attributeFilter:['hidden']});
}
function unmount(){if(!shell)return;visibility?.disconnect();restoreEditor();for(const [node,hidden] of oldHidden)node.hidden=hidden;for(const {node,marker} of oldNodes){marker.replaceWith(node);}coachPanel.hidden=false;shell.remove();shell=null;oldNodes=[];oldHidden.clear();document.body.classList.remove('mza-coach-studio-mode');}
document.addEventListener('mzactive:coach-tools-authorized',mount);
document.addEventListener('mzactive:template-library-changed',()=>{if(shell&&active==='templates')renderTemplates();});
document.addEventListener('mzactive:studio-navigate',e=>{if(shell)setSection(e.detail,false);});
document.addEventListener('mzactive:coach-tools-denied',()=>{unmount();$('mzaOpenCoachStudio')?.remove();$('mzaOpenCoachStudioMobile')?.remove();});
document.addEventListener('mzactive:dashboard-loaded',e=>{if(e.detail?.role!=='provider'){unmount();$('mzaOpenCoachStudio')?.remove();$('mzaOpenCoachStudioMobile')?.remove();}});
document.addEventListener('mzactive:language-change',()=>{if(shell){renderNavigation();setSection(active,false);updateSetupLabels();const next=$('mzaCoachStudioV2Link');if(next)next.textContent=tr('New Coach Studio','استوديو المدرب الجديد');}if(link)link.textContent=tr('Open Coach Studio','افتح استوديو المدرب');const mobile=$('mzaOpenCoachStudioMobile');if(mobile)mobile.textContent=tr('Open Coach Studio','افتح استوديو المدرب');});
$('signOut')?.addEventListener('click',()=>{unmount();$('mzaOpenCoachStudio')?.remove();$('mzaOpenCoachStudioMobile')?.remove();});
if(authorized())mount();
})();
