'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=['finance-page.js','finance-insights-core.js','finance-overview-core.js','finance-unified-core.js'];
const banned=/\b(?:provider|observation|verified|unverified|snapshot|timestamp|capped|evidence)\b/i;
let visible=0;
for(const filename of files){
  const src=fs.readFileSync(path.join(root,filename),'utf8');
  const lines=src.split('\n');
  const inDetail=line=>/\b(?:openDetail|openAccount|removeAccount|confirmFinance)\s*\(/.test(line);
  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();
    if(line.startsWith('//')||line.startsWith('*')||line.startsWith('/*'))continue;
    // Scan UI-writing calls, not technical identifiers/route strings/comments.
    if(!/\b(?:el|action|metric|statusMessage|confirmFinance)\s*\(/.test(line)&&
       !/\b(?:settingsNotice|connectionNotice)\s*=/.test(line))continue;
    const quoted=[...line.matchAll(/'([^'\n]{2,260})'/g)].map(match=>match[1]);
    for(const literal of quoted){
      if(!/[a-z]{3}/i.test(literal)||
         /^(?:finance-|is-|\/|https?:|aria-|bt_|[A-Z_]{6,})/.test(literal)||
         /[<>{}()[\]=]/.test(literal))continue;
      if(!/\s/.test(literal))continue;
      visible++;
      assert.ok(!banned.test(literal),
        filename+':'+(i+1)+' prohibited finance copy: '+literal);
      if(!inDetail(line)){
        assert.ok(literal.length<=90,
          filename+':'+(i+1)+' status text exceeds 90 characters: '+literal);
      }
    }
  }
}
assert.ok(visible>=75,'Finances UI text scan is unexpectedly empty');
const page=fs.readFileSync(path.join(root,'finance-page.js'),'utf8');
assert.ok(page.includes("'Chart builds as your accounts sync.'"));
assert.ok(page.includes("'Accounts not included'"));
assert.ok(!page.includes('bank timestamp not verified'));
assert.ok(!page.includes('Credit card balances reflect the last provider'));
console.log('Finance copy audit: '+visible+' user-facing strings checked');
