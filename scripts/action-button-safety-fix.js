/*
 * filename: scripts/action-button-safety-fix.js
 * version: 3.3.1
 * purpose: Stable action safety + full device-transfer backup/restore. No version badge control.
 * last-touched: unknown
 */
(function(){
  const VER='3.3.1';
  const BACKUP_KIND='bonus-tracker-full-device-backup';
  const APP_PREFIX='bt_';
  const KNOWN_KEYS=[
    'bt_e_v4','bt_t_v4','bt_dd_methods','bt_bank_reqs','bt_last_backup','bt_last_restore','bt_phone_book_v1','bt_user_datapoints_v1','bt_community_datapoints_v1','bt_community_datapoints_seed_v2','bt_profile_events_v1','bt_tc_learning_inbox_v320'
  ];

  function addStyle(){
    let st=document.getElementById('bt_action_button_safety_style');
    if(!st){st=document.createElement('style');st.id='bt_action_button_safety_style';document.head.appendChild(st);}
    st.textContent=`button,[role="button"],a,input[type="button"],input[type="submit"]{touch-action:manipulation}`;
  }
  function cleanup(){
    const menu=document.getElementById('bt_tools_folder_menu');
    if(!menu||menu.hasAttribute('hidden')) document.getElementById('bt_tools_backdrop')?.remove();
    ['v32_inbox_btn','v31_profile_btn'].forEach(id=>{const el=document.getElementById(id);if(el){el.style.display='none';el.style.pointerEvents='none';}});
  }
  function buttonInfo(){
    return Array.from(document.querySelectorAll('button,a,[role="button"],input[type="button"],input[type="submit"]')).map((el,i)=>{
      const r=el.getBoundingClientRect();
      const s=getComputedStyle(el);
      const text=(el.textContent||el.value||el.getAttribute('aria-label')||el.getAttribute('title')||'').trim().replace(/\s+/g,' ').slice(0,60);
      return {i,text,tag:el.tagName,id:el.id||'',class:String(el.className||''),visible:r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden',pointerEvents:s.pointerEvents,rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};
    }).filter(x=>x.visible);
  }

  function todayStamp(){const d=new Date();const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes());}
  function hashString(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);}return (h>>>0).toString(16).padStart(8,'0');}
  function safeJson(v,d){try{return JSON.parse(v)}catch{return d}}
  function storageSnapshot(){
    const out={};
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k)out[k]=localStorage.getItem(k);}
    try{if(Array.isArray(entries))out.bt_e_v4=JSON.stringify(entries)}catch{}
    return out;
  }
  function countFrom(storage,key){const parsed=safeJson(storage[key],null);if(Array.isArray(parsed))return parsed.length;if(parsed&&typeof parsed==='object')return Object.keys(parsed).length;return 0;}
  function makeBackupPayload(reason='manual'){
    const localStorageData=storageSnapshot();
    const summary={
      entries:countFrom(localStorageData,'bt_e_v4'),
      taxOrTimers:countFrom(localStorageData,'bt_t_v4'),
      datapoints:countFrom(localStorageData,'bt_user_datapoints_v1'),
      phoneContacts:countFrom(localStorageData,'bt_phone_book_v1'),
      tcSamples:countFrom(localStorageData,'bt_tc_learning_inbox_v320'),
      profileEvents:countFrom(localStorageData,'bt_profile_events_v1'),
      totalStorageKeys:Object.keys(localStorageData).length
    };
    const payload={kind:BACKUP_KIND,backupVersion:'full-v1',app:'BonusTracker',appVersion:VER,createdAt:new Date().toISOString(),reason,url:location.href,userAgent:navigator.userAgent,summary,localStorage:localStorageData};
    payload.checksum=hashString(JSON.stringify(payload));
    return payload;
  }
  function downloadJson(obj,name){
    const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},1500);
  }
  function exportFullBackup(reason='manual'){
    const payload=makeBackupPayload(reason);
    try{localStorage.setItem('bt_last_backup',new Date().toISOString().split('T')[0])}catch{}
    downloadJson(payload,'bonus-tracker-full-backup-'+todayStamp()+'.json');
    setTimeout(()=>alert('Full backup saved. Keep this JSON file in iCloud Drive, Google Drive, or Files.\n\nSaved: '+payload.summary.entries+' banks, '+payload.summary.tcSamples+' T&C samples, '+payload.summary.datapoints+' datapoints.'),250);
    return payload;
  }
  function validateBackup(obj){
    if(!obj||typeof obj!=='object')return {ok:false,error:'Backup file is not valid JSON.'};
    const storage=obj.localStorage||obj.storage||null;
    if(!storage||typeof storage!=='object')return {ok:false,error:'No localStorage data found in this backup.'};
    if(obj.kind&&obj.kind!==BACKUP_KIND)return {ok:false,error:'This JSON is not a BonusTracker full backup.'};
    const hasEntries=Object.prototype.hasOwnProperty.call(storage,'bt_e_v4');
    const hasAny=Object.keys(storage).some(k=>k.startsWith(APP_PREFIX)||KNOWN_KEYS.includes(k));
    if(!hasEntries&&!hasAny)return {ok:false,error:'This backup does not contain BonusTracker app keys.'};
    return {ok:true,storage};
  }
  function restoreFromObject(obj){
    const v=validateBackup(obj);
    if(!v.ok){alert(v.error);return false;}
    const storage=v.storage;
    const entryCount=countFrom(storage,'bt_e_v4');
    const tcCount=countFrom(storage,'bt_tc_learning_inbox_v320');
    const msg='Restore this backup?\n\nThis will replace the current app data on this phone.\n\nBackup contains:\n• '+entryCount+' bank entries\n• '+tcCount+' saved T&C samples\n• '+Object.keys(storage).length+' storage keys\n\nA current backup will download first as a safety copy.';
    if(!confirm(msg))return false;
    try{exportFullBackup('pre-restore-safety-copy')}catch{}
    setTimeout(()=>{
      try{
        const existing=[];
        for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k)existing.push(k);}
        existing.forEach(k=>{if(k.startsWith(APP_PREFIX)||KNOWN_KEYS.includes(k))localStorage.removeItem(k);});
        Object.entries(storage).forEach(([k,val])=>{try{localStorage.setItem(k,String(val??''))}catch{}});
        localStorage.setItem('bt_last_restore',new Date().toISOString());
        alert('Restore complete. The app will reload now.');
        location.reload();
      }catch(e){alert('Restore failed: '+(e&&e.message?e.message:e));}
    },650);
    return true;
  }
  function chooseRestoreFile(){
    const input=document.createElement('input');input.type='file';input.accept='application/json,.json';input.style.display='none';
    input.onchange=()=>{const file=input.files&&input.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{restoreFromObject(JSON.parse(String(reader.result||'')))}catch(e){alert('Could not read backup JSON: '+(e&&e.message?e.message:e));}};reader.readAsText(file);setTimeout(()=>input.remove(),3000);};
    document.body.appendChild(input);input.click();
  }
  function buttonText(el){return (el.textContent||el.value||el.getAttribute('aria-label')||el.getAttribute('title')||'').trim().replace(/\s+/g,' ');}
  function hookBackupRestoreButtons(){
    if(window.__btFullBackupButtonsHooked)return;
    document.addEventListener('click',function(e){
      const btn=e.target?.closest?.('button,a,[role="button"],input[type="button"],input[type="submit"]');
      if(!btn)return;
      const txt=buttonText(btn).toLowerCase();
      if(txt==='backup'||txt.includes('backup')){e.preventDefault();e.stopImmediatePropagation();exportFullBackup('manual-button');return;}
      if(txt==='restore'||txt.includes('restore')){e.preventDefault();e.stopImmediatePropagation();chooseRestoreFile();return;}
    },true);
    window.__btFullBackupButtonsHooked=true;
  }
  function boot(){addStyle();cleanup();hookBackupRestoreButtons();}

  window.btActionButtonSafetyFixVersion=VER;
  window.btActionButtonHealthCheck=function(){cleanup();return {version:VER,buttons:buttonInfo(),tools:window.btToolsButtonHealthCheck?window.btToolsButtonHealthCheck():null,backup:window.btFullBackupHealthCheck?window.btFullBackupHealthCheck():null};};
  window.btFullBackupExport=exportFullBackup;
  window.btFullBackupRestore=chooseRestoreFile;
  window.btFullBackupMakePayload=makeBackupPayload;
  window.btFullBackupHealthCheck=function(){const p=makeBackupPayload('health-check');return {version:VER,kind:BACKUP_KIND,summary:p.summary,checksum:p.checksum,keys:Object.keys(p.localStorage).length};};

  setTimeout(boot,250);setTimeout(boot,1000);setTimeout(boot,2500);setInterval(cleanup,1800);
})();