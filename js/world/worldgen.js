// Prosedyrisk verdensgenerering: høyde, biomer, innsjøer og hav.
// Hver bane har tre biomer i bånd fra nord til sør (se js/levels/levels.js).
import { SimplexNoise } from '../utils/noise.js';
import { WORLD } from '../config.js';
import { lerp, smoothstep } from '../utils/math.js';
import { getLevel } from '../levels/levels.js';
import { BIOMES } from '../levels/levels.js';

const DEFAULT_MAP_WATER = [[80, 160, 200], [22, 70, 140]];

const CELL = WORLD.cell;
const CACHE_BITS = 18;
const CACHE_SIZE = 1 << CACHE_BITS;
const CACHE_MASK = CACHE_SIZE - 1;

const toLin = (c) => Math.pow(c, 2.2);

export class WorldGen {
  constructor(seed, levelId = 1) {
    this.seed = seed;
    this.level = getLevel(levelId);
    this.bands = this.level.bands.map((k) => BIOMES[k]);
    this.half = WORLD.size / 2;
    this.water = WORLD.waterLevel;
    const s = (seed % 100000) * 7;
    this.nTemp = new SimplexNoise(s + 1);
    this.nBase = new SimplexNoise(s + 2);
    this.nDetail = new SimplexNoise(s + 3);
    this.nLake = new SimplexNoise(s + 4);
    this.nMount = new SimplexNoise(s + 5);
    this.nColor = new SimplexNoise(s + 6);
    this.nExtra = new SimplexNoise(s + 8);
    this.noise = { base: this.nBase, detail: this.nDetail, lake: this.nLake, mount: this.nMount, color: this.nColor, extra: this.nExtra, temp: this.nTemp };
    this._hc = { n: this.noise, base: 0, detail: 0, w: 0, half: WORLD.size / 2, seed };
    this._cc = { n: this.noise, x: 0, z: 0, h: 0, ny: 1, steep: 0, v: 0, v2: 0, w: 0 };
    this._tmp = [0, 0, 0];
    this.cacheKeyX = new Int32Array(CACHE_SIZE).fill(0x7fffffff);
    this.cacheKeyZ = new Int32Array(CACHE_SIZE);
    this.cacheVal = new Float32Array(CACHE_SIZE);
    this._w = [0, 1, 0];
    this._w2 = [0, 1, 0];
    this.spawn = { x: 0, z: 0, h: 5 };
    this.spawnReady = false;
    this.findSpawn();
  }

  // ---------- Biomer ----------
  temperature(x, z) {
    const lat = z / this.half; // -1 = nord (kaldt), +1 = sør (varmt)
    const d = Math.hypot(x, z);
    const amt = lerp(0.16, 0.5, smoothstep(150, 900, d));
    return lat * 1.05 + this.nTemp.fbm(x * 0.0007, z * 0.0007, 3) * amt;
  }

  /** Vekter for [nord, midten, sør]-biomene. */
  biomeWeights(x, z, out = this._w) {
    const t = this.temperature(x, z);
    const north = 1 - smoothstep(-0.46, -0.3, t);
    const south = smoothstep(0.3, 0.46, t);
    out[0] = north;
    out[2] = south;
    out[1] = Math.max(0, 1 - north - south);
    out.t = t;
    return out;
  }

  /** Indeks (0..2) til biomet som dominerer i punktet. */
  bandAt(x, z) {
    const w = this.biomeWeights(x, z, this._w2);
    if (w[0] > 0.5) return 0;
    if (w[2] > 0.5) return 2;
    return 1;
  }

  biomeAt(x, z) {
    return this.bands[this.bandAt(x, z)].key;
  }

  biomeDef(x, z) {
    return this.bands[this.bandAt(x, z)];
  }

