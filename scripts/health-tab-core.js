/* ✅ Version 3.3.0 Newest update: Permanent Health tab controller replacing old Data Health screen. */
(function(){
  const VER='3.3.0';
  const ENTRY_KEY='bt_e_v4';
  const TC_KEY='bt_tc_learning_inbox_v320';
  const BACKUP_KEY='bt_last_backup';
  const RESTORE_KEY='bt_last_restore';
  let applying=false;

  const esc=v=>{const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML};
  const safeParse=(v,d)=>{try{return JSON.parse(v)}catch{return d}};
  const today=()=>new Date().toISOString().split('T')[0];
  const dateOnly=v=>String(v||'').split('T')[0];
  const dB=(a,b)=>Math.floor((new Date(dateOnly(b)+'T00:00:00')-new Date(dateOnly(a)+'T00:00:00'))/86400000);
  const addD=(d,n)=>{const x=new Date(dateOnly(d)+'T00:00:00');x.setDate(x.getDate()+Number(n||0));return x.toISOString().split('T')[0]};
  const addM=(d,m)=>{const x=new Date(dateOnly(d)+'T00:00:00');x.setMonth(x.getMonth()+Number(m||0));return x.toISOString().split('T')[0]};
  const fD=d=>d?new Date(dateOnly(d)+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';

  function bumpBadge(){
    const b=document.querySelector('.app-version');
    if(b)b.textContent='v'+VER;
    window.btVisibleAppVersion=VER;
  }
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
    entries.forEach(e=>activeTimers(e).forEach(t=>{
      const d=timerDays(t);
      if(d===null)return;
      const row={bank:e.bank,text:t.text||'Timer',days:d,date:t.date};
      if(d<0)overdueTimers.push(row); else if(d<=7)dueSoonTimers.push(row);
    }));
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

  function metric(label,value,cls=''){return `<div class="hcore-metric ${cls}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;}
  function listRows(rows,empty,fmt){return rows.length?issueLimit(rows).map(fmt).join('')+(rows.length>8?`<div class="hcore-muted">+${rows.length-8} more</div>`:''):`<div class="hcore-muted">${esc(empty)}</div>`;}
  function dashboardHtml(){
    const h=analyzeHealth();
    const cls=h.severity==='bad'?'bad':h.severity==='warn'?'warn':'ok';
    const selfTest=window.__tcV31LastSelfTest?((window.__tcV31LastSelfTest.failed||0)===0?'PASS':'NEEDS FIX'):'Not run this session';
    return `<section id="bt_health_core" class="hcore-card">
      <div class="hcore-head">
        <div><h2>App Safety Dashboard</h2><p>Backup, churn, timers, analyzer, and missing-data checks.</p></div>
        <span class="hcore-pill ${cls}">${esc(h.backupStatus)}</span>
      </div>
      <div class="hcore-grid">
        ${metric('Total banks',h.entries.length)}
        ${metric('Active',h.active.length)}
        ${metric('Closed',h.closed.length)}
        ${metric('Ready to churn',h.ready.length,h.ready.length?'good':'')}
        ${metric('Overdue timers',h.overdueTimers.length,h.overdueTimers.length?'bad':'')}
        ${metric('T&C review',h.tcReview.length+h.tcConflict.length,(h.tcReview.length+h.tcConflict.length)?'warn':'')}
      </div>
      <div class="hcore-two">
        <div class="hcore-panel"><h3>Backup Health</h3>
          <div class="hcore-line"><b>Last backup:</b> ${h.lastBackup?esc(fD(h.lastBackup)):'Never'}</div>
          <div class="hcore-line"><b>Backup age:</b> ${h.lastBackup?(h.backupAge+' day(s) ago'):'No backup found'}</div>
          <div class="hcore-line"><b>Last restore:</b> ${h.lastRestore?esc(new Date(h.lastRestore).toLocaleString()):'—'}</div>
          <button class="hcore-btn" onclick="window.btFullBackupExport?btFullBackupExport('health-dashboard'):alert('Backup module not loaded yet')">Backup Now</button>
        </div>
        <div class="hcore-panel"><h3>Analyzer Health</h3>
          <div class="hcore-line"><b>Self-test:</b> ${esc(selfTest)}</div>
          <div class="hcore-line"><b>Saved T&C samples:</b> ${h.tcs.length}</div>
          <div class="hcore-line"><b>Conflicts:</b> ${h.tcConflict.length}</div>
          <button class="hcore-btn alt" onclick="window.tcV31OpenProfileLibrary&&tcV31OpenProfileLibrary();setTimeout(()=>window.tcV31RunAndShowSelfTest&&tcV31RunAndShowSelfTest(),200)">Run Self-Test</button>
        </div>
      </div>
      <div class="hcore-panel"><h3>Ready / Coming Up</h3>
        ${listRows(h.ready,'No banks ready to churn right now.',x=>`<div class="hcore-issue good"><b>${esc(x.bank)}</b><span>Ready to churn now</span></div>`)}
        ${listRows(h.churnSoon,'No churn dates within 30 days.',x=>`<div class="hcore-issue warn"><b>${esc(x.bank)}</b><span>${daysToChurn(x)} day(s) until churn window</span></div>`)}
      </div>
      <div class="hcore-panel"><h3>Needs Attention</h3>
        ${listRows(h.overdueTimers,'No overdue mini timers.',x=>`<div class="hcore-issue bad"><b>${esc(x.bank)}</b><span>${esc(x.text)} overdue by ${Math.abs(x.days)}d</span></div>`)}
        ${listRows(h.dueSoonTimers,'No timers due in the next 7 days.',x=>`<div class="hcore-issue warn"><b>${esc(x.bank)}</b><span>${esc(x.text)} due in ${x.days}d</span></div>`)}
      </div>
      <div class="hcore-panel"><h3>Missing Data Checks</h3>
        ${listRows(h.missingChurn,'No closed banks missing churn rules.',x=>`<div class="hcore-issue warn"><b>${esc(x.bank)}</b><span>Closed but missing churn rule</span></div>`)}
        ${listRows(h.missingOpened,'No active banks missing opened date.',x=>`<div class="hcore-issue warn"><b>${esc(x.bank)}</b><span>Missing opened date</span></div>`)}
        ${listRows(h.missingClosed,'No bonus-received banks missing closed date.',x=>`<div class="hcore-issue warn"><b>${esc(x.bank)}</b><span>Bonus received but no closed date</span></div>`)}
      </div>
    </section>`;
  }

  function isHealthScreen(){
    const txt=(document.body.textContent||'').toLowerCase();
    if(/t&c learning inbox|saved bank profiles|tools folder/.test(txt))return false;
    if(/data health|fix first|everything looks good|app safety dashboard/.test(txt))return true;
    const active=Array.from(document.querySelectorAll('button,a,[role="button"],.active,.sel,.selected')).map(x=>(x.textContent||'').trim().toLowerCase()).join(' ');
    return /health/.test(active);
  }
  function findOldHealthRoot(){
    const app=document.getElementById('app');
    if(!app)return null;
    const nodes=Array.from(app.querySelectorAll('section,main,div'));
    const candidates=nodes.filter(el=>{
      if(el.id==='bt_health_core'||el.closest('#bt_health_core'))return false;
      const text=(el.textContent||'').toLowerCase();
      if(!/data health|everything looks good|fix first/.test(text))return false;
      const r=el.getBoundingClientRect();
      if(r.width<100||r.height<40)return false;
      if(/tracker\s+tax\s+datapoints\s+phone\s+health/.test(text)&&r.height>window.innerHeight*.75)return false;
      return true;
    }).sort((a,b)=>{
      const ar=a.getBoundingClientRect(), br=b.getBoundingClientRect();
      return (ar.width*ar.height)-(br.width*br.height);
    });
    const both=candidates.filter(el=>{const t=(el.textContent||'').toLowerCase();return /data health/.test(t)&&/everything looks good|fix first/.test(t);});
    return both[0]||candidates[0]||null;
  }
  function applyHealth(){
    if(applying)return;
    applying=true;
    try{
      bumpBadge();
      if(!isHealthScreen()){
        document.body.classList.remove('bt-health-core-active');
        return;
      }
      document.body.classList.add('bt-health-core-active');
      const root=findOldHealthRoot();
      if(root){
        root.innerHTML=dashboardHtml();
        root.dataset.btHealthCoreRoot='1';
        root.style.display='block';
      }else{
        let mount=document.getElementById('bt_health_core_mount');
        if(!mount){
          mount=document.createElement('div');
          mount.id='bt_health_core_mount';
          const app=document.getElementById('app')||document.body;
          app.insertBefore(mount,app.firstChild||null);
        }
        mount.innerHTML=dashboardHtml();
      }
    }finally{
      setTimeout(()=>{applying=false},30);
    }
  }
  function style(){
    if(document.getElementById('hcore_style'))return;
    const st=document.createElement('style');
    st.id='hcore_style';
    st.textContent=`
      .hcore-card{margin:12px 12px 16px;padding:14px;border-radius:24px;background:linear-gradient(180deg,#f8fafc,#eef2ff);border:1px solid rgba(148,163,184,.25);box-shadow:0 14px 40px rgba(15,23,42,.08);font-family:'DM Sans',system-ui;color:#0f172a}.hcore-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.hcore-head h2{margin:0;font-size:20px;letter-spacing:-.3px}.hcore-head p{margin:3px 0 0;font-size:12px;color:#64748b;line-height:1.3}.hcore-pill{padding:6px 9px;border-radius:999px;font-size:10px;font-weight:900;white-space:nowrap}.hcore-pill.ok{background:#dcfce7;color:#166534}.hcore-pill.warn{background:#fef3c7;color:#92400e}.hcore-pill.bad{background:#fee2e2;color:#991b1b}.hcore-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.hcore-metric{background:#fff;border:1px solid rgba(226,232,240,.95);border-radius:16px;padding:11px 10px}.hcore-metric b{display:block;font-size:19px;line-height:1}.hcore-metric span{display:block;margin-top:5px;font-size:10px;color:#64748b;font-weight:800}.hcore-metric.good{background:#ecfdf5;border-color:#bbf7d0}.hcore-metric.warn{background:#fffbeb;border-color:#fde68a}.hcore-metric.bad{background:#fef2f2;border-color:#fecaca}.hcore-two{display:grid;grid-template-columns:1fr 1fr;gap:9px}.hcore-panel{background:#fff;border:1px solid rgba(226,232,240,.95);border-radius:18px;padding:12px;margin-top:9px}.hcore-panel h3{margin:0 0 8px;font-size:14px}.hcore-line{font-size:12px;color:#475569;margin:5px 0;line-height:1.35}.hcore-btn{width:100%;border:0;border-radius:14px;background:#0f172a;color:#fff;font-weight:900;padding:10px;margin-top:9px}.hcore-btn.alt{background:#2563eb}.hcore-muted{font-size:12px;color:#94a3b8;padding:6px 0}.hcore-issue{display:flex;align-items:center;justify-content:space-between;gap:10px;border-radius:13px;padding:8px 9px;margin:6px 0;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0}.hcore-issue b{font-size:12px}.hcore-issue span{color:#64748b;text-align:right}.hcore-issue.good{background:#ecfdf5;border-color:#bbf7d0}.hcore-issue.warn{background:#fffbeb;border-color:#fde68a}.hcore-issue.bad{background:#fef2f2;border-color:#fecaca}@media(max-width:430px){.hcore-card{margin:10px 10px 14px;padding:12px;border-radius:22px}.hcore-grid{grid-template-columns:repeat(2,1fr)}.hcore-two{grid-template-columns:1fr}.hcore-head h2{font-size:18px}.hcore-issue{align-items:flex-start;flex-direction:column}.hcore-issue span{text-align:left}}
    `;
    document.head.appendChild(st);
  }
  function boot(){style();applyHealth();}

  window.btHealthCoreVersion=VER;
  window.btHealthCoreAnalyze=analyzeHealth;
  window.btHealthCoreRefresh=applyHealth;

  setTimeout(boot,100);
  setTimeout(boot,600);
  setTimeout(boot,1400);
  setTimeout(boot,3000);
  setInterval(applyHealth,900);
  const obs=new MutationObserver(()=>{if(!applying)setTimeout(applyHealth,0)});
  setTimeout(()=>{try{obs.observe(document.getElementById('app')||document.body,{childList:true,subtree:true})}catch{}},300);
})();
