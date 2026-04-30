/* ✅ Version 2.5.0 Newest update: Professional Auto-fill Review form before creating generated entry fields + timers. */
(function(){
  const VER = '2.5.0';
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const money = n => '$' + Number(n || 0).toLocaleString();
  const html = v => {
    if (typeof esc === 'function') return esc(String(v ?? ''));
    const d = document.createElement('div');
    d.textContent = String(v ?? '');
    return d.innerHTML;
  };

  let reviewState = null;

  function getRawTerms(){
    const values = qsa('textarea')
      .map(a => a.value || '')
      .filter(v => /bonus|qualifying|direct deposit|monthly service fee|monthly account fee|offer|promo/i.test(v));
    values.sort((a,b) => b.length - a.length);
    return values[0] || '';
  }

  function timerLocalId(){
    try { if (typeof timerId === 'function') return timerId(); } catch {}
    return 'tm_' + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-4);
  }

  function addDaysIso(start, days){
    try { if (typeof timerDueFromStart === 'function') return timerDueFromStart(start, days); } catch {}
    try { if (typeof addD === 'function') return addD(start, days); } catch {}
    const d = new Date(String(start) + 'T00:00:00');
    d.setDate(d.getDate() + (parseInt(days,10) || 0));
    return d.toISOString().split('T')[0];
  }

  function makeTimer(text, date, startDate='', daysRequired=0){
    const raw = { id:timerLocalId(), text, startDate:startDate || '', daysRequired:Number(daysRequired || 0), date:date || '', done:false };
    try { return typeof normalizeTimer === 'function' ? normalizeTimer(raw) : raw; } catch { return raw; }
  }

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
    return m ? clean(m[1]) : 'New Bank Bonus';
  }

  function getExistingIds(){
    try { return new Set((entries || []).map(e => String(e.id || ''))); }
    catch { return new Set(); }
  }

  function newId(bank){
    try { if (typeof genId === 'function') return genId(bank, getExistingIds()); } catch {}
    return 'BNK-P-' + Date.now().toString().slice(-6);
  }

  function pretty(iso){
    if (!iso) return '';
    try { return typeof fD === 'function' ? fD(iso) : iso; } catch { return iso; }
  }

  function getVal(id){ return document.getElementById(id)?.value || ''; }
  function getNum(id){ return parseFloat(String(getVal(id)).replace(/[$,\s]/g,'')) || 0; }
  function checked(id){ return !!document.getElementById(id)?.checked; }
  function splitLines(v){ return String(v || '').split('\n').map(clean).filter(Boolean); }

  function buildTextPlanFromFields(){
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

  function buildEligibilityFromFields(r){
    const current = clean(getVal('tcr_eligibility'));
    if (current) return current;
    const lines = [];
    if (/individual and jointly owned|joint account/i.test(r.raw || '')) lines.push('Individual or joint account allowed; primary account holder is bonus-eligible.');
    if (r.prior) lines.push(`Not eligible if you owned/co-owned the same checking product within the last ${r.prior} months.`);
    if (/non-U\.S\. residents|non-U.S. residents/i.test(r.raw || '')) lines.push('Non-U.S. residents are not eligible.');
    if (/cannot be combined|only be enrolled in one/i.test(r.raw || '')) lines.push('Cannot be combined with other checking offers / only one checking offer at a time.');
    if (/gaming|abuse|misuse/i.test(r.raw || '')) lines.push('Promo abuse/gaming can disqualify bonus payout.');
    if (/1099|tax|tax authorities|income|backup withholding|Form W-9/i.test(r.raw || '')) lines.push('Bonus is taxable and may be reported on Form 1099.');
    return lines.join('\n');
  }

  function timerPreviewItems(r, opened){
    const items = [];
    if (r.openBy) items.push({ id:'tcr_timer_promo', label:'Promo/open-by deadline', meta:pretty(r.openBy), enabled:true, ready:true });
    const reqDays = parseInt(getVal('tcr_req_days') || r.reqDays || 0, 10) || 0;
    if (reqDays) items.push({ id:'tcr_timer_req', label:'Bonus requirement deadline', meta:opened ? `${reqDays} days from opened date → ${pretty(addDaysIso(opened, reqDays))}` : `Auto after opened date is added (${reqDays} days)`, enabled:true, ready:!!opened });
    const fundedDays = parseInt(getVal('tcr_funded_days') || r.fundedDays || 0, 10) || 0;
    if (fundedDays) items.push({ id:'tcr_timer_fund', label:'Funding deadline', meta:opened ? `${fundedDays} days from opened date → ${pretty(addDaysIso(opened, fundedDays))}` : `Auto after opened date is added (${fundedDays} days)`, enabled:true, ready:!!opened });
    const payout = String(getVal('tcr_payout') || r.payout || r.payoutText || '');
    if (/120/i.test(payout)) items.push({ id:'tcr_timer_payout', label:'Expected bonus payout check', meta:opened ? `120 days from opened date → ${pretty(addDaysIso(opened, 120))}` : 'Auto after opened date is added (120 days)', enabled:true, ready:!!opened });
    return items;
  }

  function buildTimersFromFields(r){
    const opened = clean(getVal('tcr_opened'));
    const timers = [];
    if (checked('tcr_timer_promo') && r.openBy) timers.push(makeTimer('Promo/open-by deadline', r.openBy));
    const reqDays = parseInt(getVal('tcr_req_days'), 10) || 0;
    if (checked('tcr_timer_req') && opened && reqDays) timers.push(makeTimer('Bonus requirement deadline', addDaysIso(opened, reqDays), opened, reqDays));
    const fundedDays = parseInt(getVal('tcr_funded_days'), 10) || 0;
    if (checked('tcr_timer_fund') && opened && fundedDays) timers.push(makeTimer('Funding deadline', addDaysIso(opened, fundedDays), opened, fundedDays));
    const payout = String(getVal('tcr_payout') || '');
    if (checked('tcr_timer_payout') && opened && /120/i.test(payout)) timers.push(makeTimer('Expected bonus payout check', addDaysIso(opened, 120), opened, 120));
    return timers;
  }

  function buildEntryFromReview(){
    const r = reviewState?.parsed || {};
    const bank = clean(getVal('tcr_bank')) || inferBankName(reviewState?.raw || '');
    const opened = clean(getVal('tcr_opened'));
    const reqDays = parseInt(getVal('tcr_req_days'), 10) || 0;
    const payout = clean(getVal('tcr_payout'));
    const waivers = clean(getVal('tcr_waivers'));
    const counts = clean(getVal('tcr_counts'));
    const notCounts = clean(getVal('tcr_not_counts'));
    const eligibility = buildEligibilityFromFields(r);
    const risk = clean(getVal('tcr_risk'));
    const monthlyFee = getNum('tcr_fee');
    const openBy = clean(getVal('tcr_openby'));
    const completePlan = clean(getVal('tcr_complete')) || buildTextPlanFromFields();
    const notesParts = ['Created from T&C Analyzer Pro Review Form. Review all fields before opening/applying.'];
    if (notCounts) notesParts.push('Does NOT count: ' + notCounts.replace(/\n/g, '; '));
    if (payout) notesParts.push('Payout: ' + payout);

    return {
      id: newId(bank),
      bank,
      bonus: getNum('tcr_bonus'),
      churn: r.prior ? 1 : '',
      opened,
      bonusRecd: '',
      closed: '',
      dataPoint: counts,
      notes: notesParts.join('\n'),
      reqDays,
      minHoldDays: /120/i.test(payout) ? 120 : 0,
      earlyCloseFee: 0,
      feeChecked: false,
      plannedClose: '',
      customTimers: buildTimersFromFields(r),
      monthlyFeeYNText: monthlyFee ? `Yes — ${money(monthlyFee)} monthly fee` : 'Not clearly stated in pasted T&C',
      promoCodeText: clean(getVal('tcr_promo')),
      avoidMonthlyFeeText: waivers,
      completeBonusText: completePlan,
      earlyTerminationFeeText: risk || 'No early close fee clearly stated. Review terms manually.',
      eligibilityText: eligibility,
      expirationDateText: openBy ? pretty(openBy) : '',
      requiredDaysText: reqDays ? String(reqDays) : ''
    };
  }

  function defaultReviewData(parsed, raw){
    const bank = parsed.bank || inferBankName(raw);
    return {
      bank,
      bonus: parsed.bonus || 0,
      promo: parsed.code || '',
      acct: parsed.acct || 'account type needs review',
      openBy: parsed.openBy || '',
      opened: '',
      reqMoney: parsed.reqMoney || 0,
      ddCount: parsed.count || 0,
      reqDays: parsed.reqDays || 0,
      fundedDays: parsed.fundedDays || 0,
      payout: parsed.payout || parsed.payoutText || 'review payout timing',
      fee: parsed.fee || 0,
      waivers: (parsed.waivers || []).join('\n'),
      counts: (parsed.counts || []).join('\n'),
      notCounts: (parsed.not || parsed.notCounts || []).join('\n'),
      risk: parsed.early ? 'Keep account open and in good standing until bonus payout; closing/restriction before payout can forfeit bonus.' : 'No early close fee clearly stated. Review terms manually.',
      eligibility: buildEligibilityFromParsed(parsed),
      complete: ''
    };
  }

  function buildEligibilityFromParsed(r){
    const lines = [];
    if (/individual and jointly owned|joint account/i.test(r.raw || '')) lines.push('Individual or joint account allowed; primary account holder is bonus-eligible.');
    if (r.prior) lines.push(`Not eligible if you owned/co-owned the same checking product within the last ${r.prior} months.`);
    if (/non-U\.S\. residents|non-U.S. residents/i.test(r.raw || '')) lines.push('Non-U.S. residents are not eligible.');
    if (/cannot be combined|only be enrolled in one/i.test(r.raw || '')) lines.push('Cannot be combined with other checking offers / only one checking offer at a time.');
    if (/gaming|abuse|misuse/i.test(r.raw || '')) lines.push('Promo abuse/gaming can disqualify bonus payout.');
    if (/1099|tax|tax authorities|income|backup withholding|Form W-9/i.test(r.raw || '')) lines.push('Bonus is taxable and may be reported on Form 1099.');
    return lines.join('\n');
  }

  function chip(label, value, cls='blue'){
    if (!value && value !== 0) return '';
    return `<div class="tcr-chip ${cls}"><span>${html(label)}</span><b>${html(value)}</b></div>`;
  }

  function input(label, id, value, type='text', hint=''){
    return `<div class="tcr-field"><label>${html(label)}</label><input id="${id}" type="${type}" value="${html(value ?? '')}" ${type==='number'?'inputmode="decimal"':''}>${hint?`<small>${html(hint)}</small>`:''}</div>`;
  }

  function textarea(label, id, value, rows=3, hint=''){
    return `<div class="tcr-field wide"><label>${html(label)}</label><textarea id="${id}" rows="${rows}">${html(value || '')}</textarea>${hint?`<small>${html(hint)}</small>`:''}</div>`;
  }

  function section(title, subtitle, body){
    return `<section class="tcr-section"><div class="tcr-section-head"><h4>${html(title)}</h4>${subtitle?`<p>${html(subtitle)}</p>`:''}</div>${body}</section>`;
  }

  function renderTimerRows(parsed, opened){
    const items = timerPreviewItems(parsed, opened);
    if (!items.length) return '<div class="tcr-empty">No reliable timer found yet. You can still add manual mini timers later.</div>';
    return items.map(item => `
      <label class="tcr-timer-row">
        <input id="${item.id}" type="checkbox" ${item.enabled?'checked':''}>
        <span><b>${html(item.label)}</b><small>${html(item.meta)}</small></span>
        <em class="${item.ready?'ready':'later'}">${item.ready?'Ready':'Later'}</em>
      </label>`).join('');
  }

  function renderReview(){
    document.getElementById('tc_review_overlay')?.remove();
    if (!reviewState) return;
    const r = reviewState.parsed || {};
    const d = reviewState.data || defaultReviewData(r, reviewState.raw || '');
    const opened = d.opened || '';
    const summary = [
      chip('Bank', d.bank, 'blue'),
      chip('Bonus', d.bonus ? money(d.bonus) : 'Review', d.bonus ? 'green' : 'amber'),
      chip('Req Days', d.reqDays || 'Review', d.reqDays ? 'amber' : 'red'),
      chip('Timers', timerPreviewItems(r, opened).length, 'purple')
    ].join('');

    let body = '<div class="tcr-bg" onclick="tcCloseAutoFillReview()"><div class="tcr-sheet" onclick="event.stopPropagation()">';
    body += '<div class="tcr-grabber"></div>';
    body += '<header class="tcr-hero"><div><div class="tcr-kicker">Analyzer Pro Review</div><h3>Auto-fill New Entry</h3><p>Review the extracted promo fields before saving. Edit anything that looks wrong.</p></div><div class="tcr-version">v'+VER+'</div></header>';
    body += '<div class="tcr-summary">'+summary+'</div>';

    body += section('1. Promo Basics', 'The fields that identify the offer.',
      '<div class="tcr-grid">' +
      input('Bank', 'tcr_bank', d.bank) +
      input('Bonus Amount', 'tcr_bonus', d.bonus || '', 'number') +
      input('Promo Code', 'tcr_promo', d.promo) +
      input('Open-by / Expiration Date', 'tcr_openby', d.openBy, 'date') +
      input('Opened Date (optional)', 'tcr_opened', d.opened, 'date', 'If added now, requirement/payout timers can be created immediately.') +
      input('Account Type', 'tcr_acct', d.acct) +
      '</div>');

    body += section('2. Requirements', 'Deposit rules, deadline, and payout timing.',
      '<div class="tcr-grid">' +
      input('Required DD Amount Each', 'tcr_req_money', d.reqMoney || '', 'number') +
      input('Number of DDs', 'tcr_dd_count', d.ddCount || '', 'number') +
      input('Requirement Days', 'tcr_req_days', d.reqDays || '', 'number') +
      input('Funding Days', 'tcr_funded_days', d.fundedDays || '', 'number') +
      '</div>' +
      input('Payout Timing', 'tcr_payout', d.payout) +
      textarea('How to Complete Bonus', 'tcr_complete', d.complete || buildTextPlanPreview(d), 5));

    body += section('3. What Counts / Does Not Count', 'Keep this clean so your future self knows which deposits to use.',
      textarea('What Counts', 'tcr_counts', d.counts, 4, 'Example: ACH direct deposit, payroll income, government benefits.') +
      textarea('What Does NOT Count', 'tcr_not_counts', d.notCounts, 4, 'Example: Zelle, wires, mobile deposits, internal transfers.'));

    body += section('4. Fees & Risk', 'Monthly fees, fee waivers, clawback and eligibility notes.',
      '<div class="tcr-grid">' + input('Monthly Fee', 'tcr_fee', d.fee || '', 'number') + '</div>' +
      textarea('How to Avoid Monthly Fee', 'tcr_waivers', d.waivers, 3) +
      textarea('Early Close / Payout Risk', 'tcr_risk', d.risk, 3) +
      textarea('Eligibility / Churn', 'tcr_eligibility', d.eligibility, 4));

    body += section('5. Auto Timers', 'Checked timers will be added when possible. Requirement timers need an Opened Date.',
      '<div class="tcr-timers">' + renderTimerRows(r, opened) + '</div>');

    body += '<div class="tcr-actions"><button class="tcr-cancel" onclick="tcCloseAutoFillReview()">Cancel</button><button class="tcr-save" onclick="tcCreateReviewedEntry()">Create Entry + Timers</button></div>';
    body += '</div></div>';

    const wrap = document.createElement('div');
    wrap.id = 'tc_review_overlay';
    wrap.innerHTML = body;
    document.body.appendChild(wrap);
  }

  function buildTextPlanPreview(d){
    const lines = [];
    lines.push(`1. Open one eligible account${d.promo ? ` using promo code ${d.promo}` : ''}.`);
    if (d.fundedDays) lines.push(`${lines.length + 1}. Fund the account within ${d.fundedDays} days to keep it open.`);
    lines.push(`${lines.length + 1}. Receive ${d.ddCount ? `at least ${d.ddCount} ` : ''}qualifying Direct Deposits${d.reqMoney ? ` of ${money(d.reqMoney)}+ each` : ''}${d.reqDays ? ` within ${d.reqDays} days of account opening` : ''}.`);
    lines.push(`${lines.length + 1}. Bonus payout: ${d.payout || 'review payout timing'}.`);
    lines.push(`${lines.length + 1}. Keep account open and in good standing until payout.`);
    return lines.join('\n');
  }

  function openReview(){
    const raw = getRawTerms();
    if (!raw || raw.length < 200) {
      alert('Paste/analyze T&C first, then tap Auto-fill New Entry.');
      return;
    }
    if (typeof tcStrictAnalyze !== 'function') {
      alert('Analyzer is still loading. Refresh and try again.');
      return;
    }
    const parsed = tcStrictAnalyze(raw);
    reviewState = { raw, parsed, data: defaultReviewData(parsed, raw) };
    renderReview();
  }

  function saveReviewedEntry(){
    if (!reviewState) return;
    const entry = buildEntryFromReview();
    if (!entry.bank) { alert('Bank name is required.'); return; }
    if (!entry.bonus) { alert('Bonus amount is missing. Review before saving.'); return; }
    try {
      entries.unshift(entry);
      if (typeof sv === 'function' && typeof SK !== 'undefined') sv(SK, entries);
      if (typeof saveReq === 'function') {
        saveReq(entry.bank, {
          bank: entry.bank,
          bonus: entry.bonus,
          reqDays: entry.reqDays,
          minHoldDays: entry.minHoldDays,
          monthlyFeeYNText: entry.monthlyFeeYNText,
          promoCodeText: entry.promoCodeText,
          avoidMonthlyFeeText: entry.avoidMonthlyFeeText,
          completeBonusText: entry.completeBonusText,
          earlyTerminationFeeText: entry.earlyTerminationFeeText,
          eligibilityText: entry.eligibilityText,
          expirationDateText: entry.expirationDateText,
          requiredDaysText: entry.requiredDaysText,
          dataPoint: entry.dataPoint
        });
      }
      reviewState = null;
      document.getElementById('tc_review_overlay')?.remove();
      if (typeof R === 'function') R();
      const timerCount = entry.customTimers.length;
      setTimeout(() => alert('New entry created for ' + entry.bank + (timerCount ? ` with ${timerCount} mini timer(s).` : '. Add Opened Date later to auto-create requirement timers.') + ' Review the entry before opening/applying.'), 80);
    } catch (err) {
      alert('Could not create the entry. Refresh and try again.');
      console.error('[tc-autofill-action]', err);
    }
  }

  function sameTimer(t, name){ return clean(t?.text).toLowerCase() === clean(name).toLowerCase(); }

  function ensureAutoTimers(){
    try {
      if (!Array.isArray(entries)) return false;
      let changed = false;
      entries.forEach(e => {
        if (!e || !e.bank || !e.opened) return;
        const timers = Array.isArray(e.customTimers) ? e.customTimers : [];
        const reqDays = parseInt(e.reqDays || e.requiredDaysText || 0, 10) || 0;
        if (reqDays > 0 && !timers.some(t => sameTimer(t, 'Bonus requirement deadline'))) {
          timers.push(makeTimer('Bonus requirement deadline', addDaysIso(e.opened, reqDays), e.opened, reqDays));
          changed = true;
        }
        const payoutText = String(e.completeBonusText || e.notes || e.earlyTerminationFeeText || '');
        if (/120/i.test(payoutText) && !timers.some(t => sameTimer(t, 'Expected bonus payout check'))) {
          timers.push(makeTimer('Expected bonus payout check', addDaysIso(e.opened, 120), e.opened, 120));
          changed = true;
        }
        e.customTimers = timers;
      });
      if (changed && typeof sv === 'function' && typeof SK !== 'undefined') sv(SK, entries);
      return changed;
    } catch (err) {
      console.warn('[tc-autofill-action] auto timer sync skipped', err);
      return false;
    }
  }

  document.addEventListener('click', function(e){
    const btn = e.target.closest('button');
    if (!btn) return;
    if (/auto.?fill.*new entry/i.test(btn.textContent || '')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openReview();
    }
  }, true);

  const baseR = typeof R === 'function' ? R : null;
  if (baseR) {
    window.R = R = function(){
      baseR();
      setTimeout(ensureAutoTimers, 0);
    };
  }
  setTimeout(ensureAutoTimers, 500);

  window.tcOpenAutoFillReview = openReview;
  window.tcCloseAutoFillReview = function(){ reviewState = null; document.getElementById('tc_review_overlay')?.remove(); };
  window.tcCreateReviewedEntry = saveReviewedEntry;
  window.tcAutoFillNewEntry = openReview;
  window.tcEnsureAutoTimers = ensureAutoTimers;

  if (!document.getElementById('tc_review_style')) {
    const st = document.createElement('style');
    st.id = 'tc_review_style';
    st.textContent = `
      .app-version::after{content:' · ReviewForm';opacity:.78}
      .tcr-bg{position:fixed;inset:0;background:rgba(2,6,23,.58);z-index:420;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
      .tcr-sheet{width:100%;max-width:520px;max-height:92dvh;overflow:auto;background:#F8FAFC;border-radius:24px 24px 0 0;padding:10px 14px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -20px 50px rgba(2,6,23,.35)}
      .tcr-grabber{width:38px;height:4px;border-radius:999px;background:#CBD5E1;margin:2px auto 10px}
      .tcr-hero{background:linear-gradient(145deg,#07153f,#0d1d53 70%,#15306F);border-radius:22px;padding:14px;color:#fff;display:flex;justify-content:space-between;gap:10px;align-items:flex-start;box-shadow:0 14px 30px rgba(15,23,42,.18)}
      .tcr-kicker{font-size:8px;font-weight:900;letter-spacing:1.8px;text-transform:uppercase;color:#AFC4EE}.tcr-hero h3{font-size:20px;font-weight:900;margin-top:2px}.tcr-hero p{font-size:11px;line-height:1.45;color:#D5E2FF;margin-top:5px}.tcr-version{font-size:10px;font-weight:900;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);padding:6px 8px;border-radius:999px;color:#DBEAFE;white-space:nowrap}
      .tcr-summary{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.tcr-chip{border-radius:16px;padding:10px;border:1px solid #E2E8F0;background:#fff}.tcr-chip span{display:block;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:1.3px;color:#64748B}.tcr-chip b{display:block;font-size:13px;margin-top:4px;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tcr-chip.green{background:#ECFDF5;border-color:#BBF7D0}.tcr-chip.amber{background:#FFFBEB;border-color:#FDE68A}.tcr-chip.red{background:#FEF2F2;border-color:#FECACA}.tcr-chip.blue{background:#EFF6FF;border-color:#BFDBFE}.tcr-chip.purple{background:#F5F3FF;border-color:#DDD6FE}
      .tcr-section{background:#fff;border:1px solid #E2E8F0;border-radius:20px;padding:12px;margin:10px 0;box-shadow:0 8px 20px rgba(15,23,42,.045)}.tcr-section-head{margin-bottom:10px}.tcr-section h4{font-size:12px;font-weight:900;color:#0F172A;letter-spacing:.2px}.tcr-section p{font-size:10px;color:#64748B;line-height:1.4;margin-top:3px}.tcr-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tcr-field{margin-bottom:8px}.tcr-field.wide{grid-column:1/-1}.tcr-field label{display:block;font-size:9px;font-weight:900;letter-spacing:.8px;text-transform:uppercase;color:#64748B;margin-bottom:4px}.tcr-field input,.tcr-field textarea{width:100%;border:1.5px solid #E2E8F0;background:#F8FAFC;border-radius:13px;padding:10px 11px;font-family:inherit;font-size:13px;color:#0F172A;outline:none}.tcr-field input:focus,.tcr-field textarea:focus{border-color:#2563EB;box-shadow:0 0 0 3px rgba(37,99,235,.08);background:#fff}.tcr-field textarea{resize:vertical;line-height:1.45}.tcr-field small{display:block;margin-top:4px;font-size:9px;color:#94A3B8;line-height:1.35}
      .tcr-timers{display:flex;flex-direction:column;gap:8px}.tcr-timer-row{display:flex;align-items:center;gap:10px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:15px;padding:10px}.tcr-timer-row input{width:18px;height:18px;accent-color:#2563EB}.tcr-timer-row span{flex:1;min-width:0}.tcr-timer-row b{display:block;font-size:12px;color:#0F172A}.tcr-timer-row small{display:block;font-size:10px;color:#64748B;margin-top:2px;line-height:1.35}.tcr-timer-row em{font-style:normal;font-size:9px;font-weight:900;border-radius:999px;padding:4px 7px}.tcr-timer-row em.ready{background:#D1FAE5;color:#065F46}.tcr-timer-row em.later{background:#FEF3C7;color:#92400E}.tcr-empty{font-size:11px;color:#64748B;line-height:1.45;padding:10px;background:#F8FAFC;border:1px dashed #CBD5E1;border-radius:14px}
      .tcr-actions{position:sticky;bottom:0;display:flex;gap:8px;background:linear-gradient(180deg,rgba(248,250,252,0),#F8FAFC 28%);padding:16px 0 2px}.tcr-actions button{flex:1;border:none;border-radius:15px;padding:13px 10px;font-family:inherit;font-size:13px;font-weight:900;cursor:pointer}.tcr-cancel{background:#E2E8F0;color:#334155}.tcr-save{background:linear-gradient(135deg,#2563EB,#1D4ED8);color:#fff;box-shadow:0 10px 22px rgba(37,99,235,.26)}
      @media(max-width:430px){.tcr-sheet{border-radius:22px 22px 0 0;padding:9px 12px calc(16px + env(safe-area-inset-bottom,0px))}.tcr-grid{grid-template-columns:1fr}.tcr-summary{grid-template-columns:1fr 1fr;gap:7px}.tcr-hero h3{font-size:18px}.tcr-section{border-radius:18px;padding:11px}.tcr-field input,.tcr-field textarea{font-size:13px}.tcr-actions button{font-size:12px}}
    `;
    document.head.appendChild(st);
  }
})();
