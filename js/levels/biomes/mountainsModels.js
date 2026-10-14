// 3D-modeller for biomet Fjellandskap: store kampesteiner (også snødekte), fjellnabber, ur/steinrøys, krokete
// fjellbjørk, dvergbjørk med høstfarger, einer, steinvarder, runde bekkesteiner, fjellgress og alpeblomster.
// Lavpolygon med vertex-farger (Lambert). Gran og snøgran gjenbrukes fra bane 1 (vegetation.js).
// Pynten (gress/blomster) tegnes dobbeltsidig med samme normal på begge sider, så den trenger ingen bakside.
import * as THREE from 'three';
import { paint, xf, merge, jitter, shadeVariation } from '../../models/geo.js';
import { jIco } from '../../models/vegetation.js';
import { mulberry32 } from '../../utils/math.js';

const TAU = Math.PI * 2;
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ca = new THREE.Color();
const _cb = new THREE.Color();

// ---------- Fargepalett ----------
const STONE = [0x8e8d89, 0x7f7e7b, 0x9b9994, 0x737270]; // grå gneis
const STONE_DARK = [0x5f605f, 0x6b6b69, 0x575856];
const LICHEN = [0xa9a66a, 0xa88d5e, 0xc7c4a2]; // gulgrønn, rustgul og lys grå lav
const MOSS = [0x5b7836, 0x6a8a3e];
const SNOW = 0xf1f5fa;
const WET = [0x6a7174, 0x7a8082, 0x868a85, 0x5c6264]; // slipte, våte bekkesteiner
const BARK = 0xe4e0d4;
const BARK_MARK = 0x34302c;
const BIRCH_LEAF = [0x7dab45, 0x8cb84f, 0x6a983b, 0x9bbf55];
const DWARF = [0x6d8c38, 0x86993d, 0x5f7f33, 0x9a8a3a, 0x7a9440, 0xa5532e];
const JUNIPER = [0x4a6e50, 0x3f6146, 0x56795a];

const col = (hex) => new THREE.Color(hex);

// ---------- Hjelpere ----------

/** Samler løse trekanter (posisjon + farge per hjørne). geo() gir flate normaler. */
class Tris {
  constructor() {
    this.pos = [];
    this.col = [];
  }

  tri(a, b, c, ca, cb = ca, cc = ca) {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  }

  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}

/** Lysere/mørkere variant av en farge (ny instans). */
function tint(hex, f) {
  const c = col(hex);
  return c.setRGB(Math.min(1, c.r * f), Math.min(1, c.g * f), Math.min(1, c.b * f));
}

/** Løft normalene oppover (gress og blomster lyses jevnt, som bakken under). */
function liftNormals(g, lift) {
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = Math.abs(n.getY(i)) + lift, z = n.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(i, x / l, y / l, z / l);
  }
  return g;
}

/** Fargelegg hver trekant etter en funksjon (normal y, midtpunkt y, tilfeldig tall) → THREE.Color. */
function paintFaces(g, rnd, fn) {
  const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
  for (let i = 0; i < p.count; i += 3) {
    const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const k = fn(ny, cy, rnd());
    for (let j = 0; j < 3; j++) c.setXYZ(i + j, k.r, k.g, k.b);
  }
  return g;
}

/** Åpen sylinder (uten lokk) fra punkt a til b med fargeovergang c0 → c1, forlenget litt så leddene overlapper. */
function tube(a, b, r0, r1, seg, c0, c1 = c0) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const d = Math.hypot(dx, dy, dz);
  const len = d + r1 * 0.8;
  const g = paint(new THREE.CylinderGeometry(r1, r0, len, seg, 1, true).translate(0, len / 2, 0), c0);
  const p = g.attributes.position, c = g.attributes.color;
  _ca.set(c0);
  _cb.set(c1);
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, p.getY(i) / len));
    c.setXYZ(i, _ca.r + (_cb.r - _ca.r) * t, _ca.g + (_cb.g - _ca.g) * t, _ca.b + (_cb.b - _ca.b) * t);
  }
  _dir.set(dx / d, dy / d, dz / d);
  _q.setFromUnitVectors(_up, _dir);
  g.applyQuaternion(_q);
  g.translate(a[0], a[1], a[2]);
  return g;
}

