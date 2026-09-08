// Намаз и азан (1.0.070): расписание, явка, благодать, конфликты с другими механиками.
// Константы и формулы ВЫТАСКИВАЕМ из engine.ts, чтобы тест не разъехался с кодом.
import fs from 'node:fs';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('PASS', n)) : (fail++, console.log('FAIL', n, x)); };

const eng = fs.readFileSync('src/game/engine.ts', 'utf8');
const audio = fs.readFileSync('src/game/audio.ts', 'utf8');
// тело метода по балансу фигурных скобок (регулярки на вложенных {} врут)
const body = (src, sig) => {
  const at = src.indexOf(sig);
  if (at < 0) return '';
  let i = src.indexOf('{', at), d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}' && --d === 0) return src.slice(i, j + 1);
  }
  return '';
};
const num = (re, what) => { const m = eng.match(re); if (!m) { fail++; console.log('FAIL: не нашёл', what); return NaN; } return parseFloat(m[1]); };
// длительности заданы долями суток (DAY_LEN_SEC * k) — считаем произведение
const frac = (name) => {
  const m = eng.match(new RegExp('readonly ' + name + ' = DAY_LEN_SEC \\* ([\\d.]+)'));
  if (!m) { fail++; console.log('FAIL: не нашёл', name); return NaN; }
  return DAY_LEN * parseFloat(m[1]);
};

const DAY_LEN = num(/DAY_LEN_SEC = ([\d.]+)/, 'DAY_LEN_SEC');
const AZAN_LEN = num(/readonly AZAN_LEN = ([\d.]+)/, 'AZAN_LEN');
const PRAYER_LEN = frac('PRAYER_LEN');
const BEREKE_LEN = frac('BEREKE_LEN');

ok(`сутки длятся 30 минут (${DAY_LEN} с)`, DAY_LEN === 1800, DAY_LEN);
ok(`намаз (${PRAYER_LEN.toFixed(0)}с) длиннее записи азана (${AZAN_LEN}с)`, PRAYER_LEN > AZAN_LEN,
  PRAYER_LEN.toFixed(0));

// ── 1. Звук: файл на месте и длится не дольше объявленного AZAN_LEN ──────────
const F = 'public/voices/azan.mp3';
ok('azan.mp3 лежит в public/voices', fs.existsSync(F));
if (fs.existsSync(F)) {
  // считаем длительность по MPEG-фреймам (без сторонних библиотек)
  const b = fs.readFileSync(F);
  const BR = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const SR = [44100, 48000, 32000];
  let i = 0, frames = 0, dur = 0;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {           // пропускаем ID3
    i = 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f));
  }
  while (i < b.length - 4) {
    if (b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0) {
      const br = BR[(b[i + 2] >> 4) & 0xf], sr = SR[(b[i + 2] >> 2) & 3];
      if (br && sr) {
        const pad = (b[i + 2] >> 1) & 1;
        const len = Math.floor(144000 * br / sr) + pad;
        if (len > 4) { frames++; dur += 1152 / sr; i += len; continue; }
      }
    }
    i++;
  }
  ok(`azan.mp3 распознан как MPEG (${frames} фреймов, ${dur.toFixed(1)} с)`, frames > 100, frames);
  ok(`AZAN_LEN=${AZAN_LEN}с покрывает запись (${dur.toFixed(1)}с)`, AZAN_LEN >= dur - 1, dur.toFixed(1));
}

