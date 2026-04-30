/* ✅ Version 2.4.2 Newest update: Strict T&C rules engine for counts vs does-not-count, fee waivers, payout timing, and cleaner Simple Terms. */
(function(){
  const VER = '2.4.2';

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

  function parseRules(text){
    const raw = String(text||'');
    const lower = raw.toLowerCase();
    const sents = sentenceList(raw);
    const bonusSent = first(/\$\s*[\d,]+.*bonus|bonus.*\$\s*[\d,]+/i, sents);
    const bonus = moneyMentions(bonusSent).filter(x=>x.value>=25).sort((a,b)=>b.value-a.value)[0]?.value || 0;
    const openBySent = first(/by .*20\d{2}|open.*by|opening.*by|offer.*by|expires|expiration|offer ends/i, sents);
    const openBy = parseDate(openBySent || raw);

    const ddSents = all(/qualifying electronic deposit|direct deposit|ACH|RTP|FedNow|Original Credit Transaction|salary|government benefit/i, sents);
    const reqSent = first(/receive.*\$|\$.*qualifying|within .*day|qualification period/i, ddSents.concat(sents));
    const reqMoney = moneyMentions(reqSent).filter(x=>x.value>=100).sort((a,b)=>b.value-a.value)[0]?.value || 0;
    const reqDays = dayMentions(reqSent).sort((a,b)=>b-a)[0] || dayMentions(first(/within .*day|qualification period/i,sents)).sort((a,b)=>b-a)[0] || 0;

    const counts = [];
    if (/automated clearing house|\bach\b/i.test(raw)) counts.push('ACH direct deposit');
    if (/RTP|real-time payment|FedNow/i.test(raw)) counts.push('RTP/FedNow instant payment');
    if (/Visa|Mastercard|Original Credit Transaction|debit card/i.test(raw)) counts.push('Eligible debit-card network electronic credit / OCT');
    if (!counts.length && /direct deposit/i.test(raw)) counts.push('Qualifying direct deposit');

    const notCounts = [];
    const addNo = (label, re) => { if (re.test(raw) && !notCounts.includes(label)) notCounts.push(label); };
    addNo('Account-to-account transfers', /transfers from one account to another|one account to another|internal transfer/i);
    addNo('Mobile deposits', /mobile deposit/i);
    addNo('Zelle', /Zelle/i);
    addNo('Branch deposits', /branch/i);
    addNo('ATM deposits', /ATM/i);
    addNo('Pending Early Pay Day deposit until posted', /Early Pay Day.*pending|pending.*Early Pay Day/i);
    addNo('P2P transfers', /P2P|peer[- ]to[- ]peer/i);

    const payoutSent = first(/within .*calendar days|deposit the bonus|bonus into your new account|attempt to deposit/i, sents);
    const payoutDays = /bonus|deposit the bonus|attempt/i.test(payoutSent) ? (dayMentions(payoutSent).sort((a,b)=>b-a)[0] || 0) : 0;

    const feeSent = first(/monthly service fee|monthly maintenance fee|service fee/i, sents);
    const monthlyFee = moneyMentions(feeSent).filter(x=>x.value>=1 && x.value<100).sort((a,b)=>b.value-a.value)[0]?.value || 0;

    const waiverSents = all(/minimum daily balance|qualifying deposit balances|investment balances|\$500|17 to 24|avoid.*monthly|waived|fee can be avoided/i, sents);
    const waivers = [];
    if (/\$\s*1,?500.*minimum daily balance|minimum daily balance.*\$\s*1,?500/i.test(raw)) waivers.push('$1,500 minimum daily balance');
    if (/\$\s*5,?000.*qualifying deposit balances|investment balances/i.test(raw)) waivers.push('$5,000+ qualifying linked deposit/investment balances');
    if (/\$\s*500.*qualifying electronic deposit|qualifying electronic deposits.*\$\s*500/i.test(raw)) waivers.push('$500+ total qualifying electronic deposits');
    if (/17\s*to\s*24|17-24|age of 25/i.test(raw)) waivers.push('Primary owner age 17–24');

    const eligSents = all(/new consumer checking|new customer|not available|received a bonus|past \d+ months|employees|non-resident aliens|Private Bank|limit one bonus/i, sents);
    const priorMonths = (first(/received a bonus.*past \d+ months|past \d+ months.*bonus/i, sents).match(/past\s+(\d+)\s+months/i)||[])[1] || '';
    const cannotCombine = /cannot be combined/i.test(raw);
    const tax = /tax|tax authorities|income/i.test(raw);

    const earlyClose = first(/close or restrict|decline or reverse|reverse any bonus|bonus abuse|must stay open|stay open through/i, sents);
    const hasClearPath = !!(bonus && reqMoney && reqDays && counts.length);

    return { raw, bonus, openBy, reqMoney, reqDays, counts, notCounts, payoutDays, payoutSent, monthlyFee, waivers, eligibility:eligSents.slice(0,6), priorMonths, cannotCombine, tax, earlyClose, hasClearPath, feeSent, reqSent, waiverSents };
  }

  function termsHtml(r){
    const lines = [];
    lines.push('<div class="tc-label">SIMPLE TERMS:</div>');
    if (r.bonus) lines.push(`* Bonus: <span class="hl-money">${moneyFmt(r.bonus)}</span>`);
    lines.push('* Account: consumer checking');
    lines.push(`* Monthly fee: ${r.monthlyFee ? `<span class="hl-fee">${moneyFmt(r.monthlyFee)}</span>` : 'Not clearly stated in pasted T&C'}`);
    lines.push(`* Early close / clawback: ${r.earlyClose ? 'Account must stay open until bonus is deposited; promo abuse may cause bonus reversal/restriction.' : 'Not clearly stated'}`);
    lines.push('');
    lines.push('<span class="hl-section">HOW TO EARN THE BONUS:</span>');
    if (r.openBy) lines.push(`* 1. Open by <span class="hl-days">${prettyDate(r.openBy)}</span> using the bonus offer code.`);
    else lines.push('* 1. Open the required account and use the bonus offer code if provided.');
    if (r.reqMoney || r.reqDays) lines.push(`* 2. Receive ${r.reqMoney?`<span class="hl-money">${moneyFmt(r.reqMoney)}+</span> `:''}in qualifying electronic deposits${r.reqDays?` within <span class="hl-days">${r.reqDays} calendar days</span> of account opening`:''}.`);
    if (r.payoutDays) lines.push(`* 3. Bonus pays within <span class="hl-days">${r.payoutDays} calendar days</span> after requirements are met.`);
    lines.push('* 4. Keep the account open through bonus payout.');
    lines.push('');
    lines.push('<span class="hl-section">WHAT COUNTS:</span>');
    (r.counts.length ? r.counts : ['Review qualifying deposit wording manually']).forEach(x=>lines.push(`* ${escHtml(x)}`));
    lines.push('');
    lines.push('<span class="hl-section">WHAT DOES NOT COUNT:</span>');
    (r.notCounts.length ? r.notCounts : ['Not clearly listed']).forEach(x=>lines.push(`* <span class="hl-warn">${escHtml(x)}</span>`));
    if (r.waivers.length) {
      lines.push('');
      lines.push('<span class="hl-section">MONTHLY FEE CAN BE AVOIDED WITH ONE:</span>');
      r.waivers.forEach(x=>lines.push(`* ${escHtml(x)}`));
    }
    lines.push('');
    lines.push('<span class="hl-section">ELIGIBILITY / CHURN:</span>');
    lines.push('* New consumer checking customers only.');
    if (r.priorMonths) lines.push(`* Not available if you received a Wells Fargo consumer checking bonus within the past <span class="hl-days">${r.priorMonths} months</span>.`);
    if (/employees/i.test(r.raw)) lines.push('* Wells Fargo employees are not eligible.');
    if (/non-resident aliens|W-8/i.test(r.raw)) lines.push('* Non-resident aliens / W-8 signers are not eligible.');
    if (/Private Bank/i.test(r.raw)) lines.push('* Private Bank deposit accounts are not eligible.');
    if (r.cannotCombine) lines.push('* <span class="hl-warn">Cannot be combined</span> with other consumer deposit offers.');
    if (r.tax) lines.push('* Bonus may be reported as taxable income.');
    lines.push('');
    lines.push('<span class="hl-section">REVIEW:</span>');
    if (r.hasClearPath) lines.push('* Qualification path is clear from pasted T&C. Verify offer code and account type before applying.');
    else lines.push('* Qualification path needs manual review.');
    return `<div class="tc-box"><div class="tc-body">${lines.join('\n')}</div></div>`;
  }

  function getLongestTermsText(){
    const areas = [...document.querySelectorAll('textarea')];
    const withTerms = areas.map(a=>a.value||'').filter(v=>/bonus|qualifying|direct deposit|monthly service fee|offer/i.test(v));
    withTerms.sort((a,b)=>b.length-a.length);
    return withTerms[0] || '';
  }

  function replaceSimpleTerms(){
    const raw = getLongestTermsText();
    if (!raw || raw.length < 200) return false;
    const r = parseRules(raw);
    const candidates = [...document.querySelectorAll('.tc-box,.card,.az-area,div')].filter(el => {
      const t = el.textContent || '';
      return t.includes('SIMPLE TERMS') && t.includes('WHAT COUNTS') && t.includes('REVIEW');
    });
    const box = candidates.sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0];
    if (!box || box.dataset.strictRulesApplied === VER) return false;
    box.dataset.strictRulesApplied = VER;
    box.outerHTML = termsHtml(r);
    return true;
  }

  function patchAfterAnalyze(){
    setTimeout(replaceSimpleTerms, 80);
    setTimeout(replaceSimpleTerms, 350);
    setTimeout(replaceSimpleTerms, 900);
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
  st.textContent = `.app-version::after{content:' · T&C Strict';opacity:.78}`;
  document.head.appendChild(st);
})();
