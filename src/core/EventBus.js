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
  // Fired when a player resolves an interactive event. Carries a concrete,
  // human-readable effects summary so the UI can surface the outcome
  // immediately (toast, receipt, etc.) — separate from the flavor headline
  // that goes to the news ticker.
  DECISION_RESOLVED: 'decisionResolved',
  // Fired when a pending interactive event times out without a choice.
  // Carries the same shape as DECISION_RESOLVED plus `expired: true` so UI
  // layers can distinguish "you chose X" from "you let it run out". The
  // penalty has already been applied to state by the time this fires.
  DECISION_EXPIRED: 'decisionExpired',
  // Fired when a new dispatch lands in the persistent log. Panels listen so
  // they can badge the unread count and animate the new row. Payload is the
  // dispatch record (see model/Dispatches.js).
  DISPATCH_LOGGED: 'dispatchLogged',
  // Fired when the unread set changes (new dispatch, mark-read, mark-all).
  // Tab badge listens to this so it can update without re-reading state.
  DISPATCH_UNREAD_CHANGED: 'dispatchUnreadChanged',
  // Fired when the decision/event modal opens or closes. Main.js uses this to
  // dim the world and duck the music so decisions feel weighty. Payload:
  // `{ open: boolean, eventId?: string }`.
  EVENT_MODAL_STATE: 'eventModalState',
  // Forestry / government pipeline. Fired when a country's carbonLiability
  // crosses the cap and the shadow promotes to incumbent. Payload: the
  // succession summary from model/Government.succeed() — outgoing, incoming,
  // swing, countryId, countryName. UI listens to toast + dispatch it.
  GOVERNMENT_FELL: 'governmentFell',
  WON: 'won',
  LOST: 'lost',
  // Biodiversity pipeline. SpeciesSystem ticks population health against
  // temperature and emits these as species cross IUCN status thresholds.
  // NewsSystem converts them into headlines; significant transitions (EX, EW,
  // rediscovery) also log to the dispatches feed. Payload shape is consistent
  // across the three: { def, prevStatus, nextStatus } — `def` is the static
  // species record from data/species.js, status strings are IUCN codes.
  SPECIES_STATUS_CHANGED: 'speciesStatusChanged',
  SPECIES_EXTINCT: 'speciesExtinct',
  SPECIES_REDISCOVERED: 'speciesRediscovered',
};
