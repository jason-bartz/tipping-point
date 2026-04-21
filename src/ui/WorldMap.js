// Pixel-art world map. The hand-drawn raster in /public/world-map.png is
// the only thing the player sees *as* the map — no SVG coastlines are drawn
// over it. Instead, each country gets a visible pixel-square marker at a
// hand-calibrated point on the pixel art, plus an invisible hit-circle
// around it for easier clicking.
//
// The art is 1376×768 and isn't a strict equirectangular — continents are
// stylised and drawn where they look right, not where a projection formula
// would put them. We render inside a fixed-aspect-ratio "stage" element so
// the map never stretches when the window resizes (letterboxed or
// pillarboxed within the grid cell). Dot positions come from `mapX`/`mapY`
// fractions on each country in data/countries.js, which are calibrated
// against the art. Since the fractions scale with the stage, dots stay
// pinned to the same pixel of art at every size.

import { geoTransform, geoPath } from 'd3-geo';
import { select as d3Select } from 'd3-selection';
import { feature as topoFeature } from 'topojson-client';
import { EVT } from '../core/EventBus.js';

const ANTARCTICA_ISO_N3 = '010';
const MAP_IMG = '/world-map.png';

// Native pixel dimensions of the PNG. The stage is sized to preserve this
// aspect ratio exactly — if you swap the art for a differently-sized raster,
// update these.
const NATIVE_W = 1376;
const NATIVE_H =  768;

// Fallback equirectangular bounds. Used only by the d3 geoPath that draws
// invisible Natural Earth country polygons (for approximate click hitboxes)
// and by legacy `projection([lon, lat])` callers. Dot positions do NOT use
// these — they use `mapX`/`mapY` from countries.js.
const MAP_LON_LEFT  = -180;
const MAP_LON_RIGHT =  180;
const MAP_LAT_TOP   =   90;
const MAP_LAT_BOT   =  -90;

export class WorldMap {
  constructor(container, state, bus, topo) {
    this.container = container;
    this.state = state;
    this.bus = bus;
    this.selectedId = null;
    this.hoverId = null;
    this._build(topo);
    this._unsubs = [
      bus.on(EVT.TICK, () => this.render()),
      bus.on(EVT.DEPLOYED, () => this.render()),
      bus.on(EVT.NET_ZERO, () => this.render()),
      bus.on(EVT.COUNTRY_SELECTED, ({ id }) => { this.selectedId = id; this.render(); }),
    ];
  }

