/* Public discovery metadata only. Never reads or writes saved account data. */
(function(){
  'use strict';
  let feed=null,loading=false,error='',attempted=false;
  const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function valid(data){
    if(!data||data.schemaVersion!==1||!Number.isFinite(Date.parse(data.checkedAt))||!Array.isArray(data.offers)||data.offers.length>200)throw Error('Invalid feed');
    const now=Date.now();
    const offers=data.offers.filter(x=>x&&typeof x.title==='string'&&x.title.length<=300&&/^https:\/\/www\.doctorofcredit\.com\/[a-zA-Z0-9%_/-]+\/?$/.test(x.url)&&Number.isFinite(Date.parse(x.publishedAt))&&Date.parse(x.publishedAt)<=now);
    return {checkedAt:data.checkedAt,offers};
  }
  async function refresh(){
    if(loading)return;
    loading=true;attempted=true;error='';
    if(typeof R==='function')R();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch('./data/bank-bonuses.json',{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('Feed unavailable');
      feed=valid(await response.json());
    }catch{error='Could not check for updates. '+(feed?'Showing the last loaded feed.':'Reconnect to load the bank bonus feed.');}
    finally{clearTimeout(timeout);loading=false;if(typeof R==='function')R();}
  }
  window.btRefreshBankBonuses=refresh;
  window.rBankBonuses=function(){
    if(!attempted){attempted=true;setTimeout(refresh,0);}
    let h='<div class="sec">Bank Bonuses</div><section class="radar-intro"><h2>Discover your next bank bonus</h2><p>Automatically refreshed bank and credit-union deposit bonus posts. No credit cards, brokerage, or crypto offers.</p><p class="radar-notice">Discovery only: availability and eligibility are not verified. Check the bank’s official terms before applying. Your saved accounts and enrolled terms are never changed by this feed.</p>';
    h+='<div class="radar-toolbar"><span>'+(feed?'Source checked '+escape(new Date(feed.checkedAt).toLocaleString()):'Checking source feed…')+'</span><button type="button" class="ph-mini ph-save" onclick="btRefreshBankBonuses()" '+(loading?'disabled':'')+'>'+(loading?'Checking…':'Check updates')+'</button></div><p>Background checks are scheduled every 6 hours; delivery may be delayed. This is a recent-post feed, not a complete catalog of active offers.</p></section>';
    if(error)h+='<p role="status" class="radar-warning">'+escape(error)+'</p>';
    if(feed&&Date.now()-Date.parse(feed.checkedAt)>24*60*60*1000)h+='<p role="status" class="radar-warning">Updates are stale: the source has not been successfully checked in over 24 hours.</p>';
    if(!feed)return h+'<p role="status">'+(loading?'Loading bank bonus posts…':'Feed not loaded.')+'</p>';
    if(!feed.offers.length)return h+'<p>No qualifying bank bonus posts in the latest source feed.</p>';
    h+='<div class="radar-count">'+feed.offers.length+' recent bank bonus posts</div>';
    feed.offers.forEach(x=>{h+='<article class="radar-card"><span class="tag n">Terms need verification</span><h3>'+escape(x.title)+'</h3><p>Doctor of Credit · Posted '+escape(new Date(x.publishedAt).toLocaleDateString())+'</p><a class="pf-link" href="'+escape(x.url)+'" target="_blank" rel="noopener noreferrer">Read offer &amp; source details ↗</a></article>';});
    return h;
  };
  window.BTBankBonusFeed={validate:valid};
  // While the tab stays open, refresh the published snapshot without re-entering anything.
  const poll=setInterval(()=>{if(typeof tab!=='undefined'&&tab==='bonuses')refresh();},15*60*1000);
  if(poll&&typeof poll.unref==='function')poll.unref();
})();
