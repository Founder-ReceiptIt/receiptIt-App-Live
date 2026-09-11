/* receiptIt signature motion · standalone SVG master · no application dependencies */
const ASSET_BASE = new URL('.', import.meta.url).href;
// Register document-wide: browsers do not consistently load @font-face in shadow roots.
export const fontsReady = Promise.all([['Regular','400'],['Bold','700']].map(([file,weight]) => {
 const existing=[...document.fonts].find(f=>f.family==='JetBrains Mono' && f.weight===weight);
 if(existing)return existing.load();
 const face=new FontFace('JetBrains Mono',`url(${ASSET_BASE}fonts/JetBrainsMono-${file}.woff2)`,{weight,display:'block'});
 document.fonts.add(face);return face.load();
}));
const C = {bg:'#000000',surface:'#0d0d0d',border:'#262626',teal:'#2dd4bf',tealText:'#5eead4',rose:'#fb7185',roseText:'#fda4af',white:'#ffffff',muted:'#9ca3af'};
const paths = {
 mail:'<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
 shield:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
 undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>',
 laptop:'<path d="M20 16V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12M2 16h20l-1 4H3l-1-4Z"/>',
 lock:'<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
 check:'<path d="m20 6-11 11-5-5"/>',
 file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6m-11 7 2 2 4-4"/>',
 receipt:'<path d="M4 3v18l4-2 4 2 4-2 4 2V3l-4 2-4-2-4 2-4-2Z"/><path d="M8 9h8m-8 4h6"/>'
};
const rect=(x,y,w,h,fill=C.surface,stroke=C.border,r=12,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" ${extra}/>`;
const txt=(x,y,value,size=14,fill=C.white,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${value}</text>`;
const icon=(name,x,y,size=20,color=C.teal,extra='')=>`<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths[name]}</svg>`;
const wordmark=(x,y,size=30)=>txt(x,y,'<tspan fill="#ffffff">receipt</tspan><tspan fill="#2dd4bf">It</tspan>',size,C.white,'font-weight="700" letter-spacing="-0.025em" text-anchor="middle"');
const clamp=v=>Math.min(1,Math.max(0,v));
// Product easing: cubic-bezier(0.22, 1, 0.36, 1), solved by binary search.
function ease(v){v=clamp(v);if(v===0||v===1)return v;let a=0,b=1,t=v;for(let i=0;i<13;i++){t=(a+b)/2;const x=3*(1-t)**2*t*.22+3*(1-t)*t*t*.36+t*t*t;if(x<v)a=t;else b=t;}return 1-(1-t)**3;}
const ramp=(t,a,b)=>ease((t-a)/(b-a));

const smooth=(t,a,b)=>{const v=clamp((t-a)/(b-a));return v*v*(3-2*v);};

export const steps = [
 {label:'Purchase', heading:'1. Make a purchase', copy:'Shop as normal.'},
 {label:'receiptIt email', heading:'2. Use your receiptIt email', copy:'When a retailer asks where to send your receipt, give them your receiptIt email instead of your personal inbox.'},
 {label:'Inbox separate', heading:'3. Keep your personal inbox separate', copy:'receiptIt receives and privately saves your receipt.'},
 {label:'Receipt saved', heading:'4. Find it in receiptIt', copy:'Your purchase is saved, organised and ready when you need it.'},
];
const brandHTML=value=>value.replaceAll('receiptIt','<span class="brand">receipt<span class="brand-it">It</span></span>');
const brandSVG=value=>value.replaceAll('receiptIt','<tspan>receipt<tspan fill="#2dd4bf">It</tspan></tspan>');
// Timings are real seconds, so reading holds can be adjusted independently.
export const timeline={duration:35.61,steps:[0,1.725,5.325,13.985,20.735],explanationReady:5.825,addressStart:7.325,addressReady:7.935,migrateStart:9.175,migrateEnd:11.025,finale:30.435,beginReady:31.7575};
const mix=(a,b,v)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-v)+parseInt(b.slice(i,i+2),16)*v).toString(16).padStart(2,'0')).join('');
const slogan='Give the retailer less of you, while giving you more from your purchases.';
class ReceiptItStory extends HTMLElement {
 static get observedAttributes(){return ['mode'];}
 constructor(){super();this.attachShadow({mode:'open'});this._time=0;this._playing=false;this._manual=false;this._visible=true;this._media=matchMedia('(prefers-reduced-motion: reduce)');this._onMedia=()=>{this.pause();this.build();};this._onVisibility=()=>{this._last=null;};}
 get duration(){return timeline.duration;}
 get currentTime(){return this._time;}
 get paused(){return !this._playing;}
 get completed(){return this._time>=this.duration;}
 get finale(){return !this.staticMode&&this._time>=timeline.finale;}
 get beginReady(){return this.staticMode||this._time>=timeline.beginReady;}
 get staticMode(){return this._media.matches||this.getAttribute('mode')==='static';}
 connectedCallback(){this._media.addEventListener('change',this._onMedia);document.addEventListener('visibilitychange',this._onVisibility);this._intersection=new IntersectionObserver(entries=>{this._visible=entries[0].isIntersecting;this._last=null;});this._intersection.observe(this);this.build();fontsReady.then(()=>{if(this.isConnected&&!this._manual&&!this.staticMode)this.play();}).catch(()=>{});}
 disconnectedCallback(){this.pause();this._intersection?.disconnect();this._media.removeEventListener('change',this._onMedia);document.removeEventListener('visibilitychange',this._onVisibility);}
 attributeChangedCallback(){if(this.isConnected){this.pause();this.build();}}
 seek(seconds){this._time=clamp(Number(seconds)/this.duration)*this.duration;this.pause();this.renderFrame();}
 pause(){this._manual=true;this._playing=false;cancelAnimationFrame(this._frame);this._last=null;this.dispatchEvent(new Event('playstatechange'));}
 replay(){this.seek(0);this.play();}
 play(){if(this._playing||this.staticMode||this.completed)return;this._manual=false;this._playing=true;this._last=null;this.dispatchEvent(new Event('playstatechange'));const tick=now=>{if(!this._playing)return;if(this._last!==null&&!document.hidden&&this._visible)this._time=Math.min(this.duration,this._time+(now-this._last)/1000);this._last=now;this.renderFrame();if(this.completed){this.pause();this.dispatchEvent(new Event('complete'));return;}this._frame=requestAnimationFrame(tick);};this._frame=requestAnimationFrame(tick);}
 build(){
  this._slot=true;this._step=-1;
  const fixed=this.staticMode;
  this.shadowRoot.innerHTML=`<style>
   :host{display:block;width:100%;color:#fff;font-family:'JetBrains Mono',monospace;background:#000;min-width:0;container-type:inline-size}
   *{box-sizing:border-box}.composition{position:relative}h2{font-size:24px;line-height:1.25;letter-spacing:-.04em;margin:0 0 18px;font-weight:400;text-align:center;position:relative;top:12px}h2 .brand{font-weight:700}
   .brand{white-space:nowrap}.brand-it{color:#2dd4bf}.journey{display:flex;flex-direction:column}
   .guide{display:flex;justify-content:center;align-items:flex-end;height:148px;order:-1;margin:0 0 16px}
   .dot{display:flex;align-items:center;justify-content:center;width:20px;height:20px;border:1px solid #48544d;border-radius:50%;flex:none;font:11px Arial,sans-serif}
   h3{font-size:18px;line-height:1.35;letter-spacing:-.04em;margin:0 0 8px;font-weight:700}
   p{font:15px/1.45 Arial,Helvetica,sans-serif;color:#b8c3bd;margin:0}.detail{min-width:0;width:calc(100% - 40px);max-width:350px;text-align:center}
   .scene{display:block;width:100%;height:auto;overflow:hidden;font-family:'JetBrains Mono',monospace}.retailer{font-family:Arial,Helvetica,sans-serif}.mono{font-family:'JetBrains Mono',monospace}
   .finale{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 12px;text-align:center;pointer-events:none}
   .begin{pointer-events:auto;min-height:48px;min-width:170px;margin-top:26px;padding:12px 24px;background:#2dd4bf;border:0;border-radius:12px;color:#06120f;font:700 14px/1.4 'JetBrains Mono',monospace;cursor:pointer}.begin:focus-visible{outline:2px solid #fff;outline-offset:4px}.begin:disabled{pointer-events:none}:host([hide-action]) .begin{display:none}.wordmark{font-size:40px;font-weight:700;letter-spacing:-.045em;margin-bottom:24px}.signature{font:400 clamp(12px,3.7cqw,15px)/1.7 Arial,Helvetica,sans-serif;color:#edf1ef;width:100%;max-width:380px}
   .replay{display:flex;align-items:center;justify-content:center;pointer-events:auto;width:44px;height:44px;margin-top:8px;border:0;border-radius:50%;background:transparent;color:#9ca3af;cursor:pointer}.replay:hover{color:#5eead4;background:#ffffff08}.replay:focus-visible{outline:2px solid #5eead4;outline-offset:2px}:host([hide-action]) .replay{display:none}
   .replay[hidden]{display:none}
   .phrase{display:block;white-space:nowrap}.summary{padding:0;margin:0 0 18px;list-style:none}.summary li{position:relative;margin:0 0 15px;padding-left:30px}.summary .dot{position:absolute;left:0;top:1px;border-color:#356858;color:#5eead4}.summary h3{font-size:16px;margin-bottom:4px}.summary p{font-size:14px}.summary .address{display:block;color:#5eead4;font:13px/1.65 'JetBrains Mono',monospace;overflow-wrap:anywhere;margin:3px 0}.summary .from{font-size:13px;color:#b8c3bd}.inbox-note{display:flex;align-items:center;gap:6px;color:#93c5fd;font:13px/1.5 Arial,sans-serif;margin:5px 0}.inbox-note svg{width:14px;height:14px;flex:none}
   .static .finale{position:static;padding:18px 8px 0}.static .wordmark{font-size:28px;margin-bottom:12px}.static .signature{font-size:clamp(12px,3.7cqw,15px)}.static .scene{margin-top:6px}
   @media(max-width:350px){.guide{height:168px}h3{font-size:17px}p{font-size:14px}h2{font-size:23px}.wordmark{font-size:36px}}
  </style><div class="composition ${fixed?'static':''}"><h2>${brandHTML('How receiptIt works')}</h2>
  ${fixed?`<ol class="summary">${steps.map((step,i)=>`<li><span class="dot"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m3 8 3 3 7-7"/></svg></span><h3>${brandHTML(step.heading)}</h3><p>${brandHTML(step.copy)}</p>${i===1?`<span class="from">${brandHTML('receiptIt private email address')}</span><span class="address">yourname@in.receiptit.app</span>`:''}${i===2?`<div class="inbox-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${paths.lock}</svg>Personal inbox · Stays separate</div>`:''}</li>`).join('')}</ol>`:''}
  <div class="journey"><svg class="scene" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 330" role="img" aria-label="Northbridge Tech demo purchase: copy the private receiptIt email into checkout, keep your personal inbox separate, and find the saved purchase in your receiptIt Wallet.">
   <defs><filter id="successGlow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3"/></filter><linearGradient id="tile" x2=".7" y2="1"><stop stop-color="#242424"/><stop offset="1" stop-color="#191919"/></linearGradient></defs>
   <g data-anim="checkout">${this.retailer(false)}</g>
   <g data-anim="assigned">${rect(20,0,350,60,'#0a1a15','#29483f',12)}${txt(32,21,brandSVG('receiptIt private email address'),12.3,'#d1ddd7')}<g data-anim="assignedAddress">${rect(26,25,250,28,'#0c241c','#29483f',10)}${txt(32,44,'yourname@in.receiptit.app',14,'#5eead4')}</g>
    <g data-anim="copyLabel">${txt(355,44,'Copy',10.5,'#5eead4','text-anchor="end"')}</g><g data-anim="copiedLabel">${txt(355,44,'Copied',10.5,'#5eead4','text-anchor="end"')}</g>
   </g>
   <g data-anim="transferred"><rect data-anim="transferSurface" x="0" y="0" width="250" height="28" rx="10" fill="#0c241c" stroke="#29483f"/>${txt(6,19,'yourname@in.receiptit.app',14,'#5eead4','data-anim="transferAddress"')}</g>
   <g data-anim="separate">${rect(49,64,292,137,'#0c172a','#345787',12)}${icon('mail',70,87,28,'#93c5fd')}${txt(112,108,'Personal inbox',20,'#dbeafe','font-weight="700"')}${icon('lock',93,139,20,'#93c5fd')}${txt(124,155,'Stays separate',17,'#93c5fd')}</g>
   <g data-anim="receives">${rect(31,23,328,280,'#081713','#244c42',12)}${txt(195,77,`<tspan x="195">${brandSVG('receiptIt receives and privately')}</tspan><tspan x="195" dy="22"> saves your receipt</tspan>`,14,'#bde8dd','text-anchor="middle"')}</g>
   ${this.wallet()}
   <g data-anim="paper">${this.paper()}</g>
  </svg>
  ${fixed?'':`<div class="guide"><div class="detail" aria-live="polite" aria-atomic="true"><h3></h3><p></p></div></div>`}</div>
  <div class="finale"><div class="wordmark">${brandHTML('receiptIt')}</div><div class="signature" aria-label="${slogan}"><span class="phrase">Give the retailer less of you,</span><span class="phrase">while giving you more from your purchases.</span></div><button class="begin" type="button">Let's begin</button><button class="replay" type="button" aria-label="Replay animation" title="Replay animation"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 6.4M3 4v7h7"/></svg></button></div></div>`;
  this._nodes={};for(const e of this.shadowRoot.querySelectorAll('[data-anim]'))this._nodes[e.dataset.anim]=e;
  this.shadowRoot.querySelector('.begin').addEventListener('click',()=>this.dispatchEvent(new CustomEvent('begin',{bubbles:true,composed:true})));
  this.shadowRoot.querySelector('.replay').addEventListener('click',()=>{this.closest('main')?.scrollTo({top:0,behavior:'instant'});this.replay();});
  this.renderFrame();
 }
 retailer(compact){const slot=this._slot,h=slot?220:compact?206:272,y=slot?72:22,fieldY=slot?123:compact?116:170,buttonY=slot?174:compact?163:225;
 return `<g transform="translate(20 ${y})" class="retailer"><g data-anim="retailer">
  ${rect(0,0,350,h,'#f1f2f1','#d4d8d7',12)}
  ${icon('check',18,11,19,'#34454a')}${txt(45,27,'ORDER COMPLETE',20,'#172125','font-weight="700" letter-spacing=".7"')}
  ${txt(18,47,'Northbridge Tech',12,'#526064','font-weight="600"')}
  ${slot?`${txt(18,65,'Wireless Noise-Cancelling',14.5,'#172125')}${txt(18,84,'Headphones',14.5,'#172125')}${txt(331,84,'£129.99',22,'#172125','font-weight="700" text-anchor="end"')}`:compact?txt(18,79,'Headphones · £129.99',14,'#243236'):`${txt(18,81,'Wireless Noise-Cancelling',14.5,'#172125')}${txt(18,102,'Headphones',14.5,'#172125')}${txt(331,102,'£129.99',22,'#172125','font-weight="700" text-anchor="end"')}<path d="M18 116H332" stroke="#d2d7d6"/>${txt(18,137,'RECEIPT',10,'#526064','font-weight="700" letter-spacing="1.5"')}`}
  ${txt(18,slot?112:compact?104:157,'Where should we send your receipt?',17,'#172125','font-weight="600"')}
  ${rect(18,fieldY,314,42,'#ffffff','#aeb9bb',7)}
  <g data-anim="fieldGlow">${rect(16,fieldY-2,318,46,'none','#2dd4bf',9,'opacity=".15" filter="url(#successGlow)"')}${rect(18,fieldY,314,42,'#0c241c','#218f80',7)}</g>
  <g data-anim="placeholder">${txt(30,fieldY+27,'Email for receipt',14,'#58686d')}</g>
  <svg x="30" y="${fieldY+3}" width="290" height="35" overflow="hidden"><g data-anim="email" class="mono"><text y="25" font-size="13.4" fill="#5eead4"><tspan>yourname@in.receiptit.app</tspan></text></g></svg>
  ${rect(18,buttonY,314,compact?30:34,'#253238','#253238',7)}
  <g data-anim="send">${txt(175,buttonY+(compact?20:23),'Send receipt',13,'#ffffff','font-weight="700" text-anchor="middle"')}</g>
  <g data-anim="sent">${txt(175,buttonY+(compact?20:23),'Receipt sent',13,'#ffffff','font-weight="700" text-anchor="middle"')}</g>
 </g></g>`;
 }
 paper(){let bottom='';for(let x=224;x>=0;x-=8)bottom+=`L${x} ${x%16===0?248:254} `;
 return `<path d="M5 0H219Q224 0 224 5V248 ${bottom}V5Q0 0 5 0Z" fill="#f6f4ef" stroke="#d7d7d1" stroke-width="1"/>
  ${txt(112,28,'NORTHBRIDGE TECH',11.3,'#242a2b','font-weight="700" text-anchor="middle"')}
  ${txt(112,48,'RECEIPT',9.5,'#606867','text-anchor="middle" letter-spacing="1.8"')}
  <path d="M16 63H208" stroke="#a7aeaa" stroke-dasharray="3 3"/>
  ${txt(16,86,'Wireless Noise-Cancelling',11.4,'#303839')}${txt(16,106,'Headphones',11.4,'#303839')}
  ${txt(208,133,'£129.99',16,'#202829','text-anchor="end"')}
  <path d="M16 150H208" stroke="#a7aeaa" stroke-dasharray="3 3"/>
  ${txt(16,174,'Visa •••• 4821',11.5,'#505d5d')}
  ${txt(16,208,'TOTAL',11.5,'#202829','font-weight="700"')}${txt(208,208,'£129.99',21,'#202829','font-weight="700" text-anchor="end"')}
  <path d="M16 230H208" stroke="#c7cbc7"/>
 `;}
 // Compact Wallet viewport, using WalletTab.tsx's Receipts/search/category/card hierarchy,
 // charcoal surfaces, gradient merchant tile, right-aligned amount and blue Tech pill.
 // All records are fictional; item/proof lines are onboarding-specific detail annotations.
 wallet(){const existing=(y,merchant,amount,category)=>`<g class="existing-receipt">${rect(20,y,350,34,'#0d0d0d','#303030',10)}${icon('receipt',30,y+7,20,'#86bbae')}${txt(61,y+14,merchant,12,C.white,'font-weight="700"')}${txt(61,y+27,category,9,C.muted)}${txt(354,y+22,amount,13,C.white,'text-anchor="end"')}</g>`;
 return `<g data-anim="wallet">
  <g data-anim="walletContext">
   ${txt(20,25,'Receipts',23,C.white,'font-weight="700"')}
   ${rect(20,36,350,29,'#0d0d0d','#262626',12)}<g fill="none" stroke="#9ca3af" stroke-width="1.5"><circle cx="37" cy="49" r="5"/><path d="m41 53 4 4"/></g>${txt(55,55,'Search receipts',12,'#8d969f')}
   ${rect(20,72,350,28,'#0d0d0d','#262626',12)}${rect(29,76,43,20,'#12332d','#296e60',10)}${txt(50,90,'All',11,C.teal,'text-anchor="middle"')}${txt(91,90,'Tech',11,C.muted)}${txt(147,90,'Groceries',11,C.muted)}${txt(239,90,'Clothing',11,C.muted)}
   <g data-anim="countBefore">${txt(20,114,'2 saved purchases',10.5,C.muted)}</g><g data-anim="countAfter">${txt(20,114,'3 saved purchases',10.5,C.muted)}</g>
  </g>
  <g data-anim="existing">${existing(120,'Willow Market','£34.80','Groceries')}${existing(162,'Oak & Thread','£49.00','Clothing')}</g>
  <g data-anim="card">
   ${rect(20,120,350,120,'#0d0d0d','#286c5e',12)}
   <rect data-anim="cardGlow" x="20" y="120" width="350" height="120" rx="12" fill="none" stroke="#2dd4bf" stroke-width="2" filter="url(#successGlow)"/>
   ${rect(36,132,36,36,'url(#tile)','#292929',10)}${icon('laptop',42,138,24,C.teal)}
   ${txt(84,145,'Northbridge',16,C.white,'font-weight="700"')}${txt(84,165,'Tech',16,C.white,'font-weight="700"')}${txt(354,149,'£129.99',23,C.white,'font-weight="700" text-anchor="end"')}
   ${rect(84,173,44,18,'#101b2d','#294767',9)}${txt(106,186,'Tech',10.5,'#60a5fa','text-anchor="middle"')}${rect(136,173,100,18,'#171717','#292929',9)}${txt(186,186,'•••• 4821',10.5,C.muted,'text-anchor="middle"')}
   ${txt(36,208,'Wireless Noise-Cancelling Headphones',12.5,'#d1d5db')}
   ${icon('file',36,219,14,'#5eead4')}${txt(59,231,'Original receipt saved',11.5,'#b3beb9')}
  </g>
  <g data-anim="added">${icon('check',247,103,12,C.teal)}${txt(368,114,'Receipt added',10.8,C.tealText,'text-anchor="end"')}</g>
 </g>`;}
 renderFrame(){
  if(!this._nodes)return;
  const fixed=this.staticMode,t=fixed?30:this._time,n=this._nodes,op=(key,value)=>n[key]?.setAttribute('opacity',clamp(value));
  const step=t<1.725?0:t<5.325?1:t<13.985?2:t<20.735?3:4;
  if(!fixed&&this._step!==step){this._step=step;const detail=this.shadowRoot.querySelector('.detail');detail.querySelector('h3').innerHTML=brandHTML(steps[Math.max(0,step-1)].heading);detail.querySelector('p').innerHTML=brandHTML(steps[Math.max(0,step-1)].copy);}
  if(!fixed){const start=timeline.steps[step];this.shadowRoot.querySelector('.detail').style.opacity=String(step?smooth(t,start,start+.5):0);}
  const ending=fixed?0:smooth(t,30.435,31.1825);
  if(this._finale!==this.finale||this._beginReady!==this.beginReady){this._finale=this.finale;this._beginReady=this.beginReady;this.dispatchEvent(new Event('finalestatechange'));}
  const title=this.shadowRoot.querySelector('h2');title.style.opacity=fixed?'1':String(smooth(t,0,.92)*(1-ending));title.setAttribute('aria-hidden',String(!fixed&&ending===1));
  const journey=this.shadowRoot.querySelector('.journey');journey.style.opacity=String(1-ending);journey.style.filter=ending===0?'none':`blur(${2*ending}px)`;journey.setAttribute('aria-hidden',String(!fixed&&ending===1));
  op('checkout',smooth(t,1.725,2.175)*(1-smooth(t,13.985,14.675)));n.checkout.setAttribute('transform',`translate(0 ${-12*smooth(t,13.985,14.675)})`);
  op('assigned',smooth(t,timeline.addressStart,timeline.addressReady)*(1-smooth(t,13.73833,14.445)));
  op('copyLabel',1-smooth(t,8.68167,9.05167));op('copiedLabel',smooth(t,8.68167,9.05167));
  // Lift the original address, then morph its rounded capsule exactly into the field.
  const transfer=smooth(t,timeline.migrateStart,timeline.migrateEnd),lift=smooth(t,9.055,9.175),land=smooth(t,11.025,11.145);
  op('assignedAddress',1-lift);op('transferred',lift*(1-land));
  n.transferred.setAttribute('transform',`translate(${26+12*transfer} ${25+170*transfer})`);
  n.transferSurface.setAttribute('width',250+64*transfer);n.transferSurface.setAttribute('height',28+14*transfer);n.transferSurface.setAttribute('rx',10-3*transfer);
  n.transferSurface.setAttribute('fill','#0c241c');n.transferSurface.setAttribute('stroke',mix('#29483f','#218f80',transfer));
  n.transferAddress.setAttribute('x',6+6*transfer);n.transferAddress.setAttribute('y',19+9*transfer);n.transferAddress.setAttribute('font-size',14-.6*transfer);n.transferAddress.setAttribute('fill','#5eead4');
  op('email',land);op('placeholder',1-smooth(t,9.175,9.545));op('fieldGlow',smooth(t,10.975,11.145));
  op('send',1-smooth(t,12.25833,12.56667));op('sent',smooth(t,12.56667,12.875));
  op('separate',smooth(t,14.445,15.02)*(1-smooth(t,17.36,18.05)));n.separate.setAttribute('transform',`translate(${-22*smooth(t,17.36,18.05)} 0)`);
  op('receives',smooth(t,17.5325,18.2225)*(1-smooth(t,20.735,21.4825)));
  const flight=smooth(t,17.59,18.51),settle=smooth(t,20.9075,21.5975),store=smooth(t,23.1325,26.1225),scale=.34+.24*flight-.28*settle-.23*store;
  const cx=85+110*flight-141*store,cy=246-31*flight+59*settle-124*store;
  op('paper',smooth(t,17.59,17.935)*(1-smooth(t,23.42,26.1225)));n.paper.setAttribute('transform',`translate(${cx-112*scale} ${cy-127*scale}) scale(${scale})`);
  op('wallet',fixed?1:smooth(t,20.85,21.5975));
  const arrive=fixed?1:smooth(t,23.1325,26.1225),focus=fixed?1:smooth(t,27.485,28.635);
  op('card',arrive);n.card.setAttribute('transform',`translate(0 ${-16*(1-arrive)})`);n.card.style.filter=arrive===1?'none':`blur(${1.5*(1-arrive)}px)`;
  n.existing.setAttribute('transform',`translate(0 ${132*arrive})`);op('existing',1-focus);op('walletContext',1-focus);n.walletContext.style.filter=focus===0?'none':`blur(${.65*focus}px)`;
  op('countBefore',1-arrive);op('countAfter',arrive);op('cardGlow',.22*arrive);op('added',(fixed?1:smooth(t,26.0075,26.5825))*(1-focus));
  const finale=this.shadowRoot.querySelector('.finale'),reveal=fixed?1:smooth(t,31.1825,31.7575);finale.style.opacity=String(reveal);finale.setAttribute('aria-hidden',String(reveal===0));
  const begin=this.shadowRoot.querySelector('.begin');begin.disabled=!this.beginReady;begin.tabIndex=this.beginReady?0:-1;
  const replay=this.shadowRoot.querySelector('.replay');replay.hidden=!this.beginReady||fixed;replay.disabled=!this.beginReady||fixed;replay.tabIndex=this.beginReady&&!fixed?0:-1;
 }
}
if(!customElements.get('receiptit-story'))customElements.define('receiptit-story',ReceiptItStory);
