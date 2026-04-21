# ADR 0001 — Pure model layer for all game math

- **Status**: Accepted
- **Date**: 2026-04-21

## Context

Early iterations of the game mixed math and state writes inside "system" classes — e.g. `CarbonSystem.step()` both computed airborne-fraction ppm gain *and* assigned `world.co2ppm = ...`. Same with `AdoptionSystem` for spread, `ResearchSystem` for income, `ScoringSystem` for win conditions. Every balance change required running the game to see the effect; unit testing required mocking the bus, RNG, and state shape.

Once the codebase cleared ~5,000 lines we noticed three concrete pains:

1. **UI and engine would drift.** UI sometimes previewed a cost (`"$12"`) that the engine later charged differently (`$11`) because the two paths repeated the math.
2. **Balance tuning needed a running game** to verify; a typo in a multiplier couldn't fail at CI time.
3. **New mechanics** (diminishing returns, synergies, population, advisors) were pressured to land inside existing system classes, accreting complexity.

## Decision

Separate the codebase into four layers with strict responsibilities:

```
data/    → static blobs (countries, activities, events, profiles, advisors)
model/   → pure functions that read state snapshots and return numbers
systems/ → thin orchestrators: call model, write state, emit events
ui/      → read selectors, render, subscribe to events
```

The **model layer** holds every numeric calculation in the game. It never mutates state, never imports from `systems/` or `ui/`, and depends only on `data/` + `config/`. Each model file is one conceptual domain and is fully unit-testable.

Current modules:
- `model/Climate.js` — emissions, airborne fraction, ocean sink, nature removal, log-CO₂ forcing, temperature lag
- `model/Adoption.js` — spread fraction, resistance, will drift, net-zero
- `model/Economy.js` — income per tick, research cost, deploy cost
- `model/Population.js` — growth rate, climate mortality, adoption shield
- `model/Scoring.js` — CO₂ peak, win/lose verdict, letter grade
- `model/DeployEconomy.js` — diminishing returns + synergy composition
- `model/PoliticalGate.js` — will-gate verdict
- `model/Events.js` — declarative effect execution (see ADR 0002)

Systems are now near-trivial. `CarbonSystem.step()` is ~10 lines: call four pure functions from `model/Climate.js`, assign the results.

## Consequences

**Positive**

- UI and engine share the same number source. Drift is mechanically impossible.
- All math is unit-testable. Balance changes trip CI instead of shipping silently.
- New mechanics get a home: "add a function to the right `model/` file" is an obvious and low-controversy move.
- Data flow is acyclic: `data → model → systems → state → events → ui`.

**Negative**

- Slight indirection overhead — CarbonSystem's `step()` reads three model functions where it used to inline them.
- The layering rule has to be enforced by convention (no ESLint rule currently; see "Future work").

**Neutral**

- Selectors on `GameState.select` are thin wrappers around model functions. Having two import paths (`from 'core/GameState'` vs `from 'model/Population'`) is a minor trade-off we accept for clarity.

## Future work

- Add an ESLint rule (or dependency-cruiser config) that enforces the layering: `model/` can't import from `systems/` or `ui/`, `data/` can't import from anything under `src/` except `config/`.
- Move `systems/helpers.js` (a thin re-export shim) out once all UI imports move to `model/Economy.js` directly.
