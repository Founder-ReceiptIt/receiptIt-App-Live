// Opt-in production deletion test. Only the explicitly disposable matrix owner.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
if(process.env.RUN_LIVE_DUPLICATE_TESTS!=='yes') throw new Error('Live opt-in required');
const directory='output/duplicate-delete/mtvccgcl';
const matrix=JSON.parse(await readFile(`${directory}/evidence.json`,'utf8'));
assert.equal(matrix.complete,true);
const account=matrix.accounts[0];assert.equal(account.disposable,true);
const url='https://qqfntftbughorckugceu.supabase.co';
const keys=JSON.parse(execFileSync('/opt/homebrew/bin/supabase',['projects','api-keys','--project-ref','qqfntftbughorckugceu','--output','json'],{encoding:'utf8',stdio:['pipe','pipe','pipe']}));
const anon=keys.find(k=>k.name==='anon').api_key;
const admin=createClient(url,keys.find(k=>k.name==='service_role').api_key,{auth:{persistSession:false}});
const client=createClient(url,anon,{auth:{persistSession:false}});
const link=await admin.auth.admin.generateLink({type:'magiclink',email:account.email});assert.ifError(link.error);
const auth=await client.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'});assert.ifError(auth.error);
const resume=process.env.RESUME_RECOVERY==='yes';
const report=resume?JSON.parse(await readFile(`${directory}/deletion-recovery.json`,'utf8')):{checks:[],receipts:[],startedAt:new Date().toISOString()};
function check(label,value){assert.ok(value,label);report.checks.push({label,result:'PASS'});console.log('PASS',label);}
async function objectExists(bucket,path){return !(await client.storage.from(bucket).createSignedUrl(path,60)).error;}
const png=await readFile('output/receipts/northbridge-tech-warranty-return-receipt.png');
const pdf=await readFile('output/pdf/harbour-market-valid-receipt.pdf');
async function fixture(label){
 const id=randomUUID(),path=`${account.id}/delete-recovery-${id}.png`;
 assert.ifError((await client.storage.from('receipts').upload(path,png,{contentType:'image/png'})).error);
 // Seed an explicitly controlled deletion fixture, not an extraction assertion.
 assert.ifError((await admin.from('receipts').insert({id,user_id:account.id,merchant:label,amount:129.99,currency:'GBP',category:'Tech',status:'parsed',source:'image',document_type:'receipt',storage_path:path,image_url:path})).error);
 report.receipts.push({id,path,label});return {id,path};
}
const {chromium}=await import(process.env.RECEIPTIT_BROWSER_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 let queued,extra,pack;
 if(!resume){
 const ui=await fixture('Controlled deletion verification');
 const context=await browser.newContext({viewport:{width:393,height:873},isMobile:true,hasTouch:true});
 await context.addInitScript(session=>{localStorage.setItem('sb-qqfntftbughorckugceu-auth-token',JSON.stringify(session));localStorage.setItem('receiptit_authorised_intro_v2_complete','true');},auth.data.session);
 const page=await context.newPage();page.on('dialog',dialog=>dialog.accept());
 await page.goto('https://www.receiptit.app/?qa=1#wallet',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/Controlled deletion verification/}).click({timeout:30000});
 await page.getByRole('button',{name:'Receipt actions',exact:true}).click();
 const deleted=page.waitForResponse(r=>r.url().endsWith('/functions/v1/delete-receipt')&&r.request().method()==='POST');
 await page.getByRole('menuitem',{name:'Delete receipt',exact:true}).click();
 const response=await deleted;check('Live Receipt Details deletion succeeds',response.ok()&&(await response.json()).success);
 await page.getByRole('button',{name:'Close receipt',exact:true}).waitFor({state:'hidden'});
 check('Deleted purchase removed from Wallet',await page.getByRole('button',{name:/Controlled deletion verification/}).count()===0);
 check('UI deletion removes original',!await objectExists('receipts',ui.path));
 await page.screenshot({path:`${directory}/delete-complete-Pixel.png`});
 queued=await fixture('Controlled scheduled deletion recovery');
 extra=`${account.id}/delete-recovery-${queued.id}-clearer.png`;pack=`${account.id}/delete-recovery-${queued.id}.pdf`;
 assert.ifError((await client.storage.from('receipts').upload(extra,png,{contentType:'image/png'})).error);
 assert.ifError((await admin.storage.from('proof-packs').upload(pack,pdf,{contentType:'application/pdf'})).error);
 for(const [table,data] of [
  ['receipt_evidence_versions',{receipt_id:queued.id,user_id:account.id,storage_path:extra,evidence_role:'clearer_photo'}],
  ['proof_packs',{receipt_id:queued.id,user_id:account.id,storage_path:pack}],
  ['receipt_items',{receipt_id:queued.id,line_index:1,description:'Controlled item',line_total:129.99}],
  ['receipt_payments',{receipt_id:queued.id,method:'card',amount:129.99,currency:'GBP'}],
 ])assert.ifError((await admin.from(table).insert(data)).error);
 // Direct owner DELETE deliberately leaves cleanup to the server schedule.
 assert.ifError((await client.from('receipts').delete().eq('id',queued.id)).error);
 for(const table of ['receipt_items','receipt_payments','receipt_evidence_versions','proof_packs']){
  const result=await admin.from(table).select('id').eq('receipt_id',queued.id);assert.ifError(result.error);check(`${table} cascaded safely`,result.data.length===0);
 }
 const jobs=await admin.from('receipt_storage_cleanup').select('id').eq('receipt_id',queued.id);assert.ifError(jobs.error);check('All three evidence paths durably queued',jobs.data.length===3);
 check('Original remains until cleanup executes',await objectExists('receipts',queued.path));
 check('Cleanup queue not readable by owner',Boolean((await client.from('receipt_storage_cleanup').select('id')).error));
 const unauthorised=await fetch(`${url}/functions/v1/delete-receipt`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receiptId:queued.id})});check('Anonymous deletion denied',unauthorised.status===401);
 }else{
   queued=report.receipts.find(r=>r.label==='Controlled scheduled deletion recovery');assert.ok(queued);
   extra=`${account.id}/delete-recovery-${queued.id}-clearer.png`;pack=`${account.id}/delete-recovery-${queued.id}.pdf`;
 }
 // Invoke the installed scheduled function, exactly the pg_cron worker path,
 // without retrieving or exposing its Vault credential.
 const invokeWorker=()=>execFileSync('/opt/homebrew/bin/supabase',['db','query','--linked','do $$ begin perform public.request_receipt_storage_cleanup(); end $$; select true as invoked'],{stdio:['pipe','pipe','pipe'],timeout:30000});
 invokeWorker();
 const until=Date.now()+60000;let pending;
 do{pending=await admin.from('receipt_storage_cleanup').select('id').eq('receipt_id',queued.id);assert.ifError(pending.error);if(!pending.data.length)break;await new Promise(r=>setTimeout(r,1500));}while(Date.now()<until);
 check('Scheduled worker drains durable cleanup without browser',pending.data.length===0);
 check('Original removed by worker',!await objectExists('receipts',queued.path));
 check('Clearer evidence removed by worker',!await objectExists('receipts',extra));
 check('Proof Pack removed by worker',!await objectExists('proof-packs',pack));
 invokeWorker();
 check('Worker replay has no duplicate side effects',(await admin.from('receipt_storage_cleanup').select('id').eq('user_id',account.id)).data.length===0);
 if(process.env.CLEANUP_DISPOSABLE_ACCOUNTS==='yes'){
  for(const testAccount of matrix.accounts){
   assert.equal(testAccount.disposable,true);assert.match(testAccount.email,/^receiptit-duplicate-.*@example\.invalid$/);
   const remaining=await admin.from('receipts').select('id').eq('user_id',testAccount.id);assert.ifError(remaining.error);assert.equal(remaining.data.length,0);
   for(const bucket of ['receipts','proof-packs']){
    const stored=await admin.storage.from(bucket).list(testAccount.id);assert.ifError(stored.error);assert.equal(stored.data.length,0);
   }
   assert.ifError((await admin.auth.admin.deleteUser(testAccount.id)).error);
   check(`Empty disposable QA account removed ${testAccount.id}`,true);
  }
 }
 report.complete=true;delete report.failure;
}catch(error){report.complete=false;report.failure=error.message;process.exitCode=1;console.error(error.message);}
finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile(`${directory}/deletion-recovery.json`,JSON.stringify(report,null,2));}
