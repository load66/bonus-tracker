/* Public offer discovery with read-only tracker prioritization. Never changes account records. */
(function(){
  'use strict';
  let feed=null,loading=false,error='',attempted=false,query='',categoryFilter='all',availabilityFilter='all',evidenceFilter='all',feeFilter='all',activityFilter='all',amountFilter='all';
  const evidenceOpen=new Set();
  let filtersExpanded=false,sourceExpanded=false;
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
        const details=['bank','product','region','offerKey'].every(k=>typeof x[k]==='string'&&x[k].length<=120)?{bank:x.bank,product:x.product,region:x.region,offerKey:x.offerKey}:{};
        const amount=Number.isSafeInteger(x.amount)&&x.amount>0&&x.amount<100000?x.amount:null;
        const expiresAt=typeof x.expiresAt==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.expiresAt)?x.expiresAt:null;
        if(expiresAt&&expiresAt<new Date(now).toISOString().slice(0,10))continue;
        const links=Array.isArray(x.links)?x.links.slice(0,20).flatMap(link=>{try{const u=new URL(link.url),id=sourceHosts[u.hostname];return id&&u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&u.pathname!=='/'&&typeof link.title==='string'&&link.title.length<=300?[{url:u.href,source:sourceNames[id],sourceId:id,title:link.title}]:[]}catch{return[]}}):[];
        if(!links.some(l=>l.url===u.href))links.unshift({url:u.href,source:sourceNames[id],sourceId:id,title:x.title});
        const badges=Array.isArray(x.badges)?x.badges.filter(v=>['New','Increased','Decreased','Updated','Ending soon'].includes(v)).slice(0,4):[];
        const offer={title:x.title,url:u.href,publishedAt:x.publishedAt,source:sourceNames[id],sourceId:id,availability:['nationwide','regional'].includes(x.availability)?x.availability:'unknown',groupKey:details.offerKey||(typeof x.groupKey==='string'&&x.groupKey.length<1000?x.groupKey:normalize(x.title)),...details,amount,rewardIsUpperBound:x.rewardIsUpperBound===true,expiresAt,badges,links,changeLabel:typeof x.changeLabel==='string'&&/^\$[\d,]+ → \$[\d,]+$/.test(x.changeLabel)?x.changeLabel:''};
        offer.evidence=evidenceFor(offer,data.verification);offers.push(offer);
      }catch{}
    }
    const sources=Array.isArray(data.sources)?data.sources.filter(s=>s&&sourceNames[s.id]).map(s=>({id:s.id,name:sourceNames[s.id],status:s.status==='ok'?'ok':'unavailable',checkedAt:Number.isFinite(Date.parse(s.checkedAt))?s.checkedAt:null})):[];
    const rawUsage=data.verification&&data.verification.usage;
    const usage={};
    if(rawUsage&&typeof rawUsage==='object')for(const key of ['newExtractions','providerRequests','reportedTokens','dailyAccountedTokens','dailyTokenBudget','cycleLimit','retries','throttled','cacheHits','queued','failed','unsupported','documentsChecked','documentFailures'])if(Number.isSafeInteger(rawUsage[key])&&rawUsage[key]>=0&&rawUsage[key]<=10000000)usage[key]=rawUsage[key];
    return {checkedAt:data.checkedAt,offers,sources,usage,verificationStatus:data.verification&&data.verification.status==='complete'?'complete':data.verification&&data.verification.status==='pending'?'pending':'unavailable'};
  }

  // Separate offer audiences from public offer identity; never infer eligibility
  // or apply a consumer cooldown to a business offer (or vice versa).
  function offerAudience(offer){
    const text=normalize([offer?.title,offer?.product].filter(Boolean).join(' '));
    if(/\b(business|biz|commercial|merchant|sole proprietor)\b/.test(text))return 'business';
    if(/\b(checking|savings?|deposit|bank account|certificate of deposit)\b/.test(text))return 'personal';
    return 'unverified';
  }
  function offersForAudience(rows,selected){
    return selected==='all'?rows.slice():rows.filter(offer=>selected==='business'?offerAudience(offer)==='business':offerAudience(offer)!=='business');
  }
  function matchesCategory(offer,category){
    if(category==='all'||category==='near')return true;
    if(category==='business')return offerAudience(offer)==='business';
    const text=normalize([offer?.product,offer?.title].filter(Boolean).join(' '));
    return category==='checking'?/\bchecking\b/.test(text):category==='savings'?/\bsavings?\b/.test(text):false;
  }
  function checkedAge(value){
    const n=Date.parse(value),age=Date.now()-n;
    if(!Number.isFinite(n)||age<0)return 'check time unavailable';
    const minutes=Math.floor(age/60000);
    if(minutes<1)return 'checked just now';
    if(minutes<60)return 'checked '+minutes+'m ago';
    const hours=Math.floor(minutes/60);
    if(hours<24)return 'checked '+hours+'h ago';
    return 'checked '+Math.floor(hours/24)+'d ago';
  }

  function grouped(rows){
    const groups=new Map();
    for(const row of rows){
      let group=groups.get(row.offerKey||row.groupKey);
      if(!group){group={...row,links:[]};groups.set(row.offerKey||row.groupKey,group);}
      for(const link of row.links?.length?row.links:[{url:row.url,source:row.source,title:row.title}])if(!group.links.some(x=>x.url===link.url))group.links.push(link);
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
      const amount=Number.isSafeInteger(x.amount)?x.amount:amountFor(x);
      return (availability==='all'||x.availability===availability)&&(!q||normalize(x.title+' '+(x.bank||'')+' '+(x.product||'')).includes(normalize(q)))&&
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
  const AVAILABILITY_API='https://api-production-00f74.up.railway.app';
  let officialCatalog=null,officialBusy=false,officialError='',lastPriority='',lastPriorityAt=0;
  const availabilityHosts=new Set(['www.truist.com','www.busey.com','www.upgrade.com','www.westerracu.com','www.wellbyfinancial.com','www.starkcu.org','www.unitusccu.com','join.unitusccu.com','cobaltcu.com','www.cobaltcu.com','www.fhb.com','www.ccuflorida.org','www.safecu.org','www.chase.com','account.chase.com','www.wellsfargo.com','accountoffers.wellsfargo.com','www.usbank.com','www.citi.com','online.citi.com','www.bankcsb.com','bankcsb.com']);
  function availabilityUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&availabilityHosts.has(u.hostname)&&!u.username&&!u.password&&!u.port?u.href:'';}catch{return'';}}
  function availabilityFor(offer,catalog){
    const r=catalog?.schemaVersion===1?catalog.records?.[offer.url]:null;
    if(!r||r.offerTitle!==offer.title||r.offerUrl!==offer.url)return null;
    const base={status:'needs-review',checkState:['queued','unsupported','failed','checked'].includes(r.checkState)?r.checkState:'failed',reason:String(r.reason||'Official evidence needs review.').slice(0,300)};
    const checked=Date.parse(r.checkedAt),expires=Date.parse(r.expiresAt),now=Date.now(),source=availabilityUrl(r.sourceUrl);
    if(!Number.isFinite(checked)||!Number.isFinite(expires)||expires<=checked||expires-checked>24*86400000||checked>now+60000||!source||!/^[a-f0-9]{64}$/.test(r.sourceHash||''))return base;
    if(expires<=now)return{...base,status:'stale',checkedAt:r.checkedAt,sourceUrl:source,reason:'Official evidence has expired. A fresh check is required.'};
    const conditions=Array.isArray(r.conditions)?r.conditions.filter(q=>typeof q==='string'&&q.length>0&&q.length<=500).slice(0,4):[];
    const rules=Array.isArray(r.rules)?r.rules.filter(x=>x&&['include','exclude'].includes(x.mode)&&Array.isArray(x.states)&&x.states.length>0&&x.states.length<=51&&x.states.every(v=>Object.hasOwn(states,v))&&typeof x.quote==='string'&&x.quote.length>0&&x.quote.length<=1200).map(x=>({mode:x.mode,states:[...x.states],quote:x.quote})).slice(0,8):[];
    if(r.status==='verified'&&(!rules.length&&!(r.nationwide===true&&typeof r.nationwideQuote==='string'&&r.nationwideQuote.length>0&&r.nationwideQuote.length<=500)||rules.length!==(r.rules||[]).length))return base;
    if(r.status==='verified'&&r.nationwide===true&&rules.length)return base;
    if(r.status==='expired'&&!(typeof r.expirationQuote==='string'&&r.expirationQuote.length>0&&r.expirationQuote.length<=500))return base;
    return{...base,status:['verified','conditional','expired'].includes(r.status)?r.status:'needs-review',checkedAt:r.checkedAt,expiresAt:r.expiresAt,sourceUrl:source,rules,conditions,nationwide:r.nationwide===true,nationwideQuote:String(r.nationwideQuote||'').slice(0,500)};
  }
  function priorityIdentifiers(rows,context,selected){
    return prioritize(grouped(rows),context.rows,selected,context).filter(x=>['ready','next'].includes(x.match?.kind)&&x.geo.kind!=='outside').slice(0,8).map(x=>x.url);
  }
  async function submitPriorities(){
    if(!feed||!window.BTBonusAuth?.connected?.())return;
    const context=trackerContext(),offers=priorityIdentifiers(feed.offers,context,area),signature=JSON.stringify(offers);
    if(signature===lastPriority&&Date.now()-lastPriorityAt<300000)return;
    lastPriority=signature;lastPriorityAt=Date.now();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    try{
      const send=token=>fetch(AVAILABILITY_API+'/api/bank-bonus-availability/priorities',{method:'POST',credentials:'omit',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({offers}),signal:controller.signal});
      let response=await send(await window.BTBonusAuth.token());if(response.status===401)response=await send(await window.BTBonusAuth.token(true));
      if(!response.ok)lastPriorityAt=Date.now()-240000;
    }catch{lastPriorityAt=Date.now()-240000;}finally{clearTimeout(timeout);}
  }
  async function refreshOfficial(){
    if(window.BTICloudBackup?.isLocalOnly?.())return;
    if(officialBusy)return;
    officialBusy=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(AVAILABILITY_API+'/public/bank-bonus-availability',{credentials:'omit',cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('Unavailable');const data=await response.json();
      if(data.schemaVersion!==1||!['pending','complete','unavailable'].includes(data.status)||!data.records||typeof data.records!=='object'||Array.isArray(data.records)||Object.keys(data.records).length>200)throw Error('Invalid catalog');
      officialCatalog=data.status==='pending'?{...data,records:{...(officialCatalog?.records||{}),...data.records}}:data;officialError=data.status==='unavailable'?'Official availability checks are unavailable; personal eligibility remains unconfirmed.':'';
      await submitPriorities();
    }catch{officialError='Official availability could not update. Expired evidence will not be shown as verified.';}
    finally{clearTimeout(timeout);officialBusy=false;if(typeof tab!=='undefined'&&tab==='bonuses')R();}
  }

  function geography(offer,selected){
    const proof=offer.officialAvailability||availabilityFor(offer,officialCatalog);
    if(proof?.status==='expired')return{kind:'expired',label:'Official offer ended',detail:proof.reason,proof};
    if(proof?.status==='verified'&&Object.hasOwn(states,selected)){
      const outside=proof.rules.some(r=>r.mode==='include'&&!r.states.includes(selected)||r.mode==='exclude'&&r.states.includes(selected));
      return{kind:outside?'outside':proof.conditions.length?'conditional':proof.nationwide?'nationwide':'listed',label:outside?'Officially outside your area':proof.conditions.length?'Additional requirements':states[selected]+' · official scope',detail:outside?'The official promotion excludes your selected state.':proof.conditions.length?'State scope matches; membership, county, ZIP or other restrictions still need review.':'Official geographic scope matches your state. Personal and current-offer eligibility still need review.',proof};
    }
    if(proof&&['conditional','stale'].includes(proof.status))return{kind:'unknown',label:proof.status==='stale'?'Official check expired':'Additional requirements',detail:proof.reason,proof};
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
    if(nationwide&&!exception)return{kind:'nationwide',label:'Reported nationwide',detail:limited?'Source reports nationwide availability; additional access restrictions need review.':'Source reports nationwide availability; personal eligibility still needs review.'};
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
    const classification=offerAudience(offer);
    const investment=/\b(?:investing|investment|brokerage|wealth)\b/i.test(offer.title);
    const audience=classification==='business'?'business':'personal';
    const matches=rows.filter(e=>e&&e.bank&&titleMatches(e,offer.title,context)&&context.audience(e)===audience);
    if(!matches.length)return null;
    const families=new Set(matches.map(e=>context.family(e.bank)));
    if(families.size!==1)return{kind:'review',label:'Bank match needs review',detail:'Several tracked institutions match this headline.',date:''};
    const bank=matches[0].bank;
    if(classification==='unverified')return{kind:'review',bank,label:'Product type needs review',detail:'Confirm consumer, business, and product scope before comparing bank history.',date:''};
    if(investment)return{kind:'review',bank,label:'Different product may apply',detail:'This investment or wealth offer needs a separate product review.',date:''};
    if(matches.some(e=>!e.closed))return{kind:'review',bank,label:'Account still open',detail:'An open '+audience+' account is in your tracker. Review current-customer restrictions.',date:''};
    if(matches.some(e=>context.nonrepeat(e)))return{kind:'review',bank,label:'Non-repeatable in tracker',detail:'Your completed offer is non-repeatable under its recorded terms. Do not assume a new headline changes that rule.',date:''};
    const dates=matches.map(e=>context.ready(e));
    if(dates.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d||'')||!Number.isFinite(Date.parse(d+'T12:00:00Z'))||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d))return{kind:'review',bank,label:'Tracker date needs review',detail:'The tracker does not provide a supported repeat-review date for every matching account.',date:''};
    const date=dates.sort().at(-1); // Multiple tracked cycles: keep the latest restriction.
    const ready=date<=context.today;
    return{kind:ready?'ready':'next',bank,date,label:ready?'Tracker date reached':'Next tracker review',detail:'Tracker review date '+date+'. Confirm the new offer’s terms, account type and eligibility before applying.'};
  }
  // Conservative ranking: no source supports claiming PERSONAL bonus eligibility.
  // A confirmed tracker review date only clears one potential lookback blocker.
  // Strong official state coverage + no known blockers leads, then monetary value.
  function rankingAmount(offer){
    const verified=amountFor(offer);
    if(Number.isFinite(verified)&&verified>0)return{value:verified,proven:true,ceiling:!!offer?.rewardIsUpperBound};
    const sourceReported=Number.isSafeInteger(offer?.amount)&&offer.amount>0?offer.amount:null;
    return{value:sourceReported,proven:false,ceiling:!!offer?.rewardIsUpperBound};
  }
  function offerFit(offer,geo,match){
    const audience=offerAudience(offer);
    const blocked=geo.kind==='outside'||geo.kind==='expired'
      ||match?.kind==='next'||match?.kind==='review';
    const official=geo.proof?.status==='verified'&&geo.proof?.conditions?.length===0
      &&['listed','nationwide'].includes(geo.kind);
    if(blocked)return{level:3,kind:'blocked',reason:'Current eligibility or geographic scope requires attention.'};
    if(audience==='unverified')return{level:2,kind:'review',reason:'Product audience is not confirmed.'};
    const changedOffer=offer.evidence?.changed===true||(offer.evidence?.changes||[]).length>0
      ||(offer.badges||[]).some(b=>['New','Increased','Updated'].includes(b));
    if(changedOffer){
      const fields=offer.evidence?.fields||{};
      const fullSourceReview=amountFor(offer)!==null&&!offer.evidence?.stale&&!offer.evidence?.changed
        &&!(offer.evidence?.changes||[]).length&&fields.eligibility&&fields.qualifying_activity
        &&(fields.monthly_fee||fields.fee_waiver);
      if(!fullSourceReview)return{level:2,kind:'review',reason:'New or changed promotion: verify current official reward, fees and eligibility before ranking it as a top match.'};
    }

    if(official)return{level:0,kind:'review-first',reason:'Official state coverage matches and no known tracker restriction blocks review. Personal bonus eligibility remains unverified.'};
    return{level:1,kind:'possible',reason:'Review current promotion, location, customer exclusions and qualifying requirements before applying.'};
  }
  function prioritize(rows,tracker,selected,context,filter='all'){
    return rows.map((offer,index)=>{
      const geo=geography(offer,selected),match=trackerMatch(offer,tracker,context);
      const fit=offerFit(offer,geo,match),reward=rankingAmount(offer);
      const group=geo.kind==='outside'?'outside':
        match?.kind==='next'?'next':match?.kind==='review'?'review':
        fit.kind==='review-first'?'best':fit.kind==='review'?'review':'explore';
      return{...offer,geo,match,fit,reward,priorityGroup:group,index};
    }).filter(x=>x.geo.kind!=='expired'&&(filter==='all'||filter==='tracker'&&!!x.match||filter==='area'&&x.geo.kind!=='outside'))
      .sort((a,b)=>{
        const groupOrder={best:0,explore:1,next:2,review:3,outside:4};
        const g=groupOrder[a.priorityGroup]-groupOrder[b.priorityGroup];
        if(g)return g;
        if(a.priorityGroup==='next'){
          const dateCompare=(a.match?.date||'9999').localeCompare(b.match?.date||'9999');
          if(dateCompare)return dateCompare;
        }
        // Exact official reward proof outranks an unverified headline; within
        // comparable evidence, higher bonus dollars always come first.
        if(a.reward.proven!==b.reward.proven)return Number(b.reward.proven)-Number(a.reward.proven);
        if(a.reward.ceiling!==b.reward.ceiling)return Number(a.reward.ceiling)-Number(b.reward.ceiling);
        if(a.reward.value===null&&b.reward.value!==null)return 1;
        if(b.reward.value===null&&a.reward.value!==null)return -1;
        if(a.reward.value!==b.reward.value)return (b.reward.value||0)-(a.reward.value||0);
        if(a.priorityGroup==='best'&&a.match?.kind!==b.match?.kind)return a.match?.kind==='ready'?-1:b.match?.kind==='ready'?1:0;
        const recency=(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0);
        return recency||a.index-b.index;
      });
  }
  function trackerContext(){
    try{return {rows:typeof entries!=='undefined'?entries:[],family:name=>typeof normalizeBankFamily==='function'?normalizeBankFamily(name):normalize(name),audience:e=>typeof entryBankType==='function'&&entryBankType(e)==='B'?'business':'personal',nonrepeat:e=>typeof isNonRepeatableEntry==='function'&&isNonRepeatableEntry(e),ready:e=>typeof window.churnReadyDate==='function'?window.churnReadyDate(e):'',today:typeof td==='function'?td():new Date().toISOString().slice(0,10)};}catch{return{rows:[]};}
  }
  window.btRadarAudienceChanged=function(next){if(next==='personal'&&categoryFilter==='business')categoryFilter='all';};
  window.btRadarOpenFilters=function(){const d=document.querySelector('.bt362-offer-filter-disclosure');if(!d)return;d.open=true;filtersExpanded=true;d.scrollIntoView?.({block:'nearest'});d.querySelector?.('select')?.focus?.({preventScroll:true});};
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
    const filters=document.querySelector('.bt362-offer-filter-disclosure'),sources=document.querySelector('.bt362-about-sources');
    if(filters)filtersExpanded=filters.open;
    if(sources)sourceExpanded=sources.open;
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
    loading=true;attempted=true;error='';refreshOfficial();
    if(typeof R==='function'&&typeof tab!=='undefined'&&tab==='bonuses')R();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch('./data/bank-bonuses.json',{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('Feed unavailable');
      const data=await response.json();feed=valid(data);if(data.availability?.schemaVersion===1&&(!officialCatalog||officialCatalog.status==='pending'))officialCatalog={...data.availability,...(officialCatalog||{}),records:{...(data.availability.records||{}),...(officialCatalog?.records||{})}};submitPriorities();
    }catch{error='Could not check for updates. '+(feed?'Showing the last loaded feed.':'Reconnect to load the bank bonus feed.');}
    finally{clearTimeout(timeout);loading=false;if(typeof R==='function'&&typeof tab!=='undefined'&&tab==='bonuses')R();}
  }
  window.btRefreshBankBonuses=refresh;
  window.btRadarOfferPill=function(value){
    if(!['all','checking','savings','business','near'].includes(value))return;
    categoryFilter=value;
    if(value==='business'&&window.BT360?.audience==='personal')window.BT360?.setAudience('all');
    else R();
  };
  window.rBankBonuses=function(){
    if(!attempted){attempted=true;setTimeout(refresh,0);}
    const audience=['all','personal','business'].includes(window.BT360?.audience)?window.BT360.audience:'all';
    const scoped=feed?offersForAudience(feed.offers,audience):[];
    const audienceCount=feed?grouped(scoped).length:0;
    let h='<div class="bt362-offer-head"><div class="bt362-offer-headline"><h2>Bank offers</h2><p>'+escape(states[area]||'Location not selected')+(feed?' · '+audienceCount+' offer'+(audienceCount===1?'':'s')+' · '+checkedAge(feed.checkedAt):' · update pending')+'</p></div><button type="button" class="ph-mini ph-save" onclick="btRefreshBankBonuses()" '+(loading?'disabled':'')+'>'+(loading?'Checking…':'Check updates')+'</button></div>'+(window.BT360?.segments()||'');
    const sourceStale=!!(feed&&(!Number.isFinite(Date.parse(feed.checkedAt))||Date.now()-Date.parse(feed.checkedAt)>86400000));
    const sourceFailed=!!(feed?.sources?.some(s=>s.status!=='ok'));
    if(sourceStale||sourceFailed||error||officialError)h+='<div class="bt362-offer-stale" role="status"><span>'+escape(error||officialError||(sourceStale?'Source information is stale. Review dates before applying.':'Some source updates are unavailable.'))+'</span><button type="button" onclick="btRefreshBankBonuses()">Refresh</button></div>';
    if(!feed)return h+'<p role="status">'+(loading?'Loading offers…':'Offers are unavailable.')+'</p>';
    const proofs=feed.offers.map(o=>availabilityFor(o,officialCatalog));
    const checked=proofs.filter(p=>p&&['verified','conditional','expired'].includes(p.status)).length;
    h+='<details class="bt362-about-sources"'+(sourceExpanded?' open':'')+'><summary>About sources</summary><div class="bt362-about-body"><p>'+checked+' of '+feed.offers.length+' posts have current official scope evidence'+(officialCatalog?.status==='pending'?' · checking…':'')+'. Checks run hourly and evidence expires after 24 hours. Verify your own eligibility before applying.</p><p>Priority checks submit public offer links only, never private tracker records.</p>';
    if(feed.sources.length)h+='<div class="radar-sources">'+feed.sources.map(s=>'<p>'+escape(s.name)+' · '+(s.status==='ok'?'Checked':'Update unavailable')+(s.checkedAt?' '+escape(new Date(s.checkedAt).toLocaleString()):' · no successful check yet')+'</p>').join('')+'</div>';
    if(officialError)h+='<p>'+escape(officialError)+'</p>';
    h+='</div></details>';
    h+='<input id="radar-search" class="sinput bt362-search" aria-label="Search banks and offers" placeholder="Search bank bonuses…" value="'+escape(query)+'" oninput="btRadarSearch(this.value,this.selectionStart)">';
    h+='<div class="bt360-offer-pills" role="group" aria-label="Offer types">'+[['all','All'],['checking','Checking'],['savings','Savings'],['business','Business'],['near','Near me']].map(([v,label])=>'<button type="button" aria-pressed="'+(categoryFilter===v)+'" class="'+(categoryFilter===v?'active':'')+'" onclick="btRadarOfferPill(\''+v+'\')">'+label+'</button>').join('')+'</div>';
    h+='<details class="bt362-offer-filter-disclosure"'+(filtersExpanded?' open':'')+'><summary>Offer filters</summary><section class="radar-filters radar-personal-filters" aria-label="Offer preferences"><div class="radar-filter-grid"><div><label for="radar-area">Your area</label><select id="radar-area" onchange="btRadarArea(this.value)"><option value=""'+(!area?' selected':'')+'>Choose a state</option>'+Object.entries(states).map(([code,name])=>'<option value="'+code+'"'+(area===code?' selected':'')+'>'+name+'</option>').join('')+'</select></div><div><label for="radar-availability">Availability</label><select id="radar-availability" onchange="btRadarAvailability(this.value)">'+[['all','All bank offers'],['nationwide','Reported nationwide'],['regional','Reported regional'],['unknown','Availability unclear']].map(([v,l])=>'<option value="'+v+'"'+(availabilityFilter===v?' selected':'')+'>'+l+'</option>').join('')+'</select></div></div><div class="radar-priority-tabs" role="group" aria-label="Offer priority">'+[['all','For you'],['tracker','Churn matches'],['area','Hide out-of-area']].map(([v,l])=>'<button type="button" aria-pressed="'+(priorityFilter===v)+'" onclick="btRadarPriority(\''+v+'\')">'+l+'</button>').join('')+'</div><p>Smart default: official area match, no known tracker blocker, then highest documented bonus. Personal eligibility must be confirmed.</p></section></details>';
    const context=trackerContext();
    if(window.BT360)context.rows=context.rows.filter(e=>window.BT360.scope(e));
    const upcoming=context.rows.filter(e=>e.closed&&!context.nonrepeat(e)&&context.ready(e)).sort((a,b)=>context.ready(a).localeCompare(context.ready(b)));
    const names=[...new Set(upcoming.map(e=>e.bank))].slice(0,3);
    if(names.length)h+='<div class="radar-quick radar-churn-shortcuts" aria-label="Your churn list">'+names.map(name=>'<button type="button" class="ph-mini" onclick="btRadarSearch('+escape(JSON.stringify(context.family(name)))+')">'+escape(name)+'</button>').join('')+'<button type="button" class="ph-mini" onclick="btRadarSearch(\'\')">All banks</button></div>';
    else h+='<div class="radar-quick"><button type="button" class="ph-mini" onclick="btRadarSearch(\'\')">All banks</button></div>';
    if(!feed.offers.length)return h+'<p>No bank offers available.</p>';
    let matches=filtered(scoped,query,availabilityFilter,{evidence:evidenceFilter,fees:feeFilter,activity:activityFilter,amount:amountFilter});
    matches=matches.filter(offer=>matchesCategory(offer,categoryFilter));
    if(categoryFilter==='near'&&area)matches=matches.filter(x=>geography(x,area).kind!=='outside');
    const visible=prioritize(matches,context.rows,area,context,priorityFilter);
    h+='<div class="radar-count">'+visible.length+' matching offers · '+escape(audience==='all'?'Personal + Business':audience)+' view · '+feed.offers.length+' source posts checked <button type="button" class="bt362-filter-jump" onclick="btRadarOpenFilters()">Filters</button></div>';
    if(!visible.length)h+='<p>No offers match these filters. Adjust your search or filters.</p>';
    const groupLabels={best:'Top matches · highest bonus first',next:'Tracker cooldown pending',explore:'More bonuses · eligibility unverified',review:'Requirements need review',outside:'Outside your selected area'};
    let lastGroup='';
    const counts={};visible.forEach(offer=>{counts[offer.priorityGroup]=(counts[offer.priorityGroup]||0)+1});
    visible.forEach(x=>{
      if(x.priorityGroup!==lastGroup){
        if(lastGroup)h+='</div>';
        lastGroup=x.priorityGroup;
        h+='<div class="bt362-group-title"><h2 class="radar-group-heading">'+groupLabels[lastGroup]+'</h2><span>'+counts[lastGroup]+'</span></div>'+(lastGroup==='best'?'<p class="bt362-group-note">Official state coverage checked · no known tracker blocker. These are not confirmed personal eligibility; verify the exact terms.</p>':lastGroup==='next'?'<p class="bt362-group-note">Your tracker review date is still in the future. This is not a new offer approval.</p>':lastGroup==='explore'?'<p class="bt362-group-note">Source-reported amounts and availability are not yet enough to confirm eligibility.</p>':'');
        h+='<div class="bt362-offer-group" role="list">';
      }
      const link=x.links[0],date=x.match?.date;
      const verifiedAmount=amountFor(x);
      const verifiedRequirement=x.evidence?.status==='evidence-found'&&!x.evidence?.stale?x.evidence.fields?.qualifying_activity?.value:null;
      const bankLabel=(x.bank||'').replace(/\b\w/g,c=>c.toUpperCase()).replace(/^Us Bank$/,'U.S. Bank');
      const label=bankLabel&&x.product&&x.amount!==null?bankLabel+' · '+(x.product==='checking'?'Checking':x.product==='business'?'Business':x.product==='savings'?'Savings':x.product)+' · '+(x.rewardIsUpperBound?'up to ':'')+'\u0024'+x.amount.toLocaleString('en-US'):x.title;
      const type=offerAudience(x);
      const typeLabel=audience==='all'?'<span class="bt3628-kind '+(type==='business'?'business':type==='personal'?'personal':'unverified')+'">'+escape(type==='unverified'?'Type unverified':type==='business'?'Business':'Personal')+'</span>':'';
      const badges=x.badges?.length?'<div class="radar-offer-badges">'+x.badges.map(b=>'<span>'+escape(b)+'</span>').join('')+(x.changeLabel?'<span>'+escape(x.changeLabel)+'</span>':'')+'</div>':'';
      h+='<article role="listitem" class="radar-card radar-card-compact bt362-offer-row radar-priority-'+x.priorityGroup+'"><div class="bt360-offer-title">'+bankLogo(x.bank||x.title,true)+'<div class="bt360-grow"><h3>'+escape(label)+'</h3>'+typeLabel+badges+'<p>'+escape(verifiedRequirement||'Requirements need review')+'</p></div><strong>'+(verifiedAmount===null?(x.amount===null?'Needs review':'$'+x.amount.toLocaleString('en-US')+'*'):'$'+verifiedAmount.toLocaleString('en-US'))+'</strong></div><div class="radar-card-meta"><span class="radar-geo radar-geo-'+x.geo.kind+'">'+escape(x.geo.label)+'</span>'+(x.match?'<span class="radar-match-label">Tracker match</span>':'')+(offerAudience(x)==='unverified'?'<span class="radar-match-label">Product type unverified</span>':'')+'</div>';
      if(x.match)h+='<div class="radar-tracker-context"><b>'+escape(x.match.label)+'</b>'+(date?'<time datetime="'+date+'">'+escape(typeof fD==='function'?fD(date):date)+'</time>':'')+'<p>'+escape(x.match.detail)+'</p></div>';
      h+='<p class="radar-area-note">'+escape(x.geo.detail)+'</p>';
      const proof=x.geo.proof||availabilityFor(x,officialCatalog);
      if(proof?.sourceUrl){let body='';for(const q of [...(proof.rules||[]).map(r=>r.quote),...(proof.nationwideQuote?[proof.nationwideQuote]:[]),...(proof.conditions||[])])body+='<blockquote>'+escape(q)+'</blockquote>';body+='<a href="'+escape(proof.sourceUrl)+'" target="_blank" rel="noopener noreferrer">Official promotion ↗</a>';h+=disclosure('availability:'+x.url,'Official check · '+new Date(proof.checkedAt).toLocaleString(),body).replace('class="mobile-disclosure"','class="mobile-disclosure radar-official-proof"');}
      const sourceKey='offer-source:'+x.url;
      h+='<details class="radar-offer-original" data-radar-key="'+escape(sourceKey)+'"'+(evidenceOpen.has(sourceKey)?' open':'')+' ontoggle="btRadarEvidenceToggle('+escape(JSON.stringify(sourceKey))+',this.open,this)"><summary>Original headline &amp; sources</summary><p>'+escape(x.title)+'</p>'+(verifiedAmount===null&&x.amount!==null?'<p>* Headline amount is source-reported; verify official terms before applying.</p>':'')+'</details>';
      h+='<p class="bt362-source-line">'+escape(x.source)+' · '+escape(new Date(x.publishedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'}))+'</p>';
      h+=(x.links?.length?x.links:[link]).map(l=>'<a class="radar-offer-link" href="'+escape(l.url)+'" target="_blank" rel="noopener noreferrer">Review offer · '+escape(l.source)+' ↗</a>').join('')+'</article>';
    });
    if(lastGroup)h+='</div>';
    return h;
  };
  window.BTBankBonusFeed={validate:valid,group:grouped,filter:filtered,offerAudience,offersForAudience,matchesCategory,checkedAge,evidence:evidenceFor,amount:amountFor,rankingAmount,offerFit,geography,match:trackerMatch,prioritize,availability:availabilityFor,priorityIdentifiers};
  // While the tab stays open, refresh the published snapshot without re-entering anything.
  const officialPoll=setInterval(()=>{if(typeof tab!=='undefined'&&tab==='bonuses')refreshOfficial();},60000);
  if(officialPoll&&typeof officialPoll.unref==='function')officialPoll.unref();
  const poll=setInterval(()=>{if(typeof tab!=='undefined'&&tab==='bonuses')refresh();},15*60*1000);
  if(poll&&typeof poll.unref==='function')poll.unref();
})();
