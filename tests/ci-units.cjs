'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const groups={

 bonus:['requirement-deadlines.test.js','close-rules.test.js','financial-rules.test.js','structured-import.test.js','entry-file-import.test.js','eligibility-gate.test.js','churn-buffer.test.js','countdown-options.test.js','fee-review-migration.test.js','bonus-ai.test.js','bonus-ai-auth.test.js','bank-feed.test.js','bank-feed.test.py'],
 cloud:['persistence-transaction.test.js','cloud-recovery.test.js','icloud-migration.test.js','cloud-terms.test.js','cloud-protection.test.js','restore-reset-safety.test.js','archive-integrity.test.js','undo-integrity.test.js','history-repair.test.js'],
 ui:['tracker-tools.test.js','dashboard-queue.test.js','tracker-selection.test.js','full-app-smoke.test.js','detail-content.test.js','hero-months.test.js','semantic-status.test.js','smart-attention.test.js','professional-ops.test.js','end-to-end.test.js','operations-interactions.test.js','next-actions.test.js','specific-actions.test.js','research-tabs.test.js','hardening-regression.test.js','ci-workflow.test.js','read-integrity.test.js','tax-history.test.js','account-overview.test.js']
};
function inventory(){
 const listed=Object.values(groups).flat(),actual=fs.readdirSync(__dirname).filter(n=>/\.test\.(js|py)$/.test(n)).sort();
 if(new Set(listed).size!==listed.length||JSON.stringify(listed.slice().sort())!==JSON.stringify(actual))throw Error('Every unit suite must belong to exactly one CI area; update the inventory instead of omitting tests');
 return listed;
}
function run(area){
 inventory();if(!Object.hasOwn(groups,area))throw Error('Choose a known CI unit area');
 let failed=false;
 for(const file of groups[area]){
  const start=Date.now(),python=file.endsWith('.py');
  const result=spawnSync(python?'python3':process.execPath,[...(python?['-B']:[]),'tests/'+file],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:60000,env:process.env});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
  console.log(file+': '+(Date.now()-start)+' ms');
  if(result.error||result.status!==0){failed=true;console.error(file+' failed'+(result.error?' or timed out: '+result.error.message:''))}
 }
 return failed?1:0;
}
module.exports={groups,inventory,run};
if(require.main===module)process.exitCode=run(process.argv[2]);

