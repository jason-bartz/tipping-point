// Advisory Board — a four-seat cabinet that comments on the world, pushes
// agendas, clashes over decisions, whispers warnings when tipping points
// loom, and unlocks signature abilities when the player has earned their
// trust.
//
// Data shape:
//   ADVISOR_ARCHETYPES[id] = {
//     id, title, name, role, portrait (image URL under /public), color,
//     tagline, biasBranches, opening (0-100 influence),
//     moodWeights: { co2?, temp?, stress?, adoption?, will?, nz? },
//     abilityId, conflictStances (keyed by conflict id → which side they take)
//   }
//
//   AGENDA_CATALOG — items keyed by advisor archetype. Each agenda:
//     { id, text, durationTicks, guard(s) → bool, progress(s, start) → 0-1,
//       reward: { kind, payload, toastTitle, toastBody } }
//
//   CONFLICT_POOL — scripted dilemmas, each with two sides and effect arrays
//     mirroring the events.js ops schema.
//
//   WHISPER_MAP — maps event IDs to which advisor warns ahead of time and
//     what to say.
//
// This file is pure data. All evaluation lives in model/Advisors.js.

export const ADVISOR_ARCHETYPES = {
  scientist: {
    id: 'scientist',
    title: 'Chief Scientist',
    name: 'Dr. Priya Iyer',
    role: 'Watches the carbon curve and the research pipeline.',
    portrait: '/advisors/priya-iyer.webp',
    color: '#4fb3ff',
    tagline: 'If the numbers lie, we lose.',
    biasBranches: ['energy', 'capture'],
    opening: 55,
    moodWeights: { co2: 0.5, research: 0.3, temp: 0.2 },
    abilityId: 'peerReview',
  },
  diplomat: {
    id: 'diplomat',
    title: 'Foreign Envoy',
    name: 'Ambassador Nils Lindqvist',
    role: 'Tracks political will, alliances, and treaty posture.',
    portrait: '/advisors/nils-lindqvist.webp',
    color: '#f472b6',
    tagline: 'Every crisis is a coalition waiting to form.',
    biasBranches: ['policy'],
    opening: 55,
    moodWeights: { will: 0.6, nz: 0.2, spread: 0.2 },
    abilityId: 'backchannel',
  },
  activist: {
    id: 'activist',
    title: 'People’s Advocate',
    name: 'Maya Okonkwo',
    role: 'Voice of the streets. Watches temperature and stress.',
    portrait: '/advisors/maya-okonkwo.webp',
    color: '#f59e0b',
    tagline: 'The planet does not negotiate.',
    biasBranches: ['land'],
    opening: 50,
    moodWeights: { temp: 0.5, stress: 0.3, nz: 0.2 },
    abilityId: 'rally',
  },
  industrialist: {
    id: 'industrialist',
    title: 'Industrial Chair',
    name: 'Kenji Sato',
    role: 'Hard hats, supply chains, deployment velocity.',
    portrait: '/advisors/kenji-sato.webp',
    color: '#ff7a45',
    tagline: 'Targets are slogans. Tonnage is policy.',
    biasBranches: ['industry', 'transport'],
    opening: 50,
    moodWeights: { adoption: 0.5, deploys: 0.3, research: 0.2 },
    abilityId: 'expedite',
  },
};

export const ADVISOR_IDS = ['scientist', 'diplomat', 'activist', 'industrialist'];

// ─── Agenda Catalog ────────────────────────────────────────────────────────
// Each advisor's agendas. Progress functions compute a 0-1 fraction off a
// snapshot captured at agenda start. guard() lets an agenda opt out of being
// proposed in contexts where it's silly (e.g. "deploy 5 times" early game
// when there's only one researched activity).

function snapDeploys(s) {
  let n = 0;
  for (const k of Object.values(s.world.deployCount || {})) n += k;
  return n;
}
function snapResearchedCount(s) { return s.world.researched.size; }
function snapAdoptionSum(s) {
  let t = 0; let n = 0;
  for (const c of Object.values(s.countries)) {
    for (const v of Object.values(c.adoption)) { t += v; n++; }
  }
  return n ? t / n : 0;
}
function snapCollectablesClaimed(s) { return s.advisors?._telemetry?.collectablesClaimed ?? 0; }

