function hash2(ix,iz,seed){let h=(ix*374761393+iz*668265263+seed*2246822519)|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return((h>>>0)%100000)/100000;}
const smooth=t=>t*t*(3-2*t);
const lerp=(a,b,t)=>a+(b-a)*t;
function valueNoise(wx,wz,cell,seed){const gx=wx/cell,gz=wz/cell;const x0=Math.floor(gx),z0=Math.floor(gz);const fx=smooth(gx-x0),fz=smooth(gz-z0);const v00=hash2(x0,z0,seed),v10=hash2(x0+1,z0,seed);const v01=hash2(x0,z0+1,seed),v11=hash2(x0+1,z0+1,seed);return lerp(lerp(v00,v10,fx),lerp(v01,v11,fx),fz);}
function fbm(wx,wz,seed,base,oct=4){let sum=0,amp=0.5,norm=0,freq=1;for(let i=0;i<oct;i++){sum+=amp*valueNoise(wx,wz,base/freq,seed+i*101);norm+=amp;amp*=0.5;freq*=2;}return sum/norm;}
const S=32, seed=12345;
function moist(wx,wz){return fbm(wx,wz,seed+17,620,4);}
function temp(wx,wz){return fbm(wx,wz,seed+31,1500,3);}
function relief(wx,wz){return fbm(wx,wz,seed,900,3);}
function riverM(wx,wz){const v=fbm(wx,wz,seed+53,1150,3);const m1=1-Math.min(1,Math.abs(v-0.5)*16);const v2=fbm(wx+9000,wz-4000,seed+71,1700,3);const m2=1-Math.min(1,Math.abs(v2-0.55)*20);return Math.max(m1,m2);}
function rawClass(wx,wz){const e=fbm(wx,wz,seed,720,5),m=moist(wx,wz),t=temp(wx,wz),r=riverM(wx,wz);
  if(e>0.78)return 'mountain';if(e>0.68)return 'hill';
  const wl=0.13;if(r>0.85||e<0.07)return 'deep';if(e<wl||r>0.62)return 'water';if(e<wl+0.05)return 'sand';
  if(t>0.64&&m<0.44)return 'desert';if(m>0.66)return 'forest';if(e>0.58&&m<0.52)return 'field';return 'grass';}
function isWater(c){return c==='water'||c==='deep'||c==='sand';}
// сырая гладкая высота (без лимита склонов)
function rawH(wx,wz){const cls=rawClass(wx,wz);if(isWater(cls))return 0;
  const rv=relief(wx,wz);let L=(rv-0.46)/0.34;L=L<0?0:L>1?1:L;return Math.round(L*5);}

const x0=24000,y0=24000, R=2200;
const n=Math.floor((2*R)/S)+1;
const raw=new Array(n*n).fill(0), d=new Array(n*n).fill(999);
const idx=(ci,ri)=>(ri*n+ci);
let ci0=-1;
for(let ri=0;ri<n;ri++)for(let ci=0;ci<n;ci++){
  const wx=x0-R+ci*S, wy=y0-R+ri*S;
  raw[idx(ci,ri)]=rawH(wx,wy);
}
for(let ri=0;ri<n;ri++)for(let ci=0;ci<n;ci++){
  if(raw[idx(ci,ri)]===0){d[idx(ci,ri)]=0;continue;}
  let v=d[idx(ci,ri)];
  if(ci>0)v=Math.min(v,d[idx(ci-1,ri)]+1);
  if(ri>0)v=Math.min(v,d[idx(ci,ri-1)]+1);
  d[idx(ci,ri)]=v;
}
for(let ri=n-1;ri>=0;ri--)for(let ci=n-1;ci>=0;ci--){
  if(raw[idx(ci,ri)]===0){d[idx(ci,ri)]=0;continue;}
  let v=d[idx(ci,ri)];
  if(ci<n-1)v=Math.min(v,d[idx(ci+1,ri)]+1);
  if(ri<n-1)v=Math.min(v,d[idx(ci,ri+1)]+1);
  d[idx(ci,ri)]=v;
}
// итог = min(raw, distance)
const dist={},dropCount={};let raised=0,total=0,maxDrop=0;
for(let ri=0;ri<n;ri++)for(let ci=0;ci<n;ci++){
  const h=Math.min(raw[idx(ci,ri)],d[idx(ci,ri)]);
  total++;dist[h]=(dist[h]||0)+1;if(h>0)raised++;
  for(const [dc,dr] of [[1,0],[0,1]]){
    const nci=ci+dc,nri=ri+dr;if(nci>=n||nri>=n)continue;
    const h2=Math.min(raw[idx(nci,nri)],d[idx(nci,nri)]);
    const ad=Math.abs(h-h2);if(ad>maxDrop)maxDrop=ad;if(ad>=1)dropCount[ad]=(dropCount[ad]||0)+1;
  }
}
console.log("ПОСЛЕ 2-проходного лимита склонов:");
console.log("распределение ступеней:",dist);
console.log("доля поднятых:",(raised/total).toFixed(3));
console.log("МАКС перепад между соседями:",maxDrop);
console.log("счётчик перепадов:",dropCount);
