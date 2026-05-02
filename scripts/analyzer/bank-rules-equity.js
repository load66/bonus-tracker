/*
 * filename: scripts/analyzer/bank-rules-equity.js
 * version: 3.0.10
 * purpose: Equity Bank Bloom checking+savings combo saved profile.
 * last-touched: unknown
 */
(function(){
  const VER='3.0.10';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean).map(clean))).filter(Boolean);
  const money=n=>'$'+Number(n||0).toLocaleString();

  function findBonus(raw){
    const m=String(raw||'').match(/(?:bonus|incentive|offer)\s*(?:amount|of)?\s*(?:up to)?\s*\$\s*([0-9]{2,4})/i);
    if(!m)return 0;
    const n=Number(String(m[1]).replace(/,/g,''));
    return Number.isFinite(n)&&n>0&&n<5000?n:0;
  }

  function applyEquityBloom(r){
    const raw=String(r?.raw||r?.normalizedRaw||'');
    if(!/Equity Bank|Equity Bancshares|Bloom/i.test(raw))return r;
    if(!/checking and savings|new checking and savings|Bloom Bonus|Enter Promotional Code/i.test(raw))return r;

    const foundBonus=findBonus(raw);
    r.bank='Equity Bank';
    r.acct='Equity Bank Bloom checking + savings combo';
    r.tiered=false;
    r.tiers=[];
    r.targetTier=null;
    r.bonus=foundBonus||0;
    r.selectedBonus=foundBonus||0;
    r.bonusTierText=foundBonus?`${money(foundBonus)} Equity Bank Bloom bonus`:'Bonus amount not shown in pasted T&C';

    r.openBy='2026-06-30';
    r.expiration={value:'2026-06-30',display:'Jun 30, 2026',confidence:'High',source:'Promotion available from April 1, 2026 to June 30, 2026.'};
    r.code='Bloom';
    r.promoCode={value:'Bloom',confidence:'High',source:'When opening online, enter Bloom under Enter Promotional Code; in branch, mention Bloom offer.'};

    r.reqMoney=1000;
    r.reqIsTotal=true;
    r.reqDays=45;
    r.fundedDays=45;
    r.fundingAmount=100;
    r.holdDays=0;
    r.depositHoldRequirement=false;
    r.count=0;
    r.transactionRequirement=true;
    r.debitCardRequirement=true;
    r.comboAccountRequirement=true;

    r.fee=0;
    r.monthlyFee=null;
    r.waivers=uniq(['Monthly fee not clearly stated in pasted T&C — review Equity Bank account fee schedule']);

    r.counts=uniq([
      'Open and fund both a new Equity Bank checking account and savings account within 45 days of each other and no later than June 30, 2026',
      'Receive at least $1,000 in combined qualifying direct deposits into the new checking account within 45 days of account opening',
      'Activate and use Equity Bank debit card within 45 days of account opening',
      'Enter promo code Bloom when opening online, or mention Bloom offer at an Equity Bank location',
      'Maintain Equity Bank accounts in active and good standing at time of incentive payment',
      'Minimum $100 deposit may be required to open Equity Bank checking account'
    ]);

    r.not=r.notCounts=uniq([
      'Current Equity Bank households are not eligible',
      'Applicants linked as owner to open Equity Bank consumer checking, savings, or Money Market account within past 180 days are not eligible',
      'Only one Bloom offer permitted per household',
      'Promotion not available to current employees and employee household members of Equity Bancshares or subsidiaries',
      'Offer may be canceled without notice'
    ]);

    r.early='Accounts must remain active and in good standing at time of incentive payment. Offer is for new Equity Bank households only.';
    r.payout=r.payoutText='approximately 45 days after checking account opening, assuming all qualifications are met';
    r.eligibilityText=uniq([
      'Bloom Bonus Offer is available from Apr 1, 2026 to Jun 30, 2026.',
      'One Bloom offer permitted per household.',
      'Available for new Equity Bank households only and subject to review and approval.',
      'New household means applicant(s) not linked as an owner to open Equity Bank consumer checking, savings, or Money Market account within the past 180 days.',
      'Customer may receive incentive for opening both new checking and savings account during the promotion period.',
      'Promotion not available to current employees or employee household members of Equity Bancshares, Inc. or subsidiaries.',
      'Customer will be issued a 1099-INT for tax value of the incentive amount.'
    ]).join('\n');

    r.suggestedTimers=[];
    r.suggestedTimers.push(
      {kind:'due',text:'Promo expiration / open-by deadline',date:'2026-06-30'},
      {kind:'days',text:'Open/fund checking + savings deadline',daysRequired:45},
      {kind:'days',text:'Qualifying DD deadline',daysRequired:45},
      {kind:'days',text:'Debit card activation/use deadline',daysRequired:45},
      {kind:'days',text:'Expected incentive payout check',daysRequired:45}
    );

    r.forceActionPlan=true;
    r.actionPlan=[
      '1. Open and fund both a new Equity Bank checking account and savings account within 45 days of each other and no later than Jun 30, 2026.',
      '2. Use promo code Bloom when opening online, or mention the Bloom offer at an Equity Bank location.',
      '3. Receive at least $1,000 in combined qualifying direct deposits into the new checking account within 45 days of account opening.',
      '4. Activate and use the Equity Bank debit card within 45 days of account opening.',
      '5. Keep both accounts active and in good standing until incentive payment; payout is expected approximately 45 days after checking opening if qualified.'
    ].join('\n');

    r.reviewFlags=Array.isArray(r.reviewFlags)?r.reviewFlags:[];
    if(!foundBonus && !r.reviewFlags.includes('Bonus amount not shown in pasted Equity Bank T&C.')) r.reviewFlags.push('Bonus amount not shown in pasted Equity Bank T&C.');
    r.clear=!!(r.openBy&&r.reqDays&&r.reqMoney&&r.code);
    r.bankRulesApplied=uniq((r.bankRulesApplied||[]).concat('Equity Bank Bloom Checking Savings Combo'));
    r.equityRulesVersion=VER;
    return r;
  }

  function wrap(){
    if(window.__tcV3EquityRulesWrapped)return;
    if(typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){ return applyEquityBloom(base(raw,opts)); };
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV3EquityRulesWrapped=true;
  }

  window.tcV3ApplyEquityBloomRule=applyEquityBloom;
  window.tcV3EquityRulesVersion=VER;
  setTimeout(wrap,80);setTimeout(wrap,500);setTimeout(wrap,1400);
})();