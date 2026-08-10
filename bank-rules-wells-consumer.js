/*
 * filename: bank-rules-wells-consumer.js
 * version: 3.4.13
 * purpose: Exact Wells Fargo $400 consumer checking offer. Prevents business-profile/timer contamination and stores the 12-month bonus-received eligibility basis.
 */
(function(){
  'use strict';
  const VER='3.4.13';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean).map(clean))).filter(Boolean);
  function addSource(r,label,source,value,kind='extracted',confidence='High'){
    if(!source)return;
    r.fieldSources=r.fieldSources||{};
    const item={field:label,source:clean(source),value:value??'',kind,confidence};
    r.fieldSources[label]=item;
    r.sourceSnippets=Array.isArray(r.sourceSnippets)?r.sourceSnippets:[];
    const i=r.sourceSnippets.findIndex(x=>x&&x.field===label);
    if(i>=0)r.sourceSnippets[i]=item;else r.sourceSnippets.push(item);
  }
  function matches(raw){
    const s=String(raw||'');
    return /Wells Fargo/i.test(s)
      && /new consumer checking customers|Wells Fargo consumer checking account/i.test(s)
      && /\$\s*400\s+bonus/i.test(s)
      && /\$\s*1,?000[^.]{0,120}qualifying electronic deposits?[^.]{0,120}90\s+calendar\s+days/i.test(s)
      && !/Initiate Business Checking|Navigate Business Checking|Optimize Business Checking/i.test(s);
  }
  function apply(r,rawOverride=''){
    if(!r)return r;
    const raw=String(rawOverride||r.raw||r.normalizedRaw||'');
    if(!matches(raw))return r;
    const eligibility='Offer is not available to customers that received a bonus for a Wells Fargo consumer checking account within the past 12 months.';
    const offer='To receive the $400 bonus, you must use your bonus offer code when opening a new Wells Fargo consumer checking account by August 18, 2026 and receive $1,000 or more in qualifying electronic deposits within 90 calendar days of account opening.';
    const qualifying='A qualifying electronic deposit is a posted direct deposit through ACH, an instant payment through RTP or FedNow, or an electronic credit from a third-party service to your debit card using the Visa or Mastercard network.';
    const exclusions='Transfers from one account to another, mobile deposits, Zelle, or deposits made at a branch or ATM are not considered a qualifying electronic deposit.';
    const earlyPay='An ACH direct deposit made available early with Early Pay Day does not count toward the bonus requirements until it posts and is no longer pending.';
    const payout='Once you have met all requirements, we will deposit the bonus into your new account within 30 calendar days.';
    const close='Your new account must stay open through the time we attempt to deposit the bonus.';
    const fee='See the Consumer Account Fee and Information Schedule and Deposit Account Agreement for the applicable monthly service fee and options to avoid it. The actions required for this bonus are separate from the actions available to avoid the monthly service fee.';

    r.bank='Wells Fargo';
    r.acct='Wells Fargo consumer checking';
    r.accountType='personal';
    r.bonus=r.selectedBonus=400;
    r.tiered=false;r.tiers=[];r.targetTier=null;r.bonusTierText='';
    r.code='Required — use your bonus offer code when opening';
    r.openBy='2026-08-18';
    r.expiration={value:r.openBy,display:'Aug 18, 2026',confidence:'High',source:offer};
    r.reqMoney=1000;r.reqIsTotal=true;r.reqDays=90;r.count=0;
    r.requirementType='electronic-deposit';
    r.requirementNoun='qualifying electronic deposits';
    r.transactionRequirement=false;
    /* This consumer offer has no separate 30-day funding or 60-day balance-hold requirement. */
    r.fundedDays=0;r.fundingAmount=0;r.fundingAmountText='';r.holdDays=0;r.depositHoldRequirement=false;
    r.minHoldDays=0;r.closeRuleDays=0;r.closeFeeCountdownDays='';r.earlyCloseFee=0;r.earlyTerminationFee=0;
    r.payout=r.payoutText='within 30 calendar days after all bonus requirements are met';
    r.payoutBasis='requirement-met';
    r.closeRestrictionType='payout-only';
    r.closeRuleBasis='bonus';
    r.closeBufferDays=0;
    r.closeRuleText=close;
    r.closeRuleSource='current-tc';
    r.closeRuleSourceSentence=close;
    r.early=close;
    r.churnable=true;
    r.churnability='repeatable';
    r.churn='1';
    r.churnBasis='bonus';
    r.churnBufferDays=0;
    r.churnReason=eligibility;
    r.churnRuleText=eligibility;
    r.churnDecisionSource='current-tc';
    r.churnDecisionConfidence='High';
    r.fee=0;r.monthlyFee=null;
    r.monthlyFeeYNText='Not stated in bonus disclosure — separate Wells Fargo fee schedule applies';
    r.monthlyFeeAmountText='';
    r.avoidMonthlyFeeText='Review the Wells Fargo Consumer Account Fee and Information Schedule. Bonus requirements are separate from monthly-fee waiver requirements.';
    r.waivers=[];
    r.counts=uniq([
      'Posted ACH direct deposit, such as salary, government benefit payment, or other income',
      'Posted RTP or FedNow instant payment',
      'Posted electronic credit from a third-party service to the debit card through the Visa or Mastercard network'
    ]);
    r.not=r.notCounts=uniq([
      'Transfers from one account to another',
      'Mobile deposits',
      'Zelle payments',
      'Branch or ATM deposits',
      'Early Pay Day ACH while it is still pending; it counts only after posting'
    ]);
    r.eligibilityText=uniq([
      'New Wells Fargo consumer checking customers only; offer is for the primary owner.',
      'Not eligible if you received a Wells Fargo consumer checking bonus within the past 12 months.',
      'Wells Fargo employees are not eligible.',
      'Non-resident aliens or foreign entities signing IRS Form W-8 are not eligible.',
      'Deposit accounts in the Wells Fargo Private Bank experience are not eligible.',
      'Limit one consumer deposit bonus per customer/account; cannot combine with another consumer deposit offer.'
    ]).join('\n');
    r.suggestedTimers=[
      {kind:'due',category:'openby',text:'Offer open-by deadline',date:'2026-08-18',source:offer},
      {kind:'days',category:'requirement',text:'$1,000 qualifying electronic deposits deadline',daysRequired:90,source:offer}
    ];
    r.forceActionPlan=true;
    r.actionPlan=[
      '1. Open a new eligible Wells Fargo consumer checking account by August 18, 2026 using your bonus offer code.',
      '2. Receive $1,000 or more in qualifying electronic deposits within 90 calendar days of account opening.',
      '3. Use only qualifying posted electronic deposits: ACH direct deposit, RTP/FedNow instant payment, or eligible Visa/Mastercard debit-card credit.',
      '4. After the requirements are met, allow up to 30 calendar days for the $400 bonus to post.',
      '5. Keep the account open through the bonus deposit attempt. After the $400 posts, there is no stated fixed post-bonus hold in this disclosure.',
      '6. Future eligibility resets 12 months after the bonus received date, not the account close date.'
    ].join('\n');
    r.reviewFlags=(Array.isArray(r.reviewFlags)?r.reviewFlags:[]).filter(x=>!/funding|hold|maintain required balance|profile fallback|saved profile/i.test(String(x||'')));
    r.reviewFlags.push('Monthly service fee amount and waiver details are not contained in this bonus disclosure; review the separate Wells Fargo fee schedule.');
    r.hasExplicitCurrentOffer=true;
    r.clear=true;
    r.bankRulesApplied=uniq((r.bankRulesApplied||[]).filter(x=>!/Wells Fargo Business/i.test(String(x))).concat('Wells Fargo Consumer Checking $400'));
    addSource(r,'Bank','Wells Fargo consumer checking account.','Wells Fargo');
    addSource(r,'Account type','Offer is for new consumer checking customers only.','personal');
    addSource(r,'Bonus',offer,400);
    addSource(r,'Promo code',offer,r.code);
    addSource(r,'Expiration / open-by date',offer,'2026-08-18');
    addSource(r,'Requirement amount',offer,1000);
    addSource(r,'Requirement days',offer,90);
    addSource(r,'Requirement type',qualifying,'qualifying electronic deposits');
    addSource(r,'Payout timing',payout,r.payout);
    addSource(r,'Early close / payout risk',close,close);
    addSource(r,'Eligibility',eligibility,r.eligibilityText);
    addSource(r,'Monthly fee',fee,r.monthlyFeeYNText,'extracted','High');
    r.wellsConsumerRulesVersion=VER;
    return r;
  }
  function wrap(){
    if(window.__tcV3WellsConsumerRulesWrapped)return;
    if(typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){return apply(base(raw,opts),raw)};
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV3WellsConsumerRulesWrapped=true;
  }
  window.tcV3ApplyWellsConsumerRule=apply;
  window.tcV3WellsConsumerRulesVersion=VER;
  wrap();setTimeout(wrap,120);setTimeout(wrap,700);
})();
