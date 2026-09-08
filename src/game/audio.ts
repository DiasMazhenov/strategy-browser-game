// Естественный синтез звука (WebAudio) + голосовые фразы юнитов из mp3-записей.
// Голос: только готовые записи из public/voices (имена файлов = сами фразы).
// Если файла фразы нет — фраза просто не проигрывается (без синтеза речи).
type OscType = OscillatorType;

// реальные файлы в voices/ (названы с заглавных букв — сверяем регистронезависимо)
const CLIP_FILES = [
  'В седле.mp3', 'Да.mp3', 'За короля.mp3', 'За корону.mp3', 'Клянемся честью.mp3',
  'Конь готов.mp3', 'Слушаю.mp3', 'Чего изволите.mp3', 'Я готов.mp3',
  'беремся за дело.mp3', 'в атаку.mp3', 'добываю.mp3', 'за работу.mp3',
  'к бою.mp3', 'отобьемся.mp3', 'сделаю в лучшем виде.mp3', 'сейчас сделаю.mp3',
];
const normKey = (s: string) => s.normalize('NFC').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s-]/gu, '').trim();
// карта «нормализованная фраза (строчная) → URL записи с РЕАЛЬНЫМ именем файла»
// (файлы названы с заглавных букв, а сервер регистрозависим — URL обязан совпадать с именем на диске)
const CLIP_URLS: Record<string, string> = {};
for (const f of CLIP_FILES) CLIP_URLS[normKey(f.replace(/\.mp3$/i, ''))] = `voices/${encodeURIComponent(f)}`;

// ── казахские голоса расы игрока (public/voices/kaz-voises/). Канонический ключ → варианты файлов ──
const KZ_CLIPS: Record<string, string[]> = {
  'готов':    ['kaz-voises/Я готов - каз.mp3'],
  'вперед':   ['kaz-voises/Вперед - каз.mp3', 'kaz-voises/Вперед2 - каз.mp3'],
  'в атаку':  ['kaz-voises/В атаку - каз.mp3'],
  'к бою':    ['kaz-voises/К бою - каз.mp3'],
  'за короля':['kaz-voises/За короля - каз.mp3', 'kaz-voises/За короля2 - каз.mp3'],
  'честь':    ['kaz-voises/Клянёмся честью - каз.mp3', 'kaz-voises/Клянёмся честью2 - каз.mp3'],
  // ── казахские голоса РАБОЧИХ (подпапка worker-kaz) ──
  'слушаю':   ['kaz-voises/worker-kaz/слушаю - kaz.mp3', 'kaz-voises/worker-kaz/слушаю2 - kaz.mp3'],
  'чего изволите': ['kaz-voises/worker-kaz/Чего изволите - kaz.mp3'],
  'за работу':     ['kaz-voises/worker-kaz/За работу - kaz.mp3'],
  'добываю':       ['kaz-voises/worker-kaz/Добываю - kaz.mp3'],
  'беремся за дело': ['kaz-voises/worker-kaz/Берёмся за дело - kaz.mp3'],
  'сделаю в лучшем виде': ['kaz-voises/worker-kaz/Сделаю в лучшем виде - kaz.mp3'],
  'сейчас сделаю': ['kaz-voises/worker-kaz/Сейчас сделаю - kaz.mp3'],
  'отобьемся':     ['kaz-voises/worker-kaz/Отобьёмся - kaz.mp3'],
};
const KZ_CLIP_URLS: Record<string, string[]> = {};
for (const [key, paths] of Object.entries(KZ_CLIPS)) {
  KZ_CLIP_URLS[key] = paths.map(p => {
    const slash = p.lastIndexOf('/');
    return `voices/${p.slice(0, slash + 1)}${encodeURIComponent(p.slice(slash + 1))}`;
  });
}
// казахские реплики по юнитам/событиям (ключи из KZ_CLIPS); пустой список → откат на русскую запись
const KZ_PHRASES: Record<string, { select: string[]; move: string[]; attack: string[]; gather: string[] }> = {
  villager:  { select: ['слушаю', 'чего изволите'], move: ['сейчас сделаю', 'сделаю в лучшем виде'], attack: ['отобьемся'], gather: ['за работу', 'добываю', 'беремся за дело'] },
  swordsman: { select: ['готов', 'к бою'], move: ['вперед', 'к бою'], attack: ['в атаку', 'за короля'], gather: [] },
  spearman:  { select: ['к бою', 'готов'], move: ['вперед', 'к бою'], attack: ['в атаку', 'за короля'], gather: [] },
  archer:    { select: ['готов', 'к бою'], move: ['вперед'], attack: ['в атаку', 'за короля'], gather: [] },
  knight:    { select: ['честь', 'готов', 'к бою'], move: ['вперед'], attack: ['за короля', 'в атаку', 'честь'], gather: [] },
  cavalry:   { select: ['готов', 'к бою'], move: ['вперед'], attack: ['в атаку', 'за короля'], gather: [] },
  catapult:  { select: ['готов', 'к бою'], move: ['вперед'], attack: ['в атаку'], gather: [] },
  monk:      { select: ['готов'], move: [], attack: [], gather: [] },
  trader:    { select: ['слушаю'], move: ['сейчас сделаю'], attack: [], gather: [] },
};

