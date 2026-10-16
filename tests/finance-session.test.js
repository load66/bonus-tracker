'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../finance-page.js'),'utf8');
const jwt=(sub,iss='synthetic-issuer',revision=1)=>'header.'+
  Buffer.from(JSON.stringify({sub,iss,revision})).toString('base64url')+'.signature';
async function scenario({method='PUT',redraw=false,nextToken=jwt('alice'),disconnect=false,replace=false}={}){
  let token=jwt('alice'),connected=true,finish,fetches=0;
  const auth={connected:()=>connected,token:async()=>token};
  const context={window:{BTBonusAuth:auth,addEventListener(){}},
    document:{getElementById:()=>null},setTimeout,clearTimeout,AbortController,atob,
    fetch:async()=>{fetches++;return new Promise(resolve=>{finish=()=>resolve({ok:true,json:async()=>({saved:true})})})}};
  vm.createContext(context);
  // Expose the real private request function only inside this isolated test VM.
  vm.runInContext(source.replace('  window.btRefreshFinancesPage=refresh;',
    '  window.testRequest=request; window.btRefreshFinancesPage=refresh;'),context);
  const pending=context.window.testRequest('/account-profiles',{method});
  while(!finish)await Promise.resolve();
  if(redraw)context.window.btRefreshFinancesPage();
  token=nextToken;connected=!disconnect;
  if(replace)context.window.BTBonusAuth={...auth};
  finish();
  return {pending,fetches};
}
(async()=>{
  for(const method of ['PUT','POST','DELETE']){
    const {pending,fetches}=await scenario({method,redraw:true});
    assert.equal((await pending).saved,true,'same-owner redraw must retain successful writes');
    assert.equal(fetches,1,'accepted writes must never be retried automatically');
  }
  assert.equal((await (await scenario({redraw:true,nextToken:jwt('alice','synthetic-issuer',2)})).pending).saved,true,
    'same-owner token rotation must retain successful writes');
  await assert.rejects((await scenario({method:'GET',redraw:true})).pending,/view refreshed/);
  for(const options of [{nextToken:jwt('bob')},{nextToken:jwt('alice','other-issuer')},
    {disconnect:true},{replace:true},{nextToken:'unparseable-rotated-token'}]){
    for(const redraw of [false,true])
      await assert.rejects((await scenario({...options,redraw})).pending,/Sign-in changed/);
  }
  console.log('Financial session safety passed: same-owner redraws, token rotation, stale reads, logout, account and issuer changes');
})().catch(error=>{console.error(error);process.exitCode=1});
