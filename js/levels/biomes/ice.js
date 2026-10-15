// Biom: Isverden (bane 1, nord).
import { lerp, smoothstep } from '../../utils/math.js';

export default {
  key: 'ice',
  name: 'Isverden',
  icon: '❄️',
  surface: 'snow',
  lakeFactor: 1,

  height(x, z, c) {
    const r = c.n.mount.ridged(x * 0.0021 + 50, z * 0.0021 + 50, 5);
    return 9 + c.base * 14 + r * r * 110 + c.detail * 1.8;
  },

  color(c, out) {
    const { h, v, steep } = c;
    let r = lerp(0.82, 0.94, v), g = lerp(0.88, 0.96, v), b = lerp(0.96, 1.0, v);
    r = lerp(r, 0.47, steep); g = lerp(g, 0.5, steep); b = lerp(b, 0.56, steep);
    const shore = 1 - smoothstep(0.4, 1.8, h);
    r = lerp(r, 0.58, shore); g = lerp(g, 0.62, shore); b = lerp(b, 0.66, shore);
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  mapColor(h, x, z, out) {
    out[0] = 228; out[1] = 236; out[2] = 246;
    return out;
  },

  pick(p, r2, r3) {
    if (r2 > 0.36) return null;
    if (p.ny < 0.7) return r3 < 0.5 ? 'iceRock' : null;
    return r3 < 0.48 ? 'snowPine' : r3 < 0.65 ? 'iceSpike' : r3 < 0.85 ? 'iceRock' : 'snowDrift';
  },

  decor() {
    return null;
  },

  vegInfo: {
    snowPine: { radius: 0.45, cover: 1.4, foliage: { r: 2.1, y0: 1.6, y1: 8.6 } },
    iceSpike: { radius: 0.6, cover: 1.2, height: 3.4 },
    iceRock: { radius: 0.95, cover: 1.6, rock: true },
    snowDrift: { radius: 0, cover: 0, noShadow: true, scale: [0.8, 2.0] },
  },

  fauna: {
    predators: [['polarbear', 0.5], ['wolf', 0.5]],
    aquatic: 'shark',
    friendly: ['penguin', 'reindeer'],
    caged: ['penguin', 'fox', 'reindeer'],
  },
  camp: { style: 'tent' },
  ambient: { wind: 0.09 },
  atmosphere: { fog: 0xd3e2ef, water: 0x2b6584, fogScale: 0.95 },
};
