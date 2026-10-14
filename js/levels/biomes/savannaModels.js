// 3D-modeller for biomet Savanne: paraplyakasier (flat krone), baobab-trær (tykk flaskestamme), termittuer,
// tørre busker, tornekratt, kandelabertrær (euphorbia), døde trær, avrundede kopje-steinblokker og gyllent gress.
// Lavpolygon med vertex-farger (Lambert). Pyntgresset tegnes med det dobbeltsidige pyntmaterialet (samme normal på
// begge sider), så det holder med én flate per strå. Elefantgress-tuene er vanlig vegetasjon (bare forsiden tegnes)
// og får derfor en speilvendt kopi (twoSided).
import * as THREE from 'three';
import { paint, xf, merge, jitter, shadeVariation, cone } from '../../models/geo.js';
import { jIco } from '../../models/vegetation.js';
import { mulberry32 } from '../../utils/math.js';

const TAU = Math.PI * 2;
const _ca = new THREE.Color();
const _cb = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();

// ---------- Fargepalett ----------
const BARK = 0x56473a;
const BARK_DARK = 0x3f342b;
const BARK_LIGHT = 0x6b5b4b;
const BAOBAB = [0x7c6d5f, 0x998977, 0xa69582];
const DEADWOOD = [0x857c70, 0xa49c8f];
const ACACIA = { top: 0x6f8a3c, mid: 0x5b7834, bot: 0x4b6230 };
const ACACIA_WIDE = { top: 0x7d9343, mid: 0x657e37, bot: 0x516733 };
const LATERITE = [0x8c4a30, 0xa65d3c, 0xbf7a52];
const GRANITE = [0xa89787, 0xb7a796, 0x93857a, 0xb09c78];
const STRAW = { base: 0x6e5830, mid: 0xbb9346, tip: 0xd9bb72 };
const RUST = [0x9c4f2c, 0xb4683a];

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

  /** Trekant snudd slik at forsiden peker bort fra referansepunktet o. */
  otri(a, b, c, o, ca, cb = ca, cc = ca) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3 - o[0], my = (a[1] + b[1] + c[1]) / 3 - o[1], mz = (a[2] + b[2] + c[2]) / 3 - o[2];
    if (nx * mx + ny * my + nz * mz >= 0) this.tri(a, b, c, ca, cb, cc);
    else this.tri(a, c, b, ca, cc, cb);
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

/** Fargelegg en geometri med overgang c0 → c1 etter høyden (y0..y1). Fjerner indeks og UV. */
function paintY(geo, y0, y1, c0, c1) {
  const g = paint(geo, c0);
  const p = g.attributes.position, c = g.attributes.color;
  _ca.set(c0);
  _cb.set(c1);
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
    c.setXYZ(i, _ca.r + (_cb.r - _ca.r) * t, _ca.g + (_cb.g - _ca.g) * t, _ca.b + (_cb.b - _ca.b) * t);
  }
  return g;
}

/**
 * Åpen sylinder (uten lokk) fra punkt a til punkt b, med fargeovergang c0 → c1. Røret forlenges litt forbi b
 * slik at leddene i en kjede (limb) overlapper og ikke viser glipper i knekkene.
 */
function tube(a, b, r0, r1, seg, c0, c1 = c0) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const d = Math.hypot(dx, dy, dz);
  const len = d + r1 * 0.8;
  const g = paintY(new THREE.CylinderGeometry(r1, r0, len, seg, 1, true).translate(0, len / 2, 0), 0, len, c0, c1);
  _dir.set(dx / d, dy / d, dz / d);
  _q.setFromUnitVectors(_up, _dir);
  g.applyQuaternion(_q);
  g.translate(a[0], a[1], a[2]);
  return g;
}

/** Kjede av rør gjennom flere punkter (stammer og greiner). */
function limb(points, radii, seg, c0, c1 = c0) {
  const parts = [];
  const a = col(c0), b = col(c1);
  const n = points.length - 1;
  for (let i = 0; i < n; i++) {
    const k0 = a.clone().lerp(b, i / n).getHex(), k1 = a.clone().lerp(b, (i + 1) / n).getHex();
    parts.push(tube(points[i], points[i + 1], radii[i], radii[i + 1], seg, k0, k1));
  }
  return parts;
}

