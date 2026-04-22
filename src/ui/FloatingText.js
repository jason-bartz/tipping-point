// Floating "+X" numbers. Spawns a tiny DOM element near a target (or at fixed
// coords), animates it up-and-fade via CSS, then removes it.
//
// Singleton API:
//   import { floatAt, installFloatingText, teardownFloatingText } from './FloatingText.js';
//   floatAt(elementOrClientXY, '+8% Transport', 'good');
//
// Stagger: if several pop-ups land in the same frame on the same point, we
// jitter their spawn positions so they don't stack on each other.

const LAYER_ID = 'gp-float-layer';
const LIFETIME_MS = 1200;

let layer = null;
const recent = []; // {x, y, t}

function getLayer() {
  if (!layer) {
    layer = document.getElementById(LAYER_ID);
    if (!layer) {
      layer = document.createElement('div');
      layer.id = LAYER_ID;
      layer.className = 'gp-float-stack';
      document.body.appendChild(layer);
    }
  }
  return layer;
}

export function installFloatingText() {
  getLayer();
}

export function floatAt(target, text, tone = 'info') {
  const host = getLayer();
  if (!host) return;
  let x, y;
  if (target && typeof target.getBoundingClientRect === 'function') {
    const r = target.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + 6;
  } else if (target && typeof target.x === 'number') {
    x = target.x;
    y = target.y ?? 0;
  } else {
    return;
  }
  const now = performance.now();
  // Drop stale entries in place.
  for (let i = recent.length - 1; i >= 0; i--) {
    if (now - recent[i].t > 250) recent.splice(i, 1);
  }
  let attempts = 0;
  let spawnX = x, spawnY = y;
  while (attempts++ < 4 && recent.some(p => Math.abs(p.x - spawnX) < 30 && Math.abs(p.y - spawnY) < 16)) {
    spawnX = x + (Math.random() * 40 - 20);
    spawnY = y + (Math.random() * 14 - 4);
  }
  recent.push({ x: spawnX, y: spawnY, t: now });

  const el = document.createElement('div');
  el.className = `gp-float ${tone || 'info'}`;
  el.textContent = text;
  el.style.left = `${Math.round(spawnX)}px`;
  el.style.top  = `${Math.round(spawnY)}px`;
  host.appendChild(el);
  setTimeout(() => el.remove(), LIFETIME_MS);
}

export function teardownFloatingText() {
  // Clear any pop-ups still on screen. Keep the layer in the DOM — cheaper to
  // reuse than recreate on the next game.
  if (layer) layer.innerHTML = '';
  recent.length = 0;
}
