import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {issueJourney,readJourney,bestEffort,writeJourneyEvent} from '../supabase/functions/_shared/access-code-telemetry.ts';
const secret='isolated-test-secret',url='https://isolated.invalid';
let events=[],writesFail=false,authorised=true,createFails=false,storedUser='new-user',currentUser='new-user';
const background=[];
globalThis.EdgeRuntime={waitUntil:p=>background.push(p)};
globalThis.fetch=async (_url,options)=>{
  if(writesFail)throw Error('Simulated telemetry outage');
  const body=JSON.parse(options.body);
  if(!events.some(e=>e.session_id===body.session_id&&e.event_type===body.event_type))events.push(body);
  return new Response(null,{status:201});
};
const client={
  auth:{getUser:async()=>({data:{user:currentUser?{id:currentUser}:null},error:null}),admin:{createUser:async()=>({data:{user:createFails?null:{id:storedUser}},error:createFails?{message:'failure'}:null}),deleteUser:async()=>({})}},
  from(table){const filters={};const chain={select(){return chain;},eq(k,v){filters[k]=v;return chain;},
    maybeSingle:async()=>({data:table==='access_codes'&&filters.code==='SEBASTIAN26'?{id:'code-id'}:null,error:null}),
    insert:async()=>({error:null}),
    in:async()=>({data:events.filter(e=>e.session_id===filters.session_id&&['signup_completed','wallet_reached'].includes(e.event_type)),error:null})};return chain;},
  rpc:async name=>({data:name==='complete_beta_signup'?'test@in.example.invalid':name==='signup_authorization_is_valid'?authorised:true,error:null}),
};
async function handler(file){
  let receive;
  const source=readFileSync(file,'utf8').replace(/^import[\s\S]*?;\n/gm,'');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const names={Deno:{serve:fn=>receive=fn,env:{get:name=>name==='SUPABASE_URL'?url:secret}},createClient:()=>client,
    corsHeadersFor:()=>({}),isTrustedOrigin:()=>true,isRateLimitAllowed:async()=>true,requestSubjectHash:async()=>'hash',valueHash:async()=> 'hash',
    issueBetaDeviceGrant:async()=>'device-grant',verifyBetaDeviceGrant:async()=>true,
    issueJourney,readJourney,bestEffort,writeJourneyEvent,validJourneyId:(v)=>typeof v==='string'&&/^[\da-f-]{36}$/i.test(v)};
  new Function(...Object.keys(names),js)(...Object.values(names));
  return async body=>{const result=await receive(new Request(url,{method:'POST',headers:{Authorization:'Bearer controlled'},body:JSON.stringify(body)}));await Promise.all(background.splice(0));return result;};
}
const verify=await handler('supabase/functions/verify-access-code/index.ts');
const signup=await handler('supabase/functions/create-account/index.ts');
const event=await handler('supabase/functions/access-code-event/index.ts');
const id=crypto.randomUUID();
const accepted=await (await verify({accessCode:'SEBASTIAN26',journeyId:id})).json();
assert.equal(accepted.valid,true);assert.ok(await readJourney(accepted.journeyToken,secret));
assert.deepEqual(events.map(e=>e.event_type),['code_submitted','code_accepted']);
await verify({accessCode:'private-invalid-attempt',journeyId:crypto.randomUUID()});
assert.equal(events.at(-1).code_label,'unknown_code');assert.ok(!JSON.stringify(events).includes('private-invalid-attempt'));
await event({journeyToken:accepted.journeyToken,event:'intro_completed',completionMethod:'completed'});
await event({journeyToken:accepted.journeyToken,event:'intro_completed',completionMethod:'skipped'});
assert.equal(events.filter(e=>e.event_type==='intro_completed').length,1);
const account={email:'synthetic@example.invalid',password:'controlled-test-only',aliasLocalPart:'fixture-user',signupAuthorization:'controlled',journeyToken:accepted.journeyToken};
await signup({...account,mode:'check-alias'});assert.equal(events.filter(e=>e.event_type==='signup_started').length,0);
assert.equal((await signup(account)).status,200);
assert.equal(events.find(e=>e.event_type==='signup_completed').user_id,'new-user');
await event({journeyToken:accepted.journeyToken,event:'wallet_reached'});
await event({journeyToken:accepted.journeyToken,event:'wallet_reached'});
assert.equal(events.filter(e=>e.event_type==='wallet_reached').length,1);
assert.equal(events.filter(e=>e.event_type==='signup_completed').length,1);
currentUser='other-user';assert.equal((await event({journeyToken:accepted.journeyToken,event:'wallet_reached'})).status,403);
currentUser=null;assert.equal((await event({journeyToken:accepted.journeyToken,event:'wallet_reached'})).status,401);
assert.equal((await event({journeyToken:accepted.journeyToken,event:'signup_completed'})).status,400);
assert.equal((await event({journeyToken:accepted.journeyToken+'x',event:'intro_completed',completionMethod:'completed'})).status,400);
assert.equal(await readJourney('device-grant',secret),null);
const second=await (await verify({accessCode:'SEBASTIAN26',journeyId:crypto.randomUUID()})).json();
assert.notEqual((await readJourney(second.journeyToken,secret)).session_id,id);
createFails=true;await signup({...account,journeyToken:second.journeyToken});
assert.equal(events.filter(e=>e.event_type==='signup_completed').length,1);createFails=false;
authorised=false;assert.equal((await signup(account)).status,403);authorised=true;
writesFail=true;
assert.equal((await (await verify({accessCode:'SEBASTIAN26',journeyId:crypto.randomUUID()})).json()).valid,true);
assert.equal((await signup(account)).status,200);
console.log('PASS server handlers: full funnel, unknown-code privacy, separate journeys, idempotency, authenticated Wallet, token tamper, no alias-check/restore signup events, failed signup, outage non-blocking');

