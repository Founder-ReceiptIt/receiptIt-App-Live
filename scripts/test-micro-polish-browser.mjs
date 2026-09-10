// Isolated UI fixtures only: intercept every Supabase request; never write live records.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.RECEIPTIT_BROWSER_MODULE || 'playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
const phase=process.env.QA_PHASE||'after';
const protection=(page,name)=>phase==='before'?page.getByText(name,{exact:true}):page.getByRole('group',{name,exact:true});
const out=process.env.QA_OUTPUT_DIR || process.cwd()+'/output/micro-polish-email-warranty/'+phase;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'isolated-browser@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const expiry=Math.floor(Date.now()/1000)+3600;
const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:expiry})).toString('base64url')+'.controlled-browser-fixture';
const date=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
const rows=[['Northbridge Tech',365,27],['Warranty only',365,null],['Returns only',null,27],['Neither',null,null],['Urgent return',null,2],['Expired cover',-30,-30]].map(([merchant,w,r],i)=>({id:`00000000-0000-4000-8000-${String(i+10).padStart(12,'0')}`,user_id:user.id,merchant,amount:149.99,amount_gbp:149.99,currency:'GBP',status:'parsed',document_type:'receipt',category:'Technology',card_last_4:'4242',transaction_date:date(-2),created_at:new Date().toISOString(),warranty_date:w===null?null:date(w),return_date:r===null?null:date(r),source:'image',storage_path:user.id+'/isolated-ui-'+i+'.png',reference_number:'NB-'+(20481+i)}));
async function contextFor(width,height,mobile,intro=false){
 const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
 await context.route('https://qqfntftbughorckugceu.supabase.co/**',async route=>{
  const u=new URL(route.request().url());let value=[];
  if(u.pathname.endsWith('/user'))value=intro?null:user;
  else if(u.pathname.includes('/auth/v1/'))value={};
  else if(u.pathname.endsWith('/verify-access-code'))value={valid:true,deviceAuthorization:'controlled-signed-device-fixture',signupAuthorization:'controlled-signup-fixture'};
  else if(u.pathname.endsWith('/profiles'))value={id:user.id,username:'qa',full_name:'QA',preferred_currency:'GBP',monthly_budget_amount:2500,monthly_budget_currency:'GBP',currency_setup_completed:true,legacy_budget_migration_completed:true};
  else if(u.pathname.endsWith('/ensure_friendly_email_alias'))value=[{email_address:'nicholas47c@in.receiptit.app'}];
  else if(u.pathname.endsWith('/receipts'))value=rows;
  else if(u.pathname.endsWith('/receipt_items'))value=rows.filter(r=>!u.searchParams.get('receipt_id')?.startsWith('eq.')||u.searchParams.get('receipt_id')==='eq.'+r.id).map(r=>({id:r.id,receipt_id:r.id,line_index:1,description:'Wireless headphones',display_name:'Wireless headphones',quantity:1,unit_price:149.99,line_total:149.99}));
  else if(u.pathname.endsWith('/receipt_payments'))value=[{payment_method:'card',amount:149.99,currency:'GBP',card_last_4:'4242'}];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 });
 await context.addInitScript(({user,jwt,expiry,intro})=>{
  if(!intro)localStorage.setItem('sb-qqfntftbughorckugceu-auth-token',JSON.stringify({access_token:jwt,refresh_token:'controlled-refresh',expires_at:expiry,expires_in:3600,token_type:'bearer',user}));
  localStorage.setItem('receiptit_beta_device_grant_v1','controlled-signed-device-fixture');
  if(!intro)localStorage.setItem('receiptit_authorised_intro_v2_complete','true');
 },{user,jwt,expiry,intro});
 return context;
}
async function fit(page,label){
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' page overflow');
 const overflow=await page.locator('[aria-label="Warranty active"],span:has(> svg.lucide-undo-2)').evaluateAll(nodes=>nodes.filter(e=>e.getBoundingClientRect().right>innerWidth||e.getBoundingClientRect().left<0).map(e=>e.textContent));
 assert.deepEqual(overflow,[],label+' badge outside viewport');
}
for(const [name,width,height,mobile] of [['Small',320,568,true],['Android',360,640,true],['Pixel',393,873,true],['iPhone',390,844,true],['Samsung',412,915,true],['Desktop',1280,800,false]]){
 if(process.env.QA_ONLY&&!process.env.QA_ONLY.split(',').includes(name))continue;
 const context=await contextFor(width,height,mobile);const page=await context.newPage();
 await page.goto(base+'/#wallet');await page.getByRole('heading',{name:'Northbridge Tech',exact:true}).waitFor();await page.waitForTimeout(500);
 await fit(page,name+' Wallet');
 const card=page.getByRole('button').filter({has:page.getByRole('heading',{name:'Northbridge Tech',exact:true})});
 if(phase!=='before'){await card.getByLabel('Warranty active').waitFor();await card.getByText('27 days left',{exact:true}).waitFor();}
 await card.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(300);
 await page.screenshot({path:out+'/wallet-'+name+'.png'});
 await card.click();await page.getByRole('button',{name:'Close receipt',exact:true}).waitFor();
 await protection(page,'Warranty').evaluate(el=>el.closest('section').scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(500);await fit(page,name+' Detail');
 await page.screenshot({path:out+'/detail-'+name+'.png'});
 await page.getByRole('button',{name:'Close receipt',exact:true}).click();
 for(const [merchant,w,r] of [['Warranty only',true,false],['Returns only',false,true],['Neither',false,false],['Urgent return',false,true],['Expired cover',true,true]]){
  if(phase!=='before'){
   const row=page.getByRole('button').filter({has:page.getByRole('heading',{name:merchant,exact:true})});
   assert.equal(await row.getByLabel('Warranty active').count(),w&&merchant!=='Expired cover'?1:0,merchant+' Wallet warranty badge');
   assert.equal(await row.getByText(/^\d+ days left$/).count(),r&&merchant!=='Expired cover'?1:0,merchant+' Wallet return badge');
  }
  await page.getByRole('heading',{name:merchant,exact:true}).click();await page.getByRole('button',{name:'Close receipt',exact:true}).waitFor();
  assert.equal(await protection(page,'Warranty').count(),w?1:0,merchant+' warranty');
  assert.equal(await protection(page,'Returns').count(),r?1:0,merchant+' returns');await fit(page,name+' '+merchant);
  if(phase!=='before'&&merchant==='Expired cover'){
   const shadows=await protection(page,'Warranty').evaluate(el=>Array.from(el.closest('section').children).map(card=>getComputedStyle(card).boxShadow));
   assert.deepEqual(shadows,['none','none'],'Expired cover must stay muted without coloured glow');
  }
  if(name==='Pixel'){
   const label=protection(page,w?'Warranty':'Returns');
   if(w||r)await label.evaluate(el=>el.closest('section').scrollIntoView({block:'center',behavior:'instant'}));
   await page.waitForTimeout(250);await page.screenshot({path:out+'/detail-'+merchant.replaceAll(' ','-')+'-'+name+'.png'});
  }
  await page.getByRole('button',{name:'Close receipt',exact:true}).click();
 }
 await page.goto(base+'/#alias');await page.getByRole('heading',{name:phase==='before'?'Your private receipt email':'Your new private email',exact:true}).waitFor();await page.waitForTimeout(300);await fit(page,name+' Email');
 if(phase!=='before')assert.equal(await page.getByText(/Use this when a shop asks/).count(),0);
 await page.screenshot({path:out+'/email-'+name+'.png',fullPage:true});await context.close();
 const introContext=await contextFor(width,height,mobile,true);const intro=await introContext.newPage();await intro.goto(base+'/signup');
 if(phase==='before'){
  await intro.getByRole('heading',{name:/Everything after the purchase/}).waitFor();
  await intro.getByText('Use it later',{exact:true}).scrollIntoViewIfNeeded();
 }else{
  await intro.getByRole('heading',{name:'receiptIt',exact:true}).waitFor();
  await intro.getByRole('button',{name:'Continue',exact:true}).waitFor();
  assert.equal(await intro.getByText(/Everything after the purchase/).count(),0);
 }
 await intro.waitForTimeout(300);await fit(intro,name+' Intro');
 await intro.screenshot({path:out+'/intro-'+name+'.png',fullPage:true});await introContext.close();
 console.log('PASS',phase,name,'Wallet/detail both, warranty-only, return-only, neither, urgent/expired; Email; Intro');
}
await browser.close();
