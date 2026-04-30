/* ✅ Version 2.4.7 Newest update: Makes Auto-fill New Entry create a tracker entry from the current T&C analyzer result. */
(function(){
  const VER = '2.4.7';
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const money = n => '$' + Number(n || 0).toLocaleString();

  function getRawTerms(){
    const values = qsa('textarea')
      .map(a => a.value || '')
      .filter(v => /bonus|qualifying|direct deposit|monthly service fee|monthly account fee|offer|promo/i.test(v));
    values.sort((a,b) => b.length - a.length);
    return values[0] || '';
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

  function buildTextPlan(r){
    const lines = [];
    lines.push(`1. Open one eligible account${r.code ? ` using promo code ${r.code}` : ''}.`);
    if (r.fundedDays) lines.push(`${lines.length + 1}. Fund the account within ${r.fundedDays} days to keep it open.`);
    lines.push(`${lines.length + 1}. Receive ${r.count ? `at least ${r.count} ` : ''}qualifying Direct Deposits${r.reqMoney ? ` of ${money(r.reqMoney)}+ each` : ''}${r.reqDays ? ` within ${r.reqDays} days of account opening` : ''}.`);
    lines.push(`${lines.length + 1}. Bonus payout: ${r.payout || r.payoutText || 'review payout timing'}.`);
    lines.push(`${lines.length + 1}. Keep account open and in good standing until payout.`);
    return lines.join('\n');
  }

  function buildEligibility(r){
    const lines = [];
    if (/individual and jointly owned|joint account/i.test(r.raw || '')) lines.push('Individual or joint Checking / Max-Rate Checking account allowed; primary account holder is bonus-eligible.');
    if (r.prior) lines.push(`Not eligible if you owned/co-owned the same checking product within the last ${r.prior} months.`);
    if (/non-U\.S\. residents|non-U.S. residents/i.test(r.raw || '')) lines.push('Non-U.S. residents are not eligible.');
    if (/cannot be combined|only be enrolled in one/i.test(r.raw || '')) lines.push('Cannot be combined with other checking offers / only one checking offer at a time.');
    if (/gaming|abuse|misuse/i.test(r.raw || '')) lines.push('Promo abuse/gaming can disqualify bonus payout.');
    if (/1099|tax|tax authorities|income|backup withholding|Form W-9/i.test(r.raw || '')) lines.push('Bonus is taxable and may be reported on Form 1099.');
    return lines.join('\n');
  }

  function buildEntry(r, raw){
    const bank = r.bank || inferBankName(raw);
    return {
      id: newId(bank),
      bank,
      bonus: Number(r.bonus || 0),
      churn: r.prior ? 1 : '',
      opened: '',
      bonusRecd: '',
      closed: '',
      dataPoint: (r.counts || []).join('; '),
      notes: 'Created from T&C Analyzer Pro. Review all fields before opening/applying.',
      reqDays: Number(r.reqDays || 0),
      minHoldDays: /120/i.test(String(r.payout || r.payoutText || '')) ? 120 : 0,
      earlyCloseFee: 0,
      feeChecked: false,
      plannedClose: '',
      customTimers: [],
      monthlyFeeYNText: r.fee ? `Yes — ${money(r.fee)} monthly fee` : 'Not clearly stated in pasted T&C',
      promoCodeText: r.code || '',
      avoidMonthlyFeeText: (r.waivers || []).join('\n'),
      completeBonusText: buildTextPlan(r),
      earlyTerminationFeeText: r.early ? 'Keep account open and in good standing until bonus payout; closing/restriction before payout can forfeit bonus.' : 'No early close fee clearly stated. Review terms manually.',
      eligibilityText: buildEligibility(r),
      expirationDateText: r.openBy ? (typeof fD === 'function' ? fD(r.openBy) : r.openBy) : '',
      requiredDaysText: r.reqDays ? String(r.reqDays) : ''
    };
  }

  function autoFillNewEntry(){
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
    const entry = buildEntry(parsed, raw);
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
      if (typeof R === 'function') R();
      setTimeout(() => alert('New entry created for ' + entry.bank + '. Review the fields before opening/applying.'), 80);
    } catch (err) {
      alert('Could not create the entry. Refresh and try again.');
      console.error('[tc-autofill-action]', err);
    }
  }

  document.addEventListener('click', function(e){
    const btn = e.target.closest('button');
    if (!btn) return;
    if (/auto.?fill.*new entry/i.test(btn.textContent || '')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      autoFillNewEntry();
    }
  }, true);

  window.tcAutoFillNewEntry = autoFillNewEntry;
  const st = document.createElement('style');
  st.textContent = `.app-version::after{content:' · AutoFill';opacity:.78}`;
  document.head.appendChild(st);
})();
