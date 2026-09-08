// Превью ночного освещения БЕЗ браузера: повторяем ту же композицию, что и
// engine.drawNightLight (слой ночи + destination-out дырки), и рисуем результат
// в PNG. Так видно глазами, что факелы именно СНИМАЮТ ночь, а не белят её.
const fs=require('fs'), zlib=require('zlib');
const W=900,H=300;
// «карта»: травяной фон с клеткой, чтобы было видно, что под ночью
const px=Buffer.alloc(W*H*4);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=(y*W+x)*4;
  const chk=((x>>5)+(y>>5))&1;
  px[i]=chk?58:48; px[i+1]=chk?92:78; px[i+2]=chk?44:38; px[i+3]=255;
}
// три «здания» разного размера
const blds=[{x:150,y:170,size:120},{x:450,y:170,size:86},{x:720,y:170,size:56}];
for(const b of blds){
  const s=b.size*0.5;
  for(let y=b.y-s;y<b.y+s*0.35;y++)for(let x=b.x-s*0.7;x<b.x+s*0.7;x++){
    if(x<0||y<0||x>=W||y>=H)continue;
    const i=((y|0)*W+(x|0))*4;
    px[i]=96;px[i+1]=74;px[i+2]=48;px[i+3]=255;
  }
}
// ── слой ночи с дырками (та же математика, что в движке) ──
const darkness=1.0, lit=1.0;
const nightA=darkness*0.42;
const tint=[20,26,60];
// альфа ночи в каждом пикселе после вырезания
const alpha=new Float32Array(W*H).fill(nightA);
for(const b of blds){
  const R=(b.size*0.85+34);
  for(let y=Math.max(0,b.y-R|0);y<Math.min(H,b.y+R|0);y++){
    for(let x=Math.max(0,b.x-R|0);x<Math.min(W,b.x+R|0);x++){
      const d=Math.hypot(x-b.x,y-b.y);
      if(d>R)continue;
      // тот же градиент: 0.92 в центре(до 12%), 0.45 на 45%, 0 на краю
      const t=d/R;
      // стопы градиента: 0.78 → 0.42 (35%) → 0.14 (70%) → 0 (край)
      const stops=[[0,0.78],[0.35,0.42],[0.7,0.14],[1,0]];
      let a=0;
      for(let k=0;k+1<stops.length;k++){
        const [t0,a0]=stops[k],[t1,a1]=stops[k+1];
        if(t>=t0&&t<=t1){a=(a0+(a1-a0)*((t-t0)/(t1-t0)))*lit;break;}
      }
      const idx=y*W+x;
      alpha[idx]=alpha[idx]*(1-Math.max(0,a));   // destination-out
    }
  }
}
// накладываем ночь на карту
for(let i=0;i<W*H;i++){
  const a=alpha[i], p=i*4;
  px[p]  =Math.round(px[p]  *(1-a)+tint[0]*a);
  px[p+1]=Math.round(px[p+1]*(1-a)+tint[1]*a);
  px[p+2]=Math.round(px[p+2]*(1-a)+tint[2]*a);
}
// тёплый отблеск (lighter) + огонёк факела
for(const b of blds){
  const R=(b.size*0.62+30);
  for(let y=Math.max(0,b.y-R|0);y<Math.min(H,b.y+R|0);y++)
  for(let x=Math.max(0,b.x-R|0);x<Math.min(W,b.x+R|0);x++){
    const d=Math.hypot(x-b.x,y-b.y); if(d>R)continue;
    const a=0.30*lit*(1-d/R), p=(y*W+x)*4;
    px[p]=Math.min(255,px[p]+255*a);
    px[p+1]=Math.min(255,px[p+1]+176*a);
    px[p+2]=Math.min(255,px[p+2]+72*a);
  }
  // два факела по бокам
  for(const sx of [b.x-b.size*0.42, b.x+b.size*0.42]){
    const fy=b.y+b.size*0.5-2;
    for(let y=fy-12;y<fy;y++){const p=((y|0)*W+(sx|0))*4;
      if(y<0||y>=H)continue; px[p]=74;px[p+1]=49;px[p+2]=21;}
    for(let dy=-4;dy<=1;dy++)for(let dx=-3;dx<=3;dx++){
      const y=fy-17+dy,x=sx+dx; if(x<0||y<0||x>=W||y>=H)continue;
      if(dx*dx+dy*dy>10)continue;
      const p=((y|0)*W+(x|0))*4;
      const c=dy<-2?[254,243,199]:dy<0?[251,191,36]:[249,115,22];
      px[p]=c[0];px[p+1]=c[1];px[p+2]=c[2];
    }
  }
}
// запись PNG
const stride=W*4, raw=Buffer.alloc((stride+1)*H);
for(let y=0;y<H;y++){raw[y*(stride+1)]=0;px.copy(raw,y*(stride+1)+1,y*stride,(y+1)*stride);}
const idat=zlib.deflateSync(raw);
const T=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
const crc=b=>{let c=0xffffffff;for(const x of b)c=T[(c^x)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};
const chunk=(ty,d)=>{const b=Buffer.alloc(12+d.length);b.writeUInt32BE(d.length,0);b.write(ty,4);d.copy(b,8);
  b.writeUInt32BE(crc(Buffer.concat([Buffer.from(ty),d])),8+d.length);return b;};
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=6;
fs.writeFileSync('tests/night-light.png',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]));
// числовая сверка
const at=(x,y)=>alpha[y*W+x];
console.log('ночь вдали от зданий  alpha =',at(20,20).toFixed(3));
console.log('центр большого здания alpha =',at(150,170).toFixed(3));
console.log('снято в центре        =',((1-at(150,170)/nightA)*100).toFixed(0)+'%');
console.log('радиус света: ставка',(120*1.5+60),'px, юрта',(56*1.5+60),'px');
console.log('готово: tests/night-light.png');
