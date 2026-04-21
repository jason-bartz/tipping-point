# ADR 0002 — Declarative effect system for events

- **Status**: Accepted
- **Date**: 2026-04-21

## Context

`src/data/events.js` ships ~50 random/interactive events. Early versions defined each outcome as an imperative lambda:

```js
apply: (s) => {
  s.world.co2ppm += 0.5;
  for (const c of Object.values(s.countries)) c.politicalWill = Math.min(100, c.politicalWill + 4);
}
```

This was expedient but had three problems:

1. **No typo safety.** `s.world.co2pmm += 0.5` silently no-ops. We found two of these by hand-testing.
2. **Untestable without a game.** Asserting "the heat dome event adds +4 will and +6 stress" required running `EventSystem.roll()` and reading state, with carefully-mocked RNG.
3. **No preview.** A future "advisor warns you about this event" UI would need to manually mirror the lambda's logic.

## Decision

Define event outcomes as arrays of small, named **operations** that `src/model/Events.js` applies. Each operation is a plain-data descriptor:

```js
effects: [
  { op: 'addWorld', field: 'co2ppm', value: 0.5 },
  { op: 'addAllCountries', field: 'politicalWill', value: 4 },
]
```

The executor handles field-specific clamping automatically (`politicalWill` → [10, 100], `adoption.*` → [0, 1], `co2ppm` never below preindustrial). Supported ops:

| op | purpose |
|---|---|
| `addWorld` | scalar delta on `world.<field>` |
| `addAllCountries` | bulk modify every country |
| `addCountries` + `where` | filter by shape-match / threshold, then modify |
| `addTarget` | modify the event's dynamically resolved target |
| `addTargetAllBranches` | shortcut for hitting all 6 adoption branches on the target |
| `addTargetRandomBranch` | RNG-picked single branch |
| `addRandomCountries` / `addRandomBranches` | shuffle + take N |

We keep `apply` as an escape hatch for the handful of events that are genuinely non-declarative (e.g. the geoengineering choice that floors temperature to 1.5°C instead of adding). When both are present, effects run first, then apply.

## Consequences

**Positive**

- Event authoring is pure data. Adding a new event ≈ writing JSON.
- **194 unit tests** (one per event × effects-array) auto-generate and assert each effects list runs cleanly against a baseline state. A typo like `addWorrld` or `adoption.engery` trips CI before merge.
- A future event-preview UI ("this event will cost 5 Credits and raise stress") is mechanical: walk the same array.
- Difficulty sliders are trivial to layer: a future "hard mode" scales every `value` by 1.2 without touching engine code.
- Save-replay determinism holds even more tightly: no closures in event data.

**Negative**

- More op kinds to maintain. Balanced against: we lose an entire *class* of bugs (typos in lambdas that silently don't throw).
- Escape-hatch `apply` is still there, so the system isn't 100% declarative. We consider this a feature — it preserves an authoring option for genuinely unique cases without pushing authors to contort ops.

## Future work

- Promote `apply` usages to new ops as patterns stabilize (e.g. `setWorld` for floors/caps would absorb the geoengineering case).
- A visual event-preview card that renders from the effects array.
