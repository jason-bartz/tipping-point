# Tipping Point

A strategy game where you fight to decarbonize the planet before runaway climate change locks in. Instead of spreading a contagion, you spread solutions — research clean activities in one country and watch them ripple outward to neighbors.

## Premise

The year is 2026. Atmospheric CO₂ is at 420 ppm. Global temperature is +1.2°C above pre-industrial. The game has no fixed end year — you play until you **reverse** the curve (win) or temperature crosses **+4°C** and civilizational adaptation fails (loss, per IPCC / "Hothouse Earth" thresholds).

You don't pick a strategy out of the air. You pick a **country**, and the country *is* the strategy. Each of the ten starters has distinct strengths, challenges, and one signature mechanical bonus. The opening moves, the pacing, and the narrative all feel different depending on who you play as.

## Game Loop

One tick = one quarter of a year at 1× speed (4.5 real-world seconds). Every tick:

1. Each country's baseline emissions get a small BAU creep (economies grow); the creep is dampened proportionally to clean adoption.
2. Global emissions roll up. CO₂ updates using an airborne-fraction model, with natural sinks and nature-based removals netted out.
3. Temperature chases its CO₂-driven equilibrium with lag.
4. Climate Points accumulate (base rate + Net-Zero-country bonuses).
5. Researched activities spread from adopted countries to their neighbors (gated by political will and branch-specific resistance).
6. Political will drifts toward 50 — **faster when it's hot**. Climate anxiety is a real mechanic.
7. Random events fire with `BALANCE.eventFireChancePerTick` probability. Some are positive, some negative, some demand a choice.
8. The news ticker rolls a headline (rate-limited so it isn't spammy).
9. **Collectable bubbles** spawn on the map: Grassroots, Garden Plot, ESG Shift, Climate Rally, Policy Breakthrough. Each grants Credits plus a distinct strategic effect.
10. Win/loss check.

Player actions happen in real time. You can pause and tune things. Five shortcuts you'll use constantly: **Space** to pause, **1/2/4** for speed, **M** for mute, **H** for help, **S** for stats.

## Starter Countries

Ten options across four difficulty bands:

- **Easy** — Nordic Bloc, Germany
- **Medium** — United Kingdom, Japan, Brazil
- **Hard** — United States, China, India
- **Very Hard** — Saudi Arabia, Russia

Each profile carries a writeup, strengths, challenges, suggested opening, signature bonus, and two pre-researched starter activities. See [`src/data/profiles.js`](src/data/profiles.js) for the full roster.

## The Research Tree

Six branches, 82 activities, four tiers.

- **Energy**: Solar, Wind, Geothermal, Grid Mod, SMRs → Solar Mandate, Perovskite, Offshore Wind → Solar Export Grid, Virtual Power Plants → Commercial Fusion.
- **Transport**: Cycling, EV Subsidies, HSR, SAF → Micromobility, EV Mandates → ICE Phaseout, EV Fast-Charge Grid → Maglev Network.
- **Industry**: Heat Pumps, Circular Econ, Green Steel/Cement → Retrofits → Passive House, Industrial Electrification, Hydrogen Industry.
- **Land**: Reforestation, Regen Ag, Plant Subsidy, Mangrove → Rewilding, Biochar, Kelp → Alt Proteins.
- **Capture**: Enhanced Weathering, BECCS, DAC → Ocean Alkalinity, DAC Network → BECCS Network → Gigaton Capture.
- **Policy**: Green Bonds, Carbon Pricing, FF Subsidy Cut → Methane Pledge+, Global Carbon Market → Climate Finance → Loss & Damage Fund, Planetary Treaty.

Tier bands (Credits | ticks to research): **T1** 1–3 | 3–5 · **T2** 4–8 | 10–13 · **T3** 10–13 | 28–32 · **T4** 22–30 | 60–80.

**One research slot per branch**, so up to six projects run in parallel. The panel shows a live countdown.

## Countries

31 countries plus regional blocs (Nordic Bloc, Benelux, Gulf States, Southeast Asia, East Africa, Eastern Europe). Each has:

- Position + ISO-N3 polygon set (regional blocs aggregate multiple polygons)
- Base annual emissions (GtCO₂/yr)
- Economic infrastructure type (industrial, mixed, agricultural, petrostate, service)
- Starting political will (0-100)
- Starting per-branch adoption (0-1), derived from infra type with country-specific overrides that reflect mid-2020s reality
- Neighbor adjacency (auto-symmetrized and phantom-filtered at state creation)

A country with ≥80% average adoption across all six branches hits **Net Zero** and becomes a permanent accelerator for neighbors.

## Events

164 events across four cohorts:

- **Global crises** (always eligible): oil lobby wins, heat dome, recession, greenwashing, supply shock, grid cyber attack, populist backlash…
- **Guarded tipping points**: permafrost methane burp, Arctic ice-free summer, Amazon dieback, coral bleaching, carbon bomb. These only fire when the world is already in a crisis corridor — they punish bad trajectories, not random bad luck.
- **Global opportunities**: solar breakthroughs, youth surges, fusion ignition, battery leaps, COP wins, peat restoration…
- **Country-targeted** (dynamic headlines): climate mayor elected, industrial strike, wildfires, floods, drought, pipeline cancelled, viral activist. Each picks a fresh target each firing; headlines read differently every game.
- **Interactive** (demand a choice): geoengineering offer, petrostate deal, nuclear dilemma, carbon tariff, billionaire's pledge, refugee crisis, patent leak.

## Collectables

Opportunity bubbles pop on the map. Click before they fade.

- 🌱 **Grassroots** (54%): +2 Credits, +4 Will in spawn country
- 🌻 **Garden Plot** (8%): +1 Credit, +3% Land adoption in spawn country
- 🍃 **ESG Shift** (23%): +3 Credits, +4% adoption in country's leading sector
- ⭐ **Climate Rally** (12%): +5 Credits, +6 Will locally, +4 Will to neighbors
- 💎 **Policy Breakthrough** (3%): +8 Credits, 30% off research for 4 ticks

Spawn weight favors high-emission countries — that's where the fight matters.

## Win / Loss

Reversal-based victory:
- **Standard win**: CO₂ clearly past its peak (dropped ≥8 ppm from the high), CO₂ ≤ 395 ppm, peak temp ≤ +2.1°C, ≥65% of countries at Net Zero.
- **Perfect win**: CO₂ ≤ 360 ppm, peak temp ≤ +1.6°C, ≥90% of countries at Net Zero.
- **Loss**: temperature crosses **+4°C** (the Hothouse Earth cascade — civilization cannot adapt fast enough).

Final grade bands: **S** perfect or (≤350 ppm & ≤1.5°C) · **A** (≤375 & ≤1.7) · **B** (≤395 & ≤1.9) · **C** (≤420 & ≤2.3) · **D** anything worse.

## Architecture

Vanilla JS modules + Vite. No framework. The single source of truth is `GameState`; systems mutate it, UI reads it. Systems never call each other directly — everything flows through `EventBus`. Every random draw goes through a **seeded mulberry32** RNG on `state.meta.rng`, so saves and replays stay coherent.

Four layers with strict responsibilities (see [docs/adr/0001](docs/adr/0001-pure-model-layer.md)):

```
data/    → static blobs (countries, activities, events, profiles, advisors, …)
model/   → pure functions; read state snapshots, return numbers
systems/ → thin orchestrators; call model, write state, emit events
ui/      → selectors, render, subscribe to events
```

```
tipping-point/
├── index.html                   # Slim shell (no inline logic)
├── package.json / vite.config.js
├── docs/
│   ├── gameplay.md              # In-depth loop writeup
│   └── adr/                     # Architecture decision records
├── src/
│   ├── main.js                  # Entry + game lifecycle wiring
│   ├── core/
│   │   ├── EventBus.js          # Pub/sub (typed event constants)
│   │   ├── GameLoop.js          # Fixed-step tick + fractionalTick()
│   │   ├── GameState.js         # Create state + adjacency auto-symmetrize
│   │   └── Random.js            # mulberry32 Rng (seed + stream)
│   ├── model/                   # Pure math — no state writes, no I/O
│   │   ├── Climate.js           # Airborne fraction, ocean sink, temp lag
│   │   ├── Adoption.js          # Spread fraction, will drift, net-zero
│   │   ├── Economy.js           # Credit income, research / deploy costs
│   │   ├── DeployEconomy.js     # Diminishing returns + synergy composition
│   │   ├── PoliticalGate.js     # Will-gate verdict for hard deploys
│   │   ├── Population.js        # Growth, climate mortality, shield
│   │   ├── Scoring.js           # CO₂ peak, win/lose verdict, letter grade
│   │   ├── Events.js            # Declarative effect executor (ADR 0002)
│   │   ├── EffectsSummary.js    # Human-readable effects preview
│   │   ├── Advisors.js          # Mood, agenda, influence math
│   │   ├── Achievements.js      # Evaluate unlock conditions
│   │   ├── Dispatches.js        # Persistent notification log
│   │   ├── Forestry.js          # Forest health + carbon liability
│   │   └── Government.js        # Incumbent/shadow succession math
│   ├── systems/
│   │   ├── CarbonSystem.js      # Emissions → CO₂ → temperature
│   │   ├── AdoptionSystem.js    # Spread + climate anxiety + deploy()
│   │   ├── ResearchSystem.js    # Per-branch queue + discount
│   │   ├── EventSystem.js       # Passive / interactive / IPCC tracks
│   │   ├── NewsSystem.js        # Throttled flavor + reactive milestones
│   │   ├── ScoringSystem.js     # Peaks + history + win/loss
│   │   ├── CollectableSystem.js # Bubble spawn + TTL
│   │   ├── AdvisorSystem.js     # Agenda cadence + ability unlocks
│   │   ├── PopulationSystem.js  # Per-tick population drift
│   │   ├── ForestrySystem.js    # Forest regen + liability accrual
│   │   ├── SpeciesSystem.js     # Red-list extinction tracker
│   │   ├── MarineLifeSystem.js  # Reef bleaching, ocean events
│   │   ├── CitizenChatterSystem.js
│   │   ├── SporadicWildfireSystem.js
│   │   └── helpers.js           # researchCostFor, formatSeconds
│   ├── data/
│   │   ├── countries.js         # 31 countries, normalized adjacency
│   │   ├── profiles.js          # Country profiles, starting adoption
│   │   ├── activities.js        # 82 tiered activities + BRANCHES/TIER_META
│   │   ├── events.js            # 164 events
│   │   ├── news.js              # Flavor + reactive headlines
│   │   ├── collectables.js      # COLLECTABLE_TYPES + roll table
│   │   ├── advisors.js          # Four-seat cabinet definitions
│   │   ├── species.js           # Red-list roster (~45 species)
│   │   ├── citizens.js          # Chatter pool for speech bubbles
│   │   ├── achievements.js      # Badge definitions + trigger hints
│   │   ├── synergies.js         # Cross-branch research bonuses
│   │   ├── glossary.js          # In-game climate glossary
│   │   └── flags.js             # Pixel-art flag asset paths
│   ├── ui/
│   │   ├── HUD.js               # Cached nodes, no per-tick innerHTML
│   │   ├── WorldMap.js          # D3, selected highlight, region hover
│   │   ├── ResearchTree.js      # Keyed card updates + RAF countdown
│   │   ├── CountryPanel.js      # Soft in-place bar updates, shake on fail
│   │   ├── LeftPanel.js         # Tabbed: research / advisors / dispatches
│   │   ├── RightPanel.js        # Selected country + deploy picker
│   │   ├── CouncilPanel.js      # Advisors tab (vertical seat strip)
│   │   ├── DispatchesPanel.js   # Persistent log reader
│   │   ├── NewsFeed.js          # Continuous marquee
│   │   ├── MapAmbience.js       # Smog / doom / bloom overlays
│   │   ├── SmogPlumes.js        # Per-country smog stack
│   │   ├── CloudLayer.js        # Time-of-day cloud atlas
│   │   ├── WildfireFx.js        # Wildfire sprite overlay
│   │   ├── RecoveryBar.js       # Composite recovery score
│   │   ├── PopulationTicker.js  # Global population counter
│   │   ├── Toast.js             # Stacked toasts, capped
│   │   ├── FloatingText.js      # +CP / +adoption popups
│   │   ├── ScreenShake.js       # Shared shake primitive
│   │   ├── Tutorial.js
│   │   ├── EventModal.js        # Keyboard-navigable
│   │   ├── StatsModal.js        # Sparklines + rankings
│   │   ├── SavesModal.js        # Three-slot save browser
│   │   ├── SettingsModal.js     # Audio + reduced-motion toggles
│   │   ├── AchievementsModal.js
│   │   ├── Glossary.js          # Glossary modal
│   │   ├── EndScreen.js
│   │   ├── CountrySelect.js     # + resume banner
│   │   ├── Keyboard.js          # Global shortcuts
│   │   └── modal-a11y.js        # Focus-trap + Esc handling
│   ├── audio/
│   │   ├── SoundBoard.js        # Web Audio synth, persisted mute
│   │   ├── MusicPlayer.js       # Background track, fade-in/out
│   │   └── FireAmbience.js      # Wildfire loop
│   ├── save/
│   │   └── saveLoad.js          # localStorage, Set serialization, autosave
│   ├── config/
│   │   ├── balance.js           # All tunable numbers
│   │   └── env.js               # Import-meta env accessors
│   ├── telemetry/
│   │   ├── index.js             # Abstract reporter interface
│   │   └── sentry.js            # Sentry adapter (no-op without DSN)
│   ├── i18n/
│   │   ├── index.js             # t() accessor
│   │   └── en.js                # English strings
│   └── styles/
│       ├── main.css             # Main stylesheet, @fontsource imports
│       └── icons.css            # Mask-based pixel icon sprites
└── node_modules/…               # d3-geo, topojson-client, world-atlas, fonts
```

### Bundled dependencies (no CDNs)

- `d3-geo` + `d3-selection` (map projection + DOM binding)
- `topojson-client` (decode polygon data)
- `world-atlas/countries-110m.json` (Natural Earth at 110m resolution, bundled at build time — map works offline)
- `@fontsource/press-start-2p` + `@fontsource/vt323` (self-hosted pixel fonts — no Google Fonts fetch)
- `@sentry/browser` (optional — no-op unless `VITE_SENTRY_DSN` is set)

## Running

```bash
bun install          # or: npm install
bun run dev          # Vite dev server at http://localhost:5173
bun run build        # → dist/ (static, deployable anywhere)
bun run preview      # serve the dist/ build locally
```

## Save / Resume

Progress autosaves every 20s and on every meaningful event (deploy, research complete, Net Zero, tab close). The country-select screen shows a **Resume** banner when a save exists. Save format is versioned (`tipping-point.save.v1`); mismatches are dropped safely.

## Keyboard

- **Space** / **P** — pause
- **1 / 2 / 4** — speed
- **M** — mute toggle
- **H** / **?** — help
- **S** — stats
- **Esc** — close modal

## Accessibility

- `prefers-reduced-motion` disables the news marquee, pulse animations, collectable bob, and stripe crawl.
- All SVG map paths carry `<title>` elements (native hover tooltip + screen reader name).
- `:focus-visible` ring for keyboard users.
- Toast stack is an ARIA live region.
- Event modals support full keyboard navigation (arrow keys, Enter, 1-9).

## Data Integrity

Country neighbor graph is **auto-symmetrized** at state creation, so declaring `A → B` gives you `B → A` for free. Phantom IDs are dropped with a console warning instead of silently breaking diffusion. All random draws flow through `state.meta.rng` (seeded mulberry32); new games seed from `crypto.getRandomValues`.
