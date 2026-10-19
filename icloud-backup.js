/* Manual iCloud Drive migration: no browser write access to iCloud; user verifies a file through Files. */
(function(){
'use strict';
const MODE='bt_backup_mode_v1',RECEIPT='bt_icloud_file_verified_v1';
const isLocalOnly=()=>{try{return localStorage.getItem(MODE)==='icloud'}catch{return false}};
const readReceipt=()=>{try{return JSON.parse(localStorage.getItem(RECEIPT)||'null')}catch{return null}};
const currentData=()=>{const out=buildStorageSnapshot();delete out.bt_last_backup;delete out.bt_hosting_usage_settings_v1;return out};
function fingerprint(data){
 const value=JSON.stringify(data),length=value.length;
 let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);
 return (hash>>>0).toString(16)+':'+length;
}
function status(){const receipt=readReceipt();return {mode:isLocalOnly()?'icloud':'railway',verifiedAt:receipt?.verifiedAt||null,hasFile:!!receipt,changed:!!receipt&&fingerprint(currentData())!==receipt.fingerprint};}
function verifyPayload(data){
 if(data?.backupType!=='full-fidelity-portable'||data?.manifest?.includesStorageSnapshot!==true)throw Error('Choose a complete BonusTracker backup file.');
 // Existing validator checks every account and source before a restore can ever be considered.
 const plan=stagePortableRestore(data);
 if(!plan||!Array.isArray(plan.entries))throw Error('Backup validation failed.');
 const saved=normalizeBackupStorageSnapshot(data),now=currentData();
 for(const key of Object.keys(now)){
  if(JSON.stringify(saved[key])!==JSON.stringify(now[key]))throw Error('This file does not include your latest saved '+(key==='bt_e_v4'?'account records':'tracker information')+'. Export a new backup and try again.');
 }
 for(const key of Object.keys(saved)){
  if(key==='bt_last_backup'||key==='bt_hosting_usage_settings_v1')continue;
  if(JSON.stringify(saved[key])!==JSON.stringify(now[key]))throw Error('The backup and this phone differ. Export a new copy before switching.');
 }
 if(data.entries?.length!==entries.length||plan.entries.length!==entries.length)throw Error('Account count differs. Export an up-to-date full backup.');
 return {verifiedAt:new Date().toISOString(),accounts:entries.length,fingerprint:fingerprint(currentData())};
}
function chooseFile(){
 return new Promise((resolve,reject)=>{
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.onchange=async()=>{const f=input.files?.[0];if(!f){reject(Error('No file selected.'));return}
   try{if(f.size>20*1024*1024)throw Error('Backup file is too large.');resolve({name:f.name,data:JSON.parse(await f.text())})}catch(error){reject(error)}
  };
  input.click();
 });
}
async function exportFile(){
 const result=await exportBackup(true);
 window.btNotify?.('Choose Save to Files, select iCloud Drive, then verify the saved file. Exporting is not proof of iCloud upload.',{title:'Save backup in iCloud Drive'});
 return result;
}
async function verifyFile(){
 const item=await chooseFile();
 const receipt=verifyPayload(item.data);
 window.BTPersistence.commit(localStorage,{[RECEIPT]:JSON.stringify({...receipt,fileName:item.name})});
 window.btNotify?.('Backup contents match your current tracker. Keep this file in iCloud Drive.',{title:'Backup file checked',tone:'success'});
 return receipt;
}
async function switchToICloud(){
 const receipt=readReceipt();
 if(!receipt||fingerprint(currentData())!==receipt.fingerprint)throw Error('First export and verify the latest complete backup file from iCloud Drive.');
 const ok=await window.btConfirmDialog('Switch to manual iCloud Drive backups?\n\nBonusTracker will save changes on this phone; you must export new copies yourself. Online AI, live official-offer checks, and Railway cloud history will no longer update. Your old server backups will not be deleted.',{title:'Use iCloud Drive files',confirmLabel:'Switch to iCloud'});
 if(!ok)return false;
 const oldCfg=(()=>{try{return JSON.parse(localStorage.getItem('bt_cloud_recovery_v1')||'{}')}catch{return{}}})();
 const nextCfg={...oldCfg,enabled:false,pending:false};
 window.BTPersistence.commit(localStorage,{[MODE]:'icloud',bt_cloud_recovery_v1:JSON.stringify(nextCfg)});
 if(typeof location?.reload==='function')location.reload();else window.btNotify?.('iCloud-only mode is enabled. Reload BonusTracker.');
 return true;
}
let panel=null;
function openSetup(){
 if(panel){panel.remove();panel=null}
 panel=document.createElement('div');panel.className='ov cloud-overlay';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Backup with iCloud Drive');
 const active=isLocalOnly(),receipt=readReceipt();
 panel.innerHTML='<section class="modal cloud-modal"><h2>Back up to iCloud Drive</h2><p>Your tracker stays on this phone. Save a complete file to iCloud Drive whenever you make important changes.</p><p id="icloud-backup-status">'+(receipt?'Last file checked: '+new Date(receipt.verifiedAt).toLocaleString():'No backup file checked yet')+'</p><div class="bt360-actions"><button type="button" class="btn-p" id="icloud-save">1. Save backup file</button><button type="button" class="btn-s" id="icloud-verify">2. Check file from iCloud</button>'+(active?'<button type="button" class="btn-s" id="icloud-restore">Restore from file</button>':'<button type="button" class="btn-p" id="icloud-switch">3. Switch to iCloud only</button>')+'</div><p class="bt360-muted">A website cannot write automatically to iCloud Drive. A saved file is recoverable on a new phone only after it reaches iCloud. This backup file contains private financial notes; keep it private.</p><button class="btn-s" id="icloud-close">Close</button></section>';
 document.body.append(panel);
 const statusEl=panel.querySelector('#icloud-backup-status');const report=e=>{statusEl.textContent=e.message||String(e)};
 panel.querySelector('#icloud-save').onclick=()=>exportFile().catch(report);
 panel.querySelector('#icloud-verify').onclick=()=>verifyFile().then(r=>{statusEl.textContent='File checked: '+new Date(r.verifiedAt).toLocaleString()}).catch(report);
 if(active)panel.querySelector('#icloud-restore').onclick=()=>{panel.remove();panel=null;importBackup()};
 else panel.querySelector('#icloud-switch').onclick=()=>switchToICloud().catch(report);
 panel.querySelector('#icloud-close').onclick=()=>{panel.remove();panel=null};
 panel.onclick=e=>{if(e.target===panel){panel.remove();panel=null}};
 panel.querySelector('#icloud-close').focus();
}
window.BTICloudBackup={isLocalOnly,status,verifyPayload,verifyFile,exportFile,switchToICloud,openSetup};
})();