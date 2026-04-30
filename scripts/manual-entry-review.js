/* ✅ Version 2.7.3 Newest update: Early Termination Fee is number-only; Close Fee Countdown renamed to Hold Until Days. */
(function(){
  const VER = '2.7.3';
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const html = v => {
    if (typeof esc === 'function') return esc(String(v ?? ''));
    const d = document.createElement('div');
    d.textContent = String(v ?? '');
    return d.innerHTML;
  };
  const money = n => '$' + Number(n || 0).toLocaleString();

  let activeMode = 'new';
  let activeIndex = -1;
  let activeOriginal = null;
  let scanTimer = null;

  function isManualTitle(t){ return /^(New Entry|Edit Entry)$/i.test(clean(t)); }

  function titleForSheet(sheet){
    const h = qsa('h1,h2,h3,.modal-title,.sheet-title', sheet).find(x => isManualTitle(x.textContent));
    return clean(h?.textContent || 'New Entry');
  }

  function findNativeSheet(){
    const heads = qsa('h1,h2,h3,.modal-title,.sheet-title').filter(h => isManualTitle(h.textContent));
    for (const h of heads) {
      if (h.closest('.manual-review-sheet')) continue;
      let el = h;
      for (let i = 0; i < 9 && el; i++, el = el.parentElement) {
        if (el.classList?.contains('manual-review-sheet')) break;
        if (el.querySelector?.('.manual-review-sheet')) break;
        const txt = clean(el.textContent || '');
        const hasNativeFields = /Bank Name/i.test(txt) && /(Add Entry|Save Entry|Save Changes|Update Entry|Cancel)/i.test(txt);
        if (hasNativeFields) return el;
      }
    }
    return null;
  }

  function firstInputNearLabel(label){
    const forId = label.getAttribute && label.getAttribute('for');
    if (forId && document.getElementById(forId)) return document.getElementById(forId);
    let p = label.parentElement;
    for (let i = 0; i < 5 && p; i++, p = p.parentElement) {
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
      const txt = clean(label.textContent).toLowerCase().replace(/\*/g, '');
      if (tests.some(t => txt.includes(t))) {
        const f = firstInputNearLabel(label);
        if (f) return f;
      }
    }
    return null;
  }

  function nativeValue(sheet, tests){
    const f = findField(sheet, tests);
    return f ? (f.value || '') : '';
  }

  function numberOnly(v){
    const n = parseFloat(String(v || '').replace(/[$,\s]/g, '').match(/-?\d+(?:\.\d+)?/)?.[0] || '');
    return Number.isFinite(n) ? n : 0;
  }

  function getVal(id){ return document.getElementById(id)?.value || ''; }
  function getNum(id){ return numberOnly(getVal(id)); }
  function safeDate(id){ return clean(getVal(id)); }

  function normalizeChurn(v){
    const s = clean(v).toLowerCase();
    if (!s || /select/.test(s)) return '';
    if (/180/.test(s)) return '180';
    if (/3/.test(s)) return '3';
    if (/2/.test(s)) return '2';
    if (/1|12|year/.test(s)) return '1';
    return String(v || '').trim();
  }

  function churnLabel(v){
    const s = normalizeChurn(v);
    if (s === '180') return '180 Days';
    if (s === '3') return '3 Years';
    if (s === '2') return '2 Years';
    if (s === '1') return '1 Year';
    return 'Select';
  }

  function getGlobalModal(){
    try { return typeof modal !== 'undefined' ? modal : null; } catch { return null; }
  }

  function recordIdFromText(sheet){
    const txt = clean(sheet?.textContent || '');
    const m = txt.match(/\b[A-Z]{2,5}-[PB]-\d{1,4}\b/i);
    return m ? m[0].toUpperCase() : '';
  }

  function findEntryIndex(sheet){
    const m = getGlobalModal();
    try {
      if (m && m._edit !== undefined && entries[m._edit]) return Number(m._edit);
    } catch {}
    const id = recordIdFromText(sheet);
    try {
      if (id) {
        const byId = entries.findIndex(e => String(e.id || '').toUpperCase() === id);
        if (byId >= 0) return byId;
      }
    } catch {}
    const bank = nativeValue(sheet, ['bank name']);
    try {
      if (bank) {
        const byBank = entries.findIndex(e => clean(e.bank).toLowerCase() === clean(bank).toLowerCase());
        if (byBank >= 0) return byBank;
      }
    } catch {}
    return -1;
  }

  function inferData(sheet, mode){
    activeIndex = mode === 'edit' ? findEntryIndex(sheet) : -1;
    let e = {};
    try { if (activeIndex >= 0) e = entries[activeIndex] || {}; } catch {}
    activeOriginal = e && e.id ? { ...e } : null;
    const nativeEarly = nativeValue(sheet, ['early termination fee']);
    const nativeHold = nativeValue(sheet, ['hold until days', 'close fee countdown']);
    return {
      id: e.id || recordIdFromText(sheet) || '',
      bank: e.bank || nativeValue(sheet, ['bank name']),
      bonus: e.bonus || nativeValue(sheet, ['amount']),
      churn: e.churn || nativeValue(sheet, ['churn rule']),
      monthlyFee: e.monthlyFeeYNText || nativeValue(sheet, ['monthly fee']),
      promo: e.promoCodeText || nativeValue(sheet, ['promo code']),
      waivers: e.avoidMonthlyFeeText || nativeValue(sheet, ['avoid the monthly fee']),
      complete: e.completeBonusText || nativeValue(sheet, ['complete the bonus']),
      earlyFee: e.earlyCloseFee ?? numberOnly(nativeEarly),
      holdDays: e.minHoldDays || numberOnly(nativeHold),
      eligibility: e.eligibilityText || nativeValue(sheet, ['eligibility']),
      reqDays: e.reqDays || e.requiredDaysText || nativeValue(sheet, ['how many days', 'required to complete']),
      opened: e.opened || nativeValue(sheet, ['opened']),
      closed: e.closed || nativeValue(sheet, ['closed']),
      bonusRecd: e.bonusRecd || nativeValue(sheet, ['bonus received']),
      reqMet: e.reqMet || nativeValue(sheet, ['req met']),
      notes: e.notes || nativeValue(sheet, ['your notes','notes']),
      dataPoint: e.dataPoint || '',
      customTimers: Array.isArray(e.customTimers) ? e.customTimers : []
    };
  }

  function chip(label, value, cls = 'blue'){
    return `<div class="tcr-chip ${cls}"><span>${html(label)}</span><b>${html(value || '—')}</b></div>`;
  }

  function field(label, id, value = '', type = 'text', hint = ''){
    return `<div class="tcr-field"><label>${html(label)}</label><input id="${id}" type="${type}" value="${html(value || '')}" ${type === 'number' ? 'inputmode="decimal" min="0" step="1"' : ''}>${hint ? `<small>${html(hint)}</small>` : ''}</div>`;
  }

  function area(label, id, value = '', rows = 4, hint = ''){
    return `<div class="tcr-field wide"><label>${html(label)}</label><textarea id="${id}" rows="${rows}">${html(value || '')}</textarea>${hint ? `<small>${html(hint)}</small>` : ''}</div>`;
  }

  function section(title, subtitle, body){
    return `<section class="tcr-section"><div class="tcr-section-head"><h4>${html(title)}</h4>${subtitle ? `<p>${html(subtitle)}</p>` : ''}</div>${body}</section>`;
  }

  function updateSummary(sheet){
    const chips = sheet.querySelector('.tcr-summary');
    if (!chips) return;
    const bank = clean(getVal('mer_bank')) || 'New bank';
    const bonus = getNum('mer_bonus');
    const churn = churnLabel(getVal('mer_churn'));
    const req = clean(getVal('mer_reqdays')) || '—';
    chips.innerHTML = [
      chip('Bank', bank, 'blue'),
      chip('Bonus', bonus ? money(bonus) : '—', bonus ? 'green' : 'amber'),
      chip('Churn Rule', churn, 'amber'),
      chip('Req Days', req, 'purple')
    ].join('');
  }

  function openManualReview(sheet){
    if (!sheet || sheet.dataset.manualReviewOpen === '1') return;
    if (sheet.querySelector?.('.manual-review-sheet')) return;

    const title = titleForSheet(sheet);
    const mode = /^Edit Entry$/i.test(title) ? 'edit' : 'new';
    activeMode = mode;
    const d = inferData(sheet, mode);

    sheet.dataset.manualReviewOpen = '1';
    sheet.innerHTML = '';
    sheet.classList.add('tcr-sheet', 'manual-review-sheet');
    sheet.onclick = e => e.stopPropagation();

    const saveText = mode === 'edit' ? 'Save Changes' : 'Add Entry';
    const heroTitle = mode === 'edit' ? 'Edit Entry' : 'New Entry';
    const heroCopy = mode === 'edit'
      ? 'Update this bank using the same clean review layout. Churn Rule stays tied to the countdown.'
      : 'Same layout as Analyzer Pro. Fill the basics, choose the churn rule, then save the bank.';

    sheet.innerHTML = `
      <div class="tcr-grabber"></div>
      <header class="tcr-hero"><div><div class="tcr-kicker">${mode === 'edit' ? 'Edit Entry Review' : 'Manual Entry Review'}</div><h3>${heroTitle}</h3><p>${heroCopy}</p></div><div class="tcr-version">v${VER}</div></header>
      <div class="tcr-summary">
        ${chip('Bank', d.bank || 'New bank', 'blue')}
        ${chip('Bonus', d.bonus ? money(d.bonus) : '—', d.bonus ? 'green' : 'amber')}
        ${chip('Churn Rule', churnLabel(d.churn), 'amber')}
        ${chip('Req Days', d.reqDays || '—', 'purple')}
      </div>
      ${d.id ? `<div class="manual-record-pill">Record ID: ${html(d.id)}</div>` : ''}
      ${section('1. Promo Basics', 'The key fields needed to track this bank bonus.',
        '<div class="tcr-grid">' +
        field('Bank', 'mer_bank', d.bank, 'text') +
        field('Bonus Amount', 'mer_bonus', d.bonus, 'number') +
        `<div class="tcr-field"><label>Churn Rule</label><select id="mer_churn"><option value="">Select</option><option value="1" ${normalizeChurn(d.churn)==='1'?'selected':''}>1 Year</option><option value="2" ${normalizeChurn(d.churn)==='2'?'selected':''}>2 Years</option><option value="3" ${normalizeChurn(d.churn)==='3'?'selected':''}>3 Years</option><option value="180" ${normalizeChurn(d.churn)==='180'?'selected':''}>180 Days</option></select><small>This drives the countdown after the bank is closed.</small></div>` +
        field('Promo Code', 'mer_promo', d.promo, 'text') +
        '</div>')}
      ${section('2. Requirements', 'Use these fields for the requirement countdown and future reference.',
        '<div class="tcr-grid">' +
        field('Requirement Days', 'mer_reqdays', d.reqDays, 'number') +
        field('Hold Until Days', 'mer_holddays', d.holdDays, 'number', 'Minimum days to keep the account open before closing. This is separate from Churn Rule.') +
        field('Opened Date', 'mer_opened', d.opened, 'date') +
        field('Req Met Date', 'mer_reqmet', d.reqMet, 'date') +
        field('Bonus Received', 'mer_bonusrecd', d.bonusRecd, 'date') +
        field('Closed Date', 'mer_closed', d.closed, 'date') +
        '</div>' +
        area('How to Complete Bonus', 'mer_complete', d.complete, 5))}
      ${section('3. Fees & Risk', 'Monthly fees, fee waivers, numeric early termination fee, and eligibility.',
        '<div class="tcr-grid">' +
        field('Monthly Fee (Yes / No)', 'mer_monthly', d.monthlyFee, 'text') +
        field('Early Termination Fee $', 'mer_earlyfee', d.earlyFee, 'number', 'Number only. Use 0 if none or not mentioned.') +
        '</div>' +
        area('How to Avoid Monthly Fee', 'mer_waivers', d.waivers, 3) +
        area('Eligibility / Churn', 'mer_eligibility', d.eligibility, 4))}
      ${section('4. Your Notes', 'Personal notes are kept separate from analyzer-generated terms.',
        area('Notes', 'mer_notes', d.notes, 4))}
      <div class="tcr-actions manual-review-actions"><button class="tcr-cancel" id="mer_cancel">Cancel</button><button class="tcr-save" id="mer_save">${saveText}</button></div>
    `;

    bindManualReview(sheet);
    updateSummary(sheet);
  }

  function buildEntryPayload(existing){
    const bank = clean(getVal('mer_bank'));
    const churn = normalizeChurn(getVal('mer_churn'));
    const earlyFee = getNum('mer_earlyfee');
    const id = existing?.id || (() => {
      try { return typeof genId === 'function' ? genId(bank, new Set((entries || []).map(e => e.id))) : ('BNK-P-' + Date.now().toString().slice(-6)); }
      catch { return 'BNK-P-' + Date.now().toString().slice(-6); }
    })();

    return {
      ...(existing || {}),
      id,
      bank,
      bonus: getNum('mer_bonus'),
      churn,
      opened: safeDate('mer_opened'),
      bonusRecd: safeDate('mer_bonusrecd'),
      closed: safeDate('mer_closed'),
      reqMet: safeDate('mer_reqmet'),
      dataPoint: existing?.dataPoint || '',
      notes: clean(getVal('mer_notes')),
      reqDays: parseInt(getVal('mer_reqdays'), 10) || 0,
      minHoldDays: parseInt(getVal('mer_holddays'), 10) || 0,
      earlyCloseFee: earlyFee,
      feeChecked: existing?.feeChecked || false,
      plannedClose: existing?.plannedClose || '',
      customTimers: Array.isArray(existing?.customTimers) ? existing.customTimers : [],
      monthlyFeeYNText: clean(getVal('mer_monthly')),
      promoCodeText: clean(getVal('mer_promo')),
      avoidMonthlyFeeText: clean(getVal('mer_waivers')),
      completeBonusText: clean(getVal('mer_complete')),
      earlyTerminationFeeText: earlyFee ? String(earlyFee) : '0',
      eligibilityText: clean(getVal('mer_eligibility')),
      expirationDateText: existing?.expirationDateText || '',
      requiredDaysText: clean(getVal('mer_reqdays'))
    };
  }

  function closeManualReview(){
    try { modal = null; } catch {}
    if (typeof R === 'function') R();
  }

  function saveEntry(){
    const bank = clean(getVal('mer_bank'));
    const churn = normalizeChurn(getVal('mer_churn'));
    if (!bank) { alert('Bank name is required.'); return; }
    if (!churn) { alert('Churn Rule is required because it drives the churn countdown.'); return; }

    try {
      const existing = activeIndex >= 0 ? entries[activeIndex] : activeOriginal;
      if (activeMode === 'edit' && activeIndex < 0 && !existing) {
        alert('Could not locate the existing record to update. Refresh and try again.');
        return;
      }
      const e = buildEntryPayload(existing);
      if (activeMode === 'edit') entries[activeIndex] = e;
      else entries.unshift(e);

      if (typeof syncProfileEventsFromEntry === 'function') syncProfileEventsFromEntry(e);
      if (typeof refreshSavedReqFromEntry === 'function') refreshSavedReqFromEntry(e);
      if (typeof sv === 'function' && typeof SK !== 'undefined') sv(SK, entries);
      if (typeof saveReq === 'function') saveReq(e.bank, {
        bank:e.bank, bonus:e.bonus, churn:e.churn, reqDays:e.reqDays, minHoldDays:e.minHoldDays, earlyCloseFee:e.earlyCloseFee,
        monthlyFeeYNText:e.monthlyFeeYNText, promoCodeText:e.promoCodeText, avoidMonthlyFeeText:e.avoidMonthlyFeeText,
        completeBonusText:e.completeBonusText, earlyTerminationFeeText:e.earlyTerminationFeeText,
        eligibilityText:e.eligibilityText, requiredDaysText:e.requiredDaysText
      });

      closeManualReview();
      setTimeout(() => alert((activeMode === 'edit' ? 'Entry updated for ' : 'New entry created for ') + e.bank + '. Churn Rule saved as ' + churnLabel(e.churn) + '.'), 60);
    } catch (err) {
      console.error('[manual-entry-review]', err);
      alert('Could not save entry. Refresh and try again.');
    }
  }

  function bindManualReview(sheet){
    sheet.addEventListener('input', () => updateSummary(sheet), true);
    sheet.addEventListener('change', () => updateSummary(sheet), true);
    sheet.querySelector('#mer_cancel')?.addEventListener('click', e => { e.preventDefault(); closeManualReview(); });
    sheet.querySelector('#mer_save')?.addEventListener('click', e => { e.preventDefault(); saveEntry(); });
  }

  function scan(){
    const sheet = findNativeSheet();
    if (!sheet) return;
    const title = titleForSheet(sheet);
    if (/^(New Entry|Edit Entry)$/i.test(title)) openManualReview(sheet);
  }

  function scheduleScan(){
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 90);
  }

  new MutationObserver(scheduleScan).observe(document.documentElement, { childList:true, subtree:true });
  setTimeout(scan, 500);
  window.openManualEntryReview = () => { const s = findNativeSheet(); if (s) openManualReview(s); };
})();
