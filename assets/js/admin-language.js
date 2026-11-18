(() => {
  const labels = {
    'Email':'البريد الإلكتروني',
    'Location':'الموقع',
    'Specialties':'التخصصات',
    'Languages':'اللغات',
    'Experience':'الخبرة',
    'Rate':'السعر الاسترشادي',
    'Photo uploaded':'تم تحميل الصورة',
    'WhatsApp public':'واتساب ظاهر للعامة',
    'Social links':'روابط التواصل الاجتماعي',
    'Review note':'ملاحظة المراجعة',
    'Customer name / email / WhatsApp':'اسم العميل / البريد الإلكتروني / واتساب',
    'Session / duration / distance / target pace':'نوع الحصة / المدة / المسافة / الوتيرة المستهدفة',
    'Location / preferred date':'الموقع / التاريخ المفضل',
    'Provider':'مقدم الخدمة',
    'Request':'طلب',
    'coach':'مدرب',
    'pacer':'مرافق جري',
    'Approved':'معتمد',
    'Removed':'موقوف',
    'EN':'مقال بالإنجليزية',
    'AR':'مقال بالعربية',
    'Approve':'اعتماد',
    'Reject':'رفض',
    'Replace photo':'استبدال الصورة',
    'Upload photo':'تحميل صورة',
    'Remove coach access':'إيقاف صلاحية المدرب',
    'Restore coach access':'استعادة صلاحية المدرب',
    'Mark reviewing':'بدء المراجعة',
    'Accept request':'قبول الطلب',
    'Decline':'رفض الطلب',
    'Confirm Fawran received':'تأكيد استلام فَوْران',
    'Publish on blog':'نشر في المدونة',
    'Return to coach for edits':'إعادة المقال للمدرب للتعديل',
    'Approve output':'اعتماد المخرجات',
    'Reject output':'رفض المخرجات',
    'Agent status':'حالة الأداة',
    'Live business snapshot':'ملخص العمل المباشر'
  };
  const statuses = {
    pending:'قيد الانتظار',reviewing:'قيد المراجعة',accepted:'مقبول',declined:'مرفوض',
    approved:'معتمد',rejected:'مرفوض',pending_payment:'بانتظار الدفع',confirmed:'مؤكد',
    received:'مستلم',cancelled:'ملغي',suspended:'موقوف',published:'منشور',draft:'مسودة',
    'payment later':'الدفع لاحقاً','not set':'غير محدد'
  };
  const actions = {
    started:'بدأ',completed:'اكتملت',approved:'اعتمد',rejected:'رفض',
    failed:'فشل',scheduled:'مجدول'
  };
  const messages = {
    'Signing in…':'جارٍ تسجيل الدخول…',
    'Creating Admin account…':'جارٍ إنشاء حساب الإدارة…',
    'Review saved.':'تم حفظ المراجعة.',
    'Request status saved.':'تم حفظ حالة الطلب.',
    'Fawran status saved.':'تم حفظ حالة فَوْران.',
    'Photo saved. Approval status was not changed.':'تم حفظ الصورة. لم تتغير حالة الاعتماد.',
    'Coach access removed. Existing team history was kept.':'تم إيقاف صلاحية المدرب مع الاحتفاظ بسجل الفريق.',
    'Coach access restored.':'تمت استعادة صلاحية المدرب.',
    'Article published.':'تم نشر المقال.',
    'Article returned to coach for edits.':'أُعيد المقال إلى المدرب لإجراء التعديلات.',
    'Photo must be 1 MB or smaller.':'يجب ألا يتجاوز حجم الصورة 1 ميغابايت.',
    'No profiles awaiting review.':'لا توجد ملفات بانتظار المراجعة.',
    'No approved profiles yet.':'لا توجد ملفات معتمدة بعد.',
    'No removed coach accounts.':'لا توجد حسابات مدربين موقوفة.',
    'No open booking requests.':'لا توجد طلبات حجز مفتوحة.',
    'No coach articles awaiting review.':'لا توجد مقالات للمدربين بانتظار المراجعة.',
    'No agent activity yet.':'لا يوجد نشاط للأدوات حتى الآن.',
    'Loading status...':'جارٍ تحميل الحالة...',
    'Loading data...':'جارٍ تحميل البيانات...',
    'Generating a draft…':'جارٍ إنشاء مسودة…',
    'Describe the request or paste verified observations first.':'صف الطلب أو أضف ملاحظات موثقة أولاً.',
    'The shared daily AI limit has been reached. Please try again tomorrow.':'تم بلوغ الحد اليومي المشترك لاستخدام الذكاء الاصطناعي. حاول مجدداً غداً.',
    'Please wait before generating another draft.':'يرجى الانتظار قبل إنشاء مسودة أخرى.'
  };
  const prefixes = {
    'Admin sign-in failed:':'تعذر تسجيل دخول الإدارة:',
    'Admin setup failed:':'تعذر إعداد حساب الإدارة:',
    'Sign in to access review:':'سجل الدخول للوصول إلى المراجعة:',
    'Could not upload photo:':'تعذر تحميل الصورة:',
    'Could not save review:':'تعذر حفظ المراجعة:',
    'Could not update request:':'تعذر تحديث الطلب:',
    'Could not update payment status:':'تعذر تحديث حالة الدفع:',
    'Could not update coach access:':'تعذر تحديث صلاحية المدرب:',
    'Could not update article:':'تعذر تحديث المقال:',
    'Could not update agent task:':'تعذر تحديث مهمة الأداة:',
    'Unavailable:':'غير متاح:'
  };
  const errorMessages = {
    unauthorized:'بيانات الدخول غير صحيحة',
    forbidden:'غير مصرح لك بهذه العملية',
    request_failed:'تعذر إكمال الطلب',
    upload_failed:'تعذر تحميل الصورة',
    sign_in_failed:'تعذر تسجيل الدخول',
    setup_failed:'تعذر إعداد الحساب',
    email_not_allowlisted:'البريد الإلكتروني غير مصرح له بالإدارة',
    intake_paused:'التسجيل متوقف مؤقتاً',
    daily_limit_reached:'تم بلوغ الحد اليومي',
    rate_limited:'يرجى الانتظار قبل المحاولة مجدداً'
  };
  const state = new WeakMap();
  const reverseText = new Map(
    Object.entries({...labels,...statuses,...messages}).map(([english,arabic])=>[arabic,english])
  );
  const isArabic = lang => lang === 'ar';
  const label = (english,lang) => isArabic(lang) ? (labels[english] || english) : english;

  function formatTitle(source,lang) {
    if (!isArabic(lang)) return source;
    if (source.startsWith('Request · ')) {
      return source.split(' · ').map((part,index) => index===0 ? label(part,lang) : (statuses[part] || part)).join(' · ');
    }
    const article=source.match(/^(.* · )(EN|AR)$/);
    if (article) return article[1]+label(article[2],lang);
    const provider=source.match(/^(.* · )(coach|pacer)( · (Approved|Removed))?$/);
    if (provider) return provider[1]+label(provider[2],lang)+(provider[3]?' · '+label(provider[4],lang):'');
    const agent=source.match(/^([A-Z_]+) · (pending|running|completed|failed|approved|rejected)$/i);
    if (agent) return `${agent[1]} · ${statuses[agent[2]]||agent[2]}`;
    return source;
  }

  function labeled(line,english,lang) {
    const prefix=english+':';
    if (line.startsWith(prefix)) return label(english,lang)+line.slice(english.length);
    return line;
  }

  function formatDetails(source,title,lang) {
    if (!isArabic(lang)) return source;
    const lines=source.split('\n');
    const booking=title.startsWith('Request · ');
    const provider=title.match(/ · (coach|pacer)(?: · (Approved|Removed))?$/);
    if (booking) {
      if (lines[0]) lines[0]=label('Customer name / email / WhatsApp',lang)+': '+lines[0];
      if (lines[1]) {
        const parts=lines[1].split(' · ');
        const sessions={race:'سباق',training:'تدريب',session:'حصة'};
        parts[0]=sessions[parts[0]]||parts[0];
        const duration=parts[1]?.match(/^(\d+) month program$/);
        if(duration)parts[1]=Number(duration[1])===1?'برنامج لمدة شهر واحد':Number(duration[1])===2?'برنامج لمدة شهرين':`برنامج لمدة ${duration[1]} أشهر`;
        parts[parts.length-2]=parts[parts.length-2]==='distance TBD'?'المسافة غير محددة':parts[parts.length-2];
        parts[parts.length-1]=parts[parts.length-1]==='pace TBD'?'الوتيرة غير محددة':parts[parts.length-1];
        lines[1]=label('Session / duration / distance / target pace',lang)+': '+parts.join(' · ');
      }
      if (lines[2]) lines[2]=label('Location / preferred date',lang)+': '+lines[2];
      lines[3]=labeled(lines[3]||'','Provider',lang);
      return lines.join('\n');
    }
    if (provider) {
      const removed=provider[2]==='Removed',approved=provider[2]==='Approved';
      lines[0]=label('Email',lang)+': '+lines[0];
      lines[1]=label('Location',lang)+': '+lines[1];
      if (approved) {
        lines[2]=labeled(lines[2]||'','Photo uploaded',lang);
        return lines.join('\n');
      }
      if (removed) {
        if (lines[2]) lines[2]=label('Review note',lang)+': '+lines[2];
        return lines.join('\n');
      }
      for (const [index,key] of [[2,'Specialties'],[3,'Languages'],[4,'Experience'],[5,'Rate'],[6,'Photo uploaded'],[7,'WhatsApp public'],[8,'Social links']]) {
        lines[index]=labeled(lines[index]||'',key,lang);
      }
      lines[4]=lines[4].replace(/(\d+) years$/, '$1 سنوات');
      lines[5]=lines[5].replace(/\bnot set\b/, 'غير محدد');
      lines[6]=lines[6].replace(/\byes\b/, 'نعم').replace(/\bno\b/, 'لا');
      lines[7]=lines[7].replace(/\byes\b/, 'نعم').replace(/\bno\b/, 'لا');
      lines[8]=lines[8].replace(/\bnone\b/, 'لا توجد');
      return lines.join('\n');
    }
    if (title.startsWith('OPERATIONS ·') || title.startsWith('MARKETING ·') || title.startsWith('SUPPORT ·') || title.startsWith('MONITORING ·') || title.startsWith('ANALYTICS ·')) {
      if (lines[1]?.startsWith('Source:')) lines[1]=`المصدر:${lines[1].slice('Source:'.length)}`;
      if (lines[2]?.startsWith('Approval:')) lines[2]=`الاعتماد:${lines[2].slice('Approval:'.length)}`;
      return lines.join('\n');
    }
    return source;
  }

  function formatNotice(source,lang) {
    if (!isArabic(lang)) return source;
    if (messages[source]) return messages[source];
    for (const [prefix,arabic] of Object.entries(prefixes)) {
      if (!source.startsWith(prefix)) continue;
      const detail=source.slice(prefix.length).trim();
      return detail ? `${arabic} ${errorMessages[detail] || 'حدث خطأ. حاول مرة أخرى.'}` : arabic;
    }
    return source;
  }

  function renderElement(element,formatter,lang,title='') {
    const current=element.textContent,previous=state.get(element);
    const original=previous && current===previous.rendered ? previous.source : reverseText.get(current)||current;
    const rendered=formatter===formatDetails ? formatter(original,title,lang) : formatter(original,lang);
    element.setAttribute('data-language-skip','');
    if (current!==rendered) element.textContent=rendered;
    state.set(element,{source:original,rendered});
  }

  function apply(lang=document.documentElement.lang) {
    document.querySelectorAll('#queue .card h3').forEach(element=>renderElement(element,formatTitle,lang));
    document.querySelectorAll('#queue .card pre').forEach(element=>{
      const heading=element.closest('.card')?.querySelector('h3');
      const title=state.get(heading)?.source || heading?.textContent || '';
      renderElement(element,formatDetails,lang,title);
    });
    document.querySelectorAll('#queue .card .actions button').forEach(element=>renderElement(element,(source,currentLang)=>label(source,currentLang),lang));
    const notice=document.querySelector('#notice');
    if(notice)renderElement(notice,formatNotice,lang);
    for(const id of ['agentStatus','agentActivity','ownerAiResult']) {
      const element=document.getElementById(id);
      if(element)renderElement(element,(source,currentLang)=>{
        if(currentLang!=='ar')return source;
        if(id==='agentActivity')return source.split('\n').map(line=>{
          const parts=line.split(' · ');
          if(parts.length<4)return messages[line]||line;
          return [parts[0],parts[1],actions[parts[2]]||parts[2],statuses[parts[3]]||parts[3]].join(' · ');
        }).join('\n');
        if(id==='ownerAiResult')return formatNotice(source,currentLang);
        if(source.startsWith('Available ·'))return source.replace('Available','متاح').replace('running','قيد التشغيل');
        if(source.startsWith('Unavailable:'))return `غير متاح: ${errorMessages[source.slice('Unavailable:'.length).trim()]||'تعذر إكمال الطلب'}`;
        return messages[source]||source;
      },lang);
    }
  }

  window.MZActiveAdminLanguage={formatTitle,formatDetails,formatNotice};
  document.addEventListener('mzactive:language-change',event=>apply(event.detail.lang));
  new MutationObserver(()=>apply()).observe(document.body,{childList:true,characterData:true,subtree:true});
  apply();
})();
