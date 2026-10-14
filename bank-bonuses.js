/* Public offer discovery with read-only tracker prioritization. Never changes account records. */
(function(){
  'use strict';
  let feed=null,loading=false,error='',attempted=false,query='',availabilityFilter='all',evidenceFilter='all',feeFilter='all',activityFilter='all',amountFilter='all';
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
  const states={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
  let area='MO',priorityFilter='all';
  // View settings only; account records and financial rule engines are never changed.
  function listedStates(text){
    const out=new Set();
    for(const [code,name] of Object.entries(states)){
      if(new RegExp('\\b'+code+'\\b').test(text)||new RegExp('\\b'+name+'\\b','i').test(text))out.add(code);
    }
    return [...out];
  }
  function geography(offer,selected){
    const prefix=String(offer.title||'').match(/\[([^\]]+)\]/)?.[1]||'';
    const evidence=offer.evidence&&!offer.evidence.stale?offer.evidence.fields?.availability?.value||'':'';
    const scope=prefix||evidence;
    const codes=listedStates(scope);
    const exception=scope.match(/\b(?:except|excluding|not in|not available (?:in|to))\s+([^.;]+)/i);
    const excluded=exception?listedStates(exception[1]):[];
    // Full names outside brackets count only when an explicit residents/only restriction exists.
    const headline=String(offer.title||'');
    const restricted=headline.match(/\b(?:only (?:in|for)|available (?:in|to residents of))\s+([A-Za-z ,&]+)|\b([A-Za-z ]+) residents only\b/i);
    const included=exception?[]:codes.length?codes:restricted?listedStates(restricted[1]||restricted[2]):[];
    const nationwide=/\bnationwide\b/i.test(scope)||/\(nationwide\)/i.test(headline)||offer.availability==='nationwide';
    const limited=/\b(?:counties|county|branch|targeted|membership|select|invitation)\b/i.test(scope+' '+headline);
    if(!states[selected])return{kind:'unknown',label:'Area not selected',detail:'Select a state to prioritize source-reported availability.'};
    if(excluded.includes(selected))return{kind:'outside',label:'Outside your area',detail:'Source excludes '+states[selected]+'.'};
    if(included.length&&nationwide)return{kind:'unknown',label:'Area needs review',detail:'Source geography is inconsistent; check the offer’s exact location restrictions.'};
    if(included.length)return{kind:included.includes(selected)?'listed':'outside',label:included.includes(selected)?states[selected]+' listed':'Outside your area',detail:'Source lists '+included.join(', ')+(limited?' · branch, membership or local limits may apply.':'.')};
    if(nationwide&&!exception)return{kind:'nationwide',label:'Nationwide reported',detail:limited?'Source reports nationwide availability; additional access restrictions need review.':'Source reports nationwide availability; personal eligibility still needs review.'};
    return{kind:'unknown',label:'Area needs review',detail:'The source does not establish availability in '+states[selected]+'.'};
  }
  function titleMatches(entry,title,context){
    const text=' '+normalize(title)+' ';
    const raw=normalize(entry.bank).replace(/\b(biz|business|personal|consumer|checking|savings|account|accounts)\b/g,' ').replace(/\s+/g,' ').trim();
    if(raw.length>=5&&text.includes(' '+raw+' '))return true;
    try{const a=context.family(entry.bank),b=context.family(title);return !!a&&a===b&&normalize(a).length>=3;}catch{return false;}
  }
  function trackerMatch(offer,rows,context){
    if(!context||!Array.isArray(rows))return null;
    const business=/\b(?:business|biz|commercial)\b/i.test(offer.title);
    const investment=/\b(?:investing|investment|brokerage|wealth)\b/i.test(offer.title);
    const audience=business?'business':'personal';
    const matches=rows.filter(e=>e&&e.bank&&titleMatches(e,offer.title,context)&&context.audience(e)===audience);
    if(!matches.length)return null;
    const families=new Set(matches.map(e=>context.family(e.bank)));
    if(families.size!==1)return{kind:'review',label:'Bank match needs review',detail:'Several tracked institutions match this headline.',date:''};
    const bank=matches[0].bank;
    if(investment)return{kind:'review',bank,label:'Different product may apply',detail:'This investment or wealth offer needs a separate product review.',date:''};
    if(matches.some(e=>!e.closed))return{kind:'review',bank,label:'Account still open',detail:'An open '+audience+' account is in your tracker. Review current-customer restrictions.',date:''};
    if(matches.some(e=>context.nonrepeat(e)))return{kind:'review',bank,label:'Non-repeatable in tracker',detail:'Your completed offer is non-repeatable under its recorded terms. Do not assume a new headline changes that rule.',date:''};
    const dates=matches.map(e=>context.ready(e));
    if(dates.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d||'')||!Number.isFinite(Date.parse(d+'T12:00:00Z'))||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d))return{kind:'review',bank,label:'Tracker date needs review',detail:'The tracker does not provide a supported repeat-review date for every matching account.',date:''};
    const date=dates.sort().at(-1); // Multiple tracked cycles: keep the latest restriction.
    const ready=date<=context.today;
    return{kind:ready?'ready':'next',bank,date,label:ready?'Tracker date reached':'Next tracker review',detail:'Tracker review date '+date+'. Confirm the new offer’s terms, account type and eligibility before applying.'};
  }
  function prioritize(rows,tracker,selected,context,filter='all'){
    return rows.map((offer,index)=>{
      const geo=geography(offer,selected),match=trackerMatch(offer,tracker,context);
      const group=geo.kind==='outside'?'outside':match?.kind==='ready'?'ready':match?.kind==='next'?'next':match?'review':'explore';
      return{...offer,geo,match,priorityGroup:group,index};
    }).filter(x=>filter==='all'||filter==='tracker'&&!!x.match||filter==='area'&&x.geo.kind!=='outside')
      .sort((a,b)=>({ready:0,next:1,explore:2,review:3,outside:4}[a.priorityGroup]-{ready:0,next:1,explore:2,review:3,outside:4}[b.priorityGroup])||
        (a.priorityGroup==='next'?(a.match.date.localeCompare(b.match.date)):0)||
        ({listed:0,nationwide:0,unknown:1,outside:2}[a.geo.kind]-{listed:0,nationwide:0,unknown:1,outside:2}[b.geo.kind])||
        (Date.parse(b.publishedAt)-Date.parse(a.publishedAt))||a.index-b.index);
  }
  function trackerContext(){
    try{return {rows:typeof entries!=='undefined'?entries:[],family:name=>typeof normalizeBankFamily==='function'?normalizeBankFamily(name):normalize(name),audience:e=>typeof entryBankType==='function'&&entryBankType(e)==='B'?'business':'personal',nonrepeat:e=>typeof isNonRepeatableEntry==='function'&&isNonRepeatableEntry(e),ready:e=>typeof nextReopen==='function'?nextReopen(e):'',today:typeof td==='function'?td():new Date().toISOString().slice(0,10)};}catch{return{rows:[]};}
  }
  window.btRadarArea=function(value){area=Object.hasOwn(states,value)?value:'';R();};
  window.btRadarPriority=function(value){priorityFilter=['all','tracker','area'].includes(value)?value:'all';R();};

  window.btRadarSearch=function(value,cursor){query=value;R();const el=document.getElementById('radar-search');if(el){el.focus();const pos=Number.isInteger(cursor)?Math.min(cursor,el.value.length):el.value.length;el.setSelectionRange(pos,pos);}};
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
    let h='<div class="sec">Bank Bonuses</div><section class="radar-intro"><h2>Bank offers</h2><p>Review source terms before applying.</p>';
    h+='<div class="radar-toolbar"><span>'+(feed?'Latest successful check '+escape(new Date(feed.checkedAt).toLocaleString()):'Checking source feeds…')+'</span><button type="button" class="ph-mini ph-save" onclick="btRefreshBankBonuses()" '+(loading?'disabled':'')+'>'+(loading?'Checking…':'Check updates')+'</button></div></section>';
    if(error)h+='<p role="status" class="radar-warning">'+escape(error)+'</p>';
    if(feed&&Date.now()-Date.parse(feed.checkedAt)>24*60*60*1000)h+='<p role="status" class="radar-warning">Updates are stale: the source has not been successfully checked in over 24 hours.</p>';
    if(!feed)return h+'<p role="status">'+(loading?'Loading bank bonus posts…':'Feed not loaded.')+'</p>';
    if(feed.sources.length)h+=disclosure('source-times','Source check times','<div class="radar-sources">'+feed.sources.map(s=>'<p>'+escape(s.name)+' · '+(s.status==='ok'?'Checked':'Update unavailable')+(s.checkedAt?' '+escape(new Date(s.checkedAt).toLocaleString()):' · no successful check yet')+'</p>').join('')+'</div>');
    if(feed.sources.some(s=>s.status!=='ok'))h+='<p role="status" class="radar-warning">Some sources could not update. Available sources continue working; retained posts use their last successful check.</p>';
    h+='<section class="radar-filters radar-personal-filters" aria-label="Offer preferences"><label for="radar-search">Find an offer</label><input id="radar-search" class="sinput" placeholder="Search bank bonuses…" value="'+escape(query)+'" oninput="btRadarSearch(this.value,this.selectionStart)"><div class="radar-filter-grid"><div><label for="radar-area">Your area</label><select id="radar-area" onchange="btRadarArea(this.value)"><option value=""'+(!area?' selected':'')+'>Choose a state</option>'+Object.entries(states).map(([code,name])=>'<option value="'+code+'"'+(area===code?' selected':'')+'>'+name+'</option>').join('')+'</select></div><div><label for="radar-availability">Availability</label><select id="radar-availability" onchange="btRadarAvailability(this.value)">'+[['all','All bank offers'],['nationwide','Nationwide reported'],['regional','Regional reported'],['unknown','Availability unclear']].map(([v,l])=>'<option value="'+v+'"'+(availabilityFilter===v?' selected':'')+'>'+l+'</option>').join('')+'</select></div></div><div class="radar-priority-tabs" role="group" aria-label="Offer priority">'+[['all','For you'],['tracker','Churn matches'],['area','Hide out-of-area']].map(([v,l])=>'<button type="button" aria-pressed="'+(priorityFilter===v)+'" onclick="btRadarPriority(\''+v+'\')">'+l+'</button>').join('')+'</div><p>Ordered by tracker review dates and source-reported geography. Unknown availability stays visible; new offer eligibility always needs review.</p></section>';
    const context=trackerContext();
    const upcoming=context.rows.filter(e=>e.closed&&!context.nonrepeat(e)&&context.ready(e)).sort((a,b)=>context.ready(a).localeCompare(context.ready(b)));
    const names=[...new Set(upcoming.map(e=>e.bank))].slice(0,3);
    if(names.length)h+='<div class="radar-quick radar-churn-shortcuts" aria-label="Your churn list">'+names.map(name=>'<button type="button" class="ph-mini" onclick="btRadarSearch('+escape(JSON.stringify(context.family(name)))+')">'+escape(name)+'</button>').join('')+'<button type="button" class="ph-mini" onclick="btRadarSearch(\'\')">All banks</button></div>';
    else h+='<div class="radar-quick"><button type="button" class="ph-mini" onclick="btRadarSearch(\'\')">All banks</button></div>';
    if(!feed.offers.length)return h+'<p>No qualifying bank bonus posts in the latest source feed.</p>';
    const visible=prioritize(filtered(feed.offers,query,availabilityFilter,{evidence:evidenceFilter,fees:feeFilter,activity:activityFilter,amount:amountFilter}),context.rows,area,context,priorityFilter);
    h+='<div class="radar-count">'+visible.length+' matching offer posts · '+feed.offers.length+' source posts checked</div>';
    if(!visible.length)h+='<p>No posts match these filters. Try All banks or All bank offers.</p>';
    const groupLabels={ready:'Tracker date reached',next:'Next in your churn list',explore:'Other offers to explore',review:'Tracker restrictions to review',outside:'Outside your selected area'};
    let lastGroup='';
    visible.forEach(x=>{
      if(x.priorityGroup!==lastGroup){lastGroup=x.priorityGroup;h+='<h2 class="radar-group-heading">'+groupLabels[lastGroup]+'</h2>';}
      const link=x.links[0],date=x.match?.date;
      h+='<article class="radar-card radar-card-compact radar-priority-'+x.priorityGroup+'"><div class="radar-card-meta"><span class="radar-geo radar-geo-'+x.geo.kind+'">'+escape(x.geo.label)+'</span>'+(x.match?'<span class="radar-match-label">Tracker match</span>':'')+'</div><h3>'+escape(x.title)+'</h3>';
      if(x.match)h+='<div class="radar-tracker-context"><b>'+escape(x.match.label)+'</b>'+(date?'<time datetime="'+date+'">'+escape(typeof fD==='function'?fD(date):date)+'</time>':'')+'<p>'+escape(x.match.detail)+'</p></div>';
      h+='<p class="radar-area-note">'+escape(x.geo.detail)+'</p><a class="radar-offer-link" href="'+escape(link.url)+'" target="_blank" rel="noopener noreferrer">Review offer · '+escape(link.source)+' ↗</a></article>';
    });
    return h;
  };
  window.BTBankBonusFeed={validate:valid,group:grouped,filter:filtered,evidence:evidenceFor,amount:amountFor,geography,match:trackerMatch,prioritize};
  // While the tab stays open, refresh the published snapshot without re-entering anything.
  const poll=setInterval(()=>{if(typeof tab!=='undefined'&&tab==='bonuses')refresh();},15*60*1000);
  if(poll&&typeof poll.unref==='function')poll.unref();
})();
