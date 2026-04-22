// Sound effects, pixel-era style but softened. Each effect is a short chiptune
// phrase; every voice routes through a shared master bus that tames the harsh
// harmonics square waves naturally produce around 3–7 kHz:
//
//   voice → master gain → gentle lowpass (~4.8 kHz) → destination
//                      ↘ damped delay tap (75 ms, lowpassed) → destination
//
// The lowpass rounds off what used to feel piercing; the short damped delay
// adds a touch of "bloom" so hits read as satisfying rather than dry. Voices
// use slightly longer attacks (~18 ms) so nothing clicks in. Three sources:
//   · pulse — 12.5% / 25% / 50% duty, used sparingly for chiptune accents
//   · tri   — triangle wave, the default melodic voice (much warmer)
//   · noise — white-noise buffer through a filter, for percussive / warning
//
// The AudioContext only comes up after first user gesture (browser auto-play
// policy). Mute state persists in localStorage and shares a key with
// MusicPlayer so one toggle silences everything.

const MUTE_KEY = 'tipping-point.muted.v1';
const SFX_VOL_KEY = 'tipping-point.sfxVolume.v1';
const DEFAULT_SFX_VOL = 0.95;

// Equal-temperament note table. Only the notes we actually use, so misspelled
// references error out at parse time rather than silently resolving.
const N = {
  C3: 130.81, D3: 146.83, G3: 196.00, A3: 220.00,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00,
  AS4: 466.16, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99,
  A5: 880.00, B5: 987.77,
  C6: 1046.50, D6: 1174.66, E6: 1318.51, F6: 1396.91, G6: 1567.98,
};

// Envelope constants. Attack is the biggest single contributor to perceived
// "harshness" — 5 ms reads as a click, 18 ms as a pluck. Release governs how
// naturally a note tails off; too short feels abrupt.
const ATTACK = 0.018;

export class SoundBoard {
  constructor() {
    this.ctx = null;
    this.out = null;                // master input; voices connect here
    this.muted = this._loadMuted();
    this.volume = this._loadVolume();
    this._pulseWaves = new Map();   // duty → PeriodicWave (lazy)
    this._noiseBuffer = null;       // shared white-noise AudioBuffer
    this._unlock = this._unlock.bind(this);
    document.addEventListener('pointerdown', this._unlock, { once: true });
    document.addEventListener('keydown',     this._unlock, { once: true });
  }

  _loadVolume() {
    try {
      const raw = localStorage.getItem(SFX_VOL_KEY);
      if (raw == null) return DEFAULT_SFX_VOL;
      const v = Number(raw);
      if (!Number.isFinite(v)) return DEFAULT_SFX_VOL;
      return Math.max(0, Math.min(1, v));
    } catch {
      return DEFAULT_SFX_VOL;
    }
  }

  setVolume(v) {
    const clamped = Math.max(0, Math.min(1, Number(v) || 0));
    this.volume = clamped;
    try { localStorage.setItem(SFX_VOL_KEY, String(clamped)); } catch { /* ignore */ }
    if (this.out) this.out.gain.value = clamped;
  }

