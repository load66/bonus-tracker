/*
 * filename: scripts/analyzer/match-utils.js
 * version: 1.0.2
 * purpose: Shared defensive matcher for analyzer bank-rule gates.
 */
(function(){
  window.tcV3EngineAnalyze=window.tcV3EngineAnalyze||window.tcV3Analyze;
  function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
  function hit(raw,rx){
    try{
      if(!rx||typeof rx.source!=='string')return false;
      return new RegExp(rx.source,(rx.flags||'').replace(/[gy]/g,'')).test(raw);
    }catch(e){return false;}
  }
  function count(raw,tests){return list(tests).reduce((n,rx)=>n+(hit(raw,rx)?1:0),0);}
  window.tcV3MatchProfile=function(raw,spec){
    spec=spec||{};
    raw=String(raw||'');
    const brand=list(spec.brand);
    const product=list(spec.product);
    const anti=list(spec.anti);
    const minProduct=Number.isFinite(Number(spec.minProduct))?Number(spec.minProduct):1;
    if(anti.length&&count(raw,anti)>0)return false;
    if(brand.length&&count(raw,brand)<1)return false;
    if(product.length&&count(raw,product)<minProduct)return false;
    return !!(brand.length||product.length);
  };
  function applied(r,label){return (r?.bankRulesApplied||[]).some(x=>String(x).indexOf(label)>=0);}
  function gate(raw,name){const g=window.tcV3BankRuleGates||{};return typeof g[name]==='function'&&g[name](raw);}
  function bad(r,raw){
    raw=String(raw||r?.raw||r?.normalizedRaw||'');
    return ((r?.acct==='Chase Business Complete Checking'||applied(r,'Chase Business'))&&!gate(raw,'applyChaseBusiness'))||
      ((r?.bank==='Wells Fargo'||applied(r,'Wells Fargo'))&&!gate(raw,'applyWellsBusiness'))||
      ((r?.bank==='BMO'||applied(r,'BMO Business'))&&!gate(raw,'applyBmoBusiness'))||
      (applied(r,'Bank of America Bonus Chart')&&!gate(raw,'applyBOA'))||
      ((applied(r,'Capital One Business')||/Capital One Basic or Enhanced Business/i.test(r?.acct||''))&&!gate(raw,'applyCapitalOneBusiness'))||
      ((applied(r,'Bank of America Business')||/Business Advantage Banking/i.test(r?.acct||''))&&!gate(raw,'applyBoaBusiness'))||
      ((applied(r,'PNC Virtual Wallet')||/PNC Virtual Wallet/i.test(r?.acct||''))&&!gate(raw,'applyPncConsumer'))||
      ((applied(r,'Regions LifeGreen')||/Regions LifeGreen/i.test(r?.acct||''))&&!gate(raw,'applyRegionsLifeGreen'))||
      ((applied(r,'Equity Bank Bloom')||/Equity Bank Bloom/i.test(r?.acct||''))&&!gate(raw,'applyEquityBloom'))||
      ((applied(r,'Busey Bank')||/Busey Foundation/i.test(r?.acct||''))&&!gate(raw,'applyBuseyPersonal'))||
      ((applied(r,'Academy Bank')||/Academy Bank Elite/i.test(r?.acct||''))&&!gate(raw,'applyAcademyElite'));
  }
  function fallback(raw,opts){
    const base=window.tcV3EngineAnalyze;
    const r=typeof base==='function'?base(raw,opts):null;
    if(r&&/Chase Total Checking/i.test(String(raw||''))){
      r.bank='Chase';r.acct='Chase Total Checking';
      r.profileKnown=true;r.profileStatus='saved-flexible-coupon';
    }
    return r;
  }
  function harden(){
    if(typeof window.tcV3Analyze!=='function'||window.tcV3Analyze.__btMatchHardening)return;
    const full=window.tcV3Analyze;
    const wrapped=function(raw,opts){const r=full(raw,opts);return bad(r,raw)?fallback(raw,opts)||r:r;};
    wrapped.__btMatchHardening=true;
    window.tcV3Analyze=wrapped;window.tcUnifiedAnalyze=wrapped;window.tcStrictAnalyze=wrapped;
  }
  [900,1900,3100].forEach(t=>setTimeout(harden,t));
})();
