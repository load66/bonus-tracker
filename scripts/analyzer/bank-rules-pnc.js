/*
 * filename: scripts/analyzer/bank-rules-pnc.js
 * version: 3.0.8
 * purpose: PNC Virtual Wallet consumer checking saved profile.
 * last-touched: unknown
 */
(function(){
  const VER='3.0.8';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const money=n=>'$'+Number(n||0).toLocaleString();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean).map(clean))).filter(Boolean);

  function applyPncConsumer(r){
    const raw=String(r?.raw||r?.normalizedRaw||'');
    if(!/\bPNC\b|PNC Bank/i.test(raw))return r;
    if(!/Virtual Wallet|Performance Select|CREDITS CHECK REWARD|Spend account/i.test(raw))return r;

    r.bank='PNC';
    r.acct='PNC Virtual Wallet consumer checking';
    r.tiered=true;
    r.tiers=[
      {bonus:100,requirement:500,maxRequirement:4999,confidence:'High',source:'PNC Virtual Wallet: $100 reward with $500+ qualifying direct deposits'},
      {bonus:400,requirement:5000,maxRequirement:0,confidence:'High',source:'PNC Virtual Wallet with Performance Select: $400 reward with $5,000+ qualifying direct deposits'}
    ];
    r.targetTier=r.tiers[1];
    r.bonus=r.selectedBonus=400;
    r.reqMoney=5000;
    r.reqIsTotal=true;
    r.bonusTierText='$100 for $500+ DD / $400 for $5,000+ DD';

    r.openBy='2026-05-28';
    r.expiration={value:'2026-05-28',display:'May 28, 2026',confidence:'High',source:'Offer valid 2/27/2026 through 5/28/2026.'};
    r.code=r.code||'No promo code clearly stated — use online application link or PNC location offer';
    r.promoCode={value:r.code,confidence:'Review',source:'Open online via the application link on the page or in a physical PNC location.'};

    r.reqDays=60;
    r.fundedDays=0;
    r.fundingAmount=0;
    r.holdDays=0;
    r.depositHoldRequirement=false;
    r.count=0;
    r.transactionRequirement=false;

    r.fee=0;
    r.monthlyFee=null;
    r.waivers=uniq(['Monthly fee details not included in pasted T&C — review PNC product fee schedule']);

    r.counts=uniq([
      'Qualifying recurring direct deposit of paycheck, pension, Social Security, or other regular income',
      'Deposit must be electronically deposited by an employer or outside agency into the Spend account',
      'Total qualifying direct deposits must be at least $5,000 for Virtual Wallet with Performance Select to earn $400',
      'Total qualifying direct deposits must be at least $500 for Virtual Wallet to earn $100',
      'Qualifying direct deposit(s) must be received within the first 60 days'
    ]);

    r.not=r.notCounts=uniq([
      'Credit card cash advance transfers do not qualify',
      'Wire transfers do not qualify',
      'Person-to-person transfers do not qualify',
      'Transfers from one account to another do not qualify',
      'Deposits made at a branch do not qualify',
      'ATM deposits do not qualify',
      'Mobile deposits do not qualify',
      'Deposits through the mail do not qualify',
      'Trust, Estate, and specialty titled accounts are excluded'
    ]);

    r.early='Eligible account must remain open to receive the reward. Changing the checking product after opening could change eligibility, terms, or reward amount.';
    r.payout=r.payoutText='60–90 days after all conditions have been met; appears as CREDITS CHECK REWARD';
    r.eligibilityText=uniq([
      'Not eligible if you or any signer has an existing PNC consumer checking account.',
      'Not eligible if you or any signer closed a PNC consumer checking account within the past 12 months.',
      'Not eligible if you have been a primary signer on a consumer checking account that received a PNC promotional premium in the past 24 months.',
      'If multiple accounts are opened with the same signers, only one account is eligible for the premium.',
      'Trust, Estate, and specialty titled accounts are excluded.',
      'Reward may be taxable and reported on appropriate IRS forms.'
    ]).join('\n');

    r.suggestedTimers=[];
    r.suggestedTimers.push(
      {kind:'due',text:'Promo expiration / open-by deadline',date:'2026-05-28'},
      {kind:'days',text:'Qualifying direct deposit deadline',daysRequired:60},
      {kind:'days',text:'Earliest reward payout follow-up',daysRequired:120},
      {kind:'days',text:'Final reward payout follow-up',daysRequired:150}
    );

    r.forceActionPlan=true;
    r.actionPlan=[
      '1. Open a new eligible PNC Virtual Wallet product online via the offer application link or in a physical PNC location by May 28, 2026.',
      '2. Choose the correct product before opening and remain in that product: Virtual Wallet = $100 target; Virtual Wallet with Performance Select = $400 target.',
      '3. Receive qualifying recurring direct deposit(s) into the Spend account within the first 60 days.',
      '4. Target tier: $500+ total qualifying DD earns $100; $5,000+ total qualifying DD earns $400.',
      '5. Keep the account open until reward payout; reward should post 60–90 days after all conditions are met as CREDITS CHECK REWARD.'
    ].join('\n');

    r.clear=!!(r.bonus&&r.openBy&&r.reqDays&&r.tiers?.length);
    r.bankRulesApplied=uniq((r.bankRulesApplied||[]).concat('PNC Virtual Wallet Consumer Checking'));
    r.pncRulesVersion=VER;
    return r;
  }

  function wrap(){
    if(window.__tcV3PncRulesWrapped)return;
    if(typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){ return applyPncConsumer(base(raw,opts)); };
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV3PncRulesWrapped=true;
  }

  window.tcV3ApplyPncConsumerRule=applyPncConsumer;
  window.tcV3PncRulesVersion=VER;
  setTimeout(wrap,80);setTimeout(wrap,500);setTimeout(wrap,1400);
})();