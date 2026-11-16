// Cloudflare Worker module; bind DB to D1. Do not expose publicly until verified email delivery and auth are configured.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==="/health"&&request.method==="GET")return json({ok:true,registration:"disabled_until_email_verification"});
  // Never accept unauthenticated member creation. Identity must be verified by the
  // existing auth provider; client-provided email/verified flags are not trusted.
  if(url.pathname==="/community/register")return json({error:"registration_not_enabled",message:"Email verification and authenticated signup are not configured yet."},503);
  return json({error:"not_found"},404);
 }
};
