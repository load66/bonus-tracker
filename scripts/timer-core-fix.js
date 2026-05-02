/*
 * filename: scripts/timer-core-fix.js
 * version: 3.3.31
 * purpose: Restore reliable mini timer add/edit/save flow after v3.3.27 architecture cleanup.
 * last-touched: 2026-05-02
 */
(function(){
  const VER = '3.3.31';
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  function g(name){
    try { return (0, eval)(name); } catch { return window[name]; }
  }

  function setBinding(name, value){
    try {
      window.__btTimerCoreFixValue = value;
      (0, eval)(name + ' = window.__btTimerCoreFixValue');
      return true;
    } catch {
      try { window[name] = value; return true; } catch { return false; }
    }
  }

  function fn(name){
    const x = g(name);
    return typeof x === 'function' ? x : null;
  }

  function call(name, args){
    const f = fn(name);
    if (!f) return false;
    try { f.apply(window, args || []); return true; }
    catch (err) { console.warn('[timer-core-fix]', name, err); return false; }
  }

  function expose(name){
    try {
      const value = g(name);
      if (value !== undefined && window[name] !== value) window[name] = value;
    } catch {}
  }

  function exposeTimerApi(){
    [
      'inlineStateFor','isInlineOpen','openTimerTypePrompt','closeTimerTypePrompt','chooseTimerType',
      'rTimerChoicePrompt','toggleInlineForm','clearInlineInputs','timerId','normalizeTimer',
      'normalizeTimerList','timerDueFromStart','timerMetaLine','timerCountdownDays','timerCountdownMeta',
      'openTimerEditor','closeTimerEditor','switchTimerEditMode','saveTimerEditor','rTimerEdit',
      'toggleTimer','upsertTimer','rmTimer','R','sv','SK','entries','timerEditModal'
    ].forEach(expose);
  }

  function entriesList(){
    const rows = g('entries');
    return Array.isArray(rows) ? rows : [];
  }

  function saveEntries(rows){
    setBinding('entries', rows);
    const save = fn('sv');
    const key = g('SK') || window.SK;
    if (save && key) save(key, rows);
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

  function currentPromptId(){
    const p = g('timerChoicePrompt') || window.timerChoicePrompt || null;
    return clean(p && p.entryId);
  }

  function setPrompt(value){
    window.timerChoicePrompt = value;
    setBinding('timerChoicePrompt', value);
  }

  function currentEditModal(){
    return g('timerEditModal') || window.timerEditModal || null;
  }

  function setEditModal(value){
    window.timerEditModal = value;
    setBinding('timerEditModal', value);
  }

  function openPrompt(id){
    exposeTimerApi();
    if (!id) return false;
    if (call('openTimerTypePrompt', [id])) return true;
    const entry = entriesList().find(e => clean(e.id) === clean(id));
    if (!entry) return false;
    setPrompt({ entryId:id, bank:entry.bank || '' });
    call('R', []);
    return true;
  }

  function openTimerForm(kind){
    exposeTimerApi();
    const id = currentPromptId();
    if (!id) return false;
    const stateFor = fn('inlineStateFor');
    const st = stateFor ? stateFor(id) : null;
    if (st) {
      st.timerKind = kind === 'days' ? 'days' : 'due';
      st.timerEdit = null;
      st.timer = true;
    }
    setPrompt(null);
    window.__skipTimerPrompt = true;
    let opened = call('toggleInlineForm', [id, 'timer', true]);
    window.__skipTimerPrompt = false;
    if (!opened) call('R', []);
    setTimeout(() => {
      const target = document.getElementById('tm_txt_' + id);
      if (target) target.focus();
    }, 0);
    return true;
  }

  function makeTimer(data){
    const normalize = fn('normalizeTimer');
    if (normalize) return normalize(data);
    const id = data.id || ('tmr_' + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-5));
    return {
      id,
      text:clean(data.text),
      startDate:clean(data.startDate),
      daysRequired:parseInt(data.daysRequired || 0, 10) || 0,
      date:clean(data.date),
      done:!!data.done
    };
  }

  function normalizeTimers(list){
    const normalizeList = fn('normalizeTimerList');
    if (normalizeList) return normalizeList(list);
    return (Array.isArray(list) ? list : []).map(makeTimer).filter(t => t.text || t.date);
  }

  function dueFromStart(start, days){
    const calc = fn('timerDueFromStart');
    if (calc) return calc(start, days);
    const d = new Date(start + 'T00:00:00');
    d.setDate(d.getDate() + Number(days || 0));
    return d.toISOString().split('T')[0];
  }

  function isDeleted(entry, timer){
    const check = fn('isDeletedTimer');
    return check ? !!check(entry, timer) : false;
  }

  function clearDeleted(entry, timer){
    const clear = fn('clearDeletedTimerKeys');
    if (clear) { try { clear(entry, timer); } catch {} }
  }

  function writeTimerToEntry(entryId, timerIdValue, label, start, days, preserveDone){
    entryId = clean(entryId);
    const editId = clean(timerIdValue);
    const due = days > 0 ? dueFromStart(start, days) : start;
    let changed = false;
    const rows = entriesList().map(e => {
      if (clean(e.id) !== entryId) return e;
      const timers = normalizeTimers(e.customTimers).filter(t => !isDeleted(e, t));
      const idx = timers.findIndex(t => clean(t.id) === editId);
      const next = makeTimer({
        id:idx >= 0 ? timers[idx].id : undefined,
        text:label,
        startDate:days > 0 ? start : '',
        daysRequired:days,
        date:due,
        done:idx >= 0 ? !!timers[idx].done : !!preserveDone
      });
      clearDeleted(e, next);
      if (idx >= 0) timers[idx] = next;
      else timers.push(next);
      changed = true;
      return { ...e, customTimers:timers };
    });
    if (!changed) return false;
    saveEntries(rows);
    return true;
  }

  function saveInlineTimer(id){
    exposeTimerApi();
    id = clean(id);
    const txt = document.getElementById('tm_txt_' + id);
    const dateInput = document.getElementById('tm_start_' + id);
    const daysInput = document.getElementById('tm_days_' + id);
    const stateFor = fn('inlineStateFor');
    const ui = stateFor ? stateFor(id) : { timerKind:'due', timerEdit:null };
    const kind = ui.timerKind === 'days' ? 'days' : 'due';
    const label = clean(txt && txt.value);
    const start = clean(dateInput && dateInput.value);
    const days = kind === 'days' ? (parseInt(daysInput && daysInput.value, 10) || 0) : 0;

    if (!label || !start) {
      alert(kind === 'days' ? 'Add a timer name and start date.' : 'Add a timer name and due date.');
      return false;
    }
    if (kind === 'days' && days <= 0) {
      alert('Add the number of days for this timer.');
      return false;
    }

    const editId = ui && ui.timerEdit;
    if (ui) {
      ui.timerEdit = null;
      ui.timer = false;
    }
    const ok = writeTimerToEntry(id, editId, label, start, days, false);
    if (ok) call('R', []);
    return ok;
  }

  function saveEditModalTimer(){
    exposeTimerApi();
    const p = currentEditModal();
    if (!p) return false;

    const label = clean(document.getElementById('tem_text')?.value || p.text || '');
    const start = clean(document.getElementById('tem_start')?.value || p.startDate || '');
    const rawDays = document.getElementById('tem_days')?.value || p.daysRequired || '';
    const mode = p.mode === 'days' ? 'days' : 'due';
    const days = mode === 'days' ? (parseInt(rawDays, 10) || 0) : 0;

    if (!label || !start) {
      alert(mode === 'days' ? 'Add a description and start date.' : 'Add a description and due date.');
      return false;
    }
    if (mode === 'days' && days <= 0) {
      alert('Add the number of days for a Start Date + Days timer.');
      return false;
    }

    const ok = writeTimerToEntry(p.entryId, p.timerId, label, start, days, false);
    if (!ok) {
      alert('Could not find the entry for this timer. Close and reopen the card, then try again.');
      return false;
    }
    setEditModal(null);
    call('R', []);
    return true;
  }

  function isNewTimerModal(){
    const p = currentEditModal();
    return !!p && !clean(p.timerId);
  }

  function polishTimerModalLabels(){
    const p = currentEditModal();
    if (!p) return;
    const isNew = !clean(p.timerId);
    document.querySelectorAll('.dd-box').forEach(box => {
      if (!box.querySelector('#tem_text,#tem_start') && !/countdown timer/i.test(box.textContent || '')) return;
      const h = box.querySelector('h3');
      if (h) h.textContent = isNew ? 'Add countdown timer' : 'Edit countdown timer';
      const sub = box.querySelector('.sub');
      if (sub) sub.textContent = isNew ? 'Create a due-date timer, or switch to start date + days.' : 'Keep it as an exact due date, or switch to start date + days.';
      Array.from(box.querySelectorAll('button')).forEach(btn => {
        if (clean(btn.textContent) === 'Save' || clean(btn.textContent) === 'Add Timer') btn.textContent = isNew ? 'Add Timer' : 'Save';
      });
    });
  }

  function isTimerEditSaveButton(btn){
    if (!btn) return false;
    const txt = clean(btn.textContent);
    if (txt !== 'Save' && txt !== 'Add Timer') return false;
    const box = btn.closest?.('.dd-box,.cbg,.modal,body');
    if (!box) return false;
    return !!box.querySelector?.('#tem_text,#tem_start') || /(?:Edit|Add) countdown timer/i.test(box.textContent || '');
  }

  function handleTimerClick(event){
    const btn = event.target?.closest?.('button');
    if (!btn) return;
    const text = clean(btn.textContent);

    if (isTimerEditSaveButton(btn)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      saveEditModalTimer();
      return;
    }

    if (text.includes('Add mini timer')) {
      const id = entryIdFromOnclick(btn) || entryIdFromTimerForm(btn);
      if (!id) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openPrompt(id);
      return;
    }

    if (text.includes('Due Date Timer')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openTimerForm('due');
      return;
    }

    if (text.includes('Start Date + Days Timer')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openTimerForm('days');
      return;
    }

    if (text === 'Add timer') {
      const id = entryIdFromTimerForm(btn);
      if (!id) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      saveInlineTimer(id);
      return;
    }
  }

  exposeTimerApi();
  document.addEventListener('click', handleTimerClick, true);
  setTimeout(exposeTimerApi, 0);
  setTimeout(exposeTimerApi, 300);
  setInterval(polishTimerModalLabels, 250);
  try { new MutationObserver(polishTimerModalLabels).observe(document.documentElement, { childList:true, subtree:true }); } catch {}

  window.btTimerCoreFixStatus = function(){
    exposeTimerApi();
    return {
      version: VER,
      promptId: currentPromptId(),
      hasEditModal: !!currentEditModal(),
      isNewTimerModal: isNewTimerModal(),
      hasInlineStateFor: typeof window.inlineStateFor === 'function' || typeof fn('inlineStateFor') === 'function',
      hasToggleInlineForm: typeof window.toggleInlineForm === 'function' || typeof fn('toggleInlineForm') === 'function',
      hasUpsertTimer: typeof window.upsertTimer === 'function' || typeof fn('upsertTimer') === 'function'
    };
  };
})();
