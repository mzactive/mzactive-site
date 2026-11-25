const publicApi='https://mzactive-marketplace-api.mzactive5.workers.dev';
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-robots-tag':'noindex'}});
const publicRead=/^\/api\/(?:providers|pacers)(?:\/[a-z0-9-]{1,80}(?:\/photo)?)?$/i;
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/health')return json({ok:true,intake_enabled:true,staging:true});
  if(request.method==='GET'&&publicRead.test(url.pathname)){
   const upstream=new URL(url.pathname,publicApi);
   for(const key of ['type','sport','city'])if(url.searchParams.has(key))upstream.searchParams.set(key,url.searchParams.get(key));
   try{return await env.DIRECTORY.fetch(upstream,{headers:{accept:request.headers.get('accept')||'*/*'}})}
   catch{return json({error:'directory_unavailable'},503)}
  }
  if(request.method==='POST'&&['/api/bookings','/api/pacer/requests'].includes(url.pathname)){
   if(request.headers.get('origin')!==url.origin)return json({error:'origin_not_allowed'},403);
   const raw=await request.text();
   if(raw.length>8192)return json({error:'invalid_booking_request'},400);
   let body;try{body=JSON.parse(raw)}catch{return json({error:'invalid_booking_request'},400)}
   const phone=String(body?.customer_phone||'').replace(/\D/g,'');
   if(!/\p{L}/u.test(String(body?.customer_name||''))||!/^\d{7,15}$/.test(phone))return json({error:'invalid_booking_request'},400);
   const id=crypto.randomUUID();
   return json({request_id:id,provider_name:'MZ Active',staging:true,checkout_url:'/preview-checkout.html?booking='+id},201);
  }
  if(url.pathname.startsWith('/api/'))return json({error:'staging_endpoint_unavailable'},404);
  return env.ASSETS.fetch(request);
 }
};
