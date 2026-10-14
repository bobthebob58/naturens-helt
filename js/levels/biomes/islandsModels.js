// 3D-modeller for biomet Tropiske øyer: kokospalmer, skrupalme (pandanus), tropiske busker, hibiskus,
// strandsteiner, rekved, korallrev, sjøgress, tang og strandgress.
// Alle modeller er lavpolygon med vertex-farger og har origo midt på bunnen (y = 0 på bakken).
import * as THREE from 'three';
import { paint, xf, merge, shadeVariation, ico } from '../../models/geo.js';
import { jIco } from '../../models/vegetation.js';
import { lerp, mulberry32 } from '../../utils/math.js';

const _ca = new THREE.Color();
const _cb = new THREE.Color();

/** Åpen sylinder (uten lokk) – sparer trekanter på stammer og greiner. */
function tube(rt, rb, h, seg, color, t) {
  return xf(paint(new THREE.CylinderGeometry(rt, rb, h, seg, 1, true), color), t);
}

/** Lag geometri av en liste trekanter med farger per hjørne. Valgfritt dobbeltsidig. */
function triGeo(pos, col, doubleSided) {
  if (doubleSided) {
    const n = pos.length / 9;
    for (let i = 0; i < n; i++) {
      const p = i * 9;
      // Samme trekant med motsatt vinding (baksiden)
      pos.push(pos[p], pos[p + 1], pos[p + 2], pos[p + 6], pos[p + 7], pos[p + 8], pos[p + 3], pos[p + 4], pos[p + 5]);
      col.push(col[p], col[p + 1], col[p + 2], col[p + 6], col[p + 7], col[p + 8], col[p + 3], col[p + 4], col[p + 5]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Fjærformet palmeblad: sagtakkede småblad langs en buet midtribbe. Bygges langs +Z fra origo,
 * løftes `lift` radianer over horisontalen og bøyes `droop` radianer nedover mot spissen. Dobbeltsidig.
 */
function frond({ len = 3.2, wid = 0.6, lift = 0.5, droop = 1.6, seg = 7, col = 0x3c8a30, tip = 0x7ab446 }) {
  const pos = [], cols = [];
  const P = [];
  let y = 0, z = 0, a = lift;
  const sl = len / seg;
  for (let i = 0; i <= seg; i++) {
    P.push([y, z, a]);
    y += Math.sin(a) * sl;
    z += Math.cos(a) * sl;
    a -= droop / seg;
  }
  _ca.set(col);
  _cb.set(tip);
  for (let i = 0; i < seg; i++) {
    const t = (i + 0.5) / seg;
    const w = wid * Math.sin(Math.PI * (0.1 + t * 0.86));
    const [y0, z0, a0] = P[i];
    const [y1, z1] = P[i + 1];
    const my = (y0 + y1) / 2, mz = (z0 + z1) / 2;
    const ca = Math.cos(a0), sa = Math.sin(a0);
    const k = Math.min(1, t * 1.2);
    const lr = lerp(_ca.r, _cb.r, k), lg = lerp(_ca.g, _cb.g, k), lb = lerp(_ca.b, _cb.b, k);
    for (const side of [-1, 1]) {
      // Småbladets spiss: ut til siden, litt fram og litt ned (V-form)
      const lx = side * w;
      const ly = my - w * 0.4 * ca + sa * sl * 0.45;
      const lz = mz + w * 0.4 * sa + ca * sl * 0.45;
      if (side < 0) pos.push(0, y0, z0, lx, ly, lz, 0, y1, z1);
      else pos.push(0, y0, z0, 0, y1, z1, lx, ly, lz);
      cols.push(_ca.r, _ca.g, _ca.b, lr, lg, lb, _ca.r, _ca.g, _ca.b);
    }
  }
  return triGeo(pos, cols, true);
}

/** Smalt, langt blad (pandanus, store tropiske blader). Langs +Z, dobbeltsidig. */
function strip({ len = 2, wid = 0.14, lift = 0.6, droop = 1.2, seg = 3, col = 0x4a7a3a, tip = 0x7aa64a, round = false }) {
  const pos = [], cols = [];
  const P = [];
  let y = 0, z = 0, a = lift;
  const sl = len / seg;
  for (let i = 0; i <= seg; i++) {
    P.push([y, z]);
    y += Math.sin(a) * sl;
    z += Math.cos(a) * sl;
    a -= droop / seg;
  }
  _ca.set(col);
  _cb.set(tip);
  // Bredde per punkt: spiss i enden (round = bredest på midten, som et stort tropisk blad)
  const W = P.map((_, i) => {
    const t = i / seg;
    return round ? wid * Math.sin(Math.PI * Math.min(0.97, 0.15 + t * 0.85)) : wid * (1 - t * 0.92);
  });
  for (let i = 0; i < seg; i++) {
    const [y0, z0] = P[i], [y1, z1] = P[i + 1];
    const w0 = W[i], w1 = W[i + 1];
    const k0 = i / seg, k1 = (i + 1) / seg;
    const c0 = [lerp(_ca.r, _cb.r, k0), lerp(_ca.g, _cb.g, k0), lerp(_ca.b, _cb.b, k0)];
    const c1 = [lerp(_ca.r, _cb.r, k1), lerp(_ca.g, _cb.g, k1), lerp(_ca.b, _cb.b, k1)];
    // Litt V-form: kantene ligger lavere enn midtribben
    const d0 = w0 * 0.25, d1 = w1 * 0.25;
    pos.push(-w0, y0 - d0, z0, 0, y1, z1, 0, y0, z0);
    cols.push(...c0, ...c1, ...c0);
    pos.push(-w0, y0 - d0, z0, -w1, y1 - d1, z1, 0, y1, z1);
    cols.push(...c0, ...c1, ...c1);
    pos.push(0, y0, z0, 0, y1, z1, w0, y0 - d0, z0);
    cols.push(...c0, ...c1, ...c0);
    pos.push(w0, y0 - d0, z0, 0, y1, z1, w1, y1 - d1, z1);
    cols.push(...c0, ...c1, ...c1);
  }
  return triGeo(pos, cols, true);
}

/**
 * Tuster av gressblader (sjøgress, strandgress, tang). Hvert blad er en tynn, lukket pyramide med trekantet
 * tverrsnitt, slik at bare forsider er synlige også med dobbeltsidig pynt-materiale (ingen svarte baksider).
 */
function blades({ n = 9, h = 0.6, hVar = 0.3, spread = 0.25, lean = 0.2, width = 0.05, base = 0x2f5a22, tip = 0x8fb84a, segs = 1, wave = 0, seed = 1 }) {
  const rng = mulberry32(seed);
  const pos = [], cols = [];
  _ca.set(base);
  _cb.set(tip);
  const ring = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const prev = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const r = spread * Math.sqrt(rng());
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const bh = h + (rng() - 0.5) * hVar * 2;
    const la = a + (rng() - 0.5) * 1.2;
    const ux = Math.cos(la), uz = Math.sin(la);
    // Bladflaten står på tvers av lenteretningen, med en smal kjøl bakover
    const px = -uz * width, pz = ux * width;
    const ph = rng() * 6;
    const setRing = (out, x, y, z, w) => {
      out[0][0] = x + px * w; out[0][1] = y; out[0][2] = z + pz * w;
      out[1][0] = x - px * w; out[1][1] = y; out[1][2] = z - pz * w;
      out[2][0] = x - ux * width * 0.45 * w; out[2][1] = y; out[2][2] = z - uz * width * 0.45 * w;
    };
    setRing(prev, cx, 0, cz, 1);
    let k0 = 0;
    for (let s = 0; s < segs; s++) {
      const t1 = (s + 1) / segs;
      const wv = wave * Math.sin(ph + t1 * 4) * t1 * 6;
      const x1 = cx + ux * lean * t1 * t1 + (px / width) * wv, z1 = cz + uz * lean * t1 * t1 + (pz / width) * wv, y1 = bh * t1;
      const c0 = [lerp(_ca.r, _cb.r, k0), lerp(_ca.g, _cb.g, k0), lerp(_ca.b, _cb.b, k0)];
      const c1 = [lerp(_ca.r, _cb.r, t1), lerp(_ca.g, _cb.g, t1), lerp(_ca.b, _cb.b, t1)];
      if (s === segs - 1) {
        for (let e = 0; e < 3; e++) {
          const A = prev[e], B = prev[(e + 1) % 3];
          pos.push(A[0], A[1], A[2], B[0], B[1], B[2], x1, y1, z1);
          cols.push(...c0, ...c0, ...c1);
        }
      } else {
        setRing(ring, x1, y1, z1, 1 - t1 * 0.6);
        for (let e = 0; e < 3; e++) {
          const A = prev[e], B = prev[(e + 1) % 3], C = ring[e], D = ring[(e + 1) % 3];
          // Vinding mot klokka sett utenfra (normalene peker utover)
          pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
          cols.push(...c0, ...c0, ...c1);
          pos.push(B[0], B[1], B[2], D[0], D[1], D[2], C[0], C[1], C[2]);
          cols.push(...c0, ...c1, ...c1);
        }
        for (let e = 0; e < 3; e++) for (let q = 0; q < 3; q++) prev[e][q] = ring[e][q];
      }
      k0 = t1;
    }
  }
  const g = triGeo(pos, cols, false);
  // Bøy normalene oppover for jevnt, mykt lys på bladene
  const nn = g.attributes.normal;
  for (let i = 0; i < nn.count; i++) {
    const x = nn.getX(i) * 0.45, y = nn.getY(i) * 0.45 + 0.9, z = nn.getZ(i) * 0.45;
    const l = Math.hypot(x, y, z);
    nn.setXYZ(i, x / l, y / l, z / l);
  }
  return merge([g]);
}

// ---------- Palmer ----------

/**
 * Kokospalme. Stammen bygges av ledd der helningen endres litt for hvert ledd
 * (tiltStep < 0 gir en stamme som lener seg ut og bøyer seg opp igjen mot kronen).
 */
function coconutPalm({ segs = 9, segLen = 1, tilt0 = 0.05, tiltStep = 0.025, r0 = 0.22, r1 = 0.13, fronds = 10, flen = 3.3, seed = 1, nuts = 4 }) {
  const rng = mulberry32(seed);
  const parts = [];
  const bark = [0x8c6e4c, 0x7a5e3e];
  // Rotfot
  parts.push(tube(r0 * 1.05, r0 * 1.7, 0.5, 7, 0x6e5436, { y: 0.2 }));
  let x = 0, y = 0.05, tilt = tilt0;
  for (let i = 0; i < segs; i++) {
    const rb = lerp(r0, r1, i / segs), rt = lerp(r0, r1, (i + 1) / segs);
    const dx = Math.sin(tilt) * segLen, dy = Math.cos(tilt) * segLen;
    // Ringene: hvert ledd er litt tykkere nederst
    parts.push(tube(rt, rb * 1.1, segLen * 1.06, 6, bark[i % 2], { x: x + dx / 2, y: y + dy / 2, rz: -tilt }));
    x += dx;
    y += dy;
    tilt += tiltStep;
  }
  // Krone: unge blad peker opp, eldre henger ned
  parts.push(ico(0.3, 0, 0x5d6b2c, { x, y: y + 0.05, sy: 1.3 }));
  for (let i = 0; i < fronds; i++) {
    const yaw = (i / fronds) * Math.PI * 2 + rng() * 0.4;
    const age = i % 3;
    const lift = [0.75, 0.35, -0.05][age] + (rng() - 0.5) * 0.2;
    const droop = [1.3, 1.7, 1.9][age];
    const len = flen * (0.85 + rng() * 0.3) * (age === 0 ? 0.85 : 1);
    const col = age === 2 ? 0x356f2a : 0x3c8a30;
    parts.push(xf(frond({ len, wid: 0.62, lift, droop, col, tip: age === 0 ? 0x8cc44e : 0x74ad42 }), { x, y: y + 0.12, ry: yaw }));
  }
  // Et visnet, brunt blad som henger ned
  parts.push(xf(frond({ len: flen * 0.8, wid: 0.45, lift: -0.6, droop: 0.9, seg: 5, col: 0x8a6e3e, tip: 0xb0925a }), { x, y: y - 0.05, ry: rng() * 6.28 }));
  // Kokosnøtter
  for (let k = 0; k < nuts; k++) {
    const a = (k / nuts) * Math.PI * 2 + rng();
    parts.push(ico(0.17, 0, k % 2 ? 0x6b4a26 : 0x8a9a34, { x: x + Math.cos(a) * 0.24, y: y - 0.22 - (k % 2) * 0.1, z: Math.sin(a) * 0.24 }));
  }
  return shadeVariation(merge(parts), 0.05, seed);
}

function palmStraight() {
  return coconutPalm({ segs: 9, segLen: 1.0, tilt0: 0.03, tiltStep: 0.028, seed: 3 });
}

function palmBent() {
  // Lener seg ut over stranden og bøyer seg opp mot lyset
  return coconutPalm({ segs: 9, segLen: 0.98, tilt0: 0.82, tiltStep: -0.08, r0: 0.21, r1: 0.13, seed: 11, flen: 3.1 });
}

function palmTwin() {
  const a = coconutPalm({ segs: 9, segLen: 1.0, tilt0: 0.2, tiltStep: 0.02, seed: 21 });
  const b = xf(coconutPalm({ segs: 7, segLen: 0.95, tilt0: 0.5, tiltStep: -0.03, r0: 0.18, r1: 0.12, fronds: 9, flen: 2.9, seed: 27, nuts: 3 }), { ry: Math.PI * 0.95, x: -0.3, z: 0.2 });
  const c = xf(coconutPalm({ segs: 2, segLen: 0.7, tilt0: 0.3, tiltStep: 0.1, r0: 0.1, r1: 0.08, fronds: 6, flen: 1.6, seed: 33, nuts: 0 }), { ry: 2.0, x: 0.7, z: -0.9 });
  return merge([a, b, c]);
}

// ---------- Skrupalme (pandanus) med støtterøtter ----------
function pandanus() {
  const rng = mulberry32(5);
  const parts = [];
  const bark = 0x8a7a60;
  // Støtterøtter fra stammen ned i sanden
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const th = 0.5;
    parts.push(tube(0.035, 0.055, 1.5, 4, 0x9a8a6c, { x: Math.cos(a) * 0.38, y: 0.65, z: Math.sin(a) * 0.38, rx: -Math.sin(a) * th, rz: Math.cos(a) * th }));
  }
  parts.push(tube(0.17, 0.21, 2.4, 6, bark, { y: 2.1, rz: 0.06 }));
  // Greiner med bladroser
  const tops = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const th = 0.6 + i * 0.12;
    const len = 1.3 + i * 0.2;
    const bx = 0.07, by = 3.2;
    const dx = Math.cos(a) * Math.sin(th) * len, dz = Math.sin(a) * Math.sin(th) * len, dy = Math.cos(th) * len;
    parts.push(tube(0.07, 0.11, len, 5, bark, { x: bx + dx / 2, y: by + dy / 2, z: dz / 2, rx: Math.sin(a) * th, rz: -Math.cos(a) * th }));
    tops.push([bx + dx, by + dy, dz]);
  }
  tops.forEach(([tx, ty, tz], j) => {
    for (let i = 0; i < 11; i++) {
      const yaw = (i / 11) * Math.PI * 2 + rng() * 0.4;
      const lift = 1.05 - (i % 3) * 0.5;
      parts.push(xf(strip({ len: 1.9 + rng() * 0.6, wid: 0.13, lift, droop: 1.8, seg: 3, col: 0x3a6a36, tip: 0x86aa5c }), { x: tx, y: ty, z: tz, ry: yaw }));
    }
    if (j === 1) parts.push(jIco(0.26, 1, 0xe08a2a, 0.06, 4, { x: tx, y: ty - 0.32, z: tz, sy: 1.2 }));
  });
  return shadeVariation(merge(parts), 0.05, 7);
}

// ---------- Busker ----------
function tropicalBush() {
  const rng = mulberry32(9);
  const parts = [];
  const greens = [0x2f7a30, 0x37883a, 0x2a6c2c];
  [[0, 0.5, 0, 0.72], [0.5, 0.42, 0.25, 0.55], [-0.45, 0.45, -0.2, 0.58]].forEach(([x, y, z, r], i) =>
    parts.push(jIco(r, 1, greens[i % 3], r * 0.3, i * 7 + 3, { x, y, z, sy: 0.85 })));
  // Store blanke blader som stikker ut av busken
  for (let i = 0; i < 9; i++) {
    const yaw = (i / 9) * Math.PI * 2 + rng() * 0.5;
    const lift = 0.7 + rng() * 0.4;
    parts.push(xf(strip({ len: 1.25 + rng() * 0.35, wid: 0.32, lift, droop: 1.5, seg: 3, col: 0x2f7d34, tip: 0x6cba4c, round: true }), { y: 0.3 + rng() * 0.3, ry: yaw }));
  }
  return shadeVariation(merge(parts), 0.06, 13);
}

function hibiscus() {
  const rng = mulberry32(17);
  const parts = [];
  const greens = [0x2c6a2c, 0x34793a, 0x285f28];
  const blobs = [[0, 0.62, 0, 0.75], [0.55, 0.5, 0.2, 0.58], [-0.5, 0.52, -0.25, 0.6], [0.05, 0.95, -0.35, 0.5]];
  blobs.forEach(([x, y, z, r], i) => parts.push(jIco(r, 1, greens[i % 3], r * 0.3, i * 5 + 2, { x, y, z, sy: 0.9 })));
  // Store blomster (rød, rosa, gul) på overflaten av busken
  const cols = [0xe8283c, 0xf04a78, 0xe8283c, 0xf6c23a];
  for (let i = 0; i < 14; i++) {
    const [bx, by, bz, br] = blobs[i % blobs.length];
    const a = rng() * Math.PI * 2;
    const el = 0.15 + rng() * 0.9;
    const fx = bx + Math.cos(a) * Math.cos(el) * br, fy = by + Math.sin(el) * br * 0.9, fz = bz + Math.sin(a) * Math.cos(el) * br;
    parts.push(ico(0.13, 0, cols[i % cols.length], { x: fx, y: fy, z: fz, sy: 0.55, ry: a }));
  }
  return merge(parts);
}

// ---------- Stein og rekved ----------
function beachRock() {
  return merge([
    jIco(1, 1, 0xbdb09a, 0.3, 31, { sy: 0.62, sx: 1.15 }),
    jIco(0.5, 1, 0xa89c88, 0.18, 37, { x: 0.95, y: -0.05, z: 0.4, sy: 0.7 }),
  ]);
}

function cliffRock() {
  return merge([
    jIco(1, 1, 0x5e5650, 0.5, 41, { sy: 0.8 }),
    jIco(0.55, 1, 0x4e4842, 0.3, 43, { x: -0.8, y: -0.1, z: 0.5, sy: 0.9 }),
  ]);
}

function driftwood() {
  const c = 0xc9bca4, c2 = 0xa89a84;
  const parts = [
    // Bleket stamme som ligger langs x-aksen
    tube(0.16, 0.23, 3.6, 6, c, { y: 0.2, rz: Math.PI / 2 }),
    xf(paint(new THREE.CircleGeometry(0.16, 6), 0xd8ccb2), { x: 1.8, y: 0.2, ry: Math.PI / 2 }),
    // Greinstumper
    tube(0.04, 0.08, 1.1, 5, c, { x: 0.6, y: 0.45, z: 0.3, rx: 0.9, rz: -0.4 }),
    tube(0.03, 0.06, 0.8, 5, c2, { x: -0.4, y: 0.38, z: -0.25, rx: -1.0, rz: 0.3 }),
  ];
  // Rotvelte i den tykke enden
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(tube(0.03, 0.08, 0.9, 4, c2, { x: -1.95, y: 0.22 + Math.sin(a) * 0.25, z: Math.cos(a) * 0.3, rx: Math.cos(a) * 0.9, rz: Math.PI / 2 + Math.sin(a) * 0.6 }));
  }
  return shadeVariation(merge(parts), 0.06, 19);
}

