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
const files=['index.html','style.css','sw.js','plaid-fallback.js','plaid-fallback.css','finance-page.js','bonus-evidence.js'];
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const target=await Promise.all(files.map(async path=>[path,hash(await fs.readFile(path))]));
  let details='';
  const end=Date.now()+9*60*1000;
  while(Date.now()<end){
    let ok=true,values=[];
    for(const [path,expected] of target){
      try{
        const url=new URL(path,base);
        url.searchParams.set('verify',Date.now().toString());
        const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});
        const actual=r.ok?hash(Buffer.from(await r.arrayBuffer())):'http-'+r.status;
        values.push(path+':'+(actual===expected?'current':'outdated'));
        if(actual!==expected)ok=false;
      }catch(e){
        values.push(path+':unavailable');
        ok=false;
      }
    }
    details=values.join(', ');
    if(ok){
      console.log('Verified exact latest GitHub Pages release assets: '+details);
      return;
    }
    console.log('Waiting for verified Pages assets to become live: '+details);
    await sleep(12000);
  }
  throw new Error('GitHub Pages did not publish the exact audited commit before the verification deadline: '+details);
})().catch(e=>{console.error(e);process.exitCode=1;});
