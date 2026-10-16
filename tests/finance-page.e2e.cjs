'use strict';
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,firefox,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),output=process.env.BT_BROWSER_RESULTS||'/tmp/finance-page-browser-results';
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  try{
    const name=new URL(req.url,'http://localhost').pathname;
    const p=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!p.startsWith(root+path.sep))throw Error();
    res.setHeader('Content-Type',mime[path.extname(p)]||'text/plain');res.end(await fs.readFile(p));
  }catch{res.writeHead(404);res.end();}
});
const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64),NOW=1792134000;
const seed={
  configured:true,connected:true,status:'connected',evidenceOnly:true,lastSuccess:NOW,nextSyncAt:NOW+86400,
  accounts:[
    {key:A,bank:'Synthetic CU',name:'Checking <img src=x>',currency:'USD',balance:'1250.50',balanceDate:NOW-400},
    {key:B,bank:'Other Credit Union',name:'Savings',currency:'USD',balance:null,balanceDate:null},
    {key:C,bank:'Overseas Bank',name:'Foreign',currency:'EUR',balance:'500',balanceDate:NOW}
  ],
  monitoredAccounts:[A],mappings:{},
  transactions:{
    [A]:{
      credit:{id:'credit',amount:'200.00',posted:NOW-60,kind:'deposit',description:'Direct Deposit'},
      debit:{id:'debit',amount:'-15.00',posted:NOW-90,kind:'withdrawal',description:'Purchase <script>alert(1)</script>'}
    },
    [C]:{unrelated:{id:'unrelated',amount:'99999',posted:NOW-60,kind:'deposit'}}
  }
};
(async()=>{
  await fs.mkdir(output,{recursive:true});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  try{
    for(const [name,engine] of Object.entries({chromium,firefox,webkit})){
      const browser=await engine.launch();
      try{
        const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},timezoneId:'America/Chicago'});
        const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.route('https://api-production-00f74.up.railway.app/api/bonus-tracker/simplefin**',async route=>{
          await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(seed)});
        });
        await page.addInitScript(()=>{
          const RealDate=Date,now=Date.parse('2026-10-16T07:00:00Z');
          window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};
          localStorage.setItem('bt_e_v4','[]');
          localStorage.setItem('bonus-ai-auth',JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_at:4102444800}));
        });
        await page.goto('http://127.0.0.1:'+server.address().port+'/');
        await page.getByRole('button',{name:'Finances',exact:true}).click();
        const section=page.getByRole('region',{name:'My finances'});
        await section.getByRole('heading',{name:'Financial overview'}).waitFor();
        await section.getByText('Connected accounts',{exact:false}).count().catch(()=>{});
        await section.locator('.finance-page-account').first().waitFor();
        assert.equal(await section.locator('img').count(),0,'provider aliases must be text, never HTML');
        assert.equal(await section.locator('.finance-page-account').count(),3);
        assert.equal(await section.getByText('Unavailable',{exact:false}).count()>0,true,'missing account balances do not become $0');
        assert.equal(await section.locator('.finance-page-tile').count(),4);
        await section.getByText('Credits',{exact:true}).locator('..').getByText(/200/).waitFor();
        await section.getByText('Debits',{exact:true}).locator('..').getByText(/15/).waitFor();
        await section.getByText('Net observed',{exact:true}).locator('..').getByText(/185/).waitFor();
        assert.ok((await section.innerText()).includes('not verified income'),'flow caveat required');
        const before=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
        await section.getByRole('button',{name:'Hide amounts',exact:true}).click();
        assert.equal(await section.locator('.finance-page-tile strong').first().innerText(),'••••••');
        assert.equal((await section.locator('.finance-page-balance').first().innerText()),'••••••');
        await section.getByRole('button',{name:'Show amounts',exact:true}).click();
        const search=section.getByRole('searchbox',{name:'Search financial accounts'});
        await search.fill('other credit union');
        assert.equal(await section.locator('.finance-page-account:visible').count(),1);
        await search.fill('');
        assert.equal(await section.locator('.finance-page-account:visible').count(),3);
        for(const width of [320,390,430]){
          await page.setViewportSize({width,height:760});
          const geometry=await section.evaluate(e=>({window:innerWidth,scroll:e.scrollWidth,box:e.getBoundingClientRect().width}));
          assert.ok(geometry.scroll<=geometry.window+1&&geometry.box<=geometry.window+1,name+' finance horizontal overflow at '+width+': '+JSON.stringify(geometry));
          assert.equal(await page.locator('.tabs .tb').count(),6,'all six primary tabs remain accessible');
          assert.ok(await page.locator('.tabs .tb').evaluateAll(rows=>rows.every(e=>e.getBoundingClientRect().height>=44)));
          await page.screenshot({path:path.join(output,name+'-finances-'+width+'.png')});
        }
        await section.getByRole('button',{name:'Manage accounts',exact:true}).click();
        await page.getByRole('dialog',{name:'Financial accounts'}).waitFor();
        await page.getByRole('dialog',{name:'Financial accounts'}).getByRole('button',{name:'Done'}).click();
        await section.locator('.finance-page-account').first().waitFor();
        assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before,'no tracker data writes allowed');
        assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('synthetic-access')) ,true,'existing auth persists');
        assert.deepEqual(errors,[],'no unhandled browser errors');
        console.log(name+': Finances page accounting, privacy, XSS, search and six-tab mobile navigation passed');
      }finally{await browser.close();}
    }
  }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