/**
 * Lavpolygon løvklump: jitret dodekaeder (36 trekanter), eller ikosaeder (20 trekanter) med small = true.
 * Litt oppskalert så den fyller omtrent like mye som en ikosaeder med detalj 1 (80 trekanter) med samme radius.
 */
function lump(r, color, amount, seed, t, small = false) {
  const geo = small ? new THREE.IcosahedronGeometry(r * 1.1, 0) : new THREE.DodecahedronGeometry(r * 1.06, 0);
  return xf(jitter(paint(geo, color), amount, seed), t);
}

// ---------- Stein ----------

/**
 * Kantete steinblokk: forskjøvet ikosaeder med flat skyggelegging. Lav og mose på oversiden, mørkere underside.
 * o = { r, x, y, z, sx, sy, sz, ry, rz, jit, seed, snow (0..1 = hvor langt ned snøen når), moss (0..1) }
 */
function stone(o) {
  const { r = 1, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, jit = 0.38, seed = 1, detail = 1 } = o;
  const g = xf(jitter(paint(new THREE.IcosahedronGeometry(1, detail), STONE[0]), jit, seed), { sx: sx * r, sy: sy * r, sz: sz * r });
  g.computeVertexNormals();
  const rnd = mulberry32(seed * 17 + 3);
  const pal = (o.dark ? STONE_DARK : STONE).map(col);
  const lich = LICHEN.map(col), moss = MOSS.map(col), snow = col(SNOW);
  const snowNy = o.snow ? 1 - o.snow : 2;
  paintFaces(g, rnd, (ny, cy, k) => {
    if (ny > snowNy) return snow;
    if (ny > 0.55 && o.moss && k < o.moss) return moss[Math.floor(k * 7) % 2];
    if (ny > 0.2 && k > 0.9) return lich[Math.floor(k * 31) % 3];
    const base = pal[Math.floor(k * 13) % pal.length];
    const f = 0.94 + ((k * 97) % 1) * 0.12 - (cy < 0 ? 0.14 : 0);
    return _cb.setRGB(base.r * f, base.g * f, base.b * f);
  });
  return xf(g, { x, y, z, rx, ry, rz });
}

/** Stor kampestein med to mindre steiner inntil (ca. 2,9 × 2,4 m og 1,4 m høy ved skala 1). */
function boulder(snowy) {
  const snow = snowy ? 0.62 : 0;
  return merge([
    stone({ r: 1.05, y: 0.55, sx: 1.2, sy: 0.82, sz: 1.0, ry: 0.4, seed: 3, snow, moss: snowy ? 0 : 0.35 }),
    stone({ r: 0.55, x: 1.1, y: 0.18, z: 0.55, sx: 1.1, sy: 0.75, ry: 1.3, seed: 8, snow, moss: snowy ? 0 : 0.2 }),
    stone({ r: 0.32, x: -0.95, y: 0.08, z: -0.7, seed: 12, detail: 0, snow }),
  ]);
}

