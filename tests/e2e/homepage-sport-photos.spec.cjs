'use strict';

const { test, expect } = require('./pw.cjs');
const {installApiMock,json}=require('./helpers.cjs');

const SPORTS = [
  ['running', 'Running'],
  ['fitness', 'Fitness'],
  ['bodybuilding_coach', 'Bodybuilding Coach'],
  ['swimming', 'Swimming'],
  ['cycling', 'Cycling'],
  ['triathlon', 'Triathlon'],
  ['hyrox', 'HYROX'],
  ['crossfit', 'CrossFit'],
  ['racket-sports', 'Racket Sports'],
  ['martial-arts', 'Martial Arts'],
  ['team-sports', 'Team Sports'],
];

async function openHomepage(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mzactive-join-dialog-seen', '1');
      localStorage.setItem('mza-install-promo-dismissed', '1');
      sessionStorage.setItem('mza-install-promo-dismissed', '1');
    } catch {
      // Storage is optional; the test only needs to avoid delayed promos.
    }
  });
  await page.goto('/index.html?sport-photo-verify=1');
  await expect(page.locator('.sport-grid').first()).toBeVisible();
  await page.locator('.sport-grid').first().locator('.sport-card').last().scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => Array.from(document.querySelector('.sport-grid').querySelectorAll('.sport-card img')).every((img) => img.complete && img.naturalWidth > 0),
    null,
    { timeout: 20000 },
  );
}

test('explore-by-sport cards load local photos and keep the shared card design', async ({ page }) => {
  await openHomepage(page);

  const cards = page.locator('.sport-grid').first().locator('.sport-card');
  await expect(cards).toHaveCount(11);

  const details = await cards.evaluateAll((elements) => elements.map((card) => {
    const img = card.querySelector('img');
    const art = card.querySelector('.sport-card-art');
    const cardStyle = getComputedStyle(card);
    const imageStyle = img ? getComputedStyle(img) : null;
    return {
      href: card.getAttribute('href'),
      label: card.querySelector('.sport-card-label')?.textContent.trim(),
      hasSvg: Boolean(card.querySelector('svg')),
      hasWebpSource: Boolean(card.querySelector('picture > source[type="image/webp"]')),
      src: img?.getAttribute('src'),
      currentSrc: img?.currentSrc,
      loaded: Boolean(img && img.complete && img.naturalWidth > 0),
      objectFit: imageStyle?.objectFit,
      borderTopLeftRadius: cardStyle.borderTopLeftRadius,
      hasBeforeOverlay: getComputedStyle(card, '::before').content !== 'none',
      hasAfterOverlay: getComputedStyle(card, '::after').content !== 'none',
      artPosition: art ? getComputedStyle(art).position : null,
    };
  }));

  details.forEach((card, index) => {
    const [sport, label] = SPORTS[index];
    expect(card.href, `${sport} link`).toBe(`coaches.html?${sport === 'bodybuilding_coach' ? 'type' : 'sport'}=${sport}`);
    expect(card.label, `${sport} label`).toBe(label);
    expect(card.hasSvg, `${sport} has no placeholder icon`).toBe(false);
    expect(card.hasWebpSource, `${sport} has a WebP source`).toBe(true);
    expect(card.loaded, `${sport} photo loads`).toBe(true);
    expect(card.src, `${sport} uses a local asset`).toContain('assets/images/');
    expect(card.objectFit, `${sport} uses the shared crop`).toBe('cover');
    expect(card.borderTopLeftRadius, `${sport} uses the shared radius`).not.toBe('0px');
    expect(card.hasBeforeOverlay, `${sport} keeps the base overlay`).toBe(true);
    expect(card.hasAfterOverlay, `${sport} keeps the label scrim`).toBe(true);
    expect(card.artPosition, `${sport} uses the shared art container`).toBe('absolute');
  });

  const boxing = details[9];
  const team = details[10];
  expect(boxing.src).toContain('assets/images/sports/boxing.webp');
  expect(team.src).toContain('assets/images/sports/team-sports.webp');
  expect(boxing.currentSrc).toContain('assets/images/responsive/sports/boxing-');
  expect(team.currentSrc).toContain('assets/images/responsive/sports/team-sports-');
  expect(details[1].src).toContain('women-fitness.jpg');
  expect(details[2].src).toContain('assets/images/sports/bodybuilding.jpg');
  expect(details[2].src).not.toContain('women-fitness');
  expect(details[2].currentSrc).toContain('assets/images/responsive/sports/bodybuilding-');
});

