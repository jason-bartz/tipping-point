// Tile-based 16x16 world map. Recreates Earth from the bundled Terrain atlas.
//
// Pipeline:
//   1. Rasterize world-atlas country polygons to a 96x48 land mask via d3-geo.
//   2. Classify each land cell into a base biome (grass / desert / snow) and a
//      "decoration" type (forest / boreal / jungle / savanna / mountain / none)
//      using lon/lat rectangles for major ecoregions.
//   3. Render in four passes:
//        a. Base tile per cell.
//        b. Autotile shoreline — every OCEAN cell with a land neighbor draws
//           the appropriate corner/edge from the water autotile so the coast
//           reads as a smooth curve, not a pixelated grid.
//        c. Autotile sand-in-grass border (deserts inside grasslands).
//        d. Individual decoration sprites (pines / oaks / bushes / mountains /
//           cacti) with cutout transparency, placed sparsely on top.
//
// The atlas layout is three 16-col biome sections (grass / desert / snow).
// The shoreline (water) autotile isn't a standard Wang block; the useful
// cliff tiles are arranged along row 4 of each section: cols 0-3 hold the
// clean single-side edges (W/E/N/S, in that order) and cols 4-7 hold the
// two-sided corners (NW/NE/SW/SE). The sand-in-grass border uses a proper
// Wang 3x3 at cols 5-7 rows 5-7 of the grass section.

import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature as topoFeature } from 'topojson-client';

const TILE = 16;
const MAP_W = 96;
const MAP_H = 48;

// Biome section column offsets inside the atlas. Each section is 16 cols wide.
const SECTION = { GRASS: 0, DESERT: 16, SNOW: 32 };

// Shoreline tiles live in row 4 of each biome section. Cols 0-3 are the four
// clean single-direction edges (W/E/N/S — land on exactly one side). Cols 4-7
// are the four two-direction corners (NW/NE/SW/SE). Used for ocean cells that
// sit next to a land cell so the coast reads as a proper cliff instead of a
// straight line. Row 2 col 3 is the "water pond fully inside land" tile, used
// as a fallback when land wraps around on 3+ sides of a water cell.
//
// 4-bit neighbor code: N=1 E=2 S=4 W=8, bit set when that cardinal neighbor
// is LAND (any non-ocean biome).
const COAST_TILE = {
  // single-direction edges
  1:  [2, 4],  // N    → N edge     (grass across top of tile)
  2:  [1, 4],  // E    → E edge
  4:  [3, 4],  // S    → S edge
  8:  [0, 4],  // W    → W edge
  // two-direction corners
  3:  [5, 4],  // N+E  → NE corner
  6:  [7, 4],  // S+E  → SE corner
  9:  [4, 4],  // N+W  → NW corner
  12: [6, 4],  // S+W  → SW corner
  // three-or-more sides: collapse to the "pond inside land" center tile
  5:  [3, 2], 7:  [3, 2], 10: [3, 2],
  11: [3, 2], 13: [3, 2], 14: [3, 2], 15: [3, 2],
};

// Sand-in-grass autotile at cols 5-7 rows 5-7 of the grass section — a
// standard Wang 3x3 blob. Same 4-bit code semantics (bit set when neighbor
// is GRASS instead of DESERT). Only applied for desert cells bordering grass.
const SAND_TILE = {
  1:  [6, 5],   // N
  2:  [7, 6],   // E
  4:  [6, 7],   // S
  8:  [5, 6],   // W
  3:  [7, 5],   // NE
  6:  [7, 7],   // SE
  9:  [5, 5],   // NW
  12: [5, 7],   // SW
  // Opposite/surrounded: no dedicated tile; let it stay as plain sand.
};

// Pure base tiles (confirmed by sampling pixel variance = 0).
const BASE = {
  OCEAN: [0, 1],   // deep blue, verified pure
  GRASS: [3, 0],
  SAND:  [19, 0],
  SNOW:  [35, 0],
};

// Individual sprites (transparent background — drawn over a matching base).
// All come from cols 14-15 of their biome section unless noted.
const SPRITE = {
  PINE_GRASS:   [14, 12],   // small single pine
  OAK_GRASS:    [14, 15],   // small oak crown
  BUSH_GRASS:   [14, 18],   // berry bush
  PEAK_GRASS:   [14, 21],   // rocky mountain peak
  BIG_OAK_T:    [14, 22],   // 2-tile big oak, top half (crown)
  BIG_OAK_B:    [14, 23],   // bottom half (trunk)
  MESA_DESERT:  [30, 18],   // single mesa rock
  CACTUS:       [22,  0],   // cactus on a sand tile (full opaque)
  PINE_SNOW:    [46,  7],
  OAK_SNOW:     [46, 10],
  PEAK_SNOW:    [46, 14],
  BIG_PINE_T:   [46, 17],   // 2-tile snow-capped tree, top
  BIG_PINE_B:   [46, 18],
};

