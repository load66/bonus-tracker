/* ✅ Version 2.3 Newest update: Clean mini timer picker for Due Date vs Start Date + Days timers. */
(function(){
  const baseInlineStateFor = inlineStateFor;
  const baseToggleInlineForm = toggleInlineForm;
  const baseR = R;

  window.timerChoicePrompt = null;

  window.inlineStateFor = inlineStateFor = function(id){
    const st = baseInlineStateFor ? baseInlineStateFor(id) : (inlineUiState[id] ||= {});
    if (!('timerKind' in st)) st.timerKind = 'due';
    return st;
  };

  window.openTimerTypePrompt = function(id){
    const entry = (entries || []).find(e => e.id === id);
    if (!entry) return;
    window.timerChoicePrompt = { entryId:id, bank:entry.bank || '' };
    R();
  };

  window.closeTimerTypePrompt = function(){
    window.timerChoicePrompt = null;
    R();
  };

  window.chooseTimerType = function(kind){
    if (!window.timerChoicePrompt) return;
    const id = window.timerChoicePrompt.entryId;
    const st = inlineStateFor(id);
    st.timerKind = kind === 'days' ? 'days' : 'due';
    st.timerEdit = null;
    window.timerChoicePrompt = null;
    window.__skipTimerPrompt = true;
    baseToggleInlineForm(id, 'timer', true);
    window.__skipTimerPrompt = false;
  };

  window.toggleInlineForm = toggleInlineForm = function(id, type, force){
    if (type === 'timer' && force === true && !window.__skipTimerPrompt) {
      window.openTimerTypePrompt(id);
      return;
    }
    return baseToggleInlineForm(id, type, force);
  };

  window.rTimerChoicePrompt = function(){
    if (!window.timerChoicePrompt) return '';
    let h = '<div class="cbg" onclick="closeTimerTypePrompt()"><div class="dd-box" onclick="event.stopPropagation()">';
    h += '<h3>Choose mini timer type</h3>';
    h += '<div class="sub">Pick the timer style that matches the bank requirement.</div>';
    h += '<button class="inline-trigger" style="width:100%;justify-content:flex-start;margin-bottom:8px;text-align:left" onclick="chooseTimerType(\'due\')"><span>📅</span><span><strong>Due Date Timer</strong><br><span style="font-size:10px;color:#64748B;font-weight:700">Countdown to an exact date you already know.</span></span></button>';
    h += '<button class="inline-trigger" style="width:100%;justify-content:flex-start;text-align:left" onclick="chooseTimerType(\'days\')"><span>⏱️</span><span><strong>Start Date + Days Timer</strong><br><span style="font-size:10px;color:#64748B;font-weight:700">Enter a start date and days; the app calculates the due date.</span></span></button>';
    h += '<button class="btn-s" onclick="closeTimerTypePrompt()">Cancel</button>';
    h += '</div></div>';
    return h;
  };

  function decorateTimerForms(){
    document.querySelectorAll('[id^="tm_txt_"]').forEach(txt => {
      const id = txt.id.replace('tm_txt_', '');
      const st = inlineStateFor(id);
      const kind = st.timerKind === 'days' ? 'days' : 'due';
      const wrap = txt.closest('.inline-form');
      const row = txt.closest('.tm-add');
      const date = document.getElementById('tm_start_' + id);
      const days = document.getElementById('tm_days_' + id);
      if (!wrap || !row || wrap.dataset.timerDecorated === kind) return;
      wrap.dataset.timerDecorated = kind;
      const oldLabel = wrap.querySelector('.timer-kind-label');
      if (oldLabel) oldLabel.remove();
      wrap.insertAdjacentHTML('afterbegin', '<div class="tc-label timer-kind-label" style="margin-bottom:8px">' + (kind === 'days' ? 'Start Date + Days Timer' : 'Due Date Timer') + '</div>');
      if (kind === 'days') {
        txt.placeholder = 'e.g. 60-day hold ends';
        if (date) date.title = 'Start date';
        if (days) { days.type = 'number'; days.placeholder = 'Days'; days.style.display = ''; }
        row.style.gridTemplateColumns = '';
      } else {
        txt.placeholder = 'e.g. Last day to deposit';
        if (date) date.title = 'Due date';
        if (days) { days.value = ''; days.type = 'hidden'; days.style.display = 'none'; }
        row.style.gridTemplateColumns = 'minmax(0,1fr) minmax(0,.75fr)';
      }
      const help = wrap.querySelector('.timer-kind-help');
      if (help) help.remove();
      row.insertAdjacentHTML('afterend', '<div class="tm-sub timer-kind-help" style="margin-top:6px">' + (kind === 'days' ? 'Use this when the bank says “hold for 60 days” or “complete within 90 days.”' : 'Use this when you already know the exact deadline date.') + '</div>');
    });
  }

  window.R = R = function(){
    baseR();
    const app = document.getElementById('app');
    if (app && window.timerChoicePrompt) app.insertAdjacentHTML('beforeend', window.rTimerChoicePrompt());
    decorateTimerForms();
  };

  window.upsertTimer = upsertTimer = function(id){
    const txt = document.getElementById('tm_txt_' + id);
    const st = document.getElementById('tm_start_' + id);
    const ds = document.getElementById('tm_days_' + id);
    const ui = inlineStateFor(id);
    const kind = ui.timerKind === 'days' ? 'days' : 'due';
    const days = kind === 'days' ? (parseInt(ds?.value, 10) || 0) : 0;
    if (!txt || !st || !txt.value.trim() || !st.value) {
      alert(kind === 'days' ? 'Add a timer name and start date.' : 'Add a timer name and due date.');
      return;
    }
    if (kind === 'days' && days <= 0) {
      alert('Add the number of days for this timer.');
      return;
    }
    const editId = ui.timerEdit || '';
    const due = days > 0 ? timerDueFromStart(st.value, days) : st.value;
    entries = entries.map(e => {
      if (e.id === id) {
        const timers = normalizeTimerList(e.customTimers);
        const idx = timers.findIndex(t => t.id === editId);
        const next = normalizeTimer({ id:idx >= 0 ? timers[idx].id : timerId(), text:txt.value.trim(), startDate:days > 0 ? st.value : '', daysRequired:days, date:due, done:idx >= 0 ? !!timers[idx].done : false });
        if (idx >= 0) timers[idx] = next; else timers.push(next);
        e.customTimers = timers;
      }
      return e;
    });
    sv(SK, entries);
    ui.timerEdit = null;
    window.__skipTimerPrompt = true;
    baseToggleInlineForm(id, 'timer', false);
    window.__skipTimerPrompt = false;
  };

  window.openTimerEditor = openTimerEditor = function(id, timerIdValue){
    const entry = (entries || []).find(e => e.id === id);
    if (!entry) return;
    const timer = normalizeTimerList(entry.customTimers).find(t => t.id === timerIdValue);
    if (!timer) return;
    timerEditModal = { entryId:id, timerId:timer.id, text:timer.text || '', mode:timer.daysRequired > 0 ? 'days' : 'due', startDate:(timer.daysRequired > 0 ? timer.startDate : timer.date) || '', daysRequired:timer.daysRequired ? String(timer.daysRequired) : '' };
    R();
  };

  window.switchTimerEditMode = function(mode){
    if (!timerEditModal) return;
    timerEditModal.mode = mode === 'days' ? 'days' : 'due';
    R();
  };

  window.saveTimerEditor = saveTimerEditor = function(){
    const p = timerEditModal;
    if (!p) return;
    const txt = (document.getElementById('tem_text')?.value || '').trim();
    const start = (document.getElementById('tem_start')?.value || '').trim();
    const rawDays = document.getElementById('tem_days')?.value || '';
    const days = p.mode === 'days' ? (parseInt(rawDays, 10) || 0) : 0;
    if (!txt || !start) { alert('Add a description and a date.'); return; }
    if (p.mode === 'days' && days <= 0) { alert('Add the number of days for a Start Date + Days timer.'); return; }
    const due = days > 0 ? timerDueFromStart(start, days) : start;
    const updated = normalizeTimer({ id:p.timerId, text:txt, startDate:days > 0 ? start : '', daysRequired:days, date:due, done:false });
    entries = entries.map(e => {
      if (e.id === p.entryId) {
        const timers = normalizeTimerList(e.customTimers);
        const idx = timers.findIndex(t => t.id === p.timerId);
        if (idx >= 0) { updated.done = !!timers[idx].done; timers[idx] = updated; }
        e.customTimers = timers;
      }
      return e;
    });
    sv(SK, entries);
    timerEditModal = null;
    R();
  };

  window.rTimerEdit = rTimerEdit = function(){
    if (!timerEditModal) return '';
    const p = timerEditModal;
    const isDays = p.mode === 'days';
    let h = '<div class="cbg" onclick="closeTimerEditor()"><div class="dd-box" onclick="event.stopPropagation()">';
    h += '<h3>Edit countdown timer</h3>';
    h += '<div class="sub">Keep it as an exact due date, or switch to start date + days.</div>';
    h += '<div class="dd-chips"><button class="dd-chip ' + (!isDays ? 'sel' : '') + '" onclick="switchTimerEditMode(\'due\')">Due Date</button><button class="dd-chip ' + (isDays ? 'sel' : '') + '" onclick="switchTimerEditMode(\'days\')">Start + Days</button></div>';
    h += '<div class="fg"><label>Description</label><input id="tem_text" value="' + esc(p.text || '') + '" placeholder="e.g. Deposit deadline"></div>';
    if (isDays) {
      h += '<div class="frow"><div class="fg"><label>Start date</label><input id="tem_start" type="date" value="' + esc(p.startDate || '') + '"></div><div class="fg"><label>Days</label><input id="tem_days" type="number" inputmode="numeric" min="1" value="' + esc(String(p.daysRequired || '')) + '" placeholder="60"></div></div>';
    } else {
      h += '<div class="fg"><label>Due date</label><input id="tem_start" type="date" value="' + esc(p.startDate || '') + '"><input id="tem_days" type="hidden" value=""></div>';
    }
    h += '<div class="crow"><button class="c-c" onclick="closeTimerEditor()">Cancel</button><button class="c-g" onclick="saveTimerEditor()">Save</button></div>';
    h += '</div></div>';
    return h;
  };

  window.timerMetaLine = timerMetaLine = function(t){
    const due = t?.date || '';
    const start = t?.startDate || '';
    const days = parseInt(t?.daysRequired || 0, 10) || 0;
    if (start && days && due) return 'Start + Days: ' + fD(start) + ' • ' + days + 'd • Due: ' + fD(due);
    if (due) return 'Due Date: ' + fD(due);
    return 'No date set';
  };

  R();
})();
