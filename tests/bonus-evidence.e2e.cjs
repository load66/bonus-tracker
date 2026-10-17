'use strict';
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,firefox,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep))throw Error();
    res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');res.end(await fs.readFile(file));
  }catch{res.writeHead(404);res.end();}
});
const NOW=1792134000,accountKey='a'.repeat(64);
const entry={id:'background-bonus-test',bank:'Synthetic Bank',accountType:'personal',opened:'2026-10-01',bonus:200};
const state={configured:true,connected:true,evidenceOnly:true,status:'connected',lastSuccess:NOW,nextSyncAt:NOW+86400,
  accounts:[{key:accountKey,name:'Checking',bank:'Synthetic Bank',currency:'USD',balance:'250.00',balanceDate:NOW}],
  mappings:{[accountKey]:{entryId:entry.id,bank:entry.bank,opened:entry.opened}},missingAccounts:[],monitoredAccounts:[accountKey],
  transactions:{[accountKey]:{bonus:{id:'bonus',amount:'200.00',posted:NOW-100,description:'Promotional credit',signals:['possible_bonus'],kind:'possible_bonus',pending:false}}}};
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    for(const [browserName,engine] of Object.entries({chromium,firefox,webkit})){
      const browser=await engine.launch();
      try{
        const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},timezoneId:'America/Chicago'});
        const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.route('https://api-production-00f74.up.railway.app/**',route=>route.abort());
        await page.route('https://api-production-00f74.up.railway.app/api/bonus-tracker/simplefin**',route=>
          route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(state)}));
        await page.addInitScript(({entry})=>{
          const RealDate=Date,now=Date.parse('2026-10-16T07:00:00Z');
          window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now;}};
          localStorage.setItem('bt_e_v4',JSON.stringify([entry]));
          localStorage.setItem('bonus-ai-auth',JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_at:4102444800}));
        },{entry});
        await page.goto(process.env.BT_BROWSER_SITE_URL||'http://127.0.0.1:'+server.address().port+'/');
        await page.waitForFunction(()=>typeof window.BTBonusAuth?.connected==='function'&&window.BTBonusAuth.connected());
        const before=await page.evaluate(()=>localStorage.getItem('bt_e_v4'));
        await page.getByRole('button',{name:'Finances',exact:true}).click();
        const finances=page.getByRole('region',{name:'My finances'});await finances.getByRole('heading',{name:'Finances'}).waitFor();
        assert.equal(await finances.getByRole('button',{name:'Bonuses',exact:true}).count(),0,'Finance has no Bonuses navigation');
        assert.equal(await finances.getByText('Bonus activity',{exact:true}).count(),0,'Finance menu has no bonus-only destination');
        assert.equal(await finances.getByRole('region',{name:'Bank bonus activity evidence'}).count(),0,'Bonus evidence UI is not mounted');
        const background=await page.evaluate(({state,entry,now})=>({
          evidence:Boolean(window.BTBonusEvidenceCore?.summarize),
          requirements:Boolean(window.BTBonusRequirementProgress?.evaluate),
          candidates:window.BTBonusEvidenceCore.summarize(state,[entry],now).counts.bonus
        }),{state,entry,now:NOW});
        assert.deepEqual(background,{evidence:true,requirements:true,candidates:1},
          'Hidden bonus engines must remain loaded and continue classifying provider activity');
        assert.equal(await page.evaluate(()=>localStorage.getItem('bt_e_v4')),before,'Finance rendering must not mutate bonus records');
        assert.deepEqual(errors,[],'no browser errors');
        console.log(browserName+': Finance hides bonus UI while background evidence engines remain active');
      }finally{await browser.close();}
    }
  }finally{server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
