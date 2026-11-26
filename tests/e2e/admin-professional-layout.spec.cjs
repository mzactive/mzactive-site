'use strict';
const {test,expect}=require('./pw.cjs');
const {installApiMock,seedSession,clickAdminTab,json,assertOfflineSafe}=require('./helpers.cjs');
test('admin workspace has readable light surfaces and compact coach identity on every viewport',async({page},testInfo)=>{
 const profile={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',user_id:'e2e-coach',provider_type:'coach',display_name:'Example Coach',city:'Doha',country:'Qatar',email:'coach@example.invalid',status:'approved',profile_complete:1,welcome_email_status:'sent',has_profile_photo:0,has_cover:0};
 const mock=await installApiMock(page,{overrides:{'GET /api/me/access':json({user:{id:'e2e-admin',email:'admin@example.invalid',role:'admin'},super_admin:true,account_type:'admin',dashboard_path:'/admin.html',management:{enabled:true,permissions:[]}}),'GET /api/admin/applications':json({providers:[],approved_providers:[profile],rejected_providers:[],suspended_providers:[],bookings:[]})}});
 await seedSession(page,{storage:'session'});await page.goto('/admin.html');await clickAdminTab(page,'coaches');await page.getByRole('button',{name:/^Approved \(1\)$/}).click();
 const card=page.locator('.coach-card');await expect(card).toBeVisible();await expect(card.locator('.coach-identity')).toContainText('Example Coach');await expect(card.locator('.coach-status-group')).toContainText('Approved');
 const layout=await card.evaluate(el=>({background:getComputedStyle(el).backgroundColor,bodyBackground:getComputedStyle(document.body).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth+1,identityWidth:el.querySelector('.coach-identity').getBoundingClientRect().width}));
 expect(layout.background).toBe('rgb(255, 255, 255)');expect(layout.bodyBackground).toBe('rgb(248, 250, 249)');expect(layout.overflow).toBe(false);expect(layout.identityWidth).toBeGreaterThan(60);
 await expect(page.locator('#nav .nav-icon svg').first()).toBeAttached();await expect(page.locator('.coach-stat-grid .coach-stat')).toHaveCount(4);await expect(page.getByRole('button',{name:'All coaches (1)'})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('admin-professional-coaches.png'),fullPage:true});
 await card.locator('summary').click();await expect(card.locator('.admin-upload-field').first()).toBeVisible();await expect(card.locator('.coach-details')).toHaveCSS('position','fixed');await page.screenshot({path:testInfo.outputPath('admin-command-drawer.png')});await card.getByRole('button',{name:'Close coach details'}).click();await expect(card.locator('.coach-details')).toBeHidden();assertOfflineSafe(mock);
});

test('admin can remove and grant verification independently from approval',async({page})=>{
 const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';let verified=1,version='2026-11-26T10:00:00Z';
 const profile={id,user_id:'e2e-coach',provider_type:'coach',display_name:'Example Coach',city:'Doha',country:'Qatar',status:'approved',profile_complete:1};
 const mock=await installApiMock(page,{overrides:{'GET /api/me/access':json({user:{id:'e2e-admin',email:'admin@example.invalid',role:'admin'},super_admin:true,account_type:'admin',management:{enabled:true,permissions:[]}}),'GET /api/admin/applications':()=>json({providers:[],approved_providers:[{...profile,verified,updated_at:version}],rejected_providers:[],suspended_providers:[],bookings:[]}),['PATCH /api/admin/providers/'+id+'/verification']:ctx=>{expect(ctx.body.review_version).toBe(version);expect(ctx.body.reason).toBeTruthy();verified=Number(ctx.body.verified);version=verified?'2026-11-26T10:02:00Z':'2026-11-26T10:01:00Z';return json({updated:true,verified:Boolean(verified),updated_at:version})}}});
 await seedSession(page,{storage:'session'});await page.goto('/admin.html');await clickAdminTab(page,'coaches');await page.getByRole('button',{name:/^Approved \(1\)$/}).click();
 const card=page.locator('.coach-card');await card.locator('summary').click();const panel=card.locator('.coach-verification');
 await panel.getByRole('button',{name:'Remove verification'}).click();await panel.getByLabel('Reason for this decision').fill('Credentials being reviewed');await panel.getByRole('checkbox').check();await panel.getByRole('button',{name:'Confirm decision'}).click();
 await expect(card.locator('.verification-badge')).toHaveText('Not verified');await expect(card.locator('.coach-status-group')).toContainText('Approved');
 await panel.getByRole('button',{name:'Grant verification'}).click();await panel.getByLabel('Reason for this decision').fill('Credentials confirmed');await panel.getByRole('checkbox').check();await panel.getByRole('button',{name:'Confirm decision'}).click();await expect(card.locator('.verification-badge')).toHaveText('Verified');
 expect(mock.calls.filter(c=>c.method==='PATCH'&&c.path.endsWith('/verification'))).toHaveLength(2);assertOfflineSafe(mock);
});
