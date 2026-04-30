/* ✅ Version 2.6.2 Newest update: Stable UI verification patch for Analyzer Pro, Auto-fill Review, Manual Entry Pro, and smoke checks. */
(function(){
  const VER = '2.6.2';
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();

  function inferBankName(raw){
    const text = String(raw || '');
    if (/Morgan Stanley Private Bank|E\*TRADE/i.test(text)) return 'Morgan Stanley Private Bank';
    if (/Wells Fargo/i.test(text)) return 'Wells Fargo';
    if (/U\.S\. Bank|US Bank/i.test(text)) return 'U.S. Bank';
    if (/Bank of America|BofA/i.test(text)) return 'Bank of America';
    if (/Capital One/i.test(text)) return 'Capital One';
    if (/Chase/i.test(text)) return 'Chase';
    if (/Citi(?:bank)?/i.test(text)) return 'Citibank';
    if (/PNC/i.test(text)) return 'PNC Bank';
    const m = text.match(/(?:from|with|by)\s+([A-Z][A-Za-z&.'’\- ]{2,80}?(?:Bank|Credit Union|Private Bank))/);
    return m ? clean(m[1]) : '';
  }

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
  function inputNearLabel(label){
    const forId = label.getAttribute && label.getAttribute('for');
    if (forId && document.getElementById(forId)) return document.getElementById(forId);
    let p = label.parentElement;
    for (let i=0; i<5 && p; i++, p=p.parentElement) {
      const f = p.querySelector('input,textarea,select');
      if (f) return f;
      const sib = p.nextElementSibling;
      if (sib) {
        const sf = sib.matches?.('input,textarea,select') ? sib : sib.querySelector?.('input,textarea,select');
        if (sf) return sf;
      }
    }
    return null;
  }
  function findField(sheet, tests){
    for (const label of qsa('label', sheet)) {
      const txt = clean(label.textContent).toLowerCase().replace(/\*/g,'');
      if (tests.some(t => txt.includes(t))) {
        const f = inputNearLabel(label);
        if (f) return f;
      }
    }
    return null;
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
  function setField(sheet, tests, value){
    if (value === undefined || value === null || value === '') return false;
    const f = findField(sheet, tests);
    if (!f) return false;
    if (f.tagName === 'SELECT') setSelect(f, value); else f.value = String(value);
    f.dispatchEvent(new Event('input', {bubbles:true}));
    f.dispatchEvent(new Event('change', {bubbles:true}));
    return true;
  }
  function getRawTerms(sheet){
    const values = qsa('textarea', sheet).map(a => a.value || '').filter(v => /bonus|qualifying|direct deposit|monthly service fee|monthly account fee|offer|promo|checking/i.test(v));
    values.sort((a,b) => b.length - a.length);
    return values[0] || '';
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
    const fmt = n => '$' + Number(n || 0).toLocaleString();
    const lines=[];
    lines.push(`1. Open one eligible account${r.code ? ` using promo code ${r.code}` : ''}.`);
    if (r.fundedDays) lines.push(`${lines.length+1}. Fund the account within ${r.fundedDays} days to keep it open.`);
    lines.push(`${lines.length+1}. Receive ${r.count ? `at least ${r.count} ` : ''}qualifying Direct Deposits${r.reqMoney ? ` of ${fmt(r.reqMoney)}+ each` : ''}${r.reqDays ? ` within ${r.reqDays} days of account opening` : ''}.`);
    lines.push(`${lines.length+1}. Bonus payout: ${r.payout || r.payoutText || 'review payout timing'}.`);
    lines.push(`${lines.length+1}. Keep account open and in good standing until payout.`);
    return lines.join('\n');
  }
  function strictFillManual(){
    const sheet = findManualSheet();
    if (!sheet || typeof tcStrictAnalyze !== 'function') return false;
    const raw = getRawTerms(sheet);
    if (!raw || raw.length < 200) return false;
    const r = tcStrictAnalyze(raw);
    setField(sheet, ['bank name'], r.bank || inferBankName(raw));
    setField(sheet, ['amount'], r.bonus || '');
    if (r.prior) setField(sheet, ['churn rule'], String(r.prior) === '12' ? '1 Year' : `${r.prior} months`);
    setField(sheet, ['monthly fee'], r.fee ? 'Yes' : '');
    setField(sheet, ['promo code'], r.code || '');
    setField(sheet, ['avoid the monthly fee'], (r.waivers || []).join('\n'));
    setField(sheet, ['complete the bonus'], completeText(r));
    setField(sheet, ['early termination fee'], r.early ? 'No fee stated — must keep account open/in good standing until payout.' : 'None mentioned / review manually');
    setField(sheet, ['close fee countdown'], /120/i.test(String(r.payout || r.payoutText || '')) ? 120 : (r.fundedDays || r.reqDays || ''));
    setField(sheet, ['eligibility'], eligibilityText(r));
    setField(sheet, ['how many days', 'required to complete'], r.reqDays || '');
    return true;
  }

  function growTextareas(root=document){
    root.querySelectorAll('.tcr-field textarea').forEach(t => {
      t.style.height = 'auto';
      t.style.overflow = 'hidden';
      t.style.height = Math.max(132, t.scrollHeight + 4) + 'px';
    });
    root.querySelectorAll('.tcr-version').forEach(v => { v.textContent = 'v' + VER; });
  }

  function entriesReady(){
    try { return Array.isArray(entries); } catch { return Array.isArray(window.entries); }
  }

  document.addEventListener('input', e => {
    if (e.target && e.target.matches('.tcr-field textarea')) growTextareas(document);
  }, true);

  document.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (/Analyze\s*&\s*Auto.?fill|Auto.?fill/i.test(btn.textContent || '')) {
      setTimeout(strictFillManual, 250);
      setTimeout(strictFillManual, 800);
    }
  }, true);

  new MutationObserver(() => setTimeout(growTextareas, 40)).observe(document.documentElement, {childList:true, subtree:true});

  window.btSmokeCheck = function(){
    return {
      version: VER,
      appRoot: !!document.getElementById('app'),
      storageReady: typeof sv === 'function' && typeof SK !== 'undefined',
      entriesReady: entriesReady(),
      renderReady: typeof R === 'function',
      strictAnalyzerReady: typeof tcStrictAnalyze === 'function',
      autoFillReviewReady: typeof tcOpenAutoFillReview === 'function' && typeof tcCreateReviewedEntry === 'function',
      manualProReady: typeof manualEntryProFillFromAnalyzer === 'function',
      timersReady: typeof normalizeTimer === 'function' || typeof timerId === 'function',
      manualSheetVisible: !!findManualSheet()
    };
  };
  window.manualEntryStrictFill = strictFillManual;

  if (!document.getElementById('ui_stability_patch_style')) {
    const st = document.createElement('style');
    st.id = 'ui_stability_patch_style';
    st.textContent = `
      .app-version::after{content:' · Stable';opacity:.78}
      .tca-box .tm-pill{min-width:8px!important;width:8px!important;height:8px!important;padding:0!important;border-radius:999px!important;font-size:0!important;overflow:hidden!important;vertical-align:middle!important;margin-left:4px!important;display:inline-block!important}
      .tca-box .tm-pill::before{content:'';display:block;width:8px;height:8px;border-radius:999px}.tca-box .tm-pill.green::before{background:#10B981}.tca-box .tm-pill.amber::before{background:#F59E0B}.tca-box .tm-pill.red::before{background:#EF4444}
      @media(max-width:700px){
        .tcr-sheet{max-width:100%!important;max-height:calc(100dvh - max(env(safe-area-inset-top,0px),8px))!important;padding:9px 12px calc(18px + env(safe-area-inset-bottom,0px))!important;border-radius:22px 22px 0 0!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important}
        .tcr-grid{grid-template-columns:1fr!important;gap:8px!important}
        .tcr-summary{grid-template-columns:1fr 1fr!important;gap:7px!important}
        .tcr-field,.tcr-field.wide{grid-column:1/-1!important;margin-bottom:9px!important}
        .tcr-field input,.tcr-field textarea{font-size:16px!important;min-height:52px!important;line-height:1.35!important;white-space:normal!important;text-overflow:clip!important;overflow:visible!important}
        .tcr-field textarea{min-height:132px!important;max-height:none!important;overflow:hidden!important;resize:none!important}
        .tcr-section{border-radius:18px!important;padding:12px!important;margin:10px 0!important}
        .tcr-hero{border-radius:20px!important;padding:13px!important}
        .tcr-hero h3{font-size:18px!important}
        .tcr-hero p{font-size:11px!important}
        .tcr-chip b{font-size:12px!important}
        .tcr-timer-row{align-items:flex-start!important}
        .tcr-actions{position:static!important;bottom:auto!important;z-index:auto!important;margin:14px 0 8px!important;padding:0!important;background:transparent!important;display:flex!important;gap:10px!important;box-shadow:none!important}
        .tcr-actions button{min-height:56px!important;font-size:13px!important;border-radius:16px!important}
      }
    `;
    document.head.appendChild(st);
  }

  setTimeout(growTextareas, 700);
})();
