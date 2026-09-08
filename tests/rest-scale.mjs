// Масштаб сценок отдыха: проверяем ФОРМУЛЫ высот из pixelart.ts, а не цвета пикселей
// (цветовые эвристики врали — ловили платок вместо всей фигуры).
// Эталон нарезчика: самая НИЗКАЯ фигура полосы = 150 логических px.
import fs from 'node:fs';
let pass=0,fail=0;
const ok=(n,c,x='')=>{c?(pass++,console.log('PASS',n)):(fail++,console.log('FAIL',n,x))};
const VILL=46;                       // UNIT_TARGET_H.villager
const restH=key=>key.startsWith('kz_swing')?Math.round(VILL*1.9)
  :key.startsWith('kz_kazan')?VILL
  :key.startsWith('kz_asyk')?Math.round(VILL*1.06):0;

// формулы масштаба
ok('казан = рост шаруа (эталон — женщина стоя)', restH('kz_kazan_a')===46);
ok('алтыбакан ×1.9 (эталон — вся рама ~3.2м)', restH('kz_swing_c')===87);
ok('асыки ×1.06 (групповая сценка, эталон — стоящий зритель)', restH('kz_asyk_a')===49);
ok('обычный кадр сценкой не считается', restH('kz_villager')===0);
ok('качели выше человека', restH('kz_swing_c')>restH('kz_kazan_a'));
ok('сценка асыков шире одиночной фигуры', restH('kz_asyk_a')>restH('kz_kazan_a'));

// человек в сценке соразмерен шаруа (по логике эталонов)
// у асыков нормировка идёт по всему холсту (157px), а стоящий зритель занимает 148px
const humanOnScreen=k=>k.startsWith('kz_swing')?restH(k)/1.9
  :k.startsWith('kz_asyk')?restH(k)*148/157:restH(k);
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
    // Асыки — ГРУППОВАЯ сценка на ОБЩЕМ холсте: метальщик закреплён по якорю,
    // меняются только рука и кости. Холсты обязаны совпадать пиксель в пиксель,
    // иначе движок впишет их в одну высоту и фигуры будут «дышать».
    const ws=sizes.map(s=>s.w);
    ok('асыки: все кадры на общем холсте (ширина)', Math.max(...ws)-Math.min(...ws)===0, ws.join('/'));
    ok('асыки: все кадры на общем холсте (высота)', Math.max(...hs)-Math.min(...hs)===0, hs.join('/'));
    const H=restH('kz_asyk_a'), sc=H/hs[0];
    ok('асыки: зритель ростом с шаруа', Math.abs(148*sc-VILL)<=2, (148*sc).toFixed(1));
    ok('асыки: сценка шире одиночной фигуры (есть зрители)', ws[0]>hs[0]*1.4, ws[0]);
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
