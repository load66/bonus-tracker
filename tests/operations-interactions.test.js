'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// A small event-capable DOM exercises dialog promises, focus, and dismissal.
function feedbackHarness(){
  const listeners=new Map();
  const document={activeElement:null};
  class Element{
    constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.handlers={};this.textContent=''}
    appendChild(el){el.parent=this;this.children.push(el);return el}
    setAttribute(key,value){this.attributes[key]=value}
    addEventListener(key,fn){this.handlers[key]=fn}
    focus(){document.activeElement=this}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(el=>el!==this)}
  }
  document.body=new Element('body');
  document.createElement=tag=>new Element(tag);
  document.getElementById=id=>{
    const find=el=>el.id===id?el:el.children.map(find).find(Boolean);
    return find(document.body);
  };
  document.addEventListener=(key,fn)=>listeners.set(key,fn);
  document.removeEventListener=(key,fn)=>{if(listeners.get(key)===fn)listeners.delete(key)};
  const sandbox={document,setTimeout,window:{alert(){},confirm(){return false}}};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('ui-feedback.js','utf8'),sandbox);
  return {
    document,confirm:sandbox.window.btConfirmDialog,
    buttons:()=>document.getElementById('bt_confirm_overlay').children[0].children[3].children,
    key(key,shiftKey=false){listeners.get('keydown')?.({key,shiftKey,preventDefault(){},stopPropagation(){}})},
    listenerCount:()=>listeners.size
  };
}

async function testFeedback(){
  const h=feedbackHarness();
  const original=h.document.createElement('button');original.focus();
  let firstSettled=false,secondSettled=false;
  const first=h.confirm('First request').then(value=>{firstSettled=true;return value});
  const second=h.confirm('Second request').then(value=>{secondSettled=true;return value});
  assert.equal(h.document.getElementById('bt_confirm_message').textContent,'First request');
  assert.equal(h.document.activeElement,h.buttons()[0],'Cancel receives initial focus');
  h.key('Tab');assert.equal(h.document.activeElement,h.buttons()[1]);
  h.key('Tab');assert.equal(h.document.activeElement,h.buttons()[0]);
  h.key('Tab',true);assert.equal(h.document.activeElement,h.buttons()[1]);
  h.buttons()[1].handlers.click();
  assert.equal(await first,true);
  assert.equal(firstSettled,true);assert.equal(secondSettled,false);
  assert.equal(h.document.getElementById('bt_confirm_message').textContent,'Second request');
  h.key('Escape');assert.equal(await second,false);
  assert.equal(h.document.getElementById('bt_confirm_overlay'),undefined);
  assert.equal(h.listenerCount(),0);assert.equal(h.document.activeElement,original);
  const backdrop=h.confirm('Dismiss outside');
  const overlay=h.document.getElementById('bt_confirm_overlay');
  overlay.handlers.click({target:overlay});assert.equal(await backdrop,false);
}

