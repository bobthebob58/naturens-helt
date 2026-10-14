// 3D-modeller for biomet Regnskog: kjempetrær (kapok) med støtterøtter og lianer, regnskogstrær, blomstrende trær,
// cecropia, palmer, bananplanter, storbladplanter, heliconia, bregner, trebregner, falne stokker og mosegrodde steiner.
// Lavpolygon med vertex-farger (Lambert). Bladene er dobbeltsidige trekantstriper fordi vegetasjonsmaterialet
// bare tegner forsiden. Pynten (decor) tegnes med dobbeltsidig materiale av kjernen og får en forskjøvet,
// speilvendt kopi (twoSidedDecor) slik at siden mot kameraet aldri blir svart.
// Trekantbudsjett: trærne tegnes i store mengder på avstand, så kronene er dodekaedre (36 trekanter) i stedet for
// ikosaedre med detalj 1 (80), rørene har få sider, og deler som ikke synes på spillavstand er utelatt.
import * as THREE from 'three';
import { paint, xf, merge, shadeVariation, cyl, cone, jitter } from '../../models/geo.js';
import { jIco } from '../../models/vegetation.js';
import { mulberry32 } from '../../utils/math.js';

const TAU = Math.PI * 2;
const _ca = new THREE.Color();
const _cb = new THREE.Color();
const _cc = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();

// ---------- Fargepalett ----------
const KAPOK_BARK = 0x9b9481;
const KAPOK_DARK = 0x847c69;
const BARK = 0x5b4936;
const BARK_DARK = 0x4a3a2b;
const MOSS = 0x55753a;
const MOSS_LIGHT = 0x6d9444;
const VINE = 0x4d5a2c;
const LEAF_DARK = 0x2b5d26;
const LEAF = 0x3c7a2e;
const LEAF_LIGHT = 0x5f9e3a;

// ---------- Hjelpere ----------

/** Geometri av rå trekanter (posisjoner + lineære farger). Flate normaler. */
function rawGeo(pos, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Legg til en trekant med farger per hjørne. Hopper over trekanter uten areal. */
function pushTri(pos, col, a, b, c, ca, cb, cc) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * cx + cy * cy + cz * cz < 1e-12) return;
  pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
}

/** Trekant – dobbeltsidig ved behov (baksiden får egen, gjerne blekere farge). */
function tri2(pos, col, a, b, c, ca, cb, cc, back) {
  pushTri(pos, col, a, b, c, ca, cb, cc);
  if (back) pushTri(pos, col, a, c, b, back(ca), back(cc), back(cb));
}

/** Hjelper for blekere/mørkere bakside. */
function backTint(k, pale = 0) {
  const cache = new Map();
  return (c) => {
    let o = cache.get(c);
    if (!o) {
      o = new THREE.Color(c.r * k + pale * 0.6, c.g * k + pale * 0.62, c.b * k + pale * 0.5);
      cache.set(c, o);
    }
    return o;
  };
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

/** Kjede av rør gjennom flere punkter (stammer, grener, lianer). seg: antall sider (tall, eller liste per ledd). */
function limb(points, radii, seg, c0, c1 = c0) {
  const parts = [];
  _cc.set(c0);
  const a = _cc.clone();
  const b = new THREE.Color(c1);
  const n = points.length - 1;
  for (let i = 0; i < n; i++) {
    const k0 = i / n, k1 = (i + 1) / n;
    const col0 = a.clone().lerp(b, k0).getHex(), col1 = a.clone().lerp(b, k1).getHex();
    parts.push(tube(points[i], points[i + 1], radii[i], radii[i + 1], Array.isArray(seg) ? seg[i] : seg, col0, col1));
  }
  return parts;
}

/** Breddeprofiler for blader (t = 0 ved basen, 1 i spissen). */
const PROFILE = {
  lance: (t) => (0.16 + 0.84 * Math.sin(Math.PI * t)) * (1 - t * t * t),
  paddle: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.94)), 0.45) * (t < 1 ? 1 : 0),
  heart: (t) => (t < 0.3 ? 0.72 + t * 0.93 : Math.pow((1 - t) / 0.7, 0.8)),
  frond: (t) => (0.3 + 0.7 * Math.sin(Math.PI * Math.pow(t, 0.8))) * (1 - t * t * t * t),
};

/**
 * Et blad langs +Z fra origo, buet nedover. Lavpolygon trekantstripe.
 * len/width: størrelse. segs: antall ledd. rise: startvinkel oppover (rad). droop: hvor mye vinkelen faller mot spissen.
 * fold: V-fold langs midtribben (0 = flatt blad uten midtribbe-hjørner). teeth: annenhvert ledd smalere (småblader på bregner/palmer).
 * c0/c1: farge ved base/spiss. back: funksjon for baksidefarge (null = enkeltsidig, for pynt).
 */