// ---------- Korallrev ----------
function brainCoral(color, r, x, z, seed) {
  return jIco(r, 1, color, r * 0.16, seed, { x, y: r * 0.25, z, sy: 0.7 });
}

function staghorn(color, x, z, n, size, seed) {
  const rng = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const th = 0.25 + rng() * 0.6;
    const len = size * (0.6 + rng() * 0.6);
    const dx = Math.cos(a) * Math.sin(th) * len, dz = Math.sin(a) * Math.sin(th) * len, dy = Math.cos(th) * len;
    parts.push(tube(0.025, 0.06, len, 5, color, { x: x + dx / 2, y: dy / 2, z: z + dz / 2, rx: Math.sin(a) * th, rz: -Math.cos(a) * th }));
    // Sidegrein
    const a2 = a + (rng() - 0.5) * 1.6, th2 = th + 0.35, l2 = len * 0.5;
    const sx = x + dx * 0.6, sy = dy * 0.6, sz = z + dz * 0.6;
    const ex = Math.cos(a2) * Math.sin(th2) * l2, ez = Math.sin(a2) * Math.sin(th2) * l2, ey = Math.cos(th2) * l2;
    parts.push(tube(0.02, 0.04, l2, 4, color, { x: sx + ex / 2, y: sy + ey / 2, z: sz + ez / 2, rx: Math.sin(a2) * th2, rz: -Math.cos(a2) * th2 }));
  }
  return merge(parts);
}

