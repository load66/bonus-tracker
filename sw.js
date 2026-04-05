const V='bt-v5';
const ASSETS=['./index.html','./manifest.json','./sw.js'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(V).then(cache=>cache.addAll(ASSETS)).catch(()=>null)
  );
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==V).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;

  const url=new URL(req.url);
  const isSameOrigin=url.origin===self.location.origin;
  const isNavigate=req.mode==='navigate';
  const isHTML=req.headers.get('accept')?.includes('text/html');

  if(isSameOrigin && (isNavigate || isHTML)){
    event.respondWith(
      fetch(req)
        .then(res=>{
          const copy=res.clone();
          caches.open(V).then(cache=>cache.put(req,copy)).catch(()=>null);
          return res;
        })
        .catch(()=>caches.match(req).then(r=>r || caches.match('./index.html')))
    );
    return;
  }

  if(isSameOrigin){
    event.respondWith(
      caches.match(req).then(cached=>{
        if(cached) return cached;
        return fetch(req).then(res=>{
          const copy=res.clone();
          caches.open(V).then(cache=>cache.put(req,copy)).catch(()=>null);
          return res;
        });
      })
    );
  }
});