'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm');
const {sandbox:s}=require('./full-app-smoke.test.js');
const run=x=>vm.runInContext(x,s);
assert.equal(s.normalizeUserDatapoint({bank:'Test',method:'ACH'}).source,'legacy-unverified');
console.log('Datapoint provenance smoke passed');
