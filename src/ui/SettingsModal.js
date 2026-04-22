// Settings modal — volume, accessibility, and motion toggles. Persists to
// localStorage; audio settings apply live via SoundBoard/MusicPlayer setters.
// Accessibility toggles add a class to <html> so CSS can target them.

import { installModalA11y } from './modal-a11y.js';
import { showSaves } from './SavesModal.js';

const KEYS = {
  reduceMotion: 'tipping-point.a11y.reduceMotion.v1',
  highContrast: 'tipping-point.a11y.highContrast.v1',
  largeText:    'tipping-point.a11y.largeText.v1',
};

const CLS = {
  reduceMotion: 'gp-reduce-motion',
  highContrast: 'gp-high-contrast',
  largeText:    'gp-large-text',
};

const AUTO_COLLECT_KEY = 'tipping-point.gameplay.autoCollect.v1';

function readFlag(key) {
  try { return localStorage.getItem(key) === '1'; }
  catch { return false; }
}

function writeFlag(key, v) {
  try { localStorage.setItem(key, v ? '1' : '0'); }
  catch { /* ignore */ }
}

// Read the auto-collect preference. CollectableSystem calls this at claim
// time, so toggling the setting takes effect immediately for pending pickups.
export function readAutoCollect() {
  return readFlag(AUTO_COLLECT_KEY);
}

// Apply stored accessibility flags to the document root. Safe to call on every
// page load (idempotent) — the settings modal calls it after each toggle.
export function applyAccessibilityFlags() {
  const root = document.documentElement;
  root.classList.toggle(CLS.reduceMotion, readFlag(KEYS.reduceMotion));
  root.classList.toggle(CLS.highContrast, readFlag(KEYS.highContrast));
  root.classList.toggle(CLS.largeText,    readFlag(KEYS.largeText));
}

