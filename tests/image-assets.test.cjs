const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

const root=path.join(__dirname,'..');
const homepage=fs.readFileSync(path.join(root,'index.html'),'utf8');
const trackedAssets=new Set(
  execFileSync('git',['ls-files','--','assets/images'],{cwd:root,encoding:'utf8'})
    .trim().split('\n')
);

test('homepage hero and sport card photos reference tracked, cache-busted assets',()=>{
  const assets=[
    'assets/images/mzactive-runners.jpg',
    'assets/images/approved/women-fitness.jpg',
    'assets/images/sports/swimming.webp',
    'assets/images/sports/cycling.webp',
    'assets/images/sports/triathlon.webp',
    'assets/images/sports/hyrox.webp',
    'assets/images/sports/crossfit.webp',
    'assets/images/approved/padel-group.jpg'
  ];

  for(const asset of assets){
    assert.ok(trackedAssets.has(asset),`${asset} must be tracked with exact case`);
    assert.ok(fs.statSync(path.join(root,asset)).size>0,`${asset} must not be empty`);
    assert.ok(homepage.includes(`src="${asset}?v=20261118"`),`${asset} must use a fresh cache key`);
  }
});
