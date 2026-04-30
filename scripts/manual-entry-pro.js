/* ✅ Version 2.6.0 Newest update: Manual Entry Pro UI + strict Analyzer Pro fill connection + churn rule preservation. */
(function(){
  const VER = '2.6.0';
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const money = n => '$' + Number(n || 0).toLocaleString();
  let enhanceTimer = null;

  function isManualTitle(t){ return /^(New Entry|Edit Entry)$/i.test(clean(t)); }

  function findManualSheet(){
    const heads = qsa('h1,h2,h3,.modal-title,.sheet-title').filter(h => isManualTitle(h.textContent));
    for (const h of heads) {
      let el = h;
      for (let i=0; i<10 && el; i++, el=el.parentElement) {
        const txt = clean(el.textContent);
        if (/Bank Name/i.test(txt) && /(Add Entry|Save Entry|Update Entry|Cancel)/i.test(txt) && !el.classList.contains('tcr-sheet')) return el;
      }
    }
    return null;
  }

  function firstInputNearLabel(label){
    const forId = label.getAttribute && label.getAttribute('for');
    if (forId) {
      const byId = document.getElementById(forId);
      if (byId) return byId;
    }
    let p = label.parentElement;
    for (let i=0; i<5 && p; i++, p=p.parentElement) {
      const field = p.querySelector('input,textarea,select');
      if (field) return field;
      if (p.nextElementSibling) {
        const sib = p.nextElementSibling.querySelector?.('input,textarea,select') || (p.nextElementSibling.matches?.('input,textarea,select') ? p.nextElementSibling : null);
        if (sib) return sib;
      }
    }
    return null;
  }

  function findField(sheet, tests){
    const labels = qsa('label', sheet);
    for (const label of labels) {
      const txt = clean(label.textContent).toLowerCase().replace(/\*/g,'');
      if (tests.some(t => txt.includes(t))) {
        const field = firstInputNearLabel(label);
        if (field) return field;
      }
    }
    return null;
  }

  function setField(sheet, tests, value){
    if (value === undefined || value === null) return false;
    const field = findField(sheet, tests);
    if (!field) return false;
    if (field.tagName === 'SELECT') {
      setSelect(field, value);
    } else {
      field.value = String(value);
    }
    field.dispatchEvent(new Event('input', {bubbles:true}));
    field.dispatchEvent(new Event('change', {bubbles:true}));
    return true;
  }

  function setSelect(select, value){
    const want = clean(value).toLowerCase();
    const opts = qsa('option', select);
    let found = opts.find(o => clean(o.value).toLowerCase() === want) || opts.find(o => clean(o.textContent).toLowerCase() === want);
    if (!found && /1|12|year/i.test(want)) found = opts.find(o => /1\s*year|12\s*month|^1$/i.test(clean(o.textContent) + ' ' + clean(o.value)));
    if (!found && /2|24/i.test(want)) found = opts.find(o => /2\s*year|24\s*month|^2$/i.test(clean(o.textContent) + ' ' + clean(o.value)));
    if (!found && /3|36/i.test(want)) found = opts.find(o => /3\s*year|36\s*month|^3$/i.test(clean(o.textContent) + ' ' + clean(o.value)));
    if (!found && /180/i.test(want)) found = opts.find(o => /180/i.test(clean(o.textContent) + ' ' + clean(o.value)));
    if (found) select.value = found.value;
  }

  function getFieldValue(sheet, tests){
    const f = findField(sheet, tests);
    return f ? clean(f.value || f.textContent) : '';
  }

  function getRawTerms(sheet){
    const areas = qsa('textarea', sheet).map(a => a.value || '').filter(v => /bonus|qualifying|direct deposit|monthly service fee|monthly account fee|offer|promo|checking/i.test(v));
    areas.sort((a,b) => b.length - a.length);
    return areas[0] || '';
  }

  function eligibilityText(r){
    const lines=[];
    if (/individual and jointly owned|joint account/i.test(r.raw || '')) lines.push('Individual or joint account allowed; primary account holder is bonus-eligible.');
    if (r.prior) lines.push(`Not eligible if you owned/co-owned the same checking product within the last ${r.prior} months.`);
    if (/non-U\.S\. residents|non-U.S. residents/i.test(r.raw || '')) lines.push('Non-U.S. residents are not eligible.');
    if (/cannot be combined|only be enrolled in one/i.test(r.raw || '')) lines.push('Cannot be combined with other checking offers / only one checking offer at a time.');
    if (/gaming|abuse|misuse/i.test(r.raw || '')) lines.push('Promo abuse/gaming can disqualify bonus payout.');
    if (/1099|tax|tax authorities|income|backup withholding|Form W-9/i.test(r.raw || '')) lines.push('Bonus is taxable and may be reported on Form 1099.');
    return lines.join('\n');
  }

  function completeText(r){
    const lines=[];
    lines.push(`1. Open one eligible account${r.code ? ` using promo code ${r.code}` : ''}.`);
    if (r.fundedDays) lines.push(`${lines.length+1}. Fund the account within ${r.fundedDays} days to keep it open.`);
    lines.push(`${lines.length+1}. Receive ${r.count ? `at least ${r.count} ` : ''}qualifying Direct Deposits${r.reqMoney ? ` of ${money(r.reqMoney)}+ each` : ''}${r.reqDays ? ` within ${r.reqDays} days of account opening` : ''}.`);
    lines.push(`${lines.length+1}. Bonus payout: ${r.payout || r.payoutText || 'review payout timing'}.`);
    lines.push(`${lines.length+1}. Keep account open and in good standing until payout.`);
    return lines.join('\n');
  }

  function strictSummary(r){
    const lines=[];
    lines.push('SIMPLE TERMS:');
    if (r.bonus) lines.push(`* Bonus: ${money(r.bonus)}`);
    if (r.acct) lines.push(`* Account: ${r.acct}`);
    if (r.code) lines.push(`* Promo code: ${r.code}`);
    lines.push(`* Monthly fee: ${r.fee ? money(r.fee) : 'Not clearly stated in pasted T&C'}`);
    if (r.waivers?.length) lines.push(`* Fee waiver: ${r.waivers[0]}`);
    lines.push(`* Churn / restriction: ${r.prior ? r.prior + ' months' : 'Review manually'}`);
    lines.push('');
    lines.push('HOW TO EARN THE BONUS:');
    lines.push(completeText(r));
    lines.push('');
    lines.push('WHAT COUNTS:');
    (r.counts || []).forEach(x => lines.push('* ' + x));
    lines.push('');
    lines.push('WHAT DOES NOT COUNT:');
    (r.not || r.notCounts || []).forEach(x => lines.push('* ' + x));
    return lines.join('\n');
  }

  function applyStrictAnalyzerToManual(sheet){
    const raw = getRawTerms(sheet);
    if (!raw || raw.length < 200 || typeof tcStrictAnalyze !== 'function') return false;
    const r = tcStrictAnalyze(raw);
    if (r.bank) setField(sheet, ['bank name'], r.bank);
    if (r.bonus) setField(sheet, ['amount'], r.bonus);
    if (r.prior) setField(sheet, ['churn rule'], r.prior === '12' || r.prior === 12 ? '1 Year' : `${r.prior} months`);
    if (r.fee) setField(sheet, ['monthly fee'], 'Yes');
    if (r.code) setField(sheet, ['promo code'], r.code);
    if (r.waivers?.length) setField(sheet, ['avoid the monthly fee'], r.waivers.join('\n'));
    setField(sheet, ['complete the bonus'], completeText(r));
    setField(sheet, ['early termination fee'], r.early ? 'No fee stated — must keep account open/in good standing until payout.' : 'None mentioned / review manually');
    const countdown = /120/i.test(String(r.payout || r.payoutText || '')) ? 120 : (r.fundedDays || r.reqDays || '');
    if (countdown) setField(sheet, ['close fee countdown'], countdown);
    const elig = eligibilityText(r);
    if (elig) setField(sheet, ['eligibility'], elig);
    if (r.reqDays) setField(sheet, ['how many days', 'required to complete'], r.reqDays);
    updateAnalyzedSummary(sheet, strictSummary(r));
    updateDashboard(sheet);
    return true;
  }

  function updateAnalyzedSummary(sheet, text){
    const cards = qsa('div,section,textarea', sheet).filter(el => {
      const t = clean(el.textContent || el.value || '');
      return t.includes('SIMPLE TERMS') && t.length < 5000;
    });
    const target = cards.find(el => !el.matches('textarea')) || null;
    if (target) {
      target.classList.add('mep-summary-box');
      target.textContent = text;
    }
  }

  function updateDashboard(sheet){
    const dash = sheet.querySelector('.mep-dashboard');
    if (!dash) return;
    const bank = getFieldValue(sheet, ['bank name']) || 'New bank';
    const bonus = getFieldValue(sheet, ['amount']) || '—';
    const churn = getFieldValue(sheet, ['churn rule']) || 'Select';
    const req = getFieldValue(sheet, ['how many days', 'required to complete']) || '—';
    dash.innerHTML = `
      <div class="mep-chip blue"><span>Bank</span><b>${safe(bank)}</b></div>
      <div class="mep-chip green"><span>Bonus</span><b>${bonus === '—' ? '—' : ('$' + String(bonus).replace(/^\$/,''))}</b></div>
      <div class="mep-chip amber"><span>Churn Rule</span><b>${safe(churn)}</b></div>
      <div class="mep-chip purple"><span>Req Days</span><b>${safe(req)}</b></div>`;
  }

  function safe(v){ return String(v || '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

  function enhanceManualSheet(){
    const sheet = findManualSheet();
    if (!sheet) return;
    sheet.classList.add('mep-sheet');
    if (!sheet.querySelector('.mep-dashboard')) {
      const title = qsa('h1,h2,h3,.modal-title,.sheet-title', sheet).find(h => isManualTitle(h.textContent));
      const dashboard = document.createElement('div');
      dashboard.className = 'mep-dashboard';
      if (title && title.parentElement) title.insertAdjacentElement('afterend', dashboard);
    }
    if (!sheet.dataset.mepEvents) {
      sheet.dataset.mepEvents = '1';
      sheet.addEventListener('input', () => updateDashboard(sheet), true);
      sheet.addEventListener('change', () => updateDashboard(sheet), true);
    }
    updateDashboard(sheet);
  }

  function scheduleEnhance(){
    clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(enhanceManualSheet, 80);
  }

  document.addEventListener('click', function(e){
    const btn = e.target.closest('button');
    if (!btn) return;
    const txt = clean(btn.textContent);
    if (/Open T&C Analyzer Pro/i.test(txt) && typeof tcOpenPro === 'function') {
      setTimeout(() => { try { tcOpenPro(); } catch {} }, 120);
    }
    if (/Analyze\s*&\s*Auto.?fill|Auto.?fill/i.test(txt)) {
      setTimeout(() => { const s = findManualSheet(); if (s) applyStrictAnalyzerToManual(s); }, 180);
      setTimeout(() => { const s = findManualSheet(); if (s) applyStrictAnalyzerToManual(s); }, 650);
    }
    scheduleEnhance();
  }, true);

  const mo = new MutationObserver(scheduleEnhance);
  mo.observe(document.documentElement, {childList:true, subtree:true});
  setTimeout(scheduleEnhance, 500);

  if (!document.getElementById('manual_entry_pro_style')) {
    const st = document.createElement('style');
    st.id = 'manual_entry_pro_style';
    st.textContent = `
      .app-version::after{content:' · ManualPro';opacity:.78}
      .mep-sheet{background:#F8FAFC!important;border-radius:24px 24px 0 0!important;color:#0F172A!important}
      .mep-sheet h1,.mep-sheet h2,.mep-sheet h3{font-weight:900!important;letter-spacing:-.03em!important;color:#0F172A!important}
      .mep-dashboard{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0 14px}
      .mep-chip{border-radius:16px;padding:10px;border:1px solid #E2E8F0;background:#fff;min-width:0}.mep-chip span{display:block;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:1.3px;color:#64748B}.mep-chip b{display:block;font-size:13px;margin-top:4px;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mep-chip.green{background:#ECFDF5;border-color:#BBF7D0}.mep-chip.amber{background:#FFFBEB;border-color:#FDE68A}.mep-chip.blue{background:#EFF6FF;border-color:#BFDBFE}.mep-chip.purple{background:#F5F3FF;border-color:#DDD6FE}
      .mep-sheet label{font-size:11px!important;font-weight:800!important;color:#475569!important;letter-spacing:-.01em!important}.mep-sheet input,.mep-sheet textarea,.mep-sheet select{border:1.5px solid #E2E8F0!important;background:#fff!important;border-radius:15px!important;color:#0F172A!important;box-shadow:0 4px 12px rgba(15,23,42,.035)!important;outline:none!important}.mep-sheet input:focus,.mep-sheet textarea:focus,.mep-sheet select:focus{border-color:#2563EB!important;box-shadow:0 0 0 3px rgba(37,99,235,.08)!important}.mep-sheet textarea{line-height:1.45!important;min-height:94px!important}.mep-sheet [class*="section"],.mep-sheet .section-title,.mep-sheet .tc-label{letter-spacing:1.2px!important;font-size:11px!important;font-weight:900!important;color:#2563EB!important;text-transform:uppercase!important}.mep-sheet button{border-radius:15px!important;font-weight:900!important}.mep-summary-box{white-space:pre-wrap!important;line-height:1.45!important;font-size:13px!important;color:#0F172A!important;background:#fff!important;border:1px solid #E2E8F0!important;border-radius:16px!important;padding:12px!important;max-height:none!important;overflow:visible!important}
      @media(max-width:700px){.mep-dashboard{grid-template-columns:1fr 1fr!important}.mep-chip{padding:10px!important}.mep-sheet input,.mep-sheet textarea,.mep-sheet select{font-size:16px!important;min-height:52px!important}.mep-sheet textarea{min-height:118px!important}.mep-sheet{padding-bottom:calc(18px + env(safe-area-inset-bottom,0px))!important}}
    `;
    document.head.appendChild(st);
  }

  window.manualEntryProFillFromAnalyzer = function(){ const s = findManualSheet(); return s ? applyStrictAnalyzerToManual(s) : false; };
})();