function tableCoral(color, x, z, r) {
  return merge([
    tube(0.07, 0.11, 0.45, 5, color, { x, y: 0.22, z }),
    xf(paint(new THREE.CylinderGeometry(r, r * 0.7, 0.1, 9), color), { x, y: 0.5, z, rx: 0.08 }),
  ]);
}

function seaFan(color, x, z, s, ry) {
  return merge([
    tube(0.025, 0.04, 0.3, 4, 0x5a3a4a, { x, y: 0.15, z }),
    xf(jIco(0.55 * s, 1, color, 0.1 * s, 7, { sz: 0.1, sy: 0.75, sx: 1.3 }), { x, y: 0.28 + 0.4 * s, z, ry }),
  ]);
}

function tubes(color, x, z, n, seed) {
  const rng = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, r = rng() * 0.22;
    const h = 0.25 + rng() * 0.35;
    parts.push(tube(0.06, 0.07, h, 6, color, { x: x + Math.cos(a) * r, y: h / 2, z: z + Math.sin(a) * r, rx: (rng() - 0.5) * 0.3, rz: (rng() - 0.5) * 0.3 }));
  }
  return merge(parts);
}

function reefA() {
  return merge([
    brainCoral(0xe6bd48, 0.55, 0, 0, 51),
    staghorn(0xf06a9c, 0.65, 0.35, 6, 0.75, 52),
    ico(0.16, 0, 0x8a4ad0, { x: -0.45, y: 0.08, z: 0.5 }),
    ico(0.12, 0, 0x8a4ad0, { x: -0.6, y: 0.06, z: 0.25 }),
    brainCoral(0x6ec46a, 0.25, -0.35, -0.55, 53),
  ]);
}

