/* Finances 3.4.83: finance-only transfer guard. Source bank evidence remains untouched. */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BTFinanceTransfer=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const destination=/\b(?:bank|fcu|credit\s*union|savings|checking|brokerage|investing|investment|ira|citibank|citi|u\.?\s*s\.?\s*bank|capital\s*one|chase|wells\s*fargo|bofa|bank\s*of\s*america|amex|american\s*express|discover|synchrony|lafayette|navy\s*federal|paypal|venmo|cash\s*app|zelle|x\s*money|one\s*pay|onepay|robinhood|fidelity|schwab|vanguard)\b/i;
  const investor=/\b(?:brokerage|investing|investment|ira|robinhood|fidelity|schwab|vanguard)\b/i;
  const issuer=/\b(?:capital\s*one|u\.?\s*s\.?\s*bank|citibank|citi|amex|american\s*express|discover|chase|synchrony|wells\s*fargo|bofa|bank\s*of\s*america|robinhood|fidelity|schwab|vanguard)\b/i;
  const bareIssuer=/^\s*(?:capital\s*one|u\.?\s*s\.?\s*bank|citibank|citi|amex|american\s*express|discover|chase|synchrony|wells\s*fargo|bofa|bank\s*of\s*america)\s*$/i;
  const payment=/\b(?:pmt|pymt|payment|autopay|epay|crcardpmt|ccpmt|cardmember\s*payment)\b/i;
  const investAction=/\b(?:contribution|contribute|deposit|funding|transfer|add\s*cash)\b/i;
  const fromTo=/^\s*(?:to|from)\s+(.+?)\s*$/i;
  const accountArrow=/^\s*(?:savings|checking|brokerage|investment|retirement|cash\s*account)\s*(?:\(\d{4}\)|[·*x]+\d{4})?\s*(?:→|->| to )\s*(?:savings|checking|brokerage|investment|retirement|cash\s*account)\s*(?:\(\d{4}\)|[·*x]+\d{4})?\s*$/i;
  const phone=/\b(?:t[-\s]?mobile|verizon|at&t|at\s*&\s*t)\b/i;
  const subscription=/\b(?:icloud|apple\s*(?:subscription|bill|\.com\/bill)|netflix|spotify)\b/i;
  const shopping=/\b(?:apple|amazon|walmart|target|costco|best buy|ebay|etsy)\b/i;
  const groceries=/\b(?:walmart|costco|aldi|kroger|grocery|whole foods|safeway)\b/i;
  const dining=/\b(?:restaurant|mcdonald|starbucks|chipotle|doordash|ubereats|grubhub|taco bell)\b/i;
  const gas=/\b(?:shell|exxon|chevron|quiktrip|casey'?s|gas station)\b/i;
  const amountCents=value=>{
    const m=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value??'').trim());
    if(!m)return null;
    const v=BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0')||'0');
    return m[1]==='-'?-v:v;
  };
  function categorize(row){
    if(!row||['user','user_rule'].includes(row.categorySource))return null;
    const value=amountCents(row.amount),text=String(row.description||row.merchant||'').trim();
    if(value===null||value===0n||row.pending)return null;
    if((row.signals||[]).includes('matched_internal_transfer'))return {category:'transfer',signal:'matched_internal_transfer'};
    if(accountArrow.test(text))return {category:'transfer',signal:investor.test(text)?'investment_transfer':'matched_internal_transfer'};
    const direction=fromTo.exec(text);
    if(direction&&destination.test(direction[1]))
      return {category:'transfer',signal:investor.test(direction[1])?'investment_transfer':'ownership_unconfirmed'};
    if(value<0n&&bareIssuer.test(text))return {category:'transfer',signal:'card_payment'};
    if(issuer.test(text)&&payment.test(text))return {category:'transfer',signal:'card_payment'};
    if(investor.test(text)&&investAction.test(text))return {category:'transfer',signal:'investment_transfer'};
    if(row.category==='transfer')return {category:'transfer',signal:'transfer'};
    if((row.signals||[]).includes('possible_transfer'))return {category:'unreviewed',signal:'possible_transfer'};
    if(value<0n&&(value%100n===0n||-value>=100000n)&&
       (direction||destination.test(text)))return {category:'unreviewed',signal:'possible_transfer'};
    if(value<0n){
      if(subscription.test(text))return {category:'subscription'};
      if(phone.test(text))return {category:'utilities'};
      if(groceries.test(text))return {category:'groceries'};
      if(dining.test(text))return {category:'dining'};
      if(gas.test(text))return {category:'transportation'};
      if(shopping.test(text))return {category:'shopping'};
    }
    return null;
  }
  function effective(row){
    const match=categorize(row),signals=[...(row?.signals||[])];
    if(match?.signal&&!signals.includes(match.signal))signals.push(match.signal);
    return {...row,category:match?.category||row?.category||'unreviewed',signals};
  }
  function label(row){
    const item=effective(row),signals=item.signals;
    // A person's correction overrides stale provider/pattern labels as well as totals.
    if(['user','user_rule'].includes(item.categorySource)&&item.category!=='transfer')
      return item.category==='income'&&signals.includes('paycheck')?'Paycheck':null;
    if(signals.includes('paycheck')&&item.category==='income')return 'Paycheck';
    if(signals.includes('possible_paycheck')&&item.category==='unreviewed')return 'Possible paycheck';
    if(signals.includes('card_payment'))return 'Card payment';
    if(signals.includes('investment_transfer'))return 'Investment transfer';
    if(item.category==='transfer')return 'Transfer';
    if(signals.includes('possible_transfer')&&item.category==='unreviewed')return 'Possible transfer';
    return null;
  }
  const isTransfer=row=>{
    const item=effective(row);
    if(['user','user_rule'].includes(item.categorySource)&&item.category!=='transfer')return false;
    return item.category==='transfer'||item.signals.some(s=>['matched_internal_transfer','investment_transfer','card_payment'].includes(s));
  };
  return Object.freeze({categorize,effective,label,isTransfer,amountCents});
});
