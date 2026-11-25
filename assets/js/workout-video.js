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
 function appendLink(root,id,label){
  if(!valid(id))return;
  const link=document.createElement('a');
  link.href=url(id);link.target='_blank';link.rel='noopener noreferrer';
  link.textContent=label;link.className='mza-video-link';
  root.append(link);
 }
 function appendInstructions(root,text,label,exerciseLength){
  const structured=Number.isInteger(exerciseLength)&&exerciseLength>=0&&exerciseLength<=text.length;
  const instructions=structured?text.slice(exerciseLength+(exerciseLength?1:0)):'';
  const exerciseText=structured?text.slice(0,exerciseLength):text;
  const lines=String(exerciseText||'').split('\n');
  lines.forEach((line,i)=>{
   if(i)root.append(document.createTextNode('\n'));
   const id=idFromUrl(line);
   if(id)appendLink(root,id,label)
   else root.append(document.createTextNode(line));
  });
  if(structured&&instructions){
   if(exerciseLength)root.append(document.createTextNode('\n'));
   root.append(document.createTextNode(instructions));
  }
  root.style.whiteSpace='pre-wrap';
  root.style.overflowWrap='anywhere';
 }
 window.MZAWorkoutVideo={valid,idFromUrl,url,appendInstructions,appendLink};
})();
