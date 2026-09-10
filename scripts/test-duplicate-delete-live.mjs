// Explicit operator test: production, disposable accounts and controlled files only.
// Credentials remain in memory. Never run as a general CI test.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
const {chromium}=await import(process.env.RECEIPTIT_BROWSER_MODULE||'playwright');
if(process.env.RUN_LIVE_DUPLICATE_TESTS!=='yes') throw new Error('Explicit live-test opt-in required');
const url='https://qqfntftbughorckugceu.supabase.co';
const keys=JSON.parse(execFileSync('/opt/homebrew/bin/supabase',['projects','api-keys','--project-ref','qqfntftbughorckugceu','--output','json'],{encoding:'utf8',stdio:['pipe','pipe','pipe']}));
const service=keys.find(k=>k.name==='service_role').api_key,anon=keys.find(k=>k.name==='anon').api_key;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const stamp=Date.now().toString(36),out=`output/duplicate-delete/${stamp}`;
await mkdir(out,{recursive:true});
const evidence={startedAt:new Date().toISOString(),accounts:[],receipts:[],checks:[],screenshots:[]};
async function save(){await writeFile(`${out}/evidence.json`,JSON.stringify(evidence,null,2));}
function check(label,value){assert.ok(value,label);evidence.checks.push({label,result:'PASS',at:new Date().toISOString()});console.log('PASS',label);}
async function ownedAccount(letter){
 const email=`receiptit-duplicate-${stamp}-${letter}@example.invalid`,password=randomBytes(30).toString('base64url');
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Disposable duplicate verification'}});
 assert.ifError(error);const id=data.user.id;evidence.accounts.push({id,email,disposable:true});await save();
 assert.ifError((await admin.from('profiles').upsert({id,email,full_name:'Disposable duplicate verification',username:`dupqa${stamp}${letter}`,preferred_currency:'GBP',currency_setup_completed:true,legacy_budget_migration_completed:true})).error);
 assert.ifError((await admin.from('production_test_accounts').insert({user_id:id,label:`Disposable duplicate/delete QA ${stamp}`,active:true})).error);
 const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const signed=await client.auth.signInWithPassword({email,password});assert.ifError(signed.error);
 const alias=await client.rpc('ensure_friendly_email_alias');assert.ifError(alias.error);
 return {id,client,session:signed.data.session};
}
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const a=await ownedAccount('a'),b=await ownedAccount('b');
 const context=await browser.newContext({viewport:{width:393,height:873},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await context.addInitScript(session=>{
   localStorage.setItem('sb-qqfntftbughorckugceu-auth-token',JSON.stringify(session));
   localStorage.setItem('receiptit_authorised_intro_v2_complete','true');
 },a.session);
 const page=await context.newPage();page.on('dialog',d=>d.accept());
 await page.goto(`${process.env.TEST_URL||'https://www.receiptit.app'}/?qa=1#wallet`,{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Receipts',exact:true}).waitFor({timeout:30000});
 const original=await readFile('output/receipts/northbridge-tech-warranty-return-receipt.png');
 // A second controlled photograph representation: slight rotation, different
 // JPEG pixels/bytes; same printed purchase. Not an exact-byte override.
 const variant=Buffer.from(await page.evaluate(async data=>{
   const image=new Image();image.src=`data:image/png;base64,${data}`;await image.decode();
   const c=document.createElement('canvas');c.width=image.width+40;c.height=image.height+40;
   const x=c.getContext('2d');x.fillStyle='#aaa';x.fillRect(0,0,c.width,c.height);
   x.translate(c.width/2,c.height/2);x.rotate(0.008);x.drawImage(image,-image.width/2,-image.height/2);
   return Array.from(new Uint8Array(await(await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',0.91))).arrayBuffer()));
 },original.toString('base64')));
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const rows=async owner=>{const r=await owner.client.from('receipts').select('id,status,merchant,amount,file_hash,storage_path,is_duplicate,document_type').eq('user_id',owner.id);assert.ifError(r.error);return r.data;};
 const exists=async(owner,path)=>!(await owner.client.storage.from('receipts').download(path)).error;
 async function uploadViaScan(bytes,name){
   await page.getByRole('button',{name:'Scan',exact:true}).click();
   await page.getByText('Approved production QA account',{exact:true}).waitFor();
   await page.locator('input[type=file]').setInputFiles({name,mimeType:name.endsWith('.png')?'image/png':'image/jpeg',buffer:bytes});
 }
 async function completed(owner,fileHash){
   let receipt;
   const until=Date.now()+210000;
   do{
     receipt=(await rows(owner)).find(r=>r.file_hash===fileHash);
     if(receipt&&receipt.status!=='processing')break;
     await new Promise(r=>setTimeout(r,2500));
   }while(Date.now()<until);
   assert.equal(receipt?.status,'parsed',`Live processor result ${JSON.stringify(receipt)}`);
   evidence.receipts.push({...receipt,userId:owner.id,observedAt:new Date().toISOString()});await save();return receipt;
 }
 async function reloadWallet(){await page.goto(`${process.env.TEST_URL||'https://www.receiptit.app'}/?qa=1#wallet`,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Receipts',exact:true}).waitFor({timeout:30000});}
 async function deletion(owner,receipt){
   const r=await owner.client.functions.invoke('delete-receipt',{body:{receiptId:receipt.id}});assert.ifError(r.error);assert.equal(r.data?.success,true);
   check(`DB removed ${receipt.id}`,!(await rows(owner)).some(x=>x.id===receipt.id));
   check(`Storage removed ${receipt.id}`,!await exists(owner,receipt.storage_path));
 }
 await uploadViaScan(original,'duplicate-contract-original.png');const first=await completed(a,hash(original));
 check('Normal image reaches live processor and parsed',first.merchant.toLowerCase().includes('northbridge'));
 await uploadViaScan(original,'duplicate-contract-original.png');
 const exact=page.getByLabel('Exact duplicate receipt');await exact.waitFor();
 check('Exact duplicate has no Save anyway',(await exact.getByRole('button',{name:'Save anyway',exact:true}).count())===0);
 check('Exact duplicate one receipt',(await rows(a)).length===1);
 const stored=await admin.storage.from('receipts').list(a.id);check('Exact duplicate no second original',stored.data.length===1);
 await page.screenshot({path:`${out}/exact-Pixel.png`});
 await exact.getByRole('button',{name:'View existing',exact:true}).click();
 await page.getByRole('button',{name:'Close receipt',exact:true}).waitFor();check('Exact View existing opens Receipt Details',true);
 await page.getByRole('button',{name:'Close receipt',exact:true}).click();
 await uploadViaScan(variant,'duplicate-contract-second-photo.jpg');const second=await completed(a,hash(variant));
 await reloadWallet();const possible=page.getByLabel('Possible duplicate receipt');await possible.waitFor({timeout:15000});
 await page.screenshot({path:`${out}/possible-Pixel.png`});
 await possible.getByRole('button',{name:'Save anyway',exact:true}).click();await possible.waitFor({state:'hidden'});
 await reloadWallet();check('Possible choice persists after reload',(await page.getByLabel('Possible duplicate receipt').count())===0);
 check('Save anyway leaves two independent parsed purchases',(await rows(a)).filter(r=>r.status==='parsed').length===2&&first.id!==second.id&&first.storage_path!==second.storage_path);
 await deletion(a,second);check('Deleting second leaves first',await exists(a,first.storage_path)&&(await rows(a)).some(r=>r.id===first.id));
 await uploadViaScan(variant,'duplicate-contract-second-photo.jpg');const replacement=await completed(a,hash(variant));
 const candidate=await a.client.from('receipt_possible_duplicates').select('*').eq('receipt_id',replacement.id);assert.ifError(candidate.error);check('Possible link before original deletion',candidate.data.length===1);
 await deletion(a,first);check('Deleting original leaves independent receipt',await exists(a,replacement.storage_path)&&(await rows(a)).some(r=>r.id===replacement.id));
 check('No dangling possible link',(await a.client.from('receipt_possible_duplicates').select('*').eq('receipt_id',replacement.id)).data.length===0);
 await uploadViaScan(original,'duplicate-contract-original.png');const reuploaded=await completed(a,hash(original));check('Reupload after deletion creates new owner receipt',reuploaded.id!==first.id);
 const foreignLookup=await b.client.rpc('find_existing_receipt_by_file_hash',{p_file_hash:hash(original)});assert.ifError(foreignLookup.error);check('Cross-owner hash lookup reveals nothing',foreignLookup.data.length===0);
 check('Cross-owner Storage denied',!await exists(b,reuploaded.storage_path));
 const forbidden=await b.client.functions.invoke('delete-receipt',{body:{receiptId:reuploaded.id}});assert.ifError(forbidden.error);
 check('Cross-owner delete changes nothing',(await rows(a)).some(r=>r.id===reuploaded.id)&&await exists(a,reuploaded.storage_path));
 const path=`${b.id}/duplicate-contract-cross-owner-${stamp}.png`;
 assert.ifError((await b.client.storage.from('receipts').upload(path,original,{contentType:'image/png',upsert:false})).error);
 assert.ifError((await b.client.from('receipts').insert({user_id:b.id,merchant:'Analyzing...',amount:null,currency:'GBP',category:'Other',status:'processing',source:'image',file_hash:hash(original),storage_path:path,image_url:path,processing_attempt_started_at:new Date().toISOString()})).error);
 const ownOther=await completed(b,hash(original));check('Same bytes different owner process independently',ownOther.id!==reuploaded.id);
 const ownLookup=await b.client.rpc('find_existing_receipt_by_file_hash',{p_file_hash:hash(original)});check('Other owner resolves only own receipt',ownLookup.data[0].id===ownOther.id);
 const signed=await a.client.storage.from('receipts').createSignedUrl(reuploaded.storage_path,60);assert.ifError(signed.error);check('Signed original accessible',(await fetch(signed.data.signedUrl)).ok);
 // Remove only this run's controlled receipts via the same deletion endpoint.
 for(const receipt of await rows(a))await deletion(a,receipt);
 for(const receipt of await rows(b))await deletion(b,receipt);
 check('No cleanup jobs remain for test owners',(await admin.from('receipt_storage_cleanup').select('id').in('user_id',[a.id,b.id])).data.length===0);
 evidence.finishedAt=new Date().toISOString();evidence.complete=true;await save();console.log('LIVE MATRIX PASS',out);
}catch(error){evidence.complete=false;evidence.failure=error.message;await save();console.error('LIVE MATRIX FAILED',error.message,'Evidence',out);process.exitCode=1;}
finally{await browser.close();}