test('every explore-by-sport card remains clickable', async ({ page }) => {
  await openHomepage(page);

  for (const [sport] of SPORTS) {
    const key = sport === 'bodybuilding_coach' ? 'type' : 'sport';
    await page.locator(`.sport-card[href="coaches.html?${key}=${sport}"]`).click();
    if (['racket-sports','martial-arts','team-sports'].includes(sport)) {
      const dialog=page.locator('#group-'+sport);
      await expect(dialog).toBeVisible();
      await dialog.getByRole('link',{name:'View all coaches'}).click();
    }
    await expect(page).toHaveURL(new RegExp(`coaches\\.html\\?${key}=${sport}$`));
    await page.goBack();
    await expect(page.locator('.sport-grid').first()).toBeVisible();
  }
});

test('group selectors expose all disciplines and close without navigating', async ({page})=>{
 await openHomepage(page);
 for (const [group, choices] of Object.entries({'martial-arts':['Boxing','Kickboxing','MMA','Karate','Judo','Taekwondo','Brazilian Jiu-Jitsu'],'team-sports':['Football','Handball','Basketball','Volleyball'],'racket-sports':['Padel','Tennis']})) {
   await page.locator('.sport-card[href="coaches.html?sport='+group+'"]').click();
   const d=page.locator('#group-'+group);await expect(d).toBeVisible();
   for(const choice of choices) await expect(d.getByRole('link',{name:choice,exact:true})).toBeVisible();
   await d.getByRole('button',{name:'Close'}).click();await expect(d).not.toBeVisible();
 }
 await page.locator('.sport-card[href="coaches.html?sport=team-sports"]').click();
 await page.locator('#group-team-sports').getByRole('link',{name:'Handball',exact:true}).click();
 await expect(page).toHaveURL(/coaches\.html\?sport=handball$/);
});

test('group and individual directory filters match only public relevant specialties', async ({page})=>{
 const profiles=[['box','Boxing coach','Boxing'],['kick','Kickboxing coach','Kickboxing'],['hand','Handball coach','كرة اليد'],['foot','Football coach','Football'],['karate','Karate coach','الكاراتيه'],['tennis','Tennis coach','Tennis'],['padel','Padel coach','Padel'],['hidden','Hidden specialty','Handball']].map(([id,display_name,specialty])=>({id,display_name,provider_type:'coach',specialties:[specialty],public_fields:id==='hidden'?['city']:['specialties','city'],city:'Doha',country:'Qatar'}));
 await installApiMock(page,{overrides:{'GET /api/providers':json({providers:profiles})}});
 for(const [sport,ids] of [['boxing',['box']],['martial-arts',['box','kick','karate']],['handball',['hand']],['team-sports',['hand','foot']],['racket-sports',['tennis','padel']]]) {
  await page.goto('/coaches.html?sport='+sport);
  await expect(page.locator('#grid article')).toHaveCount(ids.length);
  for(const id of ids) await expect(page.locator('#coach-'+id)).toBeVisible();
 }
});
test('Arabic category picker translates its choices and preserves language on directory navigation',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('mzactive-language-manual','ar'));
 await openHomepage(page);
 await expect(page.locator('html')).toHaveAttribute('dir','rtl');
 await page.locator('.sport-card[href="coaches.html?sport=team-sports"]').click();
 const d=page.locator('#group-team-sports');await expect(d.getByRole('heading',{name:'الرياضات الجماعية'})).toBeVisible();
 await d.getByRole('link',{name:'كرة اليد',exact:true}).click();
 await expect(page).toHaveURL(/coaches\.html\?sport=handball$/);
 await expect(page.locator('html')).toHaveAttribute('dir','rtl');
 await expect(page.locator('#sportFilter')).toHaveValue('handball');
});
