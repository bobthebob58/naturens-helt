// 3D-modeller for biomet By: småhus med saltak, moderne villaer, leilighetsblokker med balkonger, høyblokker,
// kontortårn i glass, butikker med stripete markiser, lagerhaller med rulleporter, parkerte biler og minibusser,
// gatelys, benker, søppelkasser, fontener, bytrær (lind og blomstrende jakaranda), fortau med kantstein,
// midtrabatter, midtstriper og fotgjengerfelt. Lavpolygon med vertex-farger (Lambert).
// Bygningene har origo midt på bunnen, forsiden (inngang, markiser, porter) mot +Z og en sokkel som går 1,5 m
// ned i bakken, slik at små skråninger ikke gir glipe under huset. Vinduer er gjennomgående bokser (vises på to
// motstående fasader samtidig) og vindusbånd med pilastre – det holder trekanttallet nede.
import * as THREE from 'three';
import { merge, shadeVariation, box, cyl, cone } from '../../models/geo.js';
import { jIco } from '../../models/vegetation.js';

const TAU = Math.PI * 2;
const WALK = 3; // fortausbredde (samme som i city.js)

// ---------- Fargepalett ----------
const PLINTH = 0x77736c;
const FRAME = 0xf1ede4;
const GLASS = 0x34465a;
const DOOR = 0x5a3f2c;
const CONCRETE = 0xb9b4a9;
const CURB = 0xdedad0;
const SLAB = [0xaca89e, 0xa29e94];
const TIRE = 0x1d1e20;
const HUB = 0xa7abae;
const POLE = 0x3d464b;
const BARK = 0x5a4632;
const ROOFING = 0x7f7d7a;

const _ca = new THREE.Color();
const _cb = new THREE.Color();

// ---------- Hjelpere ----------

