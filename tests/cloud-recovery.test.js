'use strict';
const assert=require('node:assert/strict'),core=require('../cloud-backup-core.js'),persistence=require('../persistence-transaction.js');
const keys=['bt_e_v4','bt_t_v4','bt_tc_archive_v1','bt_user_datapoints_v1'];
class Store{constructor(rows={}){this.data=new Map(Object.entries(rows));}get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}setItem(k,v){if(this.failKey===k&&v!==this.oldValue)throw Error('Storage full');this.data.set(k,v);}removeItem(k){this.data.delete(k);}}
const original=new Store({bt_e_v4:JSON.stringify([{id:'one',bank:'Synthetic CU',notes:'Exact notes',financialRules:{version:1},customTimers:[{id:'timer',done:true}],deletedTimerKeys:['id::source-deletion'],closed:'2026-10-14'}]),bt_t_v4:'[2026]',bt_tc_archive_v1:'{"exact":"original terms"}',bt_user_datapoints_v1:'[{"method":"payroll"}]','bonus-ai-auth':'secret','bt_cloud_recovery_v1':'device-state'});
const raw=core.snapshot(original,keys,{dashYear:2026,taxYear:2027},'3.4.59');
assert.ok(!raw.includes('secret')&&!raw.includes('device-state'));
const freshPhone=new Store({'bonus-ai-auth':'new-phone-login','bt_deleted_timer_keys_v1:one':'["id::timer"]','bt_deleted_timer_keys_v1:old':'["id::old"]'});
const result=core.restore(freshPhone,raw,keys,persistence);
assert.equal(result.entryCount,1);for(const k of keys)assert.equal(freshPhone.getItem(k),original.getItem(k));
assert.equal(freshPhone.getItem('bonus-ai-auth'),'new-phone-login');
assert.equal(freshPhone.getItem('bt_deleted_timer_keys_v1:old'),null);
assert.equal(freshPhone.getItem('bt_deleted_timer_keys_v1:one'),'["id::source-deletion"]');
const failing=new Store({bt_e_v4:'[{"id":"old","bank":"Old bank"}]',bt_t_v4:'[2025]'});const before=[...failing.data];failing.failKey='bt_t_v4';failing.oldValue='[2025]';
assert.throws(()=>core.restore(failing,raw,keys,persistence),/Storage full/);assert.deepEqual(Object.fromEntries(failing.data),Object.fromEntries(before));
const malformed=JSON.parse(raw);malformed.storageSnapshot['bonus-ai-auth']='stolen';assert.throws(()=>core.inspect(JSON.stringify(malformed),keys),/unsupported storage/);
malformed.storageSnapshot=JSON.parse(raw).storageSnapshot;malformed.version=2;assert.throws(()=>core.inspect(JSON.stringify(malformed),keys),/unsupported/);
(async()=>{assert.equal((await core.digest(raw)).length,64);assert.notEqual(await core.digest(raw),await core.digest(raw+' '));console.log('Cloud recovery passed: fresh-phone exact record restoration, credential isolation, checksum, version gate and rollback on injected write failure');})().catch(e=>{console.error(e);process.exitCode=1;});

// A partial restore can allocate new keys before failing; rollback must free them before restoring larger originals.
class QuotaStore extends Store{setItem(k,v){const proposed=new Map(this.data);proposed.set(k,v);if([...proposed.values()].reduce((s,x)=>s+x.length,0)>25)throw Error('Quota');super.setItem(k,v);}}
const quota=new QuotaStore({a:'x'.repeat(20),b:'y'});
assert.throws(()=>persistence.commit(quota,{a:'z',added:'w'.repeat(20),b:'v'.repeat(10)}),/Quota/);
assert.equal(quota.getItem('a'),'x'.repeat(20));assert.equal(quota.getItem('added'),null);assert.equal(quota.getItem('b'),'y');
