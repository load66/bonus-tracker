/* Versioned cloud recovery. No AI calls, credential exports or automatic restores. */
(function(){
  'use strict';
  const API='https://api-production-00f74.up.railway.app/api/bonus-tracker/backups',CFG='bt_cloud_recovery_v1',HALF_DAY=12*60*60*1000;
  let busy=false,panel=null,debounce=null,phase='',paused=false;
  const core=window.BTCloudCore;
  const read=()=>{try{return JSON.parse(localStorage.getItem(CFG)||'{}')}catch{return{}}};
  function update(value){localStorage.setItem(CFG,JSON.stringify({...read(),...value}));paint();}
  const keys=()=>getBackupStorageKeys();
  const current=()=>{const a=core.snapshot(localStorage,keys(),{dashYear,taxYear},window.BT_APP_VERSION);const b=core.snapshot(localStorage,keys(),{dashYear,taxYear},window.BT_APP_VERSION);if(a!==b)throw Error('Records changed while preparing the backup. Retry when saving completes.');return a;};
  function label(){const cfg=read();if(phase)return phase;if(!cfg.enabled)return 'Cloud backup · Not enabled';if(!window.BTBonusAuth.connected())return 'Cloud backup · Sign-in needed';if(cfg.error)return 'Cloud backup · Needs attention';return cfg.lastAt?'Cloud backup · Verified '+new Date(cfg.lastAt).toLocaleString():'Cloud backup · Pending';}
  function paint(){const button=document.getElementById('bt-cloud-open');if(button)button.textContent=label();const status=panel?.querySelector('#cloud-status');if(status)status.textContent=phase||read().error||label();}
  async function request(path='',options={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
    const send=token=>fetch(API+path,{...options,credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},signal:controller.signal});
    try{let r=await send(await window.BTBonusAuth.token());if(r.status===401)r=await send(await window.BTBonusAuth.token(true));const d=await r.json();if(!r.ok)throw Error(typeof d.detail==='string'?d.detail:typeof d.error==='string'?d.error:'Cloud backup request failed.');return d;}finally{clearTimeout(timer);}
  }
  async function dataHash(raw){const data=JSON.parse(raw);const values=Object.fromEntries(Object.entries(data.storageSnapshot).filter(([k])=>!['bt_last_backup','bt_last_restore'].includes(k)).sort(([a],[b])=>a.localeCompare(b)));return core.digest(JSON.stringify(values));}
  async function upload(reason='manual'){
    if(busy)throw Error('A backup is already running. Wait for it to finish.');
    if(!window.BTBonusAuth.connected())throw Error('Sign in to cloud backup first.');
    busy=true;phase='Cloud backup · Verifying…';paint();
    try{
      const raw=current();core.inspect(raw,keys());const sha256=await core.digest(raw);const recordHash=await dataHash(raw);
      const id=crypto.randomUUID().replace(/-/g,'');
      const receipt=await request('',{method:'POST',body:JSON.stringify({id,reason,snapshot:raw,sha256})});
      if(receipt.id!==id||receipt.sha256!==sha256||receipt.verified!==true||receipt.entryCount!==core.inspect(raw,keys()).entryCount)throw Error('Cloud backup receipt could not be verified.');
      // Only mark this device current if no records changed during the upload.
      const unchanged=current()===raw;
      update({lastAt:receipt.createdAt,lastCheck:Date.now(),lastHash:sha256,lastDataHash:recordHash,lastId:id,error:unchanged?'':'More changes are waiting to be backed up.'});
      phase=unchanged?'Cloud backup · Verified':'Cloud backup · Changes pending';paint();return receipt;
    }catch(e){update({error:e.name==='AbortError'?'Cloud backup timed out. Your local data is retained.':e.message});phase='Cloud backup · Needs attention';paint();throw e;}
    finally{busy=false;if(!paused)setTimeout(()=>{phase='';paint();},1500);}
  }
  async function tick(){
    const cfg=read();if(!cfg.enabled||busy||paused||!window.BTBonusAuth.connected())return;
    try{
      const raw=current(),probe=core.inspect(raw,keys());
      if(!core.hasRecords(probe))return; // A new or reset phone never publishes an empty replacement automatically.
      const hash=await dataHash(raw);
      if(hash!==cfg.lastDataHash||!cfg.lastAt)await upload('automatic');else if(!cfg.lastCheck||Date.now()-cfg.lastCheck>=HALF_DAY){const verified=await download(cfg.lastId);if(verified.backup.sha256!==cfg.lastHash)throw Error('Stored backup no longer matches this device’s verified backup.');update({lastCheck:Date.now(),error:''});phase='';paint();}else{phase='';paint();}
    }catch(e){if(!read().error)update({error:e.message});}
  }
  function changed(){if(!read().enabled)return;phase='Cloud backup · Changes pending';paint();clearTimeout(debounce);debounce=setTimeout(tick,10000);}
  function close(){if(panel)panel.remove();panel=null;paused=false;}
  function text(tag,value,parent){const e=document.createElement(tag);e.textContent=value;parent.append(e);return e;}
  async function list(offset=0){
    const area=panel?.querySelector('#cloud-versions');if(!area)return;
    if(offset===0)area.replaceChildren();phase='Loading recovery versions…';paint();
    try{
      const result=await request('?offset='+offset);phase='';paint();
      if(!Array.isArray(result.backups)||result.backups.some(b=>!/^([a-f0-9]{32})$/.test(b.id)||typeof b.sha256!=='string'||!Number.isInteger(b.entryCount)))throw Error('Cloud backup catalog is invalid.');
      if(!result.backups.length){text('p','No cloud backups yet. Enable automatic backup to protect this device.',area);return;}
      if(offset===0)text('p','Choose a verified version. Restoring replaces this device’s tracker after you review it. Older cloud versions remain available.',area);
      for(const b of result.backups){
        const row=document.createElement('section');row.className='cloud-version';
        text('b',new Date(b.createdAt).toLocaleString(),row);text('p',b.entryCount+' accounts · '+b.reason+' · '+Math.ceil(b.bytes/1024)+' KB',row);
        const button=text('button','Preview recovery',row);button.type='button';button.onclick=()=>preview(b);area.append(row);
      }
      if(result.nextOffset!==null&&result.nextOffset!==undefined){const more=text('button','Older recovery versions',area);more.onclick=()=>{more.remove();list(result.nextOffset);};}
    }catch(e){phase=e.message;paint();}
  }
  async function download(ident){
    const result=await request('/'+ident);
    if(result.backup.id!==ident||await core.digest(result.snapshot)!==result.backup.sha256)throw Error('Cloud backup checksum did not match. Restore stopped.');
    const parsed=core.inspect(result.snapshot,keys());if(parsed.entryCount!==result.backup.entryCount)throw Error('Cloud backup account count did not match.');
    return{...result,...parsed};
  }
  async function preview(b){
    try{
      const recovered=await download(b.id),area=panel.querySelector('#cloud-preview');area.replaceChildren();
      text('h3','Recovery preview',area);text('p',recovered.entryCount+' accounts from '+new Date(b.createdAt).toLocaleString()+'. This device currently has '+entries.length+' accounts.',area);
      text('p',recovered.entries.slice(0,15).map(e=>e.bank).join(' · '),area);
      const restore=text('button','Restore this version',area);restore.type='button';restore.className='btn-p';restore.onclick=()=>restoreVersion(b.id,recovered.snapshot);
      const file=text('button','Download recovery file',area);file.type='button';file.className='btn-s';file.onclick=()=>downloadBlob(new Blob([recovered.snapshot],{type:'application/json'}),'BonusTracker_CloudRecovery_'+b.id+'.json');
    }catch(e){phase=e.message;paint();}
  }
  async function restoreVersion(ident,expected){
    if(busy)return;paused=true;
    try{
      const fresh=await download(ident);
      if(fresh.snapshot!==expected)throw Error('Recovery version changed. Preview it again.');
      if(!(await window.btConfirmDialog('Replace this device with '+fresh.entryCount+' recovered accounts? Your current nonempty tracker will be backed up first.',{title:'Restore cloud backup',confirmLabel:'Restore',danger:true})))return;
      if(core.hasRecords(core.inspect(current(),keys()))){const protective=current();await upload('pre-restore');if(current()!==protective)throw Error('Records changed during the safety backup. Restore stopped; preview and try again.');}
      // Keep the established import validation as a preflight; preserve exact stored bytes when committing.
      const snap={};for(const [k,v]of Object.entries(fresh.data.storageSnapshot))snap[k]=parseBackupStorageValue(v);
      const plan=stagePortableRestore({entries:fresh.entries,storageSnapshot:snap,prefs:fresh.data.prefs});
      if(plan.entries.length!==fresh.entryCount)throw Error('Restore validation would drop account records. Restore stopped.');
      const result=core.restore(localStorage,fresh.snapshot,keys(),window.BTPersistence);
      entries=result.entries;dashYear=result.data.prefs.dashYear;taxYear=result.data.prefs.taxYear;
      try{update({enabled:true,lastAt:fresh.backup.createdAt,lastCheck:Date.now(),lastHash:fresh.backup.sha256,lastDataHash:await dataHash(fresh.snapshot),lastId:ident,error:''});}catch{window.btNotify?.('Records were restored, but this browser could not save cloud backup settings.',{tone:'danger'});}
      close();R();window.btNotify('Cloud recovery completed. All storage writes were verified.',{title:'Recovery complete'});
    }catch(e){phase=e.message;paint();}finally{paused=false;}
  }
  window.btOpenCloudBackup=function(){
    close();paused=true;panel=document.createElement('div');panel.className='ov cloud-overlay';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Cloud backup and recovery');
    panel.innerHTML='<section class="modal cloud-modal"><h2>Cloud backup & recovery</h2><p>Private, versioned backups in your Trading Journal cloud storage. Sign in with the same account on a new phone to recover your tracker.</p><div id="cloud-login"><label>Email<input id="cloud-email" type="email" autocomplete="username"></label><label>Password<input id="cloud-password" type="password" autocomplete="current-password"></label><button id="cloud-signin" class="btn-p">Sign in to recovery</button></div><div id="cloud-connected"><button id="cloud-enable" class="btn-p">Enable automatic backup</button><button id="cloud-now" class="btn-s">Back up now</button><button id="cloud-list" class="btn-s">Recover on a new phone</button><p>Changes are uploaded while the app is open. The server creates a checkpoint every 12 hours from your latest uploaded data. Offline changes are protected in the cloud only after a verified upload.</p></div><p id="cloud-status" role="status"></p><div id="cloud-versions"></div><div id="cloud-preview"></div><button id="cloud-close" class="btn-s">Close</button></section>';
    document.body.append(panel);panel.querySelector('#cloud-close').onclick=close;
    const connected=()=>{panel.querySelector('#cloud-login').hidden=window.BTBonusAuth.connected();panel.querySelector('#cloud-connected').hidden=!window.BTBonusAuth.connected();paint();};connected();
    panel.querySelector('#cloud-signin').onclick=async()=>{const currentPanel=panel,button=currentPanel.querySelector('#cloud-signin');button.disabled=true;try{await window.BTBonusAuth.signIn(currentPanel.querySelector('#cloud-email').value.trim(),currentPanel.querySelector('#cloud-password').value);if(panel===currentPanel){connected();await list();}}catch(e){phase=e.message;paint();}finally{currentPanel.querySelector('#cloud-password').value='';button.disabled=false;}};
    panel.querySelector('#cloud-enable').onclick=async()=>{try{if(!core.hasRecords(core.inspect(current(),keys()))){phase='This tracker is empty. Choose Recover on a new phone to restore an existing backup.';paint();return;}const health=await request('/health');if(!health.readWriteVerified)throw Error('Cloud storage verification did not pass.');update({enabled:true,error:''});await upload('manual');await list();}catch(e){phase=e.message;paint();}};
    panel.querySelector('#cloud-now').onclick=async()=>{try{if(!core.hasRecords(core.inspect(current(),keys())))throw Error('This tracker is empty. Recover an existing cloud backup first.');await upload('manual');await list();}catch(e){phase=e.message;paint();}};
    panel.querySelector('#cloud-list').onclick=()=>list();
    if(window.BTBonusAuth.connected())list();
    panel.querySelector('#cloud-close').focus();
  };
  window.btCloudBackupChanged=changed;
  window.btCloudBeforeDestructive=async reason=>{if(read().enabled&&core.hasRecords(core.inspect(current(),keys()))){const before=current();await upload(reason);if(current()!==before)throw Error('Records changed during the safety backup. Retry after backup completes.');}};
  window.BTCloudBackup={current,upload,tick,download,restoreVersion};
  window.btRegisterPostRender?.('cloud-backup-status',paint);
  window.addEventListener('online',()=>{phase='';tick();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
  document.addEventListener('keydown',e=>{if(!panel)return;if(e.key==='Escape'){close();return;}if(e.key==='Tab'){const controls=[...panel.querySelectorAll('button,input')].filter(x=>!x.disabled&&x.getClientRects().length);const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  const poll=setInterval(tick,60000);poll?.unref?.();setTimeout(tick,1000);paint();if(window.btInitialSaveError)window.btNotify?.(window.btInitialSaveError,{title:'Local storage needs attention',tone:'danger'});
})();
