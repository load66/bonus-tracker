/*
 * filename: bank-rules-fourleaf.js
 * version: 3.4.07
 * purpose: FourLeaf Checking Up to $550 milestone offer — exact DD amount, calendar-month milestones, payout-only close rule, and lifetime-like eligibility.
 */
(function(){
  'use strict';
  const VER='3.4.07';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean).map(clean))).filter(Boolean);

  function addSource(r,label,source,value,kind='extracted',confidence='High'){
    if(!source)return;
    r.fieldSources=r.fieldSources||{};
    const row={field:label,source:clean(source),value:value??'',kind,confidence};
    r.fieldSources[label]=row;
    r.sourceSnippets=Array.isArray(r.sourceSnippets)?r.sourceSnippets:[];
    const i=r.sourceSnippets.findIndex(x=>x&&x.field===label);
    if(i>=0)r.sourceSnippets[i]=row;else r.sourceSnippets.push(row);
  }

  function applyFourLeaf(r){
    if(!r)return r;
    const raw=String(r.normalizedRaw||r.raw||'');
    if(!/\bFourLeaf\b/i.test(raw))return r;
    if(!/(?:Checking\s+Up\s+to\s+\$?550\s+Bonus|First Direct Deposit Bonus|Second Direct Deposit Bonus|Third Direct Deposit Bonus)/i.test(raw))return r;

    const bonusSource='To be eligible for the FourLeaf Checking Up to $550 Bonus Offer and receive up to a maximum of $550.00 in bonuses.';
    const openSource='You must open a Free Checking, Smart Checking, or Student Checking account with FourLeaf between February 2, 2026 and December 31, 2026.';
    const initialSource='Have a Qualifying Direct Deposit post to the checking account within ninety (90) calendar days of account opening date.';
    const ddSource='A Qualifying Direct Deposit is a recurring electronic deposit of a paycheck, pension, or government benefits from an employer, the government, or similar third party of $500.00 or more.';
    const payoutSource='The First Direct Deposit Bonus will be deposited within sixty (60) calendar days following the initial Qualifying Direct Deposit; each additional $100 bonus is deposited within sixty (60) calendar days of the applicable qualifying deposit.';
    const closeSource='The checking account must remain open and in good standing up to and including the date each bonus is deposited to receive the applicable bonus.';
    const eligibilitySource='You must not have an existing FourLeaf checking account as primary account holder and must not have previously received a new checking account opening related bonus from FourLeaf.';

    r.bank='FourLeaf';
    r.acct='FourLeaf Free Checking, Smart Checking, or Student Checking';
    r.accountType='personal';
    r.bonus=r.selectedBonus=550;
    r.tiered=true;
    r.tiers=[];
    r.targetTier=null;
    r.bonusTierText='$350 initial bonus / $450 cumulative after 12 consecutive qualifying-DD months / $550 cumulative after 24 consecutive qualifying-DD months';
    r.milestoneOffer=true;
    r.bonusMilestones=[
      {cumulativeBonus:350,trigger:'Initial qualifying direct deposit of $500+ within 90 days of opening',payout:'Within 60 days after the initial qualifying direct deposit'},
      {cumulativeBonus:450,trigger:'A $500+ qualifying direct deposit in each of 12 consecutive months following the initial-DD month',payout:'Within 60 days after the applicable 12th monthly qualifying direct deposit'},
      {cumulativeBonus:550,trigger:'A $500+ qualifying direct deposit in each of 24 consecutive months following the initial-DD month',payout:'Within 60 days after the applicable 24th monthly qualifying direct deposit'}
    ];

    r.openBy='2026-12-31';
    r.expiration={value:'2026-12-31',display:'Dec 31, 2026',confidence:'High',source:openSource};
    r.reqMoney=500;
    r.reqIsTotal=false;
    r.reqDays=90;
    r.count=1;
    r.requirementType='direct-deposit';
    r.requirementNoun='qualifying direct deposit';
    r.transactionRequirement=false;
    r.recurringDirectDepositMonths=24;
    r.initialDirectDepositMinimum=500;

    r.fee=0;
    r.monthlyFee=null;
    r.monthlyFeeYNText='';
    r.waivers=[];

    r.counts=uniq([
      'A recurring electronic paycheck deposit of $500 or more from an employer',
      'A recurring pension deposit of $500 or more',
      'A recurring government-benefit deposit of $500 or more, including Social Security',
      'For the extra $100 bonuses, a qualifying $500+ direct deposit must post in every required consecutive calendar month after the initial-deposit month'
    ]);
    r.not=r.notCounts=uniq([
      'ATM deposits',
      'Debit card transfers',
      'Online banking transfers or deposits',
      'Person-to-person payments, including Zelle',
      'Missing any subsequent qualifying-deposit month disqualifies the account from both the second and third bonuses'
    ]);

    r.payout=r.payoutText='Initial $350 within 60 days after the initial $500+ qualifying direct deposit; each additional $100 within 60 days after the applicable 12th or 24th consecutive monthly qualifying direct deposit.';
    r.early=closeSource;
    r.closeRuleText=closeSource;
    r.closeRestrictionType='payout-only';
    r.closeRuleBasis='bonus';
    r.closeRuleDays=0;
    r.minHoldDays=0;
    r.closeBufferDays=0;
    r.earlyCloseFee=0;
    r.earlyTerminationFee=0;
    r.closeRuleSource='current-tc';
    r.closeRuleSourceSentence=closeSource;

    r.eligibilityText=uniq([
      'Not eligible while you are the primary owner of an existing FourLeaf checking account.',
      'Not eligible if you previously received any FourLeaf new-checking-account opening bonus. This is a lifetime-like restriction, so the offer is not repeat-churnable after receiving a bonus.',
      'Only one new checking account bonus offer is allowed even if multiple checking accounts are opened.',
      'The account must remain open and in good standing through the deposit date of each bonus you choose to pursue.',
      'Bonuses are treated as interest and may be reported on IRS Form 1099-INT.'
    ]).join('\n');
    r.churnable=false;
    r.churnability='not-repeatable';
    r.churnReason='Prior receipt of any FourLeaf new checking account opening bonus makes the customer ineligible.';

    r.suggestedTimers=[
      {kind:'due',text:'FourLeaf offer open-by deadline',date:'2026-12-31',source:openSource},
      {kind:'days',text:'Initial $500+ qualifying direct deposit deadline',daysRequired:90,source:initialSource},
      {kind:'days',text:'Latest first $350 payout follow-up',daysRequired:150,source:payoutSource}
    ];

    r.forceActionPlan=true;
    r.actionPlan=[
      '1. Open one FourLeaf Free Checking, Smart Checking, or Student Checking account by December 31, 2026.',
      '2. Have one recurring qualifying direct deposit of $500 or more post within 90 calendar days of opening.',
      '3. The initial $350 bonus should post within 60 calendar days after that initial qualifying direct deposit.',
      '4. To reach $450 total, continue a $500+ qualifying direct deposit in every one of the 12 consecutive calendar months following the initial-deposit month, then keep the account open until the additional $100 posts.',
      '5. To reach the full $550, continue a $500+ qualifying direct deposit in every one of the 24 consecutive calendar months following the initial-deposit month, then keep the account open until the final $100 posts.',
      '6. Missing even one required subsequent month makes the account ineligible for both later $100 bonuses. ATM deposits, transfers, online-bank deposits, P2P payments, and Zelle do not count.'
    ].join('\n');

    r.reviewFlags=(Array.isArray(r.reviewFlags)?r.reviewFlags:[]).filter(x=>!/tiered bonus.*(?:missing|without)|requirement amount.*review/i.test(String(x)));
    r.reviewFlags.push('The 12- and 24-month milestones are based on consecutive calendar months after the initial-deposit month; do not calculate them as a fixed number of days from account opening.');

    addSource(r,'Bank','FourLeaf Checking Up to $550 Bonus Offer.','FourLeaf');
    addSource(r,'Account type','Free Checking, Smart Checking, or Student Checking account.','personal');
    addSource(r,'Bonus',bonusSource,550);
    addSource(r,'Expiration / open-by date',openSource,'2026-12-31');
    addSource(r,'Requirement amount',ddSource,500);
    addSource(r,'Requirement days',initialSource,90);
    addSource(r,'Payout timing',payoutSource,r.payout);
    addSource(r,'Early close / payout risk',closeSource,closeSource);
    addSource(r,'Eligibility',eligibilitySource,r.eligibilityText);

    r.clear=true;
    r.bankRulesApplied=uniq((r.bankRulesApplied||[]).concat('FourLeaf Checking Up to $550'));
    r.fourLeafRulesVersion=VER;
    return r;
  }

  function wrap(){
    if(window.__tcV3FourLeafRulesWrapped)return;
    if(typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){return applyFourLeaf(base(raw,opts));};
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV3FourLeafRulesWrapped=true;
  }

  window.tcV3ApplyFourLeafRule=applyFourLeaf;
  window.tcV3FourLeafRulesVersion=VER;
  setTimeout(wrap,90);setTimeout(wrap,550);setTimeout(wrap,1450);
})();