/** Fjellnabb: skarpe, skråstilte steinpilarer som stikker opp av bratt terreng (ca. 4 m høy). */
function crag() {
  const rnd = mulberry32(29);
  const parts = [];
  const pillars = [[0, 0, 0.95, 4.2, 0], [1.05, 0.35, 0.7, 2.9, 0.18], [-0.85, -0.3, 0.75, 3.2, -0.15], [0.2, -0.95, 0.6, 2.2, 0.1], [-0.4, 0.9, 0.5, 1.6, -0.2]];
  pillars.forEach(([x, z, r, h, lean], i) => {
    const g = new THREE.CylinderGeometry(r * 0.38, r, h, 5, 3);
    g.translate(0, h / 2 - 0.4, 0);
    const pg = jitter(paint(g, STONE_DARK[0]), r * 0.32, i * 7 + 2);
    const pal = [...STONE_DARK, ...STONE].map(col);
    const lich = LICHEN.map(col);
    paintFaces(pg, rnd, (ny, cy, k) => {
      if (ny > 0.5 && k < 0.25) return lich[0];
      const b = pal[Math.floor(k * 11) % pal.length];
      const f = 0.9 + (cy / h) * 0.18;
      return _cb.setRGB(b.r * f, b.g * f, b.b * f);
    });
    parts.push(xf(pg, { x, z, rx: lean, rz: -lean * 0.7, ry: i * 1.3 }));
  });
  // Steinblokker ved foten
  parts.push(stone({ r: 0.7, x: 1.2, y: 0.1, z: -0.9, sy: 0.6, seed: 41, dark: true }));
  parts.push(stone({ r: 0.5, x: -1.3, y: 0.05, z: 0.6, sy: 0.6, seed: 43, detail: 0 }));
  return merge(parts);
}

/** Ur/steinrøys: mange kantete steiner spredt utover ca. 4 m (lav, flat haug). */
function scree() {
  const rnd = mulberry32(53);
  const parts = [];
  for (let i = 0; i < 22; i++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd()) * 1.9;
    const r = 0.14 + rnd() * rnd() * 0.42;
    parts.push(stone({
      r, x: Math.cos(a) * d, y: r * 0.18, z: Math.sin(a) * d, sx: 0.9 + rnd() * 0.5, sy: 0.55 + rnd() * 0.25,
      ry: rnd() * TAU, rz: (rnd() - 0.5) * 0.6, seed: 60 + i, detail: 0, jit: 0.45, dark: rnd() < 0.3,
    }));
  }
  return merge(parts);
}

/** Steinvarde: stablede, flate steiner som smalner mot toppen (ca. 1,7 m). */
function cairn() {
  const rnd = mulberry32(71);
  const parts = [];
  const layers = [[0.62, 6, 0.26], [0.5, 5, 0.24], [0.4, 5, 0.22], [0.3, 4, 0.2], [0.18, 3, 0.18], [0, 1, 0.17], [0, 1, 0.13]];
  let y = 0.08;
  layers.forEach(([ring, k, size], li) => {
    for (let i = 0; i < k; i++) {
      const a = (i / k) * TAU + li * 0.7 + rnd() * 0.3;
      const rr = ring * (0.85 + rnd() * 0.2);
      parts.push(stone({
        r: size * (0.9 + rnd() * 0.25), x: Math.cos(a) * rr, y, z: Math.sin(a) * rr, sx: 1.35, sy: 0.62, sz: 1.1,
        ry: rnd() * TAU, rz: (rnd() - 0.5) * 0.2, seed: 80 + li * 9 + i, detail: 0, jit: 0.3,
      }));
    }
    y += size * 1.18;
  });
  return merge(parts);
}

