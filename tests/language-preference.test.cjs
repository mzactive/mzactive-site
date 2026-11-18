const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../assets/js/language-preference.js'),'utf8');

function harness({languages=['en-US'],saved={}}={}) {
  const store=new Map(Object.entries(saved));
  const listeners={};
  const events=[];
  const root={lang:'en',dir:'ltr'};
  const body={dir:'ltr',classList:{toggle(){}}};
  const document={documentElement:root,body,dispatchEvent:event=>events.push(event)};
  const localStorage={
    getItem:key=>store.get(key)||null,
    setItem:(key,value)=>store.set(key,String(value))
  };
  const window={addEventListener:(name,fn)=>{listeners[name]=fn}};
  class CustomEvent {
    constructor(type,options){this.type=type;this.detail=options.detail}
  }
  vm.runInNewContext(source,{document,window,navigator:{languages,language:languages[0]},localStorage,CustomEvent});
  return {store,listeners,events,root,body,language:window.MZActiveLanguage};
}

test('detects Arabic device locale without saving an automatic preference',()=>{
  const h=harness({languages:['ar-QA','en-US']});
  assert.equal(h.language.get(),'ar');
  assert.equal(h.root.lang,'ar');
  assert.equal(h.root.dir,'rtl');
  assert.equal(h.body.dir,'rtl');
  assert.equal(h.store.has('mzactive-language-manual'),false);
});

test('migrates an existing saved choice and persists new manual selections',()=>{
  const h=harness({languages:['ar-QA'],saved:{'mzactive-language':'en'}});
  assert.equal(h.language.get(),'en');
  assert.equal(h.store.get('mzactive-language-manual'),'en');
  h.language.set('ar',{manual:true});
  assert.equal(h.store.get('mzactive-language-manual'),'ar');
  assert.equal(h.root.dir,'rtl');
  assert.equal(h.events.at(-1).detail.manual,true);
});
