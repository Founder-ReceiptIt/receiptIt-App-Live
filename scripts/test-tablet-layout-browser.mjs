// Isolated UI fixtures only: intercept every Supabase request; never write live records.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.RECEIPTIT_BROWSER_MODULE || 'playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
const phase=process.env.QA_PHASE||'after';
const protection=(page,name)=>phase==='before'?page.getByText(name,{exact:true}):page.getByRole('group',{name,exact:true});
const out=process.env.QA_OUTPUT_DIR || process.cwd()+'/output/tablet-layout/'+phase;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'isolated-browser@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const expiry=Math.floor(Date.now()/1000)+3600;
const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:expiry})).toString('base64url')+'.controlled-browser-fixture';
const date=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
const rows=[['Northbridge Tech',365,27],['Warranty only',365,null],['Returns only',null,27],['Neither',null,null],['Urgent return',null,2],['Expired cover',-30,-30]].map(([merchant,w,r],i)=>({id:`00000000-0000-4000-8000-${String(i+10).padStart(12,'0')}`,user_id:user.id,merchant,amount:149.99,amount_gbp:149.99,currency:'GBP',status:'parsed',document_type:'receipt',category:'Technology',card_last_4:'4242',transaction_date:date(-2),created_at:new Date().toISOString(),warranty_date:w===null?null:date(w),return_date:r===null?null:date(r),source:'image',storage_path:user.id+'/isolated-ui-'+i+'.png',reference_number:'NB-'+(20481+i)}));
rows.forEach((row,i)=>{row.category=['Tech','Other','Tech','Groceries','Transport','Other'][i];});
async function contextFor(width,height,mobile,intro=false){
 const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
 await context.route(/^https:\/\/(?:qqfntftbughorckugceu\.supabase\.co|receiptit-onboarding\.invalid)\//,async route=>{
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
  if(!intro)for(const project of ['qqfntftbughorckugceu','receiptit-onboarding'])localStorage.setItem('sb-'+project+'-auth-token',JSON.stringify({access_token:jwt,refresh_token:'controlled-refresh',expires_at:expiry,expires_in:3600,token_type:'bearer',user}));
  localStorage.setItem('receiptit_beta_device_grant_v1','controlled-signed-device-fixture');
  if(!intro)localStorage.setItem('receiptit_authorised_intro_v2_complete','true');
 },{user,jwt,expiry,intro});
 return context;
}
const results=[];
async function inspect(page,label){
 await page.waitForTimeout(1200);
 const errors=await page.evaluate(()=>{
  const problems=[];if(document.documentElement.scrollWidth>innerWidth+1)problems.push('page horizontal overflow');
  for(const el of document.querySelectorAll('nav button,input:not([type=file]),select,h1')){
   if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')continue;
   const b=el.getBoundingClientRect();if(b.width&& (b.left<-.5||b.right>innerWidth+.5))problems.push((el.getAttribute('aria-label')||el.textContent||el.placeholder||el.tagName).trim()+' outside viewport');
  }
  return problems;
 });results.push({label,errors,result:errors.length?'FAIL':'PASS'});console.log(errors.length?'FAIL':'PASS',label,JSON.stringify(errors));
 await page.screenshot({path:out+'/'+label.replaceAll(' ','-')+'.png'});
}
try{
 for(const[name,width,height]of[['Small',320,568],['Android',360,640],['Pixel',393,873],['iPhone',390,844],['Samsung',412,915],['Tablet600',600,960],['iPad',768,1024],['SamsungTablet',800,1280],['TabletLandscape',1280,800],['iPadLandscape',1024,768],['Desktop',1440,900],['TabletLargeText',800,1280],['LandscapeLargeText',1024,768]]){
  if(process.env.QA_ONLY&&!process.env.QA_ONLY.split(',').includes(name))continue;
  const context=await contextFor(width,height,width<1280),page=await context.newPage();
  if(name.includes('LargeText'))await context.addInitScript(()=>{document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.fontSize='20px');});
  for(const[tab,title]of[['wallet','Receipts'],['alias','Your new private email'],['scan','Add receipt'],['insights','Your spending'],['activity','Activity'],['settings','Settings']]){
   await page.goto(base+'/#'+tab);await page.getByRole('heading',{name:title,exact:true}).waitFor();await inspect(page,name+' '+tab);
   if(tab==='wallet'){
    await page.getByRole('heading',{name:'Northbridge Tech',exact:true}).click();await page.getByRole('button',{name:'Close receipt',exact:true}).waitFor();await inspect(page,name+' detail');await page.getByRole('button',{name:'Close receipt',exact:true}).click();
   }
  }
  if(width<1024){
   await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(150);
   const last=page.locator('.ri-mobile-page button').last(),nav=page.locator('nav').filter({has:page.getByRole('button',{name:'Wallet',exact:true})});
   const bottom=(await last.boundingBox()).y+(await last.boundingBox()).height;
   const navTop=await nav.evaluateAll(nodes=>Math.min(...nodes.filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().top)));
   assert.ok(bottom<=navTop,'Settings actions scroll clear of bottom navigation');
  }
  await page.getByRole('button',{name:'Wallet',exact:true}).click();await page.getByRole('heading',{name:'Receipts',exact:true}).waitFor();
  await context.close();
  const introContext=await contextFor(width,height,width<1280,true),intro=await introContext.newPage();
  await intro.goto(base+'/signup');await intro.locator('receiptit-story').waitFor();await intro.locator('receiptit-story').evaluate(e=>e.seek(6.3));await inspect(intro,name+' intro');
  await intro.locator('receiptit-story').evaluate(e=>e.seek(e.duration));await inspect(intro,name+' intro-ending');
  await intro.getByRole('button',{name:"Let's begin",exact:true}).click();await intro.getByRole('button',{name:'Create account',exact:true}).waitFor();await inspect(intro,name+' signup');
  await intro.getByRole('button',{name:'Sign In',exact:true}).click();await intro.getByRole('button',{name:'Sign in',exact:true}).waitFor();await inspect(intro,name+' signin');await introContext.close();
 }
}finally{await browser.close();await (await import('node:fs/promises')).writeFile(out+'/results.json',JSON.stringify(results,null,2));}
assert.ok(results.every(r=>r.result==='PASS'),'See viewport failures in results');
