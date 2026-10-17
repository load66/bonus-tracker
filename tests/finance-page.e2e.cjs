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
    {key:B,bank:'Other Credit Union',name:'Robinhood Credit Card **4010 (4010)',mask:'4010',currency:'USD',balance:'200.00',availableBalance:'800.00',balanceDate:NOW-300},
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
  try{for(const [name,engine] of require('./browser-select.cjs')({chromium,firefox,webkit})){
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
          try{await section.locator('.finance-overview-net-hero').waitFor({timeout:7000});return}catch(error){if(attempt===2)throw error}
        }
      }
      await openFinances();
      await section.locator('.finance-overview-count').filter({hasText:'4 accounts at'}).waitFor();
      const before=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
      assert.equal(await section.locator('img').count(),0,'Bank aliases render as escaped text');
      assert.deepEqual((await section.locator('.finance-page-nav button').allTextContents()).map(x=>x.trim()),['Overview','Spending','Recurring','Transactions','Accounts']);
      // Regression: six bottom tabs must have separate, equal-width hit targets
      // and readable names at the narrowest supported phone widths.
      for(const width of [320,375,390,430]){
        assert.equal(await page.locator('#v31_profile_btn,#v32_inbox_btn,#v31_overlay,#v32_overlay').count(),0,'Retired floating add-ons visible at '+width+'px');
        await page.setViewportSize({width,height:844});
        // Responsive navigation can be replaced during a viewport redraw.
        // Require a connected, styled bar before measuring its six grid slots.
        await page.waitForFunction(()=>{
          const tabs=document.querySelector('.tabs');
          return tabs?.isConnected&&getComputedStyle(tabs).display==='grid';
        },null,{timeout:12000});
        const geometry=await page.locator('.tabs').evaluate(tabs=>{
          const bar=tabs.getBoundingClientRect();
          const buttons=[...tabs.querySelectorAll(':scope > .tb')];
          return {
            display:getComputedStyle(tabs).display,
            bar:{left:bar.left,right:bar.right,width:bar.width},
            labels:buttons.map(button=>{
              const text=button.querySelector('span'),slot=button.getBoundingClientRect(),
                label=text.getBoundingClientRect();
              return {name:button.getAttribute('aria-label'),text:text.textContent,
                slot:{left:slot.left,right:slot.right,width:slot.width},
                label:{left:label.left,right:label.right,width:label.width},
                scrollWidth:text.scrollWidth,clientWidth:text.clientWidth,
                whitespace:getComputedStyle(text).whiteSpace};
            })
          };
        });
        assert.equal(geometry.display,'grid','Navigation uses six independent grid tracks at '+width);
        assert.deepEqual(geometry.labels.map(v=>v.name),
          ['Tracker','Bank Bonuses','Finances','Tax','Datapoints','T&C Archive']);
        assert.deepEqual(geometry.labels.map(v=>v.text),
          ['Tracker','Bonuses','Finances','Tax','Data','Archive']);
        assert.equal(geometry.labels.length,6);
        const widths=geometry.labels.map(v=>v.slot.width);
        assert.ok(Math.max(...widths)-Math.min(...widths)<1.1,'Unequal tab widths at '+width);
        for(let i=0;i<geometry.labels.length;i++){
          const cur=geometry.labels[i],next=geometry.labels[i+1];
          assert.ok(cur.slot.left>=geometry.bar.left-1&&cur.slot.right<=geometry.bar.right+1,
            'Tab escapes viewport at '+width+': '+cur.name);
          assert.equal(cur.whitespace,'nowrap','Label wraps inside a word: '+cur.name+' at '+width);
          assert.ok(cur.scrollWidth<=cur.clientWidth+1,'Text is clipped: '+cur.name+' at '+width);
          assert.ok(cur.label.left>=cur.slot.left-1&&cur.label.right<=cur.slot.right+1,
            'Label leaves its tab: '+cur.name+' at '+width);
          if(next){
            assert.ok(cur.slot.right<=next.slot.left+.25,'Tab slots overlap at '+width);
            assert.ok(cur.label.right<=next.label.left+.25,'Tab labels overlap at '+width);
          }
        }
        const card=section.locator('.finance-overview-account-card');
        const metrics=await card.evaluate(node=>({
          inside:node.getBoundingClientRect().left>=-1&&node.getBoundingClientRect().right<=innerWidth+1,
          lines:[...node.querySelectorAll('.finance-overview-category-row')].map(row=>{
            const box=row.getBoundingClientRect(),label=row.querySelector('.finance-overview-row-info'),
              value=row.querySelector('.finance-overview-row-value').getBoundingClientRect(),
              note=label.querySelector('small');
            const lineHeight=note?parseFloat(getComputedStyle(note).lineHeight):1;
            return {height:box.height,inside:value.right<=box.right+1,
              gap:value.left-label.getBoundingClientRect().right,
              lines:note?note.getBoundingClientRect().height/lineHeight:0};
          })
        }));
        assert.ok(metrics.inside&&metrics.lines.every(x=>x.height<=75&&x.inside&&x.gap>=-1&&x.lines<=2.2),
          name+' Finance rows overflow or collide at '+width+': '+JSON.stringify(metrics));
        await page.screenshot({path:path.join(output,name+'-finance-overview-'+width+'.png')});
        await page.screenshot({path:path.join(output,name+'-bottom-tabs-'+width+'.png')});
        // Both navigational destinations must be reachable by actual taps at each width.
        await page.getByRole('button',{name:'T&C Archive',exact:true}).click();
        assert.ok(await page.getByRole('button',{name:'T&C Archive',exact:true}).count());
        await page.getByRole('button',{name:'Tracker',exact:true}).click();
        assert.ok(await page.getByRole('button',{name:'Tracker',exact:true}).count());
        await openFinances();
      }
      await page.setViewportSize({width:390,height:844});
      // Net card credit is a product-type classification, independent of sign.
      const D='g'.repeat(64);
      state.accounts.find(a=>a.key===B).balance='-283.27';
      state.accounts.push({key:D,bank:'PayPal',name:'PayPal Mastercard',mask:'8532',
        currency:'USD',balance:'63.87',balanceDate:NOW-300});
      state.accountProfiles[D]={kind:'credit_card',balanceMode:'liability'};
      await page.evaluate(()=>window.btRefreshFinancesPage());
      const cardsRow=section.getByRole('button',{name:'View Credit cards accounts'});
      await cardsRow.getByText('$219.40 credit',{exact:true}).waitFor();
      assert.equal(await section.getByRole('button',{name:'View Other accounts'}).count(),0);
      await cardsRow.click();
      const cardSheet=page.getByRole('dialog',{name:'Credit cards accounts'});
      assert.ok((await cardSheet.innerText()).includes('Robinhood Credit Card ··4010'));
      assert.ok((await cardSheet.innerText()).includes('$283.27 credit'));
      assert.ok((await cardSheet.innerText()).includes('PayPal Mastercard ··8532'));
      assert.ok((await cardSheet.innerText()).includes('$63.87 owed'));
      await cardSheet.getByRole('button',{name:'Close'}).click();
      // Already-linked SimpleFIN mortgage: negative source balance is debt, not an asset.
      const M='m'.repeat(64),syncsBeforeMortgage=requests.filter(x=>x.method==='POST'&&/\/(?:sync|connect)$/.test(x.path)).length;
      state.accounts.push({key:M,bank:'Synthetic Home Servicer',name:'Synthetic Home Mortgage',
        accountType:'loan',accountSubtype:'loan',currency:'USD',balance:'-185000.00',
        balanceDate:NOW-60});
      state.transactions[M]={};state.monitoredAccounts.push(M);
      await page.evaluate(()=>window.btRefreshFinancesPage());
      const mortgageRow=section.getByRole('button',{name:'View Other accounts'});
      await mortgageRow.getByText(/185,000\.00/).waitFor();
      assert.ok((await mortgageRow.innerText()).includes('Mortgage debt'));
      await section.getByRole('button',{name:'Accounts',exact:true}).click();
      await section.getByRole('button',{name:/Synthetic Home Mortgage/}).click();
      const loanDetails=page.getByRole('dialog',{name:'Synthetic Home Mortgage'});
      await loanDetails.getByText('$185,000.00 owed',{exact:true}).waitFor();
      await loanDetails.getByRole('heading',{name:'Debt remaining'}).waitFor();
      await loanDetails.getByText(/Rate, escrow, due dates/).waitFor();
      await loanDetails.getByRole('button',{name:'Close'}).click();
      await section.getByRole('button',{name:'Overview',exact:true}).click();
      assert.equal(requests.filter(x=>x.method==='POST'&&/\/(?:sync|connect)$/.test(x.path)).length,syncsBeforeMortgage,
        'Viewing an existing mortgage requires no new provider sync or bank connection');
      state.accounts=state.accounts.filter(a=>a.key!==M);
      delete state.transactions[M];state.monitoredAccounts=state.monitoredAccounts.filter(key=>key!==M);
      await page.evaluate(()=>window.btRefreshFinancesPage());
      state.accounts=state.accounts.filter(a=>a.key!==D);
      delete state.accountProfiles[D];
      state.accounts.find(a=>a.key===B).balance='200.00';
      await page.evaluate(()=>window.btRefreshFinancesPage());
      const investmentCard=section.getByRole('button',{name:'View Investments accounts'});
      assert.equal(await investmentCard.locator('.finance-overview-row-value strong').innerText(),'—');
      assert.equal(await investmentCard.locator('.finance-overview-row-info small').innerText(),'Brokerage — · Retirement —');
      assert.equal(await section.locator('.finance-overview-category-row').count(),3);
      assert.equal(await section.locator('.finance-overview-account-card').count(),1);
      await investmentCard.click();
      const investments=page.getByRole('dialog',{name:'Investments accounts'});
      for(const label of ['Invested this month','Withdrawn this month','Market change','Investment income','Since last update · balance movement'])
        assert.ok(await investments.getByText(label,{exact:true}).count());
      assert.ok((await investments.innerText()).includes('complete period balance'));
      await investments.getByRole('button',{name:'Close'}).click();
      await section.getByRole('button',{name:'Hide amounts',exact:true}).waitFor();
      await section.getByRole('button',{name:'Hide amounts',exact:true}).click();
      assert.equal(await section.locator('.finance-overview-worth-number').innerText(),'••••••');
      assert.equal(await section.locator('.finance-page-line-chart').count(),0,'Hidden chart geometry cannot disclose balances');
      await page.reload();await openFinances();
      await section.getByRole('button',{name:'Show amounts',exact:true}).click();
      assert.equal(await page.evaluate(()=>localStorage.getItem('bt_finance_hide_v2')),'false');
      await section.locator('.finance-overview-more>summary').click();
      const worth=section.locator('.finance-net-worth-card');
      await worth.getByText('Net worth',{exact:true}).waitFor();
      assert.ok(await worth.getByText('Chart builds as your accounts sync.',{exact:true}).count());
      assert.equal(await worth.locator('.finance-page-period button').count(),0,'Hide date chips until two points');
      assert.ok(await worth.getByText(/account.*not included/).count());
      assert.equal(/\\b(provider|observation|verified|timestamp|snapshot|capped|evidence)\\b/i.test(await worth.innerText()),false);
      await worth.getByRole('button',{name:'Review',exact:true}).click();
      const review=page.getByRole('dialog',{name:'Accounts to review'});
      await review.getByText('Excluded',{exact:true}).waitFor();
      assert.equal(/\\b(provider|observation|verified|timestamp|snapshot|capped|evidence)\\b/i.test(await review.innerText()),false);
      await page.setViewportSize({width:390,height:844});
      const sheetGeometry=await review.evaluate(el=>({left:el.getBoundingClientRect().left,
        right:el.getBoundingClientRect().right,width:innerWidth}));
      assert.ok(sheetGeometry.left>=-1&&sheetGeometry.right<=sheetGeometry.width+1,'Review sheet stays inside 390px viewport');
      await page.screenshot({path:path.join(output,name+'-Net-worth-review-dark-390.png')});
      await review.getByRole('button',{name:'Close',exact:true}).click();
      state.accounts[0].balanceDate=NOW-9*86400;
      await page.evaluate(()=>window.btRefreshFinancesPage());
      await section.locator('.finance-overview-net-hero').waitFor();
      await section.getByRole('button',{name:'Some balances not updated · Review'}).click();
      const overdue=page.getByRole('dialog',{name:'Accounts to review'});
      assert.ok((await overdue.innerText()).includes('Checking <img src=x>'));
      assert.ok(await overdue.getByRole('button',{name:'Refresh'}).count());
      await overdue.getByRole('button',{name:'Close'}).click();
      await section.getByRole('button',{name:'View Cash accounts'}).click();
      const cashDetails=page.getByRole('dialog',{name:'Cash accounts'});
      await cashDetails.getByText('1 account not updated.',{exact:false}).waitFor();
      assert.ok((await cashDetails.innerText()).includes('NOT included in this total'));
      assert.ok(await cashDetails.getByRole('button',{name:'Refresh'}).count());
      assert.ok(await cashDetails.getByRole('button',{name:'Reconnect'}).count());
      await cashDetails.getByRole('button',{name:'Close'}).click();
      state.accounts[0].balanceDate=NOW-400;
      await page.evaluate(()=>window.btRefreshFinancesPage());
      await section.locator('.finance-overview-net-hero').waitFor();
      await section.getByRole('button',{name:'Spending',exact:true}).click();
      assert.equal(await section.locator('.finance-overview-net-hero').count(),0,'The large Finances hero belongs on Overview only');
      assert.equal(await section.locator('.finance-page-nav-privacy').count(),1,'Compact eye control appears alongside tabs');
      assert.equal(await section.getByRole('button',{name:'Hide amounts',exact:true}).count(),1);
      await section.getByRole('heading',{name:'October 2026'}).waitFor();
      await section.getByText('October vs September',{exact:true}).waitFor();
      assert.ok((await section.locator('.finance-spending-value').innerText()).includes('$25.00'),'Eligible unknown debit is included in the October spending total');
      assert.ok(await section.getByRole('button',{name:'Review',exact:true}).count(),'Uncategorized category includes a review action');
      assert.equal(await section.locator('.finance-spending-today-dot').count(),1);
      assert.ok(await section.getByRole('button',{name:'Set budgets'}).count()===0||await section.locator('.finance-spending-budget-settings').count(),'Budgets are editable on the spending page');
      await section.getByRole('button',{name:'Previous spending month'}).click();
      await section.getByRole('heading',{name:'September 2026'}).waitFor();
      assert.equal(await section.locator('.finance-spending-comparison').count(),0,'Missing previous month does not create a fake $0 comparison');
      await section.getByRole('button',{name:'Next spending month'}).click();
      await section.getByRole('heading',{name:'October 2026'}).waitFor();
      await section.getByRole('button',{name:'Review',exact:true}).click();
      await section.getByText('1 of 1',{exact:true}).waitFor();
      await section.getByRole('button',{name:'Skip',exact:true}).click();
      await section.getByText('Review complete',{exact:true}).waitFor();
      await section.getByRole('button',{name:'Back to Spending',exact:true}).click();
      await section.getByRole('button',{name:'Transactions',exact:true}).click();
      const search=section.getByRole('searchbox',{name:'Search transactions'});await search.fill('coffee');
      assert.equal(await section.locator('.finance-page-transaction').count(),1);
      assert.equal(await section.locator('.finance-page-transaction-category').count(),1,'Every transaction has a category chip');
      const compactRow=section.locator('.finance-page-transaction-summary').first();
      assert.equal(await compactRow.locator('.finance-page-transaction-icon').count(),0,'Transaction avatars must not consume merchant space');
      const compactGeometry=await compactRow.evaluate(row=>({
        columns:getComputedStyle(row).gridTemplateColumns.trim().split(/\s+/).length,
        merchantInset:row.querySelector('.finance-page-transaction-copy').getBoundingClientRect().left-row.getBoundingClientRect().left
      }));
      assert.equal(compactGeometry.columns,2,'Transaction rows should contain only description and amount');
      assert.ok(compactGeometry.merchantInset<=12,'Merchant text must align near the left edge');
      await search.fill('');
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
      // Exercise the new one-card Spending Quick Review, including provider save,
      // apply-to-similar propagation and private encrypted budget settings.
      state.transactions[A][T3].category='unreviewed';
      state.transactions[A][T3].categorySource='automatic';
      await page.evaluate(()=>window.btRefreshFinancesPage());
      await section.getByRole('button',{name:'Spending',exact:true}).click();
      await section.getByRole('button',{name:'Quick Review',exact:true}).click();
      await section.getByText('1 of 1',{exact:true}).waitFor();
      await section.getByRole('checkbox',{name:'Apply to similar transactions'}).check();
      const reviewRequests=requests.length;
      await section.locator('.finance-spending-review-choice[data-category="groceries"]').click();
      await section.getByText('Review complete',{exact:true}).waitFor();
      assert.equal(state.transactions[A][T3].category,'groceries','Quick Review saves merchant category through its actual provider');
      assert.ok(requests.slice(reviewRequests).some(r=>r.path.endsWith('/transaction-review')&&r.body.applySimilar===true&&r.body.category==='groceries'),
        'Quick Review passes Apply to similar to the persistent provider rule');
      await section.getByRole('button',{name:'Back to Spending',exact:true}).click();
      await section.locator('.finance-spending-budget-settings > summary').click();
      const budget=section.getByLabel('Monthly budget for Groceries');
      await budget.fill('100.00');await budget.press('Tab');
      await section.getByText(/Left to spend/).first().waitFor();
      assert.equal(prefs.budgets.groceries.amount,'100.00','Monthly category budgets are stored through the secure backend preference route');
      await section.locator('.finance-spending-category-action').filter({hasText:'Groceries'}).first().click();
      await section.getByRole('heading',{name:'Past six months'}).waitFor();
      await section.getByRole('button',{name:'‹ Back to Spending'}).click();

      await section.getByRole('button',{name:'Accounts',exact:true}).click();
      await section.getByRole('heading',{name:/^Accounts \(\d+\)$/}).waitFor();
      assert.ok((await section.getByText('Credit cards', {exact:true}).first().locator('..').innerText()).includes('$200.00 owed'),'Card group header and row both show owed debt');
      assert.equal(await section.locator('.finance-page-account:visible').count(),4);
      assert.equal(await section.getByRole('button',{name:'Robinhood Credit Card ··4010',exact:true}).count(),1,'Duplicated account masks normalize to one readable suffix');
      assert.equal(await section.locator('select').count(),1,'No bonus dropdowns in account lists');
      const accountSearch=section.getByRole('searchbox',{name:'Search accounts'});
      await accountSearch.fill('x money');assert.equal(await section.locator('.finance-page-account:visible').count(),1);await accountSearch.fill('');
      // Secure bank authorization wizard still never collects bank passwords or MFA.
      await section.getByRole('button',{name:'Add account',exact:true}).click();
      const wizard=page.getByRole('dialog',{name:'Financial accounts'});
      await wizard.getByText('SECURE BANK CONNECTION',{exact:true}).waitFor();
      assert.equal(await wizard.locator('input[type=password],input[type=tel]').count(),0);
      assert.equal(await wizard.getByRole('button',{name:'Open SimpleFIN ↗'}).count(),1,'Connected SimpleFIN opens Bridge through an explicit no-opener button');
      await wizard.getByRole('button',{name:'Back to connected accounts'}).click();await wizard.getByRole('button',{name:'Done',exact:true}).click();
      await section.getByRole('button',{name:'Robinhood Credit Card ··4010',exact:true}).click();
      modal=page.getByRole('dialog',{name:'Robinhood Credit Card ··4010',exact:true});
      const net=modal.getByRole('switch',{name:'Include in net worth'});await net.uncheck();
      await modal.getByRole('button',{name:'Save account settings',exact:true}).click();
      await modal.getByText(/Changes were not saved/).waitFor();
      assert.equal(state.accountProfiles[B].balanceMode,'liability');
      assert.equal(await net.isChecked(),false,'Failed saves preserve the editable draft');
      await modal.getByRole('button',{name:'Save account settings',exact:true}).click();await modal.waitFor({state:'hidden'});
      assert.equal(state.accountProfiles[B].balanceMode,'exclude');
      assert.equal(await section.getByRole('button',{name:'Robinhood Credit Card ··4010',exact:true}).locator('b').innerText(),'$200.00 owed','Credit card debt wording remains consistent regardless of net-worth inclusion');
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
      await section.getByRole('button',{name:'Robinhood Credit Card ··4010',exact:true}).click();
      modal=page.getByRole('dialog',{name:'Robinhood Credit Card ··4010',exact:true});await modal.getByRole('button',{name:'Remove account',exact:true}).click();
      const confirm=page.getByRole('dialog',{name:'Remove Robinhood Credit Card ··4010?',exact:true});
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
      assert.equal(await modal.getByLabel('Category for X Money Bonus').locator('option[value=bonus]').count(),1,'Bonus review category remains selectable');
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
        const tabs=section.locator('.finance-page-nav-shell');
        assert.equal(await tabs.evaluate(el=>getComputedStyle(el).position),'sticky','Finance tab shell must stick beneath the main header');
        assert.equal(await tabs.evaluate(el=>getComputedStyle(el).borderTopLeftRadius),'0px','No transparent rounded gap above the sticky Finance tabs');
        if(label==='Overview'){
          assert.equal(await section.locator('.finance-overview-net-hero').count(),1);
          const fade=await tabs.evaluate(el=>({hasClass:el.classList.contains('can-scroll-right'),nav:el.querySelector('nav')}));
          assert.ok(fade.nav,'Finance tabs remain inside the scrollable row');
        }else{
          assert.equal(await section.locator('.finance-overview-net-hero').count(),0,'No bulky header outside Overview');
          assert.equal(await section.locator('.finance-page-nav-privacy').count(),1);
        }
        if(label==='Overview'){
          const periods=section.locator('.finance-page-period-nowrap').first();
          assert.ok(await periods.count(),'Cash-flow period controls exist');
          assert.equal(await periods.evaluate(el=>getComputedStyle(el).flexWrap),'nowrap');
        }
        for(const colorScheme of ['dark','light']){
          await page.emulateMedia({colorScheme});await page.setViewportSize({width:390,height:844});
          await page.evaluate(()=>window.scrollTo(0,0));
          const geometry=await section.evaluate(e=>({width:innerWidth,scroll:e.scrollWidth,box:e.getBoundingClientRect().width}));
          assert.ok(geometry.scroll<=geometry.width+1&&geometry.box<=geometry.width+1,name+' '+label+' mobile overflow');
          await page.screenshot({path:path.join(output,name+'-'+label+'-'+colorScheme+'-390.png')});
        }
      }
      // v3.4.90 synthetic real-description regression: pairs collapse to one unsigned row.
      const savingsAccountKey='1'.repeat(64),out450='2'.repeat(64),in450='3'.repeat(64);
      state.accounts[0].bank='Robinhood';state.accounts[0].name='Robinhood Checking';state.accounts[0].mask='2033';
      state.accounts.push({key:savingsAccountKey,bank:'Robinhood',name:'Robinhood Savings',mask:'0793',
        currency:'USD',balance:'900.00',balanceDate:NOW-300});
      state.accountProfiles[savingsAccountKey]={kind:'savings',balanceMode:'asset'};
      state.monitoredAccounts.push(savingsAccountKey);
      state.transactions[savingsAccountKey]={[out450]:{id:out450,amount:'-450.00',posted:NOW-210,pending:false,
        category:'unreviewed',categorySource:'automatic',description:'To Robinhood Checking'}};
      state.transactions[A][in450]={id:in450,amount:'450.00',posted:NOW-190,pending:false,
        category:'income',categorySource:'automatic',description:'From Robinhood Savings'};
      await page.evaluate(()=>window.btRefreshFinancesPage());
      await section.getByRole('button',{name:'Transactions',exact:true}).click();
      const transfer450=section.locator('.finance-page-transaction.is-matched-transfer').filter({hasText:'$450.00'});
      await transfer450.waitFor();
      assert.equal(await transfer450.count(),1,'Matched $450 appears once');
      assert.ok((await transfer450.innerText()).includes('Robinhood Savings ··0793 → Robinhood Checking ··2033'));
      assert.ok((await transfer450.locator('.finance-page-transaction-value b').innerText()).startsWith('⇄ '));
      assert.ok(!(await transfer450.innerText()).includes('+$450.00'),'Matched pair is unsigned');

      // Cross-provider ledger: Plaid arrives first, then SimpleFIN a day later.
      plaidState.transactions[A]['x-money-payment']={id:'x-money-payment',
        posted:NOW-500,pending:false,amount:'1000.00',merchant:'Payment',description:'Payment',
        category:'income',categorySource:'automatic',signals:[]};
      await page.evaluate(()=>window.btRefreshFinancesPage());
      await section.getByRole('button',{name:'Transactions',exact:true}).click();
      const waiting1000=section.locator('.finance-page-transaction').filter({hasText:'$1,000.00'});
      await waiting1000.getByText('Waiting for the other side',{exact:true}).waitFor();
      assert.equal(await waiting1000.count(),1,'Only one provisional X money Payment');
      assert.equal((await waiting1000.locator('.finance-page-transaction-value b').innerText()).includes('+'),false,
        'An unmatched credit must not be green income');
      assert.equal(await waiting1000.locator('.finance-page-transaction-value b.is-credit').count(),0,
        'Provisional transfer amount uses neutral styling');
      state.transactions[A]['robinhood-late-1000']={id:'robinhood-late-1000',
        posted:NOW-86400,pending:false,amount:'-1000.00',merchant:'Outgoing ACH',
        description:'Outgoing ACH',category:'unreviewed',categorySource:'automatic',signals:[]};
      await page.evaluate(()=>window.btRefreshFinancesPage());
      await section.getByRole('button',{name:'Transactions',exact:true}).click();
      const paired1000=section.locator('.finance-page-transaction.is-matched-transfer').filter({hasText:'$1,000.00'});
      await paired1000.waitFor();
      assert.equal(await paired1000.count(),1,'Late cross-provider debit upgrades Payment to exactly one matched transfer');
      const pairedText=await paired1000.innerText();
      assert.ok(pairedText.toLowerCase().includes('robinhood checking ··2033 → x money checking'),
        'Matched transfer shows source bank and destination bank: '+pairedText);
      assert.equal(await paired1000.locator('.finance-page-transaction-value b.is-credit').count(),0);
      assert.ok((await paired1000.locator('.finance-page-transaction-value b').innerText()).startsWith('⇄ $1,000.00'));
      plaidState.transactions[A]['late-unmatched750']={id:'late-unmatched750',
        posted:NOW-6*86400,pending:false,amount:'750.00',merchant:'Payment',
        description:'Payment',category:'income',categorySource:'automatic',signals:[]};
      await page.evaluate(()=>window.btRefreshFinancesPage());
      await section.getByRole('button',{name:'Transactions',exact:true}).click();
      const review750=section.locator('.finance-page-transaction').filter({hasText:'$750.00'});
      await review750.getByText('Waiting for the other side · Review after 5 days').waitFor();
      await review750.getByLabel('Apply to similar').check();
      await review750.getByRole('button',{name:'Confirm transfer',exact:true}).click();
      assert.ok(requests.some(r=>r.path.endsWith('/transaction-review')&&r.body.transaction==='late-unmatched750'&&
        r.body.category==='transfer'&&r.body.applySimilar===true),
        'Confirm transfer preserves opted-in similar merchant rule through Plaid');
      // Bank-specific history progress is separate from an authentication failure.
      plaidState.accounts[0].historyComplete=false;
      plaidState.accounts[0].transactionSyncStatus='history_still_loading';
      plaidState.accounts[0].transactionLastSyncAt=NOW-700;
      plaidState.accounts[0].transactionNextSyncAt=NOW+86400;
      await page.evaluate(()=>window.btRefreshFinancesPage());
      await section.getByText('1 bank updating transaction history',{exact:true}).waitFor();
      assert.equal(await section.getByText('Waiting for history',{exact:true}).count(),0,
        'Do not label every Finance account as waiting for history');
      await section.locator('.finance-history-status>summary').click();
      assert.ok((await section.locator('.finance-history-status').innerText()).includes('X Money'));
      assert.ok((await section.locator('.finance-history-status').innerText()).includes('Next eligible'));
      await section.getByRole('button',{name:'Accounts',exact:true}).click();
      await section.getByRole('button',{name:'Manage connections',exact:true}).click();
      await section.getByRole('heading',{name:'Manage connections',exact:true}).waitFor();
      // v3.4.91: bank Sync switches are staged, saved atomically and excluded
      // from every Finance total without requiring an activity refresh.
      const otherBank=section.getByRole('button',{name:/Other Credit Union.*via SimpleFIN/});
      await otherBank.click();
      modal=page.getByRole('dialog',{name:'Other Credit Union',exact:true});
      const syncSwitch=modal.getByRole('switch',{name:'Sync Robinhood Credit Card ··4010'});
      const savedBefore=state.accountProfiles[B].syncEnabled;
      const writesBefore=requests.filter(x=>x.path.endsWith('/account-profiles')).length;
      assert.equal(await modal.getByRole('button',{name:'Save changes',exact:true}).isDisabled(),true);
      await syncSwitch.uncheck();
      await modal.getByText('Will stop syncing',{exact:true}).waitFor();
      assert.equal(await modal.getByRole('button',{name:'Save changes (1)',exact:true}).isEnabled(),true);
      assert.equal(state.accountProfiles[B].syncEnabled,savedBefore,'Staging never writes provider profile');
      assert.equal(requests.filter(x=>x.path.endsWith('/account-profiles')).length,writesBefore);
      await page.setViewportSize({width:390,height:844});
      const footer=modal.locator('.finance-page-sync-footer');
      await footer.scrollIntoViewIfNeeded();
      const geometry=await footer.evaluate(e=>({top:e.getBoundingClientRect().top,
        bottom:e.getBoundingClientRect().bottom,height:innerHeight}));
      assert.ok(geometry.bottom<=geometry.height+1&&geometry.top>=0,'390px sticky Save footer visible inside sheet');
      await modal.getByRole('button',{name:'Cancel',exact:true}).click();
      await modal.waitFor({state:'hidden'});
      assert.equal(state.accountProfiles[B].syncEnabled,savedBefore,'Cancel must discard unsaved switches');
      await otherBank.click();
      modal=page.getByRole('dialog',{name:'Other Credit Union',exact:true});
      await modal.getByRole('switch',{name:'Sync Robinhood Credit Card ··4010'}).uncheck();
      await modal.getByRole('button',{name:'Close',exact:true}).click();
      let discard=page.getByRole('dialog',{name:'Discard changes?',exact:true});
      await discard.getByRole('button',{name:'Cancel',exact:true}).click();
      assert.equal(await modal.isVisible(),true,'Rejecting discard keeps bank settings open');
      await modal.getByRole('button',{name:'Close',exact:true}).click();
      discard=page.getByRole('dialog',{name:'Discard changes?',exact:true});
      await discard.getByRole('button',{name:'Discard changes',exact:true}).click();
      assert.equal(state.accountProfiles[B].syncEnabled,savedBefore);
      await otherBank.click();
      modal=page.getByRole('dialog',{name:'Other Credit Union',exact:true});
      await modal.getByRole('switch',{name:'Sync Robinhood Credit Card ··4010'}).uncheck();
      const refreshBefore=requests.filter(x=>x.path.endsWith('/sync')&&x.method==='POST').length;
      await modal.getByRole('button',{name:'Save changes (1)',exact:true}).click();
      await modal.waitFor({state:'hidden'});
      assert.equal(state.accountProfiles[B].syncEnabled,false,'Single Save persists sync-off');
      assert.equal(requests.filter(x=>x.path.endsWith('/sync')&&x.method==='POST').length,refreshBefore,
        'Saving sync choice must not call Refresh');
      await page.locator('.finance-page-save-toast').getByText(/hidden from totals/).waitFor();
      await section.getByRole('button',{name:'Back to accounts'}).click();
      await section.locator('.finance-page-not-syncing>summary').click();
      assert.equal(await section.getByRole('button',{name:'Robinhood Credit Card ··4010',exact:true}).count(),0,
        'Sync-off card is hidden from active bank lists');
      await section.getByText('Excluded from totals and reports').waitFor();
      await page.evaluate(()=>window.btRefreshFinancesPage());
      await section.locator('.finance-page-not-syncing>summary').click();
      assert.equal(state.accountProfiles[B].syncEnabled,false,'Refreshing cannot re-enable the account');
      await section.getByRole('button',{name:'Turn sync back on'}).click();
      assert.equal(state.accountProfiles[B].syncEnabled,true,'Restoring sync re-enables saved account');
      await section.getByRole('button',{name:'Robinhood Credit Card ··4010',exact:true}).waitFor();
      await section.getByRole('button',{name:'Manage connections',exact:true}).click();
      await section.getByRole('button',{name:/X Money.*via Plaid/}).click();
      modal=page.getByRole('dialog',{name:'X Money',exact:true});
      await modal.getByRole('button',{name:'Choose which accounts to share',exact:true}).click();
      await page.waitForFunction(()=>window.__existingItemUpdated===true);
      assert.equal(requests.some(r=>r.path.endsWith('/plaid/link-token')||r.path.endsWith('/exchange')),false,'No new Plaid Item was created');
      assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before,'Tracker records remain byte-for-byte intact');
      if(errors.length)console.error('UNHANDLED_FINANCE_PAGE_ERRORS',JSON.stringify(errors));
      assert.deepEqual(errors,[], 'Uncaught Finance UI errors: '+errors.join(' | '));console.log(name+': Finance lifecycle, privacy, categorization, 264-row history, both device settings, 390x844 and Trial safety passed');
    }finally{await browser.close()}
  }}finally{server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
