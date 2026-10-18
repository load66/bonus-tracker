'use strict';
const path=require('node:path');
module.exports={
 testDir:path.join(__dirname,'ci-browser'),testMatch:'*.spec.cjs',fullyParallel:false,workers:1,
 timeout:180000,expect:{timeout:10000},retries:1,
 outputDir:process.env.BT_BROWSER_RESULTS||'/tmp/bonus-browser-results/test-results',
 reporter:[['list'],['json',{outputFile:'/tmp/bonus-browser-results/results.json'}],[path.join(__dirname,'retry-reporter.cjs')]],
 use:{actionTimeout:10000,navigationTimeout:20000},
 projects:[{name:'chromium'}]
};
