'use strict';
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,firefox,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const output=process.env.BT_BROWSER_RESULTS||'/tmp/bonus-evidence-results';
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const p=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!p.startsWith(root+path.sep))throw Error();
    res.setHeader('Content-Type',mime[path.extname(p)]||'text/plain');
    res.end(await fs.readFile(p));
  }catch{res.writeHead(404);res.end();}
});
const NOW=1792134000,accountKey='a'.repeat(64),opened='2026-10-01';
const entry={id:'bonus-evidence-test',bank:'Synthetic Bank',accountType:'personal',opened,bonus:200};
const sample=(cycleId,reviews={},extra=0)=>{const result=({
  configured:true,connected:true,evidenceOnly:true,status:'connected',lastSuccess:NOW,nextSyncAt:NOW+86400,
  accounts:[{key:accountKey,name:'Checking <img src=x onerror=alert(1)>',bank:'Synthetic Bank',currency:'USD',balance:'250.00',balanceDate:NOW}],
  mappings:{[accountKey]:{entryId:cycleId,bank:entry.bank,opened}},
  missingAccounts:[],monitoredAccounts:[accountKey],evidenceReviews:{[accountKey]:reviews},
  transactions:{[accountKey]:{
    a:{id:'a',amount:'500.00',posted:NOW-100,description:'Employer Direct Deposit <script>alert(1)</script>',signals:['possible_direct_deposit'],kind:'other_deposit',pending:false},
    b:{id:'b',amount:'200.00',posted:NOW-110,description:'Promotional Bonus <img src=x>',signals:['possible_bonus'],kind:'possible_bonus',pending:false},
    c:{id:'c',amount:'-15.00',posted:NOW-120,description:'Monthly Service Fee',signals:['possible_fee'],kind:'withdrawal',pending:false},
    d:{id:'d',amount:'-5.00',posted:NOW-130,description:'Promo Reversal',signals:['possible_reversal'],kind:'possible_reversal',pending:false},
    e:{id:'e',amount:'200.00',posted:NOW-140,description:'Pending Bonus',signals:['possible_bonus'],kind:'possible_bonus',pending:true}
  }}
});
for(let i=0;i<extra;i++){
  result.transactions[accountKey]['more'+i]={
    id:'more'+i,posted:NOW-200-i,amount:String(200+i)+'.00',
    kind:'other_deposit',description:'Synthetic ACH Payroll '+i,
    signals:['possible_direct_deposit'],pending:false
  };
}
return result;
};
(async()=>{
  await fs.mkdir(output,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    for(const [browserName,engine] of Object.entries({chromium,firefox,webkit})){
      const browser=await engine.launch();
      try{
        const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},timezoneId:'America/Chicago'});
        const page=await context.newPage(),errors=[],requests=[];
        let cycleId=entry.id,reviews={},extra=0;
        page.on('pageerror',err=>errors.push(err.message));
        // During production smoke, NEVER send synthetic session headers to any live API.
      if(process.env.BT_BROWSER_SITE_URL)await page.route('https://api-production-00f74.up.railway.app/**',route=>route.abort());
      await page.route('https://api-production-00f74.up.railway.app/api/bonus-tracker/simplefin**',async route=>{
          const path=new URL(route.request().url()).pathname,method=route.request().method();
          const payload=method==='PUT'&&route.request().postData()?route.request().postDataJSON():null;
          requests.push({path,method,body:payload});
          if(path.endsWith('/evidence-review')){
            if(payload.decision==='clear')delete reviews[payload.transaction];
            else reviews[payload.transaction]={
              status:payload.decision,reviewedAt:NOW,
              requirementId:payload.requirementId||null
            };
          }
          await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(sample(cycleId,reviews,extra))});
        });
        await page.addInitScript(({entry})=>{
          const RealDate=Date,now=Date.parse('2026-10-16T07:00:00Z');
          window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now;}};
          localStorage.setItem('bt_e_v4',JSON.stringify([entry]));
          localStorage.setItem('bonus-ai-auth',JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_at:4102444800}));
        },{entry});
        await page.goto(process.env.BT_BROWSER_SITE_URL||'http://127.0.0.1:'+server.address().port+'/');
        const section=page.getByRole('region',{name:'Bank bonus activity evidence'});
        await section.getByRole('button',{name:'Review bank activity',exact:true}).waitFor();
        cycleId=await page.evaluate(()=>entries[0].id);
        const before=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
        assert.equal(requests.length,0,'private bank evidence must load only after explicit review');
        await section.getByRole('button',{name:'Review bank activity',exact:true}).click();
        await section.getByRole('heading',{name:'Linked bonus campaigns'}).waitFor();
        await section.getByText('Possible direct deposit',{exact:true}).waitFor();
        assert.ok((await section.innerText()).includes('Possible bonus payout'));
        assert.ok((await section.innerText()).includes('Possible bank fee'));
        assert.ok((await section.innerText()).includes('Possible bonus reversal'));
        assert.ok(!(await section.innerText()).includes('Pending Bonus'),'pending transactions are excluded from the evidence list');
        assert.equal(await section.locator('img').count(),0,'untrusted bank labels and transaction descriptions must render as safe text');
        assert.equal(await section.locator('.bonus-evidence-card').count(),1);
        assert.equal(await section.locator('.bonus-evidence-row').count(),4);
        assert.equal(await section.locator('.bonus-evidence-row>b').first().innerText(),'••••••','amounts hidden by default');
        // Review a posted deposit and verify the queue shrinks without writing tracker data.
        await section.getByRole('button',{name:'Mark reviewed',exact:true}).first().click();
        await section.getByText('Review saved. Promotion requirements remain unconfirmed.').waitFor();
        assert.equal(Object.values(reviews).filter(x=>x.status==='reviewed').length,1);
        assert.equal(await section.locator('.bonus-evidence-row').count(),3);
        assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before);
        // A dismissed bonus must be suppressible without marking the payout received.
        await section.getByRole('button',{name:'Not relevant',exact:true}).first().click();
        await section.getByText('Not relevant saved.').waitFor();
        assert.equal(Object.values(reviews).filter(x=>x.status==='dismissed').length,1);
        assert.equal(await section.locator('.bonus-evidence-row').count(),2);
        assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before);
        await section.getByRole('button',{name:'Show reviewed / dismissed',exact:true}).click();
        assert.equal(await section.locator('.bonus-evidence-row').count(),4);
        await section.getByRole('button',{name:'Undo review',exact:true}).first().click();
        await section.getByText('Review reopened.').waitFor();
        assert.equal(Object.keys(reviews).length,1,'undo clears exactly one receipt');
        await section.getByRole('button',{name:'Show transaction amounts'}).click();
        assert.ok((await section.innerText()).includes('$200.00'));
        await section.getByRole('button',{name:'Hide transaction amounts'}).click();
        for(const width of [320,390,430]){
          await page.setViewportSize({width,height:760});
          const geometry=await section.evaluate(n=>({viewport:innerWidth,section:n.getBoundingClientRect().width,content:n.scrollWidth}));
          assert.ok(geometry.section<=geometry.viewport+1&&geometry.content<=geometry.section+1,
            browserName+' evidence view overflows at '+width+': '+JSON.stringify(geometry));
          await page.screenshot({path:path.join(output,browserName+'-bonus-evidence-'+width+'.png')});
        }
        assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before,'review cannot modify bonus entry data');
        await section.getByRole('button',{name:'Open tracker'}).click();
        assert.equal(await page.evaluate(()=>expanded),cycleId,'review action opens exactly the matching bonus cycle');
        assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before);
        await page.getByRole('region',{name:'Bank bonus activity evidence'}).getByRole('button',{name:'Review payout'}).click();
        assert.equal(await page.evaluate(()=>rcvPrompt?.entryId),cycleId,'review payout delegates to existing explicit confirmation dialog');
        assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before,'no automatic payout completion');
        await page.evaluate(()=>{rcvPrompt=null;R()});
        await page.getByRole('button',{name:'Finances',exact:true}).click();
        await page.getByRole('button',{name:'Tracker',exact:true}).click();
        const reopened=page.getByRole('region',{name:'Bank bonus activity evidence'});
        await reopened.getByRole('button',{name:'Review bank activity',exact:true}).waitFor();
        assert.equal(await reopened.locator('.bonus-evidence-card').count(),0,'evidence must be cleared when leaving the Tracker');
        await reopened.getByRole('button',{name:'Review bank activity',exact:true}).click();
        await reopened.getByRole('heading',{name:'Linked bonus campaigns'}).waitFor();
        await reopened.getByRole('button',{name:'Show reviewed / dismissed',exact:true}).click();
        assert.equal(await reopened.getByRole('button',{name:'Undo review',exact:true}).count(),1,
          'a dismissed receipt persists across a cleared and reloaded session');
        assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before,
          'reviewing evidence must never change canonical tracker records');
        // Large queues must remain accessible, not permanently clipped to
        // 5 pending / 10 total entries. The first few remain compact.
        extra=14;
        await reopened.getByRole('button',{name:'Hide reviewed items'}).click();
        await reopened.getByRole('button',{name:'Refresh',exact:true}).click();
        await reopened.getByRole('button',{name:'Show 5 more to review'}).waitFor();
        assert.equal(await reopened.locator('.bonus-evidence-row').count(),5,
          'first render remains compact even with many pending deposits');
        await reopened.getByRole('button',{name:'Show 5 more to review'}).click();
        assert.equal(await reopened.locator('.bonus-evidence-row').count(),10);
        await reopened.getByRole('button',{name:'Show 5 more to review'}).click();
        assert.equal(await reopened.locator('.bonus-evidence-row').count(),15);
        const remainder=await reopened.getByRole('button',{name:/Show \d+ more to review/}).allTextContents();
        assert.equal(remainder.length,1,'remaining pending history must be reachable');
        await reopened.getByRole('button',{name:/Show \d+ more to review/}).click();
        assert.equal(await reopened.getByRole('button',{name:/Show \d+ more to review/}).count(),0,
          'no pending evidence should become stranded behind paging');
        assert.equal(await reopened.locator('.bonus-evidence-row').count(),17);
        assert.equal(await reopened.locator('img').count(),0,'long queues must safely escape untrusted descriptions');
        await reopened.getByRole('button',{name:'Show reviewed / dismissed'}).click();
        assert.equal(await reopened.getByRole('button',{name:'Undo review'}).count(),1,
          'resolved receipts must remain reachable even with many pending entries');
        await reopened.getByRole('button',{name:'Hide reviewed items'}).click();
        await page.setViewportSize({width:320,height:760});
        const geometry=await reopened.evaluate(n=>({viewport:innerWidth,width:n.getBoundingClientRect().width,content:n.scrollWidth}));
        assert.ok(geometry.width<=geometry.viewport+1&&geometry.content<=geometry.width+1,
          browserName+' long review queue overflows 320px: '+JSON.stringify(geometry));
        assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before);
        assert.deepEqual(errors,[],'no browser errors');
        console.log(browserName+': safe bonus evidence, privacy, exact tracker matching, manual payout and mobile layout passed');
      }finally{await browser.close();}
    }
  }finally{server.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
