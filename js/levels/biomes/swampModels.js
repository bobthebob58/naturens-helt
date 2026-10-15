// 3D-modeller for biomet Sump: mangrovetrær med stylterøtter, sumpsypresser med hengende mose og knær, døde trær,
// knekte stammer, stubber, mosegrodde stokker, sumpbusker, siv, dunkjevle, vannliljer, gresstuer og sumpgress.
// Lavpolygon med vertex-farger (Lambert). Vegetasjonsmaterialet tegner bare forsiden, så tynne blader legges inn med
// begge vindinger. Pynten (decor) tegnes dobbeltsidig av kjernen og får en speilvendt kopi (se twoSidedDecor).
import * as THREE from 'three';
import { paint, xf, merge, jitter, shadeVariation, ico } from '../../models/geo.js';
import { jIco } from '../../models/vegetation.js';
import { mulberry32 } from '../../utils/math.js';

const TAU = Math.PI * 2;
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ca = new THREE.Color();
const _cb = new THREE.Color();

// ---------- Fargepalett ----------
const MANG_BARK = 0x6e5d4a;
const MANG_BARK_D = 0x51453a;
const ROOT = 0x7d6b55;
const ROOT_D = 0x4a3f33;
const MANG_LEAF = [0x32602b, 0x3b6c33, 0x2e5828, 0x447836];
const CYP_BARK = 0x7b6352;
const CYP_BARK_L = 0x8d7a66;
const CYP_BARK_D = 0x54453a;
const CYP_LEAF = [0x56703a, 0x4a6532, 0x627c40, 0x445e30];
const SPANISH_MOSS = [0x9ba489, 0xb0b69c, 0x8a957c];
const DEAD = 0x7a746a;
const DEAD_D = 0x544e46;
const DEAD_L = 0x9d988c;
const WOOD = 0xa08b6a;
const PEAT = 0x44382a;
const PEAT_L = 0x56472f;
const MOSS = 0x5b6d2f;
const MOSS_L = 0x6f7d38;
const FUNGUS = [0xd2b07a, 0xc08a4e];
const REED_BASE = 0x56622c;
const REED_TIP = 0x9fa75a;
const STRAW = 0xb4a46a;
const STRAW_D = 0x8a7c4e;
const PLUME = 0x8a7462;
const CATTAIL_LEAF = 0x4a6a35;
const CATTAIL_TIP = 0x84a05a;
const CATTAIL_HEAD = 0x5a3a22;
const PADS = [0x4a7a2c, 0x5a8b35, 0x3f6d29];
const PAD_EDGE = 0x6c7a34;
const SEDGE = 0x5b6630;
const SEDGE_TIP = 0xa9a45c;

// ---------- Hjelpere ----------

/** Geometri av rå trekanter (posisjoner + lineære farger), flate normaler. */
function rawGeo(B) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
  g.computeVertexNormals();
  return g;
}

const newBuf = () => ({ pos: [], col: [] });

/** Legg til en trekant (hopper over trekanter uten areal). two = også baksiden (motsatt vinding). */
function tri(B, a, b, c, ca, cb, cc, two = false) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * nx + ny * ny + nz * nz < 1e-12) return;
  B.pos.push(...a, ...b, ...c);
  B.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  if (two) {
    B.pos.push(...a, ...c, ...b);
    B.col.push(ca.r, ca.g, ca.b, cc.r, cc.g, cc.b, cb.r, cb.g, cb.b);
  }
}

/** Trekant som alltid vender oppover (vannliljeblader). */
function triUp(B, a, b, c, ca, cb, cc) {
  const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2];
  if (uz * vx - ux * vz >= 0) tri(B, a, b, c, ca, cb, cc);
  else tri(B, a, c, b, ca, cc, cb);
}

/**
 * Smalt, buet blad (siv, gress, dunkjevleblad) fra base langs asimut az.
 * h: høyde, lean: hvor langt ut spissen bøyer, w: bredde ved basen, segs: ledd. two: tosidig.
 */
