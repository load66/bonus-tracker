/*
 * filename: scripts/timer-core-fix.js
 * version: 3.3.28
 * purpose: Harden merged core mini-timer controls after v3.3.27 architecture cleanup.
 * last-touched: 2026-05-02
 */
(function(){
  const VER = '3.3.28';
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  function getGlobal(name){
    try { return (0, eval)(name); } catch { return window[name]; }
  }

  function callGlobal(name, args){
    const fn = getGlobal(name);
    if (typeof fn !== 'function') return false;
    try { fn.apply(window, args || []); return true; } catch (err) { console.warn('[timer-core-fix]', name, err); return false; }
  }

  function expose(name){
    try {
      const value = getGlobal(name);
      if (value !== undefined && window[name] !== value) window[name] = value;
    } catch {}
  }

  function exposeTimerApi(){
    [
      'inlineStateFor','isInlineOpen','openTimerTypePrompt','closeTimerTypePrompt','chooseTimerType',
      'rTimerChoicePrompt','toggleInlineForm','clearInlineInputs','timerId','normalizeTimer',
      'normalizeTimerList','timerDueFromStart','timerMetaLine','timerCountdownDays','timerCountdownMeta',
      'openTimerEditor','closeTimerEditor','switchTimerEditMode','saveTimerEditor','rTimerEdit',
      'toggleTimer','upsertTimer','rmTimer','R'
    ].forEach(expose);
  }

  function entryIdFromOnclick(el){
    const on = String(el?.getAttribute?.('onclick') || '');
    const m = on.match(/['\"]([^'\"]+)['\"]\s*,/);
    return m ? m[1] : '';
  }

  function entryIdFromTimerForm(el){
    const form = el?.closest?.('.inline-form,.tm-add-shell,.card-exp,.card') || document;
    const input = form.querySelector?.('[id^="tm_txt_"]') || document.querySelector('[id^="tm_txt_"]');
    return input ? String(input.id).replace(/^tm_txt_/, '') : '';
  }

  function choose(kind){
    exposeTimerApi();
    if (callGlobal('chooseTimerType', [kind])) return;
    const prompt = window.timerChoicePrompt || null;
    const id = prompt && prompt.entryId;
    if (!id) return;
    const state = getGlobal('inlineStateFor')?.(id);
    if (state) {
      state.timerKind = kind === 'days' ? 'days' : 'due';
      state.timerEdit = null;
    }
    window.timerChoicePrompt = null;
    window.__skipTimerPrompt = true;
    try { callGlobal('toggleInlineForm', [id, 'timer', true]); }
    finally { window.__skipTimerPrompt = false; }
  }

  function handleTimerClick(event){
    const btn = event.target?.closest?.('button');
    if (!btn) return;
    const text = clean(btn.textContent);

    if (text.includes('Add mini timer')) {
      const id = entryIdFromOnclick(btn) || entryIdFromTimerForm(btn);
      if (!id) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      exposeTimerApi();
      callGlobal('toggleInlineForm', [id, 'timer', true]);
      return;
    }

    if (text.includes('Due Date Timer')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      choose('due');
      return;
    }

    if (text.includes('Start Date + Days Timer')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      choose('days');
      return;
    }

    if (text === 'Add timer') {
      const id = entryIdFromTimerForm(btn);
      if (!id) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      exposeTimerApi();
      callGlobal('upsertTimer', [id]);
      return;
    }
  }

  exposeTimerApi();
  document.addEventListener('click', handleTimerClick, true);
  setTimeout(exposeTimerApi, 0);
  setTimeout(exposeTimerApi, 300);

  window.btTimerCoreFixStatus = function(){
    exposeTimerApi();
    return {
      version: VER,
      hasToggleInlineForm: typeof window.toggleInlineForm === 'function',
      hasChooseTimerType: typeof window.chooseTimerType === 'function',
      hasUpsertTimer: typeof window.upsertTimer === 'function'
    };
  };
})();
