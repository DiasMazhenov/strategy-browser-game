// Проверка посадки сценок отдыха: экранная высота и ширина в пределах разумного.
const fs=require('fs');
// высоты соответствуют формулам pixelart.ts: swing ×1.9, kazan ×1.0, asyk ×1.06 от 46px
const A={
  kz_swing_l:{ax:50.3,ay:150,h:150,H:87}, kz_swing_c:{ax:52.1,ay:150,h:150,H:87},
  kz_swing_r:{ax:51.2,ay:150,h:150,H:87},
  kz_kazan_a:{ax:60.7,ay:151,h:150,H:46}, kz_kazan_b:{ax:60.7,ay:151,h:150,H:46},
  kz_kazan_c:{ax:60.5,ay:151,h:150,H:46},
  kz_asyk_a:{ax:54.0,ay:155,h:157,H:49}, kz_asyk_b:{ax:54.0,ay:155,h:157,H:49},
  kz_asyk_c:{ax:54.0,ay:155,h:157,H:49},
};
const png=f=>{const b=fs.readFileSync(f);return{w:b.readUInt32BE(16),h:b.readUInt32BE(20)}};
let bad=0;
for(const [k,a] of Object.entries(A)){
  const f=`src/assets/sprites/units/kz/${k}.png`;
  if(!fs.existsSync(f)){console.log('MISSING',f);bad++;continue;}
  const {w,h}=png(f);
  const scale=a.H/a.h;
  const sw=(w*scale).toFixed(1), sh=(h*scale).toFixed(1);
  const footY=(a.ay*scale).toFixed(1);   // от верха кадра до линии земли
  console.log(`${k}: файл ${w}x${h} → экран ${sw}x${sh}px, земля на ${footY}px от верха`);
  if(+sw>170||+sh>190){console.log('  ⚠ слишком крупно');bad++;}
  if(+sw<18){console.log('  ⚠ слишком мелко');bad++;}
}
console.log(bad?`\n${bad} проблем`:'\nвсе сценки в разумных габаритах');
process.exit(bad?1:0);
