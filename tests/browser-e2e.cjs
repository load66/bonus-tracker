'use strict';
// Actual DOM, file chooser, download, localStorage, and service-worker coverage.
// Each engine gets a new isolated context; this never connects to production data.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const output=process.env.BT_BROWSER_RESULTS||path.join(process.env.RUNNER_TEMP||'/tmp','bonus-tracker-browser-results');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
let serverUnavailable=false,feedInvalid=false;
const radarFixture={schemaVersion:2,checkedAt:'2026-10-09T12:00:00Z',sources:[{id:'doc',status:'ok',checkedAt:'2026-10-09T12:00:00Z'},{id:'fm',status:'unavailable',checkedAt:null},{id:'hmb',status:'ok',checkedAt:'2026-10-09T12:00:00Z'}],offers:[{title:'Synthetic Checking $500 Bonus <img src=x onerror=alert(1)>',url:'https://www.doctorofcredit.com/synthetic-checking-bonus/',publishedAt:'2026-10-08T12:00:00Z'},{title:'Wells Fargo $325 Checking Bonus (Nationwide)',url:'https://www.hustlermoneyblog.com/wells-fargo-bonus/',publishedAt:'2026-10-08T12:00:00Z',availability:'nationwide',groupKey:'wells fargo 325 checking nationwide'},{title:'U.S. Bank $450 Checking Bonus',url:'https://frequentmiler.com/us-bank-bonus/',publishedAt:'2026-10-08T12:00:00Z',availability:'unknown'},{title:'[CA only] Regional E2E Bank $250 Checking Bonus',url:'https://www.doctorofcredit.com/regional-e2e-bank/',publishedAt:'2026-10-08T12:00:00Z',availability:'regional'}]};
radarFixture.verification={schemaVersion:1,status:'complete',records:{'https://www.hustlermoneyblog.com/wells-fargo-bonus/':{offerTitle:radarFixture.offers[1].title,offerUrl:radarFixture.offers[1].url,status:'evidence-found',officialCheckedAt:'2026-10-11T16:00:00Z',aiCheckedAt:'2026-10-11T16:00:00Z',reason:'Source quotations require full applicability review.',fields:{bonus:{value:'$325',quote:'Receive a $325 bonus.',sourceUrl:'https://accountoffers.wellsfargo.com/checkingoffer/',sourceHash:'a'.repeat(64)}}}}};
const server=http.createServer(async(req,res)=>{
  if(serverUnavailable){req.socket.destroy();return}
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/data/bank-bonuses.json'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(feedInvalid?{schemaVersion:99}:radarFixture));return}
    const filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!filename.startsWith(root+path.sep))throw Error('Invalid path');
    const body=await fs.readFile(filename);
    res.writeHead(200,{'content-type':mime[path.extname(filename)]||'application/octet-stream'});res.end(body);
  }catch{res.writeHead(404,{'content-type':'text/plain'});res.end('Not found')}
});
const payload={kind:'BonusTrackerEntry',schemaVersion:2,
  verification:{promoSourceUrl:'https://example-bank.test/promo',feeScheduleSourceUrl:'https://example-bank.test/fees',termsVerifiedAt:'2026-09-25'},
  entry:{bank:'E2E Verification Bank',accountType:'personal',bonus:325,opened:'2026-01-31',
    churn:'1',churnable:true,churnability:'repeatable',churnBasis:'bonus',sourceEligibilityBasis:'bonus-received',
    churnPeriodValue:12,churnPeriodUnit:'months',reqDays:90,requiredDaysText:'$500 in qualifying deposits within 90 calendar days after opening',
    dataPoint:'Employer DD',payoutTimingText:'Within 30 calendar days after requirements are met',
    closeRestrictionType:'payout-only',closeRuleText:'Keep the account open until the bonus posts.',
    earlyCloseFee:0,earlyTerminationFeeText:'No early closing fee.',
    notes:'Synthetic verification record only',customTimers:[],
    tcSourceRaw:'E2E Verification Bank checking promotional terms. This offer is for eligible new consumer checking customers. Not eligible if you received a checking bonus within the past 12 months. Complete qualifying deposit requirements within 90 calendar days after opening. Keep the account open until the bonus posts.',
    eligibilityRules:[{id:'bonus-12m',basis:'bonus-received',periodValue:12,periodUnit:'months',scope:'consumer-checking',evidenceText:'Not eligible if you received a checking bonus within the past 12 months.',evidenceSource:'official-promotion-terms'}]
  }};

// Every authenticated terms request stays in the synthetic browser context.
// Keep real hash/readback semantics instead of suppressing console failures.
function installTermsFixture(){
  const prior=window.fetch.bind(window),objects=new Map();
  window.__termsFixture={uploads:0,hashVerified:0};
  window.fetch=async(input,options={})=>{
    const url=String(typeof input==='string'?input:input?.url||input);
    const endpoint='https://api-production-00f74.up.railway.app/api/bonus-tracker/terms';
    if(!url.startsWith(endpoint))return prior(input,options);
    const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
    if(options.method==='POST'){
      const packet=JSON.parse(options.body);
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(packet.snapshot));
      const digest=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
      window.__termsFixture.uploads++;
      if(digest!==packet.sha256)return response({detail:'Synthetic hash mismatch'},400);
      window.__termsFixture.hashVerified++;
      const saved={id:digest,sha256:digest,verified:true,snapshot:packet.snapshot};
      objects.set(digest,saved);return response(saved);
    }
    const id=url.slice(endpoint.length).split('?')[0].replace(/^\//,'');
    if(id)return response(objects.get(id)||{detail:'Synthetic snapshot missing'},objects.has(id)?200:404);
    return response({terms:Array.from(objects.values(),item=>({id:item.id,...JSON.parse(item.snapshot)})),nextOffset:null});
  };
}