function blade(o) {
  const {
    len = 1, width = 0.3, segs = 4, rise = 0.5, droop = 1, bend = 1.3, fold = 0.2, teeth = 0,
    profile = PROFILE.lance, c0 = LEAF, c1 = LEAF_LIGHT, rib = null, back = backTint(0.85, 0.06), lift = 0.45,
  } = o;
  const A = new THREE.Color(c0), B = new THREE.Color(c1), R = rib == null ? null : new THREE.Color(rib);
  const L = [], M = [], Rr = [], CL = [], CM = [];
  let y = 0, z = 0;
  const step = len / segs;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = rise - droop * Math.pow(t, bend);
    if (i > 0) {
      const ap = rise - droop * Math.pow((i - 0.5) / segs, bend);
      z += Math.cos(ap) * step;
      y += Math.sin(ap) * step;
    }
    let w = width * profile(t) * 0.5;
    if (teeth && i % 2 === 1) w *= 1 - teeth;
    // Normal til bladflaten (i yz-planet) – brukes til V-folden
    const ny = Math.cos(a), nz = -Math.sin(a);
    const f = fold * w;
    L.push([-w, y + ny * f, z + nz * f]);
    Rr.push([w, y + ny * f, z + nz * f]);
    M.push([0, y, z]);
    const c = A.clone().lerp(B, t);
    CL.push(c);
    CM.push(R ? c.clone().lerp(R, 0.5) : c.clone().multiplyScalar(1.08));
  }
  const pos = [], col = [];
  for (let i = 0; i < segs; i++) {
    if (fold > 0) {
      tri2(pos, col, M[i], L[i], L[i + 1], CM[i], CL[i], CL[i + 1], back);
      tri2(pos, col, M[i], L[i + 1], M[i + 1], CM[i], CL[i + 1], CM[i + 1], back);
      tri2(pos, col, M[i], M[i + 1], Rr[i + 1], CM[i], CM[i + 1], CL[i + 1], back);
      tri2(pos, col, M[i], Rr[i + 1], Rr[i], CM[i], CL[i + 1], CL[i], back);
    } else {
      tri2(pos, col, L[i], L[i + 1], Rr[i + 1], CL[i], CL[i + 1], CL[i + 1], back);
      tri2(pos, col, L[i], Rr[i + 1], Rr[i], CL[i], CL[i + 1], CL[i], back);
    }
  }
  return liftNormals(rawGeo(pos, col), lift);
}

/** Vri normalene mot himmelen (bratte blader og baksider blir ellers nesten svarte). */
function liftNormals(g, k) {
  if (!k) return g;
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i) + k, z = n.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(i, x / l, y / l, z / l);
  }
  return g;
}

/**
 * Gjør enkeltsidig pynt tosidig for det dobbeltsidige pyntmaterialet: legger til en speilvendt kopi forskjøvet
 * noen millimeter bakover, slik at siden som vender mot kameraet alltid er en forside (ellers snus normalen og
 * bladet blir svart). Normalene pekes deretter mer oppover for jevnt lys.
 */
