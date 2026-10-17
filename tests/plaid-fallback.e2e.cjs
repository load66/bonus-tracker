'use strict';
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,firefox,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{
  try{
    const name=new URL(req.url,'http://localhost').pathname;
    if(!['/','/plaid-fallback.js','/plaid-fallback.css'].includes(name))throw Error();
    const filename=name==='/'?null:path.join(root,name.slice(1));
    const contents=filename?await fs.readFile(filename):Buffer.from('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/plaid-fallback.css"></head><body><section id="target"></section><script src="/plaid-fallback.js"></script></body></html>');
    res.setHeader('content-type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(contents);
  }catch{res.writeHead(404);res.end()}
});
const KEY='a'.repeat(64);
(async()=>{
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  try{
    for(const [name,engine] of require('./browser-select.cjs')({chromium,firefox,webkit})){
      const browser=await engine.launch();
      try{
        const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:760}});
        const page=await context.newPage(),calls=[],errors=[];
        page.on('pageerror',err=>errors.push(err.message));
        let monitored=[KEY],mappings={},used=1,syncs=1,holdAccounts=false,accountWaiting,releaseAccount;
        await page.route('https://api-production-00f74.up.railway.app/**',route=>route.abort());
        await page.route('https://api-production-00f74.up.railway.app/api/bonus-tracker/plaid**',async route=>{
          const request=route.request(),url=new URL(request.url());
          if(holdAccounts&&url.pathname.endsWith('/accounts')){
            holdAccounts=false;
            const gate=new Promise(resolve=>{releaseAccount=resolve});
            accountWaiting();await gate;
          }
          calls.push(request.method()+' '+url.pathname);
          let result;
          if(url.pathname.endsWith('/monitoring')){
            monitored=request.postDataJSON().accounts;
          }
          if(url.pathname.endsWith('/selection'))mappings=request.postDataJSON().mappings;
          if(url.pathname.endsWith('/sync')){syncs++;monitored=[KEY];}
          if(url.pathname.endsWith('/link-token')){
            const body=request.postDataJSON();
            assert.equal(body.institution,'Other Bank');
            assert.equal(body.triedSimplefin,true);
            assert.equal(body.understandsLifetimeSlot,true);
            assert.equal(body.allowDuplicate,false);
          }
          if(url.pathname.endsWith('/exchange')){
            const body=request.postDataJSON();assert.equal(body.session,'b'.repeat(32));assert.equal(body.publicToken,'synthetic-public-token');used++;
          }
          if(url.pathname.endsWith('/accounts')&&request.method()==='GET'
            ||url.pathname.endsWith('/monitoring')||url.pathname.endsWith('/selection')
            ||url.pathname.endsWith('/sync')){
            result={provider:'plaid',configured:true,connected:true,
              accounts:[{key:KEY,bank:'Synthetic Bank',name:'Checking',balance:'200',
                firstSeenAt:Date.parse('2026-10-10T12:00:00Z')/1000}],
              mappings,monitoredAccounts:monitored,lastSuccess:1792134000,stale:false,
              transactions:monitored.includes(KEY)&&syncs>0?{[KEY]:{'opaque':{
                amount:'500',currency:'USD',description:'Example payroll',
                signals:['possible_direct_deposit'],pending:false}}}:{},
              authoritativeMilestones:false};
          }else{
            result={provider:'plaid',configured:true,used,reserved:0,remaining:10-used,limit:10,
              connected:[{institution:'Synthetic Bank'}],paidUpgradeAllowed:false};
          }
          if(url.pathname.endsWith('/link-token'))result={session:'b'.repeat(32),linkToken:'synthetic-link-token'};
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
        });
        await page.addInitScript(()=>{
          window.entries=[{id:'cycle-one',bank:'Synthetic Bank',opened:'2026-10-01'}];
          window.BTFinancialRules={validate:()=>({ok:true,mode:'structured',rules:{accounts:[{id:'checking',label:'Checking product'}]}})};
          window.Plaid={create:config=>({open:()=>{window.syntheticLink=config}})};
          window.syntheticToken='synthetic-auth';
          window.bankSuccessEvents=[];
          window.addEventListener('bt:plaid-bank-connected',e=>window.bankSuccessEvents.push(e.detail));
          window.BTBonusAuth={connected:()=>true,token:async()=>window.syntheticToken};
        });
        await page.goto('http://127.0.0.1:'+server.address().port+'/');
        await page.evaluate(()=>window.BTLinkPlaidTrial.mount(document.getElementById('target'),[]));
        const host=page.locator('#target');
        await host.getByText('Plaid Trial · 1/10 used').waitFor();
        const accountsToggle=host.getByText('Connected accounts (1) · Manage',{exact:true});
        await accountsToggle.waitFor();
        assert.equal(await host.getByRole('checkbox').count(),0,'No repeated Plaid acknowledgements or expanded account settings on first view');
        assert.equal(await host.getByRole('button',{name:'Connect via Plaid · uses 1 lifetime slot'}).count(),1);
        await accountsToggle.click();
        assert.equal(await host.getByRole('checkbox').count(),0,
          'Read-only transaction history must not require an enable checkbox');
        assert.equal(calls.some(x=>x.includes('link-token')||x.includes('/exchange')),false,
          'Opening the provider view must never consume a Plaid Item');
        assert.equal(await host.getByRole('button',{name:'Refresh transactions'}).count(),0);
        assert.equal(await host.getByRole('button',{name:'Discover connected accounts'}).count(),0);
        assert.deepEqual(monitored,[KEY],'Accounts arrive from server-side sync without owner intervention');
        assert.equal(calls.filter(x=>x.endsWith('/accounts/sync')).length,0,
          'Browser UI must not trigger Plaid provider requests');
        const suggestion=host.getByRole('button',{name:'Link to Synthetic Bank bonus?'});
        await suggestion.waitFor();
        await page.evaluate(()=>{window.btConfirmDialog=async()=>false;});
        await suggestion.click();
        assert.deepEqual(mappings,{},'declining a suggestion cannot write any bonus mapping');
        await page.evaluate(()=>{window.btConfirmDialog=async()=>true;});
        await suggestion.click();
        await host.getByText('Confirmed bonus-account link saved.',{exact:false}).waitFor();
        assert.deepEqual(mappings[KEY],{entryId:'cycle-one',bank:'Synthetic Bank',opened:'2026-10-01'},
          'suggestion uses exact bank, entry and opened identity only after explicit confirmation');
        assert.equal(calls.some(x=>x.includes('link-token')||x.includes('/exchange')),false,
          'suggested mapping reuses authorized bank and never consumes a Plaid Item');
        await host.getByRole('combobox',{name:'Bonus campaign for Checking'}).selectOption('cycle-one');
        await host.getByRole('combobox',{name:'Bonus product for Checking'}).selectOption('checking');
        await host.getByRole('button',{name:'Save bonus links'}).click();
        await host.getByText('Bonus links saved.',{exact:false}).waitFor();
        assert.deepEqual(mappings[KEY],{entryId:'cycle-one',bank:'Synthetic Bank',opened:'2026-10-01',productId:'checking'});
        await host.getByRole('button',{name:'Show amounts'}).waitFor();
        assert.equal(calls.filter(x=>x.endsWith('/accounts/sync')).length,0);
        const visibleSnapshot=await host.innerText();
        assert.ok(visibleSnapshot.includes('••••••'),'transaction amount masked by default; rendered='+JSON.stringify(visibleSnapshot));
        assert.equal(visibleSnapshot.includes(' · 500 USD'),false);
        await host.getByRole('button',{name:'Show amounts'}).click();
        assert.ok((await host.innerText()).includes('500 USD'),'user must explicitly reveal money');
        await host.getByRole('button',{name:'Hide amounts'}).click();
        for(const width of [320,375,390,430]){
          await page.setViewportSize({width,height:760});
          const size=await host.evaluate(n=>({
            page:innerWidth,scroll:n.scrollWidth,
            internal:[...n.querySelectorAll('*')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>({tag:e.tagName,cls:e.className,scroll:e.scrollWidth,client:e.clientWidth})),
            buttons:[...n.querySelectorAll('button')].map(b=>b.getBoundingClientRect().height),
            overflow:[...n.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,text:e.textContent.slice(0,50)}))
          }));
          assert.ok(size.scroll<=size.page+1,name+' overflow at '+width+': '+JSON.stringify(size));
          assert.ok(size.buttons.every(x=>x>=44),name+' insufficient button targets');
          const output=process.env.BT_BROWSER_RESULTS||'/tmp/plaid-fallback-browser-results';
          await fs.mkdir(output,{recursive:true});
          await page.screenshot({path:path.join(output,name+'-plaid-fallback-'+width+'.png'),fullPage:true});
        }
        // The explicit slot-cost CTA replaces redundant acknowledgements.
        const connect=host.getByRole('button',{name:'Connect via Plaid · uses 1 lifetime slot'});
        await connect.click();
        assert.equal(calls.some(x=>x.includes('link-token')),false,'Institution name required before any new Item');
        const nameField=host.getByLabel('Bank name');
        await nameField.fill('Synthetic Bank');
        await host.getByText('This bank is already connected · Review').waitFor();
        await connect.click();
        assert.equal(calls.some(x=>x.includes('link-token')),false,'Duplicate Plaid bank blocked by default');
        await host.getByRole('checkbox').last().check();
        assert.equal(calls.filter(x=>x.includes('link-token')).length,0,'Duplicate override alone must not start linking');
        await nameField.fill('Other Bank');
        assert.equal(await host.getByText('This bank is already connected · Review').isVisible(),false);
        assert.equal(await host.getByRole('checkbox').count(),0,'The duplicate override is hidden again when switching banks');
        await connect.click();
        await page.waitForFunction(()=>!!window.syntheticLink);
        assert.equal(await connect.isDisabled(),true);
        assert.equal(calls.filter(x=>x.includes('link-token')).length,1);
        assert.equal(await page.evaluate(()=>window.syntheticLink.token),'synthetic-link-token');
        await page.evaluate(()=>{window.syntheticLink.onSuccess('synthetic-public-token');window.syntheticLink.onExit();});
        await host.getByText('Plaid Trial · 2/10 used').waitFor();
        assert.equal(calls.filter(x=>x.endsWith('/exchange')).length,1,'successful SDK handoff exchanges exactly once');
        await page.waitForFunction(()=>document.querySelector('#target')?.textContent?.includes('Available transactions import automatically.'));
        assert.equal(calls.filter(x=>x.endsWith('/accounts/sync')).length,0,
          'Plaid backend starts first read-only import at exchange, without a browser sync');
        const event=await page.evaluate(()=>window.bankSuccessEvents.at(-1));
        assert.deepEqual(event,{status:'ready',count:1},'successful bank connection must be reported to Finances');
        assert.equal((await host.locator('.plaid-trial-message').innerText()).includes('Connected'),true,
          'Plaid Link closing cannot erase a successful bank-connection confirmation');
        assert.equal(calls.filter(x=>x.endsWith('/link-token')).length,1,'discovery never creates another lifetime Item');
        // A delayed response for one owner must never be shown after a user
        // switch, even when the panel remains mounted on the same page.
        holdAccounts=true;
        const waiting=new Promise(resolve=>{accountWaiting=resolve});
        await page.evaluate(()=>window.BTLinkPlaidTrial.mount(document.getElementById('target'),[]));
        await waiting;
        await page.evaluate(()=>{window.syntheticToken='different-owner'});
        releaseAccount();
        await host.getByText('Sign-in changed. Reopen bank connections.',{exact:true}).waitFor();
        assert.equal(await host.getByText('Synthetic Bank · Checking',{exact:true}).count(),0,
          'another owner must never see a stale account response');
        assert.deepEqual(errors,[]);
        console.log(name+': compact Plaid setup, new-Item slot disclosure, duplicate protection and masked evidence passed');
      }finally{await browser.close()}
    }
  }finally{server.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