// Real-world biome regions. Rectangles [west, east, south, north] in degrees.
const DESERTS = [
  [-18,  40,  14, 32],  // Sahara
  [ 34,  56,  14, 32],  // Arabian
  [ 42,  66,  28, 40],  // Iran plateau
  [ 65,  78,  22, 30],  // Thar
  [ 72,  92,  36, 44],  // Taklamakan
  [ 90, 116,  38, 48],  // Gobi
  [-72, -68, -30, -17], // Atacama
  [-72, -65, -50, -38], // Patagonia
  [112, 142, -32, -18], // Australian outback
  [-118,-104, 28, 40],  // American Southwest
  [ 12,  26, -28, -16], // Kalahari/Namib
];
const MOUNTAINS = [
  [-125,-108, 34, 60],  // Rockies
  [ -78, -66,-42,  12], // Andes
  [   5,  16, 45, 48],  // Alps
  [  70, 100, 27, 40],  // Himalayas
  [  -9,  10, 30, 35],  // Atlas
  [ 144, 152,-38,-16],  // Great Dividing
  [  34,  46,  5, 14],  // Ethiopian
  [  56,  66, 52, 66],  // Urals
  [ -80, -72,  8, 12],  // Colombian Andes
];
const FORESTS = [
  [-75, -50, -12,   5], // Amazon
  [ 10,  32,  -5,   6], // Congo
  [ 94, 140, -10,   8], // Maritime SE Asia
  [-135,-70,  49,  62], // Canadian boreal
  [  24, 150, 50,  65], // Eurasian taiga
  [-132,-120, 40,  55], // Pacific NW
  [ -10,  32, 46,  55], // European mixed
  [ -90, -74, 33,  46], // Appalachian
  [  72,  94, 22,  30], // NE India monsoon forest
  [ 130, 145, 32,  45], // Japan/Korea
];

// biome == base terrain. decor == decoration class on top.
const BIOME = { OCEAN: 0, GRASS: 1, DESERT: 2, SNOW: 3 };
const DECOR = { NONE: 0, FOREST: 1, BOREAL: 2, JUNGLE: 3, SAVANNA: 4, MOUNTAIN: 5, CACTI: 6, ICE_MOUNT: 7 };

function classify(lon, lat, isLand) {
  if (!isLand) return { biome: BIOME.OCEAN, decor: DECOR.NONE };
  if (lat >  66) return { biome: BIOME.SNOW, decor: DECOR.NONE };
  if (lat < -58) return { biome: BIOME.SNOW, decor: DECOR.NONE };
  for (const [w, e, s, n] of MOUNTAINS) {
    if (lon >= w && lon <= e && lat >= s && lat <= n) {
      return { biome: lat > 55 ? BIOME.SNOW : BIOME.GRASS, decor: lat > 55 ? DECOR.ICE_MOUNT : DECOR.MOUNTAIN };
    }
  }
  for (const [w, e, s, n] of DESERTS) {
    if (lon >= w && lon <= e && lat >= s && lat <= n) return { biome: BIOME.DESERT, decor: DECOR.CACTI };
  }
  for (const [w, e, s, n] of FORESTS) {
    if (lon >= w && lon <= e && lat >= s && lat <= n) return { biome: BIOME.GRASS, decor: DECOR.FOREST };
  }
  if (Math.abs(lat) < 11) return { biome: BIOME.GRASS, decor: DECOR.JUNGLE };
  if (lat >  55)          return { biome: BIOME.GRASS, decor: DECOR.BOREAL };
  if (lat < -50)          return { biome: BIOME.SNOW,  decor: DECOR.NONE };
  if (Math.abs(lat) < 20) return { biome: BIOME.GRASS, decor: DECOR.SAVANNA };
  return { biome: BIOME.GRASS, decor: DECOR.NONE };
}

