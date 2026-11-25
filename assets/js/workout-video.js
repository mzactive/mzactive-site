/* Safe, click-only YouTube demonstrations. No third-party player or API on load. */
(()=>{'use strict';
 const valid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{11}$/.test(id);
 function idFromUrl(value){
  if(typeof value!=='string'||!value.trim())return '';
  try{const u=new URL(value.trim());if(u.protocol!=='https:'||u.username||u.password||u.port)return '';
   const host=u.hostname.toLowerCase(),parts=u.pathname.split('/').filter(Boolean);let id='';
   if(host==='youtu.be'&&parts.length===1)id=parts[0];
   else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host)){if(u.pathname==='/watch')id=u.searchParams.get('v');else if(parts.length===2&&['shorts','live','embed'].includes(parts[0]))id=parts[1]}
   return valid(id)?id:'';
  }catch{return ''}
 }
 const url=id=>valid(id)?'https://www.youtube.com/watch?v='+id:'';
 function appendInstructions(root,text,label){
  const lines=String(text||'').split('\n');
  lines.forEach((line,i)=>{
   if(i)root.append(document.createTextNode('\n'));
   const id=idFromUrl(line);
   if(id){const a=document.createElement('a');a.href=url(id);a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;a.className='mza-video-link';root.append(a)}
   else root.append(document.createTextNode(line));
  });
  root.style.whiteSpace='pre-wrap';
  root.style.overflowWrap='anywhere';
 }
 window.MZAWorkoutVideo={valid,idFromUrl,url,appendInstructions};
})();
