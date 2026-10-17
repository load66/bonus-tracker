'use strict';
/*
 * Run only after a main-branch merge. GitHub Pages deploys independently of
 * the checkout and can still serve an earlier release while checks start.
 * This guard proves the browser smoke tests exercise the exact submitted
 * site assets rather than the previous production revision.
 */
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const base='https://load66.github.io/bonus-tracker/';
const files=['index.html','style.css','sw.js','plaid-fallback.js','plaid-fallback.css','finance-page.js','finance-page.css','bonus-evidence.js','bonus-evidence.css'];
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const target=await Promise.all(files.map(async path=>[path,hash(await fs.readFile(path))]));
  let details='';
  const end=Date.now()+10*60*1000;
  while(Date.now()<end){
    const started=Date.now();
    const checks=await Promise.all(target.map(async([path,expected])=>{
      try{
        const url=new URL(path,base);url.searchParams.set('verify',Date.now().toString());
        const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(12000,end-Date.now())))});
        const actual=r.ok?hash(Buffer.from(await r.arrayBuffer())):'http-'+r.status;
        return {ok:actual===expected,label:path+':'+(actual===expected?'current':'outdated')};
      }catch{return {ok:false,label:path+':unavailable'}}
    }));
    const ok=checks.every(result=>result.ok),values=checks.map(result=>result.label);
    details=values.join(', ');
    if(ok){
      console.log('Verified exact latest GitHub Pages release assets: '+details);
      return;
    }
    console.log('Waiting for verified Pages assets to become live: '+details);
    await sleep(Math.max(0,Math.min(15000-(Date.now()-started),end-Date.now())));
  }
  throw new Error('GitHub Pages did not publish the exact audited commit before the verification deadline: '+details);
})().catch(e=>{console.error(e);process.exitCode=1;});
