// Glossary modal. Reads from src/data/glossary.js and renders an
// alphabetically grouped, searchable reference of climate terms.
//
// Interaction surface:
//   · live search (filters name + definition + category)
//   · A–Z jump bar (scrolls the container to a letter's section)
//   · category pill on each entry (visual tag, not a filter)
//
// Accessibility:
//   · role="dialog" + aria-label via installModalA11y
//   · search input is labeled; letter nav is role="navigation"
//   · each entry is a <dt>/<dd> pair inside a single <dl> per letter
//   · clicking the backdrop or pressing Esc closes; focus is restored

import { GLOSSARY, GLOSSARY_CATEGORIES } from '../data/glossary.js';
import { installModalA11y } from './modal-a11y.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function normalize(s) {
  // Strip accents + lowercase so search matches "CO2e" ≈ "co₂e" and
  // "niño" matches "nino". Fall back to plain lowercase in the unlikely
  // event a runtime doesn't support Unicode normalization.
  try { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  catch { return s.toLowerCase(); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// First letter an entry should be filed under. Uses the first A–Z character
// in its normalized term, so "CO₂e" lands on C, numbers would fall through
// to '#' (not currently used — kept for future-proofing).
function firstLetter(term) {
  const n = normalize(term);
  for (const ch of n) {
    if (ch >= 'a' && ch <= 'z') return ch.toUpperCase();
  }
  return '#';
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const an = normalize(a.term);
    const bn = normalize(b.term);
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
}

function groupByLetter(entries) {
  const g = new Map();
  for (const e of entries) {
    const L = firstLetter(e.term);
    if (!g.has(L)) g.set(L, []);
    g.get(L).push(e);
  }
  return g;
}

export function showGlossary() {
  if (document.querySelector('.glossary-modal')) return;

  const sorted = sortEntries(GLOSSARY);
  const total = sorted.length;

  const modal = document.createElement('div');
  modal.className = 'modal glossary-modal';

  const alphaButtons = LETTERS.map((L) => {
    const has = sorted.some((e) => firstLetter(e.term) === L);
    return `<button type="button" class="glossary-alpha-btn" data-letter="${L}" ${has ? '' : 'disabled'} aria-label="Jump to ${L}">${L}</button>`;
  }).join('');

  modal.innerHTML = `
    <div class="glossary-card" role="dialog" aria-label="Climate glossary">
      <div class="glossary-head">
        <h2>Glossary</h2>
        <button type="button" class="glossary-close" aria-label="Close glossary">×</button>
      </div>
      <div class="glossary-toolbar">
        <label class="glossary-search-wrap">
          <span class="glossary-search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            class="glossary-search"
            placeholder="Search ${total} terms…"
            aria-label="Search glossary"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <nav class="glossary-alpha" aria-label="Jump to letter">${alphaButtons}</nav>
      </div>
      <div class="glossary-body" tabindex="0">
        ${renderSections(sorted)}
        <div class="glossary-empty" hidden>No terms match your search.</div>
      </div>
      <div class="glossary-foot">
        <span class="glossary-count"><b>${total}</b> terms</span>
        <span class="glossary-hint">Definitions drawn from IPCC, IEA, NOAA, and Global Carbon Project sources.</span>
      </div>
    </div>`;

  document.body.appendChild(modal);

  const card   = modal.querySelector('.glossary-card');
  const body   = modal.querySelector('.glossary-body');
  const search = modal.querySelector('.glossary-search');
  const empty  = modal.querySelector('.glossary-empty');
  const alphaBtns = /** @type {NodeListOf<HTMLButtonElement>} */ (modal.querySelectorAll('.glossary-alpha-btn'));

  const close = () => {
    teardownA11y();
    modal.remove();
  };
  const teardownA11y = installModalA11y(card, { onClose: close, label: 'Climate glossary' });

  modal.querySelector('.glossary-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  // ─── Live search ────────────────────────────────────────────────────────
  // Debounce the filter pass so large inputs (paste) aren't doing N passes.
  let searchTimer = null;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => applyFilter(search.value), 80);
  });

  function applyFilter(q) {
    const query = normalize(q.trim());
    const sections = body.querySelectorAll('.glossary-letter');
    const hasQuery = query.length > 0;
    let totalVisible = 0;

    for (const section of sections) {
      let sectionVisible = 0;
      const entries = section.querySelectorAll('.glossary-entry');
      for (const entry of entries) {
        const hay = entry.getAttribute('data-haystack') || '';
        const match = !hasQuery || hay.includes(query);
        entry.toggleAttribute('hidden', !match);
        if (match) sectionVisible++;
      }
      section.toggleAttribute('hidden', sectionVisible === 0);
      totalVisible += sectionVisible;
    }

    empty.toggleAttribute('hidden', totalVisible > 0);

    // Update letter nav: disabled letters = no entries visible for that letter
    // after filtering. Keeps the nav useful while searching.
    for (const btn of alphaBtns) {
      const L = btn.getAttribute('data-letter');
      const section = body.querySelector(`.glossary-letter[data-letter="${L}"]`);
      const sectionVisible = section && !section.hasAttribute('hidden');
      btn.disabled = !sectionVisible;
    }
  }

  // ─── A–Z nav ────────────────────────────────────────────────────────────
  for (const btn of alphaBtns) {
    btn.addEventListener('click', () => {
      const L = btn.getAttribute('data-letter');
      const section = body.querySelector(`.glossary-letter[data-letter="${L}"]`);
      if (!section) return;
      // Scroll within the body container only — never the page behind.
      body.scrollTo({ top: section.offsetTop - 8, behavior: 'smooth' });
      // Brief highlight so the jump lands visibly.
      section.classList.remove('glossary-letter--flash');
      // Force reflow so we can retrigger the animation.
      void section.offsetWidth;
      section.classList.add('glossary-letter--flash');
    });
  }

  // Focus the search on open so keyboard users can start typing immediately.
  setTimeout(() => search.focus({ preventScroll: true }), 0);
}

function renderSections(sorted) {
  const groups = groupByLetter(sorted);
  const out = [];
  for (const L of LETTERS) {
    const items = groups.get(L);
    if (!items || !items.length) continue;
    out.push(`
      <section class="glossary-letter" data-letter="${L}">
        <h3 class="glossary-letter-head" id="glossary-letter-${L}">${L}</h3>
        <dl class="glossary-list">
          ${items.map(renderEntry).join('')}
        </dl>
      </section>`);
  }
  return out.join('');
}

function renderEntry(e) {
  const cat = GLOSSARY_CATEGORIES[e.category] ?? null;
  const catPill = cat
    ? `<span class="glossary-pill" style="--pill:${cat.color}">${escapeHtml(cat.label)}</span>`
    : '';
  // Precompute a normalized searchable string per entry. The data-haystack
  // attribute is the single source of truth for the filter — keeps the input
  // handler tight and avoids re-walking the DOM per keystroke.
  const hay = normalize(`${e.term} ${e.def} ${cat?.label ?? ''}`);
  return `
    <div class="glossary-entry" data-haystack="${escapeHtml(hay)}">
      <dt class="glossary-term">
        <span class="glossary-term-name">${escapeHtml(e.term)}</span>
        ${catPill}
      </dt>
      <dd class="glossary-def">${escapeHtml(e.def)}</dd>
    </div>`;
}
