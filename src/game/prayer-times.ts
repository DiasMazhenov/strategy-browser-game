// Времена намаза по РЕАЛЬНОМУ времени и координатам — считаются локально,
// астрономически. Сеть не нужна: из песочницы и с открытой страницы никаких
// запросов, всё выводится из даты, широты и долготы.
//
// Метод углов — ДУМК Казахстана (Духовное управление мусульман): фаджр 18°,
// иша 17°, аср по ханафитской тени (2 длины). Это то, по чему живут мечети
// Астаны, поэтому времена совпадают с городским азаном.

export interface City { id: string; name: string; lat: number; lon: number; tz: number }

// Часовой пояс задаём числом, а не строкой IANA: в игре нет tzdata, а весь
// Казахстан с марта 2024 года живёт в едином UTC+5.
export const CITIES: City[] = [
  { id: 'astana', name: 'Астана', lat: 51.1694, lon: 71.4491, tz: 5 },
  { id: 'almaty', name: 'Алматы', lat: 43.2380, lon: 76.8829, tz: 5 },
  { id: 'shymkent', name: 'Шымкент', lat: 42.3417, lon: 69.5901, tz: 5 },
  { id: 'aktobe', name: 'Ақтөбе', lat: 50.2839, lon: 57.1670, tz: 5 },
  { id: 'atyrau', name: 'Атырау', lat: 47.0945, lon: 51.9238, tz: 5 },
  { id: 'karaganda', name: 'Қарағанды', lat: 49.8047, lon: 73.1094, tz: 5 },
  { id: 'turkistan', name: 'Түркістан', lat: 43.2973, lon: 68.2517, tz: 5 },
  { id: 'oskemen', name: 'Өскемен', lat: 49.9787, lon: 82.6014, tz: 5 },
];

export const CITY_BY_ID: Record<string, City> = Object.fromEntries(CITIES.map(c => [c.id, c]));

/** Пять намазов + восход (восход не намаз, но им заканчивается время таң). */
export interface PrayerTimes {
  fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number;
}
export type PrayerKey = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

/** Названия намазов по-казахски — как их знает игрок. */
export const PRAYER_NAMES: Record<PrayerKey, { kz: string; ru: string }> = {
  fajr: { kz: 'Таң намазы', ru: 'утренний' },
  dhuhr: { kz: 'Бесін намазы', ru: 'полуденный' },
  asr: { kz: 'Екінті намазы', ru: 'предвечерний' },
  maghrib: { kz: 'Ақшам намазы', ru: 'закатный' },
  isha: { kz: 'Құптан намазы', ru: 'ночной' },
};

export const PRAYER_ORDER: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const rad = (d: number) => d * Math.PI / 180;
const deg = (r: number) => r * 180 / Math.PI;

function julianDay(y: number, m: number, d: number): number {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

// Положение Солнца: склонение и уравнение времени (упрощённый алгоритм NOAA,
// точность порядка минуты — для азана более чем достаточно).
function sunPosition(jd: number): { decl: number; eqt: number } {
  const D = jd - 2451545.0;
  const g = rad((357.529 + 0.98560028 * D) % 360);
  const q = (280.459 + 0.98564736 * D) % 360;
  const L = rad((q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) % 360);
  const e = rad(23.439 - 0.00000036 * D);
  const decl = Math.asin(Math.sin(e) * Math.sin(L));
  let ra = deg(Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L))) / 15;
  ra = (ra + 24) % 24;
  return { decl, eqt: q / 15 - ra };
}

// Часовой угол для заданного угла погружения Солнца под горизонт.
// NaN означает, что Солнце в этот день до такого угла НЕ опускается —
// полярное лето. Для Астаны (51°N) это реально случается в июне для 18°.
function hourAngle(angle: number, lat: number, decl: number): number {
  const c = (-Math.sin(rad(angle)) - Math.sin(rad(lat)) * Math.sin(decl)) /
            (Math.cos(rad(lat)) * Math.cos(decl));
  if (c < -1 || c > 1) return NaN;
  return deg(Math.acos(c)) / 15;
}

function asrHourAngle(shadow: number, lat: number, decl: number): number {
  const c = Math.sin(Math.atan(1 / (shadow + Math.tan(Math.abs(rad(lat) - decl))))) -
            Math.sin(rad(lat)) * Math.sin(decl);
  const x = c / (Math.cos(rad(lat)) * Math.cos(decl));
  if (x < -1 || x > 1) return NaN;
  return deg(Math.acos(x)) / 15;
}

const FAJR_ANGLE = 18;    // ДУМК Казахстана
const ISHA_ANGLE = 17;
const ASR_SHADOW = 1;     // ханафитский аср — тень в 2 длины предмета (коэффициент 1 + …)

