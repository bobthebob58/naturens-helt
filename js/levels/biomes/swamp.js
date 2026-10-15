// Biom: Sump (bane 2, sør).
// Flatt våtmarksland like rundt vannflaten: et nett av grunne, vadbare kanaler og dammer, noen dypere kanaler
// der båten kommer fram, gjørmete tuer og tørre øyer/rygger der krypskytterne kan slå leir.
// Ren datamodul – ingen Three.js – slik at terrenget kan testes i Node. Se README i js/levels/ for alle felt.
import { lerp, smoothstep } from '../../utils/math.js';
import { pickByTable } from './forest.js';

// Vannkanten (bakken ligger rett under eller rett over vannflaten): sivbelter og trær med føttene i vannet (sum = 1)
const EDGE = [
  ['swamp_reeds', 0.26], ['swamp_cattail', 0.2], ['swamp_mangrove', 0.2], ['swamp_cypress', 0.1],
  ['swamp_tussock', 0.1], ['swamp_snag', 0.06], ['swamp_stump', 0.04], ['swamp_deadTree', 0.04],
];
// Våt gjørme like over vannflaten: tuer, siv, mangrover, sypresser og døde trær
const WET = [
  ['swamp_reeds', 0.14], ['swamp_cattail', 0.08], ['swamp_tussock', 0.14], ['swamp_mangrove', 0.14],
  ['swamp_cypress', 0.16], ['swamp_deadTree', 0.06], ['swamp_snag', 0.03], ['swamp_stump', 0.06],
  ['swamp_log', 0.05], ['swamp_bush', 0.14],
];
// Fuktig overgang mot øyene: sumpsypresser, busker og mangrover
const MID = [
  ['swamp_cypress', 0.3], ['swamp_bush', 0.2], ['swamp_mangrove', 0.1], ['palm', 0.06], ['swamp_deadTree', 0.07],
  ['swamp_stump', 0.06], ['swamp_log', 0.07], ['swamp_tussock', 0.06], ['swamp_reeds', 0.08],
];
// Tørre øyer og rygger: høye sypresser, busker, palmer og døde trær
const DRY = [
  ['swamp_cypress', 0.36], ['swamp_bush', 0.26], ['palm', 0.1], ['swamp_deadTree', 0.06], ['swamp_log', 0.08],
  ['swamp_stump', 0.06], ['swamp_mangrove', 0.04], ['swamp_reeds', 0.04],
];
// Grunt vann (vadbart): vannliljer, siv og dunkjevle, og trær som står ute i vannet
const SHALLOW = [
  ['swamp_lily', 0.26], ['swamp_duckweed', 0.06], ['swamp_reeds', 0.17], ['swamp_cattail', 0.16], ['swamp_mangrove', 0.1],
  ['swamp_cypress', 0.08], ['swamp_tussock', 0.09], ['swamp_snag', 0.05], ['swamp_stump', 0.03],
];
// Tette treøyer («hammocks») på de tørre øyene – ekstra trær fra structures()
const HAMMOCK = [['swamp_cypress', 0.48], ['swamp_bush', 0.28], ['palm', 0.12], ['swamp_deadTree', 0.06], ['swamp_mangrove', 0.06]];
// Sumpskog i vannkanten – ekstra trær fra structures()
const FOREST = [['swamp_cypress', 0.46], ['swamp_mangrove', 0.38], ['swamp_snag', 0.08], ['swamp_deadTree', 0.08]];

/** Tetthetsstøy: > 0 = sumpskog/kratt, < 0 = åpen myr med siv og vannliljer. */
const density = (gen, x, z) => gen.noise.detail.noise2D(x * 0.007 - 211, z * 0.007 + 97);

