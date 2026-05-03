/*
 * filename: scripts/analyzer/bank-rules-academy.js
 * version: 3.1.1
 * purpose: Academy Bank Elite Investment Checking saved profile.
 * last-touched: unknown
 */
(function(){
  const VER='3.1.1';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean).map(clean))).filter(Boolean);

  function applyAcademyElite(r){
    const raw=String(r?.normalizedRaw||r?.raw||'');
    if(!/Academy Bank|Elite Investment Checking|MoneyPass/i.test(raw))return r;
    if(!/Elite Investment Checking|\$100 opening balance|required|four direct deposits|Online Banking/i.test(raw))return r;

    r.bank='Academy Bank';
    r.acct='Academy Bank Elite Investment Checking';
    r.tiered=false;
    r.tiers=[];
    r.targetTier=null;
    r.bonus=r.selectedBonus=500;
    r.bonusTierText='$500 Academy Bank Elite Investment Checking bonus';

    r.openBy='2026-05-15';
    r.expiration={value:'2026-05-15',display:'May 15, 2026',confidence:'High',source:'Offer expires May 15, 2026.'};
    r.code=r.code||'No promo code clearly stated in pasted T&C';
    r.promoCode={value:r.code,confidence:'Review',source:'No promo code clearly stated in pasted Academy Bank T&C.'};

    r.reqMoney=10000;
    r.reqIsTotal=true;
    r.reqDays=90;
    r.fundedDays=0;
    r.fundingAmount=100;
    r.holdDays=90;
    r.depositHoldRequirement=false;
    r.count=4;
    r.directDepositCount=4;
    r.transactionRequirement=false;
    r.onlineBankingRequirement=true;

    r.fee=0;
    r.monthlyFee={value:'Subject to monthly service charge — amount not shown in pasted T&C',amount:0,source:'Academy Bank terms say account is subject to monthly service charge.',confidence:'Review'};
    r.waivers=uniq(['Monthly service charge amount/waiver not shown in pasted T&C — review Academy Bank fee schedule']);

    r.counts=uniq([
      'Open a new Academy Bank Elite Investment Checking account',
      'Minimum $100 opening balance required',
      'Make at least four direct deposits totaling $10,000 within 90 days of account opening',
      'Enroll in Online Banking within 90 days of account opening',
      'Direct deposit required',
      'Maximum ACH credit is $15,000'
    ]);

    r.not=r.notCounts=uniq([
      'Closing the new account within 90 days of opening triggers a $25 early closure fee',
      'Monthly service charge applies unless waived by terms not included in pasted T&C',
      'Deposit limits and restrictions may apply'
    ]);

    r.early='Closing the new account within 90 days of opening will result in a $25 early closure fee. Keep account open and in good standing through bonus payout.';
    r.payout=r.payoutText='within 60 days of direct deposit verification';
    r.eligibilityText=uniq([
      'Offer expires May 15, 2026.',
      'Open a new Elite Investment Checking Account.',
      '$100 opening balance required.',
      'Subject to monthly service charge.',
      'Direct deposit required; maximum ACH credit is $15,000.',
      'Closing within 90 days causes $25 early closure fee.'
    ]).join('\n');

    r.suggestedTimers=[];
    r.suggestedTimers.push(
      {kind:'due',text:'Promo expiration / open-by deadline',date:'2026-05-15'},
      {kind:'days',text:'4 direct deposits + Online Banking deadline',daysRequired:90},
      {kind:'days',text:'Early closure fee safe date',daysRequired:90},
      {kind:'days',text:'Expected bonus payout follow-up',daysRequired:150}
    );

    r.forceActionPlan=true;
    r.actionPlan=[
      '1. Open a new Academy Bank Elite Investment Checking account by May 15, 2026 with the required $100 opening balance.',
      '2. Within 90 days, enroll in Online Banking.',
      '3. Within 90 days, receive at least four direct deposits totaling $10,000.',
      '4. Keep the account open at least 90 days to avoid the $25 early closure fee.',
      '5. Bonus should deposit within 60 days of direct deposit verification.'
    ].join('\n');

    r.clear=!!(r.bonus&&r.openBy&&r.reqDays&&r.reqMoney&&r.count);
    r.bankRulesApplied=uniq((r.bankRulesApplied||[]).concat('Academy Bank Elite Investment Checking'));
    r.academyRulesVersion=VER;
    return r;
  }

  function wrap(){
    if(window.__tcV3AcademyRulesWrapped)return;
    if(typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){ return applyAcademyElite(base(raw,opts)); };
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV3AcademyRulesWrapped=true;
  }

  window.tcV3ApplyAcademyEliteRule=applyAcademyElite;
  window.tcV3AcademyRulesVersion=VER;
  setTimeout(wrap,80);setTimeout(wrap,500);setTimeout(wrap,1400);
})();