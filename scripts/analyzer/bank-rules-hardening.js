/*
 * filename: scripts/analyzer/bank-rules-hardening.js
 * version: 1.0.0
 * purpose: Defensive bank-rule gates and post-analyzer guard.
 */
(function(){
  const VER='1.0.0';
  const baseAnalyze=window.tcV3Analyze;
  const specs={
    applyChaseBusiness:{brand:[/\bChase\b/i],product:[/Chase Business Complete Checking/i,/\bbusiness checking offer\b/i],anti:[/Chase Total Checking/i,/Chase SavingsSM/i,/Chase First CheckingSM/i,/Chase Secure Banking/i,/Chase Premier Plus Checking/i,/Chase Sapphire Banking/i]},
    applyWellsBusiness:{brand:[/Wells Fargo/i],product:[/\bbusiness checking offer\b/i,/Initiate Business Checking/i,/Navigate Business Checking/i,/Optimize Business Checking/i],anti:[/Everyday Checking/i,/Clear Access Banking/i,/Way2Save/i,/consumer checking/i,/personal checking/i]},
    applyBmoBusiness:{brand:[/\bBMO\b/i],product:[/Digital Business Checking/i,/Simple Business Checking/i,/Premium Business Checking/i,/Elite Business Checking/i,/Business Checking/i],anti:[/Smart Advantage Checking/i,/Smart Money Checking/i,/Relationship Checking/i,/Savings Builder/i,/consumer checking/i,/personal checking/i,/credit card/i]},
    applyBOA:{brand:[/Bank of America/i,/\bBofA\b/i],product:[/Advantage SafeBalance/i,/Advantage Plus/i,/Advantage Relationship/i,/Bonus Chart/i],anti:[/Business Advantage Banking/i,/Business Advantage Relationship Banking/i,/Business Advantage Fundamentals/i,/business banking/i]},
    applyCapitalOneBusiness:{brand:[/Capital One/i],product:[/SBOFFER500/i,/Basic or Enhanced checking/i,/Basic Checking/i,/Enhanced Checking/i,/business checking/i],anti:[/360 Checking/i,/MONEY Teen Checking/i,/360 Performance Savings/i,/cardmember agreement/i,/credit card/i,/personal checking/i,/consumer checking/i]},
    applyBoaBusiness:{brand:[/Bank of America/i,/\bBofA\b/i],product:[/Business Advantage Banking/i,/Business Advantage Relationship Banking/i,/Business Advantage Fundamentals/i],anti:[/Advantage SafeBalance/i,/Bank of America Advantage Plus Banking/i,/Bank of America Advantage Relationship Banking/i,/consumer checking/i,/personal checking/i,/credit card/i]},
    applyPncConsumer:{brand:[/\bPNC\b/i,/PNC Bank/i],product:[/Virtual Wallet/i,/Performance Select/i,/CREDITS CHECK REWARD/i,/Spend account/i],anti:[/business checking/i,/Treasury Enterprise Plan/i,/Analysis Business Checking/i,/Business Checking Plus/i,/merchant services/i,/credit card/i]},
    applyRegionsLifeGreen:{brand:[/Regions Bank/i,/\bRegions\b/i],product:[/LifeGreen/i,/personal Regions checking/i,/Regions checking account/i,/Qualifying ACH direct deposits/i],anti:[/business checking/i,/commercial checking/i,/Regions LifeGreen Savings/i,/savings account/i,/money market/i,/credit card/i,/mortgage/i,/loan/i]},
    applyEquityBloom:{brand:[/Equity Bank/i],product:[/Bloom Bonus/i,/Enter Promotional Code\s+Bloom/i,/promo(?:tional)? code\s+Bloom/i,/new checking and savings/i,/checking and savings/i],anti:[/business checking/i,/commercial checking/i,/treasury management/i]},
    applyBuseyPersonal:{brand:[/Busey Bank/i,/\bBusey\b/i],product:[/Foundation Checking/i,/Pillar Banking/i,/LEVELUP1/i,/LEVELUP2/i,/Busey Debit Mastercard/i],anti:[/business checking/i,/business banking/i,/commercial checking/i,/commercial banking/i]},
    applyAcademyElite:{brand:[/Academy Bank/i],product:[/Elite Investment Checking/i],anti:[/business checking/i,/money market/i,/certificate of deposit/i,/debit card agreement/i]}
  };
  function match(raw,key){return typeof window.tcV3MatchProfile==='function'&&window.tcV3MatchProfile(raw,specs[key]);}
  const gates=window.tcV3BankRuleGates=window.tcV3BankRuleGates||{};
  Object.keys(specs).forEach(k=>{gates[k]=raw=>match(raw,k);});
  function text(r,raw){return String(raw||r?.raw||r?.normalizedRaw||'');}
  function applied(r,label){return (r?.bankRulesApplied||[]).some(x=>String(x).indexOf(label)>=0);}
  function bad(r,raw){
    raw=text(r,raw);
    if((r?.acct==='Chase Business Complete Checking'||applied(r,'Chase Business'))&&!match(raw,'applyChaseBusiness'))return true;
    if((r?.bank==='Wells Fargo'||applied(r,'Wells Fargo'))&&!match(raw,'applyWellsBusiness'))return true;
    if((r?.bank==='BMO'||applied(r,'BMO Business'))&&!match(raw,'applyBmoBusiness'))return true;
    if((applied(r,'Bank of America Bonus Chart'))&&!match(raw,'applyBOA'))return true;
    if((applied(r,'Capital One Business')||/Capital One Basic or Enhanced Business/i.test(r?.acct||''))&&!match(raw,'applyCapitalOneBusiness'))return true;
    if((applied(r,'Bank of America Business')||/Business Advantage Banking/i.test(r?.acct||''))&&!match(raw,'applyBoaBusiness'))return true;
    if((applied(r,'PNC Virtual Wallet')||/PNC Virtual Wallet/i.test(r?.acct||''))&&!match(raw,'applyPncConsumer'))return true;
    if((applied(r,'Regions LifeGreen')||/Regions LifeGreen/i.test(r?.acct||''))&&!match(raw,'applyRegionsLifeGreen'))return true;
    if((applied(r,'Equity Bank Bloom')||/Equity Bank Bloom/i.test(r?.acct||''))&&!match(raw,'applyEquityBloom'))return true;
    if((applied(r,'Busey Bank')||/Busey Foundation/i.test(r?.acct||''))&&!match(raw,'applyBuseyPersonal'))return true;
    if((applied(r,'Academy Bank')||/Academy Bank Elite/i.test(r?.acct||''))&&!match(raw,'applyAcademyElite'))return true;
    return false;
  }
  function wrap(){
    if(window.__tcV3BankRulesHardeningWrapped||typeof window.tcV3Analyze!=='function'||typeof baseAnalyze!=='function')return;
    const full=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){const r=full(raw,opts);return bad(r,raw)?baseAnalyze(raw,opts):r;};
    window.tcUnifiedAnalyze=window.tcV3Analyze;window.tcStrictAnalyze=window.tcV3Analyze;window.__tcV3BankRulesHardeningWrapped=true;
  }
  window.tcV3BankRulesHardeningVersion=VER;
  setTimeout(wrap,120);setTimeout(wrap,650);setTimeout(wrap,1700);
})();
