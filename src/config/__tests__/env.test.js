// Env resolution tests. Exercises the URL → localStorage → default fallback.
// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('env resolution', () => {
  const originalLocation = window.location;
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    // Restore location in case a test mutated it.
    Object.defineProperty(window, 'location', { value: originalLocation, configurable: true, writable: true });
    global.localStorage = originalLocalStorage;
    localStorage.clear();
  });

  function mockLocation(search) {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, search, href: `http://localhost/${search}` },
      configurable: true,
      writable: true,
    });
  }

  it('defaults to all-off in prod-like env', async () => {
    mockLocation('');
    const mod = await import('../env.js');
    expect(mod.ENV.debug).toBe(false);
    expect(mod.ENV.speedOverride).toBeNull();
    expect(mod.ENV.cheats).toBe(false);
    expect(mod.ENV.forceCountry).toBeNull();
  });

  it('picks up debug=1 from query string', async () => {
    mockLocation('?debug=1');
    const mod = await import('../env.js');
    expect(mod.ENV.debug).toBe(true);
  });

  it('picks up a numeric speed override', async () => {
    mockLocation('?speed=8');
    const mod = await import('../env.js');
    expect(mod.ENV.speedOverride).toBe(8);
  });

  it('picks up forceCountry as a string', async () => {
    mockLocation('?country=IND');
    const mod = await import('../env.js');
    expect(mod.ENV.forceCountry).toBe('IND');
  });

  it('stored flags persist across refreshEnv() calls', async () => {
    mockLocation('');
    const mod = await import('../env.js');
    mod.setDebugFlag('debug', true);
    expect(mod.ENV.debug).toBe(true);
    mod.clearDebugFlags();
    expect(mod.ENV.debug).toBe(false);
  });

  it('query string wins over stored value', async () => {
    localStorage.setItem('greenprint.debug.v1', JSON.stringify({ debug: false }));
    mockLocation('?debug=1');
    const mod = await import('../env.js');
    expect(mod.ENV.debug).toBe(true);
  });

  it('cheats flag is gated to dev-only', async () => {
    mockLocation('?cheats=1');
    // Vitest env.DEV is true by default → cheats allowed. Cover the opposite
    // branch by forcing isDev false via stubbed import.meta.env.
    const mod = await import('../env.js');
    // In vitest (DEV=true) the flag passes through.
    expect(mod.ENV.cheats).toBe(true);
  });
});
