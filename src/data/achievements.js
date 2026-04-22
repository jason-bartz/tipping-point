// Achievement definitions. Each entry:
//   id        — stable key, never reuse.
//   title     — short noun phrase, shown on the badge.
//   desc      — one-sentence unlock condition, player-facing.
//   icon      — path to a pixel-art SVG (monochrome, currentColor fill —
//               CSS tints locked vs. unlocked).
//   tint      — optional unlock-state color, overrides the default amber.
//   hidden    — if true, desc is hidden until unlocked (spoilery tier).
//
// Check logic lives in /src/model/Achievements.js — this file is data only
// so the UI can render it without running sim code.

const ICON_BASE = '/icons/achievements';

export const ACHIEVEMENTS = [
  {
    id: 'first_net_zero',
    title: 'First Among Equals',
    desc: 'Bring one country to Net Zero.',
    icon: `${ICON_BASE}/first-net-zero.svg`,
    tint: '#15803d',
  },
  {
    id: 'stabilized',
    title: 'Stabilized',
    desc: 'Win a run — peak at or below +2.1°C, with 65% of countries at Net Zero.',
    icon: `${ICON_BASE}/stabilized.svg`,
    tint: '#b45309',
  },
  {
    id: 'reversed',
    title: 'Reversed',
    desc: 'Win with a "Reversed" grade.',
    icon: `${ICON_BASE}/reversed.svg`,
    tint: '#b45309',
  },
  {
    id: 'clean_sweep',
    title: 'Clean Sweep',
    desc: 'Reach Net Zero in every country in a single run.',
    icon: `${ICON_BASE}/clean-sweep.svg`,
    tint: '#0369a1',
  },
  {
    id: 'petrostate_pivot',
    title: 'Petrostate Pivot',
    desc: 'Bring a petrostate country to Net Zero.',
    icon: `${ICON_BASE}/petrostate-pivot.svg`,
    tint: '#1f2937',
  },
  {
    id: 'speedrun',
    title: 'Ahead of Schedule',
    desc: 'Reach your first Net Zero before Q1 2035.',
    icon: `${ICON_BASE}/speedrun.svg`,
    tint: '#ca8a04',
  },
  {
    id: 'heatwave_survivor',
    title: 'Heatwave Survivor',
    desc: 'Win after peak temperature exceeded +2.5°C.',
    icon: `${ICON_BASE}/heatwave.svg`,
    tint: '#dc2626',
  },
  {
    id: 'capstones',
    title: 'Full Tech Tree',
    desc: 'Research every Tier-4 capstone in one run.',
    icon: `${ICON_BASE}/capstones.svg`,
    tint: '#0369a1',
  },
  {
    id: 'collector',
    title: 'Collector',
    desc: 'Claim 50 collectables in a single run.',
    icon: `${ICON_BASE}/collector.svg`,
    tint: '#a16207',
  },
  {
    id: 'decisive',
    title: 'Decisive',
    desc: 'Resolve 25 decisions in a single run.',
    icon: `${ICON_BASE}/decisive.svg`,
    tint: '#7c3aed',
  },
  {
    id: 'populist',
    title: 'Popular Mandate',
    desc: 'Average world political will exceeds 80 at any point.',
    icon: `${ICON_BASE}/populist.svg`,
    tint: '#be123c',
  },
  {
    id: 'cool_head',
    title: 'Cool Head',
    desc: 'Win without ever crossing +2.0°C.',
    icon: `${ICON_BASE}/cool-head.svg`,
    tint: '#0891b2',
  },
];

export const LOCKED_ICON = `${ICON_BASE}/locked.svg`;

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));
