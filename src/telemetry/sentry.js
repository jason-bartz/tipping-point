// Sentry integration. No-op when VITE_SENTRY_DSN is unset, so dev builds and
// self-hosted deploys without an account stay quiet.
//
// Three surfaces:
//   · initSentry()  — call once from main.js before app code runs. Auto-binds
//                     window.onerror + unhandledrejection.
//   · captureError(err, ctx) — explicit capture for caught/swallowed errors
//                              (save/load failures, map-init errors).
//   · SentryReporter — adapter for the existing telemetry interface so
//                      `track()` events become Sentry breadcrumbs.

import * as Sentry from '@sentry/browser';

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_RELEASE,
    // 10% perf sampling during launch week to catch long-session regressions
    // without swamping the Sentry quota. Dial back to 0 once the dashboard is
    // quiet — the errors path is always 100%.
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip query string from URL — debug flags like ?cheats=1 are
      // gameplay state, not useful for triage and noisy in dashboards.
      if (event.request?.url) {
        try { event.request.url = new URL(event.request.url).origin + new URL(event.request.url).pathname; }
        catch { /* leave as-is */ }
      }
      return event;
    },
  });
  initialized = true;
}

export function captureError(err, context = {}) {
  if (!initialized) return;
  Sentry.captureException(err, { extra: context });
}

export const SentryReporter = {
  track(event, props) {
    if (!initialized) return;
    Sentry.addBreadcrumb({
      category: 'gameplay',
      message: event,
      data: props,
      level: 'info',
    });
  },
};
