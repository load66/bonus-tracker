/* Manual file backups. iCloud Drive is selected by the user in the system Files sheet. */
(function(){
'use strict';
const MODE='bt_backup_mode_v1',RECEIPT='bt_icloud_file_verified_v1';
const isManualBackup=()=>true;
const isLocalOnly=()=>{try{return localStorage.getItem(MODE)==='icloud'}catch{return false}};
const readReceipt=()=>{try{return JSON.parse(localStorage.getItem(RECEIPT)||'null')}catch{return null}};
const currentData=()=>{const out=buildStorageSnapshot();delete out.bt_last_backup;delete out.bt_hosting_usage_settings_v1;return out};
function fingerprint(data){
 const value=JSON.stringify(data),length=value.length;
 let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);
 return (hash>>>0).toString(16)+':'+length;
}
function status(){const receipt=readReceipt();return {mode:'icloud',exportedAt:getLastBk()||null,verifiedAt:receipt?.verifiedAt||null,hasFile:!!receipt,changed:!!receipt&&fingerprint(currentData())!==receipt.fingerprint};}
function verifyPayload(data){
 if(data?.backupType!=='full-fidelity-portable'||data?.manifest?.includesStorageSnapshot!==true)throw Error('Choose a complete BonusTracker backup file.');
 // Existing validator checks every account and source before a restore can ever be considered.
 const plan=stagePortableRestore(data);
 if(!plan||!Array.isArray(plan.entries))throw Error('Backup validation failed.');
 if(JSON.stringify(data.entries)!==JSON.stringify(entries))throw Error('The account records differ from this phone. Export a fresh full backup.');
 const embedded=normalizeBackupStorageSnapshot(data).bt_e_v4;
 if(embedded!==undefined&&JSON.stringify(embedded)!==JSON.stringify(data.entries))throw Error('The backup has inconsistent account copies. Export again.');
 const saved=normalizeBackupStorageSnapshot(data),now=currentData();
 for(const key of Object.keys(now)){
  if(JSON.stringify(saved[key])!==JSON.stringify(now[key]))throw Error('This file does not include your latest saved '+(key==='bt_e_v4'?'account records':'tracker information')+'. Export a new backup and try again.');
 }
 for(const key of Object.keys(saved)){
  if(key==='bt_last_backup'||key==='bt_hosting_usage_settings_v1')continue;
  if(JSON.stringify(saved[key])!==JSON.stringify(now[key]))throw Error('The backup and this phone differ. Export a new copy before replacing records.');
 }
 const counterparts=[
  ['personal datapoints',data.userDatapoints,loadUserDatapoints()],
  ['community datapoints',data.communityDatapoints,loadCommunityDatapoints()],
  ['direct-deposit methods',data.ddMethods,loadDD()],
  ['bank requirements',data.bankReqs,loadReqs()],
  ['phone book',data.phoneBook,loadPhoneEdits()],
  ['activity history',data.profileEvents,loadProfileEvents()],
  ['offer revisions',data.offerHistory,loadOfferHistory()],
  ['saved terms',data.termsArchive,loadTermsArchive()]
 ];
 for(const [label,archived,live] of counterparts)
  if(JSON.stringify(archived)!==JSON.stringify(live))throw Error('Saved '+label+' do not match this phone. Export the complete backup again.');
 if(data.prefs?.dashYear!==dashYear||data.prefs?.taxYear!==taxYear)
  throw Error('Backup preferences do not match this phone. Export a fresh backup.');
 if(data.entries?.length!==entries.length||plan.entries.length!==entries.length)throw Error('Account count differs. Export an up-to-date full backup.');
 return {verifiedAt:new Date().toISOString(),accounts:entries.length,fingerprint:fingerprint(currentData())};
}
function chooseFile(){
 return new Promise((resolve,reject)=>{
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
  const cleanup=()=>input.remove();
  input.oncancel=()=>{cleanup();reject(Object.assign(Error('No file selected.'),{name:'AbortError'}))};
  input.onchange=async()=>{const f=input.files?.[0];cleanup();if(!f){reject(Object.assign(Error('No file selected.'),{name:'AbortError'}));return}
   try{if(f.size>20*1024*1024)throw Error('Backup file is too large.');resolve({name:f.name,data:JSON.parse(await f.text())})}catch(error){reject(error)}
  };
  document.body.appendChild(input);input.click();
 });
}
async function exportFile(){
 const result=await exportBackup(true);
 window.btNotify?.(result.mode==='shared'?'Choose Save to Files → iCloud Drive to keep this backup.':'Backup file created. Move it to iCloud Drive using Files.',{title:'Backup file created'});
 return result;
}
async function verifyFile(){
 const item=await chooseFile();
 const receipt=verifyPayload(item.data);
 window.BTPersistence.commit(localStorage,{[RECEIPT]:JSON.stringify({...receipt,fileName:item.name})});
 window.btNotify?.('This file matches your current tracker. Its iCloud upload status is managed by Files.',{title:'Backup file checked',tone:'success'});
 return receipt;
}
async function beforeDestructive(){
 // Confirm a recoverable file before replacing meaningful local records.
 // Never erase or replace meaningful local records without a verified matching file.
 const existing=typeof entries!=='undefined'&&Array.isArray(entries)&&entries.length>0;
 const other=Object.entries(currentData()).some(([key,value])=>key!=='bt_e_v4'&&value!=null&&value!==''&&(Array.isArray(value)?value.length>0:typeof value==='object'?Object.keys(value).length>0:true));
 if(!existing&&!other)return;
 const receipt=readReceipt();
 if(!receipt||receipt.fingerprint!==fingerprint(currentData()))
  throw Error('Safety backup required: save and reopen an up-to-date full file from iCloud Drive before resetting or replacing this phone\'s records.');
}

let panel=null;
function openSetup(){
 // Settings is a separate fixed sheet with a higher stacking layer than the default modal.
 // Dismiss it first so Safari never hides the iCloud wizard under that sheet.
 if(window.bt360SettingsOpen&&window.BT360?.closeSettings)window.BT360.closeSettings();
 if(panel){panel.remove();panel=null}
 panel=document.createElement('div');panel.className='ov cloud-overlay icloud-backup-overlay';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Backup with iCloud Drive');panel.tabIndex=-1;
 const receipt=readReceipt(),state=status();
 const last=state.exportedAt?'Last file created: '+state.exportedAt:'No backup file created yet';
 const checked=receipt?'Last file checked: '+new Date(receipt.verifiedAt).toLocaleString()+(state.changed?' · Changes since this check':''):'Checking a saved file is optional.';
 panel.innerHTML='<section class="modal cloud-modal"><div class="icloud-backup-heading"><h2>iCloud Drive backup</h2><button type="button" id="icloud-close" aria-label="Close iCloud backup">×</button></div><p>Save a full copy of your tracker. In the share sheet, choose <b>Save to Files → iCloud Drive</b>.</p><p id="icloud-backup-status">'+last+'</p><div class="bt360-actions"><button type="button" class="btn-p" id="icloud-save">Save backup file</button><button type="button" class="btn-s" id="icloud-restore">Restore from file</button></div><details class="icloud-file-check"><summary>Check a saved file</summary><p id="icloud-file-status">'+checked+'</p><button type="button" class="btn-s" id="icloud-verify">Choose file to check</button></details><p id="icloud-switch-feedback" role="status" aria-live="polite" hidden></p><p class="bt360-muted">Manual backups only. New changes need a new file. Check Files to confirm the file has reached iCloud Drive.</p></section>';
 document.body.append(panel);
 const statusEl=panel.querySelector('#icloud-backup-status'),switchFeedback=panel.querySelector('#icloud-switch-feedback');
 const feedback=(message,tone='error')=>{
   switchFeedback.textContent=String(message);switchFeedback.dataset.tone=tone;switchFeedback.hidden=false;
   switchFeedback.scrollIntoView?.({block:'nearest'});
 };
 const report=e=>{if(e?.name!=='AbortError')feedback(e?.message||String(e))};
 panel.querySelector('#icloud-save').onclick=async()=>{const button=panel.querySelector('#icloud-save');button.disabled=true;try{await exportFile();statusEl.textContent='Last file created: '+status().exportedAt;}catch(error){report(error)}finally{button.disabled=false}};
 panel.querySelector('#icloud-verify').onclick=()=>verifyFile().then(r=>{panel.querySelector('#icloud-file-status').textContent='File checked: '+new Date(r.verifiedAt).toLocaleString()}).catch(report);
 panel.querySelector('#icloud-restore').onclick=()=>{panel.remove();panel=null;importBackup()};
 panel.querySelector('#icloud-close').onclick=()=>{panel.remove();panel=null};
 panel.onclick=e=>{if(e.target===panel){panel.remove();panel=null}};
 panel.focus({preventScroll:true});
}
window.BTICloudBackup={isManualBackup,isLocalOnly,status,exportFile,verifyPayload,verifyFile,openSetup,beforeDestructive};
})();