function blade(B, base, az, h, lean, w, segs, c0, c1, two = true) {
  const dx = Math.cos(az), dz = Math.sin(az);
  const px = -dz * w * 0.5, pz = dx * w * 0.5;
  const A = new THREE.Color(c0), C = new THREE.Color(c1);
  let pl = null, pr = null, pc = null;
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const off = lean * Math.pow(t, 1.6);
    const y = base[1] + h * t * (1 - 0.1 * t);
    const cx = base[0] + dx * off, cz = base[2] + dz * off;
    const col = A.clone().lerp(C, t);
    if (s === segs) {
      tri(B, pl, pr, [cx, y, cz], pc, pc, col, two);
    } else {
      const k = 1 - t * 0.75;
      const L = [cx - px * k, y, cz - pz * k], R = [cx + px * k, y, cz + pz * k];
      if (pl) {
        tri(B, pl, pr, R, pc, pc, col, two);
        tri(B, pl, R, L, pc, col, col, two);
      }
      pl = L; pr = R; pc = col;
    }
  }
}

/** Pek normalene mer oppover (jevnere lys på tynne blader). */
function liftNormals(g, lift) {
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i) + lift, z = n.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(i, x / l, y / l, z / l);
  }
  return g;
}

/**
 * Gjør enkeltsidig pynt tosidig for det dobbeltsidige pyntmaterialet: en speilvendt kopi forskjøvet litt bakover,
 * slik at siden som vender mot kameraet alltid er en forside (ellers snus normalen og bladet blir svart).
 */
function twoSidedDecor(g, lift = 1.2, off = 0.01) {
  const p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color.array;
  const cnt = p.length / 3;
  const P = new Float32Array(p.length * 2), N = new Float32Array(p.length * 2), C = new Float32Array(p.length * 2);
  P.set(p); N.set(n); C.set(c);
  for (let t = 0; t < cnt; t += 3) {
    for (let j = 0; j < 3; j++) {
      const src = t + (j === 0 ? 0 : 3 - j), dst = cnt + t + j;
      for (let k = 0; k < 3; k++) {
        P[dst * 3 + k] = p[src * 3 + k] - n[src * 3 + k] * off;
        N[dst * 3 + k] = -n[src * 3 + k];
        C[dst * 3 + k] = c[src * 3 + k] * 0.9;
      }
    }
  }
  for (let i = 0; i < cnt * 2; i++) {
    const x = N[i * 3], y = N[i * 3 + 1] + lift, z = N[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return out;
}

/** Åpen sylinder fra punkt a til punkt b med fargeovergang c0 → c1. */
function tube(a, b, r0, r1, seg, c0, c1 = c0) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(0, len / 2, 0);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  _ca.set(c0);
  _cb.set(c1);
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / len;
    col[i * 3] = _ca.r + (_cb.r - _ca.r) * t;
    col[i * 3 + 1] = _ca.g + (_cb.g - _ca.g) * t;
    col[i * 3 + 2] = _ca.b + (_cb.b - _ca.b) * t;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  _dir.set(dx / len, dy / len, dz / len);
  _q.setFromUnitVectors(_up, _dir);
  g.applyQuaternion(_q);
  g.translate(a[0], a[1], a[2]);
  return g;
}

/** Kjede av rør gjennom flere punkter (stammer, greiner, røtter). */
function limb(points, radii, seg, c0, c1 = c0) {
  const parts = [];
  const A = new THREE.Color(c0), B = new THREE.Color(c1);
  const n = points.length - 1;
  for (let i = 0; i < n; i++) {
    const col0 = A.clone().lerp(B, i / n).getHex(), col1 = A.clone().lerp(B, (i + 1) / n).getHex();
    parts.push(tube(points[i], points[i + 1], radii[i], radii[i + 1], seg, col0, col1));
  }
  return parts;
}

/** Multipliser fargene med en faktor som går fra k0 (y0) til k1 (y1). */
function shadeY(g, y0, y1, k0, k1) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
    const k = k0 + (k1 - k0) * t;
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return g;
}

/** Farg trekanter etter normalen (f.eks. mose på oversiden). fn(ny, nx, r) returnerer farge eller null. */
function recolorFaces(g, seed, fn) {
  const n = g.attributes.normal, c = g.attributes.color;
  for (let i = 0; i < n.count; i += 3) {
    const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
    const nx = (n.getX(i) + n.getX(i + 1) + n.getX(i + 2)) / 3;
    const k = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    const col = fn(ny, nx, k - Math.floor(k));
    if (col == null) continue;
    _ca.set(col);
    for (let j = 0; j < 3; j++) c.setXYZ(i + j, _ca.r, _ca.g, _ca.b);
  }
  return g;
}

/** Hengende «spansk mose»: tynn, ujevn kjegle som peker nedover fra (x, y, z). */
function mossStrand(x, y, z, len, r, color, seed) {
  const g = jitter(paint(new THREE.ConeGeometry(r, len, 3, 1, true), color), r * 0.5, seed);
  return xf(g, { x, y: y - len / 2, z, rx: Math.PI, ry: seed });
}

