# Tipping Point — Gameplay Loop, In Depth

## The one-line premise
It's 2026. CO₂ is at 420 ppm, global temperature is +1.2°C. You don't spread a disease — you spread **solutions**. Every tick is one quarter of a year (4.5 real seconds at 1× speed). You pause, strategize, deploy, and race the atmosphere.

## The core pipeline, every tick

Each tick, the sim runs this pipeline in order ([src/systems/](../src/systems/)):

1. **BAU creep** — each country's baseline emissions grow by ~0.5%/yr, dampened by how much clean tech you've deployed there.
2. **Carbon cycle** — global emissions roll up, CO₂ updates via an airborne-fraction model (42% of emissions stay aloft), minus ocean uptake and land/capture-branch removals (`airborneFraction` in [balance.js](../src/config/balance.js)).
3. **Temperature** — chases a CO₂-driven equilibrium with lag (`tempPerDoublingCO2: 3.0`, `tempResponseLag: 0.04`).
4. **Climate Points (currency)** — you earn `baseCPPerTick: 0.45` passively, plus bonuses from each Net-Zero country.
5. **Adoption spread** — researched activities bleed from adopted countries to their neighbors at a rate of `0.017`, gated by political will and branch-specific resistance (petrostates resist energy/policy, agricultural resists land less).
6. **Political will drift** toward 50 — **faster when it's hot**. Heat creates anxiety, which is a two-edged sword; it can move publics *toward* action, or crash stability.
7. **Event director rolls** — ~6.5% chance/tick for a passive event (with a 4-tick min gap), independent track for interactive decisions (~every 24 ticks), and an **IPCC report** forced every 16 ticks.
8. **News ticker** rolls a flavor headline (rate-limited).
9. **Collectable bubbles** pop up on the map (Plague-Inc style — click before they fade).
10. **Scoring check** — peak temp, peak CO₂, and history are all recorded; win/loss evaluated ([Scoring.js `evaluateOutcome`](../src/model/Scoring.js)).

## What you actually do as a player

### 1. Pick a country (and therefore a strategy)
10 starters across 4 difficulty bands ([profiles.js](../src/data/profiles.js)). Home country gets **25% off deploys** and **+15 political will** permanently. Your starter ships with two pre-researched activities.

- Easy: Nordic Bloc, Germany
- Medium: UK, Japan, Brazil
- Hard: US, China, India
- Very Hard: Saudi Arabia, Russia

### 2. Earn Credits, spend on Research
One research slot **per branch**, so up to **6 projects run in parallel**. Branches: Energy, Transport, Industry, Land, Capture, Policy. Each has 4 tiers:
- **Tier 1**: 1–3 credits, ~15–25 seconds
- **Tier 2**: 4–8 credits, ~45–60 seconds
- **Tier 3**: 10–13 credits, ~2 minutes
- **Tier 4**: 22–30 credits, ~4–6 minutes (the moonshots — Fusion, Maglev, Gigaton Capture, Planetary Treaty)

Credits are deliberately tight. Stockpiling feels like dragging — the design wants you choosing constantly.

### 3. Deploy researched activities into countries
Click a country, pick a researched activity, pay the deploy cost. Adoption in that branch goes up. But:

- **Diminishing returns per (country, activity)**: 1st deploy = 100% yield, 2nd = 65%, 3rd = 42%. Cap of 3 per pair. Cost also doubles each repeat. So the 3rd deploy gives ~10% the adoption-per-credit of the 1st. **Spread activities across countries; don't pile them into one nation.** (`deployDiminishingBase`, `deployMaxPerPair`, `deployCostEscalation` in [balance.js](../src/config/balance.js))
- **Political will gates**: "Hard" deploys (mandates, taxes, phase-outs) check `willRequirement + willInfraModifier`. Petrostates add +20, industrial +8. Petrostates add a further +12 to policy, +8 to energy. Tech incentives have no gate — they pass on a signature.
- Deploys spend some of that country's will.

