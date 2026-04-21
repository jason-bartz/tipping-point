// Entry point. Wires data → state → systems → UI together and owns the
// one-line game-lifecycle: country-select → game → end-screen → (back).

import './styles/main.css';
// Bundle TopoJSON world atlas so there's no network dep for the map.
// Vite handles JSON imports out of the box; no import attribute needed.
import topoData from 'world-atlas/countries-110m.json';

import { EventBus, EVT } from './core/EventBus.js';
import { GameLoop } from './core/GameLoop.js';
import { createState } from './core/GameState.js';

import { CarbonSystem } from './systems/CarbonSystem.js';
import { AdoptionSystem } from './systems/AdoptionSystem.js';
import { ResearchSystem } from './systems/ResearchSystem.js';
import { EventSystem } from './systems/EventSystem.js';
import { NewsSystem } from './systems/NewsSystem.js';
import { ScoringSystem } from './systems/ScoringSystem.js';
import { CollectableSystem } from './systems/CollectableSystem.js';
import { PopulationSystem } from './systems/PopulationSystem.js';
import { AdvisorSystem } from './systems/AdvisorSystem.js';
import { MarineLifeSystem } from './systems/MarineLifeSystem.js';

import { HUD } from './ui/HUD.js';
import { WorldMap } from './ui/WorldMap.js';
import { ResearchTree } from './ui/ResearchTree.js';
import { CountryPanel } from './ui/CountryPanel.js';
import { NewsFeed } from './ui/NewsFeed.js';
import { MapAmbience } from './ui/MapAmbience.js';
import { RecoveryBar } from './ui/RecoveryBar.js';
import { CloudLayer } from './ui/CloudLayer.js';
import { SmogPlumes } from './ui/SmogPlumes.js';
import { CouncilPanel } from './ui/CouncilPanel.js';
import { showToast } from './ui/Toast.js';
import { showTutorial, hasSeenTutorial, markTutorialSeen } from './ui/Tutorial.js';
import { showEventModal } from './ui/EventModal.js';
import { showStatsModal } from './ui/StatsModal.js';
import { showEndScreen } from './ui/EndScreen.js';
import { renderCountrySelect } from './ui/CountrySelect.js';
import { installKeyboard } from './ui/Keyboard.js';

import { COUNTRY_PROFILES } from './data/profiles.js';
import { SoundBoard, bindSounds } from './audio/SoundBoard.js';
import { MusicPlayer } from './audio/MusicPlayer.js';
import { save, load, clearSave, installAutoSave } from './save/saveLoad.js';
import { BALANCE } from './config/balance.js';

// ─── Top-level globals. Held in module scope so a "Play Again" click can tear
// the running game down cleanly and rebuild. Keep this small — any state that
// needs to move between screens lives here.
let teardown = null;
let soundBoard = null;
let musicPlayer = null;

function ensureSoundBoard() {
  if (!soundBoard) soundBoard = new SoundBoard();
  return soundBoard;
}

function ensureMusicPlayer() {
  if (!musicPlayer) musicPlayer = new MusicPlayer();
  return musicPlayer;
}

// Show an error banner in the map container. Used when map data somehow
// fails (shouldn't — it's bundled — but belt-and-suspenders).
function showMapError(mapContainer, err) {
  mapContainer.innerHTML = '';
  const banner = document.createElement('div');
  banner.className = 'err-banner';
  banner.innerHTML = `<h3>Map failed to load</h3>
    <p>${err?.message ?? 'Unknown error'}. Try reloading the page.</p>
    <button type="button">Reload</button>`;
  banner.querySelector('button').addEventListener('click', () => window.location.reload());
  mapContainer.appendChild(banner);
}

