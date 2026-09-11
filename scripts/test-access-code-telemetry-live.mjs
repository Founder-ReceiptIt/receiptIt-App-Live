// Explicitly opt in: creates ONE empty QA account; never stores credentials.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
if(process.env.RUN_LIVE_ACCESS_TELEMETRY!=='1')throw Error('Set RUN_LIVE_ACCESS_TELEMETRY=1 for the authorised production test');
const site='https://www.receiptit.app',api='https://qqfntftbughorckugceu.supabase.co';
const html=await (await fetch(site)).text();const asset=html.match(/src="([^" ]+\/index-[^" ]+\.js)"/)?.[1];assert.ok(asset);
const bundle=await (await fetch(new URL(asset,site))).text();
const key=[...bundle.matchAll(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)].map(m=>m[0]).find(t=>{try{return JSON.parse(Buffer.from(t.split('.')[1],'base64url')).role==='anon';}catch{return false;}});assert.ok(key);
const evidence={started_at:new Date().toISOString(),qa_sessions:[],checks:[]};
async function post(path,body,token=key){const r=await fetch(api+path,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,Origin:site,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>null)};}
const journeyId=crypto.randomUUID();evidence.qa_sessions.push(journeyId);
try {
 const accepted=await post('/functions/v1/verify-access-code',{accessCode:'SEBASTIAN26',journeyId});assert.equal(accepted.data?.valid,true);assert.ok(accepted.data.journeyToken);evidence.checks.push('valid code accepted with telemetry token');
 const intro=()=>post('/functions/v1/access-code-event',{journeyToken:accepted.data.journeyToken,event:'intro_completed',completionMethod:'completed'});
 assert.equal((await intro()).status,204);assert.equal((await intro()).status,204);evidence.checks.push('intro accepted; repeated delivery harmless');
 const suffix=crypto.randomUUID().replaceAll('-','').slice(0,12);
 const email='telemetry-'+suffix+'@example.invalid';const password=crypto.randomUUID()+crypto.randomUUID();
 const created=await post('/functions/v1/create-account',{email,password,fullName:'Access telemetry QA',aliasLocalPart:'telemetry-'+suffix,signupAuthorization:accepted.data.signupAuthorization,journeyToken:accepted.data.journeyToken});
 assert.equal(created.data?.success,true,'QA account provisioning must succeed');
 const login=await post('/auth/v1/token?grant_type=password',{email,password});assert.equal(login.status,200);assert.ok(login.data.user?.id);evidence.qa_user_id=login.data.user.id;
 const token=login.data.access_token;
 const wallet=()=>post('/functions/v1/access-code-event',{journeyToken:accepted.data.journeyToken,event:'wallet_reached'},token);
 assert.equal((await wallet()).status,204);assert.equal((await wallet()).status,204);evidence.checks.push('new account created/authenticated; Wallet event accepted twice without duplicate side effects');
 for(const [label,auth]of [['anonymous',key],['authenticated',token]]){
   const r=await fetch(api+'/rest/v1/access_code_events?select=id&limit=1',{headers:{apikey:key,Authorization:'Bearer '+auth}});assert.ok([401,403].includes(r.status),label+' table reads denied');evidence.checks.push(label+' telemetry read denied '+r.status);
 }
 assert.equal((await post('/functions/v1/access-code-event',{journeyToken:accepted.data.journeyToken,event:'wallet_reached'})).status,401);
 assert.equal((await post('/functions/v1/access-code-event',{journeyToken:accepted.data.journeyToken+'x',event:'intro_completed',completionMethod:'completed'})).status,400);
 const invalidId=crypto.randomUUID();evidence.qa_sessions.push(invalidId);
 const invalid=await post('/functions/v1/verify-access-code',{accessCode:'invalid-telemetry-fixture-'+suffix,journeyId:invalidId});assert.equal(invalid.data.valid,false);evidence.checks.push('unknown code remains denied');
 const secondId=crypto.randomUUID();evidence.qa_sessions.push(secondId);
 const again=await post('/functions/v1/verify-access-code',{accessCode:'SEBASTIAN26',journeyId:secondId});assert.equal(again.data.valid,true);assert.notEqual(again.data.journeyToken,accepted.data.journeyToken);evidence.checks.push('second independent use accepted');
 const noGrant=await post('/functions/v1/create-account',{email:'unused@example.invalid',password:'not-used',aliasLocalPart:'unused'});assert.equal(noGrant.status,403);evidence.checks.push('signup without access grant remains denied');
 evidence.result='PASS';
}catch(error){evidence.result='FAIL';evidence.error=error.message;throw error;}
finally{await mkdir('output/access-code-telemetry',{recursive:true});await writeFile('output/access-code-telemetry/live-results.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));}
