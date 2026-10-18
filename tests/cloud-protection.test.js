'use strict';
const assert=require('node:assert/strict'),core=require('../cloud-backup-core.js');
const cfg={enabled:true,lastAt:'2026-10-14T10:30:00Z',lastHash:'a'.repeat(64)};
const runtime={connected:true,currentVerified:true,online:true,pending:false,busy:false};
assert.equal(core.protectionState(cfg,runtime).tone,'protected');
assert.notEqual(core.protectionState(cfg,{...runtime,currentVerified:false}).tone,'protected','An ON setting alone is not protection proof');
assert.equal(core.protectionState(cfg,{...runtime,pending:true}).tone,'warning','Unuploaded changes must visibly remove protection');
assert.equal(core.protectionState(cfg,{...runtime,busy:true}).tone,'warning','Upload in progress is not verification');
assert.equal(core.protectionState({...cfg,error:'Storage unavailable'},runtime).tone,'danger');
assert.equal(core.protectionState(cfg,{...runtime,connected:false}).tone,'danger');
assert.equal(core.protectionState(cfg,{...runtime,online:false}).tone,'warning');
assert.equal(core.protectionState({...cfg,enabled:false},runtime).tone,'off');
assert.notEqual(core.protectionState({...cfg,lastHash:''},runtime).tone,'protected');
console.log('Cloud protection passed: ON does not imply current protection; pending, offline, failed, unsigned and unverified states remain visible');

// Exercise the real upload runtime across a simulated browser refresh.
async function noticeCooldown(){
  const vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto').webcrypto;
  const values=new Map([['bt_e_v4','[{"bank":"Synthetic notice bank","bonus":100}]'],['bt_cloud_recovery_v1','{"enabled":true}']]);
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  let now=Date.parse('2026-10-14T20:00:00Z'),failure=false,uploads=0;
  const notices=[];
  function runtime(){
    const sandbox={localStorage:storage,crypto,TextEncoder,AbortController,navigator:{onLine:true},dashYear:2026,taxYear:2026,
      Date:class extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}},
      document:{getElementById:()=>null,addEventListener:()=>{}},addEventListener:()=>{},
      setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>({unref(){}}),
      getBackupStorageKeys:()=>['bt_e_v4'],BT_APP_VERSION:'3.4.74',BTCloudCore:core,
      BTPersistence:require('../persistence-transaction.js'),BTBonusAuth:{connected:()=>true,token:async()=> 'synthetic-token'},
      btNotify:(message,options)=>notices.push({message,...options}),
      fetch:async(url,options)=>{uploads++;if(failure)throw Error('Synthetic cloud outage');const p=JSON.parse(options.body);return{ok:true,status:200,json:async()=>({id:p.id,sha256:p.sha256,verified:true,entryCount:1,createdAt:new Date(now).toISOString()})}}};
    sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(fs.readFileSync('cloud-backup.js','utf8'),sandbox);return sandbox.BTCloudBackup;
  }
  const original=storage.getItem('bt_e_v4');let app=runtime();
  await app.upload('automatic');assert.equal(notices.length,1);
  const stamp=JSON.parse(storage.getItem('bt_cloud_recovery_v1')).lastSuccessNoticeAt;
  await app.upload('automatic');assert.equal(notices.length,1,'Back-to-back uploads must not stack notices');
  app=runtime();await app.upload('automatic');assert.equal(notices.length,1,'Refresh must retain the cooldown');
  now=stamp+30*60*1000-1;await app.upload('manual');assert.equal(notices.length,1,'Manual uploads respect the same cooldown');
  assert.equal(JSON.parse(storage.getItem('bt_cloud_recovery_v1')).lastSuccessNoticeAt,stamp,'Suppressed notices must not extend the cooldown');
  failure=true;await assert.rejects(app.upload('automatic'),/Synthetic cloud outage/);
  assert.equal(app.protection().tone,'danger','Cooldown must not hide a failure state');assert.equal(notices.length,1);
  failure=false;now=stamp+30*60*1000;await app.upload('automatic');assert.equal(notices.length,2,'Notice becomes eligible at exactly 30 minutes');
  assert.equal(storage.getItem('bt_e_v4'),original,'Notification cooldown must not alter financial records');
  assert.equal(uploads,6,'Suppression must not suppress the backups themselves');
  console.log('Backup notices passed: 30-minute boundary, refresh, duplicate suppression, manual feedback, error visibility and unchanged records');
}
noticeCooldown().catch(e=>{console.error(e);process.exitCode=1});


