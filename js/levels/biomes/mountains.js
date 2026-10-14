// Biom: Fjellandskap (bane 3, nord).
// Alpint fjellandskap: dramatiske tinder på 100–150 m med snø, bratte klipper og ur, grønne daler og fjellvidder,
// klare fjellvann og barskog i de lavere liene. Mot savannen i sør går fjellene over i lave, skogkledde åser.
// Ren datamodul – ingen Three.js – slik at terrenget kan testes i Node. Se README i js/levels/.
import { lerp, smoothstep } from '../../utils/math.js';
import { pickByTable } from './forest.js';

const HALF = 2048; // halve verdensbredden (WORLD.size / 2) – brukes når c.half ikke finnes
const SNOW = 85; // snøgrense (m)
const LAKE = 0.8; // lakeFactor – fjellvann i dalene

// ---------- Delte støyfelt (brukes likt i høyde, farge og vegetasjon) ----------

/**
 * Hvor langt inn i fjellheimen punktet ligger: 0 ved foten (mot savannen), 1 langt inne blant tindene.
 * Tilnærmer worldgen.temperature() med én støyoktav, slik at foten følger biomgrensen. 1 støykall.
 */
function innerAt(n, x, z, half = HALF) {
  const d = Math.sqrt(x * x + z * z);
  const amt = 0.16 + 0.34 * smoothstep(150, 900, d);
  const t = (z / half) * 1.05 + n.temp.noise2D(x * 0.0007, z * 0.0007) * 0.571 * amt;
  return smoothstep(-0.36, -0.66, t);
}

/** Fjellmassiv (0..1): store fjellpartier der grunnstøyen og en egen lavfrekvent støy er høy. 1 støykall. */
function massAt(n, x, z, base) {
  return smoothstep(-0.34, 0.26, base * 0.9 + n.mount.noise2D(x * 0.0012 + 41.7, z * 0.0012 - 18.3) * 0.55);
}

/** Fjellvidde (0..1): slake høyplatåer der denne støyen er høy. 1 støykall. */
function plateauAt(n, x, z) {
  return smoothstep(0.1, 0.5, n.extra.noise2D(x * 0.0017 - 63.1, z * 0.0017 + 27.4));
}

/** Skogtetthet i liene: −1 = åpen mark, 1 = tett barskog. 1 støykall. */
function forestAt(n, x, z) {
  return n.detail.noise2D(x * 0.0042 + 151.3, z * 0.0042 - 88.6);
}

// ---------- Vegetasjonstabeller (sum = 1) ----------

// Dalbunn og eng: åpen mark med fjellbjørk, dvergbjørk, kampesteiner og enkelte grantrær
const MEADOW = [
  ['mountains_birch', 0.24], ['mountains_dwarfBirch', 0.3], ['mountains_boulder', 0.17], ['pine', 0.14],
  ['mountains_juniper', 0.15],
];
// Barskog i liene
const FOREST = [
  ['pine', 0.62], ['mountains_birch', 0.12], ['mountains_juniper', 0.1], ['mountains_boulder', 0.08],
  ['mountains_dwarfBirch', 0.08],
];
// Rundt tregrensen: glissen skog med snøtunge grantrær og krokete fjellbjørk
const TREELINE = [
  ['snowPine', 0.3], ['mountains_birch', 0.24], ['mountains_dwarfBirch', 0.22], ['mountains_boulder', 0.12],
  ['mountains_juniper', 0.12],
];
// Snaufjell: lyng, dvergbjørk, ur og steinblokker
const ALPINE = [
  ['mountains_dwarfBirch', 0.32], ['mountains_boulder', 0.26], ['mountains_scree', 0.24], ['mountains_juniper', 0.12],
  ['mountains_cairn', 0.06],
];
// Bratt terreng: fjellnabber og ur
const STEEP = [['mountains_crag', 0.45], ['mountains_scree', 0.4], ['mountains_boulder', 0.15]];

