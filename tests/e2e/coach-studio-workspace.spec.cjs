'use strict';
const {test,expect}=require('./pw.cjs');
const {installApiMock,json,seedSession}=require('./helpers.cjs');
async function open(page,type='coach',route='/dashboard.html?studio=1'){
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
await expect(page.locator('#mzaExercisePicker')).toBeVisible();
await page.locator('#studioClose').click();
await studio.locator('[data-studio-section=templates]').click();
await expect(page.locator('#programTemplatesDialog')).toBeVisible();
await page.locator('#programTemplatesDialog').getByRole('button',{name:'Close',exact:true}).click();
await studio.locator('[data-studio-section=ai]').click();
await expect(studio.locator('#coachAiPanel')).toBeVisible();
await studio.locator('[data-studio-section=teams]').click();
await expect(studio.locator('#createTeamForm')).toBeVisible();
await studio.locator('[data-studio-section=calendar]').click();
await expect(studio.locator('#whatsappTrainingForm')).toBeVisible();
expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
});
test('studio entry is available on existing dashboard only for verified coaches',async({page})=>{
await open(page,'coach','/dashboard.html');await expect(page.locator('#mzaOpenCoachStudio')).toHaveAttribute('href','dashboard.html?studio=1');
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
