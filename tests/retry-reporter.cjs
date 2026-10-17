'use strict';
const fs=require('node:fs');
class RetryReporter{
 constructor(){this.flaky=[]}
 onTestEnd(test,result){
  if(result.status==='passed'&&result.retry>0){const name=test.titlePath().join(' / ');this.flaky.push(name);console.log('::warning title=Passed only on retry::'+name+' passed on retry '+result.retry)}
 }
 onEnd(){
  const text=this.flaky.length?'### Browser tests that required retry\n'+this.flaky.map(x=>'- '+x).join('\n')+'\n':'Browser checks: no tests required retry.\n';
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,text);
 }
}
module.exports=RetryReporter;
