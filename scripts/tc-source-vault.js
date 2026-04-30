/* ✅ Version 2.8.1 Newest update: Hidden T&C Source Vault. Saves full pasted terms per bank/record and reloads them in Analyzer Pro. */
(function(){
  const VER = '2.8.1';
  const VAULT_KEY = 'bt_tc_source_v1';
  const MIN_LEN = 200;

  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const nowIso = () => new Date().toISOString();

  function getVault(){
    try {
      const raw = localStorage.getItem(VAULT_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return {
        byId: obj.byId || {},
        byBank: obj.byBank || {},
        last: obj.last || null
      };
    } catch {
      return { byId:{}, byBank:{}, last:null };
    }
  }

  function setVault(vault){
    try { localStorage.setItem(VAULT_KEY, JSON.stringify(vault)); } catch (err) { console.warn('[tc-source-vault] localStorage full/skipped', err); }
  }

  function getModal(){
    try { if (typeof modal !== 'undefined' && modal) return modal; } catch {}
    return null;
  }

  function normBank(bank){ return clean(bank).toLowerCase(); }

  function sourceFields(obj){
    if (!obj) return '';
    return obj.tcSourceTerms || obj.tncSourceText || obj.sourceTermsRaw || obj.tcRawTerms || obj.rawTerms || '';
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
    return {
      id: clean(m.id || m.recordId || ''),
      bank: clean(m.bank || getBankFromDom() || ''),
      modal: m
    };
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

  function readTextareaRaw(){
    const direct = document.getElementById('tca_raw')?.value || '';
    if (direct && direct.length >= MIN_LEN) return direct;
    const areas = Array.from(document.querySelectorAll('textarea'));
    const candidates = areas
      .map(a => a.value || '')
      .filter(v => v.length >= MIN_LEN && /bonus|qualifying|direct deposit|monthly service fee|monthly account fee|offer|promo|checking|terms|conditions/i.test(v));
    candidates.sort((a,b) => b.length - a.length);
    return candidates[0] || '';
  }

  function persistSource(raw, reason='manual'){
    raw = String(raw || '').trim();
    if (raw.length < MIN_LEN) return false;
    const ctx = context();
    const rec = {
      raw,
      updatedAt: nowIso(),
      analyzerVersion: VER,
      bank: ctx.bank || '',
      id: ctx.id || '',
      reason
    };

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
      try { if (typeof sv === 'function' && typeof SK !== 'undefined') sv(SK, entries); } catch {}
      rec.id = rec.id || clean(entry.id || '');
      rec.bank = rec.bank || clean(entry.bank || '');
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
    if (direct && direct.length >= MIN_LEN) return { raw:direct, from:'modal' };

    const entry = getEntryByContext(ctx);
    const entryRaw = sourceFields(entry);
    if (entryRaw && entryRaw.length >= MIN_LEN) return { raw:entryRaw, from:'entry' };

    const vault = getVault();
    if (ctx.id && vault.byId[ctx.id]?.raw) return { raw:vault.byId[ctx.id].raw, from:'vault-id' };
    if (ctx.bank && vault.byBank[normBank(ctx.bank)]?.raw) return { raw:vault.byBank[normBank(ctx.bank)].raw, from:'vault-bank' };
    return null;
  }

  function preloadAnalyzer(){
    const ta = document.getElementById('tca_raw');
    if (!ta) return;
    const current = ta.value || '';
    if (current.length >= MIN_LEN) {
      persistSource(current, 'open-current');
      return;
    }
    const found = lookupSource();
    if (!found?.raw) return;
    ta.value = found.raw;
    ta.dispatchEvent(new Event('input', { bubbles:true }));
    setTimeout(() => {
      try { if (typeof tcRunPro === 'function') tcRunPro(); } catch {}
    }, 60);
  }

  function patchLatestEntryFromPending(){
    const rec = window.__btLastTcSource;
    if (!rec?.raw || rec.raw.length < MIN_LEN) return;
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
    if (window.__tcSourceVaultWrapped) return;
    window.__tcSourceVaultWrapped = true;

    const oldOpen = window.tcOpenPro;
    if (typeof oldOpen === 'function') {
      window.tcOpenPro = function(){
        const out = oldOpen.apply(this, arguments);
        setTimeout(preloadAnalyzer, 90);
        return out;
      };
    }

    const oldRun = window.tcRunPro;
    if (typeof oldRun === 'function') {
      window.tcRunPro = function(){
        const raw = readTextareaRaw();
        if (raw) persistSource(raw, 'analyze');
        return oldRun.apply(this, arguments);
      };
    }

    const oldApply = window.tcApplyPro;
    if (typeof oldApply === 'function') {
      window.tcApplyPro = function(){
        const raw = readTextareaRaw();
        if (raw) persistSource(raw, 'apply-fields');
        const out = oldApply.apply(this, arguments);
        setTimeout(() => persistSource(raw || readTextareaRaw(), 'apply-after'), 80);
        return out;
      };
    }

    const oldCreate = window.tcCreateReviewedEntry;
    if (typeof oldCreate === 'function') {
      window.tcCreateReviewedEntry = function(){
        const raw = readTextareaRaw() || window.__btLastTcSource?.raw || '';
        if (raw) persistSource(raw, 'create-reviewed-before');
        const out = oldCreate.apply(this, arguments);
        setTimeout(patchLatestEntryFromPending, 160);
        return out;
      };
    }
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const txt = clean(btn.textContent || '');
    if (/Analyze|Apply Fields|Create Entry|Create Entry \+ Timers|Save Changes|Add Entry/i.test(txt)) {
      const raw = readTextareaRaw();
      if (raw) persistSource(raw, 'button-' + txt.slice(0,24));
      setTimeout(patchLatestEntryFromPending, 250);
    }
    if (/Open T&C Analyzer Pro/i.test(txt)) setTimeout(preloadAnalyzer, 120);
  }, true);

  setTimeout(wrapGlobals, 250);
  setTimeout(wrapGlobals, 900);

  window.tcSourceVaultStatus = function(){
    const found = lookupSource();
    return {
      version: VER,
      hasSource: !!found?.raw,
      sourceLength: found?.raw?.length || 0,
      from: found?.from || '',
      vaultKeys: Object.keys(getVault().byId).length + Object.keys(getVault().byBank).length
    };
  };
})();
