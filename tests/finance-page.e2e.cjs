'use strict';
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,firefox,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),output=process.env.BT_BROWSER_RESULTS||'/tmp/finance-page-browser-results';
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  try{const name=new URL(req.url,'http://localhost').pathname,p=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!p.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',mime[path.extname(p)]||'text/plain');res.end(await fs.readFile(p));
  }catch{res.writeHead(404);res.end()}
});
const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64),T1='d'.repeat(64),T2='e'.repeat(64),T3='f'.repeat(64),NOW=1792134000;
const base=()=>({
  configured:true,connected:true,status:'connected',evidenceOnly:true,lastSuccess:NOW,nextSyncAt:NOW+86400,
  accounts:[
    {key:A,bank:'Synthetic CU',name:'Checking <img src=x>',currency:'USD',balance:'1250.50',availableBalance:'1200.50',balanceDate:NOW-400},
    {key:B,bank:'Other Credit Union',name:'Credit Card',currency:'USD',balance:'200.00',availableBalance:'800.00',balanceDate:NOW-300},
    {key:C,bank:'Overseas Bank',name:'Brokerage',currency:'EUR',balance:'500',availableBalance:null,balanceDate:NOW}
  ],
  accountProfiles:{
    [A]:{kind:'checking',balanceMode:'asset',order:0},
    [B]:{kind:'credit_card',balanceMode:'liability',order:1},
    [C]:{kind:'brokerage',balanceMode:'exclude',order:2}
  },
  monitoredAccounts:[A],mappings:{},balanceHistory:{[A]:[{at:NOW-400,balance:'1250.50',currency:'USD'}]},
  transactions:{[A]:{
    [T1]:{id:T1,amount:'200.00',posted:NOW-60,pending:false,kind:'other_deposit',description:'Employer Direct Deposit',merchant:'Employer',category:'income',categorySource:'automatic',confidence:'high',signals:['possible_direct_deposit']},
    [T2]:{id:T2,amount:'-15.00',posted:NOW-90,pending:false,kind:'withdrawal',description:'Purchase <script>alert(1)</script>',merchant:'Coffee Shop',category:'dining',categorySource:'automatic',confidence:'medium',signals:[]},
    [T3]:{id:T3,amount:'-10.00',posted:NOW-120,pending:false,kind:'withdrawal',description:'Unknown debit',merchant:'Unknown',category:'unreviewed',categorySource:'automatic',confidence:'low',signals:[]}
  }}
});
(async()=>{
  await fs.mkdir(output,{recursive:true});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  try{for(const [name,engine] of Object.entries({chromium,firefox,webkit})){
    const browser=await engine.launch();try{
      const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},timezoneId:'America/Chicago'});
      const page=await context.newPage(),errors=[],requests=[];let state=base(),rejectCategoryOnce=true,rejectAccountSaveOnce=true,redrawOnSuccessfulSave=name==='webkit';page.on('pageerror',e=>errors.push(e.message));
      // During production smoke, NEVER send synthetic session headers to any live API.
      if(process.env.BT_BROWSER_SITE_URL)await page.route('https://api-production-00f74.up.railway.app/**',route=>route.abort());
      await page.route('https://api-production-00f74.up.railway.app/api/bonus-tracker/simplefin**',async route=>{
        const req=route.request(),url=new URL(req.url()),body=req.postDataJSON?.()||{};requests.push({path:url.pathname,method:req.method(),body});
        if(url.pathname.endsWith('/transaction-review')&&rejectCategoryOnce){
          rejectCategoryOnce=false;
          await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Synthetic category save temporarily unavailable.'})});
          return;
        }
        if(url.pathname.endsWith('/account-profiles')&&rejectAccountSaveOnce){
          rejectAccountSaveOnce=false;
          await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Synthetic account save temporarily unavailable.'})});
          return;
        }
        if(url.pathname.endsWith('/monitoring'))state.monitoredAccounts=body.accounts;
        if(url.pathname.endsWith('/transaction-review'))state.transactions[body.account][body.transaction].category=body.category,state.transactions[body.account][body.transaction].categorySource=body.category==='unreviewed'?'automatic':'user';
        if(url.pathname.endsWith('/account-profiles')){
          state.accountProfiles=body.profiles;
          if(redrawOnSuccessfulSave){
            redrawOnSuccessfulSave=false;
            // Simulate a normal same-owner cloud/UI redraw while the write
            // is in flight, before the accepted response is delivered.
            await page.evaluate(()=>window.btRefreshFinancesPage?.());
          }
        }
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(state)});
      });
      const plaidState=base();plaidState.accounts=[];plaidState.lastSuccess=null;plaidState.nextSyncAt=0;
      plaidState.transactions={[A]:{'plaid-income':{id:'plaid-income',amount:'50.00',posted:NOW-180,pending:false,
        kind:'other_deposit',description:'X Money synthetic ACH bonus',merchant:'X Money Bonus',
        category:'income',categorySource:'user',confidence:'high',signals:['possible_bonus']}}};
      let plaidDiscoveries=0;
      await page.route('https://api-production-00f74.up.railway.app/api/bonus-tracker/plaid**',async route=>{
        const req=route.request(),url=new URL(req.url());
        const body=req.postDataJSON?.()||{};requests.push({path:url.pathname,method:req.method(),body});
        if(url.pathname.endsWith('/transaction-review')){
          plaidState.transactions[body.account][body.transaction].category=body.category;
          plaidState.transactions[body.account][body.transaction].categorySource='user';
        }
        if(url.pathname.endsWith('/monitoring'))plaidState.monitoredAccounts=body.accounts;
        if(url.pathname.endsWith('/accounts/items/9999999999999999999999999999999999999999999999999999999999999999')&&req.method()==='DELETE'){
          plaidState.connected=false;plaidState.accounts=[];plaidState.transactions={};
          plaidState.monitoredAccounts=[];
          await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({disconnected:true})});
          return;
        }
        if(url.pathname.endsWith('/accounts/sync')){
          plaidDiscoveries++;
          plaidState.accounts=[{...base().accounts[0],bank:'X Money',name:'X Money Checking',connectionHandle:'9999999999999999999999999999999999999999999999999999999999999999'}];
          plaidState.lastSuccess=NOW;
        }
        const result=url.pathname.includes('/accounts')?plaidState:{provider:'plaid',priority:'fallback',configured:false,used:null,limit:10};
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
      });
      await page.addInitScript(()=>{
        const RealDate=Date,now=Date.parse('2026-10-16T07:00:00Z');
        window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};
        // Legacy hide preference must no longer force amounts off on startup.
        localStorage.setItem('bt_finance_hide_amounts','true');
        localStorage.setItem('bt_e_v4','[]');localStorage.setItem('bonus-ai-auth',JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_at:4102444800}));
      });
      await page.goto(process.env.BT_BROWSER_SITE_URL||'http://127.0.0.1:'+server.address().port+'/');
      // Cloud startup can redraw the root while the user is first navigating.
      // A redraw is not evidence that the Finance page is unavailable. Check
      // the fully bootstrapped shell and repeat a lost navigation at most twice.
      await page.waitForFunction(()=>typeof window.BTBonusAuth?.connected==='function'&&
        window.BTBonusAuth.connected()&&typeof window.btRefreshFinancesPage==='function',null,{timeout:12000});
      const financeTab=page.getByRole('button',{name:'Finances',exact:true});
      const section=page.getByRole('region',{name:'My finances'});
      let opened=false;
      for(let attempt=0;attempt<3;attempt++){
        await financeTab.click();
        try{
          await section.getByRole('heading',{name:'Finances'}).waitFor({timeout:7000});
          opened=true;break;
        }catch{
          const observed=await section.locator('h2,h3').allTextContents().catch(()=>[]);
          if(observed.some(text=>/sign in to view finances|accounts unavailable|connections unavailable/i.test(text)))
            throw Error(name+' Finances page returned a real connection/auth error: '+observed.join(' | '));
          if(attempt===2){
            const current=await page.locator('.tabs .tb[aria-current="page"]').allTextContents().catch(()=>[]);
            throw Error(name+' Finances tab did not open after startup redraws; current='+current.join('|')+
              '; headings='+observed.join('|')+'; pageerrors='+errors.join(';'));
          }
        }
      }
      assert.ok(opened,name+' Finances navigation must become available after bootstrap');
      assert.equal(await section.locator('img').count(),0,'provider aliases must be text, never HTML');
      // Playwright's filter waits for actual content, unlike immediate text snapshots.
      // Missing money must remain unknown rather than incorrectly becoming $0.00.
      await section.locator('.finance-page-tile strong')
        .filter({hasText:/^\s*—\s*$/}).first().waitFor({state:'visible'});
      await section.locator('.finance-page-count').filter({hasText:'4 accounts'}).waitFor();
      await section.getByRole('heading',{name:'Connected accounts',exact:true}).waitFor();
      await section.getByRole('heading',{name:'Recent transactions',exact:true}).waitFor();
      await section.getByRole('heading',{name:'Spending by category',exact:true}).waitFor();
      assert.equal(await section.locator('.finance-page-donut').count(),1,
        'The Finance Overview has a lightweight accessible category donut');
      assert.ok(!(await section.locator('.finance-page-donut-legend').innerText()).includes('••••••'),
        'Category donut amounts show by default');
      const previews=section.locator('.finance-page-preview-card');
      assert.equal(await previews.count(),2,'Account and transaction previews belong on the Finance home dashboard');
      assert.deepEqual((await section.locator('.finance-page-nav button').allTextContents()).map(t=>t.trim()),
        ['Overview','Transactions','Accounts'],'Only the three financial sections are user-visible');
      assert.equal(await section.locator('.finance-page-bonus-host').count(),0,
        'Bonus evidence workspace remains unmounted while internal evidence handling is retained');
      const accountPreview=await previews.first().innerText();
      assert.ok(accountPreview.includes('X Money')&&accountPreview.includes('Plaid')&&accountPreview.includes('SimpleFIN'),
        'One compact account preview must show banks from both connected sources');
      assert.ok((await previews.nth(1).innerText()).includes('X Money Bonus'),
        'Recent Finance activity must include Plaid transactions');

      // Financial amounts show by default, even when a stale older-version
      // screenshot privacy preference remains in browser storage.
      await section.getByRole('button',{name:'Hide amounts',exact:true}).waitFor();
      assert.notEqual(await section.locator('.finance-page-hero-cash-value').innerText(),'••••••');
      assert.equal(await page.evaluate(()=>localStorage.getItem('bt_finance_hide_amounts')),'true',
        'Screenshot-only visibility must not rewrite the old stored preference');
      await section.getByText('Income',{exact:true}).locator('..').getByText(/250/).waitFor();
      await section.getByText('Expenses',{exact:true}).locator('..').getByText(/15/).waitFor();
      await section.getByText('Net flow',{exact:true}).locator('..').getByText(/235/).waitFor();
      await section.locator('.finance-page-caution')
        .filter({hasText:'Cash Flow is partial'}).first().waitFor({state:'visible'});
      // The awaited visibility assertion above is authoritative; do not reread
      // an asynchronously replaced DOM node in a second non-waiting assertion.
      const before=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
      await section.getByRole('button',{name:'Hide amounts',exact:true}).click();
      assert.equal(await section.locator('.finance-page-hero-cash-value').innerText(),'••••••');
      assert.ok((await section.locator('.finance-page-donut-legend').innerText()).includes('••••••'),
        'Screenshot privacy masks spending breakdown as well as the cash balance');
      await section.getByRole('button',{name:'Show amounts',exact:true}).click();
      assert.notEqual(await section.locator('.finance-page-hero-cash-value').innerText(),'••••••');
      assert.equal(await page.evaluate(()=>localStorage.getItem('bt_finance_hide_amounts')),'true',
        'Temporary toggle does not persist across reloads');
      assert.equal(await section.locator('.finance-page-hero-cash-value').count(),1,
        'Only one Cash total appears in the Finance Overview hero');

      await section.getByRole('button',{name:'Transactions',exact:true}).click();
      await section.getByRole('heading',{name:'Transactions',exact:true}).waitFor();
      assert.equal(await section.locator('script').count(),0,'transaction descriptions remain text');
      assert.ok(await section.locator('.finance-page-transaction-group').count()>=1,
        'Transactions must be grouped under compact date headings');
      assert.equal(await section.locator('.finance-page-transaction .finance-page-field').count(),0,
        'Collapsed transaction rows must not render bulky category forms');
      assert.equal(await section.getByRole('button',{name:'Filters',exact:true}).count(),1,
        'Secondary transaction filters belong behind one compact control');
      const txSearch=section.getByRole('searchbox',{name:'Search transactions'});await txSearch.fill('coffee');
      assert.equal(await section.locator('.finance-page-transaction:visible').count(),1);
      await txSearch.fill('');
      const unknownRow=section.locator('.finance-page-transaction').filter({hasText:'Unknown'});
      await unknownRow.getByRole('button',{name:/Unknown/}).click();
      await section.getByRole('checkbox',{name:'Apply to similar transactions'}).check();
      const category=section.getByLabel('Category for Unknown');await category.selectOption('shopping');
      await section.getByRole('alert').filter({hasText:'Changes were not saved.'}).waitFor();
      assert.ok(requests.some(r=>r.path.endsWith('/transaction-review')&&r.body.applySimilar===true),
        'Opt-in merchant learning must be explicitly transmitted and never enabled by default');
      assert.equal(state.transactions[A][T3].category,'unreviewed','failure must not silently commit category changes');
      await section.getByLabel('Category for Unknown').selectOption('shopping');
      await section.getByText('Confirmed by you',{exact:true}).first().waitFor();
      await section.getByRole('alert').waitFor({state:'hidden'});
      assert.equal(state.transactions[A][T3].category,'shopping','retry must save category');
      assert.ok(requests.some(r=>r.path.endsWith('/transaction-review')&&r.body.category==='shopping'));

      assert.equal(plaidDiscoveries,1,'existing linked Plaid bank must recover its accounts without a new Item');
      assert.equal(requests.some(r=>r.path.endsWith('/link-token')||r.path.endsWith('/exchange')),false,'discovery must never reconnect the bank');
      await section.getByRole('button',{name:'Accounts',exact:true}).click();
      await section.getByRole('heading',{name:'Accounts',exact:true}).waitFor();
      // Merely opening and closing the provider wizard must not trigger an
      // unnecessary Finances reload while the user may be editing categories.
      await page.evaluate(()=>{
        window.__bankWizardRefreshCount=0;
        const original=window.btRefreshFinancesPage;
        window.btRefreshFinancesPage=(...args)=>{window.__bankWizardRefreshCount++;return original?.(...args)};
      });
      const addBank=section.getByRole('button',{name:'Add bank',exact:true});
      await addBank.click();
      const wizard=page.getByRole('dialog',{name:'Financial accounts'});
      await wizard.getByText('SECURE BANK CONNECTION',{exact:true}).waitFor();
      const bridge=wizard.getByRole('link',{name:'Open SimpleFIN'});
      assert.equal(await bridge.getAttribute('href'),'https://beta-bridge.simplefin.org/');
      assert.equal(await bridge.getAttribute('target'),'_blank');
      assert.equal(await bridge.getAttribute('rel'),'noopener noreferrer');
      assert.equal(await wizard.locator('input[type=password]').count(),0,'BonusTracker never collects bank passwords');
      assert.equal(await wizard.locator('input[type=tel]').count(),0,'BonusTracker never collects bank MFA codes');
      await wizard.getByRole('button',{name:'Back to connected accounts'}).click();
      await wizard.getByRole('button',{name:'Done'}).click();
      assert.equal(await page.evaluate(()=>window.__bankWizardRefreshCount),0,
        'Closing an unchanged provider authorization wizard must not refresh or interrupt financial edits');
      await section.getByText('X Money Checking',{exact:true}).waitFor();
      assert.equal(await section.locator('.finance-page-account').count(),4);
      assert.equal(await section.locator('.finance-page-account-settings[open]').count(),0,
        'Account organization controls must stay collapsed until the account row is opened');
      assert.equal(await section.getByRole('button',{name:'Filters',exact:true}).count(),1,
        'Account type filtering belongs behind one compact control');
      assert.equal(await section.getByRole('combobox',{name:'Finance connection source'}).count(),0,
        'The Finance dashboard is unified and must not require a provider switch');
      assert.ok((await section.locator('.finance-page-account-source').allTextContents()).some(t=>t.includes('Plaid')));
      const accountSearch=section.getByRole('searchbox',{name:'Search accounts'});
      await accountSearch.fill('x money');
      assert.equal(await section.locator('.finance-page-account:visible').count(),1);
      await section.getByText('X Money Checking',{exact:true}).waitFor();
      await accountSearch.fill('other credit union');
      assert.equal(await section.locator('.finance-page-account:visible').count(),1);
      await accountSearch.fill('');
      const creditEditor=section.locator('.finance-page-account-editor').filter({hasText:/Credit Card/});
      await creditEditor.locator('summary.finance-page-account').click();
      assert.equal(await creditEditor.getByLabel('Correct account type').count(),0,
        'Account types already known must not require redundant classification');
      await creditEditor.getByLabel('Net worth treatment').selectOption('exclude');
      assert.equal(await creditEditor.getByLabel('Net worth treatment').inputValue(),'exclude');
      await section.getByRole('button',{name:'Save account settings'}).click();
      try{
        await section.getByRole('alert').filter({hasText:'Changes were not saved.'}).waitFor({timeout:12000});
      }catch(e){
        const debug=await section.innerText().catch(()=>'(Finances unmounted)');
        throw Error(name+' failed-save verification: '+JSON.stringify({
          attempts:requests.filter(x=>x.path.endsWith('/account-profiles')),
          creditMode:state.accountProfiles[B]?.balanceMode,
          financeText:debug.slice(0,1500),
          expectedError:String(e.message).slice(0,150)
        }));
      }
      assert.equal(state.accountProfiles[B].balanceMode,'liability','failed account save must leave encrypted server state unchanged');
      assert.equal(await creditEditor.getByLabel('Net worth treatment').inputValue(),'exclude','unsaved draft remains available for retry');
      await Promise.all([
        page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/account-profiles')&&r.request().method()==='PUT'&&r.status()===200),
        section.getByRole('button',{name:'Save account settings'}).click()
      ]);
      await section.getByRole('alert').waitFor({state:'hidden'});
      assert.equal(state.accountProfiles[B].balanceMode,'exclude','successful retry must persist organization');
      assert.equal(redrawOnSuccessfulSave,false,'WebKit must exercise a same-user redraw before successful save response');
      assert.ok(requests.some(r=>r.path.endsWith('/account-profiles')));

      // Hide one SimpleFIN account without removing its bank connection or history.
      const checkingEditor=section.locator('.finance-page-account-editor').filter({hasText:'Checking <img src=x>'});
      await checkingEditor.locator('summary.finance-page-account').click();
      await checkingEditor.getByRole('button',{name:'Hide account from Finances'}).click();
      await Promise.all([
        page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/account-profiles')&&r.status()===200),
        section.getByRole('button',{name:'Save account settings'}).click()
      ]);
      assert.equal(state.accountProfiles[A].hidden,true,'hide must persist as a profile, not a disconnection');
      assert.equal(Object.keys(state.transactions[A]).length,3,'hiding cannot erase source activity');
      await section.getByRole('button',{name:'Hide hidden accounts'}).click();
      assert.equal(await section.locator('.finance-page-account').count(),3);
      await section.getByRole('button',{name:/Show hidden accounts/}).click();
      const restoreDetails=checkingEditor.locator('details.finance-page-account-settings');
      if(!(await restoreDetails.evaluate(e=>e.open)))await checkingEditor.locator('summary.finance-page-account').click();
      await checkingEditor.getByRole('button',{name:'Show account in Finances'}).click();
      await Promise.all([
        page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/account-profiles')&&r.status()===200),
        section.getByRole('button',{name:'Save account settings'}).click()
      ]);
      assert.equal(state.accountProfiles[A].hidden,false,'restoring should reuse the saved account');
      assert.equal(Object.keys(state.transactions[A]).length,3,'original history survives hide and restore');

      for(const target of [['Overview','overview'],['Transactions','transactions'],['Accounts','accounts']]){
        await section.getByRole('button',{name:target[0],exact:true}).click();
        for(const width of [320,390,430]){
          await page.setViewportSize({width,height:760});
          const geometry=await section.evaluate(e=>({window:innerWidth,scroll:e.scrollWidth,box:e.getBoundingClientRect().width}));
          assert.ok(geometry.scroll<=geometry.window+1&&geometry.box<=geometry.window+1,name+' '+target[0]+' overflow at '+width+': '+JSON.stringify(geometry));
          assert.equal(await page.locator('.tabs .tb').count(),6);
          // One atomic snapshot: the root can repaint between an await and a
          // second query, which otherwise measures detached buttons at 0px.
          const navHandle=await page.waitForFunction(()=>{
            const rows=[...document.querySelectorAll('.tabs .tb')];
            if(rows.length!==6)return false;
            const sized=rows.map(e=>({
              title:e.textContent.trim(),height:e.getBoundingClientRect().height,
              minHeight:getComputedStyle(e).minHeight,display:getComputedStyle(e).display
            }));
            return sized.every(x=>x.height>=44)?sized:false;
          },null,{timeout:15000});
          const navSizes=await navHandle.jsonValue();
          assert.ok(navSizes.length===6&&navSizes.every(x=>x.height>=44),
            name+' mobile navigation tap target: '+JSON.stringify(navSizes));
          await page.screenshot({path:path.join(output,name+'-finances-'+target[1]+'-'+width+'.png')});
        }
      }
      await section.getByRole('button',{name:'Manage connections',exact:true}).click();
      await page.getByRole('dialog',{name:'Financial accounts'}).waitFor();await page.getByRole('dialog',{name:'Financial accounts'}).getByRole('button',{name:'Done'}).click();
      await section.getByRole('heading',{name:'Accounts',exact:true}).waitFor();
      await section.getByText('X Money Checking',{exact:true}).waitFor();
      assert.equal(await section.locator('.finance-page-account').count(),4,
        'SimpleFIN and Plaid account cards share the same list');
      const xMoneyEditor=section.locator('.finance-page-account-editor').filter({hasText:/X Money Checking/});
      await xMoneyEditor.locator('summary.finance-page-account').click();
      assert.equal(await xMoneyEditor.getByRole('checkbox').count(),0,
        'Connected banks must not require a manual monitoring toggle');
      assert.equal(requests.some(r=>r.path.endsWith('/plaid/accounts/monitoring')),false,
        'Account settings do not require a separate read-only monitoring request');
      await section.getByRole('button',{name:'Transactions',exact:true}).click();
      await section.getByText('X Money Bonus',{exact:true}).waitFor();
      await section.locator('.finance-page-transaction').filter({hasText:'X Money Bonus'})
        .getByRole('button',{name:/X Money Bonus/}).click();
      assert.equal(await section.getByText('Possible bonus',{exact:true}).count(),0,
        'Bonus-only review badges must not leak into the Finance transaction view');
      assert.equal(await section.getByLabel('Category for X Money Bonus').locator('option[value="bonus"]').count(),0,
        'Bonus category remains in backend data but is not an exposed Finance control');
      await Promise.all([
        page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/plaid/accounts/transaction-review')&&
          r.request().method()==='PUT'&&r.status()===200),
        section.getByLabel('Category for X Money Bonus').selectOption('shopping')
      ]);
      assert.ok(requests.some(r=>r.path.endsWith('/plaid/accounts/transaction-review')&&r.body.account===A&&
        r.body.transaction==='plaid-income'&&r.body.category==='shopping'),
        'Plaid category corrections must route only to Plaid using its original account and transaction identifiers');
      assert.ok((await section.locator('.finance-page-transaction').allTextContents()).some(t=>t.includes('Plaid')),
        'A Plaid-origin transaction must appear with a source label in the combined feed');
      assert.ok(requests.some(r=>r.path.endsWith('/plaid/accounts')));
      // Refreshing activity must sync both connected providers with no consent toggles.
      const activityStart=requests.length;
      await section.getByRole('button',{name:'Refresh activity'}).click();
      await page.waitForFunction(()=>{
        const text=document.querySelector('#bt-finances-page')?.textContent||'';
        return text.includes('Latest available activity checked')||text.includes('Next check');
      },null,{timeout:15000});
      const activityRequests=requests.slice(activityStart);
      assert.ok(activityRequests.some(r=>r.path.endsWith('/simplefin/sync')&&r.method==='POST'));
      assert.ok(activityRequests.some(r=>r.path.endsWith('/plaid/accounts/sync')&&r.method==='POST'));
      assert.equal(requests.some(r=>r.path.endsWith('/plaid/link-token')||r.path.endsWith('/plaid/exchange')),false,
        'Automatic refresh must not open new Plaid connections or consume Trial slots');
      await section.getByText('X Money Bonus',{exact:true}).waitFor();
      // All provider-returned rows within the 90-day retention window must be
      // reachable, not silently truncated at the former 250-row UI cap.
      for(let index=0;index<260;index++){
        const id='history-'+String(index).padStart(3,'0');
        plaidState.transactions[A][id]={id,posted:NOW-500-index*1000,pending:false,
          amount:'-1.00',currency:'USD',merchant:'History item '+index,
          description:'Synthetic Plaid history item '+index,category:'other',
          categorySource:'automatic',confidence:'low',signals:[]};
      }
      // Generic provider titles fall back to the original description.
      plaidState.transactions[A]['history-000'].merchant='Transaction';
      plaidState.transactions[A]['history-000'].categorySource='ai';
      plaidState.transactions[A]['history-000'].category='shopping';
      // A bonus-classified transaction remains intact in provider data, but
      // its Finance-only presentation remains Needs review, never verified income.
      plaidState.transactions[A]['plaid-income'].category='bonus';
      await page.evaluate(()=>window.btRefreshFinancesPage?.());
      await section.getByRole('button',{name:'Transactions',exact:true}).click();
      await section.getByText('X Money Bonus',{exact:true}).waitFor();
      const correctedName=section.locator('.finance-page-transaction').filter({hasText:'Synthetic Plaid history item 0'});
      await correctedName.getByText('Auto',{exact:true}).waitFor();
      assert.ok((await correctedName.innerText()).includes('Synthetic Plaid history item 0'));
      const preservedBonus=section.locator('.finance-page-transaction').filter({hasText:'X Money Bonus'});
      assert.ok((await preservedBonus.innerText()).includes('Needs review'),
        'Finance must not claim unverified promotional credits are income');
      // Transaction expansion intentionally survives Finance section switches.
      // Clicking a previously open row would CLOSE it, so normalize to open.
      const bonusToggle=preservedBonus.getByRole('button',{name:/X Money Bonus/});
      if(await bonusToggle.getAttribute('aria-expanded')!=='true')await bonusToggle.click();
      const bonusCategory=section.getByLabel('Category for X Money Bonus');
      await bonusCategory.waitFor({state:'visible'});
      assert.equal(await bonusCategory.inputValue(),'unreviewed',
        'An unconfirmed promotional credit must not preselect Income in the editor');
      if(await bonusToggle.getAttribute('aria-expanded')==='true')await bonusToggle.click();
      assert.equal(plaidState.transactions[A]['plaid-income'].category,'bonus',
        'Finance presentation must not rewrite canonical bonus category data');
      await section.getByRole('button',{name:/^Show 100 more transactions/}).waitFor();
      await section.getByRole('button',{name:/^Show 100 more transactions/}).click();
      await section.getByRole('button',{name:/^Show 64 more transactions/}).waitFor();
      await section.getByRole('button',{name:/^Show 64 more transactions/}).click();
      assert.equal(await section.locator('.finance-page-transaction').count(),264,
        'All 260 additional Plaid rows plus 4 preexisting rows are accessible by paging');
      assert.equal(await section.getByRole('button',{name:/^Show \d+ more transactions/}).count(),0,
        'No provider-returned history remains inaccessible after the final page');
      // Removing an individual Plaid bank must take one confirmation and leave tracker history intact.
      await section.getByRole('button',{name:'Accounts',exact:true}).click();
      await section.getByRole('button',{name:'Connection options for X Money'}).click();
      await section.getByRole('button',{name:'Remove bank',exact:true}).click();
      const removeConfirm=page.getByRole('dialog',{name:'Remove connected bank?'});
      await removeConfirm.getByRole('button',{name:'Cancel'}).click();
      assert.equal(plaidState.connected,true,'Cancellation must retain Plaid credentials');
      await section.getByRole('button',{name:'Remove bank',exact:true}).click();
      await page.getByRole('dialog',{name:'Remove connected bank?'})
        .getByRole('button',{name:'Remove bank',exact:true}).click();
      await section.getByText('Bank removed.',{exact:false}).waitFor();
      assert.ok(requests.some(r=>r.path.endsWith('/accounts/items/9999999999999999999999999999999999999999999999999999999999999999')&&r.method==='DELETE'),
        'One confirm must disconnect the exact Plaid connection');
      assert.equal(plaidState.connected,false);
      assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before,'no tracker writes');
      assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('synthetic-access')),true);
      assert.deepEqual(errors,[]);console.log(name+': finance overview, transactions, account management, privacy and responsive navigation passed');
    }finally{await browser.close()}
  }}finally{server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
