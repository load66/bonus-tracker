/*
 * filename: profile-registry.js
 * version: 3.3.40
 * purpose: Analyzer profile registry for reusable saved bank bonus profiles, including Chase Total Checking.
 * last-touched: 2026-05-02
 */
(function(){
  const VER='3.3.78-profile-registry';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const PROFILES=[
    {
      id:'guaranty-bank-perks-consumer-checking',
      bank:'Guaranty Bank',
      product:'Perks consumer checking',
      type:'personal checking',
      status:'saved',
      signals:[/Guaranty Bank|Gbank|gbankmo/i,/Perks Truth in Savings Addendum|Perks Banking/i,/New Consumer Checking Account Bonus Offer|consumer checking account bonus/i,/RoundUp Program|Early Closing Fee/i],
      requirements:'Open new consumer checking with $25-$50 minimum opening deposit + at least one ACH direct deposit or ACH direct debit within 90 calendar days of account opening; account open at least 30 days and positive balance at end of 90-day qualifying period; payout within 30 calendar days after requirements are met; $20 early closing fee if closed within 90 calendar days of account opening; 12-month closed-account eligibility rule; Missouri resident required; business accounts not eligible',
      note:'Saved profile: Guaranty Bank / GBank Perks consumer checking $300 bonus. Personal checking only. Close rule basis is opened date, 90 hold days, 3-day buffer, $20 early close fee. If bonus received May 7, 2026, keep the received date saved in the entry; safe close still follows opened date + 90 days + buffer.'
    },
    {
      id:'busey-bank-personal-checking-levelup',
      bank:'Busey Bank',
      product:'Foundation Checking / Pillar Banking',
      type:'personal checking',
      status:'saved',
      signals:[/Busey Bank|Busey/i,/Foundation Checking|Pillar Banking|LEVELUP1|LEVELUP2/i,/Busey Debit Mastercard|tiered credit/i],
      requirements:'Promo code + online banking + 3 debit transactions + tiered DD within 90 days',
      note:'Saved profile: Busey Bank Foundation Checking / Pillar Banking tiered direct deposit bonus.'
    },
    {
      id:'equity-bank-bloom-checking-savings',
      bank:'Equity Bank',
      product:'Bloom checking + savings combo',
      type:'personal checking + savings',
      status:'saved',
      signals:[/Equity Bank|Equity Bancshares/i,/Bloom Bonus|Bloom/i,/checking and savings|new checking and savings|Enter Promotional Code/i],
      requirements:'Open/fund checking+savings combo + $1,000 DD + debit card use within 45 days',
      note:'Saved profile: Equity Bank Bloom checking + savings combo bonus. Bonus amount may need review if not included in pasted T&C.'
    },
    {
      id:'regions-lifegreen-personal-checking',
      bank:'Regions Bank',
      product:'LifeGreen personal checking',
      type:'personal checking',
      status:'saved',
      signals:[/Regions/i,/LifeGreen|personal Regions checking/i,/Qualifying ACH direct deposits|Register before you open/i],
      requirements:'Register before opening + $1,000+ qualifying ACH direct deposits within 90 days',
      note:'Saved profile: Regions LifeGreen personal checking ACH direct deposit bonus. Bonus amount may need review if not included in pasted T&C.'
    },
    {
      id:'pnc-virtual-wallet-consumer-checking',
      bank:'PNC',
      product:'Virtual Wallet / Virtual Wallet with Performance Select',
      type:'personal checking',
      status:'saved',
      signals:[/\bPNC\b|PNC Bank/i,/Virtual Wallet|Performance Select/i,/CREDITS CHECK REWARD|Spend account|qualifying direct deposit/i],
      requirements:'Tiered qualifying direct deposit within 60 days; $100 for $500+ DD or $400 for $5,000+ DD',
      note:'Saved profile: PNC Virtual Wallet consumer checking tiered direct deposit reward.'
    },
    {
      id:'bank-of-america-business-advantage-banking',
      bank:'Bank of America',
      product:'Business Advantage Banking',
      type:'business checking',
      status:'saved',
      signals:[/Bank of America|BofA/i,/Business Advantage Banking|Business Advantage Relationship Banking|Business Advantage Fundamentals/i,/Maintenance Period|Balance Requirement|\$400 or \$750/i],
      requirements:'Tiered new money deposit by day 30 + daily balance hold from day 31 through day 90',
      note:'Saved profile: Bank of America Business Advantage Banking $400/$750 new money + maintenance period bonus.'
    },
    {
      id:'capital-one-business-checking-sboffer500',
      bank:'Capital One',
      product:'Basic or Enhanced Business Checking',
      type:'business checking',
      status:'saved',
      signals:[/Capital One/i,/SBOFFER500|Basic or Enhanced checking|Basic Checking|Enhanced Checking/i,/10 qualifying electronic transactions|minimum end-of-day balance/i],
      requirements:'$5,000 external deposit by day 30 + 60-day balance hold within 90 days + 10 electronic transactions',
      note:'Saved profile: Capital One Basic/Enhanced Business Checking SBOFFER500 bonus.'
    },
    {
      id:'bmo-business-checking-tiered-hold',
      bank:'BMO',
      product:'Digital/Simple/Premium/Elite Business Checking',
      type:'business checking',
      status:'saved',
      signals:[/\bBMO\b/i,/Business Checking/i,/Day 30|Day 31 to Day 90|Day 31 through Day 90/i],
      requirements:'Tiered Day 30 balance check + Day 31–90 hold',
      note:'Saved profile: BMO Business Checking tiered Day 30 + Day 31–90 balance hold bonus.'
    },
    {
      id:'chase-total-checking-personal',
      bank:'Chase',
      product:'Chase Total Checking',
      type:'personal checking',
      status:'saved',
      signals:[/Chase Total Checking/i,/direct deposits totaling \$[\d,]+ or more/i,/within 90 days of coupon enrollment/i,/new Chase Total Checking account/i],
      requirements:'Coupon-specific direct deposit amount within 90 days; payout typically within 15 days after requirements are completed',
      note:'Saved profile: Chase Total Checking personal checking. Coupon bonus and DD amount can vary, so review/correct those fields after Auto-Fill.'
    },
    {
      id:'chase-business-complete-checking',
      bank:'Chase',
      product:'Business Complete Checking',
      type:'business checking',
      status:'saved',
      signals:[/Chase Business Complete Checking/i,/business checking offer/i,/JPMorgan Chase/i,/5 qualifying transactions|five qualifying transactions/i],
      requirements:'New money funding + 60-day hold + 5 qualifying transactions',
      note:'Saved profile: Chase Business Complete Checking business bonus.'
    },
    {
      id:'wells-fargo-business-checking',
      bank:'Wells Fargo',
      product:'Initiate/Navigate/Optimize Business Checking',
      type:'business checking',
      status:'saved',
      signals:[/Wells Fargo/i,/Initiate Business Checking|Navigate Business Checking|Optimize Business Checking/i,/minimum daily collected balance/i],
      requirements:'Deposit $2,500 by day 30 + maintain through day 60',
      note:'Saved profile: Wells Fargo Business Checking deposit + hold bonus.'
    },
    {
      id:'bank-of-america-personal-checking-chart',
      bank:'Bank of America',
      product:'Advantage personal checking',
      type:'personal checking',
      status:'saved',
      signals:[/Bank of America|BofA/i,/Advantage SafeBalance|Advantage Plus|Advantage Relationship/i,/Bonus Chart/i],
      requirements:'Tiered direct deposit chart',
      note:'Saved profile: Bank of America personal checking bonus chart.'
    },
    {
      id:'morgan-stanley-private-bank-checking-checking25',
      bank:'Morgan Stanley Private Bank / E*TRADE',
      product:'Checking — CHECKING25 no-monthly-fee default',
      type:'personal checking',
      status:'saved',
      signals:[
        /Morgan Stanley Private Bank|E\*TRADE|etrade/i,
        /Checking OR Max-Rate Checking|Checking or Max-Rate Checking|Max-Rate Checking|Bank Checking/i,
        /CHECKING25|valid promotional code|promo code/i,
        /two Direct Deposits|at least two Direct Deposits|each of \$?1,?500|\$1,500 or more/i,
        /120th day|first 90 days|up to 30 days/i
      ],
      requirements:'Promo code CHECKING25. Default to regular Checking because it has $0 monthly account fee. Offer also mentions Max-Rate Checking, but Max-Rate has a $15 monthly account fee unless waived with $5,000+ average monthly balance. Open one new Checking account online by the offer deadline. No minimum initial deposit required, but the account must be funded within 90 days to remain open. Receive at least two regular recurring ACH Direct Deposits of income, each $1,500 or more, within 90 days of account opening. Bonus is assessed after the first 90 days and processing can take up to 30 days; expected around day 120 from account opening. Must keep account open and in good standing until payout. Not eligible if customer owned or co-owned Checking or Max-Rate Checking within the last 12 months from offer enrollment. One checking offer at a time. Individual/joint online accounts only; primary owner receives bonus; non-U.S. residents excluded.',
      note:'Saved exact profile: Morgan Stanley Private Bank / E*TRADE CHECKING25 $300 personal checking offer. Default account selection is regular Checking because it has $0 monthly account fee. DD rule is 2 recurring income ACH direct deposits of $1,500+ each within 90 days. Payout expected around day 120. Close risk is payout risk only: keep open/good standing until bonus posts, then normal 3-day buffer. If user intentionally chooses Max-Rate Checking, monthly fee is $15 waived with $5,000+ average monthly balance after the second calendar month.'
    },
    {
      id:'us-bank-smartly-checking',
      bank:'U.S. Bank',
      product:'Smartly Checking',
      type:'personal checking',
      status:'generic-covered',
      signals:[/U\.S\. Bank|US Bank/i,/Smartly Checking/i,/direct deposits.*\$2,000|\$8,000 or more/i],
      requirements:'Tiered direct deposit bonus; generic parser covers it, dedicated profile can be added if needed',
      note:'Generic-covered profile: U.S. Bank Smartly Checking.'
    }
  ];
  function matchProfile(raw){
    raw=String(raw||'');
    let best=null,bestScore=0;
    PROFILES.forEach(p=>{
      const score=(p.signals||[]).reduce((n,re)=>n+(re.test(raw)?1:0),0);
      if(score>bestScore){bestScore=score;best=p;}
    });
    if(best&&bestScore>=2)return {...best,score:bestScore,known:true};
    return {known:false,status:'new-or-review',note:'No saved exact profile found. Send this sample so it can be added as a reusable bank profile.'};
  }
  function list(){return PROFILES.slice();}
  function moneyNum(v){const n=parseFloat(String(v||'').replace(/[$,\s]/g,''));return Number.isFinite(n)?n:0}
  function money(n){return '$'+Number(n||0).toLocaleString()}
  function profileFallbackFromMatch(p){
    const txt=clean([p?.requirements,p?.note,p?.product,p?.type].filter(Boolean).join('. '));
    const out={};
    if(!txt)return out;
    let m;
    if((m=txt.match(/(?:direct deposit|direct deposits|DD|ACH)[^.;]{0,80}within\s+(\d{1,3})\s+days/i))||(m=txt.match(/within\s+(\d{1,3})\s+days[^.;]{0,80}(?:direct deposit|direct deposits|DD|ACH)/i)))out.reqDays=parseInt(m[1],10)||0;
    if(!out.reqDays&&/direct deposit|DD|ACH/i.test(txt)){const ds=[...txt.matchAll(/(\d{1,3})\s+days/gi)].map(x=>parseInt(x[1],10)).filter(Boolean);if(ds.length)out.reqDays=Math.max(...ds)}
    const clauses=txt.split(/[.;]/).filter(x=>/direct deposit|DD|ACH|qualifying/i.test(x));
    const ddMoney=[];
    clauses.forEach(c=>{[...c.matchAll(/\$\s*[0-9][0-9,]*(?:\.\d+)?/g)].forEach(x=>{const v=moneyNum(x[0]);if(v>=100)ddMoney.push(v)})});
    if(ddMoney.length)out.reqMoney=Math.max(...ddMoney);
    if(/at least two|two or more/i.test(txt))out.count=2;
    else if((m=txt.match(/(\d{1,2})\s+(?:qualifying\s+)?(?:electronic\s+)?transactions?/i)))out.count=parseInt(m[1],10)||0;
    if((m=txt.match(/(?:fund|funding|new money|external deposit|opening deposit)[^.;]{0,80}within\s+(\d{1,3})\s+days/i))||(m=txt.match(/by\s+day\s+(\d{1,3})/i)))out.fundedDays=parseInt(m[1],10)||0;
    const fundClauses=txt.split(/[.;]/).filter(x=>/fund|funding|new money|external deposit|opening deposit|day 30 balance/i.test(x)&&!/direct deposit|DD|ACH/i.test(x));
    const fundMoney=[];
    fundClauses.forEach(c=>{[...c.matchAll(/\$\s*[0-9][0-9,]*(?:\.\d+)?/g)].forEach(x=>{const v=moneyNum(x[0]);if(v>=100)fundMoney.push(v)})});
    if(fundMoney.length)out.fundingAmount=Math.max(...fundMoney);
    if((m=txt.match(/through\s+day\s+(\d{1,3})/i))||(m=txt.match(/day\s+\d{1,3}\s*(?:-|–|through|to)\s*day\s+(\d{1,3})/i))||(m=txt.match(/(\d{1,3})[- ]day\s+hold/i)))out.minHoldDays=parseInt(m[1],10)||0;
    return out;
  }
  function addProfileSource(r,field,value,source){
    r.fieldSources=r.fieldSources||{};r.sourceSnippets=r.sourceSnippets||[];r.fieldConfidence=r.fieldConfidence||{};
    const item={field,value:String(value),source,confidence:'profile-fallback',kind:'known-bank-profile'};
    r.fieldSources[field]=item;r.fieldConfidence[field]='profile-fallback';
    if(!r.sourceSnippets.some(x=>x.field===field&&x.kind==='known-bank-profile'))r.sourceSnippets.push(item);
  }
  function currentOfferIsStrong(r){
    return !!(r&&(r.hasExplicitCurrentOffer||r.tiered||r.requirementType==='transactions'||r.fundedDays||r.holdDays||r.minHoldDays));
  }
  function removeProfileFallbackArtifacts(r){
    if(!r)return r;
    r.profileFallbacks=[];
    r.profileFallbackSummary='';
    r.reviewFlags=(r.reviewFlags||[]).filter(x=>!/profile fallback|saved profile|saved .*pasted|Requirement amount missing|Possible missing fields|Requirement deadline|Qualification path|Bonus amount not found/i.test(String(x||'')));
    r.sourceSnippets=(r.sourceSnippets||[]).filter(x=>!(x&&String(x.confidence||'')==='profile-fallback')&&!(x&&String(x.kind||'')==='known-bank-profile'));
    if(r.fieldSources){Object.keys(r.fieldSources).forEach(k=>{const x=r.fieldSources[k];if(x&&(x.confidence==='profile-fallback'||x.kind==='known-bank-profile'))delete r.fieldSources[k]});}
    if(r.fieldConfidence){Object.keys(r.fieldConfidence).forEach(k=>{if(r.fieldConfidence[k]==='profile-fallback')delete r.fieldConfidence[k]});}
    return r;
  }
  function fixCurrentChaseBusinessOffer(r,raw){
    raw=String(raw||'');
    if(!r||!/Chase Business Complete Checking/i.test(raw))return r;
    if(!/earn\s*\$\s*500\s+with\s+(?:a\s+)?minimum\s+\$\s*2,?000/i.test(raw)||!/earn\s*\$\s*1,?500\s+with\s+(?:a\s+)?minimum\s+\$\s*100,?000/i.test(raw))return r;
    const tiers=[];let m;const re=/earn\s*\$\s*([0-9,]+)\s+with\s+(?:a\s+)?minimum\s+\$\s*([0-9,]+)\s+deposit(?:\s+in\s+new\s+money)?/gi;
    while((m=re.exec(raw)))tiers.push({bonus:moneyNum(m[1]),requirement:moneyNum(m[2]),maxRequirement:0,confidence:'High',source:clean(m[0])});
    if(!tiers.length)return r;
    tiers.sort((a,b)=>a.requirement-b.requirement);
    r.bank='Chase';r.acct='Chase Business Complete Checking';r.tiers=tiers;r.tiered=true;r.targetTier=tiers[tiers.length-1];r.bonus=r.selectedBonus=r.targetTier.bonus;r.bonusTierText=tiers.map(t=>money(t.bonus)+' for '+money(t.requirement)+'+ new money').join(' / ');
    r.reqMoney=0;r.reqIsTotal=false;r.requirementType='transactions';r.requirementNoun='qualifying transactions';r.count=5;r.reqDays=90;r.fundedDays=30;r.fundingAmount=r.targetTier.requirement;r.holdDays=60;r.minHoldDays=60;r.hasExplicitCurrentOffer=true;
    r.counts=['New money deposit into the new Chase business checking account','Debit card purchases','Chase QuickDeposit','ACH credits','Wires credits and debits','Chase Online Bill Pay','Chase QuickAccept'];
    r.not=r.notCounts=['ACH debits','Person-to-person payments / P2P transfers including Zelle','Online transfers to Chase credit cards'];
    r.payout=r.payoutText='within 15 days after all checking requirements are completed';
    r.forceActionPlan=true;
    r.actionPlan=['1. Open a new Chase Business Complete Checking account using the offer code.','2. Deposit new money within 30 days: '+r.bonusTierText+'.','3. Maintain the required new-money balance for 60 days from offer enrollment.','4. Complete 5 qualifying transactions within 90 days of offer enrollment.','5. Keep the account open and unrestricted until payout.'].join('\n');
    r.suggestedTimers=[
      {kind:'days',text:'Deposit new money / funding deadline',daysRequired:30,source:'current pasted Chase Business offer'},
      {kind:'days',text:'Maintain required new-money balance',daysRequired:60,source:'current pasted Chase Business offer'},
      {kind:'days',text:'Complete 5 qualifying transactions',daysRequired:90,source:'current pasted Chase Business offer'}
    ];
    removeProfileFallbackArtifacts(r);
    r.clear=true;
    return r;
  }
  function rebuildActionPlan(r){
    const lines=[];let step=1;
    lines.push(`${step++}. Open one eligible account${r.openBy?' by '+r.openBy:''}${r.code?' using promo code '+r.code:''}.`);
    if(r.fundedDays)lines.push(`${step++}. Deposit new money / fund the account${r.fundingAmount?' with at least '+money(r.fundingAmount):''} within ${r.fundedDays} days.`);
    if(r.holdDays||r.minHoldDays)lines.push(`${step++}. Maintain the required new-money balance for ${r.holdDays||r.minHoldDays} days.`);
    if(r.requirementType==='transactions')lines.push(`${step++}. Complete ${r.count||''} qualifying transactions${r.reqDays?' within '+r.reqDays+' days':''}.`);
    else lines.push(`${step++}. Complete ${r.count?'at least '+r.count+' ':''}qualifying Direct Deposits${r.reqMoney?`${r.reqIsTotal?' totaling ':' of '}${money(r.reqMoney)}+${r.reqIsTotal?'':' each'}`:''}${r.reqDays?' within '+r.reqDays+' days':''}.`);
    lines.push(`${step++}. Bonus payout: ${r.payout||'payout timing needs review'}.`);
    lines.push(`${step++}. Keep account open and in good standing until payout.`);
    r.actionPlan=lines.filter(Boolean).join('\n');
  }
  function applyKnownProfileFallback(r,m){
    if(!r||!m||!m.known)return r;
    const fb=profileFallbackFromMatch(m);
    const used=[];
    const src='Known profile: '+(m.product||m.bank||m.id)+' — '+(m.requirements||m.note||'saved bank profile');
    if(m.id==='morgan-stanley-private-bank-checking-checking25'){
      r.bank=r.bank||'Morgan Stanley Private Bank / E*TRADE';
      r.acct='Checking';
      r.noFeeDefaultAccount='Checking';
      r.accountChoiceReason='Regular Checking selected because it has $0 monthly account fee; Max-Rate Checking has a $15 monthly account fee unless waived with $5,000 average monthly balance.';
      r.bonus=r.bonus||300;
      r.selectedBonus=r.selectedBonus||300;
      r.code=r.code||'CHECKING25';
      r.reqDays=r.reqDays||90;
      r.count=r.count||2;
      r.reqMoney=r.reqMoney||1500;
      r.reqIsTotal=false;
      r.requirementType=r.requirementType||'direct-deposit';
      r.requirementNoun=r.requirementNoun||'recurring income ACH direct deposits';
      r.payout=r.payout||'after first 90 days are assessed; processing can take up to 30 days; expected around day 120 from account opening';
      r.payoutText=r.payoutText||r.payout;
      r.monthlyFeeYNText='No monthly account fee for regular Checking';
      r.avoidMonthlyFeeText='Default to regular Checking to avoid monthly fee. Max-Rate Checking has a $15 monthly account fee unless waived with $5,000 average monthly balance on or after the end of the second calendar month from opening.';
      r.monthlyFeeAmountText='$0 monthly account fee';
      r.monthlyFeeFrequency='monthly';
      r.monthlyFeeWaiverType='No-fee account choice';
      r.monthlyFeeWaiverAmountText='$0 monthly fee with regular Checking';
      r.monthlyFeeWaiverText='Choose regular Checking instead of Max-Rate Checking for $0 monthly account fee.';
      r.holdDays=0;
      r.minHoldDays=0;
      r.closeRuleDays=0;
      r.earlyCloseFee=0;
      r.closeRuleBasis='bonus';
      r.closeBufferDays=3;
      r.closeRuleText='Must keep account open and in good standing until bonus payment. If account is defaulted, restricted, or closed before bonus payment, bonus may be denied.';
      r.eligibilityText=r.eligibilityText||'Not eligible if customer has or had owned/co-owned a Morgan Stanley Private Bank Checking or Max-Rate Checking account within the last 12 months from offer enrollment. One Checking OR Max-Rate Checking account only; if both are opened, Checking is enrolled. One checking offer at a time. Individual/joint online accounts only; primary owner receives bonus. Non-U.S. residents excluded. Promo code single-use and non-transferable.';
      r.counts=r.counts||['Regular recurring ACH direct deposit of income','Salary','Pension','Government payments such as Social Security','Employer payroll','Benefits provider payments','Government agency payments'];
      r.not=r.notCounts=r.notCounts||['Incoming wires','Check deposits','Mobile check deposits','P2P transfers including PayPal and Venmo','Merchant transactions such as PayPal, Stripe, Square','Zelle incoming payments','Real-Time Payment network transactions','E*TRADE Transfer Money transactions','Internal Morgan Stanley transfers','Brokerage transfers','Online transfers','Bank-to-bank transfers not from employer or government','ACH transfers not from employer or government'];
      r.suggestedTimers=r.suggestedTimers||[];
      if(!r.suggestedTimers.some(t=>/recurring income ACH DDs/i.test(t.text||'')))r.suggestedTimers.push({kind:'days',text:'Complete 2 recurring income ACH DDs of $1,500+ each',daysRequired:90,source:'Morgan Stanley CHECKING25 profile'});
      if(!r.suggestedTimers.some(t=>/bonus payout watch/i.test(t.text||'')))r.suggestedTimers.push({kind:'days',text:'Bonus payout watch / expected around day 120',daysRequired:120,source:'Morgan Stanley CHECKING25 profile'});
      r.reviewFlags=(r.reviewFlags||[]).filter(x=>!/monthly fee|close rule|payout timing|hold period|450/i.test(String(x||'')));
      r.reviewFlags.push('No-fee account default: regular Checking selected because it avoids the Max-Rate $15 monthly fee.');
      r.reviewFlags.push('Profile guard: no early-close hold countdown for this offer; close risk is payout only.');
      r.clear=!!(r.bonus&&r.reqDays&&r.reqMoney&&r.count);
    }
    if(m.id==='guaranty-bank-perks-consumer-checking'){
      fb.reqDays=fb.reqDays||90;
      fb.count=fb.count||1;
      fb.minHoldDays=fb.minHoldDays||90;
      fb.earlyCloseFee=fb.earlyCloseFee||20;
      fb.closeRuleBasis='opened';
      fb.closeBufferDays=3;
      fb.closeRuleText='Early closing fee of $20 if consumer checking account is closed within 90 calendar days of account opening.';
      fb.payoutTimingText='within 30 calendar days after all qualifying requirements are met';
      fb.eligibilityText='New Guaranty Bank consumer checking client only. Cannot have closed a Guaranty Bank consumer checking account within the previous 12-month period. Current consumer checking accountholders and business accounts are not eligible. Missouri resident required. Customers who previously received a new account bonus are not eligible.';
      fb.monthlyFeeYNText='Paper statement fee $2-$3 if receiving paper statements; eStatements free with valid email.';
      fb.avoidMonthlyFeeText='Use eStatements with a valid email to avoid the paper statement fee.';
    }
    const set=(key,label,value,display)=>{if(!value)return;if(r[key])return;if(currentOfferIsStrong(r)&&['bonus','reqMoney','count','reqDays','fundedDays','fundingAmount','minHoldDays','holdDays'].includes(key))return;if(r.requirementType==='transactions'&&(key==='reqMoney'||key==='count'))return;if(r.hasExplicitCurrentOffer&&(key==='reqMoney'||key==='count'||key==='reqDays'))return;r[key]=value;used.push({field:label,value:display||String(value),source:src});addProfileSource(r,label,display||String(value),src)};
    set('reqDays','Requirement days',fb.reqDays,fb.reqDays?fb.reqDays+' days':'');
    set('reqMoney','Requirement amount',fb.reqMoney,fb.reqMoney?money(fb.reqMoney):'');
    set('count','Required count',fb.count,fb.count?String(fb.count):'');
    set('fundedDays','Funding deadline',fb.fundedDays,fb.fundedDays?fb.fundedDays+' days':'');
    set('fundingAmount','Funding amount',fb.fundingAmount,fb.fundingAmount?money(fb.fundingAmount):'');
    set('minHoldDays','Hold period',fb.minHoldDays,fb.minHoldDays?fb.minHoldDays+' days':'');
    set('earlyCloseFee','Early close fee',fb.earlyCloseFee,fb.earlyCloseFee?money(fb.earlyCloseFee):'');
    set('closeRuleBasis','Close rule basis',fb.closeRuleBasis,fb.closeRuleBasis||'');
    set('closeBufferDays','Close buffer days',fb.closeBufferDays,fb.closeBufferDays?fb.closeBufferDays+' days':'');
    set('closeRuleText','Close rule wording',fb.closeRuleText,fb.closeRuleText||'');
    set('payoutTimingText','Payout timing',fb.payoutTimingText,fb.payoutTimingText||'');
    set('eligibilityText','Eligibility / churn',fb.eligibilityText,fb.eligibilityText||'');
    set('monthlyFeeYNText','Monthly fee',fb.monthlyFeeYNText,fb.monthlyFeeYNText||'');
    set('monthlyFeeAmountText','Monthly fee amount',fb.monthlyFeeAmountText,fb.monthlyFeeAmountText||'');
    set('monthlyFeeFrequency','Monthly fee frequency',fb.monthlyFeeFrequency,fb.monthlyFeeFrequency||'');
    set('monthlyFeeWaiverType','Monthly fee waiver type',fb.monthlyFeeWaiverType,fb.monthlyFeeWaiverType||'');
    set('monthlyFeeWaiverAmountText','Monthly fee waiver amount',fb.monthlyFeeWaiverAmountText,fb.monthlyFeeWaiverAmountText||'');
    set('monthlyFeeWaiverText','Monthly fee waiver wording',fb.monthlyFeeWaiverText,fb.monthlyFeeWaiverText||'');
    set('avoidMonthlyFeeText','Avoid monthly fee',fb.avoidMonthlyFeeText,fb.avoidMonthlyFeeText||'');
    if(used.length){
      r.profileFallbacks=(r.profileFallbacks||[]).concat(used);
      r.profileFallbackSummary='Used saved bank profile for missing fields: '+used.map(x=>x.field+' '+x.value).join(', ')+'. Verify against current offer terms.';
      r.reviewFlags=r.reviewFlags||[];
      r.reviewFlags.push('Known bank profile fallback used for missing fields. Verify current T&C before applying.');
      if(r.reqDays)r.reviewFlags=r.reviewFlags.filter(x=>!/^Requirement deadline needs review/i.test(x));
      if(r.openBy)r.reviewFlags=r.reviewFlags.filter(x=>!/^Promo expiration\/open-by date needs review/i.test(x));
      r.clear=!!(r.bonus&&r.reqDays);
      rebuildActionPlan(r);
    }
    return r;
  }
  function wrap(){
    if(window.__tcV3ProfileRegistryWrapped)return;
    if(typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){
      const r=base(raw,opts);
      const m=matchProfile(raw||r?.normalizedRaw||r?.raw||'');
      if(r){
        r.profileRegistry=m;
        r.profileRegistryVersion=VER;
        r.profileKnown=!!m.known;
        r.profileStatus=m.status;
        r.profileNote=m.note;
        fixCurrentChaseBusinessOffer(r,raw||r.normalizedRaw||r.raw||'');
        applyKnownProfileFallback(r,m);
        if(currentOfferIsStrong(r))removeProfileFallbackArtifacts(r);
      }
      return r;
    };
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV3ProfileRegistryWrapped=true;
  }
  window.tcV3KnownProfiles=list;
  window.tcV3MatchKnownProfile=matchProfile;
  window.tcV3ProfileRegistryVersion=VER;
  wrap();setTimeout(wrap,80);setTimeout(wrap,500);setTimeout(wrap,1400);
})();