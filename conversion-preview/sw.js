const cacheName='mza-conversion-preview-v1';
const shell=['/','/community.html','/assets/css/conversion-preview.css?v=1','/assets/js/conversion-preview.js?v=1'];
self.addEventListener('install',event=>event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(shell)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!shell.includes(url.pathname+url.search))return;
 event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
