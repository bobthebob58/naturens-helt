// Biom: Savanne (bane 3, midten – spilleren starter her).
// Afrikansk savanne: vide, slake sletter med gyllent tørt gress, rødbrune jordflekker og dyretråkk, spredte
// paraplyakasier og baobab-trær, termittuer, kopjer (granitthauger med store avrundede steiner) og grumsete
// vannhull. Ren datamodul – ingen Three.js – slik at terrenget kan testes i Node. Se README i js/levels/.
import { lerp, smoothstep } from '../../utils/math.js';
import { pickByTable } from './forest.js';

// ---------- Delte støyfelt (brukes likt i høyde, farge, vegetasjon og pynt) ----------

/** Kopje-styrke 0..1. Kopjene ligger i grupper der den lavfrekvente støyen er høy. */
function kopjeAt(n, x, z) {
  const v = n.extra.noise2D(x * 0.0052 + 71.3, z * 0.0052 - 33.7) + n.extra.noise2D(x * 0.0011 - 12.9, z * 0.0011 + 48.1) * 0.4;
  return smoothstep(0.97, 1.22, v);
}

/** Dyretråkk/stier: slyngede linjer der støyen krysser null. 1 midt på stien, 0 utenfor. */
function pathAt(n, x, z) {
  const v = n.extra.noise2D(x * 0.0019 - 140.2, z * 0.0019 + 57.9);
  return 1 - smoothstep(0.015, 0.03, Math.abs(v));
}

/** Tetthet av akasieskog: −1 = åpen gresslette, 1 = tett akasieskog. */
function woodsAt(n, x, z) {
  return n.detail.noise2D(x * 0.0021 + 211.7, z * 0.0021 - 97.3);
}

/** Store, åpne flater med rødbrun jord (lavfrekvent) – 0..1. */
function bareAt(n, x, z) {
  return smoothstep(0.6, 0.9, n.color.noise2D(x * 0.0055 - 31.4, z * 0.0055 + 77.2));
}

// ---------- Vegetasjonstabeller (sum = 1) ----------

// Åpen gresslette: høye gresstuer, busker, termittuer og en og annen akasie
const PLAINS = [
  ['savanna_grassClump', 0.27], ['savanna_bush', 0.13], ['savanna_thornbush', 0.14], ['savanna_acacia', 0.14],
  ['savanna_acaciaWide', 0.07], ['savanna_termite', 0.14], ['savanna_deadTree', 0.04], ['savanna_boulder', 0.07],
];
// Akasieskog (tettere trær og busker)
const WOODS = [
  ['savanna_acacia', 0.3], ['savanna_acaciaWide', 0.17], ['savanna_bush', 0.2], ['savanna_thornbush', 0.12],
  ['savanna_termite', 0.07], ['savanna_grassClump', 0.08], ['savanna_deadTree', 0.03], ['savanna_euphorbia', 0.03],
];
// Kopjer: steinblokker, kandelabertrær og busker i sprekkene
const KOPJE = [
  ['savanna_kopje', 0.3], ['savanna_boulder', 0.38], ['savanna_euphorbia', 0.12], ['savanna_bush', 0.1],
  ['savanna_thornbush', 0.06], ['savanna_acacia', 0.04],
];
// Rundt vannhullene: grønnere busker og enkelte akasier
const SHORE = [
  ['savanna_bush', 0.42], ['savanna_acacia', 0.18], ['savanna_acaciaWide', 0.1], ['savanna_grassClump', 0.2],
  ['savanna_deadTree', 0.1],
];