// Kollisjon, dekning, krone og skalering per type
const VEG = {
  // Gjenbrukt fra bane 1 (kopiert nøyaktig fra forest.js)
  pine: { radius: 0.45, cover: 1.4, foliage: { r: 2.1, y0: 1.6, y1: 8.6 } },
  snowPine: { radius: 0.45, cover: 1.4, foliage: { r: 2.1, y0: 1.6, y1: 8.6 } },
  // Egne typer
  mountains_birch: { radius: 0.22, cover: 1.0, foliage: { r: 1.7, y0: 2.2, y1: 4.8 }, height: 4.8, scale: [0.75, 1.25] },
  mountains_dwarfBirch: { near: true, radius: 0, cover: 1.2, height: 0.6, scale: [0.8, 1.5] },
  mountains_juniper: { radius: 0, cover: 1.1, height: 1.8, scale: [0.7, 1.3] },
  mountains_boulder: { radius: 1.15, cover: 1.8, static: true, height: 1.5, sink: 0.25, scale: [0.6, 2.0, 1.6] },
  mountains_snowBoulder: { radius: 1.15, cover: 1.8, static: true, height: 1.5, sink: 0.25, scale: [0.6, 1.9, 1.6] },
  mountains_crag: { radius: 1.4, cover: 2.0, static: true, height: 4.2, sink: 0.5, scale: [0.7, 1.5] },
  mountains_scree: { radius: 0, cover: 0.8, static: true, noShadow: true, height: 0.6, sink: 0.12, scale: [0.8, 1.5] },
  mountains_cairn: { radius: 0.55, cover: 0.8, static: true, height: 1.7, sink: 0.05, scale: [0.85, 1.15] },
  mountains_streamStones: { near: true, radius: 0, cover: 0, static: true, height: 0.4, sink: 0.08, scale: [0.8, 1.5] },
  mountains_grass: { radius: 0, cover: 0, decor: true },
  mountains_flowers: { radius: 0, cover: 0, decor: true },
  mountains_flowersYellow: { radius: 0, cover: 0, decor: true },
};

