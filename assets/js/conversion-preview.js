(() => {
  if(location.hostname!=='mzactive-conversion-staging.mzactive5.workers.dev')return;
  const activityPreview='https://mzactive-activity-staging.mzactive5.workers.dev/';
  const lang=()=>document.documentElement.lang==='ar'?'ar':'en';
  const make=(tag,en,ar)=>{
    const node=document.createElement(tag);
    if(en){node.dataset.en=en;node.dataset.ar=ar;node.textContent=lang()==='ar'?ar:en}
    return node;
  };
  function link(en,ar,href){
    const a=make('a',en,ar);a.href=href;return a;
  }
  const banner=make('p','Staging only · Use test details. No real bookings or charges.','بيئة اختبار · استخدم بيانات تجريبية. لا يوجد حجز أو دفع فعلي.');
  banner.className='preview-sandbox-label';
  document.body.prepend(banner);
  const update=()=>{
    banner.textContent=banner.dataset[lang()];
    document.querySelectorAll('.preview-mobile-nav [data-en],.preview-tools [data-en],.preview-panel [data-en]').forEach(n=>n.textContent=n.dataset[lang()]);
  };
  const checkout=document.getElementById('completePreviewCheckout');
  if(checkout){
    checkout.onclick=()=>{
      checkout.disabled=true;
      document.getElementById('previewCheckoutStatus').textContent=lang()==='ar'?'اكتملت تجربة الدفع. لم يُحصّل أي مبلغ.':'Test checkout completed. No charge was made.';
    };
  }
  const save=document.getElementById('completePreviewPlan');
  if(save){
    save.onclick=()=>{
      const plan=sessionStorage.getItem('mza-preview-samla-plan');
      if(plan)sessionStorage.setItem('mza-preview-saved-pacing-plan',plan);
      document.getElementById('previewPlanStatus').textContent=plan
        ?(lang()==='ar'?'حُفظت الخطة التجريبية في هذه الصفحة.':'Test pacing plan saved in this tab.')
        :(lang()==='ar'?'احسب خطتك أولاً.':'Calculate a pacing plan first.');
    };
  }
  const mobile=make('nav'); mobile.className='preview-mobile-nav';
  mobile.setAttribute('aria-label',lang()==='ar'?'التنقل السريع':'Quick navigation');
  const tools=make('button','Log / Tools','التسجيل والأدوات');
  tools.type='button';tools.className='preview-tools-button';
  const dialog=make('dialog');dialog.className='preview-tools';dialog.setAttribute('aria-labelledby','previewToolsTitle');
  const heading=make('h2','Log & calculators','السجل والحاسبات');heading.id='previewToolsTitle';
  const close=make('button','Close','إغلاق');close.type='button';close.onclick=()=>dialog.close();
  dialog.append(heading,link('Log or import a workout','سجّل أو استورد نشاطاً',activityPreview),link('Samla 200 calculator','حاسبة صملة ٢٠٠','/samla/'),link('Discover My Pace','اكتشف وتيرتي','/run-iq.html#assessment'),close);
  tools.onclick=()=>dialog.showModal();
  mobile.append(link('Home / Feed','الرئيسية والأنشطة','/community.html#feed'),link('Coaches & Pacers','المدربون والمرافقون','/coaches.html'),tools,link('My Plan','خطتي','/dashboard.html#loginForm'));
  document.body.append(mobile,dialog);
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if(installed)document.body.classList.add('preview-standalone');
  const ua=navigator.userAgent;
  const ios=/iPhone|iPad|iPod/.test(ua) || navigator.platform==='MacIntel' && navigator.maxTouchPoints>1;
  const android=/Android/.test(ua);
  if(!installed && (ios || android)){
    const guide=make('dialog');guide.className='preview-tools';
    const title=make('h2','Add MZA to your Home Screen','أضف تطبيق MZA إلى الشاشة الرئيسية');
    const steps=make('ol');
    steps.append(ios
      ? make('li','In Safari, open the page menu and tap Share.','في سفاري، افتح قائمة الصفحة واضغط على مشاركة.')
      : make('li','In Chrome, open the ⋮ menu.','في كروم، افتح قائمة النقاط الثلاث.'));
    steps.append(ios
      ? make('li','Choose Add to Home Screen, then tap Add.','اختر إضافة إلى الشاشة الرئيسية، ثم اضغط على إضافة.')
      : make('li','Choose Install app or Add to Home screen.','اختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية.'));
    const finish=make('button','Close','إغلاق');finish.type='button';finish.onclick=()=>guide.close();
    const open=make('button','How to install MZA','طريقة تثبيت تطبيق MZA');open.className='preview-install';
    open.type='button';open.onclick=()=>guide.showModal();
    guide.append(title,steps,finish);banner.after(open);document.body.append(guide);
    window.addEventListener('appinstalled',()=>{open.hidden=true;if(guide.open)guide.close()});
    document.addEventListener('mzactive:language-change',()=>{open.textContent=open.dataset[lang()]});
  }
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  document.addEventListener('mzactive:language-change',update);
  update();
})();
