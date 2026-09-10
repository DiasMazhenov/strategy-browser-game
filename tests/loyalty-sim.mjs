// Лояльность границ (п.23, 1.0.104): симуляция формулы давления/дрейфа + проверки подключения.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// та же формула дрейфа, что в updateLoyalty
function sim(pp, pe, ow, secs, cur = ow === 1 ? 1 : -1) {
  for (let t = 0; t < secs; t += 1.5) {
    const drift = (pp < 0.05 && pe < 0.05) ? (ow === 1 ? 0.04 : -0.04) : clamp((pp - pe) * 0.03, -0.06, 0.06);
    cur = clamp(cur + drift * 1.5, -1, 1);
  }
  return cur;
}
console.log('\n=== 1. Динамика каната ===');
ok(sim(0, 0, 1) === 1, 'без давления наш гекс остаётся лоялен');
ok(sim(0, 2, 1, 60) <= -1, 'вражеская башня рядом без нашего ответа забирает гекс за ~минуту');
ok(sim(0, 2, 1, 20) > -1 && sim(0, 2, 1, 20) < 0.5, 'через 20 с гекс уже мятежный, но ещё наш');
ok(sim(2, 2, 1, 120) === 1, 'равное контр-давление держит границу бесконечно');
ok(sim(3, 2, 1, 120, -0.9) >= 1, 'перевес в давлении возвращает почти потерянный гекс');
ok(sim(0, 0, 1, 40, -0.9) >= 0.5, 'враг ушёл — гекс сам возвращается к штампу');
ok(sim(2, 0, 2, 60) >= 1, 'симметрично: наш форпост отбирает гекс у джунгар');

console.log('\n=== 2. Подключение ===');
ok(/updateLoyalty\(dt\);/.test(eng), 'тик лояльности в оседлом режиме');
ok(/if \(v === 1\) \{ if \(l >= 0\.5\) this\.terrCount\+\+; else this\.rebelCount\+\+; \}/.test(eng), 'в счёт победы идут только лояльные гексы (≥0.5)');
ok(/if \(v <= -1\) this\.terr\.set\(k, 2\); else if \(v >= 1\) this\.terr\.set\(k, 1\);/.test(eng), 'полностью перетянутый гекс меняет владельца');
ok(/u\.key === 'villager' \|\| u\.key === 'trader' \|\| u\.key === 'scout'\) continue;/.test(eng), 'давят только боевые отряды, не шаруа');
ok(/\(b\.garrison\?\.length \?\? 0\) \* 0\.15/.test(eng), 'гарнизон усиливает якорь');
ok(/const rebel = Math\.abs\(ly\) < 0\.5/.test(eng) && /rgba\(150,150,160/.test(eng), 'спорный гекс седеет и мерцает');
ok(/loyal: \[\.\.\.this\.loyal\.entries\(\)\]/.test(eng) && /this\.loyal = new Map\(Array\.isArray\(d\.loyal\)/.test(eng), 'сейв/загрузка, старые сейвы — все лояльны');
ok(/rebelCount: this\.rebelCount/.test(eng) && /hud\.rebelCount > 0/.test(app), 'чип мятежных гексов в HUD');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
