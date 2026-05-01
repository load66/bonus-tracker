/* ✅ Version 2.9.0 Newest update: Unified Analyzer Engine. One parser powers Analyzer Pro, simple summary, auto-fill, timers, and saved T&C source. */
(function(){
  const VER='2.9.0';
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const lower=s=>clean(s).toLowerCase();
  const moneyNum=s=>{const n=parseFloat(String(s||'').replace(/[$,\s]/g,''));return isNaN(n)?0:n};
  const moneyFmt=n=>'$'+Number(n||0).toLocaleString();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean)));
  const esc=v=>{if(typeof window.esc==='function')return window.esc(String(v??''));const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML;};
  const splitSentences=t=>String(t||'').replace(/\r/g,'\n').split(/(?<=[.!?])\s+|\n+/).map(clean).filter(x=>x.length>8);
  const any=(s,res)=>res.some(r=>r.test(s||''));
  const first=(arr,res)=>arr.find(s=>any(s,res))||'';
  const all=(arr,res)=>arr.filter(s=>any(s,res));

  function moneyMentions(s){const a=[];String(s||'').replace(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?|[0-9]+(?:\.\d+)?)/g,m=>{a.push({text:m.replace(/\s+/g,''),value:moneyNum(m)});return m});return a;}
  function dayMentions(s){const a=[];String(s||'').replace(/(\d{1,4})\s*(calendar\s*)?(day|days)/gi,(m,n)=>{a.push({text:m,days:parseInt(n,10)});return m});String(s||'').replace(/(\d{1,2})\s*(month|months)/gi,(m,n)=>{a.push({text:m,days:parseInt(n,10)*30,months:parseInt(n,10)});return m});return a.filter(x=>x.days>0);}

  function dateMentions(t){
    const s=clean(t).replace(/,/g,' '), out=[];let m;
    const mo={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
    const add=(y,mm,d)=>{if(y&&mm&&d)out.push(`${y}-${String(mm).padStart(2,'0')}-${String(d).padStart(2,'0')}`)};
    const r1=/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/g;while((m=r1.exec(s)))add(m[1],m[2],m[3]);
    const r2=/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/g;while((m=r2.exec(s)))add(m[3],m[1],m[2]);
    const r3=/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(20\d{2})\b/gi;while((m=r3.exec(s)))add(m[3],mo[m[1].toLowerCase()],m[2]);
    return out;
  }
  function prettyDate(iso){try{return typeof fD==='function'?fD(iso):new Date(iso+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}catch{return iso||''}}
  function isDisclosure(s){return /\bas of\b|APY|Annual Percentage Yield|effective as of|ratesheet|rate sheet|interest rate|StockBrokers|U\.S\. News|award|recognized|competitor|FDIC insured/i.test(s||'');}

  function bankName(raw){const t=String(raw||'');if(/U\.S\. Bank|US Bank/i.test(t))return'U.S. Bank';if(/Morgan Stanley Private Bank|E\*TRADE/i.test(t))return'Morgan Stanley Private Bank';if(/Wells Fargo/i.test(t))return'Wells Fargo';if(/Bank of America|BofA/i.test(t))return'Bank of America';if(/Capital One/i.test(t))return'Capital One';if(/Chase/i.test(t))return'Chase';if(/Citi(?:bank)?/i.test(t))return'Citibank';if(/PNC/i.test(t))return'PNC Bank';if(/Community America Credit Union/i.test(t))return'Community America Credit Union';const m=t.match(/(?:from|with|by|new)\s+([A-Z][A-Za-z&.'’\- ]{2,90}?(?:Bank|Credit Union|Private Bank))/);return m?clean(m[1]):'New Bank Bonus';}
  function accountType(raw){if(/Bank Smartly/i.test(raw))return'U.S. Bank Smartly Checking';if(/Checking or Max-Rate Checking|Checking OR Max-Rate Checking|Checking Account OR Max-Rate Checking/i.test(raw))return'Checking OR Max-Rate Checking — open one only; do not enroll both';if(/consumer checking/i.test(raw))return'consumer checking';if(/business checking/i.test(raw))return'business checking';if(/checking/i.test(raw))return'checking';return'account type needs review';}

  function promoCode(raw,sentences){
    const bad=/^(OBTAINED|THROUGH|INTENDED|SINGLE|ONLY|VALID|REQUIRED|WHEN|TIME|ACCOUNT|OPENING|OFFER|CODE|PROMOTIONAL|AUTOMATICALLY|APPLIED|BANKER)$/i;
    const picks=[];const text=String(raw||'');
    const patterns=[/(?:apply|use|using|enter|provide|must apply)\s+(?:your\s+)?(?:valid\s+)?promo(?:tional)?\s+code\s+([A-Z0-9][A-Z0-9\-]{2,})/gi,/promo(?:tional)?\s+code\s*(?:is|:|=)?\s+([A-Z0-9][A-Z0-9\-]{2,})/gi,/offer\s+code\s*(?:is|:|=)?\s+([A-Z0-9][A-Z0-9\-]{2,})/gi,/coupon\s+code\s*(?:is|:|=)?\s+([A-Z0-9][A-Z0-9\-]{2,})/gi];
    patterns.forEach(re=>{let m;while((m=re.exec(text))){const c=String(m[1]||'').toUpperCase();if(/\d/.test(c)&&!bad.test(c))picks.push({value:c,confidence:'High',source:clean(m[0])});}});
    if(picks.length)return picks[picks.length-1];
    const line=first(sentences,[/promo(?:tional)?\s+code|offer code|coupon code/i]);
    return line?{value:'Mentioned — review required',confidence:'Low',source:line}:null;
  }

  function expiration(sentences){
    const c=all(sentences,[/open.*from .*20\d{2}.*through.*20\d{2}/i,/from .*20\d{2}.*through.*20\d{2}/i,/open(?:ing)?\s+.*\bby\b.*20\d{2}/i,/apply\s+.*\bby\b.*20\d{2}/i,/offer\s+(?:ends|expires|valid through|available through).*20\d{2}/i,/expires?.*20\d{2}/i,/expiration.*20\d{2}/i]).filter(s=>!isDisclosure(s));
    for(const s of c){const ds=dateMentions(s);if(ds.length){const iso=/through|including| to /i.test(s)?ds[ds.length-1]:ds[0];return{value:iso,display:prettyDate(iso),source:s,confidence:'High'};}}
    return null;
  }

  function tieredBonuses(raw){
    const text=String(raw||'').replace(/\s+/g,' ');const tiers=[];let m;
    const push=(req,max,bonus,src)=>{req=moneyNum(req);max=moneyNum(max);bonus=moneyNum(bonus);if(req>=100&&bonus>=25&&bonus<req)tiers.push({requirement:req,maxRequirement:max||0,bonus,source:clean(src),confidence:'High'});};
    const range=/\$\s*([0-9,]+(?:\.\d+)?)\s*(?:to|-|–)\s*\$\s*([0-9,]+(?:\.\d+)?)\s*to\s*earn\s*(?:the\s*)?\$\s*([0-9,]+(?:\.\d+)?)\s*bonus/gi;while((m=range.exec(text)))push(m[1],m[2],m[3],m[0]);
    const plus=/\$\s*([0-9,]+(?:\.\d+)?)\s*(?:or\s+more|\+)\s*to\s*earn\s*(?:the\s*)?\$\s*([0-9,]+(?:\.\d+)?)\s*bonus/gi;while((m=plus.exec(text)))push(m[1],0,m[2],m[0]);
    const depThenBonus=/(?:direct deposits?|deposits?|new money|balance)[^.]{0,120}?\$\s*([0-9,]+(?:\.\d+)?)[^.]{0,120}?(?:earn|receive|get)[^.]{0,40}?\$\s*([0-9,]+(?:\.\d+)?)[^.]{0,20}?bonus/gi;while((m=depThenBonus.exec(text)))push(m[1],0,m[2],m[0]);
    const seen=new Set();return tiers.filter(t=>{const k=t.requirement+'|'+t.bonus;if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>a.requirement-b.requirement);
  }

  function singleBonus(sentences){
    const candidates=[];
    all(sentences,[/bonus/i,/earn/i,/receive/i,/cash/i]).forEach(s=>{
      if(/\$[\d,.]+\s*(?:to|-|–)\s*\$[\d,.]+\s*to earn|or more\s*to earn/i.test(s))return;
      moneyMentions(s).forEach(m=>{let score=0;if(m.value>=25&&m.value<3000){if(/bonus/i.test(s))score+=4;if(/earn|receive|credited|cash/i.test(s))score+=2;if(/deposit|balance|APY|fee|waive|minimum/i.test(s))score-=2;candidates.push({...m,source:s,score,confidence:score>=4?'High':'Medium'});}});
    });
    return candidates.sort((a,b)=>b.score-a.score||b.value-a.value)[0]||null;
  }

  function reqInfo(raw,sentences,tiers){
    const target=tiers.length?tiers[tiers.length-1]:null;
    const line=first(sentences,[/direct deposits?.*within\s+\d+\s+days/i,/within\s+\d+\s+days.*direct deposits?/i,/two or more direct deposits/i,/at least two Direct Deposits/i,/receipt of at least two Direct Deposits/i,/qualifying electronic deposits?.*within/i])||first(sentences,[/receive.*\$|\$.*qualifying|qualification period/i]);
    const reqDays=(dayMentions(line).sort((a,b)=>b.days-a.days)[0]||{}).days||0;
    const ddCount=/two or more|at least\s+two|first\s+two|\btwo\s+direct deposits|\b2\s+direct deposits/i.test(line||raw)?2:0;
    const reqMoney=target?.requirement||((moneyMentions(line).filter(x=>x.value>=100).sort((a,b)=>b.value-a.value)[0]||{}).value||0);
    return{reqMoney,reqIsTotal:!!target||/total|totaling|aggregate|combined/i.test(line||''),reqDays,count:ddCount,source:line||target?.source||'',targetTier:target};
  }

  function funding(sentences){const line=first(sentences,[/funded with.*within .*day/i,/funded within .*day/i,/must be funded within .*day/i,/minimum of .*required to open/i,/minimum.*open/i]);return{fundedDays:(dayMentions(line).sort((a,b)=>b.days-a.days)[0]||{}).days||0,fundingAmount:(moneyMentions(line).filter(x=>x.value>=1&&x.value<1000).sort((a,b)=>b.value-a.value)[0]||{}).value||0,source:line};}

  function counts(raw,sentences){
    const pos=all(sentences,[/Direct Deposit means/i,/direct deposit is/i,/qualifying electronic deposit is/i,/regular recurring deposit of income/i,/salary|paycheck|pension|government payments|social security|employer|payroll|benefits provider/i,/ACH Network|Automated Clearing House|\bACH\b/i,/Original Credit Transaction|Visa|Mastercard|FedNow|RTP/i]).filter(s=>!/do not|does not|not considered|not constitute|not regular|includes but is not limited to|cannot|excludes|not eligible/i.test(s)).join(' ');
    const out=[];if(/regular recurring deposit of income/i.test(pos))out.push('Regular recurring income direct deposit');if(/ACH Network|Automated Clearing House|\bACH\b/i.test(pos))out.push('ACH direct deposit');if(/salary|paycheck|pension|government payments|social security|employer|payroll|benefits provider|government agency/i.test(pos))out.push('Salary/paycheck, pension, Social Security/government benefits, employer/government income');if(/RTP|real-time payment|FedNow/i.test(pos))out.push('RTP/FedNow instant payment');if(/Visa|Mastercard|Original Credit Transaction|debit card/i.test(pos))out.push('Eligible debit-card network electronic credit / OCT');if(!out.length&&/direct deposit/i.test(raw))out.push('Qualifying direct deposit — verify definition');return uniq(out);
  }

  function exclusions(raw,sentences){
    const ex=all(sentences,[/do not constitute/i,/not considered/i,/includes but is not limited to/i,/This includes/i,/For this offer.*not/i,/Transfers from/i,/not from an employer/i,/not regular recurring/i,/Other electronic deposits/i,/person-to-person/i]).join(' ')||raw;
    const out=[];const add=(lab,re)=>{if(re.test(ex)&&!out.includes(lab))out.push(lab)};
    add('Other electronic deposits',/Other electronic deposits/i);add('Person-to-person payments / P2P transfers',/person-to-person|person to person|P2P/i);add('Incoming wires',/incoming wires|\bwires\b|wire transfer/i);add('Check deposits',/check deposits/i);add('Mobile check deposits / mobile deposits',/mobile check deposits|mobile deposits|mobile deposit/i);add('P2P transfers, including PayPal/Venmo',/PayPal|Venmo/i);add('Merchant transactions, including PayPal/Stripe/Square',/merchant transactions|Stripe|Square/i);add('Zelle incoming payments',/Zelle/i);add('RTP network transactions',/Real-Time Payment network transactions|RTP network transactions/i);add('Transfer Money transactions',/Transfer Money transactions/i);add('E*TRADE website/mobile app transfers',/E\*TRADE|Morgan Stanley.*mobile app/i);add('Internal/brokerage transfers',/internal transfers|brokerage account|Morgan Stanley Smith Barney/i);add('Account-to-account transfers',/deposit account to deposit account|transfers from one account to another|one account to another/i);add('Online, bank, or brokerage transfers not from employer/government',/online transfers|bank transfers|brokerage transfers|not from an employer or the government/i);add('Branch deposits',/branch deposits|made at a branch/i);add('ATM deposits',/ATM deposits|made at an ATM/i);return uniq(out);
  }

  function fees(raw,sentences){
    const feeLine=all(sentences,[/monthly account fee/i,/monthly service fee/i,/monthly maintenance fee/i,/service fee/i,/monthly fee/i]).find(x=>moneyMentions(x).some(m=>m.value>=1&&m.value<100))||'';
    const fee=(moneyMentions(feeLine).filter(x=>x.value>=1&&x.value<100).sort((a,b)=>b.value-a.value)[0]||{}).value||0;
    const waivers=[];const text=String(raw||'');
    if(/combined monthly direct deposits totaling \$\s*1,?500|\$\s*1,?500\s+or more.*direct deposits/i.test(text))waivers.push('$1,500+ combined monthly direct deposits');if(/minimum average account balance of \$\s*1,?500|\$\s*1,?500.*average account balance/i.test(text))waivers.push('$1,500+ minimum average account balance');if(/\$\s*5,?000.*average monthly balance|average monthly balance.*\$\s*5,?000/i.test(text))waivers.push('$5,000 average monthly balance');if(/owner.*Smartly.*Visa|Smartly™ Visa|Smartly® Visa/i.test(text))waivers.push('Owner on U.S. Bank Smartly Visa Signature Card');if(/eligible U\.S\. Bank small business checking/i.test(text))waivers.push('Owner of eligible U.S. Bank small business checking account');if(/Gold Tier|Platinum Tier|Platinum Plus/i.test(text))waivers.push('Qualify for Smart Rewards tier');if(/military|age 13-24|65 and over/i.test(text))waivers.push('Military / age 13–24 / age 65+ waiver options');return{fee,feeLine,waivers:uniq(waivers)};
  }

  function eligibility(raw,sentences){
    const line=first(sentences,[/within the last \d+ months/i,/past \d+ months/i,/received.*bonus.*\d+ months/i,/had.*checking account.*last \d+ months/i]);const pm=line.match(/(?:last|past)\s+(\d+)\s+months|within\s+the\s+last\s+(\d+)\s+months/i)||[];const prior=pm[1]||pm[2]||'';const out=[];if(/new .*checking|new consumer checking|new customer/i.test(raw))out.push('New checking customer/account required.');if(prior)out.push(`Not eligible if you had/owned the same checking product or received a bonus within the last ${prior} months.`);if(/cannot be combined|may not be combined|only be enrolled in one/i.test(raw))out.push('Cannot be combined with other checking bonus offers.');if(/outside of the U\.S\. Bank footprint/i.test(raw))out.push('May not be available outside the U.S. Bank footprint.');if(/non-U\.S\. residents|non-U.S. residents/i.test(raw))out.push('Non-U.S. residents are not eligible.');if(/1099|1099-INT|tax|income|backup withholding|Form W-9/i.test(raw))out.push('Bonus is taxable and may be reported on Form 1099/1099-INT.');return{prior,lines:uniq(out),source:line};
  }

  function payout(raw,sentences){const line=first(sentences,[/120th day|day 120|processed.*30 days|can take up to 30 days|up to 30 days|within .*calendar days|deposit the bonus|credited.*within\s+30|bonus into your account|attempt to deposit/i]);if(/120th\s+day|day\s*120|on\s+or\s+about\s+the\s+120/i.test(raw))return{value:'after day 90 assessment; deposited on or about day 120 if qualified',source:line};if(/can\s+take\s+up\s+to\s+30\s+days|up\s+to\s+30\s+days|processed.*30\s+days|within\s+30|30\s+days\s+following/i.test(line||raw))return{value:'within 30 days after requirements are met/assessed',source:line};return{value:'payout timing needs review',source:line};}
  function early(raw,sentences){const line=first(sentences,[/must be open/i,/positive balance/i,/must keep your account open/i,/closed.*prior/i,/not eligible for the bonus/i,/close or restrict/i,/decline|reverse|rescind/i,/good standing/i,/restricted or closed/i,/early termination/i]);return{value:line?'Keep account open and in good standing until bonus payout; closing/restriction before payout can forfeit bonus.':'Not clearly stated',source:line,confidence:line?'Medium':'Low'};}

  function actionPlan(r){const lines=[];lines.push(`1. Open one eligible ${r.acct||'account'}${r.openBy?` by ${prettyDate(r.openBy)}`:''}${r.code?` using promo code ${r.code}`:''}.`);if(r.fundedDays)lines.push(`${lines.length+1}. Fund the account${r.fundingAmount?` with at least ${moneyFmt(r.fundingAmount)}`:''} within ${r.fundedDays} days.`);if(r.reqDays||r.reqMoney||r.count)lines.push(`${lines.length+1}. Complete ${r.count?`at least ${r.count} `:''}qualifying Direct Deposits${r.reqMoney?`${r.reqIsTotal?' totaling ':' of '}${moneyFmt(r.reqMoney)}+${r.reqIsTotal?'':' each'}`:''}${r.reqDays?` within ${r.reqDays} days`:''}.`);lines.push(`${lines.length+1}. Wait for bonus payout: ${r.payout}.`);lines.push(`${lines.length+1}. Keep account open and positive/good standing until payout.`);return lines.join('\n');}

  function analyze(raw, opts={}){
    const text=String(raw||'');const sents=splitSentences(text);const tiers=tieredBonuses(text);const target=opts.tierIndex!=null?tiers[opts.tierIndex]:tiers[tiers.length-1];const single=singleBonus(sents);const exp=expiration(sents);const req=reqInfo(text,sents,tiers);const fund=funding(sents);const fee=fees(text,sents);const elig=eligibility(text,sents);const pay=payout(text,sents);const eclose=early(text,sents);const bonus=target?.bonus||single?.value||0;const flags=[];if(tiers.length)flags.push('Tiered bonus detected — choose target tier before applying.');if(!bonus)flags.push('Bonus amount needs review.');if(!req.reqDays)flags.push('Requirement deadline needs review.');if(!exp)flags.push('Promo expiration/open-by date not clearly found.');
    const r={version:VER,raw:text,sentences:sents,bank:bankName(text),acct:accountType(text),tiers,tiered:!!tiers.length,targetTier:target||null,bonus,selectedBonus:bonus,bonusSource:target?.source||single?.source||'',bonusTierText:tiers.map(t=>`${moneyFmt(t.bonus)} for ${moneyFmt(t.requirement)}+ DD`).join(' / '),code:promoCode(text,sents)?.value||'',promoCode:promoCode(text,sents),openBy:exp?.value||'',expiration:exp,reqMoney:req.reqMoney,reqIsTotal:req.reqIsTotal,reqDays:req.reqDays,count:req.count,reqSource:req.source,fundedDays:fund.fundedDays,fundingAmount:fund.fundingAmount,fundingSource:fund.source,counts:counts(text,sents),not:exclusions(text,sents),notCounts:exclusions(text,sents),payout:pay.value,payoutText:pay.value,payoutSource:pay.source,fee:fee.fee,monthlyFee:fee.fee?{value:`${moneyFmt(fee.fee)} monthly fee`,amount:fee.fee,source:fee.feeLine,confidence:'High'}:null,waivers:fee.waivers,avoidFee:fee.waivers.length?{value:fee.waivers.join('\n'),source:fee.waivers[0],confidence:'Medium'}:null,prior:elig.prior,eligibilityText:elig.lines.join('\n'),eligibility:{value:elig.lines.join('\n'),source:elig.source,confidence:elig.lines.length?'Medium':'Low'},early:eclose.value,earlyClose:eclose,reviewFlags:flags,clear:!!(bonus&&req.reqDays)};r.actionPlan=actionPlan(r);r.suggestedTimers=[];if(r.openBy)r.suggestedTimers.push({kind:'due',text:'Promo expiration / open-by deadline',date:r.openBy,startDate:'',daysRequired:0});if(r.reqDays)r.suggestedTimers.push({kind:'days',text:'Bonus requirement deadline',date:'',startDate:'',daysRequired:r.reqDays});if(r.fundedDays)r.suggestedTimers.push({kind:'days',text:'Funding deadline',date:'',startDate:'',daysRequired:r.fundedDays});return r;
  }

  function summaryHtml(raw){const r=analyze(raw);const lines=[];lines.push('<div class="tc-label">SIMPLE TERMS:</div>');lines.push(r.tiered?`* Bonus: <span class="hl-money">Tiered ${esc(r.bonusTierText)}</span>`:`* Bonus: ${r.bonus?`<span class="hl-money">${moneyFmt(r.bonus)}</span>`:'Review'}`);lines.push(`* Account: ${esc(r.acct)}`);if(r.code)lines.push(`* Promo code: <span class="hl-code">${esc(r.code)}</span>`);lines.push(`* Monthly fee: ${r.fee?`<span class="hl-fee">${moneyFmt(r.fee)}</span>`:'Not clearly stated in pasted T&C'}`);if(r.waivers.length)lines.push(`* Fee waiver: ${esc(r.waivers.slice(0,3).join(' OR '))}`);lines.push(`* Early close / payout risk: ${esc(r.early)}`);lines.push('');lines.push('<span class="hl-section">HOW TO EARN THE BONUS:</span>');lines.push(`* 1. Open one eligible account${r.openBy?` by <span class="hl-days">${prettyDate(r.openBy)}</span>`:''}${r.code?` using promo code <span class="hl-code">${esc(r.code)}</span>`:''}.`);if(r.fundedDays)lines.push(`* 2. Fund the account${r.fundingAmount?` with at least <span class="hl-money">${moneyFmt(r.fundingAmount)}</span>`:''} within <span class="hl-days">${r.fundedDays} days</span>.`);lines.push(`* ${r.fundedDays?3:2}. Complete ${r.count?`at least <span class="hl-days">${r.count}</span> `:''}qualifying Direct Deposits${r.reqMoney?`${r.reqIsTotal?' totaling ':' of '}<span class="hl-money">${moneyFmt(r.reqMoney)}+</span>${r.reqIsTotal?'':' each'}`:''}${r.reqDays?` within <span class="hl-days">${r.reqDays} days</span>`:''}.`);lines.push(`* ${(r.fundedDays?4:3)}. Bonus payout: ${esc(r.payout)}.`);lines.push('');lines.push('<span class="hl-section">WHAT COUNTS:</span>');(r.counts.length?r.counts:['Review qualifying deposit wording manually']).forEach(x=>lines.push(`* ${esc(x)}`));lines.push('');lines.push('<span class="hl-section">WHAT DOES NOT COUNT:</span>');(r.not.length?r.not:['Not clearly listed']).forEach(x=>lines.push(`* <span class="hl-warn">${esc(x)}</span>`));if(r.waivers.length){lines.push('');lines.push('<span class="hl-section">MONTHLY FEE CAN BE AVOIDED WITH:</span>');r.waivers.forEach(x=>lines.push(`* ${esc(x)}`));}lines.push('');lines.push('<span class="hl-section">ELIGIBILITY / CHURN:</span>');(r.eligibilityText?r.eligibilityText.split('\n'):['Review eligibility manually']).forEach(x=>lines.push(`* ${esc(x)}`));lines.push('');lines.push('<span class="hl-section">REVIEW:</span>');lines.push(r.clear?'* Qualification path is clear from pasted T&C. Verify exact account type and target tier before applying.':'* Qualification path needs manual review.');return`<div class="tc-body">${lines.join('\n')}</div>`;}

  window.tcUnifiedAnalyze=analyze;window.tcStrictAnalyze=analyze;window.tcUnifiedSummaryHtml=summaryHtml;window.tcUnifiedVersion=VER;
})();