  // ---------- Høyde ----------
  rawHeight(x, z) {
    const w = this.biomeWeights(x, z);
    const c = this._hc;
    c.base = this.nBase.fbm(x * 0.0016, z * 0.0016, 4);
    c.detail = this.nDetail.fbm(x * 0.011, z * 0.011, 3);
    let h = 0;
    let lakeF = 0;
    for (let i = 0; i < 3; i++) {
      const wi = w[i];
      if (wi <= 0.0001) continue;
      const b = this.bands[i];
      c.w = wi;
      h += b.height(x, z, c) * wi;
      lakeF += (b.lakeFactor ?? 1) * wi;
    }
    // Innsjøer (styrken avhenger av biomet)
    if (lakeF > 0.001) {
      const lk = this.nLake.fbm(x * 0.0032, z * 0.0032, 3);
      const lakeAmt = smoothstep(0.34, 0.5, lk) * lakeF;
      if (lakeAmt > 0) h = lerp(h, -9, lakeAmt);
    }
    // Hav rundt hele verden
    const e = Math.max(Math.abs(x), Math.abs(z)) / this.half;
    if (e > 0.85) h = lerp(h, -30, smoothstep(0.85, 0.97, e));
    return h;
  }

  height(x, z) {
    let h = this.rawHeight(x, z);
    if (this.spawnReady) {
      const d = Math.hypot(x - this.spawn.x, z - this.spawn.z);
      if (d < 60) h = lerp(h, Math.max(h, 2.5), 1 - smoothstep(25, 60, d));
    }
    return h;
  }

  /** Høyde i et rutenettpunkt (bufret). */
  gridHeight(ix, iz) {
    const idx = ((ix * 73856093) ^ (iz * 19349663)) & CACHE_MASK;
    if (this.cacheKeyX[idx] === ix && this.cacheKeyZ[idx] === iz) return this.cacheVal[idx];
    const h = this.height(ix * CELL, iz * CELL);
    this.cacheKeyX[idx] = ix;
    this.cacheKeyZ[idx] = iz;
    this.cacheVal[idx] = h;
    return h;
  }

  /** Bakkehøyde som matcher terrengnettet nøyaktig (triangelinterpolering). */
  groundHeight(x, z) {
    const fx = x / CELL, fz = z / CELL;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const h10 = this.gridHeight(ix + 1, iz);
    const h01 = this.gridHeight(ix, iz + 1);
    if (tx + tz <= 1) {
      const h00 = this.gridHeight(ix, iz);
      return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    }
    const h11 = this.gridHeight(ix + 1, iz + 1);
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  /** Normalvektorens y-komponent i et rutenettpunkt (1 = flatt). */
  gridNormal(ix, iz, out) {
    const dx = this.gridHeight(ix - 1, iz) - this.gridHeight(ix + 1, iz);
    const dz = this.gridHeight(ix, iz - 1) - this.gridHeight(ix, iz + 1);
    const ny = 2 * CELL;
    const len = Math.hypot(dx, ny, dz);
    out[0] = dx / len;
    out[1] = ny / len;
    out[2] = dz / len;
    return out;
  }

  slopeAt(x, z) {
    const d = 2;
    const dx = this.groundHeight(x - d, z) - this.groundHeight(x + d, z);
    const dz = this.groundHeight(x, z - d) - this.groundHeight(x, z + d);
    return (2 * d) / Math.hypot(dx, 2 * d, dz); // normal.y
  }

  waterDepth(x, z) {
    return this.water - this.groundHeight(x, z);
  }

  /** Terrengfarge (lineær RGB) for et punkt. */
  terrainColor(x, z, h, ny, out) {
    const w = this.biomeWeights(x, z);
    const c = this._cc;
    c.x = x; c.z = z; c.h = h; c.ny = ny;
    c.v = this.nColor.noise2D(x * 0.02, z * 0.02) * 0.5 + 0.5;
    c.v2 = this.nColor.noise2D(x * 0.09 + 100, z * 0.09) * 0.5 + 0.5;
    c.steep = 1 - smoothstep(0.6, 0.8, ny);
    const t = this._tmp;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < 3; i++) {
      const wi = w[i];
      if (wi <= 0.0001) continue;
      c.w = wi;
      this.bands[i].color(c, t);
      r += t[0] * wi; g += t[1] * wi; b += t[2] * wi;
    }
    if (h < -0.3) {
      const k = smoothstep(-0.3, -7, h);
      r = lerp(r, 0.3, k * 0.6); g = lerp(g, 0.33, k * 0.6); b = lerp(b, 0.28, k * 0.6);
    }
    out[0] = toLin(r); out[1] = toLin(g); out[2] = toLin(b);
    return out;
  }

