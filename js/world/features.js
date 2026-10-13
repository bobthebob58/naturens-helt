// Deterministisk plassering av vegetasjon, steiner og skattekister per terrengbit.
// Dataene brukes både til tegning og til kollisjon/dekning, uavhengig av om bitene er synlige.
import { WORLD } from '../config.js';
import { mulberry32, hash2 } from '../utils/math.js';
import { VEG_INFO } from '../models/vegetation.js';

const CS = WORLD.chunkSize;
const TAU = Math.PI * 2;

function pickByTable(r, table) {
  let acc = 0;
  for (const [t, p] of table) {
    acc += p;
    if (r < acc) return t;
  }
  return table[table.length - 1][0];
}

const FOREST_TABLE = [
  ['pine', 0.3], ['oak', 0.2], ['birch', 0.14], ['bush', 0.17], ['berryBush', 0.04],
  ['rock', 0.06], ['rock2', 0.04], ['log', 0.05],
];

export class FeatureStore {
  constructor(gen) {
    this.gen = gen;
    this.cache = new Map();
    this.clearings = []; // {x, z, r} – områder uten trær (leirer, startpunkt)
    this.w = { forest: 1, desert: 0, ice: 0, t: 0 };
  }

  addClearing(x, z, r) {
    this.clearings.push({ x, z, r });
  }

