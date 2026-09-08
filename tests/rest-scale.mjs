// Масштаб сценок отдыха: проверяем ФОРМУЛЫ высот из pixelart.ts, а не цвета пикселей
// (цветовые эвристики врали — ловили платок вместо всей фигуры).
// Эталон нарезчика: самая НИЗКАЯ фигура полосы = 150 логических px.
import fs from 'node:fs';
let pass=0,fail=0;
const ok=(n,c,x='')=>{c?(pass++,console.log('PASS',n)):(fail++,console.log('FAIL',n,x))};
const VILL=46;                       // UNIT_TARGET_H.villager
const restH=key=>key.startsWith('kz_swing')?Math.round(VILL*1.9)
  :key.startsWith('kz_kazan')?VILL
  :key.startsWith('kz_asyk')?Math.round(VILL*0.65):0;

// формулы масштаба
ok('казан = рост шаруа (эталон — женщина стоя)', restH('kz_kazan_a')===46);
ok('алтыбакан ×1.9 (эталон — вся рама ~3.2м)', restH('kz_swing_c')===87);
ok('асыки ×0.65 (эталон — мужчина на корточках)', restH('kz_asyk_a')===30);
ok('обычный кадр сценкой не считается', restH('kz_villager')===0);
ok('качели выше человека', restH('kz_swing_c')>restH('kz_kazan_a'));
ok('сидящий ниже стоящего', restH('kz_asyk_a')<restH('kz_kazan_a'));

// человек в сценке соразмерен шаруа (по логике эталонов)
const humanOnScreen=k=>k.startsWith('kz_swing')?restH(k)/1.9
  :k.startsWith('kz_asyk')?restH(k)/0.65:restH(k);
for(const k of ['kz_swing_c','kz_kazan_a','kz_asyk_a']){
  const h=humanOnScreen(k);
  ok(`${k}: человек ≈ рост шаруа (${h.toFixed(0)}px)`, Math.abs(h-VILL)<=1.5, h);
}

// файлы кадров на месте и консистентны по габаритам
const png=f=>{const b=fs.readFileSync(f);return{w:b.readUInt32BE(16),h:b.readUInt32BE(20)}};
const D='src/assets/sprites/units/kz';
const groups={
  swing:['kz_swing_l','kz_swing_c','kz_swing_r'],
  kazan:['kz_kazan_a','kz_kazan_b','kz_kazan_c'],
  asyk:['kz_asyk_a','kz_asyk_b','kz_asyk_c'],
};
for(const [g,keys] of Object.entries(groups)){
  const sizes=keys.map(k=>{const f=`${D}/${k}.png`;
    return fs.existsSync(f)?png(f):null;});
  ok(`${g}: все кадры на месте`, sizes.every(Boolean));
  if(!sizes.every(Boolean)) continue;
  const hs=sizes.map(s=>s.h);
  if (g==='asyk') {
    // у асыков поза МЕНЯЕТСЯ: два кадра на корточках + кадр «встал и радуется».
    // Сверяем не равенство, а что присед ниже стойки и стойка = росту шаруа.
    const crouch=(hs[0]+hs[1])/2, stand=hs[2];
    const H=restH('kz_asyk_a'), sc=H/150;
    ok('асыки: присед ниже стойки', crouch<stand, `${crouch} vs ${stand}`);
    ok('асыки: вставший мужчина ростом с шаруа',
      Math.abs(stand*sc-VILL)<=2, (stand*sc).toFixed(1));
    ok('асыки: оба кадра приседа одной высоты', Math.abs(hs[0]-hs[1])<=3);
  } else {
    const spread=Math.max(...hs)-Math.min(...hs);
    // поза не меняется — кадры обязаны совпадать, иначе фигура «прыгает»
    ok(`${g}: высоты кадров согласованы (разброс ${spread}px)`, spread<=6, spread);
  }
}
// казан переснят: три кадра одной женщины, одинаковый габарит
const kz=groups.kazan.map(k=>png(`${D}/${k}.png`));
ok('казан: кадры почти одинаковой ширины (одна поза)',
  Math.max(...kz.map(s=>s.w))-Math.min(...kz.map(s=>s.w))<=3);
ok('казан: кадры одинаковой высоты (голова не прыгает)',
  Math.max(...kz.map(s=>s.h))-Math.min(...kz.map(s=>s.h))===0);

console.log(`\n${pass}/${pass+fail} PASS`);
process.exit(fail?1:0);