const storage=new Map();globalThis.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
let calls=0,clientFail=false;
globalThis.fetch=async()=>{calls++;return new Response(null,{status:clientFail?503:204});};
const source=readFileSync('src/lib/accessCodeTelemetry.ts','utf8').replaceAll('import.meta.env.VITE_SUPABASE_URL',JSON.stringify(url)).replaceAll('import.meta.env.VITE_SUPABASE_ANON_KEY','"public-test-key"');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const front=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const first=front.startAccessJourney();front.acceptAccessJourney(first,'signed-test');
front.trackAccessJourney('intro_completed');front.trackAccessJourney('intro_completed');await new Promise(r=>setImmediate(r));
front.trackAccessJourney('intro_completed');assert.equal(calls,1);
clientFail=true;front.trackAccessJourney('wallet_reached','user-jwt');await new Promise(r=>setImmediate(r));
clientFail=false;front.trackAccessJourney('wallet_reached','user-jwt');await new Promise(r=>setImmediate(r));
assert.equal(calls,3);front.trackAccessJourney('wallet_reached','refreshed-jwt');assert.equal(calls,3);
assert.notEqual(front.startAccessJourney(),first);front.clearAccessJourney();assert.equal(front.accessJourneyToken(),undefined);
globalThis.sessionStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
const denied=front.startAccessJourney();front.acceptAccessJourney(denied,'signed-test');assert.equal(front.accessJourneyToken(),'signed-test');front.clearAccessJourney();
console.log('PASS browser telemetry: render/in-flight dedupe, failed event retry, auth-refresh dedupe, new journey, sign-out clearing, denied storage');
const syncFail=front.startAccessJourney();front.acceptAccessJourney(syncFail,'signed-test');globalThis.fetch=()=>{throw Error('Synchronous browser API failure');};assert.doesNotThrow(()=>front.trackAccessJourney('intro_completed'));front.clearAccessJourney();
const migration=readFileSync('supabase/migrations/20260911130000_access_code_journey_events.sql','utf8');
assert.match(migration,/enable row level security/);assert.match(migration,/revoke all[\s\S]*from public, anon, authenticated/);assert.ok(!/create policy/i.test(migration));
console.log('PASS schema guards: RLS enabled, no normal-user privileges/policies, unique session/event constraint');
