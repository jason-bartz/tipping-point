// Floating toast stack. Centered above the map; capped so a flurry of events
// doesn't fill the screen. Duration matches the toastOut CSS keyframe.
//
// Toasts are now a brief "just happened" signal — the full text, and every
// beat that scrolls by, lives in the Dispatches tab on the right panel. So
// they can be short, quiet, and transient without losing any information.

const MAX_TOASTS = 2;
const TOAST_MS = 3500;

let stack = null;

// Toast stack lives inside the HUD's center alert zone when available, so
// alerts don't cover the map's recovery bar. Falls back to a body-anchored
// overlay for screens without a game HUD (end screen, modals).
function ensureStack() {
  if (stack && stack.isConnected) return stack;
  const hudZone = document.getElementById('hud-alert-zone');
  if (hudZone) {
    stack = hudZone;
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-atomic', 'false');
    return stack;
  }
  stack = document.getElementById('toast-stack');
  if (stack) return stack;
  stack = document.createElement('div');
  stack.id = 'toast-stack';
  stack.className = 'toast-stack';
  stack.setAttribute('aria-live', 'polite');
  stack.setAttribute('aria-atomic', 'false');
  document.body.appendChild(stack);
  return stack;
}

export function showToast(title, body, tone = 'neutral') {
  const host = ensureStack();
  const el = document.createElement('div');
  el.className = `toast ${tone || ''}`;
  el.innerHTML = `<div class="toast-title">${title}</div><div class="toast-body">${body}</div>`;
  host.appendChild(el);
  while (host.children.length > MAX_TOASTS) host.firstElementChild.remove();
  setTimeout(() => el.remove(), TOAST_MS);
}