/**
 * Lavpolygon løvklump: jitret dodekaeder (36 trekanter), eller ikosaeder (20 trekanter) med small = true.
 * Litt oppskalert så den fyller omtrent like mye som en ikosaeder med detalj 1 (80 trekanter) med samme radius.
 */
function lump(r, color, amount, seed, t, small = false) {
  const geo = small ? new THREE.IcosahedronGeometry(r * 1.1, 0) : new THREE.DodecahedronGeometry(r * 1.06, 0);
  return xf(jitter(paint(geo, color), amount, seed), t);
}

/** Liten oktaeder (8 trekanter) – blomsterhoder, knopper. */
function octa(r, color, t) {
  return xf(paint(new THREE.OctahedronGeometry(r, 0), color), t);
}

/**
 * Kvadratisk lokk (2 trekanter) for et firesidet rør/kjegle med hjørneradius r (hjørnene treffer rørets hjørner).
 * Vender opp, eller ned med down = true. Billigere enn sylinderens vifte-lokk (4 trekanter).
 */
function quadCap(r, color, t, down = false) {
  const g = paint(new THREE.PlaneGeometry(r * Math.SQRT2, r * Math.SQRT2), color);
  xf(g, { rz: Math.PI / 4, rx: down ? Math.PI / 2 : -Math.PI / 2 });
  return xf(g, t);
}

/** Kjuke (halv soppskive) på siden av en stamme med sentrum (cx, cz) og radius R, i retning a (rad i xz-planet). */
function shelfFungus(cx, y, cz, R, a, r, color) {
  const g = paint(new THREE.CylinderGeometry(r, r * 0.9, r * 0.28, 4, 1, false, 0, Math.PI), color);
  return xf(g, { x: cx + Math.cos(a) * R * 0.85, y, z: cz + Math.sin(a) * R * 0.85, ry: -a });
}

// ---------- Trær ----------

/** Mangrove: krone på en stamme som bæres oppe av buede stylterøtter, pluss luftrøtter fra greinene. */
function mangrove() {
  const rnd = mulberry32(17);
  const parts = [];
  parts.push(...limb([[0, 0.6, 0], [0.04, 1.6, 0.02], [0.14, 3.0, 0.08], [0.22, 4.3, 0.06]], [0.12, 0.22, 0.18, 0.13], 5, MANG_BARK_D, MANG_BARK));
  // Stylterøtter som buer ut fra stammen og ned i gjørma (tynne – trekantet tverrsnitt holder)
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + (rnd() - 0.5) * 0.5;
    const ca = Math.cos(a), sa = Math.sin(a);
    const y0 = 1.0 + rnd() * 1.5;
    const R = 1.4 + rnd() * 1.1;
    const up = 0.15 + rnd() * 0.3;
    const p = (k, y) => [ca * k, y, sa * k];
    parts.push(...limb([p(0.1, y0), p(R * 0.38, y0 + up), p(R * 0.8, y0 * 0.55 + 0.1), p(R, -0.45)],
      [0.085, 0.075, 0.062, 0.055], 3, ROOT, ROOT_D));
  }
  const crown = [[0.3, 5.6, 0, 1.75], [1.5, 5.0, 0.6, 1.3], [-1.1, 5.2, -0.5, 1.35], [0.5, 6.3, -0.9, 1.15],
    [-0.5, 4.9, 1.2, 1.25], [1.1, 4.7, -1.2, 1.05]];
  for (const [x, y, z] of crown.slice(1)) {
    parts.push(...limb([[0.2, 3.9, 0.06], [x * 0.65, y - 0.5, z * 0.65]], [0.1, 0.05], 3, MANG_BARK, MANG_BARK));
  }
  // Luftrøtter som henger rett ned fra greinene (ett rett rør hver)
  for (const [x, z] of [[1.15, 0.45], [-0.85, -0.4], [-0.35, 0.9], [0.7, -0.85]]) {
    parts.push(tube([x, 4.4, z], [x * 1.08, -0.35, z * 1.08], 0.035, 0.03, 3, ROOT, ROOT_D));
  }
  // Tett, mørk og blank krone: hovedklumpen som dodekaeder, de mindre som litt større ikosaedre (holder kronebredden)
  const leaves = crown.map(([x, y, z, r], i) =>
    (i ? lump(r * 1.06, MANG_LEAF[i % 4], r * 0.3, i * 13 + 3, { x, y, z, sy: 0.72 }, true)
      : lump(r, MANG_LEAF[0], r * 0.3, 3, { x, y, z, sy: 0.72 })));
  for (const l of leaves) shadeY(l, 4.0, 6.6, 0.82, 1.1);
  parts.push(...leaves);
  const g = merge(parts);
  shadeY(g, -0.3, 1.3, 0.55, 1); // våt og gjørmete nederst
  return shadeVariation(g, 0.06, 7);
}