async function testOperations(){
  const {sandbox,document,errors}=require('./full-app-smoke.test.js');
  await new Promise(resolve=>setTimeout(resolve,100));
  const run=code=>vm.runInContext(code,sandbox);
  run(`entries=[{id:'TEST-P-01',bank:'Interaction Bank',opened:'2026-09-01',bonus:200,checklist:[],customTimers:[]}];expanded=entries[0].id;search='';tab='tracker';R();`);
  // Execute real modal saves; a numeric draft must also normalize safely.
  run(`timerEditModal={entryId:entries[0].id,mode:'days',text:'Deposit deadline',startDate:'2026-09-01',daysRequired:30};saveTimerEditor();`);
  assert.equal(run('entries[0].customTimers.length'),1);
  assert.equal(run('entries[0].customTimers[0].date'),'2026-10-01');
  assert.equal(run('entries[0].history.at(-1).type'),'timer_added');
  run(`entries[0].customTimers[0].done=true;entries[0].customTimers[0].kind='requirement';timerEditModal={entryId:entries[0].id,timerId:entries[0].customTimers[0].id,mode:'due',text:'Updated deadline',startDate:'2026-11-01',daysRequired:''};saveTimerEditor();`);
  assert.equal(run('entries[0].customTimers.length'),1);
  assert.equal(run('entries[0].customTimers[0].done'),true);
  assert.equal(run('entries[0].customTimers[0].kind'),'requirement');
  assert.equal(run('entries[0].history.at(-1).type'),'timer_updated');
  assert.match(run('entries[0].history.at(-1).detail'),/2026-11-01/);
  const beforeInvalid=run('JSON.stringify(entries)');
  run(`timerEditModal={entryId:entries[0].id,mode:'days',text:'Invalid',startDate:'2026-09-01',daysRequired:0};saveTimerEditor();`);
  assert.equal(run('JSON.stringify(entries)'),beforeInvalid,'Invalid timer does not change saved data');
  timerInputsTest();
  // Autofocus completes before later fields can receive typing.
  const focusGet=document.getElementById,focusTimeout=sandbox.setTimeout;
  let focusNow=false,focusScheduled=false;
  document.getElementById=id=>id==='tem_text'?{focus(){focusNow=true}}:focusGet.call(document,id);
  sandbox.setTimeout=()=>{focusScheduled=true};
  run('focusTimerDescription()');
  assert.equal(focusNow,true);assert.equal(focusScheduled,false,'Timer autofocus must not steal later input');
  document.getElementById=focusGet;sandbox.setTimeout=focusTimeout;

  let scrolled=false,focused=false;
  const header={setAttribute(){},focus(opts){focused=opts.preventScroll}};
  const target={getAttribute:()=>run('entries[0].id'),scrollIntoView(opts){scrolled=opts.block==='start'},querySelector:()=>header};
  const oldQuery=document.querySelectorAll;
  document.querySelectorAll=selector=>selector==='.card[data-bt-entry-id]'?[target]:[];
  const suggestions=sandbox.getAttentionSuggestions;
  sandbox.getAttentionSuggestions=()=>[{entryId:run('entries[0].id'),bank:'Interaction Bank',stageCode:'IN_PROGRESS'}];
  const actionHtml=run('renderActionCenter()');
  assert.match(actionHtml,/aria-expanded="false"/);
  assert.match(actionHtml,/class="ops-action-body" hidden/);
  run('toggleActionCenter()');
  assert.match(run('renderActionCenter()'),/aria-expanded="true"/);
  run('R()');assert.equal(run('actionCenterOpen'),true,'Re-render must preserve disclosure state');
  const handler=actionHtml.match(/onclick="([^"]*openAccountFromActionCenter[^\"]*)"/)[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&');
  sandbox.event={stopPropagation(){}};
  run(`search='missing';${handler}`);
  assert.equal(run('expanded'),run('entries[0].id'));
  assert.equal(run('search'),'');assert.equal(scrolled,true);assert.equal(focused,true);
  document.querySelectorAll=oldQuery;
  sandbox.getAttentionSuggestions=suggestions;
  run(`search='No such bank';R()`);
  assert.match(document.getElementById('app').innerHTML,/No matching accounts/);
  assert.doesNotMatch(document.getElementById('app').innerHTML,/No banks yet/);
  run(`search='';entries=[];R()`);
  assert.match(document.getElementById('app').innerHTML,/No banks yet/);
  assert.equal(errors.filter(x=>x.startsWith('ERROR ')).length,0);

  function timerInputsTest(){
    const get=document.getElementById;
    const id=run('entries[0].id');
    const values={['tm_txt_'+id]:{value:'Inline timer'},['tm_start_'+id]:{value:'2026-12-01'},['tm_days_'+id]:{value:''}};
    document.getElementById=key=>values[key]||get(key);
    run(`timerEditModal=null;inlineStateFor(entries[0].id).timerKind='due';upsertTimer(entries[0].id)`);
    assert.equal(run('entries[0].customTimers.length'),2);
    assert.equal(run('entries[0].history.at(-1).type'),'timer_added');
    run(`inlineStateFor(entries[0].id).timerEdit=entries[0].customTimers.at(-1).id;upsertTimer(entries[0].id)`);
    assert.equal(run('entries[0].customTimers.length'),2);
    assert.equal(run('entries[0].history.at(-1).type'),'timer_updated');
    document.getElementById=get;
  }
}

(async()=>{
  await testFeedback();
  await testOperations();
  console.log('Operations interactions passed: queued confirmations, cancellation, focus, modal/inline timer history, navigation, and search');
  process.exit(0);
})().catch(err=>{console.error(err);process.exit(1)});
