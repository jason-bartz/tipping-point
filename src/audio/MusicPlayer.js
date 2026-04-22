// Background music. Streams the tracks in /public/Music as AudioBuffers and
// plays them in a shuffled playlist, crossfading between tracks so the game
// never drops to silence. Web Audio is used instead of <audio> so the fades
// and track-to-track handoff are sample-accurate (setTimeout would drift
// audibly on a long session).
//
// Shares the same mute key as SoundBoard so one toggle silences both. The
// AudioContext is created lazily on first start() — start() is only ever
// called from a user-gesture path (the New Game click), so the browser's
// auto-play policy is satisfied.

const MUTE_KEY = 'tipping-point.muted.v1';
const MUSIC_VOL_KEY = 'tipping-point.musicVolume.v1';
const ASSET_BASE = import.meta.env?.BASE_URL ?? '/';

// URL-encode to survive the space in the filenames.
const DEFAULT_TRACKS = [
  'Music/Beneath the Noise.wav',
  'Music/Sunset Sky.wav',
].map((p) => encodeURI(`${ASSET_BASE}${p}`));

const CROSSFADE_SEC = 2.5;   // overlap between consecutive tracks
const FADE_IN_SEC   = 1.5;   // initial fade from silence when start() fires
const FADE_OUT_SEC  = 0.8;   // master fade when stop() fires
const DEFAULT_VOLUME = 0.35; // music sits well under SFX at this level

export class MusicPlayer {
  constructor({ tracks = DEFAULT_TRACKS, volume = DEFAULT_VOLUME } = {}) {
    this.tracks = tracks;
    // Stored volume (0..1) wins over the constructor default if present —
    // the settings modal persists through it.
    this.baseVolume = this._loadVolume(volume);
    this.muted = this._loadMuted();
    this.ctx = null;
    this.master = null;
    this.buffers = new Map();     // url → AudioBuffer
    this.activeSources = new Set();
    this.playing = false;
    this._playlist = [];
    this._playlistPos = 0;
    this._scheduleTimer = null;
    this._loadPromise = null;
  }

