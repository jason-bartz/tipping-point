// Entry for the tilemap.html preview — loads the world atlas and mounts the
// TileWorldMap into the viewer frame. Independent from the game's main.js so
// it can run without pulling in the full game lifecycle.

import topoData from 'world-atlas/countries-110m.json';
import { TileWorldMap } from './ui/TileWorldMap.js';

const frame = document.querySelector('#viewer .frame');
frame.innerHTML = '';

new TileWorldMap(frame, {
  topoData,
  terrainUrl: './tilesets/Terrain.png',
  onReady: () => console.log('[tilemap] rendered'),
});
