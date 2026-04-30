/* ✅ Version 2.7.1 Newest update: New Entry + Edit Entry now use the same professional review form. Edit updates existing record instead of duplicating. */
(function(){
  const VER = '2.7.1';
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const html = v => {
    if (typeof esc === 'function') return esc(String(v ?? ''));
    const d = document.createElement('div');
    d.textContent = String(v ?? '');
    return d.innerHTML;
  };
  const money = n => '$' + Number(n || 0).toLocaleString();

  let activeSheet = null;
  let activeMode = 'new';
  let activeIndex = -1;
  let activeOriginal = null;

  function isManualTitle(t){ return /^(New Entry|Edit Entry)$/i.test(clean(t)); }

  function findNativeSheet(){
    const heads = qsa('h1,h2,h3,.modal-title,.sheet-title').filter(h => isManualTitle(h.textContent));
    for (const h of heads) {
      let el = h;
      for (let i=0; i<10 && el; i++, el=el.parentElement) {
        const txt = clean(el.textContent);
        if (/Bank Name/i.test(txt) && /(Add Entry|Save Entry|Save Changes|Update Entry|Cancel)/i.test(txt) && !el.classList.contains('manual-review-sheet')) return el;
      }
    }
    return null;
  }

  function titleForSheet(sheet){
    const h = qsa('h1,h2,h3,.modal-title,.sheet-title', sheet).find(x => isManualTitle(x.textContent));
    return clean(h?.textContent || 'New Entry');
  }

  function firstInputNearLabel(label){
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

  function getNum(id){ return parseFloat(String(document.getElementById(id)?.value || '').replace(/[$,\s]/g,'')) || 0; }
  function getVal(id){ return document.getElementById(id)?.value || ''; }
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

  function getGlobalModal(){ try { return typeof modal !== 'undefined' ? modal : null; } catch { return null; } }

  function recordIdFromText(sheet){
    const txt = clean(sheet?.textContent || '');
    const m = txt.match(/\b[A-Z]{2,5}-[PB]-\d{1,4}\b/i);
    return m ? m[0].toUpperCase() : '';
  }

  function resolveExistingEntry(sheet){
    let idx = -1;
    let entry = null;
    const m = getGlobalModal();
    try {
      if (m && m._edit !== undefined && entries[m._edit]) idx = Number(m._edit);
    } catch {}
    if (idx < 0) {
      const id = recordIdFromText(sheet);
      try { if (id) idx = entries.findIndex(e => String(e.id || '').toUpperCase() === id); } catch {}
    }
    if (idx < 0) {
      const bank = nativeValue(sheet, ['bank name']);
      try { if (bank) idx = entries.findIndex(e => clean(e.bank).toLowerCase() === clean(bank).toLowerCase()); } catch {}
    }
    try { if (idx >= 0 && entries[idx]) entry = entries[idx]; } catch {}
    return { idx, entry };
  }

  function inferData(sheet, mode){
    const found = mode === 'edit' ? resolveExistingEntry(sheet) : { idx:-1, entry:null };
    activeIndex = found.idx;
    activeOriginal = found.entry ? { ...found.entry } : null;
    const e = found.entry || {};
    return {
      id: e.id || recordIdFromText(sheet) || '',
      bank: e.bank || nativeValue(sheet, ['bank name']),
      bonus: e.bonus || nativeValue(sheet, ['amount']),
      churn: e.churn || nativeValue(sheet, ['churn rule']),
      monthlyFee: e.monthlyFeeYNText || nativeValue(sheet, ['monthly fee']),
      promo: e.promoCodeText || nativeValue(sheet, ['promo code']),
      waivers: e.avoidMonthlyFeeText || nativeValue(sheet, ['avoid the monthly fee']),
      complete: e.completeBonusText || nativeValue(sheet, ['complete the bonus']),
      earlyFee: e.earlyTerminationFeeText || nativeValue(sheet, ['early termination fee']),
      closeFeeCountdown: e.minHoldDays || nativeValue(sheet, ['close fee countdown']),
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

  function chip(label, value, cls='blue'){
    return `<div class="tcr-chip ${cls}"><span>${html(label)}</span><b>${html(value || '—')}</b></div>`;
  }

  function field(label, id, value='', type='text', hint=''){
    return `<div class="tcr-field"><label>${html(label)}</label><input id="${id}" type="${type}" value="${html(value || '')}" ${type==='number'?'inputmode="decimal"':''}>${hint?`<small>${html(hint)}</small>`:''}</div>`;
  }

  function area(label, id, value='', rows=4, hint=''){
    return `<div class="tcr-field wide"><label>${html(label)}</label><textarea id="${id}" rows="${rows}">${html(value || '')}</textarea>${hint?`<small>${html(hint)}</small>`:''}</div>`;
  }

  function section(title, subtitle, body){
    return `<section class="tcr-section"><div class="tcr-section-head"><h4>${html(title)}</h4>${subtitle?`<p>${html(subtitle)}</p>`:''}</div>${body}</section>`;
  }

  function openManualReview(sheet){
    if (!sheet || sheet.dataset.manualReviewOpen === '1') return;
    const title = titleForSheet(sheet);
    const mode = /^Edit Entry$/i.test(title) ? 'edit' : 'new';
    sheet.dataset.manualReviewOpen = '1';
    activeSheet = sheet;
    activeMode = mode;
    const d = inferData(sheet, mode);
    sheet.innerHTML = '';
    sheet.classList.add('tcr-sheet','manual-review-sheet');
    sheet.onclick = e => e.stopPropagation();
    const saveText = mode === 'edit' ? 'Save Changes' : 'Add Entry';
    const heroTitle = mode === 'edit' ? 'Edit Entry' : 'New Entry';
    const heroCopy = mode === 'edit'
      ? 'Update this bank using the same clean review layout. Churn Rule stays tied to the countdown.'
      : 'Same layout as Analyzer Pro. Fill the basics, choose the churn rule, then save the bank.';
    const summary = [
      chip('Bank', d.bank || 'New bank', 'blue'),
      chip('Bonus', d.bonus ? money(d.bonus) : '—', d.bonus ? 'green' : 'amber'),
      chip('Churn Rule', churnLabel(d.churn), 'amber'),
      chip('Req Days', d.reqDays || '—', 'purple')
    ].join('');

    sheet.innerHTML = `
      <div class="tcr-grabber"></div>
      <header class="tcr-hero"><div><div class="tcr-kicker">${mode === 'edit' ? 'Edit Entry Review' : 'Manual Entry Review'}</div><h3>${heroTitle}</h3><p>${heroCopy}</p></div><div class="tcr-version">v${VER}</div></header>
      <div class="tcr-summary">${summary}</div>
      ${d.id ? `<div class="manual-record-pill">Record ID: ${html(d.id)}</div>` : ''}
      ${section('1. Promo Basics','The key fields needed to track this bank bonus.',
        '<div class="tcr-grid">'+
        field('Bank','mer_bank',d.bank,'text')+
        field('Bonus Amount','mer_bonus',d.bonus,'number')+
        `<div class="tcr-field"><label>Churn Rule</label><select id="mer_churn"><option value="">Select</option><option value="1" ${normalizeChurn(d.churn)==='1'?'selected':''}>1 Year</option><option value="2" ${normalizeChurn(d.churn)==='2'?'selected':''}>2 Years</option><option value="3" ${normalizeChurn(d.churn)==='3'?'selected':''}>3 Years</option><option value="180" ${normalizeChurn(d.churn)==='180'?'selected':''}>180 Days</option></select><small>This drives the countdown after the bank is closed.</small></div>`+
        field('Promo Code','mer_promo',d.promo,'text')+
        '</div>')}
      ${section('2. Requirements','Use these fields for the requirement countdown and future reference.',
        '<div class="tcr-grid">'+
        field('Requirement Days','mer_reqdays',d.reqDays,'number')+
        field('Close Fee Countdown','mer_closefee',d.closeFeeCountdown,'number')+
        field('Opened Date','mer_opened',d.opened,'date')+
        field('Req Met Date','mer_reqmet',d.reqMet,'date')+
        field('Bonus Received','mer_bonusrecd',d.bonusRecd,'date')+
        field('Closed Date','mer_closed',d.closed,'date')+
        '</div>'+
        area('How to Complete Bonus','mer_complete',d.complete,5))}
      ${section('3. Fees & Risk','Monthly fees, fee waivers, early close risk, and eligibility.',
        '<div class="tcr-grid">'+
        field('Monthly Fee (Yes / No)','mer_monthly',d.monthlyFee,'text')+
        field('Early Termination Fee','mer_earlyfee',d.earlyFee,'text')+
        '</div>'+
        area('How to Avoid Monthly Fee','mer_waivers',d.waivers,3)+
        area('Eligibility / Churn','mer_eligibility',d.eligibility,4))}
      ${section('4. Your Notes','Personal notes are kept separate from analyzer-generated terms.',
        area('Notes','mer_notes',d.notes,4))}
      <div class="tcr-actions manual-review-actions"><button class="tcr-cancel" id="mer_cancel">Cancel</button><button class="tcr-save" id="mer_save">${saveText}</button></div>
    `;
    bindManualReview(sheet);
    updateSummary(sheet);
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
      chip('Bonus', bonus ? money(bonus) : '—', bonus ? 'green':'amber'),
      chip('Churn Rule', churn, 'amber'),
      chip('Req Days', req, 'purple')
    ].join('');
  }

  function closeManualReview(){
    try { modal = null; } catch {}
    if (typeof R === 'function') R();
  }

  function buildEntryPayload(existing){
    const bank = clean(getVal('mer_bank'));
    const bonus = getNum('mer_bonus');
    const churn = normalizeChurn(getVal('mer_churn'));
    const id = existing?.id || (() => {
      try { return typeof genId === 'function' ? genId(bank, new Set((entries || []).map(e => e.id))) : ('BNK-P-' + Date.now().toString().slice(-6)); }
      catch { return 'BNK-P-' + Date.now().toString().slice(-6); }
    })();
    return {
      ...(existing || {}),
      id,
      bank,
      bonus,
      churn,
      opened: safeDate('mer_opened'),
      bonusRecd: safeDate('mer_bonusrecd'),
      closed: safeDate('mer_closed'),
      reqMet: safeDate('mer_reqmet'),
      dataPoint: existing?.dataPoint || '',
      notes: clean(getVal('mer_notes')),
      reqDays: parseInt(getVal('mer_reqdays'),10) || 0,
      minHoldDays: parseInt(getVal('mer_closefee'),10) || 0,
      earlyCloseFee: existing?.earlyCloseFee || 0,
      feeChecked: existing?.feeChecked || false,
      plannedClose: existing?.plannedClose || '',
      customTimers: Array.isArray(existing?.customTimers) ? existing.customTimers : [],
      monthlyFeeYNText: clean(getVal('mer_monthly')),
      promoCodeText: clean(getVal('mer_promo')),
      avoidMonthlyFeeText: clean(getVal('mer_waivers')),
      completeBonusText: clean(getVal('mer_complete')),
      earlyTerminationFeeText: clean(getVal('mer_earlyfee')),
      eligibilityText: clean(getVal('mer_eligibility')),
      expirationDateText: existing?.expirationDateText || '',
      requiredDaysText: clean(getVal('mer_reqdays'))
    };
  }

  function saveEntry(){
    const bank = clean(getVal('mer_bank'));
    const churn = normalizeChurn(getVal('mer_churn'));
    if (!bank) { alert('Bank name is required.'); return; }
    if (!churn) { alert('Churn Rule is required because it drives the churn countdown.'); return; }
    try {
      const existing = activeIndex >= 0 ? entries[activeIndex] : activeOriginal;
      const e = buildEntryPayload(existing);
      if (activeMode === 'edit' && activeIndex >= 0) entries[activeIndex] = e;
      else entries.unshift(e);
      if (typeof syncProfileEventsFromEntry === 'function') syncProfileEventsFromEntry(e);
      if (typeof refreshSavedReqFromEntry === 'function') refreshSavedReqFromEntry(e);
      if (typeof sv === 'function' && typeof SK !== 'undefined') sv(SK, entries);
      if (typeof saveReq === 'function') saveReq(e.bank, {
        bank:e.bank, bonus:e.bonus, churn:e.churn, reqDays:e.reqDays, minHoldDays:e.minHoldDays,
        monthlyFeeYNText:e.monthlyFeeYNText, promoCodeText:e.promoCodeText, avoidMonthlyFeeText:e.avoidMonthlyFeeText,
        completeBonusText:e.completeBonusText, earlyTerminationFeeText:e.earlyTerminationFeeText,
        eligibilityText:e.eligibilityText, requiredDaysText:e.requiredDaysText
      });
      closeManualReview();
      setTimeout(()=>alert((activeMode === 'edit' ? 'Entry updated for ' : 'New entry created for ') + e.bank + '. Churn Rule saved as '+churnLabel(e.churn)+'.'),60);
    } catch(err) {
      console.error('[manual-entry-review]', err);
      alert('Could not save entry. Refresh and try again.');
    }
  }

  function bindManualReview(sheet){
    sheet.addEventListener('input',()=>updateSummary(sheet),true);
    sheet.addEventListener('change',()=>updateSummary(sheet),true);
    sheet.querySelector('#mer_cancel')?.addEventListener('click', e=>{e.preventDefault(); closeManualReview();});
    sheet.querySelector('#mer_save')?.addEventListener('click', e=>{e.preventDefault(); saveEntry();});
  }

  function scan(){
    const sheet = findNativeSheet();
    if (!sheet) return;
    const title = titleForSheet(sheet);
    if (/^(New Entry|Edit Entry)$/i.test(title)) openManualReview(sheet);
  }

  new MutationObserver(()=>setTimeout(scan,40)).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(scan,500);
  window.openManualEntryReview = () => { const s=findNativeSheet(); if(s) openManualReview(s); };
})();
