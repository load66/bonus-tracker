/*
 * filename: scripts/tc-issue-reporter.js
 * version: 2.12.0
 * purpose: Analyzer Issue Reporter. Copies missing/error reports for continuous improvement.
 * last-touched: unknown
 */
(function(){
  const VER='2.12.0';
  const LOG_KEY='bt_issue_reporter_logs_v1';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const limit=(s,n=14000)=>String(s||'').length>n?String(s||'').slice(0,n)+'\n...[truncated]':String(s||'');

  function getLogs(){try{return JSON.parse(localStorage.getItem(LOG_KEY)||'[]')}catch{return[]}}
  function setLogs(logs){try{localStorage.setItem(LOG_KEY,JSON.stringify(logs.slice(0,25)))}catch{}}
  function pushLog(type,msg,extra){const logs=getLogs();logs.unshift({type,msg:clean(msg),extra:extra||'',time:new Date().toISOString(),url:location.href,version:VER});setLogs(logs)}

  window.addEventListener('error',e=>pushLog('js-error',e.message||'Unknown JS error',{file:e.filename,line:e.lineno,col:e.colno}),true);
  window.addEventListener('unhandledrejection',e=>pushLog('promise-error',e.reason?.message||String(e.reason||'Unknown promise rejection')),true);

  function appVersion(){return clean(document.querySelector('.app-version')?.textContent||'unknown')}
  function rawTerms(){
    const direct=document.getElementById('tca_raw')?.value||'';
    if(direct.length>150)return direct;
    const saved=window.tcGetSavedSource?.()?.raw||window.__btLastTcSource?.raw||'';
    if(saved.length>150)return saved;
    const areas=Array.from(document.querySelectorAll('textarea')).map(a=>a.value||'').filter(v=>/bonus|qualifying|direct deposit|monthly fee|offer|promo|checking|terms/i.test(v));
    areas.sort((a,b)=>b.length-a.length);
    return areas[0]||'';
  }
  function analyzeNow(){
    const raw=rawTerms();
    let result=null;
    try{result=typeof tcUnifiedAnalyze==='function'?tcUnifiedAnalyze(raw):null;}catch(err){pushLog('analyze-error',err.message||String(err));}
    return {raw,result};
  }
  function missingFields(r,raw){
    const missing=[];
    if(!r)return ['Analyzer result missing'];
    if(!r.bonus)missing.push('Bonus amount');
    if(/direct deposit|qualifying deposit|electronic deposit/i.test(raw||'')&&!r.reqDays)missing.push('Requirement deadline days');
    if(/direct deposit|qualifying deposit|totaling|deposit/i.test(raw||'')&&!r.reqMoney&&!r.tiered)missing.push('Deposit requirement amount');
    if(/promo code|promotional code|offer code/i.test(raw||'')&&!r.code&&!r.promoCode?.value)missing.push('Promo code exact value');
    if(/open.*by|through and including|offer expires|offer ends|valid through/i.test(raw||'')&&!r.openBy)missing.push('Promo expiration / open-by date');
    if(/monthly.*fee|maintenance fee|service fee/i.test(raw||'')&&!r.fee&&!(r.waivers||[]).length)missing.push('Monthly fee / waiver information');
    if(/not considered|do not count|not constitute|person-to-person|Zelle|wire|mobile deposit/i.test(raw||'')&&!(r.not||r.notCounts||[]).length)missing.push('Does-not-count exclusions');
    return missing;
  }
  function hasIssue(r,raw){
    if(!r)return true;
    if((r.reviewFlags||[]).length)return true;
    if(missingFields(r,raw).length)return true;
    if((getLogs()||[]).length)return true;
    return false;
  }
  function buildReport(){
    const {raw,result:r}=analyzeNow();
    const miss=missingFields(r,raw);
    const logs=getLogs();
    const lines=[];
    lines.push('BANK BONUS TRACKER — ANALYZER ISSUE REPORT');
    lines.push('');
    lines.push('App Version: '+appVersion());
    lines.push('Reporter Version: '+VER);
    lines.push('Unified Engine: '+(window.tcUnifiedVersion||'unknown'));
    lines.push('Bank Profiles: '+(window.tcBankProfilesVersion||'unknown'));
    lines.push('Conflict Detector: '+(window.tcConflictDetectorVersion||'unknown'));
    lines.push('Learning Memory: '+(window.tcLearningMemoryVersion||'unknown'));
    lines.push('Time: '+new Date().toISOString());
    lines.push('');
    if(r){
      lines.push('PARSED RESULT');
      lines.push('Bank: '+(r.bank||'Review'));
      lines.push('Account: '+(r.acct||'Review'));
      lines.push('Bonus: '+(r.bonus||'Review'));
      lines.push('Tiered: '+(r.tiered?'Yes':'No'));
      if(r.bonusTierText)lines.push('Tiers: '+r.bonusTierText);
      lines.push('Promo Code: '+(r.code||r.promoCode?.value||'Review'));
      lines.push('Promo Expiration/Open-by: '+(r.openBy||'Review'));
      lines.push('Requirement Days: '+(r.reqDays||'Review'));
      lines.push('Requirement Amount: '+(r.reqMoney||'Review'));
      lines.push('Funding Days: '+(r.fundedDays||'—'));
      lines.push('Funding Amount: '+(r.fundingAmount||'—'));
      lines.push('Monthly Fee: '+(r.fee||'Review/None'));
      lines.push('What Counts: '+((r.counts||[]).join(' | ')||'Review'));
      lines.push('Does Not Count: '+((r.not||r.notCounts||[]).join(' | ')||'Review'));
      lines.push('Eligibility/Churn: '+(r.eligibilityText||r.eligibility?.value||'Review'));
      lines.push('');
    }
    lines.push('MISSING / NEEDS REVIEW');
    lines.push(miss.length?miss.map(x=>'- '+x).join('\n'):'- None detected');
    lines.push('');
    lines.push('REVIEW FLAGS');
    lines.push(r?.reviewFlags?.length?r.reviewFlags.map(x=>'- '+x).join('\n'):'- None');
    lines.push('');
    lines.push('RECENT ERROR LOGS');
    lines.push(logs.length?logs.slice(0,8).map(x=>`- ${x.time} | ${x.type}: ${x.msg}`).join('\n'):'- None');
    lines.push('');
    lines.push('FULL T&C SOURCE');
    lines.push(limit(raw||'No source found'));
    return lines.join('\n');
  }
  function copyText(txt){
    if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(txt);
    const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();return Promise.resolve();
  }
  window.tcCopyIssueReport=function(){
    const report=buildReport();
    return copyText(report).then(()=>alert('Analyzer issue report copied. Send it to me and I can improve the engine.')).catch(()=>alert(report));
  };
  window.tcIssueReporterStatus=function(){const {raw,result}=analyzeNow();return{version:VER,hasIssue:hasIssue(result,raw),missing:missingFields(result,raw),logs:getLogs().length,sourceLength:raw.length};};
  window.tcClearIssueLogs=function(){localStorage.removeItem(LOG_KEY);return true;};

  function injectButton(){
    const box=document.querySelector('#tca_overlay .tca-box');
    if(!box||box.querySelector('#tc_issue_report_btn'))return;
    const {raw,result}=analyzeNow();
    if(!hasIssue(result,raw))return;
    const btn=document.createElement('button');
    btn.id='tc_issue_report_btn';
    btn.type='button';
    btn.className='c-c';
    btn.textContent='🧾 Copy Issue Report';
    btn.style.cssText='width:100%;margin-top:8px;min-height:44px;border-radius:14px;font-weight:900;background:#FFF7ED;border-color:#FDBA74;color:#9A3412';
    btn.onclick=function(e){e.preventDefault();e.stopPropagation();window.tcCopyIssueReport();};
    const actions=Array.from(box.querySelectorAll('.crow')).pop()||box;
    actions.insertAdjacentElement('afterend',btn);
  }
  document.addEventListener('click',()=>setTimeout(injectButton,180),true);
  const oldRunTimer=()=>{setTimeout(injectButton,250);setTimeout(injectButton,800);};
  setInterval(()=>{if(document.getElementById('tca_overlay'))injectButton();},1800);
  setTimeout(oldRunTimer,1000);
})();