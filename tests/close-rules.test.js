'use strict';
const core=require('../close-rules-core.js');
const report=core.runSelfTests();
for(const row of report.results)console.log(`${row.ok?'PASS':'FAIL'} ${row.name}${row.ok?'':': '+row.detail}`);
if(!report.ok){console.error(`Close-rule tests failed: ${report.passed}/${report.total}`);process.exit(1)}
console.log(`Close-rule tests passed: ${report.passed}/${report.total} · v${report.version}`);

const assert=require('node:assert/strict');
const hold={bank:'Synthetic Date Anchor',opened:'2026-01-01',bonusRecd:'2026-05-01',minHoldDays:30,closeRuleSource:'manual',closeRestrictionType:'manual-fixed',closeRuleBasis:'reqmet',closeBufferDays:0};
for(const reqMet of ['', 'unknown', '2026-02-30', '2026-2-01']){
  assert(!core.safeCloseDate({...hold,reqMet}), 'Unknown or invalid requirements anchor must remain unresolved: '+reqMet);
  assert.equal(core.daysUntilSafe({...hold,reqMet},'2026-10-18'),null);
}
assert.equal(core.safeCloseDate({...hold,reqMet:'2026-02-28'}),'2026-03-30');
assert.equal(core.safeCloseDate({...hold,closeRuleBasis:'unsupported',reqMet:'2026-02-28'}),null);