function twoSidedDecor(g, lift = 1.2, off = 0.012) {
  const p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color.array;
  const cnt = p.length / 3;
  const P = new Float32Array(p.length * 2), N = new Float32Array(p.length * 2), C = new Float32Array(p.length * 2);
  P.set(p); N.set(n); C.set(c);
  for (let t = 0; t < cnt; t += 3) {
    for (let j = 0; j < 3; j++) {
      // Kopien får omvendt rekkefølge (hjørne 0, 2, 1) og motsatt normal
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
  out.computeBoundingSphere();
  return out;
}

/**
 * Støtterot: tynn, konkav kile fra stammen og ut langs +X – tykk inne ved stammen, skarp ytterkant
 * (sidene møtes i ytterkanten, så bare den skrå toppkanten trenger en egen trekant).
 */
function buttress(len, hgt, thick, cBase, cTop) {
  const P = [[0.25, 0], [len, 0], [len * 0.4, hgt * 0.2], [0.25, hgt]];
  const A = new THREE.Color(cBase), B = new THREE.Color(cTop);
  const cols = P.map((p) => A.clone().lerp(B, p[1] / hgt));
  const t = thick / 2;
  const F = P.map((p, i) => [p[0], p[1], i === 0 || i === 3 ? t : 0]);
  const K = P.map((p, i) => [p[0], p[1], i === 0 || i === 3 ? -t : 0]);
  const pos = [], col = [];
  pushTri(pos, col, F[0], F[1], F[2], cols[0], cols[1], cols[2]);
  pushTri(pos, col, F[0], F[2], F[3], cols[0], cols[2], cols[3]);
  pushTri(pos, col, K[0], K[2], K[1], cols[0], cols[2], cols[1]);
  pushTri(pos, col, K[0], K[3], K[2], cols[0], cols[3], cols[2]);
  pushTri(pos, col, F[3], F[2], K[3], cols[3], cols[2], cols[3]);
  return rawGeo(pos, col);
}

/**
 * Løvklump: jittret dodekaeder (36 trekanter) – rund nok på avstand, under halvparten av et ikosaeder med detalj 1.
 * Litt større radius (×1.08) fordi flatene ligger lenger inn enn på ikosaederet, så klumpen beholder samme størrelse.
 */
function clump(r, color, amount, seed, t) {
  return xf(jitter(paint(new THREE.DodecahedronGeometry(r * 1.08, 0), color), amount, seed), { ry: seed * 0.37, ...t });
}

/** Multipliser fargene med en faktor som går fra k0 (y0) til k1 (y1) – mørkere underside på trekroner. */
function shadeY(g, y0, y1, k0, k1) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
    const k = k0 + (k1 - k0) * t;
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return g;
}

/** Farg trekanter etter normalen: oppovervendte flater får mose (eller blomster). */
function recolorFaces(g, seed, fn) {
  const n = g.attributes.normal, c = g.attributes.color;
  for (let i = 0; i < n.count; i += 3) {
    const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
    const k = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    const r = k - Math.floor(k);
    const col = fn(ny, r);
    if (!col) continue;
    _cc.set(col);
    for (let j = 0; j < 3; j++) c.setXYZ(i + j, _cc.r, _cc.g, _cc.b);
  }
  return g;
}

/** Hengende liane fra et grenpunkt ned mot bakken (to ledd med en svai bue). */
function liana(top, drop, sway, parts) {
  const [x, y, z] = top;
  const pts = [
    [x, y, z],
    [x + sway[0], y - drop * 0.6, z + sway[1]],
    [x + sway[0] * 0.7, y - drop, z + sway[1] * 0.7],
  ];
  parts.push(...limb(pts, [0.07, 0.055, 0.04], 3, VINE, 0x5a6a34));
}

/** Bromelia (epifytt) – en rosett av stive blader med rødt hjerte. */
function bromeliad(x, y, z, s, parts) {
  for (let i = 0; i < 4; i++) {
    parts.push(xf(blade({ len: 0.55 * s, width: 0.16 * s, segs: 1, rise: 1.0, droop: 0.9, fold: 0, c0: 0x4f8a35, c1: 0x7aa84a }),
      { x, y, z, ry: (i / 4) * TAU + 0.4 }));
  }
  parts.push(cone(0.09 * s, 0.32 * s, 4, 0xc8323a, { x, y: y + 0.14 * s, z }));
}

// ---------- Trær ----------

/** Kjempetre (kapok) – 18–20 m, støtterøtter, høy rett stamme og bred paraplykrone med lianer og epifytter. */
function kapok() {
  const rnd = mulberry32(11);
  const parts = [];
  const H = 15.2;
  parts.push(tube([0, -0.4, 0], [0, 2.4, 0], 1.25, 0.8, 7, MOSS, KAPOK_BARK));
  parts.push(tube([0, 2.4, 0], [0, H, 0], 0.8, 0.5, 7, KAPOK_BARK, KAPOK_DARK));
  // Støtterøtter
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rnd() * 0.5;
    parts.push(xf(buttress(2.6 + rnd() * 1.2, 3.0 + rnd() * 1.6, 0.18, MOSS, KAPOK_DARK), { ry: a, y: -0.2 }));
  }
  // Grener ut mot kronen
  const tips = [];
  const nB = 6;
  for (let i = 0; i < nB; i++) {
    const a = (i / nB) * TAU + rnd() * 0.45;
    const len = 4.2 + rnd() * 1.4;
    const y0 = H - 1.4 + rnd() * 1.0;
    const mid = [Math.cos(a) * len * 0.5, y0 + 1.1, Math.sin(a) * len * 0.5];
    const tip = [Math.cos(a) * len, y0 + 1.9 + rnd() * 0.6, Math.sin(a) * len];
    parts.push(...limb([[0, y0 - 0.5, 0], mid, tip], [0.34, 0.24, 0.12], [4, 3], KAPOK_BARK, KAPOK_DARK));
    tips.push({ a, mid, tip });
  }
  // Krone: brede, flate løvklumper (paraply) – lysere på toppen
  const greens = [0x3a6d2b, 0x467b31, 0x30602a, 0x4f8638];
  const crown = [];
  tips.forEach((b, i) => crown.push(clump(2.5 + rnd() * 0.7, greens[i % 4], 0.85, i * 13 + 3, { x: b.tip[0], y: b.tip[1] + 0.6, z: b.tip[2], sy: 0.46 })));
  crown.push(clump(3.4, greens[1], 1.0, 77, { x: 0.2, y: H + 3.0, z: -0.2, sy: 0.42 }));
  for (const g of crown) parts.push(shadeY(g, H + 0.8, H + 4.6, 0.58, 1.15));
  // Lianer som henger fra grenene, og en tykk liane som snor seg rundt stammen
  for (const ti of [1, 2, 4, 5]) {
    const b = tips[ti];
    const k = 0.72 + rnd() * 0.15;
    liana([b.tip[0] * k, b.tip[1] - 0.2, b.tip[2] * k], 9 + rnd() * 5, [(rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2], parts);
  }
  const spiral = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const y = 0.6 + t * 12;
    const r = 0.98 - t * 0.3;
    const a = t * TAU * 1.05;
    spiral.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  parts.push(...limb(spiral, spiral.map(() => 0.08), 3, VINE, 0x56662f));
  // Epifytter på grenene
  bromeliad(tips[0].mid[0], tips[0].mid[1] + 0.2, tips[0].mid[2], 1.2, parts);
  bromeliad(tips[3].mid[0], tips[3].mid[1] + 0.2, tips[3].mid[2], 1.0, parts);
  return shadeVariation(merge(parts), 0.06, 21);
}

/**
 * Regnskogstre (9–15 m): litt skjev stamme med små støtterøtter, avrundet «brokkoli»-krone og lianer.
 * kind: 'dark' (mørk grønn), 'light' (lys gulgrønn, høyere og smalere) eller 'bloom' (blomstrende, rosa).
 */
function rainTree(kind) {
  const light = kind === 'light', bloom = kind === 'bloom';
  const rnd = mulberry32(bloom ? 57 : light ? 63 : 31);
  const parts = [];
  const k = light ? 1.12 : 1;
  parts.push(...limb([[0, -0.3, 0], [0.25, 3.8 * k, 0.1], [0.1, 7.6 * k, -0.15]], [0.44, 0.3, 0.2], [6, 5], MOSS, light ? 0x6a5a45 : BARK));
  for (let i = 0; i < 3; i++) {
    parts.push(xf(buttress(1.1 + rnd() * 0.4, 1.0 + rnd() * 0.5, 0.12, MOSS, BARK_DARK), { ry: (i / 3) * TAU + rnd(), y: -0.1 }));
  }
  const greens = bloom ? [0x3a6a2c, 0x41722f, 0x335f29]
    : light ? [0x4e8a33, 0x5b9639, 0x467f2f, 0x68a23f] : [0x2c5d2a, 0x356b2d, 0x285226, 0x3f7832];
  const crown = [];
  const nB = 4;
  const tips = [];
  const spread = light ? 0.8 : 1;
  for (let i = 0; i < nB; i++) {
    const a = (i / nB) * TAU + rnd() * 0.5;
    const len = (2.6 + rnd() * 0.7) * spread;
    const y0 = (6.2 + rnd() * 1.2) * k;
    const tip = [Math.cos(a) * len, y0 + 1.4 + rnd() * 0.5, Math.sin(a) * len];
    parts.push(tube([0.15, y0, -0.05], tip, 0.16, 0.08, 3, BARK, BARK_DARK));
    tips.push(tip);
    crown.push(clump((2.2 + rnd() * 0.45) * (light ? 0.9 : 1), greens[i % greens.length], 0.65, i * 7 + (bloom ? 40 : light ? 23 : 5),
      { x: tip[0], y: tip[1] + 0.5, z: tip[2], sy: 0.78 }));
  }
  crown.push(clump(2.5 * (light ? 0.9 : 1), greens[1], 0.8, bloom ? 91 : light ? 29 : 17, { x: 0.1, y: 10.6 * k, z: -0.1, sy: 0.85 }));
  for (const g of crown) {
    shadeY(g, 7.0 * k, 12.4 * k, 0.55, 1.18);
    if (bloom) {
      // Blomster på de øvre, solvendte flatene
      recolorFaces(g, 3, (ny, r) => (ny > 0.05 && r < 0.8 ? (r < 0.3 ? 0xe46aa2 : r < 0.55 ? 0xd4508c : 0xf08cb8) : null));
    }
    parts.push(g);
  }
  liana([tips[0][0] * 0.8, tips[0][1] - 0.3, tips[0][2] * 0.8], 6 + rnd() * 2, [0.3, -0.2], parts);
  if (!bloom) liana([tips[2][0] * 0.8, tips[2][1] - 0.3, tips[2][2] * 0.8], 5 + rnd() * 2, [-0.2, 0.3], parts);
  return shadeVariation(merge(parts), 0.06, bloom ? 7 : light ? 11 : 3);
}

/** Paraplyformet, fliket blad (cecropia) med hvitaktig underside. */
function umbrella(r, lobes, droop, cTop, cEdge, rnd) {
  const pos = [], col = [];
  const C = new THREE.Color(cTop), E = new THREE.Color(cEdge);
  const back = (c) => new THREE.Color(Math.min(1, c.r * 0.6 + 0.42), Math.min(1, c.g * 0.6 + 0.44), Math.min(1, c.b * 0.6 + 0.38));
  const c0 = [0, 0, 0];
  const d = Math.PI / lobes;
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * TAU + rnd() * 0.2;
    const rr = r * (0.85 + rnd() * 0.3);
    const tip = [Math.cos(a) * rr, -droop * (0.8 + rnd() * 0.4), Math.sin(a) * rr];
    const sl = [Math.cos(a - d * 0.8) * rr * 0.42, -droop * 0.25, Math.sin(a - d * 0.8) * rr * 0.42];
    const sr = [Math.cos(a + d * 0.8) * rr * 0.42, -droop * 0.25, Math.sin(a + d * 0.8) * rr * 0.42];
    tri2(pos, col, c0, tip, sl, C, E, C, back);
    tri2(pos, col, c0, sr, tip, C, C, E, back);
  }
  return rawGeo(pos, col);
}

