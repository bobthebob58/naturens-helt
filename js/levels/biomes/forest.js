// Biom: Skog (bane 1, midten). Ren datamodul – ingen Three.js – slik at terrenget kan testes i Node.
// Se README i js/levels/ for beskrivelse av alle felt.
import { lerp, smoothstep } from '../../utils/math.js';

const TABLE = [
  ['pine', 0.3], ['oak', 0.2], ['birch', 0.14], ['bush', 0.17], ['berryBush', 0.04],
  ['rock', 0.06], ['rock2', 0.04], ['log', 0.05],
];

export function pickByTable(r, table) {
  let acc = 0;
  for (const [t, p] of table) {
    acc += p;
    if (r < acc) return t;
  }
  return table[table.length - 1][0];
}

export default {
  key: 'forest',
  name: 'Skog',
  icon: '🌲',
  surface: 'grass',
  lakeFactor: 1,

  height(x, z, c) {
    let h = 7 + c.base * 20 + c.detail * 2.2;
    const mm = smoothstep(0.18, 0.55, c.n.mount.fbm(x * 0.0009 + 30, z * 0.0009 - 20, 3));
    if (mm > 0) {
      const r = c.n.mount.ridged(x * 0.0024, z * 0.0024, 4);
      h += r * r * 80 * mm;
    }
    return h;
  },

  color(c, out) {
    const { h, v, v2, steep } = c;
    let r = lerp(0.25, 0.4, v), g = lerp(0.44, 0.54, v), b = lerp(0.15, 0.19, v);
    const dirt = smoothstep(0.72, 0.85, v2);
    r = lerp(r, 0.42, dirt); g = lerp(g, 0.36, dirt); b = lerp(b, 0.22, dirt);
    const rock = Math.max(steep, smoothstep(40, 58, h));
    r = lerp(r, 0.45, rock); g = lerp(g, 0.43, rock); b = lerp(b, 0.4, rock);
    const snow = smoothstep(66, 80, h) * (1 - steep * 0.6);
    r = lerp(r, 0.93, snow); g = lerp(g, 0.95, snow); b = lerp(b, 0.98, snow);
    const beach = 1 - smoothstep(0.6, 2.2, h);
    r = lerp(r, 0.76, beach); g = lerp(g, 0.7, beach); b = lerp(b, 0.52, beach);
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  mapColor(h, x, z, out) {
    let r = 78, g = 128, b = 58;
    if (h > 42) { const k = smoothstep(42, 60, h); r = lerp(r, 125, k); g = lerp(g, 120, k); b = lerp(b, 112, k); }
    if (h > 66) { const k = smoothstep(66, 80, h); r = lerp(r, 235, k); g = lerp(g, 240, k); b = lerp(b, 245, k); }
    if (h < 2) { r = 196; g = 182; b = 136; }
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  /** Velg vegetasjonstype for et kandidatpunkt på land (h >= 0.35). Returner null for ingenting. */
  pick(p, r2, r3) {
    if (r2 > 0.8) return null;
    const { h, ny } = p;
    if (ny < 0.7) return r3 < 0.5 ? 'rock' : null;
    if (h > 58) return r3 < 0.35 ? 'snowPine' : r3 < 0.6 ? 'rock2' : null;
    if (h > 44) return r3 < 0.65 ? 'pine' : 'rock2';
    if (h < 2.0) return r3 < 0.5 ? 'bush' : null;
    return pickByTable(r3, TABLE);
  },

  /** Pynt (gress/blomster) – uten kollisjon. */
  decor(p, r1, r2) {
    if (p.h < 0.8 || p.h > 46) return null;
    if (p.w < 0.55 + r1 * 0.4) return null;
    return r2 < 0.12 ? 'flowers' : 'grass';
  },

  vegInfo: {
    pine: { radius: 0.45, cover: 1.4, foliage: { r: 2.1, y0: 1.6, y1: 8.6 } },
    snowPine: { radius: 0.45, cover: 1.4, foliage: { r: 2.1, y0: 1.6, y1: 8.6 } },
    oak: { radius: 0.55, cover: 1.6, foliage: { r: 2.4, y0: 2.4, y1: 7.2 } },
    birch: { radius: 0.3, cover: 1.0, foliage: { r: 1.4, y0: 3.6, y1: 7.6 } },
    bush: { radius: 0, cover: 1.5, scale: [0.8, 1.4] },
    berryBush: { radius: 0, cover: 1.5, scale: [0.8, 1.4] },
    rock: { radius: 0.95, cover: 1.6, rock: true },
    rock2: { radius: 0.95, cover: 1.6, rock: true },
    log: { radius: 0, cover: 1.0, sink: 0.05, height: 0.6 },
    grass: { radius: 0, cover: 0, decor: true },
    flowers: { radius: 0, cover: 0, decor: true },
  },

  fauna: {
    predators: [['bear', 0.55], ['wolf', 0.45]],
    aquatic: 'shark',
    friendly: ['deer', 'fox', 'rabbit'],
    caged: ['fox', 'deer', 'rabbit'],
  },
  camp: { style: 'tent' },
  ambient: { wind: 0.035, birds: true },
  atmosphere: { fog: 0xc4dbe9, water: 0x2a6a86, fogScale: 1 },
};
