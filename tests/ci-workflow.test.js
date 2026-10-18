'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {plan}=require('./ci-scope.cjs'),{groups,inventory}=require('./ci-units.cjs');
const selected=plan('pull_request',['app.js']);
assert.deepEqual(selected.areas,['bonus','cloud','ui']);
assert.deepEqual(selected.browsers,['chromium']);
for(const event of ['push','schedule','workflow_dispatch'])
 assert.deepEqual(plan(event,['app.js']).browsers,['chromium']);
assert.equal(plan('pull_request',['app.js'],false).financeOnly,false);
assert.equal(inventory().length,new Set(Object.values(groups).flat()).size,'No unit suite is dropped or duplicated');

const workflow=fs.readFileSync('.github/workflows/close-rules.yml','utf8');
const browser=fs.readFileSync('.github/workflows/verified-product-browser.yml','utf8');
assert.ok(workflow.includes("cron: '23 8 * * *'"));
assert.ok(!workflow.includes("cron: '23 * * * *'"));
assert.ok(workflow.includes("github.event_name == 'schedule' && 'scheduled' || 'release'"),'Nightly never shares release concurrency');
assert.ok(workflow.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}"),'Only superseded PRs can cancel; releases and schedules cannot');
assert.ok(workflow.includes('needs: [plan, units]')&&workflow.includes('needs: [plan, units, browsers]'),'Browser waits for unit areas and release waits for the browser');
assert.ok(workflow.includes('fail-fast: false'),'Parallel unit areas still fail independently');
assert.ok(workflow.includes('Browser checks / Chromium'));
assert.ok(!workflow.includes('matrix.browser')&&!workflow.includes('fromJSON(needs.plan.outputs.browsers)'),'Never restore the multi-engine matrix');
assert.ok(browser.includes('mcr.microsoft.com/playwright:v1.58.2-noble'));
assert.ok(browser.includes("chownSync(require('node:os').homedir()"),'Container home is writable without replacing HOME');
assert.ok(browser.includes('BT_BROWSER: chromium')&&!browser.includes('inputs.browser'),'Reusable workflow is pinned to Chromium');
assert.ok(browser.includes('name: browser-chromium-${{ github.run_attempt }}'),'Failure artifacts use the Chromium name');
for(const text of [workflow,browser])
 assert.ok(!/playwright[^\n]* install(?: --with-deps)? (?:chromium|firefox|webkit)/.test(text),'Never download browsers during runs');

const config=fs.readFileSync('tests/playwright.config.cjs','utf8');
assert.ok(config.includes('retries:1')&&config.includes('timeout:180000'));
assert.ok(config.includes("projects:[{name:'chromium'}]"),'The Playwright project is Chromium only');
const entries=require('./browser-select.cjs'),original=process.env.BT_BROWSER;
try{
 delete process.env.BT_BROWSER;
 assert.deepEqual(entries({chromium:1,firefox:2,webkit:3}),[['chromium',1]]);
 process.env.BT_BROWSER='chromium';
 assert.deepEqual(entries({chromium:1,firefox:2,webkit:3}),[['chromium',1]]);
 for(const invalid of ['firefox','webkit','unknown']){
  process.env.BT_BROWSER=invalid;
  assert.throws(()=>entries({chromium:1,firefox:2,webkit:3}),/only supports Chromium/);
 }
 delete process.env.BT_BROWSER;
 assert.throws(()=>entries({firefox:2,webkit:3}),/Chromium browser engine is unavailable/);
}finally{if(original===undefined)delete process.env.BT_BROWSER;else process.env.BT_BROWSER=original}
console.log('CI coverage passed: all unit areas, Chromium-only Playwright, isolated nightly, pinned browser and retries');


// Offer updates are a writer workflow, not an ephemeral release-step rewrite.
const feedWriter=fs.readFileSync('.github/workflows/refresh-bank-feed.yml','utf8');
assert.ok(feedWriter.includes("cron: '17 */6 * * *'"),'Bank offers must refresh every six hours');
assert.ok(feedWriter.includes('python3 scripts/update-bank-feed.py'),'The publisher invokes the canonical RSS collector');
assert.ok(feedWriter.includes('git push origin HEAD:main'),'The refreshed JSON is committed, not lost in a temporary CI workspace');
assert.ok(feedWriter.includes('gh workflow run close-rules.yml --ref main'),'Updated feed receives verified Pages publication');
assert.ok(!workflow.includes('python3 scripts/update-bank-feed.py'),'Release verification cannot alter an uncommitted feed snapshot');
