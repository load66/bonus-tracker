/*
 * filename: bank-rules-wells-consumer.js
 * version: 3.4.13
 * purpose: Exact Wells Fargo $400 consumer checking offer rule. Keeps consumer DD requirements isolated from Wells business funding/hold profiles.
 */
(function(){
  'use strict';
  const VER='3.4.13';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean).map(clean))).filter(Boolean);
  function addSource(r,label,source,value,kind='extracted',confidence='High'){
    if(!r||!source)return;
    r.fieldSources=r.fieldSources||{};
    const item={field:label,source:clean(source),value:value??'',kind,confidence};
    r.fieldSources[label]=item;
    r.sourceSnippets=Array.isArray(r.sourceSnippets)?r.sourceSnippets:[];
    const i=r.sourceSnippets.findIndex(x=>x&&x.field===label);
    if(i>=0)r.sourceSnippets[i]=item;else r.sourceSnippets.push(item);
  }
  function applies(raw){
    const s=String(raw||'');
    if(!/Wells Fargo/i.test(s))return false;
    if(/business checking|Initiate Business Checking|Navigate Business Checking|Optimize Business Checking/i.test(s))return false;
    return /new consumer checking customers|Wells Fargo consumer checking account/i.test(s)
      && /\$\s*400\s+bonus/i.test(s)
      && /\$\s*1,?000\s+or\s+more\s+in\s+qualifying electronic deposits/i.test(s)
      && /90\s+calendar\s+days\s+of\s+account opening/i.test(s);
  }
  function apply(r){
    if(!r)return r;
    const raw=String(r.normalizedRaw||r.raw||'');
    if(!applies(raw))return r;
    const offer='To receive the $400 bonus: you must use your bonus offer code when opening a new Wells Fargo consumer checking account, which is subject to approval, by August 18, 2026 and receive $1,000 or more in qualifying electronic deposits within 90 calendar days of account opening.';
    const requirement='Receive $1,000 or more in qualifying electronic deposits within 90 calendar days of account opening.';
    const qualifying='A qualifying electronic deposit is a deposit of funds, such as your salary, government benefit payment, or other income, that has posted to your account and is (1) a direct deposit made through the Automated Clearing House (ACH) network, (2) an instant payment processed through the RTP network or FedNow Service, or (3) an electronic credit from a third party service that facilitates payments to your debit card using the Visa or Mastercard network.';
    const excluded='Transfers from one account to another, mobile deposits, Zelle, or deposits made at a branch or ATM are not considered a qualifying electronic deposit.';
    const payout='Once you have met all requirements, we will deposit the bonus into your new account within 30 calendar days.';
    const close='Your new account must stay open through the time we attempt to deposit the bonus.';
    const eligibility='Offer is not available to customers that received a bonus for a Wells Fargo consumer checking account within the past 12 months.';
    const fee='Talk with a banker or see the Consumer Account Fee and Information Schedule for complete checking account details, including the applicable monthly service fee and options to avoid it. The actions required for this bonus are separate from the actions available to avoid the monthly service fee.';

    r.bank='Wells Fargo';
    r.acct='Wells Fargo consumer checking';
    r.accountType='personal';
    r.bonus=r.selectedBonus=400;
    r.tiered=false;r.tiers=[];r.targetTier=null;r.bonusTierText='';
    r.code='Required — use your Wells Fargo bonus offer code at account opening';
    r.promoCode={value:r.code,confidence:'High',source:offer};
    r.openBy='2026-08-18';
    r.expiration={value:'2026-08-18',display:'Aug 18, 2026',confidence:'High',source:offer};

    r.reqMoney=1000;r.reqIsTotal=true;r.reqDays=90;r.count=0;
    r.requirementType='electronic-deposit';
    r.requirementNoun='qualifying electronic deposits';
    r.transactionRequirement=false;
    r.fundedDays=0;r.fundingAmount=0;r.fundingAmountText='';
    r.holdDays=0;r.minHoldDays=0;r.depositHoldRequirement=false;

    r.payout=r.payoutText='within 30 calendar days after all bonus requirements are met';
    r.payoutBasis='requirement-met';
    r.closeRestrictionType='payout-only';
    r.closeRuleBasis='bonus';
    r.closeRuleDays=0;r.minHoldDays=0;r.closeBufferDays=0;
    r.closeRuleText=close;r.early=close;r.earlyCloseFee=0;r.earlyTerminationFee=0;
    r.closeRuleSource='current-tc';r.closeRuleSourceSentence=close;

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
      'Posted RTP real-time payment',
      'Posted FedNow payment',
      'Posted electronic credit from a third-party service to the debit card using the Visa or Mastercard network, such as an Original Credit Transaction',
      'Early Pay Day ACH direct deposit only after it posts and is no longer pending'
    ]);
    r.not=r.notCounts=uniq([
      'Transfer from one account to another',
      'Mobile deposit',
      'Zelle',
      'Branch deposit',
      'ATM deposit',
      'Pending Early Pay Day deposit before its scheduled posting date'
    ]);
    r.eligibilityText=uniq([
      'New Wells Fargo consumer checking customers only; primary owner only.',
      eligibility,
      'Wells Fargo employees are not eligible.',
      'Non-resident aliens or foreign entities signing Form W-8 are not eligible.',
      'Deposit accounts in the Wells Fargo Private Bank experience are not eligible.',
      'Limit one bonus per customer/account and this offer cannot be combined with another consumer deposit offer.'
    ]).join('\n');

    r.suggestedTimers=[
      {kind:'due',category:'openby',text:'Offer open-by deadline',date:'2026-08-18',source:offer},
      {kind:'days',category:'requirement',text:'$1,000 qualifying electronic deposits deadline',daysRequired:90,source:requirement}
    ];
    r.forceActionPlan=true;
    r.actionPlan=[
      '1. Open a new eligible Wells Fargo consumer checking account by August 18, 2026 using your bonus offer code.',
      '2. Receive $1,000 or more total in qualifying electronic deposits within 90 calendar days of account opening.',
      '3. Qualifying deposits can include posted ACH direct deposits, RTP/FedNow payments, or eligible third-party debit-card network credits. Transfers, mobile deposits, Zelle, branch deposits, and ATM deposits do not count.',
      '4. After the $1,000 requirement is met, the $400 bonus should be deposited within 30 calendar days.',
      '5. Keep the account open through the time Wells Fargo attempts to deposit the bonus. No fixed post-bonus holding period is stated in this disclosure.',
      '6. Future eligibility is 12 months after the prior Wells Fargo consumer checking bonus was received; save the bonus received date.'
    ].join('\n');
    r.reviewFlags=Array.isArray(r.reviewFlags)?r.reviewFlags.filter(x=>!/funding|balance hold|maintain required balance|business checking/i.test(String(x))):[];
    r.reviewFlags.push('Monthly service fee amount and waiver details are not contained in this bonus disclosure; review the separate Wells Fargo fee schedule.');

    addSource(r,'Bank','Wells Fargo consumer checking account','Wells Fargo');
    addSource(r,'Account type','Offer is for new consumer checking customers only.','personal');
    addSource(r,'Bonus',offer,400);
    addSource(r,'Promo code',offer,r.code);
    addSource(r,'Expiration / open-by date',offer,'2026-08-18');
    addSource(r,'Requirement amount',requirement,1000);
    addSource(r,'Requirement days',requirement,90);
    addSource(r,'Requirement',qualifying,requirement);
    addSource(r,'Payout timing',payout,r.payout);
    addSource(r,'Early close / payout risk',close,close);
    addSource(r,'Eligibility',eligibility,r.eligibilityText);
    addSource(r,'Monthly fee',fee,r.monthlyFeeYNText,'extracted','High');
    addSource(r,'Does not count',excluded,r.notCounts.join('; '));

    r.clear=true;
    r.hasExplicitCurrentOffer=true;
    r.bankRulesApplied=uniq((r.bankRulesApplied||[]).filter(x=>!/Wells Fargo Business Checking/i.test(String(x))).concat('Wells Fargo Consumer Checking $400'));
    r.wellsConsumerRulesVersion=VER;
    return r;
  }
  function wrap(){
    if(window.__tcV3WellsConsumerRulesWrapped)return;
    if(typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){return apply(base(raw,opts));};
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV3WellsConsumerRulesWrapped=true;
  }
  window.tcV3ApplyWellsConsumerRule=apply;
  window.tcV3WellsConsumerRulesVersion=VER;
  setTimeout(wrap,70);setTimeout(wrap,450);setTimeout(wrap,1350);
})();