// ── голосовые реплики юнитов. Используются ТОЛЬКО фразы, для которых есть
//    запись в voices/; близкие по смыслу записи переиспользуются юнитами. ──
//    select — выделение/отклик; move — приказ идти/делать; attack — атака; gather — работа
const PHRASES: Record<string, { select: string[]; move: string[]; attack: string[]; gather: string[] }> = {
  // крестьянин — рабочие реплики
  villager: {
    select: ['Да', 'Слушаю', 'Чего изволите'],
    move: ['Сейчас сделаю', 'Сделаю в лучшем виде'],
    attack: ['Отобьемся'],
    gather: ['За работу', 'Добываю', 'Беремся за дело', 'Сделаю в лучшем виде'],
  },
  // пехота (ополченец/мечник)
  swordsman: {
    select: ['Я готов', 'К бою'],
    move: ['К бою', 'Я готов'],
    attack: ['В атаку', 'За короля'],
    gather: [],
  },
  // копейщик
  spearman: {
    select: ['К бою', 'Я готов'],
    move: ['К бою'],
    attack: ['Отобьемся', 'В атаку'],
    gather: [],
  },
  // лучник
  archer: {
    select: ['Я готов', 'К бою'],
    move: ['Я готов'],
    attack: ['В атаку', 'За короля'],
    gather: [],
  },
  // рыцарь — записи про коня/честь/корону
  knight: {
    select: ['Конь готов', 'В седле', 'Клянемся честью'],
    move: ['В седле', 'Конь готов'],
    attack: ['За корону', 'В атаку'],
    gather: [],
  },
  // конница — переиспользует «конные» реплики рыцаря
  cavalry: {
    select: ['Конь готов', 'В седле'],
    move: ['В седле'],
    attack: ['За корону', 'В атаку'],
    gather: [],
  },
  // катапульта/орудие — общая готовность и атака
  catapult: {
    select: ['Я готов', 'К бою'],
    move: ['Я готов'],
    attack: ['В атаку'],
    gather: [],
  },
  // монах — спокойные отклики
  monk: {
    select: ['Слушаю', 'Да'],
    move: ['Сейчас сделаю'],
    attack: ['Отобьемся'],
    gather: ['За работу', 'Сделаю в лучшем виде'],
  },
};

