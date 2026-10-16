'use strict';
/* Non-mutating production smoke: no real bank accounts or bank credentials. */
const assert=require('node:assert/strict');
const API='https://api-production-00f74.up.railway.app/api/bonus-tracker/simplefin';
const SITE='https://load66.github.io/bonus-tracker/';
async function verified(url,options={}){
  return fetch(url,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000),...options});
}
(async()=>{
  const home=await verified(SITE);
  assert.equal(home.status,200,'GitHub Pages must serve the published app');
  assert.match(home.headers.get('content-type')||'',/text\/html/i,'Home page must be HTML');
  const html=await home.text();
  for(const asset of ['bonus-evidence-core.js','bonus-evidence.js','bank-sync.js','finance-page.js','finance-overview-core.js']){
    assert.ok(html.includes(asset),'The live app should load '+asset);
    const r=await verified(new URL(asset,SITE));
    assert.equal(r.status,200,asset+' should be served on the published site');
    assert.match(r.headers.get('content-type')||'',/javascript/i,asset+' content type');
    const script=await r.text();
    assert.ok(script.length>200,asset+' should not be an empty placeholder');
  }
  for(const [method,path] of [['GET',''],['POST','/sync'],['PUT','/monitoring']]){
    const request=await verified(API+path,{
      method,headers:{Accept:'application/json',...(method==='PUT'?{'Content-Type':'application/json'}:{})},
      ...(method==='PUT'?{body:JSON.stringify({accounts:[]})}:{})
    });
    assert.equal(request.status,401,method+' '+(path||'/')+' must reject unauthenticated callers');
    assert.match(request.headers.get('cache-control')||'',/no-store/i,'private API must not be cached');
    const body=await request.text();
    assert.ok(body.length<2048,'Unauthenticated responses must not contain records');
    assert.doesNotMatch(body,/accounts"\s*:|transactions"\s*:/,'No private records for unauthenticated requests');
  }
  console.log('LIVE SIMPLEFIN PROD SMOKE PASSED: Pages HTML/assets, API auth boundaries, no real bank tokens used');
})().catch(e=>{console.error('LIVE SIMPLEFIN PROD SMOKE FAILED:',e);process.exitCode=1});