/** Sumpsypress: riflet, utvidet stammefot, «knær» rundt foten, flat lagdelt krone med hengende mose. */
function cypress() {
  const rnd = mulberry32(29);
  const parts = [];
  // Utvidet, riflet stammefot (fra under bakken til 2,3 m). Ringene ligger tettest nederst, der foten buer mest.
  const foot = new THREE.CylinderGeometry(1, 1, 1, 10, 3, true).toNonIndexed();
  foot.deleteAttribute('uv');
  const p = foot.attributes.position;
  const ringT = [0, 0.2, 0.5, 1];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const t = ringT[Math.round((p.getY(i) + 0.5) * 3)];
    const y = -0.3 + 2.6 * t;
    const a = Math.atan2(z, x);
    const R = (0.34 + 0.72 * Math.pow(1 - t, 2.4)) * (1 + 0.28 * Math.pow(1 - t, 1.5) * Math.cos(a * 5 + 0.4));
    p.setXYZ(i, Math.cos(a) * R, y, Math.sin(a) * R);
  }
  const footG = jitter(paint(foot, CYP_BARK), 0.05, 2);
  shadeY(footG, -0.3, 2.3, 0.75, 1);
  parts.push(footG);
  parts.push(tube([0, 2.2, 0], [0.1, 12.6, 0], 0.34, 0.12, 6, CYP_BARK, CYP_BARK_L));
  // Sypressknær som stikker opp av gjørma
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rnd() * 0.8, d = 1.4 + rnd() * 1.0, h = 0.35 + rnd() * 0.45;
    const k = jitter(paint(new THREE.ConeGeometry(0.1 + rnd() * 0.07, h, 4, 1, true), CYP_BARK_D), 0.035, i + 4);
    parts.push(xf(k, { x: Math.cos(a) * d, y: h / 2 - 0.15, z: Math.sin(a) * d }));
  }
  // Flat, lagdelt krone (de to minste, nederste lagene som ikosaedre)
  const crown = [[0, 12.8, 0, 2.2, 0.5], [1.9, 11.2, 0.6, 1.9, 0.48], [-1.7, 10.6, -0.7, 2.0, 0.46],
    [0.6, 9.6, -1.9, 1.7, 0.5], [-0.7, 9.0, 1.8, 1.8, 0.48], [2.3, 8.3, -0.6, 1.5, 0.5], [-2.2, 7.9, 0.5, 1.4, 0.5]];
  crown.forEach(([x, y, z, r, sy], i) => {
    // Toppen sitter rett på stammen og trenger ingen grein
    if (i > 0) parts.push(tube([0.05, y - 0.7, 0.03], [x * 0.75, y - 0.25, z * 0.75], 0.11, 0.05, 3, CYP_BARK, CYP_BARK_L));
    const blob = lump(r, CYP_LEAF[i % 4], r * 0.32, i * 7 + 5, { x, y, z, sy }, i >= 5);
    shadeY(blob, y - r * sy, y + r * sy, 0.8, 1.12);
    parts.push(blob);
    // Spansk mose under hvert kronelag
    const n = i === 0 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU, d = r * (0.3 + rnd() * 0.55);
      const mx = x + Math.cos(a) * d, mz = z + Math.sin(a) * d;
      parts.push(mossStrand(mx, y - r * sy * 0.35, mz, 1.2 + rnd() * 1.7, 0.16 + rnd() * 0.1, SPANISH_MOSS[(i + k) % 3], i * 5 + k));
    }
  });
  return shadeVariation(merge(parts), 0.05, 11);
}

