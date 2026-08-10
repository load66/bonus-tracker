/*
 * BonusTracker v3.4.13 — Wells Fargo 2026 consumer checking $400 exact-offer rule.
 * Prevents business-checking funding/hold logic and adaptive memory from contaminating this personal offer.
 */
(function(){
  'use strict';
  const VER='3.4.13';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean).map(clean))).filter(Boolean);

  function source(r,label,src,value,confidence='High'){
    if(!src)return;
    r.fieldSources=r.fieldSources||{};
    r.sourceSnippets=Array.isArray(r.sourceSnippets)?r.sourceSnippets:[];
    const row={field:label,source:clean(src),value:value??'',kind:'current-offer',confidence};
    r.fieldSources[label]=row;
    const i=r.sourceSnippets.findIndex(x=>x&&x.field===label);
    if(i>=0)r.sourceSnippets[i]=row;else r.sourceSnippets.push(row);
  }

  function isExactOffer(raw){
    raw=String(raw||'');
    return /Wells Fargo/i.test(raw)
      && /new consumer checking/i.test(raw)
      && /\$\s*400\s+bonus/i.test(raw)
      && /\$\s*1,?000\s+or more/i.test(raw)
      && /qualifying electronic deposits/i.test(raw)
      && /90\s+calendar days/i.test(raw)
      && /August\s+18,?\s+2026/i.test(raw);
  }

  function apply(r,rawArg){
    if(!r)return r;
    const raw=String(rawArg||r.raw||r.normalizedRaw||'');
    if(!isExactOffer(raw))return r;

    const eligibility='Offer is for new consumer checking customers only. Offer is not available to customers that received a bonus for a Wells Fargo consumer checking account within the past 12 months.';
    const requirement='Receive $1,000 or more in qualifying electronic deposits within 90 calendar days of account opening.';
    const qualifying='A qualifying electronic deposit may be an ACH direct deposit, an RTP or FedNow instant payment, or an eligible third-party electronic credit to the debit card network.';
    const excluded='Transfers between accounts, mobile deposits, Zelle, and deposits made at a branch or ATM are not qualifying electronic deposits.';
    const payout='Once all requirements are met, Wells Fargo will deposit the bonus within 30 calendar days.';
    const close='The new account must stay open through the time Wells Fargo attempts to deposit the bonus.';
    const code='You must use your bonus offer code when opening the new Wells Fargo consumer checking account by August 18, 2026.';

    r.bank='Wells Fargo';
    r.acct='Wells Fargo consumer checking';
    r.accountType='personal';
    r.bonus=r.selectedBonus=400;
    r.tiered=false;r.tiers=[];r.targetTier=null;r.bonusTierText='';
    r.openBy='2026-08-18';
    r.expiration={value:'2026-08-18',display:'Aug 18, 2026',confidence:'High',source:code};
    r.code='Required at opening — offer code is not shown in this disclosure';
    r.promoCode={value:r.code,confidence:'High',source:code};

    r.reqMoney=1000;
    r.reqIsTotal=true;
    r.reqDays=90;
    r.count=0;
    r.requirementType='qualifying-electronic-deposits';
    r.requirementNoun='qualifying electronic deposits';
    r.transactionRequirement=false;
    r.dataPoint='$1,000+ total qualifying electronic deposits within 90 days';

    /* Explicitly clear the Wells business-offer fields that caused the false 30/60-day timers. */
    r.fundedDays=0;
    r.fundingAmount=0;
    r.fundingAmountText='';
    r.holdDays=0;
    r.minHoldDays=0;
    r.depositHoldRequirement=false;
    r.closeFeeCountdownDays='';
    r.earlyCloseFee=0;
    r.earlyTerminationFee=0;
    r.earlyTerminationFeeText='';

    /* The bonus disclosure points to a separate fee schedule; it does not state the selected account's fee. */
    r.fee=0;
    r.monthlyFee=null;
    r.monthlyFeeUnknown=true;
    r.monthlyFeeYNText='Not stated in bonus disclosure — review the selected checking account fee schedule';
    r.monthlyFeeAmountText='';
    r.avoidMonthlyFeeText='Monthly service fee and waiver options are separate from the bonus requirements and must be checked for the selected Wells Fargo checking product.';
    r.waivers=[];

    r.counts=uniq([
      '$1,000+ cumulative qualifying electronic deposits within 90 days',
      'ACH direct deposit of salary, government benefits, or other income',
      'RTP network instant payment',
      'FedNow Service instant payment',
      'Eligible third-party electronic credit to the debit card through Visa or Mastercard rails'
    ]);
    r.not=r.notCounts=uniq([
      'Transfers from one account to another',
      'Mobile deposits',
      'Zelle',
      'Deposits made at a branch or ATM',
      'Early Pay Day ACH deposits do not count until they actually post and are no longer pending'
    ]);

    /* Wording intentionally avoids being converted into a fake day-120 timer from opening. */
    r.payout=r.payoutText=r.payoutTimingText='30 calendar-day maximum after all bonus requirements are met';
    r.early=close;
    r.closeRestrictionType='payout-only';
    r.closeRuleBasis='bonus';
    r.closeRuleDays=0;
    r.closeBufferDays=0;
    r.closeRuleText=close;
    r.closeRuleSource='current-tc';
    r.closeRuleSourceSentence=close;

    r.eligibilityText=uniq([
      'New Wells Fargo consumer checking customers only.',
      'Not eligible if you received a Wells Fargo consumer checking bonus within the past 12 months.',
      'Wells Fargo employees are not eligible.',
      'Non-resident aliens or foreign entities signing IRS Form W-8 are not eligible.',
      'Wells Fargo Private Bank experience deposit accounts are not eligible.',
      'Limit one bonus per customer/account and the offer cannot be combined with another consumer deposit offer.'
    ]).join('\n');
    r.churnable=true;
    r.churnability='repeatable';
    r.churn='1';
    r.churnBasis='bonus-received';
    r.churnBufferDays=0;
    r.churnReason='Eligibility looks back 12 months from when a prior Wells Fargo consumer checking bonus was received.';
    r.churnRuleText='12 months from the prior Wells Fargo consumer checking bonus received date';

    r.suggestedTimers=[
      {kind:'days',category:'requirement',text:'$1,000 qualifying electronic deposits due',daysRequired:90,source:requirement}
    ];
    r.forceActionPlan=true;
    r.actionPlan=[
      '1. Open a new eligible Wells Fargo consumer checking account by August 18, 2026 and use the required bonus offer code.',
      '2. Receive at least $1,000 total in qualifying electronic deposits within 90 calendar days of opening.',
      '3. After the requirement is met, allow up to 30 calendar days for the $400 bonus to post.',
      '4. Keep the account open through Wells Fargo’s bonus deposit attempt. There is no fixed post-bonus holding period in this disclosure.',
      '5. For a future Wells Fargo consumer checking bonus, track eligibility from the date this bonus is received; the lookback is 12 months.'
    ].join('\n');

    r.reviewFlags=(Array.isArray(r.reviewFlags)?r.reviewFlags:[]).filter(x=>
      !/Wells Fargo Business|business checking|\$2,500|funding deadline|maintain.*balance|hold deadline|profile fallback|adaptive learning/i.test(String(x||''))
    );
    r.reviewFlags.push('Monthly service fee details are not included in this bonus disclosure; review the fee schedule for the exact checking product selected.');

    source(r,'Bank','Wells Fargo consumer checking bonus disclosure.','Wells Fargo');
    source(r,'Account type','Offer is for new consumer checking customers only.','personal');
    source(r,'Bonus','To receive the $400 bonus.','$400');
    source(r,'Promo code',code,r.code);
    source(r,'Expiration / open-by date',code,'2026-08-18');
    source(r,'Requirement amount',requirement,'$1,000 total');
    source(r,'Requirement days',requirement,'90');
    source(r,'Qualifying deposits',qualifying,r.counts.join('; '));
    source(r,'Non-qualifying deposits',excluded,r.notCounts.join('; '));
    source(r,'Payout timing',payout,r.payoutTimingText);
    source(r,'Early close / payout risk',close,close);
    source(r,'Eligibility / churn',eligibility,r.churnRuleText);

    r.profileFallbacks=[];
    r.profileFallbackSummary='';
    r.hasExplicitCurrentOffer=true;
    r.clear=true;
    r.bankRulesApplied=uniq((r.bankRulesApplied||[]).filter(x=>!/Wells Fargo Business Checking/i.test(String(x))).concat('Wells Fargo Consumer Checking 2026'));
    r.wellsPersonalRulesVersion=VER;
    return r;
  }

  function wrap(){
    if(window.__tcV3WellsPersonalRulesWrapped||typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){return apply(base(raw,opts),raw)};
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV3WellsPersonalRulesWrapped=true;
  }

  window.tcV3ApplyWellsPersonalRule=apply;
  window.tcV3WellsPersonalRulesVersion=VER;
  setTimeout(wrap,110);setTimeout(wrap,650);setTimeout(wrap,1550);
})();
