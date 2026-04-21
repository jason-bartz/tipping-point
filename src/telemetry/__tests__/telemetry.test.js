// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { track, setReporter, MemoryReporter, install, ConsoleReporter } from '../index.js';

class FakeBus {
  constructor() {
    this.listeners = new Map();
  }
  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }
  emit(type, payload) {
    this.listeners.get(type)?.forEach((fn) => fn(payload));
  }
}

const mkState = () => ({
  meta: { homeCountryId: 'USA', seed: 42, tick: 0 },
  world: { deployCount: {}, co2ppm: 420 },
});

describe('telemetry', () => {
  beforeEach(() => setReporter(null));

  it('no-ops when no reporter is installed', () => {
    expect(() => track('foo', { bar: 1 })).not.toThrow();
  });

  it('routes track() to the active reporter', () => {
    const mem = MemoryReporter();
    setReporter(mem);
    track('game_started', { home: 'USA' });
    track('research_done', { activity: 'solar_power' });
    const log = mem.drain();
    expect(log.length).toBe(2);
    expect(log[0].event).toBe('game_started');
    expect(log[1].event).toBe('research_done');
  });

  it('install() emits game_started on startup and session_ended on teardown', () => {
    const mem = MemoryReporter();
    setReporter(mem);
    const bus = new FakeBus();
    const state = mkState();
    const teardown = install(bus, state, { autoDevReporter: false });
    expect(mem.peek()[0].event).toBe('game_started');
    teardown();
    expect(mem.drain().pop().event).toBe('session_ended');
  });

  it('forwards high-signal bus events to the reporter', () => {
    const mem = MemoryReporter();
    setReporter(mem);
    const bus = new FakeBus();
    const state = mkState();
    install(bus, state, { autoDevReporter: false });

    bus.emit('researchDone', { activity: { id: 'solar_power' } });
    bus.emit('netZero',      { country: { id: 'USA' } });
    bus.emit('eventFired',   { event: { id: 'heat_dome' }, tone: 'bad' });

    const events = mem.peek().map((e) => e.event);
    expect(events).toContain('research_done');
    expect(events).toContain('country_net_zero');
    expect(events).toContain('event_fired');
  });

  it('only reports a deploy_milestone every 10th deploy', () => {
    const mem = MemoryReporter();
    setReporter(mem);
    const bus = new FakeBus();
    const state = mkState();
    install(bus, state, { autoDevReporter: false });

    // simulate 10 deploys by bumping the state counter ourselves, then emit
    state.world.deployCount.USA = { solar_power: 0 };
    for (let i = 1; i <= 12; i++) {
      state.world.deployCount.USA.solar_power = i;
      bus.emit('deployed', { activity: { id: 'solar_power' }, country: { id: 'USA' } });
    }
    const milestones = mem.peek().filter((e) => e.event === 'deploy_milestone');
    expect(milestones.length).toBe(1);
    expect(milestones[0].props.total).toBe(10);
  });

  it('ConsoleReporter is tolerated without throwing', () => {
    setReporter(ConsoleReporter);
    expect(() => track('ping')).not.toThrow();
  });
});
