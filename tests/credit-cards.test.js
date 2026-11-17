'use strict';
// Retirement coverage replaces the removed feature's import/edit/browser journeys.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../cloud-backup-core.js');
const persistence=require('../persistence-transaction.js');
const {sandbox:s,app,storage}=require('./full-app-smoke.test.js');
const KEY='bt_credit_cards_v1';
const legacy=JSON.stringify({version:1,cards:[{current:{id:'retired-synthetic',name:'Saved plan',opened:'2026-01-01'},history:[{name:'Prior plan'}]}],removedCards:[{current:{id:'removed-synthetic'},history:[]}]});
function device(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}}
s.localStorage.setItem(KEY,legacy);
setTimeout(()=>{
 try{
  const before=s.localStorage.getItem('bt_e_v4');
  for(const tab of ['tracker','tax','tips','storage','archive','tracker']){
   vm.runInContext(`tab='${tab}';expanded=null;R()`,s);
   assert.doesNotMatch(app.innerHTML,/BTCards|cc-switch|cc-page|>Credit cards</);
  }
  assert.equal(typeof s.BTCards,'undefined');
  assert.equal(s.localStorage.getItem(KEY),legacy);
  assert.equal(s.localStorage.getItem('bt_e_v4'),before);
  assert(s.getBackupStorageKeys().includes(KEY));
  assert.equal(JSON.stringify(s.buildStorageSnapshot()[KEY]),legacy);
  const target=device(),keys=s.getBackupStorageKeys();
  const snapshot=core.snapshot(s.localStorage,keys,{dashYear:2026,taxYear:2026},'3.8.16');
  core.restore(target,snapshot,keys,persistence);
  assert.equal(target.getItem(KEY),legacy,'Retired history must survive exact backup/restore');
  for(const file of ['index.html','sw.js'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/credit-cards\.js/);
  assert.equal(fs.existsSync('credit-cards.js'),false);
  assert.doesNotMatch(fs.readFileSync('redesign-v360.css','utf8'),/\.cc-(?:page|switch|account)/);
  assert.match(app.innerHTML,/tracker-overview/);
  assert.match(app.innerHTML,/Add bonus/);
  console.log('Credit-card retirement: direct bank navigation, no runtime/assets, unchanged records and exact recovery PASS');
 }catch(error){console.error(error);process.exitCode=1}
},2300);
