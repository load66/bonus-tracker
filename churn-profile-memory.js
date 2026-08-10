/*
 * filename: churn-profile-memory.js
 * version: 3.4.13
 * purpose: Product-safe reusable analyzer memory. Never lets self-tests or a different account type contaminate current T&C results.
 */
(function(){
  'use strict';
  const VER='3.4.13';
  const KEY='bt_churn_profiles_v302';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const slug=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'unknown';
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean).map(clean))).filter(Boolean);
  function read(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return{}}}
  function write(v){try{localStorage.setItem(KEY,JSON.stringify(v||{}));return true}catch{return false}}
  function typeFor(r){
    const direct=String(r?.accountType||r?.type||'').toLowerCase();
    if(/business|commercial|biz/.test(direct))return'business';
    if(/personal|consumer|individual/.test(direct))return'personal';
    const text=clean([r?.acct,r?.accountName,r?.raw,r?.normalizedRaw].filter(Boolean).join(' '));
    return /\b(business|commercial|merchant|llc|ein|sole proprietor)\b/i.test(text)?'business':'personal';
  }
  function accountNameFor(r){return clean(r?.acct||r?.accountName||r?.product||'account')||'account'}
  function keyFor(r){return `${slug(r?.bank||'bank')}__${slug(typeFor(r))}__${slug(accountNameFor(r))}`}
  function profileFromResult(r){
    if(!r)return null;
    return {
      version:VER,
      profileKey:keyFor(r),
      bank:r.bank||'',
      accountType:typeFor(r),
      accountName:accountNameFor(r),
      tiered:!!r.tiered,
      tiers:r.tiers||[],
      defaultTargetTier:r.targetTier||null,
      bonus:r.bonus||0,
      promoCode:r.code||'',
      reqDays:r.reqDays||0,
      reqMoney:r.reqMoney||0,
      reqIsTotal:!!r.reqIsTotal,
      requiredCount:r.count||0,
      fundingDays:r.fundedDays||0,
      fundingAmount:r.fundingAmount||0,
      holdDays:r.holdDays||0,
      payout:r.payout||r.payoutText||'',
      monthlyFee:r.fee||0,
      feeWaivers:uniq(r.waivers||[]),
      whatCounts:uniq(r.counts||[]),
      whatDoesNotCount:uniq(r.not||r.notCounts||[]),
      eligibility:clean(r.eligibilityText||''),
      earlyCloseRisk:clean(r.early||''),
      suggestedTimers:r.suggestedTimers||[],
      bankRulesApplied:r.bankRulesApplied||[],
      lastSourceKind:r.sourceKind||'',
      lastSourceId:r.sourceId||'',
      lastUpdated:new Date().toISOString(),
      notes:'Reusable product-specific analyzer memory. Current T&C always wins; business and personal offers never cross-fill.'
    };
  }
  function save(r){
    const p=profileFromResult(r||window.__tcV3AnalysisResult||window.__tcCurrentAnalysisResult);
    if(!p||!p.bank)return false;
    const db=read();
    const old=db[p.profileKey]||{};
    db[p.profileKey]={...old,...p,history:[...(old.history||[]).slice(-9),{updatedAt:p.lastUpdated,bonus:p.bonus,reqMoney:p.reqMoney,reqDays:p.reqDays,sourceKind:p.lastSourceKind}]};
    write(db);
    window.__tcV3LastSavedChurnProfile=db[p.profileKey];
    return db[p.profileKey];
  }
  function compatibleProduct(wanted,p){
    const a=slug(accountNameFor(wanted)),b=slug(p?.accountName||p?.acct||'');
    if(!a||!b||a==='unknown'||b==='unknown')return false;
    if(a===b)return true;
    const generic=new Set(['account','checking','consumer-checking','personal-checking','business-checking','eligible-business-checking']);
    if(generic.has(a)||generic.has(b))return false;
    return a.includes(b)||b.includes(a);
  }
  function find(bank,acct,accountType=''){
    const db=read();
    const wanted={bank,acct,accountType};
    const bankSlug=slug(bank),wantedType=typeFor(wanted);
    const exact=db[keyFor(wanted)];
    if(exact&&typeFor(exact)===wantedType)return exact;
    /* Legacy key support is allowed only when its saved type and product are compatible. */
    const legacy=db[`${bankSlug}__${slug(acct||'account')}`];
    if(legacy&&typeFor(legacy)===wantedType&&compatibleProduct(wanted,legacy))return legacy;
    return Object.values(db).find(p=>slug(p?.bank)===bankSlug&&typeFor(p)===wantedType&&compatibleProduct(wanted,p))||null;
  }
  function applyProfileToResult(r){
    if(!r)return r;
    const p=find(r.bank,r.acct,r.accountType);
    if(!p)return r;
    r.reusableChurnProfile=p;
    r.reusableProfileFound=true;
    r.profileLastUpdated=p.lastUpdated;
    if(!r.tiers?.length&&p.tiers?.length){r.tiers=p.tiers;r.tiered=p.tiered;r.targetTier=p.defaultTargetTier;r.bonus=p.bonus;r.reqMoney=p.reqMoney;r.reqIsTotal=p.reqIsTotal;r.bonusTierText=p.tiers.map(t=>`$${Number(t.bonus||0).toLocaleString()} for $${Number(t.requirement||0).toLocaleString()}+`).join(' / ')}
    if(!r.reqDays&&p.reqDays)r.reqDays=p.reqDays;
    if(!r.count&&p.requiredCount)r.count=p.requiredCount;
    if(!r.fundedDays&&p.fundingDays)r.fundedDays=p.fundingDays;
    if(!r.holdDays&&p.holdDays)r.holdDays=p.holdDays;
    if((!r.counts||!r.counts.length)&&p.whatCounts?.length)r.counts=p.whatCounts;
    if((!r.not||!r.not.length)&&p.whatDoesNotCount?.length){r.not=p.whatDoesNotCount;r.notCounts=p.whatDoesNotCount;}
    r.profileMemoryVersion=VER;
    return r;
  }
  function isolated(opts){return !!(opts&&(opts.noGlobalFallback||opts.selfTest||opts.testMode||opts.trainingTest))}
  function wrap(){
    if(window.__tcV3ChurnMemoryWrapped)return;
    if(typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){
      const r=base(raw,opts);
      if(isolated(opts))return r;
      const out=applyProfileToResult(r);
      if(out&&out.bank&&out.clear)save(out);
      return out;
    };
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV3ChurnMemoryWrapped=true;
  }
  window.tcV3SaveChurnProfile=save;
  window.tcV3FindChurnProfile=find;
  window.tcV3ChurnProfiles=()=>read();
  window.tcV3ClearChurnProfiles=()=>{localStorage.removeItem(KEY);return true};
  window.tcV3ChurnProfileMemoryVersion=VER;
  setTimeout(wrap,80);setTimeout(wrap,500);setTimeout(wrap,1400);
})();
