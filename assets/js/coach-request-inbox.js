(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const token = () => sessionStorage.getItem('mzactive-provider-session') || localStorage.getItem('mzactive-provider-session') || '';
  const t = (en, ar) => document.documentElement.lang === 'ar' ? ar : en;
  const el = (tag, value, cls) => { const n = document.createElement(tag); if (value !== undefined) n.textContent = value; if (cls) n.className = cls; return n; };
  let activeToken = '', timer, seq = 0, bookings = [], notifications = [];
  async function api(path, method = 'GET', body) {
    const session = token(); if (!session) throw Error('unauthorized');
    const r = await fetch(window.MZACTIVE_API_BASE + '/api/dashboard/' + path, { method, cache:'no-store', headers:{authorization:'Bearer '+session, ...(body === undefined ? {} : {'content-type':'application/json'})}, body:body === undefined ? undefined : JSON.stringify(body) });
    if(!r.ok)throw Error('request_failed'); return r.json();
  }
  function button(label, fn) { const b=el('button',label,'btn secondary'); b.type='button'; b.onclick=fn; return b; }
  function mount() {
    if ($('coachBookingInbox') || !$('coachPanel')) return;
    const panel=el('section',undefined,'panel');panel.id='coachBookingInbox';
    const head=el('div',undefined,'panel-head');
    const title=el('h3',t('Coaching requests','طلبات التدريب'));title.id='coachInboxTitle';
    const count=el('strong','', 'badge');count.id='coachInboxPending';head.append(title,count);
    const help=el('p',t('Requests from guests and registered athletes. Review and reply to the client here.','طلبات الزوار والرياضيين المسجلين. راجع الطلب وتواصل مع العميل هنا.'),'muted');help.id='coachInboxHelp';
    const status=el('p','', 'muted');status.id='coachInboxStatus';status.setAttribute('role','status');
    const rows=el('div');rows.id='coachInboxRows';
    const notificationTitle=el('h3',t('Notifications','الإشعارات'));notificationTitle.id='coachInboxNotificationsTitle';
    const notices=el('div');notices.id='coachInboxNotifications';
    const gallery=el('a',t('Manage my public training photos','إدارة صور تدريبي العامة'),'btn secondary');gallery.id='coachGalleryShortcut';gallery.href='providers.html#galleryEditor';
    panel.append(head,help,gallery,status,rows,notificationTitle,notices);$('coachPanel').prepend(panel);
  }
  function paint() {
    if (!$('coachInboxRows'))return;
    $('coachInboxTitle').textContent=t('Coaching requests','طلبات التدريب');
    $('coachInboxHelp').textContent=t('Requests from guests and registered athletes. Review and reply to the client here.','طلبات الزوار والرياضيين المسجلين. راجع الطلب وتواصل مع العميل هنا.');
    $('coachInboxNotificationsTitle').textContent=t('Notifications','الإشعارات');
    $('coachGalleryShortcut').textContent=t('Manage my public training photos','إدارة صور تدريبي العامة');
    const pending=bookings.filter(b=>['received','reviewing'].includes(b.status));
    $('coachInboxPending').textContent=pending.length+' '+t('pending','معلّق');
    const rows=$('coachInboxRows');rows.replaceChildren();
    if(!bookings.length)rows.append(el('p',t('No coaching requests yet.','لا توجد طلبات تدريب بعد.'),'muted'));
    const requested=new URLSearchParams(location.search).get('booking');
    for(const b of bookings) {
      const card=el('article',undefined,'crm-row');card.dataset.bookingId=b.id;
      if(b.id===requested)card.classList.add('record-focus');
      const statuses={received:t('New request','طلب جديد'),reviewing:t('Reviewing','قيد المراجعة'),accepted:t('Accepted','مقبول'),declined:t('Declined','مرفوض'),cancelled:t('Cancelled','ملغى')};
      card.append(el('strong',b.customer_name || t('Client','العميل')),el('span',statuses[b.status]||b.status,'badge'));
      const info=[b.service_name,b.city,b.preferred_date].filter(Boolean).join(' · ');
      if(info)card.append(el('p',info,'muted'));
      if(b.goal_summary)card.append(el('p',b.goal_summary));
      const contact=el('div',undefined,'actions');
      if(b.customer_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.customer_email)){const a=el('a',t('Email client','راسل العميل'),'btn secondary');a.href='mailto:'+encodeURIComponent(b.customer_email).replace('%40','@');contact.append(a);}
      const phone=String(b.customer_phone||'').replace(/[^+\d]/g,'');
      if(/^\+?\d{7,15}$/.test(phone)){const a=el('a',t('Call client','اتصل بالعميل'),'btn secondary');a.href='tel:'+phone;contact.append(a);}
      if(['received','reviewing'].includes(b.status))for(const [value,label] of [['accepted',t('Accept','قبول')],['declined',t('Decline','رفض')]]){
        const action=button(label,async()=>{action.disabled=true;try{await api('bookings/'+encodeURIComponent(b.id),'PATCH',{status:value});await refresh();}catch{$('coachInboxStatus').textContent=t('Could not update request.','تعذّر تحديث الطلب.');}finally{action.disabled=false;}});contact.append(action);
      }
      card.append(contact);rows.append(card);
    }
    const notices=$('coachInboxNotifications');notices.replaceChildren();
    if(!notifications.length)notices.append(el('p',t('No notifications yet.','لا توجد إشعارات بعد.'),'muted'));
    for(const n of notifications){
      const row=el('article',undefined,'crm-row');row.append(el('strong',n.type==='booking_received'?t('New coaching request','طلب تدريب جديد'):n.title));
      if(n.body)row.append(el('p',n.body));
      if(!n.read_at)row.append(button(t('Mark as read','تحديد كمقروء'),async()=>{try{await api('notifications/'+encodeURIComponent(n.id),'PATCH',{});await refresh();}catch{$('coachInboxStatus').textContent=t('Could not update notification.','تعذّر تحديث الإشعار.');}}));
      notices.append(row);
    }
  }
  async function refresh() {
    const session=token(); if(!session||session!==activeToken)return;
    const current=++seq;
    try{
      const [b,n]=await Promise.all([api('bookings'),api('notifications')]);
      if(current!==seq||session!==token())return;
      bookings=b.bookings||[];notifications=n.notifications||[];
      paint();$('coachInboxStatus').textContent='';
      const badge=$('coachNotificationCount');if(badge){badge.textContent=Number(n.unread||0)>9?'9+':String(n.unread||0);badge.hidden=!Number(n.unread||0);}
    }catch{if(current===seq&&session===token()&&$('coachInboxStatus'))$('coachInboxStatus').textContent=t('Unable to load requests. Try again.','تعذّر تحميل الطلبات. حاول مجدداً.');}
  }
  function open(){mount();window.MZActiveCoachDashboard?.focusSection?.('requests');const panel=$('coachBookingInbox');if(panel){panel.hidden=false;panel.scrollIntoView({block:'start',behavior:'smooth'});}refresh();}
  function init(data){if(data?.role!=='provider'||!token())return;mount();if(!$('coachBookingInbox'))return;activeToken=token();clearInterval(timer);refresh();timer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},45000);if(new URLSearchParams(location.search).has('booking'))open();}
  window.MZActiveCoachInbox={open,refresh};
  document.addEventListener('mzactive:dashboard-loaded',e=>init(e.detail));
  if(window.mzStudioDashboard)init(window.mzStudioDashboard);
  document.addEventListener('mzactive:language-change',paint);
  window.addEventListener('storage',()=>{if(token()!==activeToken){++seq;bookings=[];notifications=[];paint();clearInterval(timer);activeToken='';}});
})();