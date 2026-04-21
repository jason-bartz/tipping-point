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
  // Tight by design; early = cheap tier-1 (1–3 credits, 2–3 ticks), endgame
  // capstones cost 20–30 credits and take 12–16 ticks of focused research.
  startingClimatePoints: 3,
  baseCPPerTick: 0.6,
  milestoneBonusCP: 18,

  // ─── Adoption
  adjacencySpreadRate: 0.017,
  politicalWillDecay: 0.013,
  // Director pacing — events felt like a faucet at 0.11/tick with no warmup
  // and no minimum gap. 0.055 halves the base rate; the grace window gives
  // the player ~27s of quiet at the start to get oriented; the min-gap keeps
  // beats from stacking within a few ticks of each other. The passive track
  // picks from non-interactive events only.
  eventFireChancePerTick: 0.055,
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

  // Business-as-usual emission growth: economies expand ~0.8%/yr without
  // intervention. Dampened per-country by adoption level.
  bauEmissionGrowthPerYear: 0.008,

  // ─── Collectables — ~1 per 24s, max 2 on screen, 3-tick startup grace.
  collectableFireChancePerTick: 0.11,
  collectableTTLTicks: 5,
  collectableMaxConcurrent: 2,
  collectableStartupGraceTicks: 3,

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
    // Conflicts
    conflictMinTickGap: 20,
    conflictBaseChance: 0.12,        // per-tick roll once the gap is met
    conflictMinInfluence: 35,        // both sides must be above this to argue
    // Deploy log retention (for industrialist mood/deploys agenda)
    deployLogWindow: 20,
  },
};
