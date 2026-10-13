/* Public discovery metadata only. Never reads or writes saved account data. */
(function(){
  'use strict';
  let feed=null,loading=false,error='',attempted=false,query='',availabilityFilter='all';
  const sourceNames={doc:'Doctor of Credit',fm:'Frequent Miler',hmb:'Hustler Money Blog'};
  const sourceHosts={'www.doctorofcredit.com':'doc','frequentmiler.com':'fm','www.hustlermoneyblog.com':'hmb'};
  const normalize=s=>String(s||'').toLowerCase().replace(/u\.s\.?/g,'us').replace(/[^a-z0-9]+/g,' ').trim();
  const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function valid(data){
    if(!data||![1,2].includes(data.schemaVersion)||!Number.isFinite(Date.parse(data.checkedAt))||!Array.isArray(data.offers)||data.offers.length>200)throw Error('Invalid feed');
    const now=Date.now();
    const offers=[];
    for(const x of data.offers){
      try{
        if(!x||typeof x.title!=='string'||x.title.length>300||!Number.isFinite(Date.parse(x.publishedAt))||Date.parse(x.publishedAt)>now||now-Date.parse(x.publishedAt)>90*86400000)continue;
        const u=new URL(x.url),id=sourceHosts[u.hostname];
        if(u.protocol!=='https:'||!id||u.username||u.password||u.port||u.search||u.hash||u.pathname==='/')continue;
        const expiry=x.title.match(/\bends?\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/i);
        if(expiry){const year=+expiry[3]<100?2000+(+expiry[3]):+expiry[3];const day=new Date(year,+expiry[1]-1,+expiry[2]+1);if(day.getTime()<=now)continue;}
        offers.push({title:x.title,url:u.href,publishedAt:x.publishedAt,source:sourceNames[id],sourceId:id,availability:['nationwide','regional'].includes(x.availability)?x.availability:'unknown',groupKey:typeof x.groupKey==='string'&&x.groupKey.length<1000?x.groupKey:normalize(x.title)});
      }catch{}
    }
    const sources=Array.isArray(data.sources)?data.sources.filter(s=>s&&sourceNames[s.id]).map(s=>({id:s.id,name:sourceNames[s.id],status:s.status==='ok'?'ok':'unavailable',checkedAt:Number.isFinite(Date.parse(s.checkedAt))?s.checkedAt:null})):[];
    return {checkedAt:data.checkedAt,offers,sources};
  }
  function grouped(rows){
    const groups=new Map();
    for(const row of rows){
      let group=groups.get(row.groupKey);
      if(!group){group={...row,links:[]};groups.set(row.groupKey,group);}
      if(!group.links.some(x=>x.url===row.url))group.links.push({url:row.url,source:row.source});
      if(group.availability!==row.availability)group.availability='unknown';
    }
    return [...groups.values()];
  }
  function filtered(rows,q,availability){return grouped(rows).filter(x=>(availability==='all'||x.availability===availability)&&(!q||normalize(x.title).includes(normalize(q))));}
  window.btRadarSearch=function(value,cursor){query=value;R();const el=document.getElementById('radar-search');if(el){el.focus();const pos=Number.isInteger(cursor)?Math.min(cursor,el.value.length):el.value.length;el.setSelectionRange(pos,pos);}};
  window.btRadarAvailability=function(value){availabilityFilter=['all','nationwide','regional','unknown'].includes(value)?value:'all';R();};
  async function refresh(){
    if(loading)return;
    loading=true;attempted=true;error='';
    if(typeof R==='function'&&typeof tab!=='undefined'&&tab==='bonuses')R();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch('./data/bank-bonuses.json',{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('Feed unavailable');
      feed=valid(await response.json());
    }catch{error='Could not check for updates. '+(feed?'Showing the last loaded feed.':'Reconnect to load the bank bonus feed.');}
    finally{clearTimeout(timeout);loading=false;if(typeof R==='function'&&typeof tab!=='undefined'&&tab==='bonuses')R();}
  }
  window.btRefreshBankBonuses=refresh;
  window.rBankBonuses=function(){
    if(!attempted){attempted=true;setTimeout(refresh,0);}
    let h='<div class="sec">Bank Bonuses</div><section class="radar-intro"><h2>Discover your next bank bonus</h2><p>Automatically refreshed bank and credit-union deposit bonus posts. No credit cards, brokerage, or crypto offers.</p><p class="radar-notice">Discovery only: availability and eligibility are not verified. Check the bank’s official terms before applying. Your saved accounts and enrolled terms are never changed by this feed.</p>';
    h+='<div class="radar-toolbar"><span>'+(feed?'Latest successful check '+escape(new Date(feed.checkedAt).toLocaleString()):'Checking source feeds…')+'</span><button type="button" class="ph-mini ph-save" onclick="btRefreshBankBonuses()" '+(loading?'disabled':'')+'>'+(loading?'Checking…':'Check updates')+'</button></div><p>Background checks are scheduled every 6 hours; delivery may be delayed. Recently posted does not necessarily mean a newly launched promotion. This is not a complete catalog of active offers.</p></section>';
    if(error)h+='<p role="status" class="radar-warning">'+escape(error)+'</p>';
    if(feed&&Date.now()-Date.parse(feed.checkedAt)>24*60*60*1000)h+='<p role="status" class="radar-warning">Updates are stale: the source has not been successfully checked in over 24 hours.</p>';
    if(!feed)return h+'<p role="status">'+(loading?'Loading bank bonus posts…':'Feed not loaded.')+'</p>';
    if(feed.sources.length)h+='<div class="radar-sources">'+feed.sources.map(s=>'<p>'+escape(s.name)+' · '+(s.status==='ok'?'Checked':'Update unavailable')+(s.checkedAt?' '+escape(new Date(s.checkedAt).toLocaleString()):' · no successful check yet')+'</p>').join('')+'</div>';
    if(feed.sources.some(s=>s.status!=='ok'))h+='<p role="status" class="radar-warning">Some sources could not update. Available sources continue working; retained posts use their last successful check.</p>';
    h+='<div class="radar-filters"><label for="radar-search">Find a bank</label><input id="radar-search" class="sinput" placeholder="Search bank bonuses…" value="'+escape(query)+'" oninput="btRadarSearch(this.value,this.selectionStart)"><div class="radar-quick"><button type="button" class="ph-mini ph-save" onclick="btRadarSearch(\'U.S. Bank\')">U.S. Bank</button><button type="button" class="ph-mini ph-save" onclick="btRadarSearch(\'Wells Fargo\')">Wells Fargo</button><button type="button" class="ph-mini" onclick="btRadarSearch(\'\')">All banks</button></div><label for="radar-availability">Availability</label><select id="radar-availability" onchange="btRadarAvailability(this.value)">'+[['all','All bank offers'],['nationwide','Nationwide reported'],['regional','Regional reported'],['unknown','Availability unclear']].map(([v,l])=>'<option value="'+v+'"'+(availabilityFilter===v?' selected':'')+'>'+l+'</option>').join('')+'</select><p>Nationwide labels reflect explicit source wording, not verified personal eligibility. Unstated or conflicting availability stays unclear.</p></div>';
    if(!feed.offers.length)return h+'<p>No qualifying bank bonus posts in the latest source feed.</p>';
    const visible=filtered(feed.offers,query,availabilityFilter);
    h+='<div class="radar-count">'+visible.length+' matching offer posts · '+feed.offers.length+' source posts checked</div>';
    if(!visible.length)h+='<p>No posts match these filters. Try All banks or All bank offers.</p>';
    visible.forEach(x=>{h+='<article class="radar-card"><span class="tag n">Terms need verification</span><span class="radar-availability">'+escape(x.availability==='nationwide'?'Nationwide reported':x.availability==='regional'?'Regional reported':'Availability unclear')+'</span><h3>'+escape(x.title)+'</h3><p>Posted '+escape(new Date(x.publishedAt).toLocaleDateString())+'</p>'+x.links.map(link=>'<a class="pf-link" href="'+escape(link.url)+'" target="_blank" rel="noopener noreferrer">'+escape(link.source)+' · Read source ↗</a>').join('')+'</article>';});
    return h;
  };
  window.BTBankBonusFeed={validate:valid,group:grouped,filter:filtered};
  // While the tab stays open, refresh the published snapshot without re-entering anything.
  const poll=setInterval(()=>{if(typeof tab!=='undefined'&&tab==='bonuses')refresh();},15*60*1000);
  if(poll&&typeof poll.unref==='function')poll.unref();
})();
