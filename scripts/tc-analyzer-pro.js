/* ✅ Version 2.4 Newest update: T&C Analyzer Pro with confidence checks, tier detection, source snippets, action plan, and timer suggestions. */
(function(){
  const TCA_VERSION = '2.4';
  const state = { open:false, raw:'', result:null, selectedTier:0, lastCopied:false };

  function safeEsc(v){
    if (typeof esc === 'function') return esc(String(v ?? ''));
    const d = document.createElement('div');
    d.textContent = String(v ?? '');
    return d.innerHTML;
  }

  function todayIso(){
    try { return typeof td === 'function' ? td() : new Date().toISOString().split('T')[0]; }
    catch { return new Date().toISOString().split('T')[0]; }
  }

  function addDaysIso(date, days){
    try {
      if (typeof timerDueFromStart === 'function') return timerDueFromStart(date, days);
      if (typeof addD === 'function') return addD(date, days);
    } catch {}
    const d = new Date(String(date) + 'T00:00:00');
    d.setDate(d.getDate() + (parseInt(days,10)||0));
    return d.toISOString().split('T')[0];
  }

  function getActiveModal(){
    try { if (typeof modal !== 'undefined' && modal) return modal; } catch {}
    return null;
  }

  function moneyNumber(s){
    if (!s) return 0;
    const n = parseFloat(String(s).replace(/[$,\s]/g,''));
    return isNaN(n) ? 0 : n;
  }

  function fmtMoney(n){
    n = Number(n || 0);
    return '$' + n.toLocaleString();
  }

  function normalizeSpaces(s){
    return String(s || '').replace(/\s+/g,' ').trim();
  }

  function splitSentences(text){
    return String(text||'')
      .replace(/\r/g,'\n')
      .split(/(?<=[.!?])\s+|\n+/)
      .map(normalizeSpaces)
      .filter(s => s.length > 8);
  }

  function findSentences(sentences, patterns){
    return sentences.filter(s => patterns.some(p => p.test(s)));
  }

  function firstSentence(sentences, patterns){
    return findSentences(sentences, patterns)[0] || '';
  }

  function moneyMentions(s){
    const out = [];
    String(s||'').replace(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?|[0-9]+(?:\.\d+)?)/g, (m) => {
      out.push({ text:m.replace(/\s+/g,''), value:moneyNumber(m) });
      return m;
    });
    return out;
  }

  function dayMentions(s){
    const out = [];
    String(s||'').replace(/(?:within|for|after|maintain(?:ed)?(?: for)?|keep(?: for)?|open(?: for)?|consecutive(?:ly)? for|at least)\s+(\d{1,4})\s*(calendar\s*)?(day|days)/gi, (m,n) => {
      out.push({ text:m, days:parseInt(n,10), unit:'days' });
      return m;
    });
    String(s||'').replace(/(?:within|for|after|at least|open(?: for)?|close(?:d)?(?: within)?)\s+(\d{1,2})\s*(month|months)/gi, (m,n) => {
      out.push({ text:m, days:parseInt(n,10)*30, unit:'months' });
      return m;
    });
    return out.filter(x => x.days > 0);
  }

  function parseDateToIso(raw){
    if (!raw) return '';
    let s = String(raw).replace(/[,]/g,' ').replace(/\s+/g,' ').trim();
    let m = s.match(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    m = s.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/);
    if (m) return `${m[3]}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
    const months = {jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
    m = s.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(20\d{2})\b/i);
    if (m) return `${m[3]}-${String(months[m[1].toLowerCase()]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
    m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i);
    if (m) return `${m[3]}-${String(months[m[2].toLowerCase()]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    return '';
  }

  function extractExpiration(text, sentences){
    const candidates = findSentences(sentences, [/expire/i,/expires/i,/expiration/i,/offer ends/i,/apply by/i,/enroll by/i,/open.*by/i,/by \d{1,2}[\/\-]/i,/by (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i]);
    for (const s of candidates) {
      const iso = parseDateToIso(s);
      if (iso) return { value:iso, display:prettyDate(iso), source:s, confidence:'High' };
      const q = s.match(/\bQ([1-4])\s*(20\d{2})\b/i);
      if (q) return { value:`Q${q[1]} ${q[2]}`, display:`Q${q[1]} ${q[2]}`, source:s, confidence:'Medium' };
    }
    const iso = parseDateToIso(text);
    return iso ? { value:iso, display:prettyDate(iso), source:firstSentence(sentences,[new RegExp(iso.slice(0,4))]) || '', confidence:'Medium' } : null;
  }

  function prettyDate(iso){
    try { return typeof fD === 'function' ? fD(iso) : new Date(iso+'T00:00:00').toLocaleDateString(); }
    catch { return iso; }
  }

  function bestBonus(sentences){
    const bonusSentences = findSentences(sentences, [/bonus/i,/earn/i,/cash/i,/reward/i,/receive/i,/qualify/i]);
    const all = [];
    bonusSentences.forEach(s => moneyMentions(s).forEach(m => all.push({...m, source:s})));
    const filtered = all.filter(x => x.value >= 25);
    filtered.sort((a,b) => b.value - a.value);
    return filtered[0] || null;
  }

  function tieredBonuses(sentences){
    const tierSentences = findSentences(sentences, [/tier/i,/earn up to/i,/up to/i,/deposit.*\$/i,/balance.*\$/i,/\$.*\$/i]);
    const tiers = [];
    tierSentences.forEach(s => {
      const ms = moneyMentions(s).filter(x => x.value >= 25);
      if (ms.length >= 2) {
        for (let i=0;i<ms.length-1;i+=2) {
          const a = ms[i], b = ms[i+1];
          const bonus = /bonus|earn|receive|cash/i.test(s.slice(Math.max(0, s.indexOf(a.text)-30), s.indexOf(a.text)+50)) ? a : b;
          const req = bonus === a ? b : a;
          tiers.push({ bonus:bonus.value, requirement:req.value, source:s });
        }
      }
    });
    const seen = new Set();
    return tiers.filter(t => {
      const k = `${t.bonus}|${t.requirement}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return t.bonus > 0 && t.requirement > 0 && t.bonus !== t.requirement;
    }).slice(0,6).sort((a,b)=>a.requirement-b.requirement);
  }

  function extractPromoCode(sentences){
    const s = firstSentence(sentences, [/promo/i,/promotion code/i,/coupon code/i,/offer code/i,/code/i]);
    if (!s) return null;
    const m = s.match(/(?:promo(?:tion)?|coupon|offer)\s*code\s*(?:is|:|=)?\s*([A-Z0-9][A-Z0-9\-]{2,})/i) || s.match(/\b([A-Z]{2,}[A-Z0-9\-]{2,})\b/);
    return m ? { value:m[1].toUpperCase(), source:s, confidence:'Medium' } : { value:'Mentioned — review required', source:s, confidence:'Low' };
  }

  function extractFee(sentences){
    const s = firstSentence(sentences, [/monthly.*fee/i,/service.*fee/i,/maintenance.*fee/i,/monthly maintenance/i]);
    if (!s) return null;
    const m = moneyMentions(s).sort((a,b)=>b.value-a.value)[0];
    return { value:m ? `${m.text} monthly fee` : 'Monthly fee mentioned — review required', source:s, confidence:m?'High':'Low' };
  }

  function extractAvoidFee(sentences){
    const matches = findSentences(sentences, [/waive/i,/avoid/i,/monthly.*fee/i,/minimum balance/i,/direct deposit/i,/electronic deposit/i,/maintain/i]).filter(s => /waive|avoid|monthly.*fee|minimum balance/i.test(s));
    if (!matches.length) return null;
    return { value:matches.slice(0,3).join('\n'), source:matches[0], confidence:'Medium' };
  }

  function extractCompleteBonus(sentences){
    const matches = findSentences(sentences, [/direct deposit/i,/qualifying deposit/i,/new money/i,/deposit/i,/debit card/i,/purchase/i,/transaction/i,/maintain/i,/balance/i,/within/i]);
    const useful = matches.filter(s => /bonus|qualif|direct deposit|new money|deposit|debit|purchase|transaction|maintain|balance/i.test(s)).slice(0,7);
    if (!useful.length) return null;
    return { value:useful.map((s,i)=>`${i+1}. ${s}`).join('\n'), source:useful[0], confidence:useful.length>=2?'High':'Medium' };
  }

  function extractEligibility(sentences){
    const matches = findSentences(sentences, [/new customer/i,/not eligible/i,/eligible/i,/household/i,/previous/i,/received.*bonus/i,/opened.*account/i,/closed.*account/i,/within.*months/i,/within.*years/i,/consumer/i,/business/i]);
    if (!matches.length) return null;
    return { value:matches.slice(0,5).join('\n'), source:matches[0], confidence:'Medium' };
  }

  function extractEarlyClose(sentences){
    const matches = findSentences(sentences, [/close/i,/closed/i,/closure/i,/early termination/i,/forfeit/i,/deduct/i,/charge/i,/fee/i]).filter(s => /close|closure|termination|forfeit|deduct|fee/i.test(s));
    if (!matches.length) return null;
    const s = matches[0];
    const m = moneyMentions(s).sort((a,b)=>b.value-a.value)[0];
    const days = dayMentions(s).sort((a,b)=>b.days-a.days)[0];
    return { value:matches.slice(0,4).join('\n'), fee:m?.value || 0, days:days?.days || 0, source:s, confidence:'Medium' };
  }

  function extractDays(sentences){
    const reqSources = findSentences(sentences, [/within/i,/complete/i,/qualifying/i,/direct deposit/i,/deposit/i,/open/i,/opening/i]);
    const holdSources = findSentences(sentences, [/maintain/i,/keep/i,/consecutive/i,/daily balance/i,/average balance/i,/minimum balance/i]);
    const req = [];
    reqSources.forEach(s => dayMentions(s).forEach(d => req.push({...d, source:s})));
    const hold = [];
    holdSources.forEach(s => dayMentions(s).forEach(d => hold.push({...d, source:s})));
    req.sort((a,b)=>b.days-a.days);
    hold.sort((a,b)=>b.days-a.days);
    return {
      reqDays:req[0]?.days || 0,
      reqSource:req[0]?.source || '',
      holdDays:hold[0]?.days || 0,
      holdSource:hold[0]?.source || ''
    };
  }

  function directDepositInfo(sentences){
    const matches = findSentences(sentences, [/direct deposit/i,/payroll/i,/government benefit/i,/ACH/i,/qualifying electronic/i]);
    if (!matches.length) return null;
    const amounts = [];
    matches.forEach(s => moneyMentions(s).forEach(m => amounts.push({...m, source:s})));
    amounts.sort((a,b)=>b.value-a.value);
    const days = [];
    matches.forEach(s => dayMentions(s).forEach(d => days.push({...d, source:s})));
    days.sort((a,b)=>b.days-a.days);
    return { amount:amounts[0]?.value || 0, days:days[0]?.days || 0, source:matches[0], confidence:'High' };
  }

  function buildActionPlan(res){
    const steps = [];
    steps.push('1. Open the account and save the opened date in the tracker.');
    if (res.promoCode?.value) steps.push(`2. Use promo code: ${res.promoCode.value}.`);
    const dd = res.directDeposit;
    if (dd?.amount) steps.push(`3. Complete qualifying direct deposits totaling ${fmtMoney(dd.amount)}${dd.days?` within ${dd.days} days`:''}.`);
    else if (res.completeBonus?.value) steps.push('3. Complete the listed bonus requirements from the analyzer.');
    if (res.holdDays) steps.push(`4. Maintain the required balance/account for about ${res.holdDays} days.`);
    if (res.earlyClose?.days) steps.push(`5. Do not close before the early-closure risk period ends (${res.earlyClose.days} days).`);
    steps.push('6. Mark Bonus Received when paid, then use the close/safe-date fields before closing.');
    return steps.join('\n');
  }

  function makeTimers(res){
    const m = getActiveModal();
    const opened = m?.opened || '';
    const out = [];
    if (res.expiration?.value && /^20\d{2}-\d{2}-\d{2}$/.test(res.expiration.value)) {
      out.push({kind:'due', text:'Promo expiration / last day to apply', date:res.expiration.value, startDate:'', daysRequired:0, source:res.expiration.source});
    }
    if (opened && res.reqDays) out.push({kind:'days', text:'Bonus requirement deadline', startDate:opened, daysRequired:res.reqDays, date:addDaysIso(opened,res.reqDays), source:res.reqSource});
    if (opened && res.holdDays) out.push({kind:'days', text:'Required hold period ends', startDate:opened, daysRequired:res.holdDays, date:addDaysIso(opened,res.holdDays), source:res.holdSource});
    if (opened && res.earlyClose?.days) out.push({kind:'days', text:'Early closure risk ends', startDate:opened, daysRequired:res.earlyClose.days, date:addDaysIso(opened,res.earlyClose.days), source:res.earlyClose.source});
    return out;
  }

  function confidenceBadge(level){
    const cls = level === 'High' ? 'green' : level === 'Medium' ? 'amber' : 'red';
    return `<span class="tm-pill ${cls}" style="min-width:auto">${safeEsc(level||'Review')}</span>`;
  }

  function analyze(text){
    const clean = normalizeSpaces(String(text||'').replace(/<[^>]+>/g,' '));
    const sentences = splitSentences(clean);
    const tiers = tieredBonuses(sentences);
    const bonus = bestBonus(sentences);
    const days = extractDays(sentences);
    const res = {
      raw: text,
      sentences,
      tiers,
      selectedBonus: tiers[0]?.bonus || bonus?.value || 0,
      bonusSource: tiers[0]?.source || bonus?.source || '',
      promoCode: extractPromoCode(sentences),
      expiration: extractExpiration(clean, sentences),
      monthlyFee: extractFee(sentences),
      avoidFee: extractAvoidFee(sentences),
      completeBonus: extractCompleteBonus(sentences),
      eligibility: extractEligibility(sentences),
      earlyClose: extractEarlyClose(sentences),
      directDeposit: directDepositInfo(sentences),
      reqDays: days.reqDays,
      reqSource: days.reqSource,
      holdDays: days.holdDays,
      holdSource: days.holdSource,
      reviewFlags: []
    };
    if (tiers.length) res.reviewFlags.push('Tiered bonus detected — choose the target tier before applying.');
    if (!res.earlyClose) res.reviewFlags.push('Early closure/clawback terms were not clearly found. Review manually.');
    if (!res.expiration) res.reviewFlags.push('Expiration date was not clearly found.');
    if (!res.directDeposit && /direct deposit|payroll|ACH/i.test(clean)) res.reviewFlags.push('Direct deposit language found, but amount/deadline may need review.');
    res.actionPlan = buildActionPlan(res);
    res.suggestedTimers = makeTimers(res);
    return res;
  }

  function modalHtml(){
    const res = state.result;
    let h = `<div class="cbg tca-bg" onclick="tcClosePro()"><div class="dd-box tca-box" onclick="event.stopPropagation()">`;
    h += `<h3>✨ T&C Analyzer Pro <span style="font-size:9px;color:#94A3B8">v${TCA_VERSION}</span></h3>`;
    h += `<div class="sub">Paste promo terms. The analyzer extracts fields, confidence, snippets, action plan, and timer suggestions.</div>`;
    h += `<textarea id="tca_raw" class="dd-input" style="height:150px;resize:vertical;line-height:1.45" placeholder="Paste bank promo terms & conditions here...">${safeEsc(state.raw)}</textarea>`;
    h += `<div class="crow"><button class="c-c" onclick="tcClosePro()">Close</button><button class="c-g" onclick="tcRunPro()">Analyze</button></div>`;
    if (res) {
      h += `<div class="tc-box" style="margin-top:12px"><div class="tc-label">Analyzer Summary</div>`;
      h += `<div class="tc-body">Bonus: <b>${safeEsc(res.selectedBonus?fmtMoney(res.selectedBonus):'Review')}</b> ${confidenceBadge(res.selectedBonus?'High':'Low')}\nReq days: <b>${safeEsc(res.reqDays||'Review')}</b> · Hold days: <b>${safeEsc(res.holdDays||'Review')}</b>\nExpiration: <b>${safeEsc(res.expiration?.display || res.expiration?.value || 'Review')}</b></div></div>`;

      if (res.tiers.length) {
        h += `<div class="tc-box"><div class="tc-label">Tiered Bonus Detected</div><select id="tca_tier" class="dd-input" onchange="tcSelectTier(this.value)">`;
        res.tiers.forEach((t,i)=>{ h += `<option value="${i}" ${i===state.selectedTier?'selected':''}>${fmtMoney(t.bonus)} bonus — ${fmtMoney(t.requirement)} requirement</option>`; });
        h += `</select><div class="tc-body">Choose the tier you plan to target before applying fields.</div></div>`;
      }

      h += fieldCard('Bonus Amount', res.selectedBonus ? fmtMoney(res.selectedBonus) : '', res.bonusSource, res.selectedBonus?'High':'Low');
      h += fieldCard('Promo Code', res.promoCode?.value || '', res.promoCode?.source || '', res.promoCode?.confidence || 'Low');
      h += fieldCard('Expiration Date', res.expiration?.display || res.expiration?.value || '', res.expiration?.source || '', res.expiration?.confidence || 'Low');
      h += fieldCard('Monthly Fee', res.monthlyFee?.value || '', res.monthlyFee?.source || '', res.monthlyFee?.confidence || 'Low');
      h += fieldCard('How to Avoid Monthly Fee', res.avoidFee?.value || '', res.avoidFee?.source || '', res.avoidFee?.confidence || 'Low');
      h += fieldCard('How to Complete Bonus', res.completeBonus?.value || '', res.completeBonus?.source || '', res.completeBonus?.confidence || 'Low');
      h += fieldCard('Early Termination / Clawback', res.earlyClose?.value || '', res.earlyClose?.source || '', res.earlyClose?.confidence || 'Low');
      h += fieldCard('Eligibility / Churn', res.eligibility?.value || '', res.eligibility?.source || '', res.eligibility?.confidence || 'Low');

      h += `<div class="tc-box"><div class="tc-label">Action Plan</div><div class="tc-body">${safeEsc(res.actionPlan)}</div></div>`;
      h += `<div class="tc-box"><div class="tc-label">Suggested Mini Timers</div><div class="tc-body">${res.suggestedTimers.length ? safeEsc(res.suggestedTimers.map(t => `${t.text}: ${t.kind==='days' ? `${t.daysRequired} days from ${prettyDate(t.startDate)}` : prettyDate(t.date)} → ${prettyDate(t.date)}`).join('\n')) : 'Set the Opened Date first to generate Start + Days timers.'}</div></div>`;
      if (res.reviewFlags.length) h += `<div class="tc-box" style="border-color:#F59E0B;background:#FFFBEB"><div class="tc-label">Review Flags</div><div class="tc-body">${safeEsc(res.reviewFlags.map(x=>'⚠️ '+x).join('\n'))}</div></div>`;
      h += `<div class="crow" style="margin-top:10px"><button class="c-c" onclick="tcCopyPlan()">Copy Plan</button><button class="c-g" onclick="tcApplyPro()">Apply Fields</button></div>`;
      h += `<button class="btn-p" onclick="tcCreateTimers()" style="margin-top:8px">Create Suggested Mini Timers</button>`;
    }
    h += `</div></div>`;
    return h;
  }

  function fieldCard(title, value, source, confidence){
    return `<div class="tc-box"><div class="tc-label">${safeEsc(title)} ${confidenceBadge(confidence)}</div><div class="tc-body">${safeEsc(value || 'Not clearly found')}</div>${source ? `<div class="tc-label" style="margin-top:8px">Source snippet</div><div class="tc-body" style="font-size:10px;color:#475569">${safeEsc(source)}</div>` : ''}</div>`;
  }

  function renderOverlay(){
    let old = document.getElementById('tca_overlay');
    if (old) old.remove();
    if (!state.open) return;
    const d = document.createElement('div');
    d.id = 'tca_overlay';
    d.innerHTML = modalHtml();
    document.body.appendChild(d);
  }

  function grabTermsFromCurrentModal(){
    const root = document.querySelector('.modal');
    if (!root) return '';
    const areas = [...root.querySelectorAll('textarea')];
    areas.sort((a,b)=>(b.value||'').length-(a.value||'').length);
    const rich = areas.find(a => /bonus|deposit|eligible|offer|fee|terms|conditions|qualify|direct/i.test(a.value || ''));
    return (rich || areas[0])?.value || '';
  }

  function injectButton(){
    const root = document.querySelector('.modal');
    if (!root || root.querySelector('.tca-open-btn')) return;
    const target = root.querySelector('.m-hdr') || root;
    const btn = document.createElement('button');
    btn.className = 'inline-trigger tca-open-btn';
    btn.type = 'button';
    btn.style.cssText = 'width:100%;margin:0 0 10px;justify-content:center;background:linear-gradient(135deg,#EFF6FF,#DBEAFE);border-style:solid';
    btn.innerHTML = '✨ Open T&C Analyzer Pro';
    btn.onclick = () => window.tcOpenPro();
    target.insertAdjacentElement('afterend', btn);
  }

  function setModalValueByLabel(labelTests, value){
    if (!value && value !== 0) return false;
    const root = document.querySelector('.modal');
    if (!root) return false;
    const labels = [...root.querySelectorAll('label')];
    for (const lab of labels) {
      const txt = normalizeSpaces(lab.textContent).toLowerCase();
      if (!labelTests.some(t => txt.includes(t))) continue;
      const fg = lab.closest('.fg') || lab.parentElement;
      const input = fg?.querySelector('input,textarea,select');
      if (!input) continue;
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles:true }));
      input.dispatchEvent(new Event('change', { bubbles:true }));
      return true;
    }
    return false;
  }

  function applyToModalObject(res){
    const m = getActiveModal();
    if (!m) return false;
    if (res.selectedBonus) m.bonus = res.selectedBonus;
    if (res.promoCode?.value) m.promoCodeText = res.promoCode.value;
    if (res.monthlyFee?.value) m.monthlyFeeYNText = res.monthlyFee.value;
    if (res.avoidFee?.value) m.avoidMonthlyFeeText = res.avoidFee.value;
    if (res.completeBonus?.value) m.completeBonusText = res.completeBonus.value;
    if (res.earlyClose?.value) m.earlyTerminationFeeText = res.earlyClose.value;
    if (res.eligibility?.value) m.eligibilityText = res.eligibility.value;
    if (res.expiration?.value) m.expirationDateText = res.expiration.display || res.expiration.value;
    if (res.reqDays) { m.reqDays = res.reqDays; m.requiredDaysText = String(res.reqDays); }
    if (res.holdDays) m.minHoldDays = res.holdDays;
    if (res.earlyClose?.fee) m.earlyCloseFee = res.earlyClose.fee;
    return true;
  }

  window.tcOpenPro = function(){
    state.raw = grabTermsFromCurrentModal() || state.raw || '';
    state.result = state.raw ? analyze(state.raw) : null;
    state.selectedTier = 0;
    state.open = true;
    renderOverlay();
  };

  window.tcClosePro = function(){
    state.open = false;
    renderOverlay();
  };

  window.tcRunPro = function(){
    const raw = document.getElementById('tca_raw')?.value || '';
    state.raw = raw;
    state.result = analyze(raw);
    state.selectedTier = 0;
    renderOverlay();
  };

  window.tcSelectTier = function(i){
    if (!state.result) return;
    state.selectedTier = parseInt(i,10)||0;
    const tier = state.result.tiers[state.selectedTier];
    if (tier) { state.result.selectedBonus = tier.bonus; state.result.bonusSource = tier.source; }
    renderOverlay();
  };

  window.tcApplyPro = function(){
    const res = state.result;
    if (!res) return;
    applyToModalObject(res);
    setModalValueByLabel(['bonus'], res.selectedBonus || '');
    setModalValueByLabel(['promo'], res.promoCode?.value || '');
    setModalValueByLabel(['monthly fee'], res.monthlyFee?.value || '');
    setModalValueByLabel(['avoid'], res.avoidFee?.value || '');
    setModalValueByLabel(['complete'], res.completeBonus?.value || '');
    setModalValueByLabel(['early termination','termination'], res.earlyClose?.value || '');
    setModalValueByLabel(['eligibility','churn'], res.eligibility?.value || '');
    setModalValueByLabel(['expiration'], res.expiration?.display || res.expiration?.value || '');
    setModalValueByLabel(['how many days','required days','req days'], res.reqDays || '');
    alert('Analyzer fields applied. Review them, then tap Save on the bank entry.');
    state.open = false;
    try { R(); } catch {}
    renderOverlay();
  };

  window.tcCreateTimers = function(){
    const res = state.result;
    const m = getActiveModal();
    if (!res || !m) { alert('Open this from inside a bank entry first.'); return; }
    const timers = res.suggestedTimers || [];
    if (!timers.length) { alert('No timer could be created yet. Set the Opened Date first for Start + Days timers.'); return; }
    const list = Array.isArray(m.customTimers) ? m.customTimers : [];
    let added = 0;
    timers.forEach(t => {
      const exists = list.some(x => normalizeSpaces(x.text).toLowerCase() === normalizeSpaces(t.text).toLowerCase() && x.date === t.date);
      if (exists) return;
      list.push({
        id: (typeof timerId === 'function' ? timerId() : 'tm_' + Math.random().toString(36).slice(2,8)),
        text:t.text,
        startDate:t.startDate || '',
        daysRequired:t.daysRequired || 0,
        date:t.date,
        done:false
      });
      added++;
    });
    m.customTimers = list;
    alert(added ? `Created ${added} mini timer(s). Tap Save on the bank entry.` : 'No new timers added — they may already exist.');
    state.open = false;
    try { R(); } catch {}
    renderOverlay();
  };

  window.tcCopyPlan = function(){
    const txt = state.result?.actionPlan || '';
    if (!txt) return;
    navigator.clipboard?.writeText(txt).then(()=>alert('Action plan copied.')).catch(()=>alert(txt));
  };

  function addStyle(){
    if (document.getElementById('tca_style')) return;
    const st = document.createElement('style');
    st.id = 'tca_style';
    st.textContent = `.tca-box{max-width:390px;max-height:88dvh;overflow:auto}.tca-box .tc-box{margin-top:8px}.tca-open-btn{font-size:11px}.app-version::after{content:' · T&C Pro';opacity:.78}`;
    document.head.appendChild(st);
  }

  addStyle();
  const obs = new MutationObserver(() => injectButton());
  obs.observe(document.body, { childList:true, subtree:true });
  setTimeout(injectButton, 250);
})();
