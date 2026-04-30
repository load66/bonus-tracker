/* ✅ Version 2.8.2 Newest update: T&C Source Vault now saves ONLY real Analyzer Pro source text, not generated notes. */
(function(){
  const VER = '2.8.2';
  const VAULT_KEY = 'bt_tc_source_v1';
  const MIN_LEN = 350;

  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const nowIso = () => new Date().toISOString();

  function getVault(){
    try {
      const raw = localStorage.getItem(VAULT_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return { byId: obj.byId || {}, byBank: obj.byBank || {}, last: obj.last || null };
    } catch { return { byId:{}, byBank:{}, last:null }; }
  }

  function setVault(vault){
    try { localStorage.setItem(VAULT_KEY, JSON.stringify(vault)); }
    catch (err) { console.warn('[tc-source-vault] localStorage full/skipped', err); }
  }

  function getModal(){ try { return typeof modal !== 'undefined' && modal ? modal : null; } catch { return null; } }
  function normBank(bank){ return clean(bank).toLowerCase(); }

  function isGeneratedSummary(raw){
    const s = clean(raw).toLowerCase();
    if (!s) return true;
    const summarySignals = [
      /^created from t&c analyzer/i,
      /does not count:/i,
      /hold until:/i,
      /payout: after day/i,
      /review all fields before/i,
      /source snippet/i,
      /analyzer summary/i
    ];
    return summarySignals.some(re => re.test(raw)) ||
      (s.includes('does not count:') && s.includes('payout:') && s.length < 1200);
  }

  function isLikelyFullTerms(raw){
    const s = clean(raw);
    if (s.length < MIN_LEN) return false;
    if (isGeneratedSummary(raw)) return false;
    const tests = [
      /to be eligible/i,
      /offer is/i,
      /offer valid/i,
      /offer rules/i,
      /terms and conditions/i,
      /additional terms/i,
      /to receive (?:the )?\$?\d+/i,
      /you must/i,
      /direct deposits?/i,
      /qualifying/i,
      /monthly (?:service|account|maintenance)?\s*fee/i,
      /we will deposit/i,
      /cash bonuses? are treated as income/i,
      /cannot be combined/i,
      /not eligible/i
    ];
    const score = tests.reduce((n,re)=>n+(re.test(s)?1:0),0);
    return score >= 3;
  }

  function sourceFields(obj){
    if (!obj) return '';
    const raw = obj.tcSourceTerms || obj.tncSourceText || obj.sourceTermsRaw || obj.tcRawTerms || obj.rawTerms || '';
    return isLikelyFullTerms(raw) ? raw : '';
  }

  function getBankFromDom(){
    const labels = Array.from(document.querySelectorAll('label'));
    for (const lab of labels) {
      if (!/bank/i.test(lab.textContent || '')) continue;
      const box = lab.closest('.fg') || lab.parentElement;
      const input = box && box.querySelector('input,textarea,select');
      if (input && clean(input.value)) return clean(input.value);
    }
    return '';
  }

  function context(){
    const m = getModal() || {};
    return { id: clean(m.id || m.recordId || ''), bank: clean(m.bank || getBankFromDom() || ''), modal: m };
  }

  function getEntryByContext(ctx){
    try {
      if (!Array.isArray(entries)) return null;
      if (ctx.id) {
        const byId = entries.find(e => clean(e.id).toUpperCase() === ctx.id.toUpperCase());
        if (byId) return byId;
      }
      if (ctx.bank) {
        const b = normBank(ctx.bank);
        const byBank = entries.find(e => normBank(e.bank) === b);
        if (byBank) return byBank;
      }
    } catch {}
    return null;
  }

  function readAnalyzerRaw(){
    const ta = document.getElementById('tca_raw');
    const raw = ta?.value || '';
    return isLikelyFullTerms(raw) ? raw.trim() : '';
  }

  function persistSource(raw, reason='manual'){
    raw = String(raw || '').trim();
    if (!isLikelyFullTerms(raw)) return false;

    const ctx = context();
    const rec = { raw, updatedAt: nowIso(), analyzerVersion: VER, bank: ctx.bank || '', id: ctx.id || '', reason };

    try {
      if (ctx.modal) {
        ctx.modal.tcSourceTerms = raw;
        ctx.modal.tncSourceText = raw;
        ctx.modal.tcSourceUpdatedAt = rec.updatedAt;
        ctx.modal.tcAnalyzerVersion = VER;
      }
    } catch {}

    const entry = getEntryByContext(ctx);
    if (entry) {
      entry.tcSourceTerms = raw;
      entry.tncSourceText = raw;
      entry.tcSourceUpdatedAt = rec.updatedAt;
      entry.tcAnalyzerVersion = VER;
      rec.id = rec.id || clean(entry.id || '');
      rec.bank = rec.bank || clean(entry.bank || '');
      try { if (typeof sv === 'function' && typeof SK !== 'undefined') sv(SK, entries); } catch {}
    }

    const vault = getVault();
    vault.last = rec;
    if (rec.id) vault.byId[rec.id] = rec;
    if (rec.bank) vault.byBank[normBank(rec.bank)] = rec;
    setVault(vault);
    window.__btLastTcSource = rec;
    return true;
  }

  function lookupSource(){
    const ctx = context();

    const direct = sourceFields(ctx.modal);
    if (direct) return { raw:direct, from:'modal' };

    const entry = getEntryByContext(ctx);
    const entryRaw = sourceFields(entry);
    if (entryRaw) return { raw:entryRaw, from:'entry' };

    const vault = getVault();
    if (ctx.id && isLikelyFullTerms(vault.byId[ctx.id]?.raw)) return { raw:vault.byId[ctx.id].raw, from:'vault-id' };
    if (ctx.bank && isLikelyFullTerms(vault.byBank[normBank(ctx.bank)]?.raw)) return { raw:vault.byBank[normBank(ctx.bank)].raw, from:'vault-bank' };
    if (isLikelyFullTerms(vault.last?.raw) && (!ctx.bank || normBank(vault.last.bank) === normBank(ctx.bank))) return { raw:vault.last.raw, from:'vault-last' };
    return null;
  }

  function preloadAnalyzer(){
    const ta = document.getElementById('tca_raw');
    if (!ta) return;

    const current = ta.value || '';
    if (isLikelyFullTerms(current)) {
      persistSource(current, 'open-current');
      return;
    }

    const found = lookupSource();
    if (!found?.raw) {
      if (isGeneratedSummary(current)) {
        ta.value = '';
        ta.placeholder = 'Paste the original full T&C here. After v2.8.2, it will be saved as hidden source for this bank.';
      }
      return;
    }

    ta.value = found.raw;
    ta.dispatchEvent(new Event('input', { bubbles:true }));
    setTimeout(() => { try { if (typeof tcRunPro === 'function') tcRunPro(); } catch {} }, 80);
  }

  function patchLatestEntryFromPending(){
    const rec = window.__btLastTcSource;
    if (!rec?.raw || !isLikelyFullTerms(rec.raw)) return;
    try {
      if (!Array.isArray(entries) || !entries.length) return;
      const newest = entries[0];
      if (!newest || sourceFields(newest)) return;
      newest.tcSourceTerms = rec.raw;
      newest.tncSourceText = rec.raw;
      newest.tcSourceUpdatedAt = nowIso();
      newest.tcAnalyzerVersion = VER;

      const vault = getVault();
      const fixed = { ...rec, id: clean(newest.id || rec.id || ''), bank: clean(newest.bank || rec.bank || ''), updatedAt: newest.tcSourceUpdatedAt, reason:'created-entry' };
      vault.last = fixed;
      if (fixed.id) vault.byId[fixed.id] = fixed;
      if (fixed.bank) vault.byBank[normBank(fixed.bank)] = fixed;
      setVault(vault);
      if (typeof sv === 'function' && typeof SK !== 'undefined') sv(SK, entries);
    } catch (err) { console.warn('[tc-source-vault] patch latest skipped', err); }
  }

  function wrapGlobals(){
    if (window.__tcSourceVaultWrappedV282) return;
    window.__tcSourceVaultWrappedV282 = true;

    const oldOpen = window.tcOpenPro;
    if (typeof oldOpen === 'function') {
      window.tcOpenPro = function(){
        const out = oldOpen.apply(this, arguments);
        setTimeout(preloadAnalyzer, 100);
        return out;
      };
    }

    const oldRun = window.tcRunPro;
    if (typeof oldRun === 'function') {
      window.tcRunPro = function(){
        const raw = readAnalyzerRaw();
        if (raw) persistSource(raw, 'analyze');
        return oldRun.apply(this, arguments);
      };
    }

    const oldApply = window.tcApplyPro;
    if (typeof oldApply === 'function') {
      window.tcApplyPro = function(){
        const raw = readAnalyzerRaw();
        if (raw) persistSource(raw, 'apply-fields');
        const out = oldApply.apply(this, arguments);
        setTimeout(() => { if (raw) persistSource(raw, 'apply-after'); }, 80);
        return out;
      };
    }

    const oldCreate = window.tcCreateReviewedEntry;
    if (typeof oldCreate === 'function') {
      window.tcCreateReviewedEntry = function(){
        const raw = readAnalyzerRaw() || (isLikelyFullTerms(window.__btLastTcSource?.raw) ? window.__btLastTcSource.raw : '');
        if (raw) persistSource(raw, 'create-reviewed-before');
        const out = oldCreate.apply(this, arguments);
        setTimeout(patchLatestEntryFromPending, 180);
        return out;
      };
    }
  }

  document.addEventListener('paste', e => {
    const target = e.target;
    if (!target || target.id !== 'tca_raw') return;
    setTimeout(() => {
      const raw = readAnalyzerRaw();
      if (raw) persistSource(raw, 'paste');
    }, 80);
  }, true);

  document.addEventListener('input', e => {
    if (e.target?.id !== 'tca_raw') return;
    const raw = readAnalyzerRaw();
    if (raw) persistSource(raw, 'input');
  }, true);

  document.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const txt = clean(btn.textContent || '');
    if (/Analyze|Apply Fields|Create Entry|Create Entry \+ Timers/i.test(txt)) {
      const raw = readAnalyzerRaw();
      if (raw) persistSource(raw, 'button-' + txt.slice(0,24));
      setTimeout(patchLatestEntryFromPending, 250);
    }
    if (/Open T&C Analyzer Pro/i.test(txt)) setTimeout(preloadAnalyzer, 140);
  }, true);

  setTimeout(wrapGlobals, 250);
  setTimeout(wrapGlobals, 900);

  window.tcGetSavedSource = function(){ return lookupSource(); };
  window.tcSourceVaultStatus = function(){
    const found = lookupSource();
    return { version: VER, hasSource: !!found?.raw, sourceLength: found?.raw?.length || 0, from: found?.from || '', vaultKeys: Object.keys(getVault().byId).length + Object.keys(getVault().byBank).length };
  };
})();