// Kollisjon, dekning, krone og skalering per type
const VEG = {
  savanna_acacia: { radius: 0.3, cover: 1.0, foliage: { r: 3.8, y0: 4.7, y1: 6.6 }, height: 6.5, scale: [0.8, 1.25] },
  savanna_acaciaWide: { radius: 0.32, cover: 1.0, foliage: { r: 4.6, y0: 3.7, y1: 5.4 }, height: 5.3, scale: [0.8, 1.2] },
  savanna_baobab: { radius: 1.5, cover: 2.4, foliage: { r: 4.6, y0: 7.0, y1: 11 }, height: 10.5, scale: [0.85, 1.25] },
  savanna_deadTree: { radius: 0.25, cover: 0.6, height: 5.2, scale: [0.8, 1.2] },
  savanna_euphorbia: { radius: 0.3, cover: 1.1, foliage: { r: 1.9, y0: 2.0, y1: 5.2 }, height: 5.0, scale: [0.75, 1.2] },
  savanna_termite: { radius: 0.75, cover: 1.1, height: 2.9, sink: 0.12, scale: [0.7, 1.35, 1.5] },
  savanna_bush: { radius: 0, cover: 1.5, height: 1.4, scale: [0.8, 1.45] },
  savanna_thornbush: { radius: 0, cover: 1.1, height: 1.5, scale: [0.8, 1.35] },
  savanna_grassClump: { radius: 0, cover: 1.3, height: 1.7, sink: 0.05, scale: [0.8, 1.3] },
  savanna_boulder: { radius: 0.95, cover: 1.6, rock: true },
  savanna_kopje: { radius: 2.5, cover: 3.2, height: 4.6, sink: 0.35, scale: [0.75, 1.45, 1.3] },
  savanna_tallgrass: { radius: 0, cover: 0, decor: true },
  savanna_shortgrass: { radius: 0, cover: 0, decor: true },
  savanna_greengrass: { radius: 0, cover: 0, decor: true },
};

