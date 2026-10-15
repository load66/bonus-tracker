'use strict';
// Actual DOM, file chooser, download, localStorage, and service-worker coverage.
// Each engine gets a new isolated context; this never connects to production data.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {chromium,firefox,webkit}=require('playwright');
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
  const wait=async fn=>{await page.waitForFunction(fn,{},{timeout:15000})};
  const record=async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bt_e_v4')||'[]')[0]);
  const check=(label,condition)=>{assert.ok(condition,label);checks.push(label)};
  const importEntry=async object=>{
    await button('Quick Add').click();
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
    await button('Review & record closure').click();
    await page.locator('#cp_date').fill('2026-05-01');
    await page.locator('#cp_monthly_checked').selectOption('yes');
    await button('Next').click();await button('Next').click();await button('Review').click();await button('Save Closed').click();await button('OK').click();
  };
  try{
    await page.goto(url);
    await page.getByText('No accounts yet',{exact:true}).waitFor();
    check('Action Center defaults collapsed',await page.locator('#bt-action-center-toggle').getAttribute('aria-expanded')==='false'&&!await page.locator('#bt-action-center-body').isVisible());
    await page.waitForFunction(()=>window.__btFullRegressionReport&&!window.__btFullRegressionReport.pending&&window.__btFullRegressionReport.total===18);
    const diagnostics=await page.evaluate(()=>window.btRunFullRegressionTests({force:true}));
    await fs.writeFile(path.join(output,name+'-diagnostics.json'),JSON.stringify(diagnostics,null,2));
    check('runtime self-tests pass',diagnostics.ok);
    await button('Quick Add').click();await button('CI Citi $300').click();
    check('Quick Add exposes bank/account/bonus',await page.locator('input[oninput*="\'bank\'"]').isVisible()&&await page.locator('select[onchange*="\'accountType\'"]').isVisible()&&await page.locator('input[oninput*="\'bonus\'"]').isVisible());
    await button('4 Review').click();check('unverified template cannot be saved',await button('💾 Add account').isDisabled());await button('Cancel').click();
    await importEntry(payload);
    check('import stops before saving',await page.evaluate(()=>JSON.parse(localStorage.getItem('bt_e_v4')).length===0));
    await button('2 Requirements').click();
    check('deadline wording is visible',await page.locator('input[oninput*="\'requiredDaysText\'"]').inputValue()==='90 calendar days');
    await button('4 Review').click();await button('💾 Add account').click();
    await wait(()=>JSON.parse(localStorage.getItem('bt_e_v4')).length===1);
    check('90-day deadline is exact',await page.evaluate(()=>reqDeadline(entries[0]))==='2026-05-01');
    const beforeDisclosure=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await page.locator('#bt-action-center-toggle').click();
    check('header expands Action Center',await page.locator('#bt-action-center-toggle').getAttribute('aria-expanded')==='true'&&await page.locator('.ops-action-row').first().isVisible());
    await page.evaluate(()=>R());
    check('Action Center remains open through render',await page.locator('#bt-action-center-body').isVisible());
    await page.locator('#bt-action-center-toggle').press('Enter');
    check('keyboard collapses Action Center',!await page.locator('#bt-action-center-body').isVisible());
    await page.locator('#bt-action-center-toggle').press('Space');
    check('keyboard expands Action Center without record changes',await page.locator('#bt-action-center-body').isVisible()&&await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===beforeDisclosure);
    check('compact action tiles omit duplicate explanations',await page.locator('.ops-action-center .ops-action-explanation').count()===0&&await page.locator('.ops-action-center .ops-date-proof').count()===0);
    await page.locator('.ops-action-row').first().click();
    check('action tile opens its full account card',await page.locator('.card-exp').isVisible());
    check('using an action preserves expanded Action Center',await page.locator('#bt-action-center-toggle').getAttribute('aria-expanded')==='true');
    check('long action guidance is collapsed by default',!await page.locator('.ops-action-explanation').isVisible());
    await page.locator('.ops-action-why summary').click();
    check('next action explains saved requirements without AI',(await page.locator('.ops-action-explanation').innerText()).includes('qualifying activity with the bank'));
    const id=(await record()).id;
    await page.reload();check('reload preserves identity and notes',(await record()).id===id&&(await record()).notes===payload.entry.notes);
    check('refresh resets Action Center to collapsed',await page.locator('#bt-action-center-toggle').getAttribute('aria-expanded')==='false');
    await page.locator('#bt-action-center-toggle').click();
    await edit();await button('3 Fees & Close').click();
    await page.getByPlaceholder('Personal notes; terms review does not overwrite them').fill('Keep <img src=x onerror=alert(1)> & "quotes"');
    await button('4 Review').click();await button('💾 Save changes').click();
    await wait(()=>modal===null&&!entrySaveBusy);
    check('edit preserves identity',(await record()).id===id);
    check('notes cannot inject HTML',await page.locator('img[src="x"]').count()===0);
    await button('Confirm requirements completed').click();await page.locator('#req_date').fill('2026-04-01');await button('Save').click();await button('OK').click();
    check('requirements and payout stay separate',(await record()).reqMet==='2026-04-01'&&!(await record()).bonusRecd);
    await button('Confirm bonus received').click();await page.locator('#rcv_date').fill('2026-04-15');await button('Save').click();await button('OK').click();
    check('bonus receipt updates close readiness',await page.evaluate(()=>btLifecycleStageForEntry(entries[0]).code)==='READY_TO_CLOSE');
    await button('Manage').click();await button('⏱️ Add timer Set a reminder or deadline').click();
    await button('Start + Days').click();await page.locator('#tem_text').fill('E2E manual reminder');await page.locator('#tem_start').fill('2026-03-08');await page.locator('#tem_days').fill('1');await button('Add timer').click();
    check('timer uses calendar days across DST',(await record()).customTimers.some(t=>t.text==='E2E manual reminder'&&t.date==='2026-03-09'));
    await page.locator('details[data-section-key="lifecycle"] summary').click();
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
    await page.locator('#bt-data-menu>summary').click();
    check('data tools are in the header menu',await page.getByRole('button',{name:'Export backup file',exact:false}).isVisible()&&await page.getByRole('button',{name:'Reset this device',exact:false}).isVisible()&&await page.locator('.tracker-quick-actions button').count()===1);
    const backupEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export backup file',exact:false}).click();
    const backupFile=path.join(output,name+'-backup.json');await (await backupEvent).saveAs(backupFile);
    const backup=JSON.parse(await fs.readFile(backupFile,'utf8'));
    check('backup contains records, history, and terms',backup.entries.length===1&&backup.entries[0].id===id&&Object.keys(backup.termsArchive).length>0&&backup.entries[0].history.length>0);
    await close();check('closure uses actual date',(await record()).closed==='2026-05-01');
    check('eligibility uses payout plus exact months and buffer',await page.evaluate(()=>btOfficialEligibilityDate(entries[0])==='2027-04-15'&&nextReopen(entries[0])==='2027-04-17'));
    await button('Undo').click();check('undo restores account and notes',!(await record()).closed&&(await record()).notes===backup.entries[0].notes);
    await close();
    await page.locator('#bt-data-menu>summary').click();
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Import backup file',exact:false}).click();await (await chooser).setFiles(backupFile);
    const safetyDownload=page.waitForEvent('download');await button('Restore Backup').click();await safetyDownload;
    await page.getByRole('heading',{name:'Restore Complete'}).waitFor();await button('Confirm').click();
    check('restore recovers open state and saved details',!(await record()).closed&&(await record()).id===id&&(await record()).notes===backup.entries[0].notes);
    // Exercise the real archive menu without changing financial records.
    await page.evaluate(()=>{entries.push({id:'archive-e2e',bank:'Archived E2E Bank',closed:'2026-10-01',bonusRecd:'2026-09-01',bonus:100,churnable:false,churnability:'not-repeatable',notes:'Preserved archive note',history:[],customTimers:[],checklist:[]});R()});
    check('closed nonrepeatable account hidden from tracker',await page.locator('[data-bt-entry-id="archive-e2e"]').count()===0);
    await page.locator('#bt-data-menu>summary').click();await page.getByRole('button',{name:'Archived accounts',exact:false}).click();
    check('archive menu reveals retained account',await page.locator('[data-bt-entry-id="archive-e2e"]').count()===1&&await page.locator('[data-bt-entry-id="'+id+'"]').count()===0);
    await page.locator('#archive-search').fill('Archived E2E');
    check('archive search remains focused after rerender',await page.locator('#archive-search').evaluate(el=>el===document.activeElement));
    await page.locator('[data-bt-entry-id="archive-e2e"] .card-h').click();
    check('archive preserves expanded history',await page.locator('[data-bt-entry-id="archive-e2e"] .card-exp').count()===1);
    await page.getByRole('button',{name:'Back to Tracker',exact:true}).click();
    check('archive navigation retains records',await page.evaluate(()=>entries.some(e=>e.id==='archive-e2e'&&e.notes==='Preserved archive note')));
    await page.evaluate(()=>{entries=entries.filter(e=>e.id!=='archive-e2e');R()});
    await button('Datapoints').click();check('successful method appears in datapoints',(await page.locator('#app').innerText()).includes('E2E Verification Bank'));await button('T&C Archive').click();check('terms archive contains original promotion',(await page.locator('#app').innerText()).includes('E2E Verification Bank'));await button('Tracker').click();
    await page.getByPlaceholder('Search accounts...').fill('Does not exist');await page.getByText('No matching accounts',{exact:true}).waitFor();await page.getByPlaceholder('Search accounts...').fill('');
    check('search keeps stored record',(await record()).id===id);
    await page.setViewportSize({width:390,height:844});
    check('mobile layout fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    const storedBeforeRadar=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await page.evaluate(()=>{const base=entries[0];entries.push({...base,id:'radar-us-bank',bank:'U.S. Bank',closed:'2026-05-01'});sv(SK,entries);R()});
    const storedDuringRadar=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await button('Bank Bonuses').click();
    await page.getByText(/Synthetic Checking/).waitFor();
    check('bank feed renders escaped discovery title',(await page.locator('.radar-card img').count())===0&&(await page.locator('.radar-card').filter({hasText:'Synthetic Checking'}).innerText()).includes('<img'));
    check('bank feed warns when source check is stale',(await page.locator('#app').innerText()).includes('Updates are stale'));
    check('bank bonus tab fits mobile viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    check('partial source outage is disclosed',(await page.locator('#app').innerText()).includes('Some sources are unavailable'));
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
    await page.locator('.radar-card').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,name+'-offers-compact.png')});
    await page.getByRole('button',{name:'All banks',exact:true}).click();
    feedInvalid=true;await button('Check updates').click();
    await page.getByText(/Could not check for updates/).waitFor();
    check('failed feed refresh retains loaded results',await page.locator('.radar-card').count()===4);
    check('bank feed leaves saved account data unchanged',await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===storedDuringRadar);
    feedInvalid=false;await page.evaluate(()=>{entries=entries.filter(e=>e.id!=='radar-us-bank');sv(SK,entries);R()});await button('Tracker').click();
    check('mobile dashboard scrolls with content',await page.locator('.tracker-overview').evaluate(e=>!!e.closest('.scroll')));
    check('mobile fixed header leaves room for workflow',await page.locator('.hdr').evaluate(e=>e.getBoundingClientRect().height<=90));
    // WebKit service-worker-controlled fetches can bypass Playwright HTTP routing.
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
    await newPhone.goto(url);await newPhone.waitForFunction(()=>navigator.serviceWorker.controller&&window.__btFullRegressionReport?.total===18&&!window.__btFullRegressionReport.pending);
    await newPhone.evaluate(objects=>{
      localStorage.setItem('bonus-ai-auth',JSON.stringify({access_token:'synthetic-owner-token',refresh_token:'synthetic-refresh',expires_at:Date.now()/1000+3600}));
      const prior=window.fetch;
      window.fetch=async(input,options={})=>{
        const url=String(input);if(!url.startsWith('https://api-production-00f74.up.railway.app/api/bonus-tracker/backups'))return prior(input,options);
        if(options.method==='POST'){const p=JSON.parse(options.body),count=JSON.parse(JSON.parse(p.snapshot).storageSnapshot.bt_e_v4).length;const backup={id:p.id,createdAt:new Date().toISOString(),sha256:p.sha256,entryCount:count,bytes:p.snapshot.length,reason:p.reason,verified:true};objects[p.id]={backup,snapshot:p.snapshot};return new Response(JSON.stringify(backup),{headers:{'Content-Type':'application/json'}});}
        const ident=url.split('/').pop();const body=objects[ident]||{backups:Object.values(objects).map(x=>x.backup),total:Object.keys(objects).length,nextOffset:null};
        return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
      };
    },cloudRecords);
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

    const why=page.locator('.ops-action-why');
    if(!await why.evaluate(e=>e.open))await why.locator('summary').click();
    await button('2025').click();
    await button('2026').click();
    check('expanded account guidance survives year navigation',await page.locator('.ops-action-why').evaluate(e=>e.open));
    await page.getByPlaceholder('Search accounts...').pressSequentially('E2E');
    check('tracker search keeps cursor through consecutive keystrokes',await page.getByPlaceholder('Search accounts...').inputValue()==='E2E'&&await page.evaluate(()=>document.activeElement.id==='tracker-search'));
    await page.getByPlaceholder('Search accounts...').fill('');
    await button('Datapoints').click();
    await page.getByPlaceholder('Search bank, method, or note...').pressSequentially('E2E');
    check('datapoint search keeps focus while typing',await page.getByPlaceholder('Search bank, method, or note...').inputValue()==='E2E'&&await page.evaluate(()=>document.activeElement.id==='datapoints-search'));
    check('datapoint bank is keyboard accessible',await page.locator('button.dp-head').getAttribute('aria-expanded')!==null);
    await button('T&C Archive').click();
    await page.getByPlaceholder('Search stored T&C...').pressSequentially('E2E');
    check('terms search keeps focus while typing',await page.getByPlaceholder('Search stored T&C...').inputValue()==='E2E'&&await page.evaluate(()=>document.activeElement.id==='terms-search'));
    await button('Tracker').click();
    await page.evaluate(()=>{
      window.__dashboardMetrics=bonusPipelineMetrics;
      bonusPipelineMetrics=(...args)=>({...window.__dashboardMetrics(...args),active:575,collected:5100,openCount:2,cooldownCount:16,readyCloseCount:0,actionCount:0});R();
    });
    for(const width of [320,390,430,1024]){
      await page.setViewportSize({width,height:844});
      check('complete dashboard summary at '+width+'px',await page.locator('.ops-hero .hero-note').evaluate(e=>
        e.textContent==='$5,100 collected in 2026 • 2 open • 16 cooling down'&&e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1&&getComputedStyle(e).whiteSpace==='normal'));
      check('release version stays inside header at '+width+'px',await page.locator('.hdr .app-version').evaluate(e=>{
        const r=e.getBoundingClientRect(),h=e.closest('.hdr').getBoundingClientRect();
        return e.textContent==='v'+window.BT_APP_VERSION&&r.width>0&&r.height>0&&r.top>=h.top&&r.bottom<=h.bottom&&r.left>=0&&r.right<=innerWidth&&getComputedStyle(e).position==='static';
      }));
      check('dashboard text and chips fit at '+width+'px',await page.locator('.ops-hero').evaluate(e=>
        e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('.hero-kicker,.hero-chip')].every(n=>n.scrollWidth<=n.clientWidth+1&&n.scrollHeight<=n.clientHeight+1)));
      if(width===430)await page.screenshot({path:path.join(output,name+'-dashboard-header.png')});
    }
    await page.evaluate(()=>{bonusPipelineMetrics=window.__dashboardMetrics;delete window.__dashboardMetrics;R();});
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      for(const name of ['Tracker','Bank Bonuses','Tax','Datapoints','T&C Archive']){
        await button(name).click();
        check(name+' fits '+width+'px mobile width',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
        check(name+' navigation starts at the top at '+width+'px',await page.locator('.scroll').evaluate(e=>e.scrollTop===0));
        check(name+' shows version at '+width+'px',await page.locator('.hdr .app-version').isVisible());
        if(name==='Tracker'){
          check('action tile buttons retain mobile touch area at '+width+'px',await page.locator('.ops-action-tile .ops-next-action').evaluateAll(rows=>rows.length>0&&rows.every(e=>e.getBoundingClientRect().height>=44)));
          check('compact tiles fit at '+width+'px',await page.locator('.ops-action-tile').evaluateAll(rows=>rows.every(e=>e.scrollWidth<=e.clientWidth+1)));
        }
      }
    }
    check('mobile tab targets are at least 44px tall',await page.locator('.tabs .tb').evaluateAll(rows=>rows.every(e=>e.getBoundingClientRect().height>=44)));
    await button('Tracker').click();
    await edit();
    await page.setViewportSize({width:320,height:844});
    check('mobile editor content fits 320px',await page.locator('.modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    await page.setViewportSize({width:390,height:844});
    check('mobile editor fits viewport and prevents input zoom',await page.locator('.modal').evaluate(e=>e.getBoundingClientRect().width<=window.innerWidth)&&await page.locator('.modal input').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
    await button('Cancel').click();
    check('mobile navigation and editor leave saved records unchanged',await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===storedBeforeRadar);
    if(await page.locator('.ops-action-why').evaluate(e=>e.open))await page.locator('.ops-action-why summary').click();
    await page.evaluate(()=>{undoState=null;clearTimeout(undoTimer);R()});
    await page.locator('.ops-action-center').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,name+'-mobile-verified.png')});
    // Long saved requirements must remain readable without changing account storage.
    await page.evaluate(()=>{
      window.__cardTextOriginal=JSON.parse(JSON.stringify(entries));
      const e=entries[0];e.bank='E2E Lafayette Federal Credit Union';e.reqMet='2026-08-10';e.bonusRecd='';e.closed='';
      e.customTimers=[{id:'long-requirement',text:'Establish $500+ monthly qualified direct deposits and retain the required membership savings balance',startDate:'2026-09-11',date:'2026-10-26',daysRequired:45,done:false}];
      expanded=null;R();
    });
    for(const width of [320,390,1024]){
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
    check('mobile Action Center uses two compact columns',await page.locator('.ops-action-tile').evaluateAll(rows=>rows.length===2&&Math.abs(rows[0].getBoundingClientRect().top-rows[1].getBoundingClientRect().top)<2));
    check('compact recurring and payout buttons remain available',await button('Review recurring requirements').count()===1&&await button('Confirm bonus received').count()===1);
    await page.locator('.ops-action-center').screenshot({path:path.join(output,name+'-action-tiles.png')});
    await page.locator('#bt-action-center-toggle').click();
    check('collapsed Action Center remains compact on mobile',await page.locator('.ops-action-center').evaluate(e=>e.getBoundingClientRect().height<100)&&!await page.locator('.ops-action-list').isVisible());
    await page.locator('.ops-action-center').screenshot({path:path.join(output,name+'-action-center-collapsed.png')});
    await page.locator('#bt-action-center-toggle').click();
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
    await button('Cancel').click();
    await page.evaluate(async()=>{await navigator.serviceWorker.ready});
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    // WebKit's protocol offline mode can abort navigation before its service
    // worker fallback runs. Remove the origin instead to exercise real failed
    // network fetches; Chromium/Firefox also test protocol offline mode.
    if(name==='webkit')serverUnavailable=true;else await context.setOffline(true);
    await page.reload();await page.getByText('BonusTracker',{exact:false}).first().waitFor();
    check(name==='webkit'?'network-loss reload preserves account':'offline reload preserves account',(await record()).id===id);
    serverUnavailable=false;await context.setOffline(false);
    check('AI login persists across browser reload',await page.evaluate(()=>BTBonusAuth.connected()));
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
  try{for(const [name,engine] of Object.entries({chromium,firefox,webkit}))await exercise(name,engine,url)}
  finally{server.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
