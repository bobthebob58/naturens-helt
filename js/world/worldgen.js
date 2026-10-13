// Prosedyrisk verdensgenerering: høyde, biomer (skog, ørken, is), innsjøer og hav.
import { SimplexNoise } from '../utils/noise.js';
import { WORLD } from '../config.js';
import { lerp, smoothstep } from '../utils/math.js';

const CELL = WORLD.cell;
const CACHE_BITS = 18;
const CACHE_SIZE = 1 << CACHE_BITS;
const CACHE_MASK = CACHE_SIZE - 1;

export const BIOME_NAMES = { forest: 'Skog', desert: 'Ørken', ice: 'Isverden' };

const toLin = (c) => Math.pow(c, 2.2);

export class WorldGen {
  constructor(seed) {
    this.seed = seed;
    this.half = WORLD.size / 2;
    this.water = WORLD.waterLevel;
    const s = (seed % 100000) * 7;
    this.nTemp = new SimplexNoise(s + 1);
    this.nBase = new SimplexNoise(s + 2);
    this.nDetail = new SimplexNoise(s + 3);
    this.nLake = new SimplexNoise(s + 4);
    this.nMount = new SimplexNoise(s + 5);
    this.nColor = new SimplexNoise(s + 6);
    this.cacheKeyX = new Int32Array(CACHE_SIZE).fill(0x7fffffff);
    this.cacheKeyZ = new Int32Array(CACHE_SIZE);
    this.cacheVal = new Float32Array(CACHE_SIZE);
    this._w = { forest: 1, desert: 0, ice: 0, t: 0 };
    this._w2 = { forest: 1, desert: 0, ice: 0, t: 0 };
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

  biomeWeights(x, z, out = this._w) {
    const t = this.temperature(x, z);
    const ice = 1 - smoothstep(-0.46, -0.3, t);
    const desert = smoothstep(0.3, 0.46, t);
    out.ice = ice;
    out.desert = desert;
    out.forest = Math.max(0, 1 - ice - desert);
    out.t = t;
    return out;
  }

  biomeAt(x, z) {
    const w = this.biomeWeights(x, z, this._w2);
    if (w.ice > 0.5) return 'ice';
    if (w.desert > 0.5) return 'desert';
    return 'forest';
  }

  // ---------- Høyde ----------
  rawHeight(x, z) {
    const w = this.biomeWeights(x, z);
    const base = this.nBase.fbm(x * 0.0016, z * 0.0016, 4);
    const detail = this.nDetail.fbm(x * 0.011, z * 0.011, 3);
    let h = 0;
    if (w.forest > 0.0001) {
      let hf = 7 + base * 20 + detail * 2.2;
      const mm = smoothstep(0.18, 0.55, this.nMount.fbm(x * 0.0009 + 30, z * 0.0009 - 20, 3));
      if (mm > 0) {
        const r = this.nMount.ridged(x * 0.0024, z * 0.0024, 4);
        hf += r * r * 80 * mm;
      }
      h += hf * w.forest;
    }
    if (w.desert > 0.0001) {
      const warp = this.nDetail.noise2D(x * 0.003, z * 0.003) * 2.5;
      const dune = 1 - Math.abs(Math.sin(x * 0.028 + z * 0.011 + warp));
      let hd = 7 + base * 9 + dune * dune * 6 + detail * 0.7;
      const mesa = smoothstep(0.42, 0.5, this.nMount.fbm(x * 0.002 - 70, z * 0.002 + 40, 2));
      hd += mesa * 20;
      h += hd * w.desert;
    }
    if (w.ice > 0.0001) {
      const r = this.nMount.ridged(x * 0.0021 + 50, z * 0.0021 + 50, 5);
      const hi = 9 + base * 14 + r * r * 110 + detail * 1.8;
      h += hi * w.ice;
    }
    // Innsjøer (færre og grunnere i ørkenen – oaser)
    const lk = this.nLake.fbm(x * 0.0032, z * 0.0032, 3);
    const lakeAmt = smoothstep(0.34, 0.5, lk) * (1 - 0.5 * w.desert);
    if (lakeAmt > 0) h = lerp(h, -9, lakeAmt);
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
    const v = this.nColor.noise2D(x * 0.02, z * 0.02) * 0.5 + 0.5;
    const v2 = this.nColor.noise2D(x * 0.09 + 100, z * 0.09) * 0.5 + 0.5;
    const steep = 1 - smoothstep(0.6, 0.8, ny);
    let r = 0, g = 0, b = 0;

    if (w.forest > 0.0001) {
      let fr = lerp(0.25, 0.4, v), fg = lerp(0.44, 0.54, v), fb = lerp(0.15, 0.19, v);
      const dirt = smoothstep(0.72, 0.85, v2);
      fr = lerp(fr, 0.42, dirt); fg = lerp(fg, 0.36, dirt); fb = lerp(fb, 0.22, dirt);
      const rock = Math.max(steep, smoothstep(40, 58, h));
      fr = lerp(fr, 0.45, rock); fg = lerp(fg, 0.43, rock); fb = lerp(fb, 0.4, rock);
      const snow = smoothstep(66, 80, h) * (1 - steep * 0.6);
      fr = lerp(fr, 0.93, snow); fg = lerp(fg, 0.95, snow); fb = lerp(fb, 0.98, snow);
      const beach = 1 - smoothstep(0.6, 2.2, h);
      fr = lerp(fr, 0.76, beach); fg = lerp(fg, 0.7, beach); fb = lerp(fb, 0.52, beach);
      r += fr * w.forest; g += fg * w.forest; b += fb * w.forest;
    }
    if (w.desert > 0.0001) {
      let dr = lerp(0.88, 0.8, v), dg = lerp(0.74, 0.6, v), db = lerp(0.5, 0.38, v);
      const rock = Math.max(steep, smoothstep(0.75, 0.9, v2) * 0.4);
      dr = lerp(dr, 0.7, rock); dg = lerp(dg, 0.43, rock); db = lerp(db, 0.29, rock);
      const oasis = 1 - smoothstep(0.4, 3.0, h);
      dr = lerp(dr, 0.36, oasis * 0.8); dg = lerp(dg, 0.52, oasis * 0.8); db = lerp(db, 0.22, oasis * 0.8);
      r += dr * w.desert; g += dg * w.desert; b += db * w.desert;
    }
    if (w.ice > 0.0001) {
      let ir = lerp(0.82, 0.94, v), ig = lerp(0.88, 0.96, v), ib = lerp(0.96, 1.0, v);
      const rock = steep;
      ir = lerp(ir, 0.47, rock); ig = lerp(ig, 0.5, rock); ib = lerp(ib, 0.56, rock);
      const shore = 1 - smoothstep(0.4, 1.8, h);
      ir = lerp(ir, 0.58, shore); ig = lerp(ig, 0.62, shore); ib = lerp(ib, 0.66, shore);
      r += ir * w.ice; g += ig * w.ice; b += ib * w.ice;
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
      const k = smoothstep(0, -12, h);
      out[0] = lerp(80, 22, k); out[1] = lerp(160, 70, k); out[2] = lerp(200, 140, k);
      return out;
    }
    const w = this.biomeWeights(x, z);
    let r = 0, g = 0, b = 0;
    // skog
    let fr = 78, fg = 128, fb = 58;
    if (h > 42) { const k = smoothstep(42, 60, h); fr = lerp(fr, 125, k); fg = lerp(fg, 120, k); fb = lerp(fb, 112, k); }
    if (h > 66) { const k = smoothstep(66, 80, h); fr = lerp(fr, 235, k); fg = lerp(fg, 240, k); fb = lerp(fb, 245, k); }
    if (h < 2) { fr = 196; fg = 182; fb = 136; }
    r += fr * w.forest; g += fg * w.forest; b += fb * w.forest;
    // ørken
    r += 222 * w.desert; g += 186 * w.desert; b += 125 * w.desert;
    // is
    r += 228 * w.ice; g += 236 * w.ice; b += 246 * w.ice;
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
    const w = { forest: 0, desert: 0, ice: 0, t: 0 };
    for (let r = 0; r < 1400; r += 24) {
      const steps = Math.max(1, Math.floor((r * Math.PI * 2) / 40));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const h = this.rawHeight(x, z);
        if (h < 3 || h > 18) continue;
        this.biomeWeights(x, z, w);
        if (w.forest < 0.97) continue;
        let ok = true;
        for (let k = 0; k < 10 && ok; k++) {
          const b = (k / 10) * Math.PI * 2;
          for (const rr of [20, 45, 70]) {
            if (this.rawHeight(x + Math.cos(b) * rr, z + Math.sin(b) * rr) < 1.2) { ok = false; break; }
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
