/*
 * filename: learning-inbox-conflict.js
 * version: 3.3.24
 * purpose: T&C Learning Inbox + softer profile cautions + fixed non-blinking caution banner.
 * last-touched: 2026-05-02
 */
(function(){
  const VER='3.3.24';
  const KEY='bt_tc_learning_inbox_v320';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const slug=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const esc=v=>{const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML};
  const money=n=>'$'+Number(n||0).toLocaleString();
  const now=()=>new Date().toISOString();
  const isTerms=v=>String(v||'').length>120&&/(bonus|offer|eligible|checking|direct deposit|deposit|monthly fee|promo|terms|conditions|reward|incentive)/i.test(v||'');
  function read(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}}
  function write(v){try{localStorage.setItem(KEY,JSON.stringify(v||[]));return true}catch{return false}}
  function id(){return 'tc_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)}
  function analyze(raw){return typeof window.tcV3Analyze==='function'?window.tcV3Analyze(raw,{noGlobalFallback:true}):null}
  function profileFor(r){return window.tcV32ProfileDB?.findForResult?r?window.tcV32ProfileDB.findForResult(r):null:null}
  function normVal(v){if(v==null)return '';if(typeof v==='string')return clean(v);return v}
  function fieldLabel(k){return ({bonus:'Bonus amount',reqMoney:'Requirement amount',reqDays:'Requirement days',fundedDays:'Funding days',holdDays:'Hold days',count:'Required count',code:'Promo code',openBy:'Open-by / expiration',fee:'Monthly fee',monthlyFee:'Monthly fee',payout:'Payout timing',fundingAmount:'Opening/funding amount'})[k]||k}
  function fmt(v){return typeof v==='number'&&v>=100?money(v):String(v)}
  function getOfferContext(raw){
    const txt=String(raw||'').toLowerCase();
    const markers=['bonus/account information','to receive the bonus','to earn the bonus','open a new','open an eligible','offer not available'];
    let start=-1;
    markers.forEach(m=>{const i=txt.indexOf(m);if(i>=0&&(start<0||i<start))start=i});
    return start>=0?txt.slice(start,Math.min(txt.length,start+2600)):txt.slice(0,2600);
  }
  function detectProductType(r){
    const raw=String(r?.normalizedRaw||r?.raw||'');
    const acct=String(r?.acct||'');
    const text=(acct+' '+raw).toLowerCase();
    const offer=getOfferContext(raw);
    const explicitPersonal=/chase\s+total\s+checking|chase\s+premier\s+plus\s+checking|chase\s+sapphire\s+checking|chase\s+private\s+client\s+checking|consumer\s+checking|personal\s+checking|advantage\s+personal\s+checking|smartly\s+checking|virtual\s+wallet/i.test(text);
    const explicitBusiness=/business\s+complete\s+checking|business\s+advantage\s+banking|basic\s+business\s+checking|enhanced\s+business\s+checking|small\s+business\s+checking|business\s+checking\s+bonus|open\s+(?:a|an|new)\s+[^.]{0,80}business\s+checking/i.test(offer);
    return {personal:explicitPersonal,business:explicitBusiness};
  }
  function profileMismatch(r,p){
    const hard=[];
    if(!r||!p)return hard;
    const bankA=slug(r.bank||'');
    const bankB=slug(p.bank||'');
    if(bankA&&bankB&&bankA!==bankB)hard.push({field:'profile',label:'Profile mismatch',expected:p.bank,actual:r.bank||'Unknown bank'});
    const profileIsBusiness=/business/i.test(p.type||p.product||p.id||'');
    const detected=detectProductType(r);
    if(profileIsBusiness&&detected.personal&&!detected.business){
      hard.push({field:'profile',label:'Profile type mismatch',expected:'Business profile: '+p.product,actual:'Personal/consumer offer detected'});
    }
    if(!profileIsBusiness&&detected.business&&!detected.personal){
      hard.push({field:'profile',label:'Profile type mismatch',expected:'Personal profile: '+p.product,actual:'Business offer detected'});
    }
    return hard;
  }
  function compareToProfile(r){
    const p=profileFor(r);
    if(!p)return {hasProfile:false,hasConflicts:false,hasCautions:true,hasMissing:false,profile:null,conflicts:[],cautions:[],missing:[],warnings:['No exact saved profile found yet. Review the parsed fields before using Auto-Fill.']};
    const conflicts=profileMismatch(r,p);
    const cautions=[];
    const missing=[];
    const warnings=[];
    const base=p.baseline||{};
    (p.critical||[]).forEach(k=>{
      const expected=normVal(base[k]);
      const actual=normVal(r?.[k]);
      if(expected===''||expected===0)return;
      if(actual===''||actual==null||actual===0){missing.push({field:k,label:fieldLabel(k),expected,actual,fixable:true});return;}
      if(String(actual)!==String(expected)){cautions.push({field:k,label:fieldLabel(k),expected,actual,fixable:true,reason:'Parsed value differs from saved profile. This is usually fixable after Auto-Fill.'});}
    });
    if((p.needs||[]).length)warnings.push('Saved profile has review items: '+p.needs.join(', '));
    const coreMissing=[];
    if(!r?.bank)coreMissing.push('bank');
    if(!r?.acct)coreMissing.push('account');
    if(!r?.bonus && !(p.needs||[]).some(x=>/bonus/i.test(x)))coreMissing.push('bonus');
    if(!r?.reqMoney&&!(p.needs||[]).some(x=>/direct deposit amount|requirement amount|coupon/i.test(x)))coreMissing.push('requirement amount');
    if(!r?.reqDays&&!r?.fundedDays&&!r?.holdDays)coreMissing.push('requirement days');
    if(!r?.payout)coreMissing.push('payout timing');
    if(coreMissing.length)warnings.push('Possible missing fields: '+coreMissing.join(', '));
    return {hasProfile:true,hasConflicts:conflicts.length>0,hasCautions:cautions.length>0||warnings.length>0,hasMissing:missing.length>0,profile:p,conflicts,cautions,missing,warnings};
  }
  function issueReport(item){
    const r=item?.analysis||{};
    const c=item?.conflict||compareToProfile(r);
    const status=c?.hasConflicts?'CONFLICT — PROFILE REVIEW NEEDED':((c?.hasCautions||c?.hasMissing)?'CAUTION — REVIEW / CORRECT IF NEEDED':'OK / NO CRITICAL CONFLICT');
    return ['BANK BONUS TRACKER — T&C LEARNING INBOX REPORT','Version: '+VER,'Saved: '+(item?.createdAt||now()),'Bank: '+(r.bank||item?.bank||'Review'),'Account: '+(r.acct||item?.product||'Review'),'Profile: '+(c?.profile?.id||'No exact saved profile'),'Status: '+status,'','PARSED:','Bonus: '+(r.bonus?money(r.bonus):'Review'),'Req Amount: '+(r.reqMoney?money(r.reqMoney):'Review'),'Req Days: '+(r.reqDays||'Review'),'Funding Days: '+(r.fundedDays||'—'),'Hold Days: '+(r.holdDays||'—'),'Count: '+(r.count||'—'),'Promo Code: '+(r.code||'Review'),'Payout: '+(r.payout||'Review'),'','HARD CONFLICTS:',...(c?.conflicts?.length?c.conflicts.map(x=>`- ${x.label}: expected ${fmt(x.expected)}, parsed ${fmt(x.actual)}`):['- None']),'','CAUTIONS — FIXABLE AFTER AUTO-FILL:',...(c?.cautions?.length?c.cautions.map(x=>`- ${x.label}: saved ${fmt(x.expected)} vs pasted ${fmt(x.actual)}`):['- None']),'','MISSING / WARNINGS:',...(c?.missing?.length?c.missing.map(x=>`- ${x.label}: saved profile expects ${fmt(x.expected)}, parsed blank`):['- None']),...(c?.warnings?.length?c.warnings.map(x=>`- ${x}`):[]),'','SOURCE T&C:',String(item?.raw||'').slice(0,18000)].join('\n');
  }
  function saveSample(raw,meta={}){
    raw=String(raw||'').trim();
    if(!isTerms(raw))return {ok:false,error:'Paste full T&C text first.'};
    const r=analyze(raw);
    if(!r)return {ok:false,error:'Analyzer is not loaded yet.'};
    const conflict=compareToProfile(r);
    const status=conflict.hasConflicts?'conflict':((conflict.hasMissing||conflict.hasCautions)?'review':'ok');
    const item={id:id(),createdAt:now(),updatedAt:now(),bank:meta.bank||r.bank||'',product:meta.product||r.acct||'',raw,analysis:r,conflict,status};
    const db=read();db.unshift(item);write(db.slice(0,100));
    window.__tcV32LastInboxItem=item;
    return {ok:true,item};
  }
  function health(){
    const h=window.tcV32ProfileDB?.health?window.tcV32ProfileDB.health():{total:0,saved:0,generic:0,needsReview:0,profiles:[]};
    const inbox=read();
    return {...h,inboxTotal:inbox.length,inboxConflicts:inbox.filter(x=>x.status==='conflict').length,inboxReview:inbox.filter(x=>x.status==='review').length,inboxOk:inbox.filter(x=>x.status==='ok').length};
  }
  function renderHealth(){
    const h=health();
    const review=(h.profiles||[]).filter(p=>(p.needs||[]).length||/review|flexible/i.test(p.status));
    return `<div class="v32-grid"><div class="v32-metric"><b>${h.total}</b><span>Profiles</span></div><div class="v32-metric"><b>${h.saved}</b><span>Saved</span></div><div class="v32-metric"><b>${h.generic}</b><span>Generic</span></div><div class="v32-metric ${h.needsReview?'warn':''}"><b>${h.needsReview}</b><span>Needs Review</span></div><div class="v32-metric"><b>${h.inboxTotal}</b><span>T&C Inbox</span></div><div class="v32-metric ${h.inboxConflicts?'bad':''}"><b>${h.inboxConflicts}</b><span>Hard Conflicts</span></div></div>`+`<div class="v32-card"><h4>Profiles needing review</h4>${review.length?review.map(p=>`<div class="v32-line"><b>${esc(p.bank)}</b> — ${esc((p.needs||[]).join(', ')||p.status)}</div>`).join(''):'<div class="v32-muted">No review items.</div>'}</div>`;
  }
  function statusBadge(s){return s==='conflict'?'<span class="v32-pill bad">Conflict</span>':s==='review'?'<span class="v32-pill warn">Caution</span>':'<span class="v32-pill ok">OK</span>'}
  function renderInbox(){
    const db=read();
    return `<div class="v32-card"><h4>Save new T&C sample</h4><input id="v32_bank" class="v32-input" placeholder="Bank name optional"><textarea id="v32_raw" class="v32-text" placeholder="Paste full bank bonus terms & conditions here..."></textarea><div class="v32-actions"><button onclick="tcV32SaveCurrentTC()">Save + Analyze</button><button onclick="tcV32UseVisibleTerms()">Grab Visible T&C</button></div><div id="v32_save_result"></div></div>`+`<div class="v32-card"><h4>Saved T&C samples</h4>${db.length?db.map(item=>`<div class="v32-item"><div class="v32-row"><b>${esc(item.analysis?.bank||item.bank||'Unknown bank')}</b>${statusBadge(item.status)}</div><div class="v32-small">${esc(item.analysis?.acct||item.product||'')} · ${new Date(item.createdAt).toLocaleDateString()}</div><div class="v32-small">Bonus ${item.analysis?.bonus?money(item.analysis.bonus):'Review'} · Req ${item.analysis?.reqMoney?money(item.analysis.reqMoney):'Review'} · Days ${item.analysis?.reqDays||item.analysis?.fundedDays||'Review'}</div>${item.conflict?.conflicts?.length?`<div class="v32-warn badline">${item.conflict.conflicts.length} hard profile conflict(s) found</div>`:''}${item.conflict?.cautions?.length?`<div class="v32-warn">${item.conflict.cautions.length} caution(s): review/correct after Auto-Fill</div>`:''}<div class="v32-actions mini"><button onclick="tcV32CopyItemReport('${item.id}')">Copy Report</button><button onclick="tcV32DeleteItem('${item.id}')">Delete</button></div></div>`).join(''):'<div class="v32-muted">No saved T&C samples yet.</div>'}</div>`;
  }
  function renderConflictCard(c){
    if(!c||(!c.hasConflicts&&!c.hasMissing&&!c.hasCautions&&!c.warnings?.length))return '';
    const level=c.hasConflicts?'bad':'warn';
    return `<div class="v32-conflict ${level}" data-tc-v32-banner="1"><b>${c.hasConflicts?'🚨 Profile conflict — verify before using':'⚠️ Caution — review/correct before using'}</b><div>${c.profile?esc(c.profile.bank+' · '+c.profile.product):'No exact saved profile found yet.'}</div>${c.conflicts?.length?`<ul>${c.conflicts.map(x=>`<li>${esc(x.label)}: expected ${esc(fmt(x.expected))}, parsed ${esc(fmt(x.actual))}</li>`).join('')}</ul>`:''}${c.cautions?.length?`<ul>${c.cautions.map(x=>`<li>${esc(x.label)}: saved ${esc(fmt(x.expected))} vs pasted ${esc(fmt(x.actual))} — editable after Auto-Fill</li>`).join('')}</ul>`:''}${c.missing?.length?`<ul>${c.missing.map(x=>`<li>${esc(x.label)} missing; saved profile expects ${esc(fmt(x.expected))} — fill manually if needed</li>`).join('')}</ul>`:''}${c.warnings?.length?`<div>${esc(c.warnings.join(' · '))}</div>`:''}</div>`;
  }
  function open(){
    document.getElementById('v32_overlay')?.remove();
    const d=document.createElement('div');d.id='v32_overlay';
    d.innerHTML=`<div class="v32-bg" onclick="tcV32Close()"><div class="v32-box" onclick="event.stopPropagation()"><div class="v32-row v32-title"><div><h3>T&C Learning Inbox</h3><div>Profile Health + Caution Review · v${VER}</div></div><button onclick="tcV32Close()" class="v32-x">×</button></div><div class="v32-actions"><button onclick="tcV32ShowHealth()">Health</button><button onclick="tcV32ShowInbox()">Inbox</button><button onclick="tcV31OpenProfileLibrary&&tcV31OpenProfileLibrary()">Profiles</button></div><div id="v32_content">${renderHealth()}</div></div></div>`;
    document.body.appendChild(d);
  }
  function showHealth(){const el=document.getElementById('v32_content');if(el)el.innerHTML=renderHealth()}
  function showInbox(){const el=document.getElementById('v32_content');if(el)el.innerHTML=renderInbox()}
  function saveFromUI(){
    const raw=document.getElementById('v32_raw')?.value||'';
    const bank=document.getElementById('v32_bank')?.value||'';
    const res=saveSample(raw,{bank});
    const out=document.getElementById('v32_save_result');
    if(out)out.innerHTML=res.ok?`<div class="v32-ok">Saved. Status: ${esc(res.item.status)}. ${res.item.conflict?.hasConflicts?'Hard conflict found — copy report if needed.':'Review any cautions, then correct fields manually if needed.'}</div>`:`<div class="v32-bad">${esc(res.error)}</div>`;
    setTimeout(showInbox,700);
  }
  function visibleTerms(){
    const tca=document.getElementById('tca_raw')?.value||'';if(isTerms(tca))return tca;
    const areas=Array.from(document.querySelectorAll('textarea')).map(a=>a.value||'').filter(isTerms).sort((a,b)=>b.length-a.length);return areas[0]||'';
  }
  function grabVisible(){
    const raw=visibleTerms();
    const ta=document.getElementById('v32_raw');
    if(ta)ta.value=raw;
    if(!raw)alert('No visible T&C text found. Paste it manually.');
  }
  function copyItemReport(id){const item=read().find(x=>x.id===id);if(!item)return;const txt=issueReport(item);navigator.clipboard?.writeText(txt).then(()=>alert('T&C report copied.')).catch(()=>alert(txt));}
  function del(id){write(read().filter(x=>x.id!==id));showInbox();}
  function addButton(){
    if(document.getElementById('v32_inbox_btn'))return;
    const b=document.createElement('button');b.id='v32_inbox_btn';b.type='button';b.textContent='T&C';b.onclick=open;document.body.appendChild(b);
  }
  function addStyle(){
    if(document.getElementById('v32_style'))return;
    const st=document.createElement('style');st.id='v32_style';st.textContent=`
      #v32_inbox_btn{position:fixed;left:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);z-index:140;border:1px solid rgba(255,255,255,.16);background:rgba(15,23,42,.78);color:white;border-radius:999px;padding:9px 12px;font:800 11px 'DM Sans',system-ui;letter-spacing:.2px;box-shadow:0 10px 30px rgba(0,0,0,.28);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
      .v32-bg{position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:10000;padding:calc(env(safe-area-inset-top,0px) + 14px) 12px calc(env(safe-area-inset-bottom,0px) + 14px);overflow:auto}.v32-box{max-width:660px;margin:0 auto;background:#f8fafc;color:#0f172a;border-radius:24px;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.42);font-family:'DM Sans',system-ui}.v32-row{display:flex;align-items:center;justify-content:space-between;gap:10px}.v32-title h3{margin:0;font-size:20px}.v32-title div div{font-size:12px;color:#64748b}.v32-x{border:0;background:#e2e8f0;border-radius:999px;width:34px;height:34px;font-size:22px;font-weight:900;color:#334155}.v32-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0}.v32-actions button{border:0;border-radius:14px;background:#0f172a;color:white;padding:11px 9px;font-weight:900;font-size:11px}.v32-actions.mini{grid-template-columns:1fr 1fr;margin:8px 0 0}.v32-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0}.v32-metric{background:white;border:1px solid #e2e8f0;border-radius:16px;padding:12px}.v32-metric b{display:block;font-size:20px}.v32-metric span{font-size:11px;color:#64748b;font-weight:800}.v32-metric.warn{background:#fffbeb;border-color:#fde68a}.v32-metric.bad{background:#fee2e2;border-color:#fecaca}.v32-card,.v32-item{background:white;border:1px solid #e2e8f0;border-radius:18px;padding:12px;margin:10px 0}.v32-card h4{margin:0 0 10px;font-size:15px}.v32-input,.v32-text{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:14px;padding:11px;margin:6px 0;font:500 13px 'DM Sans',system-ui}.v32-text{min-height:150px;line-height:1.4}.v32-pill{font-size:10px;padding:4px 8px;border-radius:999px;font-weight:900}.v32-pill.ok{background:#dcfce7;color:#166534}.v32-pill.warn{background:#fef3c7;color:#92400e}.v32-pill.bad{background:#fee2e2;color:#991b1b}.v32-small,.v32-line,.v32-muted{font-size:12px;color:#64748b;line-height:1.35;margin-top:5px}.v32-warn{font-size:12px;color:#92400e;background:#fffbeb;border-radius:10px;padding:6px;margin-top:6px}.v32-warn.badline{color:#991b1b;background:#fee2e2}.v32-ok{font-size:12px;color:#166534;background:#dcfce7;border-radius:12px;padding:8px;margin-top:8px}.v32-bad{font-size:12px;color:#991b1b;background:#fee2e2;border-radius:12px;padding:8px;margin-top:8px}.v32-conflict{margin:0 0 12px;padding:10px 12px;border-radius:14px;font-size:12px;line-height:1.35;color:#0f172a}.v32-conflict.bad{background:#fee2e2;border:1px solid #fecaca}.v32-conflict.warn{background:#fffbeb;border:1px solid #fde68a}.v32-conflict ul{margin:6px 0 0 18px;padding:0}@media(max-width:430px){.v32-actions,.v32-grid{grid-template-columns:1fr}.v32-box{border-radius:20px;padding:14px}#v32_inbox_btn{bottom:calc(env(safe-area-inset-bottom,0px) + 10px);left:10px}}
    `;document.head.appendChild(st);
  }
  function bannerKey(html){let h=0;for(let i=0;i<html.length;i++){h=((h<<5)-h)+html.charCodeAt(i);h|=0}return String(h)}
  function injectConflictBanner(){
    const r=window.__tcV32LastAnalysis;
    const c=r?.v32Conflict;
    const card=document.querySelector('[data-v3="true"]');
    if(!card)return;
    const html=c?renderConflictCard(c):'';
    const old=card.querySelector('.v32-conflict[data-tc-v32-banner="1"]')||card.querySelector('.v32-conflict');
    if(!html){if(old)old.remove();return;}
    const key=bannerKey(html);
    if(old&&old.dataset.tcV32Key===key)return;
    if(old){old.outerHTML=html;card.querySelector('.v32-conflict[data-tc-v32-banner="1"]')?.setAttribute('data-tc-v32-key',key);return;}
    card.insertAdjacentHTML('afterbegin',html);
    card.querySelector('.v32-conflict[data-tc-v32-banner="1"]')?.setAttribute('data-tc-v32-key',key);
  }
  function patchAnalyzer(){
    if(window.__tcV32AnalyzerWrapped)return;
    if(typeof window.tcV3Analyze!=='function')return;
    const base=window.tcV3Analyze;
    window.tcV3Analyze=function(raw,opts){
      const r=base(raw,opts);
      if(r){
        r.v32Conflict=compareToProfile(r);
        window.__tcV32LastAnalysis=r;
        setTimeout(injectConflictBanner,0);
        setTimeout(injectConflictBanner,80);
      }
      return r;
    };
    window.tcUnifiedAnalyze=window.tcV3Analyze;
    window.tcStrictAnalyze=window.tcV3Analyze;
    window.__tcV32AnalyzerWrapped=true;
  }
  window.tcV32OpenLearningInbox=open;window.tcV32Close=()=>document.getElementById('v32_overlay')?.remove();
  window.tcV32ShowHealth=showHealth;window.tcV32ShowInbox=showInbox;window.tcV32SaveCurrentTC=saveFromUI;window.tcV32UseVisibleTerms=grabVisible;
  window.tcV32SaveSample=saveSample;window.tcV32Inbox=read;window.tcV32CopyItemReport=copyItemReport;window.tcV32DeleteItem=del;
  window.tcV32CompareToProfile=compareToProfile;window.tcV32ProfileHealth=health;window.tcV32InboxReport=issueReport;window.tcV32LearningInboxVersion=VER;
  setTimeout(()=>{addStyle();addButton();patchAnalyzer();injectConflictBanner();},600);
  setTimeout(()=>{addStyle();addButton();patchAnalyzer();injectConflictBanner();},1800);
})();