'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {plan}=require('./ci-scope.cjs'),{groups,inventory}=require('./ci-units.cjs');
const selected=plan('pull_request',['app.js']);
assert.deepEqual(selected.areas,['bonus','cloud','ui']);
assert.deepEqual(selected.browsers,['chromium','webkit']);
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
assert.ok(workflow.includes('matrix:\n        browser: [chromium, webkit]'));
assert.ok(workflow.includes('fail-fast: false'));
assert.ok(workflow.includes('browser: ${{ matrix.browser }}'));
assert.ok(!workflow.includes('fromJSON(needs.plan.outputs.browsers)'),'Browser matrix is explicit');
assert.ok(browser.includes('mcr.microsoft.com/playwright:v1.58.2-noble'));
assert.ok(browser.includes("chownSync(require('node:os').homedir()"),'Container home is writable without replacing HOME');
assert.ok(browser.includes('BT_BROWSER: ${{ inputs.browser }}'),'Reusable workflow selects Chromium or WebKit');
assert.ok(browser.includes('name: browser-${{ inputs.browser }}-${{ github.run_attempt }}'),'Artifacts identify each browser');
for(const text of [workflow,browser])
 assert.ok(!/playwright[^\n]* install(?: --with-deps)? (?:chromium|firefox|webkit)/.test(text),'Never download browsers during runs');

const config=fs.readFileSync('tests/playwright.config.cjs','utf8');
assert.ok(config.includes('retries:1')&&config.includes('timeout:180000'));
assert.ok(config.includes("projects:[{name:process.env.BT_BROWSER||'chromium'}]"),'Playwright engine follows selected browser');
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

const publisher=fs.readFileSync('.github/workflows/refresh-bank-feed.yml','utf8');
assert.ok(publisher.includes("cron: '23 */6 * * *'"),'RSS publisher must run once every 6 hours');
assert.ok(publisher.includes('contents: write')&&publisher.includes('git push origin HEAD:main'),'RSS snapshots must persist in the repository');
assert.ok(publisher.includes('actions/upload-pages-artifact@v4')&&publisher.includes('actions/deploy-pages@v4'),'RSS changes must reach Pages even when made by GITHUB_TOKEN');
assert.ok(publisher.includes("github.event.workflow_run.conclusion == 'success'"),'Publish once after green main release');
assert.ok(publisher.includes('python3 scripts/watch-quick-add-sources.py'),'Official source checks must be scheduled with the bank feed');
assert.ok(publisher.includes("f.get('records') else 1"),'Release-triggered source watch may seed only an uninitialized snapshot');
assert.ok(publisher.includes('data/quick-add-source-monitor.json'),'Public monitor results must be committed and published');
assert.ok(!workflow.includes('python3 scripts/update-bank-feed.py'),'Release verification may not overwrite the packaged site with an uncommitted RSS update');
console.log('CI coverage passed: all unit areas, parallel Chromium/WebKit, isolated nightly, pinned browser and retries');
