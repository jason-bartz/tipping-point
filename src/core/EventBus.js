// Pub/sub bus. Systems never call each other directly; they publish events.
// Keeps coupling low — pull a system out, replace it, nothing else changes.

export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  emit(type, payload) {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const handler of set) {
      try { handler(payload); }
      catch (err) { console.error(`[bus:${type}]`, err); }
    }
  }

  once(type, handler) {
    const unsub = this.on(type, (p) => { unsub(); handler(p); });
    return unsub;
  }
}

// Event type constants. Stringly-typed events are a refactoring tax we decline.
export const EVT = {
  TICK: 'tick',
  STATE_CHANGED: 'stateChanged',
  RESEARCH_STARTED: 'researchStarted',
  RESEARCH_DONE: 'researchDone',
  DEPLOYED: 'deployed',
  DEPLOY_FAILED: 'deployFailed',
  RESEARCH_FAILED: 'researchFailed',
  NET_ZERO: 'netZero',
  EVENT_FIRED: 'eventFired',
  NEWS: 'news',
  MILESTONE: 'milestone',
  COLLECTABLE_CLAIMED: 'collectableClaimed',
  COUNTRY_SELECTED: 'countrySelected',
  POPULATION_CHANGED: 'populationChanged',
  ADVISOR_MOOD_CHANGED: 'advisorMoodChanged',
  ADVISOR_AGENDA_PROPOSED: 'advisorAgendaProposed',
  ADVISOR_AGENDA_RESOLVED: 'advisorAgendaResolved',
  ADVISOR_CONFLICT: 'advisorConflict',
  ADVISOR_WHISPER: 'advisorWhisper',
  ADVISOR_ABILITY_USED: 'advisorAbilityUsed',
  WON: 'won',
  LOST: 'lost',
};