// V3.6.0: mock owner-authenticated Railway/R2 usage and editable threshold state.
// Mock does not contact Railway, R2, or any financial provider.
async function hostingUsage(){
 const vm=require('node:vm'),fs=require('node:fs');
 const mem=new Map(),store={
  getItem:key=>mem.get(key)||null,setItem:(key,value)=>mem.set(key,String(value)),removeItem:key=>mem.delete(key)
 };
 const localSession={getItem:()=>null,setItem:()=>{}};
 let payload=null,authorized=[],promptValue=null,writes=0;
 const fake={
  window:null,localStorage:store,sessionStorage:localSession,Date,
  document:{getElementById:()=>null,querySelector:()=>null},
  setTimeout:()=>0,clearTimeout:()=>{},tab:'tax',
  R:()=>{},dB:()=>0,td:()=> '2026-10-17',fM:n=>'$'+Number(n).toFixed(2),fD:x=>x,
  bankLogo:()=>'',esc:x=>String(x),entries:[],
  prompt:()=>promptValue,
  BTPersistence:{commit(storage,changes){writes++;for(const [key,value] of Object.entries(changes))storage.setItem(key,value)}},
  BTBonusAuth:{connected:()=>true,token:async()=> 'synthetic-owner-token'},
  fetch:async(url,options)=>{
   assert.match(url,/bonus-tracker\/usage/);
   authorized.push(options.headers.Authorization);
   return {ok:true,status:200,json:async()=>payload};
  }
 };
 fake.window=fake;vm.createContext(fake);
 vm.runInContext(fs.readFileSync('redesign-v360.js','utf8'),fake);
 const model=fake.BT360;
 assert.equal(model.hostSettings().allowance,5);
 assert.equal(model.hostSettings().alertAt,4);
 const make=(projection,status='ok')=>({month:'2026-10',checkedAt:'2026-10-17T12:00:00Z',
  railway:{status,costSoFar:status==='ok'?projection/2:null,projectedMonthEnd:status==='ok'?projection:null,
           services:status==='ok'?[{name:'api',costSoFar:projection/3,avgMemoryGb:0.24},{name:'leaps-alpaca-live',costSoFar:projection/6,avgMemoryGb:0.42}]:[]},
  r2:{status:'ok',usedBytes:420000000,freeBytes:10000000000}});
 payload=make(3);await model.refreshUsage(true);
 assert.match(model.usageCard(),/Within plan/);
 assert.match(model.usageCard(),/R2 storage/);
 assert.match(model.usageCard(),/api/);
 payload=make(4.5);await model.refreshUsage(true);
 assert.match(model.usageCard(),/Near limit/);
 assert.match(model.home([],2026,{}),/Hosting cost may exceed your plan/);
 assert.doesNotMatch(model.home([],2026,{}),/Hosting cost may exceed your plan/,'Banner must show only once per month');
 payload=make(6);await model.refreshUsage(true);
 assert.match(model.usageCard(),/Over plan/);
 payload=make(0,'not_configured');await model.refreshUsage(true);
 assert.match(model.usageCard(),/Add a Railway account token/);
 assert.doesNotMatch(model.usageCard(),/Cost so far/);
 payload=make(0,'unavailable');await model.refreshUsage(true);
 assert.match(model.usageCard(),/Railway changed its billing data format/);
 assert(!/Cost so far/.test(model.usageCard()));
 const allReasonCodes=['token_missing','token_unauthorized','workspace_not_found','project_not_visible',
  'estimate_missing','measurement_missing','rate_limited','timeout','railway_unreachable','response_changed'];
 for(const code of allReasonCodes){
  payload={...make(0,'unavailable'),railway:{status:'unavailable',reasonCode:code,
    reason:'PRIVATE_REMOTE_RESPONSE_DO_NOT_RENDER',costSoFar:null,projectedMonthEnd:null}};
  await model.refreshUsage(true);
  const card=model.usageCard();
  assert.doesNotMatch(card,/PRIVATE_REMOTE_RESPONSE_DO_NOT_RENDER|synthetic-owner-token/);
  assert.doesNotMatch(card,/Verified \$0\.00/,'Missing data must never masquerade as zero');
  assert.match(card,/Try again/);
  assert.match(card,/View Railway usage/);
 }
 payload={...make(0),railway:{status:'partial',verifiedAt:'2026-10-17T12:00:00Z',
  costSoFar:null,projectedMonthEnd:null,knownCostSubtotal:2.15,
  services:[{name:'synthetic-api',costSoFar:2.15,avgMemoryGb:0.2},
   {name:'synthetic-journal',costSoFar:null,avgMemoryGb:null}],
  missing:[{service:'synthetic-journal',kind:'usage',metric:'NETWORK_TX_GB'}]}};
 await model.refreshUsage(true);
 assert.match(model.usageCard(),/Not reported by Railway/);
 assert.match(model.usageCard(),/total is incomplete/);
 assert.doesNotMatch(model.usageCard(),/\$0\.00/);
 payload={...make(0),railway:{status:'ok',verifiedAt:'2026-10-17T12:00:00Z',
  costSoFar:0,projectedMonthEnd:0,services:[{name:'synthetic-api',costSoFar:0,avgMemoryGb:0}]}};
 await model.refreshUsage(true);
 assert.match(model.usageCard(),/Verified \$0\.00/);
 promptValue='7.50';model.setHostingAmount('allowance');
 assert.equal(model.hostSettings().allowance,7.5);
 promptValue='6';model.setHostingAmount('alertAt');
 assert.equal(model.hostSettings().alertAt,6);
 assert(authorized.every(h=>h==='Bearer synthetic-owner-token'));
 assert(writes>=3);
 assert(fs.readFileSync('app.js','utf8').includes("'bt_hosting_usage_settings_v1'"),'Hosting settings must be in backup whitelist');
 console.log('Hosting usage passed: verified costs, thresholds, unavailable/no-token states, one-per-month alert, owner bearer token and backup key');
}
hostingUsage().catch(e=>{console.error(e);process.exitCode=1});
