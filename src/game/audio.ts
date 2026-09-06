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
  villager:  { select: ['готов'], move: [], attack: [], gather: [] },
  swordsman: { select: ['готов', 'к бою'], move: ['вперед', 'к бою'], attack: ['в атаку', 'за короля'], gather: [] },
  spearman:  { select: ['к бою', 'готов'], move: ['вперед', 'к бою'], attack: ['в атаку', 'за короля'], gather: [] },
  archer:    { select: ['готов', 'к бою'], move: ['вперед'], attack: ['в атаку', 'за короля'], gather: [] },
  knight:    { select: ['честь', 'готов', 'к бою'], move: ['вперед'], attack: ['за короля', 'в атаку', 'честь'], gather: [] },
  cavalry:   { select: ['готов', 'к бою'], move: ['вперед'], attack: ['в атаку', 'за короля'], gather: [] },
  catapult:  { select: ['готов', 'к бою'], move: ['вперед'], attack: ['в атаку'], gather: [] },
  monk:      { select: ['готов'], move: [], attack: [], gather: [] },
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
  }

  private gate(key: string, ms: number) {
    const t = performance.now();
    if (this.lastPlay[key] && t - this.lastPlay[key] < ms) return false;
    this.lastPlay[key] = t;
    return true;
  }
  // лёгкий случайный разброс высоты для «живости»
  private jitter(n: number, cents = 0.02) { return n * (1 + (Math.random() * 2 - 1) * cents); }

  // мягкий тон с быстрой атакой и (опционально) второй гармоникой для тела
  private tone(freq: number, dur: number, type: OscType = 'sine', vol = 0.4, slide = 0, delay = 0, harm = 0) {
    if (this.muted || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const mk = (f: number, v: number, detune: number) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = type; o.frequency.value = f; o.detune.value = detune;
      if (slide !== 0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(v, t0 + Math.min(0.012, dur * 0.25)); // мягкая атака
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
      o.connect(g); g.connect(this.master!);
      o.start(t0); o.stop(t0 + dur + 0.03);
    };
    mk(this.jitter(freq), vol, 0);
    if (harm > 0) mk(freq * 2, vol * harm, 4); // октава сверху — «воздух»
  }

  // фильтрованный шум с мягкой атакой (удары, выдохи, свист)
  private noise(dur: number, vol = 0.35, type: BiquadFilterType = 'lowpass', freq = 1200, delay = 0, q = 0.8) {
    if (this.muted || !this.ctx || !this.master) return;
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
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }

  // внутреннее проигрывание записи; на 404 пробуем NFD-вариант имени (macOS-загрузки)
  private playUrl(url: string) {
    if (this.activeClips.length >= 3) return;
    let a: HTMLAudioElement;
    const done = () => { const i = this.activeClips.indexOf(a); if (i >= 0) this.activeClips.splice(i, 1); };
    try { a = new Audio(url); } catch { return; }
    a.volume = this.voiceVolume;
    this.activeClips.push(a);
    a.addEventListener('ended', done);
    a.addEventListener('error', () => {
      done();
      // NFD-фолбэк: декодируем имя файла, разлагаем в NFD, кодируем обратно
      try {
        const u = decodeURIComponent(url.slice('voices/'.length));
        const nfd = u.normalize('NFD');
        if (nfd !== u && !this.missingClips.has(url)) { this.playUrl('voices/' + encodeURIComponent(nfd)); return; }
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

  // ── голос: проиграть запись фразы ──
  // event: select|move|attack|gather. Игрок — казахская раса: сперва казахские записи,
  // для команд без них (часть рабочих реплик) — откат на русскую озвучку.
  voice(unit: string, event: 'select' | 'move' | 'attack' | 'gather') {
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
      if (url) { this.playUrl(url); return; }
    }
    // казахской реплики нет — русский набор
    const set = PHRASES[unit] || PHRASES.swordsman;
    const list = set[event];
    if (!list || !list.length) return;
    const url = pickUrl(list[(Math.random() * list.length) | 0]);
    if (url) this.playUrl(url);
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
  chop() { this.ensure(); if (!this.gate('chop', 110)) return; this.noise(0.06, 0.3, 'lowpass', 500); this.tone(150, 0.08, 'sine', 0.28, -40); }
  // кирка по камню: короткий «клик» с металлическим верхом
  mine() { this.ensure(); if (!this.gate('mine', 140)) return; this.noise(0.05, 0.22, 'bandpass', 2600, 0, 2); this.tone(900, 0.06, 'triangle', 0.12, -300); }
  gatherFood() { this.ensure(); if (!this.gate('food', 160)) return; this.tone(500, 0.1, 'sine', 0.14, 120, 0, 0.2); }
  // монеты: два ясных колокольчика
  coin() { this.ensure(); if (!this.gate('coin', 120)) return; this.tone(1320, 0.12, 'sine', 0.14, 0, 0, 0.15); this.tone(1760, 0.18, 'sine', 0.12, 0, 0.06, 0.1); }
  train() { this.ensure(); if (!this.gate('train', 80)) return; this.tone(280, 0.14, 'triangle', 0.2, 180, 0, 0.25); this.tone(420, 0.16, 'sine', 0.14, 120, 0.1, 0.2); }
  // стройка: молоток — деревянный «ток»
  build() { this.ensure(); if (!this.gate('build', 150)) return; this.noise(0.05, 0.32, 'lowpass', 700); this.tone(120, 0.07, 'sine', 0.3, -30); }
  place() { this.ensure(); if (!this.gate('place', 80)) return; this.tone(240, 0.1, 'triangle', 0.18, 60, 0, 0.2); this.noise(0.08, 0.15, 'lowpass', 600); }
  // клинки: лязг металла (bandpass-шум) + короткий «звон»
  sword() {
    this.ensure(); if (!this.gate('sword', 90)) return;
    this.noise(0.09, 0.28, 'bandpass', 3600, 0, 1.5);
    this.tone(1400 + Math.random() * 500, 0.07, 'triangle', 0.08, -500);
  }
  // лук: «твань» струны + свист стрелы
  arrow() { this.ensure(); if (!this.gate('arrow', 110)) return; this.tone(340, 0.12, 'triangle', 0.16, -180); this.noise(0.16, 0.12, 'bandpass', 2400, 0, 1); }
  // попадание: мягкий удар
  hit() { this.ensure(); if (!this.gate('hit', 70)) return; this.noise(0.07, 0.26, 'lowpass', 900); this.tone(200, 0.06, 'sine', 0.18, -60); }

  // ── столкновение воинов: проигрывание батальной записи с РАЗНЫХ мест ──
  //    трек длинный — каждая стычка стартует со случайной секунды (5..40с),
  //    играет короткий плотный фрагмент, одновременно звучит не больше одного.
  private battle: HTMLAudioElement | null = null;
  private readonly BATTLE_URL = 'voices/battle-sword-fight.mp3';
  battleClash() {
    this.ensure();
    if (this.muted) return;
    if (!this.gate('battle', 900)) return; // не накладываем кашу: ~один фрагмент в ~0.9с
    let a: HTMLAudioElement;
    try { a = new Audio(this.BATTLE_URL); } catch { return; }
    a.volume = 0.42;
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
  // вой волка (зверь не говорит)
  wolf() { this.ensure(); if (!this.gate('wolf', 800)) return; this.tone(220, 0.5, 'sine', 0.16, -90); this.tone(233, 0.5, 'sine', 0.1, -95, 0.02); }
}
