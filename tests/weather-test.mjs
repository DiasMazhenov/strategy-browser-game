// Погода степи (1.0.102): виды, эффекты подключены к механикам, сейв, HUD, настройка.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const cfg = readFileSync(new URL('../src/game/config.ts', import.meta.url), 'utf8');
let n = 0, f = 0;
const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Виды погоды ===');
for (const k of ['clear', 'rain', 'fog', 'buran']) ok(new RegExp(`^\\s*${k}: \\{ name:`, 'm').test(eng), `определена погода «${k}»`);
ok(/type WeatherKind = 'clear' \| 'rain' \| 'fog' \| 'buran'/.test(eng), 'тип WeatherKind закрыт');

console.log('\n=== 2. Эффекты подключены к механикам, а не только к картинке ===');
ok(/u\.speed \* wade \*[^\n]*this\.weatherSpeedMult\(\)[^\n]*\* dt/.test(eng), 'скорость хода: moveToward учитывает погоду');
ok(/const uRange = [^\n]*weatherRangeMult\(\)/.test(eng), 'дальность юнитов режется дождём/туманом/бураном');
ok(/const tRange = [^\n]*weatherRangeMult\(\)/.test(eng), 'дальность башен и ставки — тоже');
ok(/mark\(u\.x, u\.y, sight \* wm\)/.test(eng) && /const wm = this\.weatherSightMult\(\)/.test(eng), 'обзор в тумане войны сужается');
ok(/weatherActive\('rain'\)\) m \*= 1\.2/.test(eng), 'дождь поит пашни (+20%)');
ok(/weatherActive\('buran'\) \? 1\.5 : 1\)/.test(eng), 'в буран шаруа устают быстрее');
ok(/updateWeather\(dt\);/.test(eng) && /drawWeather\(ctx\);/.test(eng), 'обновление и отрисовка подключены в цикл');

console.log('\n=== 3. Честность и совместимость ===');
ok(/\* \(u\.range > 40 \? this\.weatherRangeMult\(\) : 1\)/.test(eng), 'ближний бой погодой не штрафуется');
ok(!/u\.owner === 'player' \? this\.weatherRangeMult/.test(eng), 'погода одинакова для игрока и джунгар');
ok(/if \(this\.droughtT > 0\) return 'clear'/.test(eng), 'при засухе дождь не выпадает');
ok(/this\.weather === 'rain' && this\.droughtT > 0\) this\.setWeather\('clear'\)/.test(eng), 'событие «Засуха» прогоняет идущий дождь');
ok(/case 'jut':\s*this\.setWeather\('buran', 70\)/.test(eng), 'джут приходит с бураном');
ok(/if \(this\.weather !== 'clear'\) return 'clear'/.test(eng), 'после ненастья всегда просвет — два ненастья подряд невозможны');

console.log('\n=== 4. Сейв, HUD, настройки ===');
ok(/weather: this\.weather, weatherT: this\.weatherT/.test(eng), 'погода пишется в сейв');
ok(/includes\(d\.events\.weather\) \? d\.events\.weather : 'clear'/.test(eng), 'старый сейв без погоды грузится (по умолчанию ясно)');
ok(/weather: this\.weather !== 'clear' && this\.settings\.weather \?/.test(eng), 'HUD получает погоду только когда она есть');
ok(/hud\?\.weather && \(/.test(app) && /hud\.weather\.icon/.test(app), 'плашка погоды в HUD');
ok(/weather: boolean;/.test(cfg) && /weather: true,/.test(cfg), 'настройка weather есть и включена по умолчанию');
ok(/label="Погода степи"/.test(app), 'переключатель в настройках');
ok(/if \(!this\.settings\.weather\) \{ if \(this\.weather !== 'clear'\)/.test(eng), 'выключение настройки снимает текущее ненастье');

console.log('\n=== 5. Производительность ===');
ok(/weatherFx: \{/.test(eng) && /Math\.min\(220,/.test(eng), 'капли — отдельный экранный массив с потолком 220 (лимит 650 игровых частиц не тронут)');
ok(/setTransform\(this\.dpr, 0, 0, this\.dpr, 0, 0\);\s*if \(this\.weather === 'rain'\)/.test(eng), 'слой рисуется в экранных координатах (не зависит от зума)');

console.log(`\nИтог: ${n - f} ok, ${f} fail`);
process.exit(f ? 1 : 0);
