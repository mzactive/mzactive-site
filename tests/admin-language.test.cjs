const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../assets/js/admin-language.js'),'utf8');

function harness({title,details,buttonText='Approve',notice=''}){
  const heading={textContent:title,attrs:{},setAttribute(name,value){this.attrs[name]=value}};
  const pre={textContent:details,attrs:{},setAttribute(name,value){this.attrs[name]=value}};
  const button={textContent:buttonText,attrs:{},setAttribute(name,value){this.attrs[name]=value}};
  const card={querySelector(selector){return selector==='h3'?heading:null}};
  pre.closest=()=>card;
  const noticeElement={textContent:notice,attrs:{},setAttribute(name,value){this.attrs[name]=value}};
  const eventListeners={};
  const selectorMap={
    '#queue .card h3':[heading],
    '#queue .card pre':[pre],
    '#queue .card .actions button':[button]
  };
  const document={
    documentElement:{lang:'en'},
    body:{},
    getElementById(){return null},
    querySelectorAll(selector){return selectorMap[selector]||[]},
    querySelector(selector){return selector==='#notice'?noticeElement:null},
    addEventListener(name,fn){eventListeners[name]=fn}
  };
  class MutationObserver{constructor(fn){this.fn=fn}observe(){}}
  const sandbox={document,window:{},MutationObserver};
  vm.runInNewContext(source,sandbox,{filename:'admin-language.js'});
  return {heading,pre,button,noticeElement,eventListeners};
}

test('localizes admin labels and actions while preserving authored coach content',()=>{
  const bio='Coach bio: Run with purpose.\nA second authored line stays exact.';
  const details=['coach@example.test','Doha, Qatar','Specialties: Trail running, HYROX','Languages: English, Arabic','Experience: 5 years','Rate: 250 QAR','Photo uploaded: yes','WhatsApp public: yes · +97466297954','Social links: https://example.test/profile','',bio].join('\n');
  const h=harness({title:'Runner Name · coach',details});
  h.eventListeners['mzactive:language-change']({detail:{lang:'ar'}});
  assert.equal(h.heading.textContent,'Runner Name · مدرب');
  assert.match(h.pre.textContent,/التخصصات: Trail running, HYROX/);
  assert.match(h.pre.textContent,/الخبرة: 5 سنوات/);
  assert.ok(h.pre.textContent.endsWith(`\n\n${bio}`));
  assert.equal(h.button.textContent,'اعتماد');
  h.eventListeners['mzactive:language-change']({detail:{lang:'en'}});
  assert.equal(h.pre.textContent,details);
});

test('localizes booking state and owner-agent field labels without changing request text',()=>{
  const booking=harness({title:'Request · pending · pending_payment',details:'Client Name · client@example.test · +97412345678\nrace · 10K · distance TBD · pace TBD\nDoha · 2026-06-01\nProvider: provider-id\n\nTraining goal'});
  booking.eventListeners['mzactive:language-change']({detail:{lang:'ar'}});
  assert.equal(booking.heading.textContent,'طلب · قيد الانتظار · بانتظار الدفع');
  assert.match(booking.pre.textContent,/اسم العميل \/ البريد الإلكتروني \/ واتساب: Client Name/);
  assert.match(booking.pre.textContent,/مقدم الخدمة: provider-id/);

  const owner=harness({title:'OPERATIONS · completed',details:'Draft title\nSource: operator\nApproval: pending\n\nUser-provided observations stay unchanged.'});
  owner.eventListeners['mzactive:language-change']({detail:{lang:'ar'}});
  assert.match(owner.pre.textContent,/المصدر: operator/);
  assert.ok(owner.pre.textContent.endsWith('User-provided observations stay unchanged.'));
});
