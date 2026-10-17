/* Exact recovery snapshots: credentials and cloud connection state are excluded. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.BTCloudCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FORMAT='BonusTrackerCloudBackup',VERSION=1,MAX_BYTES=8*1024*1024;
  function snapshot(storage,keys,prefs,appVersion){
    const raw={};for(const key of keys){if(key==='bt_tc_learning_inbox_v320')continue;const value=storage.getItem(key);if(value!==null)raw[key]=value;}
    if(!Object.hasOwn(raw,'bt_e_v4'))raw.bt_e_v4='[]';
    return JSON.stringify({format:FORMAT,version:VERSION,appVersion,prefs,storageSnapshot:raw});
  }
  function inspect(raw,keys){
    if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_BYTES)throw Error('Backup size is unsupported.');
    const data=JSON.parse(raw),allowed=new Set([...keys,'bt_last_restore','bt_tc_learning_inbox_v320']); // Accept old snapshots; never restore the retired key.
    if(data.format!==FORMAT||data.version!==VERSION||!data.storageSnapshot||!data.prefs)throw Error('Backup format is unsupported.');
    for(const [k,v]of Object.entries(data.storageSnapshot))if(!allowed.has(k)||typeof v!=='string')throw Error('Backup contains unsupported storage.');
    if(!['dashYear','taxYear'].every(k=>Number.isInteger(data.prefs[k])&&data.prefs[k]>=1900&&data.prefs[k]<=2200))throw Error('Backup preferences are invalid.');
    const rows=JSON.parse(data.storageSnapshot.bt_e_v4);
    if(!Array.isArray(rows)||rows.some(e=>!e||typeof e.bank!=='string'||!e.bank.trim()))throw Error('Backup account records are invalid.');
    return{data,entries:rows,entryCount:rows.length};
  }
  function hasRecords(result){
    if(result.entryCount)return true;
    const meaningful=['bt_t_v4','bt_user_datapoints_v1','bt_dd_methods','bt_bank_reqs','bt_offer_history_v1','bt_tc_archive_v1','bt_phone_book_v1','bt_profile_events_v1','bt_analyzer_user_rules_v1'];
    return meaningful.some(k=>{try{const v=JSON.parse(result.data.storageSnapshot[k]||'null');return Array.isArray(v)?v.length>0:v&&typeof v==='object'&&Object.keys(v).length>0;}catch{return false;}});
  }
  async function digest(raw){const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  function restore(storage,raw,keys,persistence){
    const result=inspect(raw,keys),writes={};
    for(const key of [...keys,'bt_last_restore']){if(key==='bt_tc_learning_inbox_v320')continue;writes[key]=Object.hasOwn(result.data.storageSnapshot,key)?result.data.storageSnapshot[key]:null;}
    // Timer deletion markers belong to the restored accounts, not the previous device state.
    const timerPrefix='bt_deleted_timer_keys_v1:';
    for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(timerPrefix))writes[key]=null;}
    for(const entry of result.entries)if(typeof entry.id==='string'&&Array.isArray(entry.deletedTimerKeys))writes[timerPrefix+entry.id]=JSON.stringify(entry.deletedTimerKeys);
    persistence.commit(storage,writes);
    return result;
  }
  function protectionState(cfg,runtime){
    if(!cfg.enabled)return{tone:'off',title:'Automatic backup is OFF',detail:'New changes stay on this phone. Existing verified cloud versions remain available.'};
    if(!runtime.connected)return{tone:'danger',title:'Sign-in required',detail:'Automatic backup is ON, but new changes cannot upload until you sign in.'};
    if(cfg.error)return{tone:'danger',title:'Backup needs attention',detail:'Recent changes may not be protected. '+cfg.error};
    if(!runtime.online)return{tone:'warning',title:'Offline · upload pending',detail:'Cloud recovery covers your last verified upload. New offline changes still need to upload.'};
    if(runtime.busy)return{tone:'warning',title:'Uploading and verifying',detail:'Keep the app open until verification completes. The latest changes are not confirmed yet.'};
    if(runtime.pending)return{tone:'warning',title:'Changes waiting for backup',detail:'Your latest changes are not verified in the cloud yet. Automatic upload will retry.'};
    if(!runtime.currentVerified||!cfg.lastAt||!/^[a-f0-9]{64}$/.test(cfg.lastHash||''))return{tone:'warning',title:'Checking current protection',detail:'Automatic backup is ON. Current protection will be confirmed after verification.'};
    return{tone:'protected',title:'Current data verified in the cloud',detail:'Automatic backup is ON. This verified version can be recovered if this phone is lost or damaged.'};
  }
  return{FORMAT,VERSION,MAX_BYTES,snapshot,inspect,hasRecords,digest,restore,protectionState};
});
