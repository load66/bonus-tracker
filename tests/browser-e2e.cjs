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
    churnPeriodValue:12,churnPeriodUnit:'months',reqDays:90,requiredDaysText:'90 calendar days',
    dataPoint:'Employer DD',payoutTimingText:'Within 30 calendar days after requirements are met',
    closeRestrictionType:'payout-only',closeRuleText:'Keep the account open until the bonus posts.',
    earlyCloseFee:0,earlyTerminationFeeText:'No early closing fee.',
    notes:'Synthetic verification record only',customTimers:[],
    tcSourceRaw:'E2E Verification Bank checking promotional terms. This offer is for eligible new consumer checking customers. Not eligible if you received a checking bonus within the past 12 months. Complete qualifying deposit requirements within 90 calendar days after opening. Keep the account open until the bonus posts.',
    eligibilityRules:[{id:'bonus-12m',basis:'bonus-received',periodValue:12,periodUnit:'months',scope:'consumer-checking',evidenceText:'Not eligible if you received a checking bonus within the past 12 months.',evidenceSource:'official-promotion-terms'}]
  }};

async function exercise(name,engine,url){
  const browser=await engine.launch();
  const context=await browser.newContext({acceptDownloads:true,timezoneId:'America/Chicago',viewport:{width:1280,height:900}});
  await context.tracing.start({screenshots:true,snapshots:true});
  const page=await context.newPage(),errors=[],warnings=[],checks=[];
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
    await openAdvancedActions();
    await page.getByRole('button',{name:'Edit account Details, dates, bonus, rules',exact:true}).click();
  };
  const close=async()=>{
    const action=page.getByRole('button',{name:/^Mark account closed/});
    if(!await action.count())await page.evaluate(()=>{expanded=entries[0].id;tab='tracker';R()});
    if(await action.count())await action.click();
    else{await page.getByRole('button',{name:'More account actions'}).click();await page.getByRole('button',{name:/Record closure/}).click();}
    await page.locator('#cp_date').fill('2026-05-01');
    await page.locator('#cp_monthly_checked').selectOption('yes');
    await button('Next').click();await button('Next').click();await button('Review').click();
    check('closure review exposes cycle history completeness',await page.locator('.close-modal .archive-history-review').isVisible());
    check('closure review separates cloud verification from local save',(await page.locator('.close-modal').innerText()).includes('Cloud protection is confirmed separately'));
    for(const width of [320,390,430]){
      await page.setViewportSize({width,height:844});
      check('closure history review fits '+width+'px',await page.locator('.close-modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
      if(width===390)await page.screenshot({path:path.join(output,name+'-closure-history-review-390.png')});
    }
    await page.setViewportSize({width:390,height:844});
    await button('Save Closed').click();
    check('closure transaction preserves exact cycle and enrolled sources',await page.evaluate(()=>{
      const e=entries[0],saved=loadTermsArchive()[termsArchiveKey(e)].current;
      return saved.entryId===e.id&&['opened','closed','bonusRecd','reqMet','tcSourceRaw','feeScheduleRaw'].every(k=>String(saved[k]||'')===String(e[k]||''));
    }));
    check('closure success states cloud protection separately',await page.evaluate(()=>cfm.msg.includes('Cloud recovery:')));
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
    await page.locator('.bt362-add-fab').click();await button('Quick Add').click();
    check('Quick Add scrolls its real panel into view',await page.locator('#bt-quick-add-panel').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.top<innerHeight&&r.bottom>0}));
    await page.setViewportSize({width:390,height:844});
    check('Quick Add is a focused view without overlapping Add or dashboard summary',await page.locator('.bt362-add-fab,.tracker-overview,#tracker-search').count()===0);
    check('Quick Add has a visible touch-sized close button',await page.getByRole('button',{name:'Close Quick Add',exact:true}).evaluate(e=>e.getBoundingClientRect().height>=44));
    await page.screenshot({path:path.join(output,name+'-quick-add-390.png')});
    await page.getByRole('button',{name:'Close Quick Add',exact:true}).click();
    check('Quick Add close returns to dashboard',await page.locator('#bt-quick-add-panel').count()===0&&await page.locator('.bt362-add-fab').isVisible());
    await page.locator('.bt362-add-fab').click();await button('Review promo terms').click();
    check('Review promo terms scrolls its analyzer into view',await page.locator('#bt-promo-terms-panel').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.top<innerHeight&&r.bottom>0&&!!e.querySelector('#az_input')}));
    check('promo terms is a focused view without overlapping Add or account search',await page.locator('.bt362-add-fab,.tracker-overview,#tracker-search').count()===0);
    const termsDraft=require('./fixtures/financial-rules.cjs').fixture().tcSourceRaw;
    await page.locator('#az_input').fill(termsDraft);
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
    await page.evaluate(()=>{analyzerText='';analyzerResult=null;});
    check('cloud protection status is compact',await page.locator('#bt-cloud-open').evaluate(e=>{
      const box=e.getBoundingClientRect(),style=getComputedStyle(e);
      return box.height<=32&&style.maxWidth==='42%'&&style.backgroundColor==='rgba(0, 0, 0, 0)'&&!e.innerText.includes('Current data verified in the cloud');
    }));

    const beforeNotifications=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await button('Notifications').click();
    check('header bell opens read-only notification center',await page.getByRole('dialog',{name:'Notification center'}).isVisible()&&await page.getByText('No current tasks needing attention.').isVisible());
    await page.getByRole('button',{name:'Close notifications'}).click();
    check('notification center leaves records unchanged',await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,beforeNotifications));
    check('Tracker loads without redundant Action Center disclosure',await page.locator('.bt360-legacy-actions').count()===0);
    await page.waitForFunction(()=>window.__btFullRegressionReport&&!window.__btFullRegressionReport.pending&&window.__btFullRegressionReport.total===8);
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
    await page.locator('.bt362-add-fab').click();await button('Quick Add').click();
    check('Quick Add Citi identity uses locally stored bank logo',await page.getByRole('button',{name:'Citi $300',exact:true}).locator('img[src="./bank-logos/citi.svg"]').count()===1);
    await button('Citi $300').click();
    check('Quick Add exposes bank/account/bonus',await page.locator('input[oninput*="\'bank\'"]').isVisible()&&await page.locator('select[onchange*="\'accountType\'"]').isVisible()&&await page.locator('input[oninput*="\'bonus\'"]').isVisible());
    await button('4 Review').click();check('unverified template cannot be saved',await button('💾 Add account').isDisabled());await button('Cancel').click();
    await importEntry(payload);
    check('import stops before saving',await page.evaluate(()=>JSON.parse(localStorage.getItem('bt_e_v4')).length===0));
    await button('2 Requirements').click();
    check('deadline wording is visible',await page.locator('input[oninput*="\'requiredDaysText\'"]').inputValue()==='90 calendar days');
    await button('4 Review').click();await button('💾 Add account').click();
    await wait(()=>JSON.parse(localStorage.getItem('bt_e_v4')).length===1);
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
      check('rendered requirements and header share exact structured deadline',await page.locator('.bt360-detail-card').innerText().then(t=>t.includes('Requirements due Dec 11, 2026')&&t.includes('Direct deposits totaling $1,000 · due Dec 11, 2026')));
      await page.locator('[data-section="timers"] > summary').click();
      check('rendered timer uses the same requirement deadline',await page.locator('[data-source="saved-requirement"]').innerText().then(t=>t.includes('Dec 11, 2026')));
      await page.screenshot({path:path.join(output,name+'-shared-requirement-dates-390.png'),fullPage:true});
      check('shared deadline rendering preserves stored records',await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,saved.stored));
      await page.evaluate(previous=>{entries=previous.entries;expanded=previous.expanded;R();},saved);
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
      check('Waiting separates future payout and hold periods',await page.locator('[data-queue="waiting"] [data-attention-toggle]').count()===2);
      check('Opportunities is separate from required tasks',await page.locator('[data-queue="opportunities"] [data-attention-toggle]').count()===1);
      check('upcoming cooldown appears once in Eligible soon',await page.locator('[data-attention-id="SYN-QUEUE-SOON"]').count()===0&&await page.locator('.bt3719-soon').innerText().then(t=>t.includes('Synthetic Upcoming CU')));
      check('payout and hold dates use precise labels',await page.locator('[data-queue="waiting"]').innerText().then(t=>t.includes('Expected by')&&t.includes('Hold until')));
      for(const key of ['needs','waiting','opportunities']){
        await page.locator('[data-queue="'+key+'"] [data-attention-toggle]').first().click();
        check('selection works across '+key+' group',await page.locator('.is-selected').count()===1);
        for(const width of [320,375,390,430]){
          await page.setViewportSize({width,height:844});
          check(key+' queue fits '+width+'px',await page.locator('[data-queue="'+key+'"]').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth));
          check(key+' actions keep touch targets at '+width+'px',await page.locator('.is-selected .bt360-actions button').evaluateAll(rows=>rows.length===2&&rows.every(e=>e.getBoundingClientRect().height>=44)));
          await page.locator('.is-selected .bt360-actions').scrollIntoViewIfNeeded();
          check(key+' actions remain clear of the Add bar at '+width+'px',await page.locator('.is-selected .bt360-actions button').evaluateAll(rows=>rows.every(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===e||e.contains(hit)})));
        }
        await page.setViewportSize({width:390,height:844});
        await page.locator('[data-queue="'+key+'"]').scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output,name+'-queue-'+key+'-390.png')});
      }
      await page.locator('.is-selected').getByRole('button',{name:'View offers',exact:true}).click();
      check('opportunity routes to offers for that bank',await page.locator('#radar-search').inputValue()==='Synthetic Opportunity CU');
      check('dashboard grouping leaves stored account records unchanged',await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,saved.stored));
      await page.evaluate(old=>{btRadarSearch('');entries=old.entries;expanded=old.expanded;tab=old.tab;R();},saved);
    }
    const beforeDisclosure=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    check('Tracker no longer displays the legacy Action Center',await page.locator('.bt360-legacy-actions').count()===0);
    check('account directory is collapsed by default',await page.locator('.bt366-compact-row').count()===0);
    await page.locator('.bt3641-attention-toggle').first().click();
    check('selected task reveals its own actions',await page.locator('.bt3641-attention-item.is-selected .bt360-actions button:visible').count()===2);
    await openAccounts();
    check('Tracker shows compact account row, not old full card',await page.locator('.bt366-compact-row').count()===1&&await page.locator('.bt366-compact-row .card-mini-chip').count()===0);
    {await openAccounts();await page.locator('.bt366-compact-row').first().click();}
    await page.setViewportSize({width:390,height:844});
    check('detail has exactly one header and one five-step strip',
      await page.locator('.bt360-detail-header').count()===1&&await page.locator('.bt360-steps').count()===1&&await page.locator('.bt360-steps span').count()===5&&await page.locator('.bt360-detail-card .card-h').count()===0);
    check('legacy LIFECYCLE strip and CHECKLIST label removed',await page.locator('.bt360-detail-card .bt-life').count()===0&&await page.getByText('Checklist',{exact:true}).count()===0);
    check('stage in progress never suggests bonus received',
      await page.locator('.bt360-detail-footer .bt360-primary').innerText().then(t=>t==='Record deposit'||t==='Open next task'));
    check('Manage is absent; account controls open from header menu',
      await page.getByRole('button',{name:'Manage',exact:true}).count()===0&&await page.getByRole('button',{name:'More account actions'}).count()===1);
    check('fixed bar is outside scrolling card',await page.locator('.bt360-detail-footer').evaluate(e=>e.parentElement?.id==='app'&&!e.closest('.scroll')));

    // v3.6.13: Manage is a dark bottom sheet, with no sticky footer collision.
    const beforeManage=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await page.getByRole('button',{name:'More account actions'}).click();
    const manage=page.getByRole('dialog',{name:'Account actions'});
    check('Manage opens as an accessible dark sheet',await manage.isVisible()&&await manage.evaluate(e=>{
      const c=getComputedStyle(e);return c.backgroundColor==='rgb(18, 20, 28)'&&c.borderTopLeftRadius==='24px';
    }));
    check('sheet suppresses sticky detail actions completely',await page.locator('.bt360-detail-footer').count()===0);
    check('Manage shows human stage and never an internal code',
      await manage.locator('.bt-ba-stage').innerText().then(t=>!/^\s*[A-Z_ ]{4,}\s*$/.test(t)&&t.trim().length>2));
    check('Manage uses line SVG icons rather than emoji',
      await manage.locator('.bt-ba-list > .bt-ba-mini .ico').evaluateAll(nodes=>nodes.length>=3&&nodes.every(n=>!!n.querySelector('svg')&&!/[\u{1F300}-\u{1FAFF}]/u.test(n.textContent))));
    check('Manage action order and separate destructive group',
      await manage.evaluate(e=>{
        const names=[...e.querySelectorAll('.bt-ba-list>.bt-ba-mini b')].map(n=>n.textContent);
        return names.includes('Edit account')&&names.includes('Add task')&&names.includes('Add timer')
          &&names.includes('Activity')&&names.every(n=>!/^Ask AI$|^Confirm bonus received$/.test(n))
          &&e.querySelector('.bt-ba-delete .bt-ba-mini b')?.textContent==='Delete account';
      }));
    for(const width of [320,390,430]){
      await page.setViewportSize({width,height:844});
      const last=manage.locator('.bt-ba-delete .bt-ba-mini');
      await last.scrollIntoViewIfNeeded();
      check('Manage fits above nav and Delete is fully tappable at '+width+'px',
        await manage.evaluate(e=>{
          const b=e.getBoundingClientRect(),n=document.querySelector('.tabs').getBoundingClientRect(),
            d=e.querySelector('.bt-ba-delete .bt-ba-mini').getBoundingClientRect();
          return b.width<=innerWidth+1&&e.scrollWidth<=e.clientWidth+1&&b.bottom<=n.top+3
            &&d.top>=b.top-2&&d.bottom<=b.bottom+2&&d.height>=44;
        }));
      if(width===390)await page.screenshot({path:path.join(output,name+'-manage-sheet-390.png')});
    }
    await manage.locator('.bt-ba-delete .bt-ba-mini').click();
    check('Delete still uses existing confirmation and does not delete automatically',
      await page.locator('.cbox').isVisible()&&await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,beforeManage));
    await button('Cancel').click();
    check('Delete confirmation cancels without changing account data',await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,beforeManage));
    await page.getByRole('button',{name:'More account actions'}).click();
    await page.getByRole('button',{name:'Close account actions'}).click();
    check('closing Manage restores sticky footer and unchanged record',
      await page.locator('.bt360-detail-footer').isVisible()&&await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,beforeManage));
    await page.setViewportSize({width:390,height:844});

    // Synthetic Chase v3.6.11 reference — in memory only, never written to storage.
    await page.evaluate(()=>{
      const e=entries[0];
      window.__chaseViewBaseline=JSON.stringify(e);
      Object.assign(e,{
        id:'CHA-P-01',bank:'Chase Total Checking',bonus:300,opened:'2026-10-15',
        reqDays:90,requiredDaysText:'90 calendar days',
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
    check('Chase synthetic $10,000 DD progress is visible without checklist tasks',
      await page.locator('.bt3611-requirement').innerText().then(t=>t.includes('Direct deposits totaling $10,000 · due Jan 13, 2027')&&t.includes('$0 of $10,000 · 0 recorded')));
    check('structured requirement includes checkbox and zero-progress meter',
      await page.locator('.bt3611-requirement [role="checkbox"]').count()===1&&
      await page.locator('.bt3611-req-track[role="progressbar"]').getAttribute('aria-valuenow')==='0');
    check('account overview keeps secondary information collapsed',await page.locator('.bt3640-section').evaluateAll(nodes=>nodes.filter(n=>['fees','timers','terms','history','eligibility'].includes(n.dataset.section)).every(n=>!n.open)));
    check('account dates are compact and unknown dates remain unrecorded',await page.locator('.bt3640-dates').evaluate(e=>e.querySelectorAll('dl>div').length===4&&e.textContent.includes('Not recorded')));
    const overviewBefore=await page.evaluate(()=>JSON.stringify([localStorage.getItem('bt_e_v4'),localStorage.getItem('bt_tc_archive_v1')]));
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      check('compact account overview fits '+width+'px',await page.locator('.bt360-detail-card').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&e.querySelectorAll('.bt3640-dates dl>div').length===4));
      if(width===390){await page.evaluate(()=>document.querySelector('.scroll').scrollTop=0);await page.screenshot({path:path.join(output,name+'-account-overview-390.png')});}
    }
    check('account overview leaves saved records unchanged',await page.evaluate(before=>JSON.stringify([localStorage.getItem('bt_e_v4'),localStorage.getItem('bt_tc_archive_v1')])===before,overviewBefore));
    await page.setViewportSize({width:390,height:844});
    await page.locator('.bt3640-section[data-section="timers"] > summary').click();
    await page.locator('.bt3640-section[data-section="fees"] > summary').click();
    check('Chase timer row is one title line with compact countdown',
      await page.locator('.bt3611-timer-row').first().evaluate(e=>{
        const b=e.querySelector('.bt3611-timer-body b'),small=e.querySelector('small');
        const cs=getComputedStyle(b),line=parseFloat(cs.lineHeight)||15;
        return b.getBoundingClientRect().height<=line+2&&small.textContent.includes('Jan 13, 2027 · 90 days after opening')
          &&!e.innerText.includes('Start + Days:')&&!e.innerText.includes('Due Date:');
      }));
    check('waiver summary has a two-line clamp and original terms are expandable',
      await page.locator('.bt3613-waiver-clamp').evaluate(e=>{
        const css=getComputedStyle(e);return css.webkitLineClamp==='2'&&e.scrollHeight<=parseFloat(css.lineHeight)*2+2
      })&&await page.locator('.bt3611-full-terms').count()===1);
    await page.locator('.bt3611-full-terms > summary').click();
    check('expanded waiver displays the exact original saved terms',await page.locator('.bt3611-full-terms p').innerText().then(t=>t.includes('Original terms: fee waived with electronic deposits, daily balance or linked checking.')));
    await page.locator('.bt3611-full-terms > summary').click();
    check('early close fee is amber without inferred zero',await page.locator('.bt3613-fee-line').last().locator('.bt3611-amber').innerText()==='Not confirmed');
    check('only monthly fee and early close fee; no invented waiver confirmation',await page.locator('.bt3613-fee-line').allInnerTexts().then(rows=>rows.length===2&&rows[0].includes('Monthly fee')&&rows[1].includes('Early close fee')&&!rows.join(' ').includes('Waiver on track')&&!rows.join(' ').includes('Waiver confirmed')));
    check('each key date explains a specific uncertainty',await page.locator('.bt3613-date-row').evaluateAll(rows=>rows.length===2&&rows.every(x=>!x.textContent.trim().startsWith('Needs review'))));
    check('no developer vocabulary is visible in the rendered app',
      !/\b(?:null|structured rule|anchor|verified \$0|provenance)\b/i.test(await page.locator('#app').innerText()));
    await page.evaluate(()=>{
      document.querySelector('.scroll').scrollTop=0;
      document.querySelectorAll('.bt-toast, .bt-notice').forEach(el=>el.style.opacity='0');
    });
    await page.screenshot({path:path.join(output,name+'-chase-bonus-detail-in-progress-390.png')});
    await page.evaluate(()=>document.querySelector('.scroll').scrollTop=document.querySelector('.scroll').scrollHeight);
    await page.screenshot({path:path.join(output,name+'-chase-bonus-detail-in-progress-bottom-390.png')});
    await page.screenshot({path:path.join(output,name+'-financial-summary-key-dates-390.png')});
    await page.locator('.bt3640-section[data-section="eligibility"] > summary').click();
    await page.getByRole('button',{name:'Set rule'}).first().click();
    check('Set rule opens existing account rule editor',await page.locator('.modal').isVisible()
      &&(await page.locator('.modal').innerText()).includes('Fees & Close'));
    await button('Cancel').click();
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
    await edit();await button('3 Fees & Close').click();
    await page.getByPlaceholder('Personal notes; terms review does not overwrite them').fill('Keep <img src=x onerror=alert(1)> & "quotes"');
    await button('4 Review').click();await button('💾 Save changes').click();
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
    await page.getByRole('button',{name:'Record deposit'}).click();
    check('requirements dialog leaves unknown actual date blank',await page.locator('#req_date').inputValue()==='');
    await page.locator('#req_date').fill('2026-04-01');await button('Save').click();await button('OK').click();
    check('requirements and payout stay separate',(await record()).reqMet==='2026-04-01'&&!(await record()).bonusRecd);
    await page.getByRole('button',{name:/^Confirm received/}).click();await page.locator('#rcv_date').fill('2026-04-15');await button('Save').click();await button('Review experience').click();
    check('payment success offers optional evidence review without assuming a method result',await page.evaluate(()=>dpEditor.evidenceStage==='bonus'&&!dpEditor.confirmedByUser));
    await button('Skip for now').click();
    check('bonus receipt updates close readiness',await page.evaluate(()=>btLifecycleStageForEntry(entries[0]).code)==='READY_TO_CLOSE');
    await page.evaluate(()=>{entries[0].earlyCloseFee=null;R();});
    check('unverified fee blocks close readiness even after payout',await page.evaluate(()=>btLifecycleStageForEntry(entries[0]).code)==='BONUS_RECEIVED');
    check('summary does not promise closure from payout alone',await page.evaluate(()=>!renderBankProfileSummary(entries[0]).includes('close when ready')&&!lifecycleSteps(entries[0]).find(s=>s.key==='safe').done));
    await page.evaluate(()=>{entries[0].earlyCloseFee=0;entries[0].earlyTerminationFeeText='No early closing fee unless the account is restricted.';entries[0].feeScheduleRaw=entries[0].earlyTerminationFeeText;R();});
    check('conditional no-fee wording blocks readiness',await page.evaluate(()=>btEvaluateAccount(entries[0]).close.status!=='ready'));
    await page.evaluate(()=>{entries[0].earlyTerminationFeeText='No early closing fee.';entries[0].feeScheduleRaw='No early closing fee.';R();});
    check('restoring proven zero-fee evidence restores close readiness',await page.evaluate(()=>btLifecycleStageForEntry(entries[0]).code)==='READY_TO_CLOSE');
    check('ready-to-close highlights Close milestone',await page.locator('.bt360-steps span.current').innerText()==='Close');
    check('close-ready prioritizes checks when no checklist work remains',
      await page.locator('.bt360-detail-card .bt360-panel-title h3').first().innerText()==='Close checks'
      &&await page.locator('.bt3611-ready-extras').count()===0);
    await page.getByRole('button',{name:'More account actions'}).click();
    await page.locator('.bt-ba-mini').filter({hasText:'Activity'}).click();
    check('Activity opens from the header menu without a detail section',await page.getByRole('dialog',{name:'Activity'}).isVisible()
      &&await page.locator('.bt360-detail-card').getByText('Activity & Analysis',{exact:true}).count()===0);
    await page.getByRole('button',{name:'Close activity'}).click();
    check('missing phone offers bank-specific editor only when ready',await page.getByRole('button',{name:'Add bank phone number'}).isVisible());
    const sticky=await page.evaluate(()=>{
      const bar=document.querySelector('.bt360-detail-footer').getBoundingClientRect();
      const nav=document.querySelector('.tabs').getBoundingClientRect();
      return {ok:bar.bottom<=nav.top+2&&bar.top>=0,fixed:getComputedStyle(document.querySelector('.bt360-detail-footer')).position==='fixed'};
    });
    check('sticky detail bar stays above navigation',sticky.ok&&sticky.fixed);
    if(!await page.locator('.bt3640-section[data-section="terms"]').evaluate(e=>e.open))await page.locator('.bt3640-section[data-section="terms"] > summary').click();
    await page.locator('.bt360-source').scrollIntoViewIfNeeded();
    check('sticky footer never covers last detail content',await page.evaluate(()=>{
      const content=document.querySelector('.bt360-source').getBoundingClientRect(),footer=document.querySelector('.bt360-detail-footer').getBoundingClientRect();
      return content.bottom<=footer.top+2;
    }));
    await page.evaluate(()=>{
      document.querySelector('.scroll').scrollTop=0;
      document.querySelectorAll('.bt-toast, .bt-notice').forEach(el=>el.style.opacity='0');
    });
    await page.screenshot({path:path.join(output,name+'-bonus-detail-ready-mockup-390.png')});
    await page.locator('.bt360-source').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,name+'-bonus-detail-ready-mockup-bottom-390.png')});
    await page.screenshot({path:path.join(output,name+'-bonus-detail-ready-390.png')});
    await page.getByRole('button',{name:'Add bank phone number'}).click();
    check('phone editor carries bank name and account type',await page.locator('#ph_new_bank').inputValue()==='E2E Verification Bank'&&await page.locator('#ph_new_personal').isVisible());
    await page.getByRole('button',{name:'← Settings'}).click();

    await openAdvancedActions();await button('Add timer Set a reminder or deadline').click();
    await button('Start + Days').click();await page.locator('#tem_text').fill('E2E manual reminder');await page.locator('#tem_start').fill('2026-03-08');await page.locator('#tem_days').fill('1');await button('Add timer').click();
    check('timer uses calendar days across DST',(await record()).customTimers.some(t=>t.text==='E2E manual reminder'&&t.date==='2026-03-09'));
    await openAdvancedActions();await button('Add task Track a requirement').click();await page.getByPlaceholder('e.g. Make 1 debit card transaction').fill('E2E checklist task');await button('Save').click();
    await page.locator('.bt3611-ready-extras > summary').click();
    await page.getByRole('checkbox',{name:'E2E checklist task',exact:true}).click();
    check('checklist completion persists in redesigned Requirements',(await record()).checklist.some(x=>x.text==='E2E checklist task'&&x.done)&&await page.locator('.bt360-panel').filter({hasText:'Requirements'}).count()>0);
    check('checklist exposes accessible completion state',await page.getByRole('checkbox',{name:'E2E checklist task',exact:true}).getAttribute('aria-checked')==='true');
    check('ready saved-work disclosure stays expanded after checklist update',await page.locator('.bt3611-ready-extras').evaluate(e=>e.open));
    await page.evaluate(()=>{
      const e=entries[0];window.__layoutOriginal={checklist:e.checklist.map(x=>({...x})),customTimers:e.customTimers.map(x=>({...x})),monthlyFeeWaiverText:e.monthlyFeeWaiverText};
      e.checklist[0].text='Complete qualifying electronic deposits and retain the supporting confirmation for the full statement period';
      e.customTimers[0].text='Confirm the promotional deposit posted before the closing deadline';
      e.monthlyFeeWaiverText='The monthly fee is waived when qualifying electronic deposits reach the required amount in each statement period, or when the opening balance threshold is met each day, or when a qualifying linked relationship is maintained.';
      R();
    });
    if(!await page.locator('.bt3611-ready-extras').evaluate(e=>e.open)) await page.locator('.bt3611-ready-extras > summary').click();
    if(!await page.locator('.bt3640-section[data-section="timers"]').evaluate(e=>e.open))await page.locator('.bt3640-section[data-section="timers"] > summary').click();
    if(!await page.locator('.bt3640-section[data-section="fees"]').evaluate(e=>e.open))await page.locator('.bt3640-section[data-section="fees"] > summary').click();
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      const layout=await page.evaluate(()=>{
        const panel=document.querySelector('.bt360-detail-card'),task=panel?.querySelector('.bt360-check .bt366-row-edit'),timer=panel?.querySelector('.bt3611-timer-body'),fee=panel?.querySelector('.bt3613-fee-line');
        if(!panel||!task||!timer||!fee)return {ok:false,reason:'missing node',panel:!!panel,task:!!task,timer:!!timer,fee:!!fee};
        const owner=task.parentElement,check=owner.querySelector('[role="checkbox"]'),a=check.getBoundingClientRect(),b=task.getBoundingClientRect();
        const title=timer.querySelector('b'),titleH=title?.getBoundingClientRect().height||0,lh=parseFloat(getComputedStyle(title).lineHeight)||16;
        const metrics={taskWidth:task.clientWidth,timerWidth:timer.clientWidth,titleH,titleLineHeight:lh,checkRight:a.right,taskLeft:b.left,taskRight:b.right,ownerRight:owner.getBoundingClientRect().right,feeScroll:fee.scrollWidth,feeWidth:fee.clientWidth,panelScroll:panel.scrollWidth,panelWidth:panel.clientWidth,feeAlign:getComputedStyle(fee.querySelector('div')).textAlign};
        const gates={task:task.clientWidth>=120,timer:timer.clientWidth>=120,title:titleH<=lh+2,checkbox:a.right<=b.left+1,taskBounds:b.right<=owner.getBoundingClientRect().right+1,feeOverflow:fee.scrollWidth<=fee.clientWidth+1,panelOverflow:panel.scrollWidth<=panel.clientWidth+1,feeAlign:metrics.feeAlign==='right'};
        return {ok:Object.values(gates).every(Boolean),gates,metrics};
      });
      if(!layout.ok)console.error('320-430px layout diagnostics:',width,JSON.stringify(layout));
      check('detail task, timer and waiver remain readable at '+width+'px',layout.ok);
    }
    await page.evaluate(()=>{const e=entries[0],v=window.__layoutOriginal;e.checklist=v.checklist;e.customTimers=v.customTimers;e.monthlyFeeWaiverText=v.monthlyFeeWaiverText;delete window.__layoutOriginal;R()});
    await button('Tax').click();
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
      await page.getByRole('button',{name:'Move to iCloud Drive'}).click();
      const wizard=page.getByRole('dialog',{name:'Backup with iCloud Drive'});
      check('iCloud wizard is visible immediately at '+width+'px',await wizard.isVisible()&&await page.getByRole('dialog',{name:'Settings'}).count()===0);
      check('iCloud wizard buttons are not obscured at '+width+'px',await wizard.locator('#icloud-save').evaluate(el=>{
        const r=el.getBoundingClientRect();
        const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
        return !!hit&&(el===hit||el.contains(hit))&&r.height>30;
      }));
      check('iCloud wizard has a visible Close button',await wizard.getByRole('button',{name:'Close iCloud backup'}).isVisible());
      if(width===375){
        // The confirmation must appear ABOVE the iCloud wizard on Safari.
        await page.evaluate(()=>localStorage.removeItem('bt_icloud_file_verified_v1'));
        await wizard.locator('#icloud-switch').click();
        check('iCloud switch explains missing verified backup beside button',await wizard.locator('#icloud-switch-feedback').isVisible()
          &&(await wizard.locator('#icloud-switch-feedback').innerText()).includes('First export and verify')
          &&await page.evaluate(()=>localStorage.getItem('bt_backup_mode_v1')!=='icloud'));
        await page.evaluate(()=>{
          const full=buildPortableBackupPayload(),receipt=BTICloudBackup.verifyPayload(full);
          localStorage.setItem('bt_icloud_file_verified_v1',JSON.stringify(receipt));
        });
        await wizard.locator('#icloud-switch').click();
        const confirmation=page.getByRole('dialog',{name:'Use iCloud Drive files'});
        check('iCloud switch confirmation opens above wizard',await confirmation.isVisible()&&await confirmation.getByRole('button',{name:'Switch to iCloud'}).evaluate(el=>{
          const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
          return !!hit&&(hit===el||el.contains(hit))&&r.height>30;
        }));
        await confirmation.getByRole('button',{name:'Cancel'}).click();
        check('iCloud cancel shows feedback and preserves cloud protection',await wizard.locator('#icloud-switch-feedback').isVisible()
          &&(await wizard.locator('#icloud-switch-feedback').innerText()).includes('Switch cancelled')
          &&await page.evaluate(()=>localStorage.getItem('bt_backup_mode_v1')!=='icloud'));
        await page.evaluate(()=>localStorage.removeItem('bt_icloud_file_verified_v1'));
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
    check('stage action mapping never confirms payout during In progress',
      mappedActions.IN_PROGRESS==='Open next task'&&mappedActions.ACTION_NEEDED==='Open next task'
      &&mappedActions.REQUIREMENTS_MET==='Confirm received'&&mappedActions.AWAITING_BONUS==='Confirm received'
      &&mappedActions.HOLD_OPEN==='View hold'&&mappedActions.BONUS_RECEIVED==='View hold'
      &&mappedActions.READY_TO_CLOSE==='Mark account closed');
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
    check('Lafayette has one new detail header and one progress strip',
      await page.locator('.bt360-detail-header').count()===1&&await page.locator('.bt360-steps').count()===1&&await page.locator('.bt360-steps span').count()===5);
    check('Lafayette with 1 of 2 tasks opens next task instead of confirming payout',
      await page.locator('.bt360-detail-footer .bt360-primary').innerText()==='Open next task');
    await page.screenshot({path:path.join(output,name+'-v366-lafayette-detail-390.png')});
    await page.getByRole('button',{name:'Back to accounts'}).click();
    const legacyDates=await page.evaluate(()=>{
      return entries.filter(e=>e.id.startsWith('e2e-legacy-')).map(e=>({bank:e.bank,tracker:window.churnReadyDate?.(e),archive:BT360.eligibleInfo(e)?.eligible,label:BT360.eligibleInfo(e)?.label}));
    });
    check('Archive and Tracker reuse identical supported legacy dates',
      legacyDates.every(x=>x.tracker&&x.tracker===x.archive&&x.label.includes('not verified'))
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
    check('offers group by verified tracker review status without assuming personal eligibility',await page.locator('.radar-group-heading').count()>0&&(await page.getByText('About sources',{exact:true}).count())===1);
    check('bank feed renders escaped discovery title and permits only bundled bank logos',
      (await page.locator('.radar-card img').evaluateAll(images=>images.every(img=>/^\.\/bank-logos\/[a-z0-9-]+\.svg$/.test(img.getAttribute('src')||''))))
      &&(await page.locator('.radar-card').filter({hasText:'Synthetic Checking'}).innerText()).includes('<img'));
    check('bank feed warns when source check is stale',await page.locator('.bt362-offer-stale').isVisible());
    await page.locator('.bt362-about-sources summary').click();
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
    check('tracker churn match ranks above discovery posts',(await page.locator('.radar-card').first().innerText()).includes('U.S. Bank'));
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
    // Use the named account-menu action: the footer can switch from Ask AI to Keep open
    // as the lifecycle reconciles, so positional button clicks could navigate back.
    await page.getByRole('button',{name:'More account actions'}).click();
    await page.locator('.bt-ba-more > summary').click();
    const menuAskAI=page.locator('.bt-ba-more-body .bt-ba-mini').filter({hasText:'Ask AI'});
    if(await menuAskAI.count())await menuAskAI.click();
    else{
      // When the canonical close decision is not ready, Ask AI belongs in
      // the sticky footer instead of being duplicated inside More.
      await page.getByRole('button',{name:'Close account actions'}).click();
      await page.locator('.bt360-detail-footer').getByRole('button',{name:'Ask AI',exact:true}).click();
    }
    await page.locator('.bonus-ai-heading').waitFor({state:'visible'});
    check('Tracker AI opens for one selected bank',(await page.locator('.bonus-ai-heading').innerText()).includes('E2E Verification Bank')&&await page.evaluate(()=>window.__bonusAITest.calls.length===0));
    check('local answers need no login',await page.locator('#bonus-ai-login').isHidden());
    for(const label of ['Monthly fee','Fee waivers','Direct deposit','Early-close fee','Companion account','Repeat eligibility']){await button(label).click();check('prefill: '+label,(await page.locator('#bonus-ai-question').inputValue()).length>20);}
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
    // Test cloud recovery in two independent browser profiles; no production records are contacted.
    await page.evaluate(()=>{
      window.__cloudFixture={objects:{},calls:[],failure:false};
      const prior=window.fetch;
      window.fetch=async(input,options={})=>{
        const url=String(input);
        if(!url.startsWith('https://api-production-00f74.up.railway.app/api/bonus-tracker/backups'))return prior(input,options);
        const db=window.__cloudFixture;db.calls.push({url,method:options.method||'GET',authorization:options.headers.Authorization});
        if(db.failure)return new Response(JSON.stringify({detail:'Synthetic cloud outage'}),{status:503,headers:{'Content-Type':'application/json'}});
        if(url.endsWith('/health'))return new Response(JSON.stringify({readWriteVerified:true}),{headers:{'Content-Type':'application/json'}});
        if(options.method==='POST'){
          if(db.holdNext){db.holdNext=false;await new Promise(resolve=>{db.releaseUpload=resolve;});}
          const packet=JSON.parse(options.body),count=JSON.parse(JSON.parse(packet.snapshot).storageSnapshot.bt_e_v4).length;
          const backup={id:packet.id,createdAt:new Date().toISOString(),sha256:packet.sha256,entryCount:count,bytes:packet.snapshot.length,reason:packet.reason,verified:true};
          db.objects[packet.id]={backup,snapshot:packet.snapshot};return new Response(JSON.stringify(backup),{headers:{'Content-Type':'application/json'}});
        }
        const ident=url.split('/').pop();
        const body=db.objects[ident]||{backups:Object.values(db.objects).map(x=>x.backup),total:Object.keys(db.objects).length,nextOffset:null};
        return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
      };
    });
    await page.locator('#bt-cloud-open').click();
    check('automatic backup switch begins off',!(await page.locator('#cloud-auto-toggle').isChecked()));
    await page.locator('#cloud-enable-ack').check();await button('Enable automatic backup').click();
    check('enabling requires explicit confirmation',await page.locator('#bt_confirm_overlay').isVisible()&&!(await page.locator('#cloud-auto-toggle').isChecked()));
    await page.locator('#bt_confirm_overlay').getByRole('button',{name:'Enable and verify',exact:true}).click();
    await page.getByText('Preview recovery',{exact:true}).waitFor();
    check('enabled switch reflects verified protection',await page.locator('#cloud-auto-toggle').isChecked()&&await page.locator('#cloud-protection').getAttribute('data-state')==='protected');
    check('legacy export reminder is removed',await page.locator('.bk-remind').count()===0);
    await page.locator('#cloud-auto-toggle').click();await page.locator('#bt_confirm_overlay').getByRole('button',{name:'Cancel',exact:true}).click();
    check('canceling disable keeps automatic backup on',await page.locator('#cloud-auto-toggle').isChecked());
    check('cloud upload is readback-verified and authenticated',await page.evaluate(()=>JSON.parse(localStorage.getItem('bt_cloud_recovery_v1')).lastHash?.length===64&&window.__cloudFixture.calls.every(c=>c.authorization?.startsWith('Bearer '))));
    await page.evaluate(()=>{window.__cloudFixture.holdNext=true;const changed=JSON.parse(localStorage.getItem('bt_e_v4'));changed[0].notes+=' Synthetic pending-change verification';entries=changed;localStorage.setItem('bt_e_v4',JSON.stringify(changed));btCloudBackupChanged();R();});
    await page.waitForFunction(()=>typeof window.__cloudFixture.releaseUpload==='function');
    check('pending upload never shows current-data protection',await page.locator('#cloud-protection').getAttribute('data-state')==='warning'&&await page.locator('#cloud-auto-toggle').isChecked());
    await page.evaluate(()=>{window.__cloudFixture.releaseUpload();delete window.__cloudFixture.releaseUpload;});
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('bt_cloud_recovery_v1')).pending===false&&document.querySelector('#cloud-protection')?.dataset.state==='protected');
    await page.getByText('Backup verified',{exact:true}).first().waitFor();
    const noticeStamp=await page.evaluate(()=>JSON.parse(localStorage.getItem('bt_cloud_recovery_v1')).lastSuccessNoticeAt);
    await page.evaluate(()=>document.getElementById('bt_notice_host')?.replaceChildren());
    await page.evaluate(()=>BTCloudBackup.upload('manual'));
    check('verified backup notice has a persistent 30-minute cooldown',await page.getByText('Backup verified',{exact:true}).count()===0&&await page.evaluate(()=>JSON.parse(localStorage.getItem('bt_cloud_recovery_v1')).lastSuccessNoticeAt)===noticeStamp);
    check('cooldown still verifies current records',await page.locator('#cloud-protection').getAttribute('data-state')==='protected');
    check('saved changes upload while recovery settings are open',await page.evaluate(()=>Object.values(window.__cloudFixture.objects).some(x=>x.backup.reason==='automatic'&&x.snapshot.includes('Synthetic pending-change verification'))));
    await page.evaluate(raw=>{entries=JSON.parse(raw);localStorage.setItem('bt_e_v4',raw);btCloudBackupChanged();R();},storedBeforeRadar);
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('bt_cloud_recovery_v1')).pending===false&&document.querySelector('#cloud-protection')?.dataset.state==='protected');
    check('history evidence lookup verifies backups without writing financial records',await page.evaluate(async()=>{
      const before=[localStorage.getItem('bt_e_v4'),localStorage.getItem('bt_tc_archive_v1')];
      const result=await BTCloudBackup.historySources();return result.copies.length>0&&result.copies.length<=4&&result.failures.length===0&&JSON.stringify(before)===JSON.stringify([localStorage.getItem('bt_e_v4'),localStorage.getItem('bt_tc_archive_v1')]);
    }));
    const cloudRecords=await page.evaluate(()=>window.__cloudFixture.objects);
    await button('Close').click();
    const newPhoneContext=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Chicago'});
    const newPhone=await newPhoneContext.newPage();
    await newPhone.goto(url);await newPhone.waitForFunction(()=>navigator.serviceWorker.controller&&window.__btFullRegressionReport?.total===8&&!window.__btFullRegressionReport.pending);
    const installRecoveryFixture=objects=>{
      localStorage.setItem('bonus-ai-auth',JSON.stringify({access_token:'synthetic-owner-token',refresh_token:'synthetic-refresh',expires_at:Date.now()/1000+3600}));
      const prior=window.fetch;
      window.fetch=async(input,options={})=>{
        const url=String(input);if(!url.startsWith('https://api-production-00f74.up.railway.app/api/bonus-tracker/backups'))return prior(input,options);
        if(options.method==='POST'){const p=JSON.parse(options.body),count=JSON.parse(JSON.parse(p.snapshot).storageSnapshot.bt_e_v4).length;const backup={id:p.id,createdAt:new Date().toISOString(),sha256:p.sha256,entryCount:count,bytes:p.snapshot.length,reason:p.reason,verified:true};objects[p.id]={backup,snapshot:p.snapshot};return new Response(JSON.stringify(backup),{headers:{'Content-Type':'application/json'}});}
        const ident=url.split('/').pop();const body=objects[ident]||{backups:Object.values(objects).map(x=>x.backup),total:Object.keys(objects).length,nextOffset:null};
        return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
      };
    };
    // A service-worker controllerchange may reload a newly opened phone between
    // the readiness check and evaluate(). Install the fixture for every document,
    // then initialize the current one; never waive any recovery assertions.
    await newPhone.addInitScript(installRecoveryFixture,cloudRecords);
    try{await newPhone.evaluate(installRecoveryFixture,cloudRecords);}
    catch(e){
      if(!/Execution context was destroyed/.test(String(e)))throw e;
      await newPhone.waitForFunction(()=>navigator.serviceWorker.controller&&window.__btFullRegressionReport?.total===8&&!window.__btFullRegressionReport.pending);
    }
    check('new phone begins without account records',await newPhone.evaluate(()=>entries.length===0));
    await newPhone.locator('#bt-cloud-open').click();try{await newPhone.getByRole('button',{name:'Preview recovery',exact:true}).first().click();}catch(e){console.error(name+' catalog diagnostics:',await newPhone.evaluate(()=>({status:document.querySelector('#cloud-status')?.textContent,connected:BTBonusAuth.connected(),version:BT_APP_VERSION,body:document.querySelector('.cloud-modal')?.innerText})));throw e;}
    await newPhone.getByRole('button',{name:'Restore this version',exact:true}).waitFor();
    check('recovery preview fits a new-phone viewport',await newPhone.locator('.cloud-modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&e.getBoundingClientRect().width<=innerWidth));
    await newPhone.screenshot({path:path.join(output,name+'-cloud-recovery-preview.png')});
    await newPhone.getByRole('button',{name:'Restore this version',exact:true}).click();
    await newPhone.locator('#bt_confirm_overlay').getByRole('button',{name:'Restore',exact:true}).click();
    try{await newPhone.getByText('Recovery complete. Your restored records were verified.',{exact:true}).waitFor();}catch(e){console.error('Recovery diagnostics:',await newPhone.evaluate(()=>({status:document.querySelector('#cloud-status')?.textContent,accounts:entries.length,storage:getBackupStorageKeys().map(k=>[k,localStorage.getItem(k)?.length])})));throw e;}
    check('new-phone recovery preserves exact stored tracker data',await newPhone.evaluate(()=>localStorage.getItem('bt_e_v4'))===storedBeforeRadar);
    check('new-phone recovery retains its own login',await newPhone.evaluate(()=>BTBonusAuth.connected()));
    await newPhoneContext.close();
    await page.evaluate(()=>{document.getElementById('bt_notice_host')?.replaceChildren();window.__cloudFixture.failure=true;});
    await page.locator('#bt-cloud-open').click();await button('Back up now').click();
    await page.locator('#cloud-status').getByText('Synthetic cloud outage',{exact:true}).waitFor();
    check('failed upload never shows a success popup',await page.getByText('Backup verified',{exact:true}).count()===0);
    check('cloud outage never shows protected status',await page.locator('#cloud-protection').getAttribute('data-state')==='danger'&&await page.locator('#cloud-auto-toggle').isChecked());
    check('cloud outage leaves original records untouched',await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===storedBeforeRadar);
    await button('Close').click();
    await page.evaluate(()=>{localStorage.removeItem('bt_cloud_recovery_v1');delete window.__cloudFixture;});
    // Restore native fetch before verifying real service-worker offline navigation.
    await page.evaluate(()=>{window.fetch=window.__bonusAITest.nativeFetch;delete window.__bonusAITest;});

    // Reopen detail and prove the compact/expanded views remain stable across years.
    {await openAccounts();await page.locator('.bt366-compact-row').first().click();}
    check('detail contains one lifecycle strip after reload',await page.locator('.bt360-steps').count()===1);
    await page.locator('#bt362-year').selectOption('2025');
    await page.locator('#bt362-year').selectOption('2026');
    check('year navigation preserves focused detail',await page.locator('.bt360-detail-header').count()===1&&await page.locator('.bt360-steps').count()===1);
    // The focused detail intentionally hides the Tracker list search; navigate back first.
    await page.getByRole('button',{name:'Back to accounts'}).click();
    await page.getByPlaceholder('Search accounts...').pressSequentially('E2E');
    check('tracker search keeps cursor through consecutive keystrokes',await page.getByPlaceholder('Search accounts...').inputValue()==='E2E'&&await page.evaluate(()=>document.activeElement.id==='tracker-search'));
    await page.getByPlaceholder('Search accounts...').fill('');
    await button('Datapoints').click();
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
    await page.locator('.research-editor-body select').nth(1).selectOption('worked');
    await page.locator('.research-editor-body textarea').fill('Synthetic report for browser verification');
    await page.locator('.research-editor-body input[type=date]').first().fill('2026-09-30');
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
          if(!await page.locator('.bt3641-attention-item.is-selected').count())await page.locator('.bt3641-attention-toggle').first().click();
          check('action tile buttons retain mobile touch area at '+width+'px',await page.locator('.bt360-featured .bt360-actions button').evaluateAll(rows=>rows.length>0&&rows.every(e=>e.getBoundingClientRect().height>=44)));
          check('compact tiles fit at '+width+'px',await page.locator('.bt360-featured').evaluateAll(rows=>rows.every(e=>e.scrollWidth<=e.clientWidth+1)));
        }
      }
    }
    check('mobile tab targets are at least 44px tall',await page.locator('.tabs .tb').evaluateAll(rows=>rows.every(e=>e.getBoundingClientRect().height>=44)));
    await button('Tracker').click();
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
    await button('Cancel').click();
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
    check('a task row and an awaiting payout row stay distinct',await page.locator('.bt366-compact-row').allInnerTexts().then(t=>t.some(x=>x.includes('Establish $500+'))&&t.some(x=>x.includes('E2E Citi'))));
    const taskStorage=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await button('Hide accounts').click();
    check('duplicate directory collapses on request',await page.locator('.bt366-compact-row').count()===0);
    const headers=page.locator('[data-attention-toggle]');
    const attentionOrder=await headers.evaluateAll(rows=>rows.map(e=>e.dataset.attentionToggle));
    check('each bank has a selectable attention card',attentionOrder.length===2);
    if(await page.locator('[data-attention-toggle][aria-expanded="true"]').count())await page.locator('[data-attention-toggle][aria-expanded="true"]').click();
    await headers.nth(0).click();
    check('first bank selection reveals two actions',await page.locator('.is-selected .bt360-actions button:visible').count()===2);
    await headers.nth(1).click();
    check('second bank replaces first selection',await headers.nth(0).getAttribute('aria-expanded')==='false'&&await headers.nth(1).getAttribute('aria-expanded')==='true'&&await page.locator('.is-selected').count()===1);
    check('selection preserves priority order',JSON.stringify(await headers.evaluateAll(rows=>rows.map(e=>e.dataset.attentionToggle)))===JSON.stringify(attentionOrder));
    const selectedId=attentionOrder[1];
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      check('selected second bank fits '+width+'px',await page.locator('.is-selected').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth));
      check('selected bank actions retain touch targets at '+width+'px',await page.locator('.is-selected .bt360-actions button').evaluateAll(rows=>rows.length===2&&rows.every(e=>e.getBoundingClientRect().height>=44)));
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,name+'-selected-bank.png')});
    await page.locator('.is-selected').getByRole('button',{name:'Details',exact:true}).click();
    check('second bank Details opens that exact record',await page.evaluate(id=>expanded===id,selectedId));
    await page.evaluate(()=>{expanded=null;R()});
    await page.locator('.is-selected .bt360-actions .bt360-primary').click();
    check('second bank primary task action routes to its own account',await page.evaluate(id=>expanded===id,selectedId));
    await page.evaluate(()=>{expanded=null;R()});
    await page.locator('[data-attention-toggle][aria-expanded="true"]').click();
    check('selected card can collapse',await page.locator('.is-selected').count()===0);
    const searchShortcut=page.locator('.bt3642-search-launcher');
    check('compact search shortcut shows account count',await searchShortcut.innerText().then(t=>t.includes('Search 2 accounts')));
    await searchShortcut.click();
    await wait(()=>document.activeElement?.id==='tracker-search');
    await page.locator('#tracker-search').fill('E2E Citi');
    check('direct search finds the exact account and retains focus',await page.locator('.bt366-compact-row').count()===1&&await page.locator('.bt366-compact-row').innerText().then(t=>t.includes('E2E Citi'))&&await page.locator('#tracker-search').evaluate(e=>document.activeElement===e));
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
    await button('Cancel').click();
    // Quick Add belongs to the Tracker list, not the focused account detail.
    await page.getByRole('button',{name:'Back to accounts'}).click();
    const fileSource=require('./fixtures/financial-rules.cjs').reviewFixture();
    await importEntry({kind:'BonusTrackerEntry',schemaVersion:3,verification:{promoSourceUrl:fileSource.promoSourceUrl,feeScheduleSourceUrl:fileSource.feeScheduleSourceUrl,termsVerifiedAt:fileSource.termsVerifiedAt},entry:fileSource});
    check('actual v3 file chooser reaches review after confirmation',await page.getByRole('heading',{name:'Add account',exact:true}).isVisible());
    check('actual v3 file review retains exact rules',await page.evaluate(()=>modal.financialRules.version===2&&modal.financialRules.closure.earlyCloseFee===null&&modal.closeRestrictionType==='manual-review'));
    await button('Cancel').click();
    await page.evaluate(()=>{
      window.__replacementSavedEntries=JSON.parse(JSON.stringify(entries));window.__replacementSavedStorage=localStorage.getItem('bt_e_v4');
      entries=[{id:'CHA-P-01',bank:'Chase',accountType:'personal',opened:'2023-01-01',closed:'2025-01-01',bonusRecd:'2023-03-01',bonus:100,churn:'1',churnable:true,notes:'Old personal history',customTimers:[],checklist:[],history:[]},{id:'CHA-B-01',bank:'Chase Biz',accountType:'business',opened:'2023-01-01',closed:'2025-01-01',bonusRecd:'2023-03-01',bonus:500,churn:'1',churnable:true,notes:'Business unchanged',customTimers:[],checklist:[],history:[]},{id:'CIT-P-01',bank:'Citi',accountType:'personal',opened:'2023-01-01',closed:'2025-01-01',bonus:50,churn:'1',churnable:true,notes:'Other unchanged',customTimers:[],checklist:[],history:[]}];sv(SK,entries);R();
      window.__replacementBefore=localStorage.getItem('bt_e_v4');window.__replacementBusiness=JSON.stringify(entries.find(e=>e.id==='CHA-B-01'));window.__replacementOther=JSON.stringify(entries.find(e=>e.id==='CIT-P-01'));
    });
    const chaseSource=require('./fixtures/financial-rules.cjs').reviewFixture();chaseSource.bank='Chase';
    await importEntry({kind:'BonusTrackerEntry',schemaVersion:3,verification:{promoSourceUrl:chaseSource.promoSourceUrl,feeScheduleSourceUrl:chaseSource.feeScheduleSourceUrl,termsVerifiedAt:chaseSource.termsVerifiedAt},entry:chaseSource});
    check('Chase file review does not replace saved records',await page.evaluate(()=>localStorage.getItem('bt_e_v4')===window.__replacementBefore));
    await button('4 Review').click();await button('💾 Add account').click();
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

    // Synthetic-only owner usage response: assert the live Settings visual at
    // 320/375/390/430 and desktop without contacting Railway or R2.
    const bankingBeforeHosting=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    const syntheticUsage={month:'2026-10',checkedAt:'2026-10-17T19:10:00Z',railway:{
      status:'ok',verifiedAt:'2026-10-17T19:10:00Z',basis:'Railway resource-minutes before credit',costSoFar:2.31,projectedMonthEnd:4.50,
      services:[{name:'api',costSoFar:1.25,avgMemoryGb:0.235},{name:'leaps-alpaca-live',costSoFar:1.06,avgMemoryGb:0.318}]
    },r2:{status:'ok',usedBytes:240000000,freeBytes:10000000000}};
    // Stub fetch inside the page because a controlling service worker may bypass
    // Playwright routing under a controlling service worker. No real provider request is sent.
    await page.evaluate(fixture=>{
      window.__hostingPreviousFetch=window.fetch;
      window.__hostingUsageFixture=fixture;
      window.fetch=async (input,options)=>String(typeof input==='string'?input:input.url).split('?')[0].endsWith('/api/bonus-tracker/usage')
        ?new Response(JSON.stringify(window.__hostingUsageFixture),{status:200,headers:{'Content-Type':'application/json'}})
        :window.__hostingPreviousFetch(input,options);
    },syntheticUsage);
    await button('Settings').click();
    check('header ellipsis opens actual Settings',await page.getByRole('dialog',{name:'Settings'}).isVisible());
    await page.evaluate(async()=>BT360.refreshUsage(true));
    await page.getByText('Near limit',{exact:true}).waitFor();
    check('hosting usage card uses mocked nonzero Railway estimate',(await page.locator('.bt360-sheet').innerText()).includes('HOSTING & USAGE')&&
      (await page.locator('.bt360-sheet').innerText()).includes('leaps-alpaca-live'));
    check('verified amount includes observed time and excludes billing credits',await page.locator('.bt360-sheet').innerText().then(t=>t.includes('Verified $2.31')&&t.includes('Verified from Railway')&&t.includes('before plan credit and base fee')));
    const partialUsage={...syntheticUsage,railway:{status:'partial',verifiedAt:syntheticUsage.railway.verifiedAt,basis:syntheticUsage.railway.basis,
      costSoFar:null,knownCostSubtotal:1.25,projectedMonthEnd:4.50,services:[
        {name:'api',costSoFar:1.25,avgMemoryGb:0.235},
        {name:'leaps-alpaca-live',costSoFar:null,avgMemoryGb:null}],
      missing:[{service:'leaps-alpaca-live',metric:'NETWORK_TX_GB',kind:'usage'}]}};
    await page.evaluate(x=>{window.__hostingUsageFixture=x},partialUsage);
    await page.evaluate(async()=>BT360.refreshUsage(true));
    check('partial usage never presents incomplete total as zero',await page.locator('.bt360-sheet').innerText().then(t=>t.includes('Total is incomplete')||t.toLowerCase().includes('total is incomplete'))&&await page.locator('.bt360-sheet').innerText().then(t=>t.includes('Not reported by Railway')&&t.includes('leaps-alpaca-live')&&!t.includes('$0.00')));
    await page.evaluate(x=>{window.__hostingUsageFixture={...x,r2:{status:'ok',usedBytes:1200000},railway:{status:'partial',verifiedAt:x.railway.verifiedAt,costSoFar:2.31,knownCostSubtotal:2.31,projectedMonthEnd:3.47,reasonCode:'measurement_missing',services:[{name:'api',costSoFar:2.31,avgMemoryGb:null}],missing:[{service:'project',metric:'average_memory',kind:'measurement_missing'}]}}},syntheticUsage);
    await page.evaluate(async()=>BT360.refreshUsage(true));
    check('optional usage gap preserves projection and positive R2 storage',await page.locator('.bt360-sheet').innerText().then(t=>t.includes('Verified $2.31')&&t.includes('Projected billing usage: Verified $3.47')&&t.includes('Less than 0.01 GB')&&!t.includes('Projection not available')));
    const reasonCodes=['token_missing','token_unauthorized','workspace_not_found','project_not_visible','estimate_missing','measurement_missing','rate_limited','timeout','railway_unreachable','response_changed'];
    for(const code of reasonCodes){
      await page.evaluate(([x,c])=>{window.__hostingUsageFixture={...x,railway:{status:'unavailable',reasonCode:c,reason:'REMOTE-SENSITIVE-RESPONSE'}}},[syntheticUsage,code]);
      await page.evaluate(async()=>BT360.refreshUsage(true));
      check('unavailable '+code+' is safe and never becomes $0.00',await page.locator('.bt360-sheet').innerText().then(t=>!t.includes('$0.00')&&!t.includes('REMOTE-SENSITIVE-RESPONSE')&&t.includes('View Railway usage')));
    }
    await page.evaluate(x=>{window.__hostingUsageFixture={...x,railway:{...x.railway,costSoFar:0,projectedMonthEnd:0,services:x.railway.services.map(a=>({...a,costSoFar:0}))}}},syntheticUsage);
    await page.evaluate(async()=>BT360.refreshUsage(true));
    check('genuine verified zero is not hidden',await page.locator('.bt360-sheet').innerText().then(t=>t.includes('Verified $0.00')));
    await page.evaluate(x=>{window.__hostingUsageFixture=x},syntheticUsage);
    await page.evaluate(async()=>BT360.refreshUsage(true));

    for(const width of [320,375,390,430,1024]){
      await page.setViewportSize({width,height:844});
      check('hosting and Settings fit '+width+'px',await page.locator('.bt360-sheet').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('.bt360-panel,.bt360-usage-top,.bt360-usage-r2')].every(n=>n.scrollWidth<=n.clientWidth+1)));
      if(width===390){await page.screenshot({path:path.join(output,name+'-hosting-settings-390.png')});await page.screenshot({path:path.join(output,name+'-v362-settings-390.png')});}
    }
    check('hosting usage views leave bank records unchanged',await page.evaluate(before=>localStorage.getItem('bt_e_v4')===before,bankingBeforeHosting));
    await page.getByRole('button',{name:'Close settings'}).click();
    await page.evaluate(()=>{window.fetch=window.__hostingPreviousFetch;delete window.__hostingPreviousFetch;delete window.__hostingUsageFixture});
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
        completeBonusText:'Receive qualifying direct deposits',checklist:[{text:'Qualifying direct deposit',done:false}],
        customTimers:[{id:'trust-dd',text:'Receive qualifying direct deposits',date:'2027-01-01',done:false}]}];
      tab='tracker';expanded=null;cfm=null;search='';BT360.setAudience('all');BT360.resetStage();saveUserDatapoints([]);sv(SK,entries);R();toggleCk('E2E-TRUST',0);
    });
    check('direct deposit completion prompts for an observed result',await page.getByRole('dialog',{name:'My experience'}).isVisible()&&await page.evaluate(()=>dpEditor.evidenceStage==='requirement'));
    check('completion prompt does not invent an event date or trusted outcome',await page.evaluate(()=>dpEditor.eventDate===''&&!dpEditor.confirmedByUser&&loadUserDatapoints().length===0));
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      check('experience review fits '+width+'px',await page.locator('.research-editor').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth));
    }
    check('optional experience fields start collapsed',await page.locator('.experience-optional').evaluate(e=>!e.open));
    check('confirmation checkbox is compact with a full touch label',await page.locator('.experience-confirm').evaluate(e=>e.getBoundingClientRect().height>=44&&e.querySelector('input').getBoundingClientRect().width<=24));
    await page.getByLabel('Transfer or activity',{exact:true}).fill('Synthetic payroll');
    await page.getByLabel('Observed result',{exact:true}).selectOption('worked');
    await page.getByLabel('Actual experience date',{exact:true}).fill(await page.evaluate(()=>td()));
    await page.getByLabel('I confirm this result from my own experience',{exact:true}).check();
    await page.screenshot({path:path.join(output,name+'-experience-confirmation.png')});
    await page.getByRole('button',{name:'Save report',exact:true}).click();
    check('explicit experience retains cycle identity and attestation',await page.evaluate(()=>loadUserDatapoints().some(x=>x.entryId==='E2E-TRUST'&&x.accountType==='business'&&x.cycleOpened==='2026-01-01'&&x.confirmedByUser&&x.outcome==='worked')));
    await page.evaluate(()=>{expanded=null;search='';BT360.setAudience('all');BT360.resetStage();R();if(BT360.selectedAttentionId!=='E2E-TRUST')BT360.toggleAttention('E2E-TRUST')});
    await page.getByRole('button',{name:'DD datapoints',exact:false}).click();
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
    await page.getByRole('button',{name:'Skip for now',exact:true}).click();
    check('skipping experience preserves payment and prior evidence',await page.evaluate(before=>!!entries[0].bonusRecd&&JSON.stringify(loadUserDatapoints())===before,pointsBeforeSkip));
    await page.evaluate(()=>BTBonusAuth.disconnect());
    check('AI sign-out removes remembered session',await page.evaluate(()=>!localStorage.getItem('bonus-ai-auth')&&!BTBonusAuth.connected()));
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

