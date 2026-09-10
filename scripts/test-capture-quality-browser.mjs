import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { qualityFixture } from './capture-quality-fixtures.mjs';
const { chromium } = await import(process.env.RECEIPTIT_BROWSER_MODULE || 'playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
const out=process.env.QA_OUTPUT_DIR||'output/capture-quality/local';
const photoData=process.env.QA_PHOTO?'data:image/png;base64,'+(await readFile(process.env.QA_PHOTO)).toString('base64'):null;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'quality-qa@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const expiry=Math.floor(Date.now()/1000)+3600;
const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:expiry})).toString('base64url')+'.controlled-browser-fixture';
const report=[];
for(const [name,width,height,mobile]of [['Small',320,568,true],['Android',360,640,true],['Pixel',393,873,true],['iPhone',390,844,true],['Samsung',412,915,true],['Desktop',1280,800,false]]){
 if(process.env.QA_ONLY&&!process.env.QA_ONLY.split(',').includes(name))continue;
 const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
 const writes=[];
 await context.route('https://qqfntftbughorckugceu.supabase.co/**',async route=>{
  const u=new URL(route.request().url());let value=[];
  if((u.pathname.includes('/rest/v1/receipts')||u.pathname.includes('/storage/'))&&route.request().method()!=='GET')writes.push(u.pathname);
  if(u.pathname.endsWith('/user'))value=user;
  else if(u.pathname.includes('/auth/v1/'))value={};
  else if(u.pathname.endsWith('/verify-access-code'))value={valid:true,deviceAuthorization:'controlled-signed-device-fixture'};
  else if(u.pathname.endsWith('/profiles'))value={id:user.id,username:'qa',full_name:'QA',preferred_currency:'GBP',monthly_budget_amount:2500,monthly_budget_currency:'GBP',currency_setup_completed:true,legacy_budget_migration_completed:true};
  else if(u.pathname.endsWith('/ensure_friendly_email_alias'))value=[{email_address:'qa@in.receiptit.app'}];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 });
 await context.addInitScript({content:`window.makeQualityFixture = ${qualityFixture.toString()};`});
 await context.addInitScript(({user,jwt,expiry,photoData})=>{
  localStorage.setItem('sb-qqfntftbughorckugceu-auth-token',JSON.stringify({access_token:jwt,refresh_token:'controlled-refresh',expires_at:expiry,expires_in:3600,token_type:'bearer',user}));
  localStorage.setItem('receiptit_beta_device_grant_v1','controlled-signed-device-fixture');
  localStorage.setItem('receiptit_authorised_intro_v2_complete','true');
  const qa=window.qualityQa={kind:'good',mode:'normal',streams:[],samples:[],times:[],readTimes:[],workers:new Set(),canvas:null};
  navigator.mediaDevices.getUserMedia=async()=>{
   const c=document.createElement('canvas');c.width=432;c.height=photoData?648:576;const ctx=c.getContext('2d');
   let photo;if(photoData){photo=new Image();photo.src=photoData;await photo.decode();}
   let track;
   const paint=()=>{
    if(photo){
     ctx.filter='none';ctx.fillStyle='#999';ctx.fillRect(0,0,c.width,c.height);
     ctx.filter=qa.kind==='dark'?'brightness(0.3)':qa.kind==='blur'?'blur(8px)':'none';
     ctx.drawImage(photo,0,qa.kind==='cropped'?-72:0,c.width,c.height);
    }else{
     const f=window.makeQualityFixture(qa.kind);
     const small=document.createElement('canvas');small.width=f.width;small.height=f.height;
     small.getContext('2d').putImageData(new ImageData(f.pixels,f.width,f.height),0,0);
     ctx.imageSmoothingEnabled=false;ctx.drawImage(small,0,0,c.width,c.height);
    }
    track?.requestFrame();
   };
   qa.paint=paint;qa.canvas=c;paint();
   const stream=c.captureStream(15);track=stream.getVideoTracks()[0];qa.streams.push(stream);paint();
   return stream;
  };
  const NativeWorker=window.Worker;
  window.Worker=class extends NativeWorker{
   constructor(...args){if(qa.mode==='no-worker')throw new Error('Controlled unavailable worker');super(...args);qa.workers.add(this);}
   postMessage(data,transfer){qa.lastPixels=Array.from(data.pixels);qa.samples.push({time:performance.now(),width:data.width,height:data.height,basicOnly:data.basicOnly});if(qa.mode==='hang')return;super.postMessage(data,transfer);}
   set onmessage(handler){super.onmessage=event=>{qa.lastResult=event.data;qa.times.push(event.data.elapsed);if(qa.mode==='slow')handler(new MessageEvent('message',{data:{...event.data,elapsed:25}}));else handler(event);};}
   terminate(){qa.workers.delete(this);super.terminate();}
  };
  const get=CanvasRenderingContext2D.prototype.getImageData;
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.width<=192)qa.readStart=performance.now();return draw.apply(this,args);};
  CanvasRenderingContext2D.prototype.getImageData=function(...args){
   if(qa.mode==='read-failure'&&this.canvas.width<=192)throw new Error('Controlled readback failure');
   const start=performance.now();const result=get.apply(this,args);
   if(this.canvas.width<=192)qa.readTimes.push(performance.now()-(qa.readStart||start));return result;
  };
 },{user,jwt,expiry,photoData});
 const page=await context.newPage();const requests=[];
 page.on('request',request=>requests.push({url:request.url(),method:request.method()}));
 await page.goto(base+'/#wallet');
 await page.getByRole('button',{name:mobile?'Quick scan':'Scan receipt',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Receipt camera',exact:true});
 const take=page.getByRole('button',{name:'Take photo',exact:true});
 await dialog.waitFor();await page.getByRole('heading',{name:'Receipts',exact:true}).waitFor({state:'hidden'});
 const waitAdvice=async message=>{await dialog.getByText(message,{exact:true}).waitFor({timeout:12000}).catch(async error=>{console.log('Quality fixture diagnostic',message,await page.evaluate(()=>({result:window.qualityQa.lastResult,sample:window.qualityQa.samples.at(-1),max:Math.max(...window.qualityQa.lastPixels.filter((_,i)=>i%4===0)),high:window.qualityQa.lastPixels.filter((v,i)=>i%4===0&&v>=245).length})));throw error;});assert.equal(await take.isEnabled(),true,`${message}: shutter stays enabled`);};
 const captureToReview=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
  const start=performance.now();const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Capture did not reach review'));},10000);
  // Compare the same capture endpoint, not first-page vs existing-review animations.
  const observer=new MutationObserver(()=>{if(!document.querySelector('[role="dialog"][aria-label="Receipt camera"]')){observer.disconnect();clearTimeout(timer);resolve(performance.now()-start);}});
  observer.observe(document.body,{subtree:true,childList:true});
  Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Take photo').click();
 }));
 await waitAdvice('Ready');
 const cases=name==='Pixel'&&!photoData?{good:'Ready',dark:'More light needed',blur:'Hold still',small:'Move closer',cropped:'Fit the whole receipt in frame',glare:'Watch for glare',white:'Ready',none:'Frame your receipt',bent:'Ready',occluded:'Ready',clutter:'Frame your receipt',long:'Scan in sections if needed'}:{good:'Ready',dark:'More light needed',blur:'Hold still',cropped:'Fit the whole receipt in frame'};
 for(const[kind,message]of Object.entries(cases)){
  await page.evaluate(kind=>{window.qualityQa.kind=kind;window.qualityQa.paint();},kind);
  await waitAdvice(message);
  assert.equal(await dialog.locator('[aria-live="polite"]').count(),1,'Only one guidance message');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  const box=await take.boundingBox();assert.ok(box.y+box.height<=height+1,'Shutter fits screen');
  if(['good','dark','blur','cropped'].includes(kind))await page.screenshot({path:`${out}/${kind}-${name}.png`});
 }
 // A poor result still captures through the established review path, at full capture resolution.
 await page.evaluate(()=>{window.qualityQa.kind='dark';window.qualityQa.paint();});await waitAdvice('More light needed');
 const shutterMs=await captureToReview();await page.getByRole('heading',{name:'1 image selected',exact:true}).waitFor();
 await page.waitForFunction(()=>window.qualityQa.workers.size===0&&window.qualityQa.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
 const metrics=await page.evaluate(()=>({samples:window.qualityQa.samples,times:window.qualityQa.times,readTimes:window.qualityQa.readTimes}));
 assert.ok(metrics.samples.every(s=>s.width<=192&&s.height<=192),'Only tiny analysis frames');
 assert.ok(metrics.samples.slice(1).every((s,i)=>s.time-metrics.samples[i].time>=300),'Not full-frame-rate analysis');
 const intervals=metrics.samples.slice(1).map((s,i)=>s.time-metrics.samples[i].time);
 const p95=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length*0.95)]||0;
 const steadyWorker=p95(metrics.times.slice(3)),steadyRead=p95(metrics.readTimes.slice(3));
 console.log('PERF',name,{coldWorkerMaxMs:Math.max(...metrics.times.slice(0,3)),steadyWorkerP95Ms:steadyWorker,coldReadMaxMs:Math.max(...metrics.readTimes.slice(0,3)),steadyDrawReadP95Ms:steadyRead});
 assert.ok(steadyWorker<12,'Browser worker p95 budget after three warm-up samples');
 assert.ok(steadyRead<8,'Main-thread readback budget after warm-up');
 const fallbackModes=name==='Pixel'?['no-worker','read-failure','hang','slow']:['no-worker'];
 let baselineMs=0;
 for(const mode of fallbackModes){
  await page.evaluate(mode=>{window.qualityQa.mode=mode;window.qualityQa.kind='good';},mode);
  await page.getByRole('button',{name:'Add another page',exact:true}).click();
  await page.waitForFunction(()=>{const video=document.querySelector('video');return video?.videoWidth>0&&Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Take photo'&&!b.disabled);});
  if(mode==='slow')await page.waitForFunction(()=>window.qualityQa.samples.some(s=>s.basicOnly&&s.width<=128),{},{timeout:15000});
  if(mode!=='no-worker')await page.waitForFunction(()=>window.qualityQa.workers.size===0,{},{timeout:15000});
  assert.equal(await dialog.locator('[aria-live="polite"]').count(),0,'Silent quality fallback');assert.equal(await take.isEnabled(),true);
  if(mode==='no-worker') { baselineMs=await captureToReview();await page.getByRole('heading',{name:'2 images selected',exact:true}).waitFor(); }
  else await page.getByRole('button',{name:'Close camera',exact:true}).click();
 }
 assert.deepEqual(writes,[],'Quality/capture review must not create server evidence');
 const remote=requests.filter(r=>r.method!=='GET'&&!r.url.includes('qqfntftbughorckugceu.supabase.co'));
 assert.deepEqual(remote,[],'No frame-analysis remote/API requests');
 assert.ok(shutterMs<baselineMs+150,`Quality must not add a shutter wait: enabled ${shutterMs}ms / baseline ${baselineMs}ms`);
 const result={name,width,height,simulatedCamera:true,workerP95Ms:steadyWorker,drawAndReadP95Ms:steadyRead,coldWorkerMaxMs:Math.max(...metrics.times.slice(0,3)),coldDrawReadMaxMs:Math.max(...metrics.readTimes.slice(0,3)),meanIntervalMs:intervals.reduce((a,b)=>a+b,0)/intervals.length,shutterToLocalPhotoHandoffMs:shutterMs,baselineShutterToLocalPhotoHandoffMs:baselineMs,cases:Object.keys(cases),fallbackModes};
 report.push(result);console.log('PASS',JSON.stringify(result));
 await context.close();
}
await writeFile(`${out}/verification.json`,JSON.stringify(report,null,2));
await browser.close();
