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
      if(url.endsWith('/api/bonus-tracker/usage'))return Promise.resolve(new Response(JSON.stringify({
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
  const button=text=>page.getByRole('button',{name:text,exact:true});
  const openAdvancedActions=async()=>{const detail=page.locator('details.bt360-legacy-actions');if(await detail.count()&&!await detail.evaluate(el=>el.open))await detail.locator('summary').click();};
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
    const card=page.locator('.card-h').first();
    if(!await button('Manage').isVisible())await card.click();
    await button('Manage').click();
    await page.getByRole('button',{name:'✏️ Edit account Details, dates, bonus, rules',exact:true}).click();
  };
  const close=async()=>{
    await button('Review closure').click();
    await page.locator('#cp_date').fill('2026-05-01');
    await page.locator('#cp_monthly_checked').selectOption('yes');
    await button('Next').click();await button('Next').click();await button('Review').click();await button('Save Closed').click();await button('OK').click();
  };
  try{
    await page.goto(url);await settleStartup();
    await page.getByText('No accounts yet',{exact:true}).waitFor();
    check('year selector is a single pill and zero-count stages hidden',await page.locator('#bt362-year').count()===1&&await page.locator('.yr-btn').count()===0&&await page.locator('.bt360-stage').count()===0);
    check('Tracker floating add replaces bulky Quick Add bar',await page.locator('.bt362-add-fab').isVisible()&&await page.locator('.tracker-quick-actions').count()===0);

    const beforeNotifications=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await button('Notifications').click();
    check('header bell opens read-only notification center',await page.getByRole('dialog',{name:'Notification center'}).isVisible()&&await page.getByText('No current tasks needing attention.').isVisible());
    await page.getByRole('button',{name:'Close notifications'}).click();
    check('notification center leaves records unchanged',await page.evaluate(x=>localStorage.getItem('bt_e_v4')===x,beforeNotifications));
    check('Action Center defaults collapsed',await page.locator('#bt-action-center-toggle').getAttribute('aria-expanded')==='false'&&!await page.locator('#bt-action-center-body').isVisible());
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
    await page.locator('.bt362-add-fab').click();await button('Quick Add').click();await button('CI Citi $300').click();
    check('Quick Add exposes bank/account/bonus',await page.locator('input[oninput*="\'bank\'"]').isVisible()&&await page.locator('select[onchange*="\'accountType\'"]').isVisible()&&await page.locator('input[oninput*="\'bonus\'"]').isVisible());
    await button('4 Review').click();check('unverified template cannot be saved',await button('💾 Add account').isDisabled());await button('Cancel').click();
    await importEntry(payload);
    check('import stops before saving',await page.evaluate(()=>JSON.parse(localStorage.getItem('bt_e_v4')).length===0));
    await button('2 Requirements').click();
    check('deadline wording is visible',await page.locator('input[oninput*="\'requiredDaysText\'"]').inputValue()==='90 calendar days');
    await button('4 Review').click();await button('💾 Add account').click();
    await wait(()=>JSON.parse(localStorage.getItem('bt_e_v4')).length===1);
    check('v3.6.1 panel headings render badges instead of literal HTML',await page.locator('.bt360-panel-title').evaluateAll(rows=>rows.some(e=>e.querySelector('h3')?.textContent==='Needs you'&&e.querySelector('.bt360-count'))&&rows.every(e=>!e.querySelector('h3')?.textContent.includes('<span'))));
    check('90-day deadline is exact',await page.evaluate(()=>reqDeadline(entries[0]))==='2026-05-01');
    const beforeDisclosure=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await openAdvancedActions();await page.locator('#bt-action-center-toggle').click();
    check('header expands Action Center',await page.locator('#bt-action-center-toggle').getAttribute('aria-expanded')==='true'&&await page.locator('.ops-action-row').first().isVisible());
    await page.evaluate(()=>R());
    check('Action Center remains open through render',await page.locator('#bt-action-center-body').isVisible());
    await openAdvancedActions();await page.locator('#bt-action-center-toggle').press('Enter');
    check('keyboard collapses Action Center',!await page.locator('#bt-action-center-body').isVisible());
    await openAdvancedActions();await page.locator('#bt-action-center-toggle').press('Space');
    check('keyboard expands Action Center without record changes',await page.locator('#bt-action-center-body').isVisible()&&await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===beforeDisclosure);
    check('compact action tiles omit duplicate explanations',await page.locator('.ops-action-center .ops-action-explanation').count()===0&&await page.locator('.ops-action-center .ops-date-proof').count()===0);
    await page.locator('.ops-action-row').first().click();
    check('action tile opens its full account card',await page.locator('.card-exp').isVisible());
    check('using an action preserves expanded Action Center',await page.locator('#bt-action-center-toggle').getAttribute('aria-expanded')==='true');
    check('account omits redundant guidance sections',await page.locator('.ops-action-why,.ops-date-proof').count()===0);
    check('Action Center shows next task with countdown',await page.locator('.ops-tile-status').first().innerText().then(t=>t.length>0&&!/d left/.test(t))&&await page.locator('.ops-tile-countdown').count()>0);
    const id=(await record()).id;
    await page.reload();await settleStartup();check('reload preserves identity and notes',(await record()).id===id&&(await record()).notes===payload.entry.notes);
    check('refresh resets Action Center to collapsed',await page.locator('#bt-action-center-toggle').getAttribute('aria-expanded')==='false');
    await openAdvancedActions();await page.locator('#bt-action-center-toggle').click();
    await edit();await button('3 Fees & Close').click();
    await page.getByPlaceholder('Personal notes; terms review does not overwrite them').fill('Keep <img src=x onerror=alert(1)> & "quotes"');
    await button('4 Review').click();await button('💾 Save changes').click();
    await wait(()=>modal===null&&!entrySaveBusy);
    check('edit preserves identity',(await record()).id===id);
    check('notes cannot inject HTML',await page.locator('img[src="x"]').count()===0);
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{document.querySelector('.scroll').scrollTop=0});
    check('detail uses one mockup header and current Tasks step',!await page.locator('.bt360-detail-card>.card-h').isVisible()&&await page.locator('.bt360-steps [aria-current="step"]').innerText()==='Tasks');
    await page.screenshot({path:path.join(output,name+'-v363-detail-in-progress-390.png')});
    await button('Review deposits').click();await button('Confirm all requirements').click();await page.locator('#req_date').fill('2026-04-01');await button('Save').click();await button('OK').click();
    check('requirements and payout stay separate',(await record()).reqMet==='2026-04-01'&&!(await record()).bonusRecd);
    await button('Confirm received').click();await page.locator('#rcv_date').fill('2026-04-15');await button('Save').click();await button('OK').click();
    check('bonus receipt updates close readiness',await page.evaluate(()=>btLifecycleStageForEntry(entries[0]).code)==='READY_TO_CLOSE');
    check('ready detail highlights Close and keeps missing-phone card',await page.locator('.bt360-steps [aria-current="step"]').innerText()==='Close'&&await button('Add bank phone number').count()===1);
    await button('Add bank phone number').click();
    check('missing phone opens existing personal editor for this bank',await page.locator('#ph_new_bank').inputValue()==='E2E Verification Bank'&&await page.locator('#ph_new_personal').evaluate(e=>e===document.activeElement));
    await page.evaluate(()=>BT360.closePhonebook());
    await page.evaluate(()=>{document.querySelector('.scroll').scrollTop=0});
    await page.screenshot({path:path.join(output,name+'-v363-detail-ready-390.png')});
    await page.evaluate(()=>{const s=document.querySelector('.scroll');s.scrollTop=s.scrollHeight});
    check('detail content and footer reserve non-overlapping space above navigation',await page.evaluate(()=>{const scroll=document.querySelector('.scroll').getBoundingClientRect(),footer=document.querySelector('.bt360-detail-footer').getBoundingClientRect(),nav=document.querySelector('.tabs').getBoundingClientRect(),last=document.querySelector('.bt360-detail-card .card-btns').getBoundingClientRect();return scroll.bottom<=footer.top+1&&last.bottom<=footer.top&&footer.bottom<=nav.top+1&&nav.bottom<=innerHeight+1}));
    await button('Manage').click();await button('⏱️ Add timer Set a reminder or deadline').click();
    await button('Start + Days').click();await page.locator('#tem_text').fill('E2E manual reminder');await page.locator('#tem_start').fill('2026-03-08');await page.locator('#tem_days').fill('1');await button('Add timer').click();
    check('timer uses calendar days across DST',(await record()).customTimers.some(t=>t.text==='E2E manual reminder'&&t.date==='2026-03-09'));
    if(!await page.locator('details[data-section-key="lifecycle"]').evaluate(e=>e.open))await page.locator('details[data-section-key="lifecycle"] summary').click();
    await button('Manage').click();await button('✅ Add task Track a requirement').click();await page.getByPlaceholder('e.g. Make 1 debit card transaction').fill('E2E checklist task');await button('Save').click();
    await page.locator('.ck li').filter({hasText:'E2E checklist task'}).locator('.ckb').click();
    check('checklist completion persists without collapsing section',(await record()).checklist[0].done&&await page.locator('details[data-section-key="lifecycle"]').evaluate(e=>e.open));
    check('checklist exposes accessible completion state',await page.getByRole('checkbox',{name:'E2E checklist task',exact:true}).getAttribute('aria-checked')==='true');
    await button('Tax').click();
    check('tax includes received bonus on open account',(await page.locator('#app').innerText()).includes('E2E Verification Bank'));
    page.once('dialog',dialog=>dialog.accept('2026'));
    const taxDownload=page.waitForEvent('download');await button('Export tax CSV').click();
    const taxFile=path.join(output,name+'-tax.csv');await (await taxDownload).saveAs(taxFile);
    const taxCSV=await fs.readFile(taxFile,'utf8');
    check('tax CSV downloads with correct amount and dates',taxCSV.includes('E2E Verification Bank')&&taxCSV.includes('"325"')&&taxCSV.includes('Apr 15, 2026'));
    await button('Tracker').click();
    await button('Settings').click();
    check('data tools are in the header menu',await page.getByRole('button',{name:'Export backup file',exact:false}).isVisible()&&await page.getByRole('button',{name:'Reset this device',exact:false}).isVisible()&&await page.locator('.tracker-quick-actions button').count()===0);
    const backupEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export backup file',exact:false}).click();
    const backupFile=path.join(output,name+'-backup.json');await (await backupEvent).saveAs(backupFile);
    const backup=JSON.parse(await fs.readFile(backupFile,'utf8'));
    check('backup contains records, history, and terms',backup.entries.length===1&&backup.entries[0].id===id&&Object.keys(backup.termsArchive).length>0&&backup.entries[0].history.length>0);
    await close();check('closure uses actual date',(await record()).closed==='2026-05-01');
    check('eligibility uses payout plus exact months and buffer',await page.evaluate(()=>btOfficialEligibilityDate(entries[0])==='2027-04-15'&&nextReopen(entries[0])==='2027-04-17'));
    await button('Undo').click();check('undo restores account and notes',!(await record()).closed&&(await record()).notes===backup.entries[0].notes);
    await close();
    await button('Settings').click();
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Restore from file',exact:false}).click();await (await chooser).setFiles(backupFile);
    const safetyDownload=page.waitForEvent('download');await button('Restore Backup').click();await safetyDownload;
    await page.getByRole('heading',{name:'Restore Complete'}).waitFor();await button('Confirm').click();
    check('restore recovers open state and saved details',!(await record()).closed&&(await record()).id===id&&(await record()).notes===backup.entries[0].notes);
    // Exercise the real archive menu without changing financial records.
    await page.evaluate(()=>{entries.push({id:'archive-e2e',bank:'Archived E2E Bank',closed:'2026-10-01',bonusRecd:'2026-09-01',bonus:100,churnable:false,churnability:'not-repeatable',notes:'Preserved archive note',history:[],customTimers:[],checklist:[]});R()});
    check('closed nonrepeatable account hidden from tracker',await page.locator('[data-bt-entry-id="archive-e2e"]').count()===0);
    await button('Archive').click();await page.locator('details.bt360-archived-tools > summary').click();
    check('archive menu reveals retained account',await page.locator('[data-bt-entry-id="archive-e2e"]').count()===1&&await page.locator('[data-bt-entry-id="'+id+'"]').count()===0);
    await page.locator('#archive-search').fill('Archived E2E');
    check('archive search remains focused after rerender',await page.locator('#archive-search').evaluate(el=>el===document.activeElement));
    await page.locator('[data-bt-entry-id="archive-e2e"] .card-h').click();
    check('archive preserves expanded history',await page.locator('[data-bt-entry-id="archive-e2e"] .card-exp').count()===1);
    await page.getByRole('button',{name:'Back to Archive',exact:true}).click();await button('Tracker').click();
    check('archive navigation retains records',await page.evaluate(()=>entries.some(e=>e.id==='archive-e2e'&&e.notes==='Preserved archive note')));
    await page.evaluate(()=>{entries=entries.filter(e=>e.id!=='archive-e2e');R()});
    await button('Datapoints').click();check('successful method appears in datapoints',(await page.locator('#app').innerText()).includes('E2E Verification Bank'));await button('Archive').click();await button('Saved terms').click();check('terms archive contains original promotion',(await page.locator('#app').innerText()).includes('E2E Verification Bank'));await button('Tracker').click();
    await page.getByPlaceholder('Search accounts...').fill('Does not exist');await page.getByText('No matching accounts',{exact:true}).waitFor();await page.getByPlaceholder('Search accounts...').fill('');
    check('search keeps stored record',(await record()).id===id);
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,name+'-v362-tracker-390.png')});
    check('mobile layout fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    const storedBeforeRadar=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await page.evaluate(()=>{const base=entries[0];entries.push({...base,id:'radar-us-bank',bank:'U.S. Bank',closed:'2026-05-01'});sv(SK,entries);R()});
    const storedDuringRadar=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await button('Bank Bonuses').click();
    await page.locator('.radar-card h3').filter({hasText:'Synthetic Checking'}).waitFor();
    await page.screenshot({path:path.join(output,name+'-v362-bonuses-390.png')});
    await page.screenshot({path:path.join(output,name+'-v363-bonuses-390.png')});
    check('offer title is compact without unverified amount review badge',await page.locator('.radar-card h3').filter({hasText:'Wells Fargo Checking · $325'}).count()===1&&!await page.locator('.bt360-offer-title').filter({hasText:'Needs review'}).count());
    check('offers group by verified tracker review status without assuming personal eligibility',await page.locator('.radar-group-heading').count()>0&&(await page.getByText('About sources',{exact:true}).count())===1);
    check('bank feed renders escaped discovery title',(await page.locator('.radar-card img').count())===0&&(await page.locator('.radar-card').filter({hasText:'Synthetic Checking'}).innerText()).includes('<img'));
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
    if(!await button('Ask AI about this bonus').count())await page.locator('.card-h').first().click();
    await button('Ask AI about this bonus').click();
    check('Tracker AI opens for one selected bank',(await page.locator('.bonus-ai-heading').innerText()).includes('E2E Verification Bank')&&await page.evaluate(()=>window.__bonusAITest.calls.length===0));
    check('local answers need no login',await page.locator('#bonus-ai-login').isHidden());
    for(const label of ['Monthly fee','Fee waivers','Direct deposit','Early-close fee','Companion account','Repeat eligibility']){await button(label).click();check('prefill: '+label,(await page.locator('#bonus-ai-question').inputValue()).length>20);}
    await button('Closure rules').click();await page.locator('#bonus-ai-send').click();
    await page.locator('#bonus-ai-answer p').first().waitFor();
    check('AI closure decision uses tracker gates',(await page.locator('.bonus-ai-verdict').innerText())==='Ready — tracker checks passed');
    check('AI explains a concrete next step',(await page.locator('.bonus-ai-next-step').innerText()).includes('companion accounts'));
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
    check('malformed AI output uses account-detail answer',await page.locator('.bonus-ai-verdict').innerText()==='Ready — tracker checks passed');
    await page.evaluate(()=>window.__bonusAITest.fail=true);await button('Ask AI for more').click();await page.getByText('AI is busy. Try again later. Account-detail answer shown below.',{exact:true}).waitFor();
    check('AI rate limit is handled without repeated requests',await page.evaluate(()=>window.__bonusAITest.calls.length===4));
    await page.evaluate(()=>{window.__bonusAITest.fail=false;window.__bonusAITest.response=null;window.__bonusAITest.serverFailure=true;});
    await button('Ask AI for more').click();await page.getByText('AI could not produce a supported answer. Account-detail answer shown below.',{exact:true}).waitFor();
    check('production-style AI failure preserves a useful closure answer',(await page.locator('.bonus-ai-direct-answer').innerText()).includes('tracker checks passed'));
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

    // Reopen focused detail after testing cloud protection on the Tracker hero.
    await page.locator('.card-h').first().click();
    const lifecycle=page.locator('.profile-section[data-section-key="lifecycle"]').first();
    if(!await lifecycle.evaluate(e=>e.open))await lifecycle.locator('summary').click();
    await page.locator('#bt362-year').selectOption('2025');
    await page.locator('#bt362-year').selectOption('2026');
    check('expanded Lifecycle & Tasks survives year navigation',await page.locator('.profile-section[data-section-key="lifecycle"]').first().evaluate(e=>e.open));
    // The focused detail intentionally hides the Tracker list search; navigate back first.
    await page.getByRole('button',{name:'Back to accounts'}).click();
    await page.getByPlaceholder('Search accounts...').pressSequentially('E2E');
    check('tracker search keeps cursor through consecutive keystrokes',await page.getByPlaceholder('Search accounts...').inputValue()==='E2E'&&await page.evaluate(()=>document.activeElement.id==='tracker-search'));
    await page.getByPlaceholder('Search accounts...').fill('');
    await button('Datapoints').click();
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,name+'-v362-data-390.png')});
    await page.screenshot({path:path.join(output,name+'-v363-data-390.png')});
    check('Data defaults to individual reports with outcome method source and date',await page.locator('.bt363-report-row').count()>0&&await page.locator('button.dp-head').count()===0&&await page.locator('.bt363-report-row summary').first().evaluate(e=>!!e.querySelector('.research-result')&&!!e.querySelector('.bt363-report-method')&&e.querySelector('small').textContent.includes(' · ')));
    await page.getByText('More filters and saved notes',{exact:true}).click();
    await page.getByLabel('Report layout',{exact:true}).selectOption('bank');
    await page.getByText('More filters and saved notes',{exact:true}).click();
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
    await button('Archive').click();await button('Saved terms').click();
    await page.getByPlaceholder('Search stored T&C...').pressSequentially('E2E');
    check('terms search keeps focus while typing',await page.getByPlaceholder('Search stored T&C...').inputValue()==='E2E'&&await page.evaluate(()=>document.activeElement.id==='terms-search'));
    const termsBank=page.locator('.archive-bank').first();
    check('terms bank starts collapsed',!(await termsBank.evaluate(e=>e.open)));
    await termsBank.locator(':scope > summary').click();
    await termsBank.getByText('Read original saved terms',{exact:true}).click();
    check('archive reveals original evidence',(await termsBank.innerText()).includes('E2E Verification Bank checking promotional terms'));
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:844});
      check('archive mobile width '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.archive-raw')].every(e=>e.scrollWidth<=e.clientWidth+1)));
      if(width===390){await page.locator('.archive-raw').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,name+'-terms-archive-mobile.png')})}
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
        bars:e.querySelectorAll('.bt360-monthbars>span').length,
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
    const mobileLifecycle=page.locator('.profile-section[data-section-key="lifecycle"]').first();
    if(await mobileLifecycle.evaluate(e=>e.open))await mobileLifecycle.locator('summary').click();
    await page.evaluate(()=>{undoState=null;clearTimeout(undoTimer);R()});
    await openAdvancedActions();await page.locator('.ops-action-center').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,name+'-mobile-verified.png')});
    // Long saved requirements must remain readable without changing account storage.
    await page.evaluate(()=>{
      window.__cardTextOriginal=JSON.parse(JSON.stringify(entries));
      const e=entries[0];e.bank='E2E Lafayette Federal Credit Union';e.reqMet='2026-08-10';e.bonusRecd='';e.closed='';
      e.customTimers=[{id:'long-requirement',text:'Establish $500+ monthly qualified direct deposits and retain the required membership savings balance',startDate:'2026-09-11',date:'2026-10-26',daysRequired:45,done:false}];
      expanded=null;R();
    });
    for(const width of [320,375,390,1024]){
      await page.setViewportSize({width,height:844});
      const card=page.locator('.card-h').first();
      check('full recurring requirement at '+width+'px',(await card.locator('.bt-card-deadline p').innerText())==='Establish $500+ monthly qualified direct deposits and retain the required membership savings balance');
      check('countdown and date separate at '+width+'px',(await card.locator('.bt-card-deadline-meta').innerText()).includes('Due Oct 26, 2026'));
      check('card text wraps without clipping at '+width+'px',await card.evaluate(e=>{
        const name=e.querySelector('.card-name'),support=e.querySelector('.card-subline');
        return [name,support].every(n=>n.scrollWidth<=n.clientWidth+1&&n.scrollHeight<=n.clientHeight+1)&&support.getBoundingClientRect().width>e.getBoundingClientRect().width*.85&&document.documentElement.scrollWidth<=innerWidth;
      }));
      if(width===390)await card.screenshot({path:path.join(output,name+'-card-text.png')});
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{
      entries.push({...entries[0],id:'E2E-TILE-02',bank:'E2E Citi',bonus:325,reqMet:'2026-08-10',payoutTimingText:'Bonus expected after requirements are completed',customTimers:[]});R();
    });
    await openAdvancedActions();
    check('mobile Action Center uses two compact columns',await page.locator('.ops-action-tile').evaluateAll(rows=>rows.length===2&&Math.abs(rows[0].getBoundingClientRect().top-rows[1].getBoundingClientRect().top)<2));
    check('every Action Center tile shows specific next action',await page.locator('.ops-action-tile').evaluateAll(rows=>rows.every(e=>{const s=e.querySelector('.ops-tile-status');return s&&s.textContent.trim()&&!/d left|Date needs review/.test(s.textContent)})));
    check('recurring and payout tasks remain distinct',await page.locator('.ops-tile-status').allTextContents().then(rows=>rows.some(t=>t.includes('Establish $500+ monthly qualified direct deposits'))&&rows.includes('Confirm bonus payment')));
    check('compact recurring and payout buttons remain available',await button('Review deposits').count()===1&&await button('Confirm received').count()===1);
    await page.locator('.ops-action-center').screenshot({path:path.join(output,name+'-action-tiles.png')});
    const taskStorage=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await button('Review deposits').click();
    check('deposit action opens exact task and preserves data',await page.locator('.ops-task-current').isVisible()&&(await page.locator('.ops-task-current').innerText()).includes('$500+')&&await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===taskStorage);
    check('one task review does not open whole-offer completion',await page.evaluate(()=>!reqPrompt&&!rcvPrompt));
    await openAdvancedActions();await page.locator('#bt-action-center-toggle').click();
    check('collapsed Action Center remains compact on mobile',await page.locator('.ops-action-center').evaluate(e=>e.getBoundingClientRect().height<100)&&!await page.locator('.ops-action-list').isVisible());
    await page.locator('.ops-action-center').screenshot({path:path.join(output,name+'-action-center-collapsed.png')});
    await openAdvancedActions();await page.locator('#bt-action-center-toggle').click();
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
    // Exercise real offline navigation through Chromium and its service worker.
    await context.setOffline(true);
    await page.reload();await settleStartup();await page.getByText('BonusTracker',{exact:false}).first().waitFor();
    check('offline reload preserves account',(await record()).id===id);
    serverUnavailable=false;await context.setOffline(false);
    check('AI login persists across browser reload',await page.evaluate(()=>BTBonusAuth.connected()));

    // Synthetic-only owner usage response: assert the live Settings visual at
    // 320/375/390/430 and desktop without contacting Railway or R2.
    const bankingBeforeHosting=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    const syntheticUsage={month:'2026-10',checkedAt:'2026-10-17T19:10:00Z',railway:{
      status:'ok',costSoFar:2.31,projectedMonthEnd:4.50,
      services:[{name:'api',costSoFar:1.25,avgMemoryGb:0.235},{name:'leaps-alpaca-live',costSoFar:1.06,avgMemoryGb:0.318}]
    },r2:{status:'ok',usedBytes:240000000,freeBytes:10000000000}};
    // Stub fetch inside the page because a controlling service worker may bypass
    // Playwright routing under a controlling service worker. No real provider request is sent.
    await page.evaluate(fixture=>{
      window.__hostingPreviousFetch=window.fetch;
      window.fetch=async (input,options)=>String(typeof input==='string'?input:input.url).endsWith('/api/bonus-tracker/usage')
        ?new Response(JSON.stringify(fixture),{status:200,headers:{'Content-Type':'application/json'}})
        :window.__hostingPreviousFetch(input,options);
    },syntheticUsage);
    await button('Settings').click();
    check('header ellipsis opens actual Settings',await page.getByRole('dialog',{name:'Settings'}).isVisible());
    await page.evaluate(async()=>BT360.refreshUsage(true));
    await page.getByText('Near limit',{exact:true}).waitFor();
    check('hosting usage card uses mocked nonzero Railway estimate',(await page.locator('.bt360-sheet').innerText()).includes('HOSTING & USAGE')&&
      (await page.locator('.bt360-sheet').innerText()).includes('leaps-alpaca-live'));
    for(const width of [320,375,390,430,1024]){
      await page.setViewportSize({width,height:844});
      check('hosting and Settings fit '+width+'px',await page.locator('.bt360-sheet').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('.bt360-panel,.bt360-usage-top,.bt360-usage-r2')].every(n=>n.scrollWidth<=n.clientWidth+1)));
      if(width===390){await page.screenshot({path:path.join(output,name+'-hosting-settings-390.png')});await page.screenshot({path:path.join(output,name+'-v362-settings-390.png')});}
    }
    check('hosting usage views leave bank records unchanged',await page.evaluate(before=>localStorage.getItem('bt_e_v4')===before,bankingBeforeHosting));
    await page.getByRole('button',{name:'Close settings'}).click();
    await page.evaluate(()=>{window.fetch=window.__hostingPreviousFetch;delete window.__hostingPreviousFetch});
    await page.setViewportSize({width:1280,height:900});

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