/** Cecropia – slank, lys stamme på stylteføtter med lysestakegreiner og paraplyblader. */
function cecropia() {
  const rnd = mulberry32(5);
  const parts = [];
  const PALE = 0xc2bdac;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rnd() * 0.4;
    parts.push(tube([Math.cos(a) * 0.95, -0.2, Math.sin(a) * 0.95], [0, 1.7, 0], 0.07, 0.09, 3, 0x8a8574, PALE));
  }
  parts.push(...limb([[0, 1.3, 0], [0.22, 5, 0.05], [0.05, 8.2, 0.15]], [0.2, 0.16, 0.12], 5, PALE, 0xb3ae9c));
  const tops = [[0.05, 8.6, 0.15]];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rnd() * 0.5;
    const mid = [Math.cos(a) * 1.1, 8.3 + rnd() * 0.4, Math.sin(a) * 1.1];
    const tip = [Math.cos(a) * 2.3, 9.3 + rnd() * 0.9, Math.sin(a) * 2.3];
    parts.push(...limb([[0.05, 7.6, 0.12], mid, tip], [0.1, 0.08, 0.06], 3, 0xb3ae9c, 0x9a9584));
    tops.push(tip);
  }
  tops.forEach((t, i) => {
    parts.push(xf(umbrella(1.9, 7, 0.6, 0x6a8f58, 0x8fae74, rnd), { x: t[0], y: t[1] + 0.05, z: t[2], ry: i }));
    if (i === 0) parts.push(xf(umbrella(1.2, 5, 0.3, 0x76995f, 0x9ab87e, rnd), { x: t[0], y: t[1] + 0.4, z: t[2], ry: i + 0.5 }));
  });
  return shadeVariation(merge(parts), 0.05, 13);
}

