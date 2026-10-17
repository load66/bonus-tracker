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
      await page.route('https://api-production-00f74.up.railway.app/**',route=>route.abort());
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
        if(url.pathname.endsWith('/account-action')){
          const account=state.accounts.find(a=>a.key===body.account);
          if(body.action==='remove')account.removedAt=NOW;
          if(body.action==='restore')account.removedAt=null;
          if(body.action==='delete_history')delete state.transactions[body.account];
          await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...state,accountAction:{removalId:'synthetic-removal',removedAt:NOW}})});return;
        }
        if(url.pathname.endsWith('/monitoring'))state.monitoredAccounts=body.accounts;
        if(url.pathname.endsWith('/transaction-review'))state.transactions[body.account][body.transaction].category=body.category,state.transactions[body.account][body.transaction].categorySource=body.category==='unreviewed'?'automatic':'user';
        if(url.pathname.endsWith('/account-profiles')){
          state.accountProfiles={...state.accountProfiles,...body.profiles};
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
        if(url.pathname.endsWith('/link-token')){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({linkToken:'synthetic-update',existingItem:true})});return}
        if(url.pathname.endsWith('/update-complete')){await page.evaluate(()=>window.__existingItemUpdated=true);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(plaidState)});return}
        const result=url.pathname.includes('/accounts')?plaidState:{provider:'plaid',priority:'fallback',configured:false,used:null,limit:10};
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
      });
      let prefs={version:1,revision:0,budgets:{},duplicates:{},recurring:{},transactionMeta:{}};
      await page.route('https://api-production-00f74.up.railway.app/api/bonus-tracker/finances**',async route=>{
        if(route.request().method()==='PUT'){const body=route.request().postDataJSON();prefs[body.section][body.key]=body.value;prefs.revision++}
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(prefs)});
      });
      await page.addInitScript(()=>{
        window.Plaid={create:opts=>({open(){opts.onSuccess('ignored-existing-item-token',{})},destroy(){}})};
        const RealDate=Date,now=Date.parse('2026-10-16T07:00:00Z');
        window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};
        localStorage.setItem('bt_e_v4','[]');localStorage.setItem('bt_finance_hide_amounts','true');localStorage.setItem('bonus-ai-auth',JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_at:4102444800}));
      });
      await page.goto(process.env.BT_BROWSER_SITE_URL||'http://127.0.0.1:'+server.address().port+'/');
      // Cloud startup can redraw the root while the user is first navigating.
      // A redraw is not evidence that the Finance page is unavailable. Check
      // the fully bootstrapped shell and repeat a lost navigation at most twice.
      await page.waitForFunction(()=>typeof window.BTBonusAuth?.connected==='function'&&
        window.BTBonusAuth.connected()&&typeof window.btRefreshFinancesPage==='function',null,{timeout:12000});
      const section=page.getByRole('region',{name:'My finances'});
      async function openFinances(){
        for(let attempt=0;attempt<3;attempt++){
          await page.getByRole('button',{name:'Finances',exact:true}).click();
          try{await section.getByRole('heading',{name:'Finances',exact:true}).waitFor({timeout:7000});return}catch(error){if(attempt===2)throw error}
        }
      }
      await openFinances();
      await section.locator('.finance-page-count').filter({hasText:'4 accounts'}).waitFor();
      const before=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
      assert.equal(await section.locator('img').count(),0,'Bank aliases render as escaped text');
      assert.deepEqual((await section.locator('.finance-page-nav button').allTextContents()).map(x=>x.trim()),['Overview','Spending','Recurring','Transactions','Accounts']);
      await section.getByRole('button',{name:'Hide amounts',exact:true}).waitFor();
      await section.getByRole('button',{name:'Hide amounts',exact:true}).click();
      assert.equal(await section.locator('.finance-page-hero-cash-value').innerText(),'••••••');
      assert.equal(await section.locator('.finance-page-line-chart').count(),0,'Hidden chart geometry cannot disclose balances');
      await page.reload();await openFinances();
      await section.getByRole('button',{name:'Show amounts',exact:true}).click();
      assert.equal(await page.evaluate(()=>localStorage.getItem('bt_finance_hide_v2')),'false');
      await section.getByRole('button',{name:'Transactions',exact:true}).click();
      const search=section.getByRole('searchbox',{name:'Search transactions'});await search.fill('coffee');
      assert.equal(await section.locator('.finance-page-transaction').count(),1);await search.fill('');
      const unknown=section.locator('.finance-page-transaction').filter({hasText:'Unknown'});
      await unknown.getByRole('button').click();
      let modal=page.getByRole('dialog',{name:'Transaction details for Unknown',exact:true});
      await modal.getByRole('checkbox',{name:'Apply to similar transactions'}).check();
      await modal.getByLabel('Category for Unknown').selectOption('shopping');
      await modal.getByText(/Changes were not saved/).waitFor();
      assert.equal(state.transactions[A][T3].category,'unreviewed');
      await modal.getByLabel('Category for Unknown').selectOption('shopping');
      await modal.waitFor({state:'hidden'});assert.equal(state.transactions[A][T3].category,'shopping');
      assert.ok(requests.some(r=>r.body.applySimilar===true));
      await section.getByRole('button',{name:'Accounts',exact:true}).click();
      await section.getByRole('heading',{name:'Accounts',exact:true}).waitFor();
      assert.equal(await section.locator('.finance-page-account:visible').count(),4);
      assert.equal(await section.locator('select').count(),1,'No bonus dropdowns in account lists');
      const accountSearch=section.getByRole('searchbox',{name:'Search accounts'});
      await accountSearch.fill('x money');assert.equal(await section.locator('.finance-page-account:visible').count(),1);await accountSearch.fill('');
      // Secure bank authorization wizard still never collects bank passwords or MFA.
      await section.getByRole('button',{name:'Add account',exact:true}).click();
      const wizard=page.getByRole('dialog',{name:'Financial accounts'});
      await wizard.getByText('SECURE BANK CONNECTION',{exact:true}).waitFor();
      assert.equal(await wizard.locator('input[type=password],input[type=tel]').count(),0);
      assert.equal(await wizard.getByRole('link',{name:'Open SimpleFIN'}).getAttribute('rel'),'noopener noreferrer');
      await wizard.getByRole('button',{name:'Back to connected accounts'}).click();await wizard.getByRole('button',{name:'Done',exact:true}).click();
      await section.getByRole('button',{name:'Credit Card',exact:true}).click();
      modal=page.getByRole('dialog',{name:'Credit Card',exact:true});
      const net=modal.getByRole('switch',{name:'Include in net worth'});await net.uncheck();
      await modal.getByRole('button',{name:'Save account settings',exact:true}).click();
      await modal.getByText(/Changes were not saved/).waitFor();
      assert.equal(state.accountProfiles[B].balanceMode,'liability');
      assert.equal(await net.isChecked(),false,'Failed saves preserve the editable draft');
      await modal.getByRole('button',{name:'Save account settings',exact:true}).click();await modal.waitFor({state:'hidden'});
      assert.equal(state.accountProfiles[B].balanceMode,'exclude');
      assert.equal(redrawOnSuccessfulSave,false,'WebKit exercises same-owner redraw before successful save response');
      await section.getByRole('button',{name:'Checking <img src=x>',exact:true}).click();
      modal=page.getByRole('dialog',{name:'Checking <img src=x>',exact:true});
      await modal.getByRole('button',{name:'Hide account',exact:true}).click();await modal.waitFor({state:'hidden'});
      assert.equal(state.accountProfiles[A].hidden,true);assert.equal(Object.keys(state.transactions[A]).length,3);
      assert.equal(await section.locator('.finance-page-account:visible').count(),3);
      await section.locator('.finance-page-hidden-accounts>summary').click();
      await section.getByRole('button',{name:'Checking <img src=x>',exact:true}).click();
      modal=page.getByRole('dialog',{name:'Checking <img src=x>',exact:true});
      await modal.getByRole('button',{name:'Unhide account',exact:true}).click();await modal.waitFor({state:'hidden'});
      assert.equal(state.accountProfiles[A].hidden,false);
      // Removing one account keeps siblings, historical reports, and a 10-second Undo.
      await section.getByRole('button',{name:'Credit Card',exact:true}).click();
      modal=page.getByRole('dialog',{name:'Credit Card',exact:true});await modal.getByRole('button',{name:'Remove account',exact:true}).click();
      const confirm=page.getByRole('dialog',{name:'Remove Credit Card?',exact:true});
      await confirm.getByRole('button',{name:'Remove account',exact:true}).click();
      await page.getByRole('button',{name:'Undo',exact:true}).waitFor();
      assert.equal(state.accounts.find(a=>a.key===B).removedAt,NOW);
      assert.equal(state.accounts.find(a=>a.key===A).removedAt,undefined,'Sibling remains connected');
      await page.getByRole('button',{name:'Undo',exact:true}).click();
      await page.locator('.finance-undo').waitFor({state:'hidden'});
      assert.equal(state.accounts.find(a=>a.key===B).removedAt,null);
      // Transactions are editable through their original bank, even in one unified list.
      await section.getByRole('button',{name:'Transactions',exact:true}).click();
      await section.locator('.finance-page-transaction').filter({hasText:'X Money Bonus'}).getByRole('button').click();
      modal=page.getByRole('dialog',{name:'Transaction details for X Money Bonus',exact:true});
      assert.equal(await modal.getByLabel('Category for X Money Bonus').locator('option[value=bonus]').count(),0);
      await modal.getByLabel('Category for X Money Bonus').selectOption('shopping');await modal.waitFor({state:'hidden'});
      assert.ok(requests.some(r=>r.path.endsWith('/plaid/accounts/transaction-review')&&r.body.transaction==='plaid-income'));
      // Full provider history stays reachable, including generic merchant titles and AI tags.
      for(let i=0;i<260;i++){const id='history-'+i;plaidState.transactions[A][id]={id,posted:NOW-500-i*1000,pending:false,amount:'-1.00',merchant:i===0?'Transaction':'History item '+i,description:'Synthetic history item '+i,category:'other',categorySource:i===0?'ai':'automatic',confidence:'medium',signals:[]}}
      await page.evaluate(()=>window.btRefreshFinancesPage());
      await section.getByRole('button',{name:'Transactions',exact:true}).click();
      await section.getByText('Synthetic history item 0',{exact:true}).waitFor();
      assert.equal(await section.locator('.finance-page-auto-tag').count(),1);
      await section.getByRole('button',{name:/^Show 100 more/}).click();
      await section.getByRole('button',{name:/^Show 64 more/}).click();
      assert.equal(await section.locator('.finance-page-transaction').count(),264);
      for(const label of ['Overview','Spending','Recurring','Transactions','Accounts']){
        await section.getByRole('button',{name:label,exact:true}).click();
        for(const colorScheme of ['dark','light']){
          await page.emulateMedia({colorScheme});await page.setViewportSize({width:390,height:844});
          const geometry=await section.evaluate(e=>({width:innerWidth,scroll:e.scrollWidth,box:e.getBoundingClientRect().width}));
          assert.ok(geometry.scroll<=geometry.width+1&&geometry.box<=geometry.width+1,name+' '+label+' mobile overflow');
          await page.screenshot({path:path.join(output,name+'-'+label+'-'+colorScheme+'-390.png')});
        }
      }
      await section.getByRole('button',{name:'Manage connections',exact:true}).click();
      await section.getByRole('heading',{name:'Manage connections',exact:true}).waitFor();
      await section.getByRole('button',{name:/X Money.*via Plaid/}).click();
      modal=page.getByRole('dialog',{name:'X Money',exact:true});
      await modal.getByRole('button',{name:'Choose which accounts to share',exact:true}).click();
      await page.waitForFunction(()=>window.__existingItemUpdated===true);
      assert.equal(requests.some(r=>r.path.endsWith('/plaid/link-token')||r.path.endsWith('/exchange')),false,'No new Plaid Item was created');
      assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before,'Tracker records remain byte-for-byte intact');
      assert.deepEqual(errors,[]);console.log(name+': Finance lifecycle, privacy, categorization, 264-row history, both device settings, 390x844 and Trial safety passed');
    }finally{await browser.close()}
  }}finally{server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
