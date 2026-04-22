// Achievement definitions. Each entry:
//   id        — stable key, never reuse.
//   title     — short noun phrase, shown on the badge.
//   desc      — one-sentence unlock condition, player-facing.
//   tint      — optional unlock-state color for the trophy icon; falls
//               back to amber. Locked rows use a single padlock icon.
//   hidden    — if true, desc is hidden until unlocked (spoilery tier).
//
// Check logic lives in /src/model/Achievements.js — this file is data only
// so the UI can render it without running sim code.

const ICON_BASE = '/icons/achievements';

export const UNLOCKED_ICON = `${ICON_BASE}/trophy.svg`;
export const LOCKED_ICON = `${ICON_BASE}/locked.svg`;

export const ACHIEVEMENTS = [
  {
    id: 'first_net_zero',
    title: 'First Among Equals',
    desc: 'Bring one country to Net Zero.',
    tint: '#15803d',
  },
  {
    id: 'stabilized',
    title: 'Stabilized',
    desc: 'Win a run — peak at or below +2.1°C, with 65% of countries at Net Zero.',
    tint: '#b45309',
  },
  {
    id: 'reversed',
    title: 'Reversed',
    desc: 'Win with a "Reversed" grade.',
    tint: '#b45309',
  },
  {
    id: 'clean_sweep',
    title: 'Clean Sweep',
    desc: 'Reach Net Zero in every country in a single run.',
    tint: '#0369a1',
  },
  {
    id: 'petrostate_pivot',
    title: 'Petrostate Pivot',
    desc: 'Bring a petrostate country to Net Zero.',
    tint: '#1f2937',
  },
  {
    id: 'speedrun',
    title: 'Ahead of Schedule',
    desc: 'Reach your first Net Zero before Q1 2035.',
    tint: '#ca8a04',
  },
  {
    id: 'heatwave_survivor',
    title: 'Heatwave Survivor',
    desc: 'Win after peak temperature exceeded +2.5°C.',
    tint: '#dc2626',
  },
  {
    id: 'capstones',
    title: 'Full Tech Tree',
    desc: 'Research every Tier-4 capstone in one run.',
    tint: '#0369a1',
  },
  {
    id: 'collector',
    title: 'Collector',
    desc: 'Claim 50 collectables in a single run.',
    tint: '#a16207',
  },
  {
    id: 'decisive',
    title: 'Decisive',
    desc: 'Resolve 25 decisions in a single run.',
    tint: '#7c3aed',
  },
  {
    id: 'populist',
    title: 'Popular Mandate',
    desc: 'Average world political will exceeds 80 at any point.',
    tint: '#be123c',
  },
  {
    id: 'cool_head',
    title: 'Cool Head',
    desc: 'Win without ever crossing +2.0°C.',
    tint: '#0891b2',
  },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));
