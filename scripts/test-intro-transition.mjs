import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.RECEIPTIT_BROWSER_MODULE||'playwright');
const phase=process.env.QA_PHASE||'after',before=phase==='before',base=process.env.TEST_URL||'http://127.0.0.1:4196';
const out=`output/intro-animation/transition/${phase}`;await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const context=await browser.newContext({viewport:{width:393,height:873},isMobile:true,hasTouch:true});
 await context.route(/^https:\/\/(?:qqfntftbughorckugceu\.supabase\.co|receiptit-onboarding\.invalid)\//,async route=>{
  const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON();
  const value=path.endsWith('/verify-access-code')?(body?.accessCode?{valid:true,deviceAuthorization:'isolated-intro-grant',signupAuthorization:'isolated-signup-grant'}:{valid:false}):path.endsWith('/user')?null:[];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 });
 let release;const blocked=new Promise(r=>release=r);
 await context.route('**/intro/revision-06/receiptit-story.js*',async route=>{await blocked;await route.continue();});
 const page=await context.newPage();await page.goto(base+'/signup');await page.getByPlaceholder('Enter access code').fill('ISOLATED-UI-TEST');await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('region',{name:'How receiptIt works',exact:true}).waitFor();
 if(before)await page.waitForFunction(()=>document.querySelector('img[src*="reduced-motion"]')?.naturalWidth>0);
 const flashed=await page.getByRole('img',{name:/How receiptIt works/}).isVisible();
 assert.equal(flashed,before,'Static explanatory copy must not flash while loading');
 await page.screenshot({path:`${out}/loading.png`});release();
 await page.waitForFunction(()=>document.querySelector('receiptit-story')?.currentTime>0);
 const story=page.locator('receiptit-story'),offset=before?0:.5,positions=[];
 for(const time of [31.3,31.7,31.7575,32.0,35.61]){
  await story.evaluate((e,t)=>e.seek(t),time+offset);await page.waitForTimeout(60);
  positions.push({time:time+offset,y:(await story.locator('.wordmark').boundingBox()).y});
 }
 const jump=Math.max(...positions.map(p=>p.y))-Math.min(...positions.map(p=>p.y));
 if(before)assert.ok(jump>20,'Reproduce ending layout shift');else assert.ok(jump<.5,'Ending must stay in place');
 if(!before){for(const time of [17.36,17.6,17.85]){await story.evaluate((e,t)=>e.seek(t),time);assert.equal(await story.locator('[data-anim="separate"]').getAttribute('opacity'),'1');assert.equal(await story.locator('[data-anim="separate"]').getAttribute('transform'),'translate(0 0)');}}
 await story.evaluate(e=>e.seek(e.duration));await page.screenshot({path:`${out}/ending.png`});
 await page.getByRole('button',{name:'Replay animation'}).click();assert.ok(await story.evaluate(e=>!e.paused&&e.currentTime<1));
 await story.evaluate(e=>e.seek(e.duration));await page.getByRole('button',{name:"Let's begin"}).click();await page.getByRole('button',{name:'Create account',exact:true}).waitFor();
 await writeFile(`${out}/results.json`,JSON.stringify({phase,flashed,jump,positions,accessCodeToIntro:'PASS',replayAndBegin:'PASS'},null,2));console.log(JSON.stringify({phase,flashed,jump,result:'PASS'}));
}finally{await browser.close();}
