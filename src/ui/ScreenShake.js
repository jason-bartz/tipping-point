// Screen shake. Applies a brief transform animation to the game root in
// response to milestones. Three intensities:
//   'soft'  — small beat (decision auto-pause, collectable grab)
//   'thump' — event (Net Zero, research done, major milestone)
//   'quake' — win/loss, +4°C warning, extinction beats
//
// Respects prefers-reduced-motion via the CSS media query — the keyframes
// collapse to no-ops there, so we don't need a JS guard.

const CLASS_BY_KIND = {
  soft:  'gp-shake-soft',
  thump: 'gp-shake-thump',
  quake: 'gp-shake-quake',
};
const DUR_BY_KIND = { soft: 320, thump: 460, quake: 750 };

let target = null;
let timer = null;

export function installScreenShake(el) {
  target = el;
}

export function shakeScreen(kind = 'thump') {
  if (!target) return;
  const cls = CLASS_BY_KIND[kind] ?? CLASS_BY_KIND.thump;
  const dur = DUR_BY_KIND[kind] ?? DUR_BY_KIND.thump;
  for (const v of Object.values(CLASS_BY_KIND)) target.classList.remove(v);
  void target.offsetWidth; // reflow → restart animation
  target.classList.add(cls);
  clearTimeout(timer);
  timer = setTimeout(() => target?.classList.remove(cls), dur);
}

export function teardownScreenShake() {
  clearTimeout(timer);
  timer = null;
  if (target) for (const v of Object.values(CLASS_BY_KIND)) target.classList.remove(v);
  target = null;
}