/** Runde, slipte bekkesteiner (glatte normaler), noen med mose. Ligger lavt, spredt over ca. 3 m. */
function streamStones() {
  const rnd = mulberry32(91);
  const parts = [];
  const pal = WET.map(col), moss = MOSS.map(col);
  for (let i = 0; i < 8; i++) {
    const a = rnd() * TAU, d = i === 0 ? 0 : 0.5 + rnd() * 1.1;
    const r = i === 0 ? 0.55 : 0.18 + rnd() * 0.3;
    const sx = 1 + rnd() * 0.4, sy = 0.45 + rnd() * 0.2, sz = 0.9 + rnd() * 0.2;
    const g = paint(new THREE.IcosahedronGeometry(1, 1), WET[0]);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let v = 0; v < p.count; v++) {
      const px = p.getX(v), py = p.getY(v), pz = p.getZ(v);
      const nx = px / sx, ny = py / sy, nz = pz / sz;
      const l = Math.hypot(nx, ny, nz) || 1;
      n.setXYZ(v, nx / l, ny / l, nz / l);
      p.setXYZ(v, px * sx * r, py * sy * r, pz * sz * r);
    }
    const mossy = rnd() < 0.4;
    const base = pal[i % pal.length];
    paintFaces(g, rnd, (fy, cy, k) => {
      if (mossy && cy > r * sy * 0.45 && k < 0.8) return moss[Math.floor(k * 5) % 2];
      const f = 0.92 + k * 0.14 - (cy < 0 ? 0.12 : 0);
      return _cb.setRGB(base.r * f, base.g * f, base.b * f);
    });
    parts.push(xf(g, { x: Math.cos(a) * d, y: r * sy * 0.35, z: Math.sin(a) * d, ry: rnd() * TAU }));
  }
  return merge(parts);
}

// ---------- Trær og busker ----------

/**
 * Fjellbjørk: lav, krokete bjørk med flere stammer fra roten, hvit never med svarte flekker og små, lyse kroner.
 * Lavpolygon (ca. 430 trekanter, som bjørka i bane 1): toppklasen er et dodekaeder og sideklasene ikosaedre;
 * kvistene inn til sideklasene er sløyfet (usynlige på spilleavstand), så klasene sitter litt tettere inntil stammen.
 */
function mountainBirch() {
  const rnd = mulberry32(13);
  const parts = [];
  const stems = [[0.2, 0.0, 4.4], [2.3, 0.5, 3.6], [4.3, 0.6, 3.1]];
  for (const [ang, lean, H] of stems) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    // Stammen bøyer seg ut og så opp igjen (typisk fjellbjørk)
    const pts = [
      [0, -0.2, 0],
      [ca * (0.35 + lean * 0.5), H * 0.3, sa * (0.35 + lean * 0.5)],
      [ca * (0.55 + lean * 0.7) - sa * 0.2, H * 0.62, sa * (0.55 + lean * 0.7) + ca * 0.2],
      [ca * (0.45 + lean * 0.9), H, sa * (0.45 + lean * 0.9)],
    ];
    const radii = [0.13, 0.1, 0.075, 0.04];
    for (let i = 0; i < 3; i++) {
      // Hvit never; den tynne toppen (mest skjult i kronen) er firkantet
      parts.push(tube(pts[i], pts[i + 1], radii[i], radii[i + 1], i < 2 ? 5 : 4, i === 0 ? 0x8f887c : BARK, BARK));
      if (i === 2) continue;
      // Mørk ring midt på de to nederste leddene (samme antall sider som leddet, så den ligger rundt stammen)
      const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2, (pts[i][2] + pts[i + 1][2]) / 2];
      parts.push(tube(m, [m[0] + (pts[i + 1][0] - pts[i][0]) * 0.12, m[1] + (pts[i + 1][1] - pts[i][1]) * 0.12, m[2] + (pts[i + 1][2] - pts[i][2]) * 0.12],
        radii[i] * 1.06, radii[i + 1] * 1.06, 5, BARK_MARK));
    }
    // Løvklaser langs den øvre delen
    const top = pts[3];
    parts.push(lump(0.8 + rnd() * 0.2, BIRCH_LEAF[3], 0.3, ang * 10 + 1, { x: top[0], y: top[1] + 0.1, z: top[2], sy: 0.8 }));
    for (let k = 0; k < 3; k++) {
      const a = ang + (k - 1) * 1.3 + rnd() * 0.4;
      const from = pts[2];
      const tip = [from[0] + Math.cos(a) * 0.8, from[1] + 0.35 + rnd() * 0.5, from[2] + Math.sin(a) * 0.8];
      parts.push(lump(0.48 + rnd() * 0.18, BIRCH_LEAF[k % 3], 0.22, ang * 10 + k * 3 + 2, { x: tip[0], y: tip[1], z: tip[2], sy: 0.75 }, true));
    }
  }
  return shadeVariation(merge(parts), 0.06, 19);
}

