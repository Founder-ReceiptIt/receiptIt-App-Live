// Exercise actual browser media/canvas APIs with Chrome's fake camera, never a user's camera.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.RECEIPTIT_BROWSER_MODULE || 'playwright');
const base = process.env.TEST_URL || 'http://127.0.0.1:5173';
const out = process.env.QA_OUTPUT_DIR || 'output/direct-camera/local';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'camera-qa@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const expiry = Math.floor(Date.now() / 1000) + 3600;
const jwt = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expiry })).toString('base64url') + '.controlled-browser-fixture';

for (const [name,width,height,mobile] of [['Small',320,568,true],['Android',360,640,true],['Pixel',393,873,true],['iPhone',390,844,true],['Samsung',412,915,true],['Desktop',1280,800,false]]) {
  if (process.env.QA_ONLY && !process.env.QA_ONLY.split(',').includes(name)) continue;
  const context = await browser.newContext({ viewport: { width,height }, isMobile: mobile, hasTouch: mobile });
  const writes = [];
  await context.route('https://qqfntftbughorckugceu.supabase.co/**', async route => {
    const u = new URL(route.request().url()); let value = [];
    if (u.pathname.includes('/rest/v1/receipts') && route.request().method() !== 'GET') writes.push(u.pathname);
    if (u.pathname.includes('/storage/') && route.request().method() !== 'GET') writes.push(u.pathname);
    if (u.pathname.endsWith('/user')) value = user;
    else if (u.pathname.includes('/auth/v1/')) value = {};
    else if (u.pathname.endsWith('/verify-access-code')) value = { valid:true,deviceAuthorization:'controlled-signed-device-fixture' };
    else if (u.pathname.endsWith('/profiles')) value = { id:user.id,username:'qa',full_name:'QA',preferred_currency:'GBP',monthly_budget_amount:2500,monthly_budget_currency:'GBP',currency_setup_completed:true,legacy_budget_migration_completed:true };
    else if (u.pathname.endsWith('/ensure_friendly_email_alias')) value = [{email_address:'qa@in.receiptit.app'}];
    await route.fulfill({ status:200,contentType:'application/json',body:JSON.stringify(value) });
  });
  await context.addInitScript(({user,jwt,expiry}) => {
    localStorage.setItem('sb-qqfntftbughorckugceu-auth-token',JSON.stringify({access_token:jwt,refresh_token:'controlled-refresh',expires_at:expiry,expires_in:3600,token_type:'bearer',user}));
    localStorage.setItem('receiptit_beta_device_grant_v1','controlled-signed-device-fixture');
    localStorage.setItem('receiptit_authorised_intro_v2_complete','true');
    window.cameraQa = { requests:[],streams:[],mode:'normal' };
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.cameraQa.requests.push(constraints);
      if (window.cameraQa.mode === 'denied') throw new DOMException('Controlled denial','NotAllowedError');
      if (window.cameraQa.mode === 'missing') throw new DOMException('Controlled missing camera','NotFoundError');
      const stream = await get(constraints); window.cameraQa.streams.push(stream);
      if (window.cameraQa.mode === 'delayed') await new Promise(resolve => { window.cameraQa.release = resolve; });
      return stream;
    };
  }, {user,jwt,expiry});
  const page = await context.newPage();
  let fileChoosers = 0; page.on('filechooser', () => fileChoosers++);
  await page.goto(base + '/#wallet');
  await page.getByRole('button',{ name:mobile?'Quick scan':'Scan receipt',exact:true }).click().catch(async error => { console.log('Camera QA startup state:',await page.locator('body').innerText()); throw error; });
  const dialog = page.getByRole('dialog',{name:'Receipt camera',exact:true});
  const take = page.getByRole('button',{name:'Take photo',exact:true});
  const waitReady = async () => { await dialog.waitFor(); await page.waitForFunction(() => { const v=document.querySelector('video'); return v?.videoWidth>0 && !Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Take photo')?.disabled; }); };
  const stopped = () => page.waitForFunction(() => window.cameraQa.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  await waitReady();
  await page.getByRole('heading',{name:'Receipts',exact:true}).waitFor({state:'hidden'});
  assert.equal(fileChoosers,0,'Wallet goes straight to camera, never a chooser');
  assert.deepEqual(await page.evaluate(()=>window.cameraQa.requests[0].video.facingMode),{ideal:'environment'});
  assert.equal(await page.evaluate(()=>window.cameraQa.requests[0].audio),false);
  const geometry = await dialog.evaluate(el => ({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,scroll:el.scrollHeight}));
  assert.ok(geometry.width<=width && geometry.height<=height+1 && geometry.scroll<=height+1,'Camera fits viewport');
  await page.screenshot({path:`${out}/camera-${name}.png`});
  await page.getByRole('button',{name:'Close camera',exact:true}).click(); await stopped();
  await page.getByRole('button',{name:'Scan receipt',exact:true}).click(); await waitReady();
  assert.equal(fileChoosers,0,'Scan button goes straight to camera');
  await take.click(); await page.getByRole('heading',{name:'1 image selected',exact:true}).waitFor(); await stopped();
  assert.equal(await page.evaluate(()=>localStorage.getItem('isScanning')),null);
  for (const count of [2,3]) {
    await page.getByRole('button',{name:'Add another page',exact:true}).click(); await waitReady();
    await take.click(); await page.getByRole('heading',{name:`${count} images selected`,exact:true}).waitFor(); await stopped();
  }
  assert.deepEqual(await page.getByLabel('3 images in selection order').locator('span').allTextContents(),['1','2','3']);
  await page.getByRole('button',{name:'Add another page',exact:true}).click(); await waitReady();
  await page.keyboard.press('Escape'); await stopped();
  await page.getByRole('heading',{name:'3 images selected',exact:true}).waitFor();
  assert.equal(fileChoosers,0,'Camera/multi-image never invokes file picker');
  await page.getByRole('button',{name:'Choose a different image',exact:true}).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:'Upload from device',exact:true}).click()]);
  assert.equal(chooser.isMultiple(),true);
  assert.equal(await chooser.element().getAttribute('capture'),null);
  assert.ok((await chooser.element().getAttribute('accept')).includes('application/pdf'));
  await chooser.setFiles([]);
  // Start a fresh Scan surface; navigation alone must not open the camera.
  await page.getByRole('button',{name:'Wallet',exact:true}).click();
  await page.getByRole('button',{name:'Scan',exact:true}).click();
  await page.getByRole('heading',{name:'Receipts',exact:true}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Scan receipt',exact:true}).waitFor();
  assert.equal(await dialog.count(),0);
  await page.evaluate(()=>{window.cameraQa.mode='denied';});
  await page.getByRole('button',{name:'Scan receipt',exact:true}).click();
  await page.getByText('Allow camera access in your browser or device settings, then try again.',{exact:true}).waitFor();
  await page.evaluate(()=>{window.cameraQa.mode='missing';});
  await page.getByRole('button',{name:'Try camera again',exact:true}).click();
  await page.getByText('No camera was found on this device. Close this view and use Upload from device.',{exact:true}).waitFor();
  await page.evaluate(()=>{window.cameraQa.mode='normal';});
  await page.getByRole('button',{name:'Try camera again',exact:true}).click(); await waitReady();
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  await stopped();
  await page.getByText('Camera paused while you were away. Open it again when you’re ready.',{exact:true}).waitFor();
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});});
  await page.getByRole('button',{name:'Try camera again',exact:true}).click(); await waitReady();
  await page.getByRole('button',{name:'Close camera',exact:true}).click(); await stopped();
  // A permission request that resolves after cancellation must not leave a camera running.
  await page.evaluate(()=>{window.cameraQa.mode='delayed';});
  await page.getByRole('button',{name:'Scan receipt',exact:true}).click();
  await page.waitForFunction(()=>Boolean(window.cameraQa.release));
  await page.getByRole('button',{name:'Close camera',exact:true}).click();
  await page.evaluate(()=>window.cameraQa.release()); await stopped();
  assert.deepEqual(writes,[],'Opening/cancelling/reviewing cannot create a receipt or Storage object');
  console.log('PASS',name,'both direct camera actions; rear-camera preference; no audio; full-frame JPEG; 1/2/3-image review; cancellation; upload separation; permission/no-camera errors; background cleanup; late permission cleanup; no writes');
  await context.close();
}
await browser.close();
