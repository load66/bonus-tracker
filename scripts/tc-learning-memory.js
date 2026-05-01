/* ✅ Version 2.11.0 Newest update: Local Analyzer Learning Memory. Learns user corrections quietly for long-term accuracy. */
(function(){
  const VER='2.11.0';
  const KEY='bt_tc_learning_memory_v1';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).toLowerCase();
  const num=v=>{const n=parseFloat(String(v||'').replace(/[$,\s]/g,''));return Number.isFinite(n)?n:0};
  const now=()=>new Date().toISOString();

  function getStore(){
    try{
      const raw=localStorage.getItem(KEY);
      const obj=raw?JSON.parse(raw):{};
      return { byBank:obj.byBank||{}, byFingerprint:obj.byFingerprint||{}, events:Array.isArray(obj.events)?obj.events:[] };
    }catch{return {byBank:{},byFingerprint:{},events:[]};}
  }
  function setStore(s){try{localStorage.setItem(KEY,JSON.stringify(s));}catch(e){console.warn('[tc-learning-memory] save skipped',e);}}
  function bankKey(bank){return norm(bank||'unknown').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'unknown';}
  function fingerprint(raw){
    const t=norm(raw||'');
    const hints=[];
    if(/u\.s\. bank|us bank|bank smartly/.test(t))hints.push('usbank');
    if(/morgan stanley|e\*trade/.test(t))hints.push('morgan');
    if(/wells fargo/.test(t))hints.push('wells');
    const code=(t.match(/\b[A-Z0-9]{4,}\b/i)||[''])[0].toLowerCase();
    const req=(t.match(/within\s+\d+\s+days/i)||[''])[0].toLowerCase();
    const bonus=(t.match(/\$\s*\d[\d,]*(?:\.\d+)?\s*bonus/i)||[''])[0].toLowerCase();
    return [hints.join('-'),code,req,bonus].filter(Boolean).join('|')||t.slice(0,160);
  }
  function useful(rule){
    if(!rule)return false;
    return ['bonus','reqDays','reqMoney','fundedDays','fundingAmount','fee','code','openBy','churn','acct'].some(k=>rule[k]!==undefined&&rule[k]!==''&&rule[k]!==0);
  }
  function mergeRule(oldRule,newRule){
    const out={...(oldRule||{})};
    Object.keys(newRule||{}).forEach(k=>{
      if(['updatedAt','source','confidence','uses'].includes(k))return;
      const v=newRule[k];
      if(v!==undefined&&v!==null&&v!==''&&v!==0) out[k]=v;
    });
    out.updatedAt=now();
    out.uses=(oldRule?.uses||0)+1;
    return out;
  }
  function applyRule(r,rule){
    if(!r||!rule)return r;
    const before={bonus:r.bonus,reqDays:r.reqDays,reqMoney:r.reqMoney,code:r.code,openBy:r.openBy,fee:r.fee};
    if(rule.bonus) r.bonus=r.selectedBonus=rule.bonus;
    if(rule.reqDays) r.reqDays=rule.reqDays;
    if(rule.reqMoney) r.reqMoney=rule.reqMoney;
    if(rule.reqIsTotal!==undefined) r.reqIsTotal=!!rule.reqIsTotal;
    if(rule.fundedDays) r.fundedDays=rule.fundedDays;
    if(rule.fundingAmount) r.fundingAmount=rule.fundingAmount;
    if(rule.fee!==undefined&&rule.fee!==null) r.fee=rule.fee;
    if(rule.code){ r.code=rule.code; r.promoCode={value:rule.code,confidence:'Learned',source:'Saved correction memory'}; }
    if(rule.openBy){ r.openBy=rule.openBy; r.expiration={value:rule.openBy,display:rule.openBy,confidence:'Learned',source:'Saved correction memory'}; }
    if(rule.acct) r.acct=rule.acct;
    r.learnedMemoryApplied=true;
    r.learningMemoryVersion=VER;
    r.reviewFlags=Array.isArray(r.reviewFlags)?r.reviewFlags:[];
    const changed=Object.keys(before).some(k=>String(before[k]||'')!==String(r[k]||''));
    if(changed&&!r.reviewFlags.includes('Saved correction memory applied.')) r.reviewFlags.push('Saved correction memory applied.');
    r.clear=!!(r.bonus&&r.reqDays);
    return r;
  }
  function learnFromParsed(raw, parsed, source='manual'){
    const r=parsed||{};
    const bank=r.bank||r.bankName||'';
    const rule={
      bank,
      bonus:num(r.bonus||r.selectedBonus),
      reqDays:num(r.reqDays),
      reqMoney:num(r.reqMoney),
      reqIsTotal:!!r.reqIsTotal,
      fundedDays:num(r.fundedDays),
      fundingAmount:num(r.fundingAmount),
      fee:r.fee!==undefined?num(r.fee):undefined,
      code:clean(r.code||r.promoCodeText||r.promoCode?.value||''),
      openBy:clean(r.openBy||r.expirationDateText||r.expiration?.value||''),
      acct:clean(r.acct||''),
      source,
      updatedAt:now()
    };
    if(!useful(rule)||!bank)return false;
    const s=getStore();
    const bk=bankKey(bank); const fp=fingerprint(raw||r.raw||'');
    s.byBank[bk]=mergeRule(s.byBank[bk],rule);
    if(fp) s.byFingerprint[fp]=mergeRule(s.byFingerprint[fp],rule);
    s.events.unshift({bank,source,updatedAt:rule.updatedAt,fields:Object.keys(rule).filter(k=>rule[k]&&k!=='source'&&k!=='updatedAt')});
    s.events=s.events.slice(0,60);
    setStore(s);
    return true;
  }
  function learnFromEntry(entry, source='entry-save'){
    if(!entry||!entry.bank)return false;
    return learnFromParsed(entry.tcSourceTerms||entry.tncSourceText||entry.rawTerms||'',{
      raw:entry.tcSourceTerms||entry.tncSourceText||'', bank:entry.bank, bonus:entry.bonus, reqDays:entry.reqDays||entry.requiredDaysText, reqMoney:entry.reqMoney, reqIsTotal:entry.reqIsTotal, fundedDays:entry.fundedDays, fundingAmount:entry.fundingAmount, fee:entry.earlyCloseFee, code:entry.promoCodeText, openBy:entry.expirationDateText, acct:entry.accountType
    },source);
  }
  function applyMemory(r){
    if(!r||!r.raw)return r;
    const s=getStore();
    const fp=fingerprint(r.raw);
    const bank=bankKey(r.bank||'');
    const fpRule=s.byFingerprint[fp];
    const bankRule=s.byBank[bank];
    if(bankRule) r=applyRule(r,bankRule);
    if(fpRule) r=applyRule(r,fpRule);
    return r;
  }
  function wrapAnalyze(){
    if(window.__tcLearningMemoryWrapped)return;
    if(typeof window.tcUnifiedAnalyze!=='function')return;
    const base=window.tcUnifiedAnalyze;
    window.tcUnifiedAnalyze=function(raw,opts){ return applyMemory(base(raw,opts)); };
    window.tcStrictAnalyze=window.tcUnifiedAnalyze;
    window.__tcLearningMemoryWrapped=true;
  }
  function captureReviewFields(){
    const raw=(document.getElementById('tca_raw')?.value)||window.__btLastTcSource?.raw||'';
    const bank=clean(document.getElementById('tcr_bank')?.value||'');
    if(!bank)return false;
    const parsed={
      raw, bank,
      bonus:num(document.getElementById('tcr_bonus')?.value),
      reqDays:num(document.getElementById('tcr_req_days')?.value),
      reqMoney:num(document.getElementById('tcr_req_money')?.value),
      fundedDays:num(document.getElementById('tcr_funded_days')?.value),
      code:clean(document.getElementById('tcr_promo')?.value||''),
      openBy:clean(document.getElementById('tcr_openby')?.value||''),
      acct:clean(document.getElementById('tcr_acct')?.value||'')
    };
    return learnFromParsed(raw,parsed,'review-form-save');
  }
  document.addEventListener('click',e=>{
    const btn=e.target.closest('button'); if(!btn)return;
    const txt=clean(btn.textContent||'');
    if(/Create Entry \+ Timers|Apply Fields|Save Changes|Add Entry/i.test(txt)){
      try{captureReviewFields();}catch(err){console.warn('[tc-learning-memory] capture review skipped',err);}
      setTimeout(()=>{try{ if(Array.isArray(entries)&&entries[0]) learnFromEntry(entries[0],'post-save-entry'); }catch{}},300);
    }
  },true);
  window.tcLearningMemoryStatus=function(){const s=getStore();return{version:VER,banks:Object.keys(s.byBank).length,fingerprints:Object.keys(s.byFingerprint).length,events:s.events.slice(0,10)};};
  window.tcClearLearningMemory=function(){localStorage.removeItem(KEY);return true;};
  window.tcLearnFromEntry=learnFromEntry;
  window.tcLearningMemoryVersion=VER;
  setTimeout(wrapAnalyze,150);setTimeout(wrapAnalyze,700);setTimeout(wrapAnalyze,1600);
})();
