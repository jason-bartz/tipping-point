// All tunable numbers. Rebalance by editing one file.
// Units: CO2 in ppm, emissions in GtCO2/year, time in quarters.

export const BALANCE = {
  // ─── Time
  startYear: 2026,
  ticksPerYear: 4,
  tickIntervalMs: 4500,

  // ─── Starting world state
  startingCO2ppm: 420,
  startingTempAnomalyC: 1.2,
  preindustrialCO2ppm: 280,
  preindustrialTempC: 0,

  // ─── Carbon cycle (simplified airborne fraction model)
  airborneFraction: 0.42,
  ppmPerGtCO2: 0.1278,
  oceanUptakeRate: 0.06,

  // ─── Climate sensitivity
  tempPerDoublingCO2: 3.0,
  // Faster response so idle play visibly heats up — we start already committed.
  tempResponseLag: 0.04,

  // ─── Economy (Carbon Credits).
  // Tight by design; early = cheap tier-1 (1–3 credits, ~4–6 ticks of trickle),
  // endgame capstones cost 20–30 credits and take 12–16 ticks of focused
  // research. Passive income and milestone lumps are deliberately small so
  // the player has to *choose* what to spend on — hoarding double-digit
  // stockpiles should feel like dragging, not default state.
  startingClimatePoints: 3,
  baseCPPerTick: 0.45,
  milestoneBonusCP: 10,

  // ─── Research time. Per-activity `researchTicks` in src/data/activities.js
  // is the *relative* weight within a tier; this table stretches each tier
  // into an RTS-style cadence. At 4.5s per tick (1× speed):
  //   Tier 1: quick pass → ~15–25 s
  //   Tier 2: meaningful commit → ~45–60 s
  //   Tier 3: major project → ~2 min
  //   Tier 4: endgame moonshot → ~4–5 min
  // Labs run per-branch (one concurrent research per branch), so higher
  // tiers = real opportunity cost: you lock up a lab for minutes while you
  // could be stacking two shorter tier-1/2 gains instead.
  researchTickTierMultiplier: { 1: 1.5, 2: 2.5, 3: 4, 4: 5 },

  // ─── Adoption
  adjacencySpreadRate: 0.017,
  politicalWillDecay: 0.013,
  // Floor on political will. Natural drift can't push a country below this
  // even after extreme heat + stress penalties — keeps the worst case a
  // "grudging cooperator" rather than a locked-out zero.
  minPoliticalWill: 8,
  maxPoliticalWill: 100,
  // Director pacing — events felt like a faucet at 0.11/tick with no warmup
  // and no minimum gap. 0.065 with a grace window and min-gap keeps beats
  // from stacking within a few ticks of each other. The passive track picks
  // from non-interactive events only. Bumped from 0.055 after the v3 pool
  // expansion — more content on the bench deserves more airtime.
  eventFireChancePerTick: 0.065,
  eventStartupGraceTicks: 6,
  eventMinGapTicks: 4,

  // Interactive-decision track. Runs independently of the passive roll so
  // that decisions surface on a predictable cadence instead of being buried
  // by the weighted pool. After the min-gap, we roll each tick at
  // interactiveChancePerTick; once the max-gap expires, the next eligible
  // interactive event is forced so the player isn't ever decision-starved.
  // Expected cadence: one interactive every ~24 ticks (~110s).
  interactiveMinGapTicks: 18,
  interactiveMaxGapTicks: 30,
  interactiveChancePerTick: 0.15,

  // Decision timeout. An interactive event that's been pending this many
  // ticks auto-expires — inaction is a choice and it costs you. Individual
  // events can override with `timeoutTicks` on their def.
  decisionTimeoutTicks: 18,           // ~4.5 in-game years at 4 ticks/year

  // Recency window for interactive picks. The director excludes any event
  // whose id is in the last N fired from the eligible pool, so the same
  // decision doesn't resurface back-to-back. Sized to roughly half the
  // interactive pool — enough distance between repeats to feel varied, not
  // so strict that guards can starve the pool.
  interactiveRecencyWindow: 8,

  // Disaster cadence. Disasters (events tagged `disaster: true`) ride the
  // interactive track but carry an extra min-gap so a warming run isn't
  // carpet-bombed with hurricanes and wildfires back-to-back. ~12 ticks is
  // 3 in-game years — enough space for the echo from the previous one to
  // land before the next hero-image modal interrupts.
  disasterMinGapTicks: 12,

  // Default penalty when a decision expires without a choice. Stackable —
  // author events can add `onExpire` effects that run *instead of* these.
  decisionExpirePoliticalWillHit: 8,  // drains target (or all if no target) by this
  decisionExpireSocietalStress: 3,    // bumps world stress — inaction breeds unrest

  // News flavor ticker — separate from the event director. Shorter grace
  // since a flavor blurb is quieter than a modal, but still enough that the
  // ticker doesn't spout a headline in the first few seconds after unpause.
  newsFlavorStartupGraceTicks: 4,

  // IPCC narrative cadence. Every `ipccCadenceTicks` (4 years at 4 ticks/yr)
  // the director force-picks an IPCC-tagged passive event so the game has a
  // recognizable "report drops" rhythm. Skipped during startup grace and on
  // ticks with a pending interactive event.
  ipccCadenceTicks: 16,

  // Business-as-usual emission growth: economies expand without intervention,
  // dampened per-country by adoption level. Dropped from the real-world ~0.8%/yr
  // to 0.5%/yr because the original rate outpaced tier-1 interventions — a
  // full tier-1 roll-out across every country would dip emissions briefly,
  // then BAU regrowth erased the gain in ~3 years. 0.5% gives early, modest
  // play room to bend the curve before tier-2/3 come online.
  bauEmissionGrowthPerYear: 0.005,

  // ─── Collectables — ~1 per 35s, max 2 on screen, 3-tick startup grace.
  collectableFireChancePerTick: 0.075,
  collectableTTLTicks: 5,
  collectableMaxConcurrent: 2,
  collectableStartupGraceTicks: 3,

  // ─── Citizen chatter — speech-bubble Easter eggs on the map. One at a
  // time, sporadic. With 4.5s/tick, 0.045 fire chance + a 6-tick min gap
  // works out to roughly one bubble every ~2 minutes at 1× speed. Dwell of
  // 5 ticks reads as ~22s at 1× / ~11s at 2× / ~5.5s at 4× — long enough
  // to read comfortably at fast-forward without lingering at real-time.
  chatterFireChancePerTick: 0.045,
  chatterDwellTicks: 5,
  chatterMinGapTicks: 6,
  chatterStartupGraceTicks: 4,

  // Diamond-collectable research discount.
  researchDiscountTicks: 4,
  researchDiscountPct: 0.30,

  // ─── Home-country bonus
  homeDeployDiscount: 0.25,
  homePoliticalWillBonus: 15,

  // ─── Deploy diminishing returns. The *n*th deploy of activity A in country
  // C yields `deployDiminishingBase^n` of its base adoption amount, floored
  // at `deployDiminishingFloor`. 0.65 means 100% → 65% → 42% → 27% → 17%...
  // This is the anti-spam-click mechanic. Raise the base to 1.0 to disable.
  deployDiminishingBase: 0.65,
  deployDiminishingFloor: 0.10,

  // Hard cap on repeat deploys per (country, activity) pair. Combined with
  // cost escalation below, this means the 1st deploy is a bargain, the 2nd
  // is a deliberate reinforcement, the 3rd is a desperate push — and there
  // is no 4th. Encourages spreading activities across countries instead of
  // piling every deploy into one nation.
  deployMaxPerPair: 3,
  // Multiplier applied to the base deploy cost per previous deploy of the
  // same pair. 2.0 means: 1st = 100% cost, 2nd = 200%, 3rd = 400%. Combined
  // with the diminishing-yield curve, efficiency ratio goes 1.0 → 0.325 →
  // 0.105 — so the third deploy delivers a tenth the adoption-per-credit
  // of the first. Spam becomes economically self-limiting.
  deployCostEscalation: 2.0,

  // ─── Political will gates on deploy. A country's effective threshold for
  // a "hard" deploy (mandates, taxes, phase-outs) is
  //   activity.willRequirement + willInfraModifier[country.infra]
  // and the deploy spends `activity.willCost` of will on success.
  // Tech incentives carry neither — they pass with a signature.
  willInfraModifier: {
    petrostate:  20,  // oil politics resists everything that hurts oil
    industrial:   8,  // heavy-industry lobbies push back on mandates
    service:      0,  // baseline
    mixed:        0,  // baseline
    agricultural: 4,  // generally friendly to land, resists taxes
  },
  // Selective bonus/penalty: petrostates resist energy/policy even harder.
  willBranchPenalty: {
    petrostate:  { energy: 8, policy: 12 },
    industrial:  { industry: 6 },
    agricultural:{ land: -6 },  // negative = easier (ag welcomes land reform)
  },

  // ─── Reversal-based victory. CO₂ clearly past its peak + decarbonized + peak temp under ceiling.
  reversalCO2DropPpm: 8,
  winCO2ppm: 395,
  winTempCeilingC: 2.1,
  winCountryNetZeroPct: 0.65,
  perfectWinCO2ppm: 360,
  perfectWinTempC: 1.6,
  perfectWinNzPct: 0.90,

  // ─── Loss at +4°C — scientific consensus for civilizational collapse
  // (Lenton/Steffen 2018 "Hothouse Earth"; World Bank "Turn Down the Heat"; IPCC RCP 8.5).
  lossTempC: 4.0,

  // ─── Country behavior
  netZeroThresholdAdoption: 0.80,
  baseEmissionReductionPerAdoption: 0.95,
  natureRemovalScale: 0.022,
  // Normalization baseline for nature-removal weighting (GtCO₂/yr). Each
  // country's land/capture pull scales by its emissions share relative to
  // this baseline, so big emitters' forests matter more than small ones'.
  // Set near the starting global baseline — retune alongside any country
  // roster or baseEmissions overhaul.
  globalBaselineEmissionsGt: 40,

  // ─── Sporadic wildfires — occasional RNG fires that appear outside of the
  //     Megafire Season / Wildfires Rage event beats. Light touch by design:
  //     a small, unavoidable credit drain (emergency response comes out of
  //     the climate fund) plus map FX so the player sees where it hit.
  //     Paced with a startup grace, a min-gap between sporadic fires, and a
  //     cooldown after any wildfire-season event so we never stack on top of
  //     one that's already painting the screen.
  sporadicWildfire: {
    enabled: true,
    startupGraceTicks: 12,      // ~3 years of quiet before the first one
    minGapTicks: 8,             // ~2 years between sporadic fires
    seasonCooldownTicks: 10,    // hold off after a wildfire-season event
    chancePerTick: 0.04,        // ≈ 1 roll in 25 ticks, gated by the gaps above
    creditDrain: 1,             // climate credits spent on emergency response
  },

  // ─── Forestry — forest health per country + accrued carbon liability on
  //     the sitting government. Forest health regenerates from deployed land
  //     activities and decays under temperature stress. Liability accrues
  //     from wildfire events and from forest erosion below baseline; when it
  //     hits `liabilityCap`, the government falls.
  forestry: {
    // Per-tick regeneration when adoption.land = 1.0. Scales linearly with
    // adoption. At 0.5 adoption, ~0.25% health restored per tick.
    restorationPerTick: 0.005,
    // Per-tick decay from temperature stress. Modulated by (1 - adoption.land)
    // so well-tended forests resist better. Zero below the threshold.
    tempStressPerTick: 0.003,
    tempStressThresholdC: 1.4,
    // If forestHealth drops below forestBaseline * this factor, passive
    // liability accrues per tick proportional to the gap. Keeps idle
    // degradation from being invisible to the political mechanic.
    passiveLiabilityTriggerFraction: 0.8,
    passiveLiabilityPerTick: 2.0,
    // One-shot liability hits from wildfire events. Keyed by event id so
    // events.js can stay declarative; ForestrySystem reads from here.
    wildfireLiability: {
      wildfire:          30,  // global megafire season
      wildfire_local:    25,  // targeted country wildfire
      wildfire_smog:     15,  // continental smog event
      wildfire_disaster: 35,  // interactive disaster (biggest single-country hit — it's a ceremony-level crisis)
    },
  },

  // ─── Government — 2-slot model per country. Incumbent and shadow each
  //     carry a climate-stance tag (`green` | `mixed` | `denier`). When the
  //     incumbent's carbonLiability hits the cap, the shadow promotes and a
  //     new shadow is generated. Tags apply continuous modifiers to will
  //     drift and spread (via AdoptionSystem) and a one-shot swing on
  //     succession (via ForestrySystem).
  government: {
    liabilityCap: 100,
    // Continuous while in office.
    tagMultipliers: {
      green:  { willBonus:  6, spreadMult: 1.08, liabilityRate: 0.85 },
      mixed:  { willBonus:  0, spreadMult: 1.00, liabilityRate: 1.00 },
      denier: { willBonus: -6, spreadMult: 0.92, liabilityRate: 1.50 },
    },
    // Applied once on the tick a new incumbent takes office, based on their
    // tag. Models the political honeymoon (or hostility).
    fallEffects: {
      green:  { will:  15, adoption: { land:  0.05, policy:  0.03 } },
      mixed:  { will:   2, adoption: {} },
      denier: { will: -15, adoption: { policy: -0.05, energy: -0.03 } },
    },
    // Probability weights for generating an initial shadow, by infra type.
    // Petrostates skew denier (their political economy resists the transition);
    // services/agricultural skew greener (exposure to climate harm).
    initialShadowTagWeights: {
      petrostate:   { green: 1, mixed: 3, denier: 6 },
      industrial:   { green: 2, mixed: 5, denier: 3 },
      service:      { green: 4, mixed: 4, denier: 2 },
      mixed:        { green: 3, mixed: 4, denier: 3 },
      agricultural: { green: 3, mixed: 4, denier: 3 },
    },
  },

  // ─── History window (ticks). ~40 years at 4 ticks/year.
  historyLength: 160,

  // ─── Advisory Board
  advisor: {
    // Cadence
    firstProposalTick: 4,            // earliest tick an advisor proposes
    cooldownOnFail: 6,               // quiet after a failed agenda
    cooldownOnWin:  4,               // brief gap after a won agenda
    moodHysteresisTicks: 2,          // avoid per-tick flicker
    // Influence deltas
    influenceOnWin:  10,
    influenceOnFail: -6,
    influenceOnConflictWin:  10,
    influenceOnConflictLoss: -5,
    // Ability gating
    abilityInfluenceThreshold: 80,
    // Conflicts. Grace ticks keep the first conflict from stepping on
    // opening-round pool events (which have their own 6-tick grace); the
    // longer ceiling means a conflict only emerges after the player has
    // seen a few deploys/events and the advisors have something to argue
    // about. Chance is halved from the original 0.12 so conflicts feel
    // earned rather than constant. The anti-repeat tracker lives on the
    // advisor state slice (see `lastConflictId`).
    conflictStartupGraceTicks: 20,
    conflictMinTickGap: 20,
    conflictBaseChance: 0.06,
    conflictMinInfluence: 35,        // both sides must be above this to argue
    // Deploy log retention (for industrialist mood/deploys agenda)
    deployLogWindow: 20,
  },
};