export const AGENDA_CATALOG = {
  scientist: [
    {
      id: 'two_research',
      text: 'Complete two research projects.',
      durationTicks: 16,
      start: (s) => ({ baseline: snapResearchedCount(s) }),
      progress: (s, snap) => Math.min(1, (snapResearchedCount(s) - snap.baseline) / 2),
      reward: { kind: 'researchDiscount', pct: 0.20, ticks: 6,
        title: 'Peer Review Cleared',
        body: '20% research discount for 6 quarters.' },
    },
    {
      id: 'capture_push',
      text: 'Research any Capture-branch activity.',
      guard: (s) => ![...s.world.researched].some(id => s.activities[id]?.branch === 'capture'),
      durationTicks: 22,
      start: (s) => ({ baseline: [...s.world.researched] }),
      progress: (s) => {
        for (const id of s.world.researched) {
          if (s.activities[id]?.branch === 'capture') return 1;
        }
        return 0;
      },
      reward: { kind: 'credits', value: 14,
        title: 'Capture Pays Off',
        body: 'The Chief Scientist unlocks a +14 Credit grant.' },
    },
    {
      id: 'capstone_within_25',
      text: 'Complete a Tier 3+ research project.',
      guard: (s) => {
        if (s.meta.tick < 16) return false;
        for (const id of s.world.researched) {
          if ((s.activities[id]?.tier ?? 0) >= 3) return false;
        }
        return true;
      },
      durationTicks: 26,
      start: (s) => ({ baseline: [...s.world.researched] }),
      progress: (s) => {
        for (const id of s.world.researched) {
          const t = s.activities[id]?.tier ?? 0;
          if (t >= 3) return 1;
        }
        return 0;
      },
      reward: { kind: 'researchDiscount', pct: 0.30, ticks: 8,
        title: 'Breakthrough Momentum',
        body: '30% research discount for 8 quarters.' },
    },
  ],

  diplomat: [
    {
      id: 'three_high_will',
      text: 'Get three countries above 70 political will.',
      durationTicks: 20,
      // Don't hand a reward for a state the player already had — only propose
      // when fewer than three countries are at the threshold.
      guard: (s) => Object.values(s.countries).filter(c => (c.politicalWill ?? 0) >= 70).length < 3,
      start: () => ({}),
      progress: (s) => {
        const n = Object.values(s.countries).filter(c => (c.politicalWill ?? 0) >= 70).length;
        return Math.min(1, n / 3);
      },
      reward: { kind: 'willAll', value: 5,
        title: 'Diplomatic Momentum',
        body: '+5 political will in every country.' },
    },
    {
      id: 'two_net_zeros',
      text: 'Drive any two countries to Net Zero.',
      guard: (s) => s.meta.tick >= 24,
      durationTicks: 40,
      start: (s) => ({ baseline: Object.values(s.countries).filter(c => c.netZero).length }),
      progress: (s, snap) => {
        const cur = Object.values(s.countries).filter(c => c.netZero).length;
        return Math.min(1, (cur - snap.baseline) / 2);
      },
      reward: { kind: 'credits', value: 22,
        title: 'Coalition Building',
        body: 'Fresh bilateral climate funds unlock +22 Credits.' },
    },
    {
      id: 'home_policy_50',
      text: 'Reach 50% Policy adoption in the home country.',
      durationTicks: 22,
      guard: (s) => {
        const c = s.countries[s.meta.homeCountryId];
        return !!c && (c.adoption.policy ?? 0) < 0.5;
      },
      start: () => ({}),
      progress: (s) => {
        const c = s.countries[s.meta.homeCountryId];
        if (!c) return 0;
        return Math.min(1, (c.adoption.policy ?? 0) / 0.5);
      },
      reward: { kind: 'willHome', value: 15,
        title: 'Policy Momentum at Home',
        body: 'Home country gains +15 political will.' },
    },
  ],

  activist: [
    {
      id: 'collect_four',
      text: 'Claim four collectable bubbles.',
      durationTicks: 18,
      start: (s) => ({ baseline: snapCollectablesClaimed(s) }),
      progress: (s, snap) => Math.min(1, (snapCollectablesClaimed(s) - snap.baseline) / 4),
      reward: { kind: 'spawnBurst', count: 2,
        title: 'Movement Builds',
        body: 'Two fresh bubbles appear on the map.' },
    },
    {
      id: 'drop_co2',
      text: 'Reduce CO₂ by 0.8 ppm.',
      guard: (s) => s.meta.tick >= 16,
      durationTicks: 22,
      start: (s) => ({ baseline: s.world.co2ppm }),
      progress: (s, snap) => Math.min(1, Math.max(0, snap.baseline - s.world.co2ppm) / 0.8),
      reward: { kind: 'stressRelief', value: 8,
        title: 'Public Relief',
        body: '−8 societal stress, +6 Credits.',
        extraCredits: 6 },
    },
    {
      id: 'hold_temp',
      text: 'Keep temperature from rising 0.05°C over the next 14 quarters.',
      durationTicks: 14,
      // Ramp with elapsed ticks so the win only lands at the deadline.
      // Without startTick the old binary progress returned 1 on tick 1 and
      // the AdvisorSystem resolved it immediately — the duration was moot.
      start: (s) => ({ baseline: s.world.tempAnomalyC, startTick: s.meta.tick }),
      progress: (s, snap) => {
        const delta = s.world.tempAnomalyC - snap.baseline;
        if (delta > 0.05) return 0;
        const elapsed = s.meta.tick - (snap.startTick ?? s.meta.tick);
        return Math.min(1, Math.max(0, elapsed) / 14);
      },
      reward: { kind: 'willAll', value: 4,
        title: 'Public Wins the Room',
        body: 'A week of good climate news. +4 will worldwide.' },
    },
  ],

  industrialist: [
    {
      id: 'five_deploys',
      text: 'Complete five deployments.',
      durationTicks: 14,
      start: (s) => ({ baseline: snapDeploys(s) }),
      progress: (s, snap) => Math.min(1, (snapDeploys(s) - snap.baseline) / 5),
      reward: { kind: 'deployDiscount', value: 0.20, count: 5,
        title: 'Supply Chain Warm',
        body: 'Next 5 deploys cost 20% less.' },
    },
    {
      id: 'raise_avg_adoption',
      text: 'Raise average adoption by 3 percentage points.',
      durationTicks: 22,
      start: (s) => ({ baseline: snapAdoptionSum(s) }),
      progress: (s, snap) => Math.min(1, Math.max(0, snapAdoptionSum(s) - snap.baseline) / 0.03),
      reward: { kind: 'adoptionBoost', value: 0.03,
        title: 'Industrial Swing',
        body: 'Home industry + transport get +3% adoption bumps.' },
    },
    {
      id: 'home_industry_40',
      text: 'Reach 40% Industry adoption in the home country.',
      durationTicks: 24,
      guard: (s) => {
        const c = s.countries[s.meta.homeCountryId];
        return !!c && (c.adoption.industry ?? 0) < 0.40;
      },
      start: () => ({}),
      progress: (s) => {
        const c = s.countries[s.meta.homeCountryId];
        if (!c) return 0;
        return Math.min(1, (c.adoption.industry ?? 0) / 0.40);
      },
      reward: { kind: 'credits', value: 16,
        title: 'Industrial Backing',
        body: 'Green-industry consortium commits +16 Credits.' },
    },
  ],
};

