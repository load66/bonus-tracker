/* Source-backed history review. Scans are read-only; repairs require preview and confirmation. */
(function(){
'use strict';
const core=window.BTHistoryRepairCore;
let panel=null,session=null,previousFocus=null,working=false;
const safe=x=>esc(String(x??''));
const parse=x=>typeof x==='string'?JSON.parse(x):x;
const show=x=>x===''||x===undefined||x===null?'Not recorded':String(x);
function evidence(data,meta){
 const snap=data?.storageSnapshot||data?.localStorage||data?.storage||{};
 const rows=data?.entries||parse(snap[SK]||'[]'),archive=data?.termsArchive||parse(snap[TC_ARCHIVE_KEY]||'{}');
 if(!Array.isArray(rows)||rows.some(e=>!e||typeof e.bank!=='string')||!archive||typeof archive!=='object'||Array.isArray(archive))throw Error('This file does not contain supported account history.');
 if(!rows.length&&!Object.keys(archive).length)throw Error('No saved account history was found.');
 return core.collect(rows,archive,meta);
}
function capture(extra=[]){
 const stored=localStorage.getItem(SK),archive=localStorage.getItem(TC_ARCHIVE_KEY);
 if(JSON.stringify(JSON.parse(stored||'[]'))!==JSON.stringify(entries))throw Error('Records changed in another tab. Reload the app before reviewing history.');
 const archiveData=JSON.parse(archive||'{}');
 if(!archiveData||typeof archiveData!=='object'||Array.isArray(archiveData))throw Error('Stored Archive needs recovery before reviewing history.');
 const report=core.analyze(entries,[...core.collect(entries,archiveData),...extra],{today:td(),identify:e=>normalizeBankFamily(e.bank)+'|'+entryBankType(e)});
 return {report,stored,archive,extra,prepared:null};
}
function unchanged(state){
 if(localStorage.getItem(SK)!==state.stored||localStorage.getItem(TC_ARCHIVE_KEY)!==state.archive||JSON.stringify(entries)!==state.report.baseline)throw Error('Records changed. Refresh the review before applying repairs.');
}
function totals(rows){
 const out={};for(const row of taxReceiptRows(rows)){if(core.validDate(row.bonusRecd)&&row.bonusRecd<=td()){const year=row.bonusRecd.slice(0,4);out[year]=(out[year]||0)+Math.round(Number(row.bonus)*100);}}
 return out;
}
function prepare(state,selections){
 unchanged(state);state.prepared=core.plan(entries,state.report,selections);
 return {...state.prepared,taxBefore:totals(entries),taxAfter:totals(state.prepared.next)};
}
async function apply(state,confirmed){
 if(confirmed!==true||!state.prepared)throw Error('Preview and confirm the selected repairs first.');
 unchanged(state);
 const prepared=state.prepared,next=JSON.parse(JSON.stringify(prepared.next)),at=new Date().toISOString();
 for(const change of prepared.changes){
  const row=core.locate(next,change.path),sha256=await window.BTCloudCore.digest(JSON.stringify(change.value));
  if(row.historyRepairs!==undefined&&!Array.isArray(row.historyRepairs))throw Error('Existing repair history needs review before saving.');
  row.historyRepairs=[...(row.historyRepairs||[]),{at,field:change.field,sha256,sources:change.sources}];
 }
 // Hashing yields to other tabs and account edits. Check both original stores again.
 unchanged(state);
 commitEntriesWithArchive(next);
 entries=next;state.prepared=null;window.btClearLifecycleUndo?.();window.btCloudBackupChanged?.();R();
 return prepared.changes.length;
}
function sourceText(source){
 return [source.label,source.versionId?'Version '+source.versionId:'',source.capturedAt?'Saved '+source.capturedAt:'',source.revisionId?'Revision '+source.revisionId:'',source.path?'Record '+source.path:'',source.sha256?'SHA-256 '+source.sha256:''].filter(Boolean).join(' · ');
}
function close(){if(working)return;panel?.remove();panel=null;session=null;previousFocus?.focus?.();}
function message(text){if(panel)panel.querySelector('#history-repair-status').textContent=text;}
function invalidate(){if(!session)return;session.prepared=null;panel.querySelector('#history-repair-preview').replaceChildren();}
function render(){
 if(!panel||!session)return;
 const rows=session.report.rows,area=panel.querySelector('#history-repair-rows');
 panel.querySelector('#history-repair-count').textContent=rows.filter(r=>r.issues).length+' of '+rows.length+' account cycles need review. Missing evidence stays unresolved.';
 area.innerHTML=rows.map((row,ri)=>'<details class="history-repair-cycle"><summary>'+safe(row.row.bank)+' · '+safe(entryBankType(row.row)==='B'?'Business':'Personal')+' · '+safe(row.row.opened||'Opening not recorded')+' <small>'+row.issues+' fields to review'+(row.path.length>1?' · Previous cycle':'')+'</small></summary><p>'+row.matchCount+' matching saved records. Same account ID, bank and audience plus a recorded cycle date are required.</p>'+row.fields.filter(f=>f.issues.length).map(field=>{
  const fi=core.FIELDS.findIndex(f=>f[0]===field.field);
  return '<section class="history-repair-field"><h3>'+safe(field.label)+'</h3><p>'+safe(field.issues.join(' · '))+'</p><details><summary>Current recorded value</summary><pre>'+safe(show(field.current))+'</pre></details>'+
   '<label>Choose a saved value<select data-repair-row="'+ri+'" data-repair-field="'+fi+'"><option value="">Keep current value</option>'+field.choices.map((choice,i)=>JSON.stringify(choice.value)===JSON.stringify(field.current)?'':'<option value="'+i+'">Source '+(i+1)+' · '+safe(show(choice.value).slice(0,90))+'</option>').join('')+'</select></label>'+
   (field.choices.length?field.choices.map((choice,i)=>'<details><summary>Source '+(i+1)+' · '+safe(choice.sources[0].label)+'</summary><pre>'+safe(show(choice.value))+'</pre>'+choice.sources.map(s=>'<p class="history-repair-source">'+safe(sourceText(s))+'</p>').join('')+'</details>').join(''):'<p>No exact-cycle evidence found. Use account edit only when you know the actual fact.</p>')+'</section>';
 }).join('')+'</details>').join('')||'<p>No accounts to review.</p>';
 area.querySelectorAll('select').forEach(select=>{select.onchange=invalidate;});invalidate();
}
function preview(){
 try{
  const selections=[...panel.querySelectorAll('select[data-repair-row]')].filter(s=>s.value!=='').map(s=>({key:session.report.rows[Number(s.dataset.repairRow)].key,field:core.FIELDS[Number(s.dataset.repairField)][0],index:Number(s.value)}));
  const result=prepare(session,selections),area=panel.querySelector('#history-repair-preview');
  const years=[...new Set([...Object.keys(result.taxBefore),...Object.keys(result.taxAfter)])].sort();
  area.innerHTML='<h3>Confirm selected corrections</h3>'+result.changes.map(c=>'<section class="history-repair-field"><b>'+safe(core.locate(result.next,c.path).bank||session.report.rows.find(r=>r.key===c.key).row.bank)+' · '+safe(c.label)+'</b><p>Before</p><pre>'+safe(show(c.before))+'</pre><p>After</p><pre>'+safe(show(c.value))+'</pre>'+c.sources.map(s=>'<p class="history-repair-source">'+safe(sourceText(s))+'</p>').join('')+'</section>').join('')+'<h3>Tax payment-year check</h3>'+(years.length?years.map(year=>'<p>'+year+': '+safe(fM((result.taxBefore[year]||0)/100))+' → '+safe(fM((result.taxAfter[year]||0)/100))+'</p>').join(''):'<p>No recorded bonus payments.</p>')+'<p>Tax follows payment, including paid accounts still open. Original revisions remain in Archive. Recovering source text does not re-analyze financial rules.</p><label class="history-repair-ack"><input type="checkbox" id="history-repair-confirm"> I confirm these recorded facts apply to this account cycle.</label><button type="button" id="history-repair-apply" class="btn-p" disabled>Apply confirmed repairs</button>';
  const button=area.querySelector('#history-repair-apply'),check=area.querySelector('#history-repair-confirm');check.onchange=()=>{button.disabled=!check.checked;};
  button.onclick=async()=>{
   if(working)return;working=true;button.disabled=true;
   try{const count=await apply(session,check.checked);session=capture(session.extra);render();message(count+' confirmed corrections saved with original Archive revisions. Cloud recovery may still be pending.');}
   catch(e){message(e.message);invalidate();}
   finally{working=false;}
  };message('Review the full values and their source before confirming.');
 }catch(e){invalidate();message(e.message);}
}
async function cloud(){
 if(working)return;working=true;const state=session;message('Checking retained cloud versions and checksums…');
 try{
  const result=await window.BTCloudBackup.historySources(),extra=[];
  for(const copy of result.copies)extra.push(...evidence(copy.data,{kind:'verified-cloud',label:'Checksum-verified cloud backup',versionId:copy.backup.id,sha256:copy.backup.sha256,capturedAt:copy.backup.createdAt}));
  unchanged(state);session=capture([...state.extra.filter(s=>s.source.kind!=='verified-cloud'),...extra]);render();message(result.copies.length+' verified cloud versions checked. '+result.failures.length+' unavailable or invalid versions excluded. Checksums verify stored content, not the truth of recorded facts.');
 }catch(e){message(e.message);}finally{working=false;}
}
async function file(input){
 const selected=input.files?.[0];if(!selected||working)return;working=true;const state=session;
 try{
  if(selected.size>8*1024*1024)throw Error('Backup file exceeds the supported 8 MB size.');
  const raw=await selected.text(),data=JSON.parse(raw),sha256=await window.BTCloudCore.digest(raw);
  if(data.format==='BonusTrackerCloudBackup')window.BTCloudCore.inspect(raw,getBackupStorageKeys());
  const sources=evidence(data,{kind:'backup-file',label:'User-supplied file (not cloud-verified): '+selected.name,sha256,capturedAt:data.exportedAt||''});
  unchanged(state);session=capture([...state.extra,...sources]);render();message('Backup file checked read-only. Its fingerprint identifies the file; confirm that its facts are correct.');
 }catch(e){message(e.message);}finally{working=false;input.value='';}
}
function open(){
 if(panel)return;try{session=capture();}catch(e){window.btNotify?.(e.message,{tone:'danger'});return;}
 previousFocus=document.activeElement;panel=document.createElement('div');panel.className='bt360-sheet-backdrop history-repair-backdrop';
 panel.innerHTML='<section class="bt360-sheet history-repair-sheet" role="dialog" aria-modal="true" aria-label="History repair"><header><div><h2>History repair</h2><p>Recover recorded facts from matching saved history</p></div><button type="button" aria-label="Close history repair">×</button></header><p id="history-repair-count"></p><p>Review missing dates, original terms, fees and conflicting records. Opening this screen and checking backups never change financial records. No dates are inferred.</p><div class="history-repair-actions"><button type="button" id="history-repair-refresh">Refresh review</button><button type="button" id="history-repair-cloud">Check verified cloud backups</button><label>Check backup file<input type="file" id="history-repair-file" accept="application/json,.json"></label></div><p id="history-repair-status" role="status" aria-live="polite"></p><div id="history-repair-rows"></div><button type="button" id="history-repair-preview-button" class="btn-p">Preview selected repairs</button><div id="history-repair-preview"></div></section>';
 document.body.appendChild(panel);panel.onclick=e=>{if(e.target===panel)close();};panel.querySelector('[aria-label="Close history repair"]').onclick=close;
 panel.querySelector('#history-repair-refresh').onclick=()=>{if(working)return;try{session=capture(session.extra);render();message('Review refreshed. Previous selections cleared.');}catch(e){message(e.message);}};
 panel.querySelector('#history-repair-preview-button').onclick=preview;panel.querySelector('#history-repair-cloud').onclick=cloud;panel.querySelector('#history-repair-file').onchange=e=>file(e.target);
 panel.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='Tab'){const items=[...panel.querySelectorAll('button:not(:disabled),select,input,summary')].filter(el=>el.getClientRects().length);const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
 render();panel.querySelector('[aria-label="Close history repair"]').focus();
}
window.BTHistoryRepair={open,close,capture,prepare,apply,evidence};
})();
