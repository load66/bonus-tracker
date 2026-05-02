/*
 * filename: scripts/timer-core-fix.js
 * version: 3.3.32
 * purpose: Safe timer modal save fix without polling or mutation observers.
 * last-touched: 2026-05-02
 */
(function(){
  const VER = '3.3.32';
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  function globalGet(name){
    try { return (0, eval)(name); } catch { return window[name]; }
  }

  function globalSet(name, value){
    try {
      window.__btTimerFixSetValue = value;
      (0, eval)(name + ' = window.__btTimerFixSetValue');
      return true;
    } catch {
      try { window[name] = value; return true; } catch { return false; }
    }
  }

  function fn(name){
    const f = globalGet(name);
    return typeof f === 'function' ? f : null;
  }

  function entriesRef(){
    const rows = globalGet('entries');
    return Array.isArray(rows) ? rows : [];
  }

  function saveEntries(rows){
    globalSet('entries', rows);
    const save = fn('sv');
    const key = globalGet('SK') || window.SK;
    if (save && key) save(key, rows);
  }

  function render(){
    try { const r = fn('R'); if (r) r(); } catch {}
  }

  function currentTimerModal(){
    return globalGet('timerEditModal') || window.timerEditModal || null;
  }

  function closeTimerModal(){
    window.timerEditModal = null;
    globalSet('timerEditModal', null);
  }

  function makeTimer(data){
    const normalize = fn('normalizeTimer');
    if (normalize) return normalize(data);
    return {
      id:clean(data.id) || ('tmr_' + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-5)),
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

  function safeSaveTimerModal(){
    const modal = currentTimerModal();
    if (!modal) return false;

    const label = clean(document.getElementById('tem_text')?.value || modal.text || '');
    const start = clean(document.getElementById('tem_start')?.value || modal.startDate || '');
    const rawDays = document.getElementById('tem_days')?.value || modal.daysRequired || '';
    const mode = modal.mode === 'days' ? 'days' : 'due';
    const days = mode === 'days' ? (parseInt(rawDays, 10) || 0) : 0;

    if (!label || !start) {
      alert(mode === 'days' ? 'Add a description and start date.' : 'Add a description and due date.');
      return true;
    }
    if (mode === 'days' && days <= 0) {
      alert('Add the number of days for a Start Date + Days timer.');
      return true;
    }

    const entryId = clean(modal.entryId);
    const timerId = clean(modal.timerId);
    const due = days > 0 ? dueFromStart(start, days) : start;
    let found = false;

    const rows = entriesRef().map(entry => {
      if (clean(entry.id) !== entryId) return entry;
      found = true;
      const timers = normalizeTimers(entry.customTimers);
      const idx = timers.findIndex(t => clean(t.id) === timerId);
      const next = makeTimer({
        id:idx >= 0 ? timers[idx].id : timerId,
        text:label,
        startDate:days > 0 ? start : '',
        daysRequired:days,
        date:due,
        done:idx >= 0 ? !!timers[idx].done : false
      });
      if (idx >= 0) timers[idx] = next;
      else timers.push(next);
      return { ...entry, customTimers:timers };
    });

    if (!found) {
      alert('Could not find the entry for this timer. Close and reopen the card, then try again.');
      return true;
    }

    saveEntries(rows);
    closeTimerModal();
    render();
    return true;
  }

  function isTimerModalSaveButton(btn){
    if (!btn) return false;
    const text = clean(btn.textContent);
    if (text !== 'Save' && text !== 'Add Timer') return false;
    const box = btn.closest?.('.dd-box,.cbg,.modal,body');
    if (!box) return false;
    return !!box.querySelector?.('#tem_text,#tem_start') || /countdown timer/i.test(box.textContent || '');
  }

  function polishVisibleTimerModalOnce(){
    const modal = currentTimerModal();
    if (!modal) return;
    const isNew = !clean(modal.timerId);
    document.querySelectorAll('.dd-box').forEach(box => {
      if (!box.querySelector('#tem_text,#tem_start') && !/countdown timer/i.test(box.textContent || '')) return;
      const h = box.querySelector('h3');
      if (h && /countdown timer/i.test(h.textContent || '')) h.textContent = isNew ? 'Add countdown timer' : 'Edit countdown timer';
      Array.from(box.querySelectorAll('button')).forEach(btn => {
        const t = clean(btn.textContent);
        if (t === 'Save' || t === 'Add Timer') btn.textContent = isNew ? 'Add Timer' : 'Save';
      });
    });
  }

  document.addEventListener('click', function(event){
    const btn = event.target?.closest?.('button');
    if (!btn) return;

    if (isTimerModalSaveButton(btn)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      safeSaveTimerModal();
      return;
    }

    const text = clean(btn.textContent);
    if (text === 'Add Timer' || text === 'Add timer' || text.includes('Add Timer')) {
      setTimeout(polishVisibleTimerModalOnce, 80);
      setTimeout(polishVisibleTimerModalOnce, 240);
    }
  }, true);

  window.btTimerCoreFixStatus = function(){
    return {
      version: VER,
      hasTimerModal: !!currentTimerModal(),
      entries: entriesRef().length
    };
  };
})();
