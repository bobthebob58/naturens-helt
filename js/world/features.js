// Deterministisk plassering av vegetasjon, steiner, bygninger og skattekister per terrengbit.
// Dataene brukes både til tegning og til kollisjon/dekning/sikt, uavhengig av om bitene er synlige.
// Hva som plasseres bestemmes av biomets modul (js/levels/biomes/*.js).
import { WORLD } from '../config.js';
import { mulberry32, hash2 } from '../utils/math.js';
import { VEG_INFO } from '../levels/levels.js';

const CS = WORLD.chunkSize;
const TAU = Math.PI * 2;
const WATER = WORLD.waterLevel;
const BAND_ORDER = [1, 2, 0]; // midten, sør, nord (samme trekkrekkefølge som bane 1 alltid har brukt)

/** Lag et plassert objekt med kollisjon/dekning skalert etter typen. */
export function makeItem(type, x, y, z, s, ry) {
  const info = VEG_INFO[type] || { radius: 0, cover: 0 };
  const it = { type, x, y, z, s, ry, r: (info.radius || 0) * s, cover: (info.cover || 0) * s };
  if (info.box) {
    // Bokser støtter rotasjon i hele kvarte omdreininger
    const q = Math.round(((ry % TAU) + TAU) % TAU / (Math.PI / 2)) % 2;
    const hw = info.box.hw * s, hd = info.box.hd * s;
    it.box = q ? { hw: hd, hd: hw } : { hw, hd };
    it.r = Math.hypot(hw, hd);
    it.h = (info.box.h || 4) * s;
    it.blocksSight = info.blocksSight !== false;
  } else {
    it.h = (info.height || (info.rock ? 1.4 : 7)) * s;
  }
  return it;
}

function defaultScale(info, r4) {
  if (info.scale) {
    const [a, b, pow = 1] = info.scale;
    return a + (b - a) * Math.pow(r4, pow);
  }
  if (info.rock) return 0.6 + r4 * r4 * 1.8;
  return 0.75 + r4 * 0.6;
}

