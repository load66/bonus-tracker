'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'finance-page.js'),'utf8');
const css=fs.readFileSync(path.join(root,'finance-page.css'),'utf8');
const unified=fs.readFileSync(path.join(root,'finance-unified-core.js'),'utf8');
const banned=/\b(?:provider|observation|verified|unverified|timestamp|snapshot|capped|evidence)\b/i;
let checked=0;
// Inspect the direct, static labels provided to finance text/button helpers. This
// deliberately does not inspect internal code comments, API paths or data keys.
for(const match of src.matchAll(/\b(?:el|action|metric|statusMessage|sectionTitle)\s*\(([^;\n]{0,700})/g)){
  const literal=[...match[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(v=>v[1]);
  for(const item of literal){
    if(!/[a-z]{3}/i.test(item)||/finance-(?:page|spending|overview|net-worth|modal)/.test(item))continue;
    assert.ok(!banned.test(item),'Technical copy must not be visible: '+item);
    if(/^[A-Z][a-z]/.test(item)||/^[A-Z].* \w/.test(item)){
      assert.ok(item.length<=90,'Inline Finance copy must be at most 90 characters: '+item);
      checked++;
    }
  }
}
assert.ok(checked>35,'Finance copy inventory unexpectedly empty');
assert.ok(src.includes("sectionTitle(host,'Net worth')"));
assert.ok(src.includes("'Chart builds as your accounts sync.'"));
assert.ok(src.includes("'Review',()=>showNetWorthReview(excluded)"));
assert.ok(src.includes("summary.netWorthExclusions"));
assert.ok(src.includes("summary.netWorthExclusions?.length"));
assert.ok(src.includes("history.length>=2"),'Net worth range chips require at least two history points');
assert.ok(src.includes("'Excluded'")&&src.includes("'Not updated'"));
assert.ok(src.includes("modal=sheet('Accounts to review')"));
assert.ok(src.includes("'Some balances not updated · Review'"),'Partial balances must offer an actionable review list');
assert.ok(src.includes('syncLabel(currentCombined.lastSuccess)'),'Overview timestamps must use short relative labels');
assert.ok(src.includes("kind==='creditCards'?creditCardNetAmount(groups[kind])"),'Credit-card category must show net credit or owed');
assert.ok(!src.includes('Partial net worth · missing or provisional balances'));
assert.ok(!src.includes("'Updated '+stamp(currentCombined.lastSuccess)"));
assert.ok(!src.includes("'Credit card balances reflect the last provider observation"));
assert.ok(!src.includes("'Not included: '+notes.join"));
assert.ok(css.includes('.finance-net-worth-review-item'));
assert.ok(css.includes('.finance-net-worth-empty-chart'));
assert.ok(unified.includes("DEFAULT_TREATMENT[kind]||saved.balanceMode"),
  'Legacy automatic exclusions should not override recognized asset defaults');
console.log('Finance copy audit passed: '+checked+' labels checked, short Net worth status, review sheet and quiet chart');