/** Dødt tre: gråbleket stamme med knekt topp, nakne greiner og litt hengende mose. */
function deadTree() {
  const parts = [];
  parts.push(...limb([[0, -0.3, 0], [0.08, 2.6, 0.04], [0.02, 5.2, 0.18], [0.16, 7.6, 0.1]], [0.36, 0.26, 0.17, 0.09], 5, DEAD_D, DEAD_L));
  parts.push(xf(jitter(paint(new THREE.ConeGeometry(0.09, 0.55, 5, 1, true), DEAD_L), 0.05, 3), { x: 0.17, y: 7.85, z: 0.1, rz: -0.12 }));
  const br = [[2.4, 0.3, 1.7, 2.0], [3.5, 2.5, 1.4, 1.9], [4.5, 4.4, 1.2, 1.7], [5.5, 1.0, 1.0, 1.4], [6.4, 3.4, 0.8, 1.1]];
  br.forEach(([y, a, len, rise], i) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    const p0 = [0.06, y, 0.08], p1 = [ca * len * 0.55, y + rise * 0.45, sa * len * 0.55], p2 = [ca * len, y + rise, sa * len];
    parts.push(...limb([p0, p1, p2], [0.085, 0.05, 0.018], 3, DEAD, DEAD_L));
    parts.push(...limb([p1, [p1[0] + Math.cos(a + 0.9) * 0.6, p1[1] + 0.55, p1[2] + Math.sin(a + 0.9) * 0.6]], [0.035, 0.012], 3, DEAD, DEAD_L));
    parts.push(mossStrand(p1[0], p1[1] - 0.05, p1[2], 1.0 + (i % 3) * 0.4, 0.14, SPANISH_MOSS[i % 3], i + 21));
  });
  const g = merge(parts);
  shadeY(g, -0.3, 1.0, 0.6, 1);
  return shadeVariation(g, 0.05, 13);
}

/** Knekt, lav stamme (står ofte ute i vannet) med splintret topp og kjuker. */
function snag() {
  const parts = [];
  parts.push(...limb([[0, -0.4, 0], [0.14, 1.8, 0.05], [0.34, 3.6, 0.1]], [0.38, 0.31, 0.25], 6, DEAD_D, DEAD));
  // Lukk toppen med en lys bruddflate og noen splinter
  parts.push(xf(jitter(paint(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 6), WOOD), 0.05, 6), { x: 0.34, y: 3.6, z: 0.1, rz: -0.1 }));
  [[0.12, 0.06, 0.9, 0.1], [-0.14, 0.1, 0.6, -0.2], [0.03, -0.16, 0.7, 0.3]].forEach(([dx, dz, h, t], i) => {
    parts.push(xf(paint(new THREE.ConeGeometry(0.075, h, 4, 1, true), i ? DEAD_L : WOOD), { x: 0.34 + dx, y: 3.6 + h / 2, z: 0.1 + dz, rz: t, rx: dz }));
  });
  parts.push(tube([0.22, 2.4, 0.05], [0.95, 3.0, 0.4], 0.09, 0.045, 3, DEAD, DEAD_L));
  parts.push(shelfFungus(0.13, 1.6, 0.04, 0.32, 0.5, 0.22, FUNGUS[0]), shelfFungus(0.2, 2.3, 0.07, 0.3, 2.8, 0.17, FUNGUS[1]));
  const g = merge(parts);
  shadeY(g, -0.4, 1.2, 0.55, 1);
  return shadeVariation(g, 0.06, 17);
}

/** Råtten stubbe med mose på toppen og kjuker på siden. */
function stump() {
  const body = jitter(paint(new THREE.CylinderGeometry(0.34, 0.46, 1.15, 8, 2), DEAD), 0.07, 9);
  xf(body, { y: 0.43 });
  recolorFaces(body, 4, (ny, nx, r) => (ny > 0.6 ? (r < 0.45 ? MOSS : r < 0.7 ? MOSS_L : WOOD) : null));
  const parts = [body];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.3;
    parts.push(xf(paint(new THREE.ConeGeometry(0.07, 0.35 + (i % 2) * 0.2, 4, 1, true), i % 2 ? DEAD_L : WOOD),
      { x: Math.cos(a) * 0.24, y: 1.1, z: Math.sin(a) * 0.24, rz: -Math.cos(a) * 0.25, rx: Math.sin(a) * 0.25 }));
  }
  parts.push(shelfFungus(0, 0.55, 0, 0.44, 0.1, 0.2, FUNGUS[0]), shelfFungus(0, 0.8, 0, 0.4, 1.5, 0.16, FUNGUS[1]),
    shelfFungus(0, 0.35, 0, 0.45, 3.6, 0.15, FUNGUS[0]));
  const g = merge(parts);
  shadeY(g, -0.1, 0.6, 0.65, 1);
  return shadeVariation(g, 0.05, 19);
}

