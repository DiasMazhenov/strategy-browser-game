// Стационарные декорации стойбища ИЗ УЖЕ НАРИСОВАННЫХ спрайтов сценок отдыха:
//   kz_prop_kazan — казан на треноге с очагом (из kz_kazan_b, без женщины)
//   kz_prop_swing — рама алтыбакана (из kz_swing_c, без девушки)
// Людей вырезаем по цвету кожи/одежды и связности: остаётся только инвентарь,
// который стоит у ставки постоянно, независимо от того, отдыхает кто-то или нет.
const fs=require('fs'), zlib=require('zlib'), path=require('path');
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
function writePNG(file,w,h,px){
  const st=w*4, raw=Buffer.alloc((st+1)*h);
  for(let y=0;y<h;y++){raw[y*(st+1)]=0;px.copy(raw,y*(st+1)+1,y*st,(y+1)*st);}
  const idat=zlib.deflateSync(raw,{level:9});
  const ch=(t,d)=>{const b=Buffer.alloc(12+d.length);b.writeUInt32BE(d.length,0);b.write(t,4);d.copy(b,8);
    b.writeUInt32BE(crc(Buffer.concat([Buffer.from(t),d])),8+d.length);return b;};
  const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
  fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ih),ch('IDAT',idat),ch('IEND',Buffer.alloc(0))]));}

// Убрать «крошки» — одиночные пиксели без соседей, оставшиеся от вырезанной
// фигуры. Без этого на верёвках качелей висит пыль от платья.
function despeckle(im, minNeighbors=2){
  const a=Buffer.from(im.px);
  for(let y=0;y<im.h;y++)for(let x=0;x<im.w;x++){
    const i=(y*im.w+x)*4;
    if(im.px[i+3]<=16) continue;
    let n=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy) continue;
      const nx=x+dx, ny=y+dy;
      if(nx<0||ny<0||nx>=im.w||ny>=im.h) continue;
      if(im.px[(ny*im.w+nx)*4+3]>16) n++;
    }
    if(n<minNeighbors) a[i+3]=0;
  }
  return {w:im.w,h:im.h,px:a};
}

// обрезать прозрачные поля
function trim(im){
  let x0=1e9,x1=-1,y0=1e9,y1=-1;
  for(let y=0;y<im.h;y++)for(let x=0;x<im.w;x++){
    if(im.px[(y*im.w+x)*4+3]<=16)continue;
    if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;}
  if(x1<0) return null;
  const w=x1-x0+1,h=y1-y0+1,out=Buffer.alloc(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const s=((y+y0)*im.w+(x+x0))*4,d=(y*w+x)*4;
    out[d]=im.px[s];out[d+1]=im.px[s+1];out[d+2]=im.px[s+2];out[d+3]=im.px[s+3];}
  return {w,h,px:out,x0,y0};
}

// ── КАЗАН: женщина стоит СПРАВА (x≈78..124). Оставляем левую часть с котлом ──
{
  const im=readPNG(path.join(DIR,'kz_kazan_b.png'));
  const cut=Buffer.from(im.px);
  for(let y=0;y<im.h;y++)for(let x=0;x<im.w;x++){
    const i=(y*im.w+x)*4;
    if(x>=74){ cut[i+3]=0; continue; }    // срезаем колонку с женщиной
    if(cut[i+3]<=16) continue;
    // Обрубок рукава: светлая кремовая ткань в верхней трети у правого края.
    // Котёл и тренога тёмные, пламя — насыщенное оранжевое, так что светлое
    // и малонасыщенное сверху справа может быть только одеждой.
    const r=cut[i],g=cut[i+1],b=cut[i+2];
    const pale = r>150 && g>140 && b>110;
    if(pale && y<95 && x>52) cut[i+3]=0;
  }
  const t=trim(despeckle({w:im.w,h:im.h,px:cut}));
  writePNG(path.join(DIR,'kz_prop_kazan.png'),t.w,t.h,t.px);
  console.log(`kz_prop_kazan  ${t.w}x${t.h}  x0=${t.x0} y0=${t.y0}  (исходный кадр ${im.w}x${im.h})`);
}

// ── АЛТЫБАКАН: оставляем РАМУ (4 диагональные стойки + перекладина + верёвки),
// убираем девушку с сиденьем. Структура кадра (по ASCII-разбору kz_swing_c):
//   y≈16      — горизонтальная перекладина через весь кадр
//   x≈30, x≈50 — две вертикальные верёвки от перекладины вниз
//   по краям   — 4 диагональные стойки, расходящиеся книзу
//   центр y≈80..135 — фигура девушки и сиденье (это и убираем)
{
  const im=readPNG(path.join(DIR,'kz_swing_c.png'));
  const cut=Buffer.from(im.px);
  const isWood=(i)=>{const r=cut[i],g=cut[i+1],b=cut[i+2];
    return r>50 && r<200 && g<r*0.85 && b<g*0.92 && (r-b)>28;};
  for(let y=0;y<im.h;y++){
    for(let x=0;x<im.w;x++){
      const i=(y*im.w+x)*4;
      if(cut[i+3]<=16) continue;
      if(y<=20) continue;                       // перекладина — не трогаем
      // Верёвки: узкие вертикальные полосы. Сохраняем их целиком.
      // Верёвки: узкие вертикальные полосы ИЗ ДЕРЕВА/шнура. Лоскуты платья,
      // висевшие на той же линии, отсекаем по цвету — они светлые и пёстрые.
      const rope = (Math.abs(x-30)<=2 || Math.abs(x-50)<=2);
      if(rope){
        if(isWood(i) || y<86) continue;         // сам шнур и крепление
        cut[i+3]=0;                             // обрывок ткани на шнуре
        continue;
      }
      // Стойки — только дерево у краёв кадра; всё, что не дерево, в центре — фигура.
      const edge = x<22 || x>58;
      if(edge && isWood(i)) continue;           // диагональная опора
      if(edge && y>136) continue;               // основание опор
      cut[i+3]=0;                               // остальное (девушка, сиденье) — прочь
    }
  }
  const t=trim(despeckle(despeckle({w:im.w,h:im.h,px:cut}),3));
  writePNG(path.join(DIR,'kz_prop_swing.png'),t.w,t.h,t.px);
  console.log(`kz_prop_swing  ${t.w}x${t.h}  x0=${t.x0} y0=${t.y0}  (исходный кадр ${im.w}x${im.h})`);
}
