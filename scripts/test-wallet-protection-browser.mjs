// Isolated UI fixtures only: intercept every Supabase request; never write live records.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.RECEIPTIT_BROWSER_MODULE || 'playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
const phase=process.env.QA_PHASE||'after';
const protection=(page,name)=>phase==='before'?page.getByText(name,{exact:true}):page.getByRole('group',{name,exact:true});
const out=process.env.QA_OUTPUT_DIR || process.cwd()+'/output/wallet-protection-composition/'+phase;
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
 console.log('METRICS',phase,name,JSON.stringify(await card.evaluate(el=>({cardHeight:el.parentElement.getBoundingClientRect().height,listTop:el.parentElement.getBoundingClientRect().top+scrollY}))));
 await page.screenshot({path:out+'/wallet-default-'+name+'.png'});
 if(phase!=='before'){
  const warranty=page.getByRole('button',{name:/^\d+ active warrant(?:y|ies)$/});
  const returns=page.getByRole('button',{name:/^\d+ active return windows?$/});
  assert.equal(await warranty.getAttribute('aria-label'),'2 active warranties');
  assert.equal(await returns.getAttribute('aria-label'),'3 active return windows');
  assert.equal((await warranty.innerText()).replaceAll("\n", " "),'Warranty 2');assert.equal((await returns.innerText()).replaceAll("\n", " "),'Returns 3');
  const categoryRow=page.getByRole('group',{name:'Receipt categories',exact:true});
  assert.deepEqual(await categoryRow.getByRole('button').allTextContents(),['All','Tech','Groceries','Transport','Other']);
  const filterRow=page.getByRole('group',{name:'Warranty and return filters',exact:true});
  assert.equal(await filterRow.getByRole('button').count(),2);
  const geometry=await Promise.all([categoryRow,warranty,returns,page.getByRole('heading',{name:'Receipts',exact:true}),page.getByRole('button',{name:'Quick scan',exact:true}),page.getByRole('searchbox',{name:'Search receipts',exact:true})].map(el=>el.boundingBox()));
  const [categoryBox,warrantyBox,returnBox,headingBox,scanBox,searchBox]=geometry;
  assert.ok(warrantyBox.y>=categoryBox.y+categoryBox.height,'Protection filters below categories');
  assert.equal(warrantyBox.y,returnBox.y,'Protection filters stay together');
  assert.ok(returnBox.x+returnBox.width<=width,'Both filters fit viewport');
  if(mobile){assert.ok(Math.abs(headingBox.y-scanBox.y)<12,'Quick scan beside heading');assert.ok(searchBox.y>=scanBox.y+scanBox.height,'Search on its own row');}
  await warranty.click();assert.equal(await warranty.getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('heading',{name:'Returns only',exact:true}).count(),0);
  await page.getByRole('heading',{name:'2 saved purchases',exact:true}).waitFor();
  await page.waitForTimeout(400);await page.screenshot({path:out+'/wallet-warranty-filter-'+name+'.png'});
  await returns.click();assert.equal(await warranty.getAttribute('aria-pressed'),'false');assert.equal(await returns.getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('heading',{name:'Warranty only',exact:true}).count(),0);
  await page.getByRole('heading',{name:'3 saved purchases',exact:true}).waitFor();
  await page.waitForTimeout(400);await page.screenshot({path:out+'/wallet-return-filter-'+name+'.png'});
  await returns.click();assert.equal(await returns.getAttribute('aria-pressed'),'false');
  const search=page.getByRole('searchbox',{name:'Search receipts',exact:true});
  await search.fill('Neither');await warranty.click();assert.equal(await page.getByRole('heading',{name:'Northbridge Tech',exact:true}).count(),0);
  assert.equal((await warranty.innerText()).replaceAll("\n", " "),'Warranty 2');assert.equal((await returns.innerText()).replaceAll("\n", " "),'Returns 3');
  await search.fill('');await warranty.click();
  await page.getByRole('button',{name:'Tech',exact:true}).click();await returns.click();assert.equal(await page.getByRole('heading',{name:'Returns only',exact:true}).count(),1);
  assert.equal((await warranty.innerText()).replaceAll("\n", " "),'Warranty 2');assert.equal((await returns.innerText()).replaceAll("\n", " "),'Returns 3');
  await returns.click();await page.getByRole('button',{name:'All',exact:true}).click();
 }
 await card.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(300);
 await page.screenshot({path:out+'/wallet-'+name+'.png'});
 await card.click();await page.getByRole('button',{name:'Close receipt',exact:true}).waitFor();
 if(phase!=='before')assert.equal(await protection(page,'Warranty').evaluate(el=>Boolean(document.querySelector('h4')?.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING)),true,'Protection below Items & payment');
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
 if(phase!=='before'){
  const dates=rows.map(r=>[r.warranty_date,r.return_date]);
  rows.forEach(r=>{r.warranty_date=null;r.return_date=null;});
  await page.reload();await page.getByRole('heading',{name:'Northbridge Tech',exact:true}).waitFor();
  assert.equal((await page.getByRole('button',{name:'0 active warranties',exact:true}).innerText()).replaceAll('\n',' '),'Warranty 0');
  assert.equal((await page.getByRole('button',{name:'0 active return windows',exact:true}).innerText()).replaceAll('\n',' '),'Returns 0');
  await page.getByRole('button',{name:/^\d+ active warrant(?:y|ies)$/}).click();await page.getByRole('heading',{name:'No active warranties',exact:true}).waitFor();
  await page.getByRole('button',{name:/^\d+ active return windows?$/}).click();await page.getByRole('heading',{name:'No active return windows',exact:true}).waitFor();
  rows.forEach((r,i)=>{[r.warranty_date,r.return_date]=dates[i];});
 }
 await context.close();
 console.log('PASS',phase,name,'Wallet filters, search/category composition, protection placement and variant rendering');
}
await browser.close();
