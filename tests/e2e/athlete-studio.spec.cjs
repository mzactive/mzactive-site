'use strict';
const {test,expect}=require('./pw.cjs');
const {installApiMock,json,seedSession,assertOfflineSafe}=require('./helpers.cjs');
const exactInstructions = '  Keep steady\n\nتهدئة: ١ كم\nhttps://youtu.be/dQw4w9WgXcQ  \n';
const sid='11111111-2222-4333-8444-555555555555';
async function open(page,{available=true,role='member',signedIn=true,workoutId='',loggedWorkout=true}={}){
 const d=new Date(),date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),entries=[];
 const mock=await installApiMock(page,{overrides:{'GET /api/me/access':json({account_type:role,user:{id:'e2e-athlete'},dashboard_path:'/dashboard.html'}),'GET /api/dashboard':json({role,teams:[],connectedCoaches:[],programs:loggedWorkout?[{id:'program',week_start:date,sessions:[{id:sid,session_date:date,day_key:'monday',sport_type:'run',details:'Easy run\n[MZ:{"km":0,"minutes":0,"workoutVideoId":"dQw4w9WgXcQ","exerciseLength":0}]\n'+exactInstructions}]}]:[]}),'POST /api/auth/login':json({token:'e2e-workout-token',account_type:'member',dashboard_path:'/dashboard.html'}),'GET /api/dashboard/wellness':()=>available?json({version:1,entries}):json({error:'not_found'},404),'POST /api/dashboard/wellness':ctx=>{entries.push(ctx.body);return json({entry:ctx.body},201)},['POST /api/dashboard/program-sessions/'+sid+'/complete']:json({completed:true,actual_km:4,duration_minutes:25})}});
 if(signedIn)await seedSession(page,{storage:'session'});await page.goto('/athlete-studio.html'+(workoutId?'?workout='+workoutId:''));return mock
}
test('athlete workspace records assigned workout in existing API',async({page})=>{const mock=await open(page);await expect(page.locator('#workspace')).toBeVisible();await expect(page.getByText('Easy run',{exact:true})).toBeVisible();await page.getByRole('button',{name:'View workout'}).click();const d=page.locator('#mzaAthleteWorkout');expect(await d.locator('.mza-athlete-instructions').textContent()).toBe(exactInstructions);await d.getByLabel('Actual distance (km)').fill('4');await d.getByLabel('Actual duration (min)').fill('25');await d.getByRole('button',{name:'Mark completed / save log'}).click();await expect(d).toBeHidden();await expect(page.getByText('1 / 1',{exact:true})).toBeVisible();assertOfflineSafe(mock)});
test('nutrition journal saves optional meal details and does not invent missing values',async({page})=>{const mock=await open(page);await expect(page.locator('#workspace')).toBeVisible();await page.locator('[data-view=nutrition]').click();await page.getByRole('button',{name:'Add meal'}).click();const d=page.locator('#entryDialog');await d.getByLabel('Meal name').fill('Lunch');await d.getByLabel('Energy (kcal)').fill('400');await d.getByRole('button',{name:'Save',exact:true}).click();await expect(d).toBeHidden();await expect(page.getByText('Lunch',{exact:true})).toBeVisible();await expect(page.locator('.wellness-summary').getByText('400 kcal',{exact:true})).toBeVisible();const call=mock.calls.find(c=>c.method==='POST'&&c.path==='/api/dashboard/wellness');expect(call.body.protein).toBeNull();assertOfflineSafe(mock)});
test('wellness check-in is optional and only saved to athlete account',async({page})=>{const mock=await open(page);await expect(page.locator('#workspace')).toBeVisible();await page.locator('[data-view=progress]').click();await page.getByRole('button',{name:'Add check-in'}).click();const d=page.locator('#entryDialog');await d.getByLabel('Sleep (hours)').fill('8');await d.getByLabel('Water (liters)').fill('2');await d.getByRole('button',{name:'Save',exact:true}).click();await expect(d).toBeHidden();await expect(page.getByText('8 h sleep · 2 L water')).toBeVisible();expect(mock.calls.find(c=>c.method==='POST'&&c.path==='/api/dashboard/wellness').body.weight).toBeNull();assertOfflineSafe(mock)});
test('inactive server disables journal rather than pretending to save',async({page})=>{await open(page,{available:false});await expect(page.locator('#workspace')).toBeVisible();await page.locator('[data-view=nutrition]').click();await expect(page.getByText('Journal unavailable. No new entries can be saved.')).toBeVisible();await expect(page.getByRole('button',{name:'Add meal'})).toBeDisabled()});
test('coach cannot open athlete workspace',async({page})=>{await open(page,{role:'provider'});await expect(page.locator('#gateMessage')).toHaveText('This workspace is for athlete accounts.');await expect(page.locator('#workspace')).toBeHidden()});
test('Arabic layout and signed out redirect',async({page})=>{await open(page);await expect(page.locator('#workspace')).toBeVisible();await page.locator('#language').click();await expect(page.locator('html')).toHaveAttribute('dir','rtl');await expect(page.getByRole('heading',{name:'تدريبي'})).toBeVisible()});

test('shared workout link resumes after sign-in and shows the video to the assigned athlete',async({page})=>{
 const mock=await open(page,{workoutId:sid,signedIn:false});
 await expect(page).toHaveURL(/dashboard\.html\?workout=.*#loginForm$/);
 await page.locator('#loginForm [name=email]').fill('athlete@example.invalid');
 await page.locator('#loginForm [name=password]').fill('e2e-athlete-password');
 await page.locator('#loginForm button[type=submit]').click();
 await expect(page).toHaveURL(/athlete-studio\.html\?workout=/);
 const workout=page.locator('#mzaAthleteWorkout');
 await expect(workout).toBeVisible();
 await expect(workout.getByRole('link',{name:'Watch workout video ↗'})).toHaveAttribute('href','https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 assertOfflineSafe(mock);
});
test('shared workout link reveals nothing outside the athlete account',async({page})=>{
 await open(page,{workoutId:sid,loggedWorkout:false});
 await expect(page.getByText('This workout is unavailable in your account.')).toBeVisible();
 await expect(page.locator('#mzaAthleteWorkout')).toBeHidden();
});