  _loadMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; }
    catch { return false; }
  }

  _loadVolume(fallback) {
    try {
      const raw = localStorage.getItem(MUSIC_VOL_KEY);
      if (raw == null) return fallback;
      const v = Number(raw);
      if (!Number.isFinite(v)) return fallback;
      return Math.max(0, Math.min(1, v));
    } catch {
      return fallback;
    }
  }

  setVolume(v) {
    const clamped = Math.max(0, Math.min(1, Number(v) || 0));
    this.baseVolume = clamped;
    try { localStorage.setItem(MUSIC_VOL_KEY, String(clamped)); } catch { /* ignore */ }
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const duck = this._duckFactor ?? 1;
    const target = this.muted ? 0 : this.baseVolume * duck;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(target, t + 0.15);
  }

  _ensureContext() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC();
      // Signal chain: sources → master (gain) → tension (lowpass) → destination.
      // Master is the published volume / mute surface; the tension filter
      // sits between master and destination so we can muffle the mix when
      // the world is in crisis without touching the volume the user set.
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.baseVolume;
      this.tension = this.ctx.createBiquadFilter();
      this.tension.type = 'lowpass';
      this.tension.frequency.value = 20000;  // transparent by default
      this.tension.Q.value = 0.7;
      this.master.connect(this.tension).connect(this.ctx.destination);
      this._duckFactor = 1;   // modal-duck multiplier, 0..1
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  // Temporarily pull master gain down to `factor * baseVolume` over `sec`
  // seconds. Used when an event modal opens — the music recedes so the
  // decision feels weighty. `restore()` brings it back.
  duck(factor = 0.4, sec = 0.35) {
    this._duckFactor = Math.max(0, Math.min(1, factor));
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const target = this.muted ? 0 : this.baseVolume * this._duckFactor;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(target, t + sec);
  }

  restore(sec = 0.6) {
    this._duckFactor = 1;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const target = this.muted ? 0 : this.baseVolume;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(target, t + sec);
  }

  // Mix tension — 0 = transparent, 1 = heavily muffled (as if the music is
  // being heard through a wall). Smoothly glides the lowpass cutoff.
  // Anchored by CarbonSystem state in main.js.
  setTension(level = 0) {
    const clamped = Math.max(0, Math.min(1, Number(level) || 0));
    if (!this.ctx || !this.tension) return;
    // Cutoff glides exponentially — 20000 (open) → 900 (closed).
    const cutoff = Math.max(600, 20000 * Math.pow(0.045, clamped));
    const t = this.ctx.currentTime;
    this.tension.frequency.cancelScheduledValues(t);
    this.tension.frequency.setValueAtTime(this.tension.frequency.value, t);
    this.tension.frequency.exponentialRampToValueAtTime(cutoff, t + 2.0);
  }

  async _loadBuffer(url) {
    if (this.buffers.has(url)) return this.buffers.get(url);
    if (!this.ctx) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(arr);
      this.buffers.set(url, buf);
      return buf;
    } catch (e) {
      console.warn('[music] load failed', url, e);
      return null;
    }
  }

  _loadAll() {
    if (!this._loadPromise) {
      this._loadPromise = Promise.all(this.tracks.map((u) => this._loadBuffer(u)));
    }
    return this._loadPromise;
  }

  // Fisher-Yates shuffle. If the new playlist would lead off with the track
  // that just played, swap it back so we never repeat at the boundary.
  _reshuffle() {
    const n = this.tracks.length;
    if (n <= 1) { this._playlist = [0]; this._playlistPos = 0; return; }
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const prevLast = this._playlist[this._playlist.length - 1];
    if (prevLast != null && order[0] === prevLast) {
      [order[0], order[1]] = [order[1], order[0]];
    }
    this._playlist = order;
    this._playlistPos = 0;
  }

  _nextIndex() {
    if (this._playlistPos >= this._playlist.length) this._reshuffle();
    return this._playlist[this._playlistPos++];
  }

  async start() {
    if (this.playing) return;
    const ctx = this._ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* ignore */ }
    }

    // If a prior stop() left the master faded to zero, lift it back now so
    // the per-source envelopes aren't masked.
    const t0 = ctx.currentTime;
    const duck = this._duckFactor ?? 1;
    this.master.gain.cancelScheduledValues(t0);
    this.master.gain.setValueAtTime(this.muted ? 0 : this.baseVolume * duck, t0);

    this.playing = true;

    await this._loadAll();
    if (!this.playing) return; // stop() called during decode

    const idx = this._nextIndex();
    const buf = this.buffers.get(this.tracks[idx]);
    if (!buf) { this.playing = false; return; }

    this._schedulePlay(buf, ctx.currentTime, FADE_IN_SEC);
  }

  // Plays `buffer` starting at audio-context time `startAt` with a fade-in of
  // `fadeInSec`. At `endAt - CROSSFADE_SEC` it queues the next track so the
  // two tracks' gains cross in the same window — a sample-accurate crossfade.
  _schedulePlay(buffer, startAt, fadeInSec) {
    const ctx = this.ctx;
    if (!ctx) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    src.connect(gain).connect(this.master);

    const fadeIn = Math.max(0.001, fadeInSec);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(1, startAt + fadeIn);

    const endAt = startAt + buffer.duration;
    const fadeOutStart = Math.max(startAt + fadeIn, endAt - CROSSFADE_SEC);
    gain.gain.setValueAtTime(1, fadeOutStart);
    gain.gain.linearRampToValueAtTime(0, endAt);

    src.start(startAt);
    try { src.stop(endAt + 0.05); } catch { /* ignore */ }

    this.activeSources.add(src);
    src.onended = () => {
      this.activeSources.delete(src);
      try { src.disconnect(); } catch { /* ignore */ }
      try { gain.disconnect(); } catch { /* ignore */ }
    };

    // Queue the next track just before this one starts fading out. A small
    // lead time (100 ms) keeps us comfortably ahead of the scheduler.
    const msUntilQueue = Math.max(0, (fadeOutStart - ctx.currentTime) * 1000 - 100);
    clearTimeout(this._scheduleTimer);
    this._scheduleTimer = setTimeout(() => {
      if (!this.playing) return;
      const nextBuf = this.buffers.get(this.tracks[this._nextIndex()]);
      if (nextBuf) this._schedulePlay(nextBuf, fadeOutStart, CROSSFADE_SEC);
    }, msUntilQueue);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearTimeout(this._scheduleTimer);
    this._scheduleTimer = null;
    const ctx = this.ctx;
    if (!ctx || !this.master) return;

    const t = ctx.currentTime;
    const current = this.master.gain.value;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(current, t);
    this.master.gain.linearRampToValueAtTime(0, t + FADE_OUT_SEC);

    const stopAt = t + FADE_OUT_SEC + 0.05;
    for (const src of this.activeSources) {
      try { src.stop(stopAt); } catch { /* ignore */ }
    }
  }

  setMuted(v) {
    this.muted = !!v;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch { /* ignore */ }
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const duck = this._duckFactor ?? 1;
    const target = this.muted ? 0 : this.baseVolume * duck;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(target, t + 0.25);
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }
}
