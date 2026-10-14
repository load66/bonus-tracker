/* Exact recovery snapshots: credentials and cloud connection state are excluded. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.BTCloudCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FORMAT='BonusTrackerCloudBackup',VERSION=1,MAX_BYTES=8*1024*1024;
  function snapshot(storage,keys,prefs,appVersion){
    const raw={};for(const key of keys){const value=storage.getItem(key);if(value!==null)raw[key]=value;}
    if(!Object.hasOwn(raw,'bt_e_v4'))raw.bt_e_v4='[]';
    return JSON.stringify({format:FORMAT,version:VERSION,appVersion,prefs,storageSnapshot:raw});
  }
  function inspect(raw,keys){
    if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_BYTES)throw Error('Backup size is unsupported.');
    const data=JSON.parse(raw),allowed=new Set([...keys,'bt_last_restore']);
    if(data.format!==FORMAT||data.version!==VERSION||!data.storageSnapshot||!data.prefs)throw Error('Backup format is unsupported.');
    for(const [k,v]of Object.entries(data.storageSnapshot))if(!allowed.has(k)||typeof v!=='string')throw Error('Backup contains unsupported storage.');
    if(!['dashYear','taxYear'].every(k=>Number.isInteger(data.prefs[k])&&data.prefs[k]>=1900&&data.prefs[k]<=2200))throw Error('Backup preferences are invalid.');
    const rows=JSON.parse(data.storageSnapshot.bt_e_v4);
    if(!Array.isArray(rows)||rows.some(e=>!e||typeof e.bank!=='string'||!e.bank.trim()))throw Error('Backup account records are invalid.');
    return{data,entries:rows,entryCount:rows.length};
  }
  function hasRecords(result){
    if(result.entryCount)return true;
    const meaningful=['bt_t_v4','bt_user_datapoints_v1','bt_dd_methods','bt_bank_reqs','bt_offer_history_v1','bt_tc_archive_v1','bt_phone_book_v1','bt_profile_events_v1','bt_tc_learning_inbox_v320','bt_analyzer_user_rules_v1'];
    return meaningful.some(k=>{try{const v=JSON.parse(result.data.storageSnapshot[k]||'null');return Array.isArray(v)?v.length>0:v&&typeof v==='object'&&Object.keys(v).length>0;}catch{return false;}});
  }
  async function digest(raw){const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  function restore(storage,raw,keys,persistence){
    const result=inspect(raw,keys),writes={};
    for(const key of [...keys,'bt_last_restore'])writes[key]=Object.hasOwn(result.data.storageSnapshot,key)?result.data.storageSnapshot[key]:null;
    persistence.commit(storage,writes);
    return result;
  }
  return{FORMAT,VERSION,MAX_BYTES,snapshot,inspect,hasRecords,digest,restore};
});
