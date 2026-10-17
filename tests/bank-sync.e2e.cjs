'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,firefox,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),output=process.env.BT_BROWSER_RESULTS||'/tmp/simplefin-browser-results';
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const p=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!p.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',mime[path.extname(p)]||'text/plain');res.end(await fs.readFile(p));}catch{res.writeHead(404);res.end();}});
const account={key:'a'.repeat(64),name:'Checking <img src=x>',bank:'Synthetic Bank',currency:'USD',balance:'200',balanceDate:1792134000};
const {fixture}=require('./fixtures/financial-rules.cjs');
const opened='2026-10-01',entry={...fixture(),id:'synthetic-cycle',bank:'Synthetic Bank',accountType:'personal',opened};
const seed=()=>({configured:true,connected:true,evidenceOnly:true,status:'connected',accounts:[account],mappings:{},transactions:{},monitoredAccounts:[account.key],lastSuccess:1792134000,nextSyncAt:1792220400,lastAccountDiscoveryAt:1792134000});
(async()=>{
 await fs.mkdir(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{for(const [name,engine]of require('./browser-select.cjs')({chromium,firefox,webkit})){
  const browser=await engine.launch();try{
   const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},timezoneId:'America/Chicago'});const page=await context.newPage();let state=seed(),requests=[],errors=[],discoveryMode='found',saveFailure=false;page.on('pageerror',e=>errors.push(e.message));
   // During production smoke, NEVER send synthetic session headers to any live API.
      if(process.env.BT_BROWSER_SITE_URL)await page.route('https://api-production-00f74.up.railway.app/**',route=>route.abort());
      await page.route('https://api-production-00f74.up.railway.app/api/bonus-tracker/simplefin**',async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method();requests.push({method,path:url.pathname,body:req.postData()});
    if(url.pathname.endsWith('/auto-refresh')){
      if(discoveryMode==='budget'){
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
          ...state,balanceRefreshErrorKind:429,budgetRemaining:4,
          budgetResetAt:1792220400
        })});return;
      }
      const newBanks=discoveryMode==='found'?
        ['b','c','d','e'].map((letter,i)=>({
          key:letter.repeat(64),name:'Savings <script>unsafe</script>',
          bank:'Example Institution '+(i+1),currency:'USD',
          balance:'100',balanceDate:1792134000
        })):[];
      let count=0;
      for(const bank of newBanks){
        if(state.accounts.some(a=>a.key===bank.key))continue;
        count++;state.accounts.push(bank);
        state.monitoredAccounts.push(bank.key);
        state.transactions[bank.key]={
          ['t'+bank.key.slice(0,1)]:{
            id:'t'+bank.key.slice(0,1),amount:'-10.25',
            description:'Synthetic transaction',posted:1792133900,pending:false
          }
        };
      }
      state.lastAccountDiscoveryAt=1792134000;
      if(count)state.lastNewAccountsAt=1792134000;
      state.newAccountsLastSeenCount=count;
      state.balanceRefreshErrorKind=null;
      await route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({...state,budgetRemaining:22})});return;
    }
    if(url.pathname.endsWith('/first-sync')||url.pathname.endsWith('/discover-now')){
      assert.fail('Zero-click flow must never use manual first-sync or discover endpoints');
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

   // No Discover button, no Sync toggle, no Save or provider approval.
   assert.equal(await dialog.getByRole('button',{name:'Discover accounts'}).count(),0);
   assert.equal(await dialog.getByRole('button',{name:'Check again'}).count(),0);
   assert.deepEqual(plaidCalls.filter(c=>c.includes('link-token')),[]);
   await page.evaluate(()=>{
     window.open=(url,target,features)=>{
       window.__bridgeOpener={url,target,features};
       return null;
     };
   });
   await dialog.getByRole('button',{name:'Add bank in SimpleFIN ↗'}).click();
   assert.deepEqual(await page.evaluate(()=>window.__bridgeOpener),
     {url:'https://bridge.simplefin.org/',target:'_blank',features:'noopener'});
   await page.evaluate(()=>{
     window.dispatchEvent(new Event('blur'));
     window.dispatchEvent(new Event('focus'));
     document.dispatchEvent(new Event('visibilitychange'));
   });
   await dialog.getByText('Automatically connected 4 accounts',{exact:false}).waitFor();
   assert.equal(requests.filter(r=>r.path.endsWith('/auto-refresh')).length,1,
     'Focus+visibility must make exactly one automatic check');
   assert.equal(state.accounts.length,5,'All four newly authorized institutions appear');
   assert.equal(state.monitoredAccounts.length,5,'Every new account is monitored without user Save');
   assert.equal(Object.keys(state.transactions).length,5,'First synthetic transaction activity is available automatically');
   assert.equal(await dialog.locator('script').count(),0,'Provider text is escaped');
   for(const bank of state.accounts.slice(1))
     await dialog.getByText(new RegExp(bank.bank+' · Savings')).first().waitFor();
   assert.equal(requests.filter(r=>r.path.endsWith('/monitoring')).length,0);
   assert.equal(requests.filter(r=>r.path.endsWith('/first-sync')).length,0);
   assert.equal(requests.filter(r=>r.path.endsWith('/discover')).length,0);
   assert.deepEqual(state.mappings[account.key],
     {entryId:cycleId,bank:entry.bank,opened,productId:'checking'});
   assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before,
     'Tracker history remains unchanged after automatic onboarding');

   discoveryMode='not_found';
   await dialog.getByRole('button',{name:'Add bank in SimpleFIN ↗'}).click();
   await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'))});
   await dialog.getByText('No additional accounts available yet',{exact:false}).waitFor();
   const automaticCount=requests.filter(r=>r.path.endsWith('/auto-refresh')).length;
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await page.waitForTimeout(350);
   assert.equal(requests.filter(r=>r.path.endsWith('/auto-refresh')).length,automaticCount,
     'No duplicated automatic request from two focus events');

   discoveryMode='budget';
   await dialog.getByRole('button',{name:'Add bank in SimpleFIN ↗'}).click();
   await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'))});
   await dialog.getByText('SimpleFIN request limit reached',{exact:false}).waitFor();
   const quotaCalls=requests.filter(r=>r.path.endsWith('/auto-refresh')).length;
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await page.waitForTimeout(350);
   assert.equal(requests.filter(r=>r.path.endsWith('/auto-refresh')).length,quotaCalls,
     'Quota exhaustion stops automatic retries');
   await dialog.getByRole('button',{name:'Done',exact:true}).click();
   await page.evaluate(()=>btOpenBankSync());
   await dialog.getByText('Connection active',{exact:true}).waitFor();
   assert.equal(state.accounts.length,5,'Closing the flow never forgets linked institutions');
   assert.equal(await dialog.getByRole('button',{name:'Discover accounts'}).count(),0);
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
   assert.deepEqual(new Set(state.monitoredAccounts),new Set([account.key,...['b','c','d','e'].map(c=>c.repeat(64))]),'reconnect retains saved monitoring for all three linked accounts');
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
