// Kjøretøymodeller: rusten sykkel, terrengbil, motorbåt og helikopter.
import * as THREE from 'three';
import { paint, xf, merge, vmesh, cyl, box, lambert } from './geo.js';

const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

/** Sylinder mellom to punkter. */
function tube(a, b, r, color) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const len = dir.length();
  const g = paint(new THREE.CylinderGeometry(r, r, len, 6), color);
  _q.setFromUnitVectors(_up, dir.normalize());
  _m.compose(A.add(B).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  return g;
}

function wheel(radius, width, color = 0x1e1e1e, hub = 0x9a9a9a) {
  const g = new THREE.Group();
  const tire = vmesh(merge([
    xf(paint(new THREE.CylinderGeometry(radius, radius, width, 14), color), { rz: Math.PI / 2 }),
    xf(paint(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 8), hub), { rz: Math.PI / 2 }),
  ]));
  g.add(tire);
  return g;
}

export function createBike() {
  const group = new THREE.Group();
  const rust = 0x8a4b2a;
  const rust2 = 0x6e3a20;
  const frame = merge([
    tube([0, 0.36, -0.55], [0, 0.42, -0.05], 0.025, rust),
    tube([0, 0.42, -0.05], [0, 0.92, -0.2], 0.028, rust2),
    tube([0, 0.36, -0.55], [0, 0.88, -0.17], 0.022, rust),
    tube([0, 0.42, -0.05], [0, 0.88, 0.38], 0.03, rust),
    tube([0, 0.86, -0.18], [0, 0.9, 0.38], 0.028, rust2),
    box(0.15, 0.06, 0.3, 0x1a1a1a, { y: 0.96, z: -0.22 }),
    cyl(0.06, 0.06, 0.04, 8, 0x333333, { y: 0.42, z: -0.05, rz: Math.PI / 2 }),
    box(0.2, 0.08, 0.5, 0x5a4a3a, { y: 0.62, z: -0.62 }), // bagasjebrett
  ]);
  group.add(vmesh(frame));
  const steer = new THREE.Group();
  steer.position.set(0, 0.9, 0.4);
  steer.rotation.x = -0.3;
  group.add(steer);
  steer.add(vmesh(merge([
    tube([0, 0, 0], [0, -0.62, 0.2], 0.025, rust),
    tube([-0.3, 0.15, -0.05], [0.3, 0.15, -0.05], 0.02, 0x777777),
    tube([0, 0, 0], [0, 0.15, -0.05], 0.022, rust),
    cyl(0.03, 0.03, 0.12, 6, 0x111111, { x: -0.3, y: 0.15, z: -0.05, rz: Math.PI / 2 }),
    cyl(0.03, 0.03, 0.12, 6, 0x111111, { x: 0.3, y: 0.15, z: -0.05, rz: Math.PI / 2 }),
    box(0.09, 0.07, 0.06, 0xcfcfa0, { y: 0.02, z: 0.08 }),
  ])));
  const mkWheel = () => {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 6, 18), lambert(0x1c1c1c));
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    w.add(tire);
    const spokes = vmesh(merge([
      box(0.01, 0.62, 0.012, 0x999999, {}),
      box(0.01, 0.62, 0.012, 0x999999, { rx: Math.PI / 3 }),
      box(0.01, 0.62, 0.012, 0x999999, { rx: -Math.PI / 3 }),
    ]), { cast: false });
    w.add(spokes);
    return w;
  };
  const front = mkWheel();
  front.position.set(0, -0.62, 0.2);
  steer.add(front);
  const rear = mkWheel();
  rear.position.set(0, 0.36, -0.55);
  group.add(rear);
  const crank = new THREE.Group();
  crank.position.set(0, 0.42, -0.05);
  group.add(crank);
  crank.add(vmesh(merge([
    box(0.02, 0.32, 0.03, 0x555555, {}),
    box(0.1, 0.03, 0.06, 0x222222, { x: 0.07, y: 0.16 }),
    box(0.1, 0.03, 0.06, 0x222222, { x: -0.07, y: -0.16 }),
  ])));
  return { group, wheels: [front, rear], wheelRadius: 0.36, steer, steerAxis: 'y', crank, seat: new THREE.Vector3(0, 0, -0.2), pose: 'bike' };
}

