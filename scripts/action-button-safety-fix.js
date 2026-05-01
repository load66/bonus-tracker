/* ✅ Version 3.2.3 Newest update: Action Button Safety Fix for edit/checklist/mini-timer buttons. */
(function(){
  const VER='3.2.3';
  function cleanup(){
    /* Remove stale transparent overlays that can block normal app buttons. */
    const toolsMenu=document.getElementById('bt_tools_folder_menu');
    if(!toolsMenu||toolsMenu.hasAttribute('hidden')) document.getElementById('bt_tools_backdrop')?.remove();

    /* Old hidden utility buttons should never receive clicks. */
    ['v32_inbox_btn','v31_profile_btn'].forEach(id=>{
      const el=document.getElementById(id);
      if(el){el.style.pointerEvents='none';el.style.display='none';}
    });

    /* Safety: if any invisible full-screen element exists from our helper modules, disable it unless it is an active modal. */
    Array.from(document.querySelectorAll('body > div')).forEach(el=>{
      const id=el.id||'';
      if(['bt_tools_backdrop'].includes(id))return;
      if(/overlay|modal|drawer|sheet/i.test(id))return;
      const s=getComputedStyle(el);
      if(s.position==='fixed'){
        const r=el.getBoundingClientRect();
        const full=r.width>window.innerWidth*.9&&r.height>window.innerHeight*.9;
        const nearlyInvisible=(Number(s.opacity||1)<0.05)||s.backgroundColor==='rgba(0, 0, 0, 0)'||s.backgroundColor==='transparent';
        if(full&&nearlyInvisible&&s.pointerEvents!=='none')el.style.pointerEvents='none';
      }
    });
  }

  function buttonInfo(){
    const all=Array.from(document.querySelectorAll('button,a,[role="button"],input[type="button"],input[type="submit"]'));
    const rows=all.map((el,i)=>{
      const r=el.getBoundingClientRect();
      const txt=(el.textContent||el.value||el.getAttribute('aria-label')||el.getAttribute('title')||'').trim().replace(/\s+/g,' ').slice(0,60);
      const s=getComputedStyle(el);
      return {i,text:txt,tag:el.tagName,id:el.id||'',class:el.className||'',visible:r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden',pointerEvents:s.pointerEvents,rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};
    }).filter(x=>x.visible);
    return rows;
  }

  function addStyle(){
    let st=document.getElementById('bt_action_button_safety_style');
    if(!st){st=document.createElement('style');st.id='bt_action_button_safety_style';document.head.appendChild(st);}
    st.textContent=`
      /* Button safety: make small app action buttons easy to tap. */
      button, [role="button"], a, input[type="button"], input[type="submit"]{touch-action:manipulation;}
      button:disabled,[aria-disabled="true"]{pointer-events:auto;}
      .bt-click-debug *{outline:1px solid rgba(37,99,235,.25)!important;}
    `;
  }

  function boot(){addStyle();cleanup();}
  window.btActionButtonSafetyFixVersion=VER;
  window.btActionButtonHealthCheck=function(){cleanup();return {version:VER,buttons:buttonInfo(),tools:window.btToolsButtonHealthCheck?window.btToolsButtonHealthCheck():null};};
  setTimeout(boot,250);
  setTimeout(boot,1000);
  setTimeout(boot,2500);
  setInterval(cleanup,1800);
})();
