(() => {
  const $ = id => document.getElementById(id);
  const lang = window.MZActiveLanguage, t = (en,ar) => lang.get()==='ar'?ar:en;
  const key = 'mzactive-provider-session';
  const base = window.MZACTIVE_API_BASE;
  const tabs = {overview:['Overview','نظرة عامة'],athletes:['Athletes','الرياضيون'],coaches:['Coaches','المدربون'],pacers:['Pacers','المرافقون'],bookings:['Bookings','الحجوزات'],programs:['Training Programs','برامج التدريب'],messages:['Messages','الرسائل'],community:['Community','المجتمع'],articles:['Articles','المقالات'],trash:['Trash','المهملات'],ai:['AI Brain','المساعد الذكي'],reports:['Reports & Activity','التقارير والنشاط'],settings:['Settings','الإعدادات']};
  const TAB_PERMISSIONS = {athletes:'management.coaches',coaches:'management.coaches',pacers:'management.coaches',bookings:'management.bookings',programs:'management.coaches',messages:'management.coaches',community:'management.community',articles:'management.articles',trash:'management.view',ai:'management.ai',reports:'management.audit',settings:'super_admin'};
  const tabIcons = {overview:'◈',athletes:'♙',coaches:'◎',pacers:'↗',bookings:'▣',programs:'▤',messages:'✉',community:'◍',articles:'▤',trash:'♲',ai:'✦',reports:'↺',settings:'⚙'};
  const tabSubtitles = {
    overview:['Live records and decisions across your permitted areas.','سجلات وقرارات مباشرة ضمن صلاحياتك.'],
    coaches:['Review applications and verified professional credentials.','مراجعة الطلبات وبيانات الاعتماد الموثقة.'],
    pacers:['Review running and cycling Pacer applications and race support requests.','مراجعة طلبات مرافقي الجري وركوب الدراجات وطلبات مرافقة السباقات.'],
    bookings:['Triage requests and confirm approved sessions.','فرز الطلبات وتأكيد الجلسات المعتمدة.'],
    messages:['Conversation metadata only; private message bodies stay protected.','بيانات المحادثات فقط؛ تبقى نصوص الرسائل الخاصة محمية.'],
    athletes:['Searchable athlete CRM with consent-based coaching actions.','دليل رياضي قابل للبحث مع إجراءات تدريب قائمة على الموافقة.'],
    programs:['Review live training programs and athlete access links.','مراجعة برامج التدريب المباشرة وصلات وصول الرياضيين.'],
    community:['Moderate groups, reports, posts, comments and achievements.','مراجعة المجتمعات والبلاغات والمنشورات والتعليقات والإنجازات.'],
    articles:['Publish or return coach-written articles.','نشر مقالات المدربين أو إعادتها للتعديل.'],
    ai:['Review assistive drafts before any decision takes effect.','راجع المسودات المساعدة قبل تنفيذ أي قرار.'],
    trash:['Recover accounts moved to Trash. No data is permanently erased.','استعادة الحسابات المنقولة إلى المهملات. لا تُحذف البيانات نهائياً.'],
    reports:['Audit trails, authentication events and management decisions.','سجلات التدقيق وأحداث الدخول وقرارات الإدارة.'],
    settings:['Super-admin controls for delegated management permissions.','أدوات المسؤول الأعلى لصلاحيات الإدارة المفوّضة.'],
  };
  const labels = {operations:['Operations manager','مدير العمليات'],monitoring:['Website monitoring','مراقبة الموقع'],analytics:['Business analytics','تحليل الأعمال'],growth:['Growth and strategy','النمو والاستراتيجية'],marketing:['Marketing','التسويق'],community:['Community planning','تخطيط المجتمع'],support:['Customer support','دعم العملاء'],
    received:['Received','تم الاستلام'],reviewing:['Under review','قيد المراجعة'],accepted:['Confirmed','مؤكد'],cancelled:['Cancelled','ملغى'],declined:['Declined','مرفوض'],approved:['Approved','معتمد'],rejected:['Rejected','مرفوض'],pending:['Pending','قيد الانتظار'],published:['Published','منشور'],completed:['Completed','مكتمل'],failed:['Failed','فشل'],running:['Running','قيد التنفيذ'],run_completed:['AI analysis completed','اكتمل التحليل الذكي'],scheduled_snapshot_completed:['Data collected','تم جمع البيانات'],run_failed:['Analysis failed','فشل التحليل'],program_assigned:['Program assigned','تم ربط البرنامج'],run_started:['Analysis started','بدأ التحليل'],post:['Update','تحديث'],event:['Event','فعالية'],group_session:['Group session','جلسة جماعية'],challenge:['Challenge','تحدٍ'],hidden:['Hidden','مخفي'],owner:['Owner','المالك'],coach:['Sports Coach','مدرب رياضي'],bodybuilding_coach:['Bodybuilding Coach','مدرب كمال الأجسام'],pacer:['Champion Pacer','مرافق جري'],nutritionist:['Nutrition & Dietetics','التغذية والحميات الغذائية'],physiotherapist:['Physiotherapy','العلاج الطبيعي'],sports_massage_therapist:['Sports Massage','التدليك الرياضي'],certificate:['Certificate','شهادة'],license_number:['License number','رقم الترخيص'],license_issuer:['License issuer','جهة الترخيص'],issuer:['Issuer','الجهة المصدرة'],number:['Number','الرقم'],country:['Country','الدولة'],expiry:['Expiry','الانتهاء'],identity:['Identity and qualifications verified','تم التحقق من الهوية والمؤهلات'],license_required:['Professional license verified','تم التحقق من الترخيص المهني'],license_note:['License review note','ملاحظة مراجعة الترخيص'],previous_note:['Previous review note','ملاحظة المراجعة السابقة'],assigned:['Assigned','معين'],unassigned:['Unassigned','غير معين'],invitation_pending:['Invitation pending','دعوة معلقة'],onboarding_incomplete:['Onboarding incomplete','الملف غير مكتمل'],email_failed:['Invitation email failed','فشل إرسال الدعوة'],email_sent:['Invitation email sent','تم إرسال الدعوة'],sent:['Sent','تم الإرسال'],coach_invited:['Coach invited','تمت دعوة مدرب'],profile_invited:['Profile invitation sent','تم إرسال دعوة الملف'],coach_reassigned:['Coach reassignment requested','تم طلب تغيير المدرب'],coach_revoked:['Coach revoked','تم إلغاء المدرب'],coach_invite_accepted:['Coach invitation accepted','تم قبول دعوة المدرب'],coach_invite_declined:['Coach invitation declined','تم رفض دعوة المدرب'],profile_invite_accepted:['Profile invitation accepted','تم قبول دعوة الملف'],invitation_resent:['Invitation resent','تمت إعادة إرسال الدعوة'],not_provided:['Not provided','غير متوفر'],view_profile:['View profile','عرض الملف'],recommend_coach:['Recommend coach','اقتراح مدرب'],invite_profile:['Invite to complete profile','دعوة لإكمال الملف'],view_programs:['View programs','عرض البرامج'],view_bookings:['View bookings','عرض الحجوزات'],revoke_coach:['Revoke coach','إلغاء المدرب'],reassign_coach:['Reassign coach','تغيير المدرب'],send_invitation:['Send invitation','إرسال الدعوة'],resend_invitation:['Resend invitation','إعادة إرسال الدعوة'],why_recommended:['Why this recommendation','سبب هذا الاقتراح'],no_recommendations:['No approved coaches match the verified profile details yet.','لا يوجد مدربون معتمدون يتطابقون مع بيانات الملف الموثقة بعد.'],no_programs:['No training programs have been assigned.','لم تُربط أي برامج تدريبية.'],no_bookings:['No booking requests are linked to this account.','لا توجد طلبات حجز مرتبطة بهذا الحساب.'],no_invitations:['No invitations have been sent yet.','لم تُرسل أي دعوات بعد.'],no_audit:['No consent or assignment changes have been recorded.','لم تُسجل أي تغييرات في الموافقة أو التعيين.'],athlete_directory:['Athlete directory','دليل الرياضيين'],search_athletes:['Search athletes (name, email, sport…)','ابحث عن الرياضيين (الاسم، البريد، الرياضة…)'],all_athletes:['All athletes','جميع الرياضيين'],active:['Active','نشط'],inactive:['Inactive','غير نشط'],assigned_coaches:['Assigned coach','المدرب المعين'],last_activity:['Last activity','آخر نشاط'],sports:['Sports','الرياضات'],goals:['Goals','الأهداف'],city:['City','المدينة'],language:['Preferred language','اللغة المفضلة'],availability:['Availability','الأوقات المناسبة'],experience:['Experience level','مستوى الخبرة'],age_range:['Age range','الفئة العمرية'],gender:['Gender','الجنس'],programs_count:['Programs','البرامج'],bookings_count:['Bookings','الحجوزات'],invitation_status:['Invitation status','حالة الدعوة'],invitation_email:['Invitation email','بريد الدعوة'],refresh:['Refresh','تحديث'],clear_filters:['Clear filters','مسح عوامل التصفية'],select_coach:['Select an approved coach','اختر مدرباً معتمداً'],approve_and_invite:['Review and send invitation','راجع وأرسل الدعوة'],consent_notice:['The athlete decides. No workspace opens and nothing is shared until they accept.','الرياضي هو من يقرر. لا تُفتح مساحة ولا تتم مشاركة أي بيانات قبل قبوله.'],ai_disclaimer:['Assistive suggestions from verified profile fields only. No medical advice, diagnosis or licensed-coach claim.','اقتراحات مساعدة من حقول الملف الموثقة فقط. لا تشخيص طبي أو ادعاء بأن المدرب مرخص.'],ai_recommendations:['AI recommendations','توصيات الذكاء الاصطناعي'],next_steps:['Safe next steps','الخطوات التالية الآمنة'],outreach_draft:['Outreach draft (requires approval)','مسودة تواصل (تتطلب الموافقة)'],audit_history:['Consent and assignment history','سجل الموافقة والتعيين'],coach_workspaces:['Coach workspaces','مساحات المدربين'],messages:['Messages','الرسائل'],recommendation_score:['Match score','درجة التطابق'],viewing_profile:['Showing verified athlete profile.','عرض الملف الرياضي الموثق.'],opening_programs:['Opening assigned programs…','فتح البرامج المخصصة…'],opening_bookings:['Opening linked bookings…','فتح الحجوزات المرتبطة…'],programs_ready:['Programs section ready.','قسم البرامج جاهز.'],bookings_ready:['Bookings section ready.','قسم الحجوزات جاهز.'],manage_account:['Manage account','إدارة الحساب'],managing_account:['Showing account controls. This area is separate from the public profile.','عرض أدوات الحساب. هذا القسم منفصل عن الملف العام.'],account_suspended:['Account suspended','تم تعليق الحساب'],account_reactivated:['Account reactivated','تمت إعادة تفعيل الحساب'],account_deleted:['Account deleted and anonymized','تم حذف الحساب وإخفاء بياناته'],coach_application_opened:['Coach application opened','تم فتح طلب المدرب']};
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
  let trashFilter='all', athleteDirectory=null, athleteFilter='all', athleteSort='recent', athleteTimer=null, athleteDialog=null, openedAthleteRecord='';
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
  function errorMessage(err){const code=err?.message||'',messages={service_unavailable:['The service is temporarily unavailable. Please try again shortly.','الخدمة غير متاحة مؤقتاً. يرجى المحاولة بعد قليل.'],invalid_credentials:['That email or password is incorrect. Use the administrator email registered for this portal.','البريد أو كلمة المرور غير صحيحة. استخدم بريد المسؤول المسجل لهذه البوابة.'],unauthorized:['Your session has expired. Please sign in again.','انتهت جلستك. يرجى تسجيل الدخول مجدداً.'],forbidden:['An administrator account is required for this action.','يلزم حساب مسؤول لتنفيذ هذا الإجراء.'],rate_limited:['Too many attempts. Wait a minute and try again.','محاولات كثيرة. انتظر دقيقة ثم حاول مجدداً.'],origin_not_allowed:['This site address is not authorized. Open the portal from https://mzactive.com.','عنوان الموقع هذا غير مصرح به. افتح البوابة من https://mzactive.com.'],request_failed:['The service returned an unexpected response. Try again shortly.','عادت الخدمة باستجابة غير متوقعة. حاول بعد قليل.'],athlete_not_found:['This athlete account was not found. Refresh the directory.','لم يتم العثور على حساب الرياضي. حدّث دليل الرياضيين.'],coach_unavailable:['That approved coach is no longer available. Review the suggestions again.','لم يعد المدرب المعتمد متاحاً. راجع الاقتراحات مجدداً.'],invitation_exists:['A pending invitation already exists for this coach.','توجد دعوة معلقة بالفعل لهذا المدرب.'],assignment_exists:['This athlete already has an active coach. Revoke or reassign first.','لدى هذا الرياضي مدرب نشط بالفعل. ألغِ التعيين أو غيّره أولاً.'],no_active_assignment:['There is no active assignment to revoke.','لا يوجد تعيين نشط لإلغائه.'],active_assignment_exists:['The athlete already accepted another active workspace.','قبل الرياضي مساحة نشطة أخرى بالفعل.'],invitation_unavailable:['This invitation can no longer be changed.','لم يعد ممكناً تعديل هذه الدعوة.'],invitation_expired:['This invitation link has expired.','انتهت صلاحية رابط الدعوة.'],invitation_not_pending:['Only a pending invitation can be resent.','يمكن إعادة إرسال الدعوات المعلقة فقط.'],email_unavailable:['The invitation was saved but email delivery is unavailable. Retry after checking delivery.','حُفظت الدعوة لكن إرسال البريد غير متاح. أعد المحاولة بعد التحقق من الإرسال.'],connection_error:['Could not reach the service. Check your connection and try again.','تعذر الاتصال بالخدمة. تحقق من اتصالك وحاول مجدداً.'],invalid_recovery:['The email or recovery key is incorrect, or no administrator account matches it.','البريد أو مفتاح الاستعادة غير صحيح، أو لا يوجد حساب مسؤول مطابق.'],recovery_unavailable:['Password recovery is not configured. Contact the account owner.','استعادة كلمة المرور غير مهيأة. تواصل مع صاحب الحساب.'],photo_too_large:['Use a JPG, PNG or WebP image up to 1 MB.','استخدم صورة JPG أو PNG أو WebP بحجم أقصى ١ ميغابايت.'],invalid_photo:['Choose a valid JPG, PNG or WebP image. The existing photo was kept.','اختر صورة JPG أو PNG أو WebP صالحة. تم الاحتفاظ بالصورة الحالية.'],photo_not_found:['No photo has been uploaded for this coach.','لم يتم رفع صورة لهذا المدرب بعد.'],invalid_password:['Use a new password of at least 12 characters.','استخدم كلمة مرور جديدة من ١٢ حرفاً على الأقل.'],current_password_incorrect:['Your current password is incorrect.','كلمة المرور الحالية غير صحيحة.'],admin_setup_required:['The setup key is missing or incorrect.','مفتاح الإعداد مفقود أو غير صحيح.'],admin_already_exists:['An administrator account already exists.','يوجد بالفعل حساب مسؤول.'],admin_setup_unavailable:['This email is not authorized for setup.','هذا البريد غير مصرح له بالإعداد.'],invalid_registration:['Check the email, password and consent, then try again.','تحقق من البريد وكلمة المرور والموافقة ثم حاول مجدداً.'],provider_removed_by_owner:['This account has been suspended by the owner.','تم تعليق هذا الحساب من قِبل المالك.'],intake_paused:['Registration is paused.','التسجيل متوقف مؤقتاً.'],account_already_exists_or_storage_error:['The account could not be saved. Try a different email.','تعذر حفظ الحساب. جرّب بريداً مختلفاً.'],daily_limit_reached:['Daily AI allowance reached.','تم بلوغ الحد اليومي للتحليل.'],assistant_unavailable:['AI analysis failed. Check the task history.','تعذر التحليل. راجع سجل المهام.'],assistant_format_error:['The AI draft could not be formatted. Try again.','تعذر تنسيق المسودة الذكية. حاول مجدداً.'],profile_changed_reload_review:['This profile changed. Refresh before reviewing.','تغير الملف. حدّث البيانات قبل المراجعة.'],coach_profile_incomplete:['The coach must complete their biography and specialties first.','يجب إكمال النبذة والتخصصات أولاً.'],professional_license_incomplete:['Provide qualifications, services and license details, then confirm verification.','أدخل المؤهلات والخدمات وبيانات الترخيص، ثم أكد التحقق.'],invalid_session_for_provider:['This session type is not available for the selected professional.','نوع الجلسة غير متاح لهذا المختص.'],service_required:['Choose a service offered by this professional.','اختر خدمة يقدمها هذا المختص.'],account_not_found:['This account was not found. Refresh the list.','لم يتم العثور على هذا الحساب. حدّث القائمة.'],account_not_eligible:['This account cannot be changed to a coach application.','لا يمكن تحويل هذا الحساب إلى طلب مدرب.'],coach_application_exists:['This account already has a professional profile.','لدى هذا الحساب ملف مهني بالفعل.'],invalid_profile_type:['Choose a valid professional category.','اختر فئة مهنية صحيحة.'],account_protected:['Administrator accounts cannot be suspended or deleted here.','لا يمكن تعليق حسابات المسؤولين أو حذفها من هنا.'],account_not_active:['The account is not active. Reactivate it first.','الحساب غير نشط. أعد تفعيله أولاً.'],account_not_suspended:['Only a suspended account can be reactivated.','يمكن إعادة تفعيل الحسابات المعلقة فقط.'],account_already_deleted:['This account has already been deleted.','تم حذف هذا الحساب بالفعل.'],confirmation_required:['Type the account email and DELETE to confirm.','اكتب بريد الحساب وكلمة DELETE للتأكيد.'],admin_required:['A full administrator account is required for account changes.','يلزم حساب مسؤول كامل لإجراء تغييرات الحساب.'],account_unavailable:['This account is not available. Contact the administrator.','هذا الحساب غير متاح. تواصل مع المسؤول.'],unknown_account_action:['That account action is not supported.','هذا الإجراء غير مدعوم للحساب.'],reason_required:['A moderation reason is required for this action.','يلزم سبب للرقابة لتنفيذ هذا الإجراء.'],profile_already_hidden:['This public profile is already hidden.','هذا الملف العام مخفي بالفعل.'],profile_not_hidden:['This profile is already public.','هذا الملف عام بالفعل.']};const detail=err?.detail?' · '+err.detail:'';
  if(!code||/fetch|network|load failed/i.test(code))return t(...messages.connection_error)+detail;return t(...(messages[code]||['The request could not be completed. Refresh and try again.','تعذر إتمام الطلب. حدّث الصفحة وحاول مجدداً.']))+detail}
  function confirmTrash(name) {
    return new Promise(resolve => {
      const dialog=node('dialog');dialog.className='crm-dialog trash-dialog';
      dialog.append(node('h3',t('Move to Trash','نقل إلى المهملات')));
      dialog.append(node('p',t('Move this account to Trash? You can undo or restore it later.','نقل هذا الحساب إلى المهملات؟ يمكنك التراجع أو استعادته لاحقاً.')));
      dialog.append(node('p',name,'trash-dialog-name'));
      const reason=node('input');reason.type='text';reason.maxLength=300;
      reason.placeholder=t('Reason (optional)','السبب (اختياري)');reason.setAttribute('aria-label',reason.placeholder);
      const label=node('label',t('Deletion reason','سبب الحذف'));label.append(reason);
      const actions=node('div',null,'crm-actions');
      const cancel=button(t('Cancel','إلغاء'),()=>{dialog.close();resolve(null)});
      cancel.className='btn ghost';
      const confirm=button(t('Move to Trash','نقل إلى المهملات'),()=>{dialog.close();resolve({reason:reason.value.trim()})});
      actions.append(cancel,confirm);dialog.append(label,actions);
      dialog.addEventListener('cancel',()=>resolve(null));
      document.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove());
    });
  }
  function undoToast(message, undo) {
    const toast=node('div',null,'admin-toast');toast.setAttribute('role','status');
    toast.append(node('span',message));
    const btn=button(t('Undo','تراجع'),async()=>{await undo();toast.remove()});
    btn.className='btn ghost';toast.append(btn);
    document.body.append(toast);
    setTimeout(()=>toast.remove(),9000);
  }
  function quickMenu(items) {
    const wrap=node('span',null,'quick-menu');
    const trigger=node('button','⋯','quick-menu-trigger');trigger.type='button';
    trigger.setAttribute('aria-label',t('Quick actions','إجراءات سريعة'));trigger.setAttribute('aria-expanded','false');
    const list=node('span',null,'quick-menu-list');list.hidden=true;
    trigger.onclick=e=>{e.stopPropagation();list.hidden=!list.hidden;trigger.setAttribute('aria-expanded',String(!list.hidden))};
    for(const item of items){
      const b=node('button',item.label,'quick-menu-item');b.type='button';
      b.onclick=e=>{e.stopPropagation();list.hidden=true;item.onClick()};list.append(b);
    }
    document.addEventListener('click',()=>{list.hidden=true;trigger.setAttribute('aria-expanded','false')},{once:true});
    wrap.append(trigger,list);return wrap;
  }
  async function trashAccount(id, name, after) {
    const choice=await confirmTrash(name);if(!choice)return;
    await api('admin/accounts/'+encodeURIComponent(id)+'/trash',{method:'POST',body:{reason:choice.reason}});
    undoToast(t('Moved to Trash.','تم النقل إلى المهملات.'),async()=>{
      await api('admin/accounts/'+encodeURIComponent(id)+'/restore',{method:'POST',body:{undo:true}});
      await after();
    });
    await after();
  }

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
    $('settingsNav').onclick=()=>{closeMobileNav();return go('settings')};
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
  function cvLink(c,p){
    if(!p.has_cv)return;
    const a=link(t('View Sports CV (private)','عرض السيرة الذاتية الرياضية (خاصة)'),'#');
    a.addEventListener('click',async ev=>{
      ev.preventDefault();
      try{
        const token=sessionStorage.getItem(key);
        const r=await fetch(base+'/api/admin/providers/'+encodeURIComponent(p.id)+'/cv',{headers:{authorization:'Bearer '+token},cache:'no-store'});
        if(!r.ok)throw Error('request_failed');
        const url=URL.createObjectURL(await r.blob());
        const download=node('a');download.href=url;download.download=p.cv_file_name||'sports-cv';download.click();
        setTimeout(()=>URL.revokeObjectURL(url),60000);
      }catch(e){notice(errorMessage(e),'error')}
    });
    c.append(a);
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
  function stateName(value){return name(String(value||'').replaceAll('_',' '))}
  async function completenessIndicator(p,tag){
    try{
      const data=await api('admin/coaches/'+encodeURIComponent(p.id)+'/completeness');
      const c=data.completeness||{};
      tag.textContent=t('Completeness: ','اكتمال الملف: ')+c.percent+'%';
      tag.classList.toggle('is-incomplete',!c.complete);
      tag.title=(c.required||[]).length?t('Missing required: ','ناقص مطلوب: ')+c.required.join(', '):t('All required fields are complete.','كل الحقول المطلوبة مكتملة.');
      return c;
    }catch{tag.textContent=t('Completeness unavailable','اكتمال الملف غير متاح');return null}
  }
  async function contactTools(root,p){
    const box=node('section',null,'contact-tools');
    box.append(node('h4',t('Contact management','إدارة التواصل')));
    const config=await api('admin/contact-config').catch(()=>({contact:{configured:false},email_delivery:false}));
    const setup=node('p',t('Management email and WhatsApp must be configured by the platform before contact links are shown. No personal contact details are hard-coded in this portal.','يجب إعداد بريد الإدارة وواتساب المنصة قبل عرض روابط التواصل. لا توجد بيانات اتصال شخصية مكتوبة في هذه البوابة.'),'contact-setup-note');
    if(!config.contact?.configured){setup.classList.add('contact-missing');box.append(setup)}
    else box.append(node('small',t('Configured channels: ','القنوات المعدة: ')+[config.contact.email_configured?'email':'',config.contact.whatsapp_configured?'WhatsApp':''].filter(Boolean).join(' · '),'contact-config'));
    const purpose=node('select');purpose.setAttribute('aria-label',t('Reason','السبب'));
    for(const [code,en,ar] of [['profile_support','Profile support','دعم الملف'],['bookings','Bookings','الحجوزات'],['programs','Programs','البرامج'],['technical_issue','Technical issue','مشكلة تقنية'],['other','Other','أخرى']]){const o=node('option',t(en,ar));o.value=code;purpose.append(o)}
    const message=node('textarea');message.rows=3;message.maxLength=4000;message.placeholder=t('Write the message for this coach','اكتب الرسالة لهذا المدرب');message.setAttribute('aria-label',message.placeholder);
    const statusLine=node('small',t('No contact recorded yet.','لا يوجد سجل تواصل بعد.'),'contact-state');
    const refresh=async()=>{
      const data=await api('admin/coaches/'+encodeURIComponent(p.id)+'/contacts').catch(()=>({contacts:[]}));
      const latest=data.contacts?.[0];
      statusLine.textContent=latest
        ? t('Last contact: ','آخر تواصل: ')+stateName(latest.status)+' · '+date(latest.created_at)
        : t('No contact recorded yet.','لا يوجد سجل تواصل بعد.');
      statusLine.dataset.state=latest?.status||'none';
      return latest;
    };
    const prepare=(channel,intent)=>async()=>{
      const body={channel,purpose:purpose.value,message:message.value.trim(),intent};
      if(!body.message){notice(t('Write a message first.','اكتب الرسالة أولاً.'));return}
      const result=await api('admin/coaches/'+encodeURIComponent(p.id)+'/contacts',{method:'POST',body});
      if(result.link){
        const open=window.open(result.link,'_blank','noopener,noreferrer');
        if(!open)notice(t('Open the prepared message from the blocked-popup link.','افتح الرسالة المعدة من رابط النافذة المحجوبة.'));
      }
      notice(t('Draft saved. Status: ','حُفظت المسودة. الحالة: ')+stateName(result.status),'success');
      await refresh();
    };
    const mark=status=>async()=>{
      const latest=await refresh();
      if(!latest){notice(t('Prepare a contact first.','جهّز وسيلة تواصل أولاً.'));return}
      await api('admin/contacts/'+encodeURIComponent(latest.id),{method:'PATCH',body:{status}});
      await refresh();notice(t('Status updated to ','تم تحديث الحالة إلى ')+stateName(status),'success');
    };
    const controls=node('div',null,'contact-controls');
    controls.append(button(t('Prepare email','إعداد بريد'),prepare('email','prepare')),button(t('Prepare WhatsApp','إعداد واتساب'),prepare('whatsapp','prepare')));
    if(config.email_delivery)controls.append(button(t('Send email','إرسال بريد'),prepare('email','send')));
    controls.append(button(t('Mark opened','تحديد كمفتوح'),mark('opened')),button(t('Mark sent','تحديد كمرسل'),mark('confirmed_sent')),button(t('Complete','إكمال'),mark('completed')));
    box.append(purpose,message,controls,statusLine);
    root.append(box);
    await refresh();
  }
  async function momoFollowups(root){
    const intro=node('p',t('Momo prepares rule-based profile follow-up drafts only. Nothing is sent automatically; every draft needs a human decision.','يجهّز Momo مسودات متابعة ملفات بقواعد ثابتة فقط. لا يُرسل أي شيء تلقائياً؛ كل مسودة تحتاج قراراً بشرياً.'),'momo-note');
    root.append(intro);
    const data=await api('admin/momo-followups').catch(()=>({followups:[]}));
    if(!(data.followups||[]).length){root.append(node('p',t('No open follow-ups.','لا توجد متابعات مفتوحة.'),'muted'));return}
    const list=node('div',null,'momo-list');root.append(list);
    for(const f of data.followups){
      const c=card(list,[f.coach_name,f.priority].filter(Boolean).join(' · '),f.message,f.id);
      c.append(node('small',t('Status: ','الحالة: ')+stateName(f.status)+' · '+t('Attempts: ','المحاولات: ')+Number(f.attempt_count||0),'momo-state'));
      if((f.missing_fields||[]).length)c.append(node('small',t('Missing: ','ناقص: ')+f.missing_fields.join(', '),'momo-missing'));
      c.append(button(t('Send approved email','إرسال بريد بعد الموافقة'),()=>save('admin/momo-followups/'+encodeURIComponent(f.id)+'/contact',{})));
      c.append(button(t('Dismiss','تجاهل'),()=>save('admin/momo-followups/'+encodeURIComponent(f.id)+'/dismiss',{})));
    }
  }
  async function aiCoachSettings(root){
    const data=await api('admin/ai/settings').catch(()=>null);
    if(!data)return;
    const box=node('section','ai-coach-settings');
    box.append(node('h3',t('MZA AI Coach controls','ضوابط مساعد MZA الذكي')));
    box.append(node('p',t('AI drafts are never saved automatically. Athletes approve their own plans; coach-managed plans always require the coach. Local mode makes no paid or third-party AI calls.','لا تُحفظ مسودات الذكاء الاصطناعي تلقائياً. يعتمد الرياضيون خططهم بأنفسهم، بينما تتطلب خطط المدرب موافقته دائماً. لا يُجري الوضع المحلي مكالمات ذكاء اصطناعي مدفوعة أو خارجية.'),'muted'));
    const settings=Object.fromEntries((data.settings||[]).map(item=>[item.key,item]));
    for(const [code,label] of [['athlete_coach_enabled',['Athlete AI Coach','مساعد الرياضي الذكي']],['coach_planner_enabled',['Coach AI planner','مخطط المدرب الذكي']]]){
      const wrap=node('label','ai-coach-toggle'),input=document.createElement('input');
      input.type='checkbox';input.checked=settings[code]?.value==='true';input.dataset.aiSetting=code;
      input.addEventListener('change',async()=>{try{await api('admin/ai/settings',{method:'PATCH',body:{[code]:input.checked}});notice(t('AI setting updated.','تم تحديث إعداد الذكاء الاصطناعي.'),'success')}catch(error){input.checked=!input.checked;notice(error.message)}});
      wrap.append(input,document.createTextNode(' '+t(...label)));box.append(wrap);
    }
    const drafts=(data.drafts||[]).map(item=>name(item.status)+': '+item.count).join(' · ');
    box.append(node('p',t('Draft status: ','حالة المسودات: ')+(drafts||'—'),'muted'));
    box.append(node('p',t('Recent AI usage: ','الاستخدام الأخير: ')+(data.usage||[]).slice(0,3).map(item=>item.usage_date+' ('+item.request_count+')').join(' · ')||'—','muted'));
    root.append(box);
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
      const pacer=p.pacer_details||{};
      const pacerLines=p.provider_type==='pacer'?[
        pacer.sports?.length?t('Sports','الرياضات')+': '+pacer.sports.map(name).join(', '):'',
        pacer.services?.length?t('Services','الخدمات')+': '+pacer.services.map(name).join(', '):'',
        pacer.distances?.length?t('Distances','المسافات')+': '+pacer.distances.join(', '):'',
        pacer.running_pace?t('Running pace','وتيرة الجري')+': '+pacer.running_pace:'',
        pacer.cycling_speed?t('Cycling speed','سرعة الدراجات')+': '+pacer.cycling_speed:'',
        pacer.achievements?t('Achievements','الإنجازات')+': '+pacer.achievements:'',
        pacer.personal_bests?t('Personal bests','الأرقام القياسية الشخصية')+': '+pacer.personal_bests:'',
        pacer.hourly_rate_qar?pacer.hourly_rate_qar+' '+t('QAR/hour','ريال/ساعة'):'',
        pacer.race_rate_qar?pacer.race_rate_qar+' '+t('QAR/race','ريال/سباق'):'',
        pacer.service_areas?t('Service areas','مناطق الخدمة')+': '+pacer.service_areas:'',
        pacer.availability?t('Availability','التوفر')+': '+pacer.availability:'',
      ]:[];
      const parts=[p.bio,...(parse(p.specialties_json)||[]),...(parse(p.languages_json)||[]),p.qualifications,...(parse(p.services_json)||[]),p.coaching_mode,p.experience_years? p.experience_years+' '+t('years','سنوات'):'',p.indicative_rate_qar? p.indicative_rate_qar+' QAR':'',p.whatsapp_public?p.whatsapp_number:'',...(parse(p.social_links_json)||[]),...pacerLines,...credentialLines];
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
      const profilePath=p.provider_type==='pacer'?'pacer.html?provider='+encodeURIComponent(p.id):'coach.html?id='+encodeURIComponent(p.id);
      const publicLink=link(t('Public profile','الملف العام'),profilePath);publicLink.target='_blank';publicLink.rel='noopener noreferrer';c.append(publicLink);
      const line=emailStatusLine(p);if(line)c.append(line);
    }
    if(status==='rejected'||status==='removed'){
      if(p.review_note)c.append(node('p',p.review_note));
      const line=emailStatusLine(p);if(line)c.append(line);
    }
    if(status==='approved'||status==='removed'||status==='pending'){
      contactTools(c,p).catch(()=>{});
    }
    if(status==='approved'||status==='removed'){
      const restore=status==='removed';
      c.append(button(restore?t('Restore access','استعادة الوصول'):t('Suspend access','تعليق الوصول'),()=>{
        if(confirm(t('Change access for ','تغيير صلاحية الوصول لـ ')+p.display_name+'؟'))return review(p,restore?'approved':'suspended',restore?{verified:true,license_verified:licensed?true:undefined}:{});
      }));
    }
    if(status!=='removed'&&status!=='rejected'){upload(c,p);upload(c,p,'cover',t('Upload or replace cover (1 MB)','رفع صورة الغلاف أو استبدالها (١ ميغابايت)'))}
    if(p.submission_state==='draft')c.append(node('small',t('Draft — not yet submitted for review.','مسودة — لم تُرسل للمراجعة بعد.')));
    if(p.has_cv)cvLink(c,p);
    mountManageAccount(c,p.user_id,{name:p.display_name,city:p.city,country:p.country},()=>{applications=null;return render()});
    details.append(c);
  }
  function coachCard(root,p,status){
    const details=node('details',null,'coach-card'),summary=node('summary',null,'coach-summary');
    details.dataset.recordId=p.id;
    summary.append(avatar(p.display_name),node('span',p.display_name,'coach-name'));
    if(p.user_id&&managementIsAdmin)summary.append(quickMenu([
      {label:t('View profile','عرض الملف'),onClick:()=>{details.open=true}},
      {label:t('Move to Trash','نقل إلى المهملات'),onClick:()=>trashAccount(p.user_id,p.display_name,()=>{applications=null;return render()})},
    ]));
    const meta=node('span',[name(p.provider_type),[p.city,p.country].filter(Boolean).join(', '),p.email].filter(Boolean).join(' · '),'coach-meta');
    summary.append(meta,badge(status==='removed'?'suspended':status,status==='pending'&&!p.profile_complete?'incomplete':''));
    if(status==='pending'&&!p.profile_complete)summary.append(node('small',t('Incomplete','غير مكتمل'),'incomplete-tag'));
    const mail=emailStatusLine(p);if(mail)summary.append(mail);
    const completeness=node('small',t('Completeness: —','اكتمال الملف: —'),'completeness-tag');
    summary.append(completeness);
    completenessIndicator(p,completeness).then(result=>{
      if(result)completeness.textContent=t('Completeness: ','اكتمال الملف: ')+result.percent+'%';
    }).catch(()=>{});
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
  function renderCoaches(root,onlyType){
    if(!applications){root.append(node('p',t('Loading applications…','جارٍ تحميل الطلبات…')));return}
    const matching=list=>(list||[]).filter(p=>!onlyType||p.provider_type===onlyType);
    const all={pending:matching(applications.providers).filter(p=>p.profile_complete),incomplete:matching(applications.providers).filter(p=>!p.profile_complete),approved:matching(applications.approved_providers),rejected:[...matching(applications.rejected_providers),...matching(applications.suspended_providers)]};
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
  function booking(root,b){const c=card(root,b.customer_name,[name(b.status),b.provider_type?name(b.provider_type):'',b.coach_name,b.city,b.preferred_date,b.customer_phone,b.customer_email,b.session_type,b.service_name,b.distance,b.target_pace,b.program_duration_months?b.program_duration_months+' '+t('months','أشهر'):'',b.goal_summary].filter(Boolean).join(' · '),b.id);const actions={reviewing:['Review','بدء المراجعة'],accepted:['Confirm booking','تأكيد الحجز'],declined:['Decline','رفض'],cancelled:['Cancel booking','إلغاء الحجز']};for(const status of ({received:['reviewing','accepted','declined','cancelled'],reviewing:['accepted','declined','cancelled'],accepted:['cancelled']}[b.status]||[])){c.append(button(t(...actions[status]),()=>{if(status!=='reviewing'&&!confirm(t(...actions[status])+'؟'))return;return save('admin/bookings/'+b.id,{status})}))}  const rawPhone=String(b.customer_phone||'').replace(/[\s().-]/g,'');
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
    const sport=node('select');sport.setAttribute('aria-label',t('Sport','الرياضة'));for(const code of ['','running','walking','cycling','swimming','strength','boxing','kickboxing','padel','football','other']){const o=node('option',code||t('General','عام'));o.value=code;sport.append(o)}
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
  const communityStatusName = code => ({
    active:t('Active','نشط'), suspended:t('Suspended','موقوف'), removed:t('Removed','محذوف'),
    open:t('Open','مفتوح'), reviewed:t('Reviewed','تمت المراجعة'), dismissed:t('Dismissed','مرفوض'), actioned:t('Actioned','تم اتخاذ إجراء'),
  })[code] || name(code);
  async function communityGroupsSection(root){
    root.append(node('h3',t('Community groups','مجتمعات المجتمع')));
    const filters=node('div','grid'),groups=node('div','grid');
    const search=node('input');search.type='search';search.maxLength=100;search.placeholder=t('Search by name, sport or location','ابحث بالاسم أو الرياضة أو المكان');
    const status=node('select');status.setAttribute('aria-label',t('Community status','حالة المجتمع'));
    for(const code of ['','active','suspended','removed']){const option=node('option',code?communityStatusName(code):t('All statuses','كل الحالات'));option.value=code;status.append(option)}
    const filter=node('label',t('Find communities','ابحث عن مجتمعات'));filter.append(search,status);
    filters.append(filter);
    root.append(filters,groups);
    async function load(){
      const params=new URLSearchParams();if(search.value.trim())params.set('q',search.value.trim());if(status.value)params.set('status',status.value);
      const data=await api('admin/communities'+(params.size?'?'+params:''));
      groups.replaceChildren();
      if(!(data.communities||[]).length){groups.append(node('p',t('No communities match these filters.','لا توجد مجتمعات مطابقة.'),'muted'));return}
      for(const item of data.communities){
        const c=card(groups,item.name,[item.sport,item.location,communityStatusName(item.status),`${item.member_count||0} ${t('members','أعضاء')}`,item.open_reports?`${item.open_reports} ${t('open reports','بلاغات مفتوحة')}`:''].filter(Boolean).join(' · '),item.id);
        c.append(node('p',String(item.description||'').slice(0,180)));
        const linkToCommunity=link(t('Open community','افتح المجتمع'),'community.html?community='+encodeURIComponent(item.id));linkToCommunity.target='_blank';linkToCommunity.rel='noopener noreferrer';c.append(linkToCommunity);
        if(item.status!=='active')c.append(button(t('Restore','استعادة'),async()=>{await api('admin/communities/'+item.id,{method:'PATCH',body:{status:'active'}});notice(t('Community restored.','تمت استعادة المجتمع.'),'success');await load()}));
        if(item.status==='active'||item.status==='suspended')c.append(button(t('Suspend','إيقاف'),async()=>{const reason=window.prompt(t('Reason for suspension (optional)','سبب الإيقاف (اختياري)'),'');if(reason===null)return;await api('admin/communities/'+item.id,{method:'PATCH',body:{status:'suspended',reason}});notice(t('Community suspended.','تم إيقاف المجتمع.'),'success');await load()}));
        if(managementIsAdmin)c.append(button(t('Remove','حذف'),async()=>{const reason=window.prompt(t('Reason for removal (required)','سبب الحذف (مطلوب)'),'');if(!reason)return;if(!confirm(t('Remove this community permanently from public access?','إزالة هذا المجتمع نهائياً من الوصول العام؟')))return;await api('admin/communities/'+item.id,{method:'PATCH',body:{status:'removed',reason}});notice(t('Community removed.','تم حذف المجتمع.'),'success');await load()}));
        const audit=node('div');audit.hidden=true;c.append(audit);
        c.append(button(t('Audit history','سجل التدقيق'),async()=>{const data=await api('admin/communities/'+item.id+'/audit');audit.hidden=false;audit.replaceChildren(...(data.audit||[]).map(entry=>node('p',[date(entry.created_at),communityStatusName(entry.action)||name(entry.action),entry.entity_type].filter(Boolean).join(' · '))))}));
      }
    }
    filters.append(button(t('Search','بحث'),load));
    await load();
  }
  async function communityReportsSection(root){
    root.append(node('h3',t('Reports and flagged content','البلاغات والمحتوى المُبلَّغ')));
    const filters=node('div','grid'),list=node('div','grid');
    const status=node('select');status.setAttribute('aria-label',t('Report status','حالة البلاغ'));
    for(const code of ['','open','reviewed','dismissed','actioned']){const option=node('option',code?communityStatusName(code):t('Open and recent','المفتوحة والأخيرة'));option.value=code;status.append(option)}
    filters.append(status);root.append(filters,list);
    async function load(){
      const data=await api('admin/community/reports'+(status.value?'?status='+encodeURIComponent(status.value):''));
      list.replaceChildren();
      if(!(data.reports||[]).length){list.append(node('p',t('No reports in this view.','لا توجد بلاغات في هذا العرض.'),'muted'));return}
      for(const report of data.reports){
        const details=[date(report.created_at),communityStatusName(report.status),name(report.entity_type),report.reason,report.reporter_email,report.community_name].filter(Boolean).join(' · ');
        const c=card(list,t('Report','بلاغ'),details,report.id);
        c.append(node('p',t('Flagged content id: ','معرف المحتوى المُبلَّغ: ')+report.entity_id));
        const open=link(t('Open community','افتح المجتمع'),'community.html?community='+encodeURIComponent(report.community_id));open.target='_blank';open.rel='noopener noreferrer';c.append(open);
        for(const decision of ['reviewed','dismissed','actioned'])c.append(button(t(communityStatusName(decision),communityStatusName(decision)),async()=>{
          if(decision==='actioned'&&!confirm(t('Hide the flagged content and record this decision?','إخفاء المحتوى المُبلَّغ وتسجيل هذا القرار؟')))return;
          await api('admin/community/reports/'+report.id,{method:'PATCH',body:{status:decision}});
          notice(t('Report updated.','تم تحديث البلاغ.'),'success');await load();
        }));
      }
    }
    status.onchange=load;filters.append(button(t('Refresh','تحديث'),load));
    await load();
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
  async function aiBrainPanel(root) {
    const panel = node('section', null, 'command-panel');
    const head = node('div', null, 'panel-head');
    head.append(node('h3', t('MZ AI Brain notifications', 'إشعارات MZ AI Brain')));
    panel.append(head);
    let data;
    try { data = await api('admin/ai-brain'); }
    catch (error) { panel.append(node('p', errorMessage(error), 'empty-state')); root.append(panel); return; }
    const facts = node('div', null, 'ai-list');
    const settings = data.settings || {}, email = data.email || {};
    const rows = [
      [t('Status', 'الحالة'), name(data.status)],
      [t('Last execution', 'آخر تنفيذ'), data.last_execution ? date(data.last_execution) : t('Never', 'لم يحدث')],
      [t('Report time', 'وقت التقرير'), `${settings.report_time || '07:00'} ${t('Asia/Qatar', 'بتوقيت قطر')}`],
      [t('Recipient', 'المستلم'), settings.admin_email || 'mzactive@yahoo.com'],
      [t('Email delivery', 'تسليم البريد'), email.configured ? `${t('Configured', 'مهيأ')} · ${Number(email.sent || 0)} ${t('sent', 'مرسل')} / ${Number(email.failed || 0)} ${t('failed', 'فاشل')}` : t('Not configured', 'غير مهيأ')],
      [t('Last report status', 'حالة آخر تقرير'), name(settings.last_report_status)],
    ];
    for (const [label, value] of rows) {
      const row = node('article', null, 'action-row');
      row.append(node('span', label), node('strong', String(value)));
      facts.append(row);
    }
    panel.append(facts);
    panel.append(node('h4', t('Latest recommendations', 'أحدث التوصيات')));
    const recommendations = data.latest_report?.recommendations || [];
    if (!recommendations.length) panel.append(node('p', t('No recommendations yet.', 'لا توجد توصيات بعد.'), 'empty-state'));
    for (const item of recommendations) panel.append(node('p', String(item)));
    panel.append(node('h4', t('Recent errors', 'الأخطاء الأخيرة')));
    const errors = data.errors || [];
    if (!errors.length) panel.append(node('p', t('No unresolved errors.', 'لا توجد أخطاء لم تُحل.'), 'empty-state'));
    for (const item of errors) {
      const row = node('article', null, 'action-row');
      row.append(node('strong', name(item.source)), node('span', String(item.message || '')), node('small', date(item.created_at)));
      panel.append(row);
    }
    const toggleLabel = node('label', t('Enable email notifications', 'تفعيل إشعارات البريد'));
    const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = Boolean(settings.notifications_enabled);
    toggleLabel.append(toggle);
    const timeLabel = node('label', t('Daily report time (Asia/Qatar)', 'وقت التقرير اليومي (توقيت قطر)'));
    const time = document.createElement('input'); time.type = 'time'; time.value = settings.report_time || '07:00';
    timeLabel.append(time);
    const controls = node('div', null, 'crm-actions');
    controls.append(toggleLabel, timeLabel);
    const save = button(t('Save notification settings', 'حفظ إعدادات الإشعارات'), async () => {
      if (!window.confirm(t('Save AI Brain notification settings?', 'حفظ إعدادات إشعارات MZ AI Brain؟'))) return;
      await api('admin/ai-brain', { method: 'PATCH', body: { notifications_enabled: toggle.checked, report_time: time.value, confirm: true } });
      notice(t('AI Brain settings saved.', 'تم حفظ إعدادات MZ AI Brain.'), 'success');
      await render();
    });
    const sendTest = button(t('Send test email', 'إرسال بريد تجريبي'), async () => {
      if (!window.confirm(t('Send a real test email to the administrator?', 'إرسال بريد تجريبي حقيقي إلى المسؤول؟'))) return;
      const result = await api('admin/ai-brain/test-email', { method: 'POST', body: { confirm: true } });
      notice(t('Test email delivered.', 'تم تسليم البريد التجريبي.') + (result.provider_id ? ' · ' + result.provider_id : ''), 'success');
      await render();
    });
    const runNow = button(t('Run report now', 'تنفيذ التقرير الآن'), async () => {
      if (!window.confirm(t('Generate and email the AI Brain report now?', 'إنشاء وإرسال تقرير MZ AI Brain الآن؟'))) return;
      const result = await api('admin/ai-brain/run', { method: 'POST', body: { confirm: true } });
      notice(t('Report generated.', 'تم إنشاء التقرير.') + (result.email?.ok ? ' ' + t('Email delivered.', 'تم تسليم البريد.') : ''), 'success');
      await render();
    });
    controls.append(save, sendTest, runNow);
    panel.append(controls);
    panel.append(node('small', t('Settings changes, test delivery and manual reports require explicit administrator confirmation. No payment or WhatsApp action is performed.', 'تتطلب تغييرات الإعدادات والتسليم التجريبي والتقارير اليدوية تأكيداً صريحاً من المسؤول. لا يتم تنفيذ أي دفع أو إجراء واتساب.')));
    root.append(panel);
  }

  async function runIQLaunchPanel(root) {
    const panel = node('section', null, 'command-panel');
    const head = node('div', null, 'panel-head');
    head.append(node('h3', t('Run IQ launch metrics', 'مؤشرات إطلاق Run IQ')));
    panel.append(head);
    let data;
    try { data = await api('admin/run-iq-metrics?days=30'); }
    catch (error) { panel.append(node('p', errorMessage(error), 'empty-state')); root.append(panel); return; }
    const e = data.events || {};
    const rows = [
      [t('Date range', 'المدة'), `${data.from?.slice(0, 10) || '—'} → ${data.to?.slice(0, 10) || '—'} (${data.days} ${t('days', 'يوم')})`],
      [t('Visitors', 'الزوار'), `${data.visitors || 0} · ${t('Anonymous', 'مجهول')}: ${data.anonymous_visitors || 0} · ${t('Registered', 'مسجل')}: ${data.registered_visitors || 0}`],
      [t('Assessment starts', 'بدايات التقييم'), e.assessment_started?.count || 0],
      [t('Completed assessments', 'تقييمات مكتملة'), e.assessment_completed?.count || 0],
      [t('Completion rate', 'معدل الإكمال'), `${data.completion_rate || 0}%`],
      [t('Results viewed', 'تم عرض النتائج'), e.results_viewed?.count || 0],
      [t('Save My Plan clicks', 'نقرات حفظ الخطة'), e.save_plan_clicked?.count || 0],
      [t('Registrations', 'التسجيلات'), e.registration_completed?.count || 0],
      [t('Plans saved', 'الخطط المحفوظة'), e.plan_saved?.count || 0],
      [t('Coach referrals', 'إحالات المدربين'), e.coach_profile_clicked?.count || 0],
      [t('Feedback', 'الآراء'), `${t('Yes', 'نعم')}: ${data.feedback?.yes || 0} · ${t('Somewhat', 'إلى حد ما')}: ${data.feedback?.somewhat || 0} · ${t('Not yet', 'ليس بعد')}: ${data.feedback?.not_yet || 0}`],
    ];
    const list = node('div', null, 'ai-list');
    for (const [label, value] of rows) {
      const row = node('article', null, 'action-row');
      row.append(node('span', label), node('strong', String(value)));
      list.append(row);
    }
    panel.append(list);
    panel.append(node('small', data.note || ''));
    root.append(panel);
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
    if(hasSnapshot)dashboardCard(grid,'coaches',['Coach applications','طلبات المدربين'],Number(counts.coaches!=null?counts.coaches:(snapshot.pending_provider_profiles||0)),[t('Approved professionals: ','المختصون المعتمدون: ')+Number(snapshot.approved_providers||0),t('Pending applications: ','الطلبات المعلقة: ')+Number(snapshot.pending_provider_profiles||0)],'coaches');
    dashboardCard(grid,'bookings',['Open bookings','حجوزات مفتوحة'],Number(counts.bookings!=null?counts.bookings:(snapshot?.open_booking_requests||0)),['Requests awaiting triage','طلبات بانتظار الفرز'],'bookings');
    if(hasSnapshot)dashboardCard(grid,'programs',['Programs without access','برامج بلا وصول'],snapshot.unlinked_programs,['Need an athlete account','تحتاج حساب رياضي'],'athletes');
    dashboardCard(grid,'actions',['Needs action','يحتاج إجراءً'],data?.total,['Across permitted areas','ضمن الصلاحيات المسموحة'],'actions');
    if(canAi())dashboardCard(grid,'ai',['AI recommendations','توصيات الذكاء الاصطناعي'],counts.ai,['Awaiting your decision','بانتظار قرارك'],'ai');
    root.append(grid);
    const layout=node('div',null,'overview-grid'),stack=node('div',null,'overview-stack'),side=node('div',null,'overview-stack');
    actionCenter(stack,data?.notifications);
    const activity=node('section',null,'command-panel'),activityHead=node('div',null,'panel-head');
    activityHead.append(node('h3',t('Recent activity','النشاط الأخير')),button(t('Full history','السجل الكامل'),()=>go('reports')));
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
  function adminAction(label,statusNode,fn,successPair,after){
    const b=node('button',label,'crm-action account-action-button');b.type='button';b.dataset.label=label;
    b.onclick=async()=>{
      if(b.disabled)return;
      b.disabled=true;b.setAttribute('aria-busy','true');
      setCrmStatus(statusNode,t('Working…','جارٍ التنفيذ…'),'busy');
      try{
        const result=await fn();
        setCrmStatus(statusNode,successPair?t(...successPair):t('Done.','تم.'),'success');
        if(after)await after(result);
      }catch(e){
        if(e?.cancelled)setCrmStatus(statusNode,t('Cancelled.','تم الإلغاء.'));
        else setCrmStatus(statusNode,errorMessage(e).split(' · ')[0],'error');
      }finally{b.disabled=false;b.removeAttribute('aria-busy')}
    };
    return b;
  }
  function accountStatusLabel(status){
    if(status==='suspended')return t('Suspended — sign-in blocked','معلق — الدخول محظور');
    if(status==='deleted')return t('Deleted — anonymized','محذوف — هوية مخفية');
    return t('Active','نشط');
  }
  function accountVisibilityLabel(a){
    if(a.profile_visibility==='hidden')return t('Hidden — removed from public discovery','مخفي — تمت إزالته من الاكتشاف العام');
    return t('Public','عام');
  }
  function accountRole(a){
    if(a.role==='admin')return a.is_super_admin===1?t('Super administrator','مسؤول أعلى'):t('Limited administrator','مسؤول محدود الصلاحية');
    if(a.account_status==='deleted')return t('Deleted account','حساب محذوف');
    if(!a.profile_id)return t('Athlete / member','رياضي / عضو');
    if(a.profile_status==='approved')return t('Approved coach','مدرب معتمد');
    if(a.profile_status==='rejected')return t('Coach access removed','تم إلغاء صلاحية المدرب');
    return a.submission_state==='draft'?t('Coach applicant — draft','متقدم لمدرب — مسودة'):t('Coach applicant — pending review','متقدم لمدرب — بانتظار المراجعة');
  }
  function mountManageAccount(host,userId,prefill={},onChanged){
    if(!userId)return Promise.resolve();
    const section=crmSection(t(...labels.manage_account),'manageAccountSection');
    section.dataset.accountManage='1';
    host.append(section);
    return fillManageAccount(section,userId,prefill,onChanged);
  }
  async function fillManageAccount(section,userId,prefill,onChanged){
    section.replaceChildren(node('p',t('Loading account status…','جارٍ تحميل حالة الحساب…'),'crm-loading'));
    let data;
    try{data=await api('admin/accounts/'+encodeURIComponent(userId))}
    catch(e){section.replaceChildren(node('h3',t(...labels.manage_account)),node('p',errorMessage(e),'crm-error'));return}
    const reload=()=>fillManageAccount(section,userId,prefill,onChanged);
    const after=async()=>{await reload();if(onChanged)await onChanged()};
    const a=data.account||{},events=data.events||[];
    const status=node('p',null,'account-status account-action-status');
    const group=(number,title,cls='')=>{const box=node('section',null,'account-group '+cls);box.append(node('h4',number+'. '+title));return box};
    section.replaceChildren(node('h3',t(...labels.manage_account)));
    section.append(node('p',t('Administrative controls only. Public profile fields are not changed here.','أدوات إدارية فقط. لا تُغيَّر هنا حقول الملف العام.'),'crm-note'));
    const grid=node('div',null,'account-manage-grid');
    const overview=group(1,t('Account overview','نظرة عامة على الحساب'));
    const fields=node('div',null,'crm-fields');
    fields.append(
      crmField(t('Account email','بريد الحساب'),a.email),
      crmField(t('Login status','حالة الدخول'),accountStatusLabel(a.account_status)),
      crmField(t('Account type','نوع الحساب'),accountRole(a)),
      crmField(t('Application status','حالة الطلب'),a.profile_id?(a.submission_state==='draft'?t('Draft — awaiting submission','مسودة — بانتظار الإرسال'):name(a.profile_status||'pending')):t('Not a coach applicant','ليس متقدماً لمدرب'))
    );
    overview.append(fields,status);
    if(a.role_mismatch)overview.append(node('p',t('This account has athlete records but no professional profile. Correct the account type here; never create a second account.','هذا الحساب له سجلات رياضية دون ملف مهني. صحّح نوع الحساب هنا؛ لا تنشئ حساباً ثانياً.'),'crm-note'));
    if(!managementIsAdmin)overview.append(node('p',t('View only. A full administrator must make account changes.','عرض فقط. يجب على مسؤول كامل إجراء تغييرات الحساب.'),'crm-note'));
    grid.append(overview);
    const profile=group(2,t('Profile information','معلومات الملف'));
    const records=group(5,t('Bookings and training programs','الحجوزات والبرامج التدريبية'));
    records.append(node('p',t('Bookings retained','الحجوزات المحفوظة')+': '+String(a.booking_count||0)+' · '+t('Training records retained','سجلات التدريب المحفوظة')+': '+String(a.program_count||0),'crm-note'));
    const recordsActions=node('div',null,'actions');
    for(const [tab,label,ar] of [['bookings','View bookings','عرض الحجوزات'],['programs','View training programs','عرض البرامج التدريبية']]){
      const go=node('button',t(label,ar),'crm-action');go.type='button';go.onclick=()=>$('nav').querySelector('[data-nav-tab="'+tab+'"]')?.click();recordsActions.append(go)
    }
    records.append(recordsActions);
    const audit=node('section',null,'account-group account-events');
    audit.append(node('h4','6. '+t('Activity and audit history','النشاط وسجل التدقيق')));
    if(!events.length)audit.append(crmEmpty(['No account changes recorded.','لا توجد تغييرات مسجلة على الحساب.']));
    for(const e of events){const row=node('article',null,'crm-row');row.append(node('strong',name(e.action)),node('small',[date(e.created_at),e.actor_user_id?t('Recorded by administrator','سجّله المسؤول'):t('Recorded by system','سجّله النظام')].join(' · ')));
      const detail=parse(e.detail);if(detail?.reason)row.append(node('small',t('Reason: ','السبب: ')+detail.reason));audit.append(row)}
    const danger=node('details',null,'account-group account-danger account-danger-zone');
    danger.append(node('summary','7. '+t('Danger Zone — delete account','منطقة الخطر — حذف الحساب')));
    if(a.account_status==='deleted'||!managementIsAdmin){
      danger.append(node('p',t('This account has already been deleted and anonymized. No further account actions are available.','تم حذف هذا الحساب وإخفاء بياناته بالفعل. لا توجد إجراءات إضافية متاحة.'),'crm-note'));
    }else{
      danger.append(node('p',t('Deleting disables sign-in, removes the public professional profile and anonymizes account identifiers. Bookings, training and participation records are retained according to the retention policy. This cannot be undone from the portal.','يؤدي الحذف إلى تعطيل الدخول وإزالة الملف المهني العام وإخفاء معرّفات الحساب. تُحتفظ بالحجوزات والتدريب وسجلات المشاركة وفق سياسة الاحتفاظ. لا يمكن التراجع عن ذلك من البوابة.'),'crm-note'));
      const deleteReason=node('input');deleteReason.type='text';deleteReason.maxLength=300;
      deleteReason.placeholder=t('Reason (required)','السبب (مطلوب)');deleteReason.setAttribute('aria-label',t('Deletion reason','سبب الحذف'));
      const deleteReasonLabel=node('label',t('Deletion reason','سبب الحذف'));deleteReasonLabel.append(deleteReason);
      const emailConfirm=node('input');emailConfirm.type='email';emailConfirm.autocomplete='off';emailConfirm.placeholder=a.email||'';emailConfirm.setAttribute('aria-label',t('Type the account email to confirm','اكتب بريد الحساب للتأكيد'));
      const emailLabel=node('label',t('Type the account email','اكتب بريد الحساب'));emailLabel.append(emailConfirm);
      const phraseConfirm=node('input');phraseConfirm.type='text';phraseConfirm.autocomplete='off';phraseConfirm.placeholder='DELETE';phraseConfirm.setAttribute('aria-label',t('Type DELETE to confirm','اكتب DELETE للتأكيد'));
      const phraseLabel=node('label',t('Type DELETE','اكتب DELETE'));phraseLabel.append(phraseConfirm);
      const cancel=node('button',t('Cancel','إلغاء'),'account-cancel');cancel.type='button';
      cancel.onclick=()=>{deleteReason.value='';emailConfirm.value='';phraseConfirm.value='';danger.open=false;setCrmStatus(status,'')};
      const del=adminAction(t('Permanently delete account','حذف الحساب نهائياً'),status,async()=>{
        if(!deleteReason.value.trim())throw Error('reason_required');
        if(!emailConfirm.value||!phraseConfirm.value)throw Error('confirmation_required');
        if(!confirm(t('Final confirmation: delete and anonymize this account?','تأكيد نهائي: حذف هذا الحساب وإخفاء بياناته؟')))throw Object.assign(new Error('cancelled'),{cancelled:true});
        return api('admin/accounts/'+encodeURIComponent(userId)+'/delete',{method:'POST',body:{confirm_email:emailConfirm.value,confirm_phrase:phraseConfirm.value,reason:deleteReason.value.trim()}});
      },['Account deleted and anonymized. Related records were retained.','تم حذف الحساب وإخفاء بياناته مع الاحتفاظ بالسجلات ذات الصلة.'],after);
      del.classList.add('danger-action');
      danger.append(deleteReasonLabel,emailLabel,phraseLabel,cancel,del);
    }
    if(managementIsAdmin&&a.account_status!=='deleted'){
      const edit=node('details',null,'account-edit');
      edit.append(node('summary',t('Edit account details','تعديل بيانات الحساب')));
      edit.append(node('p',t('Identity and contact fields used for account administration. Changing the email signs the user out everywhere.','حقول الهوية والتواصل المستخدمة لإدارة الحساب. تغيير البريد يسجّل المستخدم من كل الجلسات.'),'crm-note'));
      const emailInput=node('input');emailInput.type='email';emailInput.maxLength=180;emailInput.value=a.email||'';emailInput.setAttribute('aria-label',t('Account email','بريد الحساب'));
      const emailLabel=node('label',t('Account email','بريد الحساب'));emailLabel.append(emailInput);
      const displayInput=node('input');displayInput.type='text';displayInput.maxLength=100;displayInput.value=a.display_name||'';displayInput.setAttribute('aria-label',t('Display name','الاسم المعروض'));
      const displayLabel=node('label',t('Display name','الاسم المعروض'));displayLabel.append(displayInput);
      const cityInput=node('input');cityInput.type='text';cityInput.maxLength=80;cityInput.value=a.city||'';cityInput.setAttribute('aria-label',t('City','المدينة'));
      const cityLabel=node('label',t('City','المدينة'));cityLabel.append(cityInput);
      const countryInput=node('input');countryInput.type='text';countryInput.maxLength=80;countryInput.value=a.country||'';countryInput.setAttribute('aria-label',t('Country','الدولة'));
      const countryLabel=node('label',t('Country','الدولة'));countryLabel.append(countryInput);
      const whatsappInput=node('input');whatsappInput.type='text';whatsappInput.maxLength=32;whatsappInput.value=a.whatsapp_number||'';whatsappInput.setAttribute('aria-label',t('WhatsApp number','رقم واتساب'));
      const whatsappLabel=node('label',t('WhatsApp number','رقم واتساب'));whatsappLabel.append(whatsappInput);
      const language=node('select',null,'account-language');language.setAttribute('aria-label',t('Preferred language','اللغة المفضلة'));
      for(const [value,label] of [['',t('No preference','لا تفضيل')],['en',t('English','الإنجليزية')],['ar',t('Arabic','العربية')]]){const o=node('option',label);o.value=value;language.append(o)}
      language.value=a.preferred_language||'';
      const languageLabel=node('label',t('Preferred language','اللغة المفضلة'));languageLabel.append(language);
      const editStatus=node('p',null,'account-status');
      edit.append(emailLabel,displayLabel,cityLabel,countryLabel,whatsappLabel,languageLabel,editStatus);
      edit.append(adminAction(t('Save account details','حفظ بيانات الحساب'),editStatus,async()=>{
        return api('admin/accounts/'+encodeURIComponent(userId)+'/update',{method:'POST',body:{
          email:emailInput.value.trim(),display_name:displayInput.value,city:cityInput.value,country:countryInput.value,
          whatsapp_number:whatsappInput.value,preferred_language:language.value,
        }});
      },['Account details saved and audited.','تم حفظ بيانات الحساب وتسجيل التغيير.'],after));
      profile.append(edit);
    }else profile.append(node('p',t('Profile details are managed by the account holder in their coach or member profile.','تُدار تفاصيل الملف من قِبل صاحب الحساب في ملف المدرب أو العضو.'),'crm-note'));
    grid.append(profile);
    const roles=group(3,t('Roles and permissions','الأدوار والصلاحيات'));
    const roleActions=node('div',null,'account-actions');
    if(!a.profile_id&&a.role==='provider'&&a.account_status!=='deleted'&&managementIsAdmin){
      const setup=node('div',null,'account-convert');
      setup.append(node('h4',t('Correct account type → coach applicant','تصحيح نوع الحساب → متقدم لمدرب')));
      setup.append(node('p',t('The same email, password and account are kept. Bookings and training stay linked. Coach permissions open only after the provider completes onboarding, submits the application and an administrator approves it.','تُحتفظ بالبريد وكلمة المرور والحساب نفسه. تبقى الحجوزات والتدريب مرتبطة. لا تُفتح صلاحيات المدرب إلا بعد إكمال الملف وإرسال الطلب واعتماده من المسؤول.'),'crm-note'));
      const display=node('input');display.type='text';display.maxLength=100;display.value=prefill.name||a.email||'';
      const displayLabel=node('label',t('Display name','الاسم المعروض'));displayLabel.append(display);
      const city=node('input');city.type='text';city.maxLength=80;city.value=prefill.city||'';
      const cityLabel=node('label',t('City','المدينة'));cityLabel.append(city);
      const type=node('select',null,'account-convert-type');
      for(const code of ['coach','pacer','nutritionist','physiotherapist','sports_massage_therapist']){const option=node('option',name(code));option.value=code;type.append(option)}
      const typeLabel=node('label',t('Professional category','الفئة المهنية'));typeLabel.append(type);
      setup.append(displayLabel,cityLabel,typeLabel);
      setup.append(adminAction(t('Open coach application','فتح طلب المدرب'),status,async()=>{
        if(!confirm(t('Convert this existing account to a coach applicant without creating another account?','تحويل هذا الحساب الحالي إلى متقدم لمدرب دون إنشاء حساب آخر؟')))throw Object.assign(new Error('cancelled'),{cancelled:true});
        return api('admin/accounts/'+encodeURIComponent(userId)+'/coach-application',{method:'POST',body:{display_name:display.value,city:city.value,country:prefill.country||'Qatar',provider_type:type.value}});
      },['Coach application opened. The provider must complete and submit it before review.','تم فتح طلب المدرب. يجب على مقدم الخدمة إكماله وإرساله قبل المراجعة.'],after));
      roleActions.append(setup);
    }
    if(a.account_status!=='deleted'&&managementIsAdmin){
      const role=node('details',null,'account-role');
      role.append(node('summary',t('Change account role','تغيير دور الحساب')));
      role.append(node('p',t('Promotions create limited administrators. Super-admin status is never granted implicitly and requires an explicit decision.','تُنشئ الترقيات مسؤولين محدودي الصلاحية. لا تُمنح صفة المسؤول الأعلى ضمنياً بل تتطلب قراراً صريحاً.'),'crm-note'));
      const roleSelect=node('select',null,'account-role-select');roleSelect.setAttribute('aria-label',t('Account role','دور الحساب'));
      for(const [value,label] of [['provider',t('Athlete / member','رياضي / عضو')],['admin',t('Administrator','مسؤول')]]){const o=node('option',label);o.value=value;roleSelect.append(o)}
      roleSelect.value=a.role==='admin'?'admin':'provider';
      const superWrap=node('label',null,'permission-option'),superBox=node('input');superBox.type='checkbox';superBox.dataset.superAdmin='1';superWrap.append(superBox,node('span',t('Grant super administrator status','منح صفة المسؤول الأعلى')));superBox.checked=a.role==='admin'&&a.is_super_admin===1;
      const roleStatus=node('p',null,'account-status');
      role.append(roleSelect,superWrap,roleStatus);
      role.append(adminAction(t('Apply role change','تطبيق تغيير الدور'),roleStatus,async()=>{
        if(!confirm(t('Change this account role? Existing sessions will be signed out.','تغيير دور هذا الحساب؟ ستُلغى الجلسات الحالية.')))throw Object.assign(new Error('cancelled'),{cancelled:true});
        return api('admin/accounts/'+encodeURIComponent(userId)+'/role',{method:'POST',body:{role:roleSelect.value,super_admin:roleSelect.value==='admin'&&superBox.checked}});
      },['Account role updated and sessions revoked.','تم تحديث دور الحساب وإلغاء الجلسات.'],after));
      roleActions.append(role);
    }
    roles.append(roleActions);grid.append(roles);
    const state=group(4,t('Visibility and account status','ظهور الملف وحالة الحساب'));
    state.append(crmField(t('Public profile','الملف العام'),a.profile_visibility==='hidden'?t('Hidden','مخفي'):t('Public','عام')));
    if(a.account_status!=='deleted'&&managementIsAdmin){
      const visibility=node('details',null,'account-visibility');
      visibility.append(node('summary',t('Public profile visibility','ظهور الملف العام')));
      visibility.append(node('p',t('Hiding removes this account from public search, coach discovery, community listings, recommendations and published content. Sign-in, bookings and private account records stay intact.','يؤدي الإخفاء إلى إزالة هذا الحساب من البحث العام واكتشاف المدربين وقوائم المجتمع والتوصيات والمحتوى المنشور. يبقى الدخول والحجوزات وسجلات الحساب الخاصة سليمة.'),'crm-note'));
      const visibilityReason=node('input');visibilityReason.type='text';visibilityReason.maxLength=300;
      visibilityReason.placeholder=t('Reason (required)','السبب (مطلوب)');visibilityReason.setAttribute('aria-label',t('Moderation reason','سبب الرقابة'));
      const visibilityReasonLabel=node('label',t('Moderation reason','سبب الرقابة'));visibilityReasonLabel.append(visibilityReason);
      const visibilityStatus=node('p',null,'account-status');
      visibility.append(visibilityReasonLabel,visibilityStatus);
      if(a.profile_visibility==='hidden'){
        visibility.append(adminAction(t('Restore public profile','استعادة الملف العام'),visibilityStatus,async()=>{
          if(!visibilityReason.value.trim())throw Error('reason_required');
          if(!confirm(t('Restore this public profile?','استعادة هذا الملف العام؟')))throw Object.assign(new Error('cancelled'),{cancelled:true});
          return api('admin/accounts/'+encodeURIComponent(userId)+'/restore-profile',{method:'POST',body:{reason:visibilityReason.value.trim()}});
        },['Public profile restored.','تمت استعادة الملف العام.'],after));
      }else{
        visibility.append(adminAction(t('Hide public profile','إخفاء الملف العام'),visibilityStatus,async()=>{
          if(!visibilityReason.value.trim())throw Error('reason_required');
          if(!confirm(t('Hide this public profile? Sign-in stays active.','إخفاء هذا الملف العام؟ سيبقى الدخول نشطاً.')))throw Object.assign(new Error('cancelled'),{cancelled:true});
          return api('admin/accounts/'+encodeURIComponent(userId)+'/hide-profile',{method:'POST',body:{reason:visibilityReason.value.trim()}});
        },['Public profile hidden from all public surfaces.','تم إخفاء الملف العام من كل الواجهات العامة.'],after));
      }
      state.append(visibility);
      if(a.account_status==='suspended'){
        const reactivateReason=node('input');reactivateReason.type='text';reactivateReason.maxLength=300;
        reactivateReason.placeholder=t('Reason (required)','السبب (مطلوب)');reactivateReason.setAttribute('aria-label',t('Reactivation reason','سبب إعادة التفعيل'));
        const reactivateReasonLabel=node('label',t('Reactivation reason','سبب إعادة التفعيل'));reactivateReasonLabel.append(reactivateReason);
        state.append(reactivateReasonLabel,adminAction(t('Reactivate account','إعادة تفعيل الحساب'),status,async()=>{
          if(!reactivateReason.value.trim())throw Error('reason_required');
          if(!confirm(t('Reactivate this account? Existing sessions stay signed out.','إعادة تفعيل هذا الحساب؟ ستبقى الجلسات الحالية مسجّلة الخروج.')))throw Object.assign(new Error('cancelled'),{cancelled:true});
          return api('admin/accounts/'+encodeURIComponent(userId)+'/reactivate',{method:'POST',body:{reason:reactivateReason.value.trim()}});
        },['Account reactivated. The user must sign in again.','تمت إعادة تفعيل الحساب. يجب على المستخدم تسجيل الدخول مجدداً.'],after));
      }else{
        const reason=node('input');reason.type='text';reason.maxLength=300;reason.placeholder=t('Reason (required)','السبب (مطلوب)');reason.setAttribute('aria-label',t('Suspension reason','سبب التعليق'));
        const reasonLabel=node('label',t('Suspension reason','سبب التعليق'));reasonLabel.append(reason);
        state.append(reasonLabel,adminAction(t('Suspend access','تعليق الوصول'),status,async()=>{
          if(!reason.value.trim())throw Error('reason_required');
          if(!confirm(t('Suspend this account? Sign-in stops immediately and all sessions are revoked.','تعليق هذا الحساب؟ سيتوقف الدخول فوراً وتُلغى كل الجلسات.')))throw Object.assign(new Error('cancelled'),{cancelled:true});
          return api('admin/accounts/'+encodeURIComponent(userId)+'/suspend',{method:'POST',body:{reason:reason.value.trim()}});
        },['Account suspended and sessions revoked.','تم تعليق الحساب وإلغاء الجلسات.'],after));
      }
    }else state.append(node('p',t('Sign-in and visibility controls are not available for this account.','أدوات الدخول وظهور الملف غير متاحة لهذا الحساب.'),'crm-note'));
    grid.append(state,records,audit);
    section.append(grid,danger);
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
      const b=node('article',null,'athlete-card');b.dataset.recordId=a.id;b.tabIndex=0;
      b.setAttribute('role','button');b.setAttribute('aria-label',t('View profile for ','عرض ملف ')+(a.name||a.email));
      const head=node('span',null,'athlete-card-head');head.append(avatar(a.name));
      const who=node('span',null,'athlete-who');who.append(node('strong',a.name||a.email,'athlete-name'),node('small',a.email||'','athlete-email'));head.append(who);
      const badges=node('span',null,'athlete-badges');badges.append(badge(a.assignment_status),badge(a.active?'active':'inactive'));
      if(a.onboarding_incomplete)badges.append(badge('onboarding_incomplete'));
      const meta=[(a.sports||[]).join(', '),a.city,a.assigned_coach_name?t(...labels.assigned_coaches)+': '+a.assigned_coach_name:'',a.last_activity_at?t(...labels.last_activity)+': '+date(a.last_activity_at):''].filter(Boolean).join(' · ');
      head.append(quickMenu([
        {label:t('View profile','عرض الملف'),onClick:()=>openAthleteDetail(a.id)},
        {label:t('Move to Trash','نقل إلى المهملات'),onClick:()=>trashAccount(a.id,a.name||a.email,()=>loadAthleteDirectory(root))},
      ]));
      b.append(head,badges,node('span',meta||t(...labels.not_provided),'athlete-meta'),node('span',t('View profile →','عرض الملف ←'),'athlete-card-more'));
      b.onclick=()=>openAthleteDetail(a.id);
      b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openAthleteDetail(a.id)}};
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
      crmAction(t(...labels.manage_account),status,async()=>shell.querySelector('#manageAccountSection')?.scrollIntoView({block:'start',behavior:'smooth'}),labels.managing_account),
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
    mountManageAccount(body,a.id,{name:a.name,city:a.city,country:a.country},()=>openAthleteDetail(a.id));
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
  const permissionLabels = {
    'management.view':['Portal access','الوصول للبوابة'],
    'management.coaches':['Athletes and coaches','الرياضيون والمدربون'],
    'management.bookings':['Bookings','الحجوزات'],
    'management.community':['Community','المجتمع'],
    'management.articles':['Articles','المقالات'],
    'management.ai':['AI Brain','المساعد الذكي'],
    'management.audit':['Reports and audit','التقارير والتدقيق'],
  };
  function permissionName(code){return permissionLabels[code]?t(...permissionLabels[code]):code}
  async function programsSection(root){
    const data=await api('admin/programs'),programs=data.programs||[];
    const panel=node('section',null,'command-panel'),head=node('div',null,'panel-head');
    head.append(node('h3',t('Training programs','برامج التدريب')));panel.append(head);
    const stats=node('div',null,'crm-fields');
    const linked=programs.filter(p=>p.access_linked).length;
    stats.append(
      crmField(t('Programs','البرامج'),String(programs.length)),
      crmField(t('Linked to athlete accounts','مرتبطة بحسابات رياضية'),String(linked)),
      crmField(t('Awaiting athlete access','بانتظار وصول الرياضي'),String(programs.length-linked))
    );
    panel.append(stats);
    if(!programs.length)panel.append(crmEmpty(['No training programs are stored yet.','لا توجد برامج تدريب مخزنة بعد.']));
    for(const p of programs){
      const c=node('article',null,'crm-row program-row');c.dataset.recordId=p.id;
      const fields=node('div',null,'crm-fields');
      fields.append(
        crmField(t('Athlete','الرياضي'),p.athlete_name),
        crmField(t('Coach','المدرب'),p.coach_name||''),
        crmField(t('Program type','نوع البرنامج'),p.athlete_type==='triathlon'?t('Triathlon','ترياتلون'):t('Runner','عدّاء')),
        crmField(t('Week starting','الأسبوع بداية من'),date(p.week_start)),
        crmField(t('Sessions','الجلسات'),String(p.session_count||0)),
        crmField(t('Completed sessions','الجلسات المكتملة'),String(p.completion_count||0)),
        crmField(t('Account access','وصول الحساب'),p.access_linked?t('Linked','مرتبط'):t('Not linked','غير مرتبط'))
      );
      c.append(fields);
      if(p.coach_note)c.append(node('p',p.coach_note,'crm-note'));
      if(!p.access_linked){
        const search=node('input');search.type='search';search.maxLength=80;search.placeholder=t('Search athlete email','ابحث عن بريد الرياضي');search.setAttribute('aria-label',search.placeholder);
        const choose=node('select');choose.append(node('option',t('Select an athlete','اختر رياضياً')));choose.value='';choose.setAttribute('aria-label',t('Athlete account','حساب الرياضي'));
        const status=node('p',null,'account-status');
        search.onchange=async()=>{
          if(!search.value.trim())return;
          try{
            const found=await api('admin/accounts?filter=members&q='+encodeURIComponent(search.value.trim()));
            choose.replaceChildren(node('option',t('Select an athlete','اختر رياضياً')));choose.value='';
            for(const account of found.accounts||[]){const option=node('option',account.email);option.value=account.id;choose.append(option)}
          }catch(e){setCrmStatus(status,errorMessage(e).split(' · ')[0],'error')}
        };
        c.append(search,choose,status,adminAction(t('Grant program access','منح وصول البرنامج'),status,async()=>{
          if(!choose.value)throw Error('athlete_required');
          return api('admin/programs/'+encodeURIComponent(p.id)+'/athlete',{method:'PATCH',body:{athlete_id:choose.value}});
        },['Program linked to the athlete account.','تم ربط البرنامج بحساب الرياضي.'],()=>programsSection(root)));
      }
      panel.append(c);
    }
    root.append(panel);
  }
  async function reportsSection(root){
    const data=await api('admin/reports');
    const rows=[];
    for(const e of data.history||[])rows.push({created_at:e.created_at,label:name(e.entity_type),detail:[e.from_status,name(e.to_status)].filter(Boolean).join(' → '),kind:t('Decision','قرار')});
    for(const e of data.authentication||[])rows.push({created_at:e.created_at,label:name(e.kind),detail:e.detail||'',kind:t('Security','الأمان')});
    for(const e of data.accounts||[])rows.push({created_at:e.created_at,label:name(e.action),detail:e.subject_user_id||'',kind:t('Account','الحساب')});
    for(const e of data.agents||[])rows.push({created_at:e.created_at,label:name(e.action),detail:name(e.status),kind:t('AI Brain','المساعد الذكي')});
    rows.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    root.append(node('p',t('Every entry below is read from an audit table; no figure is cached or estimated.','كل سجل أدناه مقروء من جدول تدقيق؛ لا توجد أرقام مخزنة أو مقدّرة.'),'muted'));
    group(root,t('Audit records','سجلات التدقيق'),rows.slice(0,200),(r,row)=>{
      const c=node('article',null,'crm-row');c.dataset.recordId=row.created_at;
      c.append(node('strong',[row.kind,row.label].filter(Boolean).join(' · ')),node('p',[date(row.created_at),row.detail].filter(Boolean).join(' · ')));r.append(c);
    });
  }
  async function settingsSection(root){
    if(!managementIsAdmin){root.append(node('p',t('Only a super administrator can assign management permissions.','يمكن للمسؤول الأعلى وحده تعيين صلاحيات الإدارة.'),'muted'));return}
    const data=await api('admin/management/permissions');
    const panel=node('section',null,'command-panel'),head=node('div',null,'panel-head');head.append(node('h3',t('Management permissions','صلاحيات الإدارة')));panel.append(head);
    panel.append(node('p',t('Assign scoped access without changing a password or creating another account. Promoted administrators receive limited access until explicitly elevated.','عيّن وصولاً محدوداً دون تغيير كلمة المرور أو إنشاء حساب آخر. يحصل المسؤولون المعيّنون حديثاً على وصول محدود حتى تتم ترقيتهم صراحةً.'),'crm-note'));
    const email=node('input');email.type='email';email.maxLength=180;email.placeholder=t('Account email','بريد الحساب');email.setAttribute('aria-label',email.placeholder);
    const status=node('p',null,'account-status'),checks=[];
    const options=node('div',null,'permission-options');
    for(const code of data.available||[]){
      const wrap=node('label',null,'permission-option'),box=node('input');box.type='checkbox';box.value=code;box.dataset.permission=code;wrap.append(box,node('span',permissionName(code)));options.append(wrap);checks.push(box);
    }
    panel.append(email,options,status);
    panel.append(adminAction(t('Save permissions','حفظ الصلاحيات'),status,async()=>{
      if(!email.value.trim())throw Error('email_required');
      const permissions=checks.filter(box=>box.checked).map(box=>box.value);
      if(!confirm(t('Replace the delegated permissions for this account?','استبدال الصلاحيات المفوّضة لهذا الحساب؟')))throw Object.assign(new Error('cancelled'),{cancelled:true});
      return api('admin/management/permissions',{method:'PUT',body:{email:email.value.trim(),permissions}});
    },['Permissions saved and audited. Other sessions for that account stay signed in.','تم حفظ الصلاحيات وتسجيلها. تبقى جلسات الحساب الأخرى نشطة.'],()=>settingsSection(root)));
    const grants=node('div',null,'permission-grants');grants.append(node('h4',t('Current grants','الصلاحيات الحالية')));
    if(!(data.grants||[]).length)grants.append(crmEmpty(['No delegated permissions are active.','لا توجد صلاحيات مفوّضة نشطة.']));
    for(const grant of data.grants||[]){const row=node('article',null,'crm-row');row.append(node('strong',grant.email),node('span',permissionName(grant.permission_code)),node('small',[grant.role==='admin'?t('Administrator','مسؤول'):t('Member','عضو'),date(grant.granted_at)].join(' · ')));grants.append(row)}
    panel.append(grants);root.append(panel);

    const campaignPanel=node('section',null,'command-panel'),campaignHead=node('div',null,'panel-head');campaignHead.append(node('h3',t('SAMLA 200 campaign','حملة صملة 200')));campaignPanel.append(campaignHead);
    campaignPanel.append(node('p',t('Control the homepage SAMLA 200 banner. Dates are Qatar time (Asia/Qatar).','تحكم في بانر صملة 200 في الصفحة الرئيسية. التواريخ بتوقيت قطر (Asia/Qatar).'),'crm-note'));
    const campaignStatus=crmStatus();
    const enabledWrap=node('label',null,'permission-option'),enabledBox=node('input');enabledBox.type='checkbox';enabledBox.checked=true;enabledWrap.append(enabledBox,node('span',t('Campaign enabled','الحملة مفعلة')));
    const starts=node('input');starts.type='datetime-local';starts.setAttribute('aria-label',t('Starts at','تبدأ في'));
    const ends=node('input');ends.type='datetime-local';ends.setAttribute('aria-label',t('Ends at','تنتهي في'));
    const toLocal=(iso)=>{const d=new Date(iso);const q=new Date(d.getTime()+3*60*60*1000);return q.toISOString().slice(0,16)};
    const fromLocal=(value)=>value?new Date(value+':00+03:00').toISOString():'';
    try{
      const current=await api('admin/campaigns/samla');
      enabledBox.checked=current.enabled!==false;
      starts.value=toLocal(current.starts_at);
      ends.value=toLocal(current.ends_at);
    }catch(err){campaignStatus.textContent=errorMessage(err)}
    campaignPanel.append(enabledWrap,node('label',t('Starts at','تبدأ في'),starts),node('label',t('Ends at','تنتهي في'),ends),campaignStatus);
    campaignPanel.append(adminAction(t('Save campaign','حفظ الحملة'),campaignStatus,async()=>{
      const startsAt=fromLocal(starts.value),endsAt=fromLocal(ends.value);
      if(!startsAt||!endsAt)throw Error('invalid_campaign_dates');
      return api('admin/campaigns/samla',{method:'PATCH',body:{enabled:enabledBox.checked,starts_at:startsAt,ends_at:endsAt}});
    },['Campaign saved and audited.','تم حفظ الحملة وتسجيلها.'],()=>settingsSection(root)));
    root.append(campaignPanel);
  }
  async function renderTrash(root) {
    const wrap=node('div',null,'trash-panel');root.append(wrap);
    const bar=node('div',null,'athlete-toolbar');
    const filters=node('div',null,'athlete-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label',t('Filter trash','تصفية المهملات'));
    const status=crmStatus();
    for(const [code,label] of [['all',['All','الكل']],['athletes',[t(...labels.all_athletes),t(...labels.all_athletes)]],['coaches',[t('Coaches','المدربون'),t('Coaches','المدربون')]],['pacers',[t('Pacers','المرافقون'),t('Pacers','المرافقون')]]]){
      const b=node('button',t(...label),'athlete-filter');b.type='button';b.dataset.trashFilter=code;
      if(code===trashFilter)b.classList.add('active');
      b.onclick=()=>{trashFilter=code;renderTrash(wrap)};filters.append(b);
    }
    bar.append(filters,status);wrap.append(bar);
    try{
      const data=await api('admin/trash?type='+encodeURIComponent(trashFilter));
      const counts=data.counts||{};wrap.append(node('p',t('Showing ','عرض ')+data.accounts.length+' / '+Number(counts[trashFilter]||0)+' · '+t('Trash','المهملات'),'athlete-summary'));
      const list=node('div',null,'athlete-list');
      if(!data.accounts.length)list.append(crmEmpty(['Nothing in Trash.','لا يوجد شيء في المهملات.']));
      for(const a of data.accounts||[]){
        const card=node('article',null,'crm-row trash-row');card.dataset.recordId=a.id;
        card.append(node('strong',a.display_name||a.email));
        const info=[name(a.account_type),a.deleted_at?date(a.deleted_at):'',a.deleted_by_email?t('Removed by ','حذف بواسطة ')+a.deleted_by_email:'',a.status_reason||''].filter(Boolean).join(' · ');
        card.append(node('span',info,'athlete-meta'));
        card.append(crmAction(t('Restore','استعادة'),status,async()=>{
          await api('admin/accounts/'+encodeURIComponent(a.id)+'/restore',{method:'POST',body:{}});
          applications=null;athleteDirectory=null;dashboard=null;await renderTrash(wrap);
        },['Account restored.','تمت استعادة الحساب.']));
        list.append(card);
      }
      wrap.append(list);
    }catch(e){wrap.replaceChildren(node('p',errorMessage(e),'crm-error'))}
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
      await aiBrainPanel(root);
      await runIQLaunchPanel(root);
      const select=node('select'),prompt=node('textarea');prompt.maxLength=1600;
      for(const code of ['operations','monitoring','analytics','marketing','growth','community','support']){const o=node('option',name(code));o.value=code;select.append(o)}
      const l=node('label',t('Agent','الوكيل')),q=node('label',t('Question or objective','السؤال أو الهدف'));l.append(select);q.append(prompt);root.append(l,q,button(t('Run analysis','تنفيذ التحليل'),async()=>{if(!prompt.value.trim()){prompt.focus();return}try{await api('admin/assistant',{method:'POST',body:{task:select.value,prompt:prompt.value.trim()}});agentsOverview=null;notice(t('Draft saved for review.','حُفظت المسودة للمراجعة.'))}finally{await render()}}));
      group(root,t('Recent runs','آخر عمليات التنفيذ'),tasks.slice(0,30),taskCard);
      await aiCoachSettings(root);
      root.append(node('h3',t('Momo follow-ups','متابعات Momo')));
      await momoFollowups(root);return;
    }
    if(tab==='programs'){await programsSection(root);return}
    if(tab==='reports'){await reportsSection(root);return}
    if(tab==='settings'){await settingsSection(root);return}
    if(tab==='bookings'){const d=await api('admin/applications');group(root,t('Recent and open requests','الطلبات المفتوحة والأخيرة'),d.bookings,booking);return}
    if(tab==='pacers'){
      if(!applications)applications=await api('admin/applications');
      root.append(node('p',t('Review Pacer applications and the real booking requests linked to them. Private contact details stay with the approved profile.','راجع طلبات المرافقين وطلبات الحجز المرتبطة بها. تبقى بيانات التواصل الخاصة مع الملف المعتمد.'),'muted'));
      renderCoaches(root,'pacer');
      const d=applications;
      group(root,t('Pacer booking requests','طلبات حجز المرافقين'),(d.bookings||[]).filter(b=>b.provider_type==='pacer'),booking);
      return;
    }
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
      try{await communityGroupsSection(root)}catch{root.append(node('p',t('Community group tools require management view and community permissions.','أدوات المجتمع تتطلب صلاحيات العرض والمجتمع.'),'muted'))}
      try{await communityReportsSection(root)}catch{root.append(node('p',t('Community report tools are unavailable for this account.','أدوات البلاغات غير متاحة لهذا الحساب.'),'muted'))}
      return;
    }
    if(tab==='articles'){const d=await api('admin/blog');group(root,t('Awaiting moderation','بانتظار المراجعة'),d.posts,(r,p)=>{const c=card(r,p.title,[p.coach_name,p.summary,p.body].join('\n'),p.id);for(const a of ['publish','return'])c.append(button(a==='publish'?t('Publish article','نشر المقال'):t('Return for edits','إعادة للتعديل'),()=>{if(a==='publish'&&!confirm(t('Publish this article?','نشر هذا المقال؟')))return;return save('admin/blog/'+p.id,{action:a})}))});return}
    if(tab==='athletes'){if(managementIsAdmin)root.append(link(t('Open training dashboard','فتح لوحة التدريب'),'dashboard.html'));await renderAthletes(root);return}
    if(tab==='trash'){await renderTrash(root);return}
    const [h,ai]=await Promise.all([api('admin/history'),api('admin/agents')]);const events=[...h.events,...ai.activity].sort((a,b)=>b.created_at.localeCompare(a.created_at));
    group(root,t('Recent decisions and activity','آخر القرارات والأنشطة'),events.slice(0,100),(r,e)=>card(r,e.action?name(e.action):e.entity_type==='provider_profile'?t('Coach profile','ملف المدرب'):e.entity_type==='registration'?t('New registration','تسجيل جديد'):t('Booking','حجز'),[date(e.created_at),e.action?name(e.agent_type):name(e.from_status),e.to_status?name(e.to_status):''].filter(Boolean).join(' · ')));
  }
  async function render(){const n=++sequence;staticLabels();$('nav').replaceChildren();const available=Object.entries(tabs).filter(([id])=>managementIsAdmin||!TAB_PERMISSIONS[id]||managementPermissions.includes(TAB_PERMISSIONS[id]));if(!available.some(([id])=>id===tab))tab='overview';for(const [id,v] of available){const b=node('button');b.type='button';b.dataset.navTab=id;b.title=t(...v);b.setAttribute('aria-label',t(...v));b.setAttribute('aria-current',id===tab);b.append(node('span',tabIcons[id]||'•','nav-icon'),node('span',t(...v),'nav-label'));b.onclick=()=>{closeMobileNav();return go(id)};$('nav').append(b)}paintNotificationBadges();const params=new URLSearchParams();if(tab!=='overview')params.set('tab',tab);if(recordId)params.set('record',recordId);history.replaceState(null,'',location.pathname+(params.toString()?'?'+params:''));$('title').textContent=t(...tabs[tab]);$('portalSubtitle').textContent=t(...(tabSubtitles[tab]||tabSubtitles.overview));$('view').textContent=t('Loading…','جارٍ التحميل…');const root=node('div');try{await paint(root);if(n===sequence){$('view').replaceChildren(root);focusRecord()}}catch(err){if(n===sequence||$('workspace').hidden)notice(errorMessage(err));if(n===sequence)$('view').replaceChildren(retryButton(t('Retry','إعادة المحاولة'),render))}}
  async function open(){
    try {
      const [,access,overview] = await Promise.all([api('admin/history'),api('me/access'),api('admin/dashboard')]);
      managementPermissions = Array.isArray(access.management?.permissions) ? access.management.permissions : [];
      // Super administrators inherit every management permission on the
      // backend. Promoted limited administrators only see explicit grants.
      managementIsAdmin = access.super_admin === true;
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