export function createCar() {
  const group = new THREE.Group();
  const green = 0x4b5d34;
  const dark = 0x2b2b2b;
  group.add(vmesh(merge([
    box(1.9, 0.55, 3.9, green, { y: 0.78 }),
    box(1.86, 0.28, 1.25, 0x56693c, { y: 1.18, z: 1.3 }),
    box(1.95, 0.12, 0.3, dark, { y: 0.6, z: 2.0 }),
    box(1.95, 0.12, 0.3, dark, { y: 0.6, z: -2.0 }),
    box(0.3, 0.15, 0.05, 0xfff4c0, { x: -0.6, y: 0.98, z: 1.96 }),
    box(0.3, 0.15, 0.05, 0xfff4c0, { x: 0.6, y: 0.98, z: 1.96 }),
    box(0.25, 0.12, 0.05, 0xb02020, { x: -0.7, y: 0.95, z: -1.96 }),
    box(0.25, 0.12, 0.05, 0xb02020, { x: 0.7, y: 0.95, z: -1.96 }),
    box(1.0, 0.18, 0.04, 0x1a1a1a, { y: 0.9, z: 1.96 }),
    // seter
    box(0.6, 0.12, 0.6, 0x3a2f28, { x: -0.42, y: 1.08, z: 0.05 }),
    box(0.6, 0.6, 0.12, 0x3a2f28, { x: -0.42, y: 1.35, z: -0.27 }),
    box(0.6, 0.12, 0.6, 0x3a2f28, { x: 0.42, y: 1.08, z: 0.05 }),
    box(0.6, 0.6, 0.12, 0x3a2f28, { x: 0.42, y: 1.35, z: -0.27 }),
    box(1.6, 0.15, 1.1, 0x3a2f28, { y: 1.1, z: -1.2 }),
    // vindusramme og veltebøyle
    box(1.86, 0.06, 0.06, dark, { y: 1.95, z: 0.62 }),
    box(0.06, 0.65, 0.06, dark, { x: -0.92, y: 1.63, z: 0.66, rx: -0.25 }),
    box(0.06, 0.65, 0.06, dark, { x: 0.92, y: 1.63, z: 0.66, rx: -0.25 }),
    box(0.07, 0.95, 0.07, dark, { x: -0.9, y: 1.5, z: -0.65 }),
    box(0.07, 0.95, 0.07, dark, { x: 0.9, y: 1.5, z: -0.65 }),
    box(1.87, 0.07, 0.07, dark, { y: 1.97, z: -0.65 }),
    // reservehjul
    cyl(0.4, 0.4, 0.25, 12, 0x1e1e1e, { y: 1.15, z: -2.08, rx: Math.PI / 2 }),
    // ratt
    cyl(0.17, 0.17, 0.03, 10, 0x111111, { x: -0.42, y: 1.45, z: 0.5, rx: -1.0 }),
  ])));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.55, 0.03),
    new THREE.MeshPhongMaterial({ color: 0x9ec9e0, transparent: true, opacity: 0.35, shininess: 90 }));
  glass.position.set(0, 1.63, 0.66);
  glass.rotation.x = -0.25;
  group.add(glass);
  const wheels = [];
  const steerGroups = [];
  for (const [x, z] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) {
    const holder = new THREE.Group();
    holder.position.set(x, 0.42, z);
    group.add(holder);
    const w = wheel(0.42, 0.32);
    holder.add(w);
    wheels.push(w);
    if (z > 0) steerGroups.push(holder);
  }
  return { group, wheels, wheelRadius: 0.42, steerGroups, seat: new THREE.Vector3(-0.42, 0.64, 0.05), pose: 'sit' };
}

export function createBoat() {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.95, 2.1);
  shape.lineTo(0.95, 2.1);
  shape.lineTo(0.95, -1.0);
  shape.lineTo(0.0, -2.5);
  shape.lineTo(-0.95, -1.0);
  shape.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false });
  hullGeo.rotateX(-Math.PI / 2);
  hullGeo.translate(0, -0.15, 0);
  const hull = paint(hullGeo, 0xf2f2ee);
  const stripeShape = shape;
  const stripeGeo = new THREE.ExtrudeGeometry(stripeShape, { depth: 0.1, bevelEnabled: false });
  stripeGeo.rotateX(-Math.PI / 2);
  stripeGeo.scale(1.02, 1, 1.01);
  stripeGeo.translate(0, 0.15, 0);
  group.add(vmesh(merge([
    hull,
    paint(stripeGeo, 0xc0392b),
    box(1.6, 0.06, 2.6, 0x9a7a52, { y: 0.42, z: -0.35 }),
    box(1.2, 0.3, 0.5, 0x2e3e50, { y: 0.55, z: -0.9 }),
    box(1.6, 0.35, 0.08, 0x2e3e50, { y: 0.6, z: 0.75 }),
    box(0.45, 0.6, 0.45, 0x2a2a2a, { y: 0.55, z: -2.25 }),
    box(0.18, 0.7, 0.18, 0x3a3a3a, { y: 0.0, z: -2.3 }),
  ])));
  const ws = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.03),
    new THREE.MeshPhongMaterial({ color: 0x9ec9e0, transparent: true, opacity: 0.4, shininess: 90 }));
  ws.position.set(0, 0.98, 0.78);
  ws.rotation.x = -0.4;
  group.add(ws);
  const prop = new THREE.Group();
  prop.position.set(0, -0.3, -2.42);
  group.add(prop);
  prop.add(vmesh(merge([box(0.5, 0.08, 0.03, 0x888888, {}), box(0.08, 0.5, 0.03, 0x888888, {})]), { cast: false }));
  return { group, prop, seat: new THREE.Vector3(0, 0.22, -0.85), pose: 'sit' };
}

