/* Versioned cloud recovery. No AI calls, credential exports or automatic restores. */
(function(){
  'use strict';
  const API='https://api-production-00f74.up.railway.app/api/bonus-tracker/backups',CFG='bt_cloud_recovery_v1',HALF_DAY=12*60*60*1000;
  let busy=false,panel=null,debounce=null,phase='',paused=false,switching=false,currentVerified=false,checkedSession=false,pending=false,statusError='',retentionPolicy=null;
  const core=window.BTCloudCore;
  const read=()=>{try{return JSON.parse(localStorage.getItem(CFG)||'{}')}catch{return{}}};
  function update(value){try{const raw=JSON.stringify({...read(),...value});window.BTPersistence.commit(localStorage,{[CFG]:raw});statusError='';paint();}catch(e){statusError='Backup settings could not be saved. Check browser storage.';currentVerified=false;paint();throw e;}}
  const keys=()=>getBackupStorageKeys();
  const current=()=>{const a=core.snapshot(localStorage,keys(),{dashYear,taxYear},window.BT_APP_VERSION);const b=core.snapshot(localStorage,keys(),{dashYear,taxYear},window.BT_APP_VERSION);if(a!==b)throw Error('Records changed while preparing the backup. Retry when saving completes.');return a;};
  function protection(){const cfg=read();return core.protectionState({...cfg,error:statusError||cfg.error},{connected:window.BTBonusAuth.connected(),busy,currentVerified,pending:pending||cfg.pending,online:navigator.onLine!==false});}
  function paint(){
    const cfg=read(),state=protection(),date=cfg.lastAt?new Date(cfg.lastAt).toLocaleString():'No verified cloud backup yet';
    const button=document.getElementById('bt-cloud-open');
    if(button){button.dataset.state=state.tone;button.innerHTML='<span class="cloud-top"><strong>Cloud protection</strong><span class="cloud-pill"></span></span><span class="cloud-dashboard-summary"></span><span class="cloud-dashboard-date"></span>';button.querySelector('.cloud-pill').textContent='Automatic backup '+(cfg.enabled?'ON':'OFF');button.querySelector('.cloud-dashboard-summary').textContent=state.title;button.querySelector('.cloud-dashboard-date').textContent='Last verified cloud backup: '+date;button.setAttribute('aria-label','Cloud backup. Automatic backup '+(cfg.enabled?'on':'off')+'. '+state.title+'. Last verified cloud backup: '+date);}
    if(!panel)return;
    const card=panel.querySelector('#cloud-protection');card.dataset.state=state.tone;
    panel.querySelector('#cloud-state').textContent=state.title;panel.querySelector('#cloud-summary').textContent=state.detail;
    panel.querySelector('#cloud-last-verified').textContent=date;
    panel.querySelector('#cloud-retention-status').textContent=retentionPolicy?.maxCopies===4?(cfg.retention?.cleanup==='pending'?'Backup verified. Older-copy cleanup is pending and will retry on the next backup.':'Storage keeps the latest backup and two earlier states, plus the active 12-hour checkpoint: at most four copies after verified cleanup.'):'Storage cleanup policy has not yet been confirmed by the server.';
    panel.querySelector('#cloud-proof').textContent=cfg.lastAt?'Server readback and checksum verified'+(Number.isInteger(cfg.lastCount)?' · '+cfg.lastCount+' accounts':''):'Protection starts after a verified first upload.';
    panel.querySelector('#cloud-file-date').textContent='Last downloaded backup file: '+(localStorage.getItem('bt_last_backup')||'None recorded');
    const toggle=panel.querySelector('#cloud-auto-toggle');toggle.checked=cfg.enabled===true;toggle.disabled=busy||switching;
    panel.querySelector('#cloud-switch-state').textContent=cfg.enabled?'ON':'OFF';
    panel.querySelector('#cloud-enable-ack-row').hidden=cfg.enabled===true;
    panel.querySelector('#cloud-enable').hidden=cfg.enabled===true;panel.querySelector('#cloud-enable').disabled=busy||switching;
    panel.querySelector('#cloud-now').disabled=busy||switching;
    panel.querySelector('#cloud-status').textContent=phase||statusError||cfg.error||'';
  }
  async function request(path='',options={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
    const send=token=>fetch(API+path,{...options,credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},signal:controller.signal});
    try{let r=await send(await window.BTBonusAuth.token());if(r.status===401)r=await send(await window.BTBonusAuth.token(true));const d=await r.json();if(!r.ok)throw Error(typeof d.detail==='string'?d.detail:typeof d.error==='string'?d.error:'Cloud backup request failed.');return d;}finally{clearTimeout(timer);}
  }
  async function dataHash(raw){const data=JSON.parse(raw);const values=Object.fromEntries(Object.entries(data.storageSnapshot).filter(([k])=>!['bt_last_backup','bt_last_restore'].includes(k)).sort(([a],[b])=>a.localeCompare(b)));return core.digest(JSON.stringify(values));}
  async function upload(reason='manual'){
    if(busy)throw Error('A backup is already running. Wait for it to finish.');
    if(!window.BTBonusAuth.connected())throw Error('Sign in to cloud backup first.');
    busy=true;currentVerified=false;phase='Uploading and verifying your records…';paint();
    let changesDuringUpload=false;
    try{
      const raw=current();core.inspect(raw,keys());const sha256=await core.digest(raw);const recordHash=await dataHash(raw);
      const id=crypto.randomUUID().replace(/-/g,'');
      const receipt=await request('',{method:'POST',body:JSON.stringify({id,reason,snapshot:raw,sha256})});
      if(receipt.id!==id||receipt.sha256!==sha256||receipt.verified!==true||receipt.entryCount!==core.inspect(raw,keys()).entryCount)throw Error('Cloud backup receipt could not be verified.');
      // Only mark this device current if no records changed during the upload.
      retentionPolicy=receipt.retention||retentionPolicy;
      const unchanged=current()===raw;
      changesDuringUpload=!unchanged;currentVerified=unchanged;checkedSession=true;pending=!unchanged;
      update({lastAt:receipt.createdAt,lastCheck:Date.now(),lastHash:sha256,lastDataHash:recordHash,lastId:id,lastCount:receipt.entryCount,retention:receipt.retention,pending:!unchanged,error:unchanged?'':'More changes are waiting to be backed up.'});
      phase=unchanged?'Cloud backup · Verified':'Cloud backup · Changes pending';paint();
      if(!switching)window.btNotify(unchanged?'Your backup was verified in the cloud at '+new Date(receipt.createdAt).toLocaleTimeString()+'. '+receipt.entryCount+' accounts can be recovered.':'A backup was verified. Newer changes are still waiting to upload.',{title:'Backup verified',duration:6500});
      return receipt;
    }catch(e){update({error:e.name==='AbortError'?'Cloud backup timed out. Your local data is retained.':e.message});phase='Cloud backup · Needs attention';paint();throw e;}
    finally{busy=false;paint();if(!paused){if(changesDuringUpload)queueBackup();setTimeout(()=>{phase='';paint();},1500);}}
  }
  function queueBackup(){clearTimeout(debounce);debounce=setTimeout(tick,350);}
  async function tick(){
    const cfg=read();if(!cfg.enabled||busy||paused||switching)return;
    if(!window.BTBonusAuth.connected()){currentVerified=false;paint();return;}
    try{
      const raw=current(),probe=core.inspect(raw,keys());
      if(!core.hasRecords(probe)){currentVerified=false;paint();return;}
      const hash=await dataHash(raw);
      if(hash!==cfg.lastDataHash||!cfg.lastAt)await upload('automatic');
      else{
        let checkedAt=cfg.lastCheck;
        if(!checkedSession||cfg.error||statusError||!cfg.lastCheck||Date.now()-cfg.lastCheck>=HALF_DAY){
          currentVerified=false;paint();let verified;
          try{verified=await download(cfg.lastId);}catch(e){
            const catalog=await request();
            for(const candidate of (catalog.backups||[]).slice(0,4)){const copy=await download(candidate.id);if(await dataHash(copy.snapshot)===cfg.lastDataHash){verified=copy;break;}}
            if(!verified)throw Error('This phone’s recovery version was replaced. Review cloud recovery or choose Back up now.');
          }
          if(await dataHash(verified.snapshot)!==cfg.lastDataHash)throw Error('Stored backup no longer matches this device’s records.');
          update({lastId:verified.backup.id,lastHash:verified.backup.sha256,lastAt:verified.backup.createdAt,lastCount:verified.entryCount});
          checkedSession=true;checkedAt=Date.now();
        }
        const observed=current(),unchanged=await dataHash(observed)===cfg.lastDataHash&&current()===observed;
        currentVerified=unchanged;pending=!unchanged;
        update({lastCheck:checkedAt,pending:!unchanged,error:''});phase='';paint();if(!unchanged)queueBackup();
      }
    }catch(e){currentVerified=false;try{update({error:e.message})}catch{}paint();}
  }
  function changed(){if(!read().enabled)return;pending=true;currentVerified=false;try{update({pending:true})}catch{}paint();queueBackup();}
  function close(){if(panel)panel.remove();panel=null;if(!busy){paused=false;queueBackup();}}
  function text(tag,value,parent){const e=document.createElement(tag);e.textContent=value;parent.append(e);return e;}
  async function list(offset=0){
    const area=panel?.querySelector('#cloud-versions');if(!area)return;
    if(offset===0)area.replaceChildren();phase='Loading recovery versions…';paint();
    try{
      const result=await request('?offset='+offset);retentionPolicy=result.retention||null;phase='';paint();
      if(!Array.isArray(result.backups)||result.backups.some(b=>!/^([a-f0-9]{32})$/.test(b.id)||typeof b.sha256!=='string'||!Number.isInteger(b.entryCount)))throw Error('Cloud backup catalog is invalid.');
      if(!result.backups.length){text('p','No cloud backups yet. Enable automatic backup to protect this device.',area);return;}
      if(offset===0)text('p','Choose a verified version. Restoring replaces this device’s tracker after you review it. The latest backup and two previous recovery states are retained. A current twelve-hour checkpoint may also be kept.',area);
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
      currentVerified=false;checkedSession=false;pending=true;
      try{update({enabled:true,lastAt:fresh.backup.createdAt,lastCheck:Date.now(),lastHash:fresh.backup.sha256,lastDataHash:'',lastId:ident,lastCount:fresh.entryCount,pending:true,error:''});}catch{window.btNotify?.('Records were restored, but this browser could not save cloud backup settings.',{tone:'danger'});}
      try{await upload('manual');}catch(e){R();window.btNotify('Records were restored locally. Cloud verification is pending; keep the app open and retry.',{title:'Recovery needs cloud verification',tone:'danger'});throw e;}
      close();R();window.btNotify('Cloud recovery completed. All storage writes were verified.',{title:'Recovery complete'});
    }catch(e){phase=e.message;paint();}finally{paused=false;}
  }
  window.btOpenCloudBackup=function(){
    close();paused=false;panel=document.createElement('div');panel.className='ov cloud-overlay';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Cloud backup and recovery');
    panel.innerHTML='<section class="modal cloud-modal"><h2>Cloud backup & recovery</h2><p>Private, versioned backups in your Trading Journal cloud storage. Sign in with the same account on a new phone to recover your tracker.</p><div id="cloud-login"><label>Email<input id="cloud-email" type="email" autocomplete="username"></label><label>Password<input id="cloud-password" type="password" autocomplete="current-password"></label><button id="cloud-signin" class="btn-p">Sign in to recovery</button></div><section id="cloud-protection" class="cloud-protection-card"><div class="cloud-card-heading"><strong>Protection status</strong><strong id="cloud-state" role="status"></strong></div><p id="cloud-summary"></p><dl class="cloud-details"><dt>Last verified cloud backup</dt><dd id="cloud-last-verified"></dd></dl><p id="cloud-proof"></p><p id="cloud-retention-status"></p></section><div id="cloud-connected"><label class="cloud-switch-row" for="cloud-auto-toggle"><span><strong>Automatic backup on this phone</strong><small>Upload changes promptly · 12-hour cloud checkpoints</small></span><span class="cloud-switch-control"><b id="cloud-switch-state">OFF</b><input id="cloud-auto-toggle" type="checkbox" role="switch"><span class="cloud-switch-track" aria-hidden="true"></span></span></label><label id="cloud-enable-ack-row" class="cloud-ack-row"><input id="cloud-enable-ack" type="checkbox"><span>I understand that offline or pending changes are protected only after a verified upload.</span></label><button id="cloud-enable" class="btn-p">Enable automatic backup</button><button id="cloud-now" class="btn-s">Back up now</button><button id="cloud-list" class="btn-s">Recover on a new phone</button><p>Changes are uploaded while the app is open. The server creates a checkpoint every 12 hours from your latest uploaded data. Offline changes are protected in the cloud only after a verified upload.</p></div><p id="cloud-status" role="status"></p><div id="cloud-versions"></div><div id="cloud-preview"></div><p id="cloud-file-date" class="cloud-file-note"></p><button id="cloud-close" class="btn-s">Close</button></section>';
    document.body.append(panel);panel.querySelector('#cloud-close').onclick=close;
    const connected=()=>{panel.querySelector('#cloud-login').hidden=window.BTBonusAuth.connected();panel.querySelector('#cloud-connected').hidden=!window.BTBonusAuth.connected();paint();};connected();
    panel.querySelector('#cloud-signin').onclick=async()=>{const currentPanel=panel,button=currentPanel.querySelector('#cloud-signin');button.disabled=true;try{await window.BTBonusAuth.signIn(currentPanel.querySelector('#cloud-email').value.trim(),currentPanel.querySelector('#cloud-password').value);if(panel===currentPanel){connected();await list();}}catch(e){phase=e.message;paint();}finally{currentPanel.querySelector('#cloud-password').value='';button.disabled=false;}};
    async function setAutomatic(on){
      if(switching||busy){paint();return;}switching=true;paint();
      try{
        if(on){
          if(!panel.querySelector('#cloud-enable-ack').checked)throw Error('Check the acknowledgement before enabling automatic backup.');
          if(!core.hasRecords(core.inspect(current(),keys())))throw Error('This tracker is empty. Recover an existing backup first.');
          if(!(await window.btConfirmDialog('Enable automatic backup on this phone? Your first backup will be uploaded and read back for verification before the switch turns ON. Future saved changes upload promptly while connected. The server checkpoints uploaded data every 12 hours.',{title:'Confirm automatic backup',confirmLabel:'Enable and verify'})))return;
          const health=await request('/health');if(!health.readWriteVerified)throw Error('Cloud storage verification did not pass.');
          await upload('manual');update({enabled:true});
          window.btNotify(currentVerified?'Automatic backup is ON. Your current records are verified in the cloud.':'Automatic backup is ON. Additional changes are waiting for verification.',{title:'Automatic backup enabled'});
          await list();
        }else{
          if(!(await window.btConfirmDialog('Turn off automatic uploads on this phone? Future changes will remain on this device until you back them up. Retained cloud versions and server checkpoints remain available.',{title:'Turn off automatic backup?',confirmLabel:'Turn off',danger:true})))return;
          update({enabled:false});currentVerified=false;window.btNotify('Automatic backup is OFF on this phone. Existing cloud backups are retained.',{title:'Automatic backup turned off'});
        }
      }catch(e){phase=e.message;paint();}finally{switching=false;paint();if(read().enabled)queueBackup();}
    }
    panel.querySelector('#cloud-enable').onclick=()=>setAutomatic(true);
    panel.querySelector('#cloud-auto-toggle').onchange=e=>{const desired=e.target.checked;paint();setAutomatic(desired);};
    panel.querySelector('#cloud-now').onclick=async()=>{try{if(!core.hasRecords(core.inspect(current(),keys())))throw Error('This tracker is empty. Recover an existing cloud backup first.');await upload('manual');await list();}catch(e){phase=e.message;paint();}};
    panel.querySelector('#cloud-list').onclick=()=>list();
    if(window.BTBonusAuth.connected())list();
    panel.querySelector('#cloud-close').focus();
  };
  window.btCloudBackupChanged=changed;
  window.btCloudBeforeDestructive=async reason=>{if(read().enabled&&core.hasRecords(core.inspect(current(),keys()))){const before=current();await upload(reason);if(current()!==before)throw Error('Records changed during the safety backup. Retry after backup completes.');}};
  window.BTCloudBackup={current,upload,tick,download,restoreVersion,isBusy:()=>busy||switching,protection};
  window.btRegisterPostRender?.('cloud-backup-status',paint);
  window.addEventListener('online',()=>{phase='';tick();});
  document.addEventListener('visibilitychange',()=>tick());
  window.addEventListener('offline',()=>{currentVerified=false;paint();});
  document.addEventListener('pointerdown',e=>{const menu=document.getElementById('bt-data-menu');if(menu?.open&&!menu.contains(e.target))menu.open=false;});
  document.addEventListener('keydown',e=>{if(!panel){if(e.key==='Escape'){const menu=document.getElementById('bt-data-menu');if(menu?.open){menu.open=false;menu.querySelector('summary').focus();}}return;}if(e.key==='Escape'){close();return;}if(e.key==='Tab'){const controls=[...panel.querySelectorAll('button,input')].filter(x=>!x.disabled&&x.getClientRects().length);const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  const poll=setInterval(tick,60000);poll?.unref?.();setTimeout(tick,0);paint();if(window.btInitialSaveError)window.btNotify?.(window.btInitialSaveError,{title:'Local storage needs attention',tone:'danger'});
})();
