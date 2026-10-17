'use strict';
module.exports=function browserEntries(engines){
  const selected=process.env.BT_BROWSER;
  if(!selected)return Object.entries(engines); // Standalone harnesses retain all three browsers.
  if(!Object.hasOwn(engines,selected))throw Error('Unknown BT_BROWSER: '+selected);
  return [[selected,engines[selected]]];
};
