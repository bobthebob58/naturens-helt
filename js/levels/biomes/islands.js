// Biom: Tropiske øyer / skjærgård (bane 2, nord).
// Grunt turkis hav med mange øyer i ulike størrelser: hvite sandstrender, grønn indre del,
// noen høye vulkanøyer med klipper, korallrev og sjøgress i lagunene.
// Ren datamodul – ingen Three.js – slik at terrenget kan testes i Node.
import { lerp, smoothstep } from '../../utils/math.js';
import { pickByTable } from './forest.js';

// Indre del av øyene (lavland)
const INLAND = [
  ['islands_palm', 0.2], ['islands_palmBent', 0.08], ['islands_palmTwin', 0.08], ['islands_pandanus', 0.1],
  ['islands_bush', 0.3], ['islands_hibiscus', 0.14], ['islands_rock', 0.08], ['islands_driftwood', 0.02],
];
// Stranden
const BEACH = [
  ['islands_palmBent', 0.3], ['islands_palm', 0.14], ['islands_palmTwin', 0.08], ['islands_pandanus', 0.06],
  ['islands_rock', 0.17], ['islands_driftwood', 0.17], ['islands_bush', 0.08],
];
// Høylandet på vulkanøyene
const HIGHLAND = [
  ['islands_bush', 0.34], ['islands_pandanus', 0.14], ['islands_palm', 0.16], ['islands_hibiscus', 0.12],
  ['islands_cliffRock', 0.16], ['islands_palmTwin', 0.08],
];

