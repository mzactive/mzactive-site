(() => {
  const $ = id => document.getElementById(id);
  const lang = window.MZActiveLanguage, t = (en,ar) => lang.get()==='ar'?ar:en;
  const key = 'mzactive-provider-session';
  const base = window.MZACTIVE_API_BASE;
  const tabs = {overview:['Overview','نظرة عامة'],coaches:['Coaches','المدربون'],bookings:['Bookings','الحجوزات'],messages:['Messages','الرسائل'],athletes:['Athletes & training','الرياضيون والتدريب'],community:['Community','المجتمع'],articles:['Articles','المقالات'],ai:['AI Brain','المساعد الذكي'],history:['Activity','سجل النشاط']};
  const TAB_PERMISSIONS = {coaches:'management.coaches',bookings:'management.bookings',messages:'management.coaches',athletes:'management.coaches',community:'management.community',articles:'management.articles',ai:'management.ai'};
  const tabIcons = {overview:'◈',coaches:'◎',bookings:'▣',messages:'✉',athletes:'♙',community:'◍',articles:'▤',ai:'✦',history:'↺'};
  const tabSubtitles = {
    overview:['Live records and decisions across your permitted areas.','سجلات وقرارات مباشرة ضمن صلاحياتك.'],
    coaches:['Review applications and verified professional credentials.','مراجعة الطلبات وبيانات الاعتماد الموثقة.'],
    bookings:['Triage requests and confirm approved sessions.','فرز الطلبات وتأكيد الجلسات المعتمدة.'],
    messages:['Conversation metadata only; private message bodies stay protected.','بيانات المحادثات فقط؛ تبقى نصوص الرسائل الخاصة محمية.'],
    athletes:['Searchable athlete CRM with consent-based coaching actions.','دليل رياضي قابل للبحث مع إجراءات تدريب قائمة على الموافقة.'],
    community:['Moderate posts, comments, achievements and challenges.','مراجعة المنشورات والتعليقات والإنجازات والتحديات.'],
    articles:['Publish or return coach-written articles.','نشر مقالات المدربين أو إعادتها للتعديل.'],
    ai:['Review assistive drafts before any decision takes effect.','راجع المسودات المساعدة قبل تنفيذ أي قرار.'],
    history:['A chronological record of management decisions.','سجل زمني لقرارات الإدارة.'],
  };
  const labels = {operations:['Operations manager','مدير العمليات'],monitoring:['Website monitoring','مراقبة الموقع'],analytics:['Business analytics','تحليل الأعمال'],growth:['Growth and strategy','النمو والاستراتيجية'],marketing:['Marketing','التسويق'],community:['Community planning','تخطيط المجتمع'],support:['Customer support','دعم العملاء'],
    received:['Received','تم الاستلام'],reviewing:['Under review','قيد المراجعة'],accepted:['Confirmed','مؤكد'],cancelled:['Cancelled','ملغى'],declined:['Declined','مرفوض'],approved:['Approved','معتمد'],rejected:['Rejected','مرفوض'],pending:['Pending','قيد الانتظار'],published:['Published','منشور'],completed:['Completed','مكتمل'],failed:['Failed','فشل'],running:['Running','قيد التنفيذ'],run_completed:['AI analysis completed','اكتمل التحليل الذكي'],scheduled_snapshot_completed:['Data collected','تم جمع البيانات'],run_failed:['Analysis failed','فشل التحليل'],program_assigned:['Program assigned','تم ربط البرنامج'],run_started:['Analysis started','بدأ التحليل'],post:['Update','تحديث'],event:['Event','فعالية'],group_session:['Group session','جلسة جماعية'],challenge:['Challenge','تحدٍ'],hidden:['Hidden','مخفي'],owner:['Owner','المالك'],coach:['Sports Coach','مدرب رياضي'],pacer:['Champion Pacer','مرافق جري'],nutritionist:['Nutritionist','أخصائي تغذية رياضية'],physiotherapist:['Physiotherapist','أخصائي علاج طبيعي رياضي'],sports_massage_therapist:['Sports Massage Therapist','معالج تدليك رياضي'],certificate:['Certificate','شهادة'],license_number:['License number','رقم الترخيص'],license_issuer:['License issuer','جهة الترخيص'],issuer:['Issuer','الجهة المصدرة'],number:['Number','الرقم'],country:['Country','الدولة'],expiry:['Expiry','الانتهاء'],identity:['Identity and qualifications verified','تم التحقق من الهوية والمؤهلات'],license_required:['Professional license verified','تم التحقق من الترخيص المهني'],license_note:['License review note','ملاحظة مراجعة الترخيص'],previous_note:['Previous review note','ملاحظة المراجعة السابقة'],assigned:['Assigned','معين'],unassigned:['Unassigned','غير معين'],invitation_pending:['Invitation pending','دعوة معلقة'],onboarding_incomplete:['Onboarding incomplete','الملف غير مكتمل'],email_failed:['Invitation email failed','فشل إرسال الدعوة'],email_sent:['Invitation email sent','تم إرسال الدعوة'],sent:['Sent','تم الإرسال'],coach_invited:['Coach invited','تمت دعوة مدرب'],profile_invited:['Profile invitation sent','تم إرسال دعوة الملف'],coach_reassigned:['Coach reassignment requested','تم طلب تغيير المدرب'],coach_revoked:['Coach revoked','تم إلغاء المدرب'],coach_invite_accepted:['Coach invitation accepted','تم قبول دعوة المدرب'],coach_invite_declined:['Coach invitation declined','تم رفض دعوة المدرب'],profile_invite_accepted:['Profile invitation accepted','تم قبول دعوة الملف'],invitation_resent:['Invitation resent','تمت إعادة إرسال الدعوة'],not_provided:['Not provided','غير متوفر'],view_profile:['View profile','عرض الملف'],recommend_coach:['Recommend coach','اقتراح مدرب'],invite_profile:['Invite to complete profile','دعوة لإكمال الملف'],view_programs:['View programs','عرض البرامج'],view_bookings:['View bookings','عرض الحجوزات'],revoke_coach:['Revoke coach','إلغاء المدرب'],reassign_coach:['Reassign coach','تغيير المدرب'],send_invitation:['Send invitation','إرسال الدعوة'],resend_invitation:['Resend invitation','إعادة إرسال الدعوة'],why_recommended:['Why this recommendation','سبب هذا الاقتراح'],no_recommendations:['No approved coaches match the verified profile details yet.','لا يوجد مدربون معتمدون يتطابقون مع بيانات الملف الموثقة بعد.'],no_programs:['No training programs have been assigned.','لم تُربط أي برامج تدريبية.'],no_bookings:['No booking requests are linked to this account.','لا توجد طلبات حجز مرتبطة بهذا الحساب.'],no_invitations:['No invitations have been sent yet.','لم تُرسل أي دعوات بعد.'],no_audit:['No consent or assignment changes have been recorded.','لم تُسجل أي تغييرات في الموافقة أو التعيين.'],athlete_directory:['Athlete directory','دليل الرياضيين'],search_athletes:['Search athletes (name, email, sport…)','ابحث عن الرياضيين (الاسم، البريد، الرياضة…)'],all_athletes:['All athletes','جميع الرياضيين'],active:['Active','نشط'],inactive:['Inactive','غير نشط'],assigned_coaches:['Assigned coach','المدرب المعين'],last_activity:['Last activity','آخر نشاط'],sports:['Sports','الرياضات'],goals:['Goals','الأهداف'],city:['City','المدينة'],language:['Preferred language','اللغة المفضلة'],availability:['Availability','الأوقات المناسبة'],experience:['Experience level','مستوى الخبرة'],age_range:['Age range','الفئة العمرية'],gender:['Gender','الجنس'],programs_count:['Programs','البرامج'],bookings_count:['Bookings','الحجوزات'],invitation_status:['Invitation status','حالة الدعوة'],invitation_email:['Invitation email','بريد الدعوة'],refresh:['Refresh','تحديث'],clear_filters:['Clear filters','مسح عوامل التصفية'],select_coach:['Select an approved coach','اختر مدرباً معتمداً'],approve_and_invite:['Review and send invitation','راجع وأرسل الدعوة'],consent_notice:['The athlete decides. No workspace opens and nothing is shared until they accept.','الرياضي هو من يقرر. لا تُفتح مساحة ولا تتم مشاركة أي بيانات قبل قبوله.'],ai_disclaimer:['Assistive suggestions from verified profile fields only. No medical advice, diagnosis or licensed-coach claim.','اقتراحات مساعدة من حقول الملف الموثقة فقط. لا تشخيص طبي أو ادعاء بأن المدرب مرخص.'],ai_recommendations:['AI recommendations','توصيات الذكاء الاصطناعي'],next_steps:['Safe next steps','الخطوات التالية الآمنة'],outreach_draft:['Outreach draft (requires approval)','مسودة تواصل (تتطلب الموافقة)'],audit_history:['Consent and assignment history','سجل الموافقة والتعيين'],coach_workspaces:['Coach workspaces','مساحات المدربين'],messages:['Messages','الرسائل'],recommendation_score:['Match score','درجة التطابق'],viewing_profile:['Showing verified athlete profile.','عرض الملف الرياضي الموثق.'],opening_programs:['Opening assigned programs…','فتح البرامج المخصصة…'],opening_bookings:['Opening linked bookings…','فتح الحجوزات المرتبطة…'],programs_ready:['Programs section ready.','قسم البرامج جاهز.'],bookings_ready:['Bookings section ready.','قسم الحجوزات جاهز.']};
  const name = code => labels[code]?t(...labels[code]):code;
  const notificationLabels = {
    booking_request:['Booking request','طلب حجز'],coach_application:['Coach application','طلب مدرب'],private_message:['Private message','رسالة خاصة'],
    community_post:['Community post','منشور المجتمع'],community_comment:['Community comment','تعليق المجتمع'],achievement:['Achievement','إنجاز'],
    article:['Article','مقال'],ai_recommendation:['AI recommendation','توصية الذكاء الاصطناعي'],unread:['Unread','غير مقروء'],
    post:['Update','تحديث'],comment:['Comment','تعليق'],received:['Received','تم الاستلام'],reviewing:['Under review','قيد المراجعة'],
  };
  const notificationName = code => notificationLabels[code]?t(...notificationLabels[code]):name(code);
  const metrics = {pending_provider_profiles:['Coach applications','طلبات المدربين'],open_booking_requests:['Open bookings','طلبات الحجز المفتوحة'],pending_coach_articles:['Articles for review','مقالات للمراجعة'],unlinked_programs:['Programs without athlete access','برامج غير مرتبطة بحساب'],approved_providers:['Approved providers','مقدمو الخدمة المعتمدون'],registered_athletes:['Athlete accounts','حسابات الرياضيين'],active_training_teams:['Training teams','فرق التدريب'],pending_community_posts:['Posts for review','منشورات للمراجعة'],pending_community_comments:['Comments on posts awaiting review','تعليقات على منشورات بانتظار المراجعة'],published_community_posts:['Published posts','منشورات منشورة'],weekly_challenges:['Weekly challenges','تحديات الأسبوع']};
  const requestedTab = new URLSearchParams(location.search).get('tab');
  let tab=tabs[requestedTab]?requestedTab:'overview', sequence=0, managementPermissions=[], managementIsAdmin=false;
  let applications=null, coachFilter='pending', coachVisible=12, refreshing=false;
  let dashboard=null, notificationRefreshing=false, notificationPoll=null;
  let athleteDirectory=null, athleteFilter='all', athleteSort='recent', athleteTimer=null, athleteDialog=null, openedAthleteRecord='';
  let agentsOverview=null, coachQuery='';
  const inFlight=new Set();
  let recordId = new URLSearchParams(location.search).get('record') || '';
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el};
  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const date=s=>new Date(s).toLocaleString(lang.get()==='ar'?'ar-QA':'en-GB');
  const notice=(s,kind='')=>{$('notice').textContent=s;$('notice').dataset.kind=kind};
  function lock(){sequence++;if(notificationPoll){clearInterval(notificationPoll);notificationPoll=null}dashboard=null;agentsOverview=null;sessionStorage.removeItem(key);$('workspace').hidden=true;document.body.classList.remove('portal-active');$('out').hidden=true;$('notificationPanel').hidden=true;$('notificationBadge').hidden=true;document.body.classList.remove('notification-open');document.body.style.removeProperty('--notification-push');$('view').replaceChildren();$('login').hidden=false}
  async function api(path,{method='GET',body,headers={}}={}){
    const token=sessionStorage.getItem(key);
    if(token)headers.authorization='Bearer '+token;
    const binary=body instanceof Blob;
    let r;
    try{r=await fetch(base+'/api/'+path,{method,headers:{'content-type':binary?body.type:'application/json',...headers},body:binary?body:JSON.stringify(body),cache:'no-store'})}
    catch(e){const err=Error('connection_error');err.detail=method+' '+path;throw err}
    if(r.status===401 && !path.startsWith('auth/'))lock();
    if(!r.ok){
      const d=await r.json().catch(()=>({}));
      const code=typeof d?.error==='string'&&/^[a-z0-9_]+$/.test(d.error)?d.error:r.status>=500?'service_unavailable':'request_failed';
      const err=Error(code);err.detail=r.status+' '+method+' '+path;throw err;
    }
    try{return r.headers.get('content-type')?.startsWith('image/')?await r.blob():await r.json()}
    catch{throw Error('request_failed')}
  }
  function errorMessage(err){const code=err?.message||'',messages={service_unavailable:['The service is temporarily unavailable. Please try again shortly.','الخدمة غير متاحة مؤقتاً. يرجى المحاولة بعد قليل.'],invalid_credentials:['That email or password is incorrect. Use the administrator email registered for this portal.','البريد أو كلمة المرور غير صحيحة. استخدم بريد المسؤول المسجل لهذه البوابة.'],unauthorized:['Your session has expired. Please sign in again.','انتهت جلستك. يرجى تسجيل الدخول مجدداً.'],forbidden:['An administrator account is required for this action.','يلزم حساب مسؤول لتنفيذ هذا الإجراء.'],rate_limited:['Too many attempts. Wait a minute and try again.','محاولات كثيرة. انتظر دقيقة ثم حاول مجدداً.'],origin_not_allowed:['This site address is not authorized. Open the portal from https://mzactive.com.','عنوان الموقع هذا غير مصرح به. افتح البوابة من https://mzactive.com.'],request_failed:['The service returned an unexpected response. Try again shortly.','عادت الخدمة باستجابة غير متوقعة. حاول بعد قليل.'],athlete_not_found:['This athlete account was not found. Refresh the directory.','لم يتم العثور على حساب الرياضي. حدّث دليل الرياضيين.'],coach_unavailable:['That approved coach is no longer available. Review the suggestions again.','لم يعد المدرب المعتمد متاحاً. راجع الاقتراحات مجدداً.'],invitation_exists:['A pending invitation already exists for this coach.','توجد دعوة معلقة بالفعل لهذا المدرب.'],assignment_exists:['This athlete already has an active coach. Revoke or reassign first.','لدى هذا الرياضي مدرب نشط بالفعل. ألغِ التعيين أو غيّره أولاً.'],no_active_assignment:['There is no active assignment to revoke.','لا يوجد تعيين نشط لإلغائه.'],active_assignment_exists:['The athlete already accepted another active workspace.','قبل الرياضي مساحة نشطة أخرى بالفعل.'],invitation_unavailable:['This invitation can no longer be changed.','لم يعد ممكناً تعديل هذه الدعوة.'],invitation_expired:['This invitation link has expired.','انتهت صلاحية رابط الدعوة.'],invitation_not_pending:['Only a pending invitation can be resent.','يمكن إعادة إرسال الدعوات المعلقة فقط.'],email_unavailable:['The invitation was saved but email delivery is unavailable. Retry after checking delivery.','حُفظت الدعوة لكن إرسال البريد غير متاح. أعد المحاولة بعد التحقق من الإرسال.'],connection_error:['Could not reach the service. Check your connection and try again.','تعذر الاتصال بالخدمة. تحقق من اتصالك وحاول مجدداً.'],invalid_recovery:['The email or recovery key is incorrect, or no administrator account matches it.','البريد أو مفتاح الاستعادة غير صحيح، أو لا يوجد حساب مسؤول مطابق.'],recovery_unavailable:['Password recovery is not configured. Contact the account owner.','استعادة كلمة المرور غير مهيأة. تواصل مع صاحب الحساب.'],photo_too_large:['Use a JPG, PNG or WebP image up to 1 MB.','استخدم صورة JPG أو PNG أو WebP بحجم أقصى ١ ميغابايت.'],invalid_photo:['Choose a valid JPG, PNG or WebP image. The existing photo was kept.','اختر صورة JPG أو PNG أو WebP صالحة. تم الاحتفاظ بالصورة الحالية.'],photo_not_found:['No photo has been uploaded for this coach.','لم يتم رفع صورة لهذا المدرب بعد.'],invalid_password:['Use a new password of at least 12 characters.','استخدم كلمة مرور جديدة من ١٢ حرفاً على الأقل.'],current_password_incorrect:['Your current password is incorrect.','كلمة المرور الحالية غير صحيحة.'],admin_setup_required:['The setup key is missing or incorrect.','مفتاح الإعداد مفقود أو غير صحيح.'],admin_already_exists:['An administrator account already exists.','يوجد بالفعل حساب مسؤول.'],admin_setup_unavailable:['This email is not authorized for setup.','هذا البريد غير مصرح له بالإعداد.'],invalid_registration:['Check the email, password and consent, then try again.','تحقق من البريد وكلمة المرور والموافقة ثم حاول مجدداً.'],provider_removed_by_owner:['This account has been suspended by the owner.','تم تعليق هذا الحساب من قِبل المالك.'],intake_paused:['Registration is paused.','التسجيل متوقف مؤقتاً.'],account_already_exists_or_storage_error:['The account could not be saved. Try a different email.','تعذر حفظ الحساب. جرّب بريداً مختلفاً.'],daily_limit_reached:['Daily AI allowance reached.','تم بلوغ الحد اليومي للتحليل.'],assistant_unavailable:['AI analysis failed. Check the task history.','تعذر التحليل. راجع سجل المهام.'],assistant_format_error:['The AI draft could not be formatted. Try again.','تعذر تنسيق المسودة الذكية. حاول مجدداً.'],profile_changed_reload_review:['This profile changed. Refresh before reviewing.','تغير الملف. حدّث البيانات قبل المراجعة.'],coach_profile_incomplete:['The coach must complete their biography and specialties first.','يجب إكمال النبذة والتخصصات أولاً.'],professional_license_incomplete:['Provide qualifications, services and license details, then confirm verification.','أدخل المؤهلات والخدمات وبيانات الترخيص، ثم أكد التحقق.'],invalid_session_for_provider:['This session type is not available for the selected professional.','نوع الجلسة غير متاح لهذا المختص.'],service_required:['Choose a service offered by this professional.','اختر خدمة يقدمها هذا المختص.']};const detail=err?.detail?' · '+err.detail:'';
  if(!code||/fetch|network|load failed/i.test(code))return t(...messages.connection_error)+detail;return t(...(messages[code]||['The request could not be completed. Refresh and try again.','تعذر إتمام الطلب. حدّث الصفحة وحاول مجدداً.']))+detail}
  function button(text,fn){const b=node('button',text);b.type='button';b.dataset.label=text;b.onclick=async()=>{
    if(b.disabled)return;b.disabled=true;b.setAttribute('aria-busy','true');b.textContent=t('Working…','جارٍ التنفيذ…');
    try{await fn()}catch(e){notice(errorMessage(e),'error')}finally{b.disabled=false;b.removeAttribute('aria-busy');b.textContent=b.dataset.label}
  };return b}
  function retryButton(text,fn){const b=button(text,async()=>{dashboard=null;notice(t('Retrying…','جارٍ إعادة المحاولة…'),'busy');await fn()});b.dataset.retry='1';return b}
  function link(text,href){const a=node('a',text,'link');a.href=href;return a}
  function card(container,title,details,record){const c=node('article',null,'card');if(record)c.dataset.recordId=record;c.append(node('h3',title));if(details)c.append(node('p',details));container.append(c);return c}
  function messageCard(root,message){
    const title=[message.sender_name,message.recipient_name].filter(Boolean).join(' → ');
    const details=[date(message.created_at),message.read_at?t('Read','مقروء'):t('Unread','غير مقروء'),name(message.workspace_status)].filter(Boolean).join(' · ');
    const c=card(root,title,details,message.id);
    c.append(node('small',t('Message preview is hidden in the management portal to protect private coaching conversations.','معاينة الرسالة مخفية في بوابة الإدارة لحماية محادثات التدريب الخاصة.')));
    return c;
  }
  function group(root,title,items,paint){root.append(node('h3',title));if(!items.length){root.append(node('p',t('No records.','لا توجد سجلات.')));return}for(const item of items)paint(root,item)}
  async function save(path,body,method='PATCH'){const result=await api(path,{method,body});notice(t('Saved.','تم الحفظ.'),'success');if(tab==='coaches')refreshApplications();refreshNotifications();if(path.startsWith('admin/agents'))agentsOverview=null;await render();return result}
  function go(next,keepRecord=false){if(athleteDialog?.open)athleteDialog.close();tab=next;if(!keepRecord)recordId='';notice('');if(next==='coaches')applications=null;closeMobileNav();return render()}
  const canAi=()=>managementIsAdmin||managementPermissions.includes('management.ai');
  async function loadAiOverview(){if(!canAi())return null;if(!agentsOverview)agentsOverview=await api('admin/agents');return agentsOverview}
  function syncShellLabels(){
    const shell=document.querySelector('.portal-shell');if(!shell)return;
    const collapsed=shell.classList.contains('sidebar-collapsed');
    $('sidebarToggle').setAttribute('aria-label',t(...(collapsed?['Expand sidebar','توسيع الشريط الجانبي']:['Collapse sidebar','طي الشريط الجانبي'])));
    $('mobileNavToggle').setAttribute('aria-label',t(...(shell.classList.contains('mobile-open')?['Close navigation','إغلاق التنقل']:['Open navigation','فتح التنقل'])));
  }
  function closeMobileNav(){
    const shell=document.querySelector('.portal-shell');if(!shell)return;
    shell.classList.remove('mobile-open');$('sidebarScrim').hidden=true;
    $('mobileNavToggle').setAttribute('aria-expanded','false');syncShellLabels();
  }
  function openTarget(href){
    const params=new URLSearchParams(String(href||'').split('?')[1]||'');
    const requested=params.get('tab'),target=tabs[requested]?requested:'overview';
    if(athleteDialog?.open)athleteDialog.close();
    tab=target;recordId=params.get('record')||'';notice('');
    if(target==='coaches')applications=null;
    closeMobileNav();return render();
  }
  function bindPortalShell(){
    const shell=document.querySelector('.portal-shell');if(!shell||shell.dataset.bound)return;
    shell.dataset.bound='1';
    const setCollapsed=(collapsed,persist=true)=>{
      shell.classList.toggle('sidebar-collapsed',collapsed);
      const toggle=$('sidebarToggle');
      toggle.setAttribute('aria-expanded',String(!collapsed));syncShellLabels();
      if(persist)try{localStorage.setItem('mzactive-portal-sidebar-collapsed',collapsed?'1':'0')}catch{}
    };
    let collapsed=false;try{collapsed=localStorage.getItem('mzactive-portal-sidebar-collapsed')==='1'}catch{}
    setCollapsed(collapsed,false);
    $('sidebarToggle').onclick=()=>setCollapsed(!shell.classList.contains('sidebar-collapsed'));
    $('mobileNavToggle').onclick=()=>{
      if(!$('notificationPanel').hidden)setNotificationPanel(false);
      const open=!shell.classList.contains('mobile-open');
      shell.classList.toggle('mobile-open',open);$('sidebarScrim').hidden=!open;
      $('mobileNavToggle').setAttribute('aria-expanded',String(open));syncShellLabels();
      if(open)$('sidebar').querySelector('[data-nav-tab][aria-current=true]')?.focus();
    };
    $('sidebarScrim').onclick=closeMobileNav;
    $('settingsNav').onclick=()=>{
      closeMobileNav();const panel=$('changePasswordPanel');panel.open=true;
      panel.scrollIntoView({block:'center',behavior:'smooth'});panel.querySelector('input')?.focus();
    };
    window.addEventListener('resize',()=>{if(window.innerWidth>980)closeMobileNav()});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&shell.classList.contains('mobile-open'))closeMobileNav()});
  }
  function staticLabels(){for(const e of document.querySelectorAll('[data-en]'))e.textContent=e.dataset[lang.get()];for(const e of document.querySelectorAll('[data-en-aria-label]'))e.setAttribute('aria-label',e.dataset[lang.get()==='ar'?'arAriaLabel':'enAriaLabel']);document.querySelector('.portal-shell')?.classList.toggle('sidebar-rtl',lang.get()==='ar');$('language').textContent=t('العربية','English');syncToggles();syncShellLabels()}
  function syncToggles(){for(const b of document.querySelectorAll('[data-password-toggle]')){const input=$(b.dataset.passwordToggle);if(!input)continue;b.textContent=t(input.type==='text'?'Hide':'Show',input.type==='text'?'إخفاء':'إظهار');b.setAttribute('aria-label',b.textContent)}}
  function bindToggles(){for(const b of document.querySelectorAll('[data-password-toggle]')){if(b.dataset.bound)continue;b.dataset.bound='1';b.onclick=()=>{const input=$(b.dataset.passwordToggle);if(!input)return;input.type=input.type==='password'?'text':'password';syncToggles()}}}
  function avatar(name){
    const box=node('span',null,'avatar');
    box.textContent=String(name||'?').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'MZ';
    return box;
  }
  function photo(c,id,path,who){
    // Never paint a src-less <img>: that is the broken-image icon visitors see.
    // A branded monogram is visible immediately and is replaced only after the
    // image has actually decoded.
    const slot=node('span',null,'photo-slot'),fallback=avatar(who);
    fallback.setAttribute('role','img');
    fallback.setAttribute('aria-label',t('Photo unavailable for ','الصورة غير متوفرة لـ ')+(who||''));
    fallback.title=fallback.getAttribute('aria-label');
    slot.append(fallback);c.append(slot);
    api('admin/providers/'+id+'/'+path).then(blob=>{
      if(!blob?.type?.startsWith('image/'))return;
      const url=URL.createObjectURL(blob),img=node('img');
      img.className='thumb';img.alt=t('Profile image','صورة الملف');img.hidden=true;
      let settled=false;
      const finish=ok=>{
        if(settled)return;settled=true;
        if(ok&&img.naturalWidth>0){slot.replaceChildren(img);img.hidden=false}
        else URL.revokeObjectURL(url);
      };
      img.onload=()=>finish(true);
      img.onerror=()=>finish(false);
      img.src=url;
      if(typeof img.decode==='function')img.decode().then(()=>finish(true)).catch(()=>{});
    }).catch(()=>{/* the accessible monogram fallback stays visible */});
  }
  function upload(c,p,path='photo',text=t('Upload or replace portrait (1 MB)','رفع الصورة الشخصية أو استبدالها (١ ميغابايت)')){
    const label=node('label',text),f=node('input');
    f.type='file';f.accept='image/jpeg,image/png,image/webp';
    const help=node('small',t('JPG, PNG or WebP · maximum 1 MB. An invalid file leaves the existing photo unchanged.','JPG أو PNG أو WebP · بحد أقصى ١ ميغابايت. الملف غير الصالح لا يغيّر الصورة الحالية.'));
    label.append(help,f);c.append(label);
    f.onchange=async()=>{
      const file=f.files[0];if(!file)return;
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)){notice(t('Choose a JPG, PNG or WebP image.','اختر صورة JPG أو PNG أو WebP.'),'error');f.value='';return}
      if(file.size>1000000){notice(t('The file is larger than 1 MB. Choose a smaller image.','حجم الملف أكبر من ١ ميغابايت. اختر صورة أصغر.'),'error');f.value='';return}
      f.disabled=true;notice(t('Uploading…','جارٍ الرفع…'),'busy');
      try{await save('admin/providers/'+p.id+'/'+path,file,'PUT')}
      catch(e){notice(errorMessage(e),'error')}
      finally{f.disabled=false}
    };
  }
  function badge(status,extra){
    const b=node('span',name(status),'badge badge-'+(extra||status));
    return b;
  }
  function emailStatusLine(p){
    const status=p.welcome_email_status,attempts=Number(p.welcome_attempts||0);
    const labels={sent:['Welcome email sent','تم إرسال رسالة الترحيب'],pending:['Welcome email retry scheduled','أُجدولت إعادة إرسال رسالة الترحيب'],failed:['Welcome email delivery failed','فشل إرسال رسالة الترحيب']};
    if(!labels[status])return null;
    const suffix=status==='sent'?'':' · '+t('attempt','محاولة')+' '+attempts;
    return node('small',t(...labels[status])+suffix,'email-status email-'+status);
  }
  function applyReview(p,next,result){
    for(const list of [applications?.providers,applications?.approved_providers,applications?.rejected_providers,applications?.suspended_providers]){
      if(!list)continue;const i=list.indexOf(p);if(i>=0)list.splice(i,1);
    }
    p.updated_at=null;p.review_note=next==='rejected'&&result?.review_note?result.review_note:p.review_note;
    p.welcome_email_status=result?.welcome_email?.status||p.welcome_email_status||null;
    if(next==='approved'){applications.approved_providers.unshift(p)}
    else if(next==='suspended'){applications.suspended_providers.unshift(p)}
    else{applications.rejected_providers.unshift(p)}
  }
  async function refreshApplications(){
    if(refreshing||!applications)return;refreshing=true;
    try{const d=await api('admin/applications');applications=d;if(tab==='coaches')render()}catch{}finally{refreshing=false}
  }

  // One lightweight request refreshes all badges, the notification center and
  // the overview. It is paused while the tab is hidden and is also called
  // immediately after a management decision.
  async function refreshNotifications(){
    if(notificationRefreshing||$('workspace').hidden)return;
    notificationRefreshing=true;
    try{
      dashboard=await api('admin/dashboard');
      paintNotificationBadges();paintNotificationCenter();
      if(!$('notificationPanel').hidden)positionNotificationPanel();
      if(tab==='overview'&&agentsOverview)renderDashboard(dashboard,null,agentsOverview);
    }catch{}finally{notificationRefreshing=false}
  }
  function paintNotificationBadges(){
    const counts=dashboard?.counts||{};
    for(const b of $('nav').querySelectorAll('[data-nav-tab]')){
      const count=Number(counts[b.dataset.navTab]||0);
      let badge=b.querySelector('.nav-badge');
      if(count>0){
        if(!badge){badge=node('span',null,'nav-badge');b.append(badge)}
        badge.textContent=count>99?'99+':String(count);badge.hidden=false;
      }else if(badge){badge.hidden=true}
    }
    const total=dashboard?.unread||0,badge=$('notificationBadge');
    badge.textContent=total>99?'99+':String(total);badge.hidden=total<=0;
    $('notificationsOpen').setAttribute('aria-label',total>0?t('Notifications, ','الإشعارات، ')+total+t(' unread',' غير مقروء'):t('Notifications','الإشعارات'));
  }
  function paintNotificationCenter(){
    const list=$('notificationList');if(!list)return;
    list.replaceChildren();
    const items=dashboard?.notifications||[];
    if(!items.length){list.append(node('p',t('Nothing needs your attention.','لا شيء يتطلب انتباهك.'),'notification-empty'));return}
    const priority={coaches:0,bookings:1,messages:2,community:3,articles:4};
    const newest=(a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''));
    const urgent=items.filter(item=>item.category!=='ai').sort((a,b)=>(priority[a.category]??5)-(priority[b.category]??5)||newest(a,b));
    const recommendations=items.filter(item=>item.category==='ai').sort(newest);
    const rowFor=item=>{
      const row=node('article',null,'notification-item'+(item.read_at?'':' is-unread'));
      row.append(node('span',notificationName(item.event_type),'notification-type'));
      const when=node('time',date(item.created_at),'notification-time');when.dateTime=item.created_at;row.append(when);
      const target=node('a',item.name,'notification-link');target.href=item.href;target.dataset.recordLink=item.entity_id;row.append(target);
      row.append(node('span',notificationName(item.status),'notification-status'));
      if(!item.read_at){
        const read=button(t('Mark read','تعليم كمقروء'),async()=>{
          await api('admin/notifications',{method:'PATCH',body:{id:item.id}});
          await refreshNotifications();
        });
        read.classList.add('notification-read');row.append(read);
      }else row.append(node('small',t('Read','مقروء'),'notification-read-state'));
      return row;
    };
    const section=(title,rows)=>{
      if(!rows.length)return;
      list.append(node('h3',title+' ('+rows.length+')','notification-group-title'));
      for(const item of rows)list.append(rowFor(item));
    };
    section(t('Needs Action','يحتاج إجراءً'),urgent);
    section(t('AI Recommendations','توصيات الذكاء الاصطناعي'),recommendations);
  }
  function paintActivity(root,events,heading=true){
    if(heading)root.append(node('h3',t('Recent activity','النشاط الأخير')));
    if(!events?.length){root.append(node('p',t('No recent activity.','لا يوجد نشاط حديث.')));return}
    const list=node('div',null,'activity-list');
    for(const event of events.slice(0,8)){
      const row=node('article',null,'activity-item');
      const label=event.source==='moderation'?t('Decision','قرار'):notificationName(event.entity_type);
      row.append(node('strong',label),node('span',[event.from_status?name(event.from_status):'',event.to_status?name(event.to_status):''].filter(Boolean).join(' → ')||name(event.source||'completed')));
      const when=node('time',date(event.created_at),'notification-time');when.dateTime=event.created_at;row.append(when);
      list.append(row);
    }
    root.append(list);
  }
  function positionNotificationPanel(){
    const panel=$('notificationPanel'),bell=$('notificationsOpen');
    if(panel.hidden)return;
    const rect=bell.getBoundingClientRect();
    const mobile=window.matchMedia('(max-width:760px)').matches;
    const top=Math.max(8,Math.min(rect.bottom+8,window.innerHeight-80));
    const available=Math.max(160,window.innerHeight-top-12);
    panel.style.setProperty('--notification-top',top+'px');
    panel.style.setProperty('--notification-end',Math.max(8,window.innerWidth-rect.right)+'px');
    panel.style.setProperty('--notification-start',Math.max(8,rect.left)+'px');
    panel.style.setProperty('--notification-height',(mobile?available:Math.min(620,available))+'px');
    document.body.style.setProperty('--notification-push',(panel.offsetHeight+16)+'px');
  }
  function setNotificationPanel(open){
    const panel=$('notificationPanel'),wasOpen=!panel.hidden;
    panel.hidden=!open;
    document.body.classList.toggle('notification-open',open);
    $('notificationsOpen').setAttribute('aria-expanded',String(open));
    if(open){closeMobileNav();paintNotificationCenter();positionNotificationPanel();$('notificationsClose').focus()}
    else if(wasOpen)document.body.style.removeProperty('--notification-push');
  }
  function startNotificationPolling(){
    if(notificationPoll)clearInterval(notificationPoll);
    notificationPoll=setInterval(()=>{if(document.visibilityState==='visible')refreshNotifications()},90000);
  }
  function bindNotificationCenter(){
    $('notificationsOpen').onclick=()=>setNotificationPanel($('notificationPanel').hidden);
    $('notificationsClose').onclick=()=>setNotificationPanel(false);
    $('notificationsMarkAll').onclick=async()=>{
      const control=$('notificationsMarkAll');control.disabled=true;
      try{await api('admin/notifications',{method:'PATCH',body:{all:true}});await refreshNotifications()}
      catch(err){notice(errorMessage(err),'error')}finally{control.disabled=false}
    };
    $('notificationPanel').addEventListener('click',event=>{
      const link=event.target.closest('[data-record-link]');
      if(!link)return;
      event.preventDefault();
      const targetUrl=new URL(link.href,location.href);
      const targetTab=targetUrl.searchParams.get('tab');
      const targetRecord=targetUrl.searchParams.get('record')||link.dataset.recordLink||'';
      setNotificationPanel(false);
      if(targetTab&&tabs[targetTab]){recordId=targetRecord;go(targetTab,true)}
    });
    document.addEventListener('click',event=>{
      if($('notificationPanel').hidden)return;
      // A "mark read" click replaces the row while its event bubbles, so use
      // the original composed path instead of contains(event.target).
      const path=typeof event.composedPath==='function'?event.composedPath():[event.target];
      if(!path.includes($('notificationPanel'))&&!path.includes($('notificationsOpen')))setNotificationPanel(false);
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('notificationPanel').hidden){setNotificationPanel(false);$('notificationsOpen').focus()}});
    window.addEventListener('resize',()=>{if(!$('notificationPanel').hidden)positionNotificationPanel()});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshNotifications()});
  }
  async function review(p,next,extra={}){
    const action=next==='approved'?'approve':next==='rejected'?'reject':'access',k=p.id+':'+action;
    if(inFlight.has(k))return;
    inFlight.add(k);notice(t('Updating application…','جارٍ تحديث الطلب…'),'busy');
    try{
      const result=await api('admin/providers/'+p.id,{method:'PATCH',body:{status:next,review_version:p.updated_at,...extra}});
      applyReview(p,next,result);
      const mail=result?.welcome_email;
      const approvalMessage=mail?.status==='sent'
        ? t('Approved. The welcome email has been sent.','تم الاعتماد. أُرسلت رسالة الترحيب.')
        : mail?.status==='failed'
          ? t('Approved. Welcome email delivery failed after retries; the status is shown on the card.','تم الاعتماد. فشل إرسال رسالة الترحيب بعد المحاولات؛ الحالة ظاهرة على البطاقة.')
          : t('Approved. The welcome email will retry safely.','تم الاعتماد. ستُعاد محاولة إرسال رسالة الترحيب بأمان.');
      const message=next==='approved'?approvalMessage:next==='rejected'?t('Application rejected.','تم رفض الطلب.'):t('Access updated.','تم تحديث الصلاحية.');
      notice(message,'success');render();refreshApplications();refreshNotifications();return result;
    }catch(e){
      notice(errorMessage(e),'error');
      if(e.message==='profile_changed_reload_review')refreshApplications();
    }finally{inFlight.delete(k)}
  }
  function fillCoachCard(details,p,status){
    if(details.dataset.filled)return;details.dataset.filled='1';
    const c=node('div',null,'coach-details'),licensed=['nutritionist','physiotherapist','sports_massage_therapist'].includes(p.provider_type);
    if(p.has_profile_photo)photo(c,p.id,'photo',p.display_name);
    if(p.has_cover)photo(c,p.id,'cover',p.display_name);
    if(status==='pending'){
      const credentialLines=[p.certificate_name?t('certificate','شهادة')+': '+p.certificate_name:'',p.certificate_issuer?t('issuer','الجهة المصدرة')+': '+p.certificate_issuer:'',p.certificate_number?t('number','الرقم')+': '+p.certificate_number:'',p.license_number?t('license_number','رقم الترخيص')+': '+p.license_number:'',p.license_issuer?t('license_issuer','جهة الترخيص')+': '+p.license_issuer:'',p.license_country?t('country','الدولة')+': '+p.license_country:'',p.license_expires_on?t('expiry','الانتهاء')+': '+p.license_expires_on:'',p.license_review_note?t('previous_note','ملاحظة المراجعة السابقة')+': '+p.license_review_note:''];
      const parts=[p.bio,...(parse(p.specialties_json)||[]),...(parse(p.languages_json)||[]),p.qualifications,...(parse(p.services_json)||[]),p.coaching_mode,p.experience_years? p.experience_years+' '+t('years','سنوات'):'',p.indicative_rate_qar? p.indicative_rate_qar+' QAR':'',p.whatsapp_public?p.whatsapp_number:'',...(parse(p.social_links_json)||[]),...credentialLines];
      c.append(node('p',parts.filter(Boolean).join('\n')||t('No details submitted yet.','لم يُرسل أي تفاصيل بعد.')));
      if(!p.profile_complete)c.append(node('small',t('Incomplete application: the coach can finish the profile after approval.','طلب غير مكتمل: يمكن للمدرب إكمال ملفه بعد الاعتماد.'),'incomplete-note'));
      for(const slot of parse(p.gallery_slots)||[])photo(c,p.id,'gallery/'+slot,p.display_name);
      const identity=node('input');identity.type='checkbox';
      if(!licensed){const l=node('label');l.append(identity,' '+t('identity','تم التحقق من الهوية والمؤهلات'));c.append(l)}
      let licenseCheck=null,licenseNote=null;
      if(licensed){
        licenseCheck=node('input');licenseCheck.type='checkbox';
        const l=node('label');l.append(licenseCheck,' '+t('license_required','تم التحقق من الترخيص المهني'));c.append(l);
        licenseNote=node('input');licenseNote.type='text';licenseNote.maxLength=300;licenseNote.placeholder=t('license_note','ملاحظة مراجعة الترخيص');licenseNote.setAttribute('aria-label',licenseNote.placeholder);
        const noteLabel=node('label',t('license_note','ملاحظة مراجعة الترخيص'));noteLabel.append(licenseNote);c.append(noteLabel);
      }
      const approve=button(t('Approve','اعتماد'),()=>{
        const extra=licensed?{license_verified:Boolean(licenseCheck?.checked),license_review_note:licenseNote?.value||''}:{verified:identity.checked};
        return review(p,'approved',extra);
      });
      approve.classList.add('approve-action');
      c.append(approve,button(t('Reject','رفض'),()=>{
        if(confirm(t('Reject this application?','هل ترفض هذا الطلب؟')))return review(p,'rejected');
      }));
    }
    if(status==='approved'){
      const publicLink=link(t('Public profile','الملف العام'),'coach.html?id='+encodeURIComponent(p.id));publicLink.target='_blank';publicLink.rel='noopener noreferrer';c.append(publicLink);
      const line=emailStatusLine(p);if(line)c.append(line);
    }
    if(status==='rejected'||status==='removed'){
      if(p.review_note)c.append(node('p',p.review_note));
      const line=emailStatusLine(p);if(line)c.append(line);
    }
    if(status==='approved'||status==='removed'){
      const restore=status==='removed';
      c.append(button(restore?t('Restore access','استعادة الوصول'):t('Suspend access','تعليق الوصول'),()=>{
        if(confirm(t('Change access for ','تغيير صلاحية الوصول لـ ')+p.display_name+'؟'))return review(p,restore?'approved':'suspended',restore?{verified:true,license_verified:licensed?true:undefined}:{});
      }));
    }
    if(status!=='removed'&&status!=='rejected'){upload(c,p);upload(c,p,'cover',t('Upload or replace cover (1 MB)','رفع صورة الغلاف أو استبدالها (١ ميغابايت)'))}
    details.append(c);
  }
  function coachCard(root,p,status){
    const details=node('details',null,'coach-card'),summary=node('summary',null,'coach-summary');
    details.dataset.recordId=p.id;
    summary.append(avatar(p.display_name),node('span',p.display_name,'coach-name'));
    const meta=node('span',[name(p.provider_type),[p.city,p.country].filter(Boolean).join(', '),p.email].filter(Boolean).join(' · '),'coach-meta');
    summary.append(meta,badge(status==='removed'?'suspended':status,status==='pending'&&!p.profile_complete?'incomplete':''));
    if(status==='pending'&&!p.profile_complete)summary.append(node('small',t('Incomplete','غير مكتمل'),'incomplete-tag'));
    const mail=emailStatusLine(p);if(mail)summary.append(mail);
    details.append(summary);
    details.addEventListener('toggle',()=>{if(details.open)fillCoachCard(details,p,status)});
    root.append(details);return details;
  }
  function coachFilters(root,counts){
    const row=node('div',null,'coach-filters');
    for(const [id,label] of [['pending','Pending'],['incomplete','Incomplete'],['approved','Approved'],['rejected','Rejected']]){
      const b=button(t(label,id==='incomplete'?'غير مكتمل':id==='pending'?'بانتظار المراجعة':id==='approved'?'معتمدون':'مرفوضون')+' ('+(counts[id]||0)+')',()=>{coachFilter=id;coachVisible=12;render()});
      b.setAttribute('aria-pressed',String(coachFilter===id));
      if(coachFilter===id)b.classList.add('active');
      row.append(b);
    }
    root.append(row);
  }
  function renderCoaches(root){
    if(!applications){root.append(node('p',t('Loading applications…','جارٍ تحميل الطلبات…')));return}
    const all={pending:(applications.providers||[]).filter(p=>p.profile_complete),incomplete:(applications.providers||[]).filter(p=>!p.profile_complete),approved:applications.approved_providers||[],rejected:[...(applications.rejected_providers||[]),...(applications.suspended_providers||[])]};
    coachFilters(root,{pending:all.pending.length,incomplete:all.incomplete.length,approved:all.approved.length,rejected:all.rejected.length});
    const search=node('input',null,'coach-search');search.type='search';search.maxLength=80;
    search.placeholder=t('Search coaches by name, email or city','ابحث عن المدربين بالاسم أو البريد أو المدينة');
    search.setAttribute('aria-label',search.placeholder);search.value=coachQuery;root.append(search);
    const rows=all[coachFilter]||all.pending;
    const empty=node('p',t('No records.','لا توجد سجلات.'));
    if(!rows.length){root.append(empty);return}
    const list=node('div',null,'coach-list');root.append(list);
    for(const p of rows.slice(0,coachVisible))coachCard(list,p,coachFilter==='incomplete'?'pending':coachFilter==='rejected'&&p.review_note==='Removed by owner'?'removed':coachFilter);
    const filtered=node('p',t('No coaches match this search.','لا يوجد مدربون يطابقون هذا البحث.'),'coach-search-empty');filtered.hidden=true;root.append(filtered);
    search.oninput=()=>{
      coachQuery=search.value.trim().toLowerCase();let visible=0;
      for(const c of list.querySelectorAll('.coach-card')){
        const match=!coachQuery||c.textContent.toLowerCase().includes(coachQuery);
        c.hidden=!match;if(match)visible++;
      }
      filtered.hidden=visible>0;empty.hidden=true;
    };
    if(coachQuery)search.oninput();
    if(rows.length>coachVisible)root.append(button(t('Show more','عرض المزيد')+' ('+(rows.length-coachVisible)+')',()=>{coachVisible+=12;render()}));
  }
  function booking(root,b){const c=card(root,b.customer_name,[name(b.status),b.coach_name,b.city,b.preferred_date,b.customer_phone,b.customer_email,b.session_type,b.service_name,b.distance,b.target_pace,b.program_duration_months?b.program_duration_months+' '+t('months','أشهر'):'',b.goal_summary].filter(Boolean).join(' · '),b.id);const actions={reviewing:['Review','بدء المراجعة'],accepted:['Confirm booking','تأكيد الحجز'],declined:['Decline','رفض'],cancelled:['Cancel booking','إلغاء الحجز']};for(const status of ({received:['reviewing','accepted','declined','cancelled'],reviewing:['accepted','declined','cancelled'],accepted:['cancelled']}[b.status]||[])){c.append(button(t(...actions[status]),()=>{if(status!=='reviewing'&&!confirm(t(...actions[status])+'؟'))return;return save('admin/bookings/'+b.id,{status})}))}  const rawPhone=String(b.customer_phone||'').replace(/[\s().-]/g,'');
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
  function taskCard(root,task){const output=parse(task.output_json),c=card(root,agentName(task),[date(task.created_at),task.source==='scheduled'?t('Automatic','تلقائي'):t('Manual','يدوي'),phase(task)].join(' · '),task.id);if(task.status==='failed'){c.append(node('p',errorMessage(Error(task.error_message))));return}if(!output?.answer)return;c.append(node('p',output.answer),node('strong',task.approval_status==='pending'?t('Awaiting approval','بانتظار الموافقة'):name(task.approval_status)));if(task.approval_status==='pending')for(const decision of ['approved','rejected'])c.append(button(decision==='approved'?t('Approve draft','اعتماد المسودة'):t('Reject draft','رفض المسودة'),()=>save('admin/agents/'+task.id,{decision})))}
  function communityPost(root,p){
    const title=[name(p.kind),p.author_name,p.author_verified?'✓':''].filter(Boolean).join(' · ');
    const details=[date(p.published_at||p.created_at),p.sport,p.location,p.starts_at?date(p.starts_at):'',p.body].filter(Boolean).join('\n');
    const c=card(root,title,details,p.id);
    if(p.photos?.length)c.append(node('small',t('Photos','الصور')+': '+p.photos.join(', ')));
    const actions={pending:[['published',t('Publish','نشر')],['hidden',t('Hide','إخفاء')]],published:[['hidden',t('Hide','إخفاء')]],hidden:[['published',t('Restore','استعادة')]]};
    for(const [status,text] of (actions[p.status]||[]))c.append(button(text,()=>save('admin/community/posts/'+p.id,{status})));
    return c;
  }
  function communityComment(root,c){
    const item=card(root,c.email||t('MZ Active member','عضو MZ Active'),[date(c.created_at),name(c.status),c.body].filter(Boolean).join('\n'),c.id);
    item.append(button(c.status==='hidden'?t('Show comment','إظهار التعليق'):t('Hide comment','إخفاء التعليق'),()=>save('admin/community/comments/'+c.id,{status:c.status==='hidden'?'published':'hidden'})));
    return item;
  }
  function achievementReview(root,a){
    const c=card(root,[a.display_name,a.email].filter(Boolean).join(' · '),[a.title,a.details,a.awarded_year].filter(Boolean).join('\n'),a.id);
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
  const dashboardCardsFor = [
    ['bookings',['Open bookings','حجوزات مفتوحة']],
    ['coaches',['Coach applications','طلبات المدربين']],
    ['messages',['Unread messages','رسائل غير مقروءة']],
    ['community',['Community moderation','إشراف المجتمع']],
    ['articles',['Articles for review','مقالات للمراجعة']],
    ['ai',['AI recommendations','توصيات الذكاء الاصطناعي']],
  ];
  function dashboardCard(grid,category,label,count,sublabel,target){
    const c=node('article',null,'dashboard-card'+(Number(count)>0?' needs-attention':''));
    c.dataset.overviewCard=category;
    c.append(node('span',t(...label),'dashboard-card-label'),node('strong',Number(count||0),'metric'));
    if(sublabel)c.append(node('small',t(...sublabel),'dashboard-card-sub'));
    const action=button(t('Review','مراجعة'),()=>{
      if(target==='actions'){
        const panel=$('actionCenter');if(!panel)return;
        panel.setAttribute('tabindex','-1');panel.scrollIntoView({block:'center',behavior:'smooth'});panel.focus({preventScroll:true});return;
      }
      return go(target||category);
    });
    action.dataset.overviewAction=category;c.append(action);grid.append(c);
  }
  function actionCenter(root,items){
    const panel=node('section',null,'command-panel');panel.id='actionCenter';
    const head=node('div',null,'panel-head');head.append(node('h3',t('Action Center','مركز الإجراءات')));
    head.append(button(t('All notifications','كل الإشعارات'),()=>setNotificationPanel(true)));
    panel.append(head);
    const list=node('div',null,'action-list');
    const rows=(items||[]).filter(item=>item.category!=='ai').slice(0,6);
    if(!rows.length)list.append(node('p',t('Nothing needs your attention.','لا شيء يتطلب انتباهك.'),'empty-state'));
    for(const item of rows){
      const row=node('article',null,'action-row'),body=node('div');
      body.append(node('strong',item.name||notificationName(item.event_type)));
      body.append(node('p',[notificationName(item.event_type),name(item.status),item.created_at?date(item.created_at):''].filter(Boolean).join(' · ')));
      const open=button(t('Open','فتح'),()=>openTarget(item.href));open.dataset.actionRecord=item.entity_id;
      row.append(body,open);list.append(row);
    }
    panel.append(list);root.append(panel);
  }
  function aiOverview(root,agents){
    const panel=node('section',null,'command-panel');
    const head=node('div',null,'panel-head');head.append(node('h3',t('AI Brain','المساعد الذكي')));
    head.append(button(t('Open AI Brain','فتح المساعد الذكي'),()=>go('ai')));panel.append(head);
    panel.append(node('p',t(...labels.ai_disclaimer),'crm-note'));
    const list=node('div',null,'ai-list');
    const pending=(agents?.pending||[]).filter(task=>task.approval_status==='pending').slice(0,3);
    if(!pending.length)list.append(node('p',t('No AI recommendation is awaiting approval.','لا توجد توصية ذكاء اصطناعي بانتظار الموافقة.'),'empty-state'));
    for(const task of pending){
      const output=parse(task.output_json)||{},row=node('article',null,'action-row'),body=node('div');
      body.append(node('strong',task.title||agentName(task)));
      body.append(node('p',String(output.answer||'').slice(0,420)));
      const review=button(t('Review','مراجعة'),()=>openTarget('/admin.html?tab=ai&record='+encodeURIComponent(task.id)));
      review.dataset.aiRecord=task.id;row.append(body,review);list.append(row);
    }
    panel.append(list);root.append(panel);
  }
  function businessSnapshot(root,snapshot){
    const panel=node('section',null,'command-panel');
    const head=node('div',null,'panel-head');head.append(node('h3',t('Business snapshot','لمحة عن العمل')));panel.append(head);
    const rows=[['open_booking_requests',['Open requests','طلبات مفتوحة']],['approved_providers',['Approved professionals','مختصون معتمدون']],['published_community_posts',['Published posts','منشورات منشورة']],['weekly_challenges',['Weekly challenges','تحديات الأسبوع']],['active_training_teams',['Training teams','فرق التدريب']]];
    const list=node('div',null,'ai-list');
    for(const [field,label] of rows){const row=node('article',null,'action-row');row.append(node('span',t(...label)),node('strong',Number(snapshot?.[field]||0)));list.append(row)}
    panel.append(list);root.append(panel);
  }
  function renderDashboard(data,container,agents){
    const root=container||node('div');root.replaceChildren();
    const counts=data?.counts||{},snapshot=agents?.snapshot||null,hasSnapshot=!!snapshot&&Object.keys(snapshot).length>0;
    const intro=node('div',null,'overview-intro'),heading=node('div');
    heading.append(node('h3',t('Command overview','نظرة عامة تنفيذية')),node('p',t('Every figure below comes from live records and your current permissions.','كل رقم أدناه من سجلات مباشرة ووفق صلاحياتك الحالية.')));
    intro.append(heading);root.append(intro);
    const grid=node('div',null,'command-grid dashboard-grid');
    if(hasSnapshot)dashboardCard(grid,'athletes',['Athlete accounts','حسابات الرياضيين'],snapshot.registered_athletes,['Verified directory','دليل موثق'],'athletes');
    if(hasSnapshot)dashboardCard(grid,'coaches',['Coach applications','طلبات المدربين'],Number(counts.coaches!=null?counts.coaches:(snapshot.pending_provider_profiles||0)),[t('Approved professionals: ','المختصون المعتمدون: ')+Number(snapshot.approved_providers||0),t('Approved professionals: ','المختصون المعتمدون: ')+Number(snapshot.approved_providers||0)],'coaches');
    dashboardCard(grid,'bookings',['Open bookings','حجوزات مفتوحة'],Number(counts.bookings!=null?counts.bookings:(snapshot?.open_booking_requests||0)),['Requests awaiting triage','طلبات بانتظار الفرز'],'bookings');
    if(hasSnapshot)dashboardCard(grid,'programs',['Programs without access','برامج بلا وصول'],snapshot.unlinked_programs,['Need an athlete account','تحتاج حساب رياضي'],'athletes');
    dashboardCard(grid,'actions',['Needs action','يحتاج إجراءً'],data?.total,['Across permitted areas','ضمن الصلاحيات المسموحة'],'actions');
    if(canAi())dashboardCard(grid,'ai',['AI recommendations','توصيات الذكاء الاصطناعي'],counts.ai,['Awaiting your decision','بانتظار قرارك'],'ai');
    root.append(grid);
    const layout=node('div',null,'overview-grid'),stack=node('div',null,'overview-stack'),side=node('div',null,'overview-stack');
    actionCenter(stack,data?.notifications);
    const activity=node('section',null,'command-panel'),activityHead=node('div',null,'panel-head');
    activityHead.append(node('h3',t('Recent activity','النشاط الأخير')),button(t('Full history','السجل الكامل'),()=>go('history')));
    activity.append(activityHead);paintActivity(activity,data?.activity,false);stack.append(activity);
    if(canAi())aiOverview(side,agents);
    if(hasSnapshot)businessSnapshot(side,snapshot);
    layout.append(stack,side);root.append(layout);
    if(!container)$('view').replaceChildren(root);
    focusRecord();
  }
  function focusRecord(){
    if(!recordId)return;
    const target=$('view').querySelector('[data-record-id="'+CSS.escape(recordId)+'"]');
    if(!target)return;
    target.scrollIntoView({block:'center',behavior:'smooth'});
    target.classList.add('record-focus');
  }
  function crmStatus(text,tone=''){const p=node('p',text||'','crm-status');if(tone)p.dataset.tone=tone;return p}
  function setCrmStatus(p,text,tone=''){p.textContent=text;if(tone)p.dataset.tone=tone;else delete p.dataset.tone}
  function crmField(label,value){
    const row=node('div',null,'crm-field'),has=value!==''&&value!=null&&value!==undefined;
    row.append(node('span',label,'crm-field-label'));
    row.append(node('strong',has?String(value):t(...labels.not_provided),has?'':'crm-missing'));
    return row;
  }
  function crmSection(title,id){const s=node('section',null,'crm-section');if(id)s.id=id;s.append(node('h3',title));return s}
  function crmEmpty(pair){return node('p',t(...pair),'crm-empty')}
  function crmAction(label,statusNode,fn,successPair){
    const b=node('button',label,'crm-action');b.type='button';b.dataset.label=label;
    b.onclick=async()=>{
      if(b.disabled)return;
      b.disabled=true;b.setAttribute('aria-busy','true');
      setCrmStatus(statusNode,t('Working…','جارٍ التنفيذ…'),'busy');
      try{
        const result=await fn();
        setCrmStatus(statusNode,successPair?t(...successPair):t('Done.','تم.'),'success');
        return result;
      }catch(e){
        if(e?.cancelled)setCrmStatus(statusNode,t('Cancelled.','تم الإلغاء.'));
        else setCrmStatus(statusNode,errorMessage(e).split(' · ')[0],'error');
      }finally{b.disabled=false;b.removeAttribute('aria-busy')}
    };
    return b;
  }
  function athleteParams(){
    const p=new URLSearchParams();
    p.set('filter',athleteFilter);p.set('sort',athleteSort);p.set('q',athleteDirectory?.q||'');
    return p;
  }
  function paintAthleteDirectory(root,data){
    const focused=document.activeElement,restoreSearch=focused?.classList?.contains('athlete-search')?focused:null;
    const caret=restoreSearch?restoreSearch.selectionStart:null;
    root.replaceChildren();
    const toolbar=node('div',null,'athlete-toolbar');
    const search=node('input',null,'athlete-search');search.type='search';search.maxLength=80;
    search.placeholder=t(...labels.search_athletes);search.setAttribute('aria-label',search.placeholder);search.value=data.q||'';
    search.oninput=()=>{athleteDirectory={...athleteDirectory,q:search.value};clearTimeout(athleteTimer);athleteTimer=setTimeout(()=>loadAthleteDirectory(root),260)};
    toolbar.append(search);
    const filters=node('div',null,'athlete-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label',t('Filter athletes','تصفية الرياضيين'));
    const counts=data.counts||{};
    for(const [code,label] of [['all',labels.all_athletes],['unassigned',labels.unassigned],['assigned',labels.assigned],['active',labels.active],['inactive',labels.inactive],['onboarding_incomplete',labels.onboarding_incomplete]]){
      const b=node('button',t(...label)+' ('+Number(counts[code]||0)+')','athlete-filter');b.type='button';b.dataset.filter=code;
      if(code===athleteFilter){b.classList.add('active');b.setAttribute('aria-pressed','true')}else b.setAttribute('aria-pressed','false');
      b.onclick=()=>{athleteFilter=code;loadAthleteDirectory(root)};filters.append(b);
    }
    const sort=node('select',null,'athlete-sort');sort.setAttribute('aria-label',t('Sort athletes','ترتيب الرياضيين'));
    for(const [code,label] of [['recent',['Recently active','الأكثر نشاطاً']],['name',['Name','الاسم']],['status',['Status','الحالة']]]){
      const o=node('option',t(...label));o.value=code;if(code===athleteSort)o.selected=true;sort.append(o);
    }
    sort.onchange=()=>{athleteSort=sort.value;loadAthleteDirectory(root)};
    toolbar.append(filters,sort);root.append(toolbar);
    const listStatus=crmStatus();root.append(listStatus);
    root.append(node('p',t('Showing ','عرض ')+data.total+' / '+counts.all+' · '+t(...labels.athlete_directory),'athlete-summary'));
    const list=node('div',null,'athlete-list');
    if(!data.athletes?.length)list.append(crmEmpty(['No athletes match these filters. Clear the search or choose another status.','لا يوجد رياضيون يطابقون هذه العوامل. امسح البحث أو اختر حالة أخرى.']));
    for(const a of data.athletes||[]){
      const b=node('button',null,'athlete-card');b.type='button';b.dataset.recordId=a.id;
      b.setAttribute('aria-label',t('View profile for ','عرض ملف ')+(a.name||a.email));
      const head=node('span',null,'athlete-card-head');head.append(avatar(a.name));
      const who=node('span',null,'athlete-who');who.append(node('strong',a.name||a.email,'athlete-name'),node('small',a.email||'','athlete-email'));head.append(who);
      const badges=node('span',null,'athlete-badges');badges.append(badge(a.assignment_status),badge(a.active?'active':'inactive'));
      if(a.onboarding_incomplete)badges.append(badge('onboarding_incomplete'));
      const meta=[(a.sports||[]).join(', '),a.city,a.assigned_coach_name?t(...labels.assigned_coaches)+': '+a.assigned_coach_name:'',a.last_activity_at?t(...labels.last_activity)+': '+date(a.last_activity_at):''].filter(Boolean).join(' · ');
      b.append(head,badges,node('span',meta||t(...labels.not_provided),'athlete-meta'),node('span',t('View profile →','عرض الملف ←'),'athlete-card-more'));
      b.onclick=()=>openAthleteDetail(a.id);
      list.append(b);
    }
    root.append(list);
    const unlinked=node('div',null,'athlete-unlinked');unlinked.append(node('h3',t('Programs without account access','برامج غير مرتبطة بحساب')));
    if(!data.unlinked?.length)unlinked.append(crmEmpty(['All programs are linked to an athlete account.','جميع البرامج مرتبطة بحساب رياضي.']));
    for(const p of data.unlinked||[]){
      const c=node('article',null,'crm-row');c.append(node('strong',p.athlete_name||t(...labels.not_provided)),node('small',date(p.week_start)));
      const sel=node('select');sel.setAttribute('aria-label',t('Athlete email','بريد الرياضي'));sel.append(node('option',t('Choose the athlete account','اختر حساب الرياضي')));sel.firstChild.value='';
      for(const a of data.athletes||[]){const o=node('option',a.email);o.value=a.id;sel.append(o)}
      c.append(sel,crmAction(t('Grant program access','منح الوصول للبرنامج'),listStatus,async()=>{
        if(!sel.value)throw Object.assign(new Error('missing_athlete'),{cancelled:true});
        if(!confirm(t('Grant access to ','منح الوصول إلى ')+sel.selectedOptions[0].textContent+'؟'))throw Object.assign(new Error('cancelled'),{cancelled:true});
        await save('admin/programs/'+p.id+'/athlete',{athlete_id:sel.value});
      },['Program access granted.','تم منح الوصول للبرنامج.']));
      unlinked.append(c);
    }
    root.append(unlinked);
    if(restoreSearch){const next=root.querySelector('.athlete-search');if(next){next.focus();if(caret!=null)next.setSelectionRange(caret,caret)}}
    if(recordId&&(data.athletes||[]).some(a=>a.id===recordId)&&openedAthleteRecord!==recordId)openAthleteDetail(recordId);
    else focusRecord();
  }
  async function loadAthleteDirectory(root){
    const list=root.querySelector('.athlete-list');if(list)list.textContent=t('Loading athletes…','جارٍ تحميل الرياضيين…');
    try{const data=await api('admin/athletes?'+athleteParams().toString());athleteDirectory=data;paintAthleteDirectory(root,data)}
    catch(e){notice(errorMessage(e),'error');if(list)list.replaceChildren(node('p',errorMessage(e),'crm-error'))}
  }
  function renderAthletes(root){return loadAthleteDirectory(root)}
  const localizedReason = reason => lang.get()==='ar' ? reason?.ar : reason?.en;
  async function openAthleteDetail(id){
    if(!athleteDialog){
      athleteDialog=node('dialog');athleteDialog.id='athleteDetailDialog';athleteDialog.className='crm-dialog athlete-drawer';
      athleteDialog.addEventListener('close',()=>{openedAthleteRecord=''});
      athleteDialog.addEventListener('click',event=>{if(event.target===athleteDialog)athleteDialog.close()});
      document.body.append(athleteDialog);
    }
    openedAthleteRecord=id;
    athleteDialog.replaceChildren(node('p',t('Loading athlete profile…','جارٍ تحميل الملف الرياضي…'),'crm-loading'));
    if(!athleteDialog.open)athleteDialog.showModal();
    try{const data=await api('admin/athletes/'+encodeURIComponent(id));renderAthleteDetail(athleteDialog,data)}
    catch(e){athleteDialog.replaceChildren(crmHeader(t('Unable to load profile','تعذر تحميل الملف'),()=>athleteDialog.close()),node('p',errorMessage(e),'crm-error'))}
  }
  function crmHeader(title,onClose){
    const h=node('header',null,'crm-header'),monogram=avatar(title);
    h.append(monogram,node('h2',title));
    const close=node('button',t('Close','إغلاق'),'crm-close');close.type='button';close.onclick=onClose;h.append(close);return h;
  }
  function renderAthleteDetail(dialog,data){
    const a=data.athlete||{},shell=node('div',null,'crm-shell');
    shell.append(crmHeader(a.name||a.email||t('Athlete','رياضي'),()=>dialog.close()));
    const status=crmStatus(),actions=node('div',null,'crm-actions');
    actions.append(
      crmAction(t(...labels.view_profile),status,async()=>shell.querySelector('#crmProfileSection')?.scrollIntoView({block:'start',behavior:'smooth'}),labels.viewing_profile),
      crmAction(t(...labels.recommend_coach),status,async()=>renderRecommendations(shell,a,status),['Recommendations ready for review.','التوصيات جاهزة للمراجعة.']),
      crmAction(t(...labels.invite_profile),status,async()=>{
        if(!confirm(t('Send a profile completion invitation to ','إرسال دعوة إكمال الملف إلى ')+(a.email||'')+'؟'))throw Object.assign(new Error('cancelled'),{cancelled:true});
        return api('admin/athletes/'+encodeURIComponent(a.id)+'/invitations/profile',{method:'POST',body:{language:a.preferred_language==='ar'||lang.get()==='ar'?'ar':'en'}});
      },['Profile invitation sent.','تم إرسال دعوة إكمال الملف.']),
      crmAction(t(...labels.view_programs),status,async()=>shell.querySelector('#crmProgramsSection')?.scrollIntoView({block:'start',behavior:'smooth'}),labels.programs_ready),
      crmAction(t(...labels.view_bookings),status,async()=>shell.querySelector('#crmBookingsSection')?.scrollIntoView({block:'start',behavior:'smooth'}),labels.bookings_ready),
      crmAction(t(...labels.refresh),status,async()=>openAthleteDetail(a.id),['Profile refreshed.','تم تحديث الملف.'])
    );
    shell.append(actions,status);
    const body=node('div',null,'crm-body');
    const profile=crmSection(t('Verified athlete profile','الملف الرياضي الموثق'),'crmProfileSection'),fields=node('div',null,'crm-fields');
    fields.append(
      crmField(t('Name','الاسم'),a.name),
      crmField(t('Email','البريد الإلكتروني'),a.email),
      crmField(t(...labels.city),a.city),
      crmField(t(...labels.sports),(a.sports||[]).join(', ')),
      crmField(t(...labels.goals),a.goals),
      crmField(t(...labels.experience),a.experience_level),
      crmField(t(...labels.language),a.preferred_language==='ar'?'العربية':a.preferred_language==='en'?'English':''),
      crmField(t(...labels.availability),a.availability_notes),
      crmField(t(...labels.age_range),a.age_range),
      crmField(t(...labels.gender),a.gender),
      crmField(t(...labels.last_activity),a.last_activity_at?date(a.last_activity_at):''),
      crmField(t('Registered','تاريخ التسجيل'),a.registered_at?date(a.registered_at):'')
    );
    profile.append(fields,node('p',t('Only verified profile fields are shown. Missing details appear as “Not provided”.','تُعرض الحقول الموثقة فقط. تظهر البيانات الناقصة كـ «غير متوفر».'),'crm-note'));
    body.append(profile);
    const state=crmSection(t('Status and access','الحالة والوصول'));
    const stateFields=node('div',null,'crm-fields');
    stateFields.append(
      crmField(t('Assignment','التعيين'),name(a.assignment_status||'unassigned')),
      crmField(t('Activity','النشاط'),name(a.active?'active':'inactive')),
      crmField(t('Onboarding','إكمال الملف'),name(a.onboarding_incomplete?'onboarding_incomplete':'completed')),
      crmField(t(...labels.assigned_coaches),a.assigned_coach_name),
      crmField(t(...labels.programs_count),Number(a.program_count||0)),
      crmField(t(...labels.bookings_count),Number(a.booking_count||0))
    );
    state.append(stateFields);body.append(state);
    const coaching=crmSection(t(...labels.coach_workspaces));
    if(!data.coaches?.length)coaching.append(crmEmpty(['No coach connection has been created for this athlete.','لم يتم إنشاء أي ارتباط مع مدرب لهذا الرياضي.']));
    for(const c of data.coaches||[]){
      const row=node('article',null,'crm-row');
      row.append(node('strong',c.coach_name||t(...labels.not_provided)),node('small',[name(c.status),c.workspace_status?name(c.workspace_status):'',c.updated_at?date(c.updated_at):''].filter(Boolean).join(' · ')));
      if(c.status==='accepted'&&c.workspace_status==='active')row.append(crmAction(t(...labels.revoke_coach),status,async()=>{
        if(!confirm(t('Close this coaching workspace? The athlete keeps their account.','إغلاق مساحة التدريب هذه؟ يحتفظ الرياضي بحسابه.')))throw Object.assign(new Error('cancelled'),{cancelled:true});
        await api('admin/athletes/'+encodeURIComponent(a.id)+'/connections/'+encodeURIComponent(c.id)+'/revoke',{method:'POST',body:{}});
      },['Coach revoked and workspace closed.','تم إلغاء المدرب وإغلاق المساحة.']));
      coaching.append(row);
    }
    body.append(coaching);
    const invitations=crmSection(t('Invitations','الدعوات'));
    if(!data.invitations?.length)invitations.append(crmEmpty(labels.no_invitations));
    for(const i of data.invitations||[]){
      const row=node('article',null,'crm-row');row.append(node('strong',i.coach_name||t(...labels.profile_invited)),node('small',[name(i.kind),name(i.status),name(i.email_status),i.created_at?date(i.created_at):''].filter(Boolean).join(' · ')));
      if(['pending','email_failed'].includes(i.status))row.append(crmAction(t(...labels.resend_invitation),status,async()=>api('admin/athletes/'+encodeURIComponent(a.id)+'/invitations/'+encodeURIComponent(i.id)+'/resend',{method:'POST',body:{}}),['Invitation resent.','تمت إعادة إرسال الدعوة.']));
      invitations.append(row);
    }
    body.append(invitations);
    const programs=crmSection(t('Training programs','برامج التدريب'),'crmProgramsSection');
    if(!data.programs?.length)programs.append(crmEmpty(labels.no_programs));
    for(const p of data.programs||[]){
      const done=(p.sessions||[]).filter(s=>s.completed_at).length,row=node('article',null,'crm-row');
      row.append(node('strong',p.week_start||t(...labels.not_provided)),node('small',t('Sessions','الحصص')+': '+(p.sessions||[]).length+' · '+t('Completed','مكتملة')+': '+done));
      programs.append(row);
    }
    body.append(programs);
    const bookings=crmSection(t(...labels.bookings_count),'crmBookingsSection');
    if(!data.bookings?.length)bookings.append(crmEmpty(labels.no_bookings));
    for(const b of data.bookings||[]){
      const row=node('article',null,'crm-row');
      row.append(node('strong',b.session_type||t(...labels.not_provided)),node('small',[name(b.status),b.city,date(b.created_at)].filter(Boolean).join(' · ')));
      bookings.append(row);
    }
    body.append(bookings);
    const messages=crmSection(t(...labels.messages));
    if(!data.messages?.length)messages.append(crmEmpty(['No private coaching messages are linked to this athlete.','لا توجد رسائل تدريب خاصة مرتبطة بهذا الرياضي.']));
    for(const m of data.messages||[]){
      const row=node('article',null,'crm-row');
      row.append(node('small',[m.coach_name,date(m.created_at),m.read_at?t('Read','مقروء'):t('Unread','غير مقروء')].filter(Boolean).join(' · ')));
      messages.append(row);
    }
    body.append(messages);
    const ai=crmSection(t(...labels.ai_recommendations));
    ai.append(node('p',t(...labels.consent_notice),'crm-note'),node('div',null,'crm-recommendations'),crmAction(t(...labels.recommend_coach),status,async()=>renderRecommendations(shell,a,status),['Recommendations ready for review.','التوصيات جاهزة للمراجعة.']));
    body.append(ai);
    const audit=crmSection(t(...labels.audit_history));
    if(!data.audit?.length)audit.append(crmEmpty(labels.no_audit));
    for(const e of data.audit||[]){
      const row=node('article',null,'crm-row');
      row.append(node('strong',name(e.action)),node('small',[date(e.created_at),e.actor_user_id?t('Recorded by manager','سجلها المدير'):t('Recorded by athlete','سجلها الرياضي')].join(' · ')));
      audit.append(row);
    }
    body.append(audit);
    shell.append(body);dialog.replaceChildren(shell);
  }
  async function renderRecommendations(shell,athlete,status){
    const box=shell.querySelector('.crm-recommendations');if(!box)return;
    box.replaceChildren(node('p',t('Generating safe recommendations…','جارٍ إنشاء توصيات آمنة…'),'crm-loading'));
    try{
      const data=await api('admin/athletes/'+encodeURIComponent(athlete.id)+'/recommendations');
      const disclaimer=data.disclaimer?[data.disclaimer.en,data.disclaimer.ar]:labels.ai_disclaimer;
      box.replaceChildren(node('p',t(...disclaimer),'crm-note'));
      if(data.next_steps?.length){const steps=node('ul',null,'crm-reasons');for(const step of data.next_steps)steps.append(node('li',lang.get()==='ar'?step.ar:step.en));box.append(node('h4',t(...labels.next_steps)),steps)}
      for(const draft of data.drafts||[]){const pre=node('pre',(lang.get()==='ar'?draft.subject_ar:draft.subject_en)+'\n\n'+(lang.get()==='ar'?draft.body_ar:draft.body_en),'crm-draft');pre.setAttribute('aria-label',t(...labels.outreach_draft));box.append(node('h4',t(...labels.outreach_draft)),pre)}
      if(!data.matches?.length)box.append(crmEmpty(labels.no_recommendations));
      for(const match of data.matches||[]){
        const c=node('article',null,'crm-match');
        c.append(node('strong',match.coach_name),node('span',t(...labels.recommendation_score)+': '+match.score,'crm-score'));
        c.append(node('small',[match.city,match.coaching_mode,(match.languages||[]).join(', '),(match.specialties||[]).join(', ')].filter(Boolean).join(' · ')||t(...labels.not_provided)));
        const reasons=node('ul',null,'crm-reasons');for(const reason of match.reasons||[])reasons.append(node('li',localizedReason(reason)));
        c.append(node('h4',t(...labels.why_recommended)),reasons);
        c.append(crmAction(t(...labels.approve_and_invite),status,async()=>{
          const path=athlete.assigned?'admin/athletes/'+encodeURIComponent(athlete.id)+'/reassign':'admin/athletes/'+encodeURIComponent(athlete.id)+'/invitations/coach';
          return api(path,{method:'POST',body:{coach_id:match.coach_id,reasons:(match.reasons||[]).map(r=>r.code),language:athlete.preferred_language==='ar'||lang.get()==='ar'?'ar':'en'}});
        },['Invitation saved. The athlete must accept before any workspace opens.','حُفظت الدعوة. يجب أن يقبل الرياضي قبل فتح أي مساحة.']));
        box.append(c);
      }
    }catch(e){box.replaceChildren(node('p',errorMessage(e).split(' · ')[0],'crm-error'))}
  }
  async function paint(root){
    if(tab==='overview'){
      const data=dashboard||await api('admin/dashboard');dashboard=data;
      const agents=await loadAiOverview();
      renderDashboard(data,root,agents);paintNotificationBadges();paintNotificationCenter();return;
    }
    if(tab==='ai'){
      const data=await api('admin/agents'),tasks=data.tasks;
      root.append(node('p',t('An agent analyzes current business data every hour. Six specialist agents take turns; all seven modes are available for manual analysis. Drafts require your decision.','يحلل وكيل بيانات المنصة كل ساعة، ويتناوب ستة وكلاء متخصصون. تتوفر الأوضاع السبعة للتحليل اليدوي، وتتطلب المسودات قرارك.')));
      const select=node('select'),prompt=node('textarea');prompt.maxLength=1600;
      for(const code of ['operations','monitoring','analytics','marketing','growth','community','support']){const o=node('option',name(code));o.value=code;select.append(o)}
      const l=node('label',t('Agent','الوكيل')),q=node('label',t('Question or objective','السؤال أو الهدف'));l.append(select);q.append(prompt);root.append(l,q,button(t('Run analysis','تنفيذ التحليل'),async()=>{if(!prompt.value.trim()){prompt.focus();return}try{await api('admin/assistant',{method:'POST',body:{task:select.value,prompt:prompt.value.trim()}});agentsOverview=null;notice(t('Draft saved for review.','حُفظت المسودة للمراجعة.'))}finally{await render()}}));
      group(root,t('Recent runs','آخر عمليات التنفيذ'),tasks.slice(0,30),taskCard);return;
    }
    if(tab==='bookings'){const d=await api('admin/applications');group(root,t('Recent and open requests','الطلبات المفتوحة والأخيرة'),d.bookings,booking);return}
    if(tab==='messages'){const d=await api('admin/messages');root.append(node('p',t('Message previews stay private. This view shows only conversation metadata for moderation.','تبقى معاينات الرسائل خاصة. تعرض هذه الشاشة بيانات المحادثة فقط للإشراف.'),'muted'));group(root,t('Unread and recent messages','الرسائل غير المقروءة والأخيرة'),d.messages,messageCard);return}
    if(tab==='coaches'){if(!applications)applications=await api('admin/applications');renderCoaches(root);return}
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
    if(tab==='articles'){const d=await api('admin/blog');group(root,t('Awaiting moderation','بانتظار المراجعة'),d.posts,(r,p)=>{const c=card(r,p.title,[p.coach_name,p.summary,p.body].join('\n'),p.id);for(const a of ['publish','return'])c.append(button(a==='publish'?t('Publish article','نشر المقال'):t('Return for edits','إعادة للتعديل'),()=>{if(a==='publish'&&!confirm(t('Publish this article?','نشر هذا المقال؟')))return;return save('admin/blog/'+p.id,{action:a})}))});return}
    if(tab==='athletes'){root.append(link(t('Open training dashboard','فتح لوحة التدريب'),'dashboard.html'));await renderAthletes(root);return}
    const [h,ai]=await Promise.all([api('admin/history'),api('admin/agents')]);const events=[...h.events,...ai.activity].sort((a,b)=>b.created_at.localeCompare(a.created_at));
    group(root,t('Recent decisions and activity','آخر القرارات والأنشطة'),events.slice(0,100),(r,e)=>card(r,e.action?name(e.action):e.entity_type==='provider_profile'?t('Coach profile','ملف المدرب'):e.entity_type==='registration'?t('New registration','تسجيل جديد'):t('Booking','حجز'),[date(e.created_at),e.action?name(e.agent_type):name(e.from_status),e.to_status?name(e.to_status):''].filter(Boolean).join(' · ')));
  }
  async function render(){const n=++sequence;staticLabels();$('nav').replaceChildren();const available=Object.entries(tabs).filter(([id])=>managementIsAdmin||!TAB_PERMISSIONS[id]||managementPermissions.includes(TAB_PERMISSIONS[id]));if(!available.some(([id])=>id===tab))tab='overview';for(const [id,v] of available){const b=node('button');b.type='button';b.dataset.navTab=id;b.title=t(...v);b.setAttribute('aria-label',t(...v));b.setAttribute('aria-current',id===tab);b.append(node('span',tabIcons[id]||'•','nav-icon'),node('span',t(...v),'nav-label'));b.onclick=()=>{closeMobileNav();return go(id)};$('nav').append(b)}paintNotificationBadges();const params=new URLSearchParams();if(tab!=='overview')params.set('tab',tab);if(recordId)params.set('record',recordId);history.replaceState(null,'',location.pathname+(params.toString()?'?'+params:''));$('title').textContent=t(...tabs[tab]);$('portalSubtitle').textContent=t(...(tabSubtitles[tab]||tabSubtitles.overview));$('view').textContent=t('Loading…','جارٍ التحميل…');const root=node('div');try{await paint(root);if(n===sequence){$('view').replaceChildren(root);focusRecord()}}catch(err){if(n===sequence||$('workspace').hidden)notice(errorMessage(err));if(n===sequence)$('view').replaceChildren(retryButton(t('Retry','إعادة المحاولة'),render))}}
  async function open(){
    try {
      const [,access,overview] = await Promise.all([api('admin/history'),api('me/access'),api('admin/dashboard')]);
      managementPermissions = Array.isArray(access.management?.permissions) ? access.management.permissions : [];
      // Administrators inherit every management permission on the backend;
      // mirror that here so an empty explicit grant list never hides tabs.
      managementIsAdmin = access.account_type === 'admin' || access.user?.role === 'admin';
      dashboard = overview;
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
      $('workspace').hidden=false;document.body.classList.add('portal-active');bindPortalShell();
      $('out').hidden=false;
      $('view').replaceChildren(retryButton(t('Retry','إعادة المحاولة'),open));
      return;
    }
    notice('');
$('login').hidden=true;$('bootstrap').hidden=true;$('workspace').hidden=false;document.body.classList.add('portal-active');bindPortalShell();$('out').hidden=false;await render();paintNotificationBadges();paintNotificationCenter();startNotificationPolling()}
  async function sign(form,setup){const f=form.elements;const d=await api(setup?'auth/register':'auth/login',{method:'POST',headers:setup?{'x-admin-setup-key':f.key.value}:{},body:{email:f.email.value,password:f.password.value,...(setup?{consent:true}:{})}});if(setup&&d.user?.role!=='admin')throw Error('forbidden');const destination=window.MZActiveAuth.store(d);form.reset();notice('');if(destination!=='/admin.html'){location.assign(destination);return}await open()}
  for(const id of ['setup','login'])$(id).onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,b=form.querySelector('button[type=submit]');b.disabled=true;try{await sign(form,id==='setup')}catch(err){lock();notice(errorMessage(err))}finally{b.disabled=false}};
  // Normal email recovery is wired by auth-ui.js. The offline owner key now
  // lives only in Account Settings → Security for the administrator.
  bindNotificationCenter();
  $('changePassword').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{await api('auth/change-password',{method:'POST',body:{current_password:f.elements.current_password.value,new_password:f.elements.new_password.value}});f.reset();notice(t('Password changed. Other sessions were signed out.','تم تغيير كلمة المرور. تم تسجيل خروج الجلسات الأخرى.'));refreshNotifications()}catch(err){notice(errorMessage(err))}finally{b.disabled=false}};
  $('out').onclick=async()=>{try{await api('auth/logout',{method:'POST',body:{}})}finally{lock();notice('')}};
  $('language').onclick=()=>lang.set(t('ar','en'),{manual:true});
  document.addEventListener('mzactive:language-change',()=>{staticLabels();if(!$('workspace').hidden)render()});bindToggles();bindPortalShell();staticLabels();
  if(sessionStorage.getItem(key))open();
  api('auth/setup-status').then(d=>{$('bootstrap').hidden=!d.setup_available||!$('workspace').hidden}).catch(()=>{});
})();
