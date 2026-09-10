import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyseCaptureFrame, settleCaptureAdvice } from '../src/lib/captureQuality.ts';
import { qualityFixture } from './capture-quality-fixtures.mjs';

const expected={good:'ready',dark:'dark',small:'small',cropped:'cropped',blur:'moving',glare:'glare',white:'ready',none:'neutral',blank:'neutral','white-background':'neutral',clutter:'neutral',bent:'ready',occluded:'ready',long:'long'};
for(const [kind,advice]of Object.entries(expected)) {
  const frame=qualityFixture(kind),first=analyseCaptureFrame(frame),second=analyseCaptureFrame(frame,first.grey);
  console.log(kind,second.result.advice,JSON.stringify(second.metrics),Boolean(second.result.boundary));
  assert.equal(second.result.advice,advice,kind);
  assert.deepEqual(frame,qualityFixture(kind),'Analysis must not mutate frame evidence');
}
const before=analyseCaptureFrame(qualityFixture('good'));
const darkSurroundings=qualityFixture('small');darkSurroundings.pixels.forEach((v,i)=>{if(i%4!==3&&v===28)darkSurroundings.pixels[i]=0;});
assert.equal(analyseCaptureFrame(darkSurroundings).result.advice,'small','Judge the detected paper, not a dark background');
assert.equal(analyseCaptureFrame(qualityFixture('good',144,192,12),before.grey).result.advice,'moving');
assert.equal(analyseCaptureFrame(qualityFixture('dark'),undefined,true).result.advice,'dark');
assert.equal(analyseCaptureFrame(qualityFixture('good'),before.grey,true).result.advice,'neutral','Basic-only mode must not claim detected/Ready');
assert.throws(()=>analyseCaptureFrame({width:4096,height:4096,pixels:new Uint8ClampedArray(4)}));
let memory={candidate:'neutral',consecutive:0,shown:'neutral',shownAt:0,longShown:false};
for(let i=0;i<2;i++)memory=settleCaptureAdvice(memory,'ready',3000+i*350);
assert.equal(memory.shown,'neutral');memory=settleCaptureAdvice(memory,'ready',3700);assert.equal(memory.shown,'ready');
for(let i=0;i<3;i++)memory=settleCaptureAdvice(memory,'dark',4000+i*350);
assert.equal(memory.shown,'ready','Message cooldown avoids chatter');
memory=settleCaptureAdvice(memory,'dark',6000);assert.equal(memory.shown,'dark');
for(let i=0;i<3;i++)memory=settleCaptureAdvice(memory,'long',9000+i*350);
assert.equal(memory.shown,'long');
for(let i=0;i<3;i++)memory=settleCaptureAdvice(memory,'neutral',12000+i*350);
for(let i=0;i<3;i++)memory=settleCaptureAdvice(memory,'long',15000+i*350);
assert.equal(memory.shown,'neutral','Do not repeat long-receipt hints');
const timings=[];const frame=qualityFixture('good',192,192);let previous;
for(let i=0;i<300;i++){const start=performance.now();const analysis=analyseCaptureFrame(frame,previous);previous=analysis.grey;timings.push(performance.now()-start);}
timings.sort((a,b)=>a-b);
console.log('PERFORMANCE desktop Node 192×192: p50',timings[150].toFixed(2),'ms; p95',timings[285].toFixed(2),'ms; max',timings[299].toFixed(2),'ms');
assert.ok(timings[285]<12,'Off-thread analysis budget');
const camera=await readFile(new URL('../src/components/app/ReceiptCamera.tsx',import.meta.url),'utf8');
assert.match(camera,/disabled=\{!ready \|\| capturing\}/,'Advisory must not gate the shutter');
assert.match(camera,/2560 \/ Math.max\(video.videoWidth, video.videoHeight\)/,'Capture resolution remains unchanged');
const worker=await readFile(new URL('../src/lib/captureQuality.worker.ts',import.meta.url),'utf8');
assert.doesNotMatch(worker,/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|indexedDB/,'No remote analysis or persisted preview frames');
console.log('PASS capture advice, neutral/false-positive controls, motion, smoothing, no evidence mutation and bounded performance');