  _unlock() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this._buildOutput();
    } catch { /* ignore */ }
  }

  // Master bus: lowpass softens the 4–7 kHz harmonics that make pulse waves
  // read as "buzzy"; a short, damped delay tap adds subtle bloom that makes
  // notes feel rounded rather than abrupt. Built once at context creation.
  _buildOutput() {
    const ctx = this.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume ?? DEFAULT_SFX_VOL;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4800;
    lp.Q.value = 0.5;
    this.out.connect(lp).connect(ctx.destination);

    // Bloom: single delayed + damped tap. Low gain keeps it sub-noticeable.
    const dly = ctx.createDelay(0.25);
    dly.delayTime.value = 0.075;
    const dlyLp = ctx.createBiquadFilter();
    dlyLp.type = 'lowpass';
    dlyLp.frequency.value = 2400;
    const dlyGain = ctx.createGain();
    dlyGain.gain.value = 0.14;
    this.out.connect(dly).connect(dlyLp).connect(dlyGain).connect(ctx.destination);
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

  // Fourier-series pulse wave at the given duty cycle. 12.5% / 25% differ
  // from Web Audio's default 'square' (50%) — thinner, more nasal.
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

  // Envelope: slow attack (~18 ms, no click), brief sustain, exponential
  // release. Shared by pulse, triangle, and noise voices.
  _envelope(gainNode, when, gain, duration, release) {
    const attack = ATTACK;
    const sustainEnd = Math.max(when + attack + 0.01, when + duration);
    gainNode.gain.setValueAtTime(0, when);
    gainNode.gain.linearRampToValueAtTime(gain, when + attack);
    gainNode.gain.setValueAtTime(gain, sustainEnd);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, sustainEnd + release);
  }

  _pulseAt(when, { freq, duty = 0.5, duration = 0.1, gain = 0.07, release = 0.08, freqEnd = null }) {
    if (!this.ctx || !this.out) return;
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
    osc.connect(g).connect(this.out);
    osc.start(when);
    osc.stop(when + duration + release + 0.03);
  }

  _triAt(when, { freq, duration = 0.1, gain = 0.08, release = 0.10, freqEnd = null }) {
    if (!this.ctx || !this.out) return;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    if (freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), when + duration);
    }
    this._envelope(g, when, gain, duration, release);
    osc.connect(g).connect(this.out);
    osc.start(when);
    osc.stop(when + duration + release + 0.03);
  }

  // Sine voice for the softest edges — used under triumphant chords for
  // warm body, and for the collectable "coin" where a pure tone feels
  // more satisfying than a thin pulse.
  _sineAt(when, { freq, duration = 0.1, gain = 0.07, release = 0.10, freqEnd = null }) {
    if (!this.ctx || !this.out) return;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, when);
    if (freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), when + duration);
    }
    this._envelope(g, when, gain, duration, release);
    osc.connect(g).connect(this.out);
    osc.start(when);
    osc.stop(when + duration + release + 0.03);
  }

  _noiseAt(when, { duration = 0.08, gain = 0.06, filter = 'lowpass', freq = 1200, q = 0.8, release = 0.08 }) {
    if (!this.ctx || !this.out) return;
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
    src.connect(biq).connect(g).connect(this.out);
    src.start(when);
    src.stop(when + duration + release + 0.03);
  }

  _play(fn) {
    if (this.muted || !this.ctx || !this.out) return;
    fn(this.ctx.currentTime);
  }

  // ─── Named effects ──────────────────────────────────────────────────────

  // Two-note "go" — warm triangle lift. Pulse on the second note for a
  // little chiptune sparkle without the first-note click.
  deploy() {
    this._play((t) => {
      this._triAt(t,            { freq: N.E5, duration: 0.06, gain: 0.08, release: 0.08 });
      this._triAt(t + 0.06,     { freq: N.A5, duration: 0.10, gain: 0.08, release: 0.12 });
      this._pulseAt(t + 0.06,   { freq: N.A5, duty: 0.25, duration: 0.08, gain: 0.025, release: 0.08 });
    });
  }

  // "Denied" — soft lowpassed noise thump + a low pulse descent. Shorter
  // and lower than before so it reads as a polite "no" instead of a buzz.
  deployFail() {
    this._play((t) => {
      this._noiseAt(t,          { duration: 0.05, filter: 'lowpass', freq: 800, q: 0.7, gain: 0.06, release: 0.05 });
      this._pulseAt(t + 0.02,   { freq: N.A3, duty: 0.5, duration: 0.10, gain: 0.055, freqEnd: 120, release: 0.08 });
      this._triAt(t + 0.02,     { freq: N.A3, duration: 0.12, gain: 0.05,  freqEnd: 120, release: 0.10 });
    });
  }

  // Three-note ascending triangle arpeggio — soft, inviting "work begins".
  researchStart() {
    this._play((t) => {
      this._triAt(t,        { freq: N.C5, duration: 0.06, gain: 0.075, release: 0.08 });
      this._triAt(t + 0.06, { freq: N.E5, duration: 0.06, gain: 0.075, release: 0.08 });
      this._triAt(t + 0.12, { freq: N.G5, duration: 0.10, gain: 0.075, release: 0.14 });
    });
  }

  // Four-note fanfare, triangle-led with a subtle pulse sparkle on the
  // top note and a triangle sub-bass for body.
  researchDone() {
    this._play((t) => {
      const g = 0.07;
      this._triAt(t,          { freq: N.C5, duration: 0.08, gain: g });
      this._triAt(t + 0.08,   { freq: N.E5, duration: 0.08, gain: g });
      this._triAt(t + 0.16,   { freq: N.G5, duration: 0.08, gain: g });
      this._triAt(t + 0.24,   { freq: N.C6, duration: 0.22, gain: g, release: 0.22 });
      this._pulseAt(t + 0.24, { freq: N.C6, duty: 0.25, duration: 0.22, gain: 0.018, release: 0.22 });
      this._sineAt(t,         { freq: N.C4, duration: 0.40, gain: 0.05, release: 0.20 });
    });
  }

  // Milestone fanfare — five-note ascending line. Triangle on every note
  // keeps it warm; a sine bass provides weight without any harshness.
  netZero() {
    this._play((t) => {
      const g = 0.075;
      const seq = [[N.E5, 0.07], [N.G5, 0.07], [N.C6, 0.07], [N.E6, 0.07], [N.G6, 0.30]];
      let when = t;
      for (const [f, d] of seq) {
        this._triAt(when, { freq: f, duration: d, gain: g, release: d > 0.1 ? 0.24 : 0.08 });
        when += d;
      }
      // Pulse shimmer on the held top note only.
      this._pulseAt(t + 0.28, { freq: N.G6, duty: 0.25, duration: 0.30, gain: 0.02, release: 0.24 });
      this._sineAt(t,         { freq: N.C4, duration: 0.55, gain: 0.055, release: 0.22 });
      this._sineAt(t + 0.22,  { freq: N.G3, duration: 0.38, gain: 0.055, release: 0.20 });
    });
  }

  // Classic coin — two high-register notes, now on a 25% pulse instead of
  // the thin 12.5%, and doubled with triangle + sine for warmth.
  collectable() {
    this._play((t) => {
      const g = 0.055;
      this._pulseAt(t,        { freq: N.B5, duty: 0.25, duration: 0.06, gain: g });
      this._triAt(t,          { freq: N.B5, duration: 0.06, gain: 0.06 });
      this._pulseAt(t + 0.06, { freq: N.E6, duty: 0.25, duration: 0.16, gain: g, release: 0.16 });
      this._triAt(t + 0.06,   { freq: N.E6, duration: 0.16, gain: 0.06, release: 0.16 });
    });
  }

  // Quick major-third lift. All triangle — polite, quick, out of the way.
  eventGood() {
    this._play((t) => {
      this._triAt(t,        { freq: N.G5, duration: 0.07, gain: 0.075, release: 0.08 });
      this._triAt(t + 0.07, { freq: N.C6, duration: 0.18, gain: 0.075, release: 0.16 });
    });
  }

  // Warning — softened two-tone (E5 ↔ B♭4, tritone). Triangle keeps it from
  // buzzing; a gentle lowpassed noise hit opens it.
  eventBad() {
    this._play((t) => {
      const g = 0.075;
      this._noiseAt(t,        { duration: 0.06, filter: 'lowpass', freq: 400, q: 0.6, gain: 0.05, release: 0.05 });
      this._triAt(t + 0.05,   { freq: N.E5,  duration: 0.10, gain: g });
      this._triAt(t + 0.15,   { freq: N.AS4, duration: 0.10, gain: g });
      this._triAt(t + 0.25,   { freq: N.E5,  duration: 0.16, gain: g, release: 0.16 });
    });
  }

  // Victory fanfare — six-note ascending arpeggio. Triangle-led with a
  // subtle pulse sparkle on each note for chiptune character.
  win() {
    this._play((t) => {
      const g = 0.08;
      const seq = [[N.G4, 0.11], [N.C5, 0.11], [N.E5, 0.11],
                   [N.G5, 0.11], [N.C6, 0.11], [N.E6, 0.36]];
      let when = t;
      for (const [f, d] of seq) {
        const rel = d > 0.2 ? 0.28 : 0.10;
        this._triAt(when,   { freq: f, duration: d * 0.92, gain: g, release: rel });
        this._pulseAt(when, { freq: f, duty: 0.25, duration: d * 0.92, gain: 0.02, release: rel });
        when += d;
      }
      this._sineAt(t,        { freq: N.C3, duration: 0.45, gain: 0.06, release: 0.24 });
      this._sineAt(t + 0.33, { freq: N.G3, duration: 0.60, gain: 0.06, release: 0.28 });
    });
  }

  // Unobtrusive two-note chime — used when a dispatch lands in the log
  // that doesn't demand attention. Sine voices only so it reads as a
  // gentle "noted" rather than an alert.
  notification() {
    this._play((t) => {
      this._sineAt(t,        { freq: N.E5, duration: 0.08, gain: 0.055, release: 0.10 });
      this._sineAt(t + 0.08, { freq: N.A5, duration: 0.14, gain: 0.055, release: 0.14 });
    });
  }

  // Urgent three-note ping — used when an interactive decision lands in
  // the dispatches tab and the game auto-pauses. Perfect-fifth open
  // intervals pull the ear; triangle + pulse blend gives it chiptune
  // character without the harshness of eventBad.
  decision() {
    this._play((t) => {
      const g = 0.075;
      this._triAt(t,          { freq: N.C5, duration: 0.09, gain: g, release: 0.09 });
      this._triAt(t + 0.09,   { freq: N.G5, duration: 0.09, gain: g, release: 0.09 });
      this._triAt(t + 0.18,   { freq: N.C6, duration: 0.18, gain: g, release: 0.16 });
      this._pulseAt(t + 0.18, { freq: N.C6, duty: 0.25, duration: 0.18, gain: 0.025, release: 0.16 });
    });
  }

  // Barely-there sine blip for button hovers. 30 ms, very low gain — the
  // kind of thing you register only in aggregate. Rate-limited by the caller
  // so fast cursor sweeps don't stack into a buzz.
  hover() {
    this._play((t) => {
      this._sineAt(t, { freq: N.E5, duration: 0.03, gain: 0.018, release: 0.04 });
    });
  }

  // Descending minor "game over" — triangle tones dropping through a C
  // minor-ish descent with a soft low noise breath on the final note.
  lose() {
    this._play((t) => {
      const g = 0.08;
      const seq = [[N.C5, 0.17], [N.A4, 0.17], [N.F4, 0.17], [N.D4, 0.40]];
      let when = t;
      for (const [f, d] of seq) {
        const rel = d > 0.2 ? 0.30 : 0.10;
        this._triAt(when, { freq: f, duration: d * 0.92, gain: g, release: rel });
        when += d;
      }
      this._noiseAt(when - 0.05, { duration: 0.26, filter: 'lowpass', freq: 220, q: 0.5, gain: 0.04, release: 0.22 });
      this._sineAt(t + 0.51,     { freq: N.D3, duration: 0.40, gain: 0.045, release: 0.20 });
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