export class FeatureStore {
  constructor(gen) {
    this.gen = gen;
    this.cache = new Map();
    this.clearings = []; // {x, z, r} – områder uten trær (leirer, startpunkt)
    this.w = [0, 1, 0];
    this._tmp = [];
    this._tmp2 = [];
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

  _pickBand(w, r1) {
    let acc = 0;
    for (const k of BAND_ORDER) {
      acc += w[k];
      if (r1 < acc) return k;
    }
    return BAND_ORDER[2];
  }

  generate(cx, cz) {
    const gen = this.gen;
    const bands = gen.bands;
    const rng = mulberry32(hash2(cx, cz, gen.seed));
    const x0 = cx * CS, z0 = cz * CS;
    const items = [];
    const grass = [];
    const chests = [];
    const empty = { items, grass, chests, colliders: [], cover: [], blockers: [] };
    if (!gen.isInWorld(x0 + CS / 2, z0 + CS / 2, -CS)) return empty;
    const w = this.w;
    const boxes = [];
    const inBox = (x, z, pad) => {
      for (const b of boxes) {
        if (Math.abs(x - b.x) < b.box.hw + pad && Math.abs(z - b.z) < b.box.hd + pad) return true;
      }
      return false;
    };

    // 1) Strukturer (f.eks. bykvartaler) – biomet bestemmer selv rutenettet
    for (let bi = 0; bi < 3; bi++) {
      const b = bands[bi];
      if (!b.structures) continue;
      const wTmp = [0, 0, 0];
      b.structures({
        cx, cz, x0, z0, size: CS, gen,
        rng: mulberry32(hash2(cx, cz, gen.seed + 977 + bi * 31)),
        weightAt: (x, z) => gen.biomeWeights(x, z, wTmp)[bi],
        inClearing: (x, z, pad = 0) => this.inClearing(x, z, pad),
        emit: (type, x, z, s = 1, ry = 0, y = null) => {
          if (this.inClearing(x, z, 6)) return null;
          const gy = y ?? gen.groundHeight(x, z);
          const info = VEG_INFO[type] || {};
          const it = makeItem(type, x, gy - (info.sink ?? 0), z, s, ry);
          if (it.box && inBox(x, z, 0.5)) return null;
          items.push(it);
          if (it.box) boxes.push(it);
          return it;
        },
      });
    }

    // 2) Tilfeldig vegetasjon
    for (let i = 0; i < 100; i++) {
      const x = x0 + rng() * CS, z = z0 + rng() * CS;
      const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(), r5 = rng();
      const h = gen.groundHeight(x, z);
      const underwater = h < 0.35;
      if (underwater && h < -6) continue;
      if (this.inClearing(x, z)) continue;
      if (boxes.length && inBox(x, z, 1.5)) continue;
      gen.biomeWeights(x, z, w);
      const bi = this._pickBand(w, r1);
      const b = bands[bi];
      let type = null;
      if (underwater) {
        if (!b.pickWater) continue;
        type = b.pickWater({ h, depth: WATER - h, x, z, w: w[bi], gen }, r2, r3);
      } else {
        const ny = gen.slopeAt(x, z);
        type = b.pick({ h, ny, x, z, w: w[bi], gen }, r2, r3);
      }
      if (!type) continue;
      const info = VEG_INFO[type] || { radius: 0, cover: 0 };
      const s = b.scale ? b.scale(type, r4) ?? defaultScale(info, r4) : defaultScale(info, r4);
      const sink = info.sink ?? (info.rock ? 0.1 * s : 0.15);
      const y = info.float ? WATER + 0.03 : h - sink;
      const it = makeItem(type, x, y, z, s, r5 * TAU);
      items.push(it);
      if (it.box) boxes.push(it);
    }

    // 3) Gress, blomster og annen pynt (ingen kollisjon)
    for (let i = 0; i < 170; i++) {
      const x = x0 + rng() * CS, z = z0 + rng() * CS;
      const r1 = rng(), r2 = rng();
      const h = gen.groundHeight(x, z);
      if (h < 0.5) continue;
      if (boxes.length && inBox(x, z, 0.8)) continue;
      gen.biomeWeights(x, z, w);
      const bi = gen.bandAt(x, z);
      const b = bands[bi];
      const type = b.decor ? b.decor({ h, x, z, w: w[bi], gen }, r1, r2) : null;
      if (!type) continue;
      grass.push({ type, x, y: h - 0.05, z, s: 0.8 + r1 * 0.7, ry: r2 * TAU });
    }

    // 4) Skattekister – gjemt ved trær/steiner/hus, i åpent terreng eller under vann
    const nChests = (rng() < 0.6 ? 1 : 0) + (rng() < 0.18 ? 1 : 0);
    for (let c = 0; c < 2; c++) {
      const roll = rng(), a = rng(), bb = rng(), rare = rng(), val = rng();
      if (c >= nChests) continue;
      let x, z;
      const hideables = items.filter((it) => (it.r > 0 || it.cover > 0) && !VEG_INFO[it.type]?.float);
      if (roll < 0.6 && hideables.length) {
        const it = hideables[Math.floor(a * hideables.length)];
        const ang = bb * TAU;
        if (it.box) {
          // Langs en husvegg
          const side = Math.floor(bb * 4);
          const dx = side === 0 ? 1 : side === 1 ? -1 : 0;
          const dz = side === 2 ? 1 : side === 3 ? -1 : 0;
          x = it.x + dx * (it.box.hw + 0.9) + (dz ? (a - 0.5) * it.box.hw : 0);
          z = it.z + dz * (it.box.hd + 0.9) + (dx ? (a - 0.5) * it.box.hd : 0);
        } else {
          const off = Math.max(it.r, 0.6) + 0.8;
          x = it.x + Math.cos(ang) * off;
          z = it.z + Math.sin(ang) * off;
        }
      } else {
        x = x0 + 4 + a * (CS - 8);
        z = z0 + 4 + bb * (CS - 8);
      }
      if (this.inClearing(x, z, 4)) continue;
      if (boxes.length && inBox(x, z, 0.4)) continue;
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
      blockers: items.filter((it) => it.box && it.blocksSight),
    };
  }

  /** Samle kollisjonsobjekter nær et punkt (sirkler og bokser; r er omsluttende radius). */
  collidersNear(x, z, radius, out) {
    out.length = 0;
    const c0x = Math.floor((x - radius - 12) / CS), c1x = Math.floor((x + radius + 12) / CS);
    const c0z = Math.floor((z - radius - 12) / CS), c1z = Math.floor((z + radius + 12) / CS);
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

  /** Skyv en sirkel (pos.x, pos.z, radius) ut av kolliderende gjenstander. Returnerer true ved kollisjon. */
  resolve(pos, radius, extra = null) {
    const list = this.collidersNear(pos.x, pos.z, radius, this._tmp);
    let hit = false;
    const check = (c) => {
      if (c.box) {
        if (pos.y !== undefined && c.h && pos.y > c.y + c.h - 0.2) return; // over taket
        const hw = c.box.hw, hd = c.box.hd;
        const px = Math.max(c.x - hw, Math.min(pos.x, c.x + hw));
        const pz = Math.max(c.z - hd, Math.min(pos.z, c.z + hd));
        let dx = pos.x - px, dz = pos.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) return;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x += (dx / d) * (radius - d);
          pos.z += (dz / d) * (radius - d);
        } else {
          // Inne i boksen – skyv ut langs korteste akse
          const ox = hw - Math.abs(pos.x - c.x), oz = hd - Math.abs(pos.z - c.z);
          if (ox < oz) pos.x = c.x + Math.sign(pos.x - c.x || 1) * (hw + radius);
          else pos.z = c.z + Math.sign(pos.z - c.z || 1) * (hd + radius);
        }
        hit = true;
        return;
      }
      if (pos.y !== undefined && c.h && pos.y > c.y + c.h) return; // over toppen
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

  /** Står det noe solid (bygning, stort tre, stein) på punktet? */
  blockedAt(x, z, pad = 0) {
    const list = this.collidersNear(x, z, pad, this._tmp2);
    for (const c of list) {
      if (c.box) {
        if (Math.abs(x - c.x) < c.box.hw + pad && Math.abs(z - c.z) < c.box.hd + pad) return true;
      } else if (Math.hypot(c.x - x, c.z - z) < c.r + pad) {
        return true;
      }
    }
    return false;
  }

  /** Treffer et punkt (f.eks. et prosjektil) en hindring? */
  pointBlocked(x, y, z) {
    const list = this.collidersNear(x, z, 0.1, this._tmp2);
    for (const c of list) {
      if (y > c.y + c.h || y < c.y - 0.5) continue;
      if (c.box) {
        if (Math.abs(x - c.x) < c.box.hw && Math.abs(z - c.z) < c.box.hd) return true;
      } else if (Math.hypot(c.x - x, c.z - z) < c.r) {
        return true;
      }
    }
    return false;
  }

  /** Blokkerer en bygning sikten mellom to punkter? */
  segmentBlocked(ax, ay, az, bx, by, bz) {
    const minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
    const minZ = Math.min(az, bz), maxZ = Math.max(az, bz);
    const c0x = Math.floor((minX - 20) / CS), c1x = Math.floor((maxX + 20) / CS);
    const c0z = Math.floor((minZ - 20) / CS), c1z = Math.floor((maxZ + 20) / CS);
    if ((c1x - c0x + 1) * (c1z - c0z + 1) > 16) return false;
    const dx = bx - ax, dz = bz - az;
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const f = this.cache.get(cx * 100000 + cz) || this.get(cx, cz);
        for (const c of f.blockers) {
          if (c.x + c.box.hw < minX || c.x - c.box.hw > maxX || c.z + c.box.hd < minZ || c.z - c.box.hd > maxZ) continue;
          // Slab-test i 2D
          let t0 = 0, t1 = 1;
          const slab = (o, d, lo, hi) => {
            if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
            let ta = (lo - o) / d, tb = (hi - o) / d;
            if (ta > tb) { const t = ta; ta = tb; tb = t; }
            t0 = Math.max(t0, ta);
            t1 = Math.min(t1, tb);
            return t0 <= t1;
          };
          if (!slab(ax, dx, c.x - c.box.hw, c.x + c.box.hw)) continue;
          if (!slab(az, dz, c.z - c.box.hd, c.z + c.box.hd)) continue;
          const ty = ay + (by - ay) * ((t0 + t1) / 2);
          if (ty < c.y + c.h) return true;
        }
      }
    }
    return false;
  }
}