// Kollisjon, dekning, krone og skalering per type
const VEG = {
  swamp_mangrove: { radius: 0.7, cover: 1.8, foliage: { r: 3.3, y0: 3.6, y1: 7.2 }, height: 7, scale: [0.8, 1.25] },
  swamp_cypress: { radius: 0.6, cover: 1.6, foliage: { r: 4.2, y0: 7.2, y1: 14.5 }, height: 14.5, scale: [0.75, 1.2] },
  swamp_deadTree: { radius: 0.35, cover: 0.9, height: 8.5, scale: [0.75, 1.25] },
  swamp_snag: { radius: 0.4, cover: 0.9, height: 4.6, scale: [0.8, 1.3] },
  swamp_stump: { radius: 0.45, cover: 1.0, height: 1.3, scale: [0.8, 1.3] },
  swamp_log: { radius: 0, cover: 1.0, sink: 0.14, height: 0.7, scale: [0.8, 1.2] },
  swamp_bush: { radius: 0, cover: 1.6, height: 1.6, scale: [0.8, 1.4] },
  swamp_reeds: { radius: 0, cover: 1.2, height: 2.6, scale: [0.8, 1.3] },
  swamp_cattail: { radius: 0, cover: 1.1, height: 2.2, scale: [0.8, 1.25] },
  swamp_tussock: { near: true, radius: 0, cover: 0.8, sink: 0.12, height: 0.9, scale: [0.75, 1.4] },
  swamp_lily: { radius: 0, cover: 0, float: true, noShadow: true, height: 0.2, scale: [0.8, 1.6] },
  swamp_duckweed: { near: true, radius: 0, cover: 0, float: true, noShadow: true, height: 0.05, scale: [0.8, 2.0] },
  palm: { radius: 0.3, cover: 0, foliage: { r: 2.3, y0: 6.0, y1: 8.8 } },
  swamp_grass: { radius: 0, cover: 0, decor: true },
  swamp_sedge: { radius: 0, cover: 0, decor: true },
  swamp_flowers: { radius: 0, cover: 0, decor: true },
};

