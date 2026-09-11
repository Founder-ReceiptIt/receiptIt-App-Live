import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.RECEIPTIT_BROWSER_MODULE||'playwright');
const base=process.env.TEST_URL||'https://www.receiptit.app',out=`output/entry-layout/${process.env.QA_PHASE||'before'}`;
await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,channel:'chrome'});const results=[];
try{
 for(const [name,width,height,path] of [['desktop',1280,800,'/'],['tablet',800,1280,'/'],['phone',393,873,'/'],['direct-signin',800,1280,'/signin'],['direct-signup',393,873,'/signup']]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<1280,hasTouch:width<1280});
  await context.addInitScript(()=>{window.__entryFrames=[];const tick=()=>{const buttons=[...document.querySelectorAll('button')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');const screen=buttons.some(el=>/^Sign in$/i.test(el.textContent.trim()))?'SIGN_IN':document.querySelector('input[placeholder="Enter access code"]')?'ACCESS':'LOADING';if(window.__entryFrames.at(-1)?.screen!==screen)window.__entryFrames.push({screen,time:performance.now()});requestAnimationFrame(tick);};requestAnimationFrame(tick);});
  const page=await context.newPage();const scripts=[];page.on('response',r=>{if(/\/assets\/index-.*\.js$/.test(r.url()))scripts.push(new URL(r.url()).pathname);});
  const response=await page.goto(base+path),cache=response.headers()['cache-control'];if(process.env.VERIFY_ENTRY_CACHE)assert.match(cache||'',/no-store/,'Entry HTML must not be stored');await page.getByRole('heading',{name:'Early access',exact:true}).waitFor();await page.waitForTimeout(600);
  const first=await page.evaluate(()=>window.__entryFrames);assert.ok(!first.some(e=>e.screen==='SIGN_IN'),name+' must not show Sign in before access verification');
  assert.equal(await page.evaluate(()=>localStorage.getItem('receiptit_beta_device_grant_v1')),null);
  await page.reload();await page.getByRole('heading',{name:'Early access',exact:true}).waitFor();await page.waitForTimeout(300);const reload=await page.evaluate(()=>window.__entryFrames);assert.ok(!reload.some(e=>e.screen==='SIGN_IN'));
  await page.screenshot({path:`${out}/entry-${name}.png`});results.push({name,first,reload,scripts,cache,result:'PASS'});console.log('PASS fresh entry',name);await context.close();
 }
}finally{await browser.close();await writeFile(`${out}/entry-results.json`,JSON.stringify(results,null,2));}
