// Собирает превью: сценки отдыха и обычный шаруа НА ОДНОЙ базовой линии
// в тех самых экранных высотах, что задаёт pixelart.ts. Глазами видно,
// соразмерны ли фигуры (это надёжнее любых цветовых эвристик).
const fs=require('fs'), zlib=require('zlib'), path=require('path');
const DIR='src/assets/sprites/units/kz';
function readPNG(f){const b=fs.readFileSync(f);
  const w=b.readUInt32BE(16),h=b.readUInt32BE(20);
  let idat=[],p=8;
  while(p<b.length){const len=b.readUInt32BE(p),typ=b.toString('ascii',p+4,p+8);
    if(typ==='IDAT')idat.push(b.slice(p+8,p+8+len));p+=12+len;}
  const raw=zlib.inflateSync(Buffer.concat(idat));
  const stride=w*4,out=Buffer.alloc(h*stride);let rp=0;
  for(let y=0;y<h;y++){const ft=raw[rp++];const line=raw.slice(rp,rp+stride);rp+=stride;
    for(let x=0;x<stride;x++){const a=x>=4?out[y*stride+x-4]:0,bb=y>0?out[(y-1)*stride+x]:0;
      const c=(x>=4&&y>0)?out[(y-1)*stride+x-4]:0;let v=line[x];
      if(ft===1)v+=a;else if(ft===2)v+=bb;else if(ft===3)v+=(a+bb)>>1;
      else if(ft===4){const pa=Math.abs(bb-c),pb=Math.abs(a-c),pc=Math.abs(a+bb-2*c);
        v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?bb:c);}
      out[y*stride+x]=v&255;}}
  return {w,h,px:out};}
function writePNG(file,w,h,px){
  const stride=w*4, raw=Buffer.alloc((stride+1)*h);
  for(let y=0;y<h;y++){raw[y*(stride+1)]=0;px.copy(raw,y*(stride+1)+1,y*stride,(y+1)*stride);}
  const idat=zlib.deflateSync(raw);
  const chunk=(t,d)=>{const b=Buffer.alloc(8+d.length+4);b.writeUInt32BE(d.length,0);
    b.write(t,4);d.copy(b,8);
    const crcBuf=Buffer.concat([Buffer.from(t),d]);
    let c=~0;for(const byte of crcBuf){c^=byte;for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}
    b.writeUInt32BE((~c)>>>0,8+d.length);return b;};
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
  fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]));
}
// целевые высоты — те же формулы, что в pixelart.ts
const VILL=46;
const items=[
  ['kz_villager',VILL,150,'шаруа (эталон)'],
  ['kz_swing_c',Math.round(VILL*1.9),150,'алтыбакан'],
  ['kz_kazan_b',VILL,150,'казан'],
  ['kz_asyk_a',Math.round(VILL*1.06),157,'асыки: замах'],
  ['kz_asyk_b',Math.round(VILL*1.06),157,'асыки: бросок'],
  ['kz_asyk_c',Math.round(VILL*1.06),157,'асыки: кость летит'],
  ['kz_fem_side',VILL,150,'работница'],
];
const SCALE=4;                    // увеличим всё для разглядывания
const GAP=12*SCALE, BASE=110*SCALE;
let totalW=GAP;
const prepared=[];
for(const [name,H,ah,label] of items){
  const f=path.join(DIR,name+'.png');
  if(!fs.existsSync(f)){console.log('нет',name);continue;}
  const im=readPNG(f);
  const sc=(H/ah)*SCALE;
  const dw=Math.round(im.w*sc), dh=Math.round(im.h*sc);
  prepared.push({im,dw,dh,label,H});
  totalW+=dw+GAP;
}
const W=totalW, Hc=BASE+40*SCALE;
const out=Buffer.alloc(W*Hc*4);
// фон
for(let i=0;i<W*Hc;i++){out[i*4]=32;out[i*4+1]=36;out[i*4+2]=44;out[i*4+3]=255;}
// линия земли
for(let x=0;x<W;x++){const i=(BASE*W+x)*4;out[i]=120;out[i+1]=90;out[i+2]=60;out[i+3]=255;}
let cx=GAP;
for(const p of prepared){
  const {im,dw,dh}=p;
  for(let y=0;y<dh;y++){
    for(let x=0;x<dw;x++){
      const sx=Math.min(im.w-1,Math.floor(x*im.w/dw)), sy=Math.min(im.h-1,Math.floor(y*im.h/dh));
      const si=(sy*im.w+sx)*4, a=im.px[si+3];
      if(a<=16) continue;
      const dyy=BASE-dh+y, dxx=cx+x;
      if(dyy<0||dyy>=Hc||dxx<0||dxx>=W) continue;
      const di=(dyy*W+dxx)*4;
      out[di]=im.px[si];out[di+1]=im.px[si+1];out[di+2]=im.px[si+2];out[di+3]=255;
    }
  }
  cx+=dw+GAP;
}
writePNG('tests/rest-preview.png',W,Hc,out);
console.log('готово: tests/rest-preview.png');
for(const p of prepared) console.log(`  ${p.label}: H=${p.H} → ${Math.round(p.dw/SCALE)}x${Math.round(p.dh/SCALE)}px на экране`);