function startGame(state) {
  // Tear down a running game if one exists (e.g. "Play Again" path).
  if (teardown) { try { teardown(); } catch { /* ignore */ } teardown = null; }

  document.getElementById('country-screen').classList.remove('active');
  document.getElementById('end-screen').classList.remove('active');
  document.getElementById('game').classList.add('active');

  const mapContainer = document.getElementById('map-container');
  mapContainer.innerHTML = ''; // clear loading

  const profile = COUNTRY_PROFILES[state.meta.homeCountryId];
  const mod = state.meta.mod;

  const bus = new EventBus();
  const loop = new GameLoop(state, bus);

  // Systems. Construction order = tick-handler order (EventBus iterates its
  // listener Set in insertion order), so anything that reads a value must be
  // constructed *after* the thing that writes it.
  //   CarbonSystem    → writes co2ppm, tempAnomalyC
  //   PopulationSystem→ reads tempAnomalyC (and adoption)  — placed after carbon
  //   AdoptionSystem  → reads adoption / tempAnomalyC, writes political will
  //   Research / Events / News / Scoring / Collectables — downstream consumers.
  const carbon     = new CarbonSystem(state, bus);     void carbon;
  const population = new PopulationSystem(state, bus); void population;
  const research   = new ResearchSystem(state, bus, mod);
  const adoption   = new AdoptionSystem(state, bus, mod);
  const events     = new EventSystem(state, bus);
  const news       = new NewsSystem(state, bus);
  const scoring    = new ScoringSystem(state, bus);    void scoring;
  const advisors   = new AdvisorSystem(state, bus);
  events.setAdvisorSystem(advisors);

  // UI
  let worldMap;
  try {
    worldMap = new WorldMap(mapContainer, state, bus, topoData);
  } catch (err) {
    console.error('[map] init failed:', err);
    showMapError(mapContainer, err);
    return;
  }
  const ambience = new MapAmbience(mapContainer, state, bus);
  const recovery = new RecoveryBar(mapContainer, state, bus);
  const collectables = new CollectableSystem(state, bus, worldMap, mapContainer);
  const council = new CouncilPanel(mapContainer, state, bus, advisors);
  const marineLife = new MarineLifeSystem(state, bus, worldMap);
  const clouds = new CloudLayer(worldMap);
  const smogPlumes = new SmogPlumes(state, bus, worldMap);

  const board = ensureSoundBoard();
  const music = ensureMusicPlayer();
  const soundUnsubs = bindSounds(board, bus);
  music.start();

  const hud = new HUD(document.getElementById('hud-root'), state, bus, loop, {
    board,
    onHelp:  () => showTutorial({ state, pauseWhileOpen: true }),
    onStats: () => showStatsModal(state),
    onMute:  () => { const m = board.toggleMute(); music.setMuted(m); return m; },
    onSave:  () => { save(state); showToast('Saved', 'Progress written to this browser.', 'good'); },
  });
  const tree  = new ResearchTree(document.getElementById('left-panel'), state, bus, research, loop);
  const panel = new CountryPanel(document.getElementById('right-panel'), state, bus, adoption);
  const feed  = new NewsFeed(document.getElementById('news-bar'), state, bus);
  void hud; void tree; void panel; void feed;

  // Event toasts + modal gating.
  bus.on(EVT.EVENT_FIRED, (p) => {
    if (p.event?.interactive) showEventModal(state, events);
    else showToast(p.event?.title ?? 'Event', p.headline ?? '', p.tone);
  });
  bus.on(EVT.NET_ZERO, (p) =>
    showToast('Net Zero', `${p.country.name} decarbonized. +${BALANCE.milestoneBonusCP} Credits.`, 'good'));
  bus.on(EVT.RESEARCH_STARTED, (p) =>
    showToast('Research Begins', `${p.activity.name} — research underway.`, 'info'));
  bus.on(EVT.RESEARCH_DONE, (p) =>
    showToast('Research Complete', p.activity.name, 'good'));
  bus.on(EVT.COLLECTABLE_CLAIMED, (p) => showToast(p.title, p.body, p.tone));
  bus.on(EVT.RESEARCH_FAILED, ({ reason, cost, activity }) => {
    const msg = {
      insufficient_cp: `Need ${cost ?? ''} Credits for ${activity?.name ?? 'research'}.`,
      branch_busy: `${activity ? activity.name : 'That branch'} can't start — the lab is busy.`,
      prereqs: `Research the prereqs for ${activity?.name ?? 'this'} first.`,
      already: `${activity?.name ?? 'This'} is already researched.`,
    }[reason];
    if (msg) showToast("Can't research", msg, 'bad');
  });
  bus.on(EVT.WON,  (p) => showEndScreen(state, p, true,  { onAgain: returnToSelect }));
  bus.on(EVT.LOST, (p) => showEndScreen(state, p, false, { onAgain: returnToSelect }));

  // Advisor-board toasts — whispers are the only proactive interrupt; agenda
  // resolutions announce themselves as toasts so the player sees the reward.
  bus.on(EVT.ADVISOR_WHISPER, (p) =>
    showToast(`${p.name}: warning`, p.text, 'bad'));
  bus.on(EVT.ADVISOR_AGENDA_RESOLVED, (p) => {
    const seat = state.advisors?.seats?.[p.id];
    if (!seat) return;
    if (p.won && p.reward) {
      showToast(p.reward.title ?? `${seat.name} agenda complete`, p.reward.body ?? '', 'good');
    }
  });
  bus.on(EVT.ADVISOR_ABILITY_USED, (p) => {
    const seat = state.advisors?.seats?.[p.id];
    if (seat) showToast(`${seat.name}`, `${seat.title} used their signature ability.`, 'good');
  });

  // Keyboard shortcuts.
  const removeKeys = installKeyboard(loop, {
    onHelp:  () => showTutorial({ state, pauseWhileOpen: true }),
    onStats: () => showStatsModal(state),
    onMute:  () => {
      const muted = board.toggleMute();
      music.setMuted(muted);
      document.querySelector('.mute-btn')?.classList.toggle('muted', muted);
      const btn = document.querySelector('.mute-btn');
      if (btn) btn.textContent = muted ? 'OFF' : 'SND';
    },
  });

  // Autosave.
  const autoSave = installAutoSave(state, bus, { intervalMs: 20000 });

  // Initial news (only for fresh games — not resumes).
  if (state.meta.tick === 0 && state.news.length === 0) {
    const home = state.countries[state.meta.homeCountryId];
    news.push('Tipping Point Initiative launches. The world watches skeptically.', 'info');
    news.push(`${profile.title}: ${profile.subtitle}. ${profile.bonusLabel}.`, 'info');
    news.push(`${home.name} named host of the Initiative. Home deploys get a 25% discount.`, 'good');
  }

  // Auto-select the home country.
  setTimeout(() => bus.emit(EVT.COUNTRY_SELECTED, { id: state.meta.homeCountryId }), 0);

  state.meta.paused = false;
  loop.start();

  // First-run tutorial.
  if (!hasSeenTutorial()) {
    showTutorial({ state, pauseWhileOpen: true });
    markTutorialSeen();
  }

  // Teardown closure for "Play Again" → country select.
  teardown = () => {
    loop.stop();
    autoSave.stop();
    removeKeys();
    music.stop();
    ambience.destroy?.();
    recovery.destroy?.();
    collectables.destroy?.();
    council.destroy?.();
    advisors.destroy?.();
    marineLife.destroy?.();
    clouds.destroy?.();
    smogPlumes.destroy?.();
    worldMap.destroy?.();
    hud.destroy?.();
    tree.destroy?.();
    population.destroy?.();
    feed.destroy?.();
    soundUnsubs.forEach(u => u?.());
    // Clear mounts.
    for (const id of ['hud-root', 'left-panel', 'right-panel', 'news-bar']) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    }
    mapContainer.innerHTML = '';
    const toastStack = document.getElementById('toast-stack');
    if (toastStack) toastStack.innerHTML = '';
  };
}

function newGame(homeCountryId) {
  if (!homeCountryId || !COUNTRY_PROFILES[homeCountryId]) return;
  const state = createState(homeCountryId);
  const profile = COUNTRY_PROFILES[homeCountryId];
  for (const id of profile.starter) state.world.researched.add(id);
  // Discard any prior save when starting a new run — the resume banner on
  // the select screen already offers the alternative.
  clearSave();
  startGame(state);
}

function resumeGame() {
  const state = load();
  if (!state) {
    showToast("Couldn't resume", "The save appears corrupted. Starting fresh.", 'bad');
    return;
  }
  startGame(state);
}

function returnToSelect() {
  if (teardown) { try { teardown(); } catch { /* ignore */ } teardown = null; }
  clearSave(); // the finished game is a snapshot of a game that's over
  document.getElementById('game').classList.remove('active');
  document.getElementById('end-screen').classList.remove('active');
  document.getElementById('country-screen').classList.add('active');
  renderCountrySelect({ onStart: newGame, onResume: resumeGame });
}

// ─── Boot ────────────────────────────────────────────────────────────────
renderCountrySelect({ onStart: newGame, onResume: resumeGame });
