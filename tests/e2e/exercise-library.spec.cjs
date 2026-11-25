'use strict';
const {test,expect}=require('./pw.cjs');
const {installApiMock,json,seedSession}=require('./helpers.cjs');
const coach={id:'e2e-coach',email:'coach@example.invalid',role:'provider'};
async function open(page,provider_type='coach'){
 const mock=await installApiMock(page,{overrides:{
 'GET /api/me/access':json({user:coach,account_type:'provider',dashboard_path:'/dashboard.html',management:{enabled:false,permissions:[]}}),
 'GET /api/dashboard':json({role:'provider',teams:[],coaches:[],programs:[]}),
 'GET /api/me/profile':json({profile:{id:'coach-e2e',status:'approved',display_name:'E2E Coach',provider_type}}),
 'GET /api/dashboard/athletes':json({athletes:[],counts:{pending:0,active:0,completed:0}}),
 'POST /api/dashboard/programs':json({id:'prog-new',session_codes:[]},201)
 }});
 await seedSession(page,{storage:'session'});await page.goto('/dashboard.html?legacy=1&studio=0');
 if(['coach','bodybuilding_coach'].includes(provider_type))await expect(page.locator('#studioExerciseLibrary')).toBeVisible();else await expect(page.locator('#coachMyAthletes')).toBeVisible();return mock;
}
test('exercise library inserts a configurable workout and saves existing payload',async({page})=>{
 const mock=await open(page);await page.locator('#studioExerciseLibrary').click();
 const picker=page.locator('#mzaExercisePicker');
 await picker.locator('input[type=search]').fill('goblet');
 await picker.getByRole('button',{name:/Goblet squat/}).click();
 await picker.locator('[data-exercise-field=sets]').fill('2');
 await picker.locator('[data-exercise-field=reps]').fill('10');
 await picker.getByRole('button',{name:'Add to workout',exact:true}).click();
 await expect(page.locator('#studioDetails')).toHaveValue('Goblet squat — sets: 2 · reps: 10');
 await page.locator('#studioApply').click();
 await expect(page.locator('#studioWorkoutForm')).not.toBeVisible();
 await expect(page.locator('#weekMonday')).toHaveValue(/Goblet squat — sets: 2 · reps: 10/);
 await page.locator('#trainingClientName').fill('Test athlete');await page.locator('#trainingClientPhone').fill('55555555');
 await page.locator('#programSaveDraft').click();
 await expect.poll(()=>mock.calls.some(c=>c.method==='POST'&&c.path==='/api/dashboard/programs'&&JSON.stringify(c.body).includes('Goblet squat — sets: 2 · reps: 10'))).toBe(true);
});
test('custom exercise is saved locally and available in Arabic search',async({page})=>{
 await open(page);await page.locator('#studioExerciseLibrary').click();
 const picker=page.locator('#mzaExercisePicker');await picker.getByText('Create my own exercise',{exact:true}).click();
 await picker.getByLabel('English name').fill('Custom drill');await picker.getByLabel('الاسم بالعربية').fill('تمرين خاص');
 await picker.getByRole('button',{name:'Save private exercise'}).click();
 await picker.locator('input[type=search]').fill('تمرين خاص');
 await expect(picker.getByRole('button',{name:'Custom drill'})).toBeVisible();
 await page.locator('#studioClose').click();
 await page.reload();await expect(page.locator('#studioExerciseLibrary')).toBeVisible();await page.locator('#studioExerciseLibrary').click();
 await picker.getByRole('button',{name:'My exercises'}).click();await expect(picker.getByRole('button',{name:'Custom drill'})).toBeVisible();
});