export default {
  key: 'islands',
  name: 'Tropiske øyer',
  icon: '🏝️',
  surface: 'sand',
  lakeFactor: 0,

  height(x, z, c) {
    const n = c.n;
    // Øymaske: enkeltøyer (middels frekvens) + øygrupper (lav frekvens) + litt av basisstøyen
    const a = n.extra.fbm(x * 0.0034 + 31.7, z * 0.0034 - 57.3, 3);
    const g = n.lake.noise2D(x * 0.0011 - 13.1, z * 0.0011 + 71.9);
    const s = a * 0.74 + g * 0.36 + c.base * 0.18 + c.detail * 0.03 - 0.2;

    // Havbunn: dypt (ca. −9…−13 m) langt ute, grunt skjær (−4 m) rundt øyene og lagune helt inntil stranden
    const deep = -10.6 + c.base * 3.0 + c.detail * 0.6;
    let h = deep;
    h += (-3.8 - deep) * smoothstep(-0.44, -0.12, s);
    h += 2.8 * smoothstep(-0.13, -0.01, s);
    // Strand: slak stigning til ~2.3 m (hvit sand)
    h += 3.1 * smoothstep(-0.02, 0.1, s);
    // Grønt innland: bølgende, 4–8 m
    const inland = smoothstep(0.07, 0.28, s);
    if (inland > 0) h += inland * (2.4 + c.detail * 1.6 + c.base * 2.2);

    // Høye vulkanøyer med klipper (bare noen av øyene)
    const hm = smoothstep(0.08, 0.42, n.mount.noise2D(x * 0.0019 + 5.3, z * 0.0019 - 3.7));
    if (hm > 0 && s > 0.02) {
      // Bratt klippekant like innenfor stranden (strekker seg over ≥ 8 m)
      // Klippehøyden varierer langs kysten: noen steder loddrett fjell, andre steder slak skråning
      const ch = smoothstep(-0.35, 0.35, n.detail.noise2D(x * 0.0055 + 40.0, z * 0.0055 - 12.0));
      const cliff = smoothstep(0.035, 0.1, s) * (1 + ch * 9);
      const top = smoothstep(0.1, 0.34, s);
      const r = n.mount.ridged(x * 0.0065 - 11.0, z * 0.0065 + 4.0, 2);
      h += hm * (cliff + top * (6 + r * r * 14));
    }
    return h;
  },

  color(c, out) {
    const { h, ny, v, v2, steep } = c;
    // Frodig tropisk grønt, med mørkere flekker der jungelen er tett
    let r = lerp(0.22, 0.32, v), g = lerp(0.44, 0.53, v), b = lerp(0.13, 0.18, v);
    const dark = smoothstep(0.55, 0.8, v2) * 0.5;
    r = lerp(r, 0.15, dark); g = lerp(g, 0.38, dark); b = lerp(b, 0.12, dark);
    // Litt mørkere og mosegrønt på høylandet
    const hi = smoothstep(14, 26, h);
    r = lerp(r, 0.2, hi * 0.5); g = lerp(g, 0.4, hi * 0.5); b = lerp(b, 0.17, hi * 0.5);
    // Mørk vulkansk stein i klipper og bratte skrenter (ikke på stranden)
    const rock = Math.max(steep, (1 - smoothstep(0.66, 0.86, ny)) * smoothstep(2.2, 4.5, h));
    r = lerp(r, lerp(0.36, 0.44, v2), rock); g = lerp(g, lerp(0.32, 0.39, v2), rock); b = lerp(b, lerp(0.29, 0.34, v2), rock);
    // Hvit korallsand langs stranden
    const sand = (1 - smoothstep(1.7, 3.0, h + (v2 - 0.5) * 1.0)) * (1 - rock);
    r = lerp(r, lerp(0.97, 0.9, v), sand); g = lerp(g, lerp(0.92, 0.84, v), sand); b = lerp(b, lerp(0.78, 0.68, v), sand);
    // Havbunn: lys sand med flekker av sjøgress
    if (h < 0) {
      const weed = smoothstep(0.55, 0.75, v2) * smoothstep(-0.5, -2.0, h) * 0.55;
      r = lerp(r, 0.36, weed); g = lerp(g, 0.5, weed); b = lerp(b, 0.3, weed);
    }
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  mapColor(h, x, z, out) {
    let r = 82, g = 160, b = 72;
    if (h > 12) { const k = smoothstep(12, 26, h); r = lerp(r, 104, k); g = lerp(g, 118, k); b = lerp(b, 82, k); }
    if (h < 2.3) { r = 240; g = 230; b = 196; }
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  // Turkis grunt vann, dypere blått lenger ute
  mapWater: [[96, 218, 212], [22, 124, 178]],

  pick(p, r2, r3) {
    const { h, ny } = p;
    if (ny < 0.74) return r2 < 0.45 ? 'islands_cliffRock' : null;
    if (h < 2.2) {
      if (r2 > 0.5) return null;
      return pickByTable(r3, BEACH);
    }
    // Tette lunder veksler med åpne gressletter (lysninger til leirer og ferdsel)
    const grove = p.gen.noise.color.noise2D(p.x * 0.0075 + 9.1, p.z * 0.0075 - 2.7);
    const dens = grove > 0.05 ? 0.95 : 0.55;
    if (r2 > dens) return null;
    if (h > 13) return pickByTable(r3, HIGHLAND);
    return pickByTable(r3, INLAND);
  },

  // Under vann: typen velges etter dybden slik at koraller, sjøgress og tang aldri stikker opp av vannet
  // (høyde ved maks skala: revA ≈ 1,1 m, revB/C ≈ 1,6–1,9 m, sjøgress ≈ 1,1 m, tang ≈ 1,4 m).
  pickWater(p, r2, r3) {
    const d = p.depth;
    // Helt inne ved stranden: bare en og annen stein som bryter vannflaten
    if (d < 1.15) return r2 < 0.1 ? 'islands_rock' : null;
    // Korallrevene ligger i flekker langs skjærene
    const reef = p.gen.noise.temp.noise2D(p.x * 0.011 + 3.1, p.z * 0.011 - 8.2);
    if (reef > -0.05 && d > 1.3) {
      if (r2 > 0.62) return null;
      if (d < 2.1) return r3 < 0.8 ? 'islands_reefA' : 'islands_seagrass';
      return r3 < 0.34 ? 'islands_reefA' : r3 < 0.67 ? 'islands_reefB' : r3 < 0.92 ? 'islands_reefC' : 'islands_seaweed';
    }
    if (r2 > 0.4) return null;
    if (d < 1.6) return 'islands_seagrass';
    if (d < 3.5) return r3 < 0.7 ? 'islands_seagrass' : 'islands_seaweed';
    return r3 < 0.5 ? 'islands_seaweed' : r3 < 0.75 ? 'islands_seagrass' : 'islands_reefA';
  },

  decor(p, r1, r2) {
    const { h } = p;
    if (p.w < 0.5 + r1 * 0.45) return null;
    if (h < 2.3) {
      if (h < 0.7 || r2 > 0.55) return null;
      return 'islands_beachGrass';
    }
    if (h > 22) return null;
    return r2 < 0.12 ? 'islands_flowers' : 'islands_grass';
  },

  vegInfo: {
    islands_palm: { radius: 0.3, cover: 0, foliage: { r: 3.2, y0: 7.0, y1: 10.4 }, height: 10, scale: [0.8, 1.2] },
    islands_palmBent: { radius: 0.3, cover: 0, foliage: { r: 4.2, y0: 5.4, y1: 8.6 }, height: 8, scale: [0.8, 1.2] },
    islands_palmTwin: { radius: 0.4, cover: 0.8, foliage: { r: 4.0, y0: 5.8, y1: 10.0 }, height: 9.5, scale: [0.85, 1.15] },
    islands_pandanus: { radius: 0.35, cover: 1.6, foliage: { r: 2.4, y0: 2.4, y1: 5.0 }, height: 5, scale: [0.8, 1.3] },
    islands_bush: { radius: 0, cover: 1.6, scale: [0.8, 1.5] },
    islands_hibiscus: { radius: 0, cover: 1.4, scale: [0.8, 1.3] },
    islands_rock: { radius: 0.95, cover: 1.5, rock: true },
    islands_cliffRock: { radius: 0.95, cover: 1.6, rock: true },
    islands_driftwood: { radius: 0, cover: 0.7, sink: 0.08, height: 0.5, scale: [0.8, 1.4] },
    islands_reefA: { radius: 0, cover: 0, static: true, sink: 0.1, scale: [0.8, 1.5] },
    islands_reefB: { radius: 0, cover: 0, static: true, sink: 0.1, scale: [0.8, 1.5] },
    islands_reefC: { radius: 0, cover: 0, static: true, sink: 0.1, scale: [0.8, 1.5] },
    islands_seagrass: { radius: 0, cover: 0, decor: true, sink: 0.05, scale: [0.6, 1.1] },
    islands_seaweed: { radius: 0, cover: 0, decor: true, sink: 0.05, scale: [0.7, 1.0] },
    islands_beachGrass: { radius: 0, cover: 0, decor: true },
    islands_grass: { radius: 0, cover: 0, decor: true },
    islands_flowers: { radius: 0, cover: 0, decor: true },
  },

  fauna: {
    predators: [['boar', 1]],
    aquatic: 'shark',
    friendly: ['turtle', 'parrot'],
    caged: ['turtle', 'parrot'],
  },
  camp: { style: 'tent', minH: 2, dryRadius: 12, dryH: 0.8 },
  ambient: { wind: 0.07, birds: true },
  atmosphere: { fog: 0xcfe6ee, water: 0x1f9fb0, sky: 0x2f86d8, fogScale: 1.1 },
};
