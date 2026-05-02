/*
 * filename: scripts/analyzer/bank-rules-regression-test.js
 * version: 1.0.0
 * purpose: Hash-gated regression tests for defensive bank-rule gates.
 */
(function(){
  const VER='1.0.0';
  const CHASE_TOTAL_CHECKING_TNC=`JPMorgan Chase Bank, N.A. Chase Total Checking Account terms and conditions. Chase Total Checking is a personal checking account. This document describes personal checking fees, Chase SavingsSM, Chase First CheckingSM, deposits, withdrawals, and account services. It is not a Chase Business Complete Checking business checking offer.`;
  const RULES=[
    ['applyChaseBusiness','chase','Chase Business'],
    ['applyWellsBusiness','wells','Wells Fargo'],
    ['applyBmoBusiness','bmo','BMO'],
    ['applyBOA','boaPersonal','BofA Personal'],
    ['applyCapitalOneBusiness','capitalone','Capital One'],
    ['applyBoaBusiness','boaBusiness','BofA Business'],
    ['applyPncConsumer','pnc','PNC'],
    ['applyRegionsLifeGreen','regions','Regions'],
    ['applyEquityBloom','equity','Equity Bank'],
    ['applyBuseyPersonal','busey','Busey Bank'],
    ['applyAcademyElite','academy','Academy Bank']
  ];
  function fetchText(path){return fetch(path,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(path+' '+r.status);return r.text();});}
  function readMainSamples(src){
    const m=src.match(/const\s+SAMPLES\s*=\s*(\{[\s\S]*?\n\s*\});/);
    if(!m)throw new Error('Unable to read SAMPLES from profile-library-selftest.js');
    return Function('return '+m[1])();
  }
  function readAcademySample(src){
    const m=src.match(/const\s+SAMPLE\s*=\s*(`[^`]*`);/);
    if(!m)throw new Error('Unable to read SAMPLE from profile-library-selftest-academy.js');
    return Function('return '+m[1])();
  }
  async function samples(){
    const main=readMainSamples(await fetchText('./scripts/analyzer/profile-library-selftest.js'));
    main.academy=readAcademySample(await fetchText('./scripts/analyzer/profile-library-selftest-academy.js'));
    return main;
  }
  function label(key){return ({bmo:'BMO',chase:'Chase Business',wells:'Wells Fargo',capitalone:'Capital One',boaBusiness:'BofA Business',pnc:'PNC',regions:'Regions',equity:'Equity Bank',busey:'Busey Bank',academy:'Academy Bank',boaPersonal:'BofA Personal','chase-total-checking':'Chase Total Checking'})[key]||key;}
  function print(fails,passed,total){
    if(fails.length){fails.forEach(x=>console.error(x));console.error(`Bank Rules Regression: ${passed}/${total} passed`);}
    else console.log(`Bank Rules Regression: ${passed}/${total} passed`);
  }
  async function run(){
    const gates=window.tcV3BankRuleGates||{};
    const s=await samples();
    const sampleKeys=Object.keys(s).filter(k=>typeof s[k]==='string');
    let total=0,passed=0;
    const fails=[];
    RULES.forEach(([gateName,ownKey])=>{
      const gate=gates[gateName];
      sampleKeys.forEach(key=>{
        total++;
        let fired=false;
        try{fired=typeof gate==='function'&&!!gate(s[key]);}catch(e){fails.push(`FAIL: ${gateName} threw on ${label(key)} sample: ${e?.message||e}`);return;}
        if(key===ownKey){
          if(fired)passed++; else fails.push(`FAIL: ${gateName} did not fire on its own sample`);
        }else{
          if(!fired)passed++; else fails.push(`FAIL: ${gateName} fired on ${label(key)} sample`);
        }
      });
    });
    const chaseGate=gates.applyChaseBusiness;
    total++;
    if(typeof chaseGate==='function'&&!chaseGate(CHASE_TOTAL_CHECKING_TNC))passed++;
    else fails.push('FAIL: applyChaseBusiness fired on Chase Total Checking sample');
    print(fails,passed,total);
    return {ok:fails.length===0,passed,total,failed:fails.length,failures:fails,version:VER};
  }
  window.btBankRulesRegressionRun=run;
  if(window.location&&window.location.hash==='#bttest')setTimeout(()=>run().catch(e=>console.error('Bank Rules Regression failed:',e)),0);
})();
