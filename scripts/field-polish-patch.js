/*
 * filename: scripts/field-polish-patch.js
 * version: 2.7.9
 * purpose: Rename promo date label to Promo Expiration / Open-by Date with crash-safe one-time polish.
 * last-touched: unknown
 */
(function(){
  const VER = '2.7.9';
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const money = n => '$' + Number(n || 0).toLocaleString();
  const num = v => {
    const m = String(v || '').replace(/[$,\s]/g,'').match(/-?\d+(?:\.\d+)?/);
    const n = m ? parseFloat(m[0]) : 0;
    return Number.isFinite(n) ? n : 0;
  };

  function addDaysIso(start, days){
    try { if (typeof timerDueFromStart === 'function') return timerDueFromStart(start, days); } catch {}
    try { if (typeof addD === 'function') return addD(start, days); } catch {}
    const d = new Date(String(start) + 'T00:00:00');
    d.setDate(d.getDate() + (parseInt(days,10) || 0));
    return d.toISOString().split('T')[0];
  }
  function timerIdLocal(){
    try { if (typeof timerId === 'function') return timerId(); } catch {}
    return 'tm_' + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-4);
  }
  function makeTimer(text, date, startDate='', daysRequired=0){
    const raw = { id:timerIdLocal(), text, startDate:startDate || '', daysRequired:Number(daysRequired || 0), date:date || '', done:false };
    try { return typeof normalizeTimer === 'function' ? normalizeTimer(raw) : raw; } catch { return raw; }
  }
  function getVal(id){ return document.getElementById(id)?.value || ''; }
  function getNum(id){ return num(getVal(id)); }
  function checked(id){ return !!document.getElementById(id)?.checked; }
  function rawTerms(){
    const values = qsa('textarea').map(a => a.value || '').filter(v => /bonus|qualifying|direct deposit|monthly service fee|monthly account fee|offer|promo|checking/i.test(v));
    values.sort((a,b)=>b.length-a.length);
    return values[0] || '';
  }
  function inferHoldDays(){
    const payout = clean(getVal('tcr_payout'));
    const explicit = parseInt(getVal('tcr_holddays'),10) || 0;
    if (explicit) return explicit;
    if (/120/.test(payout)) return 120;
    return 0;
  }
  function pretty(iso){
    if (!iso) return '';
    try { return typeof fD === 'function' ? fD(iso) : iso; } catch { return iso; }
  }
  function inferBank(raw){
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
    return m ? clean(m[1]) : 'New Bank Bonus';
  }
  function newRecordId(bank){
    try { if (typeof genId === 'function') return genId(bank, new Set((entries || []).map(e => e.id))); } catch {}
    return 'BNK-P-' + Date.now().toString().slice(-6);
  }
  function textPlan(){
    const lines = [];
    const promo = clean(getVal('tcr_promo'));
    const fundedDays = parseInt(getVal('tcr_funded_days'), 10) || 0;
    const count = parseInt(getVal('tcr_dd_count'), 10) || 0;
    const reqMoney = getNum('tcr_req_money');
    const reqDays = parseInt(getVal('tcr_req_days'), 10) || 0;
    const payout = clean(getVal('tcr_payout'));
    lines.push(`1. Open one eligible account${promo ? ` using promo code ${promo}` : ''}.`);
    if (fundedDays) lines.push(`${lines.length + 1}. Fund the account within ${fundedDays} days to keep it open.`);
    lines.push(`${lines.length + 1}. Receive ${count ? `at least ${count} ` : ''}qualifying Direct Deposits${reqMoney ? ` of ${money(reqMoney)}+ each` : ''}${reqDays ? ` within ${reqDays} days of account opening` : ''}.`);
    lines.push(`${lines.length + 1}. Bonus payout: ${payout || 'review payout timing'}.`);
    lines.push(`${lines.length + 1}. Keep account open and in good standing until payout.`);
    return lines.join('\n');
  }
  function buildTimers(){
    const timers = [];
    const opened = clean(getVal('tcr_opened'));
    const raw = rawTerms();
    let parsed = {};
    try { if (typeof tcStrictAnalyze === 'function') parsed = tcStrictAnalyze(raw); } catch {}
    if (checked('tcr_timer_promo') && parsed.openBy) timers.push(makeTimer('Promo expiration / open-by deadline', parsed.openBy));
    const reqDays = parseInt(getVal('tcr_req_days'), 10) || 0;
    const fundedDays = parseInt(getVal('tcr_funded_days'), 10) || 0;
    const holdDays = inferHoldDays();
    if (checked('tcr_timer_req') && opened && reqDays) timers.push(makeTimer('Bonus requirement deadline', addDaysIso(opened, reqDays), opened, reqDays));
    if (checked('tcr_timer_fund') && opened && fundedDays) timers.push(makeTimer('Funding deadline', addDaysIso(opened, fundedDays), opened, fundedDays));
    if (checked('tcr_timer_payout') && opened && holdDays) timers.push(makeTimer('Expected bonus payout / hold check', addDaysIso(opened, holdDays), opened, holdDays));
    return timers;
  }

  function renamePromoDateLabel(){
    const sheet = document.querySelector('.tcr-sheet');
    if (!sheet || !sheet.textContent.includes('Auto-fill New Entry')) return;
    const openBy = document.getElementById('tcr_openby');
    const label = openBy?.closest('.tcr-field')?.querySelector('label');
    if (label) label.textContent = 'Promo Expiration / Open-by Date';
    qsa('.tcr-timer-row b', sheet).forEach(b => {
      if (/promo\/open-by deadline/i.test(b.textContent || '')) b.textContent = 'Promo expiration / open-by deadline';
    });
  }

  function ensureHiddenCompatFields(){
    const sheet = document.querySelector('.tcr-sheet');
    if (!sheet || !sheet.textContent.includes('Auto-fill New Entry')) return;
    renamePromoDateLabel();
    if (!document.getElementById('tcr_earlyfee')) sheet.insertAdjacentHTML('beforeend','<input id="tcr_earlyfee" type="hidden" value="0">');
    if (!document.getElementById('tcr_holddays')) {
      const payout = clean(getVal('tcr_payout'));
      const defaultHold = /120/.test(payout) ? 120 : '';
      sheet.insertAdjacentHTML('beforeend',`<input id="tcr_holddays" type="hidden" value="${defaultHold}">`);
    }
  }

  function createReviewedEntry(){
    const sheet = document.querySelector('.tcr-sheet');
    if (!sheet || !sheet.textContent.includes('Auto-fill New Entry')) return false;
    ensureHiddenCompatFields();
    const raw = rawTerms();
    let parsed = {};
    try { if (typeof tcStrictAnalyze === 'function') parsed = tcStrictAnalyze(raw); } catch {}
    const bank = clean(getVal('tcr_bank')) || parsed.bank || inferBank(raw);
    const bonus = getNum('tcr_bonus');
    if (!bank) { alert('Bank name is required.'); return true; }
    if (!bonus) { alert('Bonus amount is missing. Review before saving.'); return true; }

    const reqDays = parseInt(getVal('tcr_req_days'), 10) || 0;
    const holdDays = inferHoldDays();
    const earlyFee = getNum('tcr_earlyfee');
    const payout = clean(getVal('tcr_payout'));
    const notCounts = clean(getVal('tcr_not_counts'));
    const notesParts = ['Created from T&C Analyzer Pro Review Form. Review all fields before opening/applying.'];
    if (notCounts) notesParts.push('Does NOT count: ' + notCounts.replace(/\n/g, '; '));
    if (payout) notesParts.push('Payout: ' + payout);
    if (holdDays) notesParts.push('Hold until: ' + holdDays + ' days after opening before closing.');

    const entry = {
      id: newRecordId(bank), bank, bonus, churn: parsed.prior ? 1 : '',
      opened: clean(getVal('tcr_opened')), bonusRecd: '', closed: '', dataPoint: clean(getVal('tcr_counts')),
      notes: notesParts.join('\n'), reqDays, minHoldDays: holdDays, earlyCloseFee: earlyFee,
      feeChecked: false, plannedClose: '', customTimers: buildTimers(),
      monthlyFeeYNText: getNum('tcr_fee') ? `Yes — ${money(getNum('tcr_fee'))} monthly fee` : 'Not clearly stated in pasted T&C',
      promoCodeText: clean(getVal('tcr_promo')),
      avoidMonthlyFeeText: clean(getVal('tcr_waivers')),
      completeBonusText: clean(getVal('tcr_complete')) || textPlan(),
      earlyTerminationFeeText: earlyFee ? String(earlyFee) : '0',
      eligibilityText: clean(getVal('tcr_eligibility')),
      expirationDateText: clean(getVal('tcr_openby')) ? pretty(clean(getVal('tcr_openby'))) : '',
      requiredDaysText: reqDays ? String(reqDays) : ''
    };

    try {
      entries.unshift(entry);
      if (typeof sv === 'function' && typeof SK !== 'undefined') sv(SK, entries);
      if (typeof saveReq === 'function') saveReq(entry.bank, {
        bank: entry.bank, bonus: entry.bonus, reqDays: entry.reqDays, minHoldDays: entry.minHoldDays, earlyCloseFee: entry.earlyCloseFee,
        monthlyFeeYNText: entry.monthlyFeeYNText, promoCodeText: entry.promoCodeText, avoidMonthlyFeeText: entry.avoidMonthlyFeeText,
        completeBonusText: entry.completeBonusText, earlyTerminationFeeText: entry.earlyTerminationFeeText,
        eligibilityText: entry.eligibilityText, expirationDateText: entry.expirationDateText, requiredDaysText: entry.requiredDaysText, dataPoint: entry.dataPoint
      });
      document.getElementById('tc_review_overlay')?.remove();
      if (typeof R === 'function') R();
      setTimeout(() => alert('New entry created for ' + entry.bank + (entry.customTimers.length ? ` with ${entry.customTimers.length} mini timer(s).` : '. Add Opened Date later to auto-create requirement timers.') + ' Review the entry before opening/applying.'), 80);
    } catch (err) {
      console.error('[field-polish-patch]', err);
      alert('Could not create the entry. Refresh and try again.');
    }
    return true;
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (/Create Entry \+ Timers/i.test(btn.textContent || '') && document.querySelector('.tcr-sheet')?.textContent.includes('Auto-fill New Entry')) {
      e.preventDefault(); e.stopImmediatePropagation(); createReviewedEntry(); return;
    }
    setTimeout(ensureHiddenCompatFields, 120);
    setTimeout(renamePromoDateLabel, 320);
  }, true);

  if (!document.getElementById('field_polish_patch_style')) {
    const st = document.createElement('style');
    st.id = 'field_polish_patch_style';
    st.textContent = `.app-version::after{content:' · Safe';opacity:.78}.manual-record-pill{display:inline-flex;align-items:center;gap:4px;margin:0 0 8px 2px;padding:6px 9px;border-radius:999px;background:#EEF2FF;color:#475569;font-size:10px;font-weight:900;letter-spacing:.5px}`;
    document.head.appendChild(st);
  }
})();