export function createHeli() {
  const group = new THREE.Group();
  const red = 0xb8382c;
  group.add(vmesh(merge([
    xf(paint(new THREE.SphereGeometry(1.15, 14, 10), red), { y: 1.55, z: -0.9, sx: 1.0, sy: 0.92, sz: 1.1 }),
    tube([0, 1.75, -1.6], [0, 2.05, -5.0], 0.2, red),
    box(0.1, 1.0, 0.7, red, { y: 2.45, z: -5.0, rx: -0.2 }),
    box(1.2, 0.06, 0.35, red, { y: 2.0, z: -4.6 }),
    cyl(0.1, 0.12, 0.45, 8, 0x333333, { y: 2.65, z: -0.1 }),
    box(0.9, 0.25, 0.7, 0x333333, { y: 2.45, z: -0.6 }),
    // meier
    tube([-0.85, 0.1, -1.4], [-0.85, 0.1, 1.5], 0.06, 0x2a2a2a),
    tube([0.85, 0.1, -1.4], [0.85, 0.1, 1.5], 0.06, 0x2a2a2a),
    tube([-0.85, 0.1, 0.8], [-0.55, 0.8, 0.7], 0.045, 0x2a2a2a),
    tube([0.85, 0.1, 0.8], [0.55, 0.8, 0.7], 0.045, 0x2a2a2a),
    tube([-0.85, 0.1, -0.9], [-0.55, 0.8, -0.9], 0.045, 0x2a2a2a),
    tube([0.85, 0.1, -0.9], [0.55, 0.8, -0.9], 0.045, 0x2a2a2a),
    // sete og panel
    box(0.6, 0.12, 0.55, 0x2b2b2b, { y: 0.95, z: 0.55 }),
    box(0.6, 0.6, 0.1, 0x2b2b2b, { y: 1.25, z: 0.25 }),
    box(1.0, 0.3, 0.2, 0x222222, { y: 1.35, z: 1.55, rx: 0.4 }),
    box(1.6, 0.12, 1.6, 0x444444, { y: 0.82, z: 0.75 }),
  ])));
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.05, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
    new THREE.MeshPhongMaterial({ color: 0x8fc4e0, transparent: true, opacity: 0.32, shininess: 120, side: THREE.DoubleSide, depthWrite: false }));
  canopy.scale.set(0.95, 1.05, 1.2);
  canopy.position.set(0, 1.0, 0.75);
  canopy.rotation.x = 0.35;
  group.add(canopy);
  const rotor = new THREE.Group();
  rotor.position.set(0, 2.9, -0.1);
  group.add(rotor);
  rotor.add(vmesh(merge([
    box(0.3, 0.05, 10.5, 0x1e1e1e, {}),
    box(10.5, 0.05, 0.3, 0x1e1e1e, {}),
    cyl(0.18, 0.18, 0.15, 8, 0x555555, {}),
  ])));
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.18, 2.5, -5.05);
  group.add(tailRotor);
  tailRotor.add(vmesh(merge([box(0.04, 1.3, 0.14, 0x1e1e1e, {}), box(0.04, 0.14, 1.3, 0x1e1e1e, {})]), { cast: false }));
  return { group, rotor, tailRotor, seat: new THREE.Vector3(0, 0.52, 0.55), pose: 'sit' };
}

export function createVehicleModel(type) {
  if (type === 'bike') return createBike();
  if (type === 'car') return createCar();
  if (type === 'boat') return createBoat();
  return createHeli();
}