function reefB() {
  return merge([
    tableCoral(0x46b6a0, 0, 0, 0.75),
    tubes(0xf0862e, 0.75, -0.3, 6, 61),
    seaFan(0xa24ed8, -0.55, 0.45, 1, 0.6),
    ico(0.14, 0, 0xf2d24a, { x: 0.3, y: 0.06, z: 0.7 }),
  ]);
}

function reefC() {
  return merge([
    seaFan(0xe0424a, 0, -0.2, 1.2, 0.2),
    staghorn(0xf4d040, 0.55, 0.4, 5, 0.6, 71),
    brainCoral(0x4a80e0, 0.32, -0.55, 0.35, 72),
    tubes(0xf27aa8, -0.2, 0.6, 4, 73),
    brainCoral(0x8ad070, 0.22, 0.6, -0.45, 74),
  ]);
}

// ---------- Sjøgress, tang og strandgress ----------
function seagrass() {
  return blades({ n: 14, h: 0.75, hVar: 0.25, spread: 0.45, lean: 0.25, width: 0.045, base: 0x24602a, tip: 0x7cc24c, segs: 2, wave: 0.03, seed: 81 });
}

function seaweed() {
  return blades({ n: 8, h: 1.1, hVar: 0.35, spread: 0.3, lean: 0.2, width: 0.09, base: 0x5a4a1c, tip: 0xb09a3e, segs: 3, wave: 0.06, seed: 83 });
}

