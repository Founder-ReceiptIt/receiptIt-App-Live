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

class ReceiptItStory extends HTMLElement {
 static get observedAttributes(){return ['variant','layout','mode'];}
 constructor(){super();this.attachShadow({mode:'open'});this._time=0;this._playing=false;this._frame=0;this._manual=false;this._visible=true;this._media=matchMedia('(prefers-reduced-motion: reduce)');this._onMedia=()=>{if(this._media.matches)this.pause();this.renderFrame();if(!this._media.matches&&!this._manual)this.play();};this._onVisibility=()=>{this._last=null;};}
 get duration(){return this.getAttribute('variant')==='compact'?10:15.5;}
 get currentTime(){return this._time;}
 get paused(){return !this._playing;}
 connectedCallback(){this.setAttribute('role','img');this._media.addEventListener('change',this._onMedia);document.addEventListener('visibilitychange',this._onVisibility);this._resize=new ResizeObserver(()=>this.build());this._resize.observe(this);this._intersection=new IntersectionObserver(entries=>{this._visible=entries[0].isIntersecting;this._last=null;});this._intersection.observe(this);this.build();fontsReady.then(()=>{if(this.isConnected&&!this._manual)this.play();}).catch(()=>{});}
 disconnectedCallback(){this.pause();this._resize?.disconnect();this._intersection?.disconnect();this._media.removeEventListener('change',this._onMedia);document.removeEventListener('visibilitychange',this._onVisibility);}
 attributeChangedCallback(){if(this.isConnected){this._time=Math.min(this._time,this.duration);this.build();if(['static','investor'].includes(this.getAttribute('mode')))this.pause();}}
 seek(seconds){this.pause();this._time=Math.max(0,Math.min(this.duration,Number(seconds)||0));this.renderFrame();}
 pause(){this._manual=true;this._playing=false;cancelAnimationFrame(this._frame);this._last=null;this.dispatchEvent(new Event('playstatechange'));}
 play(){if(this._playing||this._media.matches||['static','investor'].includes(this.getAttribute('mode')))return;this._manual=false;this._playing=true;this._last=null;const tick=now=>{if(!this._playing)return;if(this._last!==null&&!document.hidden&&this._visible)this._time=(this._time+(now-this._last)/1000)%this.duration;this._last=now;this.renderFrame();this._frame=requestAnimationFrame(tick);};this._frame=requestAnimationFrame(tick);this.dispatchEvent(new Event('playstatechange'));}
 build(){
  const compact=this.getAttribute('variant')==='compact';const box=this.getBoundingClientRect();
  let layout=this.getAttribute('layout')||'auto';if(layout==='auto')layout=box.width<600?'portrait':box.width/Math.max(1,box.height)<1.3?'square':'wide';
  const slot=layout==='signup',mobile=layout==='portrait'||slot,square=layout==='square',investor=this.getAttribute('mode')==='investor';
  let W=mobile?390:square?900:1440,H=slot?540:mobile?(compact?600:Math.max(740,Math.min(930,box.width&&box.height?390*box.height/box.width:844))):square?900:810;
  const coreH=mobile?H:800;let scale=mobile?1:square?1.05:investor?.84:.96;
  if(compact&&!mobile)scale=square?1.18:1.04;
  const offsetX=(W-390*scale)/2,offsetY=slot?0:mobile?(compact?0:64):compact?(H-600*scale)/2:investor?140:square?108:100;
  const cardY=slot?302:compact?282:352+(coreH-800)*.15;
  this._slot=slot;this._compact=compact;this._layout=layout;this._W=W;this._H=H;this._cardY=cardY;this._paperY=slot?288:compact?252:318+(coreH-800)*.15;this._retailBottom=slot?278:compact?228:294;
  this.setAttribute('aria-label',`Order complete at Northbridge Tech. Headphones cost £129.99. In the receipt email field, the example username@gmail.com is typed. Only gmail.com is erased, keeping username@, then in.receiptit.app is typed in teal. Only the receiptIt address is confirmed for sending. A paper receipt travels down and becomes a saved purchase in receiptIt, with the original receipt retained. ${compact?'':'Personal data protected, while giving you more from your purchases.'} Illustrative addresses and purchase.`);
  const signatureY=slot?16:mobile?26:investor?88:44;
  const signature=`${txt(W/2,signatureY,'Personal data protected,',mobile?15:22,'#edf1ef','text-anchor="middle" data-anim="signatureFirst"')}${txt(W/2,signatureY+(slot?24:mobile?28:33),'while giving you <tspan fill="#5eead4">more from your purchases.</tspan>',mobile?15:22,'#edf1ef','text-anchor="middle" data-anim="signatureSecond"')}`;
  this.shadowRoot.innerHTML=`<style>
   :host{display:block;width:100%;height:100%;min-width:0;background:#000;contain:layout paint}
   svg.master{display:block;width:100%;height:100%;font-family:'JetBrains Mono',monospace;isolation:isolate;-webkit-font-smoothing:antialiased}
   .retailer{font-family:Arial,Helvetica,sans-serif}.mono{font-family:'JetBrains Mono',monospace}text{user-select:none}
  </style><svg class="master" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">
   <defs><filter id="successGlow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3"/></filter><linearGradient id="tile" x2=".7" y2="1"><stop stop-color="#242424"/><stop offset="1" stop-color="#191919"/></linearGradient><marker id="arrow" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M1 1l3.5 2.5L1 6" fill="none" stroke="#2dd4bf" stroke-width="1.1"/></marker></defs>
   ${rect(0,0,W,H,C.bg,C.bg,0)}
   ${investor?txt(W/2,43,"A receipt shouldn't require your personal inbox.",24,C.white,'text-anchor="middle" font-weight="700"'):''}
   <g transform="translate(${offsetX} ${offsetY}) scale(${scale})">
    ${this.retailer(compact)}
    
    <g data-anim="route"><path d="M195 ${this._retailBottom+4} V${cardY-12}" fill="none" stroke="#2dd4bf" stroke-opacity=".36" stroke-width="1.5" marker-end="url(#arrow)"/></g>
    ${this.purchase(compact,cardY)}
    <g data-anim="paper">${this.paper()}</g>
   </g>
   ${!compact?`<g data-anim="signature">${signature}</g>`:''}
  </svg>`;
  this._nodes={};for(const node of this.shadowRoot.querySelectorAll('[data-anim]'))this._nodes[node.dataset.anim]=node;
  this.renderFrame();
 }
 retailer(compact){const slot=this._slot,h=slot?220:compact?206:272,y=slot?58:22,fieldY=slot?123:compact?116:170,buttonY=slot?174:compact?163:225;
 return `<g transform="translate(20 ${y})" class="retailer"><g data-anim="retailer">
  ${rect(0,0,350,h,'#f1f2f1','#d4d8d7',12)}
  ${txt(18,slot?24:27,'NORTHBRIDGE TECH',12,'#172125','font-weight="700" letter-spacing="1.4"')}
  ${icon('check',18,slot?33:43,14,'#34454a')}${txt(40,slot?45:55,'ORDER COMPLETE',11,'#34454a','font-weight="700" letter-spacing="1"')}
  ${slot?`${txt(18,65,'Wireless Noise-Cancelling',14.5,'#172125')}${txt(18,84,'Headphones',14.5,'#172125')}${txt(331,84,'£129.99',22,'#172125','font-weight="700" text-anchor="end"')}`:compact?txt(18,79,'Headphones · £129.99',14,'#243236'):`${txt(18,81,'Wireless Noise-Cancelling',14.5,'#172125')}${txt(18,102,'Headphones',14.5,'#172125')}${txt(331,102,'£129.99',22,'#172125','font-weight="700" text-anchor="end"')}<path d="M18 116H332" stroke="#d2d7d6"/>${txt(18,137,'RECEIPT',10,'#526064','font-weight="700" letter-spacing="1.5"')}`}
  ${txt(18,slot?112:compact?104:157,'Where should we send your receipt?',14.8,'#35454a')}
  ${rect(18,fieldY,314,42,'#ffffff','#aeb9bb',7)}
  <g data-anim="fieldGlow">${rect(16,fieldY-2,318,46,'none','#2dd4bf',9,'opacity=".15" filter="url(#successGlow)"')}${rect(18,fieldY,314,42,'#f3fbf9','#218f80',7)}</g>
  <g data-anim="placeholder">${txt(30,fieldY+27,'Email for receipt',14,'#58686d')}</g>
  <svg x="30" y="${fieldY+3}" width="290" height="35" overflow="hidden"><g data-anim="email" class="mono"><text y="25" font-size="13.4" fill="#293a3d"><tspan data-anim="emailUser"></tspan><tspan data-anim="emailDomain"></tspan></text></g><path data-anim="caret" d="M1 9V27" stroke="#536762" stroke-width="1.2"/></svg>
  ${rect(18,buttonY,314,compact?30:34,'#253238','#253238',7)}
  <g data-anim="send">${txt(175,buttonY+(compact?20:23),'Send receipt',13,'#ffffff','font-weight="700" text-anchor="middle"')}</g>
  <g data-anim="sent">${txt(175,buttonY+(compact?20:23),'✓ Receipt sent',13,'#ffffff','font-weight="700" text-anchor="middle"')}</g>
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
 purchase(compact,y){return `<g transform="translate(20 ${y})"><g data-anim="card">
  <rect data-anim="surface" x="0" y="0" width="350" height="${this._slot?234:264}" rx="12" fill="#0d1110" stroke="#29483f"/>
  <g data-anim="added">
   ${rect(12,11,166,36,'#2dd4bf','none',10,'opacity=".10" filter="url(#successGlow)"')}
   ${rect(16,14,158,30,'#08231e','#286b5e',8)}${icon('check',26,21,16,C.teal)}${txt(49,34,'Receipt added',12,C.tealText)}
   ${wordmark(277,36,18)}<path d="M16 57H334" stroke="#25352f"/>
  </g>
  <g data-anim="core">
   ${rect(16,72,38,38,'url(#tile)',C.border,10)}${icon('laptop',24,80,23,C.teal)}${txt(67,88,'Northbridge',17,C.white,'font-weight="700"')}${txt(67,111,'Tech',17,C.white,'font-weight="700"')}${txt(333,100,'£129.99',25,C.white,'font-weight="700" text-anchor="end"')}
   ${txt(17,139,'Wireless Noise-Cancelling',13.4,'#d1d5db')}${txt(17,160,'Headphones',13.4,'#d1d5db')}
   ${rect(17,176,50,21,'#09211b','#245348',10)}${txt(42,191,'Tech',10.5,C.tealText,'text-anchor="middle"')}${rect(75,176,101,21,'#171717','#353535',10)}${txt(125,191,'•••• 4821',10.5,C.muted,'text-anchor="middle"')}
  </g>
  <g data-anim="proof">${txt(66,this._slot?222:241,'Original receipt saved',12,'#b3beb9')}</g>
 </g></g>`;}
 renderFrame(){if(!this._nodes)return;const compact=this._compact,fixed=this._media.matches||['static','investor'].includes(this.getAttribute('mode'));const t=fixed?(compact?8.5:12):this._time,end=this.duration;
  const reset=1-smooth(t,end-.18,end),op=(name,v)=>this._nodes[name]?.setAttribute('opacity',clamp(v));
  const a=compact?{normal:[.9,2.0],erase:[2.2,3.05],domain:[3.18,4.15],confirm:[4.15,4.55],send:4.32,travel:[4.65,5.0],unfold:[4.8,5.4],surface:[5.9,6.4],store:[5.95,6.6],core:[6.2,6.6],proof:[6.5,6.8]}:{normal:[1.6,2.85],erase:[3.1,4.15],domain:[4.3,5.3],confirm:[5.3,5.7],send:5.55,travel:[5.9,6.28],unfold:[6.05,6.7],surface:[7.4,8.15],store:[7.45,8.35],core:[8.0,8.65],proof:[8.5,8.8]};
  // Add a half-second after the complete address, preserving the final hold.
  a.send+=.5;for(const key of ['travel','unfold','surface','store','core','proof'])a[key]=a[key].map(v=>v+.5);
  const chars=(value,start,finish)=>value.slice(0,t>=finish?value.length:Math.floor(clamp((t-start)/(finish-start))*value.length));
  let email='';if(t<a.erase[0])email=chars('username@gmail.com',...a.normal);
  else if(t<a.domain[0])email='username@'+'gmail.com'.slice(0,Math.max(0,9-Math.floor(clamp((t-a.erase[0])/(a.erase[1]-a.erase[0]))*9)));
  else email='username@'+chars('in.receiptit.app',...a.domain);
  const at=email.indexOf('@'),prefix=at<0?email:email.slice(0,at+1),domain=at<0?'':email.slice(at+1);
  if(this._nodes.emailUser.textContent!==prefix)this._nodes.emailUser.textContent=prefix;
  if(this._nodes.emailDomain.textContent!==domain)this._nodes.emailDomain.textContent=domain;
  this._nodes.emailDomain.setAttribute('fill',t>=a.domain[0]?'#126e62':'#293a3d');
  const emailFade=1-smooth(t,end-.18,end-.09),returnPlaceholder=smooth(t,end-.09,end);
  op('placeholder',t<a.normal[0]?1-smooth(t,a.normal[0]-.12,a.normal[0]):returnPlaceholder);
  op('email',email?emailFade:0);
  const editing=t>=a.normal[0]&&t<a.domain[1];op('caret',editing?1:0);this._nodes.caret.setAttribute('transform',`translate(${email.length*13.4*.6+2} 0)`);
  const confirmed=smooth(t,...a.confirm),sent=smooth(t,a.send,a.send+.3)*reset;
  op('retailer',1-.13*smooth(t,...a.surface)*reset);op('fieldGlow',confirmed*reset);op('send',clamp(1-sent*2));op('sent',clamp((sent-.5)*2));op('route',smooth(t,a.travel[0],a.travel[0]+.18)*reset);
  const arrival=smooth(t,...a.travel),unfold=smooth(t,...a.unfold),store=smooth(t,...a.store);
  const paperOpacity=smooth(t,a.travel[0],a.travel[0]+.12)*reset;
  const baseScale=.14+((this._slot?.9:1)-.14)*unfold,paperScale=baseScale+((this._slot?.10:.145)-baseScale)*store;
  const paperTop=this._retailBottom+3+(this._paperY-this._retailBottom-3)*arrival,cy=paperTop+127*baseScale;
  const targetCY=this._cardY+(this._slot?217:236),targetCX=54,currentCX=195+(targetCX-195)*store,currentCY=cy+(targetCY-cy)*store;
  op('paper',paperOpacity);this._nodes.paper.setAttribute('transform',`translate(${currentCX-112*paperScale} ${currentCY-127*paperScale}) scale(${paperScale})`);
  const surface=smooth(t,...a.surface);op('card',surface*reset);this._nodes.surface.setAttribute('x',(350-(224+126*surface))/2);this._nodes.surface.setAttribute('width',224+126*surface);
  op('added',smooth(t,a.surface[0]+.25,a.surface[1]));op('core',smooth(t,...a.core));op('proof',smooth(t,...a.proof));
  // Reveal each closing line gently in sequence, then hold both before looping.
  op('signature',reset);op('signatureFirst',smooth(t,9.7,10.35));op('signatureSecond',smooth(t,10.55,11.3));
 }
}
customElements.define('receiptit-story',ReceiptItStory);
