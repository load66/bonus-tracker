/* ✅ Version 3.0.7 Newest update: Bank of America Business Advantage Banking saved profile. */
(function(){
  const VER='3.0.7';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const money=n=>'$'+Number(n||0).toLocaleString();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean).map(clean))).filter(Boolean);

  function applyBoaBusiness(r){
    const raw=String(r?.raw||r?.normalizedRaw||'');
    if(!/Bank of America|BofA/i.test(raw))return r;
    if(!/Business Advantage Banking|Business Advantage Relationship Banking|Business Advantage Fundamentals/i.test(raw))return r;
    if(!/\$\s*400|\$\s*750|Maintenance Period|Balance Requirement/i.test(raw))return r;

    r.bank='Bank of America';
    r.acct='Bank of America Business Advantage Banking';
    r.tiered=true;
    r.tiers=[
      {bonus:400,requirement:5000,maxRequirement:14999,confidence:'High',source:'BofA Business Bonus Chart: $5,000 balance requirement = $400'},
      {bonus:750,requirement:15000,maxRequirement:0,confidence:'High',source:'BofA Business Bonus Chart: $15,000 balance requirement = $750'}
    ];
    r.targetTier=r.tiers[1];
    r.bonus=r.selectedBonus=750;
    r.reqMoney=15000;
    r.reqIsTotal=true;
    r.bonusTierText='$400 for $5,000+ / $750 for $15,000+';

    r.openBy='2026-12-31';
    r.expiration={value:'2026-12-31',display:'Dec 31, 2026',confidence:'High',source:'Offer expires on December 31, 2026.'};
    r.code=r.code||'Online offer page enrollment — no separate code clearly stated';
    r.promoCode={value:r.code,confidence:'Review',source:'Open online through this offer webpage by Dec 31, 2026 to be enrolled.'};

    r.reqDays=90;
    r.fundedDays=30;
    r.fundingAmount=15000;
    r.holdDays=90;
    r.depositHoldRequirement=true;
    r.count=0;
    r.transactionRequirement=false;

    r.fee=16;
    r.monthlyFee={value:'$16 monthly fee after first 12 months',amount:16,source:'BofA Business Advantage fee disclosure',confidence:'High'};
    r.waivers=uniq([
      '$16 monthly fee waived after first 12 months with $5,000 combined average monthly balance in eligible linked business deposits',
      '$500+ in new qualified purchases each statement cycle using linked Bank of America business debit card',
      'Preferred Rewards for Business membership'
    ]);

    r.counts=uniq([
      'Open a new Business Advantage Relationship Banking or Business Advantage Fundamentals Banking account online through the offer webpage',
      'Deposit new money directly into the new eligible Business Advantage Banking account within 30 days of opening',
      'At the end of the 30-day Deposit Period, new money total determines the cash bonus tier',
      'Maintain the applicable daily balance requirement during the Maintenance Period from day 31 through day 90',
      'New money means funds not transferred from other Bank of America accounts or Merrill investment accounts'
    ]);

    r.not=r.notCounts=uniq([
      'Opening by leaving the offer page, visiting bankofamerica.com directly, visiting a financial center, or calling may not qualify',
      'Transfers from other Bank of America accounts do not count as new money',
      'Transfers from Merrill investment accounts do not count as new money',
      'ATM, online, or teller transfers from Bank of America/Merrill accounts do not count as new money',
      'Cash withdrawal from an existing Bank of America account and redeposit into the new account does not count as new money',
      'Not eligible if owner or signer on a Bank of America Business Advantage Banking account within last 12 months',
      'Bank of America employees are not eligible',
      'Cannot combine with other offers',
      'Only one Business Advantage Banking bonus per business owner'
    ]);

    r.early='Maintain the required daily balance during the day 31–90 Maintenance Period. Dropping below $15,000 can reduce the bonus to $400; dropping below $5,000 can disqualify the bonus. Keep account open and in good standing until payout.';
    r.payout=r.payoutText='within 60 days after satisfying all requirements';
    r.eligibilityText=uniq([
      'New Bank of America business banking customers only.',
      'Not eligible if you were an owner or signer on a Bank of America Business Advantage Banking account within the last 12 months.',
      'Bank of America employees are not eligible.',
      'Online offer page opening required.',
      'Only one $400 or $750 Business Advantage Banking bonus per business owner.',
      'Bonus may be taxable and may be reported on IRS Form 1099 or other appropriate form.'
    ]).join('\n');

    r.suggestedTimers=[];
    r.suggestedTimers.push(
      {kind:'due',text:'Promo expiration / open-by deadline',date:'2026-12-31'},
      {kind:'days',text:'New money deposit deadline',daysRequired:30},
      {kind:'days',text:'Maintenance Period begins',daysRequired:31},
      {kind:'days',text:'Daily balance hold complete',daysRequired:90},
      {kind:'days',text:'Expected bonus payout follow-up',daysRequired:150}
    );

    r.forceActionPlan=true;
    r.actionPlan=[
      '1. Open a new Bank of America Business Advantage Relationship Banking or Business Advantage Fundamentals Banking account online through the offer webpage by Dec 31, 2026.',
      '2. Deposit new money directly into the new eligible business account within 30 days of account opening.',
      '3. Target tier: $5,000 balance requirement earns $400; $15,000 balance requirement earns $750.',
      '4. Maintain the applicable daily balance requirement during the Maintenance Period from day 31 through day 90.',
      '5. Keep the account open and in good standing until payout; bonus should be attempted within 60 days after all requirements are satisfied.'
    ].join('\n');

    r.clear=!!(r.bonus&&r.openBy&&r.fundedDays&&r.holdDays&&r.tiers?.length);
    r.bankRulesApplied=uniq((r.bankRulesApplied||[]).concat('Bank of America Business Advantage Banking'));
    r.boaBusinessRulesVersion=VER;
    return r;
  }

  function wrap(){
    if(window.__tcV3BoaBusinessRulesWrapped)return;
    if(typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){ return applyBoaBusiness(base(raw,opts)); };
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV3BoaBusinessRulesWrapped=true;
  }

  window.tcV3ApplyBoaBusinessRule=applyBoaBusiness;
  window.tcV3BoaBusinessRulesVersion=VER;
  setTimeout(wrap,80);setTimeout(wrap,500);setTimeout(wrap,1400);
})();
