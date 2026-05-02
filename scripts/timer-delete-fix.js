/*
 * filename: scripts/timer-delete-fix.js
 * version: 2.8.5
 * purpose: Fix mini timer delete persistence + prevent deleted auto timers from returning overdue.
 * last-touched: unknown
 */
(function(){
  const VER = '2.8.5';
  const DELETE_KEY_PREFIX = 'bt_deleted_timer_keys_v1:';

  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const norm = v => clean(v).toLowerCase();

  function entryList(){
    try { return Array.isArray(entries) ? entries : []; } catch { return []; }
  }

  function saveEntries(){
    try { if (typeof sv === 'function' && typeof SK !== 'undefined') sv(SK, entries); } catch {}
  }

  function timerList(e){
    try { return typeof normalizeTimerList === 'function' ? normalizeTimerList(e.customTimers || []) : (Array.isArray(e.customTimers) ? e.customTimers : []); }
    catch { return Array.isArray(e.customTimers) ? e.customTimers : []; }
  }

  function timerKey(t){
    if (!t) return '';
    return [norm(t.text || ''), clean(t.date || ''), clean(t.startDate || ''), String(parseInt(t.daysRequired || 0, 10) || 0)].join('|');
  }

  function timerTextKey(t){ return 'text::' + norm(t?.text || ''); }
  function timerIdKey(t){ return 'id::' + clean(t?.id || ''); }

  function deletedKeyStore(entryId){
    try {
      const raw = localStorage.getItem(DELETE_KEY_PREFIX + entryId);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  function saveDeletedKeyStore(entryId, keys){
    try { localStorage.setItem(DELETE_KEY_PREFIX + entryId, JSON.stringify(Array.from(new Set(keys)).slice(-250))); } catch {}
  }

  function getDeletedKeys(e){
    const own = Array.isArray(e.deletedTimerKeys) ? e.deletedTimerKeys : [];
    const store = e.id ? deletedKeyStore(e.id) : [];
    return new Set([...own, ...store].filter(Boolean));
  }

  function addDeletedKeys(e, timer){
    if (!e || !timer) return;
    const keys = getDeletedKeys(e);
    [timerKey(timer), timerTextKey(timer), timerIdKey(timer)].forEach(k => { if (k && k !== 'text::' && k !== 'id::') keys.add(k); });
    e.deletedTimerKeys = Array.from(keys).slice(-250);
    if (e.id) saveDeletedKeyStore(e.id, e.deletedTimerKeys);
  }

  function isDeletedTimer(e, t){
    if (!e || !t) return false;
    const keys = getDeletedKeys(e);
    return keys.has(timerKey(t)) || keys.has(timerTextKey(t)) || keys.has(timerIdKey(t));
  }

  function sanitizeEntryTimers(e){
    if (!e || !Array.isArray(e.customTimers)) return false;
    const before = e.customTimers.length;
    const cleanTimers = timerList(e).filter(t => !isDeletedTimer(e, t));
    if (cleanTimers.length !== before) {
      e.customTimers = cleanTimers;
      return true;
    }
    return false;
  }

  function sanitizeAllTimers(save=false){
    let changed = false;
    entryList().forEach(e => { if (sanitizeEntryTimers(e)) changed = true; });
    if (changed && save) saveEntries();
    return changed;
  }

  function findEntry(entryId){
    const id = clean(entryId);
    if (!id) return null;
    return entryList().find(e => clean(e.id) === id) || null;
  }

  function deleteTimerCore(entryId, timerIdValue, opts={}){
    const e = findEntry(entryId);
    if (!e) return false;
    const id = clean(timerIdValue);
    const timers = timerList(e);
    const target = timers.find(t => clean(t.id) === id) || (opts.text ? timers.find(t => norm(t.text) === norm(opts.text)) : null);
    if (!target) {
      sanitizeEntryTimers(e);
      saveEntries();
      try { if (typeof R === 'function') R(); } catch {}
      return false;
    }

    addDeletedKeys(e, target);
    e.customTimers = timers.filter(t => clean(t.id) !== clean(target.id));
    saveEntries();
    try { if (typeof R === 'function') R(); } catch {}
    return true;
  }

  function wrapDeleteName(name){
    const old = window[name];
    window[name] = function(entryId, timerIdValue){
      const ok = deleteTimerCore(entryId, timerIdValue);
      if (ok) return false;
      if (typeof old === 'function') {
        try {
          const out = old.apply(this, arguments);
          sanitizeAllTimers(true);
          try { if (typeof R === 'function') R(); } catch {}
          return out;
        } catch (err) { console.warn('[timer-delete-fix] old delete failed', name, err); }
      }
      return false;
    };
  }

  function wrapR(){
    if (window.__timerDeleteFixWrappedR) return;
    const oldR = window.R;
    if (typeof oldR !== 'function') return;
    window.__timerDeleteFixWrappedR = true;
    window.R = R = function(){
      sanitizeAllTimers(true);
      const out = oldR.apply(this, arguments);
      setTimeout(() => sanitizeAllTimers(true), 0);
      return out;
    };
  }

  function isDeleteButton(el){
    if (!el) return false;
    const txt = clean(el.textContent || el.value || '');
    const aria = clean(el.getAttribute?.('aria-label') || el.title || '');
    return txt === '×' || txt === 'x' || /delete|remove/i.test(aria);
  }

  function inferEntryIdFromElement(el){
    const on = String(el.getAttribute?.('onclick') || '');
    const m = on.match(/['"]([^'"]{3,})['"]\s*,/);
    if (m && findEntry(m[1])) return m[1];
    let p = el;
    for (let i=0;i<8 && p;i++,p=p.parentElement){
      const attrs = ['data-entry-id','data-id','id'];
      for (const a of attrs) {
        const v = clean(p.getAttribute?.(a) || '');
        if (findEntry(v)) return v;
      }
      const text = p.textContent || '';
      for (const e of entryList()) {
        if (e.id && text.includes(e.id)) return e.id;
      }
    }
    return '';
  }

  function inferTimerIdFromElement(el){
    const on = String(el.getAttribute?.('onclick') || '');
    const quoted = Array.from(on.matchAll(/['"]([^'"]+)['"]/g)).map(m => m[1]);
    for (let i=quoted.length-1;i>=0;i--) {
      if (/^tm_|timer|[a-z0-9]{6,}/i.test(quoted[i])) return quoted[i];
    }
    let p = el;
    for (let i=0;i<6 && p;i++,p=p.parentElement){
      for (const a of ['data-timer-id','data-id','id']) {
        const v = clean(p.getAttribute?.(a) || '');
        if (v && !findEntry(v)) return v.replace(/^timer[_-]?/i,'');
      }
    }
    return '';
  }

  document.addEventListener('click', function(e){
    const btn = e.target.closest('button,a,span');
    if (!btn || !isDeleteButton(btn)) return;
    const nearText = clean(btn.closest('.tm-row,.timer-row,.mini-timer,.tm-card,.tm-item,li,div')?.textContent || '');
    if (!/timer|deadline|due|overdue|countdown/i.test(nearText)) return;

    const entryId = inferEntryIdFromElement(btn);
    const timerIdValue = inferTimerIdFromElement(btn);
    if (entryId && timerIdValue) {
      e.preventDefault();
      e.stopImmediatePropagation();
      deleteTimerCore(entryId, timerIdValue);
    }
  }, true);

  ['deleteTimer','removeTimer','deleteCustomTimer','removeCustomTimer','deleteMiniTimer','removeMiniTimer','delTimer','rmTimer'].forEach(wrapDeleteName);

  window.btDeleteTimerFixStatus = function(){
    return {
      version: VER,
      entries: entryList().length,
      deletedTimerKeys: entryList().reduce((n,e)=>n+(Array.isArray(e.deletedTimerKeys)?e.deletedTimerKeys.length:0),0),
      timers: entryList().reduce((n,e)=>n+(Array.isArray(e.customTimers)?e.customTimers.length:0),0)
    };
  };

  setTimeout(() => { wrapR(); sanitizeAllTimers(true); }, 250);
  setTimeout(() => { wrapR(); sanitizeAllTimers(true); }, 1000);
})();