/** Løft normalene oppover (gress lyses jevnt, som bakken under). */
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
 * Gjør tynne flater (gresstrå) dobbeltsidige for det enkeltsidige vegetasjonsmaterialet: en speilvendt kopi med
 * motsatt normal, forskjøvet litt bakover. Pynt (decor) trenger ikke dette.
 */
function twoSided(g, lift = 2, off = 0.012) {
  const p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color.array;
  const cnt = p.length / 3;
  const P = new Float32Array(p.length * 2), N = new Float32Array(p.length * 2), C = new Float32Array(p.length * 2);
  P.set(p); N.set(n); C.set(c);
  for (let t = 0; t < cnt; t += 3) {
    for (let j = 0; j < 3; j++) {
      const src = t + (j === 0 ? 0 : 3 - j), dst = cnt + t + j; // omvendt rekkefølge: 0, 2, 1
      for (let k = 0; k < 3; k++) {
        P[dst * 3 + k] = p[src * 3 + k] - n[src * 3 + k] * off;
        N[dst * 3 + k] = -n[src * 3 + k];
        C[dst * 3 + k] = c[src * 3 + k] * 0.92;
      }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return liftNormals(out, lift);
}

// ---------- Akasie ----------

/** Flat, lagdelt kroneskive (paraplyform) med ujevn, fliket kant. Origo midt i skiva. */
function canopyPad(r, thick, seg, rnd, pal, t) {
  const T = new Tris();
  const A = [], B = [], C = [];
  const ph = rnd() * TAU;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU + (rnd() - 0.5) * 0.3;
    const rr = r * (0.84 + rnd() * 0.26 + Math.sin(a * 3 + ph) * 0.07);
    A.push([Math.cos(a) * rr * 0.76, thick * (0.38 + rnd() * 0.14), Math.sin(a) * rr * 0.76]);
    B.push([Math.cos(a) * rr, (rnd() - 0.5) * thick * 0.3, Math.sin(a) * rr]);
    C.push([Math.cos(a) * rr * 0.72, -thick * (0.38 + rnd() * 0.1), Math.sin(a) * rr * 0.72]);
  }
  const top = [0, thick * 0.6, 0], bot = [0, -thick * 0.48, 0], o = [0, 0, 0];
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    const f = 0.9 + rnd() * 0.2;
    const cTop = tint(pal.top, f), cMid = tint(pal.mid, f), cBot = tint(pal.bot, f);
    T.otri(top, A[i], A[j], o, tint(pal.top, f * 1.06), cTop, cTop);
    T.otri(A[i], A[j], B[j], o, cTop, cTop, cMid);
    T.otri(A[i], B[j], B[i], o, cTop, cMid, cMid);
    T.otri(B[i], B[j], C[j], o, cMid, cMid, cBot);
    T.otri(B[i], C[j], C[i], o, cMid, cBot, cBot);
    T.otri(bot, C[j], C[i], o, cBot);
  }
  return xf(softenUnderside(T.geo()), t);
}

/**
 * Kroneundersiden: vri nedovervendte flatenormaler ut mot kanten, slik at undersiden får litt himmellys og ikke
 * blir helt svart når man står under treet. Origo må være midt i kroneskiva.
 */
function softenUnderside(g) {
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i += 3) {
    if (n.getY(i) >= -0.05) continue;
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const l = Math.hypot(cx, cz) || 1;
    for (let j = i; j < i + 3; j++) {
      const x = n.getX(j) * 0.4 + (cx / l) * 0.8, y = n.getY(j) * 0.3, z = n.getZ(j) * 0.4 + (cz / l) * 0.8;
      const m = Math.hypot(x, y, z) || 1;
      n.setXYZ(j, x / m, y / m, z / m);
    }
  }
  return g;
}

