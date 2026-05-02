/*
 * filename: scripts/tc-rules-engine.js
 * version: 2.8.6
 * purpose: Fix tiered bonus parsing so deposit requirements are not mistaken as bonus amounts.
 * last-touched: unknown
 */
(function(){
  const VER='2.8.6';
  const $all=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const moneyNum=s=>{const n=parseFloat(String(s||'').replace(/[$,\s]/g,''));return isNaN(n)?0:n};
  const moneyFmt=n=>'$'+Number(n||0).toLocaleString();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean)));
  const out=s=>{if(typeof esc==='function')return esc(String(s??''));const d=document.createElement('div');d.textContent=String(s??'');return d.innerHTML};
  const sent=t=>String(t||'').replace(/\r/g,'\n').split(/(?<=[.!?])\s+|\n+/).map(clean).filter(x=>x.length>8);
  const first=(a,re)=>a.find(x=>re.test(x))||'';
  const all=(a,re)=>a.filter(x=>re.test(x));
  const neg=s=>/do not|does not|not considered|not constitute|not regular|includes but is not limited to|cannot|excludes|not eligible/i.test(s||'');

  function money(s){const a=[];String(s||'').replace(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?|[0-9]+(?:\.\d+)?)/g,m=>{a.push({text:m,value:moneyNum(m)});return m});return a}
  function days(s){const a=[];String(s||'').replace(/(\d{1,4})\s*(calendar\s*)?(day|days)/gi,(m,n)=>{a.push(parseInt(n,10));return m});return a.filter(Boolean)}

  function dateMentions(t){
    const s=clean(t).replace(/,/g,' '), out=[];
    let m;
    const mo={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
    const add=(y,mm,d)=>{if(y&&mm&&d)out.push(`${y}-${String(mm).padStart(2,'0')}-${String(d).padStart(2,'0')}`)};
    const r1=/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/g;while((m=r1.exec(s)))add(m[1],m[2],m[3]);
    const r2=/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/g;while((m=r2.exec(s)))add(m[3],m[1],m[2]);
    const r3=/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(20\d{2})\b/gi;while((m=r3.exec(s)))add(m[3],mo[m[1].toLowerCase()],m[2]);
    return out;
  }
  function parseDate(t){return dateMentions(t)[0]||''}
  function parseLastDate(t){const ds=dateMentions(t);return ds[ds.length-1]||''}
  function fdate(d){try{return typeof fD==='function'?fD(d):new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}catch{return d}}

  function promo(raw){
    const text=String(raw||'');
    const bad=/^(OBTAINED|THROUGH|INTENDED|SINGLE|ONLY|VALID|REQUIRED|WHEN|TIME|ACCOUNT|OPENING|OFFER|CODE|PROMOTIONAL|AUTOMATICALLY)$/i;
    const picks=[];
    text.replace(/(?:apply|use|using|enter|provide)\s+(?:your\s+)?promo(?:tional)?\s+code\s+([A-Z0-9][A-Z0-9\-]{2,})/gi,(m,c)=>{if(!bad.test(c))picks.push(c.toUpperCase());return m});
    text.replace(/promo(?:tional)?\s+code\s*(?:is|:|=)?\s+([A-Z0-9][A-Z0-9\-]{2,})/gi,(m,c)=>{if(!bad.test(c))picks.push(c.toUpperCase());return m});
    return picks[picks.length-1]||'';
  }
  function acct(raw){if(/Bank Smartly/i.test(raw))return'U.S. Bank Smartly Checking';if(/Checking or Max-Rate Checking|Checking OR Max-Rate Checking|Checking Account OR Max-Rate Checking/i.test(raw))return'Checking OR Max-Rate Checking — open one only; do not enroll both';if(/consumer checking/i.test(raw))return'consumer checking';if(/business checking/i.test(raw))return'business checking';if(/checking/i.test(raw))return'checking';return'account type needs review'}
  function count(raw){const s=String(raw||'').toLowerCase();if(/two or more|at least\s+two|first\s+two|\btwo\s+direct deposits|\b2\s+direct deposits/.test(s))return 2;const m=s.match(/at least\s+(\d+)\s+direct deposits|receive\s+(\d+)\s+direct deposits/);return m?parseInt(m[1]||m[2],10):0}
  function payoutText(text,line){if(/120th\s+day|day\s*120|on\s+or\s+about\s+the\s+120/i.test(text))return'after day 90 assessment; deposited on or about day 120 if qualified';if(/can\s+take\s+up\s+to\s+30\s+days|up\s+to\s+30\s+days|processed.*30\s+days|within\s+30|30\s+days\s+following/i.test(line||text))return'within 30 days after requirements are met/assessed';return'payout timing needs review'}

  function tieredBonuses(raw){
    const text=String(raw||'').replace(/\s+/g,' ');
    const tiers=[];
    const push=(req,minMax,bonus,src)=>{req=moneyNum(req);bonus=moneyNum(bonus);if(req>=100&&bonus>=25&&bonus<req)tiers.push({requirement:req,maxRequirement:minMax?moneyNum(minMax):0,bonus,source:clean(src)});};
    let m;
    const range=/\$\s*([0-9,]+(?:\.\d+)?)\s*(?:to|-|–)\s*\$\s*([0-9,]+(?:\.\d+)?)\s*to\s*earn\s*(?:the\s*)?\$\s*([0-9,]+(?:\.\d+)?)\s*bonus/gi;
    while((m=range.exec(text)))push(m[1],m[2],m[3],m[0]);
    const plus=/\$\s*([0-9,]+(?:\.\d+)?)\s*(?:or\s+more|\+)\s*to\s*earn\s*(?:the\s*)?\$\s*([0-9,]+(?:\.\d+)?)\s*bonus/gi;
    while((m=plus.exec(text)))push(m[1],0,m[2],m[0]);
    const reverse=/earn\s*(?:the\s*)?\$\s*([0-9,]+(?:\.\d+)?)\s*bonus[^.]{0,80}?\$\s*([0-9,]+(?:\.\d+)?)/gi;
    while((m=reverse.exec(text)))push(m[2],0,m[1],m[0]);
    const seen=new Set();
    return tiers.filter(t=>{const k=t.requirement+'|'+t.bonus;if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>a.requirement-b.requirement);
  }

  function bestSingleBonus(a){
    const candidates=[];
    all(a,/bonus/i).forEach(s=>{
      if(/\$[\d,.]+\s*(?:to|-|–)\s*\$[\d,.]+\s*to earn|or more\s*to earn/i.test(s))return;
      money(s).forEach(m=>{if(m.value>=25&&m.value<3000)candidates.push({...m,source:s})});
    });
    candidates.sort((x,y)=>y.value-x.value);
    return candidates[0]||null;
  }

  function extractExpiration(a){
    const line=all(a,/open.*from .*20\d{2}.*through.*20\d{2}|from .*20\d{2}.*through.*20\d{2}|open.*by .*20\d{2}|opening.*by .*20\d{2}|offer.*by .*20\d{2}|expires .*20\d{2}|expiration .*20\d{2}|offer ends .*20\d{2}/i)
      .filter(x=>!/APY|Annual Percentage Yield|effective as of|rates are variable|award|StockBrokers/i.test(x))[0]||'';
    if(!line)return'';
    if(/through|including|to/i.test(line))return parseLastDate(line);
    return parseDate(line);
  }

  function parse(raw){
    const text=String(raw||''), a=sent(text);
    const tiers=tieredBonuses(text);
    const targetTier=tiers.length?tiers[tiers.length-1]:null;
    const single=bestSingleBonus(a);
    const bonus=targetTier?.bonus||single?.value||0;
    const bonusTierText=tiers.length?tiers.map(t=>`${moneyFmt(t.bonus)} for ${moneyFmt(t.requirement)}+ DD`).join(' / '):'';
    const openBy=extractExpiration(a);

    const reqLine=first(a,/direct deposits?.*within\s+\d+\s+days|within\s+\d+\s+days.*direct deposits?|two or more direct deposits|at least two Direct Deposits|receipt of at least two Direct Deposits/i)||first(a,/receive.*\$|\$.*qualifying|qualification period/i);
    const reqDays=days(reqLine).sort((x,y)=>y-x)[0]||days(first(a,/direct deposits?.*within .*day|qualification period/i)).sort((x,y)=>y-x)[0]||0;
    const ddCount=count(reqLine||text);
    const reqMoney=targetTier?.requirement||((money(reqLine).filter(x=>x.value>=100).sort((x,y)=>y.value-x.value)[0]||{}).value||0);
    const reqIsTotal=!!targetTier || /total|totaling|aggregate|combined/i.test(reqLine||'');
    const fundedDays=days(first(a,/funded with.*within .*day|funded within .*day|must be funded within .*day/i)).sort((x,y)=>y-x)[0]||0;
    const fundingAmount=(money(first(a,/funded with.*within .*day|minimum of .*required to open|minimum.*open/i)).filter(x=>x.value>=1&&x.value<1000).sort((x,y)=>y.value-x.value)[0]||{}).value||0;

    const pos=all(a,/Direct Deposit means|direct deposit is|qualifying electronic deposit is|regular recurring deposit of income|salary|pension|government payments|social security|employer|payroll|benefits provider|ACH Network|Automated Clearing House|Original Credit Transaction|FedNow|RTP|paycheck/i).filter(x=>!neg(x)).join(' ');
    const counts=[];
    if(/regular recurring deposit of income/i.test(pos))counts.push('Regular recurring income direct deposit');
    if(/ACH Network|Automated Clearing House|\bACH\b/i.test(pos))counts.push('ACH direct deposit');
    if(/salary|paycheck|pension|government payments|social security|employer|payroll|benefits provider|government agency/i.test(pos))counts.push('Salary/paycheck, pension, Social Security/government benefits, employer/government income');
    if(/RTP|real-time payment|FedNow/i.test(pos))counts.push('RTP/FedNow instant payment');
    if(/Visa|Mastercard|Original Credit Transaction|debit card/i.test(pos))counts.push('Eligible debit-card network electronic credit / OCT');
    if(!counts.length&&/direct deposit/i.test(text))counts.push('Qualifying direct deposit — verify definition');

    const ex=all(a,/do not constitute|not considered|includes but is not limited to|This includes|For this offer.*not|Transfers from|not from an employer|not regular recurring|Other electronic deposits|person-to-person/i).join(' ')||text;
    const not=[];const no=(lab,re)=>{if(re.test(ex)&&!not.includes(lab))not.push(lab)};
    no('Other electronic deposits',/Other electronic deposits/i);no('Person-to-person payments / P2P transfers',/person-to-person|person to person|P2P/i);no('Incoming wires',/incoming wires|\bwires\b|wire transfer/i);no('Check deposits',/check deposits/i);no('Mobile check deposits / mobile deposits',/mobile check deposits|mobile deposits|mobile deposit/i);no('P2P transfers, including PayPal/Venmo',/PayPal|Venmo/i);no('Merchant transactions, including PayPal/Stripe/Square',/merchant transactions|Stripe|Square/i);no('Zelle incoming payments',/Zelle/i);no('RTP network transactions',/Real-Time Payment network transactions|RTP network transactions/i);no('Transfer Money transactions',/Transfer Money transactions/i);no('E*TRADE website/mobile app transfers',/E\*TRADE|Morgan Stanley.*mobile app/i);no('Internal/brokerage transfers',/internal transfers|brokerage account|Morgan Stanley Smith Barney/i);no('Account-to-account transfers',/deposit account to deposit account|transfers from one account to another|one account to another/i);no('Online, bank, or brokerage transfers not from employer/government',/online transfers|bank transfers|brokerage transfers|not from an employer or the government/i);no('Branch deposits',/branch deposits|made at a branch/i);no('ATM deposits',/ATM deposits|made at an ATM/i);

    const payoutLine=first(a,/120th day|day 120|processed.*30 days|can take up to 30 days|up to 30 days|within .*calendar days|deposit the bonus|credited.*within\s+30|bonus into your account|attempt to deposit/i);
    const payout=payoutText(text,payoutLine);
    const feeLine=all(a,/monthly account fee|monthly service fee|monthly maintenance fee|service fee|monthly fee/i).find(x=>money(x).some(m=>m.value>=1&&m.value<100))||'';
    const fee=(money(feeLine).filter(x=>x.value>=1&&x.value<100).sort((x,y)=>y.value-x.value)[0]||{}).value||0;
    const waivers=[];
    if(/combined monthly direct deposits totaling \$\s*1,?500|\$\s*1,?500\s+or more.*direct deposits/i.test(text))waivers.push('$1,500+ combined monthly direct deposits');
    if(/minimum average account balance of \$\s*1,?500|\$\s*1,?500.*average account balance/i.test(text))waivers.push('$1,500+ minimum average account balance');
    if(/\$\s*5,?000.*average monthly balance|average monthly balance.*\$\s*5,?000/i.test(text))waivers.push('$5,000 average monthly balance');
    if(/owner.*Smartly.*Visa|Smartly™ Visa|Smartly® Visa/i.test(text))waivers.push('Owner on U.S. Bank Smartly Visa Signature Card');
    if(/eligible U\.S\. Bank small business checking/i.test(text))waivers.push('Owner of eligible U.S. Bank small business checking account');
    if(/Gold Tier|Platinum Tier|Platinum Plus/i.test(text))waivers.push('Qualify for Smart Rewards tier');
    if(/military|age 13-24|65 and over/i.test(text))waivers.push('Military / age 13–24 / age 65+ waiver options');

    const priorLine=first(a,/within the last \d+ months|past \d+ months|received.*bonus.*\d+ months|had.*checking account.*last \d+ months/i);
    const pm=priorLine.match(/(?:last|past)\s+(\d+)\s+months|within\s+the\s+last\s+(\d+)\s+months/i)||[];
    const prior=pm[1]||pm[2]||'';
    const early=first(a,/must be open|positive balance|must keep your account open|closed.*prior|not eligible for the bonus|close or restrict|decline|reverse|rescind|good standing|restricted or closed/i);
    return{raw:text,tiers,tiered:!!tiers.length,bonus,bonusTierText,openBy,code:promo(text),acct:acct(text),reqMoney,reqIsTotal,reqDays,count:ddCount,fundedDays,fundingAmount,counts:uniq(counts),not:uniq(not),payout,fee,waivers:uniq(waivers),prior,early,clear:!!(bonus&&reqDays&&counts.length)};
  }

  function terms(r){
    const lines=[];lines.push('<div class="tc-label">SIMPLE TERMS:</div>');
    if(r.tiered)lines.push(`* Bonus: <span class="hl-money">Tiered ${out(r.bonusTierText)}</span>`);else if(r.bonus)lines.push(`* Bonus: <span class="hl-money">${moneyFmt(r.bonus)}</span>`);
    lines.push(`* Account: ${out(r.acct)}`);
    if(r.code)lines.push(`* Promo code: <span class="hl-code">${out(r.code)}</span>`);
    lines.push(`* Monthly fee: ${r.fee?`<span class="hl-fee">${moneyFmt(r.fee)}</span>`:'Not clearly stated in pasted T&C'}`);
    if(r.waivers.length)lines.push(`* Fee waiver: ${out(r.waivers.slice(0,3).join(' OR '))}`);
    lines.push(`* Early close / payout risk: ${r.early?'Keep account open and in good standing until bonus payout; closing/restriction before payout can forfeit bonus.':'Not clearly stated'}`);
    lines.push('');lines.push('<span class="hl-section">HOW TO EARN THE BONUS:</span>');
    if(r.openBy)lines.push(`* 1. Open by <span class="hl-days">${fdate(r.openBy)}</span>${r.code?` using promo code <span class="hl-code">${out(r.code)}</span>`:' through the eligible promo channel'}.`);else lines.push(`* 1. Open one eligible account${r.code?` using promo code <span class="hl-code">${out(r.code)}</span>`:' and apply the promo code if required'}.`);
    if(r.fundedDays)lines.push(`* 2. Fund the account${r.fundingAmount?` with at least <span class="hl-money">${moneyFmt(r.fundingAmount)}</span>`:''} within <span class="hl-days">${r.fundedDays} days</span> to prevent closure.`);
    const n=r.fundedDays?3:2;
    if(r.reqMoney||r.reqDays||r.count)lines.push(`* ${n}. Complete ${r.count?`at least <span class="hl-days">${r.count}</span> `:''}qualifying Direct Deposits${r.reqMoney?`${r.reqIsTotal?' totaling ':' of '}<span class="hl-money">${moneyFmt(r.reqMoney)}+</span>${r.reqIsTotal?'':' each'}`:''}${r.reqDays?` within <span class="hl-days">${r.reqDays} days</span> of account opening`:''}.`);
    lines.push(`* ${n+1}. Bonus payout: ${out(r.payout)}.`);lines.push(`* ${n+2}. Keep account open and in good standing until payout.`);
    lines.push('');lines.push('<span class="hl-section">WHAT COUNTS:</span>');(r.counts.length?r.counts:['Review qualifying deposit wording manually']).forEach(x=>lines.push(`* ${out(x)}`));
    lines.push('');lines.push('<span class="hl-section">WHAT DOES NOT COUNT:</span>');(r.not.length?r.not:['Not clearly listed']).forEach(x=>lines.push(`* <span class="hl-warn">${out(x)}</span>`));
    if(r.waivers.length){lines.push('');lines.push('<span class="hl-section">MONTHLY FEE CAN BE AVOIDED WITH:</span>');r.waivers.forEach(x=>lines.push(`* ${out(x)}`))}
    lines.push('');lines.push('<span class="hl-section">ELIGIBILITY / CHURN:</span>');
    if(/consumer checking account|Bank Smartly Checking/i.test(r.raw))lines.push('* New consumer checking account required.');
    if(r.prior)lines.push(`* Not eligible if you had/owned a U.S. Bank consumer checking account or received a consumer checking bonus within the last <span class="hl-days">${r.prior} months</span>.`);
    if(/cannot be combined|may not be combined|only be enrolled in one/i.test(r.raw))lines.push('* <span class="hl-warn">Cannot be combined</span> with other checking bonus offers.');
    if(/outside of the U\.S\. Bank footprint/i.test(r.raw))lines.push('* May not be available outside the U.S. Bank footprint.');
    if(/1099|tax|tax authorities|income|backup withholding|Form W-9|1099-INT/i.test(r.raw))lines.push('* Bonus is taxable and may be reported on Form 1099/1099-INT.');
    lines.push('');lines.push('<span class="hl-section">REVIEW:</span>');
    lines.push(r.clear?'* Qualification path is clear from pasted T&C. Verify exact account type and target bonus tier before applying.':'* Qualification path needs manual review.');
    return`<div class="tc-body">${lines.join('\n')}</div>`;
  }

  function rawText(){const v=$all('textarea').map(a=>a.value||'').filter(v=>/bonus|qualifying|direct deposit|monthly service fee|monthly account fee|offer|promo/i.test(v));v.sort((a,b)=>b.length-a.length);return v[0]||''}
  function card(){return $all('.tc-box,.az-area,.card').filter(el=>!el.querySelector('textarea,input,select')).filter(el=>{const t=el.textContent||'';return t.length<4500&&t.includes('SIMPLE TERMS')&&(t.includes('HOW TO EARN')||t.includes('WHAT COUNTS'))}).sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0]||null}
  function run(){const raw=rawText();if(!raw||raw.length<200)return false;const box=card();if(!box||box.dataset.strictLite===VER)return false;box.dataset.strictLite=VER;box.classList.add('tc-strict-card');box.style.height='auto';box.style.maxHeight='none';box.style.minHeight='0';box.style.overflow='visible';box.innerHTML=terms(parse(raw));return true}
  function sched(){[120,450,1000].forEach(ms=>setTimeout(run,ms))}
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&/analyz|fill from analyzer|paste/i.test(b.textContent||''))sched()},true);
  window.tcStrictAnalyze=parse;window.tcStrictReplaceSimpleTerms=run;
  const st=document.createElement('style');st.textContent=`.app-version::after{content:' · T&C Lite';opacity:.78}.tc-strict-card{height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important}`;document.head.appendChild(st);
})();