/** Dvergbjørk: lav, tett og vid busk med små blader i grønt og olivengult, med enkelte høstrøde flekker. */
function dwarfBirch() {
  const rnd = mulberry32(37);
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rnd() * 0.4;
    parts.push(tube([0, -0.05, 0], [Math.cos(a) * 0.75, 0.32 + rnd() * 0.22, Math.sin(a) * 0.75], 0.035, 0.015, 3, 0x4a3426, 0x6a4a35));
  }
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU * 2 + rnd() * 0.5;
    const d = i === 0 ? 0 : 0.3 + rnd() * 0.5;
    const r = i === 0 ? 0.42 : 0.24 + rnd() * 0.14;
    const c = i % 5 === 4 ? DWARF[5] : DWARF[i % 5];
    parts.push(jIco(r, i < 4 ? 1 : 0, c, r * 0.4, i * 5 + 3, { x: Math.cos(a) * d, y: 0.34 - d * 0.18, z: Math.sin(a) * d, sy: 0.62 }));
  }
  return shadeVariation(merge(parts), 0.1, 7);
}

/**
 * Einer: smal, tett og mørk blågrønn søylebusk med et par mindre skudd ved siden av. De to høye søylene beholder
 * runde ikosaedre (silhuetten), de små skuddene ved foten er dodekaedre.
 */
function juniper() {
  // Rotstubben står i bakken, så den trenger ingen bunn
  const parts = [xf(paint(new THREE.ConeGeometry(0.07, 0.3, 4, 1, true), 0x4a3a2c), { y: 0.1 })];
  [[0, 0, 0.42, 0.95, 0], [0.05, 0.05, 0.3, 1.45, 0.05], [0.42, 0.2, 0.3, 0.55, -0.2], [-0.36, -0.26, 0.28, 0.5, 0.2], [0.12, -0.42, 0.24, 0.4, 0.15]]
    .forEach(([x, z, r, y, lean], i) => {
      const t = { x, y, z, sy: i < 2 ? 1.9 : 1.5, rz: lean };
      parts.push(i < 2 ? jIco(r, 1, JUNIPER[i % 3], r * 0.35, i * 3 + 5, t) : lump(r, JUNIPER[i % 3], r * 0.35, i * 3 + 5, t));
    });
  return shadeVariation(merge(parts), 0.08, 3);
}

// ---------- Gress og blomster (pynt) ----------

/** Ett gresstrå (2 trekanter) som lener seg i retning ang. Returnerer toppunktet. */
function blade(T, x, z, ang, h, w, lean, cBase, cMid, cTip) {
  const dx = Math.cos(ang), dz = Math.sin(ang);
  const px = -dz * w * 0.5, pz = dx * w * 0.5;
  const bl = [x - px, -0.02, z - pz], br = [x + px, -0.02, z + pz];
  const mr = [x + dx * lean * h * 0.3 + px * 0.5, h * 0.55, z + dz * lean * h * 0.3 + pz * 0.5];
  const tip = [x + dx * lean * h, h * (1 - lean * lean * 0.3), z + dz * lean * h];
  T.tri(bl, br, mr, cBase, cBase, cMid);
  T.tri(bl, mr, tip, cBase, cMid, cTip);
  return tip;
}

