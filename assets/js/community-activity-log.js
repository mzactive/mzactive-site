(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const t = (en, ar) => window.MZActiveLanguage?.get() === 'ar' ? ar : en;
  const token = () => localStorage.getItem('mzactive-provider-session') || sessionStorage.getItem('mzactive-provider-session') || '';
  const panel = $('privateActivityPanel'), form = $('privateActivityForm'), list = $('privateActivityList'), opener = $('openPrivateActivities');
  let coaches = [], activities = [], sequence = 0;
  const status = message => { $('activityLogStatus').textContent = message; };
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  async function api(path, method = 'GET', body) {
    const session = token();
    if (!session) throw new Error('unauthorized');
    const response = await fetch(window.MZACTIVE_API_BASE + '/api/me/' + path, {
      method, headers: {authorization: 'Bearer ' + session, ...(body === undefined ? {} : {'content-type':'application/json'})},
      body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store'
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'request_failed');
    return data;
  }
  function today() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  }
  function fillCoaches(select, selected = '') {
    select.replaceChildren();
    const privateOption = el('option', t('Only me — private','أنا فقط — خاص')); privateOption.value = ''; select.append(privateOption);
    for (const coach of coaches) {
      const option = el('option', coach.display_name); option.value = coach.id; select.append(option);
    }
    if (selected && !coaches.some(c => c.id === selected)) {
      const unavailable = el('option',t('Previous coach — no longer available','المدرب السابق — غير متاح')); unavailable.value = selected; unavailable.disabled = true; select.append(unavailable);
    }
    select.value = selected;
  }
  function metrics(a) {
    const mins = Number(a.duration_minutes), dist = Number(a.distance_km);
    const result = [[t('Time','المدة'),mins.toFixed(1)+' min']];
    if (dist > 0) {
      result.unshift([t('Distance','المسافة'),dist.toFixed(2)+' km']);
      if (a.sport === 'cycling') result.push([t('Speed','السرعة'),(dist*60/mins).toFixed(1)+' km/h']);
      else {
        const sec = Math.round(mins*60/dist/(a.sport === 'swimming' ? 10 : 1));
        result.push([t('Pace','الوتيرة'),Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0')+(a.sport === 'swimming' ? ' /100m' : ' /km')]);
      }
    }
    return result;
  }
  function render() {
    const current = $('privateActivityCoach').value;
    fillCoaches($('privateActivityCoach'),current);
    list.replaceChildren();
    if (!activities.length) { list.append(el('p',t('No saved activities yet.','لا توجد أنشطة محفوظة بعد.'),'note')); return; }
    const sportNames={running:t('Running','الجري'),cycling:t('Cycling','ركوب الدراجات'),swimming:t('Swimming','السباحة'),walking:t('Walking','المشي'),strength:t('Strength','القوة'),other:t('Other','أخرى')};
    for (const a of activities) {
      const card=el('article',undefined,'private-activity-card');
      card.append(el('strong',(sportNames[a.sport] || a.sport)+' · '+a.activity_date));
      card.append(el('small',a.is_owner ? (a.shared_connection_id ? t('Shared with selected coach','مشترك مع المدرب المحدد') : t('Private','خاص')) : t('Shared with you by an athlete','شاركه معك رياضي'),'note'));
      const grid=el('div',undefined,'activity-stat-grid');
      for (const [name,value] of metrics(a)) { const cell=el('div'); cell.append(el('small',name),el('strong',value)); grid.append(cell); }
      card.append(grid);
      if (a.notes) card.append(el('p',a.notes));
      if (a.is_owner) {
        const label=el('label',t('Sharing','المشاركة'));const select=el('select');select.setAttribute('aria-label',t('Sharing for this activity','مشاركة هذا النشاط')); fillCoaches(select,a.shared_connection_id || '');
        label.append(select);const save=el('button',t('Update sharing','حدّث المشاركة'),'button small');save.type='button';
        save.addEventListener('click',async()=>{save.disabled=true;try{await api('activities/'+encodeURIComponent(a.id),'PATCH',{shared_connection_id:select.value||null});await load();status(t('Sharing updated.','تم تحديث المشاركة.'));}catch{status(t('Could not update sharing.','تعذّر تحديث المشاركة.'));}finally{save.disabled=false;}});
        const remove=el('button',t('Delete activity','احذف النشاط'),'button small');remove.type='button';remove.addEventListener('click',async()=>{if(!confirm(t('Delete this private activity?','هل تريد حذف هذا النشاط الخاص؟')))return;remove.disabled=true;try{await api('activities/'+encodeURIComponent(a.id),'DELETE');await load();}catch{status(t('Could not delete activity.','تعذّر حذف النشاط.'));}finally{remove.disabled=false;}});
        const actions=el('div',undefined,'feed-actions');actions.append(save,remove);card.append(label,actions);
      }
      list.append(card);
    }
  }
  async function load() {
    const seq=++sequence;
    const session=token();
    form.hidden=true;list.replaceChildren();coaches=[];activities=[];
    if (!session) { status(t('Sign in to log and view private activities.','سجّل الدخول لتسجيل الأنشطة الخاصة وعرضها.'));return; }
    status(t('Loading activities…','جارٍ تحميل الأنشطة…'));
    try {
      const [a,c]=await Promise.all([api('activities'),api('activity-coaches')]);
      if(seq!==sequence||session!==token()||panel.hidden)return;
      activities=a.activities||[];coaches=c.coaches||[];
      form.hidden=false;render();status('');
    } catch {
      if(seq===sequence)status(t('Activity log unavailable. Please try again.','سجل الأنشطة غير متاح. حاول مجدداً.'));
    }
  }
  opener.addEventListener('click',()=>{
    panel.hidden=!panel.hidden;opener.setAttribute('aria-expanded',String(!panel.hidden));
    if(!panel.hidden){ $('postForm').hidden=true; $('privateActivityDate').value ||= today();load();loadWeek();panel.scrollIntoView({block:'start',behavior:'smooth'}); }
    else{++sequence;form.hidden=true;list.replaceChildren();}
  });
  $('closeActivityLog')?.addEventListener('click',()=>{ if(!panel.hidden) opener.click(); opener.focus(); });
  form.addEventListener('submit',async event=>{
    event.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;
    const distance=$('privateActivityDistance').value;
    try {
      await api('activities','POST',{sport:$('privateActivitySport').value,activity_date:$('privateActivityDate').value,duration_minutes:Number($('privateActivityDuration').value),distance_km:distance?Number(distance):null,notes:$('privateActivityNotes').value,shared_connection_id:$('privateActivityCoach').value||null});
      form.reset();$('privateActivityDate').value=today();await load();loadWeek();status(t('Activity saved.','تم حفظ النشاط.'));
    } catch { status(t('Unable to save activity. Check your information and try again.','تعذّر حفظ النشاط. تحقق من المعلومات وحاول مجدداً.')); }
    finally { submit.disabled=false; }
  });
  async function loadWeek() {
    const session = token();
    const labels = ['socialWeekCount','socialWeekDistance','socialWeekTime'];
    labels.forEach(id=>$(id).textContent='—');
    if (!session) { $('socialWeekStatus').textContent=t('Sign in to view your activity totals.','سجّل الدخول لعرض إحصاءات أنشطتك.'); return; }
    try {
      const data = await api('activities');
      if (session !== token()) return;
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-6);
      const start = [cutoff.getFullYear(),String(cutoff.getMonth()+1).padStart(2,'0'),String(cutoff.getDate()).padStart(2,'0')].join('-');
      const own=(data.activities||[]).filter(a=>a.is_owner && a.activity_date>=start && a.activity_date<=today());
      $('socialWeekCount').textContent=String(own.length);
      $('socialWeekDistance').textContent=own.reduce((sum,a)=>sum+Number(a.distance_km||0),0).toFixed(1)+' km';
      $('socialWeekTime').textContent=Math.round(own.reduce((sum,a)=>sum+Number(a.duration_minutes||0),0))+' min';
      $('socialWeekStatus').textContent='';
    } catch { if(session===token()) $('socialWeekStatus').textContent=t('Activity totals unavailable.','إحصاءات الأنشطة غير متاحة.'); }
  }
  window.addEventListener('storage',event=>{if(event.key==='mzactive-provider-session'&&!panel.hidden)loadWeek();});
  document.addEventListener('mzactive:language-change',()=>{if(!panel.hidden)loadWeek();});
  document.addEventListener('mzactive:language-change',()=>{if(!panel.hidden&&token())render();});
  window.addEventListener('storage',event=>{if(event.key==='mzactive-provider-session'&&!panel.hidden){form.reset();load();}});
})();
