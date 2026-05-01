/* ✅ Version 3.2.2 Newest update: Combine floating T&C, Profiles, and Quick Add into one Tools folder button. */
(function(){
  const VER='3.2.2';
  let nativePlus=null;
  let allowNativePlus=false;

  const isVisible=el=>{
    if(!el||!el.getBoundingClientRect)return false;
    const r=el.getBoundingClientRect();
    const s=getComputedStyle(el);
    return r.width>20&&r.height>20&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0;
  };
  const isFixedish=el=>{
    let n=el;
    for(let i=0;n&&i<4;i++,n=n.parentElement){
      const p=getComputedStyle(n).position;
      if(p==='fixed'||p==='sticky')return true;
    }
    return false;
  };
  function findNativePlus(){
    const nodes=Array.from(document.querySelectorAll('button,a,[role="button"],div'));
    const candidates=nodes.filter(el=>{
      const txt=(el.textContent||'').trim();
      const aria=(el.getAttribute('aria-label')||el.getAttribute('title')||'').toLowerCase();
      if(el.id==='bt_tools_folder_btn')return false;
      if(el.closest('#bt_tools_folder_menu'))return false;
      if(txt!=='+'&&!/quick add|add entry|new entry/.test(aria))return false;
      if(!isVisible(el))return false;
      const r=el.getBoundingClientRect();
      const nearBottom=r.top>window.innerHeight*0.45;
      const rightSide=r.left>window.innerWidth*0.55;
      return nearBottom&&rightSide&&isFixedish(el);
    }).sort((a,b)=>{
      const ar=a.getBoundingClientRect(), br=b.getBoundingClientRect();
      return (br.width*br.height)-(ar.width*ar.height);
    });
    if(candidates[0])nativePlus=candidates[0];
    return nativePlus;
  }

  function addStyle(){
    let st=document.getElementById('bt_tools_folder_style');
    if(!st){st=document.createElement('style');st.id='bt_tools_folder_style';document.head.appendChild(st);}
    st.textContent=`
      /* Hide old floating utility buttons. The folder button replaces them. */
      #v32_inbox_btn,#v31_profile_btn{display:none!important;pointer-events:none!important;}
      .bt-native-plus-hidden{opacity:0!important;pointer-events:none!important;transform:scale(.65)!important;}
      #bt_tools_folder_btn{position:fixed;right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 92px);z-index:245;border:0;border-radius:24px;width:76px;height:56px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;box-shadow:0 14px 34px rgba(37,99,235,.34);font:900 12px 'DM Sans',system-ui;letter-spacing:.2px;display:flex;align-items:center;justify-content:center;gap:3px;flex-direction:column;-webkit-tap-highlight-color:transparent;}
      #bt_tools_folder_btn .ico{font-size:21px;line-height:18px}#bt_tools_folder_btn .lbl{font-size:11px;line-height:12px}
      #bt_tools_folder_menu{position:fixed;right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 156px);z-index:246;width:min(244px,calc(100vw - 28px));background:rgba(248,250,252,.98);border:1px solid rgba(148,163,184,.35);border-radius:22px;padding:10px;box-shadow:0 22px 60px rgba(15,23,42,.32);font-family:'DM Sans',system-ui;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);}
      #bt_tools_folder_menu[hidden]{display:none!important}.bt-tools-head{display:flex;align-items:center;justify-content:space-between;padding:6px 8px 10px;color:#0f172a;font-weight:900}.bt-tools-head span{font-size:13px}.bt-tools-x{border:0;background:#e2e8f0;color:#334155;border-radius:999px;width:28px;height:28px;font-weight:900;font-size:18px}.bt-tools-item{width:100%;border:0;border-radius:16px;margin:5px 0;padding:12px 12px;background:white;color:#0f172a;text-align:left;font:900 13px 'DM Sans',system-ui;box-shadow:inset 0 0 0 1px rgba(226,232,240,.9);display:flex;align-items:center;gap:10px}.bt-tools-item small{display:block;color:#64748b;font-weight:700;font-size:11px;margin-top:1px}.bt-tools-item .emoji{font-size:18px;width:24px;text-align:center}.bt-tools-backdrop{position:fixed;inset:0;z-index:244;background:transparent;}
      @media(max-width:430px){#bt_tools_folder_btn{right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 92px);width:76px;height:54px;border-radius:22px}#bt_tools_folder_menu{right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 152px)}}
    `;
  }

  function closeMenu(){document.getElementById('bt_tools_folder_menu')?.setAttribute('hidden','');document.getElementById('bt_tools_backdrop')?.remove();}
  function toggleMenu(){
    ensureMenu();
    const m=document.getElementById('bt_tools_folder_menu');
    if(!m)return;
    if(m.hasAttribute('hidden')){
      const bd=document.createElement('div');bd.id='bt_tools_backdrop';bd.className='bt-tools-backdrop';bd.onclick=closeMenu;document.body.appendChild(bd);
      m.removeAttribute('hidden');
    }else closeMenu();
  }
  function openTC(){closeMenu(); if(typeof window.tcV32OpenLearningInbox==='function')window.tcV32OpenLearningInbox(); else document.getElementById('v32_inbox_btn')?.click();}
  function openProfiles(){closeMenu(); if(typeof window.tcV31OpenProfileLibrary==='function')window.tcV31OpenProfileLibrary(); else document.getElementById('v31_profile_btn')?.click();}
  function runSelfTest(){
    closeMenu();
    if(typeof window.tcV31OpenProfileLibrary==='function')window.tcV31OpenProfileLibrary();
    setTimeout(()=>{ if(typeof window.tcV31RunAndShowSelfTest==='function')window.tcV31RunAndShowSelfTest(); },180);
  }
  function quickAdd(){
    closeMenu();
    const plus=findNativePlus();
    if(plus){
      allowNativePlus=true;
      try{plus.classList.remove('bt-native-plus-hidden');plus.click();}catch(e){}
      setTimeout(()=>{allowNativePlus=false;hideNativePlus();},350);
      return;
    }
    const quick=Array.from(document.querySelectorAll('button,[role="button"],a')).find(el=>/quick add|add entry|new entry/i.test((el.textContent||'')+' '+(el.getAttribute('aria-label')||''))&&isVisible(el));
    if(quick)quick.click();
  }

  function ensureMenu(){
    if(document.getElementById('bt_tools_folder_menu'))return;
    const m=document.createElement('div');m.id='bt_tools_folder_menu';m.setAttribute('hidden','');
    m.innerHTML=`
      <div class="bt-tools-head"><span>Tools Folder</span><button class="bt-tools-x" type="button" onclick="window.btToolsFolderClose&&window.btToolsFolderClose()">×</button></div>
      <button class="bt-tools-item" type="button" onclick="window.btToolsQuickAdd&&window.btToolsQuickAdd()"><span class="emoji">＋</span><span>Quick Add<small>Create a new bank entry</small></span></button>
      <button class="bt-tools-item" type="button" onclick="window.btToolsOpenTC&&window.btToolsOpenTC()"><span class="emoji">📄</span><span>T&C Inbox<small>Save/analyze promo terms</small></span></button>
      <button class="bt-tools-item" type="button" onclick="window.btToolsOpenProfiles&&window.btToolsOpenProfiles()"><span class="emoji">🗂️</span><span>Profiles<small>Saved bank profiles</small></span></button>
      <button class="bt-tools-item" type="button" onclick="window.btToolsRunSelfTest&&window.btToolsRunSelfTest()"><span class="emoji">✅</span><span>Run Self-Test<small>Verify analyzer profiles</small></span></button>
    `;
    document.body.appendChild(m);
  }
  function ensureButton(){
    if(document.getElementById('bt_tools_folder_btn'))return;
    const b=document.createElement('button');b.id='bt_tools_folder_btn';b.type='button';b.innerHTML='<span class="ico">＋</span><span class="lbl">Tools</span>';b.onclick=toggleMenu;document.body.appendChild(b);
  }
  function hideNativePlus(){
    const plus=findNativePlus();
    if(plus&&!allowNativePlus)plus.classList.add('bt-native-plus-hidden');
  }
  function captureNativePlus(e){
    if(allowNativePlus)return;
    const plus=findNativePlus();
    if(!plus)return;
    if(e.target===plus||plus.contains(e.target)){
      e.preventDefault();e.stopImmediatePropagation();toggleMenu();
    }
  }
  function boot(){addStyle();ensureButton();ensureMenu();hideNativePlus();}

  window.btToolsFolderVersion=VER;
  window.btToolsFolderClose=closeMenu;
  window.btToolsQuickAdd=quickAdd;
  window.btToolsOpenTC=openTC;
  window.btToolsOpenProfiles=openProfiles;
  window.btToolsRunSelfTest=runSelfTest;
  document.addEventListener('click',captureNativePlus,true);
  setTimeout(boot,300);setTimeout(boot,1000);setTimeout(boot,2500);setInterval(boot,3500);
})();
