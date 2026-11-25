'use strict';
const {test,expect}=require('./pw.cjs');
const {installApiMock,json,seedSession,assertOfflineSafe,FAKE_TOKEN}=require('./helpers.cjs');
const provider={account_type:'provider',user:{id:'e2e-coach',role:'provider'},dashboard_path:'/dashboard.html',management:{enabled:false,permissions:[]}};
const opts=(type='coach',status='approved')=>({profile:{id:'profile-1',provider_type:type,status,display_name:'Coach'},dashboard:{role:'provider',programs:[],teams:[]},overrides:{'GET /api/me/access':json(provider),'POST /api/auth/login':json({...provider,token:FAKE_TOKEN})}});
test('existing coach login opens standalone studio even from old URL',async({page})=>{
 const mock=await installApiMock(page,opts());await seedSession(page,{storage:'session'});await page.goto('/dashboard.html?studio=0');await expect(page).toHaveURL(/\/coach-studio\.html$/);await expect(page.locator('#studio')).toBeVisible();await expect(page.locator('#loginForm')).toHaveCount(0);assertOfflineSafe(mock);
});
test('single sign-in routes approved coach directly to new platform',async({page})=>{
 const mock=await installApiMock(page,opts());await page.goto('/dashboard.html#loginForm');await expect(page.locator('#loginForm')).toBeVisible();await expect(page.locator('#registerForm')).toBeHidden();await page.locator('#loginEmail').fill('coach@example.invalid');await page.locator('#loginPassword').fill('fake-only-1234');await page.locator('#loginForm button[type=submit]').click();await expect(page).toHaveURL(/\/coach-studio\.html$/);await expect(page.locator('#studio')).toBeVisible();expect(mock.calls.filter(c=>c.path==='/api/auth/login')).toHaveLength(1);assertOfflineSafe(mock);
});
test('provider registration has no duplicate password sign-in form',async({page})=>{
 const mock=await installApiMock(page);await page.goto('/providers.html#provider-portal');await expect(page.locator('#providerRegister')).toBeVisible();await expect(page.locator('#providerLogin')).toHaveCount(0);await page.locator('#providerSignIn a').click();await expect(page).toHaveURL(/\/dashboard\.html#loginForm$/);await expect(page.locator('#loginForm')).toBeVisible();await expect(page.locator('#registerForm')).toBeHidden();assertOfflineSafe(mock);
});
test('pacer is not redirected to the coach studio',async({page})=>{
 const mock=await installApiMock(page,opts('pacer'));await seedSession(page,{storage:'session'});await page.goto('/dashboard.html');await expect(page.locator('#dashboard')).toBeVisible();await expect(page).toHaveURL(/\/dashboard\.html$/);await expect(page.locator('#studio')).toHaveCount(0);assertOfflineSafe(mock);
});
test('athlete stays in athlete dashboard',async({page})=>{
 const mock=await installApiMock(page,{dashboard:{role:'member',programs:[],teams:[]},overrides:{'GET /api/me/access':json({account_type:'member',user:{id:'athlete',role:'member'},dashboard_path:'/dashboard.html'})}});await seedSession(page,{storage:'session'});await page.goto('/dashboard.html');await expect(page.locator('#memberPanel')).toBeVisible();await expect(page).toHaveURL(/\/dashboard\.html$/);assertOfflineSafe(mock);
});
test('explicit legacy tool deep link remains reachable with direct studio link',async({page})=>{
 const mock=await installApiMock(page,opts());await seedSession(page,{storage:'session'});await page.goto('/dashboard.html?legacy=1&studio=0#myProfile');await expect(page.locator('#dashboard')).toBeVisible();await expect(page.locator('#mzaOpenCoachStudio')).toHaveAttribute('href','/coach-studio.html');assertOfflineSafe(mock);
});

test('old coach profile and request links open native workspace screens',async({page})=>{
 const mock=await installApiMock(page,opts());await seedSession(page,{storage:'session'});
 await page.goto('/dashboard.html#myProfile');await expect(page).toHaveURL(/\/coach-studio\.html\?view=profile$/);await expect(page.getByRole('heading',{name:'My profile'})).toBeVisible();
 await page.goto('/dashboard.html?connection=sample#myAthletes');await expect(page).toHaveURL(/\/coach-studio\.html\?view=athletes$/);await expect(page.getByRole('heading',{name:'Athletes & teams'})).toBeVisible();assertOfflineSafe(mock);
});

test('login form is hidden during existing session check, and temporary errors do not clear credentials',async({page})=>{
 const options=opts();options.overrides['GET /api/me/access']=[json({error:'unavailable'},503),json(provider)];
 const mock=await installApiMock(page,options);await seedSession(page,{storage:'session'});await page.goto('/dashboard.html#loginForm');
 await expect(page.locator('#sessionMessage')).toContainText('Retry without signing in again');
 await expect(page.locator('#loginForm')).toBeHidden();await expect(page.locator('#registerForm')).toBeHidden();
 expect(await page.evaluate(()=>sessionStorage.getItem('mzactive-provider-session'))).toBeTruthy();
 await page.locator('#sessionRetry').click();await expect(page).toHaveURL(/\/coach-studio\.html$/);await expect(page.locator('#studio')).toBeVisible();
 expect(mock.calls.filter(c=>c.path==='/api/auth/login')).toHaveLength(0);assertOfflineSafe(mock);
});
test('signed out login has one visible sign-in action and registration is separate',async({page})=>{
 await installApiMock(page);await page.goto('/dashboard.html#loginForm');await expect(page.locator('#loginForm')).toBeVisible();await expect(page.locator('#registerForm')).toBeHidden();
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'Create an athlete account'}).click();await expect(page.locator('#registerForm')).toBeVisible();await expect(page.locator('#loginForm')).toBeHidden();
 await page.getByRole('button',{name:'Back to sign in'}).click();await expect(page.locator('#loginForm')).toBeVisible();await expect(page.locator('#registerForm')).toBeHidden();
});
test('expired token opens the login only after unauthorized response',async({page})=>{
 const options=opts();options.overrides['GET /api/me/access']=json({error:'unauthorized'},401);
 await installApiMock(page,options);await seedSession(page,{storage:'session'});await page.goto('/dashboard.html#loginForm');await expect(page.locator('#loginForm')).toBeVisible();await expect(page.locator('#notice')).toContainText('Your session expired.');expect(await page.evaluate(()=>sessionStorage.getItem('mzactive-provider-session'))).toBeNull();
});