async function exercise(name,engine,url){
  const browser=await engine.launch();
  const context=await browser.newContext({acceptDownloads:true,timezoneId:'America/Chicago',viewport:{width:1280,height:900}});
  await context.tracing.start({screenshots:true,snapshots:true});
  const page=await context.newPage(),errors=[],warnings=[],checks=[];
  await page.addInitScript(installTermsFixture);
  page.on('pageerror',err=>errors.push(String(err)));
  page.on('console',msg=>{if(msg.type()==='warning')warnings.push(msg.text());if(msg.type()==='error'&&!/Failed to load resource|net::ERR|404 \(Not Found\)/i.test(msg.text()))errors.push(msg.text())});
  await page.addInitScript(()=>{const RealDate=Date;const now=Date.parse('2026-10-11T17:00:00Z');window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}});
  // Never contact live owner-only Railway usage during synthetic auth tests.
  // Install for every document so service-worker reloads remain fully mocked.
  await page.addInitScript(()=>{
    const previousFetch=window.fetch.bind(window);
    window.fetch=(input,options={})=>{
      const url=String(typeof input==='string'?input:input?.url||input);
      if(url.split('?')[0].endsWith('/api/bonus-tracker/usage'))return Promise.resolve(new Response(JSON.stringify({
        month:'2026-10',checkedAt:'2026-10-11T17:00:00Z',
        railway:{status:'not_configured',services:[],costSoFar:null,projectedMonthEnd:null},
        r2:{status:'unavailable',usedBytes:null,freeBytes:10000000000}
      }),{status:200,headers:{'Content-Type':'application/json'}}));
      return previousFetch(input,options);
    };
  });
  await page.addInitScript(()=>{
    const native=window.fetch.bind(window);window.__availabilityPriorityRequests=[];
    window.fetch=async function(input,options={}){
      const url=String(input);
      if(url.includes('/public/bank-bonus-availability')){
        const title='Wells Fargo $325 Checking Bonus (Nationwide)',offerUrl='https://www.hustlermoneyblog.com/wells-fargo-bonus/';
        return new Response(JSON.stringify({schemaVersion:1,status:'complete',records:{[offerUrl]:{offerTitle:title,offerUrl,status:'verified',checkState:'checked',checkedAt:'2026-10-11T16:00:00Z',expiresAt:'2026-10-12T16:00:00Z',sourceUrl:'https://accountoffers.wellsfargo.com/checkingoffer/',sourceHash:'a'.repeat(64),nationwide:true,nationwideQuote:'This offer is available nationwide.',rules:[],conditions:[]}}}),{status:200,headers:{'Content-Type':'application/json'}});
      }
      if(url.includes('/api/bank-bonus-availability/priorities')){window.__availabilityPriorityRequests.push(JSON.parse(options.body));return new Response(JSON.stringify({accepted:true,count:JSON.parse(options.body).offers.length}),{status:200});}
      return native(input,options);
    };
  });
  await page.addInitScript(()=>{
    const native=window.fetch.bind(window);window.__retiredBackupRequests=[];
    window.fetch=(input,options)=>{const url=String(typeof input==='string'?input:input?.url||input);
      if(/\/api\/bonus-tracker\/(?:backups|terms|usage)(?:[/?]|$)/.test(url)){window.__retiredBackupRequests.push(url);return Promise.resolve(new Response('{}',{status:503}));}
      return native(input,options);
    };
  });
  // Observe every app DOM replacement, including the instant before BT360
  // exists; a snapshot after load alone cannot catch a legacy first-paint flash.
  await page.addInitScript(()=>{
    window.__btPaintAudit={legacy:false,redesign:false,firstAppRender:''};
    const inspect=()=>{
      const root=document.getElementById('app'),audit=window.__btPaintAudit;
      if(!root||!audit)return;
      if(root.querySelector('.ops-hero,.bt360-legacy-actions'))audit.legacy=true;
      if(root.querySelector('.bt360-hero'))audit.redesign=true;
      if(!audit.firstAppRender&&root.querySelector('.hdr')){
        audit.firstAppRender=root.querySelector('.bt360-segments')?'redesign':'legacy';
      }
    };
    new MutationObserver(inspect).observe(document,{childList:true,subtree:true});
  });
  const button=text=>page.getByRole('button',{name:text,exact:true});
  const openAccounts=async()=>{const reveal=page.locator('.bt3641-directory button');if(await reveal.count())await reveal.click();};
  const openAdvancedActions=async()=>{await openAccounts();const more=page.getByRole('button',{name:'More account actions'});if(await more.count()){await more.click();return}const row=page.locator('.bt366-compact-row').first();if(await row.count()){await row.click();await page.getByRole('button',{name:'More account actions'}).click();}};
  const wait=async fn=>{await page.waitForFunction(fn,{},{timeout:15000})};
  // Startup wrappers and controller renders are scheduled through 1.8 seconds.
  // Wait beyond that initialization window after navigation; retain all assertions.
  const settleStartup=async()=>{await page.waitForTimeout(2200);await page.waitForFunction(()=>window.__btFullRegressionReport&&!window.__btFullRegressionReport.pending);};
  const record=async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bt_e_v4')||'[]')[0]);
  const check=(label,condition)=>{assert.ok(condition,label);checks.push(label)};
  const importEntry=async object=>{
    await page.locator('.bt362-add-fab').click();await button('Quick Add').click();
    const chooser=page.waitForEvent('filechooser');
    await page.getByRole('button',{name:/Import Entry File JSON/}).click();
    await (await chooser).setFiles({name:'verification.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(object))});
    await page.waitForSelector('#bt_confirm_overlay,.bt-toast.error');
    if(await page.locator('.bt-toast.error').count())throw Error(await page.locator('.bt-toast.error').innerText());
    await button('Review Entry').click();
    await page.getByRole('heading',{name:'Add account',exact:true}).waitFor();
  };
  const edit=async()=>{
    // The simplified bank detail has a direct Edit action. Opening the old
    // secondary-action sheet is no longer part of the everyday workflow.
    if(!await page.locator('.bt360-detail-footer').getByRole('button',{name:'Edit',exact:true}).count()){
      await page.evaluate(()=>{if(entries.length){expanded=entries[0].id;tab=entries[0].closed?'archive':'tracker';R()}});
    }
    await page.locator('.bt360-detail-footer').getByRole('button',{name:'Edit',exact:true}).click();
  };
  const cancelEditor=async()=>{
    await button('Cancel').click();
    const discard=page.getByRole('button',{name:'Discard changes',exact:true});
    if(await discard.count())await discard.click();
    await page.locator('.guided-modal').waitFor({state:'detached'});
  };
  const close=async()=>{
    const action=page.getByRole('button',{name:/^Record closure/});
    if(!await action.count())await page.evaluate(()=>{expanded=entries[0].id;tab='tracker';R()});
    if(await action.count())await action.click();
    else{await page.getByRole('button',{name:'More account actions'}).click();await page.getByRole('button',{name:/Record closure/}).click();}
    check('closure records facts in one simple modal',await page.locator('.close-modal #cp_date').isVisible()&&await page.locator('.close-modal #cp_closed_confirm').isVisible()&&await page.getByRole('button',{name:'Save closure'}).isVisible());
    await page.locator('#cp_date').fill('2026-05-01');
    await page.locator('#cp_monthly_checked').check();
    await page.locator('#cp_closed_confirm').check();
    check('closure history stays available without crowding the modal',await page.evaluate(()=>renderArchiveHistoryReview(closeCycleForSave(entries[0],closePrompt)).includes('archive-history-review')));
    check('closure screen does not claim cloud protection',(await page.locator('.close-modal').innerText()).includes('updates BonusTracker, not your bank'));
    for(const width of [320,390,430]){
      await page.setViewportSize({width,height:844});
      check('simple closure fits '+width+'px',await page.locator('.close-modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
      check('closure checkboxes align beside wrapped text '+width+'px',await page.locator('.close-modal .bt-simple-check').evaluateAll(rows=>rows.length===2&&rows.every(row=>{const input=row.querySelector('input'),text=row.querySelector('span');if(!input||!text)return false;const a=input.getBoundingClientRect(),b=text.getBoundingClientRect();return a.width===20&&a.height===20&&b.left>=a.right+8&&Math.abs((a.top+a.height/2)-(b.top+b.height/2))<=1})));
      if(width===390)await page.screenshot({path:path.join(output,name+'-closure-history-review-390.png')});
    }
    await page.setViewportSize({width:390,height:844});
    await button('Save closure').click();
    check('closure transaction preserves exact cycle and enrolled sources',await page.evaluate(()=>{
      const e=entries[0],saved=loadTermsArchive()[termsArchiveKey(e)].current;
      return saved.entryId===e.id&&['opened','closed','bonusRecd','reqMet','tcSourceRaw','feeScheduleRaw'].every(k=>String(saved[k]||'')===String(e[k]||''));
    }));
    check('closure success avoids false cloud assurance',await page.evaluate(()=>!cfm.msg.includes('Cloud verified')&&!cfm.msg.includes('Core records saved locally.')));
    await button('OK').click();
    check('temporary Undo action reserves space outside account controls',await page.evaluate(()=>{
      const bar=document.querySelector('.undo-bar'),scroll=document.querySelector('.scroll');
      return !!bar&&scroll.getBoundingClientRect().bottom<=bar.getBoundingClientRect().top+1;
    }));
  };
  try{
    await page.goto(url);await settleStartup();
    check('first visible Tracker paint never uses legacy dashboard',await page.evaluate(()=>window.__btPaintAudit?.redesign===true&&window.__btPaintAudit?.legacy===false&&window.__btPaintAudit?.firstAppRender==='redesign'));
    await page.getByText('No accounts yet',{exact:true}).waitFor();
    check('year selector is a single pill and zero-count stages hidden',await page.locator('#bt362-year').count()===1&&await page.locator('.yr-btn').count()===0&&await page.locator('.bt360-stage').count()===0);
    check('Tracker floating add replaces bulky Quick Add bar',await page.locator('.bt362-add-fab').isVisible()&&await page.locator('.tracker-quick-actions').count()===0);
    for(const width of [320,375,390,430,1024]){
      await page.setViewportSize({width,height:844});
      check('Add bonus has reserved space outside card scrolling at '+width+'px',await page.evaluate(()=>{
        const scroll=document.querySelector('.scroll').getBoundingClientRect(),dock=document.querySelector('.bt3652-add-dock').getBoundingClientRect(),add=document.querySelector('.bt362-add-fab').getBoundingClientRect(),tabs=document.querySelector('.tabs').getBoundingClientRect();
        return scroll.bottom<=dock.top+1&&add.top>=dock.top&&add.bottom<=tabs.top&&add.height>=44&&add.width>=44&&document.documentElement.scrollWidth<=innerWidth;
      }));
      check('unselected earnings summary is compact at '+width+'px',await page.locator('.bt360-hero').evaluate(e=>e.getBoundingClientRect().height<=230));
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('.bt362-add-fab').focus();
    await page.keyboard.press('Enter');
    await wait(()=>document.activeElement?.textContent==='Quick Add');
    check('keyboard Add opens focused options with expanded disclosure',await page.locator('.bt362-add-fab').getAttribute('aria-expanded')==='true'&&await page.locator('#bt-add-actions').isVisible());
    await page.keyboard.press('Tab');
    check('Add options follow normal Tab order',await page.evaluate(()=>document.activeElement?.textContent==='Review promo terms'));
    await page.keyboard.press('Escape');
    await wait(()=>document.activeElement?.classList.contains('bt362-add-fab'));
    check('Escape dismisses Add options and restores its trigger',await page.locator('#bt-add-actions').count()===0&&await page.locator('.bt362-add-fab').getAttribute('aria-expanded')==='false');
    await page.keyboard.press('Space');
    await wait(()=>document.activeElement?.textContent==='Quick Add');
    await page.locator('.bt362-add-fab').focus();await page.keyboard.press('Escape');
    await wait(()=>document.activeElement?.classList.contains('bt362-add-fab'));
    check('Escape also closes disclosure from the Add trigger',await page.locator('#bt-add-actions').count()===0);
    await page.locator('.bt362-add-fab').click();await button('Quick Add').click();
    check('Quick Add scrolls its real panel into view',await page.locator('#bt-quick-add-panel').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.top<innerHeight&&r.bottom>0}));
    await page.evaluate(()=>{window.__btQuickAddBeforeWatch=document.getElementById('bt-quick-add-panel')});
    await page.evaluate(()=>window.BTQuickAddCatalog.refreshWatch(true));
    check('official source refresh preserves Quick Add panel and scroll anchor',
      await page.evaluate(()=>document.getElementById('bt-quick-add-panel')===window.__btQuickAddBeforeWatch));
    await page.setViewportSize({width:390,height:844});
    check('Quick Add is a focused view without overlapping Add or dashboard summary',await page.locator('.bt362-add-fab,.tracker-overview,#tracker-search').count()===0);
    check('Quick Add has a visible touch-sized close button',await page.getByRole('button',{name:'Close Quick Add',exact:true}).evaluate(e=>e.getBoundingClientRect().height>=44));
    await page.screenshot({path:path.join(output,name+'-quick-add-390.png')});
    await page.getByRole('button',{name:'Close Quick Add',exact:true}).click();
    check('Quick Add close returns to dashboard',await page.locator('#bt-quick-add-panel').count()===0&&await page.locator('.bt362-add-fab').isVisible());
    await page.locator('.bt362-add-fab').click();await button('Review promo terms').click();
    check('Review promo terms scrolls its analyzer into view',await page.locator('#bt-promo-terms-panel').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.top<innerHeight&&r.bottom>0&&!!e.querySelector('#az_input')}));
    check('promo terms is a focused view without overlapping Add or account search',await page.locator('.bt362-add-fab,.tracker-overview,#tracker-search').count()===0);
    const storageBeforeInvalidTerms=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await button('Review terms').click();
    check('invalid promo terms shows inline error and focuses the textarea',await page.locator('#bt3655-terms-feedback.is-error').isVisible()&&await page.locator('#az_input').evaluate(e=>document.activeElement===e&&e.getAttribute('aria-invalid')==='true'));
    check('invalid promo terms keeps accounts unchanged',await page.evaluate(before=>localStorage.getItem('bt_e_v4')===before,storageBeforeInvalidTerms));
    const termsDraft=require('./fixtures/financial-rules.cjs').fixture().tcSourceRaw;
    await page.locator('#az_input').fill(termsDraft);
    check('editing pasted terms clears inline error without losing the draft',await page.locator('#az_input').inputValue()===termsDraft&&await page.locator('#bt3655-terms-feedback.is-error').count()===0);
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      check('promo terms input fits and avoids iPhone zoom at '+width+'px',await page.locator('#az_input').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&parseFloat(getComputedStyle(e).fontSize)>=16&&document.documentElement.scrollWidth<=innerWidth));
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,name+'-promo-terms-390.png')});
    await page.getByRole('button',{name:'Close promo terms',exact:true}).click();
    await page.locator('.bt362-add-fab').click();await button('Review promo terms').click();
    check('closing promo terms preserves the pasted draft',await page.locator('#az_input').inputValue()===termsDraft);
    await button('Review terms').click();
    check('full terms review has a dark surface and visible header close',await page.locator('#tca_overlay .tca-box').evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(16, 19, 27)')&&await page.getByRole('button',{name:'Close terms review',exact:true}).isVisible());
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      check('full terms review fits '+width+'px',await page.locator('#tca_overlay .tca-box').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth));
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,name+'-terms-review-390.png')});
    await page.locator('#tca_raw').fill(termsDraft+' Edited draft.');
    await page.getByRole('button',{name:'Close terms review',exact:true}).click();
    check('full review returns edited draft to the terms panel',await page.locator('#az_input').inputValue()===termsDraft+' Edited draft.');
    check('closing full terms review leaves accounts unchanged',await page.evaluate(()=>entries.length===0&&modal===null));
    await button('Close').click();
    // Applying source-backed fields stages an editable account but must not persist
    // sources, change canonical closure rules or save an account prematurely.
    await page.locator('.bt362-add-fab').click();await button('Review promo terms').click();
    await page.locator('#az_input').fill(termsDraft);
    // The earlier assertions exercise the actual Review Terms button. For this
    // separate draft-apply scenario, open the identical wizard directly to
    // avoid a WebKit second-open transition race.
    await page.evaluate(raw=>window.tcOpenPro(raw),termsDraft);
    await page.locator('#tca_overlay .az-verifybar').waitFor({state:'visible'});
    check('automation explains source-backed preselection and draft-only behavior',
      await page.locator('.az-verifybar').innerText().then(t=>t.includes('preselected from source text'))
      &&await page.getByRole('button',{name:'Apply selected to draft'}).isVisible());
    const preEditedReviewStorage=await page.evaluate(()=>JSON.stringify([...Array(localStorage.length).keys()].map(i=>[localStorage.key(i),localStorage.getItem(localStorage.key(i))]).sort((a,b)=>a[0].localeCompare(b[0]))));
    await page.locator('#tca_raw').fill(termsDraft+' Updated qualification wording must be analyzed again.');
    check('editing reviewed source disables stale field and timer approval',
      await page.locator('#tc_apply_btn').isDisabled()&&await page.locator('#tc_timer_btn').isDisabled()
      &&await page.locator('#az_apply_status').innerText().then(t=>t.includes('Analyze terms again')));
    check('stale apply guard cannot create an account or write source archives',
      await page.evaluate(before=>{
        const out=tcApplyReviewed();
        return out===false&&modal===null&&entries.length===0
          &&JSON.stringify([...Array(localStorage.length).keys()].map(i=>[localStorage.key(i),localStorage.getItem(localStorage.key(i))]).sort((a,b)=>a[0].localeCompare(b[0])))===before;
      },preEditedReviewStorage));
    await page.getByRole('button',{name:'Analyze terms'}).click();
    check('fresh analysis re-enables reviewed field and timer actions',
      await page.locator('#tc_apply_btn').isEnabled()&&await page.locator('#tc_timer_btn').isEnabled());
    const originalAutomationPolicy=await page.evaluate(()=>modal?.closeRestrictionType??'manual-review');
    check('review starts without an active account edit',await page.evaluate(()=>modal===null));
    await page.locator('[data-tcf-field]').evaluateAll(items=>items.forEach(el=>{el.checked=el.getAttribute('data-tcf-field')==='bank'}));
    await page.locator('[data-tcf-timer]').evaluateAll(items=>items.forEach(el=>{el.checked=false}));
    const priorAutomatedData=await page.evaluate(()=>JSON.stringify([...Array(localStorage.length).keys()].map(i=>[localStorage.key(i),localStorage.getItem(localStorage.key(i))]).sort((a,b)=>a[0].localeCompare(b[0]))));
    await page.getByRole('button',{name:'Apply selected to draft'}).click();
    const stagedDraftState=await page.evaluate(()=>({
      hasModal:!!modal,hasSource:!!modal?.tcSourceRaw,opened:modal?.opened,
      closeFee:modal?.earlyCloseFee,closePolicy:modal?.closeRestrictionType,
      entriesLength:entries.length,bank:modal?.bank,hasAnalysis:!!modal?.analysis
    }));
    check('approved fields open an editable draft without inferred fee or closure clearance: '+JSON.stringify(stagedDraftState),
      stagedDraftState.hasModal&&stagedDraftState.hasSource&&!stagedDraftState.opened&&stagedDraftState.closeFee===null&&stagedDraftState.closePolicy===originalAutomationPolicy&&stagedDraftState.entriesLength===0);
    check('automated review does not commit account data or source archive before Save',
      await page.evaluate(before=>JSON.stringify([...Array(localStorage.length).keys()].map(i=>[localStorage.key(i),localStorage.getItem(localStorage.key(i))]).sort((a,b)=>a[0].localeCompare(b[0])))===before,priorAutomatedData));
    await page.getByRole('button',{name:'Close account editor'}).click();
    if(await page.getByRole('button',{name:'Discard changes'}).count())await page.getByRole('button',{name:'Discard changes'}).click();
    check('discarding automated draft preserves zero account records',await page.evaluate(()=>entries.length===0&&modal===null));
    await page.evaluate(()=>{analyzerText='';analyzerResult=null;});
    check('cloud protection status is compact',await page.locator('#bt-cloud-open').evaluate(e=>{
      const box=e.getBoundingClientRect(),style=getComputedStyle(e);
      return box.height<=32&&style.maxWidth==='42%'&&style.backgroundColor==='rgba(0, 0, 0, 0)'&&!e.innerText.includes('Current data verified in the cloud');
    }));

    const beforeNotifications=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await button('Notifications').click();
    check('header bell opens read-only notification center',await page.getByRole('dialog',{name:'Notification center'}).isVisible()&&await page.getByText('No upcoming reminders in the selected categories.').isVisible());
    await page.getByRole('button',{name:'Close notifications'}).click();
    check('notification center leaves records unchanged',await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,beforeNotifications));
    // v3.6.82 real DOM test: prioritization, exact bank navigation and
    // review-only churn plan, without touching the saved account database.
    {
      const prior=await page.evaluate(()=>{
        const old={entries,expanded,tab,stored:localStorage.getItem('bt_e_v4')},today=td();
        const tomorrow=addD(today,1),second=addD(today,2);
        const entriesForTest=[
         {id:'SYN-ALERT-DD',bank:'Synthetic Deadline Bank',accountType:'personal',opened:addD(today,-2),
          reqDays:3,completeBonusText:'Receive qualifying direct deposits.',customTimers:[],checklist:[]},
         {id:'SYN-ALERT-BONUS',bank:'Synthetic Bonus Bank',accountType:'business',opened:addD(today,-20),
          reqMet:addD(today,-3),payoutTimingText:'Bonus review',
          customTimers:[{id:'pay',kind:'payout',text:'Bonus payout review',date:second,done:false}],checklist:[]},
         {id:'SYN-ALERT-HISTORY',bank:'Synthetic History Bank',closed:addD(today,-15),
          opened:addD(today,-50),bonusRecd:addD(today,-30),customTimers:[],checklist:[]}];
        entries=entriesForTest;expanded=null;tab='tracker';R();return old;
      });
      await button('Notifications').click();
      const alerts=page.getByRole('dialog',{name:'Notification center'});
      check('reminder center uses calculated due and payout review',
        await alerts.getByText('Requirement due soon',{exact:true}).count()===1&&
        await alerts.getByText('Review expected payout',{exact:true}).count()===1);
      check('reminder center excludes unverified churn eligibility',
        !(await alerts.innerText()).includes('Synthetic History Bank'));
      check('reminders explicitly avoid promising push notifications',
        (await alerts.innerText()).includes('No background or push delivery'));
      for(const width of [320,375,390,430]){
        await page.setViewportSize({width,height:844});
        check('reminders fit mobile '+width+'px',
          await alerts.evaluate(e=>e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth));
        if(width===390)await page.screenshot({path:path.join(output,name+'-reminder-center-390.png')});
      }
      await page.getByRole('button',{name:'Close notifications'}).click();
      await page.evaluate(()=>{tab='archive';R()});
      check('Archive contains no manual churn review list when there are no official-source matches',
        await page.locator('.bt3682-plan').count()===0&&
        !(await page.locator('#app').innerText()).includes('Next reopening reviews'));
      // Mock only the last UI projection. Separate unit tests verify all
      // official-source, audience, churn, expiry and fee gates.
      await page.evaluate(()=>{
        window.__savedAutoMatcher=window.BTBankBonusFeed.automaticChurnMatches;
        window.BTBankBonusFeed.automaticChurnMatches=()=>[{
          bank:'Synthetic History Bank',audience:'personal',bonus:325,
          officialUrl:'https://accountoffers.wellsfargo.com/checkingoffer/'
        }];R();
      });
      check('automation surfaces an offer, never a review task',
        await page.locator('.bt3683-auto-offers').innerText().then(t=>
          t.includes('New bonus matches')&&t.includes('Synthetic History Bank')&&
          t.includes('potential signup bonus')&&!t.includes('Rule review needed')));
      check('automatic offer uses a safe official link',
        await page.locator('.bt3683-auto-offers a.bt3683-offer-link').getAttribute('href')===
        'https://accountoffers.wellsfargo.com/checkingoffer/');
      for(const width of [320,375,390,430]){
        await page.setViewportSize({width,height:844});
        check('auto-matched offers fit mobile '+width+'px',
          await page.locator('.bt3683-auto-offers').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth));
      }
      await page.evaluate(()=>{
        window.BTBankBonusFeed.automaticChurnMatches=window.__savedAutoMatcher;
        delete window.__savedAutoMatcher;R();
      });
      check('auto-offer card disappears when verification cannot substantiate a match',
        await page.locator('.bt3683-auto-offers').count()===0);
      check('reminders and churn planning do not persist account records',
        await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x.stored,prior));
      await page.evaluate(old=>{entries=old.entries;expanded=old.expanded;tab=old.tab;R()},prior);
      await page.setViewportSize({width:1280,height:900});
    }
    check('Tracker loads without redundant Action Center disclosure',await page.locator('.bt360-legacy-actions').count()===0);
    await page.waitForFunction(()=>window.__btFullRegressionReport&&!window.__btFullRegressionReport.pending&&window.__btFullRegressionReport.total>=9&&window.__btFullRegressionReport.ok);
    const diagnostics=await page.evaluate(()=>window.btRunFullRegressionTests({force:true}));
    await fs.writeFile(path.join(output,name+'-diagnostics.json'),JSON.stringify(diagnostics,null,2));
    check('runtime self-tests pass',diagnostics.ok);
    await page.evaluate(()=>{openAdd();Object.assign(modal,{bank:'Browser Example Bank',accountType:'business',opened:'2026-01-31',churn:'2',churnable:true,churnability:'repeatable',sourceEligibilityBasis:'offer-enrollment',churnBasis:'enrollment'});R();});
    check('editor exposes six eligibility clocks',await page.locator('#elig-clock option').count()===7);
    await button('Use opening date').click();
    check('explicit enrollment copies opening',await page.locator('#elig-enrollment').inputValue()==='2026-01-31');
    await page.locator('#elig-enrollment').fill('2026-02-04');await page.locator('#elig-enrollment').press('Tab');
    check('enrollment date remains separate',await page.evaluate(()=>modal.offerEnrollmentDate==='2026-02-04'&&modal.couponEnrollmentDate==='2026-02-04'&&modal.opened==='2026-01-31'));
    await page.locator('.eligibility-tools > summary').click();
    await button('Add another restriction').click();
    check('multiple restrictions appear in real editor',await page.locator('.eligibility-restriction').count()===2);
    check('saved rules start collapsed',!await page.locator('#elig-rule-0-clock').isVisible());
    await page.locator('.eligibility-restriction > summary').first().click();
    await page.locator('#elig-rule-0-clock').selectOption('bonus-offer-received');
    check('rule stays expanded after changing clock',await page.locator('#elig-rule-0-anchor').isVisible());
    await page.locator('#elig-rule-0-anchor').fill('2026-02-01');await page.locator('#elig-rule-0-anchor').press('Tab');
    check('explicit rule date persists across rerender',await page.locator('#elig-rule-0-anchor').inputValue()==='2026-02-01');
    await page.locator('#elig-template').selectOption('combined');
    check('template appends without replacing existing rules',await page.locator('.eligibility-restriction').count()===4);
    check('template does not invent evidence',await page.evaluate(()=>modal.eligibilityRules[2].evidenceText===''&&modal.eligibilityRules[3].periodValue===12));
    await page.locator('#elig-customer').fill('Not eligible for current checking account owners.');await page.locator('#elig-customer').press('Tab');
    check('customer exclusion wording survives rerender',await page.locator('#elig-customer').inputValue()==='Not eligible for current checking account owners.');

    await button('Cancel').click();
    check('edited account requires explicit discard',await page.getByRole('button',{name:'Discard changes',exact:true}).isVisible());
    await page.getByRole('button',{name:'Discard changes',exact:true}).click();
    await page.locator('.guided-modal').waitFor({state:'detached'});
    const smartStoredBefore=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    check('smart sorter places highest supported candidate before known blockers',await page.evaluate(()=>{
      const api=window.BTBankBonusFeed;
      const proof={status:'verified',rules:[],conditions:[],nationwide:true};
      const cash=String.fromCharCode(36);
      const p='https://www.chase.com/synthetic-offer',f='https://www.chase.com/synthetic-fees';
      const full=n=>({status:'evidence-found',stale:false,checkedAt:new Date(Date.now()).toISOString(),
        sources:[{role:'promotion',url:p,hash:'a'.repeat(64)},{role:'fees',url:f,hash:'b'.repeat(64)}],
        fields:{bonus:{value:cash+n,sourceUrl:p},eligibility:{value:'new customers only',sourceUrl:p},
          qualifying_activity:{value:'qualifying activity',sourceUrl:p},
          monthly_fee:{value:'monthly fee applies',sourceUrl:f}}});
      const make=(bank,amount,scoped=true)=>({bank,title:bank+' '+cash+amount+' Checking Bonus',product:'checking',amount,
        groupKey:'test-smart-'+bank,publishedAt:'2026-10-09T12:00:00Z',availability:'unknown',
        evidence:full(amount),...(scoped?{officialAvailability:proof}:{})});
      const context={today:'2026-10-11',family:x=>x.toLowerCase(),audience:x=>x.accountType||'personal',
        nonrepeat:x=>false,ready:x=>x.reviewDate||''};
      const result=api.prioritize([make('Alpha',400),make('Beta',900),make('Gamma',2000,false),make('Delta',5000)],
        [{bank:'Delta',accountType:'personal',closed:'',reviewDate:'2026-01-01'}],'MO',context);
      return result[0].bank==='Beta'&&result[0].priorityGroup==='best'&&result[1].bank==='Alpha'
        &&result.find(x=>x.bank==='Delta').priorityGroup==='review'
        &&result.find(x=>x.bank==='Gamma').priorityGroup==='explore'
        &&api.completeOfferProof(make('Good',800))===true
        &&api.prioritize([ {...make('Missing',900),evidence:null} ],[],'MO',context)[0].priorityGroup==='explore';
    }));
    check('smart sort never updates saved financial records',await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,smartStoredBefore));
    await page.locator('.bt362-add-fab').click();await button('Quick Add').click();
    check('public source watch does not rewrite tracker data',await page.evaluate(async()=>{
      const before=localStorage.getItem('bt_e_v4'),api=window.BTQuickAddCatalog;
      const watch=await api.refreshWatch();
      return api.version===2&&watch?.schemaVersion===1&&Object.keys(watch.records||{}).length<=2&&Array.isArray(api.reviewQueue().issues)
        &&localStorage.getItem('bt_e_v4')===before;
    }));
    check('source catalog keeps reviewed offers scoped and other examples unverified',await page.evaluate(()=>{
      const c=window.BTQuickAddCatalog;
      const asOf=Date.parse('2026-10-20T15:00:00Z');
      return c?.status('Wells Fargo',asOf).kind==='expired'&&c?.status('Capital One',asOf).kind==='changed'
        &&c?.status('Wells Fargo').kind==='unverified'&&c?.status('Capital One').kind==='unverified'
        &&c?.status('Citi').kind==='unverified'&&c.reviewedSources(c.records['Capital One']).length===2
        &&c.status('Capital One',asOf).sources.every(x=>x.url.startsWith('https://www.capitalone.com/'));
    }));
    check('future-dated reviews remain unverified on a simulated earlier clock',await page.locator('#bt-quick-add-panel').innerText().then(t=>t.includes('Wells Fargo')&&t.includes('Past $325 · Unverified')&&t.includes('Capital One')&&t.includes('Past $250 · Unverified')));
    check('Quick Add Citi identity uses locally stored bank logo',await page.getByRole('button',{name:'Citi historical example, Unverified example',exact:true}).locator('img[src="./bank-logos/citi.svg"]').count()===1);
    await page.getByRole('button',{name:'Citi historical example, Unverified example',exact:true}).click();
    check('historical bonus/fees/requirements never enter a new draft',await page.evaluate(()=>modal?.bonus===0&&modal?.earlyCloseFee===null&&modal?.churn===''&&modal?.dataPoint===''&&modal?.reqDays===0&&modal?.monthlyFeeYNText===''&&modal?.notes===''));
    check('Quick Add never records an unconfirmed account opening date',await page.evaluate(()=>modal?.opened===''&&modal?._fromTemplate===true));
    check('sample offer warning appears before account details',await page.locator('.bt3657-template-note').isVisible()&&await page.locator('.guided-body').innerText().then(t=>t.includes('Historical example — not a verified offer')));
    check('unverified example does not invent official source links',await page.locator('.bt3659-source-list a').count()===0);
    check('Quick Add exposes bank/account/bonus',await page.locator('input[oninput*="\'bank\'"]').isVisible()&&await page.locator('select[onchange*="\'accountType\'"]').isVisible()&&await page.locator('input[oninput*="\'bonus\'"]').isVisible());
    await page.getByRole('button',{name:'Step 4: Review',exact:true}).click();check('historical template is not blocked by an eligibility verification gate',await button('💾 Add account').isEnabled());await cancelEditor();
    await importEntry(payload);
    check('import stops before saving',await page.evaluate(()=>JSON.parse(localStorage.getItem('bt_e_v4')).length===0));
    await page.getByRole('button',{name:'Step 2: Requirements',exact:true}).click();
    check('deadline wording is visible',await page.locator('input[oninput*="\'requiredDaysText\'"]').inputValue()===payload.entry.requiredDaysText);
    check('amount-first requirement description preserves 90-day deadline through review',await page.evaluate(()=>collectModalEntryData().reqDays===90));
    await page.getByRole('button',{name:'Step 4: Review',exact:true}).click();await button('💾 Add account').click();
    await wait(()=>JSON.parse(localStorage.getItem('bt_e_v4')).length===1);
    // v3.6.80: real click-through journey, fully isolated from stored account data.
    // A requirement-completed date is not an individual deposit or a paid bonus.
    const journeyRestore=await page.evaluate(()=>{
      const backup={
        entries:JSON.stringify(entries),expanded,tab,
        keys:getBackupStorageKeys().map(k=>[k,localStorage.getItem(k)]),
        tracker:localStorage.getItem('bt_e_v4')
      };
      const primary={
        id:'SYN-JOURNEY-DD',bank:'Synthetic Journey DD Bank',accountType:'personal',
        bonus:250,opened:'2026-09-12',reqDays:90,
        requiredDaysText:'90 calendar days',
        completeBonusText:'Receive $1,000 in qualifying direct deposits.',
        payoutTimingText:'Within 15 calendar days after requirements are met.',
        customTimers:[{id:'payout-journey',kind:'payout',text:'Bonus payout review',date:'2026-10-25',done:false}],
        checklist:[]
      };
      entries=[primary,{...primary,id:'SYN-JOURNEY-OTHER',bank:'Synthetic Journey Other Bank',
        completeBonusText:'Complete other qualifying deposits.',customTimers:[]}];
      tab='tracker';expanded=null;R();
      return backup;
    });
    check('journey starts with two independent banks in Needs you',
      await page.locator('[data-queue="needs"] [data-attention-id^="SYN-JOURNEY"]').count()===2);
    await page.locator('[data-attention-link="SYN-JOURNEY-OTHER"]').click();
    check('journey opens the selected bank directly',await page.locator('.bt360-detail-header h2').innerText()==='Synthetic Journey Other Bank');
    await page.evaluate(()=>BT360.back());
    await page.locator('[data-attention-link="SYN-JOURNEY-DD"]').click();
    check('journey opens the precise bank details without dashboard actions',
      await page.locator('.bt360-detail-header h2').innerText()==='Synthetic Journey DD Bank'&&
      await page.locator('[data-queue] .bt360-actions').count()===0);
    check('journey navigation never writes bank records',
      await page.evaluate(backup=>localStorage.getItem('bt_e_v4')===backup.tracker,journeyRestore));
    await page.evaluate(()=>openTaskDatapoints('SYN-JOURNEY-DD'));
    check('journey datapoint shortcut is restricted to the selected bank',
      await page.evaluate(()=>tab==='tips'&&dpTaskBankKey===datapointBankKey(entries[0])));
    check('journey research does not impersonate a verified personal deposit',
      await page.locator('.research-caveat').first().innerText().then(t=>t.includes('do not guarantee')));
    check('journey research is read-only for financial records',
      await page.evaluate(backup=>localStorage.getItem('bt_e_v4')===backup.tracker,journeyRestore));
    await page.evaluate(()=>{tab='tracker';expanded='SYN-JOURNEY-DD';R()});
    check('journey requires an all-requirements confirmation, never a single deposit',
      await page.locator('.bt360-detail-footer .bt360-primary').innerText()==='Mark requirements done');
    await page.locator('.bt360-detail-footer .bt360-primary').click();
    check('journey confirmation describes the actual milestone',
      await page.getByRole('dialog',{name:'Requirement completed'}).innerText().then(t=>t.includes('finish every requirement')));
    check('journey opening confirmation makes no financial changes',
      await page.evaluate(backup=>localStorage.getItem('bt_e_v4')===backup.tracker&&entries[0].reqMet===undefined,journeyRestore));
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    check('journey cancellation does not claim a completed requirement',
      await page.evaluate(()=>!entries[0].reqMet&&!entries[0].bonusRecd));
    await page.locator('.bt360-detail-footer .bt360-primary').click();
    await page.locator('#req_date').fill('2026-10-10');
    await page.getByRole('button',{name:'Save date',exact:true}).click();
    if(await page.getByRole('button',{name:'Save Anyway',exact:true}).count())
      await page.getByRole('button',{name:'Save Anyway',exact:true}).click();
    check('journey records only the explicitly approved requirements-met date',
      await page.evaluate(()=>entries[0].reqMet==='2026-10-10'&&
        !entries[0].bonusRecd&&
        JSON.parse(localStorage.getItem('bt_e_v4')||'[]').find(x=>x.id==='SYN-JOURNEY-DD')?.reqMet==='2026-10-10'));
    if(await page.getByRole('button',{name:'Review deposit result',exact:true}).count()){
      await page.getByRole('button',{name:'Review deposit result',exact:true}).click();
      check('journey optional datapoint review never assumes observed success',
        await page.evaluate(()=>dpEditor?.evidenceStage==='requirement'&&!dpEditor?.confirmedByUser));
      await page.getByRole('button',{name:'Not now',exact:true}).click();
    }else if(await page.getByRole('button',{name:'OK',exact:true}).count()){
      await page.getByRole('button',{name:'OK',exact:true}).click();
    }
    check('completed requirement switches directly to payout without repeating confirmation',
      await page.locator('.bt360-detail-footer .bt360-primary').innerText()==='Record bonus payment'&&
      await page.locator('.bt3810-status').innerText().then(t=>t.includes('Waiting for bonus'))&&
      await page.locator('.bt3810-dates').innerText().then(t=>t.includes('Oct 10, 2026')));
    // Saving the same confirmed date must not silently rewrite history.
    const savedCompletion=await page.evaluate(()=>{
      const e=entries.find(x=>x.id==='SYN-JOURNEY-DD');
      return {stored:localStorage.getItem('bt_e_v4'),history:JSON.stringify(e?.history||e?.activity||[])};
    });
    check('simple detail preserves Edit action',await page.locator('.bt360-detail-footer').getByRole('button',{name:'Edit',exact:true}).isVisible());
    await page.evaluate(()=>openReqMet('SYN-JOURNEY-DD'));
    check('completed account opens its existing saved date, not a blank confirmation',
      await page.locator('#req_date').inputValue()==='2026-10-10');
    await page.getByRole('button',{name:'Save date',exact:true}).click();
    check('saving unchanged date shows a clear Already saved response',
      await page.getByText('Already saved',{exact:true}).isVisible());
    await page.getByRole('button',{name:'OK',exact:true}).click();
    check('unchanged confirmation preserves saved records without a duplicate write',
      await page.evaluate(before=>{
        const e=entries.find(x=>x.id==='SYN-JOURNEY-DD');
        return localStorage.getItem('bt_e_v4')===before.stored&&JSON.stringify(e?.history||e?.activity||[])===before.history;
      },savedCompletion));
    await page.getByRole('button',{name:'Back to accounts'}).click();
    check('journey moves the completed bank from requirements to waiting for payment',
      await page.locator('[data-queue="waiting"] [data-attention-id="SYN-JOURNEY-DD"]').count()===1&&
      await page.locator('[data-queue="needs"] [data-attention-id="SYN-JOURNEY-OTHER"]').count()===1&&
      await page.locator('[data-queue="needs"] [data-attention-id="SYN-JOURNEY-DD"]').count()===0);
    check('journey never invents a bonus payment',
      await page.evaluate(()=>!entries[0].bonusRecd&&btNextActionForEntry(entries[0]).kind==='bonus'));
    await page.evaluate(backup=>{
      getBackupStorageKeys().forEach(k=>{if(!backup.keys.some(pair=>pair[0]===k))localStorage.removeItem(k)});
      backup.keys.forEach(([k,v])=>{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)});
      entries=JSON.parse(backup.entries);expanded=backup.expanded;tab=backup.tab;
      dpTaskBankKey='';dpEditor=null;reqPrompt=null;cfm=null;R();
    },journeyRestore);
    check('journey restores prior test records byte-for-byte',
      await page.evaluate(backup=>localStorage.getItem('bt_e_v4')===backup.tracker,journeyRestore));
    // v3.6.81: real mobile deposit evidence journey, not a synthetic payment or bank API.
    {
      const entry=require('./fixtures/financial-rules.cjs').fixture();
      const wording='Receive qualifying direct deposits totaling $1,000.';
      entry.id='SYN-LEDGER-BROWSER';entry.bank='Synthetic Ledger Bank';
      entry.tcSourceRaw+=' '+wording;
      entry.financialRules.requirements=[{id:'dd-ledger',accountId:'checking',kind:'direct-deposit',
        amount:1000,text:wording,evidence:{source:'promotion',quote:wording}}];
      entry.customTimers=[];entry.checklist=[];entry.reqMet='';entry.bonusRecd='';
      const saved=await page.evaluate(e=>{
        const previous={entries,expanded,tab,keys:getBackupStorageKeys().map(k=>[k,localStorage.getItem(k)])};
        entries=[e];expanded=e.id;tab='tracker';R();return previous;
      },entry);
      check('unrecorded direct deposits start at zero without a fake qualifying result',
        await page.evaluate(()=>depositProgress(entries[0]).recordedCount===0&&!entries[0].reqMet&&!entries[0].bonusRecd)
        &&await page.locator('.bt3810-deposit').isVisible());
      await page.setViewportSize({width:390,height:844});
      await page.getByRole('button',{name:'Add deposit',exact:true}).click();
      check('new deposit dialog does not invent an amount or date',
        await page.getByRole('dialog',{name:'Record direct deposit'}).isVisible()&&
        await page.locator('#dep_amount').inputValue()===''&&await page.locator('#dep_date').inputValue()==='');
      await page.locator('#dep_date').fill('2026-02-01');
      await page.locator('#dep_amount').fill('200.50');
      await page.locator('#dep_method').fill('Synthetic employer payroll');
      await page.getByRole('button',{name:'Save deposit',exact:true}).click();
      check('observed deposit records dollars without auto-confirmation',
        await page.evaluate(()=>depositProgress(entries[0]).totalCents===20050&&
          depositProgress(entries[0]).confirmedCents===0&&!entries[0].reqMet&&!entries[0].bonusRecd));
      await page.locator('.bt3810-recorded-deposits > summary').click();
      check('recorded amount is presented without claiming qualifying progress',
        await page.locator('.bt3681-ledger-total').innerText().then(x=>x.includes('$200.50 recorded')&&x.includes('$0 confirmed by you')));
      await page.locator('.bt3681-ledger-actions button').first().click();
      check('editing evidence requires explicit counted confirmation',
        await page.getByRole('dialog',{name:'Correct recorded deposit'}).isVisible()&&
        !await page.locator('#dep_confirmed').isChecked());
      await page.locator('#dep_confirmed').check();await page.getByRole('button',{name:'Save deposit'}).click();
      check('user-confirmed counted amount updates only the ledger',
        await page.evaluate(()=>depositProgress(entries[0]).confirmedCents===20050&&
          depositProgress(entries[0]).percent===20&&!entries[0].reqMet&&!entries[0].bonusRecd));
      check('single verified cumulative target has truthful percent and label',
        await page.locator('.bt3681-deposit-ledger [role="progressbar"]').getAttribute('aria-valuenow')==='20'&&
        await page.locator('.bt3681-deposit-ledger').innerText().then(t=>t.includes('20% tracked')));
      await page.locator('.bt3681-ledger-actions button').first().click();
      await page.locator('#dep_amount').fill('300');
      check('material edit clears prior counted attestation',
        !await page.locator('#dep_confirmed').isChecked());
      await page.getByRole('button',{name:'Save deposit'}).click();
      check('correcting a deposit does not retain stale accepted status',
        await page.evaluate(()=>depositProgress(entries[0]).totalCents===30000&&depositProgress(entries[0]).confirmedCents===0));
      await page.locator('.bt3681-ledger-actions button').nth(1).click();
      check('void asks for explicit approval',await page.locator('.cbox').isVisible());
      await page.locator('.cbox button.c-g,.cbox button.c-r').first().click();
      check('void excludes deposit from totals without deleting its history',
        await page.evaluate(()=>depositProgress(entries[0]).recordedCount===0&&
          entries[0].depositEvidence.length===1&&!!entries[0].depositEvidence[0].voidedAt));
      for(const width of [320,390,430]){
        await page.setViewportSize({width,height:844});
        check('deposit history and compact requirements fit '+width+'px',
          await page.locator('.bt3810-requirements').evaluate(el=>el.scrollWidth<=el.clientWidth+1&&
            document.documentElement.scrollWidth<=innerWidth));
      }
      await page.evaluate(previous=>{
        const valid=new Set(previous.keys.map(([k])=>k));
        getBackupStorageKeys().forEach(k=>{if(!valid.has(k))localStorage.removeItem(k)});
        previous.keys.forEach(([k,v])=>{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)});
        entries=previous.entries;expanded=previous.expanded;tab=previous.tab;depositPrompt=null;cfm=null;R();
      },saved);
      check('deposit journey restores all previous test storage',
        await page.evaluate(previous=>previous.keys.every(([k,v])=>localStorage.getItem(k)===v),saved));
    }
    check('Needs you uses unboxed PDF heading and standalone priority card',await page.locator('.bt3719-needs > .bt3719-section-title').count()===1&&await page.locator('.bt3641-attention-toggle').count()===1&&await page.locator('.bt3641-attention-item.is-selected').count()===0&&await page.locator('.bt3719-needs.bt360-panel').count()===0);
    check('v3.6.1 panel headings render badges instead of literal HTML',await page.locator('.bt360-panel-title').evaluateAll(rows=>rows.some(e=>e.querySelector('h3')?.textContent==='Needs you'&&e.querySelector('.bt360-count'))&&rows.every(e=>!e.querySelector('h3')?.textContent.includes('<span'))));
    check('90-day deadline is exact',await page.evaluate(()=>reqDeadline(entries[0]))==='2026-05-01');
    {
      const synthetic=require('./fixtures/financial-rules.cjs').fixture();
      const wording='Receive $1,000 in qualifying direct deposits within 90 calendar days of opening.';
      Object.assign(synthetic,{id:'SYN-SHARED-DEADLINE',opened:'2026-09-12',reqDays:3,requiredDaysText:'3 calendar days',customTimers:[],checklist:[]});
      synthetic.tcSourceRaw+=' '+wording;
      synthetic.financialRules.requirements=[{id:'deposits',accountId:'checking',kind:'direct-deposit',amount:1000,text:wording,timing:{basis:'opened',value:90,unit:'calendar-days'},evidence:{source:'promotion',quote:wording}}];
      const saved=await page.evaluate(e=>{
        const previous={entries,expanded,stored:localStorage.getItem('bt_e_v4')};
        entries=[e];expanded=e.id;R();return previous;
      },synthetic);
      check('shared structured deadline overrides legacy day counter',await page.evaluate(()=>reqDeadline(entries[0])==='2026-12-11'&&btNextActionForEntry(entries[0]).task.context.date==='2026-12-11'));
      check('simple requirement shows the exact structured deadline once',
        await page.locator('.bt3810-requirements').innerText().then(t=>t.includes('Direct deposits totaling $1,000')&&t.includes('Due Dec 11, 2026')));
      check('derived reminder remains correct but is not duplicated on the main screen',
        await page.evaluate(()=>BT360.timerRows(entries[0]).includes('Dec 11, 2026'))&&
        await page.locator('[data-source="saved-requirement"]').count()===0);
      await page.screenshot({path:path.join(output,name+'-shared-requirement-dates-390.png'),fullPage:true});
      check('shared deadline rendering preserves stored records',await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,saved.stored));
      await page.evaluate(previous=>{entries=previous.entries;expanded=previous.expanded;R();},saved);
    }
    {
      const recurring=require('./fixtures/financial-rules.cjs').fixture();
      Object.assign(recurring,{id:'SYN-DETAIL-SCHEDULE',bank:'Synthetic Schedule Bank',opened:'2026-09-12',customTimers:[],checklist:[]});
      const saved=await page.evaluate(e=>{
        const old={entries,expanded,tab,stored:localStorage.getItem('bt_e_v4')};
        e.customTimers=[{id:'next-deposit',kind:'requirement',text:e.financialRules.requirements[0].text,date:addD(td(),10),done:false}];
        entries=[e];tab='tracker';expanded=e.id;R();return old;
      },recurring);
      const schedule=recurring.financialRules.requirements[0].text;
      check('bank detail retains the complete recurring schedule',await page.locator('.bt3810-requirements').innerText().then(t=>t.includes(schedule)&&t.includes('consecutive calendar months')));
      const detailDate=await page.locator('.bt3818-task-date').innerText();
      check('bank detail shows a confirmed next-deposit deadline',detailDate.startsWith('Deposit deadline: '));
      check('bank detail calls checkbox progress checked',await page.locator('.bt3810-requirements .bt3810-heading').innerText().then(t=>t.includes('0 of 1 checked')));
      for(const width of [320,375,390,430,1280]){
        await page.setViewportSize({width,height:900});
        check('full recurring wording and date fit '+width+'px',await page.locator('.bt3810-requirements').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth));
      }
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:path.join(output,name+'-detail-schedule-390.png')});
      await page.getByRole('button',{name:'Back to accounts',exact:true}).click();
      check('dashboard and bank details show the same next-deposit deadline',await page.locator('[data-attention-id="SYN-DETAIL-SCHEDULE"] .bt3729-task-meta').innerText().then(t=>t.endsWith(detailDate)));
      check('viewing schedule and navigating makes no storage writes',await page.evaluate(old=>localStorage.getItem('bt_e_v4')===old.stored,saved));
      await page.evaluate(old=>{entries=old.entries;expanded=old.expanded;tab=old.tab;R()},saved);
    }
    {
      const make=require('./fixtures/financial-rules.cjs').fixture;
      const opportunity=Object.assign(make(),{id:'SYN-QUEUE-OFFER',bank:'Synthetic Opportunity CU',bonusRecd:'2025-07-01',closed:'2025-08-01'});
      const cooling=Object.assign(make(),{id:'SYN-QUEUE-SOON',bank:'Synthetic Upcoming CU',bonusRecd:'2025-11-01',closed:'2026-08-01'});
      const rows=[{id:'SYN-QUEUE-ACTION',bank:'Synthetic Action Bank',accountType:'personal',bonus:100,opened:'2026-10-10',reqDays:15,customTimers:[],checklist:[]},
        {id:'SYN-QUEUE-PAYOUT',bank:'Synthetic Payout Bank',accountType:'personal',bonus:200,opened:'2026-08-01',reqMet:'2026-10-10',payoutTimingText:'Payout review on October 25.',customTimers:[{id:'payout',kind:'payout',text:'Bonus payout',date:'2026-10-25'}],checklist:[]},
        {id:'SYN-QUEUE-HOLD',bank:'Synthetic Hold Bank',accountType:'personal',bonus:300,opened:'2026-09-01',bonusRecd:'2026-10-10',minHoldDays:90,closeRuleBasis:'opened',closeRuleSource:'manual',closeRestrictionType:'minimum-open',closeRuleText:'Keep the account open for 90 days after opening.',earlyCloseFee:25,earlyTerminationFeeText:'$25 early closing fee within 90 days.',customTimers:[],checklist:[]},opportunity,cooling];
      const saved=await page.evaluate(rows=>{const old={entries,expanded,tab,stored:localStorage.getItem('bt_e_v4')};entries=rows;expanded=null;tab='tracker';R();return old;},rows);
      check('Needs you counts actionable work only',await page.locator('[data-queue="needs"] .bt360-count').innerText()==='1 task');
      check('Waiting separates future payout and hold periods',await page.locator('[data-queue="waiting"] [data-attention-link]').count()===2);
      check('Opportunities is separate from required tasks',await page.locator('[data-queue="opportunities"] [data-attention-link]').count()===1);
      check('upcoming cooldown appears once in Eligible soon',await page.locator('[data-attention-id="SYN-QUEUE-SOON"]').count()===0&&await page.locator('.bt3719-soon').innerText().then(t=>t.includes('Synthetic Upcoming CU')));
      check('payout and hold dates use precise labels',await page.locator('[data-queue="waiting"]').innerText().then(t=>t.includes('Expected by')&&t.includes('Keep open until')));
      for(const key of ['needs','waiting','opportunities']){
        for(const width of [320,375,390,430]){
          await page.setViewportSize({width,height:844});
          check(key+' queue fits '+width+'px',await page.locator('[data-queue="'+key+'"]').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth));
          check(key+' bank cards retain full touch targets at '+width+'px',await page.locator('[data-queue="'+key+'"] [data-attention-link]').evaluateAll(rows=>rows.length>0&&rows.every(e=>e.getBoundingClientRect().height>=44)));
          check(key+' bank cards contain no action buttons at '+width+'px',await page.locator('[data-queue="'+key+'"] .bt360-actions').count()===0);
        }
        await page.setViewportSize({width:390,height:844});
        await page.locator('[data-queue="'+key+'"]').scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output,name+'-queue-'+key+'-390.png')});
        const target=await page.locator('[data-queue="'+key+'"] [data-attention-link]').first().getAttribute('data-attention-link');
        await page.locator('[data-queue="'+key+'"] [data-attention-link]').first().click();
        check('bank card opens exact details across '+key+' group',await page.evaluate(id=>expanded===id,target));
        check('bank details begin at the bank heading across '+key+' group',await page.evaluate(()=>document.querySelector('.scroll').scrollTop<=1&&document.activeElement===document.querySelector('.bt360-detail-header h2')));
        await page.evaluate(()=>BT360.back());
      }
      check('dashboard grouping leaves stored account records unchanged',await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,saved.stored));
      await page.evaluate(old=>{entries=old.entries;expanded=old.expanded;tab=old.tab;R();},saved);
    }
    const beforeDisclosure=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    check('Tracker no longer displays the legacy Action Center',await page.locator('.bt360-legacy-actions').count()===0);
    check('account directory is collapsed by default',await page.locator('.bt366-compact-row').count()===0);
    check('dashboard bank cards expose no separate action buttons',await page.locator('[data-queue] .bt360-actions').count()===0);
    await openAccounts();
    check('Tracker shows compact account row, not old full card',await page.locator('.bt366-compact-row').count()===1&&await page.locator('.bt366-compact-row .card-mini-chip').count()===0);
    {await openAccounts();await page.locator('.bt366-compact-row').first().click();}
    await page.setViewportSize({width:390,height:844});
    check('one simple status card replaces the five-step strip',
      await page.locator('.bt360-detail-header').count()===1&&
      await page.locator('.bt3810-status').count()===1&&
      await page.locator('.bt360-steps,.bt3686-account-extras').count()===0);
    check('simple screen has one dates card and no technical disclosures',
      await page.locator('.bt3810-dates').count()===1&&
      await page.locator('.bt360-detail-card details').count()===0);
    check('in-progress account cannot record a bonus as received without confirmation',
      await page.locator('.bt360-detail-footer .bt360-primary').innerText().then(t=>t==='Mark requirements done'||t==='Review requirements'));
    check('account actions open from one menu, not an Advanced view',
      await page.getByRole('button',{name:'More account actions'}).count()===1);
    check('fixed action bar stays outside the scrolling card',
      await page.locator('.bt360-detail-footer').evaluate(e=>e.parentElement?.id==='app'&&!e.closest('.scroll')));
    const beforeManage=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await page.getByRole('button',{name:'More account actions'}).click();
    const manage=page.getByRole('dialog',{name:'Account actions'});
    check('simple menu is accessible and contains no nested Advanced controls',
      await manage.isVisible()&&await manage.locator('.bt-ba-more,.bt366-advanced-actions,details').count()===0);
    check('simple menu keeps Edit and protected deletion',
      await manage.getByText('Edit account',{exact:true}).count()===1&&
      await manage.locator('.bt-ba-delete .bt-ba-mini').count()===1);
    for(const width of [320,390,430]){
      await page.setViewportSize({width,height:844});
      await manage.locator('.bt-ba-delete .bt-ba-mini').scrollIntoViewIfNeeded();
      check('simple menu fits '+width+'px',await manage.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    }
    await manage.locator('.bt-ba-delete .bt-ba-mini').click();
    check('delete requires a second confirmation and keeps all bank records',
      await page.locator('.cbox').isVisible()&&await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,beforeManage));
    await button('Cancel').click();
    await page.getByRole('button',{name:'More account actions'}).click();
    await page.getByRole('button',{name:'Close account actions'}).click();
    check('dismissed menu restores the primary action without data changes',
      await page.locator('.bt360-detail-footer').isVisible()&&await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,beforeManage));
    await page.setViewportSize({width:390,height:844});

    // Synthetic Chase v3.6.11 reference — in memory only, never written to storage.
    await page.evaluate(()=>{
      const e=entries[0];
      window.__chaseViewBaseline=JSON.stringify(e);
      Object.assign(e,{
        id:'CHA-P-01',bank:'Chase Total Checking',bonus:300,opened:'2026-10-15',
        reqDays:90,requiredDaysText:'$500 in qualifying deposits within 90 calendar days after opening',
        financialRules:{
          requirements:[{id:'direct-deposits',kind:'direct-deposit',amount:10000,
            text:'Qualifying direct deposits totaling $10,000 within 90 days.',
            timing:{basis:'opened',unit:'calendar-days',value:90}}],
          accounts:[{role:'primary',fee:{amount:15,waiver:{operator:'any',
            evidence:{quote:'Original terms: fee waived with electronic deposits, daily balance or linked checking.'},
            conditions:[{kind:'direct-deposit',amount:500,text:'Electronic deposits'},
              {kind:'balance-hold',amount:1500,metric:'minimum-daily-balance',text:'Daily balance'},
              {kind:'relationship',text:'Linked checking'}]}}}],
          closure:{earlyCloseFee:null}
        },
        checklist:[],monthlyFeeAmountText:'$15',closeRestrictionType:'manual-review',closeRuleBasis:'manual',closeRuleText:'',
        monthlyFeeWaiverText:'Original terms: fee waived with electronic deposits, daily balance or linked checking.',
        earlyTerminationFeeText:'',
        customTimers:[{id:'bonus-90',text:'Bonus requirement deadline · original reminder to qualify',
          date:'2027-01-13',startDate:'2026-10-15',daysRequired:90,done:false}],
        reqMet:'',bonusRecd:'',minHoldDays:0
      });
      expanded=e.id;R();
    });
    check('Chase qualifying deposit requirement stays actionable',
      await page.locator('.bt3810-task').first().innerText().then(t=>
       t.includes('Direct deposits totaling $10,000')&&t.includes('Due Jan 13, 2027')));
    check('individual requirement has a checkbox, not fabricated deposit progress',
      await page.locator('.bt3810-task [role="checkbox"]').count()===1&&
      await page.locator('.bt3810-task [role="checkbox"]').getAttribute('aria-checked')==='false');
    check('simple dates preserve unknown milestones',
      await page.locator('.bt3810-dates').innerText().then(t=>t.includes('Key dates')&&t.includes('—')));
    check('active bank hides the empty Closed field and keeps three dates',
      await page.locator('.bt3810-dates').evaluate(el=>
       el.classList.contains('bt3810-dates--open')&&
       el.querySelectorAll('dt').length===3&&
       !Array.from(el.querySelectorAll('dt')).some(dt=>dt.textContent.trim()==='Closed')));

    check('unknown closing fees are hidden without changing the monthly fee',
      await page.locator('.bt3810-fees').innerText().then(t=>t.includes('$15')&&!t.includes('Closing early')&&!t.includes('Not confirmed')));
    check('documented, zero, conditional and unknown closing fees create no bank-detail row',
      await page.evaluate(()=>{
        const original=entries[0],saved=JSON.stringify(original),stored=localStorage.getItem(SK);
        const cases=[null,0,25,400].map(fee=>({...original,earlyCloseFee:fee,
          financialRules:{...original.financialRules,closure:{...original.financialRules?.closure,earlyCloseFee:fee,
            feeEvidence:{quote:fee===0?'No early closing fee.':'$'+fee+' early closing fee.'}}}}));
        return cases.every(e=>{
          const panel=BT360.detailPanels(e);
          return panel.includes('<span>Monthly fee</span>')&&!/Closing early|Early closing fee|early-close fee/.test(panel);
        })&&JSON.stringify(original)===saved&&localStorage.getItem(SK)===stored;
      }));
    check('no advanced, notes, previous reminders or source disclosures on the main screen',
      await page.locator('.bt360-detail-card details').count()===0&&
      !(await page.locator('.bt360-detail-card').innerText()).includes('Original terms:'));
    const overviewBefore=await page.evaluate(()=>JSON.stringify([localStorage.getItem('bt_e_v4'),localStorage.getItem('bt_tc_archive_v1')]));
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      check('simple bank detail fits '+width+'px',
        await page.locator('.bt360-detail-card').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
      if(width===390)await page.screenshot({path:path.join(output,name+'-account-overview-390.png')});
    }
    check('current bank detail has no duplicate Next bonus section',await page.locator('.bt3810-cycle').count()===0);
    check('simple bank detail never changes saved terms or record bytes',
      await page.evaluate(x=>JSON.stringify([localStorage.getItem('bt_e_v4'),localStorage.getItem('bt_tc_archive_v1')])===x,overviewBefore));
    await page.locator('.bt360-detail-footer').getByRole('button',{name:'Edit',exact:true}).click();
    check('Edit still opens saved account rules without an Advanced panel',
      await page.locator('.modal .guided-sub').innerText().then(t=>t.includes('Step')));
    await page.getByRole('button',{name:'Step 3: Fees & Close',exact:true}).click();
    check('existing closing buffer field is still editable without writes',
      await page.evaluate(()=>{
       const saved=localStorage.getItem('bt_e_v4');
       const row=[...document.querySelectorAll('.modal .fg')].find(x=>x.querySelector('label')?.textContent==='Extra days before closing');
       return !!row?.querySelector('input')&&localStorage.getItem('bt_e_v4')===saved;
      }));
    await cancelEditor();
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,name+'-chase-bonus-detail-in-progress-390.png')});
    await page.evaluate(()=>{
      entries[0]=JSON.parse(window.__chaseViewBaseline);
      expanded=entries[0].id;
      delete window.__chaseViewBaseline;
      R();
    });
    check('Chase reference never persists in financial records',await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,beforeDisclosure));

    await page.screenshot({path:path.join(output,name+'-bonus-detail-in-progress-390.png')});
    check('render never modifies user record',await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,beforeDisclosure));
    const id=(await record()).id;
    await page.reload();await settleStartup();check('reload preserves identity and notes',(await record()).id===id&&(await record()).notes===payload.entry.notes);
    check('refresh keeps old Action Center hidden',await page.locator('.bt360-legacy-actions').count()===0);
    await edit();await page.getByRole('button',{name:'Step 3: Fees & Close',exact:true}).click();
    await page.getByPlaceholder('Personal notes; terms review does not overwrite them').fill('Keep <img src=x onerror=alert(1)> & "quotes"');
    await page.getByRole('button',{name:'Step 4: Review',exact:true}).click();await button('💾 Save changes').click();
    await wait(()=>modal===null&&!entrySaveBusy);
    check('edit preserves identity',(await record()).id===id);
    check('notes cannot inject HTML',await page.locator('img[src="x"]').count()===0);
    if(!await page.locator('.bt360-detail-footer .bt360-primary').count()){await openAccounts();await page.locator('.bt366-compact-row').first().click();}
    // The preceding in-progress mockup intentionally has an unverified close fee.
    // Simulate a separate explicit terms-review confirmation before expecting the
    // bonus receipt to advance into Ready to Close. Payout alone is not clearance.
    check('unknown closing charge blocks readiness before terms review',await page.evaluate(()=>btEvaluateAccount(entries[0]).close.status!=='ready'));
    await page.evaluate(()=>{
      const e=entries[0];
      e.earlyCloseFee=0;
      e.earlyTerminationFeeText='No early closing fee.';
      e.feeScheduleRaw='No early closing fee.';
      e.closeRuleText='Keep the account open until the bonus posts.';
      e.closeRestrictionType='payout-only';
      e.closeRuleBasis='bonus';
      sv(SK,entries);
      R();
    });
    check('synthetic close rules were expressly saved rather than inferred',await page.evaluate(()=>entries[0].earlyCloseFee===0&&/No early closing fee/.test(entries[0].feeScheduleRaw)));
    await page.getByRole('button',{name:'Mark requirements done'}).click();
    check('requirements dialog leaves unknown actual date blank',await page.locator('#req_date').inputValue()==='');
    check('requirements dialog explicitly asks for an actual past date',await page.getByRole('dialog',{name:'Requirement completed'}).isVisible()&&await page.locator('#req_date').getAttribute('max')!==null);
    const beforeInvalidRequirement=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await button('Save date').click();
    await page.locator('#req-date-error').waitFor({state:'visible'});
    await page.waitForFunction(()=>{const e=document.getElementById('req_date');return !!e&&e.getAttribute('aria-invalid')==='true'&&document.activeElement===e;},{},{timeout:5000});
    check('blank requirement date keeps dialog and shows focused inline error',await page.getByRole('dialog',{name:'Requirement completed'}).isVisible()&&await page.locator('#req-date-error').isVisible());
    check('missing completion date does not write records',await page.evaluate(before=>localStorage.getItem('bt_e_v4')===before,beforeInvalidRequirement));
    await page.locator('#req_date').fill('2099-01-01');await button('Save date').click();
    check('future requirement date is rejected with preserved draft',await page.locator('#req-date-error').innerText().then(t=>t.includes('future'))&&await page.locator('#req_date').inputValue()==='2099-01-01');
    check('future completion date does not write records',await page.evaluate(before=>localStorage.getItem('bt_e_v4')===before,beforeInvalidRequirement));
    await page.locator('#req_date').fill('2026-04-01');
    check('correcting the date clears the inline error',await page.locator('#req-date-error').count()===0&&await page.locator('#req_date').getAttribute('aria-invalid')===null);
    // A failed tracker write must leave the date and earlier account history in place.
    await page.evaluate(()=>{
      window.__reqTestCommit=window.BTPersistence.commit;
      window.BTPersistence.commit=function(storage,writes,...args){
        if(Object.prototype.hasOwnProperty.call(writes,'bt_e_v4'))throw Error('Synthetic tracker save failure');
        return window.__reqTestCommit.call(this,storage,writes,...args);
      };
    });
    await button('Save date').click();
    await page.evaluate(()=>{window.BTPersistence.commit=window.__reqTestCommit;delete window.__reqTestCommit});
    check('failed requirement save keeps date and inline retry message',
      await page.getByRole('dialog',{name:'Requirement completed'}).isVisible()&&
      await page.locator('#req_date').inputValue()==='2026-04-01'&&
      await page.locator('#req-date-error').innerText().then(t=>t.includes('not saved')));
    check('failed requirement save restores exact tracker storage and in-memory state',
      await page.evaluate(before=>localStorage.getItem('bt_e_v4')===before&&entries[0].reqMet!=='2026-04-01',beforeInvalidRequirement));
    await button('Save date').click();await button('OK').click();
    check('requirements and payout stay separate',(await record()).reqMet==='2026-04-01'&&!(await record()).bonusRecd);

    // A failed requirement clear must restore byte-identical saved records and preserve the review date.
    const requirementClearBefore=await page.evaluate(()=>getBackupStorageKeys().map(key=>[key,localStorage.getItem(key)]));
    await page.evaluate(()=>openReqMet(entries[0].id));
    await page.locator('.rcv-box button.c-r').click();
    check('clear confirmation is sole active overlay',await page.locator('.cbox').isVisible()&&await page.locator('.rcv-box').count()===0);
    await page.locator('.cbox button.c-c').click();
    check('cancel clearing requirements restores original editor',await page.locator('#req_date').inputValue()==='2026-04-01'&&await page.locator('.cbox').count()===0);

    await page.evaluate(()=>{
      openReqMet(entries[0].id);
      window.__milestoneOriginalCommit=window.BTPersistence.commit;
      window.BTPersistence.commit=function(storage,writes,...args){
        if(Object.prototype.hasOwnProperty.call(writes,'bt_e_v4'))throw Error('Synthetic clear requirement failure');
        return window.__milestoneOriginalCommit.call(this,storage,writes,...args);
      };
    });
    await page.locator('.rcv-box button.c-r').click();
    await page.locator('.cbox button.c-r').click();
    await page.evaluate(()=>{window.BTPersistence.commit=window.__milestoneOriginalCommit;delete window.__milestoneOriginalCommit;});
    check('failed requirement clear shows inline retry and preserves date',
      await page.locator('#req-date-error').innerText().then(x=>x.includes('not cleared'))&&await page.locator('#req_date').inputValue()==='2026-04-01');
    check('failed requirement clear restores exact storage',await page.evaluate(before=>JSON.stringify(getBackupStorageKeys().map(key=>[key,localStorage.getItem(key)]))===JSON.stringify(before),requirementClearBefore));
    await page.locator('.rcv-box button.c-r').click();
    await page.locator('.cbox button.c-r').click();
    await button('OK').click();
    check('requirement clear retry succeeds without altering payout',(await record()).reqMet===''&&!(await record()).bonusRecd);
    await page.evaluate(()=>openReqMet(entries[0].id));
    await page.locator('#req_date').fill('2026-04-01');
    await button('Save date').click();await button('OK').click();
    check('requirement may be explicitly restored after clear',(await record()).reqMet==='2026-04-01');

    await page.locator('.bt360-detail-footer').getByRole('button',{name:/^Record bonus payment/}).click();await page.locator('#rcv_date').fill('2026-04-15');await button('Save').click();await button('Review experience').click();
    check('payment success offers optional evidence review without assuming a method result',await page.evaluate(()=>dpEditor.evidenceStage==='bonus'&&!dpEditor.confirmedByUser));
    await button('Not now').click();
    // A payout clear must preserve tax data, account history and all companion keys after failure.
    const payoutClearBefore=await page.evaluate(()=>getBackupStorageKeys().map(key=>[key,localStorage.getItem(key)]));
    await page.evaluate(()=>openRcv(entries[0].id));
    await page.locator('.rcv-box button.c-r').click();
    check('payout clear confirmation has no competing editor',await page.locator('.cbox').isVisible()&&await page.locator('.rcv-box').count()===0);
    await page.locator('.cbox button.c-c').click();
    check('cancel clearing payout restores actual amount and date',await page.locator('#rcv_date').inputValue()==='2026-04-15'&&Number(await page.locator('#rcv_amount').inputValue())===(await record()).bonus);

    await page.evaluate(()=>{
      openRcv(entries[0].id);
      window.__milestoneOriginalCommit=window.BTPersistence.commit;
      window.BTPersistence.commit=function(storage,writes,...args){
        if(Object.prototype.hasOwnProperty.call(writes,'bt_e_v4'))throw Error('Synthetic clear payout failure');
        return window.__milestoneOriginalCommit.call(this,storage,writes,...args);
      };
    });
    await page.locator('.rcv-box button.c-r').click();
    await page.locator('.cbox button.c-r').click();
    await page.evaluate(()=>{window.BTPersistence.commit=window.__milestoneOriginalCommit;delete window.__milestoneOriginalCommit;});
    check('failed payout clear displays inline error without discarding original details',
      await page.locator('#rcv-clear-error').innerText().then(x=>x.includes('not cleared'))&&
      await page.locator('#rcv_date').inputValue()==='2026-04-15'&&
      Number(await page.locator('#rcv_amount').inputValue())===(await record()).bonus);
    check('failed payout clear preserves exact stored data',await page.evaluate(before=>JSON.stringify(getBackupStorageKeys().map(key=>[key,localStorage.getItem(key)]))===JSON.stringify(before),payoutClearBefore));
    await page.locator('.rcv-box button.c-r').click();
    await page.locator('.cbox button.c-r').click();
    await button('OK').click();
    check('payout clear retry succeeds and keeps requirement date',(await record()).bonusRecd===''&&(await record()).reqMet==='2026-04-01');
    await page.evaluate(()=>openRcv(entries[0].id));
    await page.locator('#rcv_date').fill('2026-04-15');
    await button('Save').click();
    await button('Review experience').click();
    await button('Not now').click();
    check('bonus receipt updates close readiness',await page.evaluate(()=>btLifecycleStageForEntry(entries[0]).code)==='READY_TO_CLOSE');
    await page.evaluate(()=>{entries[0].earlyCloseFee=null;R();});
    check('legacy missing termination fee does not block documented payout-only readiness',await page.evaluate(()=>btLifecycleStageForEntry(entries[0]).code)==='READY_TO_CLOSE');
    await page.evaluate(()=>{entries[0].earlyCloseFee=0;entries[0].earlyTerminationFeeText='No early closing fee unless the account is restricted.';R();});
    check('conditional service-fee wording cannot change independent bonus-retention readiness',await page.evaluate(()=>btEvaluateAccount(entries[0]).close.status==='ready'));
    await page.evaluate(()=>{entries[0].earlyTerminationFeeText='No early closing fee.';R();});
    check('service-fee evidence does not change canonical account readiness',await page.evaluate(()=>btLifecycleStageForEntry(entries[0]).code)==='READY_TO_CLOSE');
    check('received bonus offers recording a real closure',await page.locator('.bt3810-status h3').innerText()==='Bonus received'&&await page.locator('.bt360-detail-footer .bt360-primary').innerText()==='Record closure');
    check('closed account retains its actual date without writing to storage',
      await page.evaluate(()=>{
        const account=entries[0],before=JSON.stringify(account);
        const view=BT360.detailPanels({...account,closed:'2026-11-10'});
        const match=view.match(/<section class="bt3810-card bt3810-dates[^"]*"[^>]*>[\s\S]*?<\/section>/);
        return !!match&&match[0].includes('<dt>Closed</dt>')&&match[0].includes('Nov 10, 2026')&&
          JSON.stringify(account)===before;
      }));
    check('received bonus shows concise dates and fee warnings without extra panels',
      await page.locator('.bt3810-dates').count()===1
      &&await page.locator('.bt3810-fees').count()===1
      &&await page.locator('.bt3611-ready-extras,.bt3686-account-extras').count()===0);
    check('earned bonus shows only recurring account fees, not an early-close fee',
      await page.locator('.bt3810-fees').innerText().then(t=>t.includes('Monthly')&&!t.includes('Closing early')));
    const sticky=await page.evaluate(()=>{
      const bar=document.querySelector('.bt360-detail-footer').getBoundingClientRect();
      const nav=document.querySelector('.tabs').getBoundingClientRect();
      return {ok:bar.bottom<=nav.top+2&&bar.top>=0,fixed:getComputedStyle(document.querySelector('.bt360-detail-footer')).position==='fixed'};
    });
    check('simple sticky footer stays above navigation',sticky.ok&&sticky.fixed);
    const evidenceBefore=await page.evaluate(()=>({entry:JSON.stringify(entries[0]),stored:localStorage.getItem('bt_e_v4')}));
    await page.evaluate(()=>{
      Object.assign(entries[0],{tcSourceRaw:'Exact original <promotion>\nSecond original line.',feeScheduleRaw:'Exact saved fee schedule.',
        promoSourceUrl:'https://example-bank.test/promo',feeScheduleSourceUrl:'https://example-bank.test/fees',termsVerifiedAt:'2026-01-01'});
      R();
    });
    check('original terms stay accessible in source records without a main-screen drawer',await page.evaluate(()=>{
      const e=entries[0];
      return BT360.sourceEvidencePanel(e).includes('Exact original &lt;promotion&gt;')
        &&BT360.sourceEvidenceStatus(e).promotion;
    })&&await page.locator('.bt360-detail-card .bt3640-source-text').count()===0);
    check('viewing saved terms does not write bank records',await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,evidenceBefore.stored));
    await page.evaluate(x=>{entries[0]=JSON.parse(x);R()},evidenceBefore.entry);
    check('paid detail has no redundant panels or advanced disclosures',
      await page.locator('.bt3810-status,.bt3810-dates,.bt3810-fees').count()===3
      &&await page.locator('.bt360-detail-card details').count()===0);
    await page.screenshot({path:path.join(output,name+'-bonus-detail-ready-390.png')});

    // Preserve the underlying timer and task editors even when paid-account
    // detail no longer advertises their redundant historical panels.
    await page.evaluate(()=>runBankAction(entries[0].id,'timer'));
    await button('Start + Days').click();
    await page.locator('#tem_text').fill('E2E manual reminder');
    await page.locator('#tem_start').fill('2026-03-08');
    await page.locator('#tem_days').fill('1');
    await button('Add timer').click();
    check('saved reminder retains calendar-day math across daylight saving',
      (await record()).customTimers.some(t=>t.text==='E2E manual reminder'&&t.date==='2026-03-09'));
    await page.evaluate(()=>runBankAction(entries[0].id,'checklist'));
    await page.getByPlaceholder('e.g. Make 1 debit card transaction').fill('E2E checklist task');
    await button('Save').click();
    check('old checklist entry remains saved without cluttering the paid screen',
      (await record()).checklist.some(x=>x.text==='E2E checklist task')&&await page.locator('.bt3810-requirements').count()===0);
    const recordedBefore=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await page.evaluate(()=>{
      entries[0].monthlyFeeWaiverText='Qualified electronic deposits, minimum daily balance or linked bank relationship.';
      entries[0].customTimers[0].text='Confirm promotional deposit before the deadline and retain bank evidence.';
      R();
    });
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      check('simple detail fits '+width+'px with long saved text',
        await page.locator('.bt360-detail-card').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth));
    }
    await page.evaluate(x=>{entries[0]=JSON.parse(x).find(e=>e.id===entries[0].id);R()},recordedBefore);
    await page.setViewportSize({width:390,height:844});
    await button('Tax').click();
    check('IRS estimate starts without guessed personal income or a false tax balance',
      await page.locator('.bt-tax-estimator').isVisible()&&
      await page.locator('#bt-tax-live').innerText().then(t=>t.includes('Choose a filing status')&&!t.includes('Possible federal balance to pay')));
    const beforeEstimatorStorage=await page.evaluate(()=>getBackupStorageKeys().map(k=>[k,localStorage.getItem(k)]));
    const syntheticPay={format:'BonusTrackerTaxPayYTD',schemaVersion:1,taxYear:2026,asOfDate:'2026-10-09',
      grossPayYtd:50000,preTaxDeductionsYtd:5000,federalTaxableWagesYtd:null,
      federalIncomeTaxWithheldYtd:4000,totalEmployeeTaxesYtd:9000,postTaxDeductionsYtd:750,netPayYtd:38000};
    await page.locator('#bt-tax-file').setInputFiles({name:'synthetic-pay.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(syntheticPay))});
    await page.locator('.bt-tax-pay-review').waitFor();
    check('uploaded JSON previews verified YTD federal withholding distinctly from all employee taxes',
      await page.locator('.bt-tax-pay-review').innerText().then(t=>t.includes('Federal withholding YTD')&&t.includes('$4,000.00')&&!t.includes('$9,000.00')));
    check('annualized taxable wage preview accounts for stated pre-tax deductions rather than gross wages',
      await page.locator('.bt-tax-pay-review').innerText().then(t=>t.includes('$58,244.68')&&t.includes('Gross less reported pre-tax deductions')));
    check('file preview leaves unconfirmed filing status and existing scenario untouched',
      await page.locator('#bt-tax-other').inputValue()===''&&await page.locator('#bt-tax-status').inputValue()==='');
    await page.locator('.bt-tax-wage-review > summary').click();
    await page.locator('#bt-tax-wage-ytd').fill('44500');
    await page.locator('#bt-tax-wage-ytd').press('Tab');
    check('optional exact federal taxable wages override changes preview only',
      await page.locator('.bt-tax-pay-review').innerText().then(t=>t.includes('$57,597.52')&&t.includes('Federal taxable wages on pay file'))&&
      await page.locator('#bt-tax-other').inputValue()==='');
    await page.locator('.bt-tax-wage-review > summary').click();
    await page.locator('#bt-tax-wage-ytd').fill('52000');
    await page.locator('#bt-tax-wage-ytd').press('Tab');
    check('invalid taxable wage override blocks apply and exposes the problem',
      await page.locator('.bt-tax-pay-error').isVisible()&&await page.locator('.bt-tax-pay-apply').count()===0);
    await page.locator('#bt-tax-wage-ytd').fill('');
    await page.locator('#bt-tax-wage-ytd').press('Tab');
    check('clearing optional wage override restores disclosed gross-minus-pre-tax projection',
      await page.locator('.bt-tax-pay-review').innerText().then(t=>t.includes('$58,244.68')&&t.includes('Gross less reported pre-tax deductions'))&&
      await page.locator('.bt-tax-pay-apply').isVisible());
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      const fit=await page.locator('.bt-tax-pay').evaluate(el=>({
        scroll:el.scrollWidth,client:el.clientWidth,review:[...el.querySelectorAll('button')].every(x=>x.getBoundingClientRect().right<=window.innerWidth+1)
      }));
      check('pay JSON review fits narrow viewport '+width+'px',fit.scroll<=fit.client+1&&fit.review);
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Use this estimate'}).click();
    check('confirmed JSON import updates only session tax scenario, not filing status',
      await page.locator('#bt-tax-other').inputValue()==='58244.68'&&
      await page.locator('#bt-tax-withheld').inputValue()==='5177.3'&&
      await page.locator('#bt-tax-status').inputValue()==='');
    check('confirmed import never changes saved banking data or cloud backup fields',
      await page.evaluate(before=>JSON.stringify(getBackupStorageKeys().map(k=>[k,localStorage.getItem(k)]))===JSON.stringify(before),beforeEstimatorStorage));
    await page.locator('#bt-tax-status').selectOption('single');
    const updatedPay={...syntheticPay,asOfDate:'2026-10-11',grossPayYtd:52000,
      federalIncomeTaxWithheldYtd:4200,totalEmployeeTaxesYtd:9400,payFrequency:'weekly',nextPayDate:'2026-10-17'};
    await page.locator('#bt-tax-file').setInputFiles({name:'newer-synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(updatedPay))});
    await page.locator('.bt-tax-pay-compare').waitFor();
    check('new YTD snapshot compares two statements instead of summing totals',
      await page.locator('.bt-tax-pay-compare').innerText().then(t=>t.includes('Change since 2026-10-09')&&t.includes('+$2,000.00')&&t.includes('+$200.00')&&t.includes('Potential federal balance change')));
    check('weekly projection infers recent per-check amounts from actual YTD changes',
      await page.locator('.bt-tax-pay-review').innerText().then(t=>t.includes('$69,000.00')&&t.includes('$6,400.00')&&t.includes('Paycheck-based · recent YTD trend')&&t.includes('11 scheduled paycheck(s)')));
    check('preview is still read-only and retains previous accepted estimate until approved',
      await page.locator('#bt-tax-other').inputValue()==='58244.68');
    await page.locator('.bt-tax-pay-schedule > summary').click();
    await page.locator('#bt-tax-pay-wage').fill('2100');
    await page.locator('#bt-tax-pay-wage').press('Tab');
    check('explicit per-paycheck amount overrides the observed trend only on review',
      await page.locator('.bt-tax-pay-review').innerText().then(t=>t.includes('$70,100.00')&&t.includes('Paycheck-based · amounts provided')));
    await page.locator('.bt-tax-pay-schedule > summary').click();
    await page.locator('#bt-tax-pay-wage').fill('');
    await page.locator('#bt-tax-pay-wage').press('Tab');
    check('clearing explicit amount restores observed trend',
      await page.locator('.bt-tax-pay-review').innerText().then(t=>t.includes('$69,000.00')&&t.includes('Paycheck-based · recent YTD trend')));
    await page.getByRole('button',{name:'Use this estimate'}).click();
    check('newer snapshot replaces annual scenario instead of double counting older YTD totals',
      await page.locator('#bt-tax-other').inputValue()==='69000'&&
      await page.locator('#bt-tax-withheld').inputValue()==='6400');
    check('tax overview prioritizes estimated IRS balance and payroll calculation disclosure',
      await page.locator('.bt-tax-primary-balance').isVisible()&&
      await page.locator('.bt-tax-result-trust').innerText().then(t=>t.includes('Recent paycheck trend')));
    check('new comparison and scenario remain session-only, leaving all financial and backup keys unchanged',
      await page.evaluate(before=>JSON.stringify(getBackupStorageKeys().map(k=>[k,localStorage.getItem(k)]))===JSON.stringify(before),beforeEstimatorStorage));

    await page.getByRole('button',{name:'Clear tax inputs'}).click();
    check('clearing imported scenario removes projected income and pay preview',
      await page.locator('#bt-tax-other').inputValue()===''&&await page.locator('.bt-tax-pay-review').count()===0);
    await page.locator('#bt-tax-file').setInputFiles({name:'invalid-pay.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...syntheticPay,federalIncomeTaxWithheldYtd:9200}))});
    check('inconsistent federal withholding is rejected without a silently applied IRS balance',
      await page.locator('.bt-tax-pay-error').isVisible()&&
      await page.locator('#bt-tax-other').inputValue()===''&&
      await page.locator('#bt-tax-live').innerText().then(t=>t.includes('Choose a filing status')));
    await page.locator('#bt-tax-status').selectOption('single');
    await page.locator('#bt-tax-other').fill('80000');
    check('tax estimates bonus increment using IRS 2026 progressive rates',
      await page.locator('#bt-tax-live').innerText().then(t=>t.includes('Additional tax on tracked bonuses')&&t.includes('$71.50')&&t.includes('Estimated total federal income tax')));
    check('IRS balance not guessed without annual withholding',
      await page.locator('#bt-tax-live').innerText().then(t=>t.includes('Enter projected withholding')&&!t.includes('Possible federal balance to pay')));
    await page.locator('.bt-tax-options > summary').click();
    await page.locator('#bt-tax-withheld').fill('9000');
    check('projected withholding computes possible refund separately from bonus tax',
      await page.locator('#bt-tax-live').innerText().then(t=>t.includes('Possible federal refund')&&t.includes('$158.50')));
    await page.locator('#bt-tax-ot').fill('2000');
    check('qualified overtime reduces IRS estimate without incorrectly exempting full overtime',
      await page.locator('#bt-tax-live').innerText().then(t=>t.includes('Estimated qualified overtime deduction')&&t.includes('$2,000.00')&&t.includes('$8,401.50')&&t.includes('$598.50')));
    await page.locator('#bt-tax-ot').fill('20000');
    check('single filer overtime premium is capped at the federal $12,500 limit',
      await page.locator('#bt-tax-live').innerText().then(t=>t.includes('Estimated qualified overtime deduction')&&t.includes('$12,500.00')));
    await page.locator('#bt-tax-status').selectOption('mfs');
    check('married filing separately cannot silently receive overtime tax relief',
      await page.locator('#bt-tax-live').innerText().then(t=>t.includes('Married filing separately cannot claim')));
    await page.locator('#bt-tax-status').selectOption('single');
    await page.locator('#bt-tax-ot').fill('');
    check('clearing overtime restores original estimate without creating a saved deduction',
      await page.locator('#bt-tax-live').innerText().then(t=>t.includes('$158.50')&&!t.includes('Estimated qualified overtime deduction')));
    await page.locator('#bt-tax-exclude').fill('125');
    check('excluded receipt amount reduces taxable bonus estimate',
      await page.locator('#bt-tax-live').innerText().then(t=>t.includes('$44.00')));
    await page.locator('#bt-tax-exclude').fill('400');
    check('tax excludes greater than bonus rejected rather than inferred',
      await page.locator('#bt-tax-live').innerText().then(t=>t.includes('Excluded bonus amount')));
    await page.locator('#bt-tax-exclude').fill('');
    check('income, withholding and exclusion edits never write backup or tracker keys',
      await page.evaluate(before=>JSON.stringify(getBackupStorageKeys().map(k=>[k,localStorage.getItem(k)]))===JSON.stringify(before),beforeEstimatorStorage));
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      const fit=await page.locator('.bt-tax-estimator').evaluate(el=>({
        scroll:el.scrollWidth,client:el.clientWidth,inputs:[...el.querySelectorAll('input,select')].every(x=>x.getBoundingClientRect().right<=window.innerWidth+1)
      }));
      check('tax estimate remains usable at '+width+'px',fit.scroll<=fit.client+1&&fit.inputs);
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,name+'-tax-estimator-390.png')});
    await page.getByRole('button',{name:'Clear tax inputs'}).click();
    check('reset clears session-only inputs and never displays stale IRS balance',
      await page.locator('#bt-tax-other').inputValue()===''&&await page.locator('#bt-tax-live').innerText().then(t=>t.includes('Choose a filing status')));
    await page.evaluate(()=>{taxYear=2027;R()});
    check('future tax years never use unverified brackets',
      await page.locator('#bt-tax-live').innerText().then(t=>t.includes('No IRS calculator for 2027')));
    await page.evaluate(()=>{taxYear=2026;R()});
    check('tax exposes exact-cycle Archive reconciliation',(await page.locator('#app').innerText()).includes('Archive links:'));
    check('tax includes received bonus on open account',(await page.locator('#app').innerText()).includes('E2E Verification Bank'));
    await page.locator('.bt360-tax-record summary').first().click();
    check('tax receipt exposes account identity and actual lifecycle dates',await page.locator('.bt360-tax-history').first().innerText().then(t=>t.includes('Opened')&&t.includes('Closed')&&t.includes('Account ID')&&t.includes('No closure recorded')));
    await page.locator('.bt360-tax-history').getByRole('button',{name:'View account',exact:true}).click();
    check('tax receipt links to its actual account',await page.locator('.bt360-detail-card').count()===1);
    await button('Tax').click();
    const beforeTaxHistory=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await page.evaluate(()=>{window.__taxEntriesBefore=JSON.stringify(entries);entries[0].previousCycles=[{id:'SYN-B-HIST',bank:'Synthetic Historical Bank',accountType:'business',opened:'2025-11-01',bonusRecd:'2026-01-04',closed:'2026-01-06',bonus:90}];taxYear=2026;R()});
    const historical=page.locator('.bt360-tax-record').filter({hasText:'Synthetic Historical Bank'});
    await historical.locator(':scope > summary').click();
    check('saved prior cycle retains its own dates and source in Tax',await historical.innerText().then(t=>t.includes('Nov 1, 2025')&&t.includes('Jan 6, 2026')&&t.includes('Prior cycle')&&t.includes('View current account')));
    check('history browsing never rewrites stored accounts',await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,beforeTaxHistory));
    await page.screenshot({path:path.join(output,name+'-tax-history-390.png')});
    await page.evaluate(()=>{entries=JSON.parse(window.__taxEntriesBefore);delete window.__taxEntriesBefore;R()});
    page.once('dialog',dialog=>dialog.accept('2026'));
    const taxDownload=page.waitForEvent('download');await button('Export tax CSV').click();
    const taxFile=path.join(output,name+'-tax.csv');await (await taxDownload).saveAs(taxFile);
    const taxCSV=await fs.readFile(taxFile,'utf8');
    check('tax CSV downloads with correct amount and dates',taxCSV.includes('E2E Verification Bank')&&taxCSV.includes('"325"')&&taxCSV.includes('Apr 15, 2026'));
    await button('Tracker').click();
    await button('Settings').click();
    check('data tools are in the header menu',await page.getByRole('button',{name:'Export backup file',exact:false}).isVisible()&&await page.getByRole('button',{name:'Reset this device',exact:false}).isVisible()&&await page.locator('.tracker-quick-actions button').count()===0);
    // Regression: on iOS the fixed Settings sheet (z-index 999) previously
    // covered the new iCloud wizard (default .ov z-index 200).
    const beforeCloudWizard=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    const oldViewport=page.viewportSize();
    for(const width of [375,390]){
      await page.setViewportSize({width,height:844});
      await page.getByRole('button',{name:'Backup details',exact:true}).click();
      const wizard=page.getByRole('dialog',{name:'Backup with iCloud Drive'});
      check('iCloud wizard is visible immediately at '+width+'px',await wizard.isVisible()&&await page.getByRole('dialog',{name:'Settings'}).count()===0);
      check('iCloud wizard buttons are not obscured at '+width+'px',await wizard.locator('#icloud-save').evaluate(el=>{
        const r=el.getBoundingClientRect();
        const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
        return !!hit&&(el===hit||el.contains(hit))&&r.height>30;
      }));
      check('iCloud wizard has a visible Close button',await wizard.getByRole('button',{name:'Close iCloud backup'}).isVisible());
      check('manual backups need no migration or server controls',await wizard.locator('#icloud-switch,#cloud-auto-toggle,#cloud-now').count()===0);
      if(width===375){
        const download=page.waitForEvent('download');await wizard.locator('#icloud-save').click();
        const savedFile=path.join(output,name+'-manual-icloud.json');await (await download).saveAs(savedFile);
        check('manual export reports file creation without claiming iCloud upload',(await wizard.locator('#icloud-backup-status').innerText()).includes('Last file created:'));
        await wizard.locator('.icloud-file-check > summary').click();
        const choose=page.waitForEvent('filechooser');await wizard.locator('#icloud-verify').click();await (await choose).setFiles(savedFile);
        await page.waitForFunction(()=>!!localStorage.getItem('bt_icloud_file_verified_v1'));
        check('a reopened exported file matches the tracker',(await wizard.locator('#icloud-file-status').innerText()).includes('File checked:'));
      }
      await wizard.getByRole('button',{name:'Close iCloud backup'}).click();
      check('closing iCloud wizard removes its overlay',await page.locator('.icloud-backup-overlay').count()===0);
      await button('Settings').click();
    }
    if(oldViewport)await page.setViewportSize(oldViewport);
    check('opening iCloud migration never rewrites account records',await page.evaluate(before=>localStorage.getItem('bt_e_v4')===before,beforeCloudWizard));

    const backupEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export backup file',exact:false}).click();
    const backupFile=path.join(output,name+'-backup.json');await (await backupEvent).saveAs(backupFile);
    const backup=JSON.parse(await fs.readFile(backupFile,'utf8'));
    check('backup contains records, history, and terms',backup.entries.length===1&&backup.entries[0].id===id&&Object.keys(backup.termsArchive).length>0&&backup.entries[0].history.length>0);
    await close();check('closure uses actual date',(await record()).closed==='2026-05-01');
    check('eligibility uses payout plus exact months and buffer',await page.evaluate(()=>btOfficialEligibilityDate(entries[0])==='2027-04-15'&&nextReopen(entries[0])==='2027-04-17'));
    await page.evaluate(()=>{entries.push({id:'synthetic-later-undo',bank:'Synthetic later Undo account',opened:'2026-06-01',bonus:0,notes:'Preserve this newer account'});sv(SK,entries);R()});
    await button('Undo').click();check('undo restores account and notes',!(await record()).closed&&(await record()).notes===backup.entries[0].notes);
    check('undo retains a different account added after closure',await page.evaluate(()=>entries.some(e=>e.id==='synthetic-later-undo'&&e.notes==='Preserve this newer account')&&JSON.parse(localStorage.getItem(SK)).some(e=>e.id==='synthetic-later-undo')));
    await page.evaluate(()=>{entries=entries.filter(e=>e.id!=='synthetic-later-undo');sv(SK,entries);R()});
    await close();
    await button('Settings').click();
    await page.getByRole('button',{name:'Backup details',exact:true}).click();
    const safetyWizard=page.getByRole('dialog',{name:'Backup with iCloud Drive'});
    const currentDownload=page.waitForEvent('download');await safetyWizard.locator('#icloud-save').click();
    const currentFile=path.join(output,name+'-pre-restore-current.json');await (await currentDownload).saveAs(currentFile);
    await safetyWizard.locator('.icloud-file-check > summary').click();
    const currentChooser=page.waitForEvent('filechooser');await safetyWizard.locator('#icloud-verify').click();await (await currentChooser).setFiles(currentFile);
    await page.waitForFunction(()=>document.querySelector('#icloud-file-status')?.textContent.startsWith('File checked:'));
    await safetyWizard.getByRole('button',{name:'Close iCloud backup'}).click();await button('Settings').click();
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Restore from file',exact:false}).click();await (await chooser).setFiles(backupFile);
    const safetyDownload=page.waitForEvent('download');await button('Restore Backup').click();await safetyDownload;
    await page.getByRole('heading',{name:'Restore Complete'}).waitFor();await button('Confirm').click();
    check('restore recovers open state and saved details',!(await record()).closed&&(await record()).id===id&&(await record()).notes===backup.entries[0].notes);
    check('restore invalidates Undo from the replaced records',await page.evaluate(()=>undoState===null)&&await page.locator('.undo-bar').count()===0);
    // Exercise the real archive menu without changing financial records.
    await page.evaluate(()=>{entries.push({id:'archive-e2e',bank:'Archived E2E Bank',closed:'2026-10-01',bonusRecd:'2026-09-01',bonus:100,churnable:false,churnability:'not-repeatable',notes:'Preserved archive note',history:[],customTimers:[],checklist:[]});R()});
    check('closed nonrepeatable account hidden from tracker',await page.locator('[data-bt-entry-id="archive-e2e"]').count()===0);
    await button('Archive').click();
    await page.locator('details.bt360-archived-tools > summary').click();
    check('archive menu reveals retained account',await page.locator('[data-bt-entry-id="archive-e2e"]').count()===1&&await page.locator('[data-bt-entry-id="'+id+'"]').count()===0);
    await page.locator('#archive-search').fill('Archived E2E');
    check('archive search remains focused after rerender',await page.locator('#archive-search').evaluate(el=>el===document.activeElement));
    await page.locator('[data-bt-entry-id="archive-e2e"] .card-h').click();
    check('archive preserves expanded history',await page.locator('[data-bt-entry-id="archive-e2e"] .card-exp').count()===1);
    await page.getByRole('button',{name:'Back to Archive',exact:true}).click();await button('Tracker').click();
    check('archive navigation retains records',await page.evaluate(()=>entries.some(e=>e.id==='archive-e2e'&&e.notes==='Preserved archive note')));
    await page.evaluate(()=>{entries=entries.filter(e=>e.id!=='archive-e2e');R()});

    // Real-device regression fixtures: no production records or providers.
    const mappedActions=await page.evaluate(()=>{
      const previous=window.btLifecycleStageForEntry,results={};
      const codes=['IN_PROGRESS','ACTION_NEEDED','REQUIREMENTS_MET','AWAITING_BONUS','HOLD_OPEN','BONUS_RECEIVED','READY_TO_CLOSE'];
      try{
        for(const code of codes){
          window.btLifecycleStageForEntry=()=>({code,label:code});
          results[code]=BT360.primaryAction({id:'synthetic-stage',bank:'Fixture Bank',
            checklist:[{text:'First task',done:true},{text:'Second task',done:false}],reqMet:'',bonusRecd:''}).label;
        }
      }finally{window.btLifecycleStageForEntry=previous}
      return results;
    });
    // Explicit milestones override an urgent stage that still contains an
    // ongoing timer. Never display Confirm requirements after it is saved.
    const completedActions=await page.evaluate(()=>{
      const original=window.btLifecycleStageForEntry,results={};
      try{
        const sample={id:'SYN-ALREADY-CONFIRMED',bank:'Synthetic Completed',
          reqMet:'2026-10-20',bonusRecd:'',closed:'',checklist:[]};
        for(const [key,stage] of Object.entries({
          payout:{code:'ACTION_NEEDED',label:'Action needed',kind:'payout'},
          recurring:{code:'ACTION_NEEDED',label:'Action needed',kind:'requirement'},
          review:{code:'ACTION_NEEDED',label:'Action needed',kind:'review',reviewReason:'Saved rules need review'},
          normal:{code:'IN_PROGRESS',label:'In progress',kind:''}})){
          window.btLifecycleStageForEntry=()=>stage;
          results[key]={...BT360.primaryAction(sample),footer:BT360.detailFooter(sample)};
        }
        window.btLifecycleStageForEntry=()=>({code:'ACTION_NEEDED',label:'Action needed',kind:'close-review'});
        results.paid=BT360.primaryAction({...sample,bonusRecd:'2026-10-22'});
      }finally{window.btLifecycleStageForEntry=original}
      return results;
    });
    check('saved requirements always advance to bonus recording, independent of stale stage labels',
      ['payout','recurring','review','normal'].every(k=>completedActions[k].label==='Record bonus payment')
      &&completedActions.paid.label==='Record closure'
      &&Object.values(completedActions).every(x=>!x.command.includes('openReqMet')));
    check('payment remains reachable whenever requirements were confirmed',
      ['payout','recurring','review','normal'].every(k=>completedActions[k].footer.includes('Record bonus payment')&&completedActions[k].footer.includes('openRcv(')));
    check('stale stage labels never advance milestones without recorded evidence',
      Object.values(mappedActions).every(label=>label==='Mark requirements done'));
    await page.evaluate(()=>{
      window.__designEntries=JSON.parse(JSON.stringify(entries));
      entries.push({id:'e2e-lafayette',bank:'Lafayette FCU',accountType:'personal',bonus:250,opened:'2026-10-01',closed:'',reqMet:'',bonusRecd:'',churn:'1',
        churnable:true,churnability:'repeatable',checklist:[{text:'Open membership savings',done:true},{text:'Set qualifying direct deposit',done:false}],customTimers:[]});
      const legacy=[['Bank of America','2026-01-16'],['Spruce','2026-04-23'],['Simmons','2026-04-29'],['Eligible soon fixture','2025-11-10']];
      for(const [bank,closed] of legacy){
        entries.push({id:'e2e-legacy-'+bank.toLowerCase().replaceAll(' ','-'),bank,accountType:'personal',bonus:400,opened:'2025-01-01',closed,bonusRecd:'2025-07-01',reqMet:'2025-06-01',churn:'1',churnable:true,churnability:'repeatable',checklist:[],customTimers:[]});
      }
      R();
    });
    check('cooldown records not rendered as full Tracker cards',await page.locator('[data-bt-entry-id^="e2e-legacy-"]').count()===0);
    await openAccounts();
    check('open Lafayette appears as one compact row',await page.locator('[data-bt-entry-id="e2e-lafayette"] .bt366-compact-row').count()===1);
    await page.setViewportSize({width:390,height:844});
    await page.locator('.scroll').evaluate(el=>el.scrollTop=el.scrollHeight);
    check('last row is clear of floating add button',await page.evaluate(()=>{
      const rows=[...document.querySelectorAll('.bt366-compact-row')],fab=document.querySelector('.bt362-add-fab');
      return rows.length>0&&fab&&rows.at(-1).getBoundingClientRect().bottom<fab.getBoundingClientRect().top-8;
    }));
    await page.screenshot({path:path.join(output,name+'-v366-tracker-390.png')});
    await page.locator('[data-bt-entry-id="e2e-lafayette"] .bt366-compact-row').click();
    check('Lafayette has one simple detail header and requirements card',
      await page.locator('.bt360-detail-header').count()===1&&await page.locator('.bt3810-detail').count()===1&&await page.locator('.bt3810-requirements').count()===1);
    check('Lafayette exposes whole-requirements confirmation without inventing payout',
      await page.locator('.bt360-detail-footer .bt360-primary').innerText()==='Mark requirements done'&&await page.locator('.bt3810-requirements').getByRole('checkbox').count()===2);
    await page.screenshot({path:path.join(output,name+'-v366-lafayette-detail-390.png')});
    await page.getByRole('button',{name:'Back to accounts'}).click();
    const legacyDates=await page.evaluate(()=>{
      return entries.filter(e=>e.id.startsWith('e2e-legacy-')).map(e=>({bank:e.bank,tracker:window.churnReadyDate?.(e),archive:BT360.eligibleInfo(e)?.eligible,label:BT360.eligibleInfo(e)?.label}));
    });
    check('Archive and Tracker reuse identical supported legacy dates',
      legacyDates.every(x=>x.tracker&&x.tracker===x.archive&&x.label.includes('saved waiting period'))
      &&legacyDates.find(x=>x.bank==='Bank of America')?.archive==='2027-01-18'
      &&legacyDates.find(x=>x.bank==='Spruce')?.archive==='2027-04-25'
      &&legacyDates.find(x=>x.bank==='Simmons')?.archive==='2027-05-01');
    await button('Archive').click();
    check('legacy eligibility dates visible in Archive',await page.getByText('Jan 18, 2027',{exact:false}).count()>0&&await page.getByText('Apr 25, 2027',{exact:false}).count()>0);
    await page.screenshot({path:path.join(output,name+'-v366-archive-390.png')});
    await page.evaluate(()=>{entries=window.__designEntries;delete window.__designEntries;expanded=null;R()});
    await button('Tracker').click();

    // Chart drilldown is read-only and uses the Tax source of truth.
    await page.evaluate(()=>{
      window.__heroMonthSavedEntries=JSON.parse(JSON.stringify(entries));
      window.__heroMonthPreviousYear=dashYear;
      entries=[
        {id:'hero-month-april-a',bank:'Synthetic First Bank',accountType:'personal',bonus:450,bonusRecd:'2026-04-12',opened:'2026-02-01',checklist:[],customTimers:[]},
        {id:'hero-month-april-b',bank:'Synthetic Second Bank',accountType:'personal',bonus:400,bonusRecd:'2026-04-22',opened:'2026-03-01',checklist:[],customTimers:[]},
        {id:'hero-month-business',bank:'Synthetic Business Bank',accountType:'business',bonus:700,bonusRecd:'2026-04-13',opened:'2026-02-01',checklist:[],customTimers:[]}
      ];
      dashYear=2026;BT360.clearHeroMonth();R();
    });
    check('twelve month buttons start unselected',await page.locator('.bt367-month-hit').count()===12&&await page.locator('.bt367-month-hit[aria-pressed="true"]').count()===0);
    check('zero months have no bar and full-height tap targets',await page.locator('.bt367-month-hit[data-month="1"] .bt367-month-fill').count()===0
      &&await page.locator('.bt367-month-hit[data-month="1"] .bt367-month-baseline').count()===1
      &&await page.locator('.bt367-month-hit[data-month="1"]').evaluate(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.width>=44;}));
    check('hero receipt sums equal Tax for same year and audience',await page.evaluate(()=>{
      const monthly=BT360.heroMonthData(entries,dashYear).reduce((sum,m)=>sum+m.total,0);
      const tax=taxEntriesForYear(dashYear).filter(BT360.scope).reduce((sum,e)=>sum+Number(e.bonus),0);
      return monthly===tax&&monthly>=850;
    }));
    await page.setViewportSize({width:390,height:844});
    check('Combined All accounts view is active for the chart',await page.locator('.bt3628-audience-segments').getByRole('button',{name:'All accounts'}).getAttribute('aria-pressed')==='true');
    await page.getByRole('button',{name:'April: $1,550, 3 bonuses'}).click();
    check('tapping month opens exact earned rows and highlights bar',await page.locator('.bt367-month-detail').isVisible()
      &&await page.locator('.bt367-month-row').count()===3
      &&await page.locator('.bt367-month-row').filter({hasText:'Synthetic Business Bank'}).count()===1
      &&await page.locator('.bt367-month-hit[data-month="3"]').getAttribute('aria-pressed')==='true'
      &&(await page.locator('.bt367-month-detail').innerText()).includes('April 2026 · $1,550 collected · 3 bonuses'));
    await page.screenshot({path:path.join(output,name+'-v367-hero-month-selected-390.png')});
    await page.locator('.bt367-month-row').filter({hasText:'Synthetic First Bank'}).click();
    check('month row opens its actual bonus detail',await page.locator('.bt360-detail-header').innerText().then(t=>t.includes('Synthetic First Bank')));
    await page.getByRole('button',{name:'Back to accounts'}).click();
    await page.locator('.bt367-month-hit[data-month="3"]').focus();
    await page.keyboard.press('Enter');
    check('keyboard Enter opens selected month',await page.locator('.bt367-month-detail').isVisible());
    await page.locator('.bt367-month-hit[data-month="3"]').click();
    check('same bar toggles closed',await page.locator('.bt367-month-detail').count()===0);
    await page.locator('.bt367-month-hit[data-month="1"]').click();
    check('zero month says No bonuses',await page.locator('.bt367-month-detail').innerText().then(t=>t.includes('No bonuses')));
    await page.getByRole('button',{name:'Close month details'}).click();
    await page.getByRole('button',{name:'Personal',exact:true}).click();
    check('Personal filter preserves the original April receipt group',
      await page.getByRole('button',{name:'April: $850, 2 bonuses'}).count()===1);
    await page.getByRole('button',{name:'April: $850, 2 bonuses'}).click();
    check('Personal month still shows exactly the two original rows',
      await page.locator('.bt367-month-detail').isVisible()
      &&await page.locator('.bt367-month-row').count()===2
      &&await page.locator('.bt367-month-hit[data-month="3"]').getAttribute('aria-pressed')==='true'
      &&(await page.locator('.bt367-month-detail').innerText()).includes('April 2026 · $850 collected · 2 bonuses'));
    await page.getByRole('button',{name:'Close month details'}).click();
    await page.getByRole('button',{name:'Business',exact:true}).click();
    check('Business filter updates monthly chart using Tax data',await page.getByRole('button',{name:'April: $700, 1 bonus'}).count()===1
      &&await page.evaluate(()=>BT360.heroMonthData(entries,2026)[3].total===700));
    await page.getByRole('button',{name:'Personal',exact:true}).click();
    await page.locator('#bt362-year').selectOption('2025');
    check('year filter updates bars and clears selection',await page.locator('.bt367-month-hit[aria-pressed="true"]').count()===0
      &&await page.getByRole('button',{name:'April: $0, 0 bonuses'}).count()===1);
    await page.evaluate(()=>{
      entries=window.__heroMonthSavedEntries;delete window.__heroMonthSavedEntries;
      dashYear=window.__heroMonthPreviousYear;delete window.__heroMonthPreviousYear;
      BT360.clearHeroMonth();R();
    });
    await button('Datapoints').click();check('successful method appears in datapoints',(await page.locator('#app').innerText()).includes('E2E Verification Bank'));await button('Archive').click();check('archive unifies terms and cooldown',await page.locator('.bt360-archive-switch').count()===0);check('terms archive contains original promotion',(await page.locator('#app').innerText()).includes('E2E Verification Bank'));await button('Tracker').click();
    await page.getByPlaceholder('Search accounts...').fill('Does not exist');await page.getByText('No matching accounts',{exact:true}).waitFor();await page.getByPlaceholder('Search accounts...').fill('');
    check('search keeps stored record',(await record()).id===id);
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,name+'-v362-tracker-390.png')});
    check('mobile layout fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    const storedBeforeRadar=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await page.evaluate(()=>{const base=entries[0];entries.push({...base,id:'radar-us-bank',bank:'U.S. Bank',closed:'2026-05-01'});sv(SK,entries);R()});
    const storedDuringRadar=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await button('Bank Bonuses').click();
    await page.locator('.radar-card h3').filter({hasText:'Synthetic Checking'}).first().waitFor();
    await page.screenshot({path:path.join(output,name+'-v362-bonuses-390.png')});
    const beforeWatchCheck=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await page.evaluate(async()=>{
      const catalog=window.BTQuickAddCatalog,record=catalog.records['Capital One'];
      await catalog.refreshWatch(); // Drain any startup fetch before forcing the synthetic snapshot.
      const now=new Date(Date.now()).toISOString();
      const sources={};
      for(const x of record.sources)sources[x.role]={url:x.url,status:x.role==='fees'?'unchanged':'changed',
        checkedAt:now,baselineHash:'a'.repeat(64),observedHash:x.role==='fees'?'a'.repeat(64):'b'.repeat(64),
        changeAt:x.role==='fees'?null:now,reviewSignals:x.role==='fees'?[]:['deadlines','monthly_fees','<script>x</script>']};
      const snapshot={schemaVersion:1,generatedAt:now,records:{'Capital One':{offerKey:record.offerKey,sources}}};
      const previous=window.fetch;
      window.fetch=(url,opts)=>String(url).includes('quick-add-source-monitor.json')
        ?Promise.resolve(new Response(JSON.stringify(snapshot),{status:200,headers:{'Content-Type':'application/json'}}))
        :previous(url,opts);
      try{await catalog.refreshWatch(true)}finally{window.fetch=previous}
    });
    await page.locator('.bt362-about-sources > summary').click();
    check('automated source diagnostics are inside About sources, not main tasks',
      await page.locator('.bt3662-source-queue').evaluate(el=>!!el.closest('.bt362-about-sources')));
    await page.locator('.bt3662-source-queue > summary').click();
    check('partial official watch shows missing bank promotion and fee sources',await page.locator('.bt3662-source-queue').innerText().then(t=>t.includes('Wells Fargo')&&t.includes('Check unavailable')));
    check('missing-source review links remain pinned to official bank hosts',await page.locator('.bt3662-source-item a').evaluateAll(links=>links.every(a=>{try{const u=new URL(a.href);return u.protocol==='https:'&&['www.wellsfargo.com','accountoffers.wellsfargo.com','www.capitalone.com'].includes(u.hostname)}catch{return false}})));
    check('mobile review queue shows possible changed terms without unsafe text',await page.locator('.bt3662-source-queue').innerText().then(t=>
      t.includes('Possible: Deadlines, Fee wording')&&!t.includes('<script>')&&!t.includes('confirmed eligibility')));
    check('public monitoring cannot mutate financial records',await page.evaluate(before=>localStorage.getItem('bt_e_v4')===before,beforeWatchCheck));
    check('offers group by verified tracker review status without assuming personal eligibility',await page.locator('.radar-group-heading').count()>0&&(await page.getByText('About sources',{exact:true}).count())===1);
    check('bank feed renders escaped discovery title and permits only bundled bank logos',
      (await page.locator('.radar-card img').evaluateAll(images=>images.every(img=>/^\.\/bank-logos\/[a-z0-9-]+\.svg$/.test(img.getAttribute('src')||''))))
      &&(await page.locator('.radar-card').filter({hasText:'Synthetic Checking'}).innerText()).includes('<img'));
    check('bank feed warns when source check is stale',await page.locator('.bt362-offer-stale').isVisible());
    check('bank bonus tab fits mobile viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    check('partial source outage is disclosed',(await page.locator('.bt362-about-sources').innerText()).includes('Update unavailable'));
    await page.locator('.bt362-offer-filter-disclosure summary').click();
    await page.getByLabel('Availability',{exact:true}).selectOption('nationwide');
    check('nationwide filter requires explicit source label',await page.locator('.radar-card').count()===1&&(await page.locator('.radar-card').innerText()).includes('Wells Fargo'));
    check('compact offers show geography and one source link',await page.locator('.radar-card').evaluateAll(cards=>cards.every(card=>card.querySelectorAll('h3').length===1&&card.querySelectorAll('.radar-offer-link').length===1&&card.querySelector('.radar-geo'))));
    check('fresh official geography is distinguished from source reports',(await page.locator('.radar-card').innerText()).includes('Missouri · official scope'));
    await page.locator('.radar-official-proof summary').click();
    check('official verification exposes its source quotation',(await page.locator('.radar-official-proof').innerText()).includes('This offer is available nationwide.'));
    await page.evaluate(()=>R());check('official source stays open after rerender',await page.locator('.radar-official-proof').evaluate(el=>el.open));
    check('offer review tools have been removed',await button('Copy offer for review').count()===0&&await page.locator('.radar-evidence').count()===0);
    await page.getByRole('button',{name:'U.S. Bank',exact:true}).click();
    check('unverified geography does not become nationwide',await page.locator('.radar-card').count()===0);
    await page.getByLabel('Availability',{exact:true}).selectOption('all');
    check('major bank search uses automatic source posts',await page.locator('.radar-card').count()===1&&(await page.locator('.radar-card').innerText()).includes('U.S. Bank'));
    await page.getByPlaceholder('Search bank bonuses…').fill('Wells Fargo');
    check('search preserves typed input and focus',await page.getByPlaceholder('Search bank bonuses…').inputValue()==='Wells Fargo'&&await page.evaluate(()=>document.activeElement.id==='radar-search'));
    await page.getByRole('button',{name:'All banks',exact:true}).click();
    check('fresh official state match leads over a pending churn review',
      (await page.locator('.radar-card').first().innerText()).includes('Wells Fargo'));
    check('tracked pending churn stays visible below an applicable officially scoped offer',
      await page.locator('.radar-card').filter({hasText:'U.S. Bank'}).count()===1
      &&(await page.locator('.radar-card').filter({hasText:'U.S. Bank'}).first().innerText()).includes('Next tracker review'));
    check('known regional mismatch ranks last',(await page.locator('.radar-card').last().innerText()).includes('Regional E2E Bank')&&(await page.locator('.radar-card').last().innerText()).includes('Outside your area'));
    await page.getByRole('button',{name:'Churn matches',exact:true}).click();
    check('churn filter uses read-only tracker match',await page.locator('.radar-card').count()===1&&(await page.locator('.radar-card').innerText()).includes('Next tracker review'));
    await page.getByRole('button',{name:'For you',exact:true}).click();
    await page.getByRole('button',{name:'Hide out-of-area',exact:true}).click();
    check('area filter retains unknown offers',await page.locator('.radar-card').count()===3);
    await page.getByRole('button',{name:'For you',exact:true}).click();
    await page.getByLabel('Your area',{exact:true}).selectOption('CA');
    check('area selector reevaluates source region',(await page.locator('.radar-card').filter({hasText:'Regional E2E Bank'}).innerText()).includes('California listed'));
    await page.getByLabel('Your area',{exact:true}).selectOption('MO');
    await page.evaluate(()=>{window.__savedPriorityAuth=BTBonusAuth;BTBonusAuth={connected:()=>true,token:async()=> 'e2e-priority-token'};});
    await button('Check updates').click();await page.waitForFunction(()=>window.__availabilityPriorityRequests.length>0);
    check('churn verifier receives only public offer URLs',await page.evaluate(()=>window.__availabilityPriorityRequests.every(p=>Object.keys(p).join(',')==='offers'&&p.offers.length<=8&&p.offers.every(x=>x.startsWith('https://')))));
    await page.evaluate(()=>{BTBonusAuth=window.__savedPriorityAuth;delete window.__savedPriorityAuth;});
    check('personal discovery fits narrow mobile viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.evaluate(()=>{undoState=null;clearTimeout(undoTimer);R()});
    await page.getByPlaceholder('Search bank bonuses…').fill('');
    // Radar re-renders after source/area updates; retry a detached card rather than
    // treating a transient DOM replacement as a failed bank-data invariant.
    for(let attempt=0;attempt<3;attempt++){
      try{await page.locator('.radar-card').first().scrollIntoViewIfNeeded({timeout:5000});break;}
      catch(e){if(!/not attached|detached/i.test(String(e))||attempt===2)throw e;await page.locator('.radar-card').first().waitFor({state:'visible'});}
    }
    await page.screenshot({path:path.join(output,name+'-offers-compact.png')});
    await page.getByRole('button',{name:'All banks',exact:true}).click();
    // v3.6.88: failure of the *separate* official verifier must never
    // replace usable public listings with a manual retry chore.
    await page.evaluate(()=>{
      window.__originalAvailabilityFetch=window.fetch;
      window.fetch=(input,options={})=>
        String(typeof input==='string'?input:input?.url||'').includes('/public/bank-bonus-availability')
        ?Promise.resolve(new Response(JSON.stringify({detail:'unavailable'}),{status:503,headers:{'Content-Type':'application/json'}}))
        :window.__originalAvailabilityFetch(input,options);
      return btRefreshBankBonuses();
    });
    await page.getByText(/Official verification delayed · automatic retry/).waitFor();
    check('official verifier outage leaves the source-post directory usable',
      await page.locator('.radar-card').count()===4);
    check('official outage never appears as a blocking manual refresh warning',
      !(await page.locator('.bt362-offer-stale').allInnerTexts()).some(x=>/Official checks|Official availability could not update/i.test(x))&&
      await page.locator('.bt3662-source-queue').evaluate(el=>!!el.closest('.bt362-about-sources')));
    check('official verification error does not invent personal eligibility',
      await page.getByText(/unverified terms cannot establish eligibility/).isVisible());
    for(const width of [320,390,430]){
      await page.setViewportSize({width,height:844});
      check('automatic verification delay status fits mobile '+width+'px',
        await page.locator('.bt3688-auto-status').evaluate(el=>el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth));
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{
      const original=window.__originalAvailabilityFetch;
      window.fetch=(input,options={})=>
        String(typeof input==='string'?input:input?.url||'').includes('/public/bank-bonus-availability')
        ?Promise.resolve(new Response(JSON.stringify({schemaVersion:1,status:'unavailable',records:{}}),
          {status:200,headers:{'Content-Type':'application/json'}}))
        :original(input,options);
      return btRefreshBankBonuses();
    });
    check('unavailable service payload also degrades safely instead of claiming verified',
      await page.locator('.bt3688-auto-status').count()===1&&
      await page.locator('.radar-card').count()===4);
    await page.evaluate(()=>{window.fetch=window.__originalAvailabilityFetch;delete window.__originalAvailabilityFetch;return btRefreshBankBonuses()});
    await page.getByText(/Official verification delayed · automatic retry/).waitFor({state:'detached'});
    check('successful official response clears delayed status without changing accounts',
      await page.locator('.bt3688-auto-status').count()===0&&
      await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===storedDuringRadar);
    feedInvalid=true;await button('Check updates').click();
    await page.getByText(/Could not check for updates/).waitFor();
    check('failed feed refresh retains loaded results',await page.locator('.radar-card').count()===4);
    check('bank feed leaves saved account data unchanged',await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===storedDuringRadar);
    feedInvalid=false;await page.evaluate(()=>{entries=entries.filter(e=>e.id!=='radar-us-bank');sv(SK,entries);R()});await button('Tracker').click();
    check('mobile dashboard scrolls with content',await page.locator('.tracker-overview').evaluate(e=>!!e.closest('.scroll')));
    check('mobile fixed header leaves room for workflow',await page.locator('.hdr').evaluate(e=>e.getBoundingClientRect().height<=90));
    // Service-worker-controlled fetches may bypass Playwright HTTP routing.
    // Stub the external AI boundary; tests never send bonus facts to production.
    await page.evaluate(()=>{
      const nativeFetch=window.fetch;
      window.__bonusAITest={calls:[],authCalls:0,fail:false,nativeFetch};
      window.fetch=async function(input,options){
        const url=typeof input==='string'?input:input.url;
        if(url.startsWith('https://ppsljqaaanpkksxbpalk.supabase.co/auth/v1/token?')){
          window.__bonusAITest.authCalls++;
          return new Response(JSON.stringify({access_token:window.__bonusAITest.authCalls===1?'synthetic-owner-token':'synthetic-refreshed-token',refresh_token:'synthetic-refresh-token',expires_in:3600}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        if(url==='https://api-production-00f74.up.railway.app/api/bonus-tracker/ask'){
          window.__bonusAITest.calls.push({packet:JSON.parse(options.body),authorization:options.headers.Authorization,credentials:options.credentials});
          return new Response(JSON.stringify(window.__bonusAITest.serverFailure?{detail:'AI could not produce a supported answer.'}:window.__bonusAITest.fail?{detail:'AI is busy. Try again later.'}:window.__bonusAITest.response||{answer:'The bonus is recorded as received. Check the tracker closure gates before closing.',factIds:['bonusrecd','close_gate'],missing:[],cached:false}),{status:window.__bonusAITest.serverFailure?503:window.__bonusAITest.fail?429:200,headers:{'Content-Type':'application/json'}});
        }
        return nativeFetch.call(this,input,options);
      };
    });
    if(!await page.locator('.bt360-detail-footer button').first().isVisible()){await openAccounts();await page.locator('.bt366-compact-row').first().click();}
    // Test the retained AI service without an extra Advanced view in the everyday tracker.
    await page.evaluate(()=>{window.__btBankActionPrompt=null;btOpenBonusAI(entries[0].id)});
    await page.locator('.bonus-ai-heading').waitFor({state:'visible'});
    check('Tracker AI opens for one selected bank',(await page.locator('.bonus-ai-heading').innerText()).includes('E2E Verification Bank')&&await page.evaluate(()=>window.__bonusAITest.calls.length===0));
    check('local answers need no login',await page.locator('#bonus-ai-login').isHidden());
    for(const label of ['Monthly fee','Fee waivers','Direct deposit','Closing rules','Companion account','Repeat eligibility']){await button(label).click();check('prefill: '+label,(await page.locator('#bonus-ai-question').inputValue()).length>20);}
    await button('Closure rules').click();await page.locator('#bonus-ai-send').click();
    await page.locator('#bonus-ai-answer p').first().waitFor();
    const aiCloseState=await page.evaluate(()=>{
      const e=entries[0],decision=btEvaluateAccount(e),next=btNextActionForEntry(e),readiness=closeReadiness(e),financial=BTFinancialRules?.validate(e);
      return {close:decision.close.status,action:next.kind,check:readiness.cls,financial:financial?.ok!==false};
    });
    const aiExpectedVerdict=aiCloseState.action==='close'&&aiCloseState.check==='safe'&&aiCloseState.close==='ready'&&aiCloseState.financial
      ?'Ready — tracker checks passed':'Needs verification';
    check('AI closure verdict requires both contractual and operational checks',(await page.locator('.bonus-ai-verdict').innerText())===aiExpectedVerdict);
    const aiNextStep=await page.locator('.bonus-ai-next-step').innerText();
    const explainsCloseGate=!aiCloseState.financial?aiNextStep.includes('conflicting financial rules')
      :aiExpectedVerdict==='Needs verification'?/\bclos(?:e|ure) checks\b/i.test(aiNextStep)
      :aiNextStep.includes('companion accounts');
    check('AI explains the exact unresolved rule or next action',explainsCloseGate);
    check('common answers do not send facts',await page.evaluate(()=>window.__bonusAITest.calls.length===0&&window.__bonusAITest.authCalls===0));
    await button('Ask AI for more').click();
    check('remote AI asks for login before sending facts',await page.locator('#bonus-ai-login').isVisible()&&await page.evaluate(()=>window.__bonusAITest.calls.length===0));
    await page.getByLabel('Email',{exact:true}).fill('synthetic@example.test');
    await page.getByLabel('Password',{exact:true}).fill('synthetic-test-password');
    await button('Sign in and ask AI').click();await page.getByText('AI explanation · review the source details.',{exact:true}).waitFor();
    check('login resumes the pending AI question',await page.evaluate(()=>window.__bonusAITest.authCalls===1&&window.__bonusAITest.calls.length===1));
    check('password is cleared and never persisted',await page.locator('#bonus-ai-password').inputValue()===''&&await page.evaluate(()=>!localStorage.getItem('bonus-ai-auth').includes('synthetic-test-password')));

    check('backups exclude remembered AI credentials',await page.evaluate(()=>![JSON.stringify(buildStorageSnapshot()),JSON.stringify(btFullBackupMakePayload())].some(s=>/synthetic-owner-token|synthetic-refresh-token/.test(s))));
    const {packet:aiPacket,authorization:aiAuthorization,credentials:aiCredentials}=await page.evaluate(()=>window.__bonusAITest.calls[0]);
    check('AI uses authenticated endpoint without cookies',aiAuthorization==='Bearer synthetic-owner-token'&&aiCredentials==='omit'&&aiPacket.question.includes('close'));
    check('AI uses canonical saved facts without account identifiers or notes',aiPacket.facts.some(f=>f.id==='close_gate')&&aiPacket.facts.some(f=>f.id==='close_date')&&!JSON.stringify(aiPacket).includes(id)&&!JSON.stringify(aiPacket).includes('Synthetic verification record only'));
    await page.locator('#bonus-ai-answer summary').click();
    check('AI displays cited saved facts',(await page.locator('#bonus-ai-answer').innerText()).includes('Tracker closure checks'));
    check('AI modal fits narrow mobile viewport',await page.locator('.bonus-ai-modal').evaluate(e=>e.getBoundingClientRect().width<=window.innerWidth));
    await page.screenshot({path:path.join(output,name+'-tracker-ai.png')});
    await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('bonus-ai-auth'));s.expires_at=0;localStorage.setItem('bonus-ai-auth',JSON.stringify(s));});
    await button('Ask AI for more').click();await page.getByText('AI explanation · review the source details.',{exact:true}).waitFor();
    check('expired access token refreshes without login',await page.evaluate(()=>window.__bonusAITest.authCalls===2&&window.__bonusAITest.calls[1].authorization==='Bearer synthetic-refreshed-token')&&await page.locator('#bonus-ai-login').isHidden());
    await page.evaluate(()=>window.__bonusAITest.response={answer:'Unsupported response',factIds:[],missing:[{text:'Malformed'}]});
    await button('Ask AI for more').click();await page.getByText('AI returned an unsupported answer. Account-detail answer shown below.',{exact:true}).waitFor();
    check('malformed AI output preserves closure gates',await page.locator('.bonus-ai-verdict').innerText()===aiExpectedVerdict);
    await page.evaluate(()=>window.__bonusAITest.fail=true);await button('Ask AI for more').click();await page.getByText('AI is busy. Try again later. Account-detail answer shown below.',{exact:true}).waitFor();
    check('AI rate limit is handled without repeated requests',await page.evaluate(()=>window.__bonusAITest.calls.length===4));
    await page.evaluate(()=>{window.__bonusAITest.fail=false;window.__bonusAITest.response=null;window.__bonusAITest.serverFailure=true;});
    await button('Ask AI for more').click();await page.getByText('AI could not produce a supported answer. Account-detail answer shown below.',{exact:true}).waitFor();
    check('production-style AI failure preserves canonical closure warning',(await page.locator('.bonus-ai-direct-answer').innerText()).includes(aiExpectedVerdict));
    await button('Monthly fee').click();await page.locator('#bonus-ai-send').click();
    check('saved-rule answers work after AI failure',await page.getByText('Based on your account details.',{exact:true}).count()===1&&await page.evaluate(()=>window.__bonusAITest.calls.length===5));
    const feeFields=await page.evaluate(()=>{
      const e=entries[0],keys=['monthlyFeeYNText','monthlyFeeAmountText','monthlyFeeFrequency','monthlyFeeWaiverText','avoidMonthlyFeeText'];
      const prior=keys.map(key=>({key,present:Object.hasOwn(e,key),value:e[key]}));
      Object.assign(e,{monthlyFeeYNText:'Personal checking: $0 monthly maintenance fee. Required Share Savings: $10/month if the $50 minimum balance is not maintained.',monthlyFeeAmountText:'$10',monthlyFeeFrequency:'monthly',monthlyFeeWaiverText:'Keep at least $50 in the required Share Savings account to avoid the $10/month fee.',avoidMonthlyFeeText:'Keep at least $50 in the required Share Savings account to avoid the $10/month fee.'});
      return prior;
    });
    await button('Monthly fee').click();await page.locator('#bonus-ai-send').click();
    const feeAnswer=await page.locator('.bonus-ai-direct-answer').innerText();
    check('fee answer distinguishes checking and companion account',feeAnswer==='Your checking account has no monthly maintenance fee. The required Share Savings account charges $10 per month if its balance falls below $50.');
    check('fee next step is specific without duplicate fields',(await page.locator('.bonus-ai-next-step p').innerText())==='Keep at least $50 in the required Share Savings account to avoid the $10/month fee.');
    check('answer hides implementation labels',!await page.getByText('Saved-rule answer',{exact:true}).count()&&!/Saved monthly|Waiver type:|Waiver amount:/.test(feeAnswer));
    await page.screenshot({path:path.join(output,name+'-natural-fee-answer.png')});
    await page.evaluate(prior=>{const e=entries[0];for(const f of prior){if(f.present)e[f.key]=f.value;else delete e[f.key];}},feeFields);
    await page.getByRole('button',{name:'Close AI',exact:true}).click();
    check('asking AI preserves all saved account data',await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===storedBeforeRadar);
    // Cloud protection remains on the Tracker hero after entering and leaving a focused detail.
    await page.getByRole('button',{name:'Back to accounts'}).click();
    check('returning from account detail reveals cloud backup controls',await page.locator('#bt-cloud-open').isVisible());
    // Manual recovery uses a real downloaded file and an independent browser profile.
    const manualDownload=page.waitForEvent('download');await page.evaluate(()=>BTICloudBackup.exportFile());
    const recoveryFile=path.join(output,name+'-manual-recovery.json');await (await manualDownload).saveAs(recoveryFile);
    const recoveryPayload=JSON.parse(await fs.readFile(recoveryFile,'utf8'));
    check('manual recovery file includes exact current records',JSON.stringify(recoveryPayload.entries)===storedBeforeRadar);
    check('manual file excludes remembered credentials',!JSON.stringify(recoveryPayload).includes('synthetic-owner-token')&&!JSON.stringify(recoveryPayload).includes('synthetic-refresh-token'));
    const newPhoneContext=await browser.newContext({acceptDownloads:true,viewport:{width:390,height:844},timezoneId:'America/Chicago'});
    const newPhone=await newPhoneContext.newPage();
    await newPhone.goto(url);await newPhone.waitForFunction(()=>window.BTICloudBackup&&window.BT360);
    await newPhone.waitForTimeout(2200);
    await newPhone.locator('#bt-cloud-open').click();
    const newWizard=newPhone.getByRole('dialog',{name:'Backup with iCloud Drive'});
    check('new phone opens manual backup without sign-in',await newWizard.isVisible()&&await newPhone.locator('#cloud-auto-toggle,#cloud-now').count()===0);
    const fileChooser=newPhone.waitForEvent('filechooser');await newWizard.locator('#icloud-restore').click();await (await fileChooser).setFiles(recoveryFile);
    const safetyCopy=newPhone.waitForEvent('download');await newPhone.getByRole('button',{name:'Restore Backup',exact:true}).click();await safetyCopy;
    await newPhone.getByRole('heading',{name:'Restore Complete'}).waitFor();
    check('new-phone manual restore preserves exact stored tracker data',await newPhone.evaluate(()=>localStorage.getItem('bt_e_v4'))===storedBeforeRadar);
    await newPhoneContext.close();
    check('manual export never changes original account records',await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===storedBeforeRadar);
    // Restore native fetch before verifying real service-worker offline navigation.
    await page.evaluate(()=>{window.fetch=window.__bonusAITest.nativeFetch;delete window.__bonusAITest;});

    // Reopen detail and prove the compact/expanded views remain stable across years.
    {await openAccounts();await page.locator('.bt366-compact-row').first().click();}
    check('detail retains one simple status after reload',await page.locator('.bt3810-status').count()===1);
    await page.locator('#bt362-year').selectOption('2025');
    await page.locator('#bt362-year').selectOption('2026');
    check('year navigation preserves focused detail',await page.locator('.bt360-detail-header').count()===1&&await page.locator('.bt3810-detail').count()===1);
    // The focused detail intentionally hides the Tracker list search; navigate back first.
    await page.getByRole('button',{name:'Back to accounts'}).click();
    await page.getByPlaceholder('Search accounts...').pressSequentially('E2E');
    check('tracker search keeps cursor through consecutive keystrokes',await page.getByPlaceholder('Search accounts...').inputValue()==='E2E'&&await page.evaluate(()=>document.activeElement.id==='tracker-search'));
    await page.getByPlaceholder('Search accounts...').fill('');
    await button('Datapoints').click();
    // Browser-level trust check: do not mix saved personal/business evidence.
    await page.evaluate(()=>{
      window.__audienceFixtureBackup=loadUserDatapoints();
      saveUserDatapoints([
        {id:'e2e-personal-audience',bank:'E2E Personal Evidence',method:'Payroll',accountType:'personal',outcome:'pending'},
        {id:'e2e-business-audience',bank:'E2E Business Evidence',method:'Payroll',accountType:'business',outcome:'pending'},
        {id:'e2e-unknown-audience',bank:'E2E Unknown Evidence',method:'ACH',accountType:'',outcome:'pending'}
      ]);
      dpTaskBankKey='';dpSearch='';dpFilters.view='personal';dpFilters.type='business';window.bt366GroupData=false;R();
    });
    check('business datapoint filter excludes personal and unclassified saved notes',
      await page.locator('.bt366-dp-item').allInnerTexts().then(rows=>rows.some(t=>t.includes('E2E Business Evidence'))&&rows.every(t=>!t.includes('E2E Personal Evidence')&&!t.includes('E2E Unknown Evidence'))));
    await page.evaluate(()=>{dpFilters.type='personal';R()});
    check('personal datapoint filter excludes business saved notes',
      await page.locator('.bt366-dp-item').allInnerTexts().then(rows=>rows.some(t=>t.includes('E2E Personal Evidence'))&&rows.every(t=>!t.includes('E2E Business Evidence')&&!t.includes('E2E Unknown Evidence'))));
    await page.evaluate(()=>{dpFilters.type='all';R()});
    check('all-audience datapoints retain unclassified notes',
      await page.locator('.bt366-dp-item').allInnerTexts().then(rows=>rows.some(t=>t.includes('E2E Unknown Evidence'))));
    await page.evaluate(()=>{
      saveUserDatapoints(window.__audienceFixtureBackup||[]);delete window.__audienceFixtureBackup;
      dpFilters={view:'all',scope:'all',result:'all',type:'all',source:'all',dated:'all'};R();
    });
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,name+'-v362-data-390.png')});
    check('Data defaults to individual community report rows',await page.locator('.bt366-dp-item').count()>0&&await page.getByRole('button',{name:'Group by bank'}).isVisible());
    await button('Group by bank').click();
    check('bank grouping stays available as an optional view',await page.locator('button.dp-head').count()>0);

    check('Data starts with search and collapses reading help after report list',await page.locator('.dp-summary').count()===0&&await page.locator('.bt362-data-view > .dp-search').count()===1&&await page.locator('.research-help').filter({hasText:'How to read these reports'}).evaluate(x=>!x.open));
    await page.getByPlaceholder('Search bank, method, or note...').pressSequentially('E2E');
    check('datapoint search keeps focus while typing',await page.getByPlaceholder('Search bank, method, or note...').inputValue()==='E2E'&&await page.evaluate(()=>document.activeElement.id==='datapoints-search'));
    check('datapoint bank is keyboard accessible',await page.locator('button.dp-head').getAttribute('aria-expanded')!==null);
    await page.getByPlaceholder('Search bank, method, or note...').fill('Wells Fargo');
    await page.locator('button.dp-head').first().click();
    check('community report shows event and checked dates',await page.locator('.research-report').first().innerText().then(t=>t.includes('Bonus paid')&&t.includes('Source checked')&&t.includes('Reported success')));
    check('datapoints no longer offers account deletion',await page.getByRole('button',{name:'Delete bank',exact:true}).count()===0);
    await page.getByText('More filters and saved notes',{exact:true}).click();
    await page.getByLabel('Result',{exact:true}).selectOption('worked');
    check('filter panel stays open after a selection',await page.locator('.research-filters').evaluate(e=>e.open));
    await page.getByLabel('Source',{exact:true}).selectOption('reddit');
    check('source filter returns dated Reddit reports',await page.locator('.research-report .research-source').first().getAttribute('href').then(u=>u.includes('reddit.com')));
    await page.getByText('More filters and saved notes',{exact:true}).click();
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      check('datapoint mobile width '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.research-report')].every(e=>e.scrollWidth<=e.clientWidth+1)));
      if(width===390){await page.locator('.research-report').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,name+'-datapoints-mobile.png')})}
    }
    await button('+ Add a report').click();
    await page.locator('.research-editor-body input').first().fill('E2E Report Bank');
    await page.locator('.research-editor-body input').nth(1).fill('Synthetic employer payroll');
    await page.getByLabel('Reported result',{exact:true}).selectOption('worked');
    await page.locator('.research-editor-body textarea').fill('Synthetic report for browser verification');
    await page.locator('.experience-optional > summary').click();
    await page.getByLabel('Deposit or payout date',{exact:true}).fill('2026-09-30');
    await page.locator('.research-editor-body input[type=url]').fill('https://example.test/report');
    check('report editor footer stays within mobile viewport',await page.locator('.research-editor-footer').evaluate(e=>{const r=e.getBoundingClientRect();return r.bottom<=innerHeight+1&&r.top>0}));
    await button('Save report').click();
    check('source report save preserves activity date',await page.evaluate(()=>loadCommunityDatapoints().some(x=>x.bank==='E2E Report Bank'&&x.eventDate==='2026-09-30'&&x.outcome==='worked')));
    await button('Archive').click();check('archive unifies terms and cooldown',await page.locator('.bt360-archive-switch').count()===0);
    await page.getByPlaceholder('Search banks, dates or saved terms…').pressSequentially('E2E');
    check('terms search keeps focus while typing',await page.getByPlaceholder('Search banks, dates or saved terms…').inputValue()==='E2E'&&await page.evaluate(()=>document.activeElement.id==='terms-search'));
    const termsBank=page.locator('.archive-bank').first();
    check('terms bank starts collapsed',!(await termsBank.evaluate(e=>e.open)));
    await termsBank.locator(':scope > summary').click();
    const currentTerms=termsBank.locator(':scope > .archive-bank-body > .archive-cycle').first();
    check('archive starts with optional evidence hidden',!(await currentTerms.locator('.bt-archive-more').first().evaluate(e=>e.open)));
    await currentTerms.locator('.bt-archive-more > summary').first().click();
    await currentTerms.getByText('Read original saved promotion',{exact:true}).click();
    check('archive reveals original evidence for the current saved cycle',(await currentTerms.innerText()).includes('E2E Verification Bank checking promotional terms'));
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      check('archive mobile width '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.archive-raw')].every(e=>e.scrollWidth<=e.clientWidth+1)));
      if(width===390){await currentTerms.locator('.archive-raw').last().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,name+'-terms-archive-mobile.png')})}
    }

    await button('Tracker').click();
    await page.evaluate(()=>{
      window.__dashboardEntries=entries;
      entries=[...entries,{id:'synthetic-dashboard-amount',bank:'Visual Overflow Fixture',accountType:'personal',bonus:1234567,opened:'2026-01-02',bonusRecd:'2026-10-01',closed:'',customTimers:[],checklist:[]}];R();
    });
    for(const width of [320,375,390,430,1024]){
      await page.setViewportSize({width,height:844});
      const expected=await page.evaluate(()=>fM(entries.filter(e=>e.accountType==='personal'&&e.bonusRecd&&e.bonusRecd.slice(0,4)==='2026').reduce((a,e)=>a+Number(e.bonus||0),0)));
      const summary=await page.locator('.bt360-hero').evaluate(e=>({
        text:e.innerText,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,
        scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,
        bars:e.querySelectorAll('.bt367-month-chart>.bt367-month-hit').length,
        amount:e.querySelector('.bt360-hero-amount')?.innerText,
        amountFits:(()=>{const a=e.querySelector('.bt360-hero-amount');return a&&a.scrollWidth<=a.clientWidth+1})()
      }));
      const dashboardFits=summary.text.includes('COLLECTED IN 2026')&&summary.amount===expected
        &&summary.bars===12&&summary.scrollWidth<=summary.clientWidth+1&&summary.amountFits;
      if(!dashboardFits)console.error(name+' collected-year hero at '+width+'px: '+JSON.stringify(summary));
      check('complete dashboard summary at '+width+'px',dashboardFits);
      check('release version stays inside header at '+width+'px',await page.locator('.hdr .app-version').evaluate(e=>{
        const r=e.getBoundingClientRect(),h=e.closest('.hdr').getBoundingClientRect();
        return e.textContent==='v'+window.BT_APP_VERSION&&r.width>0&&r.height>0&&r.top>=h.top&&r.bottom<=h.bottom&&r.left>=0&&r.right<=innerWidth&&getComputedStyle(e).position==='static';
      }));
      check('dashboard text and chips fit at '+width+'px',await page.locator('.bt360-hero').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('.bt360-kicker,.bt360-backup')].every(n=>n.scrollWidth<=n.clientWidth+1)));
      if(width===430)await page.screenshot({path:path.join(output,name+'-dashboard-header.png')});
    }
    await page.evaluate(()=>{entries=window.__dashboardEntries;delete window.__dashboardEntries;R();});
    check('Finance tab is absent',await page.getByRole('button',{name:'Finances',exact:true}).count()===0);
    check('Tracker bank activity review is absent',await page.getByRole('button',{name:'Review bank activity',exact:true}).count()===0);
    check('removed Finance URLs return safe Tracker state',await page.evaluate(()=>{switchMainTab('finances');return document.querySelector('[aria-label="Tracker"][aria-current="page"]')!==null}));
    for(const width of [320,375,390]){
      await page.setViewportSize({width,height:844});
      for(const name of ['Tracker','Bank Bonuses','Tax','Datapoints','Archive']){
        await button(name).click();
        check(name+' fits '+width+'px mobile width',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
        check(name+' navigation starts at the top at '+width+'px',await page.locator('.scroll').evaluate(e=>e.scrollTop===0));
        check(name+' shows version at '+width+'px',await page.locator('.hdr .app-version').isVisible());
        if(name==='Tracker'){
          check('bank cards retain mobile touch area at '+width+'px',await page.locator('[data-attention-link]').evaluateAll(rows=>rows.length>0&&rows.every(e=>e.getBoundingClientRect().height>=44)));
          check('bank cards fit without dashboard buttons at '+width+'px',await page.locator('.bt3641-attention-item').evaluateAll(rows=>rows.every(e=>e.scrollWidth<=e.clientWidth+1&&!e.querySelector('.bt360-actions'))));
        }
      }
    }
    check('mobile tab targets are at least 44px tall',await page.locator('.tabs .tb').evaluateAll(rows=>rows.every(e=>e.getBoundingClientRect().height>=44)));
    await button('Tracker').click();
    await edit();
    await page.setViewportSize({width:320,height:844});
    check('editor progress shows all four named accessible steps on iPhone',
      await page.locator('.guided-progress button').evaluateAll(rows=>rows.length===4&&rows.every((el,i)=>{
        const label=el.querySelector('span');
        return el.getAttribute('aria-label')?.startsWith('Step '+(i+1)+':')&&label&&getComputedStyle(label).display!=='none'&&el.getBoundingClientRect().height>=44&&el.getBoundingClientRect().right<=innerWidth+1;
      })));
    check('editor has an accessible close and current step',
      await page.getByRole('button',{name:'Close account editor'}).isVisible()
      &&await page.locator('.guided-progress button[aria-current="step"]').count()===1);
    await page.getByRole('button',{name:'Step 2: Requirements'}).click();
    await page.waitForFunction(()=>document.activeElement?.id==='bt-editor-title');
    check('step navigation moves focus to the editor heading',
      await page.locator('#bt-editor-title').evaluate(el=>document.activeElement===el));
    const unsavedRequirement='Synthetic mobile draft - not saved';
    await page.locator('.guided-body input[oninput*="dataPoint"]').fill(unsavedRequirement);
    await page.getByRole('button',{name:'Step 1: Basics'}).click();
    await page.getByRole('button',{name:'Step 2: Requirements'}).click();
    check('returning to an earlier step keeps unsaved edits',
      await page.locator('.guided-body input[oninput*="dataPoint"]').inputValue()===unsavedRequirement);
    await button('Cancel').click();
    check('discarding a changed editor requires an explicit confirmation',
      await page.getByRole('button',{name:'Keep editing'}).isVisible()
      &&await page.getByRole('button',{name:'Discard changes'}).isVisible());
    await page.getByRole('button',{name:'Keep editing'}).click();
    check('keeping editing retains the exact draft',
      await page.locator('.guided-body input[oninput*="dataPoint"]').inputValue()===unsavedRequirement);
    await page.getByRole('button',{name:'Close account editor'}).click();
    await page.getByRole('button',{name:'Discard changes'}).click();
    check('confirmed discard exits without editing account records',
      await page.locator('.guided-modal').count()===0
      &&await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===storedBeforeRadar);
    await edit();
    await page.setViewportSize({width:320,height:844});
    check('mobile editor content fits 320px',await page.locator('.modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    check('saved rule editing defaults collapsed on mobile',await page.locator('.eligibility-restriction').evaluateAll(rows=>rows.every(e=>!e.open)));
    check('manual rule tools default collapsed on mobile',!await page.locator('#elig-template').isVisible());
    for(const height of [568,844]){
      await page.setViewportSize({width:320,height});
      await page.locator('.guided-body').evaluate(e=>e.scrollTop=e.scrollHeight);
      check('form and footer never overlap at '+height+'px',await page.locator('.guided-modal').evaluate(e=>{
        const body=e.querySelector('.guided-body').getBoundingClientRect(),header=e.querySelector('.guided-header').getBoundingClientRect(),footer=e.querySelector('.guided-actions').getBoundingClientRect();
        return body.top>=header.bottom-1&&body.bottom<=footer.top+1&&footer.bottom<=innerHeight+1&&body.height>40;
      }));
      await page.locator('.guided-body').evaluate(e=>e.scrollTop=0);
    }
    await page.screenshot({path:path.join(output,name+'-entry-editor-mobile.png')});
    await page.setViewportSize({width:390,height:844});
    check('mobile editor fits viewport and prevents input zoom',await page.locator('.modal').evaluate(e=>e.getBoundingClientRect().width<=window.innerWidth)&&await page.locator('.modal input').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
    await cancelEditor();
    check('mobile navigation and editor leave saved records unchanged',await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===storedBeforeRadar);
    await page.evaluate(()=>{undoState=null;clearTimeout(undoTimer);R()});
    check('mobile Tracker shows no old Action Center disclosure',await page.locator('.bt360-legacy-actions').count()===0);
    await page.screenshot({path:path.join(output,name+'-mobile-verified.png')});
    // Long saved requirements must remain readable without changing account storage.
    await page.evaluate(()=>{
      window.__cardTextOriginal=JSON.parse(JSON.stringify(entries));
      const e=entries[0];e.bank='E2E Lafayette Federal Credit Union';e.reqMet='2026-08-10';e.bonusRecd='';e.closed='';
      e.customTimers=[{id:'long-requirement',text:'Establish $500+ monthly qualified direct deposits and retain the required membership savings balance',startDate:'2026-09-11',date:'2026-10-26',daysRequired:45,done:false}];
      expanded=null;R();
    });
    await openAccounts();
    for(const width of [320,375,390,1024]){
      await page.setViewportSize({width,height:844});
      const row=page.locator('.bt366-compact-row').first();
      check('long next step remains readable at '+width+'px',await row.evaluate(e=>e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth));
      check('compact tile retains actual bank and stage at '+width+'px',(await row.innerText()).includes('Lafayette Federal Credit Union'));
      if(width===390)await row.screenshot({path:path.join(output,name+'-card-text.png')});
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{
      entries.push({...entries[0],id:'E2E-TILE-02',bank:'E2E Citi',bonus:325,reqMet:'2026-08-10',payoutTimingText:'Bonus expected after requirements are completed',customTimers:[]});R();
    });
    check('both pending offers appear as independent compact account rows',await page.locator('.bt366-compact-row').count()===2);
    check('separate bank rows preserve saved timers without displaying past-cycle noise',
      await page.locator('.bt366-compact-row').allInnerTexts().then(t=>t.some(x=>x.includes('Lafayette Federal Credit Union'))&&t.some(x=>x.includes('E2E Citi'))&&!t.some(x=>x.includes('Establish $500+')))
      &&await page.evaluate(()=>entries.some(x=>x.bank==='E2E Lafayette Federal Credit Union'&&x.customTimers.some(t=>t.text.startsWith('Establish $500+')))));
    const taskStorage=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await button('Hide accounts').click();
    check('duplicate directory collapses on request',await page.locator('.bt366-compact-row').count()===0);
    const headers=page.locator('[data-attention-link]');
    const attentionOrder=await headers.evaluateAll(rows=>rows.map(e=>e.dataset.attentionLink));
    check('each bank has one direct details card',attentionOrder.length===2);
    check('dashboard cards have no visible action buttons',await page.locator('[data-queue] .bt360-actions').count()===0);
    check('direct cards preserve priority order',JSON.stringify(await headers.evaluateAll(rows=>rows.map(e=>e.dataset.attentionLink)))===JSON.stringify(attentionOrder));
    const selectedId=attentionOrder[1];
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      check('direct bank cards fit '+width+'px',await headers.evaluateAll(rows=>rows.every(e=>e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth)));
      check('direct bank cards retain touch targets at '+width+'px',await headers.evaluateAll(rows=>rows.every(e=>e.getBoundingClientRect().height>=44)));
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,name+'-direct-bank-cards.png')});
    await headers.nth(1).click();
    check('selecting the second bank opens that exact record',await page.evaluate(id=>expanded===id,selectedId));
    check('bank actions exist only inside details',await page.locator('.bt360-detail-footer button').count()===2&&await page.locator('[data-queue] .bt360-actions').count()===0);
    await page.evaluate(()=>BT360.back());
    const searchShortcut=page.locator('.bt3642-search-launcher');
    check('compact search shortcut shows account count',await searchShortcut.innerText().then(t=>t.includes('Search 2 accounts')));
    await searchShortcut.click();
    await wait(()=>document.activeElement?.id==='tracker-search');
    await page.locator('#tracker-search').fill('E2E Citi');
    check('direct search finds the exact account and retains focus',await page.locator('.bt366-compact-row').count()===1&&await page.locator('.bt366-compact-row').innerText().then(t=>t.includes('E2E Citi'))&&await page.locator('#tracker-search').evaluate(e=>document.activeElement===e));
    await page.locator('#tracker-search').fill('No synthetic match');
    await button('Clear search').click();
    await wait(()=>document.activeElement?.id==='tracker-search');
    check('Clear search returns usable focused results',await page.locator('#tracker-search').inputValue()===''&&await page.locator('.bt366-compact-row').count()===2);
    await page.evaluate(()=>BT360.setAudience(BT360.accountAudience(entries[0])==='personal'?'business':'personal'));
    check('empty audience does not claim the user has no accounts',await page.getByText('No accounts in this view',{exact:true}).isVisible()&&await page.getByText('No accounts yet',{exact:true}).count()===0);
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      check('empty-view recovery fits '+width+'px',await page.getByRole('button',{name:'Show all accounts',exact:true}).evaluate(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth}));
      if(width===390)await page.screenshot({path:path.join(output,name+'-empty-filter-recovery-390.png')});
    }
    await page.setViewportSize({width:390,height:844});await button('Show all accounts').click();
    await wait(()=>document.activeElement?.id==='tracker-search');
    check('Show all accounts clears view filters and returns results',await page.locator('.bt366-compact-row').count()===2&&await page.evaluate(()=>BT360.audience==='all'&&search===''));
    await page.locator('#tracker-search').press('Escape');
    await wait(()=>document.activeElement?.classList.contains('bt3642-search-launcher'));
    check('Escape collapses search and restores shortcut focus',await page.locator('.bt366-compact-row').count()===0&&await searchShortcut.isVisible()&&await page.evaluate(()=>search===''));
    check('selection and directory toggles preserve stored records',await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===taskStorage);
    await openAccounts();

    {await openAccounts();await page.locator('.bt366-compact-row').first().click();}
    check('account has one primary action and no duplicate Manage',await page.locator('.bt360-detail-footer .bt360-primary').count()===1&&await page.getByRole('button',{name:'Manage',exact:true}).count()===0);
    check('opening detail does not change account data',await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,taskStorage));
    await page.screenshot({path:path.join(output,name+'-action-tiles.png')});
    await page.evaluate(()=>{entries=window.__cardTextOriginal;delete window.__cardTextOriginal;R();});
    await page.setViewportSize({width:390,height:844});
    check('card layout leaves saved records unchanged',await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===storedBeforeRadar);
    // Source-backed arrival range: actual card/detail DOM on both browser engines.
    await page.evaluate(source=>{
      window.__arrivalOriginal=entries;window.__arrivalExpanded=expanded;window.__arrivalStored=localStorage.getItem('bt_e_v4');
      entries=[{...source,id:'SYN-ARRIVAL',checklist:[],customTimers:[]}];
      tab='tracker';expanded='';R();
    },require('./fixtures/financial-rules.cjs').arrivalFixture());
    await openAccounts();
    check('arrival range is visible on account card',await page.locator('.bt3684-arrival-compact').innerText()==='Estimated bonus arrival: Nov 8–Dec 8, 2026');
    await page.locator('.bt366-compact-row').first().click();
    check('arrival detail shows one plain range',await page.locator('.bt3810-arrival').count()===1&&await page.locator('.bt3810-arrival .bt3810-pair b').innerText()==='Estimated bonus arrival: Nov 8–Dec 8, 2026');
    check('arrival appears before key dates without duplicating it',await page.locator('.bt3810-arrival').evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('.bt3810-dates'))&Node.DOCUMENT_POSITION_FOLLOWING)));
    check('saved terms and history stay out of the main view',!await page.locator('[data-section="terms"] > summary').isVisible()&&!await page.locator('[data-section="history"] > summary').isVisible());
    await page.evaluate(()=>{entries[0].financialRules=null;entries[0].schemaVersion=1;entries[0].payoutTimingText='Bonus paid within 60 calendar days after requirements are met.';R();});
    check('missing completion date cannot invent an arrival date',await page.evaluate(()=>!BTFinancialRules.estimatedArrival(entries[0])&&document.querySelectorAll('.bt3810-arrival').length===0));
    await page.evaluate(source=>{entries[0]={...source,id:'SYN-ARRIVAL',checklist:[],customTimers:[]};R();},require('./fixtures/financial-rules.cjs').arrivalFixture());
    for(const width of [320,375,390,430,1280]){
      await page.setViewportSize({width,height:844});
      check('arrival fits width '+width,await page.locator('.bt3810-arrival').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{document.querySelector('.scroll').scrollTop=0;document.querySelectorAll('.bt-toast,.bt-notice').forEach(el=>el.style.opacity='0')});
    await page.screenshot({path:path.join(output,name+'-estimated-arrival.png')});
    await page.evaluate(()=>{entries[0].opened='2026-08-11';R();});
    check('arrival recomputes when opening changes',await page.locator('.bt3810-arrival .bt3810-pair b').innerText()==='Estimated bonus arrival: Nov 9–Dec 9, 2026');
    await page.evaluate(source=>{window.__beforeLegacyArrival=entries[0];entries[0]={...source,id:'SYN-ARRIVAL'};R();},require('./fixtures/financial-rules.cjs').legacyArrivalFixture());
    check('legacy completion wording displays only the contractual payment deadline',await page.locator('.bt3810-arrival .bt3810-pair b').innerText()==='Bonus payable by Mar 11, 2026 · earliest payment date not specified');
    check('legacy arrival uses the same deadline in AI',await page.evaluate(()=>BTBonusAI.contextFor(entries[0]).some(f=>f.id==='arrival'&&f.text.includes('Bonus payable by Mar 11, 2026'))));
    await page.evaluate(source=>{entries[0]={...source,id:'SYN-ARRIVAL'};R();},require('./fixtures/financial-rules.cjs').tierArrivalFixture());
    check('broad saved quotation resolves the fixed tier deadline',await page.locator('.bt3810-arrival .bt3810-pair b').innerText()==='Bonus payable by Apr 16, 2026 · earliest payment date not specified');
    check('tier deadline and AI agree',await page.evaluate(()=>BTBonusAI.contextFor(entries[0]).some(f=>f.id==='arrival'&&f.text==='Bonus payable by Apr 16, 2026 · earliest payment date not specified')));
    await page.evaluate(source=>{entries[0]={...source,id:'SYN-ARRIVAL'};R();},require('./fixtures/financial-rules.cjs').legacyPublicOfferFixture());
    check('exact enrolled offer recovers missing legacy payout',await page.locator('.bt3810-arrival .bt3810-pair b').innerText()==='Estimated bonus arrival: Jul 30–Aug 29, 2026');
    check('recovered rule retains full official source provenance',await page.evaluate(()=>BTFinancialRules.arrivalSource(entries[0])?.sourceUrl==='https://banking.citi.com/cbol/OM/checking/enhanced-direct-deposit-offer/default.htm?venue=Extra1'));
    check('recovered rule reaches AI with official source',await page.evaluate(()=>BTBonusAI.contextFor(entries[0]).some(f=>f.id==='arrivalsource'&&f.text.includes('https://banking.citi.com/cbol/OM/checking/enhanced-direct-deposit-offer/default.htm?venue=Extra1'))));
    check('recovery never writes a payout date or upgrades legacy rules',await page.evaluate(()=>!entries[0].financialRules&&!entries[0].bonusRecd&&entries[0].reqMet==='2026-05-25'&&!entries[0].tcSourceRaw));
    await page.evaluate(()=>{entries[0]=window.__beforeLegacyArrival;delete window.__beforeLegacyArrival;R();});
    await page.evaluate(()=>{entries[0].bonusRecd='2026-10-10';R();});
    check('arrival disappears after recorded payment',await page.locator('.bt3810-arrival').count()===0);
    check('arrival rendering never writes stored records',await page.evaluate(()=>localStorage.getItem('bt_e_v4')===window.__arrivalStored));
    await page.evaluate(()=>{entries=window.__arrivalOriginal;expanded=window.__arrivalExpanded;delete window.__arrivalOriginal;delete window.__arrivalExpanded;delete window.__arrivalStored;R();});
    await page.setViewportSize({width:390,height:844});
    const structuredProbe=await page.evaluate(source=>{
      const before=localStorage.getItem('bt_e_v4');
      const payload={kind:'BonusTrackerEntry',schemaVersion:3,verification:{promoSourceUrl:source.promoSourceUrl,feeScheduleSourceUrl:source.feeScheduleSourceUrl,termsVerifiedAt:source.termsVerifiedAt},entry:source};
      const parsed=btParseEntryFileText(JSON.stringify(payload),'Structured-E2E.json');
      btStageEntryPayload(payload);
      const projected=collectModalEntryData();
      const valid=BTFinancialRules.validate(projected);
      const facts=BTBonusAI.contextFor({...projected,monthlyFeeAmountText:'$999'});
      const broken={...projected,financialRules:JSON.parse(JSON.stringify(projected.financialRules))};
      broken.financialRules.accounts[1].fee.amount=999;
      return {parsed:!!parsed.financialRules,valid:valid.ok,retained:JSON.stringify(projected.financialRules)===JSON.stringify(source.financialRules)&&projected.feeScheduleRaw===source.feeScheduleRaw,scoped:facts.some(f=>f.id==='financialrules'&&f.text.includes('Share Savings'))&&!facts.some(f=>f.id==='feeamount'),blocked:closeReadiness(broken).cls==='danger'&&BTBonusAI.guidanceFor(broken,'Can I close?').verdict==='Needs verification',unchanged:before===localStorage.getItem('bt_e_v4')};
    },require('./fixtures/financial-rules.cjs').fixture());
    for(const [key,value] of Object.entries(structuredProbe))check('structured v3 browser '+key,value);
    const reviewProbe=await page.evaluate(source=>{
      const before=localStorage.getItem('bt_e_v4');
      btStageEntryPayload({kind:'BonusTrackerEntry',schemaVersion:3,verification:{promoSourceUrl:source.promoSourceUrl,feeScheduleSourceUrl:source.feeScheduleSourceUrl,termsVerifiedAt:source.termsVerifiedAt},entry:source});
      const projected=collectModalEntryData(),after={...projected,reqMet:'2026-04-01',bonusRecd:'2026-04-15',monthlyFeeChecked:true};
      let draftBlocked=false;try{btParseEntryFileText(JSON.stringify({kind:'BonusTrackerResearchDraft',importable:false}),'draft.json')}catch(e){draftBlocked=/review draft/.test(e.message)}
      return {valid:BTFinancialRules.validate(projected).ok,unknown:projected.financialRules.closure.earlyCloseFee===null,manual:projected.closeRestrictionType==='manual-review'&&projected.closeRuleBasis==='manual',blocked:closeReadiness(after).cls==='danger'&&!safeCloseDate(after),draftBlocked,unchanged:before===localStorage.getItem('bt_e_v4')};
    },require('./fixtures/financial-rules.cjs').reviewFixture());
    for(const [key,value] of Object.entries(reviewProbe))check('financial v2 browser '+key,value);
    await cancelEditor();
    // Quick Add belongs to the Tracker list, not the focused account detail.
    await page.getByRole('button',{name:'Back to accounts'}).click();
    const fileSource=require('./fixtures/financial-rules.cjs').reviewFixture();
    await importEntry({kind:'BonusTrackerEntry',schemaVersion:3,verification:{promoSourceUrl:fileSource.promoSourceUrl,feeScheduleSourceUrl:fileSource.feeScheduleSourceUrl,termsVerifiedAt:fileSource.termsVerifiedAt},entry:fileSource});
    check('actual v3 file chooser reaches review after confirmation',await page.getByRole('heading',{name:'Add account',exact:true}).isVisible());
    check('actual v3 file review retains exact rules',await page.evaluate(()=>modal.financialRules.version===2&&modal.financialRules.closure.earlyCloseFee===null&&modal.closeRestrictionType==='manual-review'));
    await cancelEditor();
    await page.evaluate(()=>{
      window.__replacementSavedEntries=JSON.parse(JSON.stringify(entries));window.__replacementSavedStorage=localStorage.getItem('bt_e_v4');
      entries=[{id:'CHA-P-01',bank:'Chase',accountType:'personal',opened:'2023-01-01',closed:'2025-01-01',bonusRecd:'2023-03-01',bonus:100,churn:'1',churnable:true,notes:'Old personal history',customTimers:[],checklist:[],history:[]},{id:'CHA-B-01',bank:'Chase Biz',accountType:'business',opened:'2023-01-01',closed:'2025-01-01',bonusRecd:'2023-03-01',bonus:500,churn:'1',churnable:true,notes:'Business unchanged',customTimers:[],checklist:[],history:[]},{id:'CIT-P-01',bank:'Citi',accountType:'personal',opened:'2023-01-01',closed:'2025-01-01',bonus:50,churn:'1',churnable:true,notes:'Other unchanged',customTimers:[],checklist:[],history:[]}];sv(SK,entries);R();
      window.__replacementBefore=localStorage.getItem('bt_e_v4');window.__replacementBusiness=JSON.stringify(entries.find(e=>e.id==='CHA-B-01'));window.__replacementOther=JSON.stringify(entries.find(e=>e.id==='CIT-P-01'));
    });
    const chaseSource=require('./fixtures/financial-rules.cjs').reviewFixture();chaseSource.bank='Chase';
    await importEntry({kind:'BonusTrackerEntry',schemaVersion:3,verification:{promoSourceUrl:chaseSource.promoSourceUrl,feeScheduleSourceUrl:chaseSource.feeScheduleSourceUrl,termsVerifiedAt:chaseSource.termsVerifiedAt},entry:chaseSource});
    check('Chase file review does not replace saved records',await page.evaluate(()=>localStorage.getItem('bt_e_v4')===window.__replacementBefore));
    await page.getByRole('button',{name:'Step 4: Review',exact:true}).click();await button('💾 Add account').click();
    await page.getByRole('heading',{name:'Replace an old entry?',exact:true}).waitFor();
    check('personal Chase import selects only old personal Chase',await page.evaluate(()=>replacementPickerPrompt.selectedId==='CHA-P-01'&&replacementPickerPrompt.candidates.length===1));
    const originalViewport=page.viewportSize();
    for(const width of [320,375,390]){
      await page.setViewportSize({width,height:700});
      check('replacement picker fits '+width+'px',await page.locator('.replacement-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
      check('replacement card is readable at '+width+'px',await page.locator('.replacement-account').evaluateAll(rows=>rows.every(e=>e.scrollWidth<=e.clientWidth+1)));
      check('replacement radio selects personal Chase at '+width+'px',await page.getByRole('radio').isChecked());
    }
    await page.screenshot({path:path.join(output,name+'-replacement-picker-mobile.png')});
    await button('Review replacement').click();
    check('replacement still requires final confirmation',await page.evaluate(()=>overwritePrompt.existingEntry.id==='CHA-P-01'&&localStorage.getItem('bt_e_v4')===window.__replacementBefore));
    check('final confirmation fits mobile',await page.locator('.replacement-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    check('final confirmation has readable secondary actions',await button('Add separate account').evaluate(e=>{const c=getComputedStyle(e);return c.backgroundColor==='rgb(26, 39, 58)'&&c.color==='rgb(224, 232, 245)'}));
    check('replacement screens omit raw lifecycle labels',!await page.locator('.replacement-dialog').innerText().then(t=>/WAITING TO CHURN!|TIME TO CHURN!/.test(t)));
    await page.screenshot({path:path.join(output,name+'-replacement-confirm-mobile.png')});
    await button('Start new cycle').click();
    await page.setViewportSize(originalViewport);
    check('confirmed replacement preserves history without duplicates',await page.evaluate(()=>{const n=entries.find(e=>e.id==='CHA-P-01');return entries.length===3&&n.financialRules.version===2&&!n.closed&&n.previousCycles[0].closed==='2025-01-01'}));
    check('confirmed personal replacement leaves Chase business and other bank intact',await page.evaluate(()=>JSON.stringify(entries.find(e=>e.id==='CHA-B-01'))===window.__replacementBusiness&&JSON.stringify(entries.find(e=>e.id==='CIT-P-01'))===window.__replacementOther));
    await page.evaluate(()=>{entries=window.__replacementSavedEntries;localStorage.setItem('bt_e_v4',window.__replacementSavedStorage);expanded='';R();});



    await page.evaluate(async()=>{await navigator.serviceWorker.ready});
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    // Chromium checks offline top-level reload. Linux WebKit raises a browser
    // internal error on offline reload, so verify the controlled service worker
    // can actually serve the cached navigation shell while offline instead.
    const beforeOffline=await page.evaluate(async()=>{
      const match=await caches.match('./index.html',{ignoreSearch:true}).catch(()=>null);
      return {controlled:!!navigator.serviceWorker.controller,cached:!!match,cachedOk:match?.ok||false,
        correctTitle:match?.ok?(await match.text()).includes('<title>Bank Bonus Tracker</title>'):false};
    });
    check('service-worker installation cached the actual app shell',beforeOffline.controlled&&beforeOffline.cachedOk&&beforeOffline.correctTitle);
    await context.setOffline(true);
    if(name==='webkit'){
      const offlineShell=await page.evaluate(async()=>{
        const detail={controlled:!!navigator.serviceWorker.controller,cache:false,title:false,fetch:false,fetchError:false};
        try{
          const response=await caches.match('./index.html',{ignoreSearch:true});
          detail.cache=!!response?.ok;
          if(response?.ok)detail.title=(await response.text()).includes('<title>Bank Bonus Tracker</title>');
        }catch{}
        try{
          const response=await fetch('./index.html',{cache:'no-store'});
          detail.fetch=response.ok&&(await response.text()).includes('<title>Bank Bonus Tracker</title>');
        }catch{detail.fetchError=true}
        return detail;
      });
      check('WebKit retains controlled offline app-shell cache: '+JSON.stringify(offlineShell),offlineShell.controlled&&offlineShell.cache&&offlineShell.title);
    }else{
      await page.reload();await settleStartup();await page.getByText('BonusTracker',{exact:false}).first().waitFor();
    }
    check('offline navigation path preserves saved account',(await record()).id===id);
    serverUnavailable=false;await context.setOffline(false);
    check('AI login persists across browser reload',await page.evaluate(()=>BTBonusAuth.connected()));

    // Stale server configuration must not re-enable the retired backup/hosting UI.
    const bankingBeforeSettings=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await page.evaluate(()=>{localStorage.setItem('bt_cloud_recovery_v1',JSON.stringify({enabled:true,lastAt:'2026-10-25T19:01:46Z',error:'Load failed'}));BT360.openSettings()});
    check('settings use manual files even with old server backup enabled',await page.locator('.bt360-sheet').innerText().then(t=>t.includes('ICLOUD DRIVE BACKUP')&&t.includes('Save backup file')&&t.includes('Restore from file')&&!/Railway|R2 storage|CLOUD PROTECTION|Auto-backup|Load failed|HOSTING/.test(t)));
    for(const width of [320,375,390,430,1024]){
      await page.setViewportSize({width,height:844});
      check('manual backup Settings fit '+width+'px',await page.locator('.bt360-sheet').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('.bt360-panel')].every(n=>n.scrollWidth<=n.clientWidth+1)));
      if(width===390)await page.screenshot({path:path.join(output,name+'-manual-icloud-settings-390.png')});
    }
    check('manual backup views leave bank records unchanged',await page.evaluate(before=>localStorage.getItem('bt_e_v4')===before,bankingBeforeSettings));
    await page.getByRole('button',{name:'Close settings'}).click();
    await page.setViewportSize({width:1280,height:900});

    // Legacy nested cycles remain visible without migrating saved financial records.
    await page.evaluate(()=>{
      window.__beforeDeepHistory={entries:JSON.stringify(entries),archive:localStorage.getItem('bt_tc_archive_v1'),audience:BT360.audience};
      entries=[{id:'SYN-DEEP-B-01',bank:'Synthetic Deep Browser Bank',accountType:'business',opened:'2026-10-01',closed:'2026-10-15',bonus:0,previousCycles:[{opened:'2026-06-01',bonus:0,previousCycles:[{opened:'2025-12-01',closed:'2026-04-01',bonusRecd:'2026-03-01',bonus:125,tcSourceRaw:'Exact oldest browser cycle promotion.',feeScheduleRaw:'Exact oldest browser cycle fee schedule.'}]}]}];
      localStorage.setItem('bt_e_v4',JSON.stringify(entries));localStorage.setItem('bt_tc_archive_v1','{}');taxYear=2026;tab='tax';storageSearch='';BT360.setAudience('all');
    });
    check('Tax renders a deeply nested paid cycle',await page.locator('.bt360-tax-record').count()===1&&(await page.locator('.bt360-tax-record > summary').innerText()).includes('Prior cycle'));
    await page.locator('.bt360-tax-record > summary').click();
    await page.locator('.bt360-tax-record').getByText('Saved terms for this cycle',{exact:true}).click();
    await page.locator('.bt360-tax-record').locator('.bt-archive-more > summary').first().click();
    await page.locator('.bt360-tax-record').getByText('Read original saved promotion',{exact:true}).click();
    check('deep receipt opens its exact enrolled promotion',(await page.locator('.bt360-tax-record').innerText()).includes('Exact oldest browser cycle promotion.'));
    await button('Archive').click();
    const deepArchive=page.locator('.bt-archive-bank').filter({hasText:'Synthetic Deep Browser Bank'}).first();
    await deepArchive.locator(':scope > summary').click();
    await deepArchive.locator('.archive-history > summary').click();
    const deepSource=deepArchive.getByText('Read original saved promotion',{exact:true}).first();
    await deepSource.locator('xpath=ancestor::details[contains(@class,"bt-archive-more")][1]').locator(':scope > summary').click();
    await deepSource.click();
    check('unified Archive exposes deeply nested original terms',(await deepArchive.innerText()).includes('Exact oldest browser cycle promotion.'));
    check('recursive history views do not rewrite stored records',await page.evaluate(()=>localStorage.getItem('bt_e_v4')===JSON.stringify(entries)&&localStorage.getItem('bt_tc_archive_v1')==='{}'&&entries[0].previousCycles[0].previousCycles[0].opened==='2025-12-01'));
    await page.evaluate(()=>{entries=JSON.parse(window.__beforeDeepHistory.entries);localStorage.setItem('bt_e_v4',window.__beforeDeepHistory.entries);const raw=window.__beforeDeepHistory.archive;if(raw===null)localStorage.removeItem('bt_tc_archive_v1');else localStorage.setItem('bt_tc_archive_v1',raw);BT360.setAudience(window.__beforeDeepHistory.audience);delete window.__beforeDeepHistory;});
    // Synthetic history recovery: file evidence, preview, confirmation and stale protection.
    const repairFixture={id:'SYN-REPAIR-P-01',bank:'Synthetic Repair Bank',accountType:'personal',opened:'',closed:'2026-05-01',bonusRecd:'2026-04-15',reqMet:'',bonus:250,tcSourceRaw:'',notes:'Original synthetic history'};
    const repairSource={...repairFixture,opened:'2026-01-02',tcSourceRaw:'Exact synthetic enrolled promotion.\nAll original conditions remain recorded.',feeScheduleRaw:'Exact synthetic fee schedule.'};
    await page.evaluate(row=>{
      window.__beforeHistoryRepair={entries:JSON.stringify(entries),archive:localStorage.getItem('bt_tc_archive_v1')};
      entries=[row];localStorage.setItem('bt_e_v4',JSON.stringify(entries));localStorage.setItem('bt_tc_archive_v1','{}');storageSearch='';tab='archive';R();
    },repairFixture);
    // Technical history repair is intentionally not a top-level Archive button.
    check('global history repair entry is hidden',await page.getByRole('button',{name:'Review missing history',exact:true}).count()===0);
    await page.evaluate(()=>window.BTHistoryRepair.open());
    check('history review begins without changing saved financial records',await page.evaluate(row=>localStorage.getItem('bt_e_v4')===JSON.stringify([row])&&localStorage.getItem('bt_tc_archive_v1')==='{}',repairFixture));
    await page.locator('.history-repair-cycle > summary').first().click();
    check('missing cycle facts remain unresolved without evidence',(await page.locator('.history-repair-cycle').innerText()).includes('No exact-cycle evidence found'));
    await page.locator('#history-repair-file').setInputFiles({name:'synthetic-history.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({entries:[repairSource]}))});
    await page.waitForFunction(()=>document.querySelector('#history-repair-status')?.textContent.includes('Backup file checked'));
    await page.locator('.history-repair-cycle > summary').first().click();
    await page.locator('select[data-repair-field="0"]').selectOption('0');
    await page.locator('select[data-repair-field="7"]').selectOption('0');
    await page.locator('#history-repair-preview-button').click();
    check('history preview shows provenance and Tax payment year',(await page.locator('#history-repair-preview').innerText()).includes('not cloud-verified')&&(await page.locator('#history-repair-preview').innerText()).includes('2026:'));
    check('history repair requires explicit confirmation',await page.locator('#history-repair-apply').isDisabled()&&await page.evaluate(()=>entries[0].opened===''));
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      const repairLayout=await page.locator('.history-repair-sheet').evaluate(e=>({fits:e.scrollWidth<=e.clientWidth+1,width:e.clientWidth,scrollWidth:e.scrollWidth,overflow:[...e.querySelectorAll('*')].filter(n=>n.getClientRects().length&&n.getBoundingClientRect().right>e.getBoundingClientRect().right).map(n=>({tag:n.tagName,id:n.id,class:n.className,width:n.clientWidth,scrollWidth:n.scrollWidth}))}));
      if(!repairLayout.fits){console.error('Synthetic history layout diagnostics',repairLayout);console.error('Synthetic internal overflow',await page.locator('.history-repair-sheet').evaluate(e=>[...e.querySelectorAll('*')].filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>({tag:n.tagName,id:n.id,class:n.className,width:n.clientWidth,scrollWidth:n.scrollWidth,display:getComputedStyle(n).display,overflow:getComputedStyle(n).overflow,open:n.open}))));}
      check('history repair fits '+width+'px',repairLayout.fits);
      if(width===390)await page.screenshot({path:path.join(output,name+'-history-repair-390.png')});
    }
    await page.locator('#history-repair-confirm').check();await page.locator('#history-repair-apply').click();
    await page.waitForFunction(()=>document.querySelector('#history-repair-status')?.textContent.includes('confirmed corrections saved'));
    check('confirmed repairs preserve unknown requirement date, notes and original revision',await page.evaluate(()=>entries[0].opened==='2026-01-02'&&entries[0].reqMet===''&&entries[0].notes==='Original synthetic history'&&entries[0].historyRepairs.length===2&&Object.values(loadTermsArchive()).some(b=>b.versions.some(v=>v.opened===''))));
    await page.locator('.history-repair-cycle > summary').first().click();
    await page.locator('select[data-repair-field="8"]').selectOption('0');await page.locator('#history-repair-preview-button').click();
    await page.locator('#history-repair-confirm').check();
    await page.evaluate(()=>{entries[0].notes='A newer synthetic edit';localStorage.setItem('bt_e_v4',JSON.stringify(entries));});
    await page.locator('#history-repair-apply').click();
    await page.waitForFunction(()=>document.querySelector('#history-repair-status')?.textContent.includes('Records changed'));
    check('stale repair cannot overwrite newer account edit',await page.evaluate(()=>entries[0].notes==='A newer synthetic edit'&&!entries[0].feeScheduleRaw));
    await page.getByRole('button',{name:'Close history repair',exact:true}).click();
    await page.evaluate(()=>{entries=JSON.parse(window.__beforeHistoryRepair.entries);localStorage.setItem('bt_e_v4',window.__beforeHistoryRepair.entries);const raw=window.__beforeHistoryRepair.archive;if(raw===null)localStorage.removeItem('bt_tc_archive_v1');else localStorage.setItem('bt_tc_archive_v1',raw);delete window.__beforeHistoryRepair;R();});
    // v3.6.43: explicit result capture and exact-bank task research.
    await page.evaluate(()=>{
      entries=[{id:'E2E-TRUST',bank:'E2E Trust Bank',accountType:'business',opened:'2026-01-01',bonus:100,
        dataPoint:'At least 2 Enhanced Direct Deposits totaling $3,000',completeBonusText:'Receive qualifying direct deposits',checklist:[{text:'Qualifying direct deposit',done:false}],
        customTimers:[{id:'trust-dd',text:'Receive qualifying direct deposits',date:'2027-01-01',done:false}]}];
      tab='tracker';expanded=null;cfm=null;search='';BT360.setAudience('all');BT360.resetStage();saveUserDatapoints([]);sv(SK,entries);R();toggleCk('E2E-TRUST',0);
    });
    check('direct deposit completion prompts for an observed result',await page.getByRole('dialog',{name:'Deposit experience'}).isVisible()&&await page.evaluate(()=>dpEditor.evidenceStage==='requirement'));
    check('completion prompt does not invent an event date or trusted outcome',await page.evaluate(()=>dpEditor.method===''&&dpEditor.outcome===''&&dpEditor.eventDate===''&&dpEditor.depositAmount===''&&!dpEditor.confirmedByUser&&loadUserDatapoints().length===0));
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      check('experience review fits '+width+'px',await page.locator('.research-editor').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth));
    }
    check('optional experience fields start collapsed',await page.locator('.experience-optional').evaluate(e=>!e.open));
    check('confirmation checkbox is compact with a full touch label',await page.locator('.experience-confirm').evaluate(e=>e.getBoundingClientRect().height>=44&&e.querySelector('input').getBoundingClientRect().width<=24));
    await page.getByRole('button',{name:'Save experience',exact:true}).click();
    check('missing source shows inline error and leaves report unsaved',await page.locator('#dp-experience-error').isVisible()&&await page.evaluate(()=>loadUserDatapoints().length===0));
    await page.getByLabel('Where did the money come from?',{exact:true}).fill('Synthetic payroll');
    await page.getByLabel('Did the bank count it?',{exact:true}).selectOption('worked');
    await page.getByLabel('Result date',{exact:true}).fill(await page.evaluate(()=>td()));
    await page.getByLabel('I checked this result myself',{exact:true}).check();
    await page.screenshot({path:path.join(output,name+'-experience-confirmation.png')});
    await page.getByRole('button',{name:'Save experience',exact:true}).click();
    check('explicit experience retains cycle identity and attestation',await page.evaluate(()=>loadUserDatapoints().some(x=>x.entryId==='E2E-TRUST'&&x.accountType==='business'&&x.cycleOpened==='2026-01-01'&&x.confirmedByUser&&x.outcome==='worked')));
    await page.evaluate(()=>{expanded=null;search='';BT360.setAudience('all');BT360.resetStage();R();openTaskDatapoints('E2E-TRUST')});
    check('task research opens exact bank and account type',await page.evaluate(()=>tab==='tips'&&dpTaskBankKey===datapointBankKey(entries[0])));
    check('confirmed experience appears in task research',await page.locator('.bt366-dp-item').innerText().then(t=>t.includes('Synthetic payroll')&&t.includes('You confirmed')));
    await page.getByRole('button',{name:'All banks',exact:false}).click();
    check('all banks resets scoped research',await page.evaluate(()=>dpTaskBankKey===''));
    await page.evaluate(()=>{tab='tracker';expanded=null;openRcv('E2E-TRUST');rcvPrompt.date=td();R()});
    await page.locator('#rcv_dp').fill('Synthetic payroll');
    await page.locator('button[onclick="rcvSubmit()"]').click();
    if(await page.getByRole('button',{name:'Save Anyway',exact:true}).count())await page.getByRole('button',{name:'Save Anyway',exact:true}).click();
    await page.getByRole('button',{name:'Review experience',exact:true}).click();
    check('bonus confirmation offers a separate method review',await page.evaluate(()=>dpEditor.evidenceStage==='bonus'&&entries[0].bonusRecd===td()&&!dpEditor.confirmedByUser));
    const pointsBeforeSkip=await page.evaluate(()=>JSON.stringify(loadUserDatapoints()));
    await page.getByRole('button',{name:'Not now',exact:true}).click();
    check('skipping experience preserves payment and prior evidence',await page.evaluate(before=>!!entries[0].bonusRecd&&JSON.stringify(loadUserDatapoints())===before,pointsBeforeSkip));
    // Individual requirement clicks are user checklist confirmations, never lifecycle events.
    const individualRestore=await page.evaluate(source=>{
      const saved={entries:JSON.parse(JSON.stringify(entries)),storage:Object.fromEntries(Object.entries(localStorage))};
      Object.assign(source,{id:'E2E-INDIVIDUAL',bank:'Synthetic Requirement Bank',reqMet:'',bonusRecd:'',closed:'',checklist:[],history:[]});
      for(const [id,kind,amount,text] of [['opening-funds','new-money',25,'Deposit $25 at opening.'],['activity','balance-hold',10000,'For days 31-90 after opening your checking account, keep a combined average daily balance of $10,000.']]){
        source.tcSourceRaw+=' '+text;
        source.financialRules.requirements.push({id,accountId:'checking',kind,amount,text,evidence:{source:'promotion',quote:text}});
      }
      entries=[assignEntryIdForCreate(source)];sv(SK,entries);tab='tracker';expanded=entries[0].id;modal=null;cfm=null;dpEditor=null;search='';BT360.setAudience('all');BT360.resetStage();R();return saved;
    },require('./fixtures/financial-rules.cjs').fixture());
    const openingCheck=()=>page.getByRole('checkbox',{name:'Deposit $25',exact:true});
    check('three structured requirements have separate checkboxes',
      await page.locator('.bt3810-task [role="checkbox"]').count()===3);
    check('balance requirement uses the saved window without jargon',
      await page.locator('.bt3810-task').filter({has:page.getByRole('checkbox',{name:'Keep a $10,000 average balance',exact:true})}).innerText()
        .then(t=>t.includes('Days 31–90')&&!t.includes('daily-minimum rule')));
    await openingCheck().click();
    check('checking an individual step never auto-completes the offer',
      await page.evaluate(()=>{
        const e=entries[0];return e.checklist.length===1&&e.checklist[0].done&&!e.reqMet&&!e.bonusRecd&&!e.closed&&BT360.requirementRows(e).remaining===2;
      }));
    check('list and detail progress reflect the single saved checkbox',
      await page.evaluate(()=>{
        const e=entries[0],p=BT360.requirementProgress(e);
        return p.total===3&&p.done===1&&p.remaining===2&&BT360.compactRow(e).includes('1 of 3 steps')
          &&BT360.attentionCardProgress(e).includes('1 of 3 steps')&&BT360.requirementRows(e).remaining===2;
      }));
    check('one checked requirement does not create a duplicate task',
      await openingCheck().getAttribute('aria-checked')==='true'&&await page.locator('.bt3810-task').count()===3);
    await page.reload();await settleStartup();await page.evaluate(()=>{tab='tracker';expanded=entries[0].id;R()});
    check('saved checkbox survives a browser reload',await openingCheck().getAttribute('aria-checked')==='true');
    for(const width of [320,375,390,430,1280]){
      await page.setViewportSize({width,height:900});
      check('individual checkboxes remain 44px touch targets at '+width+'px',
        await page.locator('.bt3810-task').evaluateAll(rows=>rows.every(row=>{
          const control=row.querySelector('[role="checkbox"]'),rect=control?.getBoundingClientRect();
          return !!rect&&rect.width>=44&&rect.height>=44&&row.scrollWidth<=row.clientWidth+1;
        })));
    }
    await openingCheck().focus();await page.keyboard.press('Space');
    check('keyboard toggles the selected requirement without changing others',
      await openingCheck().getAttribute('aria-checked')==='false'
      &&await page.evaluate(()=>entries[0].checklist.length===1&&!entries[0].reqMet));
    const remainingChecks=page.locator('.bt3810-task [role="checkbox"]');
    for(let i=0;i<3;i++)await remainingChecks.nth(i).click();
    check('all checked tasks still require one explicit completion date',
      await page.evaluate(()=>BT360.requirementRows(entries[0]).remaining===0&&!entries[0].reqMet&&!entries[0].bonusRecd)
      &&await page.locator('.bt360-detail-footer .bt360-primary').innerText()==='Mark requirements done');
    check('portable backup retains exact linked checklist records',
      await page.evaluate(()=>JSON.stringify(buildPortableBackupPayload().entries[0].checklist)===JSON.stringify(entries[0].checklist)));
    await page.evaluate(saved=>{
      for(const key of Object.keys(localStorage))if(!Object.hasOwn(saved.storage,key))localStorage.removeItem(key);
      for(const [key,value] of Object.entries(saved.storage))localStorage.setItem(key,value);
      entries=saved.entries;expanded=null;tab='tracker';R();
    },individualRestore);
    await page.setViewportSize({width:390,height:844});
    // Beginner wording uses the same readiness projection for badges, counts and filters.
    await page.evaluate(()=>{
      window.__btSimpleDashboardRestore={entries,expanded,tab,suggestions:window.getAttentionSuggestions,next:window.btNextActionForEntry,stage:window.btLifecycleStageForEntry,stored:localStorage.getItem('bt_e_v4')};
      const common={accountType:'personal',bonus:250,opened:'2026-01-01',customTimers:[],checklist:[]};
      entries=[{...common,id:'SYN-SIMPLE-REVIEW',bank:'Synthetic Review Bank',reqMet:addD(td(),-20),bonusRecd:addD(td(),-10)},
        {...common,id:'SYN-SIMPLE-READY',bank:'Synthetic Ready Bank',reqMet:addD(td(),-20),bonusRecd:addD(td(),-10)},
        {...common,id:'SYN-SIMPLE-DEPOSIT',bank:'Synthetic Deposit Bank',reqDays:90,completeBonusText:'Receive $500 in qualifying direct deposits each month.',checklist:[{text:'Sign up',done:true},{text:'First deposit',done:true}]}];
      window.__btSimpleDashboardFacts=JSON.stringify(entries);
      window.btLifecycleStageForEntry=e=>({code:e.id==='SYN-SIMPLE-DEPOSIT'?'IN_PROGRESS':'READY_TO_CLOSE',label:'Saved stage'});
      window.btNextActionForEntry=e=>({kind:e.id==='SYN-SIMPLE-READY'?'close':'review'});
      window.getAttentionSuggestions=()=>entries.map(e=>({entryId:e.id,bank:e.bank,stageCode:e.id==='SYN-SIMPLE-DEPOSIT'?'IN_PROGRESS':'READY_TO_CLOSE',actionKind:e.id==='SYN-SIMPLE-READY'?'close':'review',task:{title:e.id==='SYN-SIMPLE-DEPOSIT'?'Receive $500 in monthly qualifying direct deposits':'Verify closure terms',activityKind:e.id==='SYN-SIMPLE-DEPOSIT'?'direct-deposit':undefined},dateContext:{date:addD(td(),-2),confirmed:true}}));
      expanded=null;tab='tracker';BT360.setAudience('all');BT360.resetStage();R();
    });
    const simpleReview=page.locator('[data-attention-id="SYN-SIMPLE-REVIEW"]');
    check('unresolved closing review never advertises Ready to close',await simpleReview.innerText().then(t=>t.includes('Check when you can close')&&t.includes('Bonus received')&&!t.includes('Ready to close')&&!t.includes('overdue')));
    check('supported readiness has matching action and badge',await page.locator('[data-attention-id="SYN-SIMPLE-READY"]').innerText().then(t=>t.includes('Close account when ready')&&t.includes('Ready to close')));
    check('deposit has plain action, specific deadline and honest progress',await page.locator('[data-attention-id="SYN-SIMPLE-DEPOSIT"]').innerText().then(t=>t.includes('Get $500 in qualifying direct deposits each month')&&t.includes('Deposit deadline:')&&t.includes('2 days overdue')&&t.includes('2 of 3 steps checked')&&!t.includes('Recorded so far')));
    await page.getByRole('button',{name:'1 Bonus received',exact:true}).click();
    check('bonus-received filter agrees with its projected count',await page.locator('.bt366-compact-account').count()===1&&await page.locator('.bt366-compact-account').innerText().then(t=>t.includes('Synthetic Review Bank')));
    await page.getByRole('button',{name:'1 Ready to close',exact:true}).click();
    check('ready-to-close filter contains only the supported account',await page.locator('.bt366-compact-account').count()===1&&await page.locator('.bt366-compact-account').innerText().then(t=>t.includes('Synthetic Ready Bank')&&t.includes('Ready to close')&&t.includes('Close account when ready')));
    await page.evaluate(()=>{BT360.resetStage();R()});
    for(const width of [320,375,390,430,1280]){
      await page.setViewportSize({width,height:900});
      check('plain dashboard remains readable at '+width+'px',await page.locator('[data-queue="needs"]').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth));
      check('compact Add keeps its label and touch target at '+width+'px',await page.locator('.bt362-add-fab').evaluate(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.width>=44&&r.width<=200&&e.textContent.includes('Add bonus')}));
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-queue="needs"]').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,name+'-simple-dashboard-390.png')});
    check('plain dashboard rendering and filtering never change recorded facts',await page.evaluate(()=>JSON.stringify(entries)===window.__btSimpleDashboardFacts&&localStorage.getItem('bt_e_v4')===window.__btSimpleDashboardRestore.stored));
    await page.evaluate(()=>{
      const old=window.__btSimpleDashboardRestore;entries=old.entries;expanded=old.expanded;tab=old.tab;
      window.getAttentionSuggestions=old.suggestions;window.btNextActionForEntry=old.next;window.btLifecycleStageForEntry=old.stage;
      delete window.__btSimpleDashboardRestore;delete window.__btSimpleDashboardFacts;R();
    });
    // Retired card records remain recoverable, but never mount a second tracker.
    const retiredCards=JSON.stringify({version:1,cards:[{current:{id:'retired-synthetic',name:'Retired plan',opened:'2026-01-01'},history:[]}]});
    const retirementBefore=await page.evaluate(()=>({cards:localStorage.getItem('bt_credit_cards_v1'),banks:localStorage.getItem('bt_e_v4')}));
    await page.evaluate(raw=>localStorage.setItem('bt_credit_cards_v1',raw),retiredCards);
    await page.reload();await settleStartup();
    check('bank tracker opens directly without the retired category',await page.locator('.tracker-overview').isVisible()&&await page.getByRole('button',{name:'Credit cards',exact:true}).count()===0&&await page.locator('.cc-switch,.cc-page').count()===0);
    check('retired card module is neither loaded nor requested',await page.evaluate(()=>typeof window.BTCards==='undefined'&&!performance.getEntriesByType('resource').some(x=>/credit-cards\.js/.test(x.name))));
    for(const width of [320,375,390,430,1280]){
      await page.setViewportSize({width,height:900});
      check('bank-only tracker fits '+width+'px',await page.locator('.tracker-overview').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth));
    }
    check('card retirement preserves exact bank and legacy card storage',await page.evaluate(({before,raw})=>localStorage.getItem('bt_e_v4')===before.banks&&localStorage.getItem('bt_credit_cards_v1')===raw,{before:retirementBefore,raw:retiredCards}));
    check('full backup retains retired card history byte for byte',await page.evaluate(raw=>getBackupStorageKeys().includes('bt_credit_cards_v1')&&JSON.stringify(buildStorageSnapshot()['bt_credit_cards_v1'])===raw,retiredCards));
    await page.evaluate(before=>{if(before.cards===null)localStorage.removeItem('bt_credit_cards_v1');else localStorage.setItem('bt_credit_cards_v1',before.cards);R()},retirementBefore);
    await page.setViewportSize({width:390,height:844});
    const termsReceipt=await page.evaluate(async()=>{await BTTermsHistory.sync();return {...window.__termsFixture};});
    check('manual backup keeps terms local without server uploads',termsReceipt.uploads===0&&termsReceipt.hashVerified===0);
    await page.evaluate(()=>BTBonusAuth.disconnect());
    check('AI sign-out removes remembered session',await page.evaluate(()=>!localStorage.getItem('bonus-ai-auth')&&!BTBonusAuth.connected()));
    check('retired backup, terms and hosting endpoints are never requested',await page.evaluate(()=>window.__retiredBackupRequests.length===0));
    check('no uncaught application errors',errors.length===0);
    await page.screenshot({path:path.join(output,name+'-verified.png')});
    await context.tracing.stop();
    await fs.writeFile(path.join(output,name+'-results.json'),JSON.stringify({ok:true,checks,errors,warnings},null,2));
    console.log(name+': '+checks.length+' browser checks passed');
  }catch(err){
    await fs.writeFile(path.join(output,name+'-results.json'),JSON.stringify({ok:false,checks,errors,warnings,failure:String(err)},null,2));
    await page.screenshot({path:path.join(output,name+'-failure.png')}).catch(()=>{});
    await context.tracing.stop({path:path.join(output,name+'-trace.zip')});
    throw err;
  }finally{serverUnavailable=false;feedInvalid=false;await browser.close()}
}
(async()=>{
  await fs.mkdir(output,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/';
  try{for(const [name,engine] of require('./browser-select.cjs')({chromium,webkit}))await exercise(name,engine,url)}
  finally{server.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
