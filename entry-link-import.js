/* BonusTracker v3.4.15 — safe entry-file import and replacement-aware review. */
(function(){
  'use strict';
  const VER='3.4.15';
  const HASH_KEY='btadd=';
  const ALLOWED=[
    'bank','accountType','bonus','churn','churnable','churnability','churnBasis','churnBufferDays','churnReason','sourceEligibilityBasis','churnTrackingPolicy','churnDecisionSource','churnDecisionConfidence','churnDecisionConfirmedAt',
    'opened','closed','bonusRecd','reqMet','notes','analyzedTC','minHoldDays','closeFeeCountdownDays','earlyCloseFee','reqDays','referralBonus','dataPoint',
    'fundedDays','fundingAmount','fundingAmountText','payoutTimingText','phoneNum','feeChecked','monthlyFeeYNText','monthlyFeeAmountText','monthlyFeeFrequency',
    'monthlyFeeWaiverType','monthlyFeeWaiverAmountText','monthlyFeeWaiverText','promoCodeText','avoidMonthlyFeeText','completeBonusText','earlyTerminationFeeText',
    'eligibilityText','expirationDateText','requiredDaysText','closeRuleBasis','closeBufferDays','closeRuleText','closeRestrictionType','monthlyFeeChecked','customTimers',
    'analysis','analyzerHistory','history'
  ];
  let hashHandled=false;

  function decode(raw){
    let s=String(raw||'').replace(/-/g,'+').replace(/_/g,'/');
    while(s.length%4)s+='=';
    const bin=atob(s);
    const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
    const txt=typeof TextDecoder!=='undefined'?new TextDecoder().decode(bytes):decodeURIComponent(escape(bin));
    return JSON.parse(txt);
  }
  function cleanPayload(p){
    const src=(p&&typeof p==='object'&&(p.entry||p.payload))?(p.entry||p.payload):p;
    const out={};if(!src||typeof src!=='object'||Array.isArray(src))return out;
    ALLOWED.forEach(k=>{if(src[k]!==undefined)out[k]=src[k]});
    out.bank=String(out.bank||'').trim();
    out.accountType=String(out.accountType||'personal').toLowerCase()==='business'?'business':'personal';
    out.opened=String(out.opened||'').trim();
    out.closed=String(out.closed||'').trim();
    out.bonusRecd=String(out.bonusRecd||'').trim();
    out.reqMet=String(out.reqMet||'').trim();
    out.bonus=Number(out.bonus||0);
    out.reqDays=Math.max(0,parseInt(out.reqDays||0,10)||0);
    out.minHoldDays=Math.max(0,parseInt(out.minHoldDays||0,10)||0);
    out.closeBufferDays=Math.max(0,parseInt(out.closeBufferDays||0,10)||0);
    out.churnBufferDays=0;
    out.customTimers=typeof normalizeTimerList==='function'?normalizeTimerList(out.customTimers||[]):(Array.isArray(out.customTimers)?out.customTimers:[]);
    return out;
  }
  function validatePayload(payload){
    let next=cleanPayload(payload);
    if(!next.bank)throw new Error('Bank name is missing.');
    if(!next.opened)throw new Error('Opened date is missing.');
    const decision=typeof churnDecisionForEntry==='function'?churnDecisionForEntry(next):(next.churnable===false?'nonrepeatable':next.churn?'repeatable':'');
    if(!decision)throw new Error('Future eligibility decision is missing.');
    if(decision==='repeatable'&&!['180','1','2','3'].includes(String(next.churn||'')))throw new Error('Repeatable entry is missing a supported churn period.');
    if(typeof normalizeLifecycleEntry==='function')next=normalizeLifecycleEntry(next)||next;
    return next;
  }
  function extractHashPayload(text){
    const raw=String(text||'');
    const m=raw.match(/#btadd=([A-Za-z0-9_-]+)/i);
    return m?decode(m[1]):null;
  }
  function parseEntryFileText(text,fileName=''){
    const raw=String(text||'').trim();
    if(!raw)throw new Error('The selected file is empty.');
    let parsed=null;
    try{parsed=JSON.parse(raw)}catch{}
    if(!parsed)parsed=extractHashPayload(raw);
    if(!parsed)throw new Error('This is not a supported BonusTracker entry file. Use the JSON/HTML entry file created for BonusTracker.');
    const out=validatePayload(parsed);
    out._importFileName=String(fileName||'').trim();
    return out;
  }
  function clearHash(){
    try{history.replaceState(null,'',location.pathname+location.search)}catch{try{location.hash=''}catch{}}
  }
  function stageEntryForReview(payload,source='entry-file',fileName=''){
    const next=validatePayload(payload);
    if(typeof openAdd!=='function')throw new Error('New Entry editor is not ready.');
    openAdd();
    if(typeof modal==='undefined'||!modal)throw new Error('New Entry editor could not be opened.');
    Object.assign(modal,next);
    modal._edit=false;
    modal.id='';
    modal._skipManualReplacePrompt=false;
    modal._skipDuplicateCheck=false;
    modal._manualReplaceTarget='';
    modal._entryFileImport=true;
    modal._entryFileName=String(fileName||next._importFileName||'').trim();
    modal.importSource=source;
    modal.importedAt=typeof td==='function'?td():new Date().toISOString().slice(0,10);
    try{if(typeof showTemplates!=='undefined')showTemplates=false}catch{}
    try{if(typeof showInlineAZ!=='undefined')showInlineAZ=false}catch{}
    try{if(typeof inlineResult!=='undefined')inlineResult=null}catch{}
    if(typeof R==='function')R();
    return{status:'review',entry:next};
  }
  function preview(p){
    const bonus='$'+Number(p.bonus||0).toLocaleString();
    const future=p.churnability==='not-repeatable'?'Non-repeatable':(p.churn==='180'?'180 days':p.churn+' year'+(String(p.churn)==='1'?'':'s'))+' after confirmed account close';
    return `Load ${p.bank} ${bonus} into New Entry?\n\nOpened: ${p.opened}\nRequirement: ${p.dataPoint||'See saved terms'}\nFuture eligibility: ${future}\n\nNothing is saved or replaced yet. Review the entry, then tap Add Entry. If this bank has an older churn/cooldown record, the normal replacement screen will still appear before anything is replaced.`;
  }
  function readFileText(file){
    if(file&&typeof file.text==='function')return file.text();
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||''));
      reader.onerror=()=>reject(reader.error||new Error('Could not read the selected file.'));
      reader.readAsText(file);
    });
  }
  async function importEntryFile(file){
    if(!file)throw new Error('No file selected.');
    const text=await readFileText(file);
    const payload=parseEntryFileText(text,file.name||'');
    if(!window.confirm(preview(payload)))return{status:'cancelled'};
    return stageEntryForReview(payload,'entry-file',file.name||'');
  }
  function chooseEntryFile(){
    const input=document.createElement('input');
    input.type='file';
    input.accept='.json,.html,application/json,text/html';
    input.style.display='none';
    input.onchange=async()=>{
      const file=input.files&&input.files[0];
      try{if(file)await importEntryFile(file)}catch(err){alert('Could not import this entry file: '+(err&&err.message?err.message:err))}
      setTimeout(()=>{try{input.remove()}catch{}},50);
    };
    document.body.appendChild(input);
    input.click();
  }
  function importIcon(){
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11"/><path d="m8 10 4 4 4-4"/><path d="M5 18v2h14v-2"/></svg>';
  }
  function injectQuickAddImport(){
    const grid=document.querySelector('.tgrid');
    if(!grid||document.getElementById('bt_import_entry_file'))return;
    const btn=document.createElement('button');
    btn.id='bt_import_entry_file';
    btn.type='button';
    btn.className='tbtn';
    btn.style.gridColumn='1 / -1';
    btn.innerHTML='<div class="blogo sm" style="background:#0F172A">'+importIcon()+'</div><div class="t-info"><div class="nm">Import Entry File</div><div class="bn">JSON / HTML · review before save</div></div>';
    btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();chooseEntryFile()});
    grid.prepend(btn);
    const note=document.createElement('div');
    note.id='bt_import_entry_note';
    note.style.cssText='grid-column:1/-1;font-size:9px;line-height:1.45;color:var(--muted);padding:0 4px 4px';
    note.textContent='Safe import: the file opens as a New Entry first. Existing churn records use the normal Replace Old Entry flow and are never overwritten automatically.';
    btn.insertAdjacentElement('afterend',note);
  }
  function runHash(){
    if(hashHandled)return;
    const h=String(location.hash||'').replace(/^#/,'');
    if(!h.startsWith(HASH_KEY))return;
    hashHandled=true;
    try{
      const payload=validatePayload(decode(h.slice(HASH_KEY.length)));
      if(!window.confirm(preview(payload))){clearHash();return}
      stageEntryForReview(payload,'one-click-link','');
      clearHash();
    }catch(err){clearHash();alert('Could not load this bank entry: '+(err&&err.message?err.message:err));}
  }

  window.btAddEntryFromPayload=(payload)=>stageEntryForReview(payload,'payload','');
  window.btStageEntryPayload=stageEntryForReview;
  window.btParseEntryFileText=parseEntryFileText;
  window.btImportEntryFile=chooseEntryFile;
  window.btImportEntryFileObject=importEntryFile;
  window.btEntryLinkImportVersion=VER;
  if(typeof window.btRegisterPostRender==='function')window.btRegisterPostRender('entry-file-import',injectQuickAddImport);
  injectQuickAddImport();
  setTimeout(runHash,80);setTimeout(runHash,700);
})();