export default {
  key: 'mountains',
  name: 'Fjellandskap',
  icon: '⛰️',
  surface: 'stone',
  lakeFactor: LAKE,

  height(x, z, c) {
    const n = c.n;
    const inner = innerAt(n, x, z, c.half); // 1 kall
    // Dalbunn: slake, grønne daler som stiger svakt innover i fjellheimen
    let h = 12 + inner * 6 + c.base * 6 + c.detail * 1.1;
    // Fjellmassiver der grunnstøyen og en egen lavfrekvent støy er høy (1 kall). Lavere ved foten.
    const mass = massAt(n, x, z, c.base);
    const amp = mass * (0.3 + 0.7 * inner);
    if (amp > 0.001) {
      // Brede fjellkropper med skarpe rygger og tinder (2 kall); detaljstøyen gir ru, oppsprukne flanker
      const r = n.mount.ridged(x * 0.0026 + 17.1, z * 0.0026 - 9.4, 2) + (c.detail + 1) * 0.06;
      let mh = amp * amp * (28 + r * 150) + amp * r * 12 + c.detail * amp * 8;
      // Fjellvidde: høye, slake platåer med bratte kanter (1 kall)
      const pl = plateauAt(n, x, z);
      if (pl > 0) {
        // Myk overgang (ingen knekk) fra fjellsiden inn på vidda
        const ex = h + mh - (44 + c.base * 10);
        if (ex > 0) mh -= ((ex * ex) / (ex + 10)) * 0.8 * pl;
      }
      h += mh;
      // Mykt tak: tindene når sjelden over ~150 m
      if (h > 112) h = 112 + 46 * (1 - Math.exp((112 - h) / 46));
    }
    // Fjellvann bare i dalene: worldgen senker terrenget mot −9 m der innsjøstøyen er høy. Inne i fjellmassivene
    // løftes terrenget på forhånd like mye, slik at fjellene står urørt i stedet for å få dype groper (3 kall).
    const lk = smoothstep(0.34, 0.5, n.lake.fbm(x * 0.0032, z * 0.0032, 3));
    if (lk > 0) {
      const a = lk * LAKE * c.w; // samme styrke som i worldgen (savannen har lakeFactor 0)
      const keep = smoothstep(0.12, 0.42, mass) * smoothstep(0.85, 1, c.w);
      if (keep > 0) h += (keep * a / (1 - a)) * (h + 9);
    }
    return h;
  },

  color(c, out) {
    const { h, ny, v, v2 } = c;
    // Frodig, grønn fjelleng – fra friskt grønt til gulgrønt
    let r = lerp(0.33, 0.45, v), g = lerp(0.53, 0.6, v), b = lerp(0.2, 0.25, v);
    const yel = smoothstep(0.6, 0.85, v2) * 0.5;
    r = lerp(r, 0.55, yel); g = lerp(g, 0.6, yel); b = lerp(b, 0.27, yel);
    // Mørkere skogbunn i liene
    const fo = smoothstep(14, 26, h) * (1 - smoothstep(52, 66, h)) * 0.55;
    r = lerp(r, 0.27, fo); g = lerp(g, 0.41, fo); b = lerp(b, 0.19, fo);
    // Snaufjell: olivenbrun lyng og grå lav
    const heath = smoothstep(56, 72, h);
    r = lerp(r, lerp(0.5, 0.6, v2), heath); g = lerp(g, lerp(0.5, 0.58, v2), heath); b = lerp(b, lerp(0.32, 0.46, v2), heath);
    // Ur (lys, grå-brun stein) i middels bratte skråninger og høyt oppe
    const scree = Math.max(smoothstep(0.9, 0.78, ny) * 0.85, smoothstep(76, 88, h) * 0.5);
    r = lerp(r, lerp(0.58, 0.5, v2), scree); g = lerp(g, lerp(0.56, 0.49, v2), scree); b = lerp(b, lerp(0.52, 0.47, v2), scree);
    // Grått fjell i bratt terreng, mørkere i klippene
    const rock = smoothstep(0.8, 0.66, ny);
    const cliff = smoothstep(0.6, 0.42, ny);
    r = lerp(r, lerp(lerp(0.48, 0.42, v), 0.36, cliff), rock);
    g = lerp(g, lerp(lerp(0.48, 0.43, v), 0.36, cliff), rock);
    b = lerp(b, lerp(lerp(0.5, 0.45, v), 0.39, cliff), rock);
    // Snø over snøgrensen (ujevn grense, glir av i de bratteste veggene)
    const snow = smoothstep(SNOW - 6 + v2 * 8, SNOW + 4 + v2 * 8, h) * (1 - cliff * 0.7);
    r = lerp(r, 0.94, snow); g = lerp(g, 0.96, snow); b = lerp(b, 0.99, snow);
    // Grus og runde steiner langs fjellvannene
    const shore = 1 - smoothstep(0.5, 2.0, h);
    r = lerp(r, lerp(0.56, 0.48, v2), shore); g = lerp(g, lerp(0.54, 0.47, v2), shore); b = lerp(b, lerp(0.49, 0.44, v2), shore);
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  mapColor(h, x, z, out) {
    let r = 92, g = 142, b = 66;
    if (h > 26) { const k = smoothstep(26, 50, h) * 0.6; r = lerp(r, 62, k); g = lerp(g, 108, k); b = lerp(b, 52, k); }
    if (h > 56) { const k = smoothstep(56, 74, h); r = lerp(r, 140, k); g = lerp(g, 136, k); b = lerp(b, 124, k); }
    if (h > SNOW - 4) { const k = smoothstep(SNOW - 4, SNOW + 4, h); r = lerp(r, 238, k); g = lerp(g, 242, k); b = lerp(b, 248, k); }
    if (h < 1.6) { r = 150; g = 146; b = 132; }
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  },

  mapWater: [[92, 156, 186], [26, 78, 122]],

  /** Velg vegetasjon på land: barskog i liene, eng i dalene, snaufjell, ur og klipper. */
  pick(p, r2, r3) {
    const { h, ny, x, z } = p;
    // Bratte vegger og klipper: fjellnabber og ur
    if (ny < 0.72) {
      if (r2 > (ny < 0.5 ? 0.12 : 0.3)) return null;
      return pickByTable(r3, STEEP);
    }
    // Snø: glisne, snødekte steinblokker
    if (h > SNOW + 2) {
      if (r2 > 0.12) return null;
      return r3 < 0.75 ? 'mountains_snowBoulder' : 'mountains_scree';
    }
    // Ved vannkanten: bekkesteiner, dvergbjørk og en og annen fjellbjørk
    if (h < 2.2) {
      if (r2 > 0.4) return null;
      return r3 < 0.55 ? 'mountains_streamStones' : r3 < 0.85 ? 'mountains_dwarfBirch' : 'mountains_birch';
    }
    // Snaufjell over tregrensen
    if (h > 70) {
      if (r2 > 0.32) return null;
      if (ny > 0.95 && r3 < 0.08) return 'mountains_cairn';
      return pickByTable(r3, ALPINE);
    }
    // Varder på fjellviddene
    if (h > 38 && ny > 0.96 && r2 < 0.012) return 'mountains_cairn';
    // Tregrensen
    if (h > 56) {
      if (r2 > 0.42) return null;
      return pickByTable(r3, TREELINE);
    }
    // Barskog i liene, åpen eng i dalbunnen
    const f = forestAt(p.gen.noise, x, z) + smoothstep(16, 34, h) * 0.5 - smoothstep(0.97, 1.0, ny) * 0.25;
    if (f > 0.25) {
      if (r2 > 0.36 + smoothstep(0.25, 0.7, f) * 0.4) return null;
      return pickByTable(r3, FOREST);
    }
    if (r2 > 0.3) return null;
    return pickByTable(r3, MEADOW);
  },

  /** Under vann: runde bekkesteiner i grunt vann og i vannkanten. */
  pickWater(p, r2, r3) {
    if (p.depth > 1.4 || r2 > 0.3) return null;
    return r3 < 0.85 ? 'mountains_streamStones' : 'mountains_boulder';
  },

  /** Pynt: fjellgress over det meste av engene og liene, alpeblomster i klynger. Ingenting på snø og i klippene. */
  decor(p, r1, r2) {
    const { h, x, z } = p;
    if (h < 0.7 || h > SNOW - 2) return null;
    if (p.w < 0.5 + r1 * 0.45) return null;
    const ny = p.gen.slopeAt(x, z);
    if (ny < 0.78) return null;
    const bloom = smoothstep(-0.1, 0.5, p.gen.noise.color.noise2D(x * 0.013 + 7.7, z * 0.013 - 3.1));
    const fl = (r1 * 7.3) % 1 < 0.6 ? 'mountains_flowers' : 'mountains_flowersYellow';
    if (h > 70) return r2 < 0.45 ? (r2 < 0.12 + bloom * 0.12 ? fl : 'mountains_grass') : null;
    return r2 < 0.1 + bloom * 0.4 ? fl : 'mountains_grass';
  },

  vegInfo: VEG,

  fauna: {
    predators: [['snowleopard', 0.45], ['wolf', 0.3], ['bear', 0.25]],
    aquatic: null,
    friendly: ['ibex', 'reindeer'],
    caged: ['ibex', 'fox'],
  },
  camp: { style: 'tent', minH: 3, maxH: 90, dryRadius: 15, slope: 0.86 },
  ambient: { wind: 0.07, birds: true },
  atmosphere: { fog: 0xd2deec, water: 0x2f6e8c, sky: 0x3572c8, fogScale: 1.15 },
};