  /** Enkel kartfarge (sRGB 0-255) brukt på minikart og verdenskart. */
  mapColor(x, z, h, shade, out) {
    if (h < this.water) {
      // Vannfargen blandes etter biomvektene, som landfargen (ingen skarpe skiller ved biomgrensene)
      const k = smoothstep(0, -12, h);
      const w = this.biomeWeights(x, z);
      out[0] = out[1] = out[2] = 0;
      for (let i = 0; i < 3; i++) {
        const wi = w[i];
        if (wi <= 0.0001) continue;
        const mw = this.bands[i].mapWater || DEFAULT_MAP_WATER;
        for (let j = 0; j < 3; j++) out[j] += lerp(mw[0][j], mw[1][j], k) * wi;
      }
      return out;
    }
    const w = this.biomeWeights(x, z);
    const t = this._tmp;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < 3; i++) {
      const wi = w[i];
      if (wi <= 0.0001) continue;
      this.bands[i].mapColor(h, x, z, t);
      r += t[0] * wi; g += t[1] * wi; b += t[2] * wi;
    }
    out[0] = Math.min(255, r * shade);
    out[1] = Math.min(255, g * shade);
    out[2] = Math.min(255, b * shade);
    return out;
  }

  // ---------- Spørringer ----------
  lineOfSight(ax, ay, az, bx, by, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / 3);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const z = az + (bz - az) * t;
      if (this.groundHeight(x, z) > y - 0.15) return false;
    }
    return true;
  }

  /** Stråle mot terreng. Returnerer avstand eller -1. */
  raycast(o, d, maxDist) {
    let prev = 0;
    let step = 0.75;
    for (let t = step; t <= maxDist; t += step) {
      const y = o.y + d.y * t;
      if (y < this.groundHeight(o.x + d.x * t, o.z + d.z * t)) {
        let lo = prev, hi = t;
        for (let i = 0; i < 8; i++) {
          const m = (lo + hi) * 0.5;
          if (o.y + d.y * m < this.groundHeight(o.x + d.x * m, o.z + d.z * m)) hi = m;
          else lo = m;
        }
        return hi;
      }
      prev = t;
      if (t > 30) step = 2;
    }
    return -1;
  }

  findSpawn() {
    const w = [0, 0, 0];
    const sp = { minH: 3, maxH: 18, dry: 1.2, ...(this.bands[1].spawn || {}) };
    for (let r = 0; r < 1400; r += 24) {
      const steps = Math.max(1, Math.floor((r * Math.PI * 2) / 40));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const h = this.rawHeight(x, z);
        if (h < sp.minH || h > sp.maxH) continue;
        this.biomeWeights(x, z, w);
        if (w[1] < 0.97) continue;
        let ok = true;
        for (let k = 0; k < 10 && ok; k++) {
          const b = (k / 10) * Math.PI * 2;
          for (const rr of [20, 45, 70]) {
            if (this.rawHeight(x + Math.cos(b) * rr, z + Math.sin(b) * rr) < sp.dry) { ok = false; break; }
          }
        }
        if (!ok) continue;
        const dx = this.rawHeight(x + 4, z) - this.rawHeight(x - 4, z);
        const dz = this.rawHeight(x, z + 4) - this.rawHeight(x, z - 4);
        if (Math.hypot(dx, dz) > 3) continue;
        this.spawn = { x, z, h };
        this.spawnReady = true;
        return;
      }
    }
    this.spawn = { x: 0, z: 0, h: this.rawHeight(0, 0) };
    this.spawnReady = true;
  }

  isInWorld(x, z, margin = 0) {
    return Math.abs(x) < this.half - margin && Math.abs(z) < this.half - margin;
  }
}
