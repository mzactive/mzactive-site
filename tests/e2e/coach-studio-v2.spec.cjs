'use strict';
const {test,expect}=require('./pw.cjs');
const {installApiMock,json,seedSession,assertOfflineSafe}=require('./helpers.cjs');
const coach='e2e-coach',athlete='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222',program='33333333-3333-4333-8333-333333333333';
const connection=(id,user,name)=>({id,coach_user_id:coach,athlete_user_id:user,athlete_name:name,status:'accepted',workspace_status:'active'});
const connections=[connection('conn-a',athlete,'Alex Runner'),connection('conn-b',second,'Sam Athlete'),{...connection('conn-c','no-access','Closed athlete'),workspace_status:'closed'}];
function localDate(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
async function open(page,{type='coach',signedIn=true,overrides={},libraryItems=null,athleteConnections=connections,profileData={}}={}){
 const mock=await installApiMock(page,{libraryItems,connections:athleteConnections,profile:{status:'approved',provider_type:type,...profileData},dashboard:{role:'provider',teams:[],programs:[{id:'old',athlete_user_id:athlete,athlete_name:'Alex Runner',week_start:localDate(),sessions:[{id:'old-workout',session_date:localDate(),sport_type:'run',details:'Existing completed run\nKeep steady',completed_at:'2026-11-24T07:00:00Z',actual_km:5,duration_minutes:30}]}]},overrides:{'GET /api/me/access':json({account_type:'provider',user:{id:coach},dashboard_path:'/dashboard.html'}),...overrides}});
 if(signedIn)await seedSession(page,{storage:'session'});
 await page.goto('/coach-studio.html');return mock;
}
async function choose(page,id='conn-a'){await expect(page.locator('#studio')).toBeVisible();await page.locator('#athleteSelect').selectOption(id)}
async function create(page){await page.locator('#calendarGrid .day').first().getByRole('button',{name:'+ Workout',exact:true}).click();const d=page.locator('#dialog');await d.getByLabel('Workout name').fill('Strength A');await d.getByLabel('Add exercise').fill('goblet');await d.getByRole('button',{name:/Goblet squat/}).click();await d.getByLabel('Sets',{exact:true}).fill('3');await d.getByLabel('Reps',{exact:true}).fill('10');await d.getByLabel('Weight (kg)').fill('12');await d.getByRole('button',{name:'Save workout'}).click();await expect(page.locator('#calendarGrid').getByText('Strength A')).toBeVisible()}
test('calendar shows only selected athletes and preserves separate drafts',async({page})=>{const mock=await open(page);await choose(page);await expect(page.getByText('Existing completed run')).toBeVisible();await create(page);await choose(page,'conn-b');await expect(page.getByText('Strength A')).toHaveCount(0);await expect(page.getByText('Existing completed run')).toHaveCount(0);await choose(page);await expect(page.getByText('Strength A')).toBeVisible();await page.reload();await choose(page);await expect(page.getByText('Strength A')).toBeVisible();await expect(page.locator('#athleteSelect option')).toHaveCount(3);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1&&Math.abs(visualViewport.width-document.documentElement.clientWidth)<=2)).toBe(true);assertOfflineSafe(mock)});
test('workout publishes to actual accepted athlete user without replacing completed session',async({page})=>{const mock=await open(page,{overrides:{'POST /api/dashboard/programs':json({id:program},201),['POST /api/dashboard/programs/'+program+'/send']:json({sent:true,program_id:program})}});await choose(page);await create(page);await page.getByRole('button',{name:'Send to my athlete',exact:true}).click();const d=page.locator('#dialog');await d.getByLabel('Athlete phone (required by current program API)').fill('+97455555555');await d.getByRole('button',{name:'Publish to athlete'}).click();await expect(d).not.toBeVisible();await expect(page.getByText('Published successfully to the athlete.')).toBeVisible();const calls=mock.calls.filter(x=>x.method==='POST'&&x.path.includes('/api/dashboard/programs'));expect(calls).toHaveLength(2);expect(calls[0].body.athlete_user_id).toBeNull();expect(calls[0].body.weeks[0].sessions[0].details).toContain('Goblet squat');expect(calls[0].body.weeks[0].sessions[0].details).toContain('sets: 3');expect(calls[1].body.athlete_user_id).toBe(athlete);await expect(page.getByText('Existing completed run')).toBeVisible();await expect(page.locator('#athleteSelect')).toBeEnabled();assertOfflineSafe(mock)});
test('saved draft is retried without duplicate create if publishing fails',async({page})=>{const path='POST /api/dashboard/programs/'+program+'/send';const mock=await open(page,{overrides:{'POST /api/dashboard/programs':json({id:program},201),[path]:[json({error:'temporary'},500),json({sent:true,program_id:program})]}});await choose(page);await create(page);await page.getByRole('button',{name:'Send to my athlete',exact:true}).click();const d=page.locator('#dialog');await d.getByLabel('Athlete phone (required by current program API)').fill('+97455555555');await d.getByRole('button',{name:'Publish to athlete'}).click();await expect(d.getByRole('status')).toHaveText('temporary');await d.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Retry publishing'}).click();await expect(d.getByLabel('Athlete phone (required by current program API)')).toHaveCount(0);await d.getByRole('button',{name:'Publish to athlete'}).click();await expect(d).not.toBeVisible();expect(mock.calls.filter(x=>x.method==='POST'&&x.path==='/api/dashboard/programs')).toHaveLength(1);assertOfflineSafe(mock)});
test('template library copies independent workouts to another athlete',async({page})=>{await open(page);await choose(page);await create(page);await page.getByRole('button',{name:'Save week as template'}).click();const d=page.locator('#dialog');await d.getByLabel('Template name').fill('Strength block');await d.getByRole('button',{name:'Save template',exact:true}).click();await choose(page,'conn-b');await page.locator('[data-screen=templates]').click();await page.getByRole('button',{name:'Apply to selected week'}).click();await expect(page.locator('#calendarGrid').getByText('Strength A')).toBeVisible();await expect(page.getByText('Existing completed run')).toHaveCount(0);await page.locator('[data-screen=templates]').click();await page.getByRole('button',{name:'Apply to selected week'}).click();await expect(page.getByText('Choose an empty draft week first.')).toBeVisible()});
test('exercise library searches by name and opens a structured exercise',async({page})=>{await open(page);await choose(page);await page.locator('[data-screen=exercises]').click();await page.getByRole('searchbox',{name:'Search exercises'}).fill('romanian');await expect(page.getByText('Romanian deadlift',{exact:true})).toBeVisible();await page.locator('.listrow').filter({has:page.getByText('Romanian deadlift',{exact:true})}).getByRole('button',{name:'Use in workout'}).click();await page.locator('#dialog').getByRole('button',{name:'Continue'}).click();await expect(page.locator('#dialog').getByText('Romanian deadlift',{exact:true})).toBeVisible();await expect(page.locator('#dialog').getByLabel('Sets',{exact:true})).toBeVisible()});
test('pacer cannot see coach workspace',async({page})=>{await open(page,{type:'pacer'});await expect(page.getByText('This workspace is available to approved coaches.',{exact:false})).toBeVisible();await expect(page.locator('#studio')).toBeHidden()});
test('language switches to Arabic',async({page})=>{await open(page);await choose(page);await page.locator('#lang').click();await expect(page.locator('html')).toHaveAttribute('dir','rtl');await expect(page.getByRole('heading',{name:'تقويم التدريب'})).toBeVisible()});


test('signed out visitor goes straight to the single sign-in form',async({page})=>{await open(page,{signedIn:false});await expect(page).toHaveURL(/\/dashboard\.html#loginForm$/);await expect(page.locator('#loginForm')).toBeVisible();await expect(page.locator('#registerForm')).toBeHidden();await expect(page.locator('#gate')).toHaveCount(0)});
test('expired session goes straight to sign-in',async({page})=>{await open(page,{overrides:{'GET /api/me/access':json({error:'unauthorized'},401)}});await expect(page).toHaveURL(/\/dashboard\.html#loginForm$/);await expect(page.locator('#loginForm')).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('mzactive-provider-session')||sessionStorage.getItem('mzactive-provider-session'))).toBeNull()});
test('network or API failure does not force a second login',async({page})=>{await open(page,{overrides:{'GET /api/dashboard':json({error:'unavailable'},503)}});await expect(page.locator('#gateMessage')).toContainText('Your workspace could not load.');await expect(page.locator('#gateAction')).toHaveText('Try again');await expect(page).toHaveURL(/\/coach-studio\.html$/);expect(await page.evaluate(()=>sessionStorage.getItem('mzactive-provider-session'))).toBeTruthy()});

test('workout library creates reusable sessions without an athlete and assigns independent copies',async({page})=>{
 await open(page);await expect(page.locator('#studio')).toBeVisible();
 await page.locator('[data-screen=sessions]').click();await page.getByRole('button',{name:'Create workout'}).click();
 const d=page.locator('#dialog');await d.getByLabel('Workout name').fill('Reusable Strength');
 await d.getByLabel('Add exercise').fill('goblet');await d.getByRole('button',{name:/Goblet squat/}).click();
 await d.getByLabel('Sets',{exact:true}).fill('3');await d.getByLabel('Reps',{exact:true}).fill('10');await d.getByRole('button',{name:'Save workout'}).click();
 await expect(page.getByText('Reusable Strength',{exact:true})).toBeVisible();
 await page.locator('[data-screen=calendar]').click();await choose(page);
 await page.locator('#calendarGrid .day').first().getByRole('button',{name:'From library',exact:true}).click();
 await d.getByRole('button',{name:'Add to calendar'}).click();await expect(page.locator('#calendarGrid').getByText('Reusable Strength')).toBeVisible();
 await page.locator('[data-screen=sessions]').click();await page.getByRole('button',{name:'Edit',exact:true}).click();
 await d.getByLabel('Workout name').fill('Revised Strength');await d.getByRole('button',{name:'Save workout'}).click();
 await expect(page.getByText('Revised Strength',{exact:true})).toBeVisible();
 await page.locator('[data-screen=calendar]').click();await expect(page.locator('#calendarGrid').getByText('Reusable Strength')).toBeVisible();
});
test('coach creates custom bilingual exercise and uses it in a workout',async({page})=>{
 await open(page);await expect(page.locator('#studio')).toBeVisible();await page.locator('[data-screen=exercises]').click();
 const d=page.locator('#dialog');await page.getByRole('button',{name:'Create exercise'}).click();
 await d.getByLabel('English name').fill('MZA band walk');await d.getByLabel('Arabic name').fill('مشي بالمطاط');await d.getByLabel('Target muscles').fill('Glutes');await d.getByLabel('Equipment').fill('Band');await d.getByRole('button',{name:'Save exercise'}).click();
 await page.getByRole('searchbox',{name:'Search exercises'}).fill('MZA band walk');await expect(page.getByText('MZA band walk',{exact:true})).toBeVisible();
 await page.locator('[data-screen=sessions]').click();await page.getByRole('button',{name:'Create workout'}).click();
 await d.getByLabel('Workout name').fill('Custom drill');await d.getByLabel('Add exercise').fill('MZA band walk');await d.getByRole('button',{name:/MZA band walk/}).click();
 await expect(d.getByText('MZA band walk',{exact:true})).toBeVisible();await d.getByRole('button',{name:'Save workout'}).click();await expect(page.getByText('Custom drill',{exact:true})).toBeVisible();
});
test('calendar library drawer applies reusable program to an empty week',async({page})=>{
 await open(page);await choose(page);await create(page);
 await page.getByRole('button',{name:'Save week as template'}).click();
 const d=page.locator('#dialog');await d.getByLabel('Template name').fill('Week from library');await d.getByRole('button',{name:'Save template',exact:true}).click();
 await choose(page,'conn-b');await page.getByRole('button',{name:'Add from library',exact:true}).click();
 await expect(d).toHaveClass(/library-drawer/);await d.getByRole('button',{name:'Apply to week'}).click();
 await expect(page.locator('#calendarGrid').getByText('Strength A')).toBeVisible();
});

test('account library persists across browser storage clearing, revisions prevent stale edits',async({page})=>{
 const existing={id:'server-workout',title:'Server session',sport:'strength',km:'',minutes:'',notes:'Warm up well',exercises:[]};
 const mock=await open(page,{libraryItems:[{kind:'workout',id:existing.id,revision:1,item:existing}]});
 await expect(page.locator('#studio')).toBeVisible();await page.locator('[data-screen=sessions]').click();
 await expect(page.getByText('Saved to your MZA account.')).toBeVisible();
 await expect(page.getByText('Server session',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Edit',exact:true}).click();const d=page.locator('#dialog');
 await d.getByLabel('Workout name').fill('Updated server workout');await d.getByRole('button',{name:'Save workout'}).click();
 await expect(d).toBeHidden();await expect(page.getByText('Updated server workout',{exact:true})).toBeVisible();
 expect(mock.libraryItems[0].revision).toBe(2);
 await page.evaluate(()=>localStorage.removeItem('mza-studio-v2-workouts:e2e-coach'));
 await page.reload();await expect(page.locator('#studio')).toBeVisible();await page.locator('[data-screen=sessions]').click();await expect(page.getByText('Updated server workout',{exact:true})).toBeVisible();
 mock.libraryItems[0].revision=3;
 await page.getByRole('button',{name:'Edit',exact:true}).click();await d.getByLabel('Workout name').fill('Do not overwrite');await d.getByRole('button',{name:'Save workout'}).click();
 await expect(d.getByRole('alert')).toContainText('Account save not confirmed');expect(mock.libraryItems[0].item.title).toBe('Updated server workout');assertOfflineSafe(mock);
});
test('account mode imports local library without overwriting existing server items',async({page})=>{
 const local={id:'local-workout',title:'Old browser workout',sport:'strength',km:'',minutes:'',notes:'Easy',exercises:[]};
 await page.addInitScript(item=>localStorage.setItem('mza-studio-v2-workouts:e2e-coach',JSON.stringify([item])),local);
 const mock=await open(page,{libraryItems:[]});
 await expect(page.locator('#studio')).toBeVisible();await page.locator('[data-screen=sessions]').click();
 await expect(page.getByText('Old browser workout',{exact:true})).toHaveCount(0);
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Import browser library'}).click();
 await expect(page.getByText('Old browser workout',{exact:true})).toBeVisible();
 expect(mock.libraryItems[0].item.title).toBe(local.title);expect(mock.libraryItems[0].revision).toBe(1);assertOfflineSafe(mock);
});

test('coach with no athletes creates a private week and saves it as a reusable program',async({page})=>{
 const mock=await open(page,{athleteConnections:[]});await expect(page.locator('#studio')).toBeVisible();
 await expect(page.getByText('Your private planning calendar')).toBeVisible();await create(page);
 await expect(page.getByRole('button',{name:'Send to my athlete',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Save week as template'}).click();const d=page.locator('#dialog');await d.getByLabel('Template name').fill('Private program');await d.getByRole('button',{name:'Save template',exact:true}).click();await expect(d).toBeHidden();
 await page.locator('[data-screen=templates]').click();await expect(page.getByText('Private program',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Create program'}).click();await expect(page.locator('#calendarGrid')).toBeVisible();
 expect(mock.calls.filter(c=>c.method==='POST'&&c.path.includes('/api/dashboard/programs'))).toHaveLength(0);assertOfflineSafe(mock);
});
test('coaching requests are accepted in the new workspace',async({page})=>{
 const pending={...connection('pending-connection',second,'New athlete'),status:'pending'};
 const mock=await open(page,{athleteConnections:[pending],overrides:{'PATCH /api/connections/pending-connection':(ctx,state)=>{state.connections[0].status=ctx.body.status;return json({updated:true,status:ctx.body.status})}}});
 await expect(page.locator('#studio')).toBeVisible();await page.locator('[data-screen=athletes]').click();await expect(page.getByText('New athlete',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Accept',exact:true}).click();await expect(page.getByRole('button',{name:'Open calendar'})).toBeVisible();await page.getByRole('button',{name:'Open calendar'}).click();await expect(page.locator('#athleteSelect')).toHaveValue('pending-connection');await expect(page).toHaveURL(/\/coach-studio\.html$/);assertOfflineSafe(mock);
});
test('create team and view join code without using old dashboard',async({page})=>{
 const mock=await open(page,{athleteConnections:[],overrides:{'POST /api/dashboard/teams':json({id:'new-team',name:'Run group',join_code:'ABCDEFGH'},201)}});
 await expect(page.locator('#studio')).toBeVisible();await page.locator('[data-screen=athletes]').click();await page.getByRole('button',{name:'Create team',exact:true}).click();
 const d=page.locator('#dialog');await d.getByLabel('Team name').fill('Run group');await d.getByRole('button',{name:'Create team',exact:true}).click();await expect(page.getByText('Run group',{exact:true})).toBeVisible();await expect(page.getByText('Join code: ABCDEFGH')).toBeVisible();assertOfflineSafe(mock);
});
test('my profile is clean and editable without opening legacy dashboard',async({page})=>{
 const profileData={id:'coach-profile',display_name:'Coach Alex',city:'Doha',country:'Qatar',bio:'Running coach',specialties:['Running'],languages:['English'],social_links:[],public_fields:['bio'],program_durations:[1],experience_years:5,updated_at:'2026-11-25T07:00:00Z'};
 const mock=await open(page,{profileData,overrides:{'PUT /api/me/profile':(ctx,state)=>{state.profile={...state.profile,...ctx.body};return json({status:'approved'})}}});
 await expect(page.locator('#studio')).toBeVisible();await page.locator('#classic').click();await expect(page.getByRole('heading',{name:'My profile'})).toBeVisible();await expect(page.getByRole('heading',{name:'Coach Alex'})).toBeVisible();
 await page.getByRole('button',{name:'Edit profile'}).click();const d=page.locator('#dialog');await d.getByLabel('Biography').fill('New coaching biography');await d.getByRole('button',{name:'Save profile'}).click();await expect(page.getByText('New coaching biography',{exact:true})).toBeVisible();await expect(page).toHaveURL(/\/coach-studio\.html$/);
 const call=mock.calls.find(c=>c.method==='PUT'&&c.path==='/api/me/profile');expect(call.body.specialties).toEqual(['Running']);expect(call.body.public_fields).toEqual(['bio']);assertOfflineSafe(mock);
});
test('coach messages stay inside the new workspace',async({page})=>{
 const mock=await open(page);await expect(page.locator('#studio')).toBeVisible();await page.locator('[data-screen=athletes]').click();await page.locator('.listrow').filter({has:page.getByText('Alex Runner',{exact:true})}).getByRole('button',{name:'Messages'}).click();const d=page.locator('#dialog');await d.getByLabel('Message',{exact:true}).fill('Test coaching message');await d.getByRole('button',{name:'Send message'}).click();await expect(d.getByRole('status')).toHaveText('Message sent.');assertOfflineSafe(mock);
});

test('private draft sends an independent copy to a chosen athlete only after confirmation',async({page})=>{
 const mock=await open(page,{overrides:{'POST /api/dashboard/programs':json({id:program},201),['POST /api/dashboard/programs/'+program+'/send']:json({sent:true,program_id:program})}});
 await choose(page,'');await create(page);await page.getByRole('button',{name:'Send to my athlete',exact:true}).click();
 const d=page.locator('#dialog');await d.locator('#programRecipient').selectOption('conn-b');await d.getByRole('button',{name:'Review and send'}).click();
 await expect(page.locator('#athleteSelect')).toHaveValue('conn-b');expect(mock.calls.filter(c=>c.method==='POST'&&c.path.includes('/api/dashboard/programs'))).toHaveLength(0);
 await d.getByLabel('Athlete phone (required by current program API)').fill('+97455555555');await d.getByRole('button',{name:'Publish to athlete'}).click();await expect(d).toBeHidden();
 expect(mock.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/send'))[0].body.athlete_user_id).toBe(second);
 await choose(page,'');await expect(page.locator('#calendarGrid').getByText('Strength A')).toBeVisible();assertOfflineSafe(mock)
});
test('sending a private draft never overwrites an existing athlete draft',async({page})=>{
 const mock=await open(page);await choose(page,'conn-b');await create(page);await choose(page,'');await create(page);
 await page.getByRole('button',{name:'Send to my athlete',exact:true}).click();const d=page.locator('#dialog');
 await d.locator('#programRecipient').selectOption('conn-b');await d.getByRole('button',{name:'Review and send'}).click();
 await expect(d.getByRole('status')).toContainText('already has a draft');expect(mock.calls.filter(c=>c.method==='POST'&&c.path.includes('/api/dashboard/programs'))).toHaveLength(0);
 await d.getByRole('button',{name:'Close',exact:true}).click();await choose(page,'conn-b');await expect(page.locator('#calendarGrid').getByText('Strength A')).toHaveCount(1);assertOfflineSafe(mock)
});

test('YouTube demo is validated and preserved in the assigned workout',async({page})=>{
 const mock=await open(page,{overrides:{'POST /api/dashboard/programs':json({id:program},201),['POST /api/dashboard/programs/'+program+'/send']:json({sent:true,program_id:program})}});
 await choose(page);await create(page);await page.locator('#calendarGrid').getByText('Strength A').click();
 const d=page.locator('#dialog'),v=d.getByLabel('YouTube demonstration (optional)');await v.fill('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ');await expect.poll(()=>v.evaluate(x=>x.validity.valid)).toBe(false);
 await v.fill('https://youtu.be/dQw4w9WgXcQ');await expect(d.getByRole('link',{name:/Preview video/})).toHaveAttribute('href','https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 await d.getByRole('button',{name:'Save workout'}).click();await page.getByRole('button',{name:'Send to my athlete',exact:true}).click();
 await d.getByLabel('Athlete phone (required by current program API)').fill('+97455555555');await d.getByRole('button',{name:'Publish to athlete'}).click();await expect(d).toBeHidden();
 const created=mock.calls.find(c=>c.method==='POST'&&c.path==='/api/dashboard/programs');expect(created.body.weeks[0].sessions[0].details).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ');assertOfflineSafe(mock)
});