/** Palmefrond: lang, buet stripe med småblader (tagget kant). */
function frond(len, width, rise, droop, c0, c1, segs = 3) {
  return blade({ len, width, segs, rise, droop, bend: 1.2, fold: 0.2, teeth: 0.38, profile: PROFILE.frond, c0, c1, rib: 0x8a9a52 });
}

/** Regnskogspalme – to slanke stammer med grønt kronskaft og hengende fjærblader. */
function rainPalm() {
  const rnd = mulberry32(23);
  const parts = [];
  const stems = [
    { base: [0, 0, 0], top: [0.4, 6.4, 0.05], n: 7, len: 3.5, s: 1 },
    { base: [1.1, 0, -0.8], top: [1.45, 3.4, -1.05], n: 5, len: 2.7, s: 0.85 },
  ];
  for (const st of stems) {
    const [bx, , bz] = st.base, [tx, ty, tz] = st.top;
    const mid = [(bx + tx) / 2 + 0.12, ty * 0.5, (bz + tz) / 2];
    const pts = st.s < 1 ? [[bx, -0.2, bz], [tx, ty, tz]] : [[bx, -0.2, bz], mid, [tx, ty, tz]];
    parts.push(...limb(pts, [0.17 * st.s, 0.14 * st.s, 0.12 * st.s].slice(-pts.length), 5, 0x6f6a58, 0x9a9381));
    parts.push(tube([tx, ty, tz], [tx + 0.02, ty + 0.9 * st.s, tz], 0.14 * st.s, 0.11 * st.s, 5, 0x5b8a38, 0x6f9e44));
    const top = [tx + 0.02, ty + 0.85 * st.s, tz];
    for (let i = 0; i < st.n; i++) {
      const yaw = (i / st.n) * TAU + rnd() * 0.4;
      const f = frond(st.len * (0.85 + rnd() * 0.3), 1.12 * st.s, 0.85 + rnd() * 0.4, 1.7 + rnd() * 0.45, 0x3a7329, i % 3 ? 0x5b9638 : 0x6aa442);
      parts.push(xf(f, { x: top[0], y: top[1], z: top[2], ry: yaw }));
    }
  }
  return shadeVariation(merge(parts), 0.05, 17);
}