/** Paraplyakasie: skjev stamme som deler seg i greiner som vifter ut under en bred, flat krone. */
function acacia(seed, wide) {
  const rnd = mulberry32(seed);
  const pal = wide ? ACACIA_WIDE : ACACIA;
  const parts = [];
  const H = wide ? 3.9 : 5.1; // underkant av kronen
  const R = wide ? 4.2 : 3.4; // kroneradius
  const lx = (rnd() - 0.5) * 0.7, lz = (rnd() - 0.5) * 0.7;
  const fork = [lx, wide ? 1.4 : 2.5, lz];
  parts.push(...limb([[0, -0.3, 0], [lx * 0.25 + 0.06, fork[1] * 0.5, lz * 0.25], fork], [0.32, 0.24, 0.18], 7, BARK_DARK, BARK));
  const nb = wide ? 4 : 3;
  const tips = [];
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * TAU + rnd() * 0.8;
    const d = R * (0.42 + rnd() * 0.22);
    const mid = [fork[0] + Math.cos(a) * d * 0.4, fork[1] + (H - fork[1]) * 0.55, fork[2] + Math.sin(a) * d * 0.4];
    const tip = [Math.cos(a) * d, H + 0.2, Math.sin(a) * d];
    parts.push(...limb([fork, mid, tip], [0.15, 0.11, 0.06], 5, BARK, BARK_LIGHT));
    // Sidegrein ut mot kronekanten
    const a2 = a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5);
    parts.push(tube(mid, [Math.cos(a2) * R * 0.72, H + 0.1, Math.sin(a2) * R * 0.72], 0.07, 0.03, 4, BARK, BARK_LIGHT));
    tips.push(tip);
  }
  // Hovedkrone + mindre, overlappende skiver over greinendene og langs kanten (ujevn, lagdelt paraply)
  parts.push(canopyPad(R * 0.92, 1.2, 14, rnd, pal, { y: H + 0.7 }));
  for (const t of tips) {
    parts.push(canopyPad(R * (0.46 + rnd() * 0.14), 0.95, 9, rnd, pal, { x: t[0] * 1.05, y: H + 0.55 + (rnd() - 0.4) * 0.5, z: t[2] * 1.05 }));
  }
  const extra = wide ? 3 : 2;
  for (let i = 0; i < extra; i++) {
    const a = rnd() * TAU, d = R * (0.35 + rnd() * 0.3);
    parts.push(canopyPad(R * (0.38 + rnd() * 0.12), 0.8, 8, rnd, pal, { x: Math.cos(a) * d, y: H + 1.05 + rnd() * 0.35, z: Math.sin(a) * d }));
  }
  return shadeVariation(merge(parts), 0.05, seed);
}

// ---------- Baobab ----------

/** Baobab: tykk, flaskeformet stamme med korte, krokete greiner og glissent løv. */
function baobab() {
  const rnd = mulberry32(17);
  const parts = [];
  const prof = [[1.5, -0.4], [1.62, 0.3], [1.72, 1.4], [1.66, 2.9], [1.46, 4.4], [1.14, 5.7], [0.86, 6.7], [0.62, 7.3], [0.001, 7.45]];
  const trunk = jitter(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 11), 0.14, 5);
  const tg = paintY(trunk, -0.4, 7.4, BAOBAB[0], BAOBAB[2]);
  // Svake, loddrette furer i barken
  const c = tg.attributes.color, p = tg.attributes.position;
  for (let i = 0; i < c.count; i += 3) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const f = 0.92 + 0.12 * (0.5 + 0.5 * Math.sin(a * 11));
    for (let j = 0; j < 3; j++) c.setXYZ(i + j, c.getX(i + j) * f, c.getY(i + j) * f, c.getZ(i + j) * f);
  }
  parts.push(tg);
  const leaf = [0x6c8a3a, 0x7d9846, 0x5f7c34];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd() * 0.5;
    const ca = Math.cos(a), sa = Math.sin(a);
    const base = [ca * 0.45, 7.0, sa * 0.45];
    const out = 1.4 + rnd() * 0.8;
    const elbow = [ca * (0.45 + out), 7.0 + 0.7 + rnd() * 0.7, sa * (0.45 + out)];
    const a2 = a + (rnd() - 0.5) * 0.7;
    const tip = [elbow[0] + Math.cos(a2) * (0.8 + rnd() * 0.7), elbow[1] + 0.9 + rnd() * 0.8, elbow[2] + Math.sin(a2) * (0.8 + rnd() * 0.7)];
    parts.push(...limb([base, elbow, tip], [0.42, 0.24, 0.08], 6, BAOBAB[1], BAOBAB[2]));
    // Gaffel fra albuen
    const a3 = a - (a2 - a) + (rnd() - 0.5) * 0.4;
    const tip2 = [elbow[0] + Math.cos(a3) * 1.0, elbow[1] + 0.5 + rnd() * 0.5, elbow[2] + Math.sin(a3) * 1.0];
    parts.push(tube(elbow, tip2, 0.16, 0.06, 5, BAOBAB[1], BAOBAB[2]));
    // Glisne løvklaser på greinendene
    parts.push(jIco(0.75 + rnd() * 0.3, 0, leaf[i % 3], 0.3, i * 13 + 1, { x: tip[0], y: tip[1] + 0.15, z: tip[2], sy: 0.62 }));
    if (i % 2 === 0) parts.push(jIco(0.55, 0, leaf[(i + 1) % 3], 0.25, i * 13 + 7, { x: tip2[0], y: tip2[1] + 0.1, z: tip2[2], sy: 0.6 }));
  }
  // Et par korte greiner rett opp fra midten
  parts.push(...limb([[0, 7.2, 0], [0.2, 8.4, -0.1], [0.1, 9.4, 0.2]], [0.32, 0.18, 0.07], 6, BAOBAB[1], BAOBAB[2]));
  parts.push(jIco(0.8, 0, leaf[1], 0.3, 99, { x: 0.1, y: 9.6, z: 0.2, sy: 0.6 }));
  return shadeVariation(merge(parts), 0.04, 21);
}

