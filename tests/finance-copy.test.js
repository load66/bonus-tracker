'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'finance-page.js'),'utf8');
for(const phrase of [
 'Financial activity is partial',
 'History still loading',
 'Net worth requires complete',
 'unknown amount is not $0.00',
 'Review flagged activity',
 'Provider changed this transaction',
 'verified truth',
 'pending review'
]){
  assert(!source.toLowerCase().includes(phrase.toLowerCase()),
    'Finance-facing copy contains outdated jargon: '+phrase);
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
assert(html.includes('./finance-insights-core.js?v=3.4.77-finances3'));
assert(html.includes('./finance-unified-core.js?v=3.4.77-finances3'));
assert(html.includes('./finance-page.js?v=3.4.77-finances3'));
assert(html.includes('./sw.js?v=3.4.77-finances3'));
assert(sw.includes("const V = 'bt-v3.4.77-finances3'"));
assert(sw.includes("'./finance-insights-core.js'"));
console.log('Finance release copy, route scope and offline assets are aligned.');
