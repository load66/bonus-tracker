// Bank Bonus Tracker Service Worker
// Version 3.4.22: retain atomic/type-safe offline hardening and preload conditional churn and enrollment semantic validation.

const V = 'bt-v3.4.22-conditional1';
const ASSETS = ['./app.js', './bank-rules-academy.js', './bank-rules-boa-business.js', './bank-rules-busey.js', './bank-rules-capitalone.js', './bank-rules-equity.js', './bank-rules-fourleaf.js', './bank-rules-pnc.js', './bank-rules-regions.js', './bank-rules.js', './bank-rules-wells-consumer.js', './churn-close-policy.js', './churn-profile-memory.js', './controller.js', './close-rules-core.js', './close-rules-integration.js', './close-rules.css', './engine.js', './eligibility-gate.js', './entry-link-import.js', './fee-review-migration.js', './icon.svg', './index.html', './learning-inbox-conflict.js', './manifest.json', './mobile-analyzer.css', './mobile-analyzer.js', './professional-upgrades.js', './profile-db.js', './persistence-transaction.js', './profile-library-selftest-academy.js', './profile-library-selftest.js', './profile-registry-academy.js', './profile-registry.js', './semantic-status.js', './smart-attention.js', './source-resolver.js', './style.css', './wells-professional-runtime.js', './sw.js'];

function expectedTypes(path){
  path=String(path||'').toLowerCase();
  if(path.endsWith('.js'))return ['javascript','ecmascript'];
  if(path.endsWith('.css'))return ['text/css'];
  if(path.endsWith('.json'))return ['application/json','application/manifest+json','text/json'];
  if(path.endsWith('.svg'))return ['image/svg+xml'];
  if(path.endsWith('.html')||path.endsWith('/'))return ['text/html'];
  return [];
}
function responseMatches(path,res){
  if(!res||!res.ok)return false;
  const expected=expectedTypes(path);if(!expected.length)return true;
  const type=String(res.headers.get('content-type')||'').toLowerCase();
  return expected.some(x=>type.includes(x));
}
async function installCompleteCache(){
  const fetched=await Promise.all(ASSETS.map(async asset=>{
    const res=await fetch(asset,{cache:'reload'});
    if(!responseMatches(asset,res))throw new Error('Invalid offline asset: '+asset);
    return [asset,res];
  }));
  const cache=await caches.open(V);
  await Promise.all(fetched.map(([asset,res])=>cache.put(asset,res.clone())));
}
async function cachedAsset(req){return caches.match(req,{ignoreSearch:true})}
async function networkAsset(req,url){
  const res=await fetch(req,{cache:'no-store'});
  if(!responseMatches(url.pathname,res))throw new Error('Invalid asset response');
  const cache=await caches.open(V);cache.put(req,res.clone()).catch(()=>{});
  return res;
}

self.addEventListener('install',event=>{
  event.waitUntil(installCompleteCache().then(()=>self.skipWaiting()));
});
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==self.location.origin)return;

  if(req.mode==='navigate'){
    event.respondWith(fetch(req,{cache:'no-store'}).then(res=>{
      if(!responseMatches('/index.html',res))throw new Error('Invalid navigation response');
      caches.open(V).then(cache=>cache.put('./index.html',res.clone())).catch(()=>{});
      return res;
    }).catch(()=>caches.match('./index.html')));
    return;
  }

  if(expectedTypes(url.pathname).length){
    event.respondWith(networkAsset(req,url).catch(async()=>{
      const cached=await cachedAsset(req);
      return cached||new Response('',{status:503,statusText:'Offline asset unavailable'});
    }));
    return;
  }

  event.respondWith(cachedAsset(req).then(cached=>cached||fetch(req).then(res=>{
    if(res&&res.ok)caches.open(V).then(cache=>cache.put(req,res.clone())).catch(()=>{});
    return res;
  })));
});