export class SoundBank {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted = false;
  voiceOn = true;
  voiceVolume = 0.3; // громкость фраз 0..1
  lastPlay: Record<string, number> = {};
  private missingClips = new Set<string>();   // записи, которых нет на диске
  private activeClips: HTMLAudioElement[] = []; // проигрываемые реплики

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      // мягкий мастер + компрессор — звук не «пищит», а звучит цельно
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 3.5;
      comp.attack.value = 0.004; comp.release.value = 0.18;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.28;
      this.master.connect(comp); comp.connect(this.ctx.destination);
    } catch { /* noop */ }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) this.stopVoice();
  }
  setVoice(on: boolean) {
    this.voiceOn = on;
    if (!on) this.stopVoice();
  }
  setVoiceVolume(v: number) { this.voiceVolume = Math.max(0, Math.min(1, v)); }
  stopVoice() {
    for (const a of this.activeClips) { try { a.pause(); } catch { /* noop */ } }
    this.activeClips.length = 0;
    this.stopAzan();     // азан длинный — при выключении звука обязан замолчать сразу
  }

  private gate(key: string, ms: number) {
    const t = performance.now();
    if (this.lastPlay[key] && t - this.lastPlay[key] < ms) return false;
    this.lastPlay[key] = t;
    return true;
  }
  // ── ПРОСТРАНСТВЕННЫЙ ЗВУК ─────────────────────────────────────────────────
  // Камера = «уши» игрока. Чем дальше событие от центра экрана, тем тише.
  // Позицию обновляет движок каждый кадр (setListener).
  private lx = 0; private ly = 0; private lzoom = 1;
  /** Радиус полной слышимости в МИРОВЫХ единицах (внутри — без ослабления). */
  private readonly NEAR = 260;
  /** Дальше этого не слышно вовсе — иначе бой на другом конце карты шумел бы. */
  private readonly FAR = 1750;

  setListener(x: number, y: number, zoom = 1) { this.lx = x; this.ly = y; this.lzoom = zoom; }

  /**
   * Множитель громкости для события в мировой точке (1 — рядом, 0 — не слышно).
   * Спад линейный по расстоянию, а не 1/d: обратный квадрат на игровых
   * масштабах глушит звук почти сразу за краем экрана и звучит неестественно.
   *
   * При отдалении камеры (zoom < 1) слышно дальше: игрок «поднялся выше»,
   * в поле зрения больше мира — логично слышать всю видимую область.
   */
  spatial(x: number, y: number): number {
    const near = this.NEAR / Math.max(0.35, this.lzoom);
    const far = this.FAR / Math.max(0.35, this.lzoom);
    const d = Math.hypot(x - this.lx, y - this.ly);
    if (d <= near) return 1;
    if (d >= far) return 0;
    const k = 1 - (d - near) / (far - near);
    return k * k;      // квадрат кривой: ближняя зона громкая, хвост мягкий
  }

  /** Панорама -1..1 по горизонтали экрана — звук идёт с той стороны, где событие. */
  private pan(x: number, y: number): number {
    // мир → изо-экран: та же проекция, что в iso.ts (x - y)
    const ix = (x - y) - (this.lx - this.ly);
    return Math.max(-1, Math.min(1, ix / (900 / Math.max(0.35, this.lzoom))));
  }

  // лёгкий случайный разброс высоты для «живости»
  private jitter(n: number, cents = 0.02) { return n * (1 + (Math.random() * 2 - 1) * cents); }

  // мягкий тон с быстрой атакой и (опционально) второй гармоникой для тела
  // Куда подключать источник: при заданной позиции — через панораму,
  // иначе прямо в мастер (звуки интерфейса не должны «уезжать» в сторону).
  private sink(at?: { x: number; y: number }): AudioNode {
    if (!at || !this.ctx || !this.master) return this.master!;
    try {
      const p = this.ctx.createStereoPanner();
      p.pan.value = this.pan(at.x, at.y);
      p.connect(this.master);
      return p;
    } catch { return this.master; }   // StereoPanner есть не везде
  }

  private tone(freq: number, dur: number, type: OscType = 'sine', vol = 0.4, slide = 0, delay = 0, harm = 0, at?: { x: number; y: number }) {
    if (this.muted || !this.ctx || !this.master) return;
    // затухание по расстоянию: далёкое событие не должно бить в уши
    if (at) { vol *= this.spatial(at.x, at.y); if (vol < 0.004) return; }
    const t0 = this.ctx.currentTime + delay;
    const out = this.sink(at);
    const mk = (f: number, v: number, detune: number) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = type; o.frequency.value = f; o.detune.value = detune;
      if (slide !== 0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(v, t0 + Math.min(0.012, dur * 0.25)); // мягкая атака
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
      o.connect(g); g.connect(out);
      o.start(t0); o.stop(t0 + dur + 0.03);
    };
    mk(this.jitter(freq), vol, 0);
    if (harm > 0) mk(freq * 2, vol * harm, 4); // октава сверху — «воздух»
  }

  // фильтрованный шум с мягкой атакой (удары, выдохи, свист)
  private noise(dur: number, vol = 0.35, type: BiquadFilterType = 'lowpass', freq = 1200, delay = 0, q = 0.8, at?: { x: number; y: number }) {
    if (this.muted || !this.ctx || !this.master) return;
    if (at) { vol *= this.spatial(at.x, at.y); if (vol < 0.004) return; }
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.sink(at));
    src.start(t0);
  }

  // внутреннее проигрывание записи; на 404 пробуем NFD-вариант имени (macOS-загрузки)
  private playUrl(url: string, at?: { x: number; y: number }) {
    if (this.activeClips.length >= 3) return;
    // Записи (голоса юнитов) идут через <audio>: панорамы у него нет, но
    // громкость по расстоянию работает — далёкий шаруа звучит тише.
    // Совсем далёкие реплики не проигрываем вовсе: они бы съедали лимит
    // одновременных клипов, заглушая близкие.
    const att = at ? this.spatial(at.x, at.y) : 1;
    if (att < 0.06) return;
    let a: HTMLAudioElement;
    const done = () => { const i = this.activeClips.indexOf(a); if (i >= 0) this.activeClips.splice(i, 1); };
    try { a = new Audio(url); } catch { return; }
    a.volume = this.voiceVolume * att;
    this.activeClips.push(a);
    a.addEventListener('ended', done);
    a.addEventListener('error', () => {
      done();
      // NFD-фолбэк (macOS/веб-загрузки дают имя в NFD: «ё» = «е» + ◌̈).
      // Слеши пути НЕ кодируем (иначе подпапка kaz-voises/ превращается в %2F).
      try {
        const rel = decodeURIComponent(url.slice('voices/'.length));
        const nfd = rel.normalize('NFD');
        if (nfd !== rel && !this.missingClips.has(url)) {
          const nfdUrl = 'voices/' + nfd.split('/').map(seg => encodeURIComponent(seg)).join('/');
          this.playUrl(nfdUrl);
          return;
        }
      } catch { /* noop */ }
      this.missingClips.add(url); // реально нет/битый — больше не дёргаем
    }, { once: true });
    // отказ автозапуска/перебой — временно, НЕ помечаем как отсутствующий
    a.play().catch(done);
  }

  // проиграть запись конкретной фразы (для разовых сюжетных реплик)
  say(phrase: string) {
    if (this.muted || !this.voiceOn) return;
    const url = CLIP_URLS[normKey(phrase)];
    if (!url || this.missingClips.has(url)) return;
    this.playUrl(url);
  }

  // проиграть КОНКРЕТНУЮ фразу по ключу: сперва казахская запись расы игрока,
  // затем откат на русскую. Используется для реплик «юнит вышел из здания».
  playPhrase(phrase: string) {
    if (this.muted || !this.voiceOn) return;
    const k = normKey(phrase);
    const kz = KZ_CLIP_URLS[k];
    let url: string | null = null;
    if (kz && kz.length) {
      const u = kz[(Math.random() * kz.length) | 0];
      if (!this.missingClips.has(u)) url = u;
    }
    if (!url) { const ru = CLIP_URLS[k]; url = ru && !this.missingClips.has(ru) ? ru : null; }
    if (url) this.playUrl(url);
  }

  // ── голос: проиграть запись фразы ──
  // event: select|move|attack|gather. Игрок — казахская раса: сперва казахские записи,
  // для команд без них (часть рабочих реплик) — откат на русскую озвучку.
  voice(unit: string, event: 'select' | 'move' | 'attack' | 'gather', at?: { x: number; y: number }) {
    if (this.muted || !this.voiceOn) return;
    // выделение — отклик всегда; приказы/атака — реже, чтобы не трещало
    const prob = event === 'select' ? 1 : event === 'attack' ? 0.5 : 0.7;
    if (Math.random() > prob) return;
    if (!this.gate(`voice-${event}`, event === 'select' ? 150 : 260)) return;

    const pickUrl = (phrase: string): string | null => {
      const k = normKey(phrase);
      const kz = KZ_CLIP_URLS[k];
      if (kz && kz.length) {
        const u = kz[(Math.random() * kz.length) | 0];
        if (!this.missingClips.has(u)) return u;
      }
      const ru = CLIP_URLS[k];
      return ru && !this.missingClips.has(ru) ? ru : null;
    };

    const kzSet = KZ_PHRASES[unit];
    const kzList = kzSet ? kzSet[event] : [];
    if (kzList && kzList.length) {
      const url = pickUrl(kzList[(Math.random() * kzList.length) | 0]);
      if (url) { this.playUrl(url, at); return; }
    }
    // казахской реплики нет — русский набор
    const set = PHRASES[unit] || PHRASES.swordsman;
    const list = set[event];
    if (!list || !list.length) return;
    const url = pickUrl(list[(Math.random() * list.length) | 0]);
    if (url) this.playUrl(url, at);
  }

  // ── игровые звуки (мягче и естественнее) ──
  select() { this.ensure(); if (!this.gate('sel', 60)) return; this.tone(620, 0.07, 'triangle', 0.1, 80, 0, 0.25); }
  ack(unit = 'soldier') {
    this.ensure(); if (!this.gate(`ack-${unit}`, 130)) return;
    const base = unit === 'villager' ? 500 : unit === 'monk' ? 370 : 450;
    this.tone(base, 0.08, 'triangle', 0.14, 70, 0, 0.2);
    this.tone(base * 1.25, 0.1, 'sine', 0.1, 50, 0.05, 0.15);
  }
  research() { this.ensure(); if (!this.gate('res', 400)) return; [392, 523, 659, 880].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.16, 0, i * 0.09, 0.3)); }
  move() { this.ensure(); if (!this.gate('mov', 90)) return; this.tone(400, 0.09, 'sine', 0.12, 150, 0, 0.2); this.noise(0.05, 0.05, 'lowpass', 900); }
  error() { this.ensure(); if (!this.gate('err', 120)) return; this.tone(170, 0.18, 'sine', 0.2, -50); this.noise(0.12, 0.12, 'lowpass', 300); }
  // топор: глухой «тук» по дереву
  chop(at?: { x: number; y: number }) { this.ensure(); if (!this.gate('chop', 110)) return; this.noise(0.06, 0.3, 'lowpass', 500, 0, 0.8, at); this.tone(150, 0.08, 'sine', 0.28, -40, 0, 0, at); }
  // кирка по камню: короткий «клик» с металлическим верхом
  mine(at?: { x: number; y: number }) { this.ensure(); if (!this.gate('mine', 140)) return; this.noise(0.05, 0.22, 'bandpass', 2600, 0, 2, at); this.tone(900, 0.06, 'triangle', 0.12, -300, 0, 0, at); }
  gatherFood() { this.ensure(); if (!this.gate('food', 160)) return; this.tone(500, 0.1, 'sine', 0.14, 120, 0, 0.2); }
  // монеты: два ясных колокольчика
  coin() { this.ensure(); if (!this.gate('coin', 120)) return; this.tone(1320, 0.12, 'sine', 0.14, 0, 0, 0.15); this.tone(1760, 0.18, 'sine', 0.12, 0, 0.06, 0.1); }
  train() { this.ensure(); if (!this.gate('train', 80)) return; this.tone(280, 0.14, 'triangle', 0.2, 180, 0, 0.25); this.tone(420, 0.16, 'sine', 0.14, 120, 0.1, 0.2); }
  // стройка: молоток — деревянный «ток»
  build() { this.ensure(); if (!this.gate('build', 150)) return; this.noise(0.05, 0.32, 'lowpass', 700); this.tone(120, 0.07, 'sine', 0.3, -30); }
  place() { this.ensure(); if (!this.gate('place', 80)) return; this.tone(240, 0.1, 'triangle', 0.18, 60, 0, 0.2); this.noise(0.08, 0.15, 'lowpass', 600); }
  // клинки: лязг металла (bandpass-шум) + короткий «звон»
  // Боевые звуки позиционные: `at` — мировая точка события. Без неё звук
  // играет «в центре», как раньше (интерфейсные вызовы).
  sword(at?: { x: number; y: number }) {
    this.ensure(); if (!this.gate('sword', 90)) return;
    this.noise(0.09, 0.28, 'bandpass', 3600, 0, 1.5, at);
    this.tone(1400 + Math.random() * 500, 0.07, 'triangle', 0.08, -500, 0, 0, at);
  }
  // лук: «твань» струны + свист стрелы
  arrow(at?: { x: number; y: number }) { this.ensure(); if (!this.gate('arrow', 110)) return; this.tone(340, 0.12, 'triangle', 0.16, -180, 0, 0, at); this.noise(0.16, 0.12, 'bandpass', 2400, 0, 1, at); }
  // попадание: мягкий удар
  hit(at?: { x: number; y: number }) { this.ensure(); if (!this.gate('hit', 70)) return; this.noise(0.07, 0.26, 'lowpass', 900, 0, 0.8, at); this.tone(200, 0.06, 'sine', 0.18, -60, 0, 0, at); }

  // ── столкновение воинов: проигрывание батальной записи с РАЗНЫХ мест ──
  //    трек длинный — каждая стычка стартует со случайной секунды (5..40с),
  //    играет короткий плотный фрагмент, одновременно звучит не больше одного.
  private battle: HTMLAudioElement | null = null;
  private readonly BATTLE_URL = 'voices/battle-sword-fight.mp3';
  battleClash(at?: { x: number; y: number }) {
    this.ensure();
    if (this.muted) return;
    if (!this.gate('battle', 900)) return; // не накладываем кашу: ~один фрагмент в ~0.9с
    const att = at ? this.spatial(at.x, at.y) : 1;
    if (att < 0.06) return;                // сеча на другом конце карты не слышна
    let a: HTMLAudioElement;
    try { a = new Audio(this.BATTLE_URL); } catch { return; }
    a.volume = 0.42 * att;
    a.preload = 'auto';
    // старт со случайной секунды (зависит от фактической длительности трека)
    const startAt = () => {
      const dur = isFinite(a.duration) ? a.duration : 45;
      const maxStart = Math.max(6, dur - 6);
      a.currentTime = Math.min(maxStart, 5 + Math.random() * Math.min(35, maxStart - 5));
      a.play().catch(() => { /* автоплей заблокирован — пропускаем */ });
    };
    if (a.readyState >= 1) startAt(); else a.addEventListener('loadedmetadata', startAt, { once: true });
    // играем плотный фрагмент 2.2..4.0с, затем гасим
    const clipLen = 2200 + Math.random() * 1800;
    const stop = () => { try { a.pause(); } catch { /* noop */ } if (this.battle === a) this.battle = null; };
    if (this.battle) { try { this.battle.pause(); } catch { /* noop */ } }
    this.battle = a;
    setTimeout(stop, clipLen);
    a.addEventListener('ended', stop, { once: true });
    a.addEventListener('error', stop, { once: true });
  }
  // ── АЗАН: призыв на намаз с минарета мечети ──
  // Запись длинная (~47с) и звучит целиком, поэтому играем строго один экземпляр:
  // повторный вызов во время звучания игнорируется, иначе азаны наложатся друг на друга.
  private azanEl: HTMLAudioElement | null = null;
  private readonly AZAN_URL = 'voices/azan.mp3';
  azanPlaying(): boolean { return !!this.azanEl; }
  azan(at?: { x: number; y: number }): boolean {
    this.ensure();
    if (this.muted || !this.voiceOn) return false;
    if (this.azanEl) return false;                 // уже звучит — не накладываем
    let a: HTMLAudioElement;
    try { a = new Audio(this.AZAN_URL); } catch { return false; }
    // Азан затухает с расстоянием, но мягче прочих звуков: минарет на то и
    // высокий, чтобы призыв слышало всё становище. Пол 0.35 — даже с другого
    // конца карты слышен отголосок, вблизи мешіті звучит в полную силу.
    const att = at ? 0.35 + 0.65 * this.spatial(at.x, at.y) : 1;
    a.volume = Math.max(0.35, this.voiceVolume) * att;   // азан слышен поверх шума боя
    a.preload = 'auto';
    const done = () => { if (this.azanEl === a) this.azanEl = null; };
    a.addEventListener('ended', done, { once: true });
    a.addEventListener('error', done, { once: true });
    this.azanEl = a;
    a.play().catch(done);                          // автоплей заблокирован — тихо выходим
    return true;
  }
  stopAzan() {
    if (!this.azanEl) return;
    try { this.azanEl.pause(); } catch { /* noop */ }
    this.azanEl = null;
  }
  death() { this.ensure(); if (!this.gate('death', 120)) return; this.tone(300, 0.28, 'sine', 0.16, -180); this.noise(0.18, 0.12, 'lowpass', 500); }
  // взрыв: саб-бас + низкий гул
  boom() { this.ensure(); if (!this.gate('boom', 200)) return; this.noise(0.5, 0.5, 'lowpass', 350); this.tone(65, 0.55, 'sine', 0.5, -25); }
  // рог: медь — два расстроенных «пила» через фильтр, с вибрато
  horn() {
    this.ensure(); if (!this.gate('horn', 500)) return;
    [147, 196, 294].forEach((f, i) => {
      this.tone(f, 0.55, 'sawtooth', 0.16, 6, i * 0.06, 0.0);
      this.tone(f * 1.005, 0.55, 'sawtooth', 0.1, 0, i * 0.06, 0);
    });
    this.noise(0.5, 0.05, 'lowpass', 800, 0.02);
  }
  ageup() { this.ensure(); if (!this.gate('ageup', 500)) return; [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.26, 'triangle', 0.2, 0, i * 0.11, 0.35)); }
  win() { this.ensure(); if (!this.gate('win', 500)) return; [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.34, 'triangle', 0.22, 0, i * 0.13, 0.3)); }
  lose() { this.ensure(); if (!this.gate('lose', 500)) return; [400, 350, 300, 240, 170].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.18, -30, i * 0.16)); }
  quest() { this.ensure(); if (!this.gate('quest', 300)) return; this.tone(880, 0.14, 'sine', 0.18, 0, 0, 0.2); this.tone(1174, 0.2, 'sine', 0.16, 0, 0.1, 0.15); }
  heal() { this.ensure(); if (!this.gate('heal', 200)) return; this.tone(660, 0.2, 'sine', 0.14, 60, 0, 0.2); this.tone(990, 0.24, 'sine', 0.12, 0, 0.09, 0.15); }
  // тревога «нас атакуют»: низкий боевой рог в две ноты (гейт 6с — не спамит)
  alarm() {
    this.ensure(); if (!this.gate('alarm', 6000)) return;
    this.tone(196, 0.55, 'sawtooth', 0.16, 18, 0, 0.35);
    this.tone(147, 0.75, 'sawtooth', 0.14, 12, 0.22, 0.4);
    this.tone(392, 0.4, 'triangle', 0.07, 0, 0.05, 0.3);
  }
  // вой волка (зверь не говорит)
  wolf() { this.ensure(); if (!this.gate('wolf', 800)) return; this.tone(220, 0.5, 'sine', 0.16, -90); this.tone(233, 0.5, 'sine', 0.1, -95, 0.02); }
}
