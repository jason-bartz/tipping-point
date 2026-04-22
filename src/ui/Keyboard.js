// Global keyboard shortcuts. Inactive while focus is in an input. Escape is
// handled by individual modals themselves (scoped listener) — we don't bind
// it here to avoid fighting their lifecycle.
//
//   Space / P   — toggle pause
//   1 / 2 / 4   — set speed
//   M           — toggle mute
//   H / ?       — open help
//   S           — open stats
//   ,           — open settings
//   A           — open achievements

export function installKeyboard(loop, { onHelp, onStats, onMute, onSettings, onAchievements } = {}) {
  const handler = (e) => {
    if (!e || e.defaultPrevented) return;
    if (e.target && ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    // Ignore if any modifier is held (browser shortcuts, menus, etc).
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const state = loop.state;
    switch (e.key) {
      case ' ':
      case 'p':
      case 'P':
        loop.setPaused(!state.meta.paused); e.preventDefault(); break;
      case '1': loop.setPaused(false); loop.setSpeed(1); break;
      case '2': loop.setPaused(false); loop.setSpeed(2); break;
      case '4': loop.setPaused(false); loop.setSpeed(4); break;
      case 'm':
      case 'M':
        onMute?.(); break;
      case '?':
      case 'h':
      case 'H':
        onHelp?.(); break;
      case 's':
      case 'S':
        // Don't steal browser save; only match when no modal is open.
        if (!document.querySelector('.modal')) onStats?.();
        break;
      case ',':
        if (!document.querySelector('.modal')) onSettings?.();
        break;
      case 'a':
      case 'A':
        if (!document.querySelector('.modal')) onAchievements?.();
        break;
      default: return;
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}
