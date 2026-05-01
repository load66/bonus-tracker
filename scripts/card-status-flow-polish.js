/* ✅ Version 3.3.4 Newest update: Card status flow polish — Requirement Deadline wording + hide Effort. */
(function(){
  const VER='3.3.4';

  function badge(){
    const b=document.querySelector('.app-version');
    if(b)b.textContent='v'+VER;
    window.btVisibleAppVersion=VER;
  }

  function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
  function isVisible(el){
    if(!el||!el.getBoundingClientRect)return false;
    const r=el.getBoundingClientRect();
    const s=getComputedStyle(el);
    return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';
  }
  function closestCard(el){
    let p=el;
    for(let i=0;p&&i<9;i++,p=p.parentElement){
      const txt=clean(p.textContent);
      const r=p.getBoundingClientRect?.();
      if(r&&r.width>220&&r.height>100&&/\$\d/.test(txt)&&/(OPENED|Opened|RECEIVED|Received|REQ MET|Req Met|HOLD UNTIL|Hold Until)/.test(txt))return p;
    }
    return null;
  }
  function leafTextNodes(root){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(n){
      const t=clean(n.nodeValue);
      if(!t)return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[];
    let n;
    while((n=walker.nextNode()))nodes.push(n);
    return nodes;
  }
  function setTextNode(n,value){
    if(clean(n.nodeValue)!==value)n.nodeValue=n.nodeValue.replace(clean(n.nodeValue),value);
  }

  function cardPhase(card){
    const t=clean(card.textContent).toLowerCase();
    if(/ready to churn|time to churn/.test(t))return 'readyChurn';
    if(/cooling down|churn eligible|days? left to churn/.test(t))return 'cooldown';
    if(/early closure fee|close fee countdown|safe close|hold until/.test(t))return 'hold';
    if(/received/.test(t)&&/req met/.test(t))return 'waitingOrHold';
    if(/req met/.test(t)&&!/received/.test(t))return 'waitingBonus';
    return 'working';
  }

  function replaceCountdownWording(){
    leafTextNodes(document.body).forEach(n=>{
      const t=clean(n.nodeValue);
      if(t!=='Countdown Active')return;
      const card=closestCard(n.parentElement);
      const phase=card?cardPhase(card):'working';
      let next='Requirement Deadline';
      if(phase==='hold'||phase==='waitingOrHold')next='Hold / Do Not Close';
      if(phase==='cooldown')next='Cooling Down';
      if(phase==='readyChurn')next='Ready to Churn';
      if(phase==='waitingBonus')next='Waiting for Bonus';
      setTextNode(n,next);
    });
  }

  function polishTimerLine(){
    leafTextNodes(document.body).forEach(n=>{
      let t=clean(n.nodeValue);
      if(!/\b\d+d left\b/i.test(t))return;
      const card=closestCard(n.parentElement);
      const all=clean(card?.textContent||'').toLowerCase();
      if(/early closure fee/i.test(t)||/early closure fee/.test(all)){
        const m=t.match(/(\d+d)\s*left/i);
        if(m)setTextNode(n,`${m[1]} left before safe close`);
        return;
      }
      if(/requirement deadline/i.test(t))return;
      if(/churn/i.test(t))return;
      if(/to requirement deadline/i.test(t))return;
      const m=t.match(/(\d+d)\s*left\s*:?\s*(.*)$/i);
      if(m){
        const detail=clean(m[2]);
        const next=detail?`${m[1]} left to finish bonus: ${detail}`:`${m[1]} left to finish bonus`;
        setTextNode(n,next);
      }
    });
  }

  function hideEffortBlocks(){
    const labels=Array.from(document.querySelectorAll('body *')).filter(el=>{
      if(!isVisible(el))return false;
      const t=clean(el.textContent);
      return t==='EFFORT' || t==='Effort';
    });
    labels.forEach(label=>{
      let block=label.parentElement;
      for(let i=0;block&&i<3;i++,block=block.parentElement){
        const t=clean(block.textContent);
        const r=block.getBoundingClientRect?.();
        if(!r)continue;
        if(/\bEFFORT\b/i.test(t)&&/(Easy|Medium|Hard|Low|High)/i.test(t)&&r.width<260&&r.height<120){
          block.style.display='none';
          block.setAttribute('data-bt-hidden-effort','1');
          return;
        }
      }
      label.style.display='none';
      let sib=label.nextElementSibling;
      if(sib&&/^(Easy|Medium|Hard|Low|High)$/i.test(clean(sib.textContent))){
        sib.style.display='none';
        sib.setAttribute('data-bt-hidden-effort','1');
      }
    });
  }

  function addStyle(){
    if(document.getElementById('bt_card_status_flow_style'))return;
    const st=document.createElement('style');
    st.id='bt_card_status_flow_style';
    st.textContent=`
      [data-bt-hidden-effort="1"]{display:none!important;}
    `;
    document.head.appendChild(st);
  }

  function apply(){
    badge();
    addStyle();
    replaceCountdownWording();
    polishTimerLine();
    hideEffortBlocks();
  }

  window.btCardStatusFlowPolishVersion=VER;
  window.btCardStatusFlowPolishApply=apply;

  setTimeout(apply,150);
  setTimeout(apply,700);
  setTimeout(apply,1600);
  setTimeout(apply,3000);
  setInterval(apply,1200);
  const obs=new MutationObserver(()=>setTimeout(apply,0));
  setTimeout(()=>{try{obs.observe(document.body,{childList:true,subtree:true,characterData:true})}catch{}},300);
})();
