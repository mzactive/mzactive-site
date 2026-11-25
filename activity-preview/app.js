import FitParser from 'fit-file-parser';

const byId = id => document.getElementById(id);
const feed = byId('feed');
const status = byId('status');
const pageSize = 20;
const activities = [];
const sportLabels = Object.fromEntries([...byId('manual').elements.sport.options].map(option => [option.value, option.dataset]));
let samples = [];
let sampleCount = 0;
let lang = 'en';
try { lang = localStorage.getItem('mza-preview-language') || (navigator.language.startsWith('ar') ? 'ar' : 'en'); } catch {}
const t = (en, ar) => lang === 'ar' ? ar : en;
let number;
let busy = false;
let statusKey = '';
let timing = null;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
const metric = value => Number.isFinite(value) && value >= 0 ? value : null;
function point(lat, lon, elevation, time) {
  if (![lat,lon].every(Number.isFinite) || Math.abs(lat)>90 || Math.abs(lon)>180) return null;
  return {lat,lon,elevation:Number.isFinite(elevation)?elevation:null,time};
}
const rad = degrees => degrees * Math.PI / 180;
function distance(a,b) {
  const dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon);
  const x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
  return 12742000*Math.asin(Math.sqrt(Math.min(1,x)));
}
function summary(tracks) {
  const points=tracks.flat();
  let meters=0,elevation=0,hasElevation=false,first=Infinity,last=-Infinity;
  for (const track of tracks) {
    for (let i=0;i<track.length;i++) {
      const current=track[i],previous=track[i-1];
      if(Number.isFinite(current.time)){first=Math.min(first,current.time);last=Math.max(last,current.time)}
      if (!previous) continue;
      meters+=distance(previous,current);
      if(previous.elevation!==null&&current.elevation!==null){
        hasElevation=true;
        elevation+=Math.max(0,current.elevation-previous.elevation);
      }
    }
  }
  return {meters:points.length>=2?meters:null,seconds:last>first?(last-first)/1000:null,elevation:hasElevation?elevation:null,tracks};
}
const tags=(root,name)=>[...root.getElementsByTagNameNS('*',name)];
const value=(root,name)=>tags(root,name)[0]?.textContent?.trim();
const numeric=(value)=>value==null||value===''?NaN:Number(value);
function parseXml(text, format) {
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) throw Error('invalid_file');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if(doc.querySelector('parsererror')||doc.documentElement.localName.toLowerCase()!==(format==='gpx'?'gpx':'trainingcenterdatabase'))throw Error('invalid_file');
  const tracks=format==='gpx'
    ?tags(doc,'trkseg').map(segment=>tags(segment,'trkpt').map(p=>point(numeric(p.getAttribute('lat')),numeric(p.getAttribute('lon')),numeric(value(p,'ele')),Date.parse(value(p,'time')))).filter(Boolean))
    :tags(doc,'Track').map(track=>tags(track,'Trackpoint').map(p=>point(numeric(value(p,'LatitudeDegrees')),numeric(value(p,'LongitudeDegrees')),numeric(value(p,'AltitudeMeters')),Date.parse(value(p,'Time')))).filter(Boolean));
  const route=summary(tracks);
  const laps=tags(doc,'Lap');
  const lapSum=name=>laps.length&&laps.every(lap=>Number.isFinite(numeric(value(lap,name))))?laps.reduce((sum,lap)=>sum+numeric(value(lap,name)),0):null;
  const heartRates=tags(doc,'HeartRateBpm').map(node=>numeric(value(node,'Value'))).filter(n=>n>=25&&n<=250);
  const activity=tags(doc,'Activity')[0];
  const sport=activity?.getAttribute('Sport')?.toLowerCase();
  return {...route,meters:lapSum('DistanceMeters')??route.meters,seconds:lapSum('TotalTimeSeconds')??route.seconds,
    heart:heartRates.length?heartRates.reduce((a,b)=>a+b,0)/heartRates.length:null,
    sport:sport==='running'?'run':sport==='biking'?'ride':'other'};
}
const fitSport = {running:'run',cycling:'ride',swimming:'swim',multisport:'triathlon',training:'fitness'};
async function parseFile(file) {
  const type=file.name.split('.').pop().toLowerCase();
  if(!['fit','gpx','tcx'].includes(type)||!file.size||file.size>8*1024*1024)throw Error('invalid_file');
  let result;
  if(type==='fit'){
    const data=await new FitParser({force:false,mode:'list'}).parseAsync(await file.arrayBuffer());
    const sessions=Array.isArray(data.sessions)?data.sessions:[];
    const sum=key=>sessions.length&&sessions.every(row=>metric(row[key])!==null)?sessions.reduce((n,row)=>n+row[key],0):null;
    const route=summary([(data.records||[]).map(row=>point(row.position_lat,row.position_long,row.enhanced_altitude??row.altitude,Date.parse(row.timestamp))).filter(Boolean)]);
    result={...route,meters:sum('total_distance')??route.meters,seconds:sum('total_timer_time')??route.seconds,elevation:sum('total_ascent')??route.elevation,
      heart:metric(sessions[0]?.avg_heart_rate),sport:fitSport[sessions[0]?.sport]||'other'};
  } else result=parseXml(await file.text(),type);
  if(!result.tracks.some(track=>track.length>1)&&![result.meters,result.seconds].some(n=>n>0))throw Error('invalid_file');
  return {...result,title:file.name.slice(0,100),notes:''};
}