function beachGrass() {
  return blades({ n: 8, h: 0.6, hVar: 0.2, spread: 0.2, lean: 0.35, width: 0.035, base: 0x7a8a40, tip: 0xd9d08a, segs: 2, seed: 87 });
}

function tropicalGrass() {
  return blades({ n: 10, h: 0.55, hVar: 0.2, spread: 0.28, lean: 0.25, width: 0.04, base: 0x2c6424, tip: 0x8ccc52, segs: 2, seed: 89 });
}

function tropicalFlowers() {
  const parts = [blades({ n: 7, h: 0.45, hVar: 0.15, spread: 0.25, lean: 0.2, width: 0.04, base: 0x2c6424, tip: 0x84c24e, segs: 2, seed: 91 })];
  const cols = [0xf0508e, 0xffffff, 0xe8303a, 0xf6d23a, 0xb45ad8];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.37;
    parts.push(ico(0.075, 0, cols[i], { x: Math.cos(a) * 0.22, y: 0.5 + (i % 2) * 0.08, z: Math.sin(a) * 0.22, sy: 0.6 }));
  }
  return merge(parts);
}

export const MODELS = {
  islands_palm: palmStraight,
  islands_palmBent: palmBent,
  islands_palmTwin: palmTwin,
  islands_pandanus: pandanus,
  islands_bush: tropicalBush,
  islands_hibiscus: hibiscus,
  islands_rock: beachRock,
  islands_cliffRock: cliffRock,
  islands_driftwood: driftwood,
  islands_reefA: reefA,
  islands_reefB: reefB,
  islands_reefC: reefC,
  islands_seagrass: seagrass,
  islands_seaweed: seaweed,
  islands_beachGrass: beachGrass,
  islands_grass: tropicalGrass,
  islands_flowers: tropicalFlowers,
};
