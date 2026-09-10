// Visual/copy tests of the real app bundle, using isolated intercepted data.
// No live receipt uploads, processing, profile or Alias changes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.RECEIPTIT_BROWSER_MODULE||'playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:4173';
const phase=process.env.QA_PHASE||'after';
const out=`output/cross-device-copy/${phase}`;await mkdir(out,{recursive:true});
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'isolated-copy@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const expiry=2000000000;
const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:expiry})).toString('base64url')+'.isolated-copy-fixture';
const rows=[['September purchase',270.09,'2026-09-05','parsed'],['August purchase',37,'2026-08-19','parsed'],['October purchase',42.5,'2026-10-05','parsed']].map(([merchant,amount,date,status],i)=>({id:`00000000-0000-4000-8000-${String(i+10).padStart(12,'0')}`,user_id:user.id,merchant,amount,amount_gbp:amount,currency:'GBP',status,document_type:'receipt',category:'Tech',transaction_date:date,created_at:'2026-09-10T08:00:00Z',source:'image',storage_path:user.id+`/isolated-copy-${i}.png`}));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const results=[];
const firstCopy='Give retailers your receiptIt email instead of your personal inbox when they only need somewhere to send the receipt.';
const secondCopy='Forward receipts, invoices or order confirmations to your receiptIt address and we’ll add them for you.';
async function fits(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');}
try{
 for(const [name,width,height] of [['Desktop',1280,800],['Small',320,568],['Android',360,640],['Pixel',393,873],['iPhone',390,844],['Samsung',412,915]]){
  if(process.env.QA_ONLY&&!process.env.QA_ONLY.split(',').includes(name))continue;
  const context=await browser.newContext({viewport:{width,height},isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
  await context.route('https://qqfntftbughorckugceu.supabase.co/**',async route=>{
   const u=new URL(route.request().url());let value=[];
   if(u.pathname.endsWith('/user'))value=user;
   else if(u.pathname.includes('/auth/v1/'))value={};
   else if(u.pathname.endsWith('/verify-access-code'))value={valid:true,deviceAuthorization:'isolated-device-fixture',signupAuthorization:'isolated-signup-fixture'};
   else if(u.pathname.endsWith('/profiles'))value={id:user.id,username:'copyqa',full_name:'QA',preferred_currency:'GBP',monthly_budget_amount:2500,monthly_budget_currency:'GBP',currency_setup_completed:true,legacy_budget_migration_completed:true};
   else if(u.pathname.endsWith('/ensure_friendly_email_alias'))value=[{email_address:'nicholas47c@in.receiptit.app'}];
   else if(u.pathname.endsWith('/receipts'))value=rows;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
  });
  await context.addInitScript(({user,jwt,expiry})=>{
   localStorage.setItem('sb-qqfntftbughorckugceu-auth-token',JSON.stringify({access_token:jwt,refresh_token:'isolated-refresh',expires_at:expiry,expires_in:3600,token_type:'bearer',user}));
   localStorage.setItem('receiptit_beta_device_grant_v1','isolated-device-fixture');
   localStorage.setItem('receiptit_authorised_intro_v2_complete','true');
  },{user,jwt,expiry});
  const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-09-10T12:00:00Z'));
  await page.goto(base+'/#wallet');await page.getByRole('heading',{name:'September purchase',exact:true}).waitFor();
  const summary=page.locator('[aria-busy]').filter({hasText:'Average purchase'});
  await page.waitForFunction(()=>document.querySelector('[aria-busy="false"]'));
  const quick=page.getByRole('button',{name:phase==='before'&&width>=1024?'Scan receipt':'Quick scan',exact:true});await quick.waitFor();
  if(phase!=='before'){
   await summary.getByText('September spend',{exact:true}).waitFor();
   assert.equal(await summary.getByText('£270.09',{exact:true}).count(),2,'September amount and average unchanged');
   assert.ok(!(await summary.innerText()).includes('spent'));
   assert.equal(await page.getByRole('button',{name:'Scan receipt',exact:true}).count(),0);
  }
  await fits(page);await page.waitForTimeout(500);await page.screenshot({path:`${out}/wallet-${name}.png`,fullPage:true});
  if(phase!=='before'){
   await page.clock.setFixedTime(new Date('2026-10-10T12:00:00Z'));await page.reload();
   await summary.getByText('October spend',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('[aria-busy="false"]'));
   assert.equal(await summary.getByText('£42.50',{exact:true}).count(),2,'October label matches unchanged transaction-month calculation');
   await page.clock.setFixedTime(new Date('2026-09-10T12:00:00Z'));
  }
  await page.goto(base+'/#alias');await page.getByRole('heading',{name:'Your new private email',exact:true}).waitFor();
  const copy=page.getByRole('button',{name:'Copy email',exact:true});await copy.waitFor();
  if(phase!=='before'){
   assert.equal(await page.locator('h2').count(),2);
   await page.getByRole('heading',{name:'Stop the spam',exact:true}).waitFor();await page.getByRole('heading',{name:'Send receipts here',exact:true}).waitFor();
   await page.getByText(firstCopy,{exact:true}).waitFor();await page.getByText(secondCopy,{exact:true}).waitFor();
   assert.equal(await page.getByText(/At checkout|Keeps your main inbox|Forward a receipt/).count(),0);
   await copy.click();await page.getByRole('button',{name:'Copied',exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'nicholas47c@in.receiptit.app');
   await page.getByRole('button',{name:'Copy email',exact:true}).waitFor();
  }
  await fits(page);await page.waitForTimeout(400);await page.screenshot({path:`${out}/email-${name}.png`,fullPage:true});
  if(phase!=='before'){
   // An element can be inside the viewport yet behind fixed navigation;
   // scrollIntoViewIfNeeded alone does not test whether it is reachable.
   await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
   const textBox=await page.getByText(secondCopy,{exact:true}).boundingBox();
   const nav=await page.locator('nav').last().boundingBox();
   if(width<768&&nav)assert.ok(textBox.y+textBox.height<=nav.y,'Final supporting copy clears fixed navigation');
  }
  results.push({name,width,height,result:'PASS',data:'isolated UI fixtures',bundle:base});console.log('PASS',phase,name);
  await context.close();
 }
}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