/** Geometri av løse trekanter [a, b, c, farge, ønsket normalretning] – hver trekant snus etter ønsket retning. */
function tris(list) {
  const pos = [], col = [];
  for (const [a, b, c, color, w] of list) {
    _ca.set(color);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const pts = nx * w[0] + ny * w[1] + nz * w[2] < 0 ? [a, c, b] : [a, b, c];
    for (const p of pts) {
      pos.push(p[0], p[1], p[2]);
      col.push(_ca.r, _ca.g, _ca.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Omdreiningslegeme fra en profil [[r, y], ...] (fra aksen og ut/opp). Normalen til hvert profilstykke er tangenten
 * dreid -90° (utover når profilen går oppover), så både utsider, innsider og topper vender riktig vei.
 */
function revolve(profile, seg, colors) {
  const list = [];
  const p = (r, y, a) => [Math.cos(a) * r, y, Math.sin(a) * r];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    const tr = r1 - r0, ty = y1 - y0;
    const color = colors[i] ?? colors[colors.length - 1];
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU, am = (a0 + a1) / 2;
      const want = [Math.cos(am) * ty, -tr, Math.sin(am) * ty];
      const A = p(r0, y0, a0), B = p(r0, y0, a1), C = p(r1, y1, a1), D = p(r1, y1, a0);
      if (r0 > 0.001) list.push([A, B, C, color, want]);
      if (r1 > 0.001) list.push([A, C, D, color, want]);
    }
  }
  return tris(list);
}

/** Fargeovergang etter høyden (y0 → y1) på en ferdig malt geometri. */
function gradY(g, y0, y1, c0, c1) {
  const p = g.attributes.position, c = g.attributes.color;
  _ca.set(c0);
  _cb.set(c1);
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
    c.setXYZ(i, _ca.r + (_cb.r - _ca.r) * t, _ca.g + (_cb.g - _ca.g) * t, _ca.b + (_cb.b - _ca.b) * t);
  }
  return g;
}

/** Sokkel som går ned i bakken. */
const plinth = (w, d) => box(w + 0.3, 1.9, d + 0.3, PLINTH, { y: -0.6 });

/** Saltak med møne langs x: to takflater med utstikk og to gavltrekanter. y0 = takfot, rise = mønehøyde. */
function gableRoof(parts, w, d, y0, rise, over, wallColor, roofColor) {
  const a = Math.atan2(rise, d / 2);
  const run = d / 2 + over;
  const len = run / Math.cos(a);
  for (const s of [-1, 1]) {
    const ym = y0 + rise - (run / 2) * Math.tan(a);
    parts.push(box(w + over * 2, 0.22, len + 0.12, roofColor, { y: ym + 0.12, z: (s * run) / 2, rx: s * a }));
  }
  const top = y0 + rise;
  parts.push(tris([
    [[w / 2, y0, -d / 2], [w / 2, y0, d / 2], [w / 2, top, 0], wallColor, [1, 0, 0]],
    [[-w / 2, y0, -d / 2], [-w / 2, y0, d / 2], [-w / 2, top, 0], wallColor, [-1, 0, 0]],
  ]));
  // Mønekam
  parts.push(box(w + over * 2, 0.16, 0.36, roofColor, { y: top + 0.3, rx: Math.PI / 4 }));
}

/** Vindu (ramme + glass) som går tvers gjennom huset langs z (vises på for- og baksiden). */
function winZ(parts, x, y, w, h, d, cross = false) {
  parts.push(box(w + 0.22, h + 0.22, d + 0.08, FRAME, { x, y }));
  parts.push(box(w, h, d + 0.14, GLASS, { x, y }));
  if (cross) {
    parts.push(box(0.07, h, d + 0.18, FRAME, { x, y }));
    parts.push(box(w, 0.07, d + 0.18, FRAME, { x, y: y + h * 0.12 }));
  }
}

/** Vindu tvers gjennom huset langs x (vises på begge kortsidene). */
function winX(parts, z, y, w, h, wd) {
  parts.push(box(wd + 0.08, h + 0.22, w + 0.22, FRAME, { y, z }));
  parts.push(box(wd + 0.14, h, w, GLASS, { y, z }));
}

/**
 * Fasade med vindusbånd: innfelt glasskjerne, utstikkende etasjeskiller (bånd) og pilastre mellom vinduene.
 * Pilastrene er gjennomgående bokser, så hver av dem gir en pilaster på to motstående fasader.
 */
function banded(parts, o) {
  const { w, d, y0, floors, fh, wall, nx, nz } = o;
  const band = o.band ?? wall;
  const pw = o.pier ?? 0.6;
  const H = floors * fh;
  const wh = fh * (o.win ?? 0.5);
  const sill = (fh - wh) / 2;
  const core = box(w - 0.24, H, d - 0.24, o.glass, { y: y0 + H / 2 });
  if (o.glassTop) gradY(core, y0, y0 + H, o.glass, o.glassTop);
  parts.push(core);
  parts.push(box(w + 0.08, sill, d + 0.08, band, { y: y0 + sill / 2 }));
  for (let f = 1; f < floors; f++) parts.push(box(w + 0.08, fh - wh, d + 0.08, band, { y: y0 + f * fh }));
  parts.push(box(w + 0.08, sill, d + 0.08, band, { y: y0 + H - sill / 2 }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(box(pw, H, pw, wall, { x: (sx * (w - pw)) / 2, y: y0 + H / 2, z: (sz * (d - pw)) / 2 }));
  }
  for (let k = 1; k < nx; k++) parts.push(box(pw, H, d, wall, { x: -w / 2 + (k * w) / nx, y: y0 + H / 2 }));
  for (let k = 1; k < nz; k++) parts.push(box(w, H, pw, wall, { y: y0 + H / 2, z: -d / 2 + (k * d) / nz }));
  return y0 + H;
}

/** Takpapp innenfor en lys gesims (gesimsen er w × d, toppen ligger på y). */
const membrane = (w, d, y, x = 0) => box(w - 0.7, 0.06, d - 0.7, ROOFING, { x, y: y + 0.03 });

/** Takoppbygg: heismaskinrom, ventilasjon og evt. vanntank. */
function roofTop(parts, y, x, z, tank) {
  parts.push(box(3.2, 2.2, 2.6, CONCRETE, { x, y: y + 1.1, z }));
  parts.push(box(1.2, 0.8, 1.2, 0x8d9195, { x: x + 3.4, y: y + 0.4, z: z + 0.6 }));
  if (tank) {
    parts.push(cyl(0.9, 0.9, 1.8, 8, 0x8a7f72, { x: -x, y: y + 1.5, z: -z }));
    parts.push(cone(1.0, 0.5, 8, 0x6e665d, { x: -x, y: y + 2.65, z: -z }));
    for (const sx of [-0.5, 0.5]) parts.push(box(0.12, 0.6, 1.4, 0x4c4c4c, { x: -x + sx, y: y + 0.3, z: -z }));
  }
}

// ---------- Boliger ----------

/** Småhus i to etasjer med saltak, sprossevinduer, dør med skjerm og pipe. 9,2 × 8,4 m. */
function house(WALL, ROOF, CHIMNEY) {
  const W = 9.2, D = 8.4, H = 5.9;
  const parts = [plinth(W, D), box(W, H - 0.3, D, WALL, { y: 0.3 + (H - 0.3) / 2 })];
  for (const y of [1.75, 4.45]) {
    for (const x of [-3, 0, 3]) if (!(y < 3 && x === 0)) winZ(parts, x, y, 1.1, 1.3, D, true);
    for (const z of [-1.9, 1.9]) winX(parts, z, y, 1.05, 1.25, W);
  }
  // Inngang
  parts.push(box(1.4, 2.5, 0.08, FRAME, { y: 1.55, z: D / 2 + 0.03 }));
  parts.push(box(1.1, 2.25, 0.12, DOOR, { y: 1.45, z: D / 2 + 0.05 }));
  parts.push(box(2.0, 0.12, 1.0, ROOF, { y: 2.95, z: D / 2 + 0.5 }));
  parts.push(box(2.0, 0.3, 0.9, CONCRETE, { y: 0.2, z: D / 2 + 0.45 }));
  // Takrenne/gesims og tak
  parts.push(box(W + 0.2, 0.22, D + 0.2, FRAME, { y: H - 0.1 }));
  gableRoof(parts, W, D, H, 2.5, 0.5, WALL, ROOF);
  parts.push(box(0.7, 2.2, 0.7, CHIMNEY, { x: 2.6, y: H + 2.0, z: -1.3 }));
  parts.push(box(0.85, 0.15, 0.85, 0x5d5a55, { x: 2.6, y: H + 3.15, z: -1.3 }));
  return merge(parts);
}

/** Moderne villa med flatt tak: hvit underetasje, mindre overetasje med trekledning og takterrasse. 10 × 8,4 m. */
function villa() {
  const W = 10, D = 8.4;
  const WHITE = 0xf0ece2, WHITE2 = 0xe6e1d4, WOOD = 0x9b6a42, TRIM = 0x7f858a;
  const parts = [
    plinth(W, D),
    box(W, 3.0, D, WHITE, { y: 1.8 }),
    box(6.2, 2.9, D - 0.4, WHITE2, { x: -1.9, y: 4.75 }),
    box(2.6, 2.9, 0.1, WOOD, { x: -3.6, y: 4.75, z: (D - 0.4) / 2 + 0.05 }),
    box(2.6, 2.9, 0.1, WOOD, { x: -3.6, y: 4.75, z: -(D - 0.4) / 2 - 0.05 }),
    // Store glassflater i underetasjen og et vindusbånd oppe
    box(3.4, 2.0, D + 0.08, GLASS, { x: -2.5, y: 1.65 }),
    box(2.0, 1.4, D + 0.08, GLASS, { x: 3.2, y: 1.95 }),
    box(W + 0.08, 1.2, 2.2, GLASS, { y: 1.95 }),
    box(2.9, 1.3, D - 0.32, GLASS, { x: -0.2, y: 4.8 }),
    box(1.1, 2.3, 0.12, DOOR, { x: 0.9, y: 1.45, z: D / 2 + 0.05 }),
    box(2.2, 0.12, 1.2, TRIM, { x: 0.9, y: 2.85, z: D / 2 + 0.6 }),
    // Gesimser
    box(W + 0.3, 0.25, D + 0.3, TRIM, { y: 3.35 }),
    box(6.5, 0.25, D - 0.1, TRIM, { x: -1.9, y: 6.3 }),
    // Glassrekkverk rundt takterrassen
    box(3.8, 0.9, 0.06, 0x9fc3d6, { x: 3.1, y: 3.95, z: D / 2 - 0.05 }),
    box(3.8, 0.9, 0.06, 0x9fc3d6, { x: 3.1, y: 3.95, z: -D / 2 + 0.05 }),
    box(0.06, 0.9, D - 0.1, 0x9fc3d6, { x: W / 2 - 0.05, y: 3.95 }),
    box(1.2, 0.5, 0.8, 0x4f7a3a, { x: 4.1, y: 3.7, z: 2.6 }),
  ];
  return merge(parts);
}

/** Leilighetsblokk i fire etasjer (teglrød med lyse bånd) og balkonger på forsiden. 22 × 11 m, ca. 13 m høy. */
function apartment() {
  const W = 22, D = 11, NX = 7;
  const parts = [plinth(W, D)];
  const top = banded(parts, { w: W, d: D, y0: 0.3, floors: 4, fh: 3, wall: 0xc06f4f, band: 0xeadfc6, glass: GLASS, glassTop: 0x4c6176, win: 0.5, nx: NX, nz: 3, pier: 0.7 });
  // Inngangsparti
  parts.push(box(2.4, 2.4, 0.3, 0x2a3540, { y: 1.5, z: D / 2 + 0.05 }));
  parts.push(box(3.4, 0.22, 1.5, CONCRETE, { y: 2.85, z: D / 2 + 0.75 }));
  // Balkonger
  for (let f = 1; f < 4; f++) {
    for (const j of [0, 2, 4, 6]) {
      if (j === 3) continue;
      const x = -W / 2 + ((j + 0.5) * W) / NX, y = 0.3 + f * 3;
      parts.push(box((W / NX) * 0.86, 0.16, 1.15, CONCRETE, { x, y: y + 0.08, z: D / 2 + 0.58 }));
      parts.push(box((W / NX) * 0.86, 0.95, 0.08, 0xe8e4da, { x, y: y + 0.6, z: D / 2 + 1.12 }));
    }
  }
  parts.push(box(W + 0.4, 0.4, D + 0.4, 0xeadfc6, { y: top + 0.2 }));
  parts.push(membrane(W + 0.4, D + 0.4, top + 0.4));
  roofTop(parts, top + 0.4, -5, -1.5, true);
  return merge(parts);
}

/** Høyblokk i åtte etasjer: glasslobby i første etasje, beige bånd og takoppbygg. 16 × 14 m, ca. 26 m høy. */
function highBlock() {
  const W = 16, D = 14;
  const parts = [plinth(W, D)];
  // Lobby
  parts.push(box(W - 0.8, 4.0, D - 0.8, 0x2a3846, { y: 2.3 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.8, 4.0, 0.8, 0xd9cdb2, { x: (sx * (W - 0.8)) / 2, y: 2.3, z: (sz * (D - 0.8)) / 2 }));
  for (const x of [-4, 0, 4]) parts.push(box(0.5, 4.0, D - 0.6, 0xd9cdb2, { x, y: 2.3 }));
  parts.push(box(6, 0.3, 2.0, 0x8b9196, { y: 3.9, z: D / 2 + 1.0 }));
  const top = banded(parts, { w: W, d: D, y0: 4.3, floors: 7, fh: 3, wall: 0xd6c8a8, band: 0xefe8d8, glass: 0x33495c, glassTop: 0x5a7690, win: 0.52, nx: 5, nz: 4, pier: 0.75 });
  parts.push(box(W + 0.4, 0.5, D + 0.4, 0xefe8d8, { y: top + 0.25 }));
  parts.push(membrane(W + 0.4, D + 0.4, top + 0.5));
  roofTop(parts, top + 0.5, 3.5, 2.5, true);
  return merge(parts);
}

/** Kontortårn i blått speilglass med hvite bånd, lobby og antenne. 17 × 17 m, ca. 31 m høyt. */
function tower() {
  const W = 17, D = 17;
  const parts = [plinth(W, D)];
  parts.push(box(W - 1.2, 4.2, D - 1.2, 0x23303b, { y: 2.4 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(1.0, 4.2, 1.0, 0xc9d1d8, { x: (sx * (W - 1)) / 2, y: 2.4, z: (sz * (D - 1)) / 2 }));
  parts.push(box(7, 0.35, 2.4, 0xc9d1d8, { y: 4.2, z: D / 2 + 1.2 }));
  const top = banded(parts, { w: W, d: D, y0: 4.5, floors: 8, fh: 3.3, wall: 0xc9d1d8, band: 0xe4e9ed, glass: 0x4d7aa0, glassTop: 0x8fb4d2, win: 0.74, nx: 6, nz: 6, pier: 0.32 });
  // Krone og antenne
  parts.push(box(W + 0.3, 1.1, D + 0.3, 0xe4e9ed, { y: top + 0.55 }));
  parts.push(membrane(W + 0.3, D + 0.3, top + 1.1));
  parts.push(box(W - 4, 1.6, D - 4, 0xb4bcc4, { y: top + 1.9 }));
  parts.push(cyl(0.12, 0.2, 5.5, 5, 0x9aa1a8, { x: 3, y: top + 5.4, z: -3 }));
  parts.push(box(0.3, 0.3, 0.3, 0xd23a2a, { x: 3, y: top + 8.2, z: -3 }));
  return merge(parts);
}

// ---------- Butikker og industri ----------

/** Stripete markise med kappe, festet til veggen ved z = zw. */
function awning(parts, x, w, zw, colA, colB) {
  const n = 5, out = 1.9, drop = 0.6;
  const a = Math.atan2(drop, out), len = Math.hypot(out, drop);
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const c = i & 1 ? colB : colA;
    const xi = x - w / 2 + (i + 0.5) * sw;
    parts.push(box(sw + 0.002, 0.06, len, c, { x: xi, y: 3.0, z: zw + out / 2, rx: a }));
    parts.push(box(sw + 0.002, 0.34, 0.05, c, { x: xi, y: 2.55, z: zw + out + 0.01 }));
  }
}

/**
 * Butikkgård i to etasjer: to butikker med utstillingsvinduer, skilt og markiser i gata, leilighet over.
 * 12 × 9 m, 8 m høy. Fargene velges per variant.
 */
function shop(wall, wall2, signs, awnings) {
  const W = 12, D = 9;
  const TRIM = 0xf2eee6;
  const parts = [plinth(W, D), box(W, 4.2, D, wall, { y: 2.4 }), box(W, 3.1, D, wall2, { y: 6.05 })];
  parts.push(box(W + 0.14, 0.26, D + 0.14, TRIM, { y: 4.55 }));
  parts.push(box(W + 0.34, 0.42, D + 0.34, TRIM, { y: 7.75 }));
  parts.push(membrane(W + 0.34, D + 0.34, 7.96));
  for (const s of [-1, 1]) {
    const xc = s * 3;
    parts.push(box(3.6, 2.6, 0.1, 0x9aa7ad, { x: xc - s * 0.55, y: 1.95, z: D / 2 + 0.03 }));
    parts.push(box(3.3, 2.35, 0.14, 0x41586a, { x: xc - s * 0.55, y: 1.95, z: D / 2 + 0.05 }));
    parts.push(box(1.1, 2.4, 0.14, 0x3a2f28, { x: xc + s * 1.95, y: 1.5, z: D / 2 + 0.05 }));
    parts.push(box(5.4, 0.62, 0.16, signs[s < 0 ? 0 : 1], { x: xc, y: 3.85, z: D / 2 + 0.06 }));
    parts.push(box(3.0, 0.22, 0.2, 0xf6f2e8, { x: xc, y: 3.85, z: D / 2 + 0.1 }));
    awning(parts, xc, 5.2, D / 2, awnings[s < 0 ? 0 : 1], 0xf4f1ea);
  }
  for (const x of [-4.5, -1.5, 1.5, 4.5]) winZ(parts, x, 6.1, 1.2, 1.4, D);
  for (const z of [-2, 2]) winX(parts, z, 6.1, 1.2, 1.4, W);
  // Bakdør
  parts.push(box(1.0, 2.2, 0.12, DOOR, { x: 3, y: 1.4, z: -D / 2 - 0.05 }));
  return merge(parts);
}

/** Lagerhall i korrugert stålplate med rulleporter, lasteskur, takvindu og firmafarge. 28 × 16 m, ca. 9 m høy. */
function warehouse() {
  const W = 28, D = 16, WH = 7;
  const CLAD = 0xa9b2b8, RIB = 0x8d979e, BLUE = 0x2f5d8a;
  const parts = [plinth(W, D), box(W, WH, D, CLAD, { y: 0.3 + WH / 2 })];
  parts.push(box(W + 0.06, 1.0, D + 0.06, 0x8e8b84, { y: 0.8 }));
  for (let x = -W / 2 + 0.7; x < W / 2; x += 1.4) parts.push(box(0.22, WH - 1.4, D + 0.08, RIB, { x, y: 1.3 + (WH - 1.4) / 2 }));
  for (let z = -D / 2 + 0.8; z < D / 2; z += 1.6) parts.push(box(W + 0.08, WH - 1.4, 0.22, RIB, { y: 1.3 + (WH - 1.4) / 2, z }));
  parts.push(box(W + 0.12, 0.6, D + 0.12, BLUE, { y: WH }));
  // Høye vindusbånd på kortsidene
  for (const z of [-3.8, 3.8]) parts.push(box(W + 0.14, 0.9, 3.2, 0x8fb0c4, { y: 5.6, z }));
  // Rulleporter (gjennomgående: porter på begge langsidene)
  for (const x of [-7, 7]) {
    parts.push(box(5.4, 5.1, D + 0.12, 0x5d6870, { x, y: 2.85 }));
    parts.push(box(5.0, 4.8, D + 0.18, 0x7d8992, { x, y: 2.7 }));
    for (const y of [1.3, 2.3, 3.3, 4.3]) parts.push(box(5.0, 0.07, D + 0.22, 0x66727b, { x, y }));
  }
  parts.push(box(1.0, 2.2, 0.14, 0x2f5d8a, { y: 1.4, z: D / 2 + 0.06 }));
  parts.push(box(17, 0.22, 2.4, 0x6c7378, { y: 5.75, z: D / 2 + 1.2 }));
  gableRoof(parts, W, D, 0.3 + WH, 1.4, 0.45, CLAD, 0x62686d);
  parts.push(box(W * 0.75, 0.25, 1.4, 0xc9dce6, { y: 0.3 + WH + 1.5 }));
  return merge(parts);
}

// ---------- Kjøretøy ----------

/** Personbil (sedan eller kombi). Ser langs +Z. */
function car(body, { len = 4.3, wid = 1.8, cabin = 2.1, cz = -0.15, roofH = 0.56 } = {}) {
  const parts = [
    box(wid, 0.58, len, body, { y: 0.62 }),
    box(wid + 0.04, 0.16, len + 0.1, 0x2b2d30, { y: 0.42 }),
    box(wid - 0.2, roofH, cabin, 0x26313b, { y: 0.91 + roofH / 2, z: cz }),
    box(wid - 0.26, 0.08, cabin - 0.2, body, { y: 0.95 + roofH, z: cz }),
    box(wid - 0.16, roofH, 0.12, body, { y: 0.91 + roofH / 2, z: cz + 0.15 }),
    box(0.75, 0.18, 0.04, 0x1f2124, { y: 0.66, z: len / 2 + 0.01 }),
  ];
  for (const sx of [-1, 1]) {
    parts.push(box(0.34, 0.14, 0.05, 0xf4efd6, { x: sx * (wid / 2 - 0.3), y: 0.8, z: len / 2 + 0.01 }));
    parts.push(box(0.34, 0.14, 0.05, 0xb52a2a, { x: sx * (wid / 2 - 0.3), y: 0.8, z: -len / 2 - 0.01 }));
    for (const sz of [-1, 1]) {
      const t = { x: sx * (wid / 2 - 0.1), y: 0.33, z: sz * (len / 2 - 0.82), rz: Math.PI / 2 };
      parts.push(cyl(0.33, 0.33, 0.24, 10, TIRE, t));
      parts.push(cyl(0.17, 0.17, 0.26, 6, HUB, t));
    }
  }
  return merge(parts);
}

/** Hvit minibuss/varebil med blå stripe. 2 × 5 m. */
function van() {
  const WHITE = 0xeeeeea, len = 5.0, wid = 2.0;
  const parts = [
    box(wid, 1.85, len - 0.7, WHITE, { y: 1.3, z: -0.35 }),
    box(wid, 0.85, 0.75, WHITE, { y: 0.8, z: len / 2 - 0.37 }),
    box(wid - 0.1, 0.9, 0.5, 0x26313b, { y: 1.65, z: len / 2 - 0.85, rx: -0.45 }),
    box(wid + 0.04, 0.55, len - 1.6, 0x26313b, { y: 1.75, z: -0.55 }),
    box(wid + 0.05, 0.22, len - 0.2, 0x2f6fb5, { y: 1.08 }),
    box(wid + 0.04, 0.16, len + 0.1, 0x2b2d30, { y: 0.42 }),
  ];
  for (const sx of [-1, 1]) {
    parts.push(box(0.36, 0.16, 0.05, 0xf4efd6, { x: sx * (wid / 2 - 0.3), y: 0.95, z: len / 2 + 0.02 }));
    parts.push(box(0.3, 0.3, 0.05, 0xb52a2a, { x: sx * (wid / 2 - 0.2), y: 1.0, z: -len / 2 - 0.02 }));
    for (const sz of [-1, 1]) {
      const t = { x: sx * (wid / 2 - 0.12), y: 0.36, z: sz * (len / 2 - 0.95), rz: Math.PI / 2 };
      parts.push(cyl(0.36, 0.36, 0.26, 10, TIRE, t));
      parts.push(cyl(0.18, 0.18, 0.28, 6, HUB, t));
    }
  }
  return merge(parts);
}

// ---------- Gatemøbler ----------

/** Gatelys med arm ut over kjørebanen (+Z). */
function lamp() {
  return merge([
    cyl(0.2, 0.25, 0.5, 8, POLE, { y: 0.25 }),
    cyl(0.07, 0.1, 7.0, 6, POLE, { y: 3.5 }),
    box(0.08, 0.08, 1.8, POLE, { y: 6.92, z: 0.85 }),
    cyl(0.04, 0.04, 0.75, 4, POLE, { y: 6.62, z: 0.26, rx: 0.8 }),
    box(0.4, 0.16, 0.78, 0x2c3236, { y: 6.88, z: 1.85 }),
    box(0.3, 0.04, 0.6, 0xfff1c0, { y: 6.79, z: 1.85 }),
  ]);
}

/** Parkbenk i tre med metallben. Man sitter med ansiktet mot +Z. */
function bench() {
  const WOOD = 0x9a6436, METAL = 0x2f3437;
  const parts = [];
  for (let i = 0; i < 3; i++) parts.push(box(1.9, 0.05, 0.13, WOOD, { y: 0.46, z: -0.16 + i * 0.16 }));
  for (let i = 0; i < 2; i++) parts.push(box(1.9, 0.11, 0.04, WOOD, { y: 0.68 + i * 0.17, z: -0.28, rx: -0.15 }));
  for (const x of [-0.8, 0.8]) {
    parts.push(box(0.07, 0.44, 0.5, METAL, { x, y: 0.22 }));
    parts.push(box(0.07, 0.52, 0.06, METAL, { x, y: 0.7, z: -0.29 }));
  }
  return merge(parts);
}

function bin() {
  return merge([
    cyl(0.27, 0.23, 0.85, 8, 0x2f5d3a, { y: 0.45 }),
    cyl(0.3, 0.3, 0.08, 8, 0x22262a, { y: 0.9 }),
    cyl(0.29, 0.29, 0.06, 8, 0x3b7048, { y: 0.62 }),
  ]);
}

/** Fontene: rundt basseng med vann, søyle med skål og vannsprut. */
function fountain() {
  const STONE = 0xc4beb0, STONE2 = 0xd8d3c7, WATER = 0x4f9cc2, FOAM = 0xd9eef7;
  return merge([
    revolve([[0, -0.3], [3.5, -0.3], [3.5, 0.72], [3.12, 0.72], [3.12, 0.5], [0, 0.5]], 18, [STONE, STONE, STONE2, STONE, WATER]),
    cyl(0.32, 0.5, 1.4, 8, STONE, { y: 1.15 }),
    revolve([[0, 1.75], [1.15, 1.98], [1.15, 2.14], [0.98, 2.14], [0.98, 2.04], [0, 2.04]], 12, [STONE, STONE, STONE2, STONE, WATER]),
    cyl(0.1, 0.16, 0.9, 6, FOAM, { y: 2.45 }),
    cone(0.55, 0.7, 7, FOAM, { y: 3.0 }),
    cyl(1.05, 0.98, 0.6, 12, 0xa8d4ea, { y: 1.75 }),
  ]);
}

/** Stabel med trekasser og en pall. */
function crates() {
  const WOOD = 0xa07a4c, WOOD2 = 0x8c6a40, STRAP = 0x5c4a34;
  return merge([
    box(1.2, 1.0, 1.2, WOOD, { y: 0.5 }),
    box(1.24, 0.1, 1.24, STRAP, { y: 0.75 }),
    box(1.0, 0.9, 1.0, WOOD2, { x: 0.05, y: 1.45, ry: 0.3 }),
    box(1.1, 0.9, 1.1, WOOD2, { x: 1.25, y: 0.45, z: 0.2, ry: 0.15 }),
    box(1.14, 0.08, 1.14, STRAP, { x: 1.25, y: 0.6, z: 0.2, ry: 0.15 }),
    box(1.3, 0.14, 1.3, 0xb89a6a, { x: -1.15, y: 0.07, z: 0.3, ry: -0.2 }),
  ]);
}

// ---------- Trær ----------

/** Bytre (lind): rett stamme og en rund, tett krone. */
function cityTree() {
  const parts = [
    cyl(0.15, 0.23, 3.4, 6, BARK, { y: 1.7 }),
    cyl(0.07, 0.11, 1.4, 5, BARK, { x: 0.42, y: 3.25, rz: -0.6 }),
    cyl(0.07, 0.11, 1.3, 5, BARK, { x: -0.36, y: 3.15, z: 0.2, rz: 0.6 }),
  ];
  const greens = [0x4c7d33, 0x578b3a, 0x44722e, 0x5f9442];
  [[0, 4.9, 0, 1.95], [1.15, 4.3, 0.5, 1.35], [-1.05, 4.4, -0.5, 1.45], [0.2, 5.85, -0.2, 1.3], [-0.3, 4.55, 1.05, 1.25]]
    .forEach(([x, y, z, r], i) => parts.push(jIco(r, 1, greens[i % 4], r * 0.3, i * 13 + 3, { x, y, z })));
  return shadeVariation(merge(parts), 0.06, 4);
}

/** Jakaranda i full blomst: krokete stamme og en bred, lilla paraplykrone. */
function jacaranda() {
  const B2 = 0x4e4036;
  const parts = [
    cyl(0.16, 0.27, 3.0, 6, B2, { y: 1.5, rz: 0.05 }),
    cyl(0.07, 0.13, 2.3, 5, B2, { x: 0.75, y: 3.6, rz: -0.75 }),
    cyl(0.07, 0.13, 2.3, 5, B2, { x: -0.7, y: 3.6, z: 0.3, rz: 0.8, rx: 0.2 }),
    cyl(0.06, 0.11, 2.0, 5, B2, { y: 3.6, z: -0.7, rx: -0.75 }),
  ];
  const cols = [0x8c70c8, 0x9c82d6, 0x7d62b6, 0xa58fdc, 0x6d8a46];
  [[0, 5.3, 0, 2.1], [1.75, 4.8, 0.3, 1.55], [-1.7, 4.85, -0.2, 1.6], [0.3, 4.85, 1.65, 1.45], [-0.2, 4.95, -1.7, 1.5], [0.9, 5.6, -0.9, 1.1]]
    .forEach(([x, y, z, r], i) => parts.push(jIco(r, 1, cols[i % 5], r * 0.32, i * 17 + 5, { x, y, z, sy: 0.62 })));
  return shadeVariation(merge(parts), 0.07, 7);
}

// ---------- Flate gatedetaljer ----------

/** Fortausstykke (lengde L langs x, 3 m bredt) med heller og kantstein mot gata (+Z). Toppen ligger 0,1 m over bakken. */
function walk(L) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    parts.push(box(L / 3 + 0.002, 0.4, WALK - 0.3, SLAB[i & 1], { x: -L / 2 + ((i + 0.5) * L) / 3, y: -0.1, z: -0.15 }));
  }
  parts.push(box(L, 0.46, 0.3, CURB, { y: -0.1, z: WALK / 2 - 0.15 }));
  return merge(parts);
}

/** Hjørnestykke av fortauet (3 × 3 m) med kantstein mot +X og +Z. */
function corner() {
  return merge([
    box(WALK - 0.3, 0.4, WALK - 0.3, SLAB[0], { x: -0.15, y: -0.1, z: -0.15 }),
    box(WALK, 0.46, 0.3, CURB, { y: -0.1, z: WALK / 2 - 0.15 }),
    box(0.3, 0.46, WALK - 0.3, CURB, { x: WALK / 2 - 0.15, y: -0.1, z: -0.15 }),
  ]);
}

/** Midtrabatt i avenyene: gress mellom to kantsteiner, 4 m bred. */
function median(L) {
  return merge([
    box(L, 0.45, 3.5, 0x5b8a3c, { y: -0.08 }),
    box(L, 0.5, 0.25, CURB, { y: -0.08, z: 1.875 }),
    box(L, 0.5, 0.25, CURB, { y: -0.08, z: -1.875 }),
  ]);
}

const dash = () => merge([box(3, 0.12, 0.2, 0xe8e5d8, {})]);

/** Fotgjengerfelt: tre hvite striper langs gata (Z), halve gatebredden. */
const zebra = () => merge([-1.8, 0, 1.8].map((x) => box(0.55, 0.12, 2.8, 0xf0efe8, { x })));

// Fortaus- og rabattstykker: seks per kvartalsside (47 m; mot en aveny skaleres de ned til 43 m)
const SIDE = 47;

/** Byggere for biomet By. */
export const MODELS = {
  city_house: () => house(0xe3b58c, 0x9c3f2e, 0x8e5a44),
  city_house2: () => house(0xb7d3c0, 0x4d555e, 0x9a9389),
  city_villa: villa,
  city_apartment: apartment,
  city_block: highBlock,
  city_tower: tower,
  city_shop: () => shop(0xe8d5a6, 0xefe2bf, [0xb8352c, 0x2e7d4f], [0xc0392b, 0x2e8b57]),
  city_shop2: () => shop(0xd99a7a, 0xe6b597, [0x2a5b9a, 0xd98b1f], [0x2f6fb5, 0xe0892b]),
  city_warehouse: warehouse,
  city_car: () => car(0xb8322e),
  city_car2: () => car(0x2b5c8f, { len: 3.9, wid: 1.72, cabin: 2.0, cz: -0.35, roofH: 0.6 }),
  city_van: van,
  city_lamp: lamp,
  city_bench: bench,
  city_bin: bin,
  city_fountain: fountain,
  city_crates: crates,
  city_tree: cityTree,
  city_jacaranda: jacaranda,
  city_walk: () => walk(SIDE / 6),
  city_corner: corner,
  city_median: () => median(SIDE / 6),
  city_dash: dash,
  city_zebra: zebra,
};