/** Mosegrodd, halvt nedsunket stokk. */
function swampLog() {
  const body = jitter(paint(new THREE.CylinderGeometry(0.3, 0.26, 3.8, 8, 3), DEAD_D), 0.05, 12);
  xf(body, { y: 0.22, rz: Math.PI / 2 });
  recolorFaces(body, 6, (ny, nx, r) => (Math.abs(nx) > 0.85 ? WOOD : ny > 0.4 ? (r < 0.55 ? MOSS : MOSS_L) : null));
  const parts = [body];
  parts.push(tube([0.6, 0.35, 0.1], [1.0, 0.75, 0.55], 0.07, 0.03, 3, DEAD, DEAD_L));
  parts.push(shelfFungus(-0.8, 0.22, 0, 0.29, Math.PI / 2, 0.15, FUNGUS[0]));
  return shadeVariation(merge(parts), 0.05, 23);
}

// ---------- Busker og vannplanter ----------

/** Mørk sumpbusk (knappebusk) med hvite, runde blomsterhoder. */
function swampBush() {
  const greens = [0x3a5a2c, 0x446631, 0x355228, 0x4a6a34];
  const parts = [];
  [[0, 0.75, 0, 0.8], [0.62, 0.55, 0.25, 0.62], [-0.55, 0.6, -0.2, 0.66], [0.15, 0.58, -0.62, 0.6], [-0.2, 1.1, 0.3, 0.55]]
    .forEach(([x, y, z, r], i) => parts.push(lump(r, greens[i % 4], r * 0.35, i * 5 + 2, { x, y, z, sy: 0.85 })));
  const flowers = [[0.5, 1.15, 0.45], [-0.6, 1.0, 0.35], [0.1, 1.55, 0.1], [0.75, 0.75, -0.4], [-0.4, 0.95, -0.65], [-0.75, 0.55, 0.3]];
  flowers.forEach(([x, y, z], i) => parts.push(octa(0.1, i % 3 ? 0xece6d0 : 0xd8d2b8, { x, y, z, ry: i })));
  const g = merge(parts);
  shadeY(g, 0, 1.4, 0.7, 1.08);
  return shadeVariation(g, 0.07, 29);
}

/** Siv: tett tust av lange, smale strå (noen visne) og noen stengler med brune topper. */
function reeds() {
  const rnd = mulberry32(53);
  const B = newBuf();
  for (let i = 0; i < 16; i++) {
    const a = rnd() * TAU, d = rnd() * 0.38;
    const dead = rnd() < 0.25;
    const az = a + (rnd() - 0.5) * 0.7, h = 1.3 + rnd() * 1.0, lean = 0.15 + rnd() * 0.45, w = 0.055 + rnd() * 0.03;
    // Bare strå som lener mye trenger et knekkpunkt; resten er rette (buen synes knapt)
    blade(B, [Math.cos(a) * d, -0.15, Math.sin(a) * d], az, h, lean, w, lean > 0.45 ? 2 : 1,
      dead ? STRAW_D : REED_BASE, dead ? STRAW : REED_TIP);
  }
  const g = liftNormals(rawGeo(B), 0.5);
  const parts = [g];
  // Stengler med fjærlette, brunlilla topper (takrør)
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6 + 0.4, d = 0.15 + (i % 2) * 0.12;
    const h = 2.1 + (i % 3) * 0.2;
    const top = [Math.cos(a) * (d + 0.25), h, Math.sin(a) * (d + 0.25)];
    parts.push(tube([Math.cos(a) * d, -0.1, Math.sin(a) * d], top, 0.018, 0.012, 3, REED_BASE, STRAW));
    // Smal, ujevn dusk som lener seg litt utover fra stengeltoppen
    const tilt = 0.45, len = 0.5;
    // Duskene henger over øyehøyde, så bunnen lukkes med et to-trekants lokk (jitres sammen med kjeglen, så kantene følger)
    const plume = merge([paint(new THREE.ConeGeometry(0.06, len, 4, 1, true), PLUME), quadCap(0.06, PLUME, { y: -len / 2 }, true)]);
    parts.push(xf(jitter(plume, 0.025, i + 7), {
      x: top[0] + Math.cos(a) * Math.sin(tilt) * len * 0.5, y: top[1] + Math.cos(tilt) * len * 0.5 - 0.06,
      z: top[2] + Math.sin(a) * Math.sin(tilt) * len * 0.5, rz: -Math.cos(a) * tilt, rx: Math.sin(a) * tilt,
    }));
  }
  return merge(parts);
}

