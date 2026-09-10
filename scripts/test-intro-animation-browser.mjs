// Actual app UI with isolated access-grant responses. No real signup or upload.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.RECEIPTIT_BROWSER_MODULE||'playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:4174';
const phase=process.env.QA_PHASE||'after';
const out=`output/intro-animation/${phase}`;await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const results=[];
async function open(width,height,{reduced=false,fail=false}={}){
 const context=await browser.newContext({viewport:{width,height},isMobile:width<768,hasTouch:width<768,reducedMotion:reduced?'reduce':'no-preference'});
 await context.route('https://qqfntftbughorckugceu.supabase.co/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const value=path.endsWith('/verify-access-code')?{valid:true,deviceAuthorization:'isolated-intro-grant',signupAuthorization:'isolated-signup-grant'}:path.endsWith('/user')?null:[];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 });
 if(fail)await context.route('**/intro/revision-05/receiptit-story.js',route=>route.abort());
 await context.addInitScript(()=>localStorage.setItem('receiptit_beta_device_grant_v1','isolated-intro-grant'));
 const page=await context.newPage();await page.goto(base+'/signup');await page.getByRole('button',{name:'Continue',exact:true}).waitFor();
 return {context,page};
}
async function fit(page){
 assert.ok(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth),'Intro fits horizontally');
 const c=await page.getByRole('button',{name:'Continue',exact:true}).boundingBox();
 assert.ok(c.x>=0&&c.y>=0&&c.x+c.width<=page.viewportSize().width&&c.y+c.height<=page.viewportSize().height,'Continue is reachable without waiting for animation');
}
async function continueToSignup(page){
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Create account',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('receiptit_authorised_intro_v2_complete')),'true');
 assert.equal(await page.locator('receiptit-story').count(),0,'Animation removed after continuing');
}
try{
 for(const [name,width,height] of [['Desktop',1280,800],['Small',320,568],['Android',360,640],['Pixel',393,873],['iPhone',390,844],['Samsung',412,915]]){
  if(process.env.QA_ONLY&&!process.env.QA_ONLY.split(',').includes(name))continue;
  const {page,context}=await open(width,height);if(phase!=='before')await fit(page);
  if(phase==='before'){
   await page.getByRole('heading',{name:/Everything after the purchase/}).waitFor();
   await page.screenshot({path:`${out}/${name}.png`});
  }else{
   await page.getByRole('heading',{name:'receiptIt',exact:true}).waitFor();
   assert.equal(await page.getByText(/Everything after the purchase|Your purchases are yours|We organise it/).count(),0);
   const story=page.locator('receiptit-story');await page.waitForFunction(()=>document.querySelector('receiptit-story')?.currentTime>0.05);
   assert.equal(await story.getAttribute('layout'),'signup');assert.equal(await story.getAttribute('variant'),'full');
   const top=await page.getByRole('heading',{name:'receiptIt',exact:true}).boundingBox(),art=await story.boundingBox();assert.ok(top.y+top.height<=art.y,'Wordmark above the full visual');
   await page.getByRole('button',{name:'Pause animation',exact:true}).click();
   const stopped=await story.evaluate(el=>el.currentTime);await page.waitForTimeout(200);assert.equal(await story.evaluate(el=>el.currentTime),stopped);
   await page.getByRole('button',{name:'Play animation',exact:true}).click();await page.waitForTimeout(200);assert.ok(await story.evaluate(el=>!el.paused&&el.currentTime>0));
   for(const [label,time] of [['checkout',0],['private-email',5.8],['complete',10.8]]){
    await story.evaluate((el,t)=>el.seek(t),time);await page.waitForTimeout(80);await fit(page);
    if(name==='Pixel'||label==='complete')await page.screenshot({path:`${out}/${name}-${label}.png`});
   }
   assert.equal(await story.locator('[data-anim="emailUser"]').textContent(),'username@');
   assert.equal(await story.locator('[data-anim="emailDomain"]').textContent(),'in.receiptit.app');
   assert.equal(await story.locator('[data-anim="signature"]').getAttribute('opacity'),'1');
   await page.locator('main').evaluate(el=>el.scrollTo({top:el.scrollHeight,behavior:'instant'}));
   const lower=await story.boundingBox(),cta=await page.getByRole('button',{name:'Continue',exact:true}).boundingBox();assert.ok(lower.y+lower.height<=cta.y,'Entire story scrolls clear of Continue');
   await continueToSignup(page);
  }
  await context.close();results.push({name,width,height,result:'PASS'});console.log('PASS',phase,name);
 }
 if(phase!=='before'){
  for(const [name,options] of [['reduced-motion',{reduced:true}],['module-failure',{fail:true}]]){
   const {page,context}=await open(393,873,options);
   const fallback=page.getByRole('img',{name:/Illustration: use a receiptIt email/});await fallback.waitFor();
   await page.waitForFunction(()=>document.querySelector('img[src*="signup-slot-static"]')?.naturalWidth>0);
   await page.getByRole('button',{name:'Pause animation',exact:true}).waitFor({state:'hidden'});
   assert.equal(await page.locator('receiptit-story').count(),0);await fit(page);await page.screenshot({path:`${out}/${name}.png`});await continueToSignup(page);await context.close();console.log('PASS',name);results.push({name,result:'PASS'});
  }
 }
}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
