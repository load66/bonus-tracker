/* Owner-only immutable Cloudflare R2 historical T&C archive. No account restores or mutations. */
(function(){
'use strict';
const API='https://api-production-00f74.up.railway.app/api/bonus-tracker/terms';
const uploaded=new Set();
let inFlight=null,panel=null,notice='',verified=0,pending=0,debounce=null;
const core=window.BTTermsCore;
function escapeHtml(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function connected(){return !!window.BTBonusAuth?.connected?.()}
async function request(path='',options={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
 const send=token=>fetch(API+path,{...options,cache:'no-store',credentials:'omit',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},signal:controller.signal});
 try{
  let response=await send(await window.BTBonusAuth.token());
  if(response.status===401)response=await send(await window.BTBonusAuth.token(true));
  const data=await response.json();
  if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Historical terms cloud request failed.');
  return data;
 }finally{clearTimeout(timeout)}
}
function sources(){
 const rows=typeof entries!=='undefined'&&Array.isArray(entries)?entries:[];
 const archived=typeof loadTermsArchive==='function'?loadTermsArchive():{};
 return core.collect(rows,archived);
}
async function sync(){
 if(inFlight)return inFlight;
 if(!connected())throw Error('Sign in to cloud recovery to preserve historical terms.');
 if(navigator.onLine===false)throw Error('Historical terms upload needs an internet connection.');
 inFlight=(async()=>{
  const all=sources();pending=all.length;let failed=0,count=0;
  try{
   for(const snapshot of all){
    const sha256=await window.BTCloudCore.digest(snapshot);
    if(uploaded.has(sha256)){pending--;continue}
    try{
     const answer=await request('',{method:'POST',body:JSON.stringify({sha256,snapshot})});
     if(answer.verified!==true||answer.sha256!==sha256||answer.id!==sha256)throw Error('Historical terms readback failed.');
     uploaded.add(sha256);count++;
    }catch{failed++}
    pending--;
   }
   verified=uploaded.size;
   notice=failed?(failed+' historical terms version'+(failed===1?'':'s')+' could not be verified. Retry while signed in.'):(all.length?'Historical terms verified in Cloudflare R2.':'No saved offer terms available to archive.');
   drawStatus();
   return{verified:count,failed,total:all.length};
  }finally{inFlight=null}
 })();
 return inFlight;
}
function queueSync(){
 // An authenticated archive upload is independent of optional rolling backups.
 // Coalesce rapid fee/terms edits; offline/unauthenticated changes remain local.
 if(!connected()||navigator.onLine===false)return;
 clearTimeout(debounce);
 debounce=setTimeout(()=>{debounce=null;sync().catch(()=>{});},2000);
}
function drawStatus(){
 if(!panel)return;
 const el=panel.querySelector('#bt-terms-cloud-status');
 if(el)el.textContent=notice||(inFlight?'Verifying historical terms…':verified?verified+' archived versions verified in this session':'Historical terms are not yet verified in this session.');
 const b=panel.querySelector('#bt-terms-cloud-sync');if(b)b.disabled=!!inFlight||!connected();
}
function close(){panel?.remove();panel=null}
async function list(){
 const results=[];let offset=0;
 for(let page=0;page<200;page++){
  const data=await request('?offset='+offset);
  results.push(...(data.terms||[]));
  if(data.nextOffset===null||data.nextOffset===undefined)break;
  offset=data.nextOffset;
 }
 return results;
}
async function readRecord(id){
 if(!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid archived terms identity.');
 const result=await request('/'+id);
 const digest=await window.BTCloudCore.digest(result.snapshot);
 if(!result.verified||digest!==id||result.sha256!==id)throw Error('Archived terms integrity check failed.');
 return JSON.parse(result.snapshot);
}
async function reloadList(){
 if(!panel)return;
 const holder=panel.querySelector('#bt-terms-cloud-list');
 holder.textContent='Loading your verified historical snapshots…';
 try{
  const records=await list();
  holder.textContent='';
  if(!records.length){holder.textContent='No immutable historical terms uploaded yet.';return}
  const count=document.createElement('p');count.textContent=records.length+' historical version'+(records.length===1?'':'s')+' in Cloudflare R2';holder.appendChild(count);
  for(const item of records){
   const button=document.createElement('button');button.type='button';button.className='bt-terms-cloud-row';
   button.textContent=[item.bank,item.accountType,item.opened||'Opening date not saved'].filter(Boolean).join(' · ');
   button.onclick=async()=>{
    button.disabled=true;const viewer=panel?.querySelector('#bt-terms-cloud-detail');if(viewer)viewer.textContent='Verifying saved terms…';
    try{
     const detail=await readRecord(item.id);
     if(viewer){
      viewer.replaceChildren();
      const title=document.createElement('h3');title.textContent=detail.bank+' · '+(detail.opened||'Historical offer');viewer.appendChild(title);
      const info=document.createElement('p');info.textContent='Immutable owner-scoped snapshot. Original evidence and structured terms; no current offer substitutions.';viewer.appendChild(info);
      const text=document.createElement('pre');text.textContent=JSON.stringify(detail,null,2);viewer.appendChild(text);
     }
    }catch(error){if(viewer)viewer.textContent=error.message}
    finally{button.disabled=false}
   };
   holder.appendChild(button);
  }
 }catch(error){holder.textContent=error.message}
}
function open(){
 close();
 panel=document.createElement('div');panel.className='bt-terms-cloud-backdrop';
 panel.innerHTML='<section class="bt-terms-cloud-sheet" role="dialog" aria-modal="true" aria-label="Historical T and C in cloud">'
  +'<header><h2>Historical T&C cloud archive</h2><button type="button" id="bt-terms-cloud-close" aria-label="Close">×</button></header>'
  +'<p>Each saved bank offer version is preserved in Cloudflare R2 independently of rolling recovery backups. Cloud copies never rewrite enrolled accounts or eligibility rules.</p>'
  +'<div class="bt-terms-cloud-actions"><button type="button" id="bt-terms-cloud-sync">Save current & past terms</button><button type="button" id="bt-terms-cloud-refresh">Refresh archive</button></div>'
  +'<p id="bt-terms-cloud-status" role="status"></p><div id="bt-terms-cloud-list"></div><div id="bt-terms-cloud-detail"></div>'
  +'</section>';
 panel.onclick=e=>{if(e.target===panel)close()};
 document.body.appendChild(panel);
 panel.querySelector('#bt-terms-cloud-close').onclick=close;
 panel.querySelector('#bt-terms-cloud-sync').onclick=async()=>{try{notice='Saving historical terms…';drawStatus();await sync();await reloadList()}catch(e){notice=e.message;drawStatus()}};
 panel.querySelector('#bt-terms-cloud-refresh').onclick=reloadList;
 drawStatus();
 if(!connected()){
  notice='Sign in through Cloud backup & recovery before accessing private historical terms.';
  drawStatus();panel.querySelector('#bt-terms-cloud-list').textContent=notice;
 }else reloadList();
 panel.querySelector('#bt-terms-cloud-close').focus();
}
window.BTTermsHistory={sync,queueSync,open,readRecord,list,get status(){return{verified,pending,notice}},collect:sources};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&panel){event.preventDefault();close()}});
window.addEventListener('online',queueSync);
setTimeout(queueSync,2500);
})();
