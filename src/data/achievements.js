// Achievement definitions. Each entry:
//   id        — stable key, never reuse.
//   title     — short noun phrase, shown on the badge.
//   desc      — one-sentence unlock condition, player-facing.
//   icon      — emoji-as-glyph (kept simple; pairs with the pixel UI).
//   hidden    — if true, desc is hidden until unlocked (spoilery tier).
//
// Check logic lives in /src/model/Achievements.js — this file is data only
// so the UI can render it without running sim code.

export const ACHIEVEMENTS = [
  {
    id: 'first_net_zero',
    title: 'First Among Equals',
    desc: 'Bring one country to Net Zero.',
    icon: '🌱',
  },
  {
    id: 'stabilized',
    title: 'Stabilized',
    desc: 'Win a run — peak at or below +2.1°C, with 65% of countries at Net Zero.',
    icon: '🏆',
  },
  {
    id: 'reversed',
    title: 'Reversed',
    desc: 'Win with a "Reversed" grade.',
    icon: '⭐',
  },
  {
    id: 'clean_sweep',
    title: 'Clean Sweep',
    desc: 'Reach Net Zero in every country in a single run.',
    icon: '💯',
  },
  {
    id: 'petrostate_pivot',
    title: 'Petrostate Pivot',
    desc: 'Bring a petrostate country to Net Zero.',
    icon: '🛢️',
  },
  {
    id: 'speedrun',
    title: 'Ahead of Schedule',
    desc: 'Reach your first Net Zero before Q1 2035.',
    icon: '⚡',
  },
  {
    id: 'heatwave_survivor',
    title: 'Heatwave Survivor',
    desc: 'Win after peak temperature exceeded +2.5°C.',
    icon: '🔥',
  },
  {
    id: 'capstones',
    title: 'Full Tech Tree',
    desc: 'Research every Tier-4 capstone in one run.',
    icon: '💎',
  },
  {
    id: 'collector',
    title: 'Collector',
    desc: 'Claim 50 collectables in a single run.',
    icon: '⭐',
  },
  {
    id: 'decisive',
    title: 'Decisive',
    desc: 'Resolve 25 council decisions in a single run.',
    icon: '⚖️',
  },
  {
    id: 'populist',
    title: 'Popular Mandate',
    desc: 'Average world political will exceeds 80 at any point.',
    icon: '✊',
  },
  {
    id: 'cool_head',
    title: 'Cool Head',
    desc: 'Win without ever crossing +2.0°C.',
    icon: '❄️',
  },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));
