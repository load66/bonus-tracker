/*
 * filename: scripts/analyzer/profile-library-selftest.js
 * version: 3.1.0
 * purpose: Saved Profile Library + Analyzer Self-Test.
 * last-touched: unknown
 */
(function(){
  const VER='3.1.0';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const esc=v=>{const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML};
  const money=n=>'$'+Number(n||0).toLocaleString();

  const SAMPLES={
    bmo:`BMO Business Checking Bonus. You can receive either a $400 cash bonus, a $750 cash bonus, or a $1,000 cash bonus. Open a BMO Digital Business Checking, BMO Simple Business Checking, BMO Premium Business Checking, or BMO Elite Business Checking account between January 29, 2026 and April 30, 2026. On Day 30 balance must be $4,000 for $400, $25,000 for $750, or $50,000 for $1,000. From Day 31 through Day 90 your account balance must not drop below the assigned tier. Cash bonus deposited approximately Day 104.`,
    chase:`Chase Business Complete Checking business checking offer. Offer valid 01/08/2026-05/14/2026. Deposit a total of $2,000 or more in new money into your new qualifying checking account within 30 days. Business checking offer amount $300 new money deposit amount $2,000 - $9,999. Business checking offer amount $500 new money deposit amount $10,000 or more. Maintain the new money for at least 60 days. Complete 5 qualifying transactions within 90 days. Qualifying transactions include debit card purchases, ACH credits, wires credits and debits, Bill Pay and QuickAccept.`,
    wells:`Wells Fargo business checking offer. To receive the $400 bonus, bonus offer code must be used when opening a new eligible business checking account by May 5, 2026. Eligible accounts include Initiate Business Checking, Navigate Business Checking or Optimize Business Checking. Deposit $2,500 or more by day 30 from account opening and maintain a minimum daily collected balance of $2,500 through day 60 after account opening. Bonus deposited within 30 days after the 60-day qualification period.`,
    capitalone:`Capital One Basic or Enhanced checking account online using promo code SBOFFER500. Deposit at least $5,000 from an external source within 30 days. Maintain a minimum end-of-day balance of $5,000 for at least 60 days within 90 days of account opening. Make 10 qualifying electronic transactions within 90 days. Qualifying transactions include electronic wire, remote check deposit, ACH and instant transfers. Bonus deposited within 60-90 days.`,
    boaBusiness:`Bank of America Business Advantage Banking $400 or $750 cash bonus. Offer expires on December 31, 2026. Open a new Business Advantage Relationship Banking or Business Advantage Fundamentals Banking account online. Deposit New Money within thirty 30 days. Bonus Chart Balance Requirement $5,000 Cash Bonus Tier $400. Balance Requirement $15,000 Cash Bonus Tier $750. Maintenance Period begins thirty-one 31 calendar days after opening and ends ninety 90 calendar days after opening.`,
    pnc:`PNC Virtual Wallet offer. You may earn a $400 reward if you open a new Virtual Wallet with Performance Select or a $100 reward if you open new Virtual Wallet. Offer is valid 2/27/2026 through 5/28/2026. Receive qualifying direct deposits within first 60 days. Total amount must be at least $5,000 for Virtual Wallet with Performance Select or $500 for Virtual Wallet. Reward credited 60-90 days after conditions met as CREDITS CHECK REWARD.`,
    regions:`Regions LifeGreen checking offer. Offer only applies to personal LifeGreen checking accounts. Offer expires January 1, 2027. Register before you open your checking account. Qualifying ACH direct deposits do not include Zelle, credits or transfers. Qualifying ACH direct deposits may be combined to exceed $1,000 and must post to new account within 90 days. Minimum opening deposit is $50. LifeGreen Checking monthly fee is $8 with online statements or $11 with paper statements.`,
    equity:`Equity Bank Bloom Bonus Offer available April 1, 2026 to June 30, 2026. Open and fund both a new checking and savings account within 45 days of each other. Receive a minimum of $1000 in combined qualifying direct deposits into the new checking account within 45 days of account opening. Activate and use Equity Bank debit card within 45 days. Enter Promotional Code Bloom. New Equity Bank households only.`,
    busey:`Busey Bank offer for Foundation Checking or Pillar Banking. Use promo code LEVELUP1 for Foundation Checking or LEVELUP2 for Pillar Banking. Offer valid for accounts opened by May 1, 2026. Within ninety 90 days enroll in online banking, activate and use your Busey Debit Mastercard for at least three transactions, and receive qualifying direct deposits. Total Qualifying Direct Deposits $2,000 - $2,999.99 bonus $200, $3,000 - $4,999.99 bonus $300, $5,000 or more bonus $500. Payout within 130 days.`
  };

  const TESTS=[
    {id:'BMO', sample:SAMPLES.bmo, expect:r=>[
      [r.bank==='BMO','bank = BMO'],
      [r.tiered&&r.tiers?.length===3,'3 tiers detected'],
      [r.bonus===1000,'top bonus $1,000'],
      [r.reqMoney===50000,'top tier requirement $50,000'],
      [r.fundedDays===30,'Day 30 balance check'],
      [r.holdDays===90,'Day 31–90 hold'],
      [/104/.test(r.payout||''),'Day 104 payout estimate']
    ]},
    {id:'Chase Business', sample:SAMPLES.chase, expect:r=>[
      [r.bank==='Chase','bank = Chase'],
      [r.tiered&&r.tiers?.length>=2,'$300/$500 tiers'],
      [r.fundedDays===30,'30-day funding'],
      [r.holdDays===60,'60-day hold'],
      [r.count===5,'5 transactions'],
      [(r.counts||[]).some(x=>/wires/i.test(x)),'wires count correctly']
    ]},
    {id:'Wells Fargo Business', sample:SAMPLES.wells, expect:r=>[
      [r.bank==='Wells Fargo','bank = Wells Fargo'],
      [r.bonus===400,'bonus $400'],
      [r.fundingAmount===2500,'funding $2,500'],
      [r.fundedDays===30,'30-day funding'],
      [r.holdDays===60,'60-day hold'],
      [/30 days/.test(r.payout||''),'30-day payout after qualification']
    ]},
    {id:'Capital One Business', sample:SAMPLES.capitalone, expect:r=>[
      [r.bank==='Capital One','bank = Capital One'],
      [r.bonus===500,'bonus $500'],
      [r.code==='SBOFFER500','promo SBOFFER500'],
      [r.fundingAmount===5000,'funding $5,000'],
      [r.count===10,'10 transactions'],
      [/60.?90/.test(r.payout||''),'60–90 day payout']
    ]},
    {id:'BofA Business', sample:SAMPLES.boaBusiness, expect:r=>[
      [r.bank==='Bank of America','bank = Bank of America'],
      [r.acct==='Bank of America Business Advantage Banking','business profile used'],
      [r.tiered&&r.tiers?.length===2,'$400/$750 tiers'],
      [r.bonus===750,'top bonus $750'],
      [r.fundedDays===30,'30-day deposit period'],
      [r.holdDays===90,'day 31–90 maintenance']
    ]},
    {id:'PNC', sample:SAMPLES.pnc, expect:r=>[
      [r.bank==='PNC','bank = PNC'],
      [r.tiered&&r.tiers?.length===2,'$100/$400 tiers'],
      [r.bonus===400,'top reward $400'],
      [r.reqDays===60,'60-day DD deadline'],
      [/CREDITS CHECK REWARD/i.test(r.payout||''),'CREDITS CHECK REWARD payout label']
    ]},
    {id:'Regions', sample:SAMPLES.regions, expect:r=>[
      [r.bank==='Regions Bank','bank = Regions Bank'],
      [r.reqMoney===1000,'$1,000 ACH DD requirement'],
      [r.reqDays===90,'90-day ACH DD deadline'],
      [r.bonus===0,'missing bonus flagged instead of guessed'],
      [(r.reviewFlags||[]).some(x=>/Bonus amount not shown/i.test(x)),'bonus review flag']
    ]},
    {id:'Equity Bank', sample:SAMPLES.equity, expect:r=>[
      [r.bank==='Equity Bank','bank = Equity Bank'],
      [r.code==='Bloom','promo Bloom'],
      [r.reqMoney===1000,'$1,000 DD requirement'],
      [r.reqDays===45,'45-day requirement window'],
      [r.comboAccountRequirement===true,'checking+savings combo'],
      [r.debitCardRequirement===true,'debit card requirement']
    ]},
    {id:'Busey Bank', sample:SAMPLES.busey, expect:r=>[
      [r.bank==='Busey Bank','bank = Busey Bank'],
      [r.tiered&&r.tiers?.length===3,'$200/$300/$500 tiers'],
      [r.bonus===500,'top bonus $500'],
      [r.reqDays===90,'90-day requirement window'],
      [r.count===3,'3 debit card transactions'],
      [/LEVELUP1/.test(r.code||'')&&/LEVELUP2/.test(r.code||''),'both promo codes captured']
    ]}
  ];

  function runSelfTest(){
    const analyze=window.tcV3Analyze;
    if(typeof analyze!=='function')return {ok:false,error:'Analyzer engine is not loaded yet.',version:VER,tests:[]};
    const tests=TESTS.map(t=>{
      let r=null,checks=[],pass=false,error='';
      try{
        r=analyze(t.sample,{noGlobalFallback:true});
        checks=t.expect(r).map(([ok,label])=>({ok:!!ok,label}));
        pass=checks.every(c=>c.ok);
      }catch(e){error=e?.message||String(e);}
      return {id:t.id,pass,error,checks,result:r?{bank:r.bank,acct:r.acct,bonus:r.bonus,reqMoney:r.reqMoney,reqDays:r.reqDays,fundedDays:r.fundedDays,holdDays:r.holdDays,count:r.count,profile:r.profileRegistry?.id||'',rules:r.bankRulesApplied||[]}:null};
    });
    const passed=tests.filter(t=>t.pass).length;
    const failed=tests.length-passed;
    return {ok:failed===0,version:VER,ranAt:new Date().toISOString(),passed,failed,total:tests.length,tests};
  }

  function reportText(res){
    res=res||runSelfTest();
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

  function profileStats(){
    const list=typeof window.tcV3KnownProfiles==='function'?window.tcV3KnownProfiles():[];
    return {
      total:list.length,
      saved:list.filter(p=>p.status==='saved').length,
      generic:list.filter(p=>p.status==='generic-covered').length,
      list
    };
  }

  function renderProfiles(){
    const s=profileStats();
    return `<div class="v31-summary"><b>${s.total}</b> profiles · <b>${s.saved}</b> saved · <b>${s.generic}</b> generic-covered</div>`+
      s.list.map(p=>`<div class="v31-profile-card">
        <div class="v31-row"><b>${esc(p.bank)}</b><span class="v31-pill ${p.status==='saved'?'ok':'warn'}">${esc(p.status)}</span></div>
        <div class="v31-product">${esc(p.product||'')}</div>
        <div class="v31-small">${esc(p.requirements||'')}</div>
        <div class="v31-note">${esc(p.note||'')}</div>
      </div>`).join('');
  }

  function renderTestResults(res){
    if(!res)return '<div class="v31-empty">Tap Run Analyzer Self-Test.</div>';
    return `<div class="v31-test-head ${res.ok?'pass':'fail'}">${res.ok?'PASS':'NEEDS FIX'} · ${res.passed}/${res.total} passed</div>`+
      res.tests.map(t=>`<div class="v31-test ${t.pass?'pass':'fail'}">
        <div class="v31-row"><b>${t.pass?'✅':'❌'} ${esc(t.id)}</b><span>${t.pass?'Pass':'Fail'}</span></div>
        ${(t.checks||[]).map(c=>`<div class="v31-check ${c.ok?'ok':'bad'}">${c.ok?'✓':'✗'} ${esc(c.label)}</div>`).join('')}
        ${t.error?`<div class="v31-check bad">${esc(t.error)}</div>`:''}
      </div>`).join('');
  }

  function openLibrary(){
    document.getElementById('v31_overlay')?.remove();
    const d=document.createElement('div');
    d.id='v31_overlay';
    d.innerHTML=`<div class="v31-bg" onclick="tcV31CloseProfileLibrary()">
      <div class="v31-box" onclick="event.stopPropagation()">
        <div class="v31-row v31-title"><div><h3>Saved Bank Profiles</h3><div class="v31-sub">Profile Library + Analyzer Self-Test · v${VER}</div></div><button class="v31-x" onclick="tcV31CloseProfileLibrary()">×</button></div>
        <div class="v31-actions"><button onclick="tcV31ShowProfiles()">Profiles</button><button onclick="tcV31RunAndShowSelfTest()">Run Analyzer Self-Test</button><button onclick="tcV31CopySelfTestReport()">Copy Report</button></div>
        <div id="v31_content">${renderProfiles()}</div>
      </div>
    </div>`;
    document.body.appendChild(d);
  }
  function showProfiles(){const el=document.getElementById('v31_content');if(el)el.innerHTML=renderProfiles();}
  function runAndShow(){const res=runSelfTest();window.__tcV31LastSelfTest=res;const el=document.getElementById('v31_content');if(el)el.innerHTML=renderTestResults(res);return res;}
  function copyReport(){const txt=reportText(window.__tcV31LastSelfTest||runSelfTest());navigator.clipboard?.writeText(txt).then(()=>alert('Analyzer self-test report copied.')).catch(()=>alert(txt));}

  function addButton(){
    if(document.getElementById('v31_profile_btn'))return;
    const b=document.createElement('button');
    b.id='v31_profile_btn';
    b.type='button';
    b.textContent='Profiles';
    b.onclick=openLibrary;
    document.body.appendChild(b);
  }

  function addStyle(){
    if(document.getElementById('v31_style'))return;
    const st=document.createElement('style');st.id='v31_style';
    st.textContent=`
      #v31_profile_btn{position:fixed;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);z-index:140;border:1px solid rgba(255,255,255,.16);background:rgba(15,23,42,.78);color:white;border-radius:999px;padding:9px 12px;font:800 11px 'DM Sans',system-ui;letter-spacing:.2px;box-shadow:0 10px 30px rgba(0,0,0,.28);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
      .v31-bg{position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:9999;padding:calc(env(safe-area-inset-top,0px) + 14px) 12px calc(env(safe-area-inset-bottom,0px) + 14px);overflow:auto}.v31-box{max-width:620px;margin:0 auto;background:#f8fafc;color:#0f172a;border-radius:24px;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.42);font-family:'DM Sans',system-ui}.v31-row{display:flex;align-items:center;justify-content:space-between;gap:10px}.v31-title h3{margin:0;font-size:20px}.v31-sub{font-size:12px;color:#64748b;margin-top:2px}.v31-x{border:0;background:#e2e8f0;border-radius:999px;width:34px;height:34px;font-size:22px;font-weight:900;color:#334155}.v31-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:14px 0}.v31-actions button{border:0;border-radius:14px;background:#0f172a;color:white;padding:11px 9px;font-weight:900;font-size:11px}.v31-summary{padding:10px 12px;border-radius:16px;background:#e0f2fe;border:1px solid #bae6fd;margin-bottom:10px;font-size:13px}.v31-profile-card,.v31-test{background:white;border:1px solid #e2e8f0;border-radius:18px;padding:12px;margin:10px 0}.v31-pill{font-size:10px;padding:4px 8px;border-radius:999px;font-weight:900}.v31-pill.ok{background:#dcfce7;color:#166534}.v31-pill.warn{background:#fef3c7;color:#92400e}.v31-product{font-size:13px;color:#334155;margin-top:4px;font-weight:800}.v31-small{font-size:12px;color:#475569;margin-top:7px;line-height:1.35}.v31-note{font-size:11px;color:#64748b;margin-top:7px;line-height:1.35}.v31-test-head{padding:11px 12px;border-radius:16px;margin-bottom:10px;font-weight:900}.v31-test-head.pass{background:#dcfce7;color:#166534}.v31-test-head.fail{background:#fee2e2;color:#991b1b}.v31-test.pass{border-color:#bbf7d0}.v31-test.fail{border-color:#fecaca}.v31-check{font-size:12px;line-height:1.35;margin-top:5px}.v31-check.ok{color:#166534}.v31-check.bad{color:#991b1b}.v31-empty{padding:18px;color:#64748b;text-align:center}@media(max-width:430px){.v31-actions{grid-template-columns:1fr}.v31-box{border-radius:20px;padding:14px}#v31_profile_btn{bottom:calc(env(safe-area-inset-bottom,0px) + 10px);right:10px}}
    `;
    document.head.appendChild(st);
  }

  window.tcV31RunAnalyzerSelfTest=runSelfTest;
  window.tcV31SelfTestReport=reportText;
  window.tcV31OpenProfileLibrary=openLibrary;
  window.tcV31CloseProfileLibrary=()=>document.getElementById('v31_overlay')?.remove();
  window.tcV31ShowProfiles=showProfiles;
  window.tcV31RunAndShowSelfTest=runAndShow;
  window.tcV31CopySelfTestReport=copyReport;
  window.tcV31ProfileStats=profileStats;
  window.tcV31ProfileLibraryVersion=VER;

  setTimeout(()=>{addStyle();addButton();},600);
  setTimeout(()=>{addStyle();addButton();},1800);
})();