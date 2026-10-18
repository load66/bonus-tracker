'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {plan}=require('./ci-scope.cjs'),{groups,inventory}=require('./ci-units.cjs');
const selected=plan('pull_request',['app.js']);
assert.deepEqual(selected.areas,['bonus','cloud','ui']);
assert.deepEqual(selected.browsers,['chromium']);
for(const event of ['push','schedule','workflow_dispatch'])
 assert.deepEqual(plan(event,['app.js']).browsers,['chromium','webkit']);
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
assert.ok(workflow.includes('Browser checks / ${{ matrix.browser }}'));
assert.ok(workflow.includes('fromJSON(needs.plan.outputs.browsers)'),'Release engines follow the tested scope plan');
assert.ok(browser.includes('mcr.microsoft.com/playwright:v1.58.2-noble'));
assert.ok(browser.includes("chownSync(require('node:os').homedir()"),'Container home is writable without replacing HOME');
assert.ok(browser.includes('BT_BROWSER: ${{ inputs.browser }}'),'Reusable workflow selects the gated engine');
assert.ok(browser.includes('name: browser-${{ inputs.browser }}-${{ github.run_attempt }}'),'Failure artifacts preserve each engine');
for(const text of [workflow,browser])
 assert.ok(!/playwright[^\n]* install(?: --with-deps)? (?:chromium|firefox|webkit)/.test(text),'Never download browsers during runs');

const config=fs.readFileSync('tests/playwright.config.cjs','utf8');
assert.ok(config.includes('retries:1')&&config.includes('timeout:180000'));
assert.ok(config.includes("projects:[{name:process.env.BT_BROWSER||'chromium'}]"),'The Playwright project honors its selected engine');
const entries=require('./browser-select.cjs'),original=process.env.BT_BROWSER;
try{
 delete process.env.BT_BROWSER;
 assert.deepEqual(entries({chromium:1,firefox:2,webkit:3}),[['chromium',1]]);
 process.env.BT_BROWSER='chromium';
 assert.deepEqual(entries({chromium:1,firefox:2,webkit:3}),[['chromium',1]]);
 process.env.BT_BROWSER='webkit';
 assert.deepEqual(entries({chromium:1,webkit:3}),[['webkit',3]]);
 for(const invalid of ['firefox','unknown']){
  process.env.BT_BROWSER=invalid;
  assert.throws(()=>entries({chromium:1,firefox:2,webkit:3}),/supports Chromium and WebKit/);
 }
 delete process.env.BT_BROWSER;
 assert.throws(()=>entries({firefox:2,webkit:3}),/chromium browser engine is unavailable/);
}finally{if(original===undefined)delete process.env.BT_BROWSER;else process.env.BT_BROWSER=original}
console.log('CI coverage passed: all unit areas, Chromium PRs, Chromium + WebKit releases, isolated nightly, pinned browsers and retries');
