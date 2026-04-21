// Modal accessibility helpers. Every modal in the game should call
// `installModalA11y(rootEl, { onClose })` after mounting. The helper:
//   1. Tags the root with `role="dialog"` + `aria-modal="true"` so screen
//      readers announce it correctly.
//   2. Saves the element that had focus before the modal opened and restores
//      it on close (focus shouldn't stay trapped on a page behind the modal).
//   3. Moves focus into the first focusable element inside the modal.
//   4. Traps Tab / Shift+Tab inside the modal while it's open — cursor can't
//      wander back to page-level controls.
//   5. Wires Escape to trigger the caller's `onClose`.
//
// Returns a teardown function. Call it when the modal is removed to disarm
// the Tab/Escape listeners and restore focus.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * @param {HTMLElement} root — the modal's outermost element
 * @param {{ onClose?: () => void, label?: string }} [opts]
 * @returns {() => void} teardown
 */
export function installModalA11y(root, { onClose, label } = {}) {
  if (!root || typeof document === 'undefined') return () => {};

  const prevFocus = /** @type {HTMLElement | null} */ (document.activeElement);

  root.setAttribute('role', root.getAttribute('role') ?? 'dialog');
  root.setAttribute('aria-modal', 'true');
  if (label && !root.getAttribute('aria-label')) root.setAttribute('aria-label', label);

  const focusables = () => /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll(FOCUSABLE)))
    .filter((el) => el.offsetParent !== null || el === document.activeElement);

  // Move focus inside — preserve if a button inside was already focused,
  // otherwise pick the first focusable or the root itself. `preventScroll`
  // stops the browser from auto-scrolling the modal's scrollable body to
  // reveal the focused element (e.g. when the only control is a dismiss
  // button at the bottom, that scroll yanks the modal to the end on open).
  const pool = focusables();
  if (!root.contains(document.activeElement)) {
    (pool[0] ?? root).focus?.({ preventScroll: true });
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      onClose?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const els = focusables();
    if (!els.length) {
      e.preventDefault();
      return;
    }
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('keydown', onKey, true);

  return function teardown() {
    document.removeEventListener('keydown', onKey, true);
    // Restore focus only if it's still inside the dying modal — otherwise
    // the user clicked elsewhere and we shouldn't yank them back.
    if (root.contains(document.activeElement) && prevFocus && document.body.contains(prevFocus)) {
      try { prevFocus.focus(); } catch { /* ignore */ }
    }
  };
}
