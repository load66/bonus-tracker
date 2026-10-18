'use strict';
const assert=require('node:assert/strict');
const core=require('../cloud-terms-core.js');

const source={
 id:'CHA-P-01',bank:'Synthetic Chase',accountType:'P',opened:'2026-10-15',bonus:900,
 tcSourceRaw:'Verbatim enrolled 2026 $900 offer; keep open until bonus credits.',
 feeScheduleRaw:'Original PDF: $15 per month; specific waiver schedule; early fee 2026.',
 monthlyFeeAmountText:'$15',
 monthlyFeeWaiverText:'$500 electronic deposits OR $1,500 minimum beginning-day balance.',
 earlyTerminationFeeText:'$25 fee if account closed in 180 days.',
 promoSourceUrl:'https://example.test/offer',
 feeScheduleSourceUrl:'https://example.test/saved-fees.pdf',
 financialRules:{version:2,accounts:[{role:'primary',fee:{amount:15,waiver:{operator:'any',conditions:[
  {kind:'direct-deposit',amount:500},{kind:'balance-hold',metric:'minimum-beginning-day-balance',amount:1500}
 ]}}}],closure:{earlyCloseFee:25,minHoldDays:180}},
 eligibilityRules:[{basis:'account-closed',periodValue:24,periodUnit:'months'}],
 churn:'1',churnability:'repeatable',churnBasis:'bonus',
 churnRuleText:'No bonus if earlier bonus received during the past 12 months.',
 churnReason:'Exact synthetic enrolled offer',churnDecisionSource:'original-promotion',
 churnDecisionConfidence:'High',eligibilityVerifiedAt:'2026-10-15',
 extraSensitiveBankBalance:2000
};
const before=JSON.stringify(source);
const raw=core.snapshot(source),data=JSON.parse(raw);
assert.equal(data.format,'BonusTrackerHistoricalTerms');
assert.equal(data.version,1);
assert.equal(data.entryId,'CHA-P-01');
assert.equal(data.accountType,'personal');
assert.equal(data.tcSourceRaw,source.tcSourceRaw);
assert.equal(data.feeScheduleRaw,source.feeScheduleRaw);
assert.deepEqual(data.financialRules,source.financialRules);
assert.deepEqual(data.eligibilityRules,source.eligibilityRules);
assert.equal(data.churn,source.churn);
assert.equal(data.churnBasis,'bonus');
assert.equal(data.churnRuleText,source.churnRuleText);
assert.equal(data.churnDecisionSource,source.churnDecisionSource);
assert.equal(data.eligibilityVerifiedAt,'2026-10-15');
assert.equal(data.extraSensitiveBankBalance,undefined,'Only approved T&C fields may be transmitted');
assert.equal(JSON.stringify(source),before,'Cloud serialization is read-only');
assert.equal(core.snapshot(source),raw,'Same historical terms must have deterministic content identity');

const newer={...source,tcSourceRaw:'Different written promotion from 2027',opened:'2027-09-01'};
const oldVersion={...source,entryId:source.id,source:'new-cycle',opened:source.opened};
const grouped={chase:{current:newer,versions:[oldVersion]}};
const snapshots=core.collect([source],grouped).map(JSON.parse);
assert.equal(snapshots.length,3,'Each distinct historical revision must be preserved');
assert(snapshots.some(x=>x.tcSourceRaw===source.tcSourceRaw));
assert(snapshots.some(x=>x.tcSourceRaw===newer.tcSourceRaw));
assert.equal(core.collect([source,source],{}).length,1,'Identical version deduplicates');
assert.equal(core.snapshot({bank:'Unknown Bank',id:'x'}),null,'No saved evidence must not invent a T&C history');
assert.equal(core.snapshot({id:'x'}),null,'Missing bank identity is not archivable');

const {sandbox,storage}=require('./full-app-smoke.test.js');
const beforeStorage=JSON.stringify([...storage]);
assert.equal(typeof sandbox.btParseEntryFileText,'function');
assert.equal(typeof sandbox.btImportEntryFileObject,'function');
assert.equal(typeof sandbox.BTFinancialRules.validate,'function');
assert.equal(typeof sandbox.BTTermsHistory.open,'function');
assert.equal(typeof sandbox.BTTermsHistory.sync,'function');
assert.equal(typeof sandbox.BTTermsHistory.queueSync,'function','Archived term changes should trigger independent authenticated R2 sync');
assert.equal(typeof sandbox.BTCloudCore.restore,'function');
assert.equal(typeof sandbox.BTTermsCore.collect,'function');
assert.equal(JSON.stringify([...storage]),beforeStorage,'Historical display and import inspection must not write records');
const index=require('node:fs').readFileSync('index.html','utf8');
assert(index.indexOf('cloud-terms-core.js')<index.indexOf('cloud-terms-history.js'));
assert(index.indexOf('cloud-backup.js')<index.indexOf('cloud-terms-history.js'));

(async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),local=new Map();let queued=0;
 const store={getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)};
 const ctx={window:{BTTermsHistory:{queueSync(){queued++}}},localStorage:store,
 sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 navigator:{},AbortController,setTimeout,clearTimeout,Date,JSON,
 fetch:async()=>({ok:true,status:200,json:async()=>({access_token:'test-token',refresh_token:'test-refresh',expires_in:3600})})};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('bonus-ai-auth.js','utf8'),ctx);
 await ctx.window.BTBonusAuth.signIn('synthetic@example.test','synthetic-value');
 assert.equal(queued,1,'Sign-in must queue immutable cloud T&C upload');
 assert.equal(ctx.window.BTBonusAuth.connected(),true);
 console.log('Historical T&C cloud and sign-in tests passed');
})().catch(err=>{console.error(err);process.exitCode=1});

