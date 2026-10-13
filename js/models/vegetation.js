// Trær, busker, steiner, kaktuser, palmer, isspir og gress – bygget som sammenslåtte geometrier
// slik at de kan tegnes effektivt med InstancedMesh.
import * as THREE from 'three';
import { paint, xf, merge, jitter, shadeVariation, cyl, cone, box, ico } from './geo.js';

function jIco(r, detail, color, amount, seed, t) {
  return xf(jitter(paint(new THREE.IcosahedronGeometry(r, detail), color), amount, seed), t);
}

function pine(snow) {
  const parts = [cyl(0.16, 0.28, 2.6, 6, 0x5a3a22, { y: 1.3 })];
  const greens = [0x2c5a2e, 0x2f6132, 0x285229, 0x336a36];
  for (let i = 0; i < 4; i++) {
    const r = 2.3 - i * 0.48;
    const h = 2.7 - i * 0.28;
    const y = 2.3 + i * 1.35;
    parts.push(cone(r, h, 8, greens[i], { y, ry: i * 0.7 }));
    if (snow) parts.push(cone(r * 0.82, h * 0.5, 8, 0xf1f5fa, { y: y + h * 0.27, ry: i * 0.7 + 0.2 }));
  }
  return shadeVariation(merge(parts), 0.06, 3);
}

function oak() {
  const parts = [
    cyl(0.24, 0.4, 3.2, 7, 0x5e4026, { y: 1.6 }),
    cyl(0.1, 0.16, 1.6, 5, 0x5e4026, { x: 0.5, y: 3.2, rz: -0.7 }),
    cyl(0.1, 0.16, 1.5, 5, 0x5e4026, { x: -0.45, y: 3.1, z: -0.2, rz: 0.75 }),
  ];
  const greens = [0x3e6e2c, 0x4a7c31, 0x37632a, 0x467530];
  const blobs = [[0, 4.6, 0, 1.9], [1.3, 4.0, 0.4, 1.4], [-1.2, 4.1, -0.5, 1.5], [0.3, 5.4, -0.6, 1.3], [-0.4, 4.3, 1.1, 1.3]];
  blobs.forEach(([x, y, z, r], i) => parts.push(jIco(r, 1, greens[i % 4], r * 0.35, i * 11, { x, y, z })));
  return shadeVariation(merge(parts), 0.07, 5);
}

function birch() {
  const parts = [cyl(0.12, 0.17, 5.6, 6, 0xe8e4da, { y: 2.8 })];
  for (let i = 0; i < 6; i++) parts.push(box(0.26, 0.06, 0.26, 0x2a2a2a, { y: 0.6 + i * 0.85, ry: i, s: 1 - i * 0.05 }));
  const greens = [0x6f9e3c, 0x7aa845, 0x648f36];
  [[0, 5.6, 0, 1.3], [0.6, 4.7, 0.3, 1.0], [-0.5, 4.9, -0.3, 1.05], [0, 6.4, 0.2, 0.9]].forEach(([x, y, z, r], i) =>
    parts.push(jIco(r, 1, greens[i % 3], r * 0.3, i * 7 + 2, { x, y, z, sy: 1.25 })));
  return shadeVariation(merge(parts), 0.06, 9);
}

function bush() {
  const greens = [0x335d29, 0x3c6a2f, 0x2e5426];
  const parts = [];
  [[0, 0.55, 0, 0.75], [0.55, 0.45, 0.2, 0.6], [-0.5, 0.45, -0.15, 0.62], [0.1, 0.5, -0.55, 0.55]].forEach(([x, y, z, r], i) =>
    parts.push(jIco(r, 1, greens[i % 3], r * 0.35, i * 5 + 1, { x, y, z, sy: 0.8 })));
  return merge(parts);
}

function berryBush() {
  const g = bush();
  const parts = [g];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    parts.push(ico(0.07, 0, 0xc0283a, { x: Math.cos(a) * 0.62, y: 0.5 + (i % 3) * 0.18, z: Math.sin(a) * 0.62 }));
  }
  return merge(parts);
}

function rock(color, seed) {
  return jIco(1, 1, color, 0.45, seed, { sy: 0.62, sx: 1.1 });
}

function cactus() {
  const g = 0x4d7c3a;
  const parts = [
    cyl(0.32, 0.37, 4.2, 8, g, { y: 2.1 }),
    xf(paint(new THREE.SphereGeometry(0.32, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), g), { y: 4.2 }),
    // Arm 1
    cyl(0.2, 0.2, 0.75, 7, g, { x: 0.55, y: 1.8, rz: Math.PI / 2 }),
    cyl(0.2, 0.22, 1.3, 7, g, { x: 0.88, y: 2.4 }),
    xf(paint(new THREE.SphereGeometry(0.2, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), g), { x: 0.88, y: 3.05 }),
    // Arm 2
    cyl(0.18, 0.18, 0.65, 7, g, { x: -0.5, y: 2.5, rz: Math.PI / 2 }),
    cyl(0.18, 0.2, 1.0, 7, g, { x: -0.8, y: 3.0 }),
    xf(paint(new THREE.SphereGeometry(0.18, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), g), { x: -0.8, y: 3.5 }),
  ];
  return shadeVariation(merge(parts), 0.05, 2);
}

