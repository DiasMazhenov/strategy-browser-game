// Превью спрайтов алтыбакана: пустые качели + 3 фазы качания с парой.
const path=require('path');
const M=require(path.join(__dirname,'..','scripts','make-altybakan.cjs'));
const DIR=path.join(__dirname,'..','src','assets','sprites','units','kz');
const keys=['kz_prop_swing','kz_swing_ride_l','kz_swing_ride_c','kz_swing_ride_r'];
const ims=keys.map(k=>M.readPNG(path.join(DIR,k+'.png')));
const S=3,GAP=16;
const W=ims.reduce((a,i)=>a+i.w*S+GAP,GAP), H=Math.max(...ims.map(i=>i.h))*S+56;
const out=Buffer.alloc(W*H*4);
for(let i=0;i<W*H;i++){const y=(i/W)|0,t=y/H;
  out[i*4]=40+t*14;out[i*4+1]=46+t*16;out[i*4+2]=58+t*12;out[i*4+3]=255;}
const base=H-26;
for(let x=0;x<W;x++){const i=(base*W+x)*4;out[i]=104;out[i+1]=88;out[i+2]=58;}
let cx=GAP;
ims.forEach(im=>{const dw=im.w*S,dh=im.h*S;
  for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
    const si=(((y/S)|0)*im.w+((x/S)|0))*4; if(im.px[si+3]<=16)continue;
    const dy=base-dh+y,dx=cx+x; if(dy<0||dy>=H||dx<0||dx>=W)continue;
    const di=(dy*W+dx)*4;out[di]=im.px[si];out[di+1]=im.px[si+1];out[di+2]=im.px[si+2];out[di+3]=255;}
  cx+=dw+GAP;});
M.writePNG(path.join(__dirname,'altybakan.png'),W,H,out);
console.log('tests/altybakan.png — пустые | влево | центр | вправо');
