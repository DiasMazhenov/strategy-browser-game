// Религиозная победа и миссионеры (п.31), 1.0.113: вера народов, конкуренция
// шаманов, смягчение вражды, победа 7/7, сейв.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Вера народов ===');
ok(/faith: Record<string, number> = \{\};  \/\/ народ → −100 \(шаманизм джунгар\) \.\. \+100 \(ислам\)/.test(eng), 'шкала −100..+100 на народ');
ok(/if \(m\.owner === 'player' && m\.key === 'mosque' && m\.done >= 1 && dist2\(m\.x, m\.y, b\.x, b\.y\) < 520 \* 520\) \{ delta \+= 0\.4; break; \}/.test(eng), 'мечеть в 520 px проповедует +0.4/с');
ok(/delta \+= u\.owner === 'player' \? 1\.1 : -0\.9;/.test(eng), 'миссионер +1.1/с, шаман джунгар −0.9/с');
ok(/if \(dist2\(u\.x, u\.y, b\.x, b\.y\) < 240 \* 240\) delta/.test(eng), 'юниты влияют в 240 px от лагеря');
ok(/const cur = clamp\(was \+ delta \* step, -100, 100\);/.test(eng), 'кламп шкалы');
ok(/const step = Math\.min\(this\.faithT, 3\)/.test(eng) && /this\.faithT = 0;/.test(eng), 'лаг не даёт гигантских скачков');

console.log('\n=== 2. Последствия веры ===');
ok(/if \(cur >= 50 && this\.tribeRel\[nid\] === 'hostile'\)/.test(eng), '50 — враждебность снимается');
ok(/if \(cur >= 100 && this\.tribeRel\[nid\] !== 'friend'\)/.test(eng), '100 — союз');
ok(/this\.score \+= 400;/.test(eng), '+400 очков за обращённый народ');
ok(/if \(!this\.over && TRIBE_IDS\.every\(nid => \(this\.faith\[nid\] \?\? 0\) >= 100\)\) \{/.test(eng), 'победа: все 7 народов в исламе');
ok(/this\.finish\('victory'\);/.test(eng) && /СТЕПЬ В ИСЛАМЕ!/.test(eng), 'finish(victory) с баннером');

console.log('\n=== 3. Миссионер ===');
ok(/if \(u\.owner === 'player' && u\.state === 'idle'\) \{[\s\S]{0,120}for \(const b of this\.blds\) \{\n            if \(!b\.tribe \|\| !b\.nationId \|\| \(this\.faith\[b\.nationId\] \?\? 0\) >= 100\) continue;/.test(eng), 'свободный имам сам идёт к необращённому лагерю');
ok(/1100 \* 1100/.test(eng), 'радиус поиска лагеря 1100 px');
ok(/МИССИОНЕР \(п\.31\): имаму нечего лечить/.test(eng), 'лечение в приоритете, проповедь — от безделья');

console.log('\n=== 4. UI и сейв ===');
ok(/islam: \{ have: number; need: number; anyMosque: boolean \};/.test(eng), 'HUD: прогресс ислама');
ok(/faith: d\.kind === 'tribe' \? Math\.round\(this\.faith\[d\.id\] \?\? 0\) : 0,/.test(eng), 'вера народа в дипломатии');
ok(/Ислам: \{hud!\.islam\.have\}\/\{hud!\.islam\.need\}/.test(app), 'чип «Ислам: N/7» при мечети');
ok(/вера народа \(п\.31\): −100 шаманизм \.\. \+100 ислам/.test(app), 'двусторонняя шкала веры в карточке народа');
ok(/faith: this\.faith,/.test(eng) && /this\.faith = d\.faith && typeof d\.faith === 'object' \? d\.faith : \{\};/.test(eng), 'сейв + совместимость со старыми партиями');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
