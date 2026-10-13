// Seedet 2D simplex-støy (basert på Stefan Gustavsons offentlige implementasjon).
import { mulberry32 } from './math.js';

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
// 12 jevnt fordelte gradientretninger gir isotrop støy (ingen diagonale striper).
const GX = new Float32Array(12);
const GY = new Float32Array(12);
for (let k = 0; k < 12; k++) {
  GX[k] = Math.cos((k / 12) * Math.PI * 2 + 0.13);
  GY[k] = Math.sin((k / 12) * Math.PI * 2 + 0.13);
}

export class SimplexNoise {
  constructor(seed = 1) {
    const rng = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    this.perm = new Uint8Array(512);
    this.permMod = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod[i] = this.perm[i] % 12;
    }
  }

  /** Returnerer verdi i omtrent [-1, 1]. */
  noise2D(xin, yin) {
    const perm = this.perm;
    const pm = this.permMod;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = pm[ii + perm[jj]];
      t0 *= t0;
      n0 = t0 * t0 * (GX[g] * x0 + GY[g] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = pm[ii + i1 + perm[jj + j1]];
      t1 *= t1;
      n1 = t1 * t1 * (GX[g] * x1 + GY[g] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = pm[ii + 1 + perm[jj + 1]];
      t2 *= t2;
      n2 = t2 * t2 * (GX[g] * x2 + GY[g] * y2);
    }
    return 99 * (n0 + n1 + n2);
  }

  /** Fraktal brownsk bevegelse – summen av flere oktaver. */
  fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2D(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ryggete støy for fjellkjeder, omtrent [0, 1]. */
  ridged(x, y, octaves = 5) {
    let sum = 0, amp = 0.5, freq = 1, prev = 1;
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(this.noise2D(x * freq, y * freq));
      n *= n;
      sum += n * amp * prev;
      prev = n;
      freq *= 2.03;
      amp *= 0.5;
    }
    return sum;
  }
}
