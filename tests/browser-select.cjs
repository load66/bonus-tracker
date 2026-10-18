'use strict';
// Owner-selected release coverage: Chromium plus WebKit (iPhone Safari engine).
module.exports=function browserEntries(engines){
  const selected=process.env.BT_BROWSER||'chromium';
  if(!['chromium','webkit'].includes(selected))throw Error('BonusTracker Playwright supports Chromium and WebKit; got BT_BROWSER='+selected);
  if(!engines||!Object.hasOwn(engines,selected))throw Error(selected+' browser engine is unavailable');
  return [[selected,engines[selected]]];
};
