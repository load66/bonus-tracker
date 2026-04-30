/* ✅ Version 2.7.7 Newest update: Crash-safe Manual/Edit Review. No live MutationObserver while scrolling. */
(function(){
  const VER='2.7.7';
  const qsa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const esc=v=>{const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML;};
  const money=n=>'$'+Number(n||0).toLocaleString();
  let activeMode='new', activeIndex=-1, scanTimer=null;

  function isTitle(t){return /^(New Entry|Edit Entry)$/i.test(clean(t));}
  function titleFor(sheet){return clean(qsa('h1,h2,h3,.modal-title,.sheet-title',sheet).find(h=>isTitle(h.textContent))?.textContent||'');}
  function nativeSheet(){
    for(const h of qsa('h1,h2,h3,.modal-title,.sheet-title').filter(x=>isTitle(x.textContent))){
      if(h.closest('.manual-review-sheet')) continue;
      let el=h;
      for(let i=0;i<9&&el;i++,el=el.parentElement){
        if(el.classList?.contains('manual-review-sheet')||el.querySelector?.('.manual-review-sheet')) break;
        const txt=clean(el.textContent||'');
        if(/Bank Name/i.test(txt)&&/(Add Entry|Save Entry|Save Changes|Update Entry|Cancel)/i.test(txt)) return el;
      }
    }
    return null;
  }
  function inputNear(label){
    const forId=label.getAttribute&&label.getAttribute('for');
    if(forId&&document.getElementById(forId)) return document.getElementById(forId);
    let p=label.parentElement;
    for(let i=0;i<5&&p;i++,p=p.parentElement){
      const f=p.querySelector('input,textarea,select'); if(f) return f;
      const sib=p.nextElementSibling;
      const sf=sib&&(sib.matches?.('input,textarea,select')?sib:sib.querySelector?.('input,textarea,select'));
      if(sf) return sf;
    }
    return null;
  }
  function fieldByLabel(sheet,tests){
    for(const label of qsa('label',sheet)){
      const t=clean(label.textContent).toLowerCase().replace(/\*/g,'');
      if(tests.some(x=>t.includes(x))){const f=inputNear(label); if(f) return f;}
    }
    return null;
  }
  function nativeVal(sheet,tests){const f=fieldByLabel(sheet,tests);return f?(f.value||''):'';}
  function num(v){const m=String(v||'').replace(/[$,\s]/g,'').match(/-?\d+(?:\.\d+)?/);const n=m?parseFloat(m[0]):0;return Number.isFinite(n)?n:0;}
  function val(id){return document.getElementById(id)?.value||'';}
  function nval(id){return num(val(id));}
  function normChurn(v){const s=clean(v).toLowerCase();if(!s||/select/.test(s))return'';if(/180/.test(s))return'180';if(/3/.test(s))return'3';if(/2/.test(s))return'2';if(/1|12|year/.test(s))return'1';return String(v||'').trim();}
  function churnLabel(v){const s=normChurn(v);return s==='180'?'180 Days':s==='3'?'3 Years':s==='2'?'2 Years':s==='1'?'1 Year':'Select';}
  function globalModal(){try{return typeof modal!=='undefined'?modal:null;}catch{return null;}}
  function idFromText(sheet){const m=clean(sheet?.textContent||'').match(/\b[A-Z]{2,5}-[PB]-\d{1,4}\b/i);return m?m[0].toUpperCase():'';}
  function entryIndex(sheet){
    const m=globalModal();
    try{if(m&&m._edit!==undefined&&entries[m._edit])return Number(m._edit);}catch{}
    const id=idFromText(sheet);
    try{if(id){const i=entries.findIndex(e=>String(e.id||'').toUpperCase()===id);if(i>=0)return i;}}catch{}
    const bank=nativeVal(sheet,['bank name']);
    try{if(bank){const i=entries.findIndex(e=>clean(e.bank).toLowerCase()===clean(bank).toLowerCase());if(i>=0)return i;}}catch{}
    return -1;
  }
  function dataFrom(sheet,mode){
    activeIndex=mode==='edit'?entryIndex(sheet):-1;
    let e={};try{if(activeIndex>=0)e=entries[activeIndex]||{};}catch{}
    return {
      id:e.id||idFromText(sheet)||'', bank:e.bank||nativeVal(sheet,['bank name']), bonus:e.bonus||nativeVal(sheet,['amount']), churn:e.churn||nativeVal(sheet,['churn rule']),
      monthlyFee:e.monthlyFeeYNText||nativeVal(sheet,['monthly fee']), promo:e.promoCodeText||nativeVal(sheet,['promo code']), waivers:e.avoidMonthlyFeeText||nativeVal(sheet,['avoid the monthly fee']), complete:e.completeBonusText||nativeVal(sheet,['complete the bonus']),
      earlyFee:e.earlyCloseFee??num(nativeVal(sheet,['early termination fee'])), holdDays:e.minHoldDays||num(nativeVal(sheet,['hold until days','close fee countdown'])), eligibility:e.eligibilityText||nativeVal(sheet,['eligibility']), reqDays:e.reqDays||e.requiredDaysText||nativeVal(sheet,['how many days','required to complete']),
      opened:e.opened||nativeVal(sheet,['opened']), closed:e.closed||nativeVal(sheet,['closed']), bonusRecd:e.bonusRecd||nativeVal(sheet,['bonus received']), reqMet:e.reqMet||nativeVal(sheet,['req met']), notes:e.notes||nativeVal(sheet,['your notes','notes']), dataPoint:e.dataPoint||'', customTimers:Array.isArray(e.customTimers)?e.customTimers:[]
    };
  }
  function chip(l,v,c='blue'){return `<div class="tcr-chip ${c}"><span>${esc(l)}</span><b>${esc(v||'—')}</b></div>`;}
  function input(l,id,v='',type='text',hint=''){return `<div class="tcr-field"><label>${esc(l)}</label><input id="${id}" type="${type}" value="${esc(v||'')}" ${type==='number'?'inputmode="decimal" min="0" step="1"':''}>${hint?`<small>${esc(hint)}</small>`:''}</div>`;}
  function area(l,id,v='',rows=4,hint=''){return `<div class="tcr-field wide"><label>${esc(l)}</label><textarea id="${id}" rows="${rows}">${esc(v||'')}</textarea>${hint?`<small>${esc(hint)}</small>`:''}</div>`;}
  function section(t,sub,body){return `<section class="tcr-section"><div class="tcr-section-head"><h4>${esc(t)}</h4>${sub?`<p>${esc(sub)}</p>`:''}</div>${body}</section>`;}
  function summary(sheet){
    const s=sheet.querySelector('.tcr-summary'); if(!s)return;
    const bank=clean(val('mer_bank'))||'New bank', bonus=nval('mer_bonus'), churn=churnLabel(val('mer_churn')), req=clean(val('mer_reqdays'))||'—';
    s.innerHTML=[chip('Bank',bank,'blue'),chip('Bonus',bonus?money(bonus):'—',bonus?'green':'amber'),chip('Churn Rule',churn,'amber'),chip('Req Days',req,'purple')].join('');
  }
  function openReview(sheet){
    if(!sheet||sheet.dataset.manualReviewOpen==='1'||sheet.querySelector?.('.manual-review-sheet'))return;
    const title=titleFor(sheet), mode=/^Edit Entry$/i.test(title)?'edit':'new'; activeMode=mode;
    const d=dataFrom(sheet,mode);
    sheet.dataset.manualReviewOpen='1'; sheet.innerHTML=''; sheet.classList.add('tcr-sheet','manual-review-sheet'); sheet.onclick=e=>e.stopPropagation();
    const saveText=mode==='edit'?'Save Changes':'Add Entry';
    sheet.innerHTML=`
      <div class="tcr-grabber"></div>
      <header class="tcr-hero"><div><div class="tcr-kicker">${mode==='edit'?'Edit Entry Review':'Manual Entry Review'}</div><h3>${mode==='edit'?'Edit Entry':'New Entry'}</h3><p>${mode==='edit'?'Update this bank. Churn Rule stays tied to countdown.':'Same clean layout as Analyzer Pro.'}</p></div><div class="tcr-version">v${VER}</div></header>
      <div class="tcr-summary">${chip('Bank',d.bank||'New bank','blue')}${chip('Bonus',d.bonus?money(d.bonus):'—',d.bonus?'green':'amber')}${chip('Churn Rule',churnLabel(d.churn),'amber')}${chip('Req Days',d.reqDays||'—','purple')}</div>
      ${d.id?`<div class="manual-record-pill">Record ID: ${esc(d.id)}</div>`:''}
      ${section('1. Promo Basics','The key fields needed to track this bank bonus.','<div class="tcr-grid">'+input('Bank','mer_bank',d.bank)+input('Bonus Amount','mer_bonus',d.bonus,'number')+`<div class="tcr-field"><label>Churn Rule</label><select id="mer_churn"><option value="">Select</option><option value="1" ${normChurn(d.churn)==='1'?'selected':''}>1 Year</option><option value="2" ${normChurn(d.churn)==='2'?'selected':''}>2 Years</option><option value="3" ${normChurn(d.churn)==='3'?'selected':''}>3 Years</option><option value="180" ${normChurn(d.churn)==='180'?'selected':''}>180 Days</option></select><small>This drives the countdown after the bank is closed.</small></div>`+input('Promo Code','mer_promo',d.promo)+'</div>')}
      ${section('2. Requirements','Requirement deadline and minimum hold period.','<div class="tcr-grid">'+input('Requirement Days','mer_reqdays',d.reqDays,'number')+input('Hold Until Days','mer_holddays',d.holdDays,'number','Minimum days to keep account open before closing. Separate from Churn Rule.')+'</div>'+area('How to Complete Bonus','mer_complete',d.complete,5))}
      ${section('3. Bonus Timeline','Opened starts timers. Closed starts the churn countdown.','<div class="tcr-grid">'+input('Opened Date','mer_opened',d.opened,'date','Starts requirement and hold timers.')+input('Requirements Met Date','mer_reqmet',d.reqMet,'date','Date you completed the requirements.')+input('Bonus Received Date','mer_bonusrecd',d.bonusRecd,'date','Confirms payout/tax year.')+input('Closed Date','mer_closed',d.closed,'date','Starts churn countdown.')+'</div>')}
      ${section('4. Fees & Risk','Fees, waivers, and eligibility notes.','<div class="tcr-grid">'+input('Monthly Fee (Yes / No)','mer_monthly',d.monthlyFee)+input('Early Termination Fee $','mer_earlyfee',d.earlyFee,'number','Number only. Use 0 if none or not mentioned.')+'</div>'+area('How to Avoid Monthly Fee','mer_waivers',d.waivers,3)+area('Eligibility / Churn','mer_eligibility',d.eligibility,4))}
      ${section('5. Your Notes','Personal notes are kept separate from analyzer-generated terms.',area('Notes','mer_notes',d.notes,4))}
      <div class="tcr-actions manual-review-actions"><button class="tcr-cancel" id="mer_cancel">Cancel</button><button class="tcr-save" id="mer_save">${saveText}</button></div>`;
    bind(sheet); summary(sheet);
  }
  function payload(existing){
    const bank=clean(val('mer_bank')), churn=normChurn(val('mer_churn'));
    const id=existing?.id||(()=>{try{return typeof genId==='function'?genId(bank,new Set((entries||[]).map(e=>e.id))):'BNK-P-'+Date.now().toString().slice(-6);}catch{return'BNK-P-'+Date.now().toString().slice(-6);}})();
    const early=nval('mer_earlyfee');
    return {...(existing||{}),id,bank,bonus:nval('mer_bonus'),churn,opened:clean(val('mer_opened')),bonusRecd:clean(val('mer_bonusrecd')),closed:clean(val('mer_closed')),reqMet:clean(val('mer_reqmet')),dataPoint:existing?.dataPoint||'',notes:clean(val('mer_notes')),reqDays:parseInt(val('mer_reqdays'),10)||0,minHoldDays:parseInt(val('mer_holddays'),10)||0,earlyCloseFee:early,feeChecked:existing?.feeChecked||false,plannedClose:existing?.plannedClose||'',customTimers:Array.isArray(existing?.customTimers)?existing.customTimers:[],monthlyFeeYNText:clean(val('mer_monthly')),promoCodeText:clean(val('mer_promo')),avoidMonthlyFeeText:clean(val('mer_waivers')),completeBonusText:clean(val('mer_complete')),earlyTerminationFeeText:early?String(early):'0',eligibilityText:clean(val('mer_eligibility')),expirationDateText:existing?.expirationDateText||'',requiredDaysText:clean(val('mer_reqdays'))};
  }
  function close(){try{modal=null;}catch{} if(typeof R==='function')R();}
  function save(){
    const bank=clean(val('mer_bank')), churn=normChurn(val('mer_churn'));
    if(!bank){alert('Bank name is required.');return;} if(!churn){alert('Churn Rule is required because it drives the churn countdown.');return;}
    try{
      const existing=activeIndex>=0?entries[activeIndex]:null;
      if(activeMode==='edit'&&activeIndex<0){alert('Could not locate the existing record to update. Refresh and try again.');return;}
      const e=payload(existing); if(activeMode==='edit')entries[activeIndex]=e;else entries.unshift(e);
      if(typeof sv==='function'&&typeof SK!=='undefined')sv(SK,entries);
      if(typeof saveReq==='function')saveReq(e.bank,{bank:e.bank,bonus:e.bonus,churn:e.churn,reqDays:e.reqDays,minHoldDays:e.minHoldDays,earlyCloseFee:e.earlyCloseFee,monthlyFeeYNText:e.monthlyFeeYNText,promoCodeText:e.promoCodeText,avoidMonthlyFeeText:e.avoidMonthlyFeeText,completeBonusText:e.completeBonusText,earlyTerminationFeeText:e.earlyTerminationFeeText,eligibilityText:e.eligibilityText,requiredDaysText:e.requiredDaysText});
      close(); setTimeout(()=>alert((activeMode==='edit'?'Entry updated for ':'New entry created for ')+e.bank+'. Churn Rule saved as '+churnLabel(e.churn)+'.'),60);
    }catch(err){console.error('[manual-entry-review]',err);alert('Could not save entry. Refresh and try again.');}
  }
  function bind(sheet){sheet.addEventListener('input',()=>summary(sheet),true);sheet.addEventListener('change',()=>summary(sheet),true);sheet.querySelector('#mer_cancel')?.addEventListener('click',e=>{e.preventDefault();close();});sheet.querySelector('#mer_save')?.addEventListener('click',e=>{e.preventDefault();save();});}
  function scan(){const s=nativeSheet(); if(s&&/^(New Entry|Edit Entry)$/i.test(titleFor(s)))openReview(s);}
  function schedule(){clearTimeout(scanTimer);scanTimer=setTimeout(scan,130);setTimeout(scan,420);}
  document.addEventListener('click',schedule,true);
  window.openManualEntryReview=()=>{const s=nativeSheet(); if(s)openReview(s);};
})();