/**
 * Времена намаза в ЛОКАЛЬНЫХ часах (дробное число: 4.05 = 04:03).
 *
 * Летом на широте Астаны фаджр и иша могут не наступать вовсе. Тогда
 * применяется правило «седьмой части ночи» (Aqrab al-Layali): ночь от заката
 * до восхода делится на 7, фаджр = восход − 1/7, иша = закат + 1/7. Так делают
 * и календари ДУМК — иначе в июне намаз просто пропал бы из игры.
 */
export function prayerTimes(date: Date, city: City): PrayerTimes {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const jd = julianDay(y, m, d) - city.lon / (15 * 24);
  const { decl, eqt } = sunPosition(jd);

  const dhuhr = 12 + city.tz - city.lon / 15 - eqt;
  const sunriseHA = hourAngle(0.833, city.lat, decl);   // 0.833° — рефракция + радиус диска
  const sunrise = dhuhr - sunriseHA;
  const maghrib = dhuhr + sunriseHA;

  const asrHA = asrHourAngle(ASR_SHADOW, city.lat, decl);
  const asr = isFinite(asrHA) ? dhuhr + asrHA : dhuhr + 3;

  let fajr = dhuhr - hourAngle(FAJR_ANGLE, city.lat, decl);
  let isha = dhuhr + hourAngle(ISHA_ANGLE, city.lat, decl);

  // ── Высокие широты: угловое ограничение (AngleBased, метод Ридвана) ──
  // На широте Астаны (51°N) в июне Солнце не опускается на 18° вовсе — формула
  // даёт NaN. Одной проверки на NaN мало: в переходные недели угол достигается
  // уже под утро, и без ограничения иша скакала НАЗАД по календарю
  // (21:37 в июне против 23:53 в июле).
  //
  // Ограничиваем долей ночи, пропорциональной углу: portion = angle/60 · ночь.
  // Правило «седьмой части» (1/7) тоже убирает скачок, но оно жёстче и срезало
  // ВЕРНЫЙ расчёт в обычные дни — таң 9 сентября уезжал с 03:40 на 04:06.
  // Угловое ограничение в такие дни не срабатывает вообще.
  const night = 24 - (maghrib - sunrise);
  const fajrLimit = sunrise - (FAJR_ANGLE / 60) * night;
  const ishaLimit = maghrib + (ISHA_ANGLE / 60) * night;
  if (!isFinite(fajr) || fajr < fajrLimit) fajr = fajrLimit;
  if (!isFinite(isha) || isha > ishaLimit) isha = ishaLimit;

  return { fajr, sunrise, dhuhr, asr, maghrib, isha };
}

/** Локальное время как дробные часы: 4:03 → 4.05 */
export function nowHours(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

/** «04:03» из дробных часов. */
export function fmtHM(h: number): string {
  if (!isFinite(h)) return '—';
  h = ((h % 24) + 24) % 24;
  let H = Math.floor(h), M = Math.round((h - H) * 60);
  if (M === 60) { M = 0; H = (H + 1) % 24; }
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
}

/**
 * Какой намаз наступил не более `windowMin` минут назад (или NaN, если ни один).
 * Возвращает и «свежесть» — сколько минут прошло, чтобы игра могла отличить
 * азан «прямо сейчас» от догоняющего при входе в партию.
 */
export function currentPrayer(date: Date, city: City, windowMin = 60):
  { key: PrayerKey; agoMin: number } | null {
  const t = prayerTimes(date, city);
  const now = nowHours(date);
  let best: { key: PrayerKey; agoMin: number } | null = null;
  for (const key of PRAYER_ORDER) {
    const at = t[key];
    if (!isFinite(at)) continue;
    let ago = (now - at) * 60;
    if (ago < -1) ago += 24 * 60;              // намаз был вчера поздно вечером
    if (ago < 0 || ago > windowMin) continue;
    if (!best || ago < best.agoMin) best = { key, agoMin: ago };
  }
  return best;
}

/** Ближайший СЛЕДУЮЩИЙ намаз — для подсказки в интерфейсе. */
export function nextPrayer(date: Date, city: City): { key: PrayerKey; at: number; inMin: number } {
  const t = prayerTimes(date, city);
  const now = nowHours(date);
  let best: { key: PrayerKey; at: number; inMin: number } | null = null;
  for (const key of PRAYER_ORDER) {
    const at = t[key];
    if (!isFinite(at)) continue;
    let inMin = (at - now) * 60;
    if (inMin < 0) inMin += 24 * 60;
    if (!best || inMin < best.inMin) best = { key, at, inMin };
  }
  // на всякий случай (все NaN быть не может — fajr/isha чинятся правилом 1/7)
  return best ?? { key: 'fajr', at: t.fajr, inMin: 0 };
}
