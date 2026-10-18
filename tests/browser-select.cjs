'use strict';
// Chromium is the only supported Playwright engine for all BonusTracker runs.
module.exports=function browserEntries(engines){
  const selected=process.env.BT_BROWSER||'chromium';
  if(selected!=='chromium')throw Error('BonusTracker Playwright only supports Chromium; got BT_BROWSER='+selected);
  if(!engines||!Object.hasOwn(engines,'chromium'))throw Error('Chromium browser engine is unavailable');
  return [['chromium',engines.chromium]];
};
