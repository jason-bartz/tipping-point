// Floating toast stack. Centered above the map; capped so a flurry of events
// doesn't fill the screen. Toasts are a brief "just happened" signal —
// the full text of every beat also lands in the Dispatches tab, so they
// can be transient without losing any information.
//
// Queue strategy: toasts drip out on a minimum interval (MIN_INTERVAL_MS),
// so a burst of six events in one tick doesn't render as a wall of boxes
// instantly. If the queue outpaces display capacity, the oldest queued
// item is dropped (same tradeoff as MAX_TOASTS — dispatches has the full
// record). Dedup inside a 1.5 s window so the same text never stacks.

const MAX_TOASTS = 2;
const TOAST_MS = 5500;               // visible lifetime, matches CSS animation
const MIN_INTERVAL_MS = 550;         // minimum spacing between consecutive toasts
const DEDUP_WINDOW_MS = 1500;        // suppress identical title+body inside this window
const MAX_QUEUE = 6;

let stack = null;
const queue = [];
let lastFlushAt = 0;
let flushTimer = null;
const recent = new Map();            // `${title}|${body}` → expiry timestamp

function ensureStack() {
  if (stack && stack.isConnected) return stack;
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

function renderNow({ title, body, tone }) {
  const host = ensureStack();
  const el = document.createElement('div');
  el.className = `toast ${tone || ''}`;
  el.innerHTML = `<div class="toast-title">${title}</div><div class="toast-body">${body}</div>`;
  host.appendChild(el);
  while (host.children.length > MAX_TOASTS) host.firstElementChild.remove();
  setTimeout(() => el.remove(), TOAST_MS);
  lastFlushAt = performance.now();
}

function scheduleFlush() {
  if (flushTimer || queue.length === 0) return;
  const elapsed = performance.now() - lastFlushAt;
  const wait = Math.max(0, MIN_INTERVAL_MS - elapsed);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const next = queue.shift();
    if (next) renderNow(next);
    if (queue.length > 0) scheduleFlush();
  }, wait);
}

export function showToast(title, body, tone = 'neutral') {
  const key = `${title}|${body}`;
  const now = performance.now();
  const expiry = recent.get(key);
  if (expiry && expiry > now) return;                // same text, too soon
  recent.set(key, now + DEDUP_WINDOW_MS);
  // Trim dedup map opportunistically — O(n) but capped at a handful of entries.
  if (recent.size > 32) {
    for (const [k, e] of recent) { if (e < now) recent.delete(k); }
  }
  queue.push({ title, body, tone });
  while (queue.length > MAX_QUEUE) queue.shift();    // drop oldest if swamped
  scheduleFlush();
}
