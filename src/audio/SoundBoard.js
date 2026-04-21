// Sound effects, pixel-era style. Each effect is a short chiptune phrase
// instead of a single oscillator sweep — that's what makes NES / late-Game-Boy
// SFX feel distinctive rather than generic. Three voices:
//   · pulse  — square-ish wave at 12.5% / 25% / 50% duty (classic NES pulse)
//   · tri    — triangle wave, used as sub-bass under triumphant cues
//   · noise  — white-noise buffer through a biquad filter, for percussive /
//              warning hits (what the old "generic descending sawtooth"
//              negative sounds were replaced with)
//
// The AudioContext only comes up after first user gesture (browser auto-play
// policy). Mute state persists in localStorage and shares a key with
// MusicPlayer so one toggle silences everything.

const MUTE_KEY = 'greenprint.muted.v1';

// Equal-temperament note table. Only the notes we actually use, so misspelled
// references error out at parse time rather than silently resolving.
const N = {
  C3: 130.81, G3: 196.00, A3: 220.00,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00,
  AS4: 466.16, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99,
  A5: 880.00, B5: 987.77,
  C6: 1046.50, D6: 1174.66, E6: 1318.51, F6: 1396.91, G6: 1567.98,
};

export class SoundBoard {
  constructor() {
    this.ctx = null;
    this.muted = this._loadMuted();
    this._pulseWaves = new Map();   // duty → PeriodicWave (lazy)
    this._noiseBuffer = null;       // shared white-noise AudioBuffer
    this._unlock = this._unlock.bind(this);
    document.addEventListener('pointerdown', this._unlock, { once: true });
    document.addEventListener('keydown',     this._unlock, { once: true });
  }

