// Looping fire crackle that plays while wildfires are burning on the map.
// Volume scales with the number of concurrent burns: soft when a single
// flame is up, louder during a wildfire event — but never above 90% of the
// SFX master, so it can't drown out gameplay cues.
//
// Uses an HTMLAudioElement (rather than decoding the file through SoundBoard's
// WebAudio graph) because this is a long-running, always-looped clip that
// doesn't need the pulse/noise synthesis machinery. Shares the SFX mute and
// volume localStorage keys so one toggle affects everything.

const MUTE_KEY = 'tipping-point.muted.v1';
const SFX_VOL_KEY = 'tipping-point.sfxVolume.v1';
const DEFAULT_SFX_VOL = 0.95;

const FIRE_SRC = '/sounds/fire.mp3';
const MAX_VOLUME = 0.9;

// Count → raw fire loudness before SFX master multiplies in. Soft at one
// flame, ramps up so a full wildfire event reads louder, hits the 0.9 cap
// around nine concurrent fires (a wildfire or wildfire_smog event peaks
// there).
function fireFactor(count) {
  if (count <= 0) return 0;
  return Math.min(MAX_VOLUME, 0.14 + 0.07 * (count - 1));
}

function loadMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; }
  catch { return false; }
}

function loadSfxVolume() {
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

export class FireAmbience {
  constructor() {
    this.count = 0;
    this.muted = loadMuted();
    this.sfxVolume = loadSfxVolume();
    this.audio = null;
    this._playing = false;

    // Defer element creation until the first setFireCount(n>0) call — avoids
    // a network fetch for the asset in runs where no fire ever burns (rare,
    // but keeps teardown cheap and idle runs silent on the wire).
  }

  _ensureAudio() {
    if (this.audio) return this.audio;
    if (typeof Audio === 'undefined') return null;
    const a = new Audio(FIRE_SRC);
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    this.audio = a;
    return a;
  }

  setFireCount(n) {
    const next = Math.max(0, Math.floor(n));
    if (next === this.count) return;
    this.count = next;
    this._apply();
  }

  setMuted(v) {
    this.muted = !!v;
    this._apply();
  }

  setVolume(v) {
    const clamped = Math.max(0, Math.min(1, Number(v) || 0));
    this.sfxVolume = clamped;
    this._apply();
  }

  _apply() {
    if (this.count <= 0 || this.muted || this.sfxVolume <= 0) {
      this._stop();
      return;
    }
    const audio = this._ensureAudio();
    if (!audio) return;
    audio.volume = Math.min(MAX_VOLUME, fireFactor(this.count)) * this.sfxVolume;
    this._start();
  }

  _start() {
    const audio = this.audio;
    if (!audio || this._playing) return;
    // play() returns a promise that rejects if the browser's autoplay policy
    // blocks playback (no user gesture yet). Swallow it — the next
    // setFireCount after a click/keypress will try again, and by then the
    // page will have had a gesture.
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => { this._playing = false; });
    this._playing = true;
  }

  _stop() {
    const audio = this.audio;
    if (!audio || !this._playing) return;
    audio.pause();
    audio.currentTime = 0;
    this._playing = false;
  }

  destroy() {
    this._stop();
    if (this.audio) {
      this.audio.src = '';
      this.audio = null;
    }
    this.count = 0;
  }
}
