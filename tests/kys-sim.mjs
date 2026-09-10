// Қыс: зима и белые месяцы (п.15), 1.0.119 — сезоны, стужа, изоляция, снег.
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../src/game/engine.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
let n = 0, f = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) f++; };

console.log('\n=== 1. Календарь ===');
ok(/season\(\): 0 \| 1 \| 2 \| 3 \{ return \(\(this\.dayNum - 1\) % 4 \+ 4\) % 4/.test(eng), 'год = 4 суток, сезон из dayNum');
ok(/'Көктем — весна', 'Жаз — лето', 'Күз — осень', 'Қыс — зима'/.test(eng), 'четыре имени сезона');
ok(/isWinter\(\): boolean \{ return this\.season\(\) === 3; \}/.test(eng), 'третий индекс — зима');

console.log('\n=== 2. Зимние модификаторы ===');
ok(/if \(this\.isWinter\(\)\) m \*= this\.feltYurts \? 0\.92 : 0\.85;/.test(eng), 'фураж резан: −15%, с войлоком −8%');
ok(/if \(this\.isWinter\(\) && herdAll > 0\) this\.res\.food = Math\.max\(0, this\.res\.food - 0\.012 \* herdAll\);/.test(eng), 'стадо ест запасы');
ok(/isWinter\(\) \? 0\.94 : 1\) \* dt/.test(eng), 'зимняя дорога: скорость −6%');
ok(/\(this\.isNight\(\) \? 0\.18 : 0\.08\) \+ \(this\.isWinter\(\) \? 0\.22 : 0\)/.test(eng), 'бураны зимой чаще (+0,22)');
ok(/this\.score \+= SCORE\.kill \+ \(this\.isWinter\(\) \? Math\.round\(SCORE\.kill \* 0\.5\) : 0\);/.test(eng), 'зимний рейд: слава ×1,5 (оба пути убийств)');
ok((eng.match(/isWinter\(\) \? Math\.round\(SCORE\.kill \* 0\.5\) : 0\)/g) || []).length === 2, 'бонус в двух ветках счёта');

console.log('\n=== 3. Снег и HUD ===');
ok(/drawSnow\(\)/.test(eng) && /for \(let i = 0; i < 150; i\+\+\)/.test(eng), 'процедурный снег ≤650 партиклов');
ok(/this\.weather === 'buran' \|\| \(this\.isWinter\(\) && this\.weatherActive\('fog'\)\)\) this\.drawSnow\(\);/.test(eng), 'снег при буране/зимнем тумане');
ok(/season: \{ name: this\.seasonName\(\), winter: this\.isWinter\(\), t:/.test(eng), 'HUD получает сезон и время до смены');
ok(/Индикатор сезона|Сезон \(п\.15\)/.test(app), 'чип сезона в HUD');
ok(/Войлочные юрты готовят аул к стуже|Юрты без войлока/.test(app), 'изоляция связана с п.14');

console.log(`\nИтог: ${n - f} ok, ${f} fail`); process.exit(f ? 1 : 0);