/** Gresstue: flere strå i små tuer. */
function tuft(T, rnd, o) {
  const cb = col(o.base), cm = col(o.mid), ct = col(o.tip);
  for (let t = 0; t < o.tufts; t++) {
    const ta = rnd() * TAU, td = t === 0 ? 0 : o.spread * (0.5 + rnd() * 0.5);
    const tx = Math.cos(ta) * td, tz = Math.sin(ta) * td;
    for (let i = 0; i < o.blades; i++) {
      const a = (i / o.blades) * TAU + rnd() * 0.7;
      const rr = 0.03 + rnd() * 0.1;
      const f = 0.86 + rnd() * 0.28;
      blade(T, tx + Math.cos(a) * rr, tz + Math.sin(a) * rr, a, o.h[0] + rnd() * (o.h[1] - o.h[0]), o.w, o.lean * (0.6 + rnd() * 0.7),
        tint(cb.getHex(), f), tint(cm.getHex(), f), tint(ct.getHex(), f));
    }
  }
}

/** Fjellgress: lave, tette tuer med gulgrønne topper. */
function mountainGrass() {
  const T = new Tris();
  tuft(T, mulberry32(5), { tufts: 3, blades: 8, spread: 0.32, h: [0.22, 0.48], w: 0.05, lean: 0.4, base: 0x3f5f26, mid: 0x6f9a3a, tip: 0xb7c26a });
  return liftNormals(T.geo(), 1.6);
}

/** Én blomst: tynn stilk og en liten, skålformet krone (5 kronblader) som peker oppover. */
function bloom(T, x, z, h, r, petal, center) {
  const stem = col(0x4f7a2e);
  blade(T, x, z, 0.3, h, 0.025, 0.05, stem, stem, stem);
  const cy = h, cc = col(center), pc = col(petal), pe = tint(petal, 1.12);
  const pts = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    pts.push([x + Math.cos(a) * r, cy + r * 0.45, z + Math.sin(a) * r]);
  }
  const c0 = [x, cy, z];
  for (let i = 0; i < 5; i++) T.tri(c0, pts[(i + 1) % 5], pts[i], cc, pe, pc);
}

/**
 * Alpeblomster: en tue fjellgress med blomster. pal = liste med [kronblad, midt]; hver blomst får en farge
 * fra lista etter tur.
 */
function alpineFlowers(pal, seed) {
  const T = new Tris();
  const rnd = mulberry32(seed);
  tuft(T, rnd, { tufts: 2, blades: 7, spread: 0.25, h: [0.18, 0.36], w: 0.045, lean: 0.4, base: 0x3f5f26, mid: 0x6f9a3a, tip: 0xa9bf62 });
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd()) * 0.5;
    const [p, c] = pal[i % pal.length];
    bloom(T, Math.cos(a) * d, Math.sin(a) * d, 0.2 + rnd() * 0.2, 0.075 + rnd() * 0.035, p, c);
  }
  return liftNormals(T.geo(), 1.4);
}

/** Byggere for fjellbiomets vegetasjon og gjenstander (geometri lages først når typen trengs). */
export const MODELS = {
  mountains_boulder: () => boulder(false),
  mountains_snowBoulder: () => boulder(true),
  mountains_crag: crag,
  mountains_scree: scree,
  mountains_cairn: cairn,
  mountains_streamStones: streamStones,
  mountains_birch: mountainBirch,
  mountains_dwarfBirch: dwarfBirch,
  mountains_juniper: juniper,
  mountains_grass: mountainGrass,
  // Blått og lilla (blåklokke, fjellfiol) med litt gult
  mountains_flowers: () => alpineFlowers([[0x3f63d6, 0xf2e27a], [0x8a4cc9, 0xf2d64a], [0x4f7ae0, 0xffffff], [0xf2cf2a, 0xd59a1c]], 7),
  // Gult og hvitt (fjellsoleie, reinrose) med litt lilla
  mountains_flowersYellow: () => alpineFlowers([[0xf4d12c, 0xd8941a], [0xf6f4ea, 0xf0c63a], [0xf4d12c, 0xd8941a], [0xb05ac8, 0xf2d64a]], 11),
};
