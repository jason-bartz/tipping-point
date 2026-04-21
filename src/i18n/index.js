// Internationalization scaffolding. One `t(key, vars)` function that reads
// from the active locale; locale files register themselves via `setLocale`.
//
// Format: flat keys joined by `.` (e.g. `"tutorial.title"`, `"toast.saved"`).
// Unknown keys return the key itself — a safe fallback that won't blank the
// UI when translations lag.
//
// Variable interpolation uses `{name}` placeholders:
//   t('tutorial.step2', { ticks: 6 })  →  "Research costs 6 ticks"
//
// This module is the single place UI code imports from for strings. Mass
// extraction lives in `en.js` — start there when adding copy.

import { en } from './en.js';

/** @type {Record<string, string>} */
let active = en;

export function setLocale(bundle) {
  active = bundle ?? en;
}

/**
 * @param {string} key — flat, dot-separated
 * @param {Record<string, string | number>} [vars]
 * @returns {string}
 */
export function t(key, vars) {
  const template = active?.[key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`,
  );
}

/** Export the default bundle so tests can inspect the base keys. */
export { en };