  _unlock() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    } catch { /* ignore */ }
  }

  _loadMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; }
    catch { return false; }
  }

  setMuted(v) {
    this.muted = !!v;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch { /* ignore */ }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // Fourier-series pulse wave at the given duty cycle. 12.5% and 25% are the
  // NES pulse-channel voices and sound meaningfully different from Web Audio's
  // default 'square' (which is 50%).
  _pulseWave(duty) {
    if (!this.ctx) return null;
    const cached = this._pulseWaves.get(duty);
    if (cached) return cached;
    const harmonics = 32;
    const real = new Float32Array(harmonics);
    const imag = new Float32Array(harmonics);
    for (let k = 1; k < harmonics; k++) {
      imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    }
    const pw = this.ctx.createPeriodicWave(real, imag);
    this._pulseWaves.set(duty, pw);
    return pw;
  }

  _getNoiseBuffer() {
    if (this._noiseBuffer) return this._noiseBuffer;
    if (!this.ctx) return null;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(sr * 0.5), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
    return buf;
  }

  // Generic note-at-time envelope: quick attack, sustain for `duration`,
  // exponential release. Used for both pulse and triangle voices.
  _envelope(gainNode, when, gain, duration, release) {
    gainNode.gain.setValueAtTime(0, when);
    gainNode.gain.linearRampToValueAtTime(gain, when + 0.005);
    gainNode.gain.setValueAtTime(gain, when + duration);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, when + duration + release);
  }

  _pulseAt(when, { freq, duty = 0.5, duration = 0.1, gain = 0.09, release = 0.05, freqEnd = null }) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    if (duty === 0.5) {
      osc.type = 'square';
    } else {
      const pw = this._pulseWave(duty);
      if (pw) osc.setPeriodicWave(pw); else osc.type = 'square';
    }
    osc.frequency.setValueAtTime(freq, when);
    if (freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), when + duration);
    }
    this._envelope(g, when, gain, duration, release);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(when);
    osc.stop(when + duration + release + 0.02);
  }

  _triAt(when, { freq, duration = 0.1, gain = 0.07, release = 0.08 }) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    this._envelope(g, when, gain, duration, release);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(when);
    osc.stop(when + duration + release + 0.02);
  }

  _noiseAt(when, { duration = 0.08, gain = 0.08, filter = 'bandpass', freq = 1500, q = 1, release = 0.04 }) {
    if (!this.ctx) return;
    const buf = this._getNoiseBuffer();
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const biq = this.ctx.createBiquadFilter();
    biq.type = filter;
    biq.frequency.setValueAtTime(freq, when);
    biq.Q.setValueAtTime(q, when);
    const g = this.ctx.createGain();
    this._envelope(g, when, gain, duration, release);
    src.connect(biq).connect(g).connect(this.ctx.destination);
    src.start(when);
    src.stop(when + duration + release + 0.02);
  }

  _play(fn) {
    if (this.muted || !this.ctx) return;
    fn(this.ctx.currentTime);
  }

  // ─── Named effects ──────────────────────────────────────────────────────

  // Two-note "go" — quick ascending 25% pulse, upbeat and terse.
  deploy() {
    this._play((t) => {
      this._pulseAt(t,        { freq: N.E5, duty: 0.25, duration: 0.05, gain: 0.10 });
      this._pulseAt(t + 0.05, { freq: N.A5, duty: 0.25, duration: 0.09, gain: 0.10 });
    });
  }

  // NES-style "denied": tight filtered-noise blip followed by a short low
  // pulse thunk. Reads as "can't do that" without the generic descending
  // sawtooth whine.
  deployFail() {
    this._play((t) => {
      this._noiseAt(t,        { duration: 0.04, freq: 800, q: 4, gain: 0.10, release: 0.03 });
      this._pulseAt(t + 0.02, { freq: N.A3, duty: 0.5, duration: 0.09, gain: 0.09, freqEnd: 110, release: 0.06 });
    });
  }

  // Three-note ascending square arpeggio — "work begins".
  researchStart() {
    this._play((t) => {
      this._pulseAt(t,        { freq: N.C5, duty: 0.5, duration: 0.05, gain: 0.08 });
      this._pulseAt(t + 0.05, { freq: N.E5, duty: 0.5, duration: 0.05, gain: 0.08 });
      this._pulseAt(t + 0.10, { freq: N.G5, duty: 0.5, duration: 0.08, gain: 0.08 });
    });
  }

  // Four-note fanfare (C-major triad → octave) with a triangle sub-bass.
  researchDone() {
    this._play((t) => {
      const g = 0.08;
      this._pulseAt(t,        { freq: N.C5, duty: 0.25, duration: 0.07, gain: g });
      this._pulseAt(t + 0.07, { freq: N.E5, duty: 0.25, duration: 0.07, gain: g });
      this._pulseAt(t + 0.14, { freq: N.G5, duty: 0.25, duration: 0.07, gain: g });
      this._pulseAt(t + 0.21, { freq: N.C6, duty: 0.25, duration: 0.18, gain: g, release: 0.18 });
      this._triAt(t,          { freq: N.C4, duration: 0.30, gain: 0.06, release: 0.15 });
    });
  }

  // Larger milestone fanfare. Five-note ascending line plus a held top note
  // and a triangle root — this is the "country just hit Net Zero" flourish.
  netZero() {
    this._play((t) => {
      const g = 0.09;
      const seq = [[N.E5, 0.06], [N.G5, 0.06], [N.C6, 0.06], [N.E6, 0.06], [N.G6, 0.28]];
      let when = t;
      for (const [f, d] of seq) {
        this._pulseAt(when, { freq: f, duty: 0.25, duration: d, gain: g, release: d > 0.1 ? 0.20 : 0.05 });
        when += d;
      }
      this._triAt(t,         { freq: N.C4, duration: 0.45, gain: 0.06, release: 0.18 });
      this._triAt(t + 0.22,  { freq: N.G3, duration: 0.30, gain: 0.06, release: 0.15 });
    });
  }

  // Classic "coin": two quick high 12.5% pulse notes, the second held.
  collectable() {
    this._play((t) => {
      this._pulseAt(t,        { freq: N.B5, duty: 0.125, duration: 0.05, gain: 0.09 });
      this._pulseAt(t + 0.05, { freq: N.E6, duty: 0.125, duration: 0.14, gain: 0.09, release: 0.12 });
    });
  }

  // Quick major-third lift. Short and polite so back-to-back events don't
  // stomp each other.
  eventGood() {
    this._play((t) => {
      this._pulseAt(t,        { freq: N.G5, duty: 0.25, duration: 0.06, gain: 0.09 });
      this._pulseAt(t + 0.06, { freq: N.C6, duty: 0.25, duration: 0.15, gain: 0.09, release: 0.12 });
    });
  }

  // Warning alarm — noise hit opens, then a two-tone oscillation (E5 ↔ Bb4,
  // a dissonant tritone) lands as "trouble incoming" instead of the old
  // generic descending sawtooth.
  eventBad() {
    this._play((t) => {
      const g = 0.09;
      this._noiseAt(t,        { duration: 0.05, freq: 320, q: 2, gain: 0.09, release: 0.04 });
      this._pulseAt(t + 0.05, { freq: N.E5,  duty: 0.5, duration: 0.09, gain: g });
      this._pulseAt(t + 0.14, { freq: N.AS4, duty: 0.5, duration: 0.09, gain: g });
      this._pulseAt(t + 0.23, { freq: N.E5,  duty: 0.5, duration: 0.14, gain: g, release: 0.12 });
    });
  }

  // Full victory fanfare: six-note ascending arpeggio, triangle bass walking
  // root → dominant under it.
  win() {
    this._play((t) => {
      const g = 0.10;
      const seq = [[N.G4, 0.10], [N.C5, 0.10], [N.E5, 0.10],
                   [N.G5, 0.10], [N.C6, 0.10], [N.E6, 0.32]];
      let when = t;
      for (const [f, d] of seq) {
        this._pulseAt(when, { freq: f, duty: 0.25, duration: d * 0.95, gain: g, release: d > 0.2 ? 0.25 : 0.05 });
        when += d;
      }
      this._triAt(t,        { freq: N.C3, duration: 0.40, gain: 0.07, release: 0.20 });
      this._triAt(t + 0.30, { freq: N.G3, duration: 0.55, gain: 0.07, release: 0.25 });
    });
  }

  // Descending-minor "game over" jingle with a soft low-passed noise tail
  // under the final held note. Distinct from deployFail — this is the end
  // of the run, not a denied action.
  lose() {
    this._play((t) => {
      const g = 0.10;
      const seq = [[N.C5, 0.15], [N.A4, 0.15], [N.F4, 0.15], [N.D4, 0.35]];
      let when = t;
      for (const [f, d] of seq) {
        this._pulseAt(when, { freq: f, duty: 0.5, duration: d * 0.9, gain: g, release: d > 0.2 ? 0.25 : 0.05 });
        when += d;
      }
      this._noiseAt(when - 0.05, { duration: 0.22, filter: 'lowpass', freq: 280, q: 0.7, gain: 0.05, release: 0.20 });
    });
  }
}

