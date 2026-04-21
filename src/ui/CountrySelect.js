// Country-select screen. Two-stage flow:
//   1) Intro panel — hero pitch, win/lose rules, "Begin" CTA.
//   2) Country gallery — compact cards with difficulty + one-liner. Click
//      a card to open a centered detail modal (writeup, strengths, challenges,
//      suggested opening, stats). The modal's CTA starts the game.
// Resume banner surfaces on the gallery stage when a save exists.

import { COUNTRIES } from '../data/countries.js';
import { ACTIVITIES } from '../data/activities.js';
import { COUNTRY_PROFILES, STARTER_ORDER, DIFFICULTY_LABEL } from '../data/profiles.js';
import { waveFlag, isBlocFlag } from '../data/flags.js';
import { hasSave, readSaveMeta, clearSave } from '../save/saveLoad.js';
import { installModalA11y } from './modal-a11y.js';

const STAGE_INTRO = 'intro';
const STAGE_PICK  = 'pick';

const ASSET_BASE = import.meta.env?.BASE_URL ?? '/';
const WALLPAPER_URL = `${ASSET_BASE}title-wallpaper.svg`;
const LOGO_URL = `${ASSET_BASE}tipping-point-logo.svg`;

export function renderCountrySelect({ onStart, onResume } = {}) {
  const root = document.getElementById('title-root');
  if (!root) return;

  // Painted wallpaper on the title screen. Set inline so the URL respects
  // Vite's BASE_URL (public/ assets don't play nicely with CSS url() under
  // relative base). Needs !important to beat the pixel theme's
  // `.screen { background: ... !important }` shorthand, whose implicit
  // background-image: none !important would otherwise erase ours.
  const screen = document.getElementById('country-screen');
  if (screen) screen.style.setProperty('background-image', `url('${WALLPAPER_URL}')`, 'important');

  // If a save exists, skip straight to the picker so Resume is one click away.
  let stage = hasSave() ? STAGE_PICK : STAGE_INTRO;
  let openModal = null;

  function render() {
    if (stage === STAGE_INTRO) renderIntro();
    else renderPicker();
  }

  function renderIntro() {
    root.innerHTML = `
      <div class="intro-hero">
        <img class="intro-logo" src="${LOGO_URL}" alt="Tipping Point" />
        <div class="intro-tag">A strategy game about reversing climate change, one country at a time.</div>
      </div>
      <div class="intro-body">
        <div class="intro-grid">
          <div class="intro-card intro-win">
            <div class="intro-card-label">To win</div>
            <ul>
              <li>Push CO₂ past its peak and <b>8+ ppm below</b> it</li>
              <li>Keep peak temperature at or under <b>+2.1°C</b></li>
              <li>Get <b>65%+</b> of countries to Net Zero</li>
            </ul>
          </div>
          <div class="intro-card intro-loop">
            <div class="intro-card-label">Each quarter</div>
            <ul>
              <li>Earn <b>Credits</b> — slow at first, faster with progress</li>
              <li><b>Research</b> one project per branch (up to 6 in parallel)</li>
              <li><b>Deploy</b> to a country on the map to raise adoption</li>
              <li>Neighbors copy what works — influence ripples outward</li>
            </ul>
          </div>
          <div class="intro-card intro-lose">
            <div class="intro-card-label">To lose</div>
            <ul>
              <li>Let temperature climb past <b>+4°C</b>, and it's over</li>
              <li>Political will burns out when the heat doesn't relent</li>
              <li>Stalling is losing in slow motion</li>
            </ul>
          </div>
        </div>
        <div class="intro-cta-row">
          <button class="intro-cta" id="intro-begin">Begin</button>
          ${hasSave() ? `<button class="intro-cta-ghost" id="intro-resume">Resume game</button>` : ''}
        </div>
      </div>`;

    root.querySelector('#intro-begin').addEventListener('click', () => {
      stage = STAGE_PICK;
      render();
    });
    root.querySelector('#intro-resume')?.addEventListener('click', () => onResume?.());
  }

  function renderPicker() {
    const cardsHTML = STARTER_ORDER.map(id => {
      const c = COUNTRIES.find(x => x.id === id);
      const p = COUNTRY_PROFILES[id];
      if (!c || !p) return '';
      return compactCardHTML(c, p);
    }).join('');

    root.innerHTML = `
      <div class="pick-head">
        <button class="pick-back" id="pick-back" title="Back to intro" aria-label="Back to intro">Back</button>
        <h1 class="pick-title">Choose Your Country</h1>
        <p class="pick-sub">Each country plays differently. Click one for its story and suggested opening.</p>
      </div>
      <div class="starters" id="starters">${cardsHTML}</div>
      <div id="resume-slot"></div>`;

    root.querySelector('#pick-back').addEventListener('click', () => {
      stage = STAGE_INTRO;
      render();
    });

    root.querySelectorAll('.starter').forEach(el => {
      const id = el.dataset.id;
      const open = () => openDetailModal(id);
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          open();
          e.preventDefault();
        }
      });
    });

    renderResumeBanner(root.querySelector('#resume-slot'));
  }

  function compactCardHTML(c, p) {
    const flagSrc = waveFlag(c.id);
    const flagHTML = flagSrc
      ? `<img class="starter-flag ${isBlocFlag(c.id) ? 'bloc' : ''}" src="${flagSrc}" alt="" aria-hidden="true" />`
      : '';

    return `
      <div class="starter" data-id="${c.id}" tabindex="0" role="button" aria-label="${p.title}, ${DIFFICULTY_LABEL[p.difficulty]} — open details">
        <div class="starter-head">
          <div class="starter-title">
            ${flagHTML}
            <div>
              <h3>${p.title}</h3>
              <div class="starter-sub">${p.subtitle}</div>
            </div>
          </div>
          <span class="diff ${p.difficulty}">${DIFFICULTY_LABEL[p.difficulty]}</span>
        </div>
        <div class="starter-oneline">${p.bonusLabel}</div>
        <div class="starter-toggle-row">
          <span class="starter-toggle-hint">Click for details</span>
          <span class="starter-toggle-caret">▸</span>
        </div>
      </div>`;
  }

  function openDetailModal(id) {
    if (openModal) return;
    const c = COUNTRIES.find(x => x.id === id);
    const p = COUNTRY_PROFILES[id];
    if (!c || !p) return;

    const starterNames = p.starter.map(sid => ACTIVITIES.find(a => a.id === sid)?.name).filter(Boolean);
    const flagSrc = waveFlag(c.id);
    const flagHTML = flagSrc
      ? `<img class="starter-modal-flag ${isBlocFlag(c.id) ? 'bloc' : ''}" src="${flagSrc}" alt="" aria-hidden="true" />`
      : '';

    const modal = document.createElement('div');
    modal.className = 'modal starter-modal';
    modal.innerHTML = `
      <div class="starter-modal-card" role="dialog" aria-label="${p.title} — country details">
        <div class="starter-modal-head">
          ${flagHTML}
          <div class="starter-modal-title">
            <h2>${p.title}</h2>
            <div class="starter-modal-sub">${p.subtitle}</div>
          </div>
          <span class="diff ${p.difficulty}">${DIFFICULTY_LABEL[p.difficulty]}</span>
        </div>
        <div class="starter-modal-body">
          <p class="starter-writeup">${p.writeup}</p>
          <div class="starter-bonus">
            <span class="bonus-label">SIGNATURE</span>
            <span class="bonus-text">${p.bonusLabel}</span>
          </div>
          <div class="starter-columns">
            <div class="starter-col">
              <div class="starter-col-title">Strengths</div>
              <ul>${p.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
            </div>
            <div class="starter-col">
              <div class="starter-col-title">Challenges</div>
              <ul>${p.challenges.map(s => `<li>${s}</li>`).join('')}</ul>
            </div>
          </div>
          <div class="starter-recommend">
            <span class="starter-rec-label">Suggested opening</span> ${p.recommended}
          </div>
          <div class="starter-meta">
            <span class="chip" title="Economic profile">${c.infra}</span>
            <span class="chip" title="Starting political will (0-100)">Will ${c.politicalWill}</span>
            <span class="chip" title="Baseline annual emissions">${c.baseEmissionsGtCO2.toFixed(1)} Gt/yr</span>
            ${starterNames.map(n => `<span class="chip chip-starter" title="Pre-researched at start">${n}</span>`).join('')}
          </div>
        </div>
        <div class="starter-modal-foot">
          <button class="starter-modal-close" type="button" title="Close (Esc)" aria-label="Close">Close</button>
          <button class="starter-select-btn" type="button">Play as ${p.title}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const close = () => {
      teardownA11y?.();
      modal.remove();
      openModal = null;
    };
    modal.querySelector('.starter-modal-close').addEventListener('click', close);
    modal.querySelector('.starter-select-btn').addEventListener('click', () => {
      close();
      onStart?.(id);
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    const teardownA11y = installModalA11y(modal.querySelector('.starter-modal-card'), {
      onClose: close,
      label: `${p.title} — country details`,
    });
    openModal = { close };
  }

  function renderResumeBanner(slot) {
    if (!slot) return;
    if (!hasSave()) return;
    const meta = readSaveMeta();
    if (!meta) return;
    const p = COUNTRY_PROFILES[meta.homeCountryId];
    const banner = document.createElement('div');
    banner.id = 'resume-banner';
    banner.className = 'resume-banner';
    banner.innerHTML = `<div class="resume-info">
        <b>Resume your game</b> — ${p?.title ?? meta.homeCountryId}, Q${meta.quarter} ${meta.year} · ${meta.co2ppm.toFixed(1)} ppm · +${meta.tempAnomalyC.toFixed(2)}°C
      </div>
      <div class="resume-btns">
        <button class="resume-discard" type="button">Start over</button>
        <button class="resume-play" type="button">Resume</button>
      </div>`;
    slot.appendChild(banner);
    banner.querySelector('.resume-play').addEventListener('click', () => onResume?.());
    banner.querySelector('.resume-discard').addEventListener('click', () => {
      clearSave();
      banner.remove();
    });
  }

  render();
}
