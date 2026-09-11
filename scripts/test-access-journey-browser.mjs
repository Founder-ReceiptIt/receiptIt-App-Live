// Isolated browser integration: all backend calls intercepted, no real signup.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.RECEIPTIT_BROWSER_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.TEST_URL||'http://127.0.0.1:4196';
try {
 for(const unavailable of [false,true]) {
  const context=await browser.newContext({viewport:{width:393,height:873}});
  let signedIn=false;const received=[];
  const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'telemetry-ui@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
  const jwt=Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Date.now()/1000+3600,aud:'authenticated',role:'authenticated'})).toString('base64url')+'.fixture';
  await context.route(/^https:\/\/(receiptit-onboarding\.invalid|qqfntftbughorckugceu\.supabase\.co)\//,async route=>{
   const u=new URL(route.request().url());const body=route.request().postDataJSON();let data=[];
   if(u.pathname.endsWith('/verify-access-code')){received.push({path:'verify',body});data={valid:true,deviceAuthorization:'fixture-device',signupAuthorization:'fixture-signup',...(body.accessCode?{journeyToken:'fixture-journey'}:{})};}
   else if(u.pathname.endsWith('/access-code-event')){received.push({path:'event',body});await route.fulfill({status:unavailable?503:204});return;}
   else if(u.pathname.endsWith('/create-account')){received.push({path:'signup',body});data=body.mode==='check-alias'?{available:true}:{success:true,email:user.email};}
   else if(u.pathname.endsWith('/token')){signedIn=true;data={access_token:jwt,refresh_token:'fixture-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};}
   else if(u.pathname.endsWith('/user'))data=signedIn?user:null;
   else if(u.pathname.endsWith('/profiles'))data={id:user.id,email:user.email,username:'telemetry',full_name:'Telemetry',preferred_currency:'GBP',monthly_budget_amount:2500,monthly_budget_currency:'GBP',currency_setup_completed:true,legacy_budget_migration_completed:true};
   else if(u.pathname.endsWith('/ensure_friendly_email_alias'))data=[{email_address:'telemetry@in.receiptit.app'}];
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await context.newPage();await page.goto(base);
  await page.getByPlaceholder('Enter access code').fill('SEBASTIAN26');await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.locator('receiptit-story').waitFor();await page.locator('receiptit-story').evaluate(e=>e.seek(e.duration));
  await page.getByRole('button',{name:"Let's begin",exact:true}).click();
  await page.getByPlaceholder('you@example.com').fill(user.email);await page.locator('input[type=password]').fill('isolated-ui-password');await page.locator('#private-address').fill('telemetry-user');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.getByRole('heading',{name:'Receipts',exact:true}).waitFor({timeout:20000});await page.waitForTimeout(1000);
  const signup=received.filter(e=>e.path==='signup'&&e.body.mode!=='check-alias');assert.equal(signup.length,1);assert.equal(signup[0].body.journeyToken,'fixture-journey');
  const events=received.filter(e=>e.path==='event');assert.ok(events.some(e=>e.body.event==='intro_completed'&&e.body.completionMethod==='completed'));assert.ok(events.some(e=>e.body.event==='wallet_reached'));
  if(!unavailable){assert.equal(events.filter(e=>e.body.event==='intro_completed').length,1);assert.equal(events.filter(e=>e.body.event==='wallet_reached').length,1);}
  await page.reload();await page.getByRole('heading',{name:'Receipts',exact:true}).waitFor();await page.waitForTimeout(300);
  assert.equal(received.filter(e=>e.path==='signup'&&e.body.mode!=='check-alias').length,1);
  if(!unavailable)assert.equal(received.filter(e=>e.path==='event'&&e.body.event==='wallet_reached').length,1);
  console.log('PASS browser full journey; telemetry unavailable='+unavailable+'; reload does not create signup');await context.close();
 }
}finally{await browser.close();}