/** Dunkjevle: lange, buede blader og stengler med brune, pølseformede kolber. */
function cattail() {
  const rnd = mulberry32(67);
  const B = newBuf();
  for (let i = 0; i < 11; i++) {
    const a = rnd() * TAU, d = rnd() * 0.25;
    const h = 1.2 + rnd() * 0.8, lean = 0.3 + rnd() * 0.5, w = 0.075 + rnd() * 0.03, tip = rnd() < 0.3 ? STRAW : CATTAIL_TIP;
    blade(B, [Math.cos(a) * d, -0.15, Math.sin(a) * d], a, h, lean, w, lean > 0.55 ? 2 : 1, CATTAIL_LEAF, tip);
  }
  const parts = [liftNormals(rawGeo(B), 0.5)];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.27 + 0.2, d = 0.06 + (i % 3) * 0.07;
    const h = 1.75 + ((i * 7) % 5) * 0.13;
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
    const tx = bx + Math.cos(a) * 0.12, tz = bz + Math.sin(a) * 0.12;
    parts.push(tube([bx, -0.1, bz], [tx, h, tz], 0.02, 0.014, 3, CATTAIL_LEAF, CATTAIL_TIP));
    // Kolbe: firesidet rør med to-trekants lokk i begge ender (kolbene står i øyehøyde, så åpne ender synes)
    parts.push(xf(paint(new THREE.CylinderGeometry(0.052, 0.058, 0.34, 4, 1, true), CATTAIL_HEAD), { x: tx, y: h - 0.3, z: tz }));
    parts.push(quadCap(0.052, CATTAIL_HEAD, { x: tx, y: h - 0.13, z: tz }), quadCap(0.058, CATTAIL_HEAD, { x: tx, y: h - 0.47, z: tz }, true));
    // Spissen uten endeflate (bunnen står inne i kolba)
    parts.push(xf(paint(new THREE.ConeGeometry(0.013, 0.28, 3, 1, true), STRAW_D), { x: tx, y: h + 0.01, z: tz }));
  }
  return merge(parts);
}

/** Vannliljer: flytende blader med hakk og én hvit/rosa blomst og én knopp. Ligger i vannflaten. */
function lily() {
  const rnd = mulberry32(61);
  const B = newBuf();
  const edge = new THREE.Color(PAD_EDGE);
  const pads = [[0, 0, 0.5], [0.8, 0.3, 0.38], [-0.62, 0.45, 0.42], [0.2, -0.8, 0.35], [-0.5, -0.6, 0.3], [1.0, -0.55, 0.27], [-1.05, -0.1, 0.24]];
  pads.forEach(([x, z, r], i) => {
    const notch = rnd() * TAU, segs = r > 0.45 ? 8 : r > 0.36 ? 7 : r > 0.28 ? 6 : 5, gap = 0.55;
    const c = new THREE.Color(PADS[i % 3]);
    const ce = c.clone().lerp(edge, 0.45);
    const y = 0.004 * i;
    for (let s = 0; s < segs; s++) {
      const a0 = notch + gap / 2 + ((TAU - gap) * s) / segs, a1 = notch + gap / 2 + ((TAU - gap) * (s + 1)) / segs;
      triUp(B, [x, y + 0.01, z], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], c, ce, ce);
    }
  });
  // Blomst på det største bladet
  const white = new THREE.Color(0xf4f1ec), pink = new THREE.Color(0xf0b4c8), base = new THREE.Color(0xe8e0c8);
  const fx = 0.12, fz = 0.05;
  for (let layer = 0; layer < 2; layer++) {
    const n = layer ? 5 : 7, len = layer ? 0.17 : 0.26, rise = layer ? 0.17 : 0.1, y0 = 0.03 + layer * 0.02;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + layer * 0.3;
      const tip = [fx + Math.cos(a) * len, y0 + rise, fz + Math.sin(a) * len];
      const l = [fx + Math.cos(a - 0.4) * 0.04, y0, fz + Math.sin(a - 0.4) * 0.04];
      const r = [fx + Math.cos(a + 0.4) * 0.04, y0, fz + Math.sin(a + 0.4) * 0.04];
      tri(B, l, r, tip, base, base, layer ? pink : white, true);
    }
  }
  const parts = [liftNormals(rawGeo(B), 0.3)];
  parts.push(octa(0.072, 0xf2c63a, { x: fx, y: 0.08, z: fz }));
  parts.push(octa(0.08, 0xe89ab6, { x: -0.6, y: 0.12, z: 0.42, sy: 1.3, ry: 0.4 }));
  return merge(parts);
}