export default {
  key: 'swamp',
  name: 'Sump',
  icon: '🐊',
  surface: 'mud',
  lakeFactor: 0.3,

  height(x, z, c) {
    const n = c.n;
    // Tørre øyer og rygger (lavfrekvent, 2 støykall)
    const isl = n.mount.fbm(x * 0.0042 + 17.3, z * 0.0042 - 9.1, 2) + c.base * 0.35;
    const dry = smoothstep(0.2, 0.42, isl);
    // Flatt sumpland like rundt vannflaten med søkk (dammer) og gjørmete tuer (1 støykall)
    const tuft = n.color.noise2D(x * 0.05 + 77, z * 0.05 - 41);
    let h = 0.3 + c.detail * 1.1 + c.base * 0.5 + tuft * 0.22;
    // Øyplatå 1,5–3,7 m (flatt nok til leirer)
    if (dry > 0) {
      const top = 1.5 + smoothstep(0.42, 0.8, isl) * 2.2 + c.detail * 0.5 + tuft * 0.18;
      h = lerp(h, top, dry);
    }
    // Grunne, vadbare kanaler: nullkonturen til lett forvrengt støy blir et nett av slyngede løp (2 støykall)
    const cv = Math.abs(n.extra.fbm(x * 0.0038 - 31, z * 0.0038 + 12, 2) + c.detail * 0.05);
    const chan = (1 - smoothstep(0.045, 0.12, cv)) * (1 - dry * 0.9);
    if (chan > 0) h = lerp(h, Math.min(h, -0.85 + c.detail * 0.5), chan);
    // Dype kanaler (2–3 m) der båten kommer fram (1 støykall)
    const dv = Math.abs(n.lake.noise2D(x * 0.0011 + 53, z * 0.0011 - 71) + c.base * 0.2);
    const deep = (1 - smoothstep(0.018, 0.06, dv)) * (1 - dry * 0.6);
    if (deep > 0) h = lerp(h, Math.min(h, -2.7), deep);
    return h;
  },

  color(c, out) {
    const { h, v, v2, steep } = c;
    // Mørk, mosegrønn sumpbunn som veksler med olivenbrun starr (lavfrekvent) …
    let r = lerp(0.2, 0.33, v), g = lerp(0.26, 0.31, v), b = lerp(0.1, 0.15, v);
    // … og gulnet, vissent starr i enkelte partier
    const sedge = smoothstep(0.62, 0.85, v) * 0.7;
    r = lerp(r, 0.42, sedge); g = lerp(g, 0.39, sedge); b = lerp(b, 0.2, sedge);
    // Brune gjørmeflekker og pytter (høyfrekvent)
    const mud = smoothstep(0.5, 0.72, v2) * 0.85;
    r = lerp(r, 0.29, mud); g = lerp(g, 0.23, mud); b = lerp(b, 0.14, mud);
    // Tørre øyer: litt friskere grønt, men fortsatt mørkt og flekkete
    const dry = smoothstep(1.2, 2.4, h) * (0.55 - mud * 0.4);
    r = lerp(r, 0.25, dry); g = lerp(g, 0.33, dry); b = lerp(b, 0.12, dry);
    // Bratte kanter: mørk torv
    r = lerp(r, 0.24, steep); g = lerp(g, 0.2, steep); b = lerp(b, 0.13, steep);
    // Våt, nesten svart gjørme langs vannkanten og under vann
    const wet = 1 - smoothstep(-0.1, 0.6, h);
    r = lerp(r, 0.19, wet); g = lerp(g, 0.17, wet); b = lerp(b, 0.1, wet);
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  mapColor(h, x, z, out) {
    let r = 112, g = 106, b = 66;
    const k = smoothstep(0.9, 2.2, h);
    r = lerp(r, 84, k); g = lerp(g, 116, k); b = lerp(b, 58, k);
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  mapWater: [[74, 110, 92], [36, 62, 58]],

  /** Vegetasjon på land: tettheten varierer med støy (tette kratt og åpne myrer). */
  pick(p, r2, r3) {
    const { h, ny } = p;
    const d = density(p.gen, p.x, p.z);
    if (r2 > 0.8 + d * 0.15) return null;
    if (ny < 0.75) return r3 < 0.5 ? 'swamp_bush' : r3 < 0.75 ? 'swamp_stump' : null;
    let t;
    if (h < 0.6) t = pickByTable(r3, EDGE);
    else if (h < 1.0) t = pickByTable(r3, WET);
    else if (h < 1.7) t = pickByTable(r3, MID);
    else t = pickByTable(r3, DRY);
    // Lange stokker bare på flatt underlag (ellers svever endene)
    if (t === 'swamp_log' && ny < 0.95) t = 'swamp_stump';
    return t;
  },

  /** Under/ved vannflaten: siv og dunkjevle i grunt vann, vannliljer som flyter, trær som står i vannet. */
  pickWater(p, r2, r3) {
    const d = p.depth;
    if (d < 0.2) return r2 > 0.85 ? null : pickByTable(r3, EDGE);
    if (d < 0.75) return r2 > 0.8 ? null : pickByTable(r3, SHALLOW);
    if (d < 1.6) {
      if (r2 > 0.45) return null;
      return r3 < 0.5 ? 'swamp_lily' : r3 < 0.8 ? 'swamp_duckweed' : r3 < 0.9 ? 'swamp_snag' : 'swamp_cypress';
    }
    return r2 > 0.2 ? null : r3 < 0.6 ? 'swamp_lily' : 'swamp_duckweed';
  },

  /**
   * Klynger: tette treøyer på de tørre øyene, sumpskog med føttene i vannet, sivbelter langs vannkanten og flak av
   * vannliljer. Gir sumpen struktur i stedet for jevnt drysset vegetasjon. Bruker bitens egen, deterministiske rng.
   */
  structures(api) {
    const { x0, z0, size, gen, rng } = api;
    const m = size / 2;
    if (Math.max(api.weightAt(x0 + m, z0 + m), api.weightAt(x0, z0), api.weightAt(x0 + size, z0),
      api.weightAt(x0, z0 + size), api.weightAt(x0 + size, z0 + size)) < 0.02) return;
    const TAU = Math.PI * 2;
    // Trær
    for (let i = 0; i < 48; i++) {
      const x = x0 + rng() * size, z = z0 + rng() * size;
      const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();
      if (api.weightAt(x, z) < 0.55 + r1 * 0.45) continue;
      const h = gen.groundHeight(x, z);
      const d = density(gen, x, z);
      let t = null;
      if (h > 1.1) {
        if (r2 > 0.55 + d * 0.3) continue;
        t = pickByTable(r3, HAMMOCK);
      } else if (h > -0.7 && h < 0.9 && d > 0.05) {
        if (r2 > 0.2 + d * 0.5) continue;
        t = pickByTable(r3, FOREST);
      } else continue;
      if (gen.slopeAt(x, z) < 0.75) continue;
      const sc = VEG[t].scale || [0.75, 1.35];
      api.emit(t, x, z, sc[0] + (sc[1] - sc[0]) * r4, r1 * TAU, h - 0.15);
    }
    // Sivbelter, vannliljer og flak av andemat
    for (let i = 0; i < 12; i++) {
      const cx = x0 + rng() * size, cz = z0 + rng() * size;
      const r1 = rng(), r2 = rng();
      if (api.weightAt(cx, cz) < 0.5 + r1 * 0.5) continue;
      const h = gen.groundHeight(cx, cz);
      if (h > 0.7 || h < -2.2) continue;
      const lilies = h < -0.45;
      // Omtrent hvert tredje vannflak er andemat i stedet for vannliljer
      const weed = lilies && r1 > 0.62;
      const count = weed ? 3 + Math.floor(r2 * 3) : 4 + Math.floor(r2 * 6);
      for (let k = 0; k < count; k++) {
        const a = rng() * TAU, rr = 1 + rng() * 6;
        const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        const r3 = rng(), r4 = rng(), r5 = rng();
        const gh = gen.groundHeight(x, z);
        if (weed) {
          if (gh > -0.25) continue;
          api.emit('swamp_duckweed', x, z, 0.8 + r3 * 1.2, r4 * TAU, 0.045 + k * 0.004);
        } else if (lilies) {
          if (gh > -0.3) continue;
          api.emit('swamp_lily', x, z, 0.8 + r3 * 0.8, r4 * TAU, 0.045);
        } else {
          if (gh > 0.8 || gh < -0.9) continue;
          const t = r5 < 0.55 ? 'swamp_reeds' : r5 < 0.9 ? 'swamp_cattail' : 'swamp_tussock';
          const [sa, sb] = VEG[t].scale;
          // emit trekker selv fra typens sink – de andre senkes litt ned i gjørma
          api.emit(t, x, z, sa + (sb - sa) * r3, r4 * TAU, VEG[t].sink != null ? gh : gh - 0.12);
        }
      }
    }
  },

  /** Pynt: sumpgress, starr og noen blomster – uten kollisjon. */
  decor(p, r1, r2) {
    if (p.h < 0.5 || p.h > 12) return null;
    if (p.w < 0.5 + r1 * 0.45) return null;
    return r2 < 0.08 ? 'swamp_flowers' : r2 < 0.38 ? 'swamp_sedge' : 'swamp_grass';
  },

  vegInfo: VEG,

  fauna: {
    predators: [['boar', 1]],
    aquatic: 'crocodile',
    friendly: ['capybara', 'turtle'],
    caged: ['turtle', 'capybara', 'parrot'],
  },
  camp: { style: 'tent', minH: 1.0, maxH: 10, dryRadius: 8, dryH: 0.3, slope: 0.9 },
  ambient: { wind: 0.015, birds: true, insects: true, frogs: true },
  atmosphere: { fog: 0x9aa58a, water: 0x4b5530, sky: 0x6f8fa8, fogScale: 0.5 },
};
