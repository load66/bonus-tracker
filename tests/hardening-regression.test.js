'use strict';
const fs=require('fs'),vm=require('vm');
function assert(ok,msg){if(!ok)throw new Error(msg)}
const sw=fs.readFileSync('sw.js','utf8');
assert(sw.includes("const V = 'bt-v3.4.24-dark1'"),'Service-worker release cache is stale');
assert(sw.includes('installCompleteCache')&&!/cache\.addAll\(ASSETS\)\.catch/.test(sw),'Atomic cache install hardening missing');
assert(sw.includes("if(req.mode==='navigate')")&&sw.includes("status:503"),'Navigation-only HTML fallback / asset failure response missing');
assert(sw.includes('responseMatches(url.pathname,res)'),'Asset content-type validation missing');
const workflow=fs.readFileSync('.github/workflows/close-rules.yml','utf8');
assert(/permissions:\n  contents: read\n/.test(workflow),'Workflow top-level permissions are not read-only');
assert(/deploy:[\s\S]*permissions:[\s\S]*pages: write[\s\S]*id-token: write/.test(workflow),'Pages write permissions are not scoped to deploy');
assert(workflow.indexOf('Package the exact verified site')<workflow.indexOf('deploy:'),'Verified artifact is not packaged before deploy');
assert(!/deploy:[\s\S]*Checkout the exact verified commit/.test(workflow),'Deploy job rebuilds/checks out instead of using verified artifact');

const handlers={};let puts=[];let cachedIndex=null;
const cache={put:async(k,v)=>{puts.push([k,v])}};
const sandbox={
  console,URL,Response,Headers,Promise,
  self:{location:{origin:'https://example.test'},clients:{claim:()=>Promise.resolve()},skipWaiting:()=>Promise.resolve(),addEventListener:(n,fn)=>{handlers[n]=fn}},
  caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true,match:async(req)=>String(req)==='./index.html'?cachedIndex:null},
  fetch:async asset=>{const s=String(asset);if(s.includes('engine.js'))return new Response('<html>missing</html>',{status:404,headers:{'content-type':'text/html'}});const ext=s.split('?')[0].split('.').pop();const type=ext==='js'?'application/javascript':ext==='css'?'text/css':ext==='json'?'application/json':ext==='svg'?'image/svg+xml':'text/html';return new Response('ok',{status:200,headers:{'content-type':type}})}
};
vm.createContext(sandbox);vm.runInContext(sw,sandbox,{filename:'sw.js'});
let installPromise;handlers.install({waitUntil:p=>{installPromise=p}});
installPromise.then(()=>{throw new Error('Incomplete offline install unexpectedly succeeded')}).catch(async()=>{
  assert(puts.length===0,'Failed install populated a partial cache');
  sandbox.fetch=async()=>new Response('<!doctype html><html>wrong</html>',{status:200,headers:{'content-type':'text/html'}});
  let assetPromise;handlers.fetch({request:{method:'GET',url:'https://example.test/app.js?v=3.4.24',mode:'cors',headers:{get:()=>''}},respondWith:p=>{assetPromise=p}});
  const asset=await assetPromise;assert(asset.status===503,'Missing JavaScript fell back to HTML instead of failing safely');
  cachedIndex=new Response('<!doctype html><html>cached</html>',{status:200,headers:{'content-type':'text/html'}});
  sandbox.fetch=async()=>{throw new Error('offline')};
  let navPromise;handlers.fetch({request:{method:'GET',url:'https://example.test/',mode:'navigate',headers:{get:()=> 'text/html'}},respondWith:p=>{navPromise=p}});
  const nav=await navPromise;assert(nav&&nav.status===200&&(await nav.text()).includes('cached'),'Offline navigation did not use cached app shell');
  console.log('Hardening regression passed: atomic cache install, typed asset fallback, navigation shell fallback, and verify-before-deploy artifact flow');
}).catch(err=>{console.error(err.stack||err);process.exitCode=1});
