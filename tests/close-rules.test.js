'use strict';
const core=require('../close-rules-core.js');
const report=core.runSelfTests();
for(const row of report.results)console.log(`${row.ok?'PASS':'FAIL'} ${row.name}${row.ok?'':': '+row.detail}`);
if(!report.ok){console.error(`Close-rule tests failed: ${report.passed}/${report.total}`);process.exit(1)}
console.log(`Close-rule tests passed: ${report.passed}/${report.total} · v${report.version}`);
