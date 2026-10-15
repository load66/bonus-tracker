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
      getBackupStorageKeys:()=>['bt_e_v4'],BT_APP_VERSION:'3.4.65',BTCloudCore:core,
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
