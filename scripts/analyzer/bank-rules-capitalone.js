/*
 * filename: scripts/analyzer/bank-rules-capitalone.js
 * version: 3.0.6
 * purpose: Capital One Business Checking saved profile.
 * last-touched: unknown
 */
(function(){
  const VER='3.0.6';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean).map(clean))).filter(Boolean);

  function applyCapitalOneBusiness(r){
    const raw=String(r?.normalizedRaw||r?.raw||'');
    if(!/Capital One/i.test(raw))return r;
    if(!/SBOFFER500|Basic or Enhanced checking|Basic Checking|Enhanced Checking|business checking/i.test(raw))return r;

    r.bank='Capital One';
    r.acct='Capital One Basic or Enhanced Business Checking';
    r.bonus=r.selectedBonus=500;
    r.tiered=false;
    r.tiers=[];
    r.targetTier=null;
    r.bonusTierText='';

    r.code='SBOFFER500';
    r.promoCode={value:'SBOFFER500',confidence:'High',source:'Promo code MUST be used when completing the online application.'};

    r.reqMoney=5000;
    r.reqIsTotal=true;
    r.reqDays=90;
    r.fundedDays=30;
    r.fundingAmount=5000;
    r.holdDays=90;
    r.depositHoldRequirement=true;
    r.count=10;
    r.transactionRequirement=true;

    r.fee=15;
    r.monthlyFee={value:'Basic $15 monthly service fee / Enhanced $35 monthly service fee',amount:15,source:'Capital One Basic/Enhanced Checking fee disclosure',confidence:'High'};
    r.waivers=uniq([
      'Basic Checking: $15 monthly service fee waived with $2,000 minimum balance',
      'Enhanced Checking: $35 monthly service fee waived with $25,000 minimum balance'
    ]);

    r.counts=uniq([
      'Deposit at least $5,000 from an external source within 30 days of opening',
      'Cash deposits qualify',
      'Funds from another financial institution not affiliated with Capital One prior to Jan 1, 2025 qualify',
      'Maintain a minimum end-of-day balance of $5,000 for at least 60 days within 90 days of opening',
      'Make 10 qualifying electronic transactions within 90 days',
      'Qualifying transactions: electronic wire credits/debits, electronic remote check deposit, electronic ACH credits/debits, and qualifying instant transfers from outside entities'
    ]);

    r.not=r.notCounts=uniq([
      'Transfers between Capital One accounts do not qualify',
      'Accounts not opened online are not eligible',
      'Applicants who are users on Capital One Business checking accounts open on or after Jan 1, 2025 are ineligible',
      'Only one account per business is eligible for the bonus',
      'Account in default, closed, suspended, or not in good standing before payout will not receive the bonus'
    ]);

    r.early='Keep the account open and in good standing until payout. If the account is default, closed, suspended, or not in good standing before payout, bonus will not be paid.';
    r.payout=r.payoutText='within 60–90 days of meeting all offer requirements';
    r.eligibilityText=uniq([
      'Online account opening only.',
      'Promo code SBOFFER500 must be used during the online application.',
      'Applicants who are users on Capital One Business checking accounts open on or after Jan 1, 2025 are ineligible.',
      'Only one account per business is eligible for the bonus offer.',
      'Bonus may be reported on IRS Form 1099-INT.'
    ]).join('\n');

    r.suggestedTimers=[];
    r.suggestedTimers.push(
      {kind:'days',text:'External $5,000 funding deadline',daysRequired:30},
      {kind:'days',text:'10 qualifying transactions deadline',daysRequired:90},
      {kind:'days',text:'Balance hold / qualification check',daysRequired:90},
      {kind:'days',text:'Earliest payout follow-up',daysRequired:150},
      {kind:'days',text:'Final payout follow-up',daysRequired:180}
    );

    r.forceActionPlan=true;
    r.actionPlan=[
      '1. Open a new Capital One Basic or Enhanced Business Checking account online using promo code SBOFFER500.',
      '2. Deposit at least $5,000 from an external source within 30 days of opening.',
      '3. Maintain a minimum end-of-day balance of $5,000 for at least 60 days within 90 days of opening.',
      '4. Complete 10 qualifying electronic transactions within 90 days of opening.',
      '5. Keep the account open and in good standing until payout; bonus should post within 60–90 days after all requirements are met.'
    ].join('\n');

    r.clear=!!(r.bonus&&r.code&&r.fundedDays&&r.reqDays&&r.count);
    r.bankRulesApplied=uniq((r.bankRulesApplied||[]).concat('Capital One Business Checking'));
    r.capitalOneRulesVersion=VER;
    return r;
  }

  function wrap(){
    if(window.__tcV3CapitalOneRulesWrapped)return;
    if(typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){ return applyCapitalOneBusiness(base(raw,opts)); };
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV3CapitalOneRulesWrapped=true;
  }

  window.tcV3ApplyCapitalOneBusinessRule=applyCapitalOneBusiness;
  window.tcV3CapitalOneRulesVersion=VER;
  setTimeout(wrap,80);setTimeout(wrap,500);setTimeout(wrap,1400);
})();