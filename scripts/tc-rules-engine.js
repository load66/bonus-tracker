/* ✅ Version 2.4.4 Newest update: Fix mobile visual glitch by safely replacing only the Simple Terms card and hiding stray raw T&C preview blocks. */
(function(){
  const VER = '2.4.4';

  function escHtml(s){
    if (typeof esc === 'function') return esc(String(s ?? ''));
    const d = document.createElement('div');
    d.textContent = String(s ?? '');
    return d.innerHTML;
  }

  function clean(s){ return String(s||'').replace(/\s+/g,' ').trim(); }
  function moneyNum(s){ const n=parseFloat(String(s||'').replace(/[$,\s]/g,'')); return isNaN(n)?0:n; }
  function moneyFmt(n){ return '$' + Number(n||0).toLocaleString(); }
  function sentenceList(text){ return String(text||'').replace(/\r/g,'\n').split(/(?<=[.!?])\s+|\n+/).map(clean).filter(x=>x.length>8); }
  function moneyMentions(s){ const out=[]; String(s||'').replace(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?|[0-9]+(?:\.\d+)?)/g,m=>{out.push({text:m.replace(/\s+/g,''),value:moneyNum(m)});return m}); return out; }
  function dayMentions(s){ const out=[]; String(s||'').replace(/(\d{1,4})\s*(calendar\s*)?(day|days)/gi,(m,n)=>{out.push(parseInt(n,10));return m}); return out.filter(Boolean); }
  function first(re, list){ return list.find(s=>re.test(s)) || ''; }
  function all(re, list){ return list.filter(s=>re.test(s)); }
  function uniq(arr){ return [...new Set((arr||[]).filter(Boolean))]; }
  function hasNeg(s){ return /do not|does not|not considered|not constitute|not regular|includes but is not limited to|cannot|excludes|not eligible/i.test(s||''); }

  function parseDate(raw){
    const s = clean(raw).replace(/,/g,' ');
    let m = s.match(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    m = s.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/);
    if (m) return `${m[3]}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
    const mo={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
    m=s.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(20\d{2})\b/i);
    if (m) return `${m[3]}-${String(mo[m[1].toLowerCase()]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
    return '';
  }

  function prettyDate(iso){
    if (!iso) return '';
    try { return typeof fD === 'function' ? fD(iso) : new Date(iso+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
    catch { return iso; }
  }

  function parseCountWord(raw){
    const s = String(raw||'').toLowerCase();
    if (/at least\s+two|first\s+two|\btwo\s+direct deposits|\b2\s+direct deposits/.test(s)) return 2;
    const m = s.match(/at least\s+(\d+)\s+direct deposits|receive\s+(\d+)\s+direct deposits/);
    return m ? parseInt(m[1]||m[2],10) : 0;
  }

  function parseAccountType(raw){
    const text = String(raw||'');
    if (/Checking or Max-Rate Checking|Checking OR Max-Rate Checking|Checking Account OR Max-Rate Checking/i.test(text)) {
      return 'Checking OR Max-Rate Checking — open one only; do not enroll both';
    }
    if (/consumer checking/i.test(text)) return 'consumer checking';
    if (/business checking/i.test(text)) return 'business checking';
    if (/checking/i.test(text)) return 'checking';
    return 'account type needs review';
  }

  function parsePromoCode(raw){
    const s = String(raw||'');
    const m = s.match(/promo(?:tional)?\s+code\s+([A-Z0-9][A-Z0-9\-]{2,})/i) || s.match(/code\s+([A-Z0-9][A-Z0-9\-]{2,})\s+at the time/i);
    return m ? m[1].toUpperCase() : '';
  }

  function parseRules(text){
    const raw = String(text||'');
    const sents = sentenceList(raw);
    const bonusSent = first(/\$\s*[\d,]+.*bonus|bonus.*\$\s*[\d,]+/i, sents);
    const bonus = moneyMentions(bonusSent).filter(x=>x.value>=25).sort((a,b)=>b.value-a.value)[0]?.value || 0;

    const openBySent = first(/open.*by .*20\d{2}|opening.*by .*20\d{2}|offer.*by .*20\d{2}|expires .*20\d{2}|expiration .*20\d{2}|offer ends .*20\d{2}/i, sents);
    const openBy = openBySent ? parseDate(openBySent) : '';
    const promoCode = parsePromoCode(raw);
    const accountType = parseAccountType(raw);

    const ddRequirementSent = first(/at least two Direct Deposits|two Direct Deposits|2 Direct Deposits|Direct Deposits each of|receipt of at least two Direct Deposits/i, sents)
      || first(/receive.*\$|\$.*qualifying|within .*day|qualification period/i, sents);
    const reqMoney = moneyMentions(ddRequirementSent).filter(x=>x.value>=100).sort((a,b)=>b.value-a.value)[0]?.value || 0;
    const reqDays = dayMentions(ddRequirementSent).sort((a,b)=>b-a)[0] || dayMentions(first(/within .*day|qualification period|funded within .*day/i,sents)).sort((a,b)=>b-a)[0] || 0;
    const ddCount = parseCountWord(ddRequirementSent || raw);
    const fundedDays = dayMentions(first(/funded within .*day|must be funded within .*day/i, sents)).sort((a,b)=>b-a)[0] || 0;

    const positiveDefSents = all(/Direct Deposit means|qualifying electronic deposit is|regular recurring deposit of income|salary|pension|government payments|social security|employer|payroll|benefits provider|ACH Network|Automated Clearing House|Original Credit Transaction|FedNow|RTP/i, sents).filter(s=>!hasNeg(s));
    const positiveText = positiveDefSents.join(' ');

    const counts = [];
    if (/regular recurring deposit of income/i.test(positiveText)) counts.push('Regular recurring income direct deposit');
    if (/ACH Network|Automated Clearing House|\bACH\b/i.test(positiveText)) counts.push('ACH direct deposit');
    if (/salary|pension|government payments|social security|employer|payroll|benefits provider|government agency/i.test(positiveText)) counts.push('Salary, pension, Social Security/government benefits, employer/payroll/benefits provider income');
    if (/RTP|real-time payment|FedNow/i.test(positiveText)) counts.push('RTP/FedNow instant payment');
    if (/Visa|Mastercard|Original Credit Transaction|debit card/i.test(positiveText)) counts.push('Eligible debit-card network electronic credit / OCT');
    if (!counts.length && /direct deposit/i.test(raw)) counts.push('Qualifying direct deposit — verify definition');

    const notCounts = [];
    const exclusionText = all(/do not constitute|not considered|includes but is not limited to|This includes|For this offer.*not|Transfers from|not from an employer|not regular recurring/i, sents).join(' ') || raw;
    const addNo = (label, re) => { if (re.test(exclusionText) && !notCounts.includes(label)) notCounts.push(label); };
    addNo('Incoming wires', /incoming wires|\bwires\b|wire transfer/i);
    addNo('Check deposits', /check deposits/i);
    addNo('Mobile check deposits / mobile deposits', /mobile check deposits|mobile deposits|mobile deposit/i);
    addNo('P2P transfers, including PayPal/Venmo', /person to person|P2P|PayPal|Venmo/i);
    addNo('Merchant transactions, including PayPal/Stripe/Square', /merchant transactions|Stripe|Square/i);
    addNo('Zelle incoming payments', /Zelle/i);
    addNo('RTP network transactions', /Real-Time Payment network transactions|RTP network transactions/i);
    addNo('Transfer Money transactions', /Transfer Money transactions/i);
    addNo('E*TRADE website/mobile app transfers', /E\*TRADE|Morgan Stanley.*mobile app/i);
    addNo('Internal Morgan Stanley / brokerage transfers', /internal transfers|brokerage account|Morgan Stanley Smith Barney/i);
    addNo('Deposit account-to-account transfers', /deposit account to deposit account|transfers from one account to another|one account to another/i);
    addNo('Online, bank, or brokerage transfers not from employer/government', /online transfers|bank transfers|brokerage transfers|not from an employer or the government/i);
    addNo('Branch deposits', /branch deposits|made at a branch/i);
    addNo('ATM deposits', /ATM deposits|made at an ATM/i);
    addNo('Pending Early Pay Day deposit until posted', /Early Pay Day.*pending|pending.*Early Pay Day/i);

    const payoutSent = first(/120th day|processed.*30 days|up to 30 days|within .*calendar days|deposit the bonus|bonus into your account|attempt to deposit/i, sents);
    const payoutDays = /120th day/i.test(payoutSent) ? 120 : (/up to 30 days|processed.*30 days|within 30/i.test(payoutSent) ? 30 : (dayMentions(payoutSent).sort((a,b)=>b-a)[0] || 0));
    const payoutText = /120th day/i.test(payoutSent) ? 'after day 90 assessment; deposited on or about day 120 if qualified' : (payoutDays ? `within ${payoutDays} days after requirements are met/assessed` : 'payout timing needs review');

    const feeSents = all(/monthly account fee|monthly service fee|monthly maintenance fee|service fee|monthly fee/i, sents);
    const feeWithMoney = feeSents.find(s=>moneyMentions(s).some(x=>x.value>=1&&x.value<100)) || '';
    const monthlyFee = moneyMentions(feeWithMoney).filter(x=>x.value>=1 && x.value<100).sort((a,b)=>b.value-a.value)[0]?.value || 0;

    const waivers = [];
    if (/\$\s*5,?000.*average monthly balance|average monthly balance.*\$\s*5,?000/i.test(raw)) waivers.push('$5,000 average monthly balance in Max-Rate Checking');
    if (/\$\s*1,?500.*minimum daily balance|minimum daily balance.*\$\s*1,?500/i.test(raw)) waivers.push('$1,500 minimum daily balance');
    if (/\$\s*5,?000.*qualifying deposit balances|investment balances/i.test(raw) && !waivers.some(w=>w.includes('average monthly'))) waivers.push('$5,000+ qualifying linked deposit/investment balances');
    if (/\$\s*500.*qualifying electronic deposit|qualifying electronic deposits.*\$\s*500/i.test(raw)) waivers.push('$500+ total qualifying electronic deposits');
    if (/17\s*to\s*24|17-24|age of 25/i.test(raw)) waivers.push('Primary owner age 17–24');

    const priorMonths = (first(/within the last \d+ months|past \d+ months|received a bonus.*\d+ months|had owned.*\d+ months/i, sents).match(/(?:last|past)\s+(\d+)\s+months|within\s+the\s+last\s+(\d+)\s+months/i)||[])[1] || (first(/within the last \d+ months|past \d+ months|received a bonus.*\d+ months|had owned.*\d+ months/i, sents).match(/(?:last|past)\s+(\d+)\s+months|within\s+the\s+last\s+(\d+)\s+months/i)||[])[2] || '';
    const cannotCombine = /cannot be combined|only be enrolled in one/i.test(raw);
    const tax = /1099|tax|tax authorities|income|backup withholding|Form W-9/i.test(raw);
    const earlyClose = first(/must keep your account open|closed.*prior|not eligible for the bonus|close or restrict|decline|reverse|rescind|good standing|restricted or closed/i, sents);
    const hasClearPath = !!(bonus && reqMoney && reqDays && counts.length && ddCount);

    return { raw, bonus, openBy, promoCode, accountType, reqMoney, reqDays, ddCount, fundedDays, counts:uniq(counts), notCounts:uniq(notCounts), payoutDays, payoutText, payoutSent, monthlyFee, waivers:uniq(waivers), priorMonths, cannotCombine, tax, earlyClose, hasClearPath, feeWithMoney, ddRequirementSent };
  }

  function termsBodyHtml(r){
    const lines = [];
    lines.push('<div class="tc-label">SIMPLE TERMS:</div>');
    if (r.bonus) lines.push(`* Bonus: <span class="hl-money">${moneyFmt(r.bonus)}</span>`);
    lines.push(`* Account: ${escHtml(r.accountType)}`);
    if (r.promoCode) lines.push(`* Promo code: <span class="hl-code">${escHtml(r.promoCode)}</span>`);
    lines.push(`* Monthly fee: ${r.monthlyFee ? `<span class="hl-fee">${moneyFmt(r.monthlyFee)}</span>` : 'Not clearly stated in pasted T&C'}`);
    if (r.waivers.length) lines.push(`* Fee waiver: ${escHtml(r.waivers[0])}`);
    lines.push(`* Early close / payout risk: ${r.earlyClose ? 'Keep account open and in good standing until bonus payout; closing/restriction before payout can forfeit bonus.' : 'Not clearly stated'}`);
    lines.push('');
    lines.push('<span class="hl-section">HOW TO EARN THE BONUS:</span>');
    if (r.openBy) lines.push(`* 1. Open by <span class="hl-days">${prettyDate(r.openBy)}</span>${r.promoCode?` using promo code <span class="hl-code">${escHtml(r.promoCode)}</span>`:' using the bonus offer code'}.`);
    else lines.push(`* 1. Open one eligible account${r.promoCode?` using promo code <span class="hl-code">${escHtml(r.promoCode)}</span>`:' and apply the promo code if required'}.`);
    if (r.fundedDays) lines.push(`* 2. Fund the account within <span class="hl-days">${r.fundedDays} days</span> to keep it open.`);
    const reqLineNum = r.fundedDays ? 3 : 2;
    if (r.reqMoney || r.reqDays || r.ddCount) lines.push(`* ${reqLineNum}. Receive ${r.ddCount?`at least <span class="hl-days">${r.ddCount}</span> `:''}qualifying Direct Deposits${r.reqMoney?` of <span class="hl-money">${moneyFmt(r.reqMoney)}+</span> each`:''}${r.reqDays?` within <span class="hl-days">${r.reqDays} days</span> of account opening`:''}.`);
    lines.push(`* ${reqLineNum+1}. Bonus payout: ${escHtml(r.payoutText)}.`);
    lines.push(`* ${reqLineNum+2}. Keep account open and in good standing until payout.`);
    lines.push('');
    lines.push('<span class="hl-section">WHAT COUNTS:</span>');
    (r.counts.length ? r.counts : ['Review qualifying deposit wording manually']).forEach(x=>lines.push(`* ${escHtml(x)}`));
    lines.push('');
    lines.push('<span class="hl-section">WHAT DOES NOT COUNT:</span>');
    (r.notCounts.length ? r.notCounts : ['Not clearly listed']).forEach(x=>lines.push(`* <span class="hl-warn">${escHtml(x)}</span>`));
    if (r.waivers.length) {
      lines.push('');
      lines.push('<span class="hl-section">MONTHLY FEE CAN BE AVOIDED WITH:</span>');
      r.waivers.forEach(x=>lines.push(`* ${escHtml(x)}`));
    }
    lines.push('');
    lines.push('<span class="hl-section">ELIGIBILITY / CHURN:</span>');
    if (/individual and jointly owned|joint account/i.test(r.raw)) lines.push('* Individual or joint Checking / Max-Rate Checking account allowed; primary account holder is bonus-eligible.');
    if (r.priorMonths) lines.push(`* Not eligible if you owned/co-owned the same checking product within the last <span class="hl-days">${r.priorMonths} months</span>.`);
    if (/non-U\.S\. residents|non-U.S. residents/i.test(r.raw)) lines.push('* Non-U.S. residents are not eligible.');
    if (r.cannotCombine) lines.push('* <span class="hl-warn">Cannot be combined</span> with other checking offers / only one checking offer at a time.');
    if (/gaming|abuse|misuse/i.test(r.raw)) lines.push('* Promo abuse/gaming can disqualify bonus payout.');
    if (r.tax) lines.push('* Bonus is taxable and may be reported on Form 1099.');
    lines.push('');
    lines.push('<span class="hl-section">REVIEW:</span>');
    if (r.hasClearPath) lines.push('* Qualification path is clear from pasted T&C. Verify promo code and exact account type before applying.');
    else lines.push('* Qualification path needs manual review.');
    return `<div class="tc-body">${lines.join('\n')}</div>`;
  }

  function getLongestTermsText(){
    const areas = [...document.querySelectorAll('textarea')];
    const withTerms = areas.map(a=>a.value||'').filter(v=>/bonus|qualifying|direct deposit|monthly service fee|monthly account fee|offer|promo/i.test(v));
    withTerms.sort((a,b)=>b.length-a.length);
    return withTerms[0] || '';
  }

  function findSimpleTermsCard(){
    const nodes = [...document.querySelectorAll('.tc-box,.az-area,.card')].filter(el => {
      if (el.querySelector('textarea,input,select')) return false;
      const t = el.textContent || '';
      if (t.length > 4500) return false;
      return t.includes('SIMPLE TERMS') && (t.includes('HOW TO EARN') || t.includes('WHAT COUNTS'));
    });
    return nodes.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0] || null;
  }

  function hideRawPreviewBlocks(){
    [...document.querySelectorAll('.tc-box,.az-area,.card')].forEach(el => {
      if (el.querySelector('textarea,input,select')) return;
      if (el.dataset.strictRawHidden === VER) return;
      const t = el.textContent || '';
      const looksRaw = t.length > 900 && /Here are the details|Direct Deposit Definition|Bonus Payment|ADDITIONAL TERMS AND CONDITIONS|OFFER RULES FOR ALL PARTICIPANTS/i.test(t) && !/SIMPLE TERMS/i.test(t);
      if (looksRaw) {
        el.dataset.strictRawHidden = VER;
        el.style.display = 'none';
      }
    });
  }

  function replaceSimpleTerms(){
    const raw = getLongestTermsText();
    if (!raw || raw.length < 200) return false;
    hideRawPreviewBlocks();
    const box = findSimpleTermsCard();
    if (!box || box.dataset.strictRulesApplied === VER) return false;
    const r = parseRules(raw);
    box.dataset.strictRulesApplied = VER;
    box.classList.add('tc-strict-card');
    box.style.height = 'auto';
    box.style.maxHeight = 'none';
    box.style.minHeight = '0';
    box.style.overflow = 'visible';
    box.innerHTML = termsBodyHtml(r);
    return true;
  }

  function patchAfterAnalyze(){
    setTimeout(replaceSimpleTerms, 80);
    setTimeout(replaceSimpleTerms, 350);
    setTimeout(replaceSimpleTerms, 900);
    setTimeout(replaceSimpleTerms, 1500);
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (/analyz|fill from analyzer|paste/i.test(btn.textContent||'')) patchAfterAnalyze();
  }, true);

  const obs = new MutationObserver(() => {
    if (document.body.textContent && document.body.textContent.includes('SIMPLE TERMS')) patchAfterAnalyze();
  });
  obs.observe(document.body, { childList:true, subtree:true });

  window.tcStrictAnalyze = function(text){ return parseRules(text); };
  window.tcStrictReplaceSimpleTerms = replaceSimpleTerms;

  const st = document.createElement('style');
  st.textContent = `.app-version::after{content:' · T&C Strict';opacity:.78}.tc-strict-card{height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important}`;
  document.head.appendChild(st);
})();