/** Bananplante – tre falske stammer med store, flerrede padleblader og en klase med grønne bananer. */
function banana() {
  const rnd = mulberry32(41);
  const parts = [];
  const stems = [[0, 0, 0, 2.5, 4], [0.75, 0, 0.35, 1.9, 3], [-0.55, 0, 0.5, 1.4, 3]];
  for (const [x, , z, h, n] of stems) {
    parts.push(tube([x, -0.1, z], [x + 0.03, h, z], 0.17 * (h / 2.5 + 0.3), 0.1, 5, 0x6b6538, 0x86a64a));
    for (let i = 0; i < n; i++) {
      const old = i === n - 1 && h > 2;
      const yaw = (i / n) * TAU + rnd() * 0.6;
      const leaf = blade({
        len: (1.7 + rnd() * 0.5) * (h / 2.5 * 0.4 + 0.6), width: 0.62, segs: 3, rise: old ? -0.3 : 1.0 + rnd() * 0.35,
        droop: old ? 0.6 : 1.5 + rnd() * 0.4, fold: 0, teeth: 0.22, profile: PROFILE.paddle,
        c0: old ? 0x7a7a38 : 0x5b9a35, c1: old ? 0x8f7a3a : 0x78b545, rib: 0xa8c070,
      });
      parts.push(xf(leaf, { x, y: h - 0.05, z, ry: yaw }));
    }
  }
  // Bananklase med lilla blomsterknopp
  parts.push(...limb([[0.02, 2.35, 0], [0.35, 2.15, 0.05], [0.5, 1.55, 0.08], [0.52, 1.05, 0.08]], [0.04, 0.04, 0.035, 0.03], 3, 0x7a8a3a));
  for (let i = 0; i < 6; i++) {
    const a = i * 2.2;
    const y = 1.95 - (i % 3) * 0.14;
    parts.push(xf(paint(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 3, 1, true), 0x9ab846), { x: 0.42 + Math.cos(a) * 0.1, y, z: 0.06 + Math.sin(a) * 0.1, rz: -0.5 - Math.cos(a) * 0.3, rx: Math.sin(a) * 0.4 }));
  }
  parts.push(cone(0.1, 0.32, 4, 0x6e2a48, { x: 0.52, y: 0.92, z: 0.08, rx: Math.PI }));
  return shadeVariation(merge(parts), 0.05, 29);
}

/** Storbladplante (elefantøre/taro) – store hjerteformede blader på lange stilker. */
function bigleaf() {
  const rnd = mulberry32(67);
  const parts = [];
  const shades = [[0x2a5f27, 0x3c7a2f], [0x336d2b, 0x4c8a36], [0x2c6a33, 0x47883f]];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + rnd() * 0.5;
    const h = 0.75 + rnd() * 0.75;
    const lean = 0.25 + rnd() * 0.25;
    const top = [Math.cos(a) * lean, h, Math.sin(a) * lean];
    parts.push(tube([0, 0, 0], top, 0.04, 0.025, 3, 0x4c6e2c, 0x6a8a3a));
    const [c0, c1] = shades[i % 3];
    parts.push(xf(blade({ len: 0.95 + rnd() * 0.45, width: 0.85, segs: 2, rise: 0.25, droop: 1.3, fold: 0.16, profile: PROFILE.heart, c0, c1, rib: 0x7aa060 }),
      { x: top[0], y: top[1], z: top[2], ry: Math.PI / 2 - a }));
  }
  return shadeVariation(merge(parts), 0.05, 31);
}

/** Heliconia – oppreiste padleblader og sikksakk-blomsterstander i rødt og gult. */
function heliconia() {
  const rnd = mulberry32(73);
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rnd() * 0.5;
    const h = 0.5 + rnd() * 0.5;
    const top = [Math.cos(a) * 0.2, h, Math.sin(a) * 0.2];
    parts.push(tube([0, 0, 0], top, 0.035, 0.03, 3, 0x4c6e2c));
    parts.push(xf(blade({ len: 1.2 + rnd() * 0.4, width: 0.4, segs: 3, rise: 1.05, droop: 1.15, fold: 0.15, profile: PROFILE.paddle, c0: 0x3f7c2e, c1: 0x5f9c3a, rib: 0x9ac070 }),
      { x: top[0], y: top[1], z: top[2], ry: Math.PI / 2 - a }));
  }
  for (const [x, z, h] of [[0.15, 0.05, 1.7], [-0.2, -0.15, 1.35]]) {
    parts.push(tube([x * 0.3, 0, z * 0.3], [x, h, z], 0.03, 0.025, 3, 0x5a7a34));
    for (let k = 0; k < 5; k++) {
      const y = h - 0.62 + k * 0.15;
      const side = k % 2 ? 1 : -1;
      parts.push(cone(0.09, 0.44, 4, k === 4 ? 0xf2c63a : 0xd9302a, { x: x + side * 0.15, y: y + 0.1, z, rz: -side * 1.0 }));
    }
  }
  return shadeVariation(merge(parts), 0.05, 37);
}

