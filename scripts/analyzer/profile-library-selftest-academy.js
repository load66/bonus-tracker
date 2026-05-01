/* ✅ Version 3.1.1 Newest update: Academy Bank Analyzer Self-Test extension. */
(function(){
  const VER='3.1.1';
  const esc=v=>{const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML};
  const money=n=>'$'+Number(n||0).toLocaleString();
  const SAMPLE=`Academy Bank Elite Investment Checking. $100 opening balance required on Elite Investment Checking Account. Subject to monthly service charge. To receive $500 bonus, open a new Elite Investment Checking Account, make at least four direct deposits totaling $10,000 and enroll in Online Banking within 90 days of account opening. The checking account bonus will be deposited into your new checking account within 60 days of direct deposit verification. Closing a new account within 90 days of opening will result in a $25 early closure fee. Offer expires May 15, 2026. Direct deposit required. Maximum ACH credit is $15,000.`;

  function runAcademyTest(){
    const analyze=window.tcV3Analyze;
    let r=null,error='',checks=[],pass=false;
    try{
      if(typeof analyze!=='function') throw new Error('Analyzer engine is not loaded.');
      r=analyze(SAMPLE,{noGlobalFallback:true});
      checks=[
        {ok:r.bank==='Academy Bank',label:'bank = Academy Bank'},
        {ok:r.acct==='Academy Bank Elite Investment Checking',label:'Elite Investment Checking profile used'},
        {ok:r.bonus===500,label:'bonus $500'},
        {ok:r.fundingAmount===100,label:'$100 opening balance'},
        {ok:r.reqMoney===10000,label:'$10,000 total direct deposits'},
        {ok:r.count===4,label:'4 direct deposits'},
        {ok:r.reqDays===90,label:'90-day requirement window'},
        {ok:/60 days/i.test(r.payout||''),label:'60-day payout after DD verification'},
        {ok:/25/.test(r.early||''),label:'$25 early closure fee captured'}
      ];
      pass=checks.every(c=>c.ok);
    }catch(e){error=e?.message||String(e);}
    return {id:'Academy Bank',pass,error,checks,result:r?{bank:r.bank,acct:r.acct,bonus:r.bonus,reqMoney:r.reqMoney,reqDays:r.reqDays,fundedDays:r.fundedDays,holdDays:r.holdDays,count:r.count,profile:r.profileRegistry?.id||'',rules:r.bankRulesApplied||[]}:null};
  }

  function lineFor(t){
    return `<div class="v31-test ${t.pass?'pass':'fail'}">
      <div class="v31-row"><b>${t.pass?'✅':'❌'} ${esc(t.id)}</b><span>${t.pass?'Pass':'Fail'}</span></div>
      ${(t.checks||[]).map(c=>`<div class="v31-check ${c.ok?'ok':'bad'}">${c.ok?'✓':'✗'} ${esc(c.label)}</div>`).join('')}
      ${t.error?`<div class="v31-check bad">${esc(t.error)}</div>`:''}
    </div>`;
  }

  function mergeResult(base){
    const academy=runAcademyTest();
    const tests=(base?.tests||[]).filter(t=>t.id!=='Academy Bank').concat(academy);
    const passed=tests.filter(t=>t.pass).length;
    const total=tests.length;
    const failed=total-passed;
    return {...(base||{}),version:VER,passed,failed,total,ok:failed===0,tests};
  }

  function reportText(res){
    res=res||window.__tcV31LastSelfTest||mergeResult(window.__tcV31BaseSelfTest||{});
    const lines=[`BANK BONUS TRACKER — ANALYZER SELF-TEST v${VER}`,`Ran: ${res.ranAt||new Date().toISOString()}`,`Result: ${res.passed}/${res.total} passed`,''];
    (res.tests||[]).forEach(t=>{
      lines.push(`${t.pass?'PASS':'FAIL'} — ${t.id}`);
      if(t.error)lines.push(`  Error: ${t.error}`);
      (t.checks||[]).forEach(c=>lines.push(`  ${c.ok?'✓':'✗'} ${c.label}`));
      if(t.result)lines.push(`  Parsed: ${t.result.bank} | ${t.result.acct} | bonus ${money(t.result.bonus)} | req ${money(t.result.reqMoney)} | days ${t.result.reqDays}`);
      lines.push('');
    });
    return lines.join('\n');
  }

  function patch(){
    if(window.__tcV31AcademySelfTestWrapped)return;
    if(typeof window.tcV31RunAnalyzerSelfTest!=='function' || typeof window.tcV31RunAndShowSelfTest!=='function')return;
    const baseRun=window.tcV31RunAnalyzerSelfTest;
    const baseShow=window.tcV31RunAndShowSelfTest;
    window.tcV31RunAnalyzerSelfTest=function(){
      const base=baseRun();
      window.__tcV31BaseSelfTest=base;
      return mergeResult(base);
    };
    window.tcV31RunAndShowSelfTest=function(){
      const base=baseShow();
      window.__tcV31BaseSelfTest=base;
      const merged=mergeResult(base);
      window.__tcV31LastSelfTest=merged;
      const el=document.getElementById('v31_content');
      if(el){
        const head=el.querySelector('.v31-test-head');
        if(head){
          head.className=`v31-test-head ${merged.ok?'pass':'fail'}`;
          head.textContent=`${merged.ok?'PASS':'NEEDS FIX'} · ${merged.passed}/${merged.total} passed`;
        }
        if(!el.textContent.includes('Academy Bank')) el.insertAdjacentHTML('beforeend',lineFor(merged.tests.find(t=>t.id==='Academy Bank')));
      }
      return merged;
    };
    window.tcV31SelfTestReport=function(res){return reportText(res||window.__tcV31LastSelfTest||window.tcV31RunAnalyzerSelfTest());};
    window.tcV31CopySelfTestReport=function(){
      const txt=window.tcV31SelfTestReport(window.__tcV31LastSelfTest||window.tcV31RunAnalyzerSelfTest());
      navigator.clipboard?.writeText(txt).then(()=>alert('Analyzer self-test report copied.')).catch(()=>alert(txt));
    };
    window.__tcV31AcademySelfTestWrapped=true;
  }

  window.tcV31RunAcademySelfTest=runAcademyTest;
  window.tcV31AcademySelfTestVersion=VER;
  setTimeout(patch,150);setTimeout(patch,700);setTimeout(patch,1600);
})();
