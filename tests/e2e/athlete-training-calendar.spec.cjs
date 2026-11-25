'use strict';
const {test,expect}=require('./pw.cjs');
const {installApiMock,json,seedSession,assertOfflineSafe}=require('./helpers.cjs');
const sid='11111111-2222-4333-8444-555555555555';
async function open(page,details='Easy run\n[MZ:{"km":8,"minutes":46}]\nKeep steady'){
 const today=new Date().toISOString().slice(0,10);
 const member={role:'member',teams:[],connectedCoaches:[],programs:[{id:'program-1',week_start:today,sessions:[{id:sid,session_date:today,day_key:'monday',sport_type:'run',session_code:'MON-R01',details}]}]};
 const mock=await installApiMock(page,{overrides:{
 'GET /api/me/access':json({user:{id:'e2e-athlete',role:'provider'},account_type:'member',dashboard_path:'/dashboard.html',management:{enabled:false,permissions:[]}}),
 'GET /api/dashboard':()=>json(member),
 ['POST /api/dashboard/program-sessions/'+sid+'/complete']:json({completed:true,actual_km:8,duration_minutes:46})
 }});
 await seedSession(page,{storage:'session'});await page.goto('/dashboard.html');
 await expect(page.locator('#mzaAthleteCalendar')).toBeVisible();
 return mock;
}
test('athlete opens assigned workout and records distance and duration using existing API',async({page})=>{
 const mock=await open(page);const panel=page.locator('#mzaAthleteCalendar');
 await expect(panel.getByText('Easy run',{exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'View workout',exact:true}).click();
 const dialog=page.locator('#mzaAthleteWorkout');
 await expect(dialog.getByText('Keep steady')).toBeVisible();
 await dialog.getByLabel('Actual distance (km)').fill('8');await dialog.getByLabel('Actual duration (min)').fill('46');
 await dialog.getByRole('button',{name:'Mark completed / save log'}).click();
 await expect(dialog).not.toBeVisible();
 await expect(panel.getByText('1 / 1')).toBeVisible();
 await expect(panel.getByText('46 min',{exact:true})).toBeVisible();
 await expect.poll(()=>mock.calls.some(c=>c.method==='POST'&&c.path.endsWith(sid+'/complete')&&c.body.actual_km===8&&c.body.duration_minutes===46)).toBe(true);
 assertOfflineSafe(mock);
});
test('athlete calendar navigates weeks and switches to Arabic',async({page})=>{
 await open(page);const panel=page.locator('#mzaAthleteCalendar');
 await panel.getByRole('button',{name:'Next',exact:true}).click();
 await expect(panel.getByText('No assigned workouts for this day.')).toBeVisible();
 await panel.getByRole('button',{name:'Today',exact:true}).click();
 await expect(panel.getByText('Easy run',{exact:true})).toBeVisible();
 await page.locator('#lang').click();
 await expect(panel.getByRole('heading',{name:'تدريبي'})).toBeVisible();
 await expect(panel.getByRole('button',{name:'عرض الحصة'})).toBeVisible();
});

test('assigned YouTube demonstration is a safe click-only link',async({page})=>{
 const mock=await open(page,'Easy run\n[MZ:{"km":8,"minutes":46}]\nGoblet squat\nhttps://youtu.be/dQw4w9WgXcQ\nhttps://youtube.com.evil.example/watch?v=dQw4w9WgXcQ');
 await page.locator('#mzaAthleteCalendar').getByRole('button',{name:'View workout'}).click();
 const d=page.locator('#mzaAthleteWorkout');const link=d.getByRole('link',{name:/Watch demonstration on YouTube/});await expect(link).toHaveCount(1);await expect(link).toHaveAttribute('href','https://www.youtube.com/watch?v=dQw4w9WgXcQ');await expect(link).toHaveAttribute('rel','noopener noreferrer');await expect(d.locator('iframe')).toHaveCount(0);assertOfflineSafe(mock)
});
