'use strict';

// 간단한 WebAudio 효과음 (외부 파일 없이 합성)
const Sound = {
  ctx: null,
  muted: localStorage.getItem('pa_mute') === '1',

  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  toggle() {
    this.muted = !this.muted;
    localStorage.setItem('pa_mute', this.muted ? '1' : '0');
    return this.muted;
  },

  tone(freq, dur, type = 'square', vol = 0.06, slide = 0, delay = 0) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  noise(dur, vol = 0.08, freq = 1200, delay = 0) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf;
    f.type = 'lowpass';
    f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  },

  play(name) {
    switch (name) {
      case 'select': this.tone(880, 0.06, 'square', 0.04); break;
      case 'back': this.tone(440, 0.07, 'square', 0.04); break;
      case 'proj': this.tone(620, 0.1, 'square', 0.035, -300); break;
      case 'melee': this.noise(0.08, 0.06, 3000); break;
      case 'dash': this.noise(0.15, 0.05, 1600); this.tone(300, 0.12, 'sawtooth', 0.03, 300); break;
      case 'beam': this.tone(180, 0.5, 'sawtooth', 0.04, 500); break;
      case 'nova': this.noise(0.3, 0.08, 600); break;
      case 'target': this.tone(900, 0.2, 'triangle', 0.04, -500); break;
      case 'impact': this.noise(0.25, 0.1, 900); break;
      case 'hit': this.noise(0.08, 0.1, 2200); this.tone(160, 0.08, 'square', 0.05, -60); break;
      case 'super': this.noise(0.12, 0.12, 2600); this.tone(220, 0.15, 'square', 0.06, -120); break;
      case 'zpower':
        [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'square', 0.045, 50, i * 0.08));
        this.tone(1568, 0.24, 'triangle', 0.04, 0, 0.42);
        break;
      case 'zhit':
        this.noise(0.32, 0.13, 800);
        this.tone(150, 0.36, 'sawtooth', 0.055, -80);
        this.tone(523, 0.2, 'square', 0.04, 180);
        break;
      case 'weak': this.noise(0.06, 0.06, 900); break;
      case 'miss': this.tone(1200, 0.06, 'sine', 0.03, 400); break;
      case 'dodge': this.noise(0.12, 0.04, 4000); break;
      case 'switch': this.tone(520, 0.08, 'square', 0.04, 300); this.tone(780, 0.08, 'square', 0.04, 0, 0.08); break;
      case 'faint': this.tone(500, 0.6, 'square', 0.05, -420); break;
      case 'orb': this.tone(990, 0.08, 'sine', 0.05); this.tone(1320, 0.12, 'sine', 0.05, 0, 0.07); break;
      case 'start': [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, 'square', 0.04, 0, i * 0.1)); break;
      case 'fight': this.tone(1046, 0.25, 'square', 0.05); break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'square', 0.05, 0, i * 0.13)); break;
      case 'lose': [392, 330, 262].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.05, 0, i * 0.2)); break;
    }
  },
};
