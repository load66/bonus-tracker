'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,firefox,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),output=process.env.BT_BROWSER_RESULTS||'/tmp/simplefin-browser-results';
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const p=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!p.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',mime[path.extname(p)]||'text/plain');res.end(await fs.readFile(p));}catch{res.writeHead(404);res.end();}});
const account={key:'a'.repeat(64),name:'Checking <img src=x>',bank:'Synthetic Bank',currency:'USD',balance:'200',balanceDate:1792134000};
const {fixture}=require('./fixtures/financial-rules.cjs');
const opened='2026-10-01',entry={...fixture(),id:'synthetic-cycle',bank:'Synthetic Bank',accountType:'personal',opened};
const seed=()=>({configured:true,connected:true,evidenceOnly:true,status:'connected',accounts:[account],mappings:{},transactions:{},monitoredAccounts:[account.key],lastSuccess:1792134000,nextSyncAt:1792220400});
(async()=>{
 await fs.mkdir(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{for(const [name,engine]of require('./browser-select.cjs')({chromium,firefox,webkit})){
  const browser=await engine.launch();try{
   const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},timezoneId:'America/Chicago'});const page=await context.newPage();let state=seed(),requests=[],errors=[],discoveryMode='found',saveFailure=false;page.on('pageerror',e=>errors.push(e.message));
   // During production smoke, NEVER send synthetic session headers to any live API.
      if(process.env.BT_BROWSER_SITE_URL)await page.route('https://api-production-00f74.up.railway.app/**',route=>route.abort());
      await page.route('https://api-production-00f74.up.railway.app/api/bonus-tracker/simplefin**',async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method();requests.push({method,path:url.pathname,body:req.postData()});
    if(url.pathname.endsWith('/discover-now')){
      if(discoveryMode==='budget'){
        await route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({detail:'Daily limit reached; updates resume at 1792220400.'})});
        return;
      }
      const other={key:(discoveryMode==='found_second'?'c':'b').repeat(64),name:'Savings <script>unsafe</script>',bank:'Newly Added CU',currency:'USD',balance:'100',balanceDate:1792134000,discovered:true};
      if(['found','found_second'].includes(discoveryMode)&&!state.accounts.some(a=>a.key===other.key))state.accounts.push(other);
      const found=['found','found_second'].includes(discoveryMode);
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...state,found,
        newAccounts:found?1:0,bank:found?'Newly Added CU':'',
        discoveredAccounts:found?[other]:[],nextRetryAt:1792134090,budgetRemaining:found?23:22})});
      return;
    }
    if(url.pathname.endsWith('/first-sync')){
      const accounts=req.postDataJSON().accounts;
      await route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({...state,syncStatus:accounts.length?'synced':'not_enabled',budgetRemaining:22})});
      return;
    }
    if(url.pathname.endsWith('/discover')){
      const other={key:'b'.repeat(64),name:'Savings',bank:'Newly Added CU',currency:'USD',balance:'100',balanceDate:1792134000};
      if(!state.accounts.some(a=>a.key===other.key))state.accounts.push(other);
      state.monitoredAccounts=state.accounts.map(a=>a.key);
    }
    if(url.pathname.endsWith('/selection')){state.mappings=req.postDataJSON().mappings;}
    if(url.pathname.endsWith('/monitoring')){
      if(saveFailure){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Mock save unavailable'})});return;}
      state.monitoredAccounts=req.postDataJSON().accounts;
      if(!state.monitoredAccounts.length&&!Object.keys(state.mappings).length)state.transactions={};
    }
    if(url.pathname.endsWith('/sync')){state.transactions[account.key]={t1:{id:'t1',posted:1792133900,amount:'200',description:'Promotional Bonus <script>alert(1)</script>',kind:'possible_bonus',observedAt:1792134000},t2:{id:'t2',posted:1792133800,amount:'-20',description:'Coffee',kind:'withdrawal',observedAt:1792134000},t3:{id:'t3',posted:1792133700,amount:'40',description:'Transfer from savings',kind:'other_deposit',observedAt:1792134000}};}
    if(method==='DELETE')state={configured:true,connected:false,evidenceOnly:true};
    if(url.pathname.endsWith('/reconnect')){state.status='connected';delete state.error;state.nextSyncAt=0;}
    else if(url.pathname.endsWith('/connect'))state=seed();
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(state)});
   });
   const plaidCalls=[];
   await page.route('https://api-production-00f74.up.railway.app/api/bonus-tracker/plaid**',async route=>{
     plaidCalls.push(route.request().method()+' '+new URL(route.request().url()).pathname);
     await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({provider:'plaid',priority:'fallback',configured:false,used:null,limit:10})});
   });
   await page.addInitScript(({entry})=>{const RealDate=Date,now=Date.parse('2026-10-16T07:00:00Z');window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};localStorage.setItem('bt_e_v4',JSON.stringify([entry]));localStorage.setItem('bonus-ai-auth',JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_at:4102444800}));},{entry});
   await page.goto(process.env.BT_BROWSER_SITE_URL||'http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>typeof btOpenBankSync==='function');
   const before=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
   const cycleId=await page.evaluate(()=>entries[0].id);assert.ok(cycleId,'Loaded tracker cycle must have an ID');
   await page.evaluate(()=>btOpenBankSync());const dialog=page.getByRole('dialog',{name:'Financial accounts'});await dialog.getByText('Connection active',{exact:true}).waitFor();
   assert.equal(await dialog.locator('img').count(),0);
   const accountSearch=dialog.getByRole('searchbox',{name:'Search connected accounts'});
   await accountSearch.fill('no matching institution');
   assert.equal(await dialog.getByLabel('Monitor transactions (read-only)',{exact:true}).count(),0);
   await accountSearch.fill('Synthetic Bank');
   assert.equal(await dialog.getByLabel('Monitor transactions (read-only)',{exact:true}).count(),0);
   await dialog.getByRole('button',{name:'Hide balances',exact:true}).click();await dialog.getByText('Balance: ••••••',{exact:false}).waitFor();
   await dialog.getByRole('button',{name:'Show balances',exact:true}).click();await dialog.locator('p').filter({hasText:/Balance:\s*.*200/}).first().waitFor();
   assert.equal(await dialog.getByLabel('Bonus product (verified terms)',{exact:true}).isDisabled(),true,'unlinked account cannot select a promotion product');
   assert.deepEqual(state.monitoredAccounts,[account.key],'Connected accounts are enrolled automatically');
   assert.equal(requests.some(r=>r.path.endsWith('/monitoring')),false,
     'No manual monitoring request is required');
   assert.equal(await dialog.getByLabel('Bonus product (verified terms)',{exact:true}).isDisabled(),true,'unverified product choices must stay disabled after async form operations');
   await dialog.getByRole('button',{name:'Check for transactions',exact:true}).click();await dialog.getByText('Possible bonus · review',{exact:true}).waitFor();
   await dialog.getByText('Observed credits',{exact:true}).waitFor();
   await dialog.getByText('Bonus candidates',{exact:true}).waitFor();
   const activity=dialog.locator('.bank-sync-summary-grid');
   await activity.getByText('Observed credits',{exact:true}).locator('..').getByText(/240/).waitFor();
   await activity.getByText('Observed debits',{exact:true}).locator('..').getByText(/20/).waitFor();
   await activity.getByText('Posted transactions',{exact:true}).locator('..').getByText('3',{exact:true}).waitFor();
   await dialog.getByText('Net observed movement:',{exact:false}).filter({hasText:/220/}).waitFor();
   await dialog.getByRole('button',{name:'Hide balances',exact:true}).click();
   assert.equal(await activity.locator('strong').first().innerText(),'••••••','observation amounts should be hidden in privacy mode');
   assert.equal((await dialog.locator('.bank-sync-transaction p').first().innerText()).includes('••••••'),true,'individual transaction amounts should be hidden in privacy mode');
   await dialog.getByRole('button',{name:'Show balances',exact:true}).click();
   await dialog.getByText('These are not verified income, expenses or net worth.',{exact:false}).waitFor();
   await dialog.getByLabel('Link to bonus (optional)',{exact:true}).selectOption(cycleId);
   assert.equal(await dialog.getByLabel('Bonus product (verified terms)',{exact:true}).isEnabled(),true,'validated promotion products can be selected');
   await dialog.getByLabel('Bonus product (verified terms)',{exact:true}).selectOption('checking');
   await dialog.getByRole('button',{name:'Save account matches',exact:true}).click();await dialog.getByText('Bonus links saved.',{exact:false}).waitFor();
   assert.deepEqual(state.mappings[account.key],{entryId:cycleId,bank:entry.bank,opened,productId:'checking'});
   // An account's first-discovery date is not its opening date. A suggestion
   // requires an explicit second confirmation before any mapping is saved.
   state.mappings={};
   state.accounts[0].firstSeenAt=Date.parse('2026-10-16T00:00:00Z')/1000;
   await dialog.getByRole('button',{name:'Refresh status',exact:true}).click();
   const suggested=dialog.getByRole('button',{name:'Link to Synthetic Bank bonus?'});
   await suggested.waitFor();
   const beforeLinkWrites=requests.filter(r=>r.path.endsWith('/selection')).length;
   await suggested.click();
   let openingCheck=page.getByRole('dialog',{name:'Verify the bonus account'});
   await openingCheck.getByText('first discovered',{exact:false}).waitFor();
   await openingCheck.getByRole('button',{name:'Not sure — cancel'}).click();
   assert.equal(requests.filter(r=>r.path.endsWith('/selection')).length,beforeLinkWrites,
     'cancelled suggestion cannot write a bonus mapping');
   await suggested.click();
   openingCheck=page.getByRole('dialog',{name:'Verify the bonus account'});
   await openingCheck.getByRole('button',{name:'I verified the opening date'}).click();
   await dialog.getByText('Confirmed bonus link saved.',{exact:false}).waitFor();
   assert.deepEqual(state.mappings[account.key],{entryId:cycleId,bank:entry.bank,opened},
     'link after date review retains the exact bank/opened/entryId triplet');
   await dialog.getByLabel('Bonus product (verified terms)',{exact:true}).selectOption('checking');
   await dialog.getByRole('button',{name:'Save account matches',exact:true}).click();
   assert.deepEqual(state.mappings[account.key],{entryId:cycleId,bank:entry.bank,opened,productId:'checking'});

   const bridge=dialog.getByRole('link',{name:'Add bank in SimpleFIN',exact:false});
   assert.equal(await bridge.getAttribute('href'),'https://beta-bridge.simplefin.org/');
   assert.equal(await bridge.getAttribute('target'),'_blank');
   assert.equal(await bridge.getAttribute('rel'),'noopener noreferrer');
   await dialog.getByText('Already authorized a bank?',{exact:false}).waitFor();
   assert.equal(requests.some(r=>r.path.endsWith('/discover')),false,'Add bank provider link must not silently sync data or alter accounts');
   await dialog.getByRole('button',{name:'Add bank',exact:true}).click();
   await dialog.getByText('SECURE BANK CONNECTION',{exact:true}).waitFor();
   assert.equal(await dialog.locator('details.bank-connect-fallback').count(),0,
     'Adding a SimpleFIN institution must not offer Plaid or consume a Trial Item');
   assert.deepEqual(plaidCalls.filter(c=>c.includes('link-token')),[],
     'Adding through SimpleFIN must not consume a Plaid Trial Item');
   assert.equal(await dialog.locator('input[type=password]').count(),0);
   assert.equal(await dialog.locator('input[type=tel]').count(),0);
   assert.equal(await dialog.getByText('1 · Sign in to SimpleFIN').count(),1);
   assert.equal(await dialog.getByText('2 · Add your bank').count(),1);
   assert.equal(await dialog.getByText('3 · Come back to this app').count(),1);
   await page.evaluate(()=>{window.open=(url,target,features)=>{
     window.__openedBankLink={url,target,features};return null;
   }});
   await dialog.getByRole('button',{name:'Open SimpleFIN ↗'}).click();
   const openedBridgeInfo=await page.evaluate(()=>window.__openedBankLink);
   assert.deepEqual(openedBridgeInfo,{url:'https://bridge.simplefin.org/',target:'_blank',features:'noopener'});
   await page.evaluate(()=>{
     window.dispatchEvent(new Event('blur'));
     window.dispatchEvent(new Event('focus'));
     document.dispatchEvent(new Event('visibilitychange'));
   });
   await dialog.getByText('Found Newly Added CU · 1 account').waitFor();
   assert.equal(requests.filter(r=>r.path.endsWith('/discover-now')).length,1,
     'Blur, focus and visibilitychange count as exactly one return-to-app discovery');
   assert.equal(await dialog.locator('script').count(),0,'Bank provider names must remain escaped');
   const newToggle=dialog.locator('.bank-connect-account-option input');
   assert.equal(await newToggle.isChecked(),true,'Newly discovered draft Sync toggles start ON');
   assert.equal(state.monitoredAccounts.includes('b'.repeat(64)),false,
     'Discovery cannot silently enable monitoring before Save');
   await dialog.getByRole('button',{name:'Save',exact:true}).click();
   await dialog.getByText('First transactions synced.').waitFor();
   assert.equal(requests.filter(r=>r.path.endsWith('/first-sync')).length,1,
     'Exactly one first transaction request is made after explicit Save');
   assert.deepEqual(new Set(state.monitoredAccounts),new Set([account.key,'b'.repeat(64)]));
   assert.deepEqual(state.mappings[account.key],{entryId:cycleId,bank:entry.bank,opened,productId:'checking'});
   assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before);
   await dialog.getByRole('button',{name:'Back to connected accounts'}).click();
   await dialog.locator('h4').getByText('Newly Added CU · Savings',{exact:true}).first().waitFor();
   // A later add-bank attempt may find nothing. Manual re-check is one request;
   // quota exhaustion ends polling immediately rather than spending more calls.
   discoveryMode='not_found';
   await dialog.getByRole('button',{name:'Add bank',exact:true}).click();
   await dialog.getByRole('button',{name:'Open SimpleFIN ↗'}).click();
   await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'))});
   await dialog.getByText('SimpleFIN is still connecting your bank — we’ll check again.').waitFor();
   const beforeManual=requests.filter(r=>r.path.endsWith('/discover-now')).length;
   await dialog.getByRole('button',{name:'Check again'}).click();
   await dialog.getByText('SimpleFIN is still connecting your bank — we’ll check again.').waitFor();
   assert.equal(requests.filter(r=>r.path.endsWith('/discover-now')).length,beforeManual+1);
   discoveryMode='budget';
   await dialog.getByRole('button',{name:'Check again'}).click();
   await dialog.getByText('Daily limit reached. Updates resume at', {exact:false}).waitFor();
   const stopped=requests.filter(r=>r.path.endsWith('/discover-now')).length;
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await page.waitForTimeout(350);
   assert.equal(requests.filter(r=>r.path.endsWith('/discover-now')).length,stopped,
     '429 stops every return-to-app follow-up until another flow begins');
   await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
   assert.equal(requests.filter(r=>r.path.endsWith('/first-sync')).length,1,
     'Cancel must not start a transaction sync');
   assert.deepEqual(new Set(state.monitoredAccounts),new Set([account.key,'b'.repeat(64)]));

   // Failed Save must leave the selected draft visible, unchanged in storage,
   // with no false success banner; retrying Save is deliberate.
   discoveryMode='found_second';
   await dialog.getByRole('button',{name:'Add bank',exact:true}).click();
   await dialog.getByRole('button',{name:'Open SimpleFIN ↗'}).click();
   await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'))});
   await dialog.locator('.bank-connect-account-option input').waitFor();
   const draft=dialog.locator('.bank-connect-account-option input');
   assert.equal(await draft.isChecked(),true);
   saveFailure=true;
   await dialog.getByRole('button',{name:'Save',exact:true}).click();
   await dialog.getByText('Save not confirmed: Mock save unavailable').waitFor();
   assert.equal(await draft.isChecked(),true);
   assert.equal(state.monitoredAccounts.includes('c'.repeat(64)),false);
   saveFailure=false;
   await dialog.getByRole('button',{name:'Save',exact:true}).click();
   await dialog.getByText('First transactions synced.').waitFor();
   assert.equal(state.monitoredAccounts.includes('c'.repeat(64)),true);
   assert.equal(requests.filter(r=>r.path.endsWith('/first-sync')).length,2);
   await dialog.getByRole('button',{name:'Back to connected accounts'}).click();
   assert.equal(await dialog.locator('script').count(),0);
   for(const width of [320,375,390,430]){
    await page.setViewportSize({width,height:760});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const geometry=await dialog.evaluate(d=>{const m=d.querySelector('.bank-sync-modal'),b=d.querySelector('.bank-sync-body');return {modalWidth:m.getBoundingClientRect().width,scrollWidth:b.scrollWidth,clientWidth:b.clientWidth,footerBottom:d.querySelector('footer').getBoundingClientRect().bottom,width:innerWidth,height:innerHeight,overflow:[...b.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>b.getBoundingClientRect().right+1).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,90)}))};});
    await page.screenshot({path:path.join(output,name+'-simplefin-'+width+'.png')});
    assert.ok(geometry.modalWidth<=geometry.width&&geometry.scrollWidth<=geometry.clientWidth+1&&geometry.footerBottom<=geometry.height,name+' layout at '+width+': '+JSON.stringify(geometry));
    await dialog.getByText('Possible bonus · review',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,name+'-simplefin-activity-'+width+'.png')});
   }
   state.status='attention';state.error='SimpleFIN access was rejected.';
   await dialog.getByRole('button',{name:'Refresh status',exact:true}).click();
   await dialog.getByText('Connection needs attention',{exact:true}).waitFor();
   const reconnect=dialog.getByText('Reconnect SimpleFIN',{exact:true});await reconnect.click();
   await dialog.getByLabel('New SimpleFIN setup token',{exact:true}).fill('synthetic-replacement-token');
   await dialog.getByRole('button',{name:'Reconnect securely',exact:true}).click();
   await dialog.getByText('Connection active',{exact:true}).waitFor();
   assert.deepEqual(state.mappings[account.key],{entryId:cycleId,bank:entry.bank,opened,productId:'checking'},'reconnect retains verified product association');
   assert.deepEqual(new Set(state.monitoredAccounts),new Set([account.key,'b'.repeat(64)]),'reconnect retains automatic monitoring for both banks');
   assert.ok(requests.some(r=>r.path.endsWith('/reconnect')&&JSON.parse(r.body).setup_token==='synthetic-replacement-token'));
   assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('synthetic-replacement-token')),false);
   assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before);
   await dialog.getByRole('button',{name:'Done',exact:true}).click();
   state={configured:true,connected:false,evidenceOnly:true};await page.evaluate(()=>btOpenBankSync());await page.getByRole('button',{name:'Guided secure bank connection'}).waitFor();
   await page.getByRole('button',{name:'Guided secure bank connection'}).click();
   await page.getByText('Connect your first bank',{exact:true}).waitFor();
   const firstBankLink=page.getByRole('link',{name:'Open SimpleFIN'});
   assert.equal(await firstBankLink.getAttribute('href'),'https://bridge.simplefin.org/');
   assert.equal(await firstBankLink.getAttribute('target'),'_blank');
   const tokenLink=page.getByRole('link',{name:'Get my SimpleFIN setup token'});
   assert.equal(await tokenLink.getAttribute('href'),'https://bridge.simplefin.org/simplefin/create');
   assert.equal(await page.locator('.bank-connect-flow input[type=password]').count(),0,'first-bank onboarding must not collect bank credentials');
   await page.getByLabel('One-time SimpleFIN setup token',{exact:true}).fill('synthetic-one-time-token');
   await page.getByRole('button',{name:'Connect my accounts securely',exact:true}).click();
   await page.getByText('Connected. 1 account found. Transactions sync automatically.',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Review account settings'}).click();
   await page.getByText('Connection active',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('synthetic-one-time-token')),false);
   assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before);
   assert.ok(requests.some(r=>r.path.endsWith('/connect')&&JSON.parse(r.body).setup_token==='synthetic-one-time-token'));
   // Cancellation must never remove the connection or saved tracker campaign.
   await page.getByRole('button',{name:'Disconnect and remove sync data'}).click();
   let confirmation=page.getByRole('dialog',{name:'Disconnect SimpleFIN?'});
   await confirmation.getByRole('button',{name:'Cancel',exact:true}).click();
   assert.equal(state.connected,true,'cancelled disconnect must preserve connection');
   assert.equal(requests.some(r=>r.method==='DELETE'),false,'cancelled disconnect must not call the backend');
   // Only the explicit second confirmation may disconnect SimpleFIN.
   await page.getByRole('button',{name:'Disconnect and remove sync data'}).click();
   confirmation=page.getByRole('dialog',{name:'Disconnect SimpleFIN?'});
   await confirmation.getByRole('button',{name:'Disconnect',exact:true}).click();
   await page.getByText('Connect a financial institution',{exact:true}).waitFor();
   assert.equal(state.connected,false,'confirmed disconnect must change connection state');
   assert.equal(requests.filter(r=>r.method==='DELETE').length,1,'disconnect must send one authenticated DELETE');
   assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before,'disconnect must preserve tracker entry history');
   // A successful Plaid hosted-Link exchange must leave a visible confirmation
   // in the bank wizard footer even if its own embedded panel redraws.
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bt:plaid-bank-connected',{
     detail:{status:'ready',count:2}
   })));
   await page.locator('#bank-sync-message').getByText('Plaid bank connected · 2 accounts found.',{exact:false}).waitFor();
   assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before,
     'Connection result never changes a Tracker milestone');
   assert.deepEqual(errors,[]);console.log(name+': SimpleFIN connect, sync, matches, reconnection, cancel/confirm disconnect, privacy and mobile checks passed');
  }finally{await browser.close();}
 }}finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
