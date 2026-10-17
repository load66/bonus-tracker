'use strict';
const FINANCE=/^(?:finance-[^/]+\.(?:js|css)|(?:bank-sync|plaid-fallback)\.(?:js|css)|tests\/(?:finance-[^/]+\.(?:test\.js|e2e\.cjs)|(?:bank-sync|plaid-fallback)\.e2e\.cjs)|docs\/(?:FINANCIAL_ACCOUNTS|SIMPLEFIN)\.md)$/;
function plan(event,files,complete=true){
  const financeOnly=event==='pull_request'&&complete&&files.length>0&&files.every(file=>FINANCE.test(file));
  return {financeOnly,areas:financeOnly?['finance']:['finance','bonus','cloud','ui'],browsers:financeOnly?['webkit','chromium']:['webkit','chromium','firefox']};
}
module.exports={plan};
