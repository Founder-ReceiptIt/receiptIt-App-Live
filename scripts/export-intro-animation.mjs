// Editable HTML/SVG source remains authoritative. No animation library required.
// --format=stills (default), gif, mp4, webm, or all. GIF needs Python/Pillow;
// video needs an FFmpeg binary supplied through RECEIPTIT_FFMPEG or PATH.
import fs from 'node:fs/promises';import path from 'node:path';import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const{chromium}=await import(process.env.RECEIPTIT_BROWSER_MODULE||'playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:4174';const format=process.argv.find(a=>a.startsWith('--format='))?.split('=')[1]||'stills';if(!['stills','gif','mp4','webm','all'].includes(format))throw Error('Unsupported format');
const out=path.join(root,'output/intro-animation/revision-14');await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});const p=await browser.newPage({viewport:{width:390,height:1100},deviceScaleFactor:2});
try{
 await p.goto(base+'/intro/revision-06/preview.html');await p.evaluate(()=>window.animationReady);const story=p.locator('#story');
 for(const[name,t]of[['step-1',3.5],['step-2-text',6.3],['step-2',9.5],['step-2-transfer',11.1],['step-3-blue',17.7],['step-3-save',21],['wallet-before',24],['wallet-arriving',26],['wallet-added',28.5],['step-4',31.5],['completed',37.11]]){await p.goto(base+'/intro/revision-06/preview.html');await p.evaluate(()=>window.animationReady);await story.evaluate((e,t)=>e.seek(t),t);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.setViewportSize({width:390,height:Math.ceil((await story.boundingBox()).height)});await p.screenshot({path:path.join(out,name+'.png')});}
 await story.evaluate(e=>{e.setAttribute('hide-action','');e.setAttribute('mode','static');});await p.setViewportSize({width:390,height:Math.ceil((await story.boundingBox()).height)});await p.screenshot({path:path.join(out,'reduced-motion.png')});await fs.copyFile(path.join(out,'reduced-motion.png'),path.join(root,'public/intro/revision-06/reduced-motion.png'));
 if(format!=='stills'){
  await story.evaluate(e=>{e.removeAttribute('hide-action');e.removeAttribute('mode');e.seek(9);});const height=Math.ceil((await story.boundingBox()).height/2)*2;
  await p.setViewportSize({width:390,height});await p.addStyleTag({content:'.controls{display:none}body{overflow:hidden}'});
  const frames=path.join(out,'frames');await fs.mkdir(frames,{recursive:true});
  for(let i=0;i<743;i++){await story.evaluate((e,t)=>e.seek(t),i/20);await p.screenshot({path:path.join(frames,String(i).padStart(4,'0')+'.png')});}
  if(format==='gif'||format==='all'){
   const code=`from PIL import Image,ImageSequence\nfrom pathlib import Path\nimport sys\np=Path(sys.argv[1]);files=sorted((p/'frames').glob('*.png'));frames=[]\nfor f in files:\n with Image.open(f) as im: frames.append(im.convert('RGB').quantize(colors=256))\nframes[0].save(p/'onboarding.gif',save_all=True,append_images=frames[1:],duration=[50]*(len(frames)-1)+[10],loop=0,disposal=2)\nwith Image.open(p/'onboarding.gif') as im: assert sum(f.info['duration'] for f in ImageSequence.Iterator(im))==37110\n`;
   const result=spawnSync(process.env.RECEIPTIT_PYTHON||'python3',['-c',code,out],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);
  }
  for(const ext of (format==='all'?['mp4','webm']:['mp4','webm'].includes(format)?[format]:[])){
   const codec=ext==='mp4'?['-c:v','libx264','-crf','19','-movflags','+faststart']:['-c:v','libvpx-vp9','-crf','30','-b:v','0'];
   const result=spawnSync(process.env.RECEIPTIT_FFMPEG||'ffmpeg',['-y','-framerate','20','-i',path.join(frames,'%04d.png'),...codec,'-pix_fmt','yuv420p','-an',path.join(out,'onboarding.'+ext)],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||String(result.error));
  }
 }
 console.log(`Updated ${format} exports: ${out}`);
}finally{await browser.close();}
