// Isolated UI fixtures only: intercept every Supabase request; never write live records.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.RECEIPTIT_BROWSER_MODULE || 'playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
const phase=process.env.QA_PHASE||'after';
const out=process.env.QA_OUTPUT_DIR || process.cwd()+'/output/wallet-protection-composition/'+phase;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'isolated-browser@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const expiry=Math.floor(Date.now()/1000)+86400*400;
const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:expiry})).toString('base64url')+'.controlled-browser-fixture';
let activeUser=user;
const date=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
const rows=[['Northbridge Tech',365,27],['Warranty only',365,null],['Returns only',null,27],['Neither',null,null],['Urgent return',null,2],['Expired cover',-30,-30]].map(([merchant,w,r],i)=>({id:`00000000-0000-4000-8000-${String(i+10).padStart(12,'0')}`,user_id:user.id,merchant,amount:149.99,amount_gbp:149.99,currency:'GBP',status:'parsed',document_type:'receipt',category:'Technology',card_last_4:'4242',transaction_date:date(-2),created_at:new Date().toISOString(),warranty_date:w===null?null:date(w),return_date:r===null?null:date(r),source:'image',storage_path:user.id+'/isolated-ui-'+i+'.png',reference_number:'NB-'+(20481+i)}));
async function contextFor(width,height,mobile,intro=false){
 const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
 await context.route('https://qqfntftbughorckugceu.supabase.co/**',async route=>{
  const u=new URL(route.request().url());let value=[];
  if(u.pathname.endsWith('/user'))value=intro?null:activeUser;
  else if(u.pathname.includes('/auth/v1/'))value={};
  else if(u.pathname.endsWith('/verify-access-code'))value={valid:true,deviceAuthorization:'controlled-signed-device-fixture',signupAuthorization:'controlled-signup-fixture'};
  else if(u.pathname.endsWith('/profiles'))value={id:activeUser.id,username:'qa',full_name:'QA',preferred_currency:'GBP',monthly_budget_amount:2500,monthly_budget_currency:'GBP',currency_setup_completed:true,legacy_budget_migration_completed:true};
  else if(u.pathname.endsWith('/ensure_friendly_email_alias'))value=[{email_address:'nicholas47c@in.receiptit.app'}];
  else if(u.pathname.endsWith('/receipts'))value=rows.filter(r=>u.searchParams.get('user_id')==='eq.'+r.user_id);
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

const context=await contextFor(393,873,true);
let subscription;
await context.routeWebSocket(/supabase.co\/realtime\//,ws=>{
 ws.onMessage(raw=>{
  const [join,ref,topic,event,payload]=JSON.parse(raw);
  if(event==='phx_join'){
   const filters=(payload.config?.postgres_changes||[]).map((f,i)=>({...f,id:i+1}));
   subscription={ws,join,topic,filters};
   ws.send(JSON.stringify([join,ref,topic,'phx_reply',{status:'ok',response:{postgres_changes:filters}}]));
  } else if(event==='heartbeat'||event==='phx_leave')ws.send(JSON.stringify([join,ref,topic,'phx_reply',{status:'ok',response:{}}]));
 });
});
function emit(type,row,old={}){
 assert.ok(subscription?.filters.length,'Real Wallet subscription established');
 const columns=Object.keys(row).map(name=>({name,type:'text'}));
 subscription.ws.send(JSON.stringify([subscription.join,null,subscription.topic,'postgres_changes',{ids:[1],data:{schema:'public',table:'receipts',type,record:row,old_record:old,columns,commit_timestamp:new Date().toISOString(),errors:[]}}]));
}
let page=await context.newPage();await page.clock.install();
rows.splice(1); // exactly one purchase with both protections
await page.goto(base+'/#wallet');
const w=()=>page.getByRole('button',{name:/^\d+ active warrant(?:y|ies)$/});
const t=()=>page.getByRole('button',{name:/^\d+ active return windows?$/});
async function counts(warranty,returns){
 await page.getByRole('button',{name:`${warranty} active ${warranty===1?'warranty':'warranties'}`,exact:true}).waitFor();
 await page.getByRole('button',{name:`${returns} active return ${returns===1?'window':'windows'}`,exact:true}).waitFor();
 assert.equal(await w().innerText(),String(warranty));assert.equal(await t().innerText(),String(returns));
}
await counts(1,1);await fit(page,'one each');
const second={...rows[0],id:'00000000-0000-4000-8000-000000000022',storage_path:user.id+'/second.png',merchant:'Second purchase'};
rows.push(second);emit('INSERT',second);await counts(2,2);
emit('INSERT',second);await counts(2,2); // repeated event cannot double-count
for(const [index,extra] of [
 {status:'failed'}, {status:'rejected'}, {status:'needs_review'},
 {document_type:'non_purchase_document'}, {warranty_date:'invalid',return_date:'invalid'},
].entries()){
 const excluded={...second,...extra,id:`00000000-0000-4000-8000-00000000003${index}`,storage_path:user.id+'/excluded-'+index+'.png',merchant:'Excluded '+index};
 rows.push(excluded);emit('INSERT',excluded);
}
await page.waitForTimeout(300);await counts(2,2);
second.warranty_date=null;emit('UPDATE',second);await counts(1,2);
rows.splice(1,1);emit('DELETE',second,{id:second.id});await counts(1,1);
console.log('PASS rendered subscription: initial 1/1; INSERT 2/2; repeated INSERT and ineligible/invalid rows stay 2/2; correction 1/2; DELETE 1/1');
const instant=Date.now();
rows[0].warranty_date=new Date(instant+1000).toISOString();
rows[0].return_date=new Date(instant).toISOString();
emit('UPDATE',rows[0]);await counts(1,1);
await page.clock.setSystemTime(new Date(instant+2000));await page.clock.fastForward(31000);await counts(0,1);
const midnight=new Date(instant);midnight.setHours(24,0,1,0);
await page.clock.setSystemTime(midnight);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await counts(0,0);
console.log('PASS expiry without data writes: warranty clock tick 0/1; return next-day focus 0/0');
await page.clock.setSystemTime(new Date(instant));
rows[0].warranty_date=date(365);rows[0].return_date=date(27);emit('UPDATE',rows[0]);
await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await counts(1,1);
const other={...user,id:'00000000-0000-4000-8000-000000000002',email:'second-owner@example.invalid'};
// Account switching uses a fresh browser clock, independent of time-travel tests.
await context.close();
const accountContext=await contextFor(393,873,true);
await accountContext.routeWebSocket(/supabase.co/,()=>{});
page=await accountContext.newPage();await page.goto(base+'/#wallet');await counts(1,1);
rows.push({...rows[0],id:'00000000-0000-4000-8000-000000000023',user_id:other.id,storage_path:other.id+'/own.png',merchant:'Owner B only',warranty_date:null});
activeUser=other;
const bjwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:other.id,aud:'authenticated',role:'authenticated',exp:expiry})).toString('base64url')+'.fixture';
await page.evaluate(({other,bjwt,expiry})=>{
 const session={access_token:bjwt,refresh_token:'fixture-b',expires_at:expiry,expires_in:86400*400,token_type:'bearer',user:other};
 localStorage.setItem('sb-qqfntftbughorckugceu-auth-token',JSON.stringify(session));
 const channel=new BroadcastChannel('sb-qqfntftbughorckugceu-auth-token');
 channel.postMessage({event:'SIGNED_IN',session});channel.close();
},{other,bjwt,expiry});
await page.getByRole('heading',{name:'Owner B only',exact:true}).waitFor().catch(async error=>{console.log('Controlled UI state:',await page.locator('body').innerText());throw error;});await counts(0,1);
assert.equal(await page.getByRole('heading',{name:'Northbridge Tech',exact:true}).count(),0);
console.log('PASS same-tab owner switch: A 1/1 → B 0/1, A receipt absent');
await accountContext.close();await browser.close();