export default {
  key: 'savanna',
  name: 'Savanne',
  icon: '🦁',
  surface: 'grass',
  lakeFactor: 0,

  height(x, z, c) {
    const n = c.n;
    // Vide sletter: lav grunnhøyde med lange, svake bølger (1 støykall)
    const swell = n.mount.noise2D(x * 0.0042 + 13.1, z * 0.0042 - 7.7);
    let h = 8.5 + c.base * 7 + swell * 1.8 + c.detail * 0.45;
    // Kopjer: avrundede granitthauger som stiger opp av sletta (2–3 støykall)
    const k = kopjeAt(n, x, z);
    if (k > 0) {
      const lump = n.extra.noise2D(x * 0.031 + 9.4, z * 0.031 - 3.2);
      h += k * k * (9 + lump * 2.5) + k * lump * 1.2;
    }
    // Vannhull: egne, grunne vannhull med slake gjørmebredder (lakeFactor = 0, så worldgen legger ikke på egne
    // innsjøer her). Samme innsjøstøy som worldgen, slik at vannet henger sammen med nabobiomenes innsjøer (3 støykall).
    const lk = n.lake.fbm(x * 0.0032, z * 0.0032, 3);
    const basin = smoothstep(0.4, 0.565, lk);
    if (basin > 0) h = lerp(h, Math.min(h, lerp(2.2, -2.6, smoothstep(0.545, 0.67, lk))), basin);
    return h;
  },

  color(c, out) {
    const { x, z, h, v, v2, steep, n } = c;
    // Gyllent, tørt gress – fra lys halm til dyp oker
    let r = lerp(0.86, 0.73, v), g = lerp(0.74, 0.58, v), b = lerp(0.46, 0.32, v);
    // Store partier med litt friskere, olivenbrunt gress
    const olive = smoothstep(0.1, 0.65, n.color.noise2D(x * 0.0032 + 50.3, z * 0.0032 - 20.8)) * 0.55;
    r = lerp(r, 0.62, olive); g = lerp(g, 0.58, olive); b = lerp(b, 0.3, olive);
    // Rødbrun jord: store åpne flater og små flekker
    const soil = Math.min(1, bareAt(n, x, z) * 0.72 + smoothstep(0.76, 0.92, v2) * 0.5);
    r = lerp(r, lerp(0.66, 0.58, v2), soil); g = lerp(g, lerp(0.4, 0.33, v2), soil); b = lerp(b, lerp(0.24, 0.2, v2), soil);
    // Dyretråkk (nedtrampet, rødbrun jord)
    const k = kopjeAt(n, x, z);
    const path = pathAt(n, x, z) * (1 - k) * 0.9;
    r = lerp(r, 0.62, path); g = lerp(g, 0.39, path); b = lerp(b, 0.25, path);
    // Granitt på kopjene og i bratte skråninger (rosagrå med mørkere partier)
    const rock = Math.max(steep, smoothstep(0.35, 0.75, k));
    if (rock > 0) {
      const lich = smoothstep(0.3, 0.7, v2);
      r = lerp(r, lerp(0.62, 0.52, lich), rock); g = lerp(g, lerp(0.56, 0.49, lich), rock); b = lerp(b, lerp(0.5, 0.44, lich), rock);
    }
    // Vannhull: grønnere gress på breddene og våt, mørk gjørme helt nede ved vannet
    const green = (1 - smoothstep(1.7, 3.4, h)) * (1 - rock);
    r = lerp(r, 0.44, green * 0.8); g = lerp(g, 0.5, green * 0.8); b = lerp(b, 0.24, green * 0.8);
    const mud = 1 - smoothstep(0.5, 1.9, h);
    const wet = 1 - smoothstep(-0.2, 0.8, h);
    r = lerp(r, lerp(0.5, 0.33, wet), mud); g = lerp(g, lerp(0.4, 0.27, wet), mud); b = lerp(b, lerp(0.27, 0.19, wet), mud);
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  mapColor(h, x, z, out) {
    let r = 206, g = 172, b = 98;
    if (h < 3.2) { const k = 1 - smoothstep(1.6, 3.2, h); r = lerp(r, 130, k); g = lerp(g, 140, k); b = lerp(b, 72, k); }
    if (h < 1.6) { const k = 1 - smoothstep(0.2, 1.6, h); r = lerp(r, 128, k); g = lerp(g, 100, k); b = lerp(b, 66, k); }
    if (h > 17) { const k = smoothstep(17, 24, h); r = lerp(r, 160, k); g = lerp(g, 146, k); b = lerp(b, 132, k); }
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  mapWater: [[106, 122, 86], [36, 86, 122]],

  /** Velg vegetasjon for et kandidatpunkt på land. Åpne sletter, akasieskog, kopjer og vannhull. */
  pick(p, r2, r3) {
    const { h, ny, x, z } = p;
    const n = p.gen.noise;
    // Kopjer: steinblokker og kandelabertrær
    const k = kopjeAt(n, x, z);
    if (k > 0.12) {
      if (r2 > 0.3 + k * 0.5) return null;
      return pickByTable(r3, KOPJE);
    }
    if (ny < 0.8) return r2 < 0.3 ? 'savanna_boulder' : null;
    // Dyretråkkene holdes åpne
    if (pathAt(n, x, z) > 0.2) return null;
    // Rundt vannhullene
    if (h < 2.6) {
      if (h < 0.9 || r2 > 0.3) return null;
      return pickByTable(r3, SHORE);
    }
    // Tettheten varierer fra åpen slette til akasieskog; nesten ingenting på de store jordflatene
    const wd = woodsAt(n, x, z);
    const bare = bareAt(n, x, z);
    const dens = (0.14 + smoothstep(-0.1, 0.7, wd) * 0.36) * (1 - bare * 0.7);
    if (r2 > dens) return null;
    // Sjeldne, store baobab-trær (landemerker)
    if (r2 < 0.0045) return 'savanna_baobab';
    return pickByTable(r3, wd > 0.28 ? WOODS : PLAINS);
  },

  /** Pynt: høyt, gyllent gress over det meste av sletta, kort tørt gress på jord og stein, grønt gress ved vann. */
  decor(p, r1, r2) {
    const { h, x, z } = p;
    if (h < 0.6) return null;
    if (p.w < 0.45 + r1 * 0.5) return null;
    if (h < 2.3) return h > 0.9 && r2 < 0.85 ? 'savanna_greengrass' : null;
    const n = p.gen.noise;
    const k = kopjeAt(n, x, z);
    if (k > 0.3) return r2 < 0.25 ? 'savanna_shortgrass' : null;
    if (pathAt(n, x, z) > 0.3) return r2 < 0.12 ? 'savanna_shortgrass' : null;
    const bare = bareAt(n, x, z);
    if (bare > 0.5) return r2 < 0.35 ? 'savanna_shortgrass' : null;
    if (h < 3.4 && r2 < 0.25) return 'savanna_greengrass';
    return r2 < 0.8 - bare * 0.5 ? 'savanna_tallgrass' : 'savanna_shortgrass';
  },

  vegInfo: VEG,

  fauna: {
    predators: [['lion', 0.55], ['hyena', 0.45]],
    aquatic: 'crocodile',
    friendly: ['elephant', 'giraffe', 'zebra', 'rhino'],
    caged: ['rhino', 'zebra'],
  },
  camp: { style: 'tent' },
  spawn: { minH: 3, maxH: 18, dry: 1.2 },
  ambient: { wind: 0.05, insects: true, birds: true },
  atmosphere: { fog: 0xe6d6b2, water: 0x5b6f4a, sky: 0x4f8fd6, fogScale: 0.95 },
};
