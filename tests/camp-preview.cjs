// Офлайн-превью размещения: где встанут казан и алтыбакан относительно ставки.
// node-canvas в проекте нет, поэтому собираем PNG вручную (как в night-light.cjs).
const fs=require('fs'),zlib=require('zlib'),path=require('path');
const DIR=path.join(__dirname,'..','src','assets','sprites','units','kz');
function readPNG(f){const b=fs.readFileSync(f);const w=b.readUInt32BE(16),h=b.readUInt32BE(20);
  let idat=[],p=8;while(p<b.length){const len=b.readUInt32BE(p),t=b.toString('ascii',p+4,p+8);
    if(t==='IDAT')idat.push(b.slice(p+8,p+8+len));p+=12+len;}
  const raw=zlib.inflateSync(Buffer.concat(idat));const st=w*4,o=Buffer.alloc(h*st);let rp=0;
  for(let y=0;y<h;y++){const ft=raw[rp++];const ln=raw.slice(rp,rp+st);rp+=st;
    for(let x=0;x<st;x++){const a=x>=4?o[y*st+x-4]:0,bb=y>0?o[(y-1)*st+x]:0;
      const c=(x>=4&&y>0)?o[(y-1)*st+x-4]:0;let v=ln[x];
      if(ft===1)v+=a;else if(ft===2)v+=bb;else if(ft===3)v+=(a+bb)>>1;
      else if(ft===4){const pa=Math.abs(bb-c),pb=Math.abs(a-c),pc=Math.abs(a+bb-2*c);
        v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?bb:c);}
      o[y*st+x]=v&255;}}
  return {w,h,px:o};}
const CT=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
const crc=b=>{let c=0xffffffff;for(const x of b)c=CT[(c^x)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};
function writePNG(f,w,h,px){const st=w*4,raw=Buffer.alloc((st+1)*h);
  for(let y=0;y<h;y++){raw[y*(st+1)]=0;px.copy(raw,y*(st+1)+1,y*st,(y+1)*st);}
  const idat=zlib.deflateSync(raw,{level:9});
  const ch=(t,d)=>{const b=Buffer.alloc(12+d.length);b.writeUInt32BE(d.length,0);b.write(t,4);d.copy(b,8);
    b.writeUInt32BE(crc(Buffer.concat([Buffer.from(t),d])),8+d.length);return b;};
  const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
  fs.writeFileSync(f,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ih),ch('IDAT',idat),ch('IEND',Buffer.alloc(0))]));}

const W=1000,H=520,out=Buffer.alloc(W*H*4);
for(let i=0;i<W*H;i++){const y=(i/W)|0;const t=y/H;
  out[i*4]=88-t*26;out[i*4+1]=104-t*30;out[i*4+2]=62-t*18;out[i*4+3]=255;}
const toIso=(x,y)=>[x-y,(x+y)*0.5];
const TC={x:0,y:0};
const HEX=20*Math.sqrt(3);           // шаг гекса = «одна клетка» ≈34.64
const props=[
  {x:TC.x+Math.cos(0.6)*4.5*HEX, y:TC.y+Math.sin(0.6)*4.5*HEX, kind:'kazan'},
  {x:TC.x+Math.cos(2.5)*7.5*HEX, y:TC.y+Math.sin(2.5)*7.5*HEX, kind:'swing'},
];
const CAM_X=W/2+150, CAM_Y=H/2+40, Z=1.25;
// сетка гексов для масштаба
for(let gx=-10;gx<=10;gx++)for(let gy=-10;gy<=10;gy++){
  const [ix,iy]=toIso(gx*32,gy*32);
  const sx=Math.round(CAM_X+ix*Z), sy=Math.round(CAM_Y+iy*Z);
  if(sx<0||sy<0||sx>=W||sy>=H)continue;
  const i=(sy*W+sx)*4; out[i]=110;out[i+1]=124;out[i+2]=84;
}
function blit(im,cxp,byp,H2){
  const sc=H2/im.h, w=Math.round(im.w*sc);
  for(let y=0;y<H2;y++)for(let x=0;x<w;x++){
    const si=(((y/sc)|0)*im.w+((x/sc)|0))*4; if(im.px[si+3]<=16)continue;
    const dx=Math.round(cxp-w/2)+x, dy=Math.round(byp-H2)+y;
    if(dx<0||dy<0||dx>=W||dy>=H)continue;
    const di=(dy*W+dx)*4;const a=im.px[si+3]/255;
    out[di]=im.px[si]*a+out[di]*(1-a);out[di+1]=im.px[si+1]*a+out[di+1]*(1-a);out[di+2]=im.px[si+2]*a+out[di+2]*(1-a);}
}
// ставка — условный шатёр
const [tix,tiy]=toIso(TC.x,TC.y);
const tsx=CAM_X+tix*Z, tsy=CAM_Y+tiy*Z;
for(let y=-70;y<0;y++){const wq=Math.round((1+y/70)*54);
  for(let x=-wq;x<wq;x++){const dx=Math.round(tsx+x),dy=Math.round(tsy+y);
    if(dx<0||dy<0||dx>=W||dy>=H)continue;const i=(dy*W+dx)*4;
    out[i]=232;out[i+1]=224;out[i+2]=200;}}
const VH=46;
const items=props.map(p=>{const [ix,iy]=toIso(p.x,p.y);return {...p,sx:CAM_X+ix*Z,sy:CAM_Y+iy*Z,iy};});
items.sort((a,b)=>a.iy-b.iy);
for(const it of items){
  const im=readPNG(path.join(DIR, it.kind==='kazan'?'kz_prop_kazan.png':'kz_prop_swing.png'));
  blit(im,it.sx,it.sy,Math.round((it.kind==='kazan'?VH:VH*1.67)*Z));
}
writePNG(path.join(__dirname,'camp-props.png'),W,H,out);
const d=(p)=>Math.hypot(p.x,p.y)/HEX;
console.log(`казан     — ${d(props[0]).toFixed(1)} клетки от ставки`);
console.log(`алтыбакан — ${d(props[1]).toFixed(1)} клетки от ставки`);
console.log('превью: tests/camp-props.png');
