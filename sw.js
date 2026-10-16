const CACHE='tw-mj-stage3.3-v20';
const SHELL=['./','./index.html','./online.html','./rules.html','./online.css','./styles.css','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.pathname==='/ws'||url.pathname==='/healthz')return;
  event.respondWith(fetch(event.request).then(r=>{const clone=r.clone();caches.open(CACHE).then(c=>c.put(event.request,clone));return r;}).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html'))));
});