// Wire the SoundBoard to a bus. Caller manages lifecycle; returns an
// unsubscribe array for cleanup.
export function bindSounds(board, bus) {
  const { EVT } = { EVT: {
    DEPLOYED: 'deployed', DEPLOY_FAILED: 'deployFailed',
    RESEARCH_STARTED: 'researchStarted', RESEARCH_DONE: 'researchDone',
    NET_ZERO: 'netZero', EVENT_FIRED: 'eventFired',
    COLLECTABLE_CLAIMED: 'collectableClaimed',
    WON: 'won', LOST: 'lost',
  } };
  return [
    bus.on(EVT.DEPLOYED,            () => board.deploy()),
    bus.on(EVT.DEPLOY_FAILED,       () => board.deployFail()),
    bus.on(EVT.RESEARCH_STARTED,    () => board.researchStart()),
    bus.on(EVT.RESEARCH_DONE,       () => board.researchDone()),
    bus.on(EVT.NET_ZERO,            () => board.netZero()),
    bus.on(EVT.COLLECTABLE_CLAIMED, () => board.collectable()),
    bus.on(EVT.EVENT_FIRED,         (p) => p.tone === 'bad' ? board.eventBad() : board.eventGood()),
    bus.on(EVT.WON,                 () => board.win()),
    bus.on(EVT.LOST,                () => board.lose()),
  ];
}