/** Stor bakkebregne – en rosett av lange, buede, taggete blader. */
function fern() {
  const rnd = mulberry32(83);
  const parts = [];
  for (let i = 0; i < 12; i++) {
    const yaw = (i / 12) * TAU + rnd() * 0.4;
    const young = i % 4 === 0;
    parts.push(xf(blade({
      len: 1.5 + rnd() * 0.6, width: 0.62, segs: 5, rise: 1.2 + rnd() * 0.3, droop: 1.8 + rnd() * 0.5, bend: 1.7, fold: 0,
      teeth: 0.62, profile: PROFILE.frond, c0: 0x2f6a27, c1: young ? 0x86b84a : 0x5a9a38,
    }), { y: 0.05, ry: yaw }));
  }
  return shadeVariation(merge(parts), 0.06, 41);
}

/** Trebregne – fibrøs stamme med en krone av lange bregneblader og visne blader som henger ned. */
function treefern() {
  const rnd = mulberry32(97);
  const parts = [];
  const top = [0.12, 3.8, 0.15];
  parts.push(...limb([[0, -0.2, 0], [0.16, 1.8, 0.04], top], [0.24, 0.18, 0.15], 5, 0x3e2f22, 0x5a4431));
  for (let i = 0; i < 4; i++) {
    parts.push(xf(blade({ len: 1.2, width: 0.4, segs: 2, rise: -0.9, droop: 0.4, fold: 0, teeth: 0.5, profile: PROFILE.frond, c0: 0x5e4a30, c1: 0x7a6038 }),
      { x: top[0], y: top[1] - 0.1, z: top[2], ry: (i / 4) * TAU + 0.3 }));
  }
  for (let i = 0; i < 11; i++) {
    const yaw = (i / 11) * TAU + rnd() * 0.3;
    parts.push(xf(blade({
      len: 2.7 + rnd() * 0.5, width: 0.9, segs: 4, rise: 0.55 + rnd() * 0.25, droop: 1.25 + rnd() * 0.3, bend: 1.5, fold: 0,
      teeth: 0.6, profile: PROFILE.frond, c0: 0x2e6526, c1: i % 3 ? 0x5c9c39 : 0x78b046,
    }), { x: top[0], y: top[1], z: top[2], ry: yaw }));
  }
  parts.push(xf(paint(new THREE.OctahedronGeometry(0.16, 0), 0x8fbf55), { x: top[0], y: top[1] + 0.12, z: top[2], ry: 0.4 }));
  return shadeVariation(merge(parts), 0.06, 43);
}

/** Lav, frodig busk av løvklumper med store blader som stikker ut – billig og brukes i store mengder. */
function shrub() {
  const parts = [];
  const blobs = [[0, 0.5, 0, 0.78, LEAF_DARK], [0.75, 0.38, 0.3, 0.6, 0x3a722d], [-0.62, 0.34, -0.35, 0.58, 0x2f6529], [0.1, 0.36, -0.7, 0.5, 0x457f33]];
  blobs.forEach(([x, y, z, r, c], i) => parts.push(shadeY(jIco(r, 0, c, r * 0.3, i * 3 + 61, { x, y, z, sy: 0.75 }), 0, 1.1, 0.6, 1.15)));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    parts.push(xf(blade({ len: 0.85, width: 0.42, segs: 2, rise: 0.55, droop: 1.0, fold: 0, profile: PROFILE.lance, c0: LEAF, c1: i % 2 ? LEAF_LIGHT : 0x4f8f38 }),
      { x: Math.cos(a) * 0.5, y: 0.35 + (i % 3) * 0.15, z: Math.sin(a) * 0.5, ry: Math.PI / 2 - a }));
  }
  return shadeVariation(merge(parts), 0.06, 59);
}

// ---------- Bakke ----------

/** Falt, mosegrodd trestamme med kjuker og små bregner. Ligger langs X. */
function rainLog() {
  const rnd = mulberry32(101);
  const parts = [];
  const L = 2.8;
  parts.push(tube([-L, 0.42, 0], [L, 0.38, 0.12], 0.5, 0.42, 8, 0x5a4530, 0x4d3c2a));
  // Lyse snittflater i endene (bare utsiden synes)
  parts.push(xf(paint(new THREE.CircleGeometry(0.48, 8), 0xa47e55), { x: -L - 0.01, y: 0.42, ry: -Math.PI / 2 }));
  parts.push(xf(paint(new THREE.CircleGeometry(0.4, 8), 0x9a7650), { x: L + 0.01, y: 0.38, z: 0.12, ry: Math.PI / 2 }));
  // Mosepute på toppen
  for (let i = 0; i < 4; i++) {
    const x = -L * 0.8 + i * L * 0.52 + rnd() * 0.3;
    parts.push(jIco(0.55, 0, i % 2 ? MOSS : MOSS_LIGHT, 0.18, i + 5, { x, y: 0.78, z: 0.04 * i, sx: 1.6, sy: 0.32, sz: 0.85 }));
  }
  // Kjuker på siden
  for (let i = 0; i < 3; i++) {
    const x = -1.6 + i * 1.3;
    parts.push(cyl(0.2, 0.24, 0.06, 5, i === 1 ? 0xd47a2a : 0xe3d2a6, { x, y: 0.45 + (i % 2) * 0.12, z: 0.5, sz: 0.7 }));
  }
  // Brukket grenstump
  parts.push(tube([1.1, 0.6, 0.1], [1.5, 1.35, 0.35], 0.13, 0.07, 5, 0x5a4530));
  // Små bregner som spirer fra stokken
  for (let i = 0; i < 4; i++) {
    parts.push(xf(blade({ len: 0.7, width: 0.24, segs: 3, rise: 1.0, droop: 1.8, fold: 0, teeth: 0.6, profile: PROFILE.frond, c0: 0x3f7a2c, c1: 0x74ad45 }),
      { x: -1.2, y: 0.8, z: 0.05, ry: (i / 4) * TAU + 0.5 }));
  }
  return shadeVariation(merge(parts), 0.06, 47);
}