function deadBush() {
  const c = 0x7b5d3c;
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    parts.push(cyl(0.02, 0.05, 1.1, 4, c, { x: Math.cos(a) * 0.25, y: 0.45, z: Math.sin(a) * 0.25, rx: Math.sin(a) * 0.7, rz: -Math.cos(a) * 0.7 }));
    parts.push(cyl(0.015, 0.03, 0.5, 4, c, { x: Math.cos(a) * 0.5, y: 0.8, z: Math.sin(a) * 0.5, rx: Math.sin(a + 1) * 0.9, rz: -Math.cos(a + 1) * 0.9 }));
  }
  return merge(parts);
}

function palm() {
  const parts = [];
  let x = 0, y = 0;
  for (let i = 0; i < 7; i++) {
    const tilt = 0.05 + i * 0.035;
    parts.push(cyl(0.17 - i * 0.008, 0.2 - i * 0.008, 1.05, 6, i % 2 ? 0x8a6a45 : 0x7a5c3a, { x, y: y + 0.5, rz: -tilt }));
    x += Math.sin(tilt) * 1.0;
    y += Math.cos(tilt) * 1.0;
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const leaf = paint(new THREE.BoxGeometry(0.55, 0.04, 2.6), i % 2 ? 0x4b8a34 : 0x3f7a2c);
    leaf.translate(0, 0, 1.3);
    xf(leaf, { rx: 0.45 });
    xf(leaf, { ry: a });
    xf(leaf, { x, y: y + 0.05 });
    parts.push(leaf);
  }
  for (let i = 0; i < 3; i++) parts.push(ico(0.16, 0, 0x5a3e22, { x: x + Math.cos(i * 2) * 0.25, y: y - 0.2, z: Math.sin(i * 2) * 0.25 }));
  return merge(parts);
}

function iceSpike() {
  const parts = [];
  const cols = [0xbfe7f7, 0xa8dcf2, 0xd6f1fb];
  [[0, 0, 0.55, 3.6], [0.7, 0.3, 0.35, 2.2], [-0.5, -0.4, 0.4, 2.6], [0.2, -0.7, 0.3, 1.6]].forEach(([x, z, r, h], i) =>
    parts.push(xf(jitter(paint(new THREE.ConeGeometry(r, h, 5), cols[i % 3]), 0.12, i), { x, y: h / 2 - 0.2, z, rx: x * 0.25, rz: -z * 0.25 })));
  return merge(parts);
}

function grass() {
  const pos = [];
  const col = [];
  const base = new THREE.Color(0x2f5a22);
  const tip = new THREE.Color(0x8fb84a);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + i;
    const r = 0.12 + (i % 3) * 0.08;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const h = 0.45 + ((i * 37) % 10) / 22;
    const lean = 0.18;
    const w = 0.05;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Pek normalene oppover for jevnere lys på gresset
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
  g.computeBoundingSphere();
  return g;
}

function flowers() {
  const parts = [grass()];
  const cols = [0xf2d43a, 0xffffff, 0xb46ad8, 0xe8503a];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    parts.push(ico(0.07, 0, cols[i], { x: Math.cos(a) * 0.22, y: 0.62, z: Math.sin(a) * 0.22 }));
  }
  // grass() har ikke normaler i samme format – merge() håndterer det
  return merge(parts);
}

function snowDrift() {
  return jIco(1, 1, 0xf3f7fb, 0.3, 4, { sy: 0.25, sx: 1.6 });
}

function log() {
  return merge([
    cyl(0.25, 0.28, 3.2, 7, 0x6b4a2e, { y: 0.25, rz: Math.PI / 2 }),
    cyl(0.24, 0.24, 0.02, 7, 0xb08a5a, { x: 1.61, y: 0.25, rz: Math.PI / 2 }),
  ]);
}

/** Bygg alle vegetasjonsgeometrier én gang. */
export function buildVegetation() {
  return {
    pine: pine(false),
    snowPine: pine(true),
    oak: oak(),
    birch: birch(),
    bush: bush(),
    berryBush: berryBush(),
    rock: rock(0x8a8680, 1),
    rock2: rock(0x7b7771, 7),
    desertRock: rock(0xb27a52, 3),
    iceRock: rock(0x8f9aa6, 5),
    cactus: cactus(),
    deadBush: deadBush(),
    palm: palm(),
    iceSpike: iceSpike(),
    grass: grass(),
    flowers: flowers(),
    snowDrift: snowDrift(),
    log: log(),
  };
}

/** Kollisjonsradius per type ved skala 1 (0 = ingen kollisjon). */
export const VEG_INFO = {
  pine: { radius: 0.45, cover: 1.4 },
  snowPine: { radius: 0.45, cover: 1.4 },
  oak: { radius: 0.55, cover: 1.6 },
  birch: { radius: 0.3, cover: 1.0 },
  bush: { radius: 0, cover: 1.5 },
  berryBush: { radius: 0, cover: 1.5 },
  rock: { radius: 0.95, cover: 1.6 },
  rock2: { radius: 0.95, cover: 1.6 },
  desertRock: { radius: 0.95, cover: 1.6 },
  iceRock: { radius: 0.95, cover: 1.6 },
  cactus: { radius: 0.4, cover: 0 },
  deadBush: { radius: 0, cover: 0.9 },
  palm: { radius: 0.3, cover: 0 },
  iceSpike: { radius: 0.6, cover: 1.2 },
  grass: { radius: 0, cover: 0 },
  flowers: { radius: 0, cover: 0 },
  snowDrift: { radius: 0, cover: 0 },
  log: { radius: 0, cover: 1.0 },
};
