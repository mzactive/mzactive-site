'use strict';
const {test,expect}=require('./pw.cjs');
const {installApiMock,json,seedSession}=require('./helpers.cjs');
async function open(page,type='coach',route='/dashboard.html?legacy=1&studio=1'){
const coach={id:'e2e-coach',email:'coach@example.invalid',role:'provider'};
await installApiMock(page,{overrides:{
'GET /api/me/access':json({user:coach,account_type:'provider',dashboard_path:'/dashboard.html',management:{enabled:false,permissions:[]}}),
'GET /api/me/profile':json({profile:{id:'coach-e2e',status:'approved',display_name:'E2E Coach',provider_type:type}}),
'GET /api/dashboard':json({role:'provider',teams:[],coaches:[],programs:[]}),
'GET /api/dashboard/athletes':json({athletes:[],counts:{pending:0,active:0,completed:0}})
}});
await seedSession(page,{storage:'session'});await page.goto(route);
}
test('dedicated coach workspace opens calendar and keeps working sections accessible',async({page})=>{
await open(page);const studio=page.locator('#mzaCoachStudio');await expect(studio).toBeVisible();
await expect(studio.locator('#whatsappTrainingForm')).toBeVisible();
await expect(studio.locator('#coachMyAthletes')).toBeHidden();
await expect(studio.locator('#createTeamForm')).toBeHidden();
await studio.locator('[data-studio-section=athletes]').click();
await expect(studio.locator('#coachMyAthletes')).toBeVisible();
await expect(studio.locator('#whatsappTrainingForm')).toBeHidden();
await studio.locator('[data-studio-section=library]').click();
await expect(studio.locator('#mzaExerciseBrowser')).toBeVisible();
await studio.getByRole('searchbox',{name:'Search exercises'}).fill('goblet');
await studio.locator('#mzaExerciseBrowser').getByRole('button',{name:'Add to workout',exact:true}).click();
await expect(page.locator('#mzaExercisePicker')).toBeVisible();
await page.locator('#studioClose').click();
await studio.locator('[data-studio-section=templates]').click();
await expect(studio.locator('#mzaTemplateBrowser')).toBeVisible();
await studio.locator('.mza-nav-more summary').click();
await studio.locator('[data-studio-section=ai]').click();
await expect(studio.locator('#coachAiPanel')).toBeVisible();
await studio.locator('[data-studio-section=teams]').click();
await expect(studio.locator('#createTeamForm')).toBeVisible();
await studio.locator('[data-studio-section=calendar]').click();
await expect(studio.locator('#whatsappTrainingForm')).toBeVisible();
expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
});
test('studio entry is available on existing dashboard only for verified coaches',async({page})=>{
await open(page,'coach','/dashboard.html?legacy=1&studio=0');await expect(page.locator('#mzaOpenCoachStudio')).toHaveAttribute('href','/coach-studio.html');
await expect(page.locator('#mzaCoachStudio')).toHaveCount(0);
});
test('pacer does not get dedicated coach workspace',async({page})=>{
await open(page,'pacer');await expect(page.locator('#coachMyAthletes')).toBeVisible();await expect(page.locator('#mzaCoachStudio')).toHaveCount(0);
});


test('workspace toggles Arabic while preserving selected view',async({page})=>{
await open(page);const studio=page.locator('#mzaCoachStudio');await expect(studio).toBeVisible();
await studio.locator('[data-studio-section=athletes]').click();
await studio.getByRole('button',{name:'العربية',exact:true}).click();
await expect(studio.locator('#mzaStudioSectionTitle')).toHaveText('الرياضيون');
await expect(studio.locator('#coachMyAthletes')).toBeVisible();
await expect(page.locator('html')).toHaveAttribute('dir','rtl');
});

test('approved coach can still open the legacy workspace explicitly',async({page})=>{
 await open(page,'coach','/dashboard.html?legacy=1&studio=1');
 const studio=page.locator('#mzaCoachStudio');
 await expect(studio).toBeVisible();
 await expect(studio.locator('#mzaProgramSetup')).toBeVisible();
 await expect(studio.locator('#whatsappTrainingForm')).toBeVisible();
 await expect(studio.locator('#mzaExerciseBrowser')).toBeHidden();
});

test('program library applies a reusable copy without overwriting a draft',async({page})=>{
 await open(page);
 const studio=page.locator('#mzaCoachStudio');
 await expect(studio).toBeVisible();
 await page.evaluate(()=>{const el=document.querySelector('[data-day=monday]');el.value='Easy 5 km';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await studio.locator('[data-studio-section=templates]').click();
 const library=studio.locator('#mzaTemplateBrowser');
 await library.getByRole('button',{name:'Save current as template'}).click();
 const dialog=page.locator('#programTemplatesDialog');
 await dialog.getByLabel('Template name').fill('5K base');
 await dialog.getByRole('button',{name:'Save current program as template'}).click();
 await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await expect(library.getByText('5K base',{exact:true})).toBeVisible();
 await library.getByRole('button',{name:'Add to calendar'}).click();
 await expect(library.getByRole('status')).toContainText('Start an empty new program');
 await studio.locator('[data-studio-section=calendar]').click();
 page.once('dialog',d=>d.accept());
 await studio.locator('#studioNewProgram').click();
 await studio.locator('[data-studio-section=templates]').click();
 await library.getByRole('button',{name:'Add to calendar'}).click();
 await expect(studio.locator('#whatsappTrainingForm')).toBeVisible();
 await expect(page.locator('#weekMonday')).toHaveValue('Easy 5 km');
});
