/*
 * filename: scripts/analyzer/profile-db.js
 * version: 3.2.0
 * purpose: Unified profile metadata database for health checks, conflict warnings, and T&C Learning Inbox.
 * last-touched: unknown
 */
(function(){
  const VER='3.2.0';
  const DB=[
    {id:'academy-bank-elite-investment-checking',bank:'Academy Bank',product:'Elite Investment Checking',type:'personal checking',kind:'direct-deposit',status:'saved',needs:[],baseline:{bonus:500,reqMoney:10000,reqDays:90,count:4,fundingAmount:100,openBy:'2026-05-15'},critical:['bonus','reqMoney','reqDays','count','openBy'],note:'$500 bonus, $100 opening balance, 4 DD totaling $10,000, Online Banking within 90 days.'},
    {id:'busey-bank-personal-checking-levelup',bank:'Busey Bank',product:'Foundation Checking / Pillar Banking',type:'personal checking',kind:'tiered-direct-deposit',status:'saved',needs:[],baseline:{bonus:500,reqMoney:5000,reqDays:90,count:3,openBy:'2026-05-01'},critical:['bonus','reqMoney','reqDays','count','openBy'],note:'Tiered DD + online banking + 3 debit card transactions within 90 days.'},
    {id:'equity-bank-bloom-checking-savings',bank:'Equity Bank',product:'Bloom checking + savings combo',type:'checking + savings',kind:'combo-direct-deposit-debit',status:'saved-needs-bonus-review',needs:['bonus amount'],baseline:{bonus:0,reqMoney:1000,reqDays:45,code:'Bloom'},critical:['reqMoney','reqDays','code'],note:'Bonus amount was not included in pasted T&C; app should flag bonus as Review.'},
    {id:'regions-lifegreen-personal-checking',bank:'Regions Bank',product:'LifeGreen personal checking',type:'personal checking',kind:'ach-direct-deposit',status:'saved-needs-bonus-review',needs:['bonus amount'],baseline:{bonus:0,reqMoney:1000,reqDays:90,openBy:'2027-01-01'},critical:['reqMoney','reqDays','openBy'],note:'Register before opening; bonus amount was not included in pasted T&C.'},
    {id:'pnc-virtual-wallet-consumer-checking',bank:'PNC',product:'Virtual Wallet / Performance Select',type:'personal checking',kind:'tiered-direct-deposit',status:'saved',needs:[],baseline:{bonus:400,reqMoney:5000,reqDays:60,openBy:'2026-05-28'},critical:['bonus','reqMoney','reqDays','openBy'],note:'$100/$400 tiered direct deposit reward.'},
    {id:'bank-of-america-business-advantage-banking',bank:'Bank of America',product:'Business Advantage Banking',type:'business checking',kind:'tiered-new-money-hold',status:'saved',needs:[],baseline:{bonus:750,reqMoney:15000,reqDays:90,fundedDays:30,holdDays:90,openBy:'2026-12-31'},critical:['bonus','reqMoney','reqDays','fundedDays','holdDays','openBy'],note:'$400/$750 new money + day 31–90 maintenance period.'},
    {id:'capital-one-business-checking-sboffer500',bank:'Capital One',product:'Basic / Enhanced Business Checking',type:'business checking',kind:'deposit-hold-transactions',status:'saved',needs:[],baseline:{bonus:500,reqMoney:5000,reqDays:90,fundedDays:30,count:10,code:'SBOFFER500'},critical:['bonus','reqMoney','reqDays','fundedDays','count','code'],note:'$5,000 external deposit + balance hold + 10 transactions.'},
    {id:'bmo-business-checking-tiered-hold',bank:'BMO',product:'Business Checking',type:'business checking',kind:'tiered-balance-hold',status:'saved',needs:[],baseline:{bonus:1000,reqMoney:50000,reqDays:90,fundedDays:30,holdDays:90,openBy:'2026-04-30'},critical:['bonus','reqMoney','reqDays','fundedDays','holdDays','openBy'],note:'Day 30 tier check + day 31–90 hold.'},
    {id:'chase-business-complete-checking',bank:'Chase',product:'Business Complete Checking',type:'business checking',kind:'deposit-hold-transactions',status:'saved',needs:[],baseline:{bonus:500,reqMoney:10000,reqDays:90,fundedDays:30,holdDays:60,count:5},critical:['bonus','reqMoney','reqDays','fundedDays','holdDays','count'],note:'New money, 60-day hold, 5 qualifying transactions.'},
    {id:'wells-fargo-business-checking',bank:'Wells Fargo',product:'Initiate/Navigate/Optimize Business Checking',type:'business checking',kind:'deposit-hold',status:'saved',needs:[],baseline:{bonus:400,reqMoney:2500,reqDays:60,fundedDays:30,holdDays:60,openBy:'2026-05-05'},critical:['bonus','reqMoney','reqDays','fundedDays','holdDays','openBy'],note:'Deposit $2,500 by day 30 and hold through day 60.'},
    {id:'bank-of-america-personal-checking-chart',bank:'Bank of America',product:'Advantage personal checking',type:'personal checking',kind:'tiered-direct-deposit',status:'saved',needs:[],baseline:{bonus:500,reqMoney:10000,reqDays:90},critical:['bonus','reqMoney','reqDays'],note:'Personal checking bonus chart.'},
    {id:'morgan-stanley-private-bank-checking',bank:'Morgan Stanley Private Bank',product:'Checking / Max-Rate Checking',type:'personal checking',kind:'direct-deposit',status:'generic-covered',needs:['dedicated profile optional'],baseline:{},critical:[],note:'Generic-covered profile; dedicated rule can be added if needed.'},
    {id:'us-bank-smartly-checking',bank:'U.S. Bank',product:'Smartly Checking',type:'personal checking',kind:'tiered-direct-deposit',status:'generic-covered',needs:['dedicated profile optional'],baseline:{},critical:[],note:'Generic-covered profile; dedicated rule can be added if needed.'}
  ];
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const slug=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  function all(){return DB.slice();}
  function findById(id){return DB.find(p=>p.id===id)||null;}
  function findForResult(r){
    const id=r?.profileRegistry?.id||r?.reusableChurnProfile?.profileKey||'';
    if(id){const byId=findById(id);if(byId)return byId;}
    const b=slug(r?.bank||''), a=slug(r?.acct||'');
    return DB.find(p=>slug(p.bank)===b && (!a || a.includes(slug(p.product).split('-')[0]) || slug(p.product).includes(a.split('-')[0])))||DB.find(p=>slug(p.bank)===b)||null;
  }
  function health(){
    const total=DB.length;
    const saved=DB.filter(p=>String(p.status).startsWith('saved')).length;
    const needsReview=DB.filter(p=>(p.needs||[]).length||/review/i.test(p.status)).length;
    const generic=DB.filter(p=>p.status==='generic-covered').length;
    return {version:VER,total,saved,generic,needsReview,profiles:all()};
  }
  window.tcV32ProfileDB={version:VER,all,findById,findForResult,health};
})();