  inClearing(x, z, pad = 0) {
    for (const c of this.clearings) {
      const dx = x - c.x, dz = z - c.z;
      const rr = c.r + pad;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  get(cx, cz) {
    const k = cx * 100000 + cz;
    let f = this.cache.get(k);
    if (f) {
      this.cache.delete(k);
      this.cache.set(k, f);
      return f;
    }
    f = this.generate(cx, cz);
    this.cache.set(k, f);
    if (this.cache.size > 700) this.cache.delete(this.cache.keys().next().value);
    return f;
  }

  generate(cx, cz) {
    const gen = this.gen;
    const rng = mulberry32(hash2(cx, cz, gen.seed));
    const x0 = cx * CS, z0 = cz * CS;
    const items = [];
    const grass = [];
    const chests = [];
    const empty = { items, grass, chests, colliders: [], cover: [] };
    if (!gen.isInWorld(x0 + CS / 2, z0 + CS / 2, -CS)) return empty;
    const w = this.w;

    for (let i = 0; i < 100; i++) {
      const x = x0 + rng() * CS, z = z0 + rng() * CS;
      const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(), r5 = rng();
      const h = gen.groundHeight(x, z);
      if (h < 0.35) continue;
      if (this.inClearing(x, z)) continue;
      gen.biomeWeights(x, z, w);
      const ny = gen.slopeAt(x, z);
      const biome = r1 < w.forest ? 'forest' : r1 < w.forest + w.desert ? 'desert' : 'ice';
      let type = null;
      if (biome === 'forest') {
        if (r2 > 0.8) continue;
        if (ny < 0.7) type = r3 < 0.5 ? 'rock' : null;
        else if (h > 58) type = r3 < 0.35 ? 'snowPine' : r3 < 0.6 ? 'rock2' : null;
        else if (h > 44) type = r3 < 0.65 ? 'pine' : 'rock2';
        else if (h < 2.0) type = r3 < 0.5 ? 'bush' : null;
        else type = pickByTable(r3, FOREST_TABLE);
      } else if (biome === 'desert') {
        if (r2 > 0.2) continue;
        if (h < 3.2) type = r3 < 0.7 ? 'palm' : 'bush';
        else if (ny < 0.75) type = 'desertRock';
        else type = r3 < 0.4 ? 'cactus' : r3 < 0.75 ? 'deadBush' : 'desertRock';
      } else {
        if (r2 > 0.36) continue;
        if (ny < 0.7) type = r3 < 0.5 ? 'iceRock' : null;
        else type = r3 < 0.48 ? 'snowPine' : r3 < 0.65 ? 'iceSpike' : r3 < 0.85 ? 'iceRock' : 'snowDrift';
      }
      if (!type) continue;
      let s;
      if (type.includes('ock')) s = 0.6 + r4 * r4 * 1.8;
      else if (type === 'bush' || type === 'berryBush' || type === 'deadBush') s = 0.8 + r4 * 0.6;
      else if (type === 'snowDrift') s = 0.8 + r4 * 1.2;
      else s = 0.75 + r4 * 0.6;
      const info = VEG_INFO[type];
      const sink = type.includes('ock') ? 0.1 * s : type === 'log' ? 0.05 : 0.15;
      items.push({ type, x, y: h - sink, z, s, ry: r5 * TAU, r: info.radius * s, cover: info.cover * s });
    }

    // Gress og blomster (kun pynt)
    for (let i = 0; i < 170; i++) {
      const x = x0 + rng() * CS, z = z0 + rng() * CS;
      const r1 = rng(), r2 = rng();
      const h = gen.groundHeight(x, z);
      if (h < 0.8 || h > 46) continue;
      gen.biomeWeights(x, z, w);
      if (w.forest < 0.55 + r1 * 0.4 && !(w.desert > 0.5 && h < 3)) continue;
      grass.push({ type: r2 < 0.12 ? 'flowers' : 'grass', x, y: h - 0.05, z, s: 0.8 + r1 * 0.7, ry: r2 * TAU });
    }

    // Skattekister – gjemt ved trær/steiner, i åpent terreng eller under vann
    const nChests = (rng() < 0.6 ? 1 : 0) + (rng() < 0.18 ? 1 : 0);
    for (let c = 0; c < 2; c++) {
      const roll = rng(), a = rng(), b = rng(), rare = rng(), val = rng();
      if (c >= nChests) continue;
      let x, z;
      const hideables = items.filter((it) => it.r > 0 || it.cover > 0);
      if (roll < 0.6 && hideables.length) {
        const it = hideables[Math.floor(a * hideables.length)];
        const ang = b * TAU;
        const off = Math.max(it.r, 0.6) + 0.8;
        x = it.x + Math.cos(ang) * off;
        z = it.z + Math.sin(ang) * off;
      } else {
        x = x0 + 4 + a * (CS - 8);
        z = z0 + 4 + b * (CS - 8);
      }
      if (this.inClearing(x, z, 4)) continue;
      const h = gen.groundHeight(x, z);
      if (h < -6) continue;
      const underwater = h < -0.6;
      const isRare = rare < 0.06;
      let value = Math.round(20 + val * 70);
      if (underwater) value = Math.round(90 + val * 80);
      else if (h > 45) value = Math.round(80 + val * 70);
      if (isRare) value = 250;
      chests.push({ id: `${cx},${cz},${c}`, x, y: h, z, value, rare: isRare, underwater });
    }

    return {
      items, grass, chests,
      colliders: items.filter((it) => it.r > 0),
      cover: items.filter((it) => it.cover > 0),
    };
  }

  /** Samle kollisjonssirkler nær et punkt. */
  collidersNear(x, z, radius, out) {
    out.length = 0;
    const c0x = Math.floor((x - radius - 4) / CS), c1x = Math.floor((x + radius + 4) / CS);
    const c0z = Math.floor((z - radius - 4) / CS), c1z = Math.floor((z + radius + 4) / CS);
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const f = this.get(cx, cz);
        for (const c of f.colliders) {
          const dx = c.x - x, dz = c.z - z;
          const rr = radius + c.r;
          if (dx * dx + dz * dz < rr * rr + 4) out.push(c);
        }
      }
    }
    return out;
  }

  /** Er punktet skjult i en busk/bak et tre? Returnerer 0..1 (1 = god dekning). */
  coverAt(x, z) {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    let best = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const f = this.get(cx + dx, cz + dz);
        for (const c of f.cover) {
          const ddx = c.x - x, ddz = c.z - z;
          const d = Math.sqrt(ddx * ddx + ddz * ddz);
          if (d < c.cover + 0.6) best = Math.max(best, 1 - d / (c.cover + 0.6) * 0.5);
        }
      }
    }
    return best;
  }

  /** Skyv en sirkel (x, z, r) ut av kolliderende gjenstander. Returnerer true ved kollisjon. */
  resolve(pos, radius, extra = null) {
    const list = this.collidersNear(pos.x, pos.z, radius, this._tmp || (this._tmp = []));
    let hit = false;
    const check = (c) => {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const rr = radius + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = rr - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
        hit = true;
      }
    };
    for (const c of list) check(c);
    if (extra) for (const c of extra) check(c);
    return hit;
  }
}
