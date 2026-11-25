'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const lib=require('../assets/js/exercise-library.js');
test('catalog has unique bilingual exercises and valid categories',()=>{assert.ok(lib.catalog.length>=80);assert.equal(new Set(lib.catalog.map(x=>x.id)).size,lib.catalog.length);for(const x of lib.catalog){assert.ok(x.en&&x.ar&&lib.categories[x.category]&&lib.sport[x.category]);}});
test('English and Arabic search, category and empty results',()=>{assert.ok(lib.search('goblet','strength').some(x=>x.en==='Goblet squat'));assert.ok(lib.search('القرفصاء','strength').length>1);assert.ok(lib.search('دراجة','bike').length>0);assert.equal(lib.search('goblet','swim').length,0);assert.equal(lib.search('not-a-real-exercise').length,0);});
test('prescription preserves explicit values and avoids default dosing',()=>{const x=lib.catalog[0];assert.equal(lib.format(x,{}),'Goblet squat');assert.match(lib.format(x,{sets:'2',reps:'10',weight:'0',notes:'Keep controlled'}),/sets: 2 · reps: 10 · weight: 0 kg — Keep controlled/);assert.match(lib.format(x,{sets:'2',reps:'10'},true),/القرفصاء بالدمبل — مجموعات: 2 · تكرارات: 10/);});
test('custom data can be searched without mutating base catalog',()=>{const x={id:'custom-a',category:'core',en:'My test',ar:'اختبار خاص',muscle:'',equipment:''};assert.deepEqual(lib.search('اختبار','core',[x]),[x]);assert.ok(!lib.catalog.includes(x));});