### 4. Chase Net Zero across the world
A country hitting **≥80% average adoption across all 6 branches** flips to **Net Zero**. Net-Zero countries become permanent accelerators: they spread faster to their neighbors, and they boost your per-tick Credit income. This is your engine — you need a critical mass of Net-Zero countries for victory.

### 5. Grab collectables (Plague-Inc bubbles)
Five types weighted toward high-emission countries (where the fight matters):
- 🌱 Grassroots (54%): +2 CP, +4 local will
- 🌻 Garden Plot (8%): +1 CP, +3% Land adoption in spawn country
- 🍃 ESG Shift (23%): +3 CP, +4% adoption in leading sector
- ⭐ Climate Rally (12%): +5 CP, +6 local will, +4 neighbor will
- 💎 Policy Breakthrough (3%): +8 CP, **30% off research for 4 ticks** — huge

Max 2 on screen at once; they fade after 5 ticks.

### 6. Handle events and decisions
- **Global crises** fire always: oil lobby wins, heat dome, recession, grid cyberattack.
- **Guarded tipping points** (permafrost burp, Amazon dieback, coral bleach) only fire when you're already on a bad trajectory — they punish bad play, not bad luck.
- **Interactive events** demand a choice with a 12-tick timeout. Ignoring them costs 8 political will + 3 societal stress. Examples: geoengineering offer, petrostate deal, nuclear dilemma, carbon tariff.

### 7. Manage hidden axes
- **Forest health** per country regenerates from Land-branch deploys and decays above +1.4°C. If it drops below 80% of baseline, carbon liability accrues on the sitting government.
- **Government slots (incumbent + shadow)** each carry a climate stance (green / mixed / denier). Green adds +6 will and 1.08× spread; denier subtracts 6 will and 1.5× liability rate. When liability hits 100, the shadow promotes — a **green succession** is a 15-will honeymoon, a **denier succession** craters 15 will and drops policy/energy adoption.
- **Advisory Board**: advisors pitch agendas; winning grows their influence (+10), reaching 80 unlocks their abilities. Conflicts between advisors appear after a 20-tick grace.

## How you win

Victory is **reversal-based**, not a score threshold. You have to actually turn the curve:

**Standard win** ([Scoring.js](../src/model/Scoring.js)):
- CO₂ dropped **≥8 ppm from its peak** (you're clearly past the top)
- CO₂ ≤ **395 ppm**
- Peak temperature ≤ **+2.1°C**
- **≥65% of countries at Net Zero**

**Perfect win** (S-tier):
- CO₂ ≤ **360 ppm**, peak temp ≤ **+1.6°C**, **≥90%** Net Zero

**Loss**: temperature hits **+4.0°C** — the Hothouse Earth cascade. Civilization can't adapt fast enough. Game over ([`BALANCE.lossTempC`](../src/config/balance.js)).

Final grade: **S** (≤350 ppm & ≤1.5°C) · **A** (≤375 & ≤1.7) · **B** (≤395 & ≤1.9) · **C** (≤420 & ≤2.3) · **D** anything worse.

## The strategic arc of a typical run

1. **Opening (first ~40 ticks)**: stack tier-1 in your home country for the discount. Rush cheap Energy (solar/wind) or Transport (cycling/EV subsidies) to get adoption rolling. Grab every collectable — early CP compounds.
2. **Mid-game (crisis corridor)**: temperature is climbing past +1.5°C, political will drifts erratically, tipping-point events start hunting you if CO₂ is still rising. Here you're pivoting to **tier 2/3** and spreading activities to high-emitter neighbors (China, US, India) via adjacency. The **Policy** branch unlocks carbon pricing and international cooperation that accelerate every other branch.
3. **Endgame (chasing reversal)**: you need massive removals to bend the curve. **Capture** branch (DAC, BECCS, Gigaton Capture) and **Land** (reforestation, biochar, rewilding) net out emissions. You're shepherding 15+ countries to 80% adoption while defending forest health and green governments from deniers. The moment CO₂ falls 8+ ppm from peak and you've got 65% Net Zero under the temp ceiling — you win.

## Keyboard (you'll use these constantly)
**Space** pause · **1/2/4** speed · **M** mute · **H** help · **S** stats · **Esc** close modal
