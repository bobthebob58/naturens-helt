// Biom: Regnskog (bane 2, midten – spilleren starter her).
// Tett tropisk regnskog i kupert terreng med slyngede elvedaler og innsjøer. Ren datamodul – ingen Three.js –
// slik at terrenget kan testes i Node. Se README i js/levels/ for beskrivelse av alle felt.
import { lerp, smoothstep } from '../../utils/math.js';
import { pickByTable } from './forest.js';

// Vanlig regnskogsbunn: kjempetrær, regnskogstrær, palmer og et tett undervegetasjonslag (sum = 1)
const TABLE = [
  ['rainforest_kapok', 0.06], ['rainforest_tree', 0.13], ['rainforest_treeLight', 0.07], ['rainforest_bloom', 0.04],
  ['rainforest_cecropia', 0.05], ['rainforest_palm', 0.1], ['rainforest_banana', 0.07], ['rainforest_bigleaf', 0.11],
  ['rainforest_heliconia', 0.05], ['rainforest_fern', 0.11], ['rainforest_treefern', 0.08], ['rainforest_log', 0.05],
  ['rainforest_rock', 0.08],
];
// Lysninger (der lyset når bakken): bananer, storbladplanter, heliconia og palmer
const GAP = [
  ['rainforest_banana', 0.22], ['rainforest_bigleaf', 0.22], ['rainforest_heliconia', 0.16],
  ['rainforest_palm', 0.16], ['rainforest_fern', 0.14], ['rainforest_cecropia', 0.1],
];
// Elvebredder og innsjøkanter
const SHORE = [
  ['rainforest_palm', 0.24], ['rainforest_banana', 0.18], ['rainforest_bigleaf', 0.26], ['rainforest_heliconia', 0.08],
  ['rainforest_fern', 0.1], ['rainforest_tree', 0.08], ['rainforest_rock', 0.06],
];
// Ekstra tetthet fra structures(): kronetrær, palmer og undervegetasjon
const EXTRA = [
  ['rainforest_tree', 0.15], ['rainforest_treeLight', 0.08], ['rainforest_bloom', 0.02], ['rainforest_palm', 0.1],
  ['rainforest_treefern', 0.09], ['rainforest_fern', 0.2], ['rainforest_bigleaf', 0.2], ['rainforest_banana', 0.1],
  ['rainforest_heliconia', 0.06],
];
// Bratte skråninger: mosekledde steiner, bregner og trebregner
const STEEP = [
  ['rainforest_rock', 0.36], ['rainforest_fern', 0.26], ['rainforest_treefern', 0.2], ['rainforest_bigleaf', 0.1],
  ['rainforest_tree', 0.08],
];

// Kollisjon, dekning, krone og skalering per type
const VEG = {
  rainforest_kapok: { radius: 1.5, cover: 2.6, foliage: { r: 7.6, y0: 15.8, y1: 20 }, height: 19, scale: [0.76, 1.1, 1.2] },
  rainforest_tree: { radius: 0.45, cover: 1.6, foliage: { r: 4.8, y0: 7.2, y1: 13 }, height: 12.5, scale: [0.85, 1.3] },
  rainforest_treeLight: { radius: 0.4, cover: 1.4, foliage: { r: 4.3, y0: 8, y1: 13.8 }, height: 13.4, scale: [0.85, 1.25] },
  rainforest_bloom: { radius: 0.45, cover: 1.6, foliage: { r: 4.8, y0: 7.2, y1: 13 }, height: 12.5, scale: [0.85, 1.25] },
  rainforest_cecropia: { radius: 0.3, cover: 0.9, foliage: { r: 3.2, y0: 8.4, y1: 11 }, height: 10.5, scale: [0.8, 1.25] },
  rainforest_palm: { radius: 0.25, cover: 0.9, foliage: { r: 2.6, y0: 5.6, y1: 8 }, height: 7.6, scale: [0.8, 1.3] },
  rainforest_banana: { radius: 0, cover: 1.6, height: 3.6, scale: [0.8, 1.25] },
  rainforest_bigleaf: { radius: 0, cover: 1.6, height: 1.9, scale: [0.8, 1.5] },
  rainforest_heliconia: { radius: 0, cover: 1.3, height: 2.1, scale: [0.8, 1.3] },
  rainforest_fern: { radius: 0, cover: 1.5, height: 1.4, scale: [0.8, 1.5] },
  rainforest_treefern: { radius: 0.2, cover: 1.3, foliage: { r: 2.5, y0: 2.6, y1: 4.6 }, height: 4.3, scale: [0.8, 1.35] },
  rainforest_shrub: { radius: 0, cover: 1.3, height: 1.1, scale: [0.75, 1.6, 1.3] },
  rainforest_log: { radius: 0, cover: 1.2, sink: 0.12, height: 1.0, scale: [0.85, 1.2] },
  rainforest_rock: { radius: 0.95, cover: 1.6, rock: true },
  rainforest_grass: { radius: 0, cover: 0, decor: true },
  rainforest_fernlet: { radius: 0, cover: 0, decor: true },
  rainforest_sprout: { radius: 0, cover: 0, decor: true },
};

