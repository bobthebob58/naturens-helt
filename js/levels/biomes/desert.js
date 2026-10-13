// Biom: Ørken (bane 1, sør).
import { lerp, smoothstep } from '../../utils/math.js';

export default {
  key: 'desert',
  name: 'Ørken',
  icon: '🏜️',
  surface: 'sand',
  lakeFactor: 0.5,

  height(x, z, c) {
    const warp = c.n.detail.noise2D(x * 0.003, z * 0.003) * 2.5;
    const dune = 1 - Math.abs(Math.sin(x * 0.028 + z * 0.011 + warp));
    let h = 7 + c.base * 9 + dune * dune * 6 + c.detail * 0.7;
    const mesa = smoothstep(0.42, 0.5, c.n.mount.fbm(x * 0.002 - 70, z * 0.002 + 40, 2));
    h += mesa * 20;
    return h;
  },

  color(c, out) {
    const { h, v, v2, steep } = c;
    let r = lerp(0.88, 0.8, v), g = lerp(0.74, 0.6, v), b = lerp(0.5, 0.38, v);
    const rock = Math.max(steep, smoothstep(0.75, 0.9, v2) * 0.4);
    r = lerp(r, 0.7, rock); g = lerp(g, 0.43, rock); b = lerp(b, 0.29, rock);
    const oasis = 1 - smoothstep(0.4, 3.0, h);
    r = lerp(r, 0.36, oasis * 0.8); g = lerp(g, 0.52, oasis * 0.8); b = lerp(b, 0.22, oasis * 0.8);
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  mapColor(h, x, z, out) {
    out[0] = 222; out[1] = 186; out[2] = 125;
    return out;
  },

  pick(p, r2, r3) {
    if (r2 > 0.2) return null;
    if (p.h < 3.2) return r3 < 0.7 ? 'palm' : 'bush';
    if (p.ny < 0.75) return 'desertRock';
    return r3 < 0.4 ? 'cactus' : r3 < 0.75 ? 'deadBush' : 'desertRock';
  },

  decor(p, r1, r2) {
    if (p.h < 0.8 || p.h > 3) return null;
    return r2 < 0.12 ? 'flowers' : 'grass';
  },

  vegInfo: {
    palm: { radius: 0.3, cover: 0, foliage: { r: 2.3, y0: 6.0, y1: 8.8 } },
    bush: { radius: 0, cover: 1.5, scale: [0.8, 1.4] },
    desertRock: { radius: 0.95, cover: 1.6, rock: true },
    cactus: { radius: 0.4, cover: 0, height: 4.2 },
    deadBush: { radius: 0, cover: 0.9, scale: [0.8, 1.4] },
    grass: { radius: 0, cover: 0, decor: true },
    flowers: { radius: 0, cover: 0, decor: true },
  },

  fauna: {
    predators: [['scorpion', 1]],
    aquatic: 'shark',
    friendly: ['camel', 'fennec'],
    caged: ['fennec', 'fennec', 'rabbit'],
  },
  camp: { style: 'tent' },
  ambient: { wind: 0.06 },
  atmosphere: { fog: 0xd9d2bf, water: 0x2f7a8a, fogScale: 1.05 },
};
