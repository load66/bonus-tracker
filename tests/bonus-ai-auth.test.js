'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync('bonus-ai-auth.js','utf8'),data=new Map(),legacy=new Map();
const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
let calls=[],handler;
function load(){const s={window:{},localStorage:storage(data),sessionStorage:storage(legacy),navigator:{},AbortController,setTimeout,clearTimeout,Date,fetch:async(u,o)=>{calls.push({u,body:JSON.parse(o.body)});return handler(u,o);}};vm.runInNewContext(code,s);return s.window.BTBonusAuth;}
const response=(status,d)=>({ok:status<400,status,json:async()=>d});
const good=token=>response(200,{access_token:token,refresh_token:'refresh-'+token,expires_in:3600});
(async()=>{
 let auth=load();handler=()=>good('first');await auth.signIn('synthetic@example.test','never-store-this');
 assert.ok(auth.connected());assert.ok(!JSON.stringify([...data]).includes('never-store-this'));
 auth=load();assert.equal(await auth.token(),'first');assert.equal(calls.length,1,'Reload must reuse persisted session');
 data.set('bonus-ai-auth',JSON.stringify({...JSON.parse(data.get('bonus-ai-auth')),expires_at:0}));
 handler=async()=>{await new Promise(r=>setTimeout(r,5));return good('rotated');};
 const tokens=await Promise.all([auth.token(),auth.token(),auth.token()]);assert.deepEqual(tokens,['rotated','rotated','rotated']);assert.equal(calls.length,2);assert.equal(calls[1].body.refresh_token,'refresh-first');
 handler=()=>{throw Error('Network unavailable');};await assert.rejects(auth.token(true),/Network/);assert.ok(auth.connected(),'Network error must not log out');
 handler=()=>response(503,{error_code:'unexpected_failure'});await assert.rejects(auth.token(true),/temporarily/);assert.ok(auth.connected());
 handler=()=>response(400,{error_code:'refresh_token_not_found'});await assert.rejects(auth.token(true),/ended/);assert.equal(auth.connected(),false);
 let resolve;handler=()=>new Promise(r=>resolve=r);const pending=auth.signIn('synthetic@example.test','secret');auth.disconnect();resolve(good('late'));await assert.rejects(pending,/cancelled/);assert.equal(auth.connected(),false);
 legacy.set('bonus-ai-auth',JSON.stringify({access_token:'legacy',refresh_token:'legacy-refresh',expires_at:Date.now()/1000+3600}));auth=load();assert.equal(await auth.token(),'legacy');assert.equal(legacy.size,0);assert.ok(data.has('bonus-ai-auth'));
 auth.disconnect();assert.equal(data.size,0);
 console.log('Persistent AI auth passed: reload, token rotation, single-flight refresh, outage retention, revoked-session recovery, disconnect race, password exclusion and tab-session migration');
})().catch(e=>{console.error(e);process.exitCode=1;});
