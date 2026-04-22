// English strings — the canonical source. New copy lives here first; other
// locales fall back here when a key is missing. Keep keys stable; translators
// key off them.
//
// Starter wave: tutorial, title/intro, win/loss bylines, most common toasts.
// UI strings still baked into components can migrate gradually — `t(key)`
// falls through to the passed key if the bundle is missing one, so partial
// adoption is safe.

export const en = {
  // ─── Title + intro screens ─────────────────────────────────────────────
  'title.gameName': 'TIPPING POINT',
  'title.tagline': 'A strategy game about reversing climate change, one country at a time.',
  'title.beginCta': 'Begin',
  'title.resumeCta': 'Resume saved game',

  'picker.title': 'Choose Your Country',
  'picker.back': '← Back',
  'picker.sub': 'Each country is a different opening. Click a card to see its story, strengths, and suggested opening. Difficulty reflects how hard decarbonization starts — not the end state.',

  // ─── Tutorial ──────────────────────────────────────────────────────────
  'tutorial.title': 'How to Play',
  'tutorial.intro': 'No ticking clock. You play until you <b>reverse</b> climate change — or until temperature crosses <b>+4°C</b> and civilization fails. Here\'s the loop:',
  'tutorial.step1': 'Earn <b>Carbon Credits <img class="credit-icon" src="/icons/credit.png" alt="" aria-hidden="true"></b> slowly each quarter. Entry activities cost just <b>1–3</b> credits, so you can start building fast.',
  'tutorial.step2': '<b>Research takes time</b> and shows a live countdown. Run <b>one project per branch</b> in parallel — up to 6 at once.',
  'tutorial.step3': 'Click a country on the <b>map</b>, then <b>Deploy</b> from the <b>right panel</b>. Adoption rises locally and neighbors copy what works. Your <b>home country</b> gets a 25% discount.',
  'tutorial.step4': 'Click <b>bubbles</b> on the map for bonuses. They fade fast. <b>Events</b> (some with hard choices) will swing things either direction.',
  'tutorial.step5': '<b>Win</b>: CO₂ clearly past its peak (dropped 8+ ppm), peak temp ≤ <b>+2.1°C</b>, and <b>65%+</b> of countries at Net Zero. <b>Lose</b>: temperature hits <b>+4°C</b>.',
  'tutorial.step6': '<b>Keyboard</b>: <span class="kbd">Space</span> pause · <span class="kbd">1</span>/<span class="kbd">2</span>/<span class="kbd">4</span> speed · <span class="kbd">M</span> mute · <span class="kbd">H</span> help · <span class="kbd">S</span> stats · <span class="kbd">Esc</span> close a modal.',
  'tutorial.outro': 'Your progress autosaves every 20 seconds. Close the tab and come back later — the world waits. Progress is slow early on; stick with it.',
  'tutorial.dismiss': "Got it — let's go",

  // ─── HUD labels ────────────────────────────────────────────────────────
  'hud.date': 'Date',
  'hud.co2': 'CO₂',
  'hud.temp': 'Temp',
  'hud.netZero': 'Net Zero',
  'hud.credits': 'Credits',
  'hud.pop': 'Pop',
  'hud.save': 'SAVE',
  'hud.mute': 'SND',
  'hud.stats': 'STATS',
  'hud.help': '?',
  'hud.pauseTitle': 'Pause (Space)',

  // ─── Common toasts ─────────────────────────────────────────────────────
  'toast.saved.title': 'Saved',
  'toast.saved.body': 'Progress written to this browser.',
  'toast.researchBegins.title': 'Research Begins',
  'toast.researchBegins.body': '{name} — research underway.',
  'toast.researchComplete.title': 'Research Complete',
  'toast.netZero.title': 'Net Zero',
  'toast.netZero.body': '{country} decarbonized. +{bonus} Credits.',
  'toast.cantResearch.title': "Can't research",
  'toast.cantDeploy.title': "Can't deploy",
  'toast.cantDeploy.insufficientCp': 'Need {cost} Credits for {name}.',
  'toast.cantDeploy.notResearched': 'Research {name} first.',
  'toast.cantDeploy.noCountry': 'Pick a country first.',
  'toast.cantDeploy.willGate': 'Political Will too low for {name} (need {threshold}, have {have}). Build consent first.',

  // ─── End screens ───────────────────────────────────────────────────────
  'end.won.title': 'You did it.',
  'end.lost.title': 'The planet ran out of time.',
  'end.playAgain': 'Play again',

  // ─── Country panel ─────────────────────────────────────────────────────
  'panel.country.empty': 'Click a country on the map to see its sectors and deploy clean tech there.',
  'panel.country.deploying': 'Deploy to {country}',
  'panel.sectors.title': 'Sector adoption',
  'panel.sectors.sub': 'how clean this country is, by sector',
};