// Deterministic per-cell hash. Used to vary decoration choice without
// flickering between renders.
function hash2(x, y) {
  let h = (x * 374761393) ^ (y * 668265263);
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

// Build a 4-bit cardinal neighbor mask from a predicate. If no cardinal
// neighbor qualifies, fall back to a diagonal: a cell with land only at NW
// (and pure-ocean cardinals) reads as an NW corner, and so on. Without this
// fallback, peninsulas produce stray ocean cells tucked diagonally between
// land cells that never get a cliff piece.
function neighborCode(self, neighbors, isOther) {
  const [n, e, s, w, nw, ne, sw, se] = neighbors;
  let code = 0;
  if (isOther(n)) code |= 1;
  if (isOther(e)) code |= 2;
  if (isOther(s)) code |= 4;
  if (isOther(w)) code |= 8;
  if (code === 0) {
    if (isOther(nw))      code = 1 | 8;
    else if (isOther(ne)) code = 1 | 2;
    else if (isOther(sw)) code = 4 | 8;
    else if (isOther(se)) code = 4 | 2;
  }
  return code;
}

export class TileWorldMap {
  constructor(container, { topoData, terrainUrl = '/tilesets/Terrain.png', onReady } = {}) {
    this.container = container;
    this.topoData  = topoData;
    this.terrainUrl = terrainUrl;
    this.onReady = onReady;
    this._build();
  }

  async _build() {
    this.container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width  = MAP_W * TILE;
    canvas.height = MAP_H * TILE;
    canvas.className = 'tile-world-canvas';
    canvas.style.imageRendering = 'pixelated';
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    this.container.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.atlas = await this._loadImage(this.terrainUrl);
    this.cells = this._buildCells();
    this._render();
    this.onReady?.(this);
  }

  _loadImage(url) {
    return new Promise((ok, err) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => err(new Error('atlas load failed: ' + url));
      img.src = url;
    });
  }

  _buildCells() {
    // Rasterize the world's land polygons into a mask at tile resolution.
    const mask = document.createElement('canvas');
    mask.width = MAP_W;
    mask.height = MAP_H;
    const mctx = mask.getContext('2d');

    const features = topoFeature(this.topoData, this.topoData.objects.countries).features;
    const fc = { type: 'FeatureCollection', features };
    const proj = geoEquirectangular()
      .scale(MAP_W / (2 * Math.PI))
      .translate([MAP_W / 2, MAP_H / 2]);
    const path = geoPath(proj, mctx);
    mctx.fillStyle = '#fff';
    mctx.beginPath();
    path(fc);
    mctx.fill();
    const mdata = mctx.getImageData(0, 0, MAP_W, MAP_H).data;

    const cells = new Array(MAP_W * MAP_H);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = (y * MAP_W + x) * 4;
        const land = mdata[i + 3] > 0;
        const lon = -180 + (x + 0.5) * (360 / MAP_W);
        const lat =   90 - (y + 0.5) * (180 / MAP_H);
        cells[y * MAP_W + x] = { ...classify(lon, lat, land), lon, lat };
      }
    }
    return cells;
  }

  _cellAt(x, y) {
    if (y < 0 || y >= MAP_H) return null;
    // Horizontal wrap for the antimeridian — though equirectangular won't
    // cross it at lon=±180 visually, neighbor lookup still benefits.
    const wx = ((x % MAP_W) + MAP_W) % MAP_W;
    return this.cells[y * MAP_W + wx];
  }

  _tile(col, row, x, y) {
    this.ctx.drawImage(
      this.atlas,
      col * TILE, row * TILE, TILE, TILE,
      x * TILE,   y * TILE,   TILE, TILE,
    );
  }

  // Pick the biome-section column base for an ocean tile, inferred from the
  // dominant land neighbor. Defaults to grass.
  _coastSection(x, y) {
    const counts = { [BIOME.GRASS]: 0, [BIOME.DESERT]: 0, [BIOME.SNOW]: 0 };
    for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0],[-1,-1],[1,-1],[1,1],[-1,1]]) {
      const c = this._cellAt(x + dx, y + dy);
      if (c && c.biome !== BIOME.OCEAN) counts[c.biome]++;
    }
    if (counts[BIOME.SNOW]   > counts[BIOME.GRASS] && counts[BIOME.SNOW]   >= counts[BIOME.DESERT]) return SECTION.SNOW;
    if (counts[BIOME.DESERT] > counts[BIOME.GRASS])                                                  return SECTION.DESERT;
    return SECTION.GRASS;
  }

  _render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    // ── Pass 1: base tile for every cell ────────────────────────────────
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const c = this.cells[y * MAP_W + x];
        const base =
          c.biome === BIOME.OCEAN  ? BASE.OCEAN :
          c.biome === BIOME.SNOW   ? BASE.SNOW  :
          c.biome === BIOME.DESERT ? BASE.SAND  : BASE.GRASS;
        this._tile(base[0], base[1], x, y);
      }
    }

    // ── Pass 2: shoreline. Every ocean cell adjacent (cardinally or
    // diagonally) to land swaps to a cliff tile whose cliff faces the right
    // side. The tile's biome section is picked from the dominant adjacent
    // land type so grass coasts render with a grass cliff, sand coasts with
    // a sandy cliff, etc.
    const isLand = (c) => c && c.biome !== BIOME.OCEAN;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const c = this.cells[y * MAP_W + x];
        if (c.biome !== BIOME.OCEAN) continue;
        const neighbors = [
          this._cellAt(x,     y - 1),  // N
          this._cellAt(x + 1, y),      // E
          this._cellAt(x,     y + 1),  // S
          this._cellAt(x - 1, y),      // W
          this._cellAt(x - 1, y - 1),  // NW
          this._cellAt(x + 1, y - 1),  // NE
          this._cellAt(x - 1, y + 1),  // SW
          this._cellAt(x + 1, y + 1),  // SE
        ];
        const code = neighborCode(c, neighbors, isLand);
        if (code === 0) continue;
        const offset = COAST_TILE[code];
        if (!offset) continue;
        const section = this._coastSection(x, y);
        this._tile(section + offset[0], offset[1], x, y);
      }
    }

    // ── Pass 3: sand-in-grass border for desert cells adjacent to grass.
    // Uses the Wang 3x3 at cols 5-7 rows 5-7 of the grass section — proper
    // edge and corner tiles so the desert/grass boundary curves instead of
    // showing rectangular patches.
    const isGrass = (c) => c && c.biome === BIOME.GRASS;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const c = this.cells[y * MAP_W + x];
        if (c.biome !== BIOME.DESERT) continue;
        const neighbors = [
          this._cellAt(x,     y - 1),
          this._cellAt(x + 1, y),
          this._cellAt(x,     y + 1),
          this._cellAt(x - 1, y),
          this._cellAt(x - 1, y - 1),
          this._cellAt(x + 1, y - 1),
          this._cellAt(x - 1, y + 1),
          this._cellAt(x + 1, y + 1),
        ];
        const code = neighborCode(c, neighbors, isGrass);
        if (code === 0) continue;
        const offset = SAND_TILE[code];
        if (!offset) continue;
        this._tile(SECTION.GRASS + offset[0], offset[1], x, y);
      }
    }

    // ── Pass 4: decoration sprites (individual cutouts) ──────────────────
    // Density is per-decor-type. Hash-based so the same cell always gets the
    // same sprite — no shimmer between renders, no solid walls of one tile.
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const c = this.cells[y * MAP_W + x];
        const h = hash2(x, y);

        switch (c.decor) {
          case DECOR.FOREST: {
            // ~55% density, mostly oaks + some pines
            if (h % 100 < 55) {
              if (h % 4 === 0) this._tile(SPRITE.PINE_GRASS[0], SPRITE.PINE_GRASS[1], x, y);
              else             this._tile(SPRITE.OAK_GRASS[0],  SPRITE.OAK_GRASS[1],  x, y);
            }
            break;
          }
          case DECOR.BOREAL: {
            // Coniferous belt — dense pines
            if (h % 100 < 60) this._tile(SPRITE.PINE_GRASS[0], SPRITE.PINE_GRASS[1], x, y);
            break;
          }
          case DECOR.JUNGLE: {
            // Very dense — oaks + bushes
            if (h % 100 < 75) {
              if (h % 5 === 0) this._tile(SPRITE.BUSH_GRASS[0], SPRITE.BUSH_GRASS[1], x, y);
              else             this._tile(SPRITE.OAK_GRASS[0],  SPRITE.OAK_GRASS[1],  x, y);
            }
            break;
          }
          case DECOR.SAVANNA: {
            // Sparse — a bush or tree every ~5 cells
            if (h % 100 < 22) {
              if (h % 3 === 0) this._tile(SPRITE.BUSH_GRASS[0], SPRITE.BUSH_GRASS[1], x, y);
              else             this._tile(SPRITE.OAK_GRASS[0],  SPRITE.OAK_GRASS[1],  x, y);
            }
            break;
          }
          case DECOR.MOUNTAIN: {
            // Most mountain cells show a peak; a few are bare rock
            if (h % 100 < 85) this._tile(SPRITE.PEAK_GRASS[0], SPRITE.PEAK_GRASS[1], x, y);
            break;
          }
          case DECOR.ICE_MOUNT: {
            if (h % 100 < 80) this._tile(SPRITE.PEAK_SNOW[0], SPRITE.PEAK_SNOW[1], x, y);
            break;
          }
          case DECOR.CACTI: {
            // Sparse — cactus every ~8 cells, occasional mesa
            const r = h % 20;
            if (r === 0) this._tile(SPRITE.CACTUS[0],      SPRITE.CACTUS[1],      x, y);
            else if (r === 1) this._tile(SPRITE.MESA_DESERT[0], SPRITE.MESA_DESERT[1], x, y);
            break;
          }
          default:
            // Pure polar snow sometimes gets an occasional frosted tree
            if (c.biome === BIOME.SNOW && h % 37 === 0) {
              this._tile(SPRITE.PEAK_SNOW[0], SPRITE.PEAK_SNOW[1], x, y);
            }
        }
      }
    }
  }

  destroy() {
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
  }
}

export const TILE_WORLD_CONSTANTS = { TILE, MAP_W, MAP_H };
