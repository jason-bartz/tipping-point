// Stats dashboard. Renders six sparkline cards + three country rankings.
// Pauses the game while open; re-renders every 600ms so peaks vs current
// stay legible even when paused.

import { BALANCE } from '../config/balance.js';
import { ACTIVITIES } from '../data/activities.js';
import { formatPopulationFull, formatPopulationCompact, formatDelta } from '../model/Population.js';
import { installModalA11y } from './modal-a11y.js';

function sparkline(values, opts = {}) {
  const { width = 260, height = 56, stroke = '#4ade80', fill = 'rgba(74,222,128,0.18)', minY, maxY } = opts;
  if (!values || values.length < 2) return `<div class="spark-empty">Collecting data…</div>`;
  const min = minY ?? Math.min(...values);
  const max = maxY ?? Math.max(...values);
  const range = (max - min) || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(' ');
  const area = `0,${height} ${line} ${width},${height}`;
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" width="100%" height="${height}">
    <polyline points="${area}" fill="${fill}" stroke="none"/>
    <polyline points="${line}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

export function showStatsModal(state) {
  if (document.querySelector('.stats-modal')) return;
  const modal = document.createElement('div');
  modal.className = 'modal stats-modal';
  document.body.appendChild(modal);
  const wasPaused = state.meta.paused;
  state.meta.paused = true;

  const renderBody = () => {
    const w = state.world;
    const countries = Object.values(state.countries);
    const nz = countries.filter(c => c.netZero).length;
    const total = countries.length;
    const avgAdopt = countries.reduce((s, c) => s + Object.values(c.adoption).reduce((a, b) => a + b, 0) / 6, 0) / total;
    const avgWill = countries.reduce((s, c) => s + c.politicalWill, 0) / total;
    const tempDelta = w.tempHistory.length >= 6 ? w.tempAnomalyC - w.tempHistory[Math.max(0, w.tempHistory.length - 6)] : 0;
    const co2Delta  = w.co2History.length  >= 6 ? w.co2ppm        - w.co2History [Math.max(0, w.co2History.length  - 6)] : 0;
    const emDelta   = w.emissionsHistory.length >= 6 ? w.annualEmissionsGtCO2 - w.emissionsHistory[Math.max(0, w.emissionsHistory.length - 6)] : 0;

    const trendArrow = (delta, higherIsBad = true, thresh = 0.001) => {
      if (Math.abs(delta) < thresh) return '<span class="trend-arrow trend-flat">→</span>';
      const up = delta > 0;
      const bad = higherIsBad ? up : !up;
      return `<span class="trend-arrow ${bad ? 'trend-up' : 'trend-down'}">${up ? '↑' : '↓'} ${Math.abs(delta).toFixed(2)}</span>`;
    };

    const withEmissions = countries.map(c => {
      const avg = Object.values(c.adoption).reduce((a, b) => a + b, 0) / 6;
      const live = Math.max(0, c.baseEmissionsGtCO2 * (1 - avg * BALANCE.baseEmissionReductionPerAdoption));
      return { c, live, avg };
    });
    const topEmitters = [...withEmissions].sort((a, b) => b.live - a.live).slice(0, 8);
    const topAdopters = [...withEmissions].sort((a, b) => b.avg  - a.avg ).slice(0, 8);
    const laggards    = [...withEmissions].sort((a, b) => a.avg  - b.avg ).slice(0, 6);

    const bar = (pct, color) => `<div class="stats-bar-track"><div class="stats-bar-fill" style="width:${Math.round(pct*100)}%;background:${color}"></div></div>`;
    const pctLabel = v => `${Math.round(v * 100)}%`;
    const countryRow = (row, rhs) => `
      <div class="stats-country-row">
        <span class="stats-country-name">${row.c.name}${row.c.isHome ? ' <span class="home-badge-mini">HOME</span>' : ''}${row.c.netZero ? ' <span class="nz-badge-mini">NZ</span>' : ''}</span>
        ${rhs(row)}
      </div>`;

    const tempMin = Math.min(...w.tempHistory, BALANCE.startingTempAnomalyC - 0.1);
    const tempMax = Math.max(...w.tempHistory, BALANCE.lossTempC);
    const co2Min  = Math.min(...w.co2History, 350);
    const co2Max  = Math.max(...w.co2History, BALANCE.startingCO2ppm + 10);
    const emMax   = Math.max(...w.emissionsHistory, 45);

    modal.innerHTML = `<div class="stats-card" role="dialog" aria-label="World Stats">
      <div class="stats-head">
        <h2>World Stats <span class="stats-year">Q${state.meta.quarter} ${state.meta.year}</span></h2>
        <button class="stats-close" title="Close (Esc or click outside)">✕</button>
      </div>

      <div class="stats-grid">
        <div class="stats-card-inner">
          <div class="stats-label">Temperature <span class="stats-peak">peak +${(w.peakTempAnomalyC ?? w.tempAnomalyC).toFixed(2)}°C</span></div>
          <div class="stats-big">+${w.tempAnomalyC.toFixed(2)}°C ${trendArrow(tempDelta, true, 0.005)}</div>
          ${sparkline(w.tempHistory, { stroke: '#ef4444', fill: 'rgba(239,68,68,0.14)', minY: tempMin, maxY: tempMax })}
          <div class="stats-range"><span>start +${BALANCE.startingTempAnomalyC.toFixed(1)}°C</span><span>loss +${BALANCE.lossTempC.toFixed(1)}°C</span></div>
        </div>
        <div class="stats-card-inner">
          <div class="stats-label">CO₂ <span class="stats-peak">peak ${(w.peakCO2ppm ?? w.co2ppm).toFixed(1)} ppm</span></div>
          <div class="stats-big">${w.co2ppm.toFixed(1)} ppm ${trendArrow(co2Delta, true, 0.1)}</div>
          ${sparkline(w.co2History, { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.14)', minY: co2Min, maxY: co2Max })}
          <div class="stats-range"><span>pre-industrial 280</span><span>win ≤${BALANCE.winCO2ppm} ppm</span></div>
        </div>
        <div class="stats-card-inner">
          <div class="stats-label">Annual Emissions</div>
          <div class="stats-big">${w.annualEmissionsGtCO2.toFixed(1)} Gt/yr ${trendArrow(emDelta, true, 0.05)}</div>
          ${sparkline(w.emissionsHistory, { stroke: '#b91c1c', fill: 'rgba(185,28,28,0.12)', minY: 0, maxY: emMax })}
          <div class="stats-range"><span>target: net zero</span><span>start 40 Gt</span></div>
        </div>
        <div class="stats-card-inner">
          <div class="stats-label">Global Clean Adoption</div>
          <div class="stats-big">${pctLabel(avgAdopt)} ${trendArrow(w.adoptionHistory.length >= 6 ? avgAdopt - w.adoptionHistory[Math.max(0, w.adoptionHistory.length - 6)] : 0, false, 0.002)}</div>
          ${sparkline(w.adoptionHistory, { stroke: '#22c55e', fill: 'rgba(34,197,94,0.18)', minY: 0, maxY: 1 })}
          <div class="stats-range"><span>0%</span><span>Net Zero ≥ ${Math.round(BALANCE.netZeroThresholdAdoption*100)}%</span></div>
        </div>
        <div class="stats-card-inner">
          <div class="stats-label">Net Zero Countries</div>
          <div class="stats-big">${nz} / ${total} <span style="font-size:13px;color:var(--text-dim);font-weight:600">(${pctLabel(nz/total)})</span></div>
          ${sparkline(w.nzHistory, { stroke: '#facc15', fill: 'rgba(250,204,21,0.2)', minY: 0, maxY: total })}
          <div class="stats-range"><span>0</span><span>win ≥${Math.round(BALANCE.winCountryNetZeroPct*100)}%</span></div>
        </div>
        <div class="stats-card-inner">
          <div class="stats-label">Political Will &amp; Stress</div>
          <div class="stats-big">Will ${avgWill.toFixed(0)} <span style="font-size:13px;color:var(--text-dim);font-weight:600">· Stress ${Math.round(w.societalStress)}</span></div>
          ${sparkline(w.willHistory, { stroke: '#38bdf8', fill: 'rgba(56,189,248,0.18)', minY: 0, maxY: 100 })}
          <div class="stats-range"><span>paralysis 0</span><span>momentum 100</span></div>
        </div>

        ${(() => {
          const popHistory = w.populationHistory ?? [];
          const currentPopM = countries.reduce((s, c) => s + (c.populationM ?? 0), 0);
          const deltaPerTickM = countries.reduce((s, c) => s + (c.populationDeltaM ?? 0), 0);
          const annualDeltaM = deltaPerTickM * 4;
          const peakPopM = popHistory.length ? Math.max(...popHistory, currentPopM) : currentPopM;
          const popMin = popHistory.length ? Math.min(...popHistory, currentPopM) : currentPopM;
          const popMax = popHistory.length ? Math.max(...popHistory, currentPopM) : currentPopM;
          // Color the delta by sign so it reads at a glance.
          const deltaTone = annualDeltaM > 0.05 ? 'trend-down' : annualDeltaM < -0.05 ? 'trend-up' : 'trend-flat';
          return `<div class="stats-card-inner">
            <div class="stats-label">Population <span class="stats-peak">peak ${formatPopulationCompact(peakPopM)}</span></div>
            <div class="stats-big">${formatPopulationFull(currentPopM)}
              <span class="trend-arrow ${deltaTone}" style="font-size:12px">${formatDelta(annualDeltaM)}/yr</span>
            </div>
            ${sparkline(popHistory, { stroke: '#0ea5e9', fill: 'rgba(14,165,233,0.18)', minY: popMin, maxY: popMax })}
            <div class="stats-range"><span>climate impact starts +1.5°C</span><span>shielded by adoption</span></div>
          </div>`;
        })()}

        ${(() => {
          // Sea level rise — derived from temp anomaly. ~20 cm per °C is the
          // IPCC-ish ballpark for committed rise over the century; the peak
          // clamp reflects thermal inertia (ocean keeps rising after warming
          // stops, so "best so far" is the SLR locked in, not the current temp).
          const slrFromTemp = t => Math.max(0, t) * 20;
          const curSlr  = Math.max(slrFromTemp(w.tempAnomalyC), slrFromTemp(w.peakTempAnomalyC ?? w.tempAnomalyC));
          const slrHistory = (w.tempHistory ?? []).map(slrFromTemp);
          // Ratchet: sparkline never regresses below what was committed.
          for (let i = 1; i < slrHistory.length; i++) {
            if (slrHistory[i] < slrHistory[i - 1]) slrHistory[i] = slrHistory[i - 1];
          }
          const peakSlr = slrHistory.length ? Math.max(...slrHistory, curSlr) : curSlr;
          const slrMin = 0;
          const slrMax = Math.max(slrFromTemp(BALANCE.lossTempC), peakSlr);
          return `<div class="stats-card-inner">
            <div class="stats-label">Sea Level Rise <span class="stats-peak">committed ${peakSlr.toFixed(1)} cm</span></div>
            <div class="stats-big">${curSlr.toFixed(1)} cm</div>
            ${sparkline(slrHistory, { stroke: '#0284c7', fill: 'rgba(2,132,199,0.18)', minY: slrMin, maxY: slrMax })}
            <div class="stats-range"><span>pre-industrial 0</span><span>+4°C ≈ ${slrFromTemp(BALANCE.lossTempC).toFixed(0)} cm</span></div>
          </div>`;
        })()}

        ${(() => {
          // CO₂ Avoided — cumulative Gt kept out of the atmosphere vs. the
          // no-adoption BAU baseline. Rises monotonically as long as clean
          // deployment exceeds zero, which makes for a very satisfying "score".
          const avoidedHistory = w.co2AvoidedHistory ?? [0];
          const curAvoided = w.cumulativeCO2AvoidedGt ?? 0;
          const recentDelta = avoidedHistory.length >= 6
            ? curAvoided - avoidedHistory[Math.max(0, avoidedHistory.length - 6)]
            : 0;
          // "Per year" rate from the last ~4 ticks (= 1 in-game year).
          const perYear = avoidedHistory.length >= 5
            ? curAvoided - avoidedHistory[Math.max(0, avoidedHistory.length - 5)]
            : curAvoided;
          const avoidedMax = Math.max(...avoidedHistory, curAvoided, 1);
          return `<div class="stats-card-inner">
            <div class="stats-label">CO₂ Avoided <span class="stats-peak">${perYear >= 0 ? '+' : ''}${perYear.toFixed(1)} Gt/yr</span></div>
            <div class="stats-big">${curAvoided.toFixed(1)} Gt ${trendArrow(recentDelta, false, 0.05)}</div>
            ${sparkline(avoidedHistory, { stroke: '#10b981', fill: 'rgba(16,185,129,0.18)', minY: 0, maxY: avoidedMax })}
            <div class="stats-range"><span>cumulative since start</span><span>vs. BAU baseline</span></div>
          </div>`;
        })()}
      </div>

      <div class="stats-columns">
        <div class="stats-col">
          <div class="stats-col-title">Top Emitters</div>
          <div class="stats-country-list">
            ${topEmitters.map(row => countryRow(row, r => `<span class="stats-emit">${r.live.toFixed(2)} Gt/yr</span><span class="stats-adopt">${pctLabel(r.avg)} clean</span>`)).join('')}
          </div>
        </div>
        <div class="stats-col">
          <div class="stats-col-title">Top Adopters</div>
          <div class="stats-country-list">
            ${topAdopters.map(row => countryRow(row, r => `${bar(r.avg, '#22c55e')}<span class="stats-adopt">${pctLabel(r.avg)}</span>`)).join('')}
          </div>
        </div>
        <div class="stats-col">
          <div class="stats-col-title">Lagging</div>
          <div class="stats-country-list">
            ${laggards.map(row => countryRow(row, r => `${bar(r.avg, '#ef4444')}<span class="stats-adopt">${pctLabel(r.avg)}</span>`)).join('')}
          </div>
        </div>
      </div>

      <div class="stats-footer">Research: ${w.researched.size}/${ACTIVITIES.length} · Credits: ${Math.floor(w.climatePoints)} · Running: ${Object.keys(w.activeResearch ?? {}).length}</div>
    </div>`;
    modal.querySelector('.stats-close')?.addEventListener('click', close);
  };

  const close = () => {
    clearInterval(timer);
    teardownA11y?.();
    modal.remove();
    if (wasPaused === false) state.meta.paused = false;
  };
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  renderBody();
  const timer = setInterval(renderBody, 600);
  // Install a11y after first render so focusable children exist. We pin it
  // to .stats-card (the actual dialog) and let the helper own Esc + focus.
  const teardownA11y = installModalA11y(modal.querySelector('.stats-card'), {
    onClose: close,
    label: 'World Stats',
  });
}
