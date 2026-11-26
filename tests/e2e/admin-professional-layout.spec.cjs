'use strict';
const {test,expect}=require('./pw.cjs');
const {installApiMock,seedSession,clickAdminTab,json,assertOfflineSafe}=require('./helpers.cjs');
test('admin workspace has readable light surfaces and compact coach identity on every viewport',async({page},testInfo)=>{
 const profile={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',user_id:'e2e-coach',provider_type:'coach',display_name:'Example Coach',city:'Doha',country:'Qatar',email:'coach@example.invalid',status:'approved',profile_complete:1,welcome_email_status:'sent',has_profile_photo:0,has_cover:0};
 const mock=await installApiMock(page,{overrides:{'GET /api/me/access':json({user:{id:'e2e-admin',email:'admin@example.invalid',role:'admin'},super_admin:true,account_type:'admin',dashboard_path:'/admin.html',management:{enabled:true,permissions:[]}}),'GET /api/admin/applications':json({providers:[],approved_providers:[profile],rejected_providers:[],suspended_providers:[],bookings:[]})}});
 await seedSession(page,{storage:'session'});await page.goto('/admin.html');await clickAdminTab(page,'coaches');await page.getByRole('button',{name:/^Approved \(1\)$/}).click();
 const card=page.locator('.coach-card');await expect(card).toBeVisible();await expect(card.locator('.coach-identity')).toContainText('Example Coach');await expect(card.locator('.coach-status-group')).toContainText('Approved');
 const layout=await card.evaluate(el=>({background:getComputedStyle(el).backgroundColor,bodyBackground:getComputedStyle(document.body).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth+1,identityWidth:el.querySelector('.coach-identity').getBoundingClientRect().width}));
 expect(layout.background).toBe('rgb(255, 255, 255)');expect(layout.bodyBackground).toBe('rgb(242, 247, 245)');expect(layout.overflow).toBe(false);expect(layout.identityWidth).toBeGreaterThan(60);
 await expect(page.locator('#nav .nav-icon svg').first()).toBeAttached();
 await page.screenshot({path:testInfo.outputPath('admin-professional-coaches.png'),fullPage:true});
 await card.locator('summary').click();await expect(card.locator('.admin-upload-field').first()).toBeVisible();assertOfflineSafe(mock);
});
