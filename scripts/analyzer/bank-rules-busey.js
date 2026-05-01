/* ✅ Version 3.0.11 Newest update: Busey Bank tiered personal checking saved profile. */
(function(){
  const VER='3.0.11';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const money=n=>'$'+Number(n||0).toLocaleString();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean).map(clean))).filter(Boolean);

  function applyBuseyPersonal(r){
    const raw=String(r?.raw||r?.normalizedRaw||'');
    if(!/Busey Bank|Busey/i.test(raw))return r;
    if(!/Foundation Checking|Pillar Banking|LEVELUP1|LEVELUP2|Busey Debit Mastercard/i.test(raw))return r;

    r.bank='Busey Bank';
    r.acct='Busey Foundation Checking or Pillar Banking';
    r.tiered=true;
    r.tiers=[
      {bonus:200,requirement:2000,maxRequirement:2999.99,confidence:'High',source:'Busey chart: $2,000–$2,999.99 qualifying DD = $200'},
      {bonus:300,requirement:3000,maxRequirement:4999.99,confidence:'High',source:'Busey chart: $3,000–$4,999.99 qualifying DD = $300'},
      {bonus:500,requirement:5000,maxRequirement:0,confidence:'High',source:'Busey chart: $5,000+ qualifying DD = $500'}
    ];
    r.targetTier=r.tiers[2];
    r.bonus=r.selectedBonus=500;
    r.reqMoney=5000;
    r.reqIsTotal=true;
    r.bonusTierText='$200 for $2,000+ DD / $300 for $3,000+ DD / $500 for $5,000+ DD';

    r.openBy='2026-05-01';
    r.expiration={value:'2026-05-01',display:'May 1, 2026',confidence:'High',source:'Accounts opened by May 1, 2026.'};
    r.code='LEVELUP1 for Foundation Checking / LEVELUP2 for Pillar Banking';
    r.promoCode={value:r.code,confidence:'High',source:'Use LEVELUP1 for Foundation Checking or LEVELUP2 for Pillar Banking.'};

    r.reqDays=90;
    r.fundedDays=0;
    r.fundingAmount=100;
    r.holdDays=90;
    r.depositHoldRequirement=false;
    r.count=3;
    r.transactionRequirement=true;
    r.debitCardRequirement=true;
    r.onlineBankingRequirement=true;

    r.fee=15;
    r.monthlyFee={value:'Pillar Banking $15 monthly maintenance fee; Foundation fee not clearly stated in pasted T&C',amount:15,source:'Pillar Banking monthly maintenance fee disclosure',confidence:'High'};
    r.waivers=uniq([
      'Pillar Banking: $15 monthly maintenance fee waived with $15,000 minimum balance in Pillar Banking',
      'Pillar Banking: $15 monthly maintenance fee waived with $15,000 combined balance in eligible accounts',
      'Eligible balances include checking, savings, money market, CDs, and IRAs',
      'Foundation Checking monthly fee not clearly stated in pasted T&C — review Busey fee schedule'
    ]);

    r.counts=uniq([
      'Open a new Busey Pillar Banking or Foundation Checking account online or in-person using the correct promotional code',
      'Enroll in online banking within 90 days of account opening',
      'Activate and use Busey Debit Mastercard for at least 3 transactions within 90 days',
      'Set up and receive qualifying direct deposits into the eligible personal checking account within 90 days',
      'Qualifying direct deposit is regular monthly income such as salary, pension, or government benefits from employer, government, or other payer',
      'Minimum opening deposit is $100'
    ]);

    r.not=r.notCounts=uniq([
      'Existing Busey personal checking account customers do not qualify',
      'Busey Bank employees do not qualify',
      'Previous personal checking account closed within preceding 12 months does not qualify',
      'Anyone who received a prior personal checking account incentive at any time does not qualify',
      'Only one offer per household',
      'Teller deposits do not qualify as direct deposits',
      'ATM deposits do not qualify as direct deposits',
      'Mobile deposits do not qualify as direct deposits',
      'Wire transfers do not qualify as direct deposits',
      'Debit card transfers do not qualify as direct deposits',
      'External transfers from other Busey, other financial institutions, or brokerage accounts do not qualify',
      'Person-to-person transfers do not qualify',
      'Account-to-account transfers do not qualify'
    ]);

    r.early='New eligible personal checking account must be open for at least 90 days before receiving bonus and in good standing through bonus payment.';
    r.payout=r.payoutText='within 130 days of account opening after requirements are satisfied';
    r.eligibilityText=uniq([
      'Offer valid for accounts opened by May 1, 2026.',
      'Use LEVELUP1 for Foundation Checking or LEVELUP2 for Pillar Banking.',
      'Only one offer per household.',
      'Must have TIN or SSN at account opening.',
      'Not eligible if existing Busey personal checking customer, Busey Bank employee, prior personal checking closed within preceding 12 months, or prior personal checking incentive received at any time.',
      'Bonus may be considered income and Busey Bank may issue IRS Form 1099-MISC or other appropriate form.'
    ]).join('\n');

    r.suggestedTimers=[];
    r.suggestedTimers.push(
      {kind:'due',text:'Promo expiration / open-by deadline',date:'2026-05-01'},
      {kind:'days',text:'Online banking enrollment deadline',daysRequired:90},
      {kind:'days',text:'3 debit card transactions deadline',daysRequired:90},
      {kind:'days',text:'Qualifying direct deposit deadline',daysRequired:90},
      {kind:'days',text:'Expected bonus payout check',daysRequired:130}
    );

    r.forceActionPlan=true;
    r.actionPlan=[
      '1. Open a new Busey Foundation Checking or Pillar Banking account by May 1, 2026 using the correct promo code: LEVELUP1 for Foundation or LEVELUP2 for Pillar.',
      '2. Within 90 days, enroll in online banking.',
      '3. Within 90 days, activate and use the Busey Debit Mastercard for at least 3 transactions.',
      '4. Within 90 days, receive qualifying direct deposits: $2,000+ earns $200, $3,000+ earns $300, or $5,000+ earns $500.',
      '5. Keep the account open at least 90 days and in good standing until payout; bonus should post within 130 days of account opening.'
    ].join('\n');

    r.clear=!!(r.bonus&&r.openBy&&r.reqDays&&r.tiers?.length&&r.code);
    r.bankRulesApplied=uniq((r.bankRulesApplied||[]).concat('Busey Bank Personal Checking'));
    r.buseyRulesVersion=VER;
    return r;
  }

  function wrap(){
    if(window.__tcV3BuseyRulesWrapped)return;
    if(typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){ return applyBuseyPersonal(base(raw,opts)); };
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV3BuseyRulesWrapped=true;
  }

  window.tcV3ApplyBuseyPersonalRule=applyBuseyPersonal;
  window.tcV3BuseyRulesVersion=VER;
  setTimeout(wrap,80);setTimeout(wrap,500);setTimeout(wrap,1400);
})();
