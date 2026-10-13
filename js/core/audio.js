// Prosedyrisk lyd med Web Audio API – ingen lydfiler nødvendig.

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.engine = null;
    this.ambient = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    // Hvit støy-buffer
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._startAmbient();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get ok() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  _noiseSrc(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    if (!loop) s.playbackRate.value = 0.8 + Math.random() * 0.4;
    return s;
  }

  _env(gain, t, attack, decay, peak) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _tone(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this._env(g, t, 0.005, dur, vol);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _burst(filterType, freq, q, dur, vol, delay = 0) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + delay;
    const s = this._noiseSrc();
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    this._env(g, t, 0.003, dur, vol);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  /** Skudd fra krypskytter – volum etter avstand. */
  shot(dist = 10) {
    const v = Math.max(0.05, 1 - dist / 140);
    this._burst('lowpass', 2200 - Math.min(1600, dist * 12), 0.7, 0.35, 0.9 * v);
    this._tone('sine', 140, 40, 0.25, 0.6 * v);
  }
  whiz() { this._burst('bandpass', 3000, 6, 0.12, 0.25); }
  swing() { this._burst('bandpass', 900, 1.5, 0.18, 0.35); }
  twang() { this._tone('triangle', 420, 180, 0.2, 0.25); this._burst('highpass', 3000, 1, 0.05, 0.15); }
  dartShot() { this._burst('highpass', 1500, 0.8, 0.12, 0.45); this._tone('square', 300, 90, 0.08, 0.12); }
  hit() { this._tone('sine', 180, 60, 0.15, 0.5); this._burst('lowpass', 600, 1, 0.12, 0.35); }
  hurt() { this._tone('sawtooth', 220, 90, 0.25, 0.22); this._burst('lowpass', 400, 1, 0.2, 0.3); }
  growl() { this._tone('sawtooth', 90, 60, 0.6, 0.25); this._burst('lowpass', 300, 3, 0.6, 0.25); }
  coin() { this._tone('sine', 988, 988, 0.1, 0.25); this._tone('sine', 1319, 1319, 0.25, 0.25, 0.08); }
  bigCoin() { [523, 659, 784, 1047].forEach((f, i) => this._tone('triangle', f, f, 0.25, 0.25, i * 0.08)); }
  alert() { this._tone('square', 660, 660, 0.09, 0.12); this._tone('square', 880, 880, 0.14, 0.12, 0.1); }
  quest() { [392, 523, 659].forEach((f, i) => this._tone('sine', f, f, 0.3, 0.25, i * 0.1)); }
  ui() { this._tone('sine', 700, 900, 0.06, 0.15); }
  error() { this._tone('square', 200, 150, 0.15, 0.12); }
  splash() { this._burst('bandpass', 800, 0.8, 0.5, 0.45); }
  step(surface) {
    const f = surface === 'snow' ? 2500 : surface === 'sand' ? 1800 : surface === 'water' ? 700 : 1100;
    this._burst('bandpass', f * (0.9 + Math.random() * 0.2), 1.2, 0.07, surface === 'water' ? 0.12 : 0.07);
  }
  poof() { this._burst('lowpass', 900, 0.5, 0.6, 0.4); this._tone('sine', 300, 600, 0.3, 0.15); }
  victory() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this._tone('triangle', f, f, 0.35, 0.3, i * 0.15)); }
  gameOver() { [392, 330, 262, 196].forEach((f, i) => this._tone('sine', f, f * 0.98, 0.45, 0.3, i * 0.25)); }
  heartbeat() { this._tone('sine', 60, 40, 0.12, 0.5); this._tone('sine', 55, 35, 0.12, 0.4, 0.18); }

  // ----- Motor (kontinuerlig) -----
  startEngine(type) {
    if (!this.ok) return;
    this.stopEngine();
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master);
    const e = { type, out, nodes: [] };
    if (type === 'heli') {
      const s = this._noiseSrc(true);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 400;
      const am = ctx.createGain();
      am.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 12;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.5;
      lfo.connect(lfoG).connect(am.gain);
      s.connect(f).connect(am).connect(out);
      s.start();
      lfo.start();
      e.nodes.push(s, lfo);
      e.lfo = lfo;
      e.filter = f;
    } else if (type === 'bike') {
      // Knirk og kjede-rasling
      const s = this._noiseSrc(true);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2500;
      f.Q.value = 2;
      s.connect(f).connect(out);
      s.start();
      e.nodes.push(s);
      e.filter = f;
    } else {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 40;
      const o2 = ctx.createOscillator();
      o2.type = 'square';
      o2.frequency.value = 41;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 500;
      const g2 = ctx.createGain();
      g2.gain.value = 0.3;
      o.connect(f);
      o2.connect(g2).connect(f);
      f.connect(out);
      o.start();
      o2.start();
      e.nodes.push(o, o2);
      e.osc = [o, o2];
      e.filter = f;
    }
    this.engine = e;
  }

  updateEngine(speedFrac, throttle) {
    const e = this.engine;
    if (!e || !this.ok) return;
    const t = this.ctx.currentTime;
    if (e.type === 'heli') {
      e.lfo.frequency.setTargetAtTime(9 + speedFrac * 6 + throttle * 2, t, 0.2);
      e.filter.frequency.setTargetAtTime(350 + speedFrac * 300, t, 0.2);
      e.out.gain.setTargetAtTime(0.35, t, 0.3);
    } else if (e.type === 'bike') {
      e.out.gain.setTargetAtTime(Math.min(0.06, speedFrac * 0.08), t, 0.1);
      e.filter.frequency.setTargetAtTime(1800 + speedFrac * 1500, t, 0.1);
    } else {
      const base = e.type === 'boat' ? 55 : 45;
      e.osc[0].frequency.setTargetAtTime(base + speedFrac * 90 + throttle * 15, t, 0.1);
      e.osc[1].frequency.setTargetAtTime(base * 1.02 + speedFrac * 92, t, 0.1);
      e.filter.frequency.setTargetAtTime(400 + speedFrac * 900, t, 0.1);
      e.out.gain.setTargetAtTime(0.09 + speedFrac * 0.06, t, 0.2);
    }
  }

  stopEngine() {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    e.out.gain.setTargetAtTime(0, t, 0.1);
    setTimeout(() => {
      e.nodes.forEach((n) => { try { n.stop(); } catch (err) { /* allerede stoppet */ } });
      e.out.disconnect();
    }, 400);
    this.engine = null;
  }

  // ----- Omgivelseslyd -----
  _startAmbient() {
    const ctx = this.ctx;
    const s = this._noiseSrc(true);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.value = 0;
    s.connect(f).connect(g).connect(this.master);
    s.start();
    this.ambient = { src: s, filter: f, gain: g, birdTimer: 2 };
  }

  updateAmbient(dt, biome, altitude, underwater, active) {
    const a = this.ambient;
    if (!a || !this.ok) return;
    const t = this.ctx.currentTime;
    let wind = biome === 'ice' ? 0.09 : biome === 'desert' ? 0.06 : 0.035;
    wind += Math.min(0.08, Math.max(0, altitude - 30) * 0.0008);
    if (underwater) wind = 0.12;
    if (!active) wind = 0;
    a.gain.gain.setTargetAtTime(wind, t, 0.5);
    a.filter.frequency.setTargetAtTime(underwater ? 250 : 380 + Math.sin(t * 0.3) * 120, t, 0.5);
    // Fuglekvitter i skogen
    if (active && biome === 'forest' && !underwater) {
      a.birdTimer -= dt;
      if (a.birdTimer <= 0) {
        a.birdTimer = 2 + Math.random() * 6;
        const base = 2200 + Math.random() * 1600;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this._tone('sine', base, base * (1.1 + Math.random() * 0.3), 0.08, 0.035, i * 0.11);
      }
    }
  }
}
