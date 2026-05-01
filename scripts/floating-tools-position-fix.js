/* ✅ Version 3.2.1 Newest update: Move T&C and Profiles floating tools above bottom navigation so tabs remain clickable. */
(function(){
  const VER='3.2.1';
  function addStyle(){
    let st=document.getElementById('bt_floating_tools_position_fix');
    if(!st){
      st=document.createElement('style');
      st.id='bt_floating_tools_position_fix';
      document.head.appendChild(st);
    }
    st.textContent=`
      /* Keep utility buttons above the bottom tab bar instead of covering Tracker/Health tabs. */
      #v32_inbox_btn,
      #v31_profile_btn{
        bottom:calc(env(safe-area-inset-bottom,0px) + 92px) !important;
        z-index:138 !important;
      }
      #v32_inbox_btn{left:14px !important;}
      #v31_profile_btn{right:14px !important;}
      @media(max-width:430px){
        #v32_inbox_btn,
        #v31_profile_btn{
          bottom:calc(env(safe-area-inset-bottom,0px) + 92px) !important;
        }
        #v32_inbox_btn{left:12px !important;}
        #v31_profile_btn{right:12px !important;}
      }
    `;
  }
  function apply(){
    addStyle();
    const t=document.getElementById('v32_inbox_btn');
    const p=document.getElementById('v31_profile_btn');
    if(t){t.style.bottom='calc(env(safe-area-inset-bottom,0px) + 92px)';t.style.left='12px';}
    if(p){p.style.bottom='calc(env(safe-area-inset-bottom,0px) + 92px)';p.style.right='12px';}
  }
  window.btFloatingToolsPositionFixVersion=VER;
  setTimeout(apply,200);
  setTimeout(apply,900);
  setTimeout(apply,2200);
  setInterval(apply,3500);
})();