  _build(topo) {
    this.container.innerHTML = '';
    this.container.classList.add('pixel-map');

    // Stage: a centered, fixed-aspect-ratio box. PNG + SVG both live inside,
    // so they can only ever be scaled together. Dimensions are set by
    // _computeProjection() from the container size.
    const stage = document.createElement('div');
    stage.className = 'map-stage';
    this.container.appendChild(stage);
    this.stage = stage;

    const img = document.createElement('img');
    img.src = MAP_IMG;
    img.alt = 'World';
    img.className = 'pixel-map-bg';
    img.draggable = false;
    stage.appendChild(img);
    this.bgImg = img;

    this.features = topoFeature(topo, topo.objects.countries).features;
    this.inhabitedFC = {
      type: 'FeatureCollection',
      features: this.features.filter(f => String(f.id).padStart(3, '0') !== ANTARCTICA_ISO_N3),
    };

    this.byN3 = new Map();
    for (const c of Object.values(this.state.countries)) {
      for (const n3 of c.isoN3) this.byN3.set(n3.padStart(3, '0'), c);
    }

    this.svg = d3Select(stage).append('svg')
      .attr('preserveAspectRatio', 'none')
      .attr('width', '100%').attr('height', '100%');
    this.hitG = this.svg.append('g').attr('class', 'country-hits');
    this.markerG = this.svg.append('g').attr('class', 'markers');

    this._computeProjection();
    this._draw();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this._relayout());
      this.resizeObserver.observe(this.container);
    } else {
      this._onResize = () => this._relayout();
      window.addEventListener('resize', this._onResize);
    }
  }

  _computeProjection() {
    const r = this.container.getBoundingClientRect();
    const cw = Math.max(100, r.width);
    const ch = Math.max(100, r.height);

    // Fit the stage inside the container while preserving native aspect.
    // Letterbox (tall container) or pillarbox (wide container) as needed.
    const nativeAspect = NATIVE_W / NATIVE_H;
    let w, h;
    if (cw / ch > nativeAspect) {
      h = ch;
      w = h * nativeAspect;
    } else {
      w = cw;
      h = w / nativeAspect;
    }
    this.width = w;
    this.height = h;
    this.stage.style.width  = `${w}px`;
    this.stage.style.height = `${h}px`;
    this.svg.attr('viewBox', `0 0 ${w} ${h}`);

    const lonSpan = MAP_LON_RIGHT - MAP_LON_LEFT;
    const latSpan = MAP_LAT_TOP - MAP_LAT_BOT;

    // Fallback equirectangular project — only used by the geoPath that draws
    // Natural Earth country polygons as invisible click hitboxes, and by
    // legacy `projection([lon, lat])` callers. Dots use projectCountry.
    this.projectPoint = (lon, lat) => [
      ((lon - MAP_LON_LEFT) / lonSpan) * w,
      ((MAP_LAT_TOP - lat) / latSpan) * h,
    ];

    // Primary marker-positioning projection: use mapX/mapY fractions from
    // country data (calibrated against the hand-drawn pixel art).
    this.projectCountry = (country) => [
      country.mapX * w,
      country.mapY * h,
    ];

    // geoPath wrapper so Natural Earth country polygons follow the same
    // equirectangular stretch as the fallback projection.
    const self = this;
    const transform = geoTransform({
      point(lambda, phi) {
        const [x, y] = self.projectPoint(lambda, phi);
        this.stream.point(x, y);
      },
    });
    this.path = geoPath(transform);
  }

  _draw() {
    // Click hitboxes. Invisible; they just catch clicks over the country's
    // actual landmass so the player doesn't have to aim at the tiny square.
    this.hitPaths = this.hitG.selectAll('path')
      .data(this.features)
      .enter().append('path')
      .attr('d', this.path)
      .attr('fill', 'rgba(0,0,0,0)')
      .attr('stroke', 'none')
      .attr('data-country', d => this.byN3.get(String(d.id).padStart(3, '0'))?.id ?? '')
      .style('cursor', 'pointer')
      .style('pointer-events', 'all')
      .on('click', (e, d) => this._selectByFeature(d))
      .on('mouseenter', (e, d) => this._hover(d, true))
      .on('mouseleave', (e, d) => this._hover(d, false));
    this.hitPaths.append('title')
      .text(d => {
        const c = this.byN3.get(String(d.id).padStart(3, '0'));
        return c ? c.name : (d.properties?.name ?? '');
      });

    const countries = Object.values(this.state.countries);
    this.markerGroups = this.markerG.selectAll('g.country-marker')
      .data(countries, d => d.id)
      .enter().append('g')
      .attr('class', 'country-marker')
      .attr('data-country', d => d.id)
      .attr('transform', d => {
        const [x, y] = this.projectCountry(d);
        return `translate(${Math.round(x)}, ${Math.round(y)})`;
      })
      .style('cursor', 'pointer')
      .on('click', (e, d) => { e.stopPropagation(); this.bus.emit(EVT.COUNTRY_SELECTED, { id: d.id }); })
      .on('mouseenter', (e, d) => this._hoverMarker(d.id, true))
      .on('mouseleave', (e, d) => this._hoverMarker(d.id, false));

    // Invisible click disc around each marker. The visible marker is tiny
    // (~8–14px) and the Natural Earth polygon hitboxes don't line up with
    // the pixel-art coasts, so this generous circle is the primary click
    // target. Radius chosen to cover the marker's hover-halo comfortably.
    this.markerGroups.append('circle')
      .attr('class', 'marker-hitbox')
      .attr('r', 18)
      .attr('fill', 'rgba(0,0,0,0)')
      .attr('stroke', 'none');

    this.markerGroups.append('rect')
      .attr('class', 'marker-halo')
      .attr('fill', 'none')
      .attr('stroke', '#1a1328')
      .attr('stroke-width', 2)
      .attr('shape-rendering', 'crispEdges')
      .attr('x', -8).attr('y', -8)
      .attr('width', 16).attr('height', 16)
      .style('opacity', 0);

    this.markerGroups.append('rect')
      .attr('class', 'marker-core')
      .attr('fill', '#6cc04a')
      .attr('stroke', '#1a1328')
      .attr('stroke-width', 2)
      .attr('shape-rendering', 'crispEdges');

    this.markerGroups.append('title').text(d => d.name);
  }

  _relayout() {
    this._computeProjection();
    this.hitG.selectAll('path').attr('d', this.path);
    this.markerG.selectAll('g.country-marker')
      .attr('transform', d => {
        const [x, y] = this.projectCountry(d);
        return `translate(${Math.round(x)}, ${Math.round(y)})`;
      });
  }

  _selectByFeature(feature) {
    const match = this.byN3.get(String(feature.id).padStart(3, '0'));
    if (match) this.bus.emit(EVT.COUNTRY_SELECTED, { id: match.id });
  }

  _hover(feature, entering) {
    const hoverId = this.byN3.get(String(feature.id).padStart(3, '0'))?.id;
    this.hoverId = entering ? hoverId ?? null : null;
    this.render();
  }

  _hoverMarker(id, entering) {
    this.hoverId = entering ? id : null;
    this.render();
  }

  render() {
    const selId = this.selectedId;
    const hoverId = this.hoverId;

    this.markerG.selectAll('g.country-marker').each((d, i, nodes) => {
      const g = d3Select(nodes[i]);
      const core = g.select('rect.marker-core');
      const halo = g.select('rect.marker-halo');

      const avg = Object.values(d.adoption).reduce((a, b) => a + b, 0) / 6;
      const selected = d.id === selId;
      const hovered = d.id === hoverId;

      const size = d.netZero ? 14 : d.isHome ? 12 : 8 + Math.round(avg * 6);
      core
        .attr('x', -size / 2).attr('y', -size / 2)
        .attr('width', size).attr('height', size)
        .attr('fill', d.netZero ? '#e8b048' : d.isHome ? '#3aa0d4' : this._adoptionColor(avg));

      const haloSize = size + (selected ? 10 : hovered ? 6 : 4);
      halo
        .attr('x', -haloSize / 2).attr('y', -haloSize / 2)
        .attr('width', haloSize).attr('height', haloSize)
        .attr('stroke', selected ? '#ffe066' : hovered ? '#fff' : '#1a1328')
        .attr('stroke-width', selected ? 3 : hovered ? 2 : 2)
        .style('opacity', selected ? 1 : hovered ? 0.85 : 0);

      g.classed('pulse', d.netZero && !d.isHome);
      g.classed('home-ring', d.isHome);
      g.classed('selected', selected);
      g.classed('hovered', hovered);
    });
  }

  _adoptionColor(t) {
    t = Math.max(0, Math.min(1, t));
    const stops = [
      [0.00, [244, 228, 184]],
      [0.35, [168, 204, 112]],
      [0.70, [108, 192, 74]],
      [1.00, [74, 168, 74]],
    ];
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
    }
    const span = b[0] - a[0] || 1;
    const k = (t - a[0]) / span;
    const r = Math.round(a[1][0] + (b[1][0] - a[1][0]) * k);
    const g = Math.round(a[1][1] + (b[1][1] - a[1][1]) * k);
    const bl = Math.round(a[1][2] + (b[1][2] - a[1][2]) * k);
    return `rgb(${r},${g},${bl})`;
  }

  destroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this._unsubs?.forEach(u => { try { u?.(); } catch { /* ignore */ } });
    this._unsubs = [];
  }
}
