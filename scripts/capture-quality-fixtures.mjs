// Deterministic raster evidence for preview heuristics, not production classifier data.
export function qualityFixture(kind='good', width=144, height=192, offset=0) {
  const pixels=new Uint8ClampedArray(width*height*4);
  const light=kind==='dark'?0.30:1;
  let box={x:0.25,y:0.06,w:0.50,h:0.88};
  if(kind==='small')box={x:0.36,y:0.30,w:0.28,h:0.35};
  if(kind==='cropped')box={x:0.22,y:-0.12,w:0.56,h:0.98};
  if(kind==='long')box={x:0.43,y:0,w:0.14,h:1};
  const paper=kind==='glare'?200:kind==='white'?255:232;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const bend=kind==='bent'?Math.sin(y/height*Math.PI*2)*0.035:0;
    const x0=Math.round((box.x+bend)*width)+offset,y0=Math.round(box.y*height);
    const bw=Math.round(box.w*width),bh=Math.round(box.h*height);
    const inPaper=x>=x0&&x<x0+bw&&y>=y0&&y<y0+bh;
    let value=kind==='white-background'?220:28;
    if(inPaper&&kind!=='none'&&kind!=='clutter') {
      value=paper;
      const inset=Math.max(4,Math.round(bw*0.16));
      // Printed rows with character breaks; not a uniform striped texture.
      if(kind!=='blank'&&y>y0+8&&y<y0+bh-6&&(y-y0)%7<2&&x>x0+inset&&x<x0+bw-inset&&(x-x0)%6<4)value=45;
      if(kind==='glare'&&x>x0+bw*0.35&&x<x0+bw*0.78&&y>y0+bh*0.25&&y<y0+bh*0.75)value=255;
    }
    if(kind==='none')value=120;
    if(kind==='clutter')value=30+((Math.floor(x/8)*17+Math.floor(y/9)*31)%160);
    const p=(y*width+x)*4;
    pixels[p]=pixels[p+1]=pixels[p+2]=Math.round(value*light);pixels[p+3]=255;
    if(kind==='occluded'&&inPaper&&x>x0+bw*0.80&&y>y0+bh*0.35&&y<y0+bh*0.65){pixels[p]=183;pixels[p+1]=115;pixels[p+2]=83;}
  }
  if(kind==='blur') {
    for(let pass=0;pass<2;pass++) {
      const source=pixels.slice();
      for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
        let sum=0,count=0;
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++) {
          const sx=Math.max(0,Math.min(width-1,x+dx)),sy=Math.max(0,Math.min(height-1,y+dy));sum+=source[(sy*width+sx)*4];count++;
        }
        const p=(y*width+x)*4;pixels[p]=pixels[p+1]=pixels[p+2]=Math.round(sum/count);
      }
    }
  }
  return {width,height,pixels};
}
