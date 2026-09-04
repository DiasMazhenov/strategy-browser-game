// Tiny synthesized SFX engine — no assets, WebAudio only.
export class SoundBank {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted = false;
  lastPlay: Record<string, number> = {};

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    } catch { /* noop */ }
  }

  setMuted(m: boolean) { this.muted = m; }

  private gate(key: string, ms: number) {
    const t = performance.now();
    if (this.lastPlay[key] && t - this.lastPlay[key] < ms) return false;
    this.lastPlay[key] = t;
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.5, slide = 0, delay = 0) {
    if (this.muted || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide !== 0) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol = 0.4, lowpass = 1200, delay = 0) {
    if (this.muted || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }

  select() { this.ensure(); if (!this.gate('sel', 60)) return; this.tone(660, 0.06, 'square', 0.12, 120); }
  move() { this.ensure(); if (!this.gate('mov', 90)) return; this.tone(420, 0.07, 'triangle', 0.22, 180); }
  error() { this.ensure(); if (!this.gate('err', 120)) return; this.tone(160, 0.16, 'sawtooth', 0.25, -60); }
  chop() { this.ensure(); if (!this.gate('chop', 110)) return; this.noise(0.09, 0.5, 900); this.tone(180, 0.07, 'square', 0.14, -60); }
  mine() { this.ensure(); if (!this.gate('mine', 140)) return; this.tone(1180, 0.08, 'square', 0.1, -300); this.noise(0.06, 0.3, 3000); }
  gatherFood() { this.ensure(); if (!this.gate('food', 160)) return; this.tone(520, 0.09, 'sine', 0.2, 140); }
  coin() { this.ensure(); if (!this.gate('coin', 120)) return; this.tone(950, 0.08, 'square', 0.12); this.tone(1420, 0.12, 'square', 0.1, 0, 0.06); }
  train() { this.ensure(); if (!this.gate('train', 80)) return; this.tone(300, 0.12, 'triangle', 0.3, 200); this.tone(450, 0.14, 'triangle', 0.25, 150, 0.1); }
  build() { this.ensure(); if (!this.gate('build', 150)) return; this.noise(0.12, 0.5, 500); this.tone(95, 0.14, 'sine', 0.5, 20); }
  place() { this.ensure(); if (!this.gate('place', 80)) return; this.tone(220, 0.1, 'square', 0.25, 80); this.noise(0.1, 0.4, 700); }
  sword() { this.ensure(); if (!this.gate('sword', 90)) return; this.noise(0.08, 0.4, 4500); this.tone(700 + Math.random() * 400, 0.06, 'sawtooth', 0.1, -200); }
  arrow() { this.ensure(); if (!this.gate('arrow', 110)) return; this.noise(0.07, 0.25, 6000); this.tone(1800, 0.05, 'sine', 0.08, -900); }
  hit() { this.ensure(); if (!this.gate('hit', 70)) return; this.noise(0.06, 0.35, 1800); }
  death() { this.ensure(); if (!this.gate('death', 120)) return; this.tone(320, 0.22, 'sawtooth', 0.2, -240); }
  boom() { this.ensure(); if (!this.gate('boom', 200)) return; this.noise(0.5, 0.7, 400); this.tone(70, 0.5, 'sine', 0.6, -30); }
  horn() { this.ensure(); if (!this.gate('horn', 500)) return; this.tone(147, 0.5, 'sawtooth', 0.3); this.tone(196, 0.5, 'sawtooth', 0.28, 0, 0.02); this.tone(294, 0.6, 'sawtooth', 0.22, 0, 0.05); }
  ageup() { this.ensure(); if (!this.gate('ageup', 500)) return; [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.28, 0, i * 0.11)); }
  win() { this.ensure(); if (!this.gate('win', 500)) return; [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.3, 0, i * 0.13)); }
  lose() { this.ensure(); if (!this.gate('lose', 500)) return; [400, 350, 300, 200, 140].forEach((f, i) => this.tone(f, 0.35, 'sawtooth', 0.22, -40, i * 0.16)); }
  quest() { this.ensure(); if (!this.gate('quest', 300)) return; this.tone(880, 0.12, 'sine', 0.25); this.tone(1174, 0.18, 'sine', 0.25, 0, 0.1); }
}
