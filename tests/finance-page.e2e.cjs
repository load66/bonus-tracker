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
      await page.addInitScript(()=>{
        const RealDate=Date,now=Date.parse('2026-10-16T07:00:00Z');
        window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};
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
          await section.getByRole('heading',{name:'Financial overview'}).waitFor({timeout:7000});
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
      // Amounts can contain spacing; the user-facing status must be Unavailable.
      await section.locator('.finance-page-tile strong')
        .filter({hasText:/^\s*Unavailable\s*$/}).first().waitFor({state:'visible'});
      await section.getByText('Income',{exact:true}).locator('..').getByText(/200/).waitFor();
      await section.getByText('Expenses',{exact:true}).locator('..').getByText(/15/).waitFor();
      await section.getByText('Cash Flow',{exact:true}).locator('..').getByText(/185/).waitFor();
      await section.locator('.finance-page-caution')
        .filter({hasText:'Cash Flow is partial'}).first().waitFor({state:'visible'});
      // The awaited visibility assertion above is authoritative; do not reread
      // an asynchronously replaced DOM node in a second non-waiting assertion.
      const before=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
      await section.getByRole('button',{name:'Hide amounts',exact:true}).click();
      assert.equal(await section.locator('.finance-page-tile strong').first().innerText(),'••••••');
      await section.getByRole('button',{name:'Show amounts',exact:true}).click();

      await section.getByRole('button',{name:'Transactions',exact:true}).click();
      await section.getByRole('heading',{name:'Transactions',exact:true}).waitFor();
      assert.equal(await section.locator('script').count(),0,'transaction descriptions remain text');
      const txSearch=section.getByRole('searchbox',{name:'Search transactions'});await txSearch.fill('coffee');
      assert.equal(await section.locator('.finance-page-transaction:visible').count(),1);
      await txSearch.fill('');
      const category=section.getByLabel('Category for Unknown');await category.selectOption('shopping');
      await section.getByRole('alert').filter({hasText:'Changes were not saved.'}).waitFor();
      assert.equal(state.transactions[A][T3].category,'unreviewed','failure must not silently commit category changes');
      await section.getByLabel('Category for Unknown').selectOption('shopping');
      await section.getByText('Confirmed by you',{exact:true}).waitFor();
      await section.getByRole('alert').waitFor({state:'hidden'});
      assert.equal(state.transactions[A][T3].category,'shopping','retry must save category');
      assert.ok(requests.some(r=>r.path.endsWith('/transaction-review')&&r.body.category==='shopping'));

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
      const bridge=wizard.getByRole('link',{name:'Continue securely to SimpleFIN'});
      assert.equal(await bridge.getAttribute('href'),'https://beta-bridge.simplefin.org/');
      assert.equal(await bridge.getAttribute('target'),'_blank');
      assert.equal(await bridge.getAttribute('rel'),'noopener noreferrer');
      assert.equal(await wizard.locator('input[type=password]').count(),0,'BonusTracker never collects bank passwords');
      assert.equal(await wizard.locator('input[type=tel]').count(),0,'BonusTracker never collects bank MFA codes');
      await wizard.getByRole('button',{name:'Back to connected accounts'}).click();
      await wizard.getByRole('button',{name:'Done'}).click();
      assert.equal(await page.evaluate(()=>window.__bankWizardRefreshCount),0,
        'Closing an unchanged provider authorization wizard must not refresh or interrupt financial edits');
      await section.getByText('Use Add bank for secure guided setup.',{exact:false}).waitFor();
      assert.ok((await section.innerText()).includes('Discovery can be limited to once daily'),
        'Explain provider discovery delay when adding a bank');
      assert.equal(await section.locator('.finance-page-account').count(),3);
      const accountSearch=section.getByRole('searchbox',{name:'Search accounts'});await accountSearch.fill('other credit union');
      assert.equal(await section.locator('.finance-page-account:visible').count(),1);await accountSearch.fill('');
      const creditEditor=section.locator('.finance-page-account-info strong').filter({hasText:/^Credit Card$/}).locator('xpath=../../..');
      await creditEditor.getByLabel('Net worth treatment').selectOption('exclude');
      await section.getByRole('button',{name:'Save account organization'}).click();
      await section.getByRole('alert').filter({hasText:'Changes were not saved.'}).waitFor();
      assert.equal(state.accountProfiles[B].balanceMode,'liability','failed account save must leave encrypted server state unchanged');
      assert.equal(await creditEditor.getByLabel('Net worth treatment').inputValue(),'exclude','unsaved draft remains available for retry');
      await Promise.all([
        page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/account-profiles')&&r.request().method()==='PUT'&&r.status()===200),
        section.getByRole('button',{name:'Save account organization'}).click()
      ]);
      await section.getByRole('alert').waitFor({state:'hidden'});
      assert.equal(state.accountProfiles[B].balanceMode,'exclude','successful retry must persist organization');
      assert.equal(redrawOnSuccessfulSave,false,'WebKit must exercise a same-user redraw before successful save response');
      assert.ok(requests.some(r=>r.path.endsWith('/account-profiles')));

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
      assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before,'no tracker writes');
      assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('synthetic-access')),true);
      assert.deepEqual(errors,[]);console.log(name+': finance overview, transactions, account management, privacy and responsive navigation passed');
    }finally{await browser.close()}
  }}finally{server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
