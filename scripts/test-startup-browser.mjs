import assert from 'node:assert/strict';
const { chromium } = await import(process.env.RECEIPTIT_BROWSER_MODULE || 'playwright');
const base=process.env.TEST_URL || 'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'isolated-browser@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const expiry=Math.floor(Date.now()/1000)+3600;
const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:expiry})).toString('base64url')+'.controlled-browser-fixture';
for(const [name,width,height,mobile] of [['Small',320,568,true],['Pixel',393,873,true],['iPhone',390,844,true],['Samsung',412,915,true],['Desktop',1280,800,false]]){
 const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
 // All Supabase calls are intercepted. No production account or receipt is modified.
 await context.route('https://qqfntftbughorckugceu.supabase.co/**',async route=>{
   const u=new URL(route.request().url());let value=[];
   if(u.pathname.endsWith('/user'))value=user;
   else if(u.pathname.includes('/auth/v1/'))value={};
   else if(u.pathname.endsWith('/verify-access-code'))value={valid:true,deviceAuthorization:'controlled-signed-device-fixture'};
   else if(u.pathname.endsWith('/profiles')) value={id:user.id,username:'qa',full_name:'QA',preferred_currency:'GBP',monthly_budget_amount:2500,monthly_budget_currency:'GBP',currency_setup_completed:true,legacy_budget_migration_completed:true};
   else if(u.pathname.endsWith('/ensure_friendly_email_alias'))value=[{email_address:'qa@in.receiptit.app'}];
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 });
 await context.addInitScript(({user,jwt,expiry})=>{
  localStorage.setItem('sb-qqfntftbughorckugceu-auth-token',JSON.stringify({access_token:jwt,refresh_token:'controlled-refresh',expires_at:expiry,expires_in:3600,token_type:'bearer',user}));
  localStorage.setItem('receiptit_beta_device_grant_v1','controlled-signed-device-fixture');
  localStorage.setItem('receiptit_authorised_intro_v2_complete','true');
 },{user,jwt,expiry});
 const page=await context.newPage();await page.goto(base+'/#wallet');
 const button=page.getByRole('button',{name:'Quick scan',exact:true});
 await button.waitFor({timeout:15000});
 let chooserCount=0;page.on('filechooser',()=>chooserCount++);
 await button.click();
 await page.getByRole('dialog',{name:'Receipt camera',exact:true}).waitFor();
 assert.equal(chooserCount,0,'Quick scan must never launch a file chooser');
 await page.getByRole('button',{name:'Close camera',exact:true}).click();
 await page.getByRole('heading',{name:'Add receipt',exact:true}).waitFor();
 await page.getByRole('button',{name:'Upload from device',exact:true}).waitFor({timeout:5000});
 assert.equal(await page.getByText('Uploading receipt...', {exact:true}).count(),0);
 const captureInput=await page.locator('input[type=file]').elementHandle();
 await page.evaluate(()=>{
   const channel=new BroadcastChannel('sb-qqfntftbughorckugceu-auth-token');
   channel.postMessage({event:'TOKEN_REFRESHED',session:JSON.parse(localStorage.getItem('sb-qqfntftbughorckugceu-auth-token'))});
   channel.close();
 });
 await page.waitForTimeout(500);
 assert.equal(await captureInput.evaluate(el=>el.isConnected),true,'Session refresh must not remount the capture flow');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:`/tmp/receiptit-startup-v3-scan-${name}.png`});
 console.log('PASS',name,'Wallet opens shared camera directly without file chooser; cancellation and session refresh retain Scan');
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
 assert.equal(new URL(page.url()).pathname,'/signin');assert.equal(new URL(page.url()).hash,'');
 assert.equal(await page.evaluate(()=>localStorage.getItem('receiptit_beta_device_grant_v1')),'controlled-signed-device-fixture');
 await page.waitForFunction(()=>localStorage.getItem('sb-qqfntftbughorckugceu-auth-token')===null);
 console.log('PASS',name,'sign-out clears user session and protected route; beta approval preserved');
 await context.close();
}
await browser.close();
