(() => {
  const $ = id => document.getElementById(id);
  const lang = window.MZActiveLanguage, t = (en,ar) => lang.get()==='ar'?ar:en;
  const key = 'mzactive-provider-session';
  const base = window.MZACTIVE_API_BASE;
  const tabs = {overview:['Overview','نظرة عامة'],coaches:['Coaches','المدربون'],bookings:['Bookings','الحجوزات'],athletes:['Athletes & training','الرياضيون والتدريب'],articles:['Articles','المقالات'],ai:['AI Brain','المساعد الذكي'],history:['Activity','سجل النشاط']};
  const labels = {operations:['Operations manager','مدير العمليات'],monitoring:['Website monitoring','مراقبة الموقع'],analytics:['Business analytics','تحليل الأعمال'],growth:['Growth and strategy','النمو والاستراتيجية'],marketing:['Marketing','التسويق'],community:['Community planning','تخطيط المجتمع'],support:['Customer support','دعم العملاء'],
    received:['Received','تم الاستلام'],reviewing:['Under review','قيد المراجعة'],accepted:['Confirmed','مؤكد'],cancelled:['Cancelled','ملغى'],declined:['Declined','مرفوض'],approved:['Approved','معتمد'],rejected:['Rejected','مرفوض'],pending:['Pending','قيد الانتظار'],completed:['Completed','مكتمل'],failed:['Failed','فشل'],running:['Running','قيد التنفيذ'],run_completed:['AI analysis completed','اكتمل التحليل الذكي'],scheduled_snapshot_completed:['Data collected','تم جمع البيانات'],run_failed:['Analysis failed','فشل التحليل'],program_assigned:['Program assigned','تم ربط البرنامج'],run_started:['Analysis started','بدأ التحليل'],owner:['Owner','المالك'],coach:['Coach','مدرب'],pacer:['Pacer','مرافق جري']};
  const name = code => labels[code]?t(...labels[code]):code;
  const metrics = {pending_provider_profiles:['Coach applications','طلبات المدربين'],open_booking_requests:['Open bookings','طلبات الحجز المفتوحة'],pending_coach_articles:['Articles for review','مقالات للمراجعة'],unlinked_programs:['Programs without athlete access','برامج غير مرتبطة بحساب'],approved_providers:['Approved providers','مقدمو الخدمة المعتمدون'],registered_athletes:['Athlete accounts','حسابات الرياضيين'],active_training_teams:['Training teams','فرق التدريب']};
  let tab='overview', sequence=0;
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el};
  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const date=s=>new Date(s).toLocaleString(lang.get()==='ar'?'ar-QA':'en-GB');
  const notice=s=>{$('notice').textContent=s};
  function lock(){sequence++;sessionStorage.removeItem(key);$('workspace').hidden=true;$('out').hidden=true;$('view').replaceChildren();$('login').hidden=false}
  async function api(path,{method='GET',body,headers={}}={}){
    const token=sessionStorage.getItem(key);
    if(token)headers.authorization='Bearer '+token;
    const binary=body instanceof Blob;
    const r=await fetch(base+'/api/'+path,{method,headers:{'content-type':binary?body.type:'application/json',...headers},body:binary?body:JSON.stringify(body),cache:'no-store'});
    if(r.status===401 && !path.startsWith('auth/'))lock();
    if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.error||(r.status>=500?'service_unavailable':'request_failed'))}
    return r.headers.get('content-type')?.startsWith('image/')?r.blob():r.json();
  }
  function errorMessage(err){const messages={service_unavailable:['The service is temporarily unavailable. Please try again shortly.','الخدمة غير متاحة مؤقتاً. يرجى المحاولة بعد قليل.'],invalid_credentials:['Email or password is incorrect.','البريد أو كلمة المرور غير صحيحة.'],unauthorized:['Please sign in again.','يرجى تسجيل الدخول مجدداً.'],forbidden:['An administrator account is required.','يلزم حساب مسؤول.'],rate_limited:['Try again in a minute.','حاول بعد دقيقة.'],daily_limit_reached:['Daily AI allowance reached.','تم بلوغ الحد اليومي للتحليل.'],assistant_unavailable:['AI analysis failed. Check the task history.','تعذر التحليل. راجع سجل المهام.'],profile_changed_reload_review:['This profile changed. Refresh before reviewing.','تغير الملف. حدّث البيانات قبل المراجعة.'],coach_profile_incomplete:['The coach must complete their biography and specialties first.','يجب إكمال النبذة والتخصصات أولاً.']};return t(...(messages[err.message]||['Could not complete the request. Refresh and try again.','تعذر إتمام الطلب. حدّث الصفحة وحاول مجدداً.']))}
  function button(text,fn){const b=node('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn()}catch(e){notice(errorMessage(e))}finally{b.disabled=false}};return b}
  function link(text,href){const a=node('a',text,'link');a.href=href;return a}
  function card(container,title,details){const c=node('article',null,'card');c.append(node('h3',title));if(details)c.append(node('p',details));container.append(c);return c}
  function group(root,title,items,paint){root.append(node('h3',title));if(!items.length){root.append(node('p',t('No records.','لا توجد سجلات.')));return}for(const item of items)paint(root,item)}
  async function save(path,body,method='PATCH'){await api(path,{method,body});notice(t('Saved.','تم الحفظ.'));await render()}
  function go(next){tab=next;notice('');return render()}
  function staticLabels(){for(const e of document.querySelectorAll('[data-en]'))e.textContent=e.dataset[lang.get()];$('language').textContent=t('العربية','English')}
  function photo(c,id,path){const img=node('img');img.className='thumb';img.alt=t('Coach photo','صورة المدرب');c.append(img);api('admin/providers/'+id+'/'+path).then(blob=>{const url=URL.createObjectURL(blob);img.onload=img.onerror=()=>URL.revokeObjectURL(url);img.src=url}).catch(()=>img.replaceWith(node('small',t('Photo unavailable','تعذر تحميل الصورة'))))}
  function upload(c,p){const label=node('label',t('Upload or replace portrait (1 MB)','رفع الصورة الشخصية أو استبدالها (١ ميغابايت)'));const f=node('input');f.type='file';f.accept='image/jpeg,image/png,image/webp';label.append(f);c.append(label);f.onchange=async()=>{const file=f.files[0];if(!file)return;if(file.size>1000000){notice(t('Maximum size is 1 MB.','الحد الأقصى ١ ميغابايت.'));return}f.disabled=true;try{await save('admin/providers/'+p.id+'/photo',file,'PUT')}catch(e){notice(errorMessage(e))}finally{f.disabled=false}}}
  function provider(root,p,status){
    const path='admin/providers/'+p.id,c=card(root,p.display_name,[p.email,[p.city,p.country].filter(Boolean).join(', '),name(p.provider_type)].filter(Boolean).join(' · '));
    if(p.has_profile_photo)photo(c,p.id,'photo');
    if(status==='pending'){
      const parts=[p.bio,...(parse(p.specialties_json)||[]),...(parse(p.languages_json)||[]),p.qualifications,...(parse(p.services_json)||[]),p.coaching_mode,p.experience_years? p.experience_years+' '+t('years','سنوات'):'',p.indicative_rate_qar? p.indicative_rate_qar+' QAR':'',p.whatsapp_public?p.whatsapp_number:'',...(parse(p.social_links_json)||[])];c.append(node('p',parts.filter(Boolean).join('\n')));
      for(const slot of parse(p.gallery_slots)||[])photo(c,p.id,'gallery/'+slot);
      const verify=node('input');verify.type='checkbox';if(p.provider_type==='coach'){const l=node('label');l.append(verify,t(' Identity and qualifications verified',' تحققت من الهوية والمؤهلات'));c.append(l)}
      c.append(button(t('Approve','اعتماد'),()=>save(path,{status:'approved',verified:verify.checked,review_version:p.updated_at})),button(t('Reject','رفض'),()=>{if(confirm(t('Reject this application?','هل ترفض هذا الطلب؟')))return save(path,{status:'rejected',review_version:p.updated_at})}));
    }
    if(status==='approved')c.append(link(t('Public profile','الملف العام'),'coach.html?id='+encodeURIComponent(p.id)));
    if(status!=='removed')upload(c,p);
    if(p.provider_type==='coach'&&status!=='pending'){const restore=status==='removed';c.append(button(restore?t('Restore access','استعادة الوصول'):t('Suspend access','تعليق الوصول'),()=>{if(confirm(t('Change access for ','تغيير صلاحية الوصول لـ ')+p.display_name+'؟'))return save(path,{status:restore?'approved':'suspended',review_version:p.updated_at})}))}
  }
  function booking(root,b){const c=card(root,b.customer_name,[name(b.status),b.coach_name,b.city,b.preferred_date,b.customer_phone,b.customer_email,b.session_type,b.distance,b.target_pace,b.program_duration_months?b.program_duration_months+' '+t('months','أشهر'):'',b.goal_summary].filter(Boolean).join(' · '));const actions={reviewing:['Review','بدء المراجعة'],accepted:['Confirm booking','تأكيد الحجز'],declined:['Decline','رفض'],cancelled:['Cancel booking','إلغاء الحجز']};for(const status of ({received:['reviewing','accepted','declined','cancelled'],reviewing:['accepted','declined','cancelled'],accepted:['cancelled']}[b.status]||[])){c.append(button(t(...actions[status]),()=>{if(status!=='reviewing'&&!confirm(t(...actions[status])+'؟'))return;return save('admin/bookings/'+b.id,{status})}))}}
  function agentName(task){return name(parse(task.input_json)?.agent||task.agent_type)}
  function phase(task){const out=parse(task.output_json);if(task.status==='failed')return name('failed');if(out?.answer)return t('AI analysis completed','اكتمل التحليل الذكي');if(out?.snapshot)return t('Data collected','تم جمع البيانات');return name(task.status)}
  function taskCard(root,task){const output=parse(task.output_json),c=card(root,agentName(task),[date(task.created_at),task.source==='scheduled'?t('Automatic','تلقائي'):t('Manual','يدوي'),phase(task)].join(' · '));if(task.status==='failed'){c.append(node('p',errorMessage(Error(task.error_message))));return}if(!output?.answer)return;c.append(node('p',output.answer),node('strong',task.approval_status==='pending'?t('Awaiting approval','بانتظار الموافقة'):name(task.approval_status)));if(task.approval_status==='pending')for(const decision of ['approved','rejected'])c.append(button(decision==='approved'?t('Approve draft','اعتماد المسودة'):t('Reject draft','رفض المسودة'),()=>save('admin/agents/'+task.id,{decision})))}
  async function paint(root){
    if(tab==='overview'||tab==='ai'){
      const data=await api('admin/agents'),tasks=data.tasks;
      if(tab==='overview'){
        const grid=node('div',null,'grid');root.append(grid);
        for(const [k,v] of Object.entries(metrics)){const c=card(grid,t(...v));c.append(node('strong',data.snapshot[k],'metric'));const dest={pending_provider_profiles:'coaches',open_booking_requests:'bookings',pending_coach_articles:'articles',unlinked_programs:'athletes',registered_athletes:'athletes',active_training_teams:'athletes',approved_providers:'coaches'}[k];c.append(button(t('View','عرض'),()=>go(dest)))}
        const latest=tasks.find(x=>x.source==='scheduled');
        if(latest)card(root,t('Latest automatic run','آخر تشغيل تلقائي'),[agentName(latest),phase(latest),date(latest.created_at)].join(' · '));
        group(root,t('AI decisions awaiting approval','قرارات المساعد بانتظار الموافقة'),data.pending,taskCard);
        card(root,t('Service status','حالة الخدمات'),[data.status==='available'?t('AI provider configured','مزود الذكاء الاصطناعي مهيأ'):t('AI provider unavailable','مزود الذكاء الاصطناعي غير متاح'),t('Registration and booking email delivery is not configured.','إرسال إشعارات التسجيل والحجز بالبريد غير مهيأ.'),t('Community moderation is unavailable.','إشراف المجتمع غير متاح.')].join('\n'));return;
      }
      root.append(node('p',t('An agent analyzes current business data every hour. The six agents take turns. Drafts require your decision.','يتناوب ستة وكلاء على تحليل بيانات المنصة كل ساعة. تتطلب المسودات قرارك.')));
      const select=node('select'),prompt=node('textarea');prompt.maxLength=1600;
      for(const code of ['operations','monitoring','analytics','marketing','growth','community','support']){const o=node('option',name(code));o.value=code;select.append(o)}
      const l=node('label',t('Agent','الوكيل')),q=node('label',t('Question or objective','السؤال أو الهدف'));l.append(select);q.append(prompt);root.append(l,q,button(t('Run analysis','تنفيذ التحليل'),async()=>{if(!prompt.value.trim()){prompt.focus();return}try{await api('admin/assistant',{method:'POST',body:{task:select.value,prompt:prompt.value.trim()}});notice(t('Draft saved for review.','حُفظت المسودة للمراجعة.'))}finally{await render()}}));
      group(root,t('Recent runs','آخر عمليات التنفيذ'),tasks.slice(0,30),taskCard);return;
    }
    if(tab==='coaches'||tab==='bookings'){const d=await api('admin/applications');if(tab==='bookings'){group(root,t('Recent and open requests','الطلبات المفتوحة والأخيرة'),d.bookings,booking);return}
      for(const [title,rows,status] of [[t('Awaiting review','بانتظار المراجعة'),d.providers,'pending'],[t('Approved','معتمدون'),d.approved_providers,'approved'],[t('Suspended','معلّقون'),d.suspended_providers,'removed']])group(root,title,rows,(r,p)=>provider(r,p,status));return}
    if(tab==='articles'){const d=await api('admin/blog');group(root,t('Awaiting moderation','بانتظار المراجعة'),d.posts,(r,p)=>{const c=card(r,p.title,[p.coach_name,p.summary,p.body].join('\n'));for(const a of ['publish','return'])c.append(button(a==='publish'?t('Publish article','نشر المقال'):t('Return for edits','إعادة للتعديل'),()=>{if(a==='publish'&&!confirm(t('Publish this article?','نشر هذا المقال؟')))return;return save('admin/blog/'+p.id,{action:a})}))});return}
    if(tab==='athletes'){const d=await api('admin/athletes');root.append(link(t('Open training dashboard','فتح لوحة التدريب'),'dashboard.html'));group(root,t('Programs without account access','برامج غير مرتبطة بحساب'),d.unlinked,(r,p)=>{const c=card(r,p.athlete_name,p.week_start),sel=node('select');sel.setAttribute('aria-label',t('Athlete email','بريد الرياضي'));sel.append(node('option',t('Choose the athlete account','اختر حساب الرياضي')));sel.firstChild.value='';for(const a of d.athletes){const o=node('option',a.email);o.value=a.id;sel.append(o)}c.append(sel,button(t('Grant program access','منح الوصول للبرنامج'),()=>{if(sel.value&&confirm(t('Grant access to ','منح الوصول إلى ')+sel.selectedOptions[0].textContent+'؟'))return save('admin/programs/'+p.id+'/athlete',{athlete_id:sel.value})}))});group(root,t('Registered athletes','الرياضيون المسجلون'),d.athletes,(r,a)=>card(r,a.email,t('Assigned programs','البرامج المرتبطة')+' · '+a.programs));return}
    const [h,ai]=await Promise.all([api('admin/history'),api('admin/agents')]);const events=[...h.events,...ai.activity].sort((a,b)=>b.created_at.localeCompare(a.created_at));
    group(root,t('Recent decisions and activity','آخر القرارات والأنشطة'),events.slice(0,100),(r,e)=>card(r,e.action?name(e.action):e.entity_type==='provider_profile'?t('Coach profile','ملف المدرب'):e.entity_type==='registration'?t('New registration','تسجيل جديد'):t('Booking','حجز'),[date(e.created_at),e.action?name(e.agent_type):name(e.from_status),e.to_status?name(e.to_status):''].filter(Boolean).join(' · ')));
  }
  async function render(){const n=++sequence;staticLabels();$('nav').replaceChildren();for(const [id,v] of Object.entries(tabs)){const b=button(t(...v),()=>go(id));b.setAttribute('aria-current',id===tab);$('nav').append(b)}$('title').textContent=t(...tabs[tab]);$('view').textContent=t('Loading…','جارٍ التحميل…');const root=node('div');try{await paint(root);if(n===sequence)$('view').replaceChildren(root)}catch(err){if(n===sequence||$('workspace').hidden)notice(errorMessage(err));if(n===sequence)$('view').replaceChildren(button(t('Retry','إعادة المحاولة'),render))}}
  async function open(){
    try {
      await api('admin/history');
    } catch (err) {
      if (['unauthorized','forbidden'].includes(err.message)) {
        lock();
        notice(errorMessage(err));
        return;
      }
      notice(errorMessage(err));
      $('login').hidden=true;
      $('bootstrap').hidden=true;
      $('workspace').hidden=false;
      $('out').hidden=false;
      $('view').replaceChildren(button(t('Retry','إعادة المحاولة'),open));
      return;
    }
    notice('');
$('login').hidden=true;$('bootstrap').hidden=true;$('workspace').hidden=false;$('out').hidden=false;await render()}
  async function sign(form,setup){const f=form.elements;const d=await api(setup?'auth/register':'auth/login',{method:'POST',headers:setup?{'x-admin-setup-key':f.key.value}:{},body:{email:f.email.value,password:f.password.value,...(setup?{consent:true}:{})}});if(d.user?.role!=='admin')throw Error('forbidden');sessionStorage.setItem(key,d.token);form.reset();notice('');await open()}
  for(const id of ['setup','login'])$(id).onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,b=form.querySelector('button');b.disabled=true;try{await sign(form,id==='setup')}catch(err){lock();notice(errorMessage(err))}finally{b.disabled=false}};
  $('out').onclick=async()=>{try{await api('auth/logout',{method:'POST',body:{}})}finally{lock();notice('')}};
  $('language').onclick=()=>lang.set(t('ar','en'),{manual:true});
  document.addEventListener('mzactive:language-change',()=>{staticLabels();if(!$('workspace').hidden)render()});staticLabels();
  if(sessionStorage.getItem(key))open();
  api('auth/setup-status').then(d=>{$('bootstrap').hidden=!d.setup_available||!$('workspace').hidden}).catch(()=>{});
})();
