import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLocale, en } from '../index.js';

describe('t(key)', () => {
  beforeEach(() => setLocale(en));

  it('returns the key itself for unknown keys (safe fallback)', () => {
    expect(t('totally.missing.key')).toBe('totally.missing.key');
  });

  it('returns the template when no vars supplied', () => {
    expect(t('title.gameName')).toBe('TIPPING POINT');
  });

  it('interpolates named placeholders', () => {
    // Use a key that has variables.
    expect(t('toast.netZero.body', { country: 'Brazil', bonus: 18 }))
      .toBe('Brazil decarbonized. +18 Credits.');
  });

  it('leaves unknown placeholders untouched so authors notice', () => {
    const out = t('toast.netZero.body', { country: 'Brazil' });
    expect(out).toContain('Brazil');
    expect(out).toContain('{bonus}');
  });

  it('falls back to en when active locale lacks a key', () => {
    // Simulate a sparse locale that only overrides one string.
    setLocale({ 'title.gameName': 'VERDEPLANOS' });
    expect(t('title.gameName')).toBe('VERDEPLANOS');
    // Everything else falls through to en.
    expect(t('tutorial.dismiss')).toBe("Got it — let's go");
  });
});