// ── 2. Аудио-API: одиночный экземпляр, остановка вместе с прочими репликами ──
ok('audio.ts: есть метод azan()', /\bazan\s*\(/.test(audio));
ok('audio.ts: есть azanPlaying()', /azanPlaying\s*\(/.test(audio));
ok('audio.ts: есть stopAzan()', /stopAzan\s*\(/.test(audio));
// именно ОБЪЯВЛЕНИЕ метода, а не первый вызов this.stopVoice()
ok('audio.ts: stopVoice() глушит и азан', /stopAzan\s*\(/.test(body(audio, '\n  stopVoice()')));
const azanBody = body(audio, 'azan(): boolean');
ok('azan(): второй вызов поверх играющего запрещён', /if \(this\.azanEl\) return false/.test(azanBody));
ok('azan(): молчит при выключенном звуке', /this\.muted \|\| !this\.voiceOn/.test(azanBody));
ok('azan(): слышен поверх шума боя', /Math\.max\(0\.35/.test(azanBody));
ok('azan(): блокировка автоплея не роняет игру', /catch\(done\)/.test(azanBody));
ok('движок зовёт sound.azan()', /this\.sound\.azan\s*\(/.test(eng));

// ── 3. Расписание: три намаза в сутки, окна не пересекаются ─────────────────
const phM = eng.match(/azanPhase = \[([^\]]+)\]/);
ok('расписание азана задано', !!phM);
if (phM) {
  const ph = phM[1].split(',').map(x => parseFloat(x));
  ok(`три намаза в сутки (${ph.join(', ')})`, ph.length === 3, ph.length);
  ok('все фазы в пределах суток 0..1', ph.every(p => p >= 0 && p < 1));
  // окно задано в секундах реального времени: win = <сек> / DAY_LEN
  const winM = eng.match(/const win = ([\d.]+) \/ this\.DAY_LEN/);
  const winSecRaw = winM ? parseFloat(winM[1]) : NaN;
  const win = winSecRaw / DAY_LEN;
  ok('окно срабатывания задано в секундах', !!winM, winSecRaw);
  ok(`окно ${winSecRaw}с не растягивается с сутками`, winSecRaw >= 2 && winSecRaw <= 10, winSecRaw);
  // окна не должны накладываться друг на друга
  let overlap = false;
  for (let a = 0; a < ph.length; a++) for (let c = a + 1; c < ph.length; c++) {
    let d = Math.abs(ph[a] - ph[c]); d = Math.min(d, 1 - d);
    if (d <= win * 2) overlap = true;
  }
  ok('намазы не накладываются друг на друга', !overlap);
  // Фаза: 0 = полдень, 0.5 = полночь. Азан не должен звучать в глухую ночь —
  // «закатный» ақшам когда-то стоял на 0.40, где темнота уже 0.90.
  const darkAt = p => 0.5 * (1 - Math.cos(p * Math.PI * 2));
  const phName = p => (p < 0.125 || p >= 0.875) ? 'Күндіз' : p < 0.375 ? 'Кеш' : p < 0.625 ? 'Түн' : 'Таң';
  ph.forEach((p, i) => {
    const nm = ['таң', 'бесін', 'ақшам'][i] ?? `намаз ${i}`;
    ok(`${nm} (фаза ${p}) не приходится на глухую ночь — ${phName(p)}, темнота ${darkAt(p).toFixed(2)}`,
      darkAt(p) <= 0.62, darkAt(p).toFixed(2));
  });
  ok('бесін — полуденный намаз', Math.min(ph[1], 1 - ph[1]) < 0.1, ph[1]);
  ok('ақшам — закатный, таң — рассветный (по разные стороны полуночи)',
    ph[2] > 0 && ph[2] < 0.5 && ph[0] > 0.5 && ph[0] < 1, `${ph[2]} / ${ph[0]}`);
  // окно должно быть шире одного тика на максимальной скорости игры
  const winSec = win * 2 * DAY_LEN;
  // на 2x ускорении кадр съедает вдвое больше игровых секунд — окно обязано пережить это
  ok(`окно ${winSec.toFixed(1)}с шире игрового тика даже на 2x`, winSec > 1.5, winSec.toFixed(2));
  // намаз обязан успевать закончиться до следующего азана
  const gaps = ph.map((p, k) => { const q = ph[(k + 1) % ph.length]; let d = q - p; if (d < 0) d += 1; return d * DAY_LEN; });
  ok(`между намазами (${gaps.map(g => g.toFixed(0)).join('/')}с) хватает на PRAYER_LEN=${PRAYER_LEN}с`,
    Math.min(...gaps) > PRAYER_LEN, Math.min(...gaps).toFixed(0));
}
ok('со сменой суток расписание сбрасывается', /azanDone = \[\]/.test(eng));
ok('повторный азан в те же сутки не звучит', /azanDone\.includes\(/.test(eng));

// ── 4. Кто идёт на намаз ────────────────────────────────────────────────────
const canPray = body(eng, 'canPray(u: Unit)');
ok('намаз только для игрока', /u\.owner !== 'player'/.test(canPray));
ok('идут мирные: шаруа, көпес, имам', /'villager'[\s\S]{0,80}'trader'[\s\S]{0,40}'monk'/.test(canPray));
ok('пастух стадо не бросает', /u\.herder/.test(canPray));
ok('отбивающийся от врага не молится', /targetU >= 0/.test(canPray));
ok('при враге у ставки намаз пропускается', /enemyNearHome\(\)/.test(eng));

// ── 5. Благодать ────────────────────────────────────────────────────────────
const mulM = eng.match(/berekeMult\(\)[^{]*\{[^}]*1 \+ ([\d.]+) \* this\.berekePower/);
ok('berekeMult() зависит от явки', !!mulM);
if (mulM) {
  const k = parseFloat(mulM[1]);
  ok(`полная явка даёт +${(k * 100).toFixed(0)}% добычи`, k > 0 && k <= 0.5, k);
  const clampM = eng.match(/clamp\(arrived \/ Math\.max\(1, total \* ([\d.]+)\), ([\d.]+), ([\d.]+)\)/);
  ok('сила благодати ограничена сверху и снизу', !!clampM);
  if (clampM) {
    const [, need, lo, hi] = clampM.map(parseFloat);
    ok(`минимум +${(k * lo * 100).toFixed(1)}%, максимум +${(k * hi * 100).toFixed(0)}%`, lo > 0 && hi === 1, `${lo}..${hi}`);
    ok(`полный бонус при явке ${(need * 100).toFixed(0)}% общины`, need > 0 && need < 1, need);
  }
}
ok('благодать тает со временем', /berekeT = Math\.max\(0, this\.berekeT - dt\)/.test(eng));
ok('на нуле благодати сила обнуляется', /berekeT === 0\) this\.berekePower = 0/.test(eng));
ok('благодать входит в множитель добычи', /m \*= this\.berekeMult\(\)/.test(eng));
ok(`BEREKE_LEN=${BEREKE_LEN}с дольше самого намаза`, BEREKE_LEN > PRAYER_LEN);

// ── 6. Конфликты с другими механиками (грабли 1.0.068) ──────────────────────
const call = body(eng, 'callToPrayer(mosque: Bld');
ok('на намаз срывают с отдыха', /u\.resting = false/.test(call));
ok('доярка освобождает загон, уходя на намаз', /milkWid = undefined/.test(call));
ok('кнопка «Простой» не срывает с намаза', /u\.praying\) continue;\s*\/\/ с намаза/.test(eng));
ok('приказ игрока отменяет намаз', /praying = false/.test(eng));
ok('после намаза возвращаются к своему ресурсу', /prayBack/.test(eng));
ok('намаз приоритетнее отдыха', eng.indexOf('updatePraying(u, dt)') < eng.indexOf('updateResting(u, dt)')
  || /updatePraying\(u, dt\)\) return;[\s\S]{0,200}resting/.test(eng));

// ── 7. Сохранение и HUD ─────────────────────────────────────────────────────
ok('состояние намаза пишется в сейв', /pray: \{ azanDone/.test(eng));
ok('состояние намаза читается из сейва', /d\.pray\)/.test(eng));
ok('HUD получает данные о намазе', /pray: \{/.test(eng) && /bereke:/.test(eng));
const app = fs.readFileSync('src/App.tsx', 'utf8');
ok('в HUD есть плашка намаза', /Намаз/.test(app));
ok('в HUD есть плашка благодати', /Береке/.test(app));

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
