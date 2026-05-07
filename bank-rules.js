/*
 * filename: bank-rules.js
 * version: 3.3.57
 * purpose: Analyzer v3 bank rules. Hardened Chase Business gate (no JPMorgan legal-entity false positives) + personal-product anti-signals.
 * last-touched: 2026-05-02
 */
(function(){
  const VER='3.3.57';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const money=n=>'$'+Number(n||0).toLocaleString();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean).map(clean))).filter(Boolean);
  const mo={jan:'01',january:'01',feb:'02',february:'02',mar:'03',march:'03',apr:'04',april:'04',may:'05',jun:'06',june:'06',jul:'07',july:'07',aug:'08',august:'08',sep:'09',sept:'09',september:'09',oct:'10',october:'10',nov:'11',november:'11',dec:'12',december:'12'};
  function isoDate(raw){
    let m=String(raw||'').match(/Offer valid\s+\d{1,2}[\/\-]\d{1,2}[\/\-]20\d{2}\s*[-–—]\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/i);
    if(m)return `${m[3]}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
    m=String(raw||'').match(/(?:Offer expires on|offer expires|open.*?by|through and including|between\s+\w+\s+\d{1,2},\s+20\d{2}\s+and)\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(20\d{2})/i);
    if(m)return `${m[3]}-${mo[m[1].toLowerCase()]}-${String(m[2]).padStart(2,'0')}`;
    return '';
  }
  function pushRule(r,label){r.bankRulesApplied=uniq((r.bankRulesApplied||[]).concat(label));return r;}
  function setTiers(r,tiers,label,opts={}){
    tiers=(tiers||[]).filter(t=>t&&t.bonus&&t.requirement).sort((a,b)=>a.requirement-b.requirement);
    if(!tiers.length)return r;
    r.tiers=tiers;r.tiered=true;r.targetTier=tiers[tiers.length-1];
    r.bonus=r.selectedBonus=r.targetTier.bonus;
    if(!opts.fundingTiers){r.reqMoney=r.targetTier.requirement;r.reqIsTotal=true;}
    r.bonusTierText=tiers.map(t=>`${money(t.bonus)} for ${money(t.requirement)}+${opts.fundingTiers?' new money':''}`).join(' / ');
    return pushRule(r,label);
  }
  function applyChaseBusiness(r){
    const raw=String(r.normalizedRaw||r.raw||'');
    if(!/Chase Business Complete Checking|business checking offer/i.test(raw))return r;
    /* anti-signal: the document is clearly a personal-product T&C — refuse to fire. */
    if(/Chase Total Checking|Chase SavingsSM|Chase First CheckingSM/i.test(raw))return r;
    r.bank='Chase';r.acct='Chase Business Complete Checking';
    const tiers=[];
    // Current flyer wording: Earn $500/$750/$1,500 with minimum $2,000/$20,000/$100,000 deposited in new money.
    let m;const tierRe=/earn\s*\$\s*([0-9,]+)\s+with\s+(?:a\s+)?minimum\s+\$\s*([0-9,]+)\s+deposit(?:\s+in\s+new\s+money)?/gi;
    while((m=tierRe.exec(raw)))tiers.push({bonus:parseInt(m[1].replace(/,/g,''),10),requirement:parseInt(m[2].replace(/,/g,''),10),maxRequirement:0,confidence:'High',source:clean(m[0])});
    // Legacy Chase business wording is still supported, but only when the current flyer wording is absent.
    if(!tiers.length&&/\$\s*300[\s\S]{0,60}\$\s*2,?000\s*[-–—]\s*\$\s*9,?999/i.test(raw))tiers.push({bonus:300,requirement:2000,maxRequirement:9999,confidence:'High',source:'Chase table: $300 for $2,000–$9,999 new money'});
    if(!tiers.length&&/\$\s*500[\s\S]{0,60}\$\s*10,?000\s*or\s*more/i.test(raw))tiers.push({bonus:500,requirement:10000,maxRequirement:0,confidence:'High',source:'Chase table: $500 for $10,000+ new money'});
    setTiers(r,tiers,'Chase Business Checking',{fundingTiers:true});
    const exp=isoDate(raw); if(exp){r.openBy=exp;r.expiration={value:exp,display:exp,confidence:'High',source:'Chase offer end date'};}
    if(/deposit[\s\S]{0,120}within 30 days/i.test(raw)){r.fundedDays=30;r.fundingAmount=r.targetTier?.requirement||r.fundingAmount||0;}
    if(/maintain[\s\S]{0,180}(?:60 days|for 60 days|at least 60 days)/i.test(raw)){r.holdDays=60;r.minHoldDays=60;r.early='Maintain the qualifying new money for at least 60 days; dropping below threshold can change or disqualify the offer.';}
    if(/Complete\s+(?:5|five)\s+qualifying transactions\s+within\s+90\s+days/i.test(raw)){r.count=5;r.reqDays=90;r.reqMoney=0;r.reqIsTotal=false;r.requirementType='transactions';r.requirementNoun='qualifying transactions';r.transactionRequirement=true;}
    r.fee=15;r.monthlyFee={value:'$15 Monthly Service Fee',amount:15,source:'Chase Business Complete Checking monthly service fee',confidence:'High'};
    r.waivers=uniq(['Linked qualifying Chase personal/private client checking account','Chase Military Banking requirements','$2,000 minimum daily ending balance OR Chase Payment Solutions deposits OR eligible card purchases']);
    r.counts=uniq(['New money deposit into the new Chase business checking account','Debit card purchases','Chase QuickDeposit','ACH credits','Wires credits and debits','Chase Online Bill Pay','Chase QuickAccept']);
    r.not=r.notCounts=uniq(['ACH debits','Person-to-person payments / P2P transfers including Zelle','Online transfers to Chase credit cards']);
    r.payout=r.payoutText='within 15 days after all checking requirements are completed';
    r.eligibilityText=uniq(['Not available to existing businesses with Chase business checking accounts.','Not eligible if account closed within 90 days or closed with a negative balance within the last 3 years.','Signers can receive only one business checking offer every two years from last offer enrollment date.','Only one offer per account.','Employees of JPMorgan Chase Bank and affiliates are not eligible.','Offer may be reported on IRS Form 1099-INT or Form 1042-S.']).join('\n');
    r.suggestedTimers=[];if(r.openBy)r.suggestedTimers.push({kind:'due',text:'Promo expiration / open-by deadline',date:r.openBy});r.suggestedTimers.push({kind:'days',text:'New money funding deadline',daysRequired:30},{kind:'days',text:'New money hold deadline',daysRequired:60},{kind:'days',text:'5 qualifying transactions deadline',daysRequired:90});
    r.forceActionPlan=true;
    r.actionPlan=[`1. Open a new Chase Business Complete Checking account${r.openBy?' by '+r.openBy:''}.`,`2. Deposit new money within 30 days: ${r.tiered?r.bonusTierText:'review target tier'}.`,'3. Maintain the qualifying new money for at least 60 days from offer enrollment.','4. Complete 5 qualifying transactions within 90 days of offer enrollment.','5. Keep the account open and unrestricted until payout.'].join('\n');
    r.clear=!!(r.bonus&&r.reqDays&&r.fundedDays&&r.holdDays);return pushRule(r,'Chase Business Checking');
  }
  function applyWellsBusiness(r){
    const raw=String(r.normalizedRaw||r.raw||'');
    if(!/Wells Fargo/i.test(raw)||!/business checking|Initiate Business Checking|Navigate Business Checking|Optimize Business Checking/i.test(raw))return r;
    r.bank='Wells Fargo';r.acct='Wells Fargo eligible business checking';r.bonus=r.selectedBonus=400;r.tiered=false;r.tiers=[];r.targetTier=null;r.bonusTierText='';
    r.code=r.code||'Required — use bonus offer code at account opening';r.promoCode={value:r.code,confidence:'Review',source:'Bonus offer code must be used at account opening.'};
    const exp=isoDate(raw); if(exp){r.openBy=exp;r.expiration={value:exp,display:exp,confidence:'High',source:'Wells Fargo offer expires/open-by date'};}
    r.reqMoney=2500;r.reqIsTotal=true;r.reqDays=60;r.fundedDays=30;r.fundingAmount=2500;r.holdDays=60;r.depositHoldRequirement=true;r.count=0;
    r.fee=15;r.monthlyFee={value:'$15 Monthly Service Fee',amount:15,source:'Initiate Business Checking monthly service fee',confidence:'High'};
    r.waivers=uniq(['$2,000 minimum daily balance','$5,000 combined business deposit balance','Own qualifying Premier Checking / Private Bank Checking relationship']);
    r.counts=uniq(['Deposit $2,500 or more to eligible Wells Fargo business checking by day 30','Maintain a minimum daily collected balance of $2,500 through day 60 after opening','Eligible accounts: Initiate Business Checking, Navigate Business Checking, or Optimize Business Checking']);
    r.not=r.notCounts=uniq(['Existing Wells Fargo business checking account owners are not eligible','Business checking closed in past 90 days is not eligible','Business owned in whole or in part by a Wells Fargo employee is not eligible','Cannot combine with other business deposit offers']);
    r.early='Keep account open through the 60-day qualification period and until payout; zero-balance accounts may be closed without prior notice.';
    r.payout=r.payoutText='within 30 days after the 60-day qualification period ends, if requirements are met';
    r.eligibilityText=uniq(['New business checking customers only.','Limit one business checking bonus per business entity or business owner within the last 12 months.','Bonus offer code must be used at account opening.','Current Wells Fargo business checking owners or accounts closed in the past 90 days are not eligible.','Wells Fargo employees/owned businesses are not eligible.','Non-resident aliens signing Form W-8 are not eligible.','Bonus may be taxable and reported to tax authorities.']).join('\n');
    r.suggestedTimers=[];if(r.openBy)r.suggestedTimers.push({kind:'due',text:'Promo expiration / open-by deadline',date:r.openBy});r.suggestedTimers.push({kind:'days',text:'Deposit $2,500 funding deadline',daysRequired:30},{kind:'days',text:'Maintain $2,500 hold deadline',daysRequired:60},{kind:'days',text:'Expected bonus payout check',daysRequired:90});
    r.forceActionPlan=true;
    r.actionPlan=[`1. Open an eligible Wells Fargo business checking account${r.openBy?' by '+r.openBy:''} using the bonus offer code.`,'2. Deposit $2,500 or more by day 30 from account opening.','3. Maintain a minimum daily collected balance of $2,500 through day 60 after opening.','4. After the 60-day qualification period, bonus should be deposited within 30 days if qualified.','5. Keep the account open and in good standing until payout.'].join('\n');
    r.clear=!!(r.bonus&&r.openBy&&r.fundedDays&&r.holdDays);return pushRule(r,'Wells Fargo Business Checking');
  }
  function applyBmoBusiness(r){
    const raw=String(r.normalizedRaw||r.raw||'');
    if(!/\bBMO\b/i.test(raw)||!/Business Checking|Digital Business Checking|Simple Business Checking|Premium Business Checking|Elite Business Checking/i.test(raw))return r;
    r.bank='BMO';
    r.acct='BMO eligible business checking';
    const tiers=[
      {bonus:400,requirement:4000,maxRequirement:24999,confidence:'High',source:'BMO Tier 1: $400 bonus; $4,000+ balance on Day 30 and Day 31–90 hold'},
      {bonus:750,requirement:25000,maxRequirement:49999,confidence:'High',source:'BMO Tier 2: $750 bonus; $25,000+ balance on Day 30 and Day 31–90 hold'},
      {bonus:1000,requirement:50000,maxRequirement:0,confidence:'High',source:'BMO Tier 3: $1,000 bonus; $50,000+ balance on Day 30 and Day 31–90 hold'}
    ];
    setTiers(r,tiers,'BMO Business Checking');
    const exp=isoDate(raw)||'2026-04-30';
    r.openBy=exp;r.expiration={value:exp,display:exp,confidence:'High',source:'BMO offer end date / open account by April 30, 2026'};
    r.reqMoney=r.targetTier?.requirement||50000;r.reqIsTotal=true;r.reqDays=90;r.fundedDays=30;r.fundingAmount=r.reqMoney;r.holdDays=90;r.depositHoldRequirement=true;r.count=0;
    r.code='Online auto-applied; branch requires promo code from BMO offer page';
    r.promoCode={value:r.code,confidence:'High',source:'BMO online auto-applies promo code; branch opening requires SEND MY PROMO CODE.'};
    r.fee=0;r.monthlyFee=null;
    r.waivers=uniq(['Monthly service fee not clearly stated in pasted T&C — review BMO account fee schedule']);
    r.counts=uniq([
      'Open BMO Digital Business Checking, Simple Business Checking, Premium Business Checking, or Elite Business Checking',
      'Balance on Day 30 determines assigned bonus tier',
      'Maintain the assigned tier minimum daily balance from Day 31 through Day 90',
      'Minimum opening deposit is $100'
    ]);
    r.not=r.notCounts=uniq([
      'Existing BMO business checking account owners are not eligible',
      'Closed BMO business checking account within the past 12 months using same TIN/EIN/SSN is not eligible',
      'Cannot combine with any other offer',
      'Only one cash bonus per business entity',
      'Opening multiple checking accounts will not earn multiple bonuses'
    ]);
    r.early='Maintain the assigned tier balance from Day 31 through Day 90. Dropping below the assigned tier can reduce the bonus to a lower tier or disqualify the bonus.';
    r.payout=r.payoutText='within 14 days of meeting the promotion requirements, approximately Day 104';
    r.eligibilityText=uniq([
      'New BMO business checking customers only.',
      'Not eligible with existing BMO business checking or closed BMO business checking within past 12 months using same TIN/EIN/SSN.',
      'Offer limited to one cash bonus per business entity.',
      'Account must be open, in good standing, and have a balance greater than zero on payment day.',
      'Cash bonus may be reported to the IRS for tax purposes.'
    ]).join('\n');
    r.suggestedTimers=[];if(r.openBy)r.suggestedTimers.push({kind:'due',text:'Promo expiration / open-by deadline',date:r.openBy});r.suggestedTimers.push({kind:'days',text:'Day 30 tier balance check',daysRequired:30},{kind:'days',text:'Day 90 balance hold complete',daysRequired:90},{kind:'days',text:'Expected bonus payout check',daysRequired:104});
    r.forceActionPlan=true;
    r.actionPlan=[`1. Open an eligible BMO business checking account by ${r.openBy}.`,`2. Use online offer page for auto-applied promo code, or get branch promo code from BMO offer page.`,'3. Meet your target tier balance on Day 30: $4,000 = $400, $25,000 = $750, or $50,000 = $1,000.','4. Maintain the assigned tier minimum daily balance from Day 31 through Day 90.','5. Keep account open, in good standing, and above $0 until payout around Day 104.'].join('\n');
    r.clear=!!(r.bonus&&r.openBy&&r.fundedDays&&r.holdDays);return pushRule(r,'BMO Business Checking');
  }
  function applyBOA(r){
    const raw=String(r.normalizedRaw||r.raw||'');
    if(!/Bank of America|BofA|Advantage SafeBalance|Advantage Plus|Advantage Relationship/i.test(raw))return r;
    const tiers=[];
    if(/\$\s*2,?000\s*[-–—]\s*\$\s*4,?999[\s\S]{0,50}\$\s*100/i.test(raw))tiers.push({bonus:100,requirement:2000,maxRequirement:4999,confidence:'High',source:'BofA chart: $2,000–$4,999 = $100'});
    if(/\$\s*5,?000\s*[-–—]\s*\$\s*9,?999[\s\S]{0,50}\$\s*300/i.test(raw))tiers.push({bonus:300,requirement:5000,maxRequirement:9999,confidence:'High',source:'BofA chart: $5,000–$9,999 = $300'});
    if(/\$\s*10,?000\s*or\s*more[\s\S]{0,50}\$\s*500/i.test(raw))tiers.push({bonus:500,requirement:10000,maxRequirement:0,confidence:'High',source:'BofA chart: $10,000+ = $500'});
    if(tiers.length){r.bank='Bank of America';r.acct='Bank of America eligible personal checking';setTiers(r,tiers,'Bank of America Bonus Chart');r.reqDays=90;const exp=isoDate(raw);if(exp){r.openBy=exp;r.expiration={value:exp,display:exp,confidence:'High',source:'BofA offer expiration/open-by date'};}r.payout=r.payoutText='within 60 days after the 90-day Deposit Period ends and requirements are satisfied';}
    return r;
  }
  function applyRules(r){if(!r)return r;r=applyChaseBusiness(r);r=applyWellsBusiness(r);r=applyBmoBusiness(r);r=applyBOA(r);r.bankRulesVersion=VER;return r;}
  function wrap(){if(window.__tcV3BankRulesWrapped)return;if(typeof window.tcV3Analyze!=='function')return;const base=window.tcV3Analyze;window.tcV3Analyze=function(raw,opts){return applyRules(base(raw,opts));};window.tcUnifiedAnalyze=window.tcV3Analyze;window.tcStrictAnalyze=window.tcV3Analyze;window.__tcV3BankRulesWrapped=true;}
  window.tcV3ApplyBankRules=applyRules;window.tcV3BankRulesVersion=VER;setTimeout(wrap,50);setTimeout(wrap,400);setTimeout(wrap,1200);
})();