// ─── Conflict Pool ─────────────────────────────────────────────────────────
// Scripted dilemmas between two advisors. Trigger logic lives in the system;
// the pool provides the narrative shells + both choices' effects.

export const CONFLICT_POOL = [
  {
    id: 'industry_vs_activist',
    between: ['industrialist', 'activist'],
    title: 'A Factory Town at the Crossroads',
    headline: 'A legacy steel town is collapsing. Retool it for green steel — or let it go, and redirect the funds to climate aid.',
    sides: {
      industrialist: {
        label: 'Retool the mill',
        stance: 'We do not abandon the industrial base. Retool it.',
        effects: [
          { op: 'addAllCountries', field: 'adoption.industry', value: 0.02 },
          { op: 'addWorld', field: 'climatePoints', value: -6 },
        ],
      },
      activist: {
        label: 'Redirect funds',
        stance: 'The money will do more good where the need is sharpest.',
        effects: [
          { op: 'addAllCountries', field: 'politicalWill', value: 3 },
          { op: 'addWorld', field: 'societalStress', value: -4 },
        ],
      },
    },
  },
  {
    id: 'science_vs_diplomat',
    between: ['scientist', 'diplomat'],
    title: 'Moonshot or Treaty?',
    headline: 'A surprise R&D budget has landed. Put it into fusion and DAC — or into a climate finance treaty.',
    sides: {
      scientist: {
        label: 'Fund the moonshot',
        stance: 'Breakthroughs are what change the arithmetic. Everything else is bookkeeping.',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: 10 },
        ],
        researchDiscount: { pct: 0.15, ticks: 5 },
      },
      diplomat: {
        label: 'Fund the treaty',
        stance: 'Technology without consent goes nowhere. We need the coalition.',
        effects: [
          { op: 'addAllCountries', field: 'politicalWill', value: 4 },
          { op: 'addAllCountries', field: 'adoption.policy', value: 0.02 },
        ],
      },
    },
  },
  {
    id: 'industry_vs_science',
    between: ['industrialist', 'scientist'],
    title: 'Ship It, or Study It?',
    headline: 'An unproven carbon-capture tech is on the table, ready to scale.',
    sides: {
      scientist: {
        label: 'Run the trial',
        stance: 'We do not bet a decade on an untested system. Trial it first.',
        effects: [
          { op: 'addWorld', field: 'climatePoints', value: 5 },
        ],
        researchDiscount: { pct: 0.10, ticks: 4 },
      },
      industrialist: {
        label: 'Ship at scale',
        stance: 'Perfection is the enemy of tonnage. We build now.',
        effects: [
          { op: 'addAllCountries', field: 'adoption.capture', value: 0.03 },
          { op: 'addWorld', field: 'societalStress', value: 2 },
        ],
      },
    },
  },
  {
    id: 'activist_vs_diplomat',
    between: ['activist', 'diplomat'],
    title: 'Demonstrate or Deliberate?',
    headline: 'A mass climate strike is gathering. Endorse it, or urge restraint to keep back-channel talks alive?',
    sides: {
      activist: {
        label: 'Endorse the strike',
        stance: 'The public is ready. Pressure is what moves ministers.',
        effects: [
          { op: 'addAllCountries', field: 'politicalWill', value: 4 },
          { op: 'addWorld', field: 'societalStress', value: 3 },
        ],
      },
      diplomat: {
        label: 'Preserve the talks',
        stance: 'We are one headline from losing the holdouts. Keep them at the table.',
        effects: [
          { op: 'addCountries', where: { infra: 'petrostate' }, field: 'politicalWill', value: 5 },
          { op: 'addWorld', field: 'climatePoints', value: 4 },
        ],
      },
    },
  },
];