// ---------- Døde trær og busker ----------

/** Bleket, dødt tre (gammel akasie) uten løv. */
function deadTree() {
  const rnd = mulberry32(57);
  const parts = [];
  const top = [0.15, 3.3, 0.3];
  parts.push(...limb([[0, -0.3, 0], [0.22, 1.7, 0.08], top], [0.3, 0.22, 0.14], 6, DEADWOOD[0], DEADWOOD[1]));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + rnd() * 0.9;
    const y0 = 2.0 + i * 0.3;
    const from = [0.18 * (y0 / 3), y0, 0.3 * (y0 / 3)];
    const mid = [from[0] + Math.cos(a) * 0.9, y0 + 0.9 + rnd() * 0.4, from[2] + Math.sin(a) * 0.9];
    const tip = [mid[0] + Math.cos(a + 0.4) * 0.9, mid[1] + 0.8 + rnd() * 0.6, mid[2] + Math.sin(a + 0.4) * 0.9];
    parts.push(...limb([from, mid, tip], [0.09, 0.06, 0.025], 4, DEADWOOD[0], DEADWOOD[1]));
    parts.push(tube(mid, [mid[0] + Math.cos(a - 0.9) * 0.8, mid[1] + 0.5, mid[2] + Math.sin(a - 0.9) * 0.8], 0.04, 0.015, 3, DEADWOOD[1]));
  }
  return shadeVariation(merge(parts), 0.06, 8);
}

/** Tett, støvete olivengrønn busk. */
function savBush() {
  const cols = [0x7b8045, 0x6a713f, 0x888b4f, 0x747a43];
  const parts = [];
  [[0, 0.62, 0, 0.8, 1], [0.62, 0.46, 0.25, 0.6, 1], [-0.58, 0.5, -0.1, 0.62, 1], [0.12, 0.42, -0.62, 0.52, 0], [-0.24, 0.4, 0.62, 0.5, 0]]
    .forEach(([x, y, z, r, d], i) => parts.push(jIco(r, d, cols[i % 4], r * 0.36, i * 7 + 3, { x, y, z, sy: 0.78 })));
  return shadeVariation(merge(parts), 0.08, 11);
}

