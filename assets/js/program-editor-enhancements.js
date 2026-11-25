(() => {
  'use strict';
  const API = window.MZACTIVE_API_BASE;
  const $ = id => document.getElementById(id);
  const form = $('whatsappTrainingForm'); if (!form) return;
  const key = 'mzactive-provider-session';
  const token = () => sessionStorage.getItem(key) || localStorage.getItem(key);
  const ar = () => document.documentElement.lang === 'ar';
  const t = (en, a) => ar() ? a : en;
  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const sports = [['run','Run','جري'],['bike','Cycling','دراجات'],['swim','Swimming','سباحة'],['strength','Strength','قوة'],['recovery','Recovery','استشفاء'],['other','Other','أخرى']];
  const athleteTypes = [
    ['runner','Runner / الجري'],['triathlon','Triathlon / الترايثلون'],['running','Running / الجري'],
    ['cycling','Cycling / ركوب الدراجات'],['swimming','Swimming / السباحة'],['fitness','Fitness / اللياقة'],
    ['strength','Strength Training / تدريب القوة'],['bodybuilding','Bodybuilding / كمال الأجسام'],
    ['hyrox','HYROX / هايروكس'],['crossfit','CrossFit / كروس فت'],['general','General Fitness / لياقة عامة'],
    ['running_strength','Running + Strength / جري وقوة'],['swim_bike','Swim + Bike / سباحة ودراجات'],
  ];
  let weeks = new Map(), current = '', editingId = '', saveTimer, copiedWeek = null;

  function api(path, options = {}) {
    const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
    if (token()) headers.authorization = 'Bearer ' + token();
    return fetch(API + path, { ...options, headers }).then(async r => {
      let data = {}; try { data = await r.json(); } catch {}
      if (!r.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: r.status });
      return data;
    });
  }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function monday(isoDate) { const d = new Date(isoDate + 'T00:00:00Z'); const diff = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - diff); return iso(d); }
  function addDays(isoDate, n) { const d = new Date(isoDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function unit() { return $('programDurationUnit')?.value || 'weeks'; }
  function value() { return Math.max(1, Math.min(36, Number($('programDurationValue')?.value) || 1)); }
  function startDate() { return $('programStartDate')?.value || $('trainingWeekStart')?.value || ''; }
  function endDate() {
    const s = startDate(); if (!s) return '';
    if (unit() === 'days') return addDays(s, value() - 1);
    if (unit() === 'weeks') return addDays(s, value() * 7 - 1);
    const d = new Date(s + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + value()); d.setUTCDate(d.getUTCDate() - 1); return iso(d);
  }
  function weekKeys() {
    const s = startDate(), e = endDate(); if (!s || !e) return [];
    const keys = [];
    for (let date = s; date <= e; date = addDays(date, 1)) { const m = monday(date); if (!keys.includes(m)) keys.push(m); }
    return keys;
  }
  function sessionValues(day) {
    const field = form.querySelector('[data-day="' + day + '"]'); if (!field) return [];
    const card = field.closest('.session-day');
    return [{ field, sport: card.querySelector('[data-session-type]') }, ...[...card.querySelectorAll('[data-extra-session]')].map(row => ({ field: row.querySelector('textarea'), sport: row.querySelector('select') }))];
  }
  function captureWeek() {
    if (!current) return;
    const sessions = [];
    for (const [i, day] of days.entries()) {
      for (const item of sessionValues(day)) {
        if (!item.field.value.trim()) continue;
        sessions.push({ day_key: day, sport_type: item.sport.value, details: item.field.value.trim(), session_date: addDays(current, i) });
      }
    }
    weeks.set(current, sessions);
  }
  function clearFields() {
    for (const day of days) {
      const list = sessionValues(day); if (!list.length) continue;
      list[0].field.value = ''; list[0].field.closest('.session-day').querySelector('[data-extra-sessions]').replaceChildren();
    }
  }
  function showWeek(weekStart) {
    captureWeek(); clearFields(); current = weekStart;
    $('trainingWeekStart').value = weekStart;
    const rows = weeks.get(weekStart) || [];
    for (const item of rows) {
      const index = days.indexOf(item.day_key); if (index < 0) continue;
      const list = sessionValues(item.day_key);
      let target = list.find(x => !x.field.value.trim());
      if (!target) { form.querySelector('[data-day="' + item.day_key + '"]').closest('.session-day').querySelector('[data-session-add]').click(); target = sessionValues(item.day_key).at(-1); }
      target.field.value = item.details; target.sport.value = item.sport_type;
    }
    $('trainingWeekStart').value = weekStart;
    updateNav(); document.dispatchEvent(new Event('mzactive:program-edited'));
  }
  function payload() {
    captureWeek();
    const list = weekKeys().map(week_start => ({ week_start, sessions: weeks.get(week_start) || [] })).filter(w => w.sessions.length);
    if (!list.length) return null;
    return {
      athlete_name: $('trainingClientName').value.trim(), athlete_phone: $('trainingClientPhone').value.trim(),
      athlete_type: $('athleteType').value, team_id: $('programTeam').value || null, athlete_user_id: $('programAthlete').value || null,
      coach_note: $('weeklyCoachNote').value.trim(), duration_unit: unit(), duration_value: value(),
      start_date: startDate(), end_date: endDate(), week_start: startDate(), weeks: list,
    };
  }
  function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(async () => { try { await api('/api/dashboard/program-draft', { method: 'PUT', body: JSON.stringify({ payload: payload() || {} }) }); } catch {} }, 700); }
  function validDay(day) { const date=addDays(current,days.indexOf(day));return days.includes(day)&&date>=startDate()&&date<=endDate(); }
  function copyWeek(){ if(!window.MZAExercisePicker?.isAuthorized())return;captureWeek();const rows=weeks.get(current)||[];if(!rows.length){shortcutStatus(t('Nothing to copy.','لا توجد حصص للنسخ.'));return;}copiedWeek=rows.map(x=>({...x}));shortcutStatus(t('Week copied. Choose an empty destination week.','تم نسخ الأسبوع. اختر أسبوعاً فارغاً للصق.'));updateNav(); }
  function shortcutStatus(message){const el=$('programShortcutStatus');if(el)el.textContent=message;}
  function pasteWeek(target){if(!window.MZAExercisePicker?.isAuthorized()||!copiedWeek||!weekKeys().includes(target))return;captureWeek();if((weeks.get(target)||[]).length){shortcutStatus(t('Destination already has workouts. Nothing changed.','الأسبوع المستهدف يحتوي على حصص. لم يتغير شيء.'));return;}const rows=copiedWeek.map(x=>({...x,session_date:addDays(target,days.indexOf(x.day_key))}));if(rows.some(x=>x.session_date<startDate()||x.session_date>endDate())){shortcutStatus(t('Some workouts would fall outside the program. Nothing changed.','بعض الحصص خارج مدة البرنامج. لم يتغير شيء.'));return;}weeks.set(target,rows);if(target===current){current='';}showWeek(target);persist();shortcutStatus(t('Week pasted. Original workouts preserved.','تم لصق الأسبوع مع الحفاظ على الحصص الأصلية.'));}
  function templateKey(){return window.MZAExercisePicker?.templateStorageKey()||'';}
  function templateList(){const k=templateKey();if(!k)return [];try{const arr=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(arr)?arr.filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string'&&Array.isArray(x.sessions)&&['days','weeks','months'].includes(x.unit)&&Number.isInteger(x.duration)&&x.duration>=1&&x.duration<=36).slice(0,40):[];}catch{return [];}}
  function storeTemplates(items){const k=templateKey();if(!k)return false;try{localStorage.setItem(k,JSON.stringify(items));document.dispatchEvent(new Event('mzactive:template-library-changed'));return true;}catch{return false;}}
  function saveTemplate(name){const p=payload(),list=templateList();if(!templateKey()||!p||!name.trim()||name.trim().length>100||list.length>=40)return false;const from=new Date(p.start_date+'T00:00:00Z').getTime();const sessions=p.weeks.flatMap(w=>w.sessions).map(s=>({offset:Math.round((new Date(s.session_date+'T00:00:00Z').getTime()-from)/86400000),sport_type:s.sport_type,details:s.details}));if(!sessions.length||sessions.some(s=>s.offset<0||addDays(p.start_date,s.offset)>p.end_date))return false;return storeTemplates([...list,{id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:name.trim(),unit:p.duration_unit,duration:p.duration_value,sessions}]);}
  function applyTemplate(item){
    if(!templateKey()||!item||editingId||payload())return false;
    const start=startDate();if(!start)return false;const oldUnit=unit(),oldValue=value();
    $('programDurationUnit').value=item.unit;$('programDurationValue').value=item.duration;
    const end=endDate(),newWeeks=new Map();
    for(const row of item.sessions){if(!Number.isInteger(row.offset)||row.offset<0||typeof row.details!=='string'||row.details.length>1600||!sports.some(s=>s[0]===row.sport_type)){$('programDurationUnit').value=oldUnit;$('programDurationValue').value=oldValue;return false;}const date=addDays(start,row.offset);if(date>end){$('programDurationUnit').value=oldUnit;$('programDurationValue').value=oldValue;return false;}const week=monday(date),day=days[(new Date(date+'T00:00:00Z').getUTCDay()+6)%7];if(!newWeeks.has(week))newWeeks.set(week,[]);const list=newWeeks.get(week);if(list.length>=35){$('programDurationUnit').value=oldUnit;$('programDurationValue').value=oldValue;return false;}list.push({day_key:day,sport_type:row.sport_type,details:row.details,session_date:date});}
    weeks=newWeeks;current='';showWeek(monday(start));persist();return true;
  }
  function resetProgram(){if(!templateKey())return;if(payload()&&!window.confirm(t('Start a new program? Unsaved edits to the current program will be discarded. Saved programs stay in history.','بدء برنامج جديد؟ سيتم تجاهل التعديلات غير المحفوظة، وتبقى البرامج المحفوظة في السجل.')))return;editingId='';weeks=new Map();copiedWeek=null;current='';for(const id of ['trainingClientName','trainingClientPhone','weeklyCoachNote','programTeam','programAthlete'])if($(id))$(id).value='';$('programDurationUnit').value='weeks';$('programDurationValue').value='1';showWeek(monday(startDate()));persist();shortcutStatus(t('New program ready.','البرنامج الجديد جاهز.')); }
  function mountTemplates(toolbar){
    const open=document.createElement('button');open.type='button';open.id='programTemplates';open.className='secondary';open.hidden=true;open.textContent=t('Program templates','قوالب البرامج');const fresh=document.createElement('button');fresh.type='button';fresh.id='studioNewProgram';fresh.className='secondary';fresh.hidden=true;fresh.textContent=t('New program','برنامج جديد');fresh.onclick=resetProgram;toolbar.append(fresh,open);
    const dialog=document.createElement('dialog');dialog.className='studio-dialog';dialog.id='programTemplatesDialog';document.body.append(dialog);
    function render(){dialog.replaceChildren();const heading=document.createElement('h2'),help=document.createElement('p'),name=document.createElement('input'),save=document.createElement('button'),status=document.createElement('p'),close=document.createElement('button');heading.textContent=t('My program templates','قوالب برامجي');help.textContent=t('Saved in this browser only. Do not include private athlete details in workout text. Apply to an empty new program using its selected start date.','تحفظ في هذا المتصفح فقط. لا تدرج بيانات الرياضي الخاصة في نص الحصة. طبق القالب على برنامج جديد فارغ حسب تاريخ بدايته المختار.');name.placeholder=t('Template name','اسم القالب');name.setAttribute('aria-label',name.placeholder);name.maxLength=100;save.type=close.type='button';save.textContent=t('Save current program as template','حفظ البرنامج الحالي كقالب');close.textContent=t('Close','إغلاق');status.setAttribute('role','status');
      save.onclick=()=>{if(saveTemplate(name.value)){render();dialog.querySelector('[role=status]').textContent=t('Template saved.','تم حفظ القالب.');}else status.textContent=t('Enter a name and valid workouts; maximum 40 templates.','أدخل اسماً وحصصاً صالحة؛ الحد الأقصى 40 قالباً.');};close.onclick=()=>dialog.close();dialog.append(heading,help,name,save,status);
      for(const item of templateList()){const row=document.createElement('div'),title=document.createElement('strong'),apply=document.createElement('button'),remove=document.createElement('button');row.className='mza-template-row';title.textContent=item.name+' · '+item.sessions.length+' '+t('workouts','حصص');apply.type=remove.type='button';apply.className=remove.className='secondary';apply.textContent=t('Use template','استعمال القالب');remove.textContent=t('Delete template','حذف القالب');apply.onclick=()=>{if(applyTemplate(item)){dialog.close();shortcutStatus(t('Template applied.','تم تطبيق القالب.'));}else status.textContent=t('Use an empty new program with a valid start date. Existing workouts are unchanged.','استعمل برنامجاً جديداً فارغاً بتاريخ بداية صالح. لم تتغير الحصص الموجودة.');};remove.onclick=()=>{if(storeTemplates(templateList().filter(x=>x.id!==item.id)))render();};row.append(title,apply,remove);dialog.append(row);}dialog.append(close);
    }
    open.onclick=()=>{if(!templateKey())return;render();dialog.showModal();};
    document.addEventListener('mzactive:coach-tools-authorized',()=>{open.hidden=fresh.hidden=!templateKey();});
    document.addEventListener('mzactive:language-change',()=>{open.textContent=t('Program templates','قوالب البرامج');fresh.textContent=t('New program','برنامج جديد');if(dialog.open)render();});
    $('signOut')?.addEventListener('click',()=>{open.hidden=fresh.hidden=true;if(dialog.open)dialog.close();});
  }
  function updateNav() {
    const keys = weekKeys(), index = keys.indexOf(current), label = $('programWeekLabel');
    if (label) label.textContent = keys.length ? `${t('Week','أسبوع')} ${index + 1} / ${keys.length} · ${current}` : t('Program dates','تواريخ البرنامج');
    const prev = $('programPrevWeek'), next = $('programNextWeek');
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index < 0 || index >= keys.length - 1;
    const dest=$('programCopyWeekTarget'),paste=$('programPasteWeek');if(dest){const previous=dest.value;dest.replaceChildren();for(const k of keys){const o=new Option(k,k);dest.append(o);}dest.value=keys.includes(previous)?previous:keys[index+1]||current;dest.disabled=!copiedWeek;if(paste)paste.disabled=!copiedWeek||!dest.value;}const box=$('programWeekShortcuts');if(box)box.hidden=!window.MZAExercisePicker?.isAuthorized();
  }
  function mount() {
    if ($('programDurationUnit')) return;
    const startField = $('trainingWeekStart').closest('.field');
    if (!$('programStartDate')) { const hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.id = 'programStartDate'; hidden.value = $('trainingWeekStart').value; startField.before(hidden); }
    const row = document.createElement('div'); row.className = 'form-row';
    row.innerHTML = `<div class="field"><label for="programDurationUnit">${t('Duration unit','وحدة المدة')}</label><select id="programDurationUnit"><option value="days">${t('Days','أيام')}</option><option value="weeks" selected>${t('Weeks','أسابيع')}</option><option value="months">${t('Months','أشهر')}</option></select></div><div class="field"><label for="programDurationValue">${t('Number','العدد')}</label><input id="programDurationValue" type="number" min="1" max="36" value="1"></div>`;
    startField.before(row);
    const label = startField.querySelector('label'); if (label) label.textContent = t('Program start date','تاريخ بداية البرنامج');
    const type = $('athleteType'); const previous = type.value;
    type.replaceChildren(); for (const [v, text] of athleteTypes) { const o = document.createElement('option'); o.value = v; o.textContent = text; type.append(o); }
    if ([...type.options].some(o => o.value === previous)) type.value = previous;
    const toolbar = form.parentElement.querySelector('.studio-toolbar') || document.querySelector('.studio-toolbar');
    if (toolbar) {
      const nav = document.createElement('div'); nav.className = 'program-week-nav';
      nav.innerHTML = `<button id="programPrevWeek" class="secondary" type="button">${t('Previous week','الأسبوع السابق')}</button><strong id="programWeekLabel"></strong><button id="programNextWeek" class="secondary" type="button">${t('Next week','الأسبوع التالي')}</button>`;
      toolbar.append(nav);
      const shortcuts=document.createElement('div');shortcuts.id='programWeekShortcuts';shortcuts.className='mza-week-shortcuts';shortcuts.hidden=true;shortcuts.setAttribute('data-language-skip','');
      const copy=document.createElement('button'),paste=document.createElement('button'),dest=document.createElement('select'),status=document.createElement('p');copy.type=paste.type='button';copy.className=paste.className='secondary';copy.id='programCopyWeek';paste.id='programPasteWeek';dest.id='programCopyWeekTarget';status.id='programShortcutStatus';status.setAttribute('role','status');status.className='muted';
      function translateShortcuts(){copy.textContent=t('Copy week','نسخ الأسبوع');paste.textContent=t('Paste week','لصق الأسبوع');dest.setAttribute('aria-label',t('Destination week','الأسبوع المستهدف'));status.textContent='';}
      translateShortcuts();copy.onclick=copyWeek;paste.onclick=()=>pasteWeek(dest.value);shortcuts.append(copy,dest,paste,status);toolbar.append(shortcuts);mountTemplates(toolbar);
      document.addEventListener('mzactive:language-change',translateShortcuts);
      document.addEventListener('mzactive:coach-tools-authorized',updateNav);
      $('signOut')?.addEventListener('click',()=>{copiedWeek=null;shortcuts.hidden=true;});

      $('programPrevWeek').onclick = () => { const keys = weekKeys(), i = keys.indexOf(current); if (i > 0) showWeek(keys[i - 1]); };
      $('programNextWeek').onclick = () => { const keys = weekKeys(), i = keys.indexOf(current); if (i >= 0 && i < keys.length - 1) showWeek(keys[i + 1]); };
    }
    const savebar = $('whatsappFallback').parentElement;
    for (const button of [...savebar.querySelectorAll('button')]) button.hidden = true;
    const docButton = $('studioDocumentPreview');
    const actions = document.createElement('div'); actions.className = 'program-actions'; actions.id = 'programActions';
    const choose = document.createElement('label'); choose.className = 'program-send-to';
    choose.append(document.createTextNode(t('Send program to','إرسال البرنامج إلى')));
    const select = document.createElement('select'); select.id = 'programSendTo';
    select.innerHTML = `<option value="mzactive">${t('My Athlete (MZActive)','رياضيي (MZ Active)')}</option><option value="email">${t('Email','البريد الإلكتروني')}</option><option value="whatsapp">WhatsApp</option>`;
    choose.append(select);
    const send = document.createElement('button'); send.type='button'; send.className='btn'; send.id='programSend'; send.textContent=t('Send Program','إرسال البرنامج');
    const draft = document.createElement('button'); draft.type='button'; draft.className='btn secondary'; draft.id='programSaveDraft'; draft.textContent=t('Save Draft','حفظ المسودة');
    const more = document.createElement('details'); more.className='program-more';
    const summary = document.createElement('summary'); summary.textContent=t('More options','خيارات أكثر'); more.append(summary);
    if (docButton) { docButton.hidden=false; more.append(docButton); }
    actions.append(choose, send, draft, more); savebar.append(actions);
    send.onclick = async () => {
      const channel = select.value;
      if (channel === 'mzactive') {
        try { const id = await saveProgram(); window.MZActiveCoachDashboard?.sendDialog(id, 'mzactive'); }
        catch (error) { $('notice').textContent = error.message || t('Could not save the program.','تعذر حفظ البرنامج.'); }
      } else await deliver(channel);
    };
    draft.onclick = async () => {
      try { await saveProgram(); $('notice').textContent = t('Draft saved.','تم حفظ المسودة.'); }
      catch (error) { $('notice').textContent = error.message || t('Could not save the draft.','تعذر حفظ المسودة.'); }
    };
  }
  async function saveProgram() {
    const data = payload(); if (!data) throw new Error(t('Add at least one workout first.','أضف حصة واحدة على الأقل.'));
    if (editingId) await api('/api/dashboard/programs/' + editingId, { method: 'PATCH', body: JSON.stringify(data) });
    else { const saved = await api('/api/dashboard/programs', { method: 'POST', body: JSON.stringify(data) }); editingId = saved.id; }
    document.dispatchEvent(new Event('mzactive:program-saved'));
    return editingId;
  }
  async function deliver(channel) {
    try {
      const id = await saveProgram();
      const athleteId = $('programAthlete').value || window.MZActiveProgramEditor?.selectedAthlete || '';
      let result = null;
      if (athleteId) result = await api('/api/dashboard/programs/' + id + '/send', { method: 'POST', body: JSON.stringify({ athlete_user_id: athleteId, channel }) });
      $('notice').textContent = channel === 'email'
        ? (result?.sent ? t('Saved and emailed to the athlete.','تم الحفظ وإرسال البريد للرياضي.') : t('Saved. Choose an athlete to send by email.','تم الحفظ. اختر رياضياً لإرسال البريد.'))
        : t('Saved. Review the WhatsApp message and send it yourself.','تم الحفظ. راجع رسالة واتساب وأرسلها بنفسك.');
      if (channel === 'whatsapp' && result?.href) {
        const url = 'https://mzactive.com' + result.href;
        $('whatsappFallback').href = url; $('whatsappFallback').textContent = t('Open secure program link','افتح رابط البرنامج الآمن'); $('whatsappFallback').classList.remove('hidden');
      }
    } catch (error) { $('notice').textContent = error.message || t('Could not save the program.','تعذر حفظ البرنامج.'); }
  }
  function loadProgram(program) {
    editingId = program.id || ''; current='';copiedWeek=null; weeks = new Map();
    $('trainingClientName').value = program.athlete_name || ''; $('weeklyCoachNote').value = program.coach_note || '';
    $('athleteType').value = program.athlete_type || 'runner'; $('trainingClientPhone').value = program.athlete_phone || '';
    $('programDurationUnit').value = program.duration_unit || 'weeks'; $('programDurationValue').value = program.duration_value || 1;
    $('trainingWeekStart').value = program.start_date || program.week_start || ''; if($('programStartDate'))$('programStartDate').value=$('trainingWeekStart').value;
    for (const session of program.sessions || []) {
      const week = monday(session.session_date || program.week_start || startDate());
      if (!weeks.has(week)) weeks.set(week, []);
      weeks.get(week).push({ day_key: session.day_key, sport_type: session.sport_type, details: session.details, session_date: session.session_date || addDays(week, days.indexOf(session.day_key)) });
    }
    const keys = weekKeys(); showWeek(keys[0] || monday(startDate())); $('notice').textContent = t('Program loaded for editing.','تم تحميل البرنامج للتعديل.');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  window.MZActiveProgramEditor = { payload, saveProgram, loadProgram, showWeek, setAthlete: id => { const select = $('programAthlete'); if ([...select.options].some(o => o.value === id)) select.value = id; }, isDayInProgram:validDay,listTemplates:templateList,useTemplate:id=>applyTemplate(templateList().find(x=>x.id===id)), get selectedAthlete() { return $('programAthlete')?.value || ''; } };

  form.addEventListener('input', () => { updateNav(); persist(); });
  form.addEventListener('change', event => { if (event.target?.id === 'trainingWeekStart' && $('programStartDate')) { captureWeek();$('programStartDate').value=event.target.value;current=monday(startDate()); } updateNav(); persist(); });
  document.addEventListener('mzactive:dashboard-loaded', async () => {
    mount();
    $('trainingWeekStart').value = $('trainingWeekStart').value || monday(new Date().toISOString().slice(0, 10));
    if ($('programStartDate') && !$('programStartDate').value) $('programStartDate').value = $('trainingWeekStart').value;
    current = monday(startDate()); updateNav();
    try { const data = await api('/api/dashboard/program-draft'); if (data.draft?.weeks?.length && !editingId) { weeks = new Map(data.draft.weeks.map(w => [w.week_start, w.sessions])); $('programDurationUnit').value = data.draft.duration_unit || 'weeks'; $('programDurationValue').value = data.draft.duration_value || 1; $('trainingWeekStart').value = data.draft.start_date || startDate(); if($('programStartDate'))$('programStartDate').value=$('trainingWeekStart').value; current=''; showWeek(weekKeys()[0]); } } catch {}
  });
})();
