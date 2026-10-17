'use strict';
// Entirely synthetic: exercise the installed app runtime with failing safety backups.
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {sandbox,document,storage}=require('./full-app-smoke.test.js');

(async()=>{
  const originalCreate=document.createElement.bind(document);
  const originalConfirm=sandbox.btConfirmDialog;
  const originalApply=sandbox.applyPortableRestore;
  const originalExport=sandbox.exportBackup;
  const originalCloud=sandbox.btCloudBeforeDestructive;
  const originalAlert=sandbox.alert;
  const messages=[];
  let restores=0,exports=0,resets=0;
  const sample=JSON.stringify(sandbox.buildPortableBackupPayload());
  document.createElement=tag=>{
    if(String(tag).toLowerCase()!=='input')return originalCreate(tag);
    return {type:'',accept:'',click(){this.onchange?.({target:{files:[{contents:sample}]}})}};
  };
  sandbox.FileReader=class{readAsText(file){this.onload?.({target:{result:file.contents}})}};
  sandbox.btConfirmDialog=async()=>true;
  sandbox.alert=msg=>messages.push(String(msg));
  sandbox.btNotify=msg=>messages.push(String(msg));
  sandbox.applyPortableRestore=()=>{restores++};
  sandbox.performHardReset=()=>{resets++};
  const before=storage.get('bt_e_v4');
  const settled=()=>new Promise(resolve=>setTimeout(resolve,35));
  try{
    sandbox.btCloudBeforeDestructive=async()=>{throw Error('Synthetic cloud safety outage')};
    sandbox.exportBackup=async()=>{exports++};
    sandbox.importBackup();
    await settled();
    assert.equal(restores,0,'Downloaded restore must stop after cloud safety backup failure');
    assert.equal(exports,0,'Downloaded restore must not attempt file export after cloud backup failure');
    assert.equal(storage.get('bt_e_v4'),before,'Failed cloud safety backup must leave account records untouched');
    assert(messages.some(x=>/safety backup|restore stopped/i.test(x)),'Failure should explain the safety block');

    sandbox.btCloudBeforeDestructive=async()=>{};
    sandbox.exportBackup=async()=>{exports++;throw Error('Synthetic local file export failure')};
    sandbox.importBackup();
    await settled();
    assert.equal(restores,0,'Downloaded restore must stop after file safety export failure');
    assert.equal(storage.get('bt_e_v4'),before,'Failed file safety export must leave account records untouched');

    sandbox.exportBackup=async()=>{exports++;return {mode:'downloaded',filename:'synthetic.json'}};
    sandbox.importBackup();
    await settled();
    assert.equal(restores,1,'Restore should proceed only when BOTH safety operations succeed');

    sandbox.btCloudBeforeDestructive=async()=>{throw Error('Synthetic reset cloud safety outage')};
    sandbox.resetAllData();
    vm.runInContext('cfm.action()',sandbox);
    await vm.runInContext('cfm.action()',sandbox);
    assert.equal(resets,0,'Device reset must stop when its cloud safety backup fails');
    assert.equal(storage.get('bt_e_v4'),before,'Blocked reset must retain exact stored account records');

    sandbox.btCloudBeforeDestructive=async()=>{};
    sandbox.exportBackup=async()=>{throw Error('Synthetic reset file export failure')};
    sandbox.resetAllData();
    vm.runInContext('cfm.action()',sandbox);
    await vm.runInContext('cfm.action()',sandbox);
    assert.equal(resets,0,'Device reset must stop when safety file export fails');
    assert.equal(storage.get('bt_e_v4'),before,'Blocked reset must not destroy local records');
    console.log('Restore/reset safety passed: cloud and file safety failures fail closed; successful restore proceeds');
  }finally{
    document.createElement=originalCreate;
    sandbox.btConfirmDialog=originalConfirm;
    sandbox.applyPortableRestore=originalApply;
    sandbox.exportBackup=originalExport;
    sandbox.btCloudBeforeDestructive=originalCloud;
    sandbox.alert=originalAlert;
  }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
