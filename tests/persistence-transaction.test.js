'use strict';
const fs=require('fs');
const P=require('../persistence-transaction.js');

function assert(ok,msg){if(!ok)throw new Error(msg)}
class FakeStorage{
  constructor(seed={},fail=null){this.map=new Map(Object.entries(seed));this.fail=fail;this.failed=false}
  getItem(k){return this.map.has(k)?this.map.get(k):null}
  setItem(k,v){
    const value=String(v);
    if(!this.failed&&this.fail&&this.fail(k,value)){this.failed=true;throw new Error('simulated storage failure for '+k)}
    this.map.set(k,value)
  }
  removeItem(k){
    if(!this.failed&&this.fail&&this.fail(k,null)){this.failed=true;throw new Error('simulated storage delete failure for '+k)}
    this.map.delete(k)
  }
}

assert(P.VERSION==='1.0.0','Unexpected persistence transaction version');

const okStore=new FakeStorage({a:'old-a',b:'old-b'});
const ok=P.commit(okStore,{a:'new-a',b:'new-b',c:'new-c'});
assert(ok.ok&&okStore.getItem('a')==='new-a'&&okStore.getItem('b')==='new-b'&&okStore.getItem('c')==='new-c','Successful transaction did not commit all keys');

const failStore=new FakeStorage({a:'old-a',b:'old-b'},(k,v)=>k==='b'&&v==='new-b');
let failed=false;
try{P.commit(failStore,{a:'new-a',b:'new-b',c:'new-c'})}catch{failed=true}
assert(failed,'Injected storage failure did not fail the transaction');
assert(failStore.getItem('a')==='old-a','Rollback did not restore an already-written key');
assert(failStore.getItem('b')==='old-b','Rollback did not preserve the failing key');
assert(failStore.getItem('c')===null,'Rollback did not remove a newly-created key');

const deleteStore=new FakeStorage({keep:'1',remove:'2'});
P.commit(deleteStore,{keep:'3',remove:null});
assert(deleteStore.getItem('keep')==='3'&&deleteStore.getItem('remove')===null,'Verified delete transaction failed');

const app=fs.readFileSync('app.js','utf8');
assert(app.includes('function stagePortableRestore(d)'),'Portable restore is not staged before commit');
assert(app.includes("window.BTPersistence.commit(localStorage,plan.writes)"),'Portable restore is not using the transaction core');
assert(app.includes("writes.bt_last_restore=new Date().toISOString()"),'Restore audit timestamp is not part of the verified transaction');
const applyStart=app.indexOf('function applyPortableRestore(d)');
const applyEnd=app.indexOf('\nfunction importBackup()',applyStart);
const apply=app.slice(applyStart,applyEnd);
assert(apply.indexOf('commitPortableRestorePlan(plan)')>=0,'Restore never commits the staged transaction');
assert(apply.indexOf('commitPortableRestorePlan(plan)')<apply.indexOf('entries=plan.entries'),'In-memory entries change before storage commit succeeds');
assert(!/\bsv\(SK,entries\)/.test(apply),'Restore still performs an unverified direct entry save');

const workflow=fs.readFileSync('.github/workflows/close-rules.yml','utf8');
assert(workflow.includes('node tests/persistence-transaction.test.js'),'CI does not gate deploy on transactional restore regression');

console.log('Persistence transaction passed: verified multi-key commit, rollback after injected failure, deletion verification, and commit-before-live-state restore ordering');