/** Andemat: flytende, flekkete flak av bittesmå blader som ligger i vannflaten (noen løse småflak rundt). */
function duckweed() {
  const rnd = mulberry32(91);
  const B = newBuf();
  const cA = new THREE.Color(0x6e8c30), cB = new THREE.Color(0x5a7a2a), cC = new THREE.Color(0x88a23e);
  const blob = (cx, cz, R, n, y) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, r = R * (0.6 + rnd() * 0.5);
      pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
    }
    for (let i = 0; i < n; i++) triUp(B, [cx, y, cz], pts[i], pts[(i + 1) % n], rnd() < 0.5 ? cA : cC, cB, cB);
  };
  blob(0, 0, 1.6, 11, 0);
  blob(1.75, 0.6, 0.6, 6, 0.004);
  blob(-1.55, -0.9, 0.5, 6, 0.006);
  blob(0.4, -1.85, 0.45, 5, 0.008);
  blob(-0.8, 1.65, 0.4, 5, 0.005);
  return merge([rawGeo(B)]);
}

/** Tue: torvhaug med mose på toppen og en tust med starr. */
function tussock() {
  const rnd = mulberry32(71);
  const mound = jIco(0.75, 1, PEAT, 0.22, 5, { y: 0.1, sy: 0.5 });
  recolorFaces(mound, 3, (ny, nx, r) => (ny > 0.55 ? (r < 0.5 ? MOSS : MOSS_L) : r < 0.5 ? PEAT_L : null));
  const B = newBuf();
  for (let i = 0; i < 22; i++) {
    const a = rnd() * TAU, d = rnd() * 0.4;
    blade(B, [Math.cos(a) * d, 0.4 - d * 0.35, Math.sin(a) * d], a, 0.55 + rnd() * 0.6, 0.25 + rnd() * 0.4, 0.065, 2,
      SEDGE, rnd() < 0.3 ? STRAW : SEDGE_TIP);
  }
  return merge([mound, liftNormals(rawGeo(B), 0.6)]);
}

// ---------- Pynt (decor) ----------

/** Gresstust av enkle strå (tosidig for pyntmaterialet). */
function tuft(seed, n, h0, h1, lean0, lean1, w, c0, c1, c2) {
  const rnd = mulberry32(seed);
  const B = newBuf();
  const A = new THREE.Color(c0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd() * 0.6, d = 0.05 + rnd() * 0.18;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    const h = h0 + rnd() * (h1 - h0), lean = lean0 + rnd() * (lean1 - lean0);
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    const tip = new THREE.Color(rnd() < 0.3 ? c2 : c1);
    tri(B, [cx - px, 0, cz - pz], [cx + px, 0, cz + pz], [cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean], A, A, tip);
  }
  return twoSidedDecor(rawGeo(B));
}

function swampGrass() {
  return merge([tuft(81, 11, 0.45, 0.85, 0.12, 0.3, 0.045, 0x3a4622, 0x93a04c, 0xb0a85e)]);
}

function swampSedge() {
  return merge([tuft(83, 9, 0.75, 1.2, 0.2, 0.42, 0.04, 0x46502a, 0xa8864a, 0x9aa050)]);
}

/** Sumpgress med lilla blomsteraks (pontederia) og gule soleihov. */
function swampFlowers() {
  const parts = [tuft(87, 8, 0.4, 0.75, 0.12, 0.28, 0.045, 0x3a4622, 0x8a9a48, 0xa8a45a)];
  [[0.1, 0.72, 0.05], [-0.12, 0.64, 0.1], [0.04, 0.68, -0.14]].forEach(([x, y, z], i) =>
    parts.push(ico(0.045, 0, i % 2 ? 0x8a64d0 : 0x7452bc, { x, y, z, sy: 2.6 })));
  [[0.2, 0.32, -0.08], [-0.18, 0.28, -0.12]].forEach(([x, y, z]) => parts.push(ico(0.05, 0, 0xf2cc32, { x, y, z, sy: 0.6 })));
  return merge(parts);
}

export const MODELS = {
  swamp_mangrove: mangrove,
  swamp_cypress: cypress,
  swamp_deadTree: deadTree,
  swamp_snag: snag,
  swamp_stump: stump,
  swamp_log: swampLog,
  swamp_bush: swampBush,
  swamp_reeds: reeds,
  swamp_cattail: cattail,
  swamp_lily: lily,
  swamp_duckweed: duckweed,
  swamp_tussock: tussock,
  swamp_grass: swampGrass,
  swamp_sedge: swampSedge,
  swamp_flowers: swampFlowers,
};
