// Gjenstander i verden: skattekister, ryggsekk, telt, bål, kasser og bur.
import * as THREE from 'three';
import { paint, xf, merge, vmesh, cyl, box, jitter, glowTexture } from './geo.js';

let chestGeo = null;
export function createChest(rare = false) {
  if (!chestGeo) {
    const lid = paint(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10, 1, false, 0, Math.PI), 0x7a4e2a);
    xf(lid, { rz: Math.PI / 2, y: 0.5 });
    const gold = 0xd8a92a;
    chestGeo = merge([
      box(0.9, 0.5, 0.6, 0x6b4423, { y: 0.25 }),
      lid,
      box(0.06, 0.52, 0.62, gold, { x: -0.3, y: 0.26 }),
      box(0.06, 0.52, 0.62, gold, { x: 0.3, y: 0.26 }),
      box(0.94, 0.05, 0.64, gold, { y: 0.5 }),
      box(0.12, 0.15, 0.04, gold, { y: 0.45, z: 0.31 }),
    ]);
  }
  const g = new THREE.Group();
  const m = vmesh(chestGeo);
  g.add(m);
  if (rare) m.scale.setScalar(1.25);
  // Glimt som gjør kisten lettere å oppdage
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: rare ? 0xffe28a : 0xffd36a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glint.scale.set(1.4, 1.4, 1.4);
  glint.position.y = 0.9;
  g.add(glint);
  g.userData.glint = glint;
  return g;
}

export function createBackpack(color = 0xc0392b) {
  const g = new THREE.Group();
  g.add(vmesh(merge([
    box(0.45, 0.55, 0.28, color, { y: 0.28 }),
    box(0.38, 0.2, 0.12, 0x2c3e50, { y: 0.2, z: 0.18 }),
    box(0.47, 0.1, 0.3, 0x2c3e50, { y: 0.56 }),
    cyl(0.08, 0.08, 0.5, 8, 0x8e7a5a, { y: 0.62, rz: Math.PI / 2 }),
  ])));
  return g;
}

export function createTent(color = 0x5d6b3a) {
  const g = paint(new THREE.CylinderGeometry(1.7, 1.7, 3.4, 3), color);
  xf(g, { rx: -Math.PI / 2 });
  xf(g, { y: 0.85 });
  const door = paint(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 3), 0x2a2a1a);
  xf(door, { rx: -Math.PI / 2 });
  xf(door, { y: 0.45, z: 1.71 });
  const m = vmesh(merge([g, door, cyl(0.04, 0.04, 2.8, 4, 0x5a4a3a, { y: 1.4, z: 1.75 })]), { cast: true, receive: true });
  return m;
}

export function createCampfire() {
  const g = new THREE.Group();
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    parts.push(xf(jitter(paint(new THREE.IcosahedronGeometry(0.2, 0), 0x777777), 0.08, i), { x: Math.cos(a) * 0.7, y: 0.08, z: Math.sin(a) * 0.7 }));
  }
  for (let i = 0; i < 4; i++) parts.push(cyl(0.08, 0.08, 1.1, 6, 0x4a3020, { y: 0.15, ry: (i * Math.PI) / 4, rz: Math.PI / 2 }));
  g.add(vmesh(merge(parts)));
  const flame = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 7), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85 }));
  outer.position.y = 0.6;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.75, 7), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
  inner.position.y = 0.45;
  flame.add(outer, inner);
  g.add(flame);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff8a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
  glow.scale.set(4, 4, 4);
  glow.position.y = 0.7;
  g.add(glow);
  g.userData.flame = flame;
  g.userData.glow = glow;
  return g;
}

export function createCrate() {
  return vmesh(merge([
    box(0.9, 0.9, 0.9, 0x8b6b3e, { y: 0.45 }),
    box(0.94, 0.08, 0.94, 0x5e4526, { y: 0.86 }),
    box(0.94, 0.08, 0.94, 0x5e4526, { y: 0.04 }),
    box(0.08, 0.9, 0.94, 0x5e4526, { x: 0.43, y: 0.45 }),
    box(0.08, 0.9, 0.94, 0x5e4526, { x: -0.43, y: 0.45 }),
  ]), { cast: true, receive: true });
}

export function createCage() {
  const g = new THREE.Group();
  const bars = [];
  const W = 1.6, D = 1.2, H = 1.3;
  bars.push(box(W + 0.1, 0.08, D + 0.1, 0x3a3a3a, { y: 0.04 }));
  bars.push(box(W + 0.1, 0.06, D + 0.1, 0x3a3a3a, { y: H }));
  for (let i = 0; i <= 8; i++) {
    const x = -W / 2 + (i / 8) * W;
    bars.push(cyl(0.025, 0.025, H, 5, 0x666666, { x, y: H / 2, z: -D / 2 }));
  }
  for (let i = 1; i < 6; i++) {
    const z = -D / 2 + (i / 6) * D;
    bars.push(cyl(0.025, 0.025, H, 5, 0x666666, { x: -W / 2, y: H / 2, z }));
    bars.push(cyl(0.025, 0.025, H, 5, 0x666666, { x: W / 2, y: H / 2, z }));
  }
  g.add(vmesh(merge(bars)));
  // Dør (forsiden) som kan åpnes
  const door = new THREE.Group();
  door.position.set(-W / 2, 0, D / 2);
  const dbars = [];
  for (let i = 0; i <= 8; i++) dbars.push(cyl(0.025, 0.025, H, 5, 0x777777, { x: (i / 8) * W, y: H / 2 }));
  dbars.push(box(W, 0.05, 0.05, 0x555555, { x: W / 2, y: H * 0.5 }));
  dbars.push(box(0.12, 0.16, 0.08, 0xb08a2a, { x: W - 0.1, y: H * 0.5, z: 0.04 }));
  door.add(vmesh(merge(dbars)));
  g.add(door);
  g.userData.door = door;
  return g;
}

export function createTrophyRack() {
  // Et stativ med skinn – et tegn på krypskyting
  return vmesh(merge([
    cyl(0.05, 0.05, 2, 5, 0x4a3020, { x: -0.9, y: 1 }),
    cyl(0.05, 0.05, 2, 5, 0x4a3020, { x: 0.9, y: 1 }),
    cyl(0.04, 0.04, 2, 5, 0x4a3020, { y: 1.9, rz: Math.PI / 2 }),
    box(0.8, 1.0, 0.03, 0x9a7a52, { x: -0.35, y: 1.35 }),
    box(0.6, 0.8, 0.03, 0xd8c9a8, { x: 0.45, y: 1.45 }),
  ]));
}

/** Svevende markør over oppdrags-mål. */
export function createQuestBeacon(color = 0xffd34a) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 40, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.position.y = 20;
  g.add(beam);
  return g;
}

/** Enkelt sky-objekt (flere flate kuler). */
export function createCloudGeometry(seed) {
  const parts = [];
  const n = 5 + (seed % 4);
  for (let i = 0; i < n; i++) {
    const a = i * 2.1 + seed;
    parts.push(xf(paint(new THREE.IcosahedronGeometry(1, 1), 0xffffff), {
      x: Math.cos(a) * (i * 3.5), y: Math.sin(i * 1.7) * 1.5, z: Math.sin(a) * (i * 2), s: 6 + ((i * 7 + seed) % 5),
    }));
  }
  return merge(parts);
}
