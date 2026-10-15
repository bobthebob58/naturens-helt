// Register over alle vegetasjons- og gjenstandsmodeller (Three.js-geometri), på tvers av biomer.
// Geometri bygges først når en type faktisk trengs, og deles deretter av alle terrengbiter.
import * as THREE from 'three';
import { VEG_BUILDERS } from '../models/vegetation.js';
import { MODELS as rainforest } from './biomes/rainforestModels.js';
import { MODELS as islands } from './biomes/islandsModels.js';
import { MODELS as swamp } from './biomes/swampModels.js';
import { MODELS as savanna } from './biomes/savannaModels.js';
import { MODELS as mountains } from './biomes/mountainsModels.js';
import { MODELS as city } from './biomes/cityModels.js';
import { paint, merge } from '../models/geo.js';

const BUILDERS = { ...VEG_BUILDERS, ...rainforest, ...islands, ...swamp, ...savanna, ...mountains, ...city };
const cache = new Map();

function fallback() {
  return merge([paint(new THREE.BoxGeometry(0.6, 1.2, 0.6).translate(0, 0.6, 0), 0xff00ff)]);
}

export function vegGeometry(type) {
  let g = cache.get(type);
  if (!g) {
    const b = BUILDERS[type];
    if (!b) console.warn(`Ukjent modelltype: ${type}`);
    g = b ? b() : fallback();
    g.computeBoundingSphere();
    cache.set(type, g);
  }
  return g;
}

export function hasModel(type) {
  return type in BUILDERS;
}