test('Arabic exercise picker shows localized names and keeps pace editable',async({page})=>{
 await open(page);
 await page.locator('#lang').click();
 await expect(page.locator('html')).toHaveAttribute('lang','ar');
 await page.locator('#studioExerciseLibrary').click();
 const picker=page.locator('#mzaExercisePicker');
 await picker.locator('input[type=search]').fill('الجري السهل');
 await picker.getByRole('button',{name:/الجري السهل/}).click();
 await picker.locator('[data-exercise-field=distance]').fill('8');
 await picker.locator('[data-exercise-field=pace]').fill('6:15');
 await picker.getByRole('button',{name:'أضف إلى الحصة',exact:true}).click();
 await expect(page.locator('#studioDetails')).toHaveValue(/الجري السهل.*6:15/);
 await page.locator('#studioApply').click();
 await expect(page.locator('#studioWorkoutForm')).not.toBeVisible();
 await expect(page.locator('#weekMonday')).toHaveValue(/الجري السهل/);
});

test('pacer account cannot open the coach exercise library',async({page})=>{
 await open(page,'pacer');
 await expect(page.locator('#studioExerciseLibrary')).toBeHidden();
 await expect(page.locator('#mzaExercisePicker')).toBeHidden();
});

test('approved bodybuilding coaches can use the exercise library',async({page})=>{
 await open(page,'bodybuilding_coach');
 await expect(page.locator('#studioExerciseLibrary')).toBeVisible();
});

test('copy week keeps source, shifts dates, and never overwrites existing workouts',async({page})=>{
 await open(page);
 await page.locator('#programDurationUnit').selectOption('weeks');
 await page.locator('#programDurationValue').fill('3');
 await page.locator('#programDurationValue').dispatchEvent('change');
 await page.evaluate(()=>{const x=document.querySelector('[data-day=monday]');x.value='Easy 5 km';x.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#programCopyWeek').click();
 const options=await page.locator('#programCopyWeekTarget option').evaluateAll(xs=>xs.map(x=>x.value));
 await page.locator('#programCopyWeekTarget').selectOption(options[1]);
 await page.locator('#programPasteWeek').click();
 await expect(page.locator('#programWeekLabel')).toContainText('2 /');
 await expect(page.locator('#weekMonday')).toHaveValue('Easy 5 km');
 await page.locator('#programPasteWeek').click();
 await expect(page.locator('#programShortcutStatus')).toContainText('already has workouts');
 await page.locator('#programPrevWeek').click();
 await expect(page.locator('#weekMonday')).toHaveValue('Easy 5 km');
 const p=await page.evaluate(()=>window.MZActiveProgramEditor.payload());
 expect(p.weeks).toHaveLength(2);expect(p.weeks[0].sessions[0].session_date).not.toEqual(p.weeks[1].sessions[0].session_date);
});
test('copy individual workout offers editable paste before applying',async({page})=>{
 await open(page);
 await page.evaluate(()=>{const x=document.querySelector('[data-day=monday]');x.value='Easy 5 km';x.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('[data-copy-workout=monday]').click();
 if(await page.locator('[data-paste-workout=tuesday]').isHidden())await page.locator('.studio-mobile-days button').nth(1).click();
 await page.locator('[data-paste-workout=tuesday]').click();
 await expect(page.locator('#studioDetails')).toHaveValue('Easy 5 km');
 await page.locator('#studioApply').click();
 await expect(page.locator('#weekTuesday')).toHaveValue(/Easy 5 km/);
 await expect(page.locator('#weekMonday')).toHaveValue('Easy 5 km');
});

test('date-independent template can be saved and reused after clearing new draft',async({page})=>{
 await open(page);
 await page.evaluate(()=>{const x=document.querySelector('[data-day=monday]');x.value='Easy 5 km';x.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#programTemplates').click();
 const dialog=page.locator('#programTemplatesDialog');
 await dialog.getByLabel('Template name').fill('10K base');
 await dialog.getByRole('button',{name:'Save current program as template'}).click();
 await expect(dialog.getByText('10K base · 1 workouts')).toBeVisible();
 await dialog.getByRole('button',{name:'Use template'}).click();
 await expect(dialog.getByRole('status')).toContainText('empty new program');
 await dialog.getByRole('button',{name:'Close'}).click();
 await page.evaluate(()=>{const x=document.querySelector('[data-day=monday]');x.value='';x.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#programTemplates').click();
 await dialog.getByRole('button',{name:'Use template'}).click();
 await expect(dialog).not.toBeVisible();
 await expect(page.locator('#weekMonday')).toHaveValue('Easy 5 km');
});
