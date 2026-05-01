/* ✅ Version 3.2.8 Newest update: Force Health tab to show the full App Safety Dashboard instead of old Data Health card. */
(function(){
  const VER='3.2.8';
  const ENTRY_KEY='bt_e_v4';
  const TC_KEY='bt_tc_learning_inbox_v320';
  const BACKUP_KEY='bt_last_backup';
  const RESTORE_KEY='bt_last_restore';

  const esc=v=>{const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML};
  const safeParse=(v,d)=>{try{return JSON.parse(v)}catch{return d}};
  const dayMs=86400000;
  const today=()=>new Date().toISOString().split('T')[0];
  const dateOnly=v=>String(v||'').split('T')[0];
  const dB=(a,b)=>Math.floor((new Date(dateOnly(b)+'T00:00:00')-new Date(dateOnly(a)+'T00:00:00'))/dayMs);
  const addD=(d,n)=>{const x=new Date(dateOnly(d)+'T00:00:00');x.setDate(x.getDate()+Number(n||0));return x.toISOString().split('T')[0]};
  const addM=(d,m)=>{const x=new Date(dateOnly(d)+'T00:00:00');x.setMonth(x.getMonth()+Number(m||0));return x.toISOString().split('T')[0]};
  const fD=d=>d?new Date(dateOnly(d)+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';

  function bumpBadge(){const b=document.querySelector('.app-version');if(b)b.textContent='v'+VER;window.btVisibleAppVersion=VER;}
  function entriesList(){
    try{if(Array.isArray(entries))return entries}catch{}
    try{if(Array.isArray(window.entries))return window.entries}catch{}
    return safeParse(localStorage.getItem(ENTRY_KEY)||'[]',[]);
  }
  function tcList(){return safeParse(localStorage.getItem(TC_KEY)||'[]',[])}
  function lastBackup(){return localStorage.getItem(BACKUP_KEY)||''}
  function lastRestore(){return localStorage.getItem(RESTORE_KEY)||''}
  function churnDate(e){
    if(!e||!e.closed||!e.churn)return'';
    const c=String(e.churn);
    if(c==='180')return addD(e.closed,180);
    const yrs=parseInt(c,10)||0;
    return yrs?addM(e.closed,yrs*12):'';
  }
  function daysToChurn(e){const d=churnDate(e);return d?Math.max(0,dB(today(),d)+10):null;}
  function timerDays(t){return t&&t.date?dB(today(),t.date):null;}
  function activeTimers(e){return (Array.isArray(e?.customTimers)?e.customTimers:[]).filter(t=>t&&!t.done&&t.date).sort((a,b)=>String(a.date).localeCompare(String(b.date)));}
  function backupAgeDays(){const lb=lastBackup();return lb?Math.max(0,dB(dateOnly(lb),today())):9999;}
  function issueLimit(items,n=8){return items.slice(0,n)}

  function analyzeHealth(){
    const entries=entriesList().filter(e=>e&&e.bank);
    const tcs=tcList();
    const active=entries.filter(e=>!e.closed);
    const closed=entries.filter(e=>!!e.closed);
    const ready=closed.filter(e=>daysToChurn(e)===0);
    const churnSoon=closed.filter(e=>{const d=daysToChurn(e);return d!==null&&d>0&&d<=30});
    const overdueTimers=[];
    const dueSoonTimers=[];
    entries.forEach(e=>activeTimers(e).forEach(t=>{const d=timerDays(t);if(d===null)return;const row={bank:e.bank,text:t.text||'Timer',days:d,date:t.date};if(d<0)overdueTimers.push(row);else if(d<=7)dueSoonTimers.push(row)}));
    const missingChurn=entries.filter(e=>e.closed&&!e.churn);
    const missingOpened=active.filter(e=>!e.opened);
    const missingClosed=entries.filter(e=>e.bonusRecd&&!e.closed);
    const tcConflict=tcs.filter(x=>x.status==='conflict'||x.conflict?.hasConflicts);
    const tcReview=tcs.filter(x=>x.status==='review'||x.conflict?.hasMissing||x.conflict?.warnings?.length);
    const backupAge=backupAgeDays();
    const backupStatus=!lastBackup()?'NEVER BACKED UP':backupAge===0?'GOOD':backupAge<=7?'OK':'BACKUP RECOMMENDED';
    const severity=(!lastBackup()||backupAge>7||overdueTimers.length||tcConflict.length)?'bad':(backupAge>2||dueSoonTimers.length||missingChurn.length||tcReview.length)?'warn':'ok';
    return {entries,active,closed,ready,churnSoon,overdueTimers,dueSoonTimers,missingChurn,missingOpened,missingClosed,tcs,tcConflict,tcReview,backupAge,backupStatus,severity,lastBackup:lastBackup(),lastRestore:lastRestore()};
  }

  function cardMetric(label,value,cls=''){return `<div class="h27-metric ${cls}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;}
  function listRows(rows,empty,fmt){return rows.length?issueLimit(rows).map(fmt).join('')+(rows.length>8?`<div class="h27-muted">+${rows.length-8} more</div>`:''):`<div class="h27-muted">${esc(empty)}</div>`;}
  function renderHealthDashboard(){
    const h=analyzeHealth();
    const backupCls=h.severity==='bad'?'bad':h.severity==='warn'?'warn':'ok';
    const selfTestStatus=window.__tcV31LastSelfTest?((window.__tcV31LastSelfTest.failed||0)===0?'PASS':'NEEDS FIX'):'Not run this session';
    return `<section id="bt_health_dashboard_327" class="h27-card">
      <div class="h27-head">
        <div><h2>App Safety Dashboard</h2><p>Backup, churn, timers, analyzer, and missing-data checks.</p></div>
        <span class="h27-pill ${backupCls}">${esc(h.backupStatus)}</span>
      </div>
      <div class="h27-grid">
        ${cardMetric('Total banks',h.entries.length)}
        ${cardMetric('Active',h.active.length)}
        ${cardMetric('Closed',h.closed.length)}
        ${cardMetric('Ready to churn',h.ready.length,h.ready.length?'good':'')}
        ${cardMetric('Overdue timers',h.overdueTimers.length,h.overdueTimers.length?'bad':'')}
        ${cardMetric('T&C review',h.tcReview.length+h.tcConflict.length,(h.tcReview.length+h.tcConflict.length)?'warn':'')}
      </div>
      <div class="h27-two">
        <div class="h27-panel"><h3>Backup Health</h3>
          <div class="h27-line"><b>Last backup:</b> ${h.lastBackup?esc(fD(h.lastBackup)):'Never'}</div>
          <div class="h27-line"><b>Backup age:</b> ${h.lastBackup?(h.backupAge+' day(s) ago'):'No backup found'}</div>
          <div class="h27-line"><b>Last restore:</b> ${h.lastRestore?esc(new Date(h.lastRestore).toLocaleString()):'—'}</div>
          <button class="h27-btn" onclick="window.btFullBackupExport?btFullBackupExport('health-dashboard'):alert('Backup module not loaded yet')">Backup Now</button>
        </div>
        <div class="h27-panel"><h3>Analyzer Health</h3>
          <div class="h27-line"><b>Self-test:</b> ${esc(selfTestStatus)}</div>
          <div class="h27-line"><b>Saved T&C samples:</b> ${h.tcs.length}</div>
          <div class="h27-line"><b>Conflicts:</b> ${h.tcConflict.length}</div>
          <button class="h27-btn alt" onclick="window.tcV31OpenProfileLibrary&&tcV31OpenProfileLibrary();setTimeout(()=>window.tcV31RunAndShowSelfTest&&tcV31RunAndShowSelfTest(),200)">Run Self-Test</button>
        </div>
      </div>
      <div class="h27-panel"><h3>Ready / Coming Up</h3>
        ${listRows(h.ready,'No banks ready to churn right now.',x=>`<div class="h27-issue good"><b>${esc(x.bank)}</b><span>Ready to churn now</span></div>`)}
        ${listRows(h.churnSoon,'No churn dates within 30 days.',x=>`<div class="h27-issue warn"><b>${esc(x.bank)}</b><span>${daysToChurn(x)} day(s) until churn window</span></div>`)}
      </div>
      <div class="h27-panel"><h3>Needs Attention</h3>
        ${listRows(h.overdueTimers,'No overdue mini timers.',x=>`<div class="h27-issue bad"><b>${esc(x.bank)}</b><span>${esc(x.text)} overdue by ${Math.abs(x.days)}d</span></div>`)}
        ${listRows(h.dueSoonTimers,'No timers due in the next 7 days.',x=>`<div class="h27-issue warn"><b>${esc(x.bank)}</b><span>${esc(x.text)} due in ${x.days}d</span></div>`)}
      </div>
      <div class="h27-panel"><h3>Missing Data Checks</h3>
        ${listRows(h.missingChurn,'No closed banks missing churn rules.',x=>`<div class="h27-issue warn"><b>${esc(x.bank)}</b><span>Closed but missing churn rule</span></div>`)}
        ${listRows(h.missingOpened,'No active banks missing opened date.',x=>`<div class="h27-issue warn"><b>${esc(x.bank)}</b><span>Missing opened date</span></div>`)}
        ${listRows(h.missingClosed,'No bonus-received banks missing closed date.',x=>`<div class="h27-issue warn"><b>${esc(x.bank)}</b><span>Bonus received but no closed date</span></div>`)}
      </div>
    </section>`;
  }

  function looksLikeHealthTab(){
    const bodyText=(document.body.textContent||'').toLowerCase();
    const active=Array.from(document.querySelectorAll('button,a,[role="button"],.active,.sel,.selected')).map(x=>(x.textContent||'').trim().toLowerCase()).join(' | ');
    return (/health/.test(active)||/data health|fix first|everything looks good|app safety dashboard/i.test(bodyText))&&!/t&c learning inbox|saved bank profiles|tools folder/i.test(bodyText);
  }
  function hideOldHealthCards(){
    if(!looksLikeHealthTab())return;
    Array.from(document.querySelectorAll('#app > *')).forEach(el=>{
      if(el.id==='bt_health_dashboard_327')return;
      const txt=(el.textContent||'').toLowerCase();
      if(/data health|fix first|review|everything looks good|no major tracker issues/.test(txt)) el.style.display='none';
    });
  }
  function mount(){
    bumpBadge();
    if(!looksLikeHealthTab()){document.getElementById('bt_health_dashboard_327')?.remove();return;}
    const target=document.getElementById('app')||document.body;
    let old=document.getElementById('bt_health_dashboard_327');
    if(old) old.outerHTML=renderHealthDashboard();
    else {
      const wrap=document.createElement('div');wrap.innerHTML=renderHealthDashboard();
      const node=wrap.firstElementChild;
      const first=target.firstElementChild;
      if(first)target.insertBefore(node,first); else target.appendChild(node);
    }
    hideOldHealthCards();
  }
  function style(){
    if(document.getElementById('h27_style'))return;
    const st=document.createElement('style');st.id='h27_style';st.textContent=`
      .h27-card{margin:12px 12px 16px;padding:14px;border-radius:24px;background:linear-gradient(180deg,#f8fafc,#eef2ff);border:1px solid rgba(148,163,184,.25);box-shadow:0 14px 40px rgba(15,23,42,.08);font-family:'DM Sans',system-ui;color:#0f172a}.h27-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.h27-head h2{margin:0;font-size:20px;letter-spacing:-.3px}.h27-head p{margin:3px 0 0;font-size:12px;color:#64748b;line-height:1.3}.h27-pill{padding:6px 9px;border-radius:999px;font-size:10px;font-weight:900;white-space:nowrap}.h27-pill.ok{background:#dcfce7;color:#166534}.h27-pill.warn{background:#fef3c7;color:#92400e}.h27-pill.bad{background:#fee2e2;color:#991b1b}.h27-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.h27-metric{background:#fff;border:1px solid rgba(226,232,240,.95);border-radius:16px;padding:11px 10px}.h27-metric b{display:block;font-size:19px;line-height:1}.h27-metric span{display:block;margin-top:5px;font-size:10px;color:#64748b;font-weight:800}.h27-metric.good{background:#ecfdf5;border-color:#bbf7d0}.h27-metric.warn{background:#fffbeb;border-color:#fde68a}.h27-metric.bad{background:#fef2f2;border-color:#fecaca}.h27-two{display:grid;grid-template-columns:1fr 1fr;gap:9px}.h27-panel{background:#fff;border:1px solid rgba(226,232,240,.95);border-radius:18px;padding:12px;margin-top:9px}.h27-panel h3{margin:0 0 8px;font-size:14px}.h27-line{font-size:12px;color:#475569;margin:5px 0;line-height:1.35}.h27-btn{width:100%;border:0;border-radius:14px;background:#0f172a;color:#fff;font-weight:900;padding:10px;margin-top:9px}.h27-btn.alt{background:#2563eb}.h27-muted{font-size:12px;color:#94a3b8;padding:6px 0}.h27-issue{display:flex;align-items:center;justify-content:space-between;gap:10px;border-radius:13px;padding:8px 9px;margin:6px 0;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0}.h27-issue b{font-size:12px}.h27-issue span{color:#64748b;text-align:right}.h27-issue.good{background:#ecfdf5;border-color:#bbf7d0}.h27-issue.warn{background:#fffbeb;border-color:#fde68a}.h27-issue.bad{background:#fef2f2;border-color:#fecaca}@media(max-width:430px){.h27-card{margin:10px 10px 14px;padding:12px;border-radius:22px}.h27-grid{grid-template-columns:repeat(2,1fr)}.h27-two{grid-template-columns:1fr}.h27-head h2{font-size:18px}.h27-issue{align-items:flex-start;flex-direction:column}.h27-issue span{text-align:left}}
    `;document.head.appendChild(st);
  }
  function boot(){style();mount();}

  window.btHealthDashboardPolishVersion=VER;
  window.btHealthDashboardAnalyze=analyzeHealth;
  window.btHealthDashboardRefresh=mount;
  setTimeout(boot,250);setTimeout(boot,900);setTimeout(boot,1800);setTimeout(boot,3200);setInterval(mount,2000);
})();