/** Mosegrodd stein: grå stein der de oppovervendte flatene er dekket av mose. */
function mossRock() {
  const moss = (seed) => (ny, r) => (ny > 0.32 + (r - 0.5) * 0.5 ? (r < 0.5 ? MOSS : MOSS_LIGHT) : r < 0.3 ? 0x67665e : null);
  const a = recolorFaces(jIco(1, 1, 0x77756c, 0.45, 9, { sy: 0.66, sx: 1.12 }), 9, moss(9));
  const b = recolorFaces(jIco(0.45, 0, 0x6e6c64, 0.12, 12, { x: 1.05, y: -0.05, z: 0.35, sy: 0.7 }), 12, moss(12));
  return shadeVariation(merge([a, b]), 0.05, 53);
}

// ---------- Pynt (dobbeltsidig, uten kollisjon) ----------

/** Tett, mørkt regnskogsgress i flere nyanser. */
function rainGrass() {
  const pos = [], col = [];
  const base = new THREE.Color(0x1f451b);
  const tips = [0x5d9a3a, 0x7fb04a, 0x3f7f30, 0x9cbf55, 0x4c8c34].map((c) => new THREE.Color(c));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + i * 0.7;
    const r = 0.08 + (i % 4) * 0.07;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const h = 0.45 + ((i * 37) % 11) / 18;
    const lean = 0.2 + (i % 3) * 0.06;
    const w = 0.06;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    const tip = tips[i % tips.length];
    pushTri(pos, col, [cx - px, 0, cz - pz], [cx + px, 0, cz + pz], [cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean], base, base, tip);
  }
  return twoSidedDecor(rawGeo(pos, col), 2.5);
}

/** Liten bregne. */
function fernlet() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    parts.push(xf(blade({
      len: 0.6 + (i % 3) * 0.12, width: 0.24, segs: 4, rise: 1.25, droop: 1.6, bend: 1.7, fold: 0, teeth: 0.6, profile: PROFILE.frond,
      c0: 0x2f6627, c1: i % 2 ? 0x6aa843 : 0x4f8f35, back: null,
    }), { ry: (i / 7) * TAU + i * 0.3 }));
  }
  return twoSidedDecor(merge(parts));
}

/** Småplanter med brede blader i ulike grønne (og et par rødlige) nyanser. */
function sprout() {
  const parts = [];
  const shades = [[0x2c5e28, 0x3f7a2e], [0x4a8a35, 0x6fa844], [0x5e2f3a, 0x7a3d48], [0x3a7030, 0x9fc070], [0x2f6a2c, 0x4e9038]];
  for (let i = 0; i < 6; i++) {
    const [c0, c1] = shades[i % shades.length];
    parts.push(xf(blade({
      len: 0.32 + (i % 3) * 0.1, width: 0.24, segs: 2, rise: 0.75, droop: 1.0, fold: 0.15, profile: PROFILE.lance, c0, c1, back: null,
    }), { y: 0.02 + (i % 2) * 0.08, ry: (i / 6) * TAU + i }));
  }
  return twoSidedDecor(merge(parts));
}

export const MODELS = {
  rainforest_kapok: kapok,
  rainforest_tree: () => rainTree('dark'),
  rainforest_treeLight: () => rainTree('light'),
  rainforest_bloom: () => rainTree('bloom'),
  rainforest_cecropia: cecropia,
  rainforest_palm: rainPalm,
  rainforest_banana: banana,
  rainforest_bigleaf: bigleaf,
  rainforest_heliconia: heliconia,
  rainforest_fern: fern,
  rainforest_treefern: treefern,
  rainforest_shrub: shrub,
  rainforest_log: rainLog,
  rainforest_rock: mossRock,
  rainforest_grass: rainGrass,
  rainforest_fernlet: fernlet,
  rainforest_sprout: sprout,
};
