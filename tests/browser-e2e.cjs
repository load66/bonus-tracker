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
const radarFixture={schemaVersion:2,checkedAt:'2026-10-09T12:00:00Z',sources:[{id:'doc',status:'ok',checkedAt:'2026-10-09T12:00:00Z'},{id:'fm',status:'unavailable',checkedAt:null},{id:'hmb',status:'ok',checkedAt:'2026-10-09T12:00:00Z'}],offers:[{title:'Synthetic Checking $500 Bonus <img src=x onerror=alert(1)>',url:'https://www.doctorofcredit.com/synthetic-checking-bonus/',publishedAt:'2026-10-08T12:00:00Z'},{title:'Wells Fargo $325 Checking Bonus (Nationwide)',url:'https://www.hustlermoneyblog.com/wells-fargo-bonus/',publishedAt:'2026-10-08T12:00:00Z',availability:'nationwide',groupKey:'wells fargo 325 checking nationwide'},{title:'U.S. Bank $450 Checking Bonus',url:'https://frequentmiler.com/us-bank-bonus/',publishedAt:'2026-10-08T12:00:00Z',availability:'unknown'}]};
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
    await page.getByRole('heading',{name:'Add Bank',exact:true}).waitFor();
  };
  const edit=async()=>{
    const card=page.locator('.card-h').first();
    if(!await button('Manage').isVisible())await card.click();
    await button('Manage').click();
    await page.getByRole('button',{name:'✏️ Edit Bank Details, dates, bonus, rules',exact:true}).click();
  };
  const close=async()=>{
    await button('Review & record closure').click();
    await page.locator('#cp_date').fill('2026-05-01');
    await page.locator('#cp_monthly_checked').selectOption('yes');
    await button('Next').click();await button('Next').click();await button('Review').click();await button('Save Closed').click();await button('OK').click();
  };
  try{
    await page.goto(url);
    await page.getByText('No banks yet',{exact:true}).waitFor();
    await page.waitForFunction(()=>window.__btFullRegressionReport&&!window.__btFullRegressionReport.pending&&window.__btFullRegressionReport.total===18);
    const diagnostics=await page.evaluate(()=>window.btRunFullRegressionTests({force:true}));
    await fs.writeFile(path.join(output,name+'-diagnostics.json'),JSON.stringify(diagnostics,null,2));
    check('runtime self-tests pass',diagnostics.ok);
    await button('Quick Add').click();await button('CI Citi $300').click();
    check('Quick Add exposes bank/account/bonus',await page.locator('input[oninput*="\'bank\'"]').isVisible()&&await page.locator('select[onchange*="\'accountType\'"]').isVisible()&&await page.locator('input[oninput*="\'bonus\'"]').isVisible());
    await button('4 Review').click();check('unverified template cannot be saved',await button('💾 Add Bank').isDisabled());await button('Cancel').click();
    await importEntry(payload);
    check('import stops before saving',await page.evaluate(()=>JSON.parse(localStorage.getItem('bt_e_v4')).length===0));
    await button('2 Requirements').click();
    check('deadline wording is visible',await page.locator('input[oninput*="\'requiredDaysText\'"]').inputValue()==='90 calendar days');
    await button('4 Review').click();await button('💾 Add Bank').click();
    await wait(()=>JSON.parse(localStorage.getItem('bt_e_v4')).length===1);
    check('90-day deadline is exact',await page.evaluate(()=>reqDeadline(entries[0]))==='2026-05-01');
    check('compact action tiles omit duplicate explanations',await page.locator('.ops-action-center .ops-action-explanation').count()===0&&await page.locator('.ops-action-center .ops-date-proof').count()===0);
    await page.locator('.ops-action-row').first().click();
    check('action tile opens its full account card',await page.locator('.card-exp').isVisible());
    check('long action guidance is collapsed by default',!await page.locator('.ops-action-explanation').isVisible());
    await page.locator('.ops-action-why summary').click();
    check('next action explains saved requirements without AI',(await page.locator('.ops-action-explanation').innerText()).includes('qualifying activity with the bank'));
    const id=(await record()).id;
    await page.reload();check('reload preserves identity and notes',(await record()).id===id&&(await record()).notes===payload.entry.notes);
    await edit();await button('3 Fees & Close').click();
    await page.getByPlaceholder('Personal reminders—never overwritten by analyzer').fill('Keep <img src=x onerror=alert(1)> & "quotes"');
    await button('4 Review').click();await button('💾 Save Changes').click();
    await wait(()=>modal===null&&!entrySaveBusy);
    check('edit preserves identity',(await record()).id===id);
    check('notes cannot inject HTML',await page.locator('img[src="x"]').count()===0);
    await button('Confirm requirements completed').click();await page.locator('#req_date').fill('2026-04-01');await button('Save').click();await button('OK').click();
    check('requirements and payout stay separate',(await record()).reqMet==='2026-04-01'&&!(await record()).bonusRecd);
    await button('Confirm bonus received').click();await page.locator('#rcv_date').fill('2026-04-15');await button('Save').click();await button('OK').click();
    check('bonus receipt updates close readiness',await page.evaluate(()=>btLifecycleStageForEntry(entries[0]).code)==='READY_TO_CLOSE');
    await button('Manage').click();await button('⏱️ Add Timer Custom countdown').click();
    await button('Start + Days').click();await page.locator('#tem_text').fill('E2E manual reminder');await page.locator('#tem_start').fill('2026-03-08');await page.locator('#tem_days').fill('1');await button('Add Timer').click();
    check('timer uses calendar days across DST',(await record()).customTimers.some(t=>t.text==='E2E manual reminder'&&t.date==='2026-03-09'));
    await page.locator('details[data-section-key="lifecycle"] summary').click();
    await button('Manage').click();await button('✅ Add Checklist New requirement step').click();await page.getByPlaceholder('e.g. Make 1 debit card transaction').fill('E2E checklist task');await button('Save').click();
    await page.locator('.ck li').filter({hasText:'E2E checklist task'}).locator('.ckb').click();
    check('checklist completion persists without collapsing section',(await record()).checklist[0].done&&await page.locator('details[data-section-key="lifecycle"]').evaluate(e=>e.open));
    check('checklist exposes accessible completion state',await page.getByRole('checkbox',{name:'E2E checklist task',exact:true}).getAttribute('aria-checked')==='true');
    await button('Tax').click();
    check('tax includes received bonus on open account',(await page.locator('#app').innerText()).includes('E2E Verification Bank'));
    page.once('dialog',dialog=>dialog.accept('2026'));
    const taxDownload=page.waitForEvent('download');await button('Export a Year CSV').click();
    const taxFile=path.join(output,name+'-tax.csv');await (await taxDownload).saveAs(taxFile);
    const taxCSV=await fs.readFile(taxFile,'utf8');
    check('tax CSV downloads with correct amount and dates',taxCSV.includes('E2E Verification Bank')&&taxCSV.includes('"325"')&&taxCSV.includes('Apr 15, 2026'));
    await button('Tracker').click();
    const backupEvent=page.waitForEvent('download');await button('Backup').click();
    const backupFile=path.join(output,name+'-backup.json');await (await backupEvent).saveAs(backupFile);
    const backup=JSON.parse(await fs.readFile(backupFile,'utf8'));
    check('backup contains records, history, and terms',backup.entries.length===1&&backup.entries[0].id===id&&Object.keys(backup.termsArchive).length>0&&backup.entries[0].history.length>0);
    await close();check('closure uses actual date',(await record()).closed==='2026-05-01');
    check('eligibility uses payout plus exact months and buffer',await page.evaluate(()=>btOfficialEligibilityDate(entries[0])==='2027-04-15'&&nextReopen(entries[0])==='2027-04-20'));
    await button('Undo').click();check('undo restores account and notes',!(await record()).closed&&(await record()).notes===backup.entries[0].notes);
    await close();
    const chooser=page.waitForEvent('filechooser');await button('Restore').click();await (await chooser).setFiles(backupFile);
    const safetyDownload=page.waitForEvent('download');await button('Restore Backup').click();await safetyDownload;
    await page.getByRole('heading',{name:'Restore Complete'}).waitFor();await button('Confirm').click();
    check('restore recovers open state and saved details',!(await record()).closed&&(await record()).id===id&&(await record()).notes===backup.entries[0].notes);
    await button('Datapoints').click();check('successful method appears in datapoints',(await page.locator('#app').innerText()).includes('E2E Verification Bank'));await button('T&C Archive').click();check('terms archive contains original promotion',(await page.locator('#app').innerText()).includes('E2E Verification Bank'));await button('Tracker').click();
    await page.getByPlaceholder('Search accounts...').fill('Does not exist');await page.getByText('No matching accounts',{exact:true}).waitFor();await page.getByPlaceholder('Search accounts...').fill('');
    check('search keeps stored record',(await record()).id===id);
    await page.setViewportSize({width:390,height:844});
    check('mobile layout fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    const storedBeforeRadar=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
    await button('Bank Bonuses').click();
    await page.getByText(/Synthetic Checking/).waitFor();
    check('bank feed renders escaped discovery title',(await page.locator('.radar-card img').count())===0&&(await page.locator('.radar-card').filter({hasText:'Synthetic Checking'}).innerText()).includes('<img'));
    check('bank feed warns when source check is stale',(await page.locator('#app').innerText()).includes('Updates are stale'));
    check('bank bonus tab fits mobile viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    check('partial source outage is disclosed',(await page.locator('#app').innerText()).includes('Some sources could not update'));
    await page.getByLabel('Availability',{exact:true}).selectOption('nationwide');
    check('nationwide filter requires explicit source label',await page.locator('.radar-card').count()===1&&(await page.locator('.radar-card').innerText()).includes('Wells Fargo'));
    check('compact offers contain only headline and one source link',await page.locator('.radar-card').evaluateAll(cards=>cards.every(card=>card.children.length===2&&card.children[0].tagName==='H3'&&card.children[1].tagName==='A')));
    check('offer review tools have been removed',await button('Copy offer for review').count()===0&&await page.locator('.radar-evidence').count()===0);
    await page.getByRole('button',{name:'U.S. Bank',exact:true}).click();
    check('unverified geography does not become nationwide',await page.locator('.radar-card').count()===0);
    await page.getByLabel('Availability',{exact:true}).selectOption('all');
    check('major bank search uses automatic source posts',await page.locator('.radar-card').count()===1&&(await page.locator('.radar-card').innerText()).includes('U.S. Bank'));
    await page.getByPlaceholder('Search bank bonuses…').fill('Wells Fargo');
    check('search preserves typed input and focus',await page.getByPlaceholder('Search bank bonuses…').inputValue()==='Wells Fargo'&&await page.evaluate(()=>document.activeElement.id==='radar-search'));
    await page.getByRole('button',{name:'All banks',exact:true}).click();
    await page.evaluate(()=>{undoState=null;clearTimeout(undoTimer);R()});
    await page.getByPlaceholder('Search bank bonuses…').fill('Wells Fargo');
    await page.locator('.radar-card').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,name+'-offers-compact.png')});
    await page.getByRole('button',{name:'All banks',exact:true}).click();
    feedInvalid=true;await button('Check updates').click();
    await page.getByText(/Could not check for updates/).waitFor();
    check('failed feed refresh retains loaded results',await page.locator('.radar-card').count()===3);
    check('bank feed leaves saved account data unchanged',await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===storedBeforeRadar);
    feedInvalid=false;await button('Tracker').click();
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
          throw Error('Login must not be requested by BonusTracker');
        }
        if(url==='https://api-production-00f74.up.railway.app/public/bonus-tracker/ask'){
          window.__bonusAITest.calls.push({packet:JSON.parse(options.body),authorization:options.headers.Authorization,credentials:options.credentials});
          return new Response(JSON.stringify(window.__bonusAITest.fail?{detail:'AI is busy. Try again later.'}:window.__bonusAITest.response||{answer:'The bonus is recorded as received. Check the tracker closure gates before closing.',factIds:['bonusrecd','close_gate'],missing:[],cached:false}),{status:window.__bonusAITest.fail?429:200,headers:{'Content-Type':'application/json'}});
        }
        return nativeFetch.call(this,input,options);
      };
    });
    if(!await button('Ask AI about this bonus').count())await page.locator('.card-h').first().click();
    await button('Ask AI about this bonus').click();
    check('Tracker AI opens for one selected bank',(await page.locator('.bonus-ai-heading').innerText()).includes('E2E Verification Bank')&&await page.evaluate(()=>window.__bonusAITest.calls.length===0));
    check('AI needs no login',await page.getByLabel('Email',{exact:true}).count()===0&&await page.getByLabel('Password',{exact:true}).count()===0);
    for(const label of ['Monthly fee','Waive fees','Direct deposit','Early-close fee','Savings account','Repeat eligibility']){await button(label).click();check('prefill: '+label,(await page.locator('#bonus-ai-question').inputValue()).length>20);}
    await button('Can I close?').click();await page.locator('#bonus-ai-send').click();
    await page.locator('#bonus-ai-answer p').first().waitFor();
    check('AI closure decision uses tracker gates',(await page.locator('.bonus-ai-verdict').innerText())==='Ready — tracker checks passed');
    check('AI explains a concrete next step',(await page.locator('.bonus-ai-next-step').innerText()).includes('companion accounts'));
    check('common answers do not send facts',await page.evaluate(()=>window.__bonusAITest.calls.length===0&&window.__bonusAITest.authCalls===0));
    await button('Ask AI for more').click();await page.getByText('AI explanation · check the cited saved facts.',{exact:true}).waitFor();
    const {packet:aiPacket,authorization:aiAuthorization,credentials:aiCredentials}=await page.evaluate(()=>window.__bonusAITest.calls[0]);
    check('AI sends no owner token or cookies',!aiAuthorization&&aiCredentials==='omit'&&aiPacket.question.includes('closure'));
    check('AI uses canonical saved facts without account identifiers or notes',aiPacket.facts.some(f=>f.id==='close_gate')&&aiPacket.facts.some(f=>f.id==='close_date')&&!JSON.stringify(aiPacket).includes(id)&&!JSON.stringify(aiPacket).includes('Synthetic verification record only'));
    await page.locator('#bonus-ai-answer summary').click();
    check('AI displays cited saved facts',(await page.locator('#bonus-ai-answer').innerText()).includes('Tracker closure checks'));
    check('AI modal fits narrow mobile viewport',await page.locator('.bonus-ai-modal').evaluate(e=>e.getBoundingClientRect().width<=window.innerWidth));
    await page.screenshot({path:path.join(output,name+'-tracker-ai.png')});
    await page.evaluate(()=>window.__bonusAITest.response={answer:'Unsupported response',factIds:[],missing:[{text:'Malformed'}]});
    await button('Ask AI for more').click();await page.getByText('AI returned an unsupported answer.',{exact:true}).waitFor();
    check('malformed AI output is rejected',await page.locator('.bonus-ai-verdict').count()===0);
    await page.evaluate(()=>window.__bonusAITest.fail=true);await button('Ask AI for more').click();await page.getByText('AI is busy. Try again later.',{exact:true}).waitFor();
    check('AI rate limit is handled without repeated requests',await page.evaluate(()=>window.__bonusAITest.calls.length===3));
    await button('Monthly fee').click();await page.locator('#bonus-ai-send').click();
    check('saved-rule answers work after AI failure',await page.getByText('Answered from saved rules on this device.',{exact:true}).count()===1&&await page.evaluate(()=>window.__bonusAITest.calls.length===3));
    await page.getByRole('button',{name:'Close AI',exact:true}).click();
    check('asking AI preserves all saved account data',await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===storedBeforeRadar);
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
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      for(const name of ['Tracker','Bank Bonuses','Tax','Datapoints','T&C Archive']){
        await button(name).click();
        check(name+' fits '+width+'px mobile width',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
        check(name+' navigation starts at the top at '+width+'px',await page.locator('.scroll').evaluate(e=>e.scrollTop===0));
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
    await page.evaluate(()=>{entries=window.__cardTextOriginal;delete window.__cardTextOriginal;R();});
    await page.setViewportSize({width:390,height:844});
    check('card layout leaves saved records unchanged',await page.evaluate(()=>localStorage.getItem('bt_e_v4'))===storedBeforeRadar);
    await page.evaluate(async()=>{await navigator.serviceWorker.ready});
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    // WebKit's protocol offline mode can abort navigation before its service
    // worker fallback runs. Remove the origin instead to exercise real failed
    // network fetches; Chromium/Firefox also test protocol offline mode.
    if(name==='webkit')serverUnavailable=true;else await context.setOffline(true);
    await page.reload();await page.getByText('BonusTracker',{exact:false}).first().waitFor();
    check(name==='webkit'?'network-loss reload preserves account':'offline reload preserves account',(await record()).id===id);
    serverUnavailable=false;await context.setOffline(false);
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