export default {
  key: 'rainforest',
  name: 'Regnskog',
  icon: '🌴',
  surface: 'grass',
  lakeFactor: 1,

  height(x, z, c) {
    const n = c.n;
    // Kupert landskap: avrundede åser, høyere i enkelte områder (1 + 2 støykall)
    const region = smoothstep(-0.5, 0.45, n.mount.noise2D(x * 0.0007 + 41, z * 0.0007 - 13));
    const hill = n.mount.fbm(x * 0.0032 - 7, z * 0.0032 + 3, 2) * 0.5 + 0.5;
    let h = 9 + c.base * 14 + hill * hill * (18 + region * 38) + c.detail * 1.8;
    // Senk terrenget mot innsjøene (worldgen legger dem på etterpå) slik at breddene blir slake (2 støykall –
    // tilnærmer worldgens innsjøstøy med de to første oktavene)
    const lk = n.lake.fbm(x * 0.0032, z * 0.0032, 2) * 0.857;
    const basin = smoothstep(0.1, 0.33, lk);
    if (basin > 0) h = lerp(h, Math.min(h, 3), basin);
    // Elvedaler: nullkonturen til lavfrekvent, litt forvrengt støy blir slyngede elver (3 støykall)
    const warp = n.extra.noise2D(x * 0.0024 + 11, z * 0.0024 - 5) * 0.07;
    const rv = Math.abs(n.extra.fbm(x * 0.0008 - 19, z * 0.0008 + 27, 2) + warp);
    const valley = 1 - smoothstep(0.035, 0.24, rv);
    if (valley > 0) {
      // Flat, gjørmete dalbunn som stiger mot åssidene
      h = lerp(h, Math.min(h, 1.6 + rv * 14), valley);
      const bed = 1 - smoothstep(0.012, 0.042, rv);
      if (bed > 0) h = lerp(h, -2.6, bed);
    }
    return h;
  },

  color(c, out) {
    const { h, v, v2, steep } = c;
    // Dyp grønn skogbunn (mose og småplanter)
    let r = lerp(0.13, 0.19, v2), g = lerp(0.25, 0.33, v2), b = lerp(0.08, 0.11, v2);
    // Store partier med brunt løvstrø
    const litter = smoothstep(0.32, 0.7, v) * 0.75;
    r = lerp(r, 0.3, litter); g = lerp(g, 0.26, litter); b = lerp(b, 0.14, litter);
    // Små, mørke gjørmeflekker
    const mud = smoothstep(0.66, 0.86, v2) * 0.85;
    r = lerp(r, 0.29, mud); g = lerp(g, 0.22, mud); b = lerp(b, 0.13, mud);
    // Bratte skråninger: rødbrun leire og mosegrodd berg
    if (steep > 0) {
      const clay = smoothstep(0.35, 0.65, v2);
      const sr = lerp(0.3, 0.46, clay), sg = lerp(0.36, 0.28, clay), sb = lerp(0.22, 0.18, clay);
      r = lerp(r, sr, steep); g = lerp(g, sg, steep); b = lerp(b, sb, steep);
    }
    // Høye åsrygger får litt lysere, solbelyst grønt
    const top = smoothstep(38, 60, h) * (1 - steep) * 0.6;
    r = lerp(r, 0.26, top); g = lerp(g, 0.44, top); b = lerp(b, 0.16, top);
    // Gjørmete elvebredder (våt og mørk helt nede ved vannet)
    const bank = 1 - smoothstep(0.6, 2.6, h);
    const wet = 1 - smoothstep(-0.2, 0.9, h);
    r = lerp(r, lerp(0.36, 0.25, wet), bank); g = lerp(g, lerp(0.29, 0.21, wet), bank); b = lerp(b, lerp(0.18, 0.13, wet), bank);
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  mapColor(h, x, z, out) {
    let r = 40, g = 98, b = 44;
    if (h > 30) { const k = smoothstep(30, 60, h); r = lerp(r, 62, k); g = lerp(g, 118, k); b = lerp(b, 56, k); }
    if (h < 2.2) { const k = 1 - smoothstep(0.4, 2.2, h); r = lerp(r, 112, k); g = lerp(g, 94, k); b = lerp(b, 64, k); }
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  mapWater: [[84, 150, 128], [32, 88, 110]],

  /** Velg vegetasjon for et kandidatpunkt på land. Tettheten varierer med støy: tette partier og lysninger. */
  pick(p, r2, r3) {
    const { h, ny } = p;
    const d = p.gen.noise.detail.noise2D(p.x * 0.006 + 311, p.z * 0.006 - 173);
    if (r2 > 0.93 + d * 0.05) return null;
    if (ny < 0.7) return pickByTable(r3, STEEP);
    if (h < 2.4) return pickByTable(r3, SHORE);
    // Kjempetrærne står tettest der skogen er tett
    if (d > 0.3 && r2 < 0.07) return 'rainforest_kapok';
    let t = d < -0.35 && r2 < 0.5 ? pickByTable(r3, GAP) : pickByTable(r3, TABLE);
    // Lange stokker bare på flatt underlag (ellers svever endene)
    if (t === 'rainforest_log' && ny < 0.93) t = 'rainforest_fern';
    return t;
  },

  /**
   * Ekstra vegetasjon per terrengbit (den tilfeldige vegetasjonen har bare 100 kandidater per bit, som er for glissent
   * for en regnskog). Bruker bitens egen, deterministiske rng og hopper over vann, bratt terreng og lysninger.
   */
  structures(api) {
    const { x0, z0, size, gen, rng } = api;
    const m = size / 2;
    if (Math.max(api.weightAt(x0 + m, z0 + m), api.weightAt(x0, z0), api.weightAt(x0 + size, z0),
      api.weightAt(x0, z0 + size), api.weightAt(x0 + size, z0 + size)) < 0.02) return;
    const dn = gen.noise.detail;
    for (let i = 0; i < 48; i++) {
      const x = x0 + rng() * size, z = z0 + rng() * size;
      const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();
      if (api.weightAt(x, z) < 0.55 + r1 * 0.45) continue;
      const h = gen.groundHeight(x, z);
      if (h < 0.7 || gen.slopeAt(x, z) < 0.72) continue;
      const d = dn.noise2D(x * 0.006 + 311, z * 0.006 - 173);
      if (r1 > 0.8 + d * 0.2) continue;
      const t = pickByTable(r2, h < 2.4 || d < -0.3 ? GAP : EXTRA);
      const [a, b, pw = 1] = VEG[t].scale;
      api.emit(t, x, z, a + (b - a) * Math.pow(r3, pw), r4 * Math.PI * 2, h - 0.15);
    }
    // Tett buskas i undervegetasjonen (billig modell, mange eksemplarer)
    const [sa, sb, sp] = VEG.rainforest_shrub.scale;
    for (let i = 0; i < 90; i++) {
      const x = x0 + rng() * size, z = z0 + rng() * size;
      const r1 = rng(), r3 = rng(), r4 = rng();
      if (api.weightAt(x, z) < 0.55 + r1 * 0.45) continue;
      const h = gen.groundHeight(x, z);
      if (h < 0.5 || gen.slopeAt(x, z) < 0.6) continue;
      // Tettest der skogen er tett, glissent oppe på åsryggene
      const d = dn.noise2D(x * 0.006 + 311, z * 0.006 - 173);
      if (r1 > 0.75 + d * 0.25 - smoothstep(40, 70, h) * 0.4) continue;
      api.emit('rainforest_shrub', x, z, sa + (sb - sa) * Math.pow(r3, sp), r4 * Math.PI * 2, h - 0.1);
    }
  },

  /** Grunt vann langs breddene: storbladplanter (taro) som står i vannet. */
  pickWater(p, r2) {
    if (p.depth > 0.6 || r2 > 0.3) return null;
    return 'rainforest_bigleaf';
  },

  /** Pynt: tett gress, småbregner og blader i flere nyanser – uten kollisjon. */
  decor(p, r1, r2) {
    if (p.h < 0.6 || p.h > 80) return null;
    if (p.w < 0.5 + r1 * 0.45) return null;
    return r2 < 0.32 ? 'rainforest_fernlet' : r2 < 0.58 ? 'rainforest_sprout' : 'rainforest_grass';
  },

  vegInfo: VEG,

  fauna: {
    predators: [['jaguar', 0.6], ['boar', 0.4]],
    aquatic: 'crocodile',
    friendly: ['tapir', 'capybara', 'parrot'],
    caged: ['parrot', 'parrot', 'tapir'],
  },
  camp: { style: 'tent' },
  spawn: { minH: 3, maxH: 18, dry: 1.2 },
  ambient: { wind: 0.02, birds: 'many', insects: true },
  atmosphere: { fog: 0xb7cbb3, water: 0x3d6b55, sky: 0x5b93bd, fogScale: 0.7 },
};
