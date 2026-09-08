// Проверка посадки сценок отдыха: экранная высота и ширина в пределах разумного.
const fs=require('fs');
const A={
  kz_swing_l:{ax:50.3,ay:150,h:150,H:72}, kz_swing_c:{ax:52.1,ay:150,h:150,H:72},
  kz_swing_r:{ax:51.2,ay:150,h:150,H:72},
  kz_kazan_a:{ax:63.2,ay:149,h:150,H:54}, kz_kazan_b:{ax:57,ay:173,h:150,H:54},
  kz_kazan_c:{ax:57.5,ay:152,h:150,H:54},
  kz_asyk_a:{ax:112.8,ay:150,h:150,H:50}, kz_asyk_b:{ax:111.3,ay:151,h:150,H:50},
  kz_asyk_c:{ax:54.5,ay:231,h:150,H:50},
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
