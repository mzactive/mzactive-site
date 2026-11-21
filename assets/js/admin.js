(() => {
  const $ = id => document.getElementById(id);
  const lang = window.MZActiveLanguage, t = (en,ar) => lang.get()==='ar'?ar:en;
  const key = 'mzactive-provider-session';
  const base = window.MZACTIVE_API_BASE;
  const tabs = {overview:['Overview','نظرة عامة'],coaches:['Coaches','المدربون'],bookings:['Bookings','الحجوزات'],athletes:['Athletes & training','الرياضيون والتدريب'],community:['Community','المجتمع'],articles:['Articles','المقالات'],ai:['AI Brain','المساعد الذكي'],history:['Activity','سجل النشاط']};
  const TAB_PERMISSIONS = {ai:'management.ai'};
  const labels = {operations:['Operations manager','مدير العمليات'],monitoring:['Website monitoring','مراقبة الموقع'],analytics:['Business analytics','تحليل الأعمال'],growth:['Growth and strategy','النمو والاستراتيجية'],marketing:['Marketing','التسويق'],community:['Community planning','تخطيط المجتمع'],support:['Customer support','دعم العملاء'],
    received:['Received','تم الاستلام'],reviewing:['Under review','قيد المراجعة'],accepted:['Confirmed','مؤكد'],cancelled:['Cancelled','ملغى'],declined:['Declined','مرفوض'],approved:['Approved','معتمد'],rejected:['Rejected','مرفوض'],pending:['Pending','قيد الانتظار'],published:['Published','منشور'],completed:['Completed','مكتمل'],failed:['Failed','فشل'],running:['Running','قيد التنفيذ'],run_completed:['AI analysis completed','اكتمل التحليل الذكي'],scheduled_snapshot_completed:['Data collected','تم جمع البيانات'],run_failed:['Analysis failed','فشل التحليل'],program_assigned:['Program assigned','تم ربط البرنامج'],run_started:['Analysis started','بدأ التحليل'],post:['Update','تحديث'],event:['Event','فعالية'],group_session:['Group session','جلسة جماعية'],challenge:['Challenge','تحدٍ'],hidden:['Hidden','مخفي'],owner:['Owner','المالك'],coach:['Sports Coach','مدرب رياضي'],pacer:['Champion Pacer','مرافق جري'],nutritionist:['Nutritionist','أخصائي تغذية رياضية'],physiotherapist:['Physiotherapist','أخصائي علاج طبيعي رياضي'],sports_massage_therapist:['Sports Massage Therapist','معالج تدليك رياضي'],certificate:['Certificate','شهادة'],license_number:['License number','رقم الترخيص'],license_issuer:['License issuer','جهة الترخيص'],issuer:['Issuer','الجهة المصدرة'],number:['Number','الرقم'],country:['Country','الدولة'],expiry:['Expiry','الانتهاء'],identity:['Identity and qualifications verified','تم التحقق من الهوية والمؤهلات'],license_required:['Professional license verified','تم التحقق من الترخيص المهني'],license_note:['License review note','ملاحظة مراجعة الترخيص'],previous_note:['Previous review note','ملاحظة المراجعة السابقة']};
  const name = code => labels[code]?t(...labels[code]):code;
  const metrics = {pending_provider_profiles:['Coach applications','طلبات المدربين'],open_booking_requests:['Open bookings','طلبات الحجز المفتوحة'],pending_coach_articles:['Articles for review','مقالات للمراجعة'],unlinked_programs:['Programs without athlete access','برامج غير مرتبطة بحساب'],approved_providers:['Approved providers','مقدمو الخدمة المعتمدون'],registered_athletes:['Athlete accounts','حسابات الرياضيين'],active_training_teams:['Training teams','فرق التدريب'],pending_community_posts:['Posts for review','منشورات للمراجعة'],pending_community_comments:['Comments on posts awaiting review','تعليقات على منشورات بانتظار المراجعة'],published_community_posts:['Published posts','منشورات منشورة'],weekly_challenges:['Weekly challenges','تحديات الأسبوع']};
  const requestedTab = new URLSearchParams(location.search).get('tab');
  let tab=tabs[requestedTab]?requestedTab:'overview', sequence=0, managementPermissions=[];
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el};
  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const date=s=>new Date(s).toLocaleString(lang.get()==='ar'?'ar-QA':'en-GB');
  const notice=s=>{$('notice').textContent=s};
  function lock(){sequence++;sessionStorage.removeItem(key);$('workspace').hidden=true;$('out').hidden=true;$('view').replaceChildren();$('login').hidden=false}
  async function api(path,{method='GET',body,headers={}}={}){
    const token=sessionStorage.getItem(key);
    if(token)headers.authorization='Bearer '+token;
    const binary=body instanceof Blob;
    let r;
    try{r=await fetch(base+'/api/'+path,{method,headers:{'content-type':binary?body.type:'application/json',...headers},body:binary?body:JSON.stringify(body),cache:'no-store'})}
    catch{throw Error('connection_error')}
    if(r.status===401 && !path.startsWith('auth/'))lock();
    if(!r.ok){
      const d=await r.json().catch(()=>({}));
      const code=typeof d?.error==='string'&&/^[a-z0-9_]+$/.test(d.error)?d.error:r.status>=500?'service_unavailable':'request_failed';
      throw Error(code);
    }
    try{return r.headers.get('content-type')?.startsWith('image/')?await r.blob():await r.json()}
    catch{throw Error('request_failed')}
  }
  function errorMessage(err){const code=err?.message||'',messages={service_unavailable:['The service is temporarily unavailable. Please try again shortly.','الخدمة غير متاحة مؤقتاً. يرجى المحاولة بعد قليل.'],invalid_credentials:['That email or password is incorrect. Use the administrator email registered for this portal.','البريد أو كلمة المرور غير صحيحة. استخدم بريد المسؤول المسجل لهذه البوابة.'],unauthorized:['Your session has expired. Please sign in again.','انتهت جلستك. يرجى تسجيل الدخول مجدداً.'],forbidden:['An administrator account is required for this action.','يلزم حساب مسؤول لتنفيذ هذا الإجراء.'],rate_limited:['Too many attempts. Wait a minute and try again.','محاولات كثيرة. انتظر دقيقة ثم حاول مجدداً.'],origin_not_allowed:['This site address is not authorized. Open the portal from https://mzactive.com.','عنوان الموقع هذا غير مصرح به. افتح البوابة من https://mzactive.com.'],request_failed:['The service returned an unexpected response. Try again shortly.','عادت الخدمة باستجابة غير متوقعة. حاول بعد قليل.'],connection_error:['Could not reach the service. Check your connection and try again.','تعذر الاتصال بالخدمة. تحقق من اتصالك وحاول مجدداً.'],invalid_recovery:['The email or recovery key is incorrect, or no administrator account matches it.','البريد أو مفتاح الاستعادة غير صحيح، أو لا يوجد حساب مسؤول مطابق.'],recovery_unavailable:['Password recovery is not configured. Contact the account owner.','استعادة كلمة المرور غير مهيأة. تواصل مع صاحب الحساب.'],invalid_password:['Use a new password of at least 12 characters.','استخدم كلمة مرور جديدة من ١٢ حرفاً على الأقل.'],current_password_incorrect:['Your current password is incorrect.','كلمة المرور الحالية غير صحيحة.'],admin_setup_required:['The setup key is missing or incorrect.','مفتاح الإعداد مفقود أو غير صحيح.'],admin_already_exists:['An administrator account already exists.','يوجد بالفعل حساب مسؤول.'],admin_setup_unavailable:['This email is not authorized for setup.','هذا البريد غير مصرح له بالإعداد.'],invalid_registration:['Check the email, password and consent, then try again.','تحقق من البريد وكلمة المرور والموافقة ثم حاول مجدداً.'],provider_removed_by_owner:['This account has been suspended by the owner.','تم تعليق هذا الحساب من قِبل المالك.'],intake_paused:['Registration is paused.','التسجيل متوقف مؤقتاً.'],account_already_exists_or_storage_error:['The account could not be saved. Try a different email.','تعذر حفظ الحساب. جرّب بريداً مختلفاً.'],daily_limit_reached:['Daily AI allowance reached.','تم بلوغ الحد اليومي للتحليل.'],assistant_unavailable:['AI analysis failed. Check the task history.','تعذر التحليل. راجع سجل المهام.'],assistant_format_error:['The AI draft could not be formatted. Try again.','تعذر تنسيق المسودة الذكية. حاول مجدداً.'],profile_changed_reload_review:['This profile changed. Refresh before reviewing.','تغير الملف. حدّث البيانات قبل المراجعة.'],coach_profile_incomplete:['The coach must complete their biography and specialties first.','يجب إكمال النبذة والتخصصات أولاً.'],professional_license_incomplete:['Provide qualifications, services and license details, then confirm verification.','أدخل المؤهلات والخدمات وبيانات الترخيص، ثم أكد التحقق.'],invalid_session_for_provider:['This session type is not available for the selected professional.','نوع الجلسة غير متاح لهذا المختص.'],service_required:['Choose a service offered by this professional.','اختر خدمة يقدمها هذا المختص.']};if(!code||/fetch|network|load failed/i.test(code))return t(...messages.connection_error);return t(...(messages[code]||['The request could not be completed. Refresh and try again.','تعذر إتمام الطلب. حدّث الصفحة وحاول مجدداً.']))}
  function button(text,fn){const b=node('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn()}catch(e){notice(errorMessage(e))}finally{b.disabled=false}};return b}
  function link(text,href){const a=node('a',text,'link');a.href=href;return a}
  function card(container,title,details){const c=node('article',null,'card');c.append(node('h3',title));if(details)c.append(node('p',details));container.append(c);return c}
  function group(root,title,items,paint){root.append(node('h3',title));if(!items.length){root.append(node('p',t('No records.','لا توجد سجلات.')));return}for(const item of items)paint(root,item)}
  async function save(path,body,method='PATCH'){await api(path,{method,body});notice(t('Saved.','تم الحفظ.'));await render()}
  function go(next){tab=next;notice('');return render()}
  function staticLabels(){for(const e of document.querySelectorAll('[data-en]'))e.textContent=e.dataset[lang.get()];$('language').textContent=t('العربية','English');syncToggles()}
  function syncToggles(){for(const b of document.querySelectorAll('[data-password-toggle]')){const input=$(b.dataset.passwordToggle);if(!input)continue;b.textContent=t(input.type==='text'?'Hide':'Show',input.type==='text'?'إخفاء':'إظهار');b.setAttribute('aria-label',b.textContent)}}
  function bindToggles(){for(const b of document.querySelectorAll('[data-password-toggle]')){if(b.dataset.bound)continue;b.dataset.bound='1';b.onclick=()=>{const input=$(b.dataset.passwordToggle);if(!input)return;input.type=input.type==='password'?'text':'password';syncToggles()}}}
  function photo(c,id,path){const img=node('img');img.className='thumb';img.alt=t('Coach photo','صورة المدرب');c.append(img);api('admin/providers/'+id+'/'+path).then(blob=>{const url=URL.createObjectURL(blob);img.onload=img.onerror=()=>URL.revokeObjectURL(url);img.src=url}).catch(()=>img.replaceWith(node('small',t('Photo unavailable','تعذر تحميل الصورة'))))}
  function upload(c,p,path='photo',text=t('Upload or replace portrait (1 MB)','رفع الصورة الشخصية أو استبدالها (١ ميغابايت)')){const label=node('label',text);const f=node('input');f.type='file';f.accept='image/jpeg,image/png,image/webp';label.append(f);c.append(label);f.onchange=async()=>{const file=f.files[0];if(!file)return;if(file.size>1000000){notice(t('Maximum size is 1 MB.','الحد الأقصى ١ ميغابايت.'));return}f.disabled=true;try{await save('admin/providers/'+p.id+'/'+path,file,'PUT')}catch(e){notice(errorMessage(e))}finally{f.disabled=false}}}
  function provider(root,p,status){
    const path='admin/providers/'+p.id,c=card(root,p.display_name,[p.email,[p.city,p.country].filter(Boolean).join(', '),name(p.provider_type)].filter(Boolean).join(' · '));
    const licensed=['nutritionist','physiotherapist','sports_massage_therapist'].includes(p.provider_type);
    if(p.has_profile_photo)photo(c,p.id,'photo');
    if(p.has_cover)photo(c,p.id,'cover');
    if(status==='pending'){
      const credentialLines=[p.certificate_name?t('certificate','شهادة')+': '+p.certificate_name:'',p.certificate_issuer?t('issuer','الجهة المصدرة')+': '+p.certificate_issuer:'',p.certificate_number?t('number','الرقم')+': '+p.certificate_number:'',p.license_number?t('license_number','رقم الترخيص')+': '+p.license_number:'',p.license_issuer?t('license_issuer','جهة الترخيص')+': '+p.license_issuer:'',p.license_country?t('country','الدولة')+': '+p.license_country:'',p.license_expires_on?t('expiry','الانتهاء')+': '+p.license_expires_on:'',p.license_review_note?t('previous_note','ملاحظة المراجعة السابقة')+': '+p.license_review_note:''];
      const parts=[p.bio,...(parse(p.specialties_json)||[]),...(parse(p.languages_json)||[]),p.qualifications,...(parse(p.services_json)||[]),p.coaching_mode,p.experience_years? p.experience_years+' '+t('years','سنوات'):'',p.indicative_rate_qar? p.indicative_rate_qar+' QAR':'',p.whatsapp_public?p.whatsapp_number:'',...(parse(p.social_links_json)||[]),...credentialLines];c.append(node('p',parts.filter(Boolean).join('\n')));
      for(const slot of parse(p.gallery_slots)||[])photo(c,p.id,'gallery/'+slot);
      const identity=node('input');identity.type='checkbox';
      if(!licensed){const l=node('label');l.append(identity,' '+t('identity','تم التحقق من الهوية والمؤهلات'));c.append(l)}
      let licenseCheck=null,licenseNote=null;
      if(licensed){
        licenseCheck=node('input');licenseCheck.type='checkbox';
        const l=node('label');l.append(licenseCheck,' '+t('license_required','تم التحقق من الترخيص المهني'));c.append(l);
        licenseNote=node('input');licenseNote.type='text';licenseNote.maxLength=300;licenseNote.placeholder=t('license_note','ملاحظة مراجعة الترخيص');licenseNote.setAttribute('aria-label',licenseNote.placeholder);
        const noteLabel=node('label',t('license_note','ملاحظة مراجعة الترخيص'));noteLabel.append(licenseNote);c.append(noteLabel);
      }
      c.append(button(t('Approve','اعتماد'),()=>{
        const body={status:'approved',review_version:p.updated_at};
        if(licensed){body.license_verified=Boolean(licenseCheck?.checked);body.license_review_note=licenseNote?.value||''}
        else body.verified=identity.checked;
        return save(path,body);
      }),button(t('Reject','رفض'),()=>{if(confirm(t('Reject this application?','هل ترفض هذا الطلب؟')))return save(path,{status:'rejected',review_version:p.updated_at})}));
    }
    if(status==='approved')c.append(link(t('Public profile','الملف العام'),'coach.html?id='+encodeURIComponent(p.id)));
    if(status!=='removed')upload(c,p);
    if(status!=='removed')upload(c,p,'cover',t('Upload or replace cover (1 MB)','رفع صورة الغلاف أو استبدالها (١ ميغابايت)'));
    if(status!=='pending'){const restore=status==='removed';c.append(button(restore?t('Restore access','استعادة الوصول'):t('Suspend access','تعليق الوصول'),()=>{if(confirm(t('Change access for ','تغيير صلاحية الوصول لـ ')+p.display_name+'؟'))return save(path,{status:restore?'approved':'suspended',license_verified:restore&&licensed?true:undefined,verified:restore&&!licensed?true:undefined,review_version:p.updated_at})}))}
  }
  function booking(root,b){const c=card(root,b.customer_name,[name(b.status),b.coach_name,b.city,b.preferred_date,b.customer_phone,b.customer_email,b.session_type,b.service_name,b.distance,b.target_pace,b.program_duration_months?b.program_duration_months+' '+t('months','أشهر'):'',b.goal_summary].filter(Boolean).join(' · '));const actions={reviewing:['Review','بدء المراجعة'],accepted:['Confirm booking','تأكيد الحجز'],declined:['Decline','رفض'],cancelled:['Cancel booking','إلغاء الحجز']};for(const status of ({received:['reviewing','accepted','declined','cancelled'],reviewing:['accepted','declined','cancelled'],accepted:['cancelled']}[b.status]||[])){c.append(button(t(...actions[status]),()=>{if(status!=='reviewing'&&!confirm(t(...actions[status])+'؟'))return;return save('admin/bookings/'+b.id,{status})}))}  const rawPhone=String(b.customer_phone||'').replace(/[\s().-]/g,'');
    const phone=/^\+[1-9]\d{7,14}$/.test(rawPhone)?rawPhone.slice(1):/^\d{8}$/.test(rawPhone)?'974'+rawPhone:'';
    const messages={
      accepted:['Hello, your MZActive booking has been confirmed.','مرحباً، تم تأكيد حجزك لدى MZActive.'],
      declined:['Hello, we could not accept your MZActive booking request.','مرحباً، تعذر قبول طلب حجزك لدى MZActive.'],
      cancelled:['Hello, your MZActive booking has been cancelled.','مرحباً، تم إلغاء حجزك لدى MZActive.'],
    };
    if(phone&&messages[b.status]){
      const contact=link(t('Notify by WhatsApp','إشعار عبر واتساب'),'https://wa.me/'+phone+'?text='+encodeURIComponent(t(...messages[b.status])));
      contact.target='_blank';
      contact.rel='noopener noreferrer';
      c.append(contact);
    }
  }
  function agentName(task){return name(parse(task.input_json)?.agent||task.agent_type)}
  function phase(task){const out=parse(task.output_json);if(task.status==='failed')return name('failed');if(out?.answer)return t('AI analysis completed','اكتمل التحليل الذكي');if(out?.snapshot)return t('Data collected','تم جمع البيانات');return name(task.status)}
  function taskCard(root,task){const output=parse(task.output_json),c=card(root,agentName(task),[date(task.created_at),task.source==='scheduled'?t('Automatic','تلقائي'):t('Manual','يدوي'),phase(task)].join(' · '));if(task.status==='failed'){c.append(node('p',errorMessage(Error(task.error_message))));return}if(!output?.answer)return;c.append(node('p',output.answer),node('strong',task.approval_status==='pending'?t('Awaiting approval','بانتظار الموافقة'):name(task.approval_status)));if(task.approval_status==='pending')for(const decision of ['approved','rejected'])c.append(button(decision==='approved'?t('Approve draft','اعتماد المسودة'):t('Reject draft','رفض المسودة'),()=>save('admin/agents/'+task.id,{decision})))}
  function communityPost(root,p){
    const title=[name(p.kind),p.author_name,p.author_verified?'✓':''].filter(Boolean).join(' · ');
    const details=[date(p.published_at||p.created_at),p.sport,p.location,p.starts_at?date(p.starts_at):'',p.body].filter(Boolean).join('\n');
    const c=card(root,title,details);
    if(p.photos?.length)c.append(node('small',t('Photos','الصور')+': '+p.photos.join(', ')));
    const actions={pending:[['published',t('Publish','نشر')],['hidden',t('Hide','إخفاء')]],published:[['hidden',t('Hide','إخفاء')]],hidden:[['published',t('Restore','استعادة')]]};
    for(const [status,text] of (actions[p.status]||[]))c.append(button(text,()=>save('admin/community/posts/'+p.id,{status})));
    return c;
  }
  function communityComment(root,c){
    const item=card(root,c.email||t('MZ Active member','عضو MZ Active'),[date(c.created_at),name(c.status),c.body].filter(Boolean).join('\n'));
    item.append(button(c.status==='hidden'?t('Show comment','إظهار التعليق'):t('Hide comment','إخفاء التعليق'),()=>save('admin/community/comments/'+c.id,{status:c.status==='hidden'?'published':'hidden'})));
    return item;
  }
  function achievementReview(root,a){
    const c=card(root,[a.display_name,a.email].filter(Boolean).join(' · '),[a.title,a.details,a.awarded_year].filter(Boolean).join('\n'));
    c.append(button(t('Publish achievement','نشر الإنجاز'),()=>save('admin/achievements/'+a.id,{status:'published'})));
    c.append(button(t('Return for edits','إعادة للتعديل'),()=>save('admin/achievements/'+a.id,{status:'hidden'})));
    return c;
  }
  function challengeTools(root,challenges){
    const c=card(root,t('Weekly challenges','تحديات الأسبوع'),t('Published challenges appear in the community feed. AI drafts require approval before publication.','تظهر التحديات المنشورة في خلاصة المجتمع. تحتاج مسودات الذكاء الاصطناعي إلى موافقة قبل النشر.'));
    const body=node('textarea');body.rows=3;body.maxLength=2000;body.placeholder=t('Challenge text','نص التحدي');body.setAttribute('aria-label',body.placeholder);
    const sport=node('select');sport.setAttribute('aria-label',t('Sport','الرياضة'));for(const code of ['','running','walking','cycling','swimming','strength','boxing','padel','football','other']){const o=node('option',code||t('General','عام'));o.value=code;sport.append(o)}
    const language=node('select');language.setAttribute('aria-label',t('Language','اللغة'));for(const code of ['en','ar']){const o=node('option',code==='en'?'English':'العربية');o.value=code;language.append(o)}language.value=lang.get()==='ar'?'ar':'en';
    const publish=node('label',t('Publish challenge','نشر تحدٍ'));publish.append(body,sport,language);c.append(publish,button(t('Publish challenge','نشر تحدٍ'),()=>{
      if(!body.value.trim()){notice(t('Enter the challenge text first.','أدخل نص التحدي أولاً.'));return}
      return save('admin/community/challenges',{body:body.value.trim(),sport:sport.value,language:language.value},'POST');
    }));
    const prompt=node('input');prompt.type='text';prompt.maxLength=1200;prompt.placeholder=t('Optional focus for the AI challenge','تركيز اختياري لتحدي الذكاء الاصطناعي');prompt.setAttribute('aria-label',prompt.placeholder);
    const draft=node('label',t('Draft with AI','مسودة بالذكاء الاصطناعي'));draft.append(prompt);c.append(draft,button(t('Generate draft','توليد مسودة'),async()=>{
      await api('admin/community/challenges/generate',{method:'POST',body:{prompt:prompt.value.trim(),language:language.value}});
      notice(t('Draft saved for review.','حُفظت المسودة للمراجعة.'));await render();
    }));
    root.append(c);
    group(root,t('Challenge history','سجل التحديات'),challenges,(r,p)=>{
      const item=card(r,date(p.published_at||p.created_at),[name(p.status),p.sport,p.body].filter(Boolean).join('\n'));
      if(p.status!=='published')item.append(button(t('Publish','نشر'),()=>save('admin/community/posts/'+p.id,{status:'published'})));
      else item.append(button(t('Hide','إخفاء'),()=>save('admin/community/posts/'+p.id,{status:'hidden'})));
      return item;
    });
  }
  async function paint(root){
    if(tab==='overview'||tab==='ai'){
      const data=await api('admin/agents'),tasks=data.tasks;
      if(tab==='overview'){
        const grid=node('div',null,'grid');root.append(grid);
        for(const [k,v] of Object.entries(metrics)){const c=card(grid,t(...v));c.append(node('strong',data.snapshot[k],'metric'));const dest={pending_provider_profiles:'coaches',open_booking_requests:'bookings',pending_coach_articles:'articles',unlinked_programs:'athletes',registered_athletes:'athletes',active_training_teams:'athletes',approved_providers:'coaches',pending_community_posts:'community',pending_community_comments:'community',published_community_posts:'community',weekly_challenges:'community'}[k];c.append(button(t('View','عرض'),()=>go(dest)))}
        const latest=tasks.find(x=>x.source==='scheduled');
        if(latest)card(root,t('Latest automatic run','آخر تشغيل تلقائي'),[agentName(latest),phase(latest),date(latest.created_at)].join(' · '));
        group(root,t('AI decisions awaiting approval','قرارات المساعد بانتظار الموافقة'),data.pending,taskCard);
        card(root,t('Service status','حالة الخدمات'),[data.status==='available'?t('AI provider configured','مزود الذكاء الاصطناعي مهيأ'):t('AI provider unavailable','مزود الذكاء الاصطناعي غير متاح'),t('Registration and booking email delivery is not configured.','إرسال إشعارات التسجيل والحجز بالبريد غير مهيأ.'),t('Community posts, comments and achievements are moderated in the Community tab.','تُراجع منشورات المجتمع وتعليقاته وإنجازاته في تبويب المجتمع.')].join('\n'));return;
      }
      root.append(node('p',t('An agent analyzes current business data every hour. Six specialist agents take turns; all seven modes are available for manual analysis. Drafts require your decision.','يحلل وكيل بيانات المنصة كل ساعة، ويتناوب ستة وكلاء متخصصون. تتوفر الأوضاع السبعة للتحليل اليدوي، وتتطلب المسودات قرارك.')));
      const select=node('select'),prompt=node('textarea');prompt.maxLength=1600;
      for(const code of ['operations','monitoring','analytics','marketing','growth','community','support']){const o=node('option',name(code));o.value=code;select.append(o)}
      const l=node('label',t('Agent','الوكيل')),q=node('label',t('Question or objective','السؤال أو الهدف'));l.append(select);q.append(prompt);root.append(l,q,button(t('Run analysis','تنفيذ التحليل'),async()=>{if(!prompt.value.trim()){prompt.focus();return}try{await api('admin/assistant',{method:'POST',body:{task:select.value,prompt:prompt.value.trim()}});notice(t('Draft saved for review.','حُفظت المسودة للمراجعة.'))}finally{await render()}}));
      group(root,t('Recent runs','آخر عمليات التنفيذ'),tasks.slice(0,30),taskCard);return;
    }
    if(tab==='coaches'||tab==='bookings'){const d=await api('admin/applications');if(tab==='bookings'){group(root,t('Recent and open requests','الطلبات المفتوحة والأخيرة'),d.bookings,booking);return}
      for(const [title,rows,status] of [[t('Awaiting review','بانتظار المراجعة'),d.providers,'pending'],[t('Approved','معتمدون'),d.approved_providers,'approved'],[t('Suspended','معلّقون'),d.suspended_providers,'removed']])group(root,title,rows,(r,p)=>provider(r,p,status));return}
    if(tab==='community'){
      const d=await api('admin/community'),grid=node('div',null,'grid');root.append(grid);
      for(const k of ['pending_community_posts','pending_community_comments','published_community_posts','weekly_challenges']){const c=card(grid,t(...metrics[k]));c.append(node('strong',d.snapshot[k],'metric'))}
      group(root,t('Awaiting review','بانتظار المراجعة'),d.pending_posts,communityPost);
      group(root,t('Recent community posts','منشورات المجتمع الأخيرة'),d.posts,communityPost);
      group(root,t('Comments for review','تعليقات للمراجعة'),d.comments,communityComment);
      group(root,t('Achievements for review','إنجازات للمراجعة'),d.achievements,achievementReview);
      challengeTools(root,(d.posts||[]).filter(p=>p.kind==='challenge'));
      return;
    }
    if(tab==='articles'){const d=await api('admin/blog');group(root,t('Awaiting moderation','بانتظار المراجعة'),d.posts,(r,p)=>{const c=card(r,p.title,[p.coach_name,p.summary,p.body].join('\n'));for(const a of ['publish','return'])c.append(button(a==='publish'?t('Publish article','نشر المقال'):t('Return for edits','إعادة للتعديل'),()=>{if(a==='publish'&&!confirm(t('Publish this article?','نشر هذا المقال؟')))return;return save('admin/blog/'+p.id,{action:a})}))});return}
    if(tab==='athletes'){const d=await api('admin/athletes');root.append(link(t('Open training dashboard','فتح لوحة التدريب'),'dashboard.html'));group(root,t('Programs without account access','برامج غير مرتبطة بحساب'),d.unlinked,(r,p)=>{const c=card(r,p.athlete_name,p.week_start),sel=node('select');sel.setAttribute('aria-label',t('Athlete email','بريد الرياضي'));sel.append(node('option',t('Choose the athlete account','اختر حساب الرياضي')));sel.firstChild.value='';for(const a of d.athletes){const o=node('option',a.email);o.value=a.id;sel.append(o)}c.append(sel,button(t('Grant program access','منح الوصول للبرنامج'),()=>{if(sel.value&&confirm(t('Grant access to ','منح الوصول إلى ')+sel.selectedOptions[0].textContent+'؟'))return save('admin/programs/'+p.id+'/athlete',{athlete_id:sel.value})}))});group(root,t('Registered athletes','الرياضيون المسجلون'),d.athletes,(r,a)=>card(r,a.email,t('Assigned programs','البرامج المرتبطة')+' · '+a.programs));return}
    const [h,ai]=await Promise.all([api('admin/history'),api('admin/agents')]);const events=[...h.events,...ai.activity].sort((a,b)=>b.created_at.localeCompare(a.created_at));
    group(root,t('Recent decisions and activity','آخر القرارات والأنشطة'),events.slice(0,100),(r,e)=>card(r,e.action?name(e.action):e.entity_type==='provider_profile'?t('Coach profile','ملف المدرب'):e.entity_type==='registration'?t('New registration','تسجيل جديد'):t('Booking','حجز'),[date(e.created_at),e.action?name(e.agent_type):name(e.from_status),e.to_status?name(e.to_status):''].filter(Boolean).join(' · ')));
  }
  async function render(){const n=++sequence;staticLabels();$('nav').replaceChildren();const available=Object.entries(tabs).filter(([id])=>!TAB_PERMISSIONS[id]||managementPermissions.includes(TAB_PERMISSIONS[id]));if(!available.some(([id])=>id===tab))tab='overview';for(const [id,v] of available){const b=button(t(...v),()=>go(id));b.setAttribute('aria-current',id===tab);$('nav').append(b)}history.replaceState(null,'',tab==='overview'?location.pathname:location.pathname+'?tab='+encodeURIComponent(tab));$('title').textContent=t(...tabs[tab]);$('view').textContent=t('Loading…','جارٍ التحميل…');const root=node('div');try{await paint(root);if(n===sequence)$('view').replaceChildren(root)}catch(err){if(n===sequence||$('workspace').hidden)notice(errorMessage(err));if(n===sequence)$('view').replaceChildren(button(t('Retry','إعادة المحاولة'),render))}}
  async function open(){
    try {
      const [,access] = await Promise.all([api('admin/history'),api('me/access')]);
      managementPermissions = Array.isArray(access.management?.permissions) ? access.management.permissions : [];
      window.MZActiveAccountMenu?.refresh();
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
  async function sign(form,setup){const f=form.elements;const d=await api(setup?'auth/register':'auth/login',{method:'POST',headers:setup?{'x-admin-setup-key':f.key.value}:{},body:{email:f.email.value,password:f.password.value,...(setup?{consent:true}:{})}});if(setup&&d.user?.role!=='admin')throw Error('forbidden');const destination=window.MZActiveAuth.store(d);form.reset();notice('');if(destination!=='/admin.html'){location.assign(destination);return}await open()}
  for(const id of ['setup','login'])$(id).onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,b=form.querySelector('button[type=submit]');b.disabled=true;try{await sign(form,id==='setup')}catch(err){lock();notice(errorMessage(err))}finally{b.disabled=false}};
  // Emergency owner recovery only. The normal Forgot password? control is
  // wired by auth-ui.js and opens the shared email-based dialog instead.
  $('recoverOpen').onclick=e=>{e.preventDefault();$('emergencyRecovery').open=true;$('login').hidden=true;$('recover').hidden=false;$('recover').elements.email.value=$('login').elements.email.value;notice('')};
  $('recoverCancel').onclick=()=>{$('recover').hidden=true;$('emergencyRecovery').open=false;$('login').hidden=false;notice('')};
  $('recover').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');if(f.elements.new_password.value!==f.elements.confirm_password.value){notice(t('The new passwords do not match.','كلمتا المرور الجديدتان غير متطابقتين.'));return}b.disabled=true;try{await api('auth/recover',{method:'POST',body:{email:f.elements.email.value,key:f.elements.key.value,new_password:f.elements.new_password.value}});f.reset();$('recover').hidden=true;$('emergencyRecovery').open=false;$('login').hidden=false;notice(t('Password reset. Sign in with your new password.','تمت إعادة تعيين كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.'))}catch(err){notice(errorMessage(err))}finally{b.disabled=false}};
  $('changePassword').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{await api('auth/change-password',{method:'POST',body:{current_password:f.elements.current_password.value,new_password:f.elements.new_password.value}});f.reset();notice(t('Password changed. Other sessions were signed out.','تم تغيير كلمة المرور. تم تسجيل خروج الجلسات الأخرى.'))}catch(err){notice(errorMessage(err))}finally{b.disabled=false}};
  $('out').onclick=async()=>{try{await api('auth/logout',{method:'POST',body:{}})}finally{lock();notice('')}};
  $('language').onclick=()=>lang.set(t('ar','en'),{manual:true});
  document.addEventListener('mzactive:language-change',()=>{staticLabels();if(!$('workspace').hidden)render()});bindToggles();staticLabels();
  if(sessionStorage.getItem(key))open();
  api('auth/setup-status').then(d=>{$('bootstrap').hidden=!d.setup_available||!$('workspace').hidden}).catch(()=>{});
})();
