// Tegn verdenskartet for en bane til PNG og skriv statistikk (land/vann og høyde per biom):
//   node tools/levelmap.mjs <bane> [frø] [utfil]      (standard tools/out/levelmap_l<bane>_<frø>.png)
import fs from 'node:fs';
import { WorldGen } from '../js/world/worldgen.js';
import { writePNG } from './png.mjs';
const level = +(process.argv[2] || 1);
const seed = +(process.argv[3] || 12345);
fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
const out = process.argv[4] || new URL(`./out/levelmap_l${level}_${seed}.png`, import.meta.url).pathname;
const N = 512;
const t0 = Date.now();
const g = new WorldGen(seed, level);
const half = g.half, mpp = (half * 2) / N;
const H = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = g.height(-half + (i + 0.5) * mpp, -half + (j + 0.5) * mpp);
const t1 = Date.now();
const buf = Buffer.alloc(N * N * 3); const c = [0, 0, 0];
const stats = {};
let minH = 1e9, maxH = -1e9;
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const h = H[j * N + i]; const x = -half + (i + 0.5) * mpp, z = -half + (j + 0.5) * mpp;
  const hl = H[j * N + Math.max(0, i - 1)], hu = H[Math.max(0, j - 1) * N + i];
  const shade = Math.max(0.55, Math.min(1.3, 1 + ((hl - h) + (hu - h)) * 0.06));
  g.mapColor(x, z, h, shade, c);
  const b = g.biomeAt(x, z);
  stats[b] = stats[b] || { land: 0, water: 0, sumH: 0 };
  if (h < 0) stats[b].water++; else { stats[b].land++; stats[b].sumH += h; }
  minH = Math.min(minH, h); maxH = Math.max(maxH, h);
  buf[(j * N + i) * 3] = c[0]; buf[(j * N + i) * 3 + 1] = c[1]; buf[(j * N + i) * 3 + 2] = c[2];
}
const sx = Math.round((g.spawn.x + half) / mpp), sz = Math.round((g.spawn.z + half) / mpp);
for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const p = ((sz + dy) * N + sx + dx) * 3; buf[p] = 255; buf[p + 1] = 0; buf[p + 2] = 255; }
writePNG(out, N, N, buf);
for (const k in stats) { const s = stats[k]; s.waterFrac = +(s.water / (s.water + s.land)).toFixed(2); s.avgLandH = +(s.sumH / Math.max(1, s.land)).toFixed(1); delete s.sumH; }
console.log(JSON.stringify({ level, seed, out, heightMs: t1 - t0, minH: +minH.toFixed(1), maxH: +maxH.toFixed(1), spawn: [Math.round(g.spawn.x), Math.round(g.spawn.z), +g.spawn.h.toFixed(1)], stats }));
