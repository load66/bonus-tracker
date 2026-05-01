/* ✅ Version 3.0.1 Newest update: Analyzer v3 bank-specific rules for Chase Business and BofA chart offers. */
(function(){
  const VER='3.0.1';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const money=n=>'$'+Number(n||0).toLocaleString();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean).map(clean))).filter(Boolean);
  const mo={jan:'01',january:'01',feb:'02',february:'02',mar:'03',march:'03',apr:'04',april:'04',may:'05',jun:'06',june:'06',jul:'07',july:'07',aug:'08',august:'08',sep:'09',sept:'09',september:'09',oct:'10',october:'10',nov:'11',november:'11',dec:'12',december:'12'};
  function isoDate(raw){
    let m=String(raw||'').match(/Offer valid\s+\d{1,2}[\/\-]\d{1,2}[\/\-]20\d{2}\s*[-–—]\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/i);
    if(m)return `${m[3]}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
    m=String(raw||'').match(/(?:Offer expires on|open.*?by|through and including)\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(20\d{2})/i);
    if(m)return `${m[3]}-${mo[m[1].toLowerCase()]}-${String(m[2]).padStart(2,'0')}`;
    return '';
  }
  function setTiers(r,tiers,label){
    tiers=(tiers||[]).filter(t=>t&&t.bonus&&t.requirement).sort((a,b)=>a.requirement-b.requirement);
    if(!tiers.length)return r;
    r.tiers=tiers;
    r.tiered=true;
    r.targetTier=tiers[tiers.length-1];
    r.bonus=r.selectedBonus=r.targetTier.bonus;
    r.reqMoney=r.targetTier.requirement;
    r.reqIsTotal=true;
    r.bonusTierText=tiers.map(t=>`${money(t.bonus)} for ${money(t.requirement)}+`).join(' / ');
    r.bankRulesApplied=uniq((r.bankRulesApplied||[]).concat(label));
    return r;
  }
  function applyChaseBusiness(r){
    const raw=String(r.raw||r.normalizedRaw||'');
    if(!/Chase Business Complete Checking|business checking offer|JPMorgan Chase/i.test(raw))return r;

    r.bank='Chase';
    r.acct='Chase Business Complete Checking';

    const tiers=[];
    if(/\$\s*300[\s\S]{0,60}\$\s*2,?000\s*[-–—]\s*\$\s*9,?999/i.test(raw)){
      tiers.push({bonus:300,requirement:2000,maxRequirement:9999,confidence:'High',source:'Chase table: $300 for $2,000–$9,999 new money'});
    }
    if(/\$\s*500[\s\S]{0,60}\$\s*10,?000\s*or\s*more/i.test(raw)){
      tiers.push({bonus:500,requirement:10000,maxRequirement:0,confidence:'High',source:'Chase table: $500 for $10,000+ new money'});
    }
    setTiers(r,tiers,'Chase Business Checking');

    const exp=isoDate(raw);
    if(exp){ r.openBy=exp; r.expiration={value:exp,display:exp,confidence:'High',source:'Chase offer end date'}; }

    if(/Deposit a total of \$\s*2,?000 or more[\s\S]{0,100}within 30 days/i.test(raw)){
      r.fundedDays=30;
      r.fundingAmount=2000;
    }
    if(/Maintain the new money[\s\S]{0,180}at least 60 days/i.test(raw)){
      r.holdDays=60;
      r.early='Maintain the qualifying new money for at least 60 days; dropping below threshold can change or disqualify the offer.';
    }
    if(/Complete\s+5\s+qualifying transactions\s+within\s+90\s+days/i.test(raw)){
      r.count=5;
      r.reqDays=90;
      r.transactionRequirement=true;
    }

    r.fee=15;
    r.monthlyFee={value:'$15 Monthly Service Fee',amount:15,source:'Chase Business Complete Checking monthly service fee',confidence:'High'};
    r.waivers=uniq([
      'Linked qualifying Chase personal/private client checking account',
      'Chase Military Banking requirements',
      '$2,000 minimum daily ending balance OR Chase Payment Solutions deposits OR eligible card purchases'
    ]);

    r.counts=uniq([
      'New money deposit into the new Chase business checking account',
      'Debit card purchases',
      'Chase QuickDeposit',
      'ACH credits',
      'Wires credits and debits',
      'Chase Online Bill Pay',
      'Chase QuickAccept'
    ]);
    r.not=uniq([
      'ACH debits',
      'Person-to-person payments / P2P transfers including Zelle',
      'Online transfers to Chase credit cards'
    ]);
    r.notCounts=r.not;

    r.payout='within 15 days after all checking requirements are completed';
    r.payoutText=r.payout;
    r.eligibilityText=uniq([
      'Not available to existing businesses with Chase business checking accounts.',
      'Not eligible if account closed within 90 days or closed with a negative balance within the last 3 years.',
      'Signers can receive only one business checking offer every two years from last offer enrollment date.',
      'Only one offer per account.',
      'Employees of JPMorgan Chase Bank and affiliates are not eligible.',
      'Offer may be reported on IRS Form 1099-INT or Form 1042-S.'
    ]).join('\n');

    r.suggestedTimers=[];
    if(r.openBy)r.suggestedTimers.push({kind:'due',text:'Promo expiration / open-by deadline',date:r.openBy});
    r.suggestedTimers.push({kind:'days',text:'New money funding deadline',daysRequired:30});
    r.suggestedTimers.push({kind:'days',text:'New money hold deadline',daysRequired:60});
    r.suggestedTimers.push({kind:'days',text:'5 qualifying transactions deadline',daysRequired:90});

    r.actionPlan=[
      `1. Open a new Chase Business Complete Checking account${r.openBy?' by '+r.openBy:''}.`,
      `2. Deposit new money within 30 days: ${r.tiered?r.bonusTierText:'review target tier'}.`,
      '3. Maintain the qualifying new money for at least 60 days from offer enrollment.',
      '4. Complete 5 qualifying transactions within 90 days of offer enrollment.',
      '5. Keep the account open and unrestricted until payout.'
    ].join('\n');
    r.clear=!!(r.bonus&&r.reqDays&&r.fundedDays&&r.holdDays);
    return r;
  }
  function applyBOA(r){
    const raw=String(r.raw||r.normalizedRaw||'');
    if(!/Bank of America|BofA|Advantage SafeBalance|Advantage Plus|Advantage Relationship/i.test(raw))return r;
    const tiers=[];
    if(/\$\s*2,?000\s*[-–—]\s*\$\s*4,?999[\s\S]{0,50}\$\s*100/i.test(raw))tiers.push({bonus:100,requirement:2000,maxRequirement:4999,confidence:'High',source:'BofA chart: $2,000–$4,999 = $100'});
    if(/\$\s*5,?000\s*[-–—]\s*\$\s*9,?999[\s\S]{0,50}\$\s*300/i.test(raw))tiers.push({bonus:300,requirement:5000,maxRequirement:9999,confidence:'High',source:'BofA chart: $5,000–$9,999 = $300'});
    if(/\$\s*10,?000\s*or\s*more[\s\S]{0,50}\$\s*500/i.test(raw))tiers.push({bonus:500,requirement:10000,maxRequirement:0,confidence:'High',source:'BofA chart: $10,000+ = $500'});
    if(tiers.length){
      r.bank='Bank of America';
      r.acct='Bank of America eligible personal checking';
      setTiers(r,tiers,'Bank of America Bonus Chart');
      r.reqDays=90;
      const exp=isoDate(raw); if(exp){r.openBy=exp;r.expiration={value:exp,display:exp,confidence:'High',source:'BofA offer expiration/open-by date'};}
      r.payout='within 60 days after the 90-day Deposit Period ends and requirements are satisfied';
      r.payoutText=r.payout;
    }
    return r;
  }
  function applyRules(r){
    if(!r)return r;
    r=applyChaseBusiness(r);
    r=applyBOA(r);
    r.bankRulesVersion=VER;
    return r;
  }
  function wrap(){
    if(window.__tcV3BankRulesWrapped)return;
    if(typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){return applyRules(base(raw,opts));};
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV3BankRulesWrapped=true;
  }
  window.tcV3ApplyBankRules=applyRules;
  window.tcV3BankRulesVersion=VER;
  setTimeout(wrap,50);setTimeout(wrap,400);setTimeout(wrap,1200);
})();
