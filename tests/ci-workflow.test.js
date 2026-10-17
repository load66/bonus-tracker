'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {plan}=require('./ci-scope.cjs'),{groups,inventory}=require('./ci-units.cjs');
const selected=plan('pull_request',['app.js']);
assert.deepEqual(selected.areas,['bonus','cloud','ui']);assert.deepEqual(selected.browsers,['webkit','chromium','firefox']);
for(const event of ['push','schedule','workflow_dispatch'])assert.deepEqual(plan(event,['app.js']).browsers,['webkit','chromium','firefox']);
assert.equal(plan('pull_request',['app.js'],false).financeOnly,false);
assert.equal(inventory().length,new Set(Object.values(groups).flat()).size,'No unit suite is dropped or duplicated');
const workflow=fs.readFileSync('.github/workflows/close-rules.yml','utf8'),browser=fs.readFileSync('.github/workflows/verified-product-browser.yml','utf8');
assert.ok(workflow.includes("cron: '23 8 * * *'"));assert.ok(!workflow.includes("cron: '23 * * * *'"));
assert.ok(workflow.includes("github.event_name == 'schedule' && 'scheduled' || 'release'"),'Nightly never shares release concurrency');
assert.ok(workflow.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}"),'Only superseded PRs can cancel; releases and schedules cannot');
assert.ok(workflow.includes('needs: [plan, units]')&&workflow.includes('needs: [plan, units, browsers]'),'Every browser waits for unit areas and release waits for all browsers');
assert.ok(workflow.includes('fail-fast: false'));
assert.ok(browser.includes('mcr.microsoft.com/playwright:v1.58.2-noble'));
assert.ok(browser.includes("chownSync(require('node:os').homedir()"),'Firefox home ownership matches the container user without replacing HOME');
for(const text of [workflow,browser])assert.ok(!/playwright[^\n]* install(?: --with-deps)? (?:chromium|firefox|webkit)/.test(text),'Never download browser binaries each run');
const config=fs.readFileSync('tests/playwright.config.cjs','utf8');assert.ok(config.includes('retries:1')&&config.includes('timeout:180000'));
const entries=require('./browser-select.cjs'),original=process.env.BT_BROWSER;
try{
 delete process.env.BT_BROWSER;assert.equal(entries({chromium:1,firefox:2,webkit:3}).length,3);
 process.env.BT_BROWSER='webkit';assert.deepEqual(entries({chromium:1,firefox:2,webkit:3}),[['webkit',3]]);
 process.env.BT_BROWSER='unknown';assert.throws(()=>entries({webkit:1}));
}finally{if(original===undefined)delete process.env.BT_BROWSER;else process.env.BT_BROWSER=original}
console.log('CI coverage passed: remaining suites, three-browser parallel gates, daily isolation, no downloads and per-test retries');
