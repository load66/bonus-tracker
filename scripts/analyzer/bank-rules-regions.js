/*
 * filename: scripts/analyzer/bank-rules-regions.js
 * version: 3.0.9
 * purpose: Regions LifeGreen Checking saved profile.
 * last-touched: unknown
 */
(function(){
  const VER='3.0.9';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean).map(clean))).filter(Boolean);

  function findBonus(raw){
    const m=String(raw||'').match(/(?:earn|receive|get|bonus(?:\s+of)?|cash bonus(?:\s+of)?)\s*(?:a|an|up to)?\s*\$\s*([0-9]{2,4})/i);
    if(!m)return 0;
    const n=Number(String(m[1]).replace(/,/g,''));
    return Number.isFinite(n)&&n>0&&n<2000?n:0;
  }

  function applyRegionsLifeGreen(r){
    const raw=String(r?.raw||r?.normalizedRaw||'');
    if(!/Regions/i.test(raw))return r;
    if(!/LifeGreen|personal Regions checking|Regions checking account|Qualifying ACH direct deposits/i.test(raw))return r;

    const foundBonus=findBonus(raw);
    r.bank='Regions Bank';
    r.acct='Regions LifeGreen personal checking';
    r.tiered=false;
    r.tiers=[];
    r.targetTier=null;
    r.bonus=foundBonus||0;
    r.selectedBonus=foundBonus||0;
    r.bonusTierText=foundBonus?`$${foundBonus} Regions LifeGreen bonus`:'Bonus amount not shown in pasted T&C';

    r.openBy='2027-01-01';
    r.expiration={value:'2027-01-01',display:'Jan 1, 2027',confidence:'High',source:'Offer expires January 1, 2027.'};
    r.code='Registration required before opening — name and email must match';
    r.promoCode={value:r.code,confidence:'High',source:'Register before opening; name/email used when opening must match registration.'};

    r.reqMoney=1000;
    r.reqIsTotal=true;
    r.reqDays=90;
    r.fundedDays=0;
    r.fundingAmount=50;
    r.holdDays=0;
    r.depositHoldRequirement=false;
    r.count=0;
    r.transactionRequirement=false;

    r.fee=8;
    r.monthlyFee={value:'$8 with online statements / $11 with paper statements',amount:8,source:'Regions LifeGreen Checking monthly fee disclosure',confidence:'High'};
    r.waivers=uniq([
      '$1,500 average monthly balance',
      'Monthly ACH direct deposit: at least one ACH DD of $500+ OR combined ACH DD of $1,000+',
      'Online statements reduce LifeGreen Checking monthly fee to $8; paper statements fee is $11'
    ]);

    r.counts=uniq([
      'Register before opening the checking account to be eligible',
      'Open a personal Regions LifeGreen checking account',
      'Minimum opening deposit is $50',
      'Qualifying ACH direct deposits may be combined to exceed $1,000',
      'Recurring payroll or government benefit deposits count',
      'Qualifying ACH direct deposits must post within 90 days of account opening',
      'Offer is valid in Missouri and listed eligible states'
    ]);

    r.not=r.notCounts=uniq([
      'Zelle does not count as qualifying ACH direct deposit',
      'Credits or transfers do not count as qualifying ACH direct deposit',
      'Persons who had a personal Regions checking account within one year prior to opening are ineligible',
      'Regions associates are not eligible',
      'Non-resident aliens signing Form W-8 are not eligible',
      'Anyone without valid U.S. Taxpayer Identification Number or subject to backup withholding is not eligible',
      'Offer abuse or fraud may terminate eligibility'
    ]);

    r.early='New account must remain open and have a positive balance when the bonus is issued. Regions may terminate the offer for suspected abuse or fraud.';
    r.payout=r.payoutText='within 60 days of completing the requirements, deposited to the new checking account';
    r.eligibilityText=uniq([
      'Offer applies only to personal LifeGreen checking accounts.',
      'Register before opening the checking account to be eligible.',
      'First and last name and email address used when opening must match the registration.',
      'Not eligible if you had a personal Regions checking account within one year prior to new account opening.',
      'Offer valid in Missouri plus listed eligible states.',
      'Minimum opening deposit is $50.',
      'Bonus may be reported to the IRS and customer is responsible for taxes.'
    ]).join('\n');

    r.suggestedTimers=[];
    r.suggestedTimers.push(
      {kind:'due',text:'Promo expiration / open-by deadline',date:'2027-01-01'},
      {kind:'days',text:'Qualifying ACH direct deposit deadline',daysRequired:90},
      {kind:'days',text:'Bonus payout follow-up',daysRequired:150}
    );

    r.forceActionPlan=true;
    r.actionPlan=[
      '1. Register for the Regions offer before opening the account; first/last name and email must match the account opening information.',
      '2. Open a personal Regions LifeGreen checking account by Jan 1, 2027 with at least $50 minimum opening deposit.',
      '3. Receive qualifying ACH direct deposits totaling more than $1,000 within 90 days of account opening.',
      '4. Do not count Zelle, credits, or transfers toward the ACH direct deposit requirement.',
      '5. Keep the account open with a positive balance until the bonus posts; payout should occur within 60 days after requirements are completed.'
    ].join('\n');

    r.reviewFlags=Array.isArray(r.reviewFlags)?r.reviewFlags:[];
    if(!foundBonus && !r.reviewFlags.includes('Bonus amount not shown in pasted Regions T&C.')) r.reviewFlags.push('Bonus amount not shown in pasted Regions T&C.');
    r.clear=!!(r.openBy&&r.reqDays&&r.reqMoney);
    r.bankRulesApplied=uniq((r.bankRulesApplied||[]).concat('Regions LifeGreen Checking'));
    r.regionsRulesVersion=VER;
    return r;
  }

  function wrap(){
    if(window.__tcV3RegionsRulesWrapped)return;
    if(typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){ return applyRegionsLifeGreen(base(raw,opts)); };
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV3RegionsRulesWrapped=true;
  }

  window.tcV3ApplyRegionsLifeGreenRule=applyRegionsLifeGreen;
  window.tcV3RegionsRulesVersion=VER;
  setTimeout(wrap,80);setTimeout(wrap,500);setTimeout(wrap,1400);
})();