/** Tørt tornekratt: grå-brune kvister med små, glisne løvdotter. */
function thornbush() {
  const rnd = mulberry32(23);
  const parts = [];
  const leaf = [0x8a8a4c, 0x7c7d45, 0x9a9458];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rnd() * 0.5;
    const tilt = 0.35 + rnd() * 0.5;
    const len = 1.0 + rnd() * 0.6;
    const ca = Math.cos(a), sa = Math.sin(a);
    const base = [ca * 0.06, -0.05, sa * 0.06];
    const mid = [ca * Math.sin(tilt) * len * 0.5, Math.cos(tilt) * len * 0.55, sa * Math.sin(tilt) * len * 0.5];
    const tip = [ca * Math.sin(tilt) * len * 1.05, Math.cos(tilt) * len, sa * Math.sin(tilt) * len * 1.05];
    parts.push(tube(base, mid, 0.05, 0.035, 3, 0x5a4a3a, 0x6e5c49));
    parts.push(tube(mid, tip, 0.035, 0.012, 3, 0x6e5c49, 0x7d6b57));
    const b = a + (rnd() - 0.5) * 1.6;
    const side = [mid[0] + Math.cos(b) * 0.45, mid[1] + 0.25, mid[2] + Math.sin(b) * 0.45];
    parts.push(tube(mid, side, 0.025, 0.01, 3, 0x6e5c49));
    parts.push(jIco(0.26 + rnd() * 0.12, 0, leaf[i % 3], 0.12, i * 5 + 2, { x: tip[0], y: tip[1], z: tip[2], sy: 0.5 }));
    if (i % 2) parts.push(jIco(0.2, 0, leaf[(i + 1) % 3], 0.1, i * 5 + 4, { x: side[0], y: side[1], z: side[2], sy: 0.5 }));
  }
  return shadeVariation(merge(parts), 0.06, 4);
}

/** Kandelabertre (euphorbia): kort stamme og mange oppadbøyde, kantete grønne armer. */
function euphorbia() {
  const rnd = mulberry32(41);
  const G = [0x4f7442, 0x5d844c, 0x6f9658];
  const parts = [...limb([[0, -0.2, 0], [0.06, 1.0, 0.02], [0, 1.9, 0]], [0.24, 0.2, 0.17], 6, 0x5f5546, 0x6f6553)];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd() * 0.4;
    const tier = i % 3 === 0 ? 1 : 0;
    const y0 = 1.85 + tier * 0.55;
    const out = 0.75 + rnd() * 0.55 - tier * 0.3;
    const ca = Math.cos(a), sa = Math.sin(a);
    const elbow = [ca * out, y0 + 0.4, sa * out];
    const top = [ca * (out + 0.12), y0 + 1.7 + rnd() * 1.1, sa * (out + 0.12)];
    parts.push(tube([ca * 0.1, y0, sa * 0.1], elbow, 0.17, 0.16, 5, G[0], G[1]));
    parts.push(tube(elbow, top, 0.16, 0.13, 5, G[1], G[2]));
    parts.push(cone(0.13, 0.24, 5, G[2], { x: top[0], y: top[1] + 0.12, z: top[2] }));
  }
  parts.push(tube([0, 1.9, 0], [0.05, 4.7, 0.02], 0.15, 0.11, 5, G[0], G[2]));
  parts.push(cone(0.11, 0.2, 5, G[2], { x: 0.05, y: 4.8, z: 0.02 }));
  return shadeVariation(merge(parts), 0.05, 6);
}

// ---------- Termittue ----------

/** Én spiss i termittua: klumpete, rødbrun leire som smalner mot toppen. */
function spire(h, r, seed, t) {
  const prof = [[r, -0.25], [r * 0.92, h * 0.12], [r * 0.72, h * 0.36], [r * 0.52, h * 0.6], [r * 0.34, h * 0.8], [r * 0.15, h * 0.95], [0.001, h]];
  const g = jitter(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 7), r * 0.18, seed);
  return xf(paintY(g, 0, h, LATERITE[0], LATERITE[2]), t);
}

function termite() {
  const parts = [
    spire(2.9, 0.82, 3, { rz: 0.05 }),
    spire(1.75, 0.5, 9, { x: 0.62, z: 0.28, rz: -0.14 }),
    spire(1.15, 0.38, 13, { x: -0.5, z: -0.46, rx: 0.12 }),
    // Bred jordhaug ved foten
    jIco(1.25, 1, LATERITE[1], 0.22, 4, { y: -0.08, sy: 0.32 }),
  ];
  return shadeVariation(merge(parts), 0.07, 4);
}

// ---------- Granitt (kopjer) ----------

/**
 * Avrundet granittblokk: lett forskjøvet ikosaeder med myke normaler (ellipsoide), rosagrå med lav
 * og mørkere underside.
 */
function boulder({ r = 1, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, jit = 0.1, seed = 1 }) {
  const g = paint(jitter(new THREE.IcosahedronGeometry(1, 1), jit, seed), GRANITE[0]);
  const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
  const rnd = mulberry32(seed * 31 + 7);
  const cols = GRANITE.map(col);
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
    const nx = px / sx, ny = py / sy, nz = pz / sz;
    const l = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(i, nx / l, ny / l, nz / l);
    p.setXYZ(i, px * sx * r, py * sy * r, pz * sz * r);
  }
  for (let i = 0; i < p.count; i += 3) {
    const k = rnd();
    const base = k < 0.55 ? cols[0] : k < 0.8 ? cols[1] : k < 0.97 ? cols[2] : cols[3];
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const f = 0.95 + rnd() * 0.1 - (cy < 0 ? Math.min(0.25, -cy / (r * sy) * 0.25) : 0);
    for (let j = 0; j < 3; j++) c.setXYZ(i + j, base.r * f, base.g * f, base.b * f);
  }
  return xf(g, { x, y, z, rx, ry, rz });
}

/** Enkel, avrundet steinblokk med en mindre stein ved siden av. */
function savBoulder() {
  return merge([
    boulder({ r: 1, y: 0.12, sx: 1.12, sy: 0.74, sz: 1, seed: 7 }),
    boulder({ r: 0.42, x: 0.98, y: 0.02, z: 0.56, sx: 1.1, sy: 0.8, seed: 8 }),
  ]);
}

/** Kopje: hop av store, avrundede granittblokker med en balanserende stein på toppen. */
function kopje() {
  return merge([
    boulder({ r: 2.3, y: 0.45, sx: 1.35, sy: 0.62, sz: 1.08, ry: 0.3, seed: 1 }),
    boulder({ r: 1.55, x: 1.7, y: 0.95, z: 0.75, sx: 1.08, sy: 0.85, ry: 1.1, seed: 2 }),
    boulder({ r: 1.4, x: -1.6, y: 0.85, z: -0.65, sx: 1.15, sy: 0.88, ry: 2.2, seed: 3 }),
    boulder({ r: 1.1, x: 0.15, y: 2.75, z: 0.05, sx: 1.25, sy: 0.78, rz: 0.22, ry: 0.7, seed: 4 }),
    boulder({ r: 0.62, x: 2.75, y: 0.2, z: -1.05, seed: 5 }),
    boulder({ r: 0.78, x: -2.4, y: 0.25, z: 1.25, sy: 0.8, seed: 6 }),
    boulder({ r: 0.5, x: -0.6, y: 0.15, z: 2.2, seed: 9 }),
  ]);
}

// ---------- Gress ----------

/**
 * Ett gresstrå (2 trekanter) fra (x, z) som lener seg i retning ang. Fargeovergang fra rot til topp.
 * Returnerer toppunktet.
 */
function blade(T, x, z, ang, h, w, lean, cBase, cMid, cTip) {
  const dx = Math.cos(ang), dz = Math.sin(ang);
  const px = -dz * w * 0.5, pz = dx * w * 0.5;
  const bl = [x - px, -0.02, z - pz], br = [x + px, -0.02, z + pz];
  const mr = [x + dx * lean * h * 0.3 + px * 0.55, h * 0.55, z + dz * lean * h * 0.3 + pz * 0.55];
  const tip = [x + dx * lean * h, h * (1 - lean * lean * 0.35), z + dz * lean * h];
  T.tri(bl, br, mr, cBase, cBase, cMid);
  T.tri(bl, mr, tip, cBase, cMid, cTip);
  return tip;
}

/** Frøaks (rustrødt, som «red oat grass»): en liten rombe som henger fra toppen av et strå. */
function seedHead(T, tip, ang, len, c0, c1) {
  const dx = Math.cos(ang), dz = Math.sin(ang);
  const w = len * 0.22;
  const a = tip;
  const b = [tip[0] + dx * len * 0.5 - dz * w, tip[1] - len * 0.35, tip[2] + dz * len * 0.5 + dx * w];
  const c = [tip[0] + dx * len * 0.5 + dz * w, tip[1] - len * 0.35, tip[2] + dz * len * 0.5 - dx * w];
  const d = [tip[0] + dx * len, tip[1] - len * 0.85, tip[2] + dz * len];
  T.tri(a, b, c, c0, c1, c1);
  T.tri(b, d, c, c1, c0, c1);
}

/**
 * Gresstue bygget av flere små tuer. o = { tufts, blades, spread, h: [min, maks], w, lean, base, mid, tip,
 * heads, seed }.
 */
function grassTuft(o) {
  const rnd = mulberry32(o.seed);
  const T = new Tris();
  const cb = col(o.base), cm = col(o.mid), ct = col(o.tip);
  const r0 = col(RUST[0]), r1 = col(RUST[1]);
  let heads = o.heads || 0;
  for (let t = 0; t < o.tufts; t++) {
    const ta = rnd() * TAU, td = t === 0 ? 0 : o.spread * (0.55 + rnd() * 0.45);
    const tx = Math.cos(ta) * td, tz = Math.sin(ta) * td;
    for (let i = 0; i < o.blades; i++) {
      const a = (i / o.blades) * TAU + rnd() * 0.6;
      const rr = 0.04 + rnd() * 0.16;
      const h = o.h[0] + rnd() * (o.h[1] - o.h[0]);
      const f = 0.88 + rnd() * 0.24;
      const tip = blade(T, tx + Math.cos(a) * rr, tz + Math.sin(a) * rr, a, h, o.w * (0.8 + rnd() * 0.4), o.lean * (0.6 + rnd() * 0.7),
        tint(cb.getHex(), f), tint(cm.getHex(), f), tint(ct.getHex(), f));
      if (heads > 0 && rnd() < 0.3) {
        heads--;
        seedHead(T, tip, a, 0.16 + rnd() * 0.06, r0, r1);
      }
    }
  }
  return T.geo();
}

/** Høyt, gyllent savannegress (pynt): flere tuer spredt over ca. 2,5 m med rustrøde frøaks. */
function tallGrass() {
  return liftNormals(grassTuft({
    tufts: 4, blades: 9, spread: 1.0, h: [0.8, 1.35], w: 0.055, lean: 0.3,
    base: STRAW.base, mid: STRAW.mid, tip: STRAW.tip, heads: 3, seed: 5,
  }), 2.4);
}

/** Lav, tørr og blek gresstust (pynt) for jordflekker, stier og kopjer. */
function shortGrass() {
  return liftNormals(grassTuft({
    tufts: 2, blades: 7, spread: 0.35, h: [0.28, 0.5], w: 0.045, lean: 0.45,
    base: 0x7d6a42, mid: 0xb59e68, tip: 0xd9c79a, seed: 9,
  }), 2.4);
}

/** Friskt, grønt gress ved vannhullene (pynt). */
function greenGrass() {
  return liftNormals(grassTuft({
    tufts: 3, blades: 7, spread: 0.45, h: [0.5, 0.85], w: 0.055, lean: 0.35,
    base: 0x2f4f1d, mid: 0x5d8a32, tip: 0x9dbf5a, seed: 13,
  }), 2.4);
}

/** Stor tue med høyt elefantgress (vegetasjon som gir dekning å snike seg i). */
function grassClump() {
  return twoSided(grassTuft({
    tufts: 6, blades: 12, spread: 1.05, h: [1.2, 1.9], w: 0.065, lean: 0.26,
    base: 0x67532c, mid: 0xb38c45, tip: 0xd6b873, heads: 6, seed: 21,
  }), 1.8);
}

/** Byggere for savannens vegetasjon og gjenstander (geometri lages først når typen trengs). */
export const MODELS = {
  savanna_acacia: () => acacia(3, false),
  savanna_acaciaWide: () => acacia(11, true),
  savanna_baobab: baobab,
  savanna_deadTree: deadTree,
  savanna_euphorbia: euphorbia,
  savanna_termite: termite,
  savanna_bush: savBush,
  savanna_thornbush: thornbush,
  savanna_grassClump: grassClump,
  savanna_boulder: savBoulder,
  savanna_kopje: kopje,
  savanna_tallgrass: tallGrass,
  savanna_shortgrass: shortGrass,
  savanna_greengrass: greenGrass,
};