export function showSettings({ board, music, fireAmbience, state, onMuteChanged, onLoadSlot } = {}) {
  if (document.querySelector('.settings-modal')) return;

  const sfxVol   = Math.round((board?.volume ?? 0.95) * 100);
  const musicVol = Math.round((music?.baseVolume ?? 0.35) * 100);
  const muted    = !!(board?.muted ?? false);
  const reduceMotion = readFlag(KEYS.reduceMotion);
  const highContrast = readFlag(KEYS.highContrast);
  const largeText    = readFlag(KEYS.largeText);
  const autoCollect  = readFlag(AUTO_COLLECT_KEY);

  const modal = document.createElement('div');
  modal.className = 'modal settings-modal';
  modal.innerHTML = `<div class="settings-card" role="dialog" aria-label="Settings">
    <button class="modal-close" type="button" aria-label="Close settings">×</button>
    <h2>Settings</h2>

    <div class="settings-section">
      <div class="settings-section-title">Audio</div>

      <label class="settings-row settings-row-toggle">
        <span class="settings-label">Mute all sound</span>
        <button class="settings-toggle ${muted ? 'on' : ''}" type="button" data-toggle="mute" aria-pressed="${muted}">
          <span class="settings-toggle-track"><span class="settings-toggle-thumb"></span></span>
        </button>
      </label>

      <label class="settings-row">
        <span class="settings-label">Sound effects</span>
        <input class="settings-slider" type="range" min="0" max="100" step="1" value="${sfxVol}" data-slider="sfx" aria-label="Sound effects volume" />
        <span class="settings-val" data-val="sfx">${sfxVol}</span>
      </label>

      <label class="settings-row">
        <span class="settings-label">Music</span>
        <input class="settings-slider" type="range" min="0" max="100" step="1" value="${musicVol}" data-slider="music" aria-label="Music volume" />
        <span class="settings-val" data-val="music">${musicVol}</span>
      </label>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Accessibility</div>

      <label class="settings-row settings-row-toggle">
        <span class="settings-label">Reduce motion
          <span class="settings-sub">Cuts shake, pulse, and floating-text animations.</span>
        </span>
        <button class="settings-toggle ${reduceMotion ? 'on' : ''}" type="button" data-toggle="reduceMotion" aria-pressed="${reduceMotion}">
          <span class="settings-toggle-track"><span class="settings-toggle-thumb"></span></span>
        </button>
      </label>

      <label class="settings-row settings-row-toggle">
        <span class="settings-label">High contrast
          <span class="settings-sub">Thicker borders, stronger colors.</span>
        </span>
        <button class="settings-toggle ${highContrast ? 'on' : ''}" type="button" data-toggle="highContrast" aria-pressed="${highContrast}">
          <span class="settings-toggle-track"><span class="settings-toggle-thumb"></span></span>
        </button>
      </label>

      <label class="settings-row settings-row-toggle">
        <span class="settings-label">Larger text
          <span class="settings-sub">Bumps UI text up ~15%.</span>
        </span>
        <button class="settings-toggle ${largeText ? 'on' : ''}" type="button" data-toggle="largeText" aria-pressed="${largeText}">
          <span class="settings-toggle-track"><span class="settings-toggle-thumb"></span></span>
        </button>
      </label>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Gameplay</div>

      <label class="settings-row settings-row-toggle">
        <span class="settings-label">Auto-collect
          <span class="settings-sub">Collectables are picked up automatically after a short delay.</span>
        </span>
        <button class="settings-toggle ${autoCollect ? 'on' : ''}" type="button" data-toggle="autoCollect" aria-pressed="${autoCollect}">
          <span class="settings-toggle-track"><span class="settings-toggle-thumb"></span></span>
        </button>
      </label>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">Saves</div>
      <div class="settings-row settings-row-toggle">
        <span class="settings-label">Save slots
          <span class="settings-sub">Manage manual saves — copy the current run into Slot A, B, or C.</span>
        </span>
        <button class="saves-action saves-open" type="button">Open</button>
      </div>
    </div>

    <div class="settings-foot">
      <button class="settings-reset" type="button">Reset to defaults</button>
      <button class="settings-dismiss" type="button">Done</button>
    </div>
  </div>`;

  document.body.appendChild(modal);

  const wasPaused = state?.meta?.paused;
  if (state) state.meta.paused = true;

  const close = () => {
    teardownA11y();
    modal.remove();
    if (state && wasPaused === false) state.meta.paused = false;
  };

  const teardownA11y = installModalA11y(modal.querySelector('.settings-card'), {
    onClose: close,
    label: 'Settings',
  });

  // Sliders — live update.
  const sfxSlider   = modal.querySelector('[data-slider="sfx"]');
  const musicSlider = modal.querySelector('[data-slider="music"]');
  const sfxVal   = modal.querySelector('[data-val="sfx"]');
  const musicVal = modal.querySelector('[data-val="music"]');

  sfxSlider.addEventListener('input', () => {
    const pct = Number(sfxSlider.value);
    sfxVal.textContent = String(pct);
    board?.setVolume?.(pct / 100);
    fireAmbience?.setVolume?.(pct / 100);
  });
  sfxSlider.addEventListener('change', () => {
    // Preview beep at the new level so the player can hear the change.
    board?.collectable?.();
  });

  musicSlider.addEventListener('input', () => {
    const pct = Number(musicSlider.value);
    musicVal.textContent = String(pct);
    music?.setVolume?.(pct / 100);
  });

  // Toggles.
  const wireToggle = (btn, onChange) => {
    btn.addEventListener('click', () => {
      const on = !(btn.classList.contains('on'));
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
      onChange(on);
    });
  };

  wireToggle(modal.querySelector('[data-toggle="mute"]'), (on) => {
    board?.setMuted?.(on);
    music?.setMuted?.(on);
    fireAmbience?.setMuted?.(on);
    onMuteChanged?.(on);
  });

  for (const [flag, key] of Object.entries(KEYS)) {
    wireToggle(modal.querySelector(`[data-toggle="${flag}"]`), (on) => {
      writeFlag(key, on);
      document.documentElement.classList.toggle(CLS[flag], on);
    });
  }

  wireToggle(modal.querySelector('[data-toggle="autoCollect"]'), (on) => {
    writeFlag(AUTO_COLLECT_KEY, on);
  });

  // Reset.
  modal.querySelector('.settings-reset').addEventListener('click', () => {
    board?.setVolume?.(0.95);
    music?.setVolume?.(0.35);
    board?.setMuted?.(false);
    music?.setMuted?.(false);
    fireAmbience?.setVolume?.(0.95);
    fireAmbience?.setMuted?.(false);
    for (const [flag, key] of Object.entries(KEYS)) {
      writeFlag(key, false);
      document.documentElement.classList.remove(CLS[flag]);
    }
    writeFlag(AUTO_COLLECT_KEY, false);
    onMuteChanged?.(false);
    close();
    showSettings({ board, music, fireAmbience, state, onMuteChanged });
  });

  modal.querySelector('.saves-open')?.addEventListener('click', () => {
    showSaves({
      mode: 'ingame',
      state,
      onLoad: (slotId) => {
        close();
        onLoadSlot?.(slotId);
      },
    });
  });

  modal.querySelector('.modal-close').addEventListener('click', close);
  modal.querySelector('.settings-dismiss').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}
