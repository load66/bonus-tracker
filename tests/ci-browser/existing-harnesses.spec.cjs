'use strict';
const {test,expect}=require('@playwright/test');
const {spawn}=require('node:child_process');
const path=require('node:path');
const all=['bonus-evidence.e2e.cjs','finance-page.e2e.cjs','bank-sync.e2e.cjs','plaid-fallback.e2e.cjs','browser-e2e.cjs'];
const live=['bank-sync.e2e.cjs','bonus-evidence.e2e.cjs','finance-page.e2e.cjs'];
for(const file of process.env.BT_BROWSER_SITE_URL?live:all){
 test(file,async({},info)=>{
  const result=await new Promise(resolve=>{
   const child=spawn(process.execPath,[path.join(__dirname,'..',file)],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,BT_BROWSER:info.project.name,BT_BROWSER_RESULTS:info.outputPath('screenshots')},stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
   let stdout='',stderr='',timedOut=false;
   child.stdout.on('data',data=>{stdout+=data;process.stdout.write(data)});child.stderr.on('data',data=>{stderr+=data;process.stderr.write(data)});
   const timer=setTimeout(()=>{timedOut=true;try{if(process.platform!=='win32')process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL')}catch{child.kill('SIGKILL')}},165000);
   child.on('error',error=>{clearTimeout(timer);resolve({code:-1,stdout,stderr:stderr+error.message,timedOut})});
   child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr,timedOut})});
  });
  await info.attach('harness-output',{body:result.stdout+'\n'+result.stderr,contentType:'text/plain'});
  expect(result.timedOut,'Harness must finish within its per-test deadline').toBe(false);
  expect(result.code,result.stderr||file+' failed').toBe(0);
 });
}
