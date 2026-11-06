// Effets sonores 100 % synthétisés avec WebAudio (aucun fichier audio).

export class Sfx {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.engines = [];
  }

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Boucle d'écopage
    this.scoop = this.noiseVoice('bandpass', 900, 0.8);
    this.wind = this.noiseVoice('lowpass', 500, 0.5);
  }

  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  noiseVoice(type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return { src, f, g };
  }

  /** Moteur d'un avion (pan = -1 gauche … 1 droite pour l'écran partagé). */
  engine(pan = 0) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) { panner.pan.value = pan; out.connect(panner).connect(this.master); } else out.connect(this.master);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 1.5;
    lp.connect(out);
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 62;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 124;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o1.connect(lp); o2.connect(g2).connect(lp);
    const ns = ctx.createBufferSource(); ns.buffer = this.noise; ns.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 320; nf.Q.value = 0.6;
    const ng = ctx.createGain(); ng.gain.value = 0.5;
    ns.connect(nf).connect(ng).connect(out);
    o1.start(); o2.start(); ns.start();
    const e = {
      update: (throttle, speed, on) => {
        const t = ctx.currentTime;
        const rpm = on ? 0.35 + throttle * 0.45 + Math.min(1, speed / 70) * 0.2 : 0;
        o1.frequency.setTargetAtTime(48 + rpm * 46, t, 0.2);
        o2.frequency.setTargetAtTime(96 + rpm * 92, t, 0.2);
        lp.frequency.setTargetAtTime(400 + rpm * 900, t, 0.2);
        out.gain.setTargetAtTime(on ? 0.05 + rpm * 0.09 : 0, t, 0.3);
      },
      stop: () => { try { o1.stop(); o2.stop(); ns.stop(); } catch (_) { /* déjà arrêté */ } out.disconnect(); },
    };
    this.engines.push(e);
    return e;
  }

  stopEngines() { for (const e of this.engines) e.stop(); this.engines = []; }

  setScoop(level) {
    if (!this.ctx) return;
    this.scoop.g.gain.setTargetAtTime(level * 0.35, this.ctx.currentTime, 0.08);
  }

  setWind(level) {
    if (!this.ctx) return;
    this.wind.g.gain.setTargetAtTime(level * 0.12, this.ctx.currentTime, 0.3);
  }

  burst({ type = 'bandpass', freq = 1000, q = 1, dur = 0.3, gain = 0.4, sweep = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone(freq, dur, { type = 'sine', gain = 0.2, delay = 0, slide = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  drop() { this.burst({ type: 'lowpass', freq: 1800, q: 0.7, dur: 2.0, gain: 0.5, sweep: 0.15 }); }
  splash() { this.burst({ type: 'bandpass', freq: 1400, q: 0.8, dur: 0.35, gain: 0.25 }); }
  steam() { this.burst({ type: 'highpass', freq: 3000, q: 0.5, dur: 1.2, gain: 0.18 }); }
  bump() { this.tone(90, 0.25, { type: 'sine', gain: 0.5, slide: 0.5 }); this.burst({ type: 'lowpass', freq: 400, dur: 0.3, gain: 0.3 }); }
  crash() { this.burst({ type: 'lowpass', freq: 900, q: 0.5, dur: 1.2, gain: 0.7, sweep: 0.2 }); this.tone(70, 0.6, { gain: 0.5, slide: 0.4 }); }
  click() { this.tone(880, 0.05, { type: 'triangle', gain: 0.15 }); }

  crackle(level, dt) {
    if (!this.ctx || level <= 0) return;
    const n = level * dt * 25;
    if (Math.random() < n) {
      this.burst({ type: 'bandpass', freq: 1500 + Math.random() * 3000, q: 3, dur: 0.04 + Math.random() * 0.05, gain: 0.08 + level * 0.15 });
    }
  }

  radioOn() {
    this.burst({ type: 'bandpass', freq: 1900, q: 0.8, dur: 0.25, gain: 0.18 });
    this.tone(1250, 0.07, { type: 'square', gain: 0.06, delay: 0.22 });
  }
  radioOff() {
    this.tone(950, 0.06, { type: 'square', gain: 0.05 });
    this.burst({ type: 'bandpass', freq: 1900, q: 0.8, dur: 0.18, gain: 0.12, delay: 0.06 });
  }

  /** Sirène deux tons des pompiers (« pin-pon »). */
  siren(cycles = 3) {
    for (let k = 0; k < cycles * 2; k++) {
      this.tone(k % 2 ? 488 : 435, 0.42, { type: 'square', gain: 0.07, delay: k * 0.45 });
    }
  }

  success() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', gain: 0.2, delay: i * 0.12 }));
  }
  fanfare() {
    [523, 659, 784, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', gain: 0.22, delay: i * 0.15 }));
  }
  sad() {
    [523, 466, 415, 349].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', gain: 0.18, delay: i * 0.2 }));
  }
  tankFull() { this.tone(660, 0.12, { type: 'triangle', gain: 0.2 }); this.tone(990, 0.2, { type: 'triangle', gain: 0.2, delay: 0.12 }); }
  warning() { this.tone(740, 0.12, { type: 'square', gain: 0.07 }); this.tone(740, 0.12, { type: 'square', gain: 0.07, delay: 0.2 }); }
}
