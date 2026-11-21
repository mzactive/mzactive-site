(() => {
  const common = {
    'Home':'الرئيسية','Find a Coach':'ابحث عن مدرب','Join as a Coach':'انضم كمدرب','Join as a Coach or Pacer':'انضم كمدرب أو مرافق جري','Explore':'استكشف','Training programs':'البرامج التدريبية','Articles':'المقالات','Events':'الفعاليات','Champion Pacers':'مرافقو السباقات','Log In':'تسجيل الدخول','Sign Up':'إنشاء حساب','Search articles':'ابحث في المقالات',
    'Coaching · التدريب':'التدريب','Find Your Coach · اعثر على مدربك':'اعثر على مدربك','Events & Team · الفعاليات والفريق':'الفعاليات والفريق','Join Us · انضم إلينا':'انضم إلينا','My Profile · ملفي':'ملفي',
    'Coaching':'التدريب','Find Your Coach':'اعثر على مدربك','Events & Team':'الفعاليات والفريق','Join Us':'انضم إلينا','My Profile':'ملفي','Admin Portal':'بوابة الإدارة','Management Portal':'بوابة الإدارة',
    'Want to sponsor MZ Active or support an athlete, event or new idea?':'هل ترغب في رعاية MZ Active أو دعم رياضي أو فعالية أو فكرة جديدة؟',
    'Want to sponsor MZ Active or support an athlete, event or idea?':'هل ترغب في رعاية MZ Active أو دعم رياضي أو فعالية أو فكرة جديدة؟',
    'Discuss sponsorship or support ↗':'ناقش فرص الرعاية أو الدعم ↗','WhatsApp us ↗':'تواصل معنا عبر واتساب ↗','Contact':'اتصل بنا','Main website':'الموقع الرئيسي','Main website ↗':'الموقع الرئيسي ↗',
    'Become a Coach with Us':'انضم إلى فريق المدربين','Booking':'الحجز','Blog':'المدونة','Blog | MZ Active':'المدونة | MZ Active','Back to MZ Active · العودة للموقع':'العودة إلى موقع MZ Active',
    '© 2026 MZ Active. All rights reserved.':'© 2026 MZ Active. جميع الحقوق محفوظة.','MZ ACTIVE · Train Smart. Perform Strong.':'MZ ACTIVE · تدرب بذكاء. حقق أداءً أقوى.',
    'MZ ACTIVE — Train Smart. Perform Strong.':'MZ ACTIVE — تدرب بذكاء. حقق أداءً أقوى.','— Train Smart. Perform Strong.':'— تدرب بذكاء. حقق أداءً أقوى.','MZ ACTIVE':'MZ ACTIVE',
    'English':'العربية','العربية':'English','Sign out':'تسجيل الخروج',
    'People often hesitate when asked for a review because they don’t know what to write.':'',
    'الكل':'All','الجري والـPacing':'Running & pacing','الدراجات':'Cycling','السباحة':'Swimming','القوة واللياقة':'Strength & fitness',
    'MZ Active | Train Smart. Perform Strong.':'MZ Active | تدرب بذكاء. حقق أداءً أقوى.','Find a Coach | MZ Active':'اعثر على مدرب | MZ Active','Training Programmes | MZ Active':'البرامج التدريبية | MZ Active','Performance Marketplace | MZ Active':'سوق الأداء الرياضي | MZ Active'
  };
  const english = {
    'الرئيسية':'Home','ابحث عن مدرب':'Find a Coach','انضم كمدرب':'Join as a Coach','انضم كمدرب أو مرافق جري':'Join as a Coach or Pacer','استكشف':'Explore','البرامج التدريبية':'Training programs','المقالات':'Articles','الفعاليات':'Events','مرافقو السباقات':'Champion Pacers','تسجيل الدخول':'Log In','إنشاء حساب':'Sign Up','ابحث في المقالات':'Search articles',
    'Coaching · التدريب':'Coaching','Find Your Coach · اعثر على مدربك':'Find Your Coach','Events & Team · الفعاليات والفريق':'Events & Team','Join Us · انضم إلينا':'Join Us','My Profile · ملفي':'My Profile',
    'Privacy notice · إشعار الخصوصية':'Privacy notice','Information and purpose · المعلومات والغرض':'Information and purpose','Service providers and location · مقدمو الخدمة ومكان البيانات':'Service providers and data location','Retention · مدة الاحتفاظ':'Retention','Contact · التواصل':'Contact','Back to MZ Active · العودة للموقع':'Back to MZ Active',
    'Preview the plan / معاينة الخطة':'Preview the plan','اطلب البرنامج بالعربية':'Get the programme','الكل':'All','الجري والـPacing':'Running & pacing','الدراجات':'Cycling','السباحة':'Swimming','القوة واللياقة':'Strength & fitness'
  };
  const pages = {
    'blog.html': {'MZ ACTIVE · TRAIN SMART. PERFORM STRONG.':'MZ ACTIVE · تدرب بذكاء. حقق أداءً أقوى.','Running, endurance<br>and performance.':'الجري والتحمل<br>والأداء الرياضي.','Ideas and practical guidance from the MZ Active archive.':'مقالات وإرشادات عملية من أرشيف MZ Active.','Articles':'المقالات','No articles match your search.':'لا توجد مقالات تطابق بحثك.','Back to MZ Active':'العودة إلى موقع MZ Active'},
    'index.html': {
      'Find Your Coach | MZ Active':'اعثر على مدربك | MZ Active',
      'QATAR · ENDURANCE · PERFORMANCE':'قطر · التحمل · الأداء','FIND YOUR COACH.':'اعثر على مدربك.','FIND YOUR PACE.':'اختر وتيرتك.',
      'Discover coaches and pacers for your next goal in Qatar. Explore support, send a booking request and confirm availability directly with MZ Active.':'اكتشف المدربين ومرافقي الجري لتحقيق هدفك القادم في قطر. اطّلع على الخدمات وأرسل طلب حجز، ثم أكّد التوفر مباشرةً مع MZ Active.',
      'Find a Coach or Pacer':'اعثر على مدرب أو مرافق جري','Join as a Coach or Pacer':'انضم كمدرب أو مرافق جري','Simple to get started':'خطوات بسيطة للبدء','Find support. Request a match. Get moving.':'اعثر على الدعم. أرسل طلباً. وابدأ.',
      'For running, pacing, endurance and performance coaching across Doha, Lusail, Al Wakrah and beyond.':'خدمات للجري وضبط الوتيرة والتحمل والتدريب الرياضي في أنحاء قطر.','01 / EXPLORE':'01 / اكتشف','Choose your support':'اختر الدعم المناسب','Browse coach and pacer services by specialty and location.':'تصفح خدمات المدربين ومرافقي الجري حسب التخصص.','02 / REQUEST':'02 / أرسل طلباً','Tell us your goal':'أخبرنا بهدفك','Send a request with your preferred service, area and timing. No online payment is required.':'أرسل طلباً يتضمن الخدمة والمنطقة والوقت المناسب. لا يتطلب ذلك دفعاً إلكترونياً.','03 / CONFIRM':'03 / أكّد التفاصيل','Agree the details':'اتفق على التفاصيل','MZ Active checks availability. Your booking is confirmed only after the service and terms are agreed.':'يتحقق فريق MZ Active من التوفر. ولا يتأكد الحجز إلا بعد الاتفاق على الخدمة والشروط.','Explore Coaches & Pacers':'اكتشف المدربين ومرافقي الجري',
      'What we do':'خدماتنا','Training built around performance.':'تدريب يركز على الأداء.','Clear plans. Consistent work. Coaching that connects training decisions to measurable progress.':'خطط واضحة وتدريب منتظم يربط كل خطوة بتقدم يمكن قياسه.','01 / ENDURANCE':'01 / التحمل','Endurance Coaching':'تدريب التحمل','Running and multisport preparation, from building your aerobic base to race-specific performance.':'الاستعداد للجري والرياضات المتعددة، من تطوير القدرة الهوائية إلى التحضير للسباقات.','02 / STRENGTH':'02 / القوة','Strength & Conditioning':'القوة واللياقة','Purposeful strength work to improve durability, movement quality and athletic performance.':'تمارين قوة هادفة لتحسين القدرة البدنية وجودة الحركة والأداء الرياضي.','03 / ONLINE':'03 / التدريب عن بُعد','Online Training':'التدريب عن بُعد','Structured training guidance and practical support to help you stay consistent wherever you train.':'إرشادات تدريب منظمة ودعم عملي لمساعدتك على الاستمرار أينما كنت.','04 / PACING':'04 / مرافقة السباقات','Get Paced by the Champions':'ارفع أداءك مع الأبطال','Hit your target splits with confidence. Request a reviewed Qatar pacer for race day or a key training run.':'حقق الوتيرة المستهدفة بثقة. اطلب مرافق جري معتمداً في قطر للسباق أو لحصة تدريب مهمة.','Book a Champion Pacer':'احجز مرافقاً من الأبطال',
      'Qatar endurance community':'مجتمع التحمل في قطر','Train for your next finish line.':'استعد لخط النهاية القادم.','Arabic and English support for runners across Qatar. Athlete stories appear only with their permission; share your race experience with MZ Active.':'دعم بالعربية والإنجليزية للعدائين في أنحاء قطر. لا تُنشر قصص الرياضيين إلا بموافقتهم. شارك تجربتك في السباق مع MZ Active.','Share your story':'شارك قصتك','Bayrak Ultra':'بيرق ألترا','Samla':'صملة',
      'The MZ Active approach':'نهج MZ Active','Discipline over shortcuts.':'الانضباط قبل الحلول السريعة.','Good performance is built through intelligent training, patience and repeatable habits. Every session should have a reason.':'يُبنى الأداء الجيد بالتدريب الذكي والصبر والعادات المستمرة. ولكل حصة تدريبية هدف.','“Train with purpose. Compete with confidence. Keep getting better.”':'«تدرب بهدف. نافس بثقة. وواصل التطور.»','تدريب منظم، أهداف واضحة، وتطور مبني على الاستمرارية والانضباط.':'تدريب منظم وأهداف واضحة وتطور قائم على الاستمرارية والانضباط.',
      'Start here':'ابدأ من هنا','Ready to train smarter?':'هل أنت مستعد للتدرب بذكاء؟','Tell us about your goals and the event you are preparing for.':'أخبرنا بأهدافك والفعالية التي تستعد لها.','WhatsApp MZ Active':'تواصل مع MZ Active عبر واتساب','Email us':'راسلنا عبر البريد','Qatar · Online coaching available':'قطر · التدريب عن بُعد متاح',
      'Want to sponsor MZ Active or support an athlete, event or new idea?':'هل ترغب في رعاية MZ Active أو دعم رياضي أو فعالية أو فكرة جديدة؟','We’re open to sponsorships, partnerships and people who want to help make a positive impact in sport.':'نرحب بالرعاية والشراكات وبكل من يرغب في إحداث أثر إيجابي في الرياضة.','Events & community:':'الفعاليات والمجتمع:','The Team':'الفريق','Blog':'المدونة','© 2026 MZ Active. All rights reserved.':'© 2026 MZ Active. جميع الحقوق محفوظة.'
    },
    'training-programmes.html': {
      'MZ ACTIVE · TRAIN SMART. PERFORM STRONG.':'MZ ACTIVE · تدرب بذكاء. حقق أداءً أقوى.','TRAINING PROGRAMMES BUILT FOR PROGRESS.':'برامج تدريبية تصنع التقدم.','Choose a structured plan, understand the training objective and build consistency with a clear programme.':'اختر خطة منظمة، وافهم هدف التدريب، وواصل التقدم من خلال برنامج واضح.','AVAILABLE NOW':'متاح الآن','Start with a focused 4-week trial.':'ابدأ ببرنامج تجريبي مكثف لأربعة أسابيع.','RUNNING · 4 WEEKS':'الجري · 4 أسابيع','4-Week 10K Performance Trial':'برنامج تجريبي لأربعة أسابيع لتحسين أداء 10 كلم','A practical four-week plan with easy running, quality sessions, strength and recovery guidance. Review the programme details before purchase.':'خطة عملية لأربعة أسابيع تشمل الجري السهل والحصص النوعية وتمارين القوة وإرشادات الاستشفاء. راجع تفاصيل البرنامج قبل الشراء.','VIEW PROGRAMME · US$14 ↗':'اطّلع على البرنامج · 14 دولاراً أمريكياً ↗','COMING NEXT':'قريباً','More running programmes':'برامج جري إضافية','Additional plans for 5K, half marathon, marathon and endurance development will be added after the first product is validated.':'ستُضاف خطط لمسافات 5 كلم ونصف الماراثون والماراثون وتطوير التحمل بعد تقييم البرنامج الأول.','PERSONAL COACHING':'تدريب شخصي','Need individual guidance?':'هل تحتاج إلى توجيه فردي؟','For personalised coaching and registration, use the existing MZ Active coaching route. This is separate from buying a digital plan.':'للتدريب الشخصي والتسجيل، استخدم مسار التدريب الحالي لدى MZ Active. وهو منفصل عن شراء البرامج الرقمية.','BOOK YOUR TRAINING ↗':'احجز تدريبك ↗','This page currently lists the existing 4-week product only. It does not claim that additional programmes, subscriptions or automatic coaching services are already available.':'تعرض هذه الصفحة حالياً البرنامج المتاح لأربعة أسابيع فقط. ولا تدّعي توفر برامج إضافية أو اشتراكات أو خدمات تدريب آلية.','Find Your Coach':'اعثر على مدربك'
    },
    'privacy.html': {
      'Privacy notice | MZ Active':'إشعار الخصوصية | MZ Active','Privacy notice · إشعار الخصوصية':'إشعار الخصوصية','Information and purpose · المعلومات والغرض':'المعلومات والغرض','Service providers and location · مقدمو الخدمة ومكان البيانات':'مقدمو الخدمة ومكان البيانات','Retention · مدة الاحتفاظ':'مدة الاحتفاظ','Contact · التواصل':'التواصل','Back to MZ Active · العودة للموقع':'العودة إلى موقع MZ Active',
      'This notice explains how MZ Active handles Coach/Pacer applications and booking requests on mzactive.com. By submitting a form, you consent to the described use of the information you provide. Contact':'يوضح هذا الإشعار كيفية تعامل MZ Active مع طلبات المدربين ومرافقي الجري والحجوزات على mzactive.com. بإرسال النموذج، فإنك توافق على استخدام المعلومات المقدمة للأغراض الموضحة. للتواصل أو طلب نسخة من بياناتك أو تصحيحها أو حذفها، راسلنا على',
      'Provider applications may include name, account email, Qatar service area, languages, specialties, experience, biography, achievements, personal bests, comfortable pace, indicative rates, availability and a public Strava/Garmin link. MZ Active uses these details to create and review a profile. Only profiles approved by an administrator are shown publicly. Profile photos are not accepted by the current form.':'قد تتضمن طلبات مقدمي الخدمات الاسم والبريد الإلكتروني ومنطقة الخدمة في قطر واللغات والتخصصات والخبرة والسيرة المهنية والإنجازات والأرقام الشخصية والوتيرة المريحة والأسعار الاسترشادية والتوفر ورابطاً عاماً لحساب Strava أو Garmin. تستخدم MZ Active هذه البيانات لإنشاء الملف ومراجعته. ولا تظهر للعامة إلا الملفات التي تعتمدها الإدارة. لا يقبل النموذج الحالي الصور الشخصية.',
      'Booking requests include name, WhatsApp number, Qatar location, preferred date, session type, distance and target pace. We use them to review availability and arrange the requested session. After a request is saved, your browser opens WhatsApp with the request details so you can coordinate manually with MZ Active and receive Fawran instructions. A request is not a confirmed booking; the website does not process payments or store card or bank credentials.':'تتضمن طلبات الحجز الاسم ورقم واتساب والموقع في قطر والتاريخ المفضل ونوع الحصة والمسافة والوتيرة المستهدفة. نستخدمها للتحقق من التوفر وترتيب الحصة المطلوبة. بعد حفظ الطلب، يفتح متصفحك واتساب متضمناً تفاصيله لتنسيق الحجز يدوياً مع MZ Active والحصول على تعليمات الدفع عبر فَوْران. لا يُعد الطلب حجزاً مؤكداً؛ ولا يعالج الموقع المدفوعات أو يخزن بيانات البطاقات أو الحسابات المصرفية.',
      'The marketplace API and its separate database run on Cloudflare Workers/D1; the database is in the APAC region, not Qatar. Booking details are sent to WhatsApp (Meta) only in the handoff initiated after a successful save. Approved profile details are public on mzactive.com. Do not include health records, identity documents or other sensitive information in profile or booking text.':'تعمل واجهة المنصة وقاعدة بياناتها المنفصلة على Cloudflare Workers وD1. وتقع قاعدة البيانات في منطقة آسيا والمحيط الهادئ، وليس في قطر. لا تُرسل تفاصيل الحجز إلى واتساب (Meta) إلا عند بدء التحويل بعد نجاح حفظ الطلب. وتكون تفاصيل الملفات المعتمدة ظاهرة للعامة على mzactive.com. يرجى عدم إدراج سجلات صحية أو وثائق هوية أو معلومات حساسة أخرى في الملف أو طلب الحجز.',
      'Booking requests and moderation records are retained for up to 12 months after the request is closed, then deleted. Provider account/profile details are retained while the account is active; inactive accounts are deleted after 24 months, or earlier on a verified deletion request, except where records must be retained to resolve a dispute or comply with law.':'نحتفظ بطلبات الحجز وسجلات المراجعة مدة تصل إلى 12 شهراً بعد إغلاق الطلب، ثم نحذفها. ونحتفظ ببيانات حساب مقدم الخدمة وملفه ما دام الحساب نشطاً؛ وتحذف الحسابات غير النشطة بعد 24 شهراً أو قبل ذلك عند تلقي طلب حذف موثّق، إلا إذا لزم الاحتفاظ بسجلات لحل نزاع أو امتثالاً للقانون.',
      'Questions or access, correction and deletion requests:':'للاستفسارات أو لطلب الوصول إلى بياناتك أو تصحيحها أو حذفها:',
      '. This notice is operational information and does not claim a legal compliance certification.':'. هذا الإشعار يوضح الممارسات التشغيلية ولا يمثل شهادة امتثال قانوني.'
    },
    'vision.html': {
      'Our Vision | MZ Active':'رؤيتنا | MZ Active',
      'MZ Active corporate vision, live products, future initiatives and partnership inquiries.':'رؤية MZ Active المؤسسية ومنتجاتها الحالية ومبادراتها المستقبلية وفرص الشراكة.'
    },
    'admin.html': {
      'MZ Active Admin Portal | Private access':'بوابة إدارة MZ Active | دخول خاص','Marketplace review | MZ Active':'مراجعة المنصة | MZ Active','MZ Active Admin Portal':'بوابة إدارة MZ Active','Marketplace review':'مراجعة المنصة','Admin-only queue for provider profiles and booking requests. Approving a booking request does not collect payment or guarantee final availability.':'لوحة خاصة بالإدارة لمراجعة ملفات مقدمي الخدمات وطلبات الحجز. لا يؤدي قبول الطلب إلى تحصيل الدفع أو ضمان التوفر النهائي.','Admin sign in':'دخول الإدارة','Email':'البريد الإلكتروني','Password':'كلمة المرور','Sign in':'تسجيل الدخول','Set up the first Admin account':'إعداد حساب الإدارة الأول','Only works after the site owner configures the email allowlist and one-time setup key in Worker settings. Keep the key private.':'يتطلب إعداد قائمة البريد الإلكتروني ومفتاح الإعداد لمرة واحدة في إعدادات Worker. احتفظ بالمفتاح بسرية.','Allowlisted Admin email':'البريد الإلكتروني المعتمد للإدارة','Password (12+ characters)':'كلمة المرور (12 حرفاً على الأقل)','One-time Admin setup key':'مفتاح إعداد الإدارة لمرة واحدة','Create Admin account':'إنشاء حساب الإدارة','Profiles awaiting review':'ملفات بانتظار المراجعة','Approved coaches and pacers':'المدربون ومرافقو الجري المعتمدون','Removed coach accounts':'حسابات المدربين الموقوفة','Booking requests':'طلبات الحجز','Coach blog posts awaiting review':'مقالات المدربين بانتظار المراجعة','Upload or replace a photo with the coach’s permission (JPG, PNG, or WebP, up to 1 MB). You can remove coach access here; their team and training history are kept.':'حمّل صورة بموافقة المدرب أو استبدلها (JPG أو PNG أو WebP، بحد أقصى 1 ميغابايت). يمكنك إيقاف وصول المدرب مع الاحتفاظ بسجل الفريق والتدريب.','Removed accounts cannot sign in to the coach dashboard or appear publicly. Restore an account here if needed.':'لا يمكن للحسابات الموقوفة الدخول إلى لوحة المدرب أو الظهور للعامة. يمكنك إعادة تفعيل الحساب عند الحاجة.','Published posts appear on the MZ Active blog. Returning a post sends it back to the coach as a draft for changes.':'تظهر المقالات المنشورة في مدونة MZ Active. تؤدي إعادة المقال إلى المدرب إلى حفظه كمسودة لإجراء التعديلات.','MZActive AI Brain':'مساعد MZActive الذكي','Agents read live MZActive queue counts and create reviewable drafts. They cannot approve profiles, change bookings, publish articles, or make payments.':'تطّلع الأدوات على أعداد الطلبات الحالية وتنشئ مسودات للمراجعة. ولا يمكنها اعتماد الملفات أو تغيير الحجوزات أو نشر المقالات أو إجراء المدفوعات.','Agent status':'حالة الأداة','Live business snapshot':'ملخص العمل المباشر','Task history':'سجل المهام','Activity log':'سجل النشاط','Loading status...':'جارٍ تحميل الحالة...','Loading data...':'جارٍ تحميل البيانات...','Agent':'الأداة','Operations':'العمليات','Marketing':'التسويق','Customer support':'دعم العملاء','Website monitoring':'مراقبة الموقع','Business analytics':'تحليلات الأعمال','Request':'الطلب','Describe the decision or paste verified observations...':'صف القرار المطلوب أو أضف ملاحظات موثقة...','Run agent':'تشغيل الأداة','Describe the request or paste verified observations first.':'صف الطلب أو أضف ملاحظات موثقة أولاً.','Generating a draft…':'جارٍ إنشاء مسودة…','The shared daily AI limit has been reached. Please try again tomorrow.':'تم بلوغ الحد اليومي المشترك لاستخدام الذكاء الاصطناعي. حاول مجدداً غداً.','Please wait before generating another draft.':'يرجى الانتظار قبل إنشاء مسودة أخرى.','No agent activity yet.':'لا يوجد نشاط للأدوات حتى الآن.','Available':'متاح','running':'قيد التشغيل','Waiting for owner review':'بانتظار مراجعة المالك','Source':'المصدر','Approval':'الاعتماد','Approve':'اعتماد','Reject':'رفض','Mark reviewing':'بدء المراجعة','Accept request':'قبول الطلب','Decline':'رفض الطلب','Confirm Fawran received':'تأكيد استلام فَوْران','No profiles awaiting review.':'لا توجد ملفات بانتظار المراجعة.','No approved profiles yet.':'لا توجد ملفات معتمدة بعد.','No removed coach accounts.':'لا توجد حسابات مدربين موقوفة.','No open booking requests.':'لا توجد طلبات حجز مفتوحة.','No coach articles awaiting review.':'لا توجد مقالات للمدربين بانتظار المراجعة.'
    },
    '4-week-10k/index.html': {
      '4-Week 10K Performance Trial | MZ Active':'برنامج تجريبي لأربعة أسابيع لتحسين 10 كلم | MZ Active','← Back to MZ Active':'← العودة إلى MZ Active','MZ Active · Digital training plan':'MZ Active · خطة تدريب رقمية','4-WEEK':'4 أسابيع','10K PERFORMANCE':'أداء 10 كلم','TRIAL':'تجريبي','A clear four-week training structure to help you build consistency, develop aerobic fitness and practise controlled 10K-focused work. Train with purpose — not guesswork.':'خطة تدريبية واضحة لأربعة أسابيع تساعدك على الالتزام وتطوير اللياقة الهوائية والتدرب لسباق 10 كلم. تدرب بهدف ووضوح.','One-time purchase · Four weeks · Self-guided plan':'شراء لمرة واحدة · أربعة أسابيع · خطة ذاتية','Get the programme':'احصل على البرنامج','اطلب البرنامج بالعربية':'احصل على البرنامج','Preview the plan / معاينة الخطة':'استعرض الخطة','English':'العربية','العربية':'English','WhatsApp order and payment confirmation are handled manually at launch. Instant online checkout is not yet enabled.':'تُنسّق الطلبات وتأكيدات الدفع عبر واتساب يدوياً عند الإطلاق. الدفع الإلكتروني الفوري غير متاح حالياً.','Who it is for':'الفئة المناسبة','A practical trial for consistent runners.':'برنامج تجريبي عملي للعدائين المنتظمين.','Suitable starting point':'نقطة البداية المناسبة','You can already run continuously for around 30 minutes, are healthy enough for running, and want a structured introduction to 10K-focused training.':'ينبغي أن تكون قادراً على الجري المتواصل لنحو 30 دقيقة، وبحالة صحية تسمح بالجري، وترغب في بدء تدريب منظم لمسافة 10 كلم.','What you get':'محتويات البرنامج','Four weekly schedules, easy-run guidance, controlled intervals, a weekly longer run, two short strength sessions and recovery guidance.':'أربعة جداول أسبوعية، وإرشادات للجري السهل والفترات المنضبطة والجري الطويل الأسبوعي وحصتين قصيرتين للقوة وإرشادات للاستشفاء.','This is a general training template, not individualized coaching or medical advice. If you are new to running, returning from injury, or managing a health concern, seek appropriate professional guidance before starting.':'هذه خطة تدريب عامة وليست تدريباً فردياً أو نصيحة طبية. إذا كنت مبتدئاً أو عائداً من إصابة أو تتعامل مع حالة صحية، فاستشر مختصاً مناسباً قبل البدء.','Four-week structure':'خطة الأسابيع الأربعة','Your training roadmap':'مسار تدريبك','Run four days per week. Keep easy sessions genuinely easy. All quality sessions include 10–15 minutes of easy warm-up and 10 minutes of cool-down.':'اركض أربعة أيام أسبوعياً، وحافظ على سهولة حصص الجري السهل. تبدأ الحصص النوعية بإحماء سهل من 10 إلى 15 دقيقة وتنتهي بتهدئة لمدة 10 دقائق.','Training rules':'قواعد التدريب','How to use the plan':'كيفية استخدام الخطة','Leave at least one easy or rest day between demanding sessions.':'اترك يوماً سهلاً أو يوم راحة على الأقل بين الحصص المجهدة.','Easy running should allow full-sentence conversation (RPE 3–4/10).':'ينبغي أن يسمح الجري السهل بالتحدث بجمل كاملة (مجهود 3–4 من 10).','Controlled hard work is strong but repeatable; do not sprint the intervals.':'يكون المجهود القوي مضبوطاً وقابلاً للتكرار؛ لا تركض الفترات بأقصى سرعة.','Stop if you experience sharp pain, chest pain, dizziness or unusual shortness of breath.':'توقف إذا شعرت بألم حاد أو ألم في الصدر أو دوار أو ضيق نفس غير معتاد.','In hot conditions, reduce pace, choose cooler hours and hydrate appropriately.':'في الطقس الحار، خفف الوتيرة واختر الأوقات الأبرد واحرص على شرب السوائل.','If fatigue accumulates, remove the optional strides or shorten an easy run rather than forcing the session.':'إذا تراكم التعب، احذف التسارعات الاختيارية أو قلل مدة الجري السهل بدلاً من إجبار نفسك على إكمال الحصة.','Ready to start?':'هل أنت مستعد للبدء؟','Get the four-week MZ Active trial for US$14.':'احصل على برنامج MZ Active التجريبي لأربعة أسابيع مقابل 14 دولاراً أمريكياً.','Order via WhatsApp':'اطلب عبر واتساب','Print / Save as PDF':'طباعة / حفظ بصيغة PDF','MZ Active · Train Smart. Perform Strong. · Qatar · mzactive@yahoo.com':'MZ Active · تدرب بذكاء. حقق أداءً أقوى. · قطر · mzactive@yahoo.com'
    }
  };
  const path = location.pathname.endsWith('/') ? location.pathname + 'index.html' : location.pathname;
  const pageKey = path.includes('/4-week-10k/') ? '4-week-10k/index.html' : path.split('/').pop();
  const page = pages[pageKey] || {};
  const dictionary = {...common, ...page};
  const titleOriginal = document.title;
  let titleSource = titleOriginal;
  let titleRendered = titleOriginal;
  const toggles = [...document.querySelectorAll('.lang-toggle,#lang')];
  const state = window.MZActiveLanguage;
  const icon = (className, path) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add(className);
    svg.innerHTML = path;
    return svg;
  };
  const prepareToggle = toggle => {
    let label = toggle.querySelector('[data-language-label]');
    if (!label) {
      const currentLabel = toggle.textContent.trim();
      toggle.replaceChildren();
      label = document.createElement('span');
      label.dataset.languageLabel = '';
      label.textContent = currentLabel;
      toggle.append(label);
    }
    const globe = toggle.querySelector('svg');
    if (globe) globe.classList.add('language-globe');
    else toggle.prepend(icon('language-globe', '<circle cx="12" cy="12" r="9"></circle><path d="M3.5 9h17M3.5 15h17M12 3c2.4 2.4 3.6 5.4 3.6 9s-1.2 6.6-3.6 9c-2.4-2.4-3.6-5.4-3.6-9S9.6 5.4 12 3Z"></path>'));
    if (!toggle.querySelector('.language-chevron')) {
      toggle.append(icon('language-chevron', '<path d="m7 10 5 5 5-5"></path>'));
    }
    toggle.classList.add('site-language-control');
    return label;
  };
  if (!toggles.length) {
    const host = document.querySelector('header .nav,header .wrap');
    if (host) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lang-toggle';
      button.id = 'siteLanguage';
      button.textContent = 'العربية';
      host.append(button);
      toggles.push(button);
    }
  }
  const original = new WeakMap();
  const originalAttributes = new WeakMap();
  // Nodes handled by the targeted insertion pass are remembered so a second
  // childList record (or our own DOM writes) cannot re-capture translated text
  // as if it were the original English source.
  const processed = new WeakSet();
  const toggleLabels = toggles.map(prepareToggle);
  let observer = null;

  // Shared by the full language pass and the targeted insertion pass so both
  // keep exactly the same skip semantics for authored/user content.
  const textSkipSelector = '[data-en][data-ar],[data-language-skip],.wa-chat-float,[data-user-content],[data-authored],[contenteditable="true"],.user-content,.user-bio,.profile-bio,.post-content,.comment-content,.desc,.bio,.user-message,.coach-bio,.coach-card h3,.coach-card .coach-location,.coach-card .coach-specialty,.name h3,#coachProfileName,.pill,.social-link,.article h1,.article .content,.program-history-item h3,.program-history-item .program-week-grid span,.program-history-item p.muted:last-child,.studio-workout strong,.studio-workout span,.studio-library button';
  const attrSkipSelector = '.wa-chat-float,[data-user-content],[data-authored],[contenteditable="true"],.user-content,.user-bio,.profile-bio,.post-content,.comment-content,.desc,.bio,.user-message,.coach-bio,.coach-card h3,.coach-card .coach-location,.coach-card .coach-specialty,.name h3,#coachProfileName,.pill,.social-link,.article h1,.article .content,.program-history-item h3,.program-history-item .program-week-grid span,.program-history-item p.muted:last-child,.studio-workout strong,.studio-workout span,.studio-library button';

  const markProcessed = root => {
    if (!root) return;
    processed.add(root);
    if (root.nodeType === 1 && typeof document.createTreeWalker === 'function') {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
      let node;
      while ((node = walker.nextNode())) processed.add(node);
    } else if (typeof root.querySelectorAll === 'function') {
      root.querySelectorAll('*').forEach(el => processed.add(el));
    }
  };

  const setBilingualContent = (el, value) => {
    const children = [...el.children];
    if (children.length && children.every(child => child.hasAttribute('aria-hidden')) && !value.includes('<')) {
      const label = [...el.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim());
      if (label) {
        const leading = label.nodeValue.match(/^\s*/)[0];
        const trailing = label.nodeValue.match(/\s*$/)[0];
        const next = `${leading}${value}${trailing}`;
        if (label.nodeValue !== next) label.nodeValue = next;
      } else {
        el.insertBefore(document.createTextNode(value), children[0]);
      }
      markProcessed(el);
      return;
    }
    const template = document.createElement('template');
    template.innerHTML = value;
    if (el.innerHTML !== template.innerHTML) {
      el.innerHTML = value;
      markProcessed(el);
    }
  };

  const translateTextNode = (node, ar) => {
    if (node.parentElement?.closest(textSkipSelector)) return;
    if (!original.has(node)) original.set(node, node.nodeValue);
    const base = original.get(node);
    const trimmed = base.trim();
    if (!trimmed) return;
    const translated = dictionary[trimmed];
    if (translated || english[trimmed]) {
      const value = base.replace(trimmed, ar ? (translated || trimmed) : (english[trimmed] || trimmed));
      if (node.nodeValue !== value) node.nodeValue = value;
    }
  };

  const translateTextWalker = (root, ar) => {
    if (!root || typeof document.createTreeWalker !== 'function') return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) translateTextNode(node, ar);
  };

  const translateAttributes = (el, ar, lang) => {
    if (el.closest(attrSkipSelector)) return;
    let saved = originalAttributes.get(el);
    if (!saved) {
      saved = new Map();
      originalAttributes.set(el, saved);
    }
    for (const attr of ['placeholder', 'aria-label', 'alt', 'title']) {
      if (!el.hasAttribute(attr)) continue;
      if (!saved.has(attr)) saved.set(attr, el.getAttribute(attr));
      const base = saved.get(attr);
      const translated = el.getAttribute(`data-${lang}-${attr}`);
      const value = translated || (ar ? (dictionary[base] || base) : base);
      if (el.getAttribute(attr) !== value) el.setAttribute(attr, value);
    }
  };

  const queryAll = (root, selector) => {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    const matches = [...root.querySelectorAll(selector)];
    if (root.nodeType === 1 && typeof root.matches === 'function' && root.matches(selector)) matches.unshift(root);
    return matches;
  };

  // Scoped to a newly inserted node (element, text node or fragment) rather
  // than the whole body, so AJAX/chat updates stay translated without a rescan.
  const translateNode = (node, lang) => {
    const ar = lang === 'ar';
    if (node.nodeType === Node.TEXT_NODE) {
      translateTextNode(node, ar);
      return;
    }
    if (node.nodeType !== 1 && typeof node.querySelectorAll !== 'function') return;
    queryAll(node, '[data-en][data-ar]').forEach(el => setBilingualContent(el, el.dataset[lang]));
    translateTextWalker(node, ar);
    queryAll(node, '[placeholder],[aria-label],[alt],[title]').forEach(el => translateAttributes(el, ar, lang));
    queryAll(node, '.ar-only,.en-only').forEach(el => {
      if (el.classList.contains('ar-only') && el.hidden !== !ar) el.hidden = !ar;
      if (el.classList.contains('en-only') && el.hidden !== ar) el.hidden = ar;
    });
    markProcessed(node);
  };

  // Full document pass: only for startup and explicit language changes.
  function apply(lang) {
    const ar = lang === 'ar';
    const dir = ar ? 'rtl' : 'ltr';
    if (document.documentElement.lang !== lang) document.documentElement.lang = lang;
    if (document.documentElement.dir !== dir) document.documentElement.dir = dir;
    if (document.body.dir !== dir) document.body.dir = dir;
    if (document.body.classList.contains('rtl') !== ar) document.body.classList.toggle('rtl', ar);
    const customHandler = document.body.dataset.languageHandler === 'custom';
    if (!customHandler) {
      if (document.title !== titleRendered) titleSource = document.title;
      document.title = ar ? (dictionary[titleSource] || titleSource) : titleSource;
      titleRendered = document.title;
    }
    if (!customHandler) {
      document.querySelectorAll('[data-en][data-ar]').forEach(el => setBilingualContent(el, el.dataset[lang]));
      translateTextWalker(document.body, ar);
      document.querySelectorAll('[placeholder],[aria-label],[alt],[title]').forEach(el => translateAttributes(el, ar, lang));
    }
    toggles.forEach((toggle, index) => {
      const label = ar ? 'English' : 'العربية';
      if (toggleLabels[index].textContent !== label) toggleLabels[index].textContent = label;
      const ariaLabel = ar ? 'التبديل إلى الإنجليزية' : 'Switch to Arabic';
      if (toggle.getAttribute('aria-label') !== ariaLabel) toggle.setAttribute('aria-label', ariaLabel);
    });
    document.body.querySelectorAll('.ar-only').forEach(el=>{ if(el.hidden !== !ar) el.hidden=!ar; });
    document.body.querySelectorAll('.en-only').forEach(el=>{ if(el.hidden !== ar) el.hidden=ar; });
  }

  // childList only: no characterData/attributes observation, so our own text
  // and attribute writes cannot trigger another full rescan.
  const observerOptions = {subtree: true, childList: true};
  let pendingNodes = [];
  let flushScheduled = false;
  let flushHandle = null;

  const cancelFlush = () => {
    if (flushHandle === null) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(flushHandle);
    else clearTimeout(flushHandle);
    flushHandle = null;
    flushScheduled = false;
  };

  const flushPending = () => {
    flushScheduled = false;
    flushHandle = null;
    const nodes = pendingNodes;
    pendingNodes = [];
    if (!nodes.length) return;
    const lang = state.get();
    for (const node of nodes) {
      if (processed.has(node)) continue;
      if (node.isConnected === false) continue;
      processed.add(node);
      translateNode(node, lang);
    }
  };

  const scheduleFlush = () => {
    if (flushScheduled) return;
    flushScheduled = true;
    if (typeof requestAnimationFrame === 'function') flushHandle = requestAnimationFrame(flushPending);
    else flushHandle = setTimeout(flushPending, 0);
  };

  const enqueueAdded = node => {
    if (!node) return;
    if (node.nodeType === 11) {
      [...node.childNodes].forEach(enqueueAdded);
      return;
    }
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === 1) pendingNodes.push(node);
  };

  toggles.forEach(toggle => toggle.addEventListener('click', () => state.set(state.get() === 'ar' ? 'en' : 'ar', {manual:true})));
  document.addEventListener('mzactive:language-change', event => {
    if (observer) observer.disconnect();
    pendingNodes = [];
    cancelFlush();
    apply(event.detail.lang);
    if (observer) observer.observe(document.body, observerOptions);
  });
  observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type !== 'childList') continue;
      record.addedNodes.forEach(enqueueAdded);
    }
    scheduleFlush();
  });
  observer.observe(document.body, observerOptions);
  apply(state.get());
})();
