/* Public discovery metadata only. Never reads or writes saved account data. */
(function(){
  'use strict';
  let feed=null,loading=false,error='',attempted=false,query='',availabilityFilter='all',evidenceFilter='all',feeFilter='all',activityFilter='all',amountFilter='all',reviewText='',copyStatus='';
  let showOfferDetails=false;
  const evidenceOpen=new Set();
  const sourceNames={doc:'Doctor of Credit',fm:'Frequent Miler',hmb:'Hustler Money Blog'};
  const sourceHosts={'www.doctorofcredit.com':'doc','frequentmiler.com':'fm','www.hustlermoneyblog.com':'hmb'};
  const evidenceLabels={bonus:'Bonus wording',expiration:'Offer expiration',availability:'Availability wording',eligibility:'Eligibility wording',qualifying_activity:'Qualifying activity',payout:'Payout wording',monthly_fee:'Monthly fee wording',fee_waiver:'Fee waiver wording',early_close:'Early-close wording',companion_accounts:'Companion account wording',companion_fees:'Companion account fees',funding_hold:'Funding and balance hold',promo_code:'Enrollment or promo code',close_restrictions:'Keep-open and bonus forfeiture'};
  const officialHosts=new Set(['www.wellsfargo.com','accountoffers.wellsfargo.com','www.usbank.com','www.chase.com','account.chase.com']);
  function officialUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&officialHosts.has(u.hostname)&&!u.username&&!u.password&&!u.port?u.href:'';}catch{return'';}}
  function evidenceFor(offer,catalog){
    if(!catalog||catalog.schemaVersion!==1||catalog.status!=='complete')return null;
    const record=catalog.records&&catalog.records[offer.url];
    if(!record||record.offerTitle!==offer.title||record.offerUrl!==offer.url)return null;
    const fields={};
    if(record.fields&&typeof record.fields==='object')for(const [key,item] of Object.entries(record.fields)){
      if(!Object.prototype.hasOwnProperty.call(evidenceLabels,key)||!item||typeof item.value!=='string'||!item.value.trim()||item.value.length>240||typeof item.quote!=='string'||!item.quote.trim()||item.quote.length>500||!item.quote.includes(item.value)||!officialUrl(item.sourceUrl)||!/^[a-f0-9]{64}$/.test(item.sourceHash||''))continue;
      fields[key]={value:item.value,quote:item.quote,sourceUrl:officialUrl(item.sourceUrl)};
    }
    const checked=Number.isFinite(Date.parse(record.officialCheckedAt))?record.officialCheckedAt:null;
    const aiChecked=Number.isFinite(Date.parse(record.aiCheckedAt))?record.aiCheckedAt:null;
    const stale=!!checked&&(Date.now()-Date.parse(checked)>24*86400000||Date.parse(checked)>Date.now()+15*60000);
    const sources=Array.isArray(record.sources)?record.sources.filter(x=>x&&['promotion','fees'].includes(x.role)&&officialUrl(x.url)&&/^[a-f0-9]{64}$/.test(x.hash||'')).map(x=>({role:x.role,url:officialUrl(x.url),hash:x.hash})):[];
    const changesAt=Number.isFinite(Date.parse(record.changesAt))?record.changesAt:null;
    const changes=checked&&!stale&&changesAt&&Date.now()-Date.parse(changesAt)>=0&&Date.now()-Date.parse(changesAt)<=7*86400000&&Array.isArray(record.changes)?record.changes.filter(x=>x&&Object.prototype.hasOwnProperty.call(evidenceLabels,x.field)&&typeof x.before==='string'&&x.before.length<=240&&typeof x.after==='string'&&x.after.length<=240&&['added','removed','changed'].includes(x.kind)).slice(0,14):[];
    return {status:record.status==='evidence-found'?'evidence-found':'needs-review',fields:checked&&!stale?fields:{},sources,checkedAt:checked,aiCheckedAt:aiChecked,stale,changed:record.changed===true,changes,changesAt,checkState:['cached','extracted','queued','failed','unsupported'].includes(record.checkState)?record.checkState:'unknown',retryAt:Number.isFinite(Date.parse(record.retryAt))?record.retryAt:null,reason:typeof record.reason==='string'?record.reason.slice(0,500):'Official evidence needs review.'};
  }
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
        const offer={title:x.title,url:u.href,publishedAt:x.publishedAt,source:sourceNames[id],sourceId:id,availability:['nationwide','regional'].includes(x.availability)?x.availability:'unknown',groupKey:typeof x.groupKey==='string'&&x.groupKey.length<1000?x.groupKey:normalize(x.title)};
        offer.evidence=evidenceFor(offer,data.verification);offers.push(offer);
      }catch{}
    }
    const sources=Array.isArray(data.sources)?data.sources.filter(s=>s&&sourceNames[s.id]).map(s=>({id:s.id,name:sourceNames[s.id],status:s.status==='ok'?'ok':'unavailable',checkedAt:Number.isFinite(Date.parse(s.checkedAt))?s.checkedAt:null})):[];
    const rawUsage=data.verification&&data.verification.usage;
    const usage={};
    if(rawUsage&&typeof rawUsage==='object')for(const key of ['newExtractions','providerRequests','reportedTokens','dailyAccountedTokens','dailyTokenBudget','cycleLimit','retries','throttled','cacheHits','queued','failed','unsupported','documentsChecked','documentFailures'])if(Number.isSafeInteger(rawUsage[key])&&rawUsage[key]>=0&&rawUsage[key]<=10000000)usage[key]=rawUsage[key];
    return {checkedAt:data.checkedAt,offers,sources,usage,verificationStatus:data.verification&&data.verification.status==='complete'?'complete':data.verification&&data.verification.status==='pending'?'pending':'unavailable'};
  }
  function grouped(rows){
    const groups=new Map();
    for(const row of rows){
      let group=groups.get(row.groupKey);
      if(!group){group={...row,links:[]};groups.set(row.groupKey,group);}
      if(!group.links.some(x=>x.url===row.url))group.links.push({url:row.url,source:row.source});
      // Do not borrow one source's evidence for another title/offer identity.
      if(group.availability!==row.availability)group.availability='unknown';
    }
    return [...groups.values()];
  }
  function amountFor(offer){
    const e=offer.evidence;
    if(!e||e.status!=='evidence-found'||e.stale)return null;
    const value=e.fields.bonus&&e.fields.bonus.value;
    return typeof value==='string'&&/^\$\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?$/.test(value.trim())?Number(value.replace(/[$,\s]/g,'')):null;
  }
  function filtered(rows,q,availability,options={}){
    return grouped(rows).filter(x=>{
      const e=x.evidence,fields=e&&e.fields||{},has=Object.keys(fields).length>0;
      const state=e&&e.stale?'stale':e&&e.checkState==='queued'?'queued':has?'present':'missing';
      const amount=amountFor(x);
      return (availability==='all'||x.availability===availability)&&(!q||normalize(x.title).includes(normalize(q)))&&
        (!options.evidence||options.evidence==='all'||options.evidence===state||options.evidence==='changed'&&e&&e.changes.length>0)&&
        (!options.fees||options.fees==='all'||options.fees==='present'&&!!fields.monthly_fee||options.fees==='missing'&&!fields.monthly_fee)&&
        (!options.activity||options.activity==='all'||options.activity==='present'&&!!fields.qualifying_activity||options.activity==='missing'&&!fields.qualifying_activity)&&
        (!options.amount||options.amount==='all'||options.amount==='unknown'&&amount===null||/^(300|500|1000)$/.test(options.amount)&&amount!==null&&amount>=Number(options.amount));
    });
  }
  function reviewFor(offer){
    const e=offer.evidence,fields=e&&e.fields||{};
    const lines=['BonusTracker offer for review',offer.title,'Discovery source: '+offer.url,'Please verify the official promotion and fee schedule, resolve missing terms, and generate the import JSON here. Do not import or update a saved account automatically.','These are AI-selected excerpts, not verified personal eligibility.'];
    if(e&&e.checkedAt)lines.push('Official documents checked: '+e.checkedAt);
    if(e&&e.aiCheckedAt)lines.push('AI extraction: '+e.aiCheckedAt);
    if(e)lines.push('Review status: '+e.reason+(e.stale?' [STALE]':''));
    if(e)for(const source of e.sources)lines.push('Official '+source.role+': '+source.url);
    for(const [key,label] of Object.entries(evidenceLabels)){
      const field=fields[key];
      lines.push(label+': '+(field?field.value:'NOT CONFIRMED'));
      if(field)lines.push('Supporting quotation: '+field.quote,'Source: '+field.sourceUrl);
    }
    if(e)for(const change of e.changes)lines.push('Evidence change — '+evidenceLabels[change.field]+': '+(change.before||'previously unconfirmed')+' → '+(change.after||'now unconfirmed'));
    lines.push('Also verify exact date anchors, all repeat-bonus restrictions, fee-waiver conditions, required companion accounts and product/tier applicability.');
    return lines.join('\n');
  }
  window.btRadarSearch=function(value,cursor){query=value;R();const el=document.getElementById('radar-search');if(el){el.focus();const pos=Number.isInteger(cursor)?Math.min(cursor,el.value.length):el.value.length;el.setSelectionRange(pos,pos);}};
  window.btRadarShowDetails=function(value){showOfferDetails=value===true;R();};
  window.btRadarAvailability=function(value){availabilityFilter=['all','nationwide','regional','unknown'].includes(value)?value:'all';R();};
  window.btRadarFilter=function(kind,value){
    if(kind==='evidence')evidenceFilter=['all','present','missing','queued','stale','changed'].includes(value)?value:'all';
    if(kind==='fees')feeFilter=['all','present','missing'].includes(value)?value:'all';
    if(kind==='activity')activityFilter=['all','present','missing'].includes(value)?value:'all';
    if(kind==='amount')amountFilter=['all','300','500','1000','unknown'].includes(value)?value:'all';
    R();
  };
  window.btRadarEvidenceToggle=function(url,open,element){if(element&&element.isConnected===false)return;if(open)evidenceOpen.add(url);else evidenceOpen.delete(url);};
  window.btCaptureRadarDisclosures=function(){
    document.querySelectorAll('details[data-radar-key]').forEach(element=>{
      const key=element.getAttribute('data-radar-key');
      if(element.open)evidenceOpen.add(key);else evidenceOpen.delete(key);
    });
  };
  function setDisclosureOpen(key,open){
    if(open)evidenceOpen.add(key);else evidenceOpen.delete(key);
    document.querySelectorAll('details[data-radar-key]').forEach(element=>{if(element.getAttribute('data-radar-key')===key)element.open=open;});
  }
  window.btRadarCopy=async function(url){
    const offer=feed&&feed.offers.find(x=>x.url===url);
    if(!offer)return;
    reviewText=reviewFor(offer);
    try{await navigator.clipboard.writeText(reviewText);setDisclosureOpen('review-text',false);copyStatus='Copied. Paste it into our chat for verification and JSON generation.';}
    catch{setDisclosureOpen('review-text',true);copyStatus='Copy the review text below, then paste it into our chat.';}
    R();
  };
  function disclosure(key,label,body){
    return '<details class="mobile-disclosure" data-radar-key="'+escape(key)+'"'+(evidenceOpen.has(key)?' open':'')+' ontoggle="btRadarEvidenceToggle('+escape(JSON.stringify(key))+',this.open,this)"><summary>'+escape(label)+'</summary><div class="mobile-disclosure-body">'+body+'</div></details>';
  }
  function selectFilter(id,label,value,choices,kind){return '<label for="'+id+'">'+label+'</label><select id="'+id+'" onchange="btRadarFilter(\''+kind+'\',this.value)">'+choices.map(([v,l])=>'<option value="'+v+'"'+(v===value?' selected':'')+'>'+l+'</option>').join('')+'</select>';}
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
    let h='<div class="sec">Bank Bonuses</div><section class="radar-intro"><h2>Discover your next bank bonus</h2><p>Bank and credit-union deposit bonuses, updated automatically.</p><p class="radar-notice">Review official terms before applying. Personal eligibility is not verified; saved accounts stay unchanged.</p>';
    h+='<div class="radar-toolbar"><span>'+(feed?'Latest successful check '+escape(new Date(feed.checkedAt).toLocaleString()):'Checking source feeds…')+'</span><button type="button" class="ph-mini ph-save" onclick="btRefreshBankBonuses()" '+(loading?'disabled':'')+'>'+(loading?'Checking…':'Check updates')+'</button></div><p>Background checks are scheduled every hour; delivery may be delayed. Recently posted does not necessarily mean a newly launched promotion. This is not a complete catalog of active offers.</p></section>';
    if(error)h+='<p role="status" class="radar-warning">'+escape(error)+'</p>';
    if(feed&&Date.now()-Date.parse(feed.checkedAt)>24*60*60*1000)h+='<p role="status" class="radar-warning">Updates are stale: the source has not been successfully checked in over 24 hours.</p>';
    if(!feed)return h+'<p role="status">'+(loading?'Loading bank bonus posts…':'Feed not loaded.')+'</p>';
    if(feed.sources.length)h+=disclosure('source-times','Source check times','<div class="radar-sources">'+feed.sources.map(s=>'<p>'+escape(s.name)+' · '+(s.status==='ok'?'Checked':'Update unavailable')+(s.checkedAt?' '+escape(new Date(s.checkedAt).toLocaleString()):' · no successful check yet')+'</p>').join('')+'</div>');
    if(feed.sources.some(s=>s.status!=='ok'))h+='<p role="status" class="radar-warning">Some sources could not update. Available sources continue working; retained posts use their last successful check.</p>';
    h+=disclosure('coverage','Evidence coverage and limitations','<section class="radar-verification-info"><b>Official-source AI evidence</b><p>Feed checks and official-document checks are separate. AI selects passages; displayed quotations must match fetched official documents. AI excerpts do not prove eligibility or complete account/tier applicability.</p><p>Official-source profiles: Wells Fargo Everyday Checking, U.S. Bank business checking and Smartly checking, and Chase Total Checking. Profile coverage does not confirm that a discovery post matches the official offer. Other products remain Needs review. Newly changed posts can be queued until the next verification cycle. Saved accounts, enrolled terms and calculations are never updated automatically.</p>'+(feed.verificationStatus==='complete'?'':'<p role="status">'+(feed.verificationStatus==='pending'?'Official evidence check is running; this feed will receive the result on a later update.':'Official evidence service is unavailable or has not completed a check. No AI evidence is presented as current.')+'</p>')+'</section>');
    if(feed.verificationStatus!=='complete')h+='<p role="status" class="radar-warning">'+(feed.verificationStatus==='pending'?'Official evidence check is running.':'Official evidence is unavailable. Review the bank’s terms directly.')+'</p>';
    if(feed.verificationStatus==='complete'&&Object.keys(feed.usage).length)h+='<details class="radar-verification-info"><summary>AI check activity</summary><p>Last cycle: '+(feed.usage.newExtractions||0)+' new extraction attempts · '+(feed.usage.cacheHits||0)+' reused · '+(feed.usage.queued||0)+' queued · '+(feed.usage.failed||0)+' failed · '+(feed.usage.throttled||0)+' throttled.</p><p>Provider requests: '+(feed.usage.providerRequests||0)+' · successful-call reported tokens: '+(feed.usage.reportedTokens||0).toLocaleString()+' · retries: '+(feed.usage.retries||0)+' · official documents checked: '+(feed.usage.documentsChecked||0)+'.</p><p>App budgets: '+(feed.usage.cycleLimit||0)+' extractions per cycle; '+(feed.usage.dailyAccountedTokens||0).toLocaleString()+' / '+(feed.usage.dailyTokenBudget||0).toLocaleString()+' accounted tokens today (UTC). Failed calls reserve an estimate. These are app budgets, not your provider quota or billing.</p></details>';
    h+='<div class="radar-filters"><label for="radar-search">Find a bank</label><input id="radar-search" class="sinput" placeholder="Search bank bonuses…" value="'+escape(query)+'" oninput="btRadarSearch(this.value,this.selectionStart)"><div class="radar-quick"><button type="button" class="ph-mini ph-save" onclick="btRadarSearch(\'U.S. Bank\')">U.S. Bank</button><button type="button" class="ph-mini ph-save" onclick="btRadarSearch(\'Wells Fargo\')">Wells Fargo</button><button type="button" class="ph-mini" onclick="btRadarSearch(\'\')">All banks</button></div><label for="radar-availability">Availability</label><select id="radar-availability" onchange="btRadarAvailability(this.value)">'+[['all','All bank offers'],['nationwide','Nationwide reported'],['regional','Regional reported'],['unknown','Availability unclear']].map(([v,l])=>'<option value="'+v+'"'+(availabilityFilter===v?' selected':'')+'>'+l+'</option>').join('')+'</select><p>Nationwide labels reflect explicit source wording, not verified personal eligibility. Unstated or conflicting availability stays unclear.</p></div>';
    h+=disclosure('more-filters','More filters'+([evidenceFilter,feeFilter,activityFilter,amountFilter].filter(value=>value!=='all').length?' · '+[evidenceFilter,feeFilter,activityFilter,amountFilter].filter(value=>value!=='all').length+' active':''),'<section class="radar-filters radar-extra-filters"><label class="radar-detail-toggle"><input type="checkbox" onchange="btRadarShowDetails(this.checked)"'+(showOfferDetails?' checked':'')+'> Show offer review tools</label><div>'+selectFilter('radar-evidence-filter','Official evidence',evidenceFilter,[['all','All evidence states'],['present','Excerpts available — review'],['missing','No current excerpts'],['queued','Queued checks'],['stale','Stale evidence'],['changed','Evidence changed in last 7 days']],'evidence')+'</div><div>'+selectFilter('radar-fee-filter','Monthly fee evidence',feeFilter,[['all','All fee evidence states'],['present','Fee excerpt available — review'],['missing','Monthly fee not confirmed']],'fees')+'</div><div>'+selectFilter('radar-activity-filter','Qualifying activity evidence',activityFilter,[['all','All requirement evidence states'],['present','Activity excerpt available — review'],['missing','Activity not confirmed']],'activity')+'</div><div>'+selectFilter('radar-amount-filter','Single bonus amount excerpt',amountFilter,[['all','All amounts'],['300','$300 or more'],['500','$500 or more'],['1000','$1,000 or more'],['unknown','Amount unknown, tiered or mismatched']],'amount')+'</div><p>Evidence filters reflect quoted wording, not complete verification. Amount filters require a single dollar amount and headline match; tiered or mismatched offers remain unknown.</p></section>');
    if(copyStatus)h+='<section class="radar-review"><p role="status">'+escape(copyStatus)+'</p>'+disclosure('review-text','Review text','<label for="radar-review-text">Offer review text</label><textarea id="radar-review-text" readonly rows="8">'+escape(reviewText)+'</textarea>')+'</section>';
    if(!feed.offers.length)return h+'<p>No qualifying bank bonus posts in the latest source feed.</p>';
    const visible=filtered(feed.offers,query,availabilityFilter,{evidence:evidenceFilter,fees:feeFilter,activity:activityFilter,amount:amountFilter});
    h+='<div class="radar-count">'+visible.length+' matching offer posts · '+feed.offers.length+' source posts checked</div>';
    if(!visible.length)h+='<p>No posts match these filters. Try All banks or All bank offers.</p>';
    visible.forEach(x=>{if(!showOfferDetails){const link=x.links[0];h+='<article class="radar-card radar-card-compact"><h3>'+escape(x.title)+'</h3><a class="radar-offer-link" href="'+escape(link.url)+'" target="_blank" rel="noopener noreferrer">'+escape(link.source)+' ↗</a></article>';return;}h+='<article class="radar-card"><span class="tag n">Terms need verification</span><span class="radar-availability">'+escape(x.availability==='nationwide'?'Nationwide reported':x.availability==='regional'?'Regional reported':'Availability unclear')+'</span><h3>'+escape(x.title)+'</h3><p>Posted '+escape(new Date(x.publishedAt).toLocaleDateString())+'</p>'+x.links.map(link=>'<a class="pf-link" href="'+escape(link.url)+'" target="_blank" rel="noopener noreferrer">'+escape(link.source)+' · Read source ↗</a>').join('');
      const e=x.evidence;
      h+='<div class="radar-card-actions"><button type="button" class="ph-mini ph-save" onclick="btRadarCopy('+escape(JSON.stringify(x.url))+')">Copy offer for review</button></div>';
      if(e){h+='<details class="radar-evidence" data-radar-key="'+escape(x.url)+'"'+(evidenceOpen.has(x.url)?' open':'')+' ontoggle="btRadarEvidenceToggle('+escape(JSON.stringify(x.url))+',this.open,this)"><summary>'+(e.stale?'Official evidence stale — needs review':Object.keys(e.fields).length?'Official evidence excerpts — review':'Official evidence needs review')+'</summary><p>'+escape(e.reason)+'</p>'+(e.checkedAt?'<p>Official documents checked '+escape(new Date(e.checkedAt).toLocaleString())+'</p>':'')+(e.aiCheckedAt?'<p>AI extraction '+escape(new Date(e.aiCheckedAt).toLocaleString())+'</p>':'')+(e.changed?'<p class="radar-warning">Official document text changed since the previous snapshot. Review the new evidence.</p>':'');
        h+='<p>Evidence coverage: '+Object.keys(e.fields).length+' of '+Object.keys(evidenceLabels).length+' fields have excerpts. Full applicability still requires review.</p>';
        if(e.checkState==='queued')h+='<p class="radar-warning">Check queued'+(e.retryAt?' · provider retry after '+escape(new Date(e.retryAt).toLocaleString()):'')+'.</p>';
        for(const source of e.sources)h+='<a class="pf-link" href="'+escape(source.url)+'" target="_blank" rel="noopener noreferrer">Official '+escape(source.role==='fees'?'fee schedule':'promotion')+' ↗</a>';
        if(e.changes.length)h+='<section class="radar-changes"><b>Evidence changes · '+escape(new Date(e.changesAt).toLocaleString())+'</b><p>Quotation changes need review; they do not prove the bank changed its policy.</p>'+e.changes.map(c=>'<p><b>'+escape(evidenceLabels[c.field])+'</b><br>Before: '+escape(c.before||'Not confirmed')+'<br>Now: '+escape(c.after||'Not confirmed')+'</p>').join('')+'</section>';
        for(const [key,field] of Object.entries(e.fields))h+='<div class="radar-evidence-field"><b>'+escape(evidenceLabels[key])+'</b><p>'+escape(field.value)+'</p><blockquote>'+escape(field.quote)+'</blockquote><a class="pf-link" href="'+escape(field.sourceUrl)+'" target="_blank" rel="noopener noreferrer">Official source ↗</a></div>';
        const missing=Object.keys(evidenceLabels).filter(key=>!e.fields[key]);if(missing.length)h+='<p>Not confirmed: '+missing.map(key=>escape(evidenceLabels[key])).join(', ')+'.</p>';
        h+='</details>';
      }else h+='<p>Official evidence: Needs review.</p>';
      h+='</article>';});
    return h;
  };
  window.BTBankBonusFeed={validate:valid,group:grouped,filter:filtered,evidence:evidenceFor,reviewText:reviewFor,amount:amountFor};
  // While the tab stays open, refresh the published snapshot without re-entering anything.
  const poll=setInterval(()=>{if(typeof tab!=='undefined'&&tab==='bonuses')refresh();},15*60*1000);
  if(poll&&typeof poll.unref==='function')poll.unref();
})();
