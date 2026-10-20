'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm');
const {sandbox:s,storage}=require('./full-app-smoke.test.js');
const {fixture}=require('./fixtures/financial-rules.cjs');
const run=code=>vm.runInContext(code,s);
const future=run('addD(td(),20)'),past=run('addD(td(),-2)'),today=run('td()');
const rows=['action','payout','hold','opportunity','unknown','reached'].map((key,i)=>({id:'SYN-Q-'+key,bank:'Synthetic '+key,accountType:'personal',bonus:100+i,opened:'2026-01-01'}));
const suggestion=(key,stage,date,confirmed=true)=>({entryId:'SYN-Q-'+key,bank:'Synthetic '+key,stageCode:stage,stageLabel:stage,task:{title:'Review '+key,cta:'Review saved task'},dateContext:{date,confirmed}});
const suggestions=[suggestion('action','IN_PROGRESS',future),suggestion('payout','AWAITING_BONUS',future),suggestion('hold','HOLD_OPEN',future),suggestion('opportunity','ELIGIBLE',past),suggestion('unknown','AWAITING_BONUS','',false),suggestion('reached','AWAITING_BONUS',past)];
run('entries='+JSON.stringify(rows));
s.getAttentionSuggestions=()=>suggestions;
const before=JSON.stringify([...storage]),facts=JSON.stringify(rows);
function section(html,key){return html.match(new RegExp('<section[^>]*data-queue="'+key+'"[\\s\\S]*?</section>'))?.[0]||'';}
try{
 const html=s.BT360.tasks(rows);
 assert.match(html,/data-queue="needs"/,'Dashboard must expose separate action groups');
 assert.match(section(html,'needs'),/>3 tasks<\/span>/,'Waiting and opportunities must not inflate the task count');
 assert.doesNotMatch(section(html,'needs'),/data-attention-id="SYN-Q-(payout|hold|opportunity)"/);
 assert.match(section(html,'waiting'),/SYN-Q-payout/);assert.match(section(html,'waiting'),/SYN-Q-hold/);
 assert.match(section(html,'opportunities'),/SYN-Q-opportunity/);
 assert.match(html,/Expected by/);assert.match(html,/Hold until/);
 assert.equal((html.match(/data-attention-id=/g)||[]).length,rows.length,'Every action remains reachable exactly once');
 assert.match(html,/>Review saved task<\/button>/,'Primary action names its actual purpose');
 for(const row of rows){s.BT360.toggleAttention(row.id);assert.equal((s.BT360.tasks(rows).match(/is-selected/g)||[]).length,1,'Selection must work across groups');}
 assert.equal(s.BT360.dashboardQueueFor(suggestion('payout','AWAITING_BONUS',today),rows[1]),'needs','Payout date reached needs review');
 assert.equal(s.BT360.dashboardQueueFor(suggestion('hold','HOLD_OPEN','2026-02-30'),rows[2]),'needs','Invalid date cannot hide an account in waiting');
 assert.equal(s.BT360.dashboardQueueFor(suggestion('hold','HOLD_OPEN',future,false),rows[2]),'needs');
 const cooling=fixture();Object.assign(cooling,{id:'SYN-Q-cooling',closed:run('addD(td(),-10)'),bonusRecd:run('addD(addM(td(),-12),18)')});
 const c={entryId:cooling.id,bank:cooling.bank,stageCode:'COOLDOWN',task:{title:'Wait for eligibility'},dateContext:{date:future,confirmed:true}};
 assert.equal(s.BT360.dashboardQueueFor(c,cooling),'upcoming','Verified upcoming cooldown should use the existing Eligible soon section');
 s.getAttentionSuggestions=()=>[c];
 assert.doesNotMatch(s.BT360.tasks([cooling]),/data-attention-id=/);
 assert.match(s.BT360.eligibleSoon([cooling]),/Synthetic Community CU/,'Excluded cooldown must remain visible in Eligible soon');
 const unverified={...cooling,financialRules:null,eligibilityRules:[],eligibilityEvidenceText:'',eligibilityEvidenceSource:'',sourceEligibilityBasis:'',churnBasis:'',churn:''};
 assert.equal(s.BT360.dashboardQueueFor(c,unverified),'needs','Unknown eligibility must remain a review item');
 s.getAttentionSuggestions=()=>suggestions.filter(x=>['payout','hold'].some(k=>x.entryId.endsWith(k)));
 const onlyWaiting=s.BT360.tasks(rows);
 assert.match(section(onlyWaiting,'needs'),/>0 tasks<\/span>/);assert.match(onlyWaiting,/No immediate tasks/);assert.match(onlyWaiting,/<h3>Waiting<\/h3>/);
 const priorSearch=s.btRadarSearch;let searched='';s.btRadarSearch=value=>{searched=value};s.BT360.viewOffers('Synthetic Offer Bank');assert.equal(searched,'Synthetic Offer Bank','Offer search must be set even before its input or feed has loaded');s.btRadarSearch=priorSearch;
 assert.equal(JSON.stringify(rows),facts);assert.equal(JSON.stringify([...storage]),before,'Grouping or selection wrote financial data');
 console.log('Dashboard queue passed: accurate action counts, waiting dates, opportunities, reached/unknown date review, no cooldown duplicates, selection and no writes.');
 process.exit(0);
}catch(error){console.error(error);process.exit(1)}