// ─── Whisper Map ───────────────────────────────────────────────────────────
// Maps event ids (from events.js) to the advisor who should pre-warn.
// Whispers are fired by AdvisorSystem when a tipping-point guard is *close*
// to triggering, not after the fact. Only fires once per event per game.

export const WHISPER_MAP = {
  methane_burp:       { advisor: 'scientist', lookaheadTempC: 1.65, text: 'The Chief Scientist warns permafrost methane is primed. Temperature must not cross +1.7°C.' },
  arctic_ice_free:    { advisor: 'scientist', lookaheadTempC: 1.85, text: 'The Chief Scientist reports Arctic ice is at record lows. One more hot summer flips it.' },
  amazon_dieback:     { advisor: 'activist',  lookaheadTempC: 1.55, text: 'Advisor Machado reports Amazon understory is drying. Dieback begins near +1.6°C.' },
  coral_bleach:       { advisor: 'activist',  lookaheadTempC: 1.35, text: 'Reef monitors report mass bleaching within one hot season. Reef ecosystems are on the brink.' },
  carbon_bomb:        { advisor: 'diplomat',  lookaheadTempC: 1.75, text: 'Intelligence: petrostate majors are preparing a final extraction push. Diplomatic pressure now, or never.' },
};

// ─── Signature Abilities ───────────────────────────────────────────────────
// Unlock at influence ≥80. Cooldown-based (not one-shot).

export const ABILITIES = {
  peerReview: {
    id: 'peerReview',
    advisor: 'scientist',
    label: 'Peer Review',
    hint: 'Free 40% research discount for 4 quarters.',
    cooldownTicks: 24,
    effect: { kind: 'researchDiscount', pct: 0.40, ticks: 4 },
  },
  backchannel: {
    id: 'backchannel',
    advisor: 'diplomat',
    label: 'Backchannel',
    hint: 'Raise all political will by 8.',
    cooldownTicks: 24,
    effect: { kind: 'willAll', value: 8 },
  },
  rally: {
    id: 'rally',
    advisor: 'activist',
    label: 'Rally',
    hint: 'Spawn two climate-rally bubbles.',
    cooldownTicks: 20,
    effect: { kind: 'spawnBurst', count: 2 },
  },
  expedite: {
    id: 'expedite',
    advisor: 'industrialist',
    label: 'Expedite',
    hint: 'Next 3 deployments cost nothing.',
    cooldownTicks: 28,
    effect: { kind: 'freeDeploys', count: 3 },
  },
};