function drawRoute(canvas,tracks) {
  const pts=tracks.flat();
  let minX=180,maxX=-180,minY=90,maxY=-90;
  for(const p of pts){minX=Math.min(minX,p.lon);maxX=Math.max(maxX,p.lon);minY=Math.min(minY,p.lat);maxY=Math.max(maxY,p.lat)}
  const dataX=(maxX-minX)*Math.cos(rad((maxY+minY)/2)),dataY=maxY-minY;
  const scale=Math.min(470/(dataX||1e-9),92/(dataY||1e-9));
  const xShift=(500-dataX*scale)/2,yShift=(116-dataY*scale)/2;
  const context=canvas.getContext('2d');
  context.strokeStyle='#a57312';context.lineWidth=2.5;context.lineJoin='round';
  for(const track of tracks){
    context.beginPath();
    track.forEach((p,i)=>{
      const x=xShift+(p.lon-minX)*Math.cos(rad((maxY+minY)/2))*scale;
      const y=yShift+(maxY-p.lat)*scale;
      if(i)context.lineTo(x,y);else context.moveTo(x,y);
    });
    context.stroke();
  }
}
function card(activity) {
  const card=element('article',undefined,'card');
  const title=activity.sample?t('Sample activity','نشاط تجريبي')+' '+number.format(activity.n):activity.title;
  card.append(element('h3',title),element('p',sportLabels[activity.sport]?.[lang]||t('Other','أخرى')));
  const stats=element('div',undefined,'stats');
  for(const [label,value,unit] of [
    [t('Distance','المسافة'),activity.meters==null?null:activity.meters/1000,t('km','كم')],
    [t('Duration','المدة'),activity.seconds==null?null:activity.seconds/60,t('min','دقيقة')],
    [t('Elevation gain','الصعود'),activity.elevation,t('m','م')],
    [t('Average heart rate','متوسط النبض'),activity.heart,t('bpm','نبضة/دقيقة')],
  ]){
    if(metric(value)===null)continue;
    const row=element('div',undefined,'stat');
    row.append(element('small',label),element('strong',number.format(value)+' '+unit));stats.append(row);
  }
  card.append(stats);
  if(activity.notes){const notes=element('p',activity.notes);notes.dir='auto';card.append(notes)}
  if(activity.tracks?.some(track=>track.length>1)){
    const canvas=element('canvas',undefined,'route');canvas.width=500;canvas.height=116;
    canvas.setAttribute('aria-label',t('Local GPS route preview','معاينة محلية لمسار الموقع'));
    card.append(canvas);drawRoute(canvas,activity.tracks);
  }
  return card;
}
function render() {
  number=new Intl.NumberFormat(lang==='ar'?'ar-QA':'en-QA',{maximumFractionDigits:2});
  const items=[...activities,...samples.slice(0,sampleCount)];
  feed.replaceChildren(...items.map(card));
  if(!items.length)feed.append(element('p',t('Add a workout to preview your feed.','أضف حصة لمعاينة سجل الأنشطة.')));
  byId('more').hidden=sampleCount>=samples.length;
  byId('performance').textContent=timing===null?'':t('Sample load and first page: ','تحميل العينة وعرض الصفحة الأولى: ')+number.format(timing)+t(' ms',' مللي ثانية');
}
function paintStatus() {
  status.textContent={
    loading:t('Reading file in this tab…','جارٍ قراءة الملف في هذه الصفحة…'),
    added:t('Activity added to this preview.','أُضيف النشاط إلى المعاينة.'),
    invalid_file:t('This file is too large, invalid or has no supported activity data.','الملف كبير جداً أو غير صالح أو لا يحتوي على بيانات نشاط مدعومة.'),
  }[statusKey]||'';
}
function paintLanguage() {
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  document.querySelectorAll('[data-en]').forEach(node=>node.textContent=node.dataset[lang]);
  byId('language').textContent=t('العربية','English');
  render();paintStatus();
}
byId('language').onclick=()=>{
  lang=t('ar','en');
  try{localStorage.setItem('mza-preview-language',lang)}catch{}
  paintLanguage();
};
byId('file').onchange=async event=>{
  const file=event.target.files[0];
  if(!file||busy)return;
  busy=true;event.target.disabled=true;statusKey='loading';paintStatus();
  try{activities.unshift(await parseFile(file));statusKey='added';render()}
  catch{statusKey='invalid_file'}
  finally{busy=false;event.target.disabled=false;event.target.value='';paintStatus()}
};
byId('manual').onsubmit=event=>{
  event.preventDefault();
  const values=new FormData(event.target),title=values.get('title').trim(),minutes=Number(values.get('minutes'));
  if(!title||minutes<=0)return;
  activities.unshift({title,sport:values.get('sport'),seconds:minutes*60,meters:values.get('distance')?Number(values.get('distance'))*1000:null,notes:values.get('notes')});
  event.target.reset();statusKey='added';paintStatus();render();
};
byId('sample').onclick=()=>{
  const start=performance.now();
  samples=Array.from({length:5000},(_,n)=>({sample:true,n:n+1,sport:n%4===0?'padel':'run',meters:n%4===0?null:2500+n%15*290,seconds:1200+n%18*87}));
  sampleCount=pageSize;render();timing=Math.round(performance.now()-start);render();
};
byId('more').onclick=()=>{sampleCount+=pageSize;render()};
if(!['en','ar'].includes(lang))lang='en';
paintLanguage();
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
