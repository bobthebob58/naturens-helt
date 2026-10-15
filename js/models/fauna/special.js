// Arter med egne rigger: krokodille (amfibisk rovdyr), havskilpadde (amfibisk, vennlig) og papegøye.
// Faste deler slås sammen til én mesh med vertex-farger og deles mellom alle dyr av arten (mellomlagret per nøkkel);
// bare leddene – kjeve, hale, bein, luffer og vinger – er egne grupper som animeres.
// Modellene ser langs +Z og står på y = 0. Egen skalering ligger på en undergruppe (`model`), fordi
// leirene skalerer `root` for dyr i bur.
import * as THREE from 'three';
import { paint, box, cyl, cone, sphere, merge, vertexMat } from '../geo.js';
import { damp, clamp } from '../../utils/math.js';

// ======================================================================
// Hjelpere
// ======================================================================
const GEO = new Map();
const _c = new THREE.Color();

/** Sammenslått geometri bygd én gang per nøkkel. build(parts) legger fargede delgeometrier i parts. */
function shared(key, build) {
  let g = GEO.get(key);
  if (!g) {
    const parts = [];
    build(parts);
    g = merge(parts);
    GEO.set(key, g);
  }
  return g;
}

/** Legg en delt mesh på en gruppe. */
function part(parent, key, build, cast = true) {
  const m = new THREE.Mesh(shared(key, build), vertexMat);
  m.castShadow = cast;
  m.userData.sharedGeometry = true; // delt mellom alle dyr av arten – må ikke frigjøres (dispose) ved despawn
  parent.add(m);
  return m;
}

function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** Farg hver trekant (flatt) etter midtpunktet: fn(x, y, z) -> hex. Geometrien må være ikke-indeksert. */
function colorTris(geo, fn) {
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    _c.set(fn(x, y, z));
    for (let j = 0; j < 3; j++) c.setXYZ(i + j, _c.r, _c.g, _c.b);
  }
  return geo;
}

/** Deterministisk «tilfeldig» tall 0..1 for et punkt (flekker o.l.). */
function hash3(x, y, z) {
  const k = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return k - Math.floor(k);
}

const HALF_PI = Math.PI / 2;

// ======================================================================
// Krokodille
// ======================================================================
const CROC = {
  back: 0x47552c, side: 0x5c6a39, belly: 0xcfc690, scute: 0x343f1d, teeth: 0xf1eedf,
  mouth: 0xd99c8c, eye: 0xd8c23a, pupil: 0x141414, claw: 0xcfc7a6,
};
const CROC_BODY_Y = 0.375; // kroppens midtpunkt når den står (føttene på bakken)
const CROC_SWIM_Y = 0.24; // rygg, øyne og nesebor over vannflaten
const CROC_HEAD_Z = 0.8;
const TAIL = [
  { l: 0.42, f: 0.33, b: 0.27 },
  { l: 0.4, f: 0.27, b: 0.21 },
  { l: 0.38, f: 0.21, b: 0.15 },
  { l: 0.36, f: 0.15, b: 0.1 },
  { l: 0.34, f: 0.1, b: 0.035 },
];

/** Rygg mørk, sider olivengrønne, buk lys – etter høyden på trekanten. */
const crocBands = (hi, lo) => (x, y) => (y > hi ? CROC.back : y > lo ? CROC.side : CROC.belly);

function crocTorso(parts) {
  // Litt avsmalnende, flattrykt kropp (åttekant)
  parts.push(colorTris(cyl(0.38, 0.33, 1.7, 8, CROC.side, { rx: HALF_PI, sx: 1.05, sz: 0.48 }), crocBands(0.09, -0.09)));
  // Ryggskjold i fire rader
  for (let i = 0; i < 8; i++) {
    const z = -0.72 + i * 0.205;
    for (const x of [-0.25, -0.085, 0.085, 0.25]) {
      parts.push(box(0.1, 0.06, 0.13, CROC.scute, { x, y: 0.185 - Math.abs(x) * 0.2, z }));
    }
  }
}

function crocHead(parts) {
  // Nakke og hodeskalle
  parts.push(colorTris(box(0.56, 0.3, 0.42, CROC.side, { z: -0.04 }), crocBands(0.1, -0.1)));
  parts.push(colorTris(box(0.48, 0.2, 0.36, CROC.side, { y: 0.03, z: 0.3 }), crocBands(0.08, -0.2)));
  // Snute (oversiden av overkjeven)
  parts.push(box(0.32, 0.13, 0.7, CROC.back, { y: 0.0, z: 0.78 }));
  parts.push(box(0.36, 0.14, 0.14, CROC.back, { y: 0.0, z: 1.16 }));
  parts.push(box(0.13, 0.05, 0.08, CROC.scute, { y: 0.085, z: 1.15 })); // nesebor
  // Øyne på upphøyde knøler
  for (const s of [-1, 1]) {
    parts.push(box(0.12, 0.1, 0.14, CROC.back, { x: s * 0.14, y: 0.17, z: 0.3 }));
    parts.push(box(0.02, 0.05, 0.08, CROC.eye, { x: s * 0.2, y: 0.18, z: 0.32 }));
    parts.push(box(0.022, 0.045, 0.016, CROC.pupil, { x: s * 0.201, y: 0.18, z: 0.33 }));
  }
  // Ganen og tennene i overkjeven
  parts.push(box(0.26, 0.012, 0.86, CROC.mouth, { y: -0.067, z: 0.74 }));
  for (let k = 0; k < 7; k++) {
    for (const s of [-1, 1]) parts.push(cone(0.02, 0.06, 4, CROC.teeth, { x: s * 0.15, y: -0.09, z: 0.42 + k * 0.12, rx: Math.PI }));
  }
}

function crocJaw(parts) {
  // Underkjeven (pivot bakerst, ser langs +Z)
  parts.push(box(0.46, 0.1, 0.3, CROC.side, { y: -0.03, z: 0.12 }));
  parts.push(box(0.3, 0.08, 0.72, CROC.side, { y: -0.02, z: 0.62 }));
  parts.push(box(0.32, 0.08, 0.12, CROC.side, { y: -0.02, z: 1.02 }));
  parts.push(box(0.28, 0.012, 0.95, CROC.belly, { y: -0.068, z: 0.56 }));
  parts.push(box(0.24, 0.012, 0.86, CROC.mouth, { y: 0.022, z: 0.58 }));
  for (let k = 0; k < 7; k++) {
    for (const s of [-1, 1]) parts.push(cone(0.018, 0.055, 4, CROC.teeth, { x: s * 0.13, y: 0.045, z: 0.36 + k * 0.12 }));
  }
}

function crocTail(i) {
  return (parts) => {
    const t = TAIL[i];
    parts.push(colorTris(cyl(t.f, t.b, t.l, 6, CROC.side, { rx: HALF_PI, sz: 0.62, z: -t.l / 2 }), crocBands(t.f * 0.3, -t.f * 0.3)));
    // Piggete ryggkam: to rader nær kroppen, én høy rad ytterst på halen
    for (let k = 0; k < 2; k++) {
      const z = -t.l * (0.28 + k * 0.45);
      const r = t.f + (t.b - t.f) * (0.28 + k * 0.45);
      const top = r * 0.62;
      if (i < 2) {
        for (const s of [-1, 1]) parts.push(box(0.07, 0.08, 0.12, CROC.scute, { x: s * r * 0.4, y: top, z }));
      } else {
        parts.push(box(0.05, 0.11, 0.14, CROC.scute, { y: top + 0.02, z }));
      }
    }
  };
}

function crocLeg(s) {
  return (parts) => {
    parts.push(box(0.3, 0.13, 0.15, CROC.side, { x: s * 0.13, y: -0.04, rz: s * -0.45 }));
    parts.push(box(0.12, 0.24, 0.13, CROC.side, { x: s * 0.27, y: -0.17 }));
    parts.push(box(0.17, 0.05, 0.22, CROC.side, { x: s * 0.3, y: -0.29, z: 0.05 }));
    for (const dx of [-0.055, 0, 0.055]) parts.push(box(0.03, 0.03, 0.05, CROC.claw, { x: s * 0.3 + dx, y: -0.3, z: 0.18 }));
  };
}

export class CrocodileRig {
  constructor() {
    this.root = new THREE.Group();
    this.model = group(this.root);
    this.model.scale.setScalar(0.8); // ca. 3,8 m fra snute til halespiss
    this.body = group(this.model, 0, CROC_BODY_Y, 0);
    part(this.body, 'croc-torso', crocTorso);

    this.head = group(this.body, 0, 0.02, CROC_HEAD_Z);
    part(this.head, 'croc-head', crocHead);
    this.jaw = group(this.head, 0, -0.08, 0.12);
    part(this.jaw, 'croc-jaw', crocJaw);

    this.tail = [];
    let parent = group(this.body, 0, 0, -0.84);
    for (let i = 0; i < TAIL.length; i++) {
      const seg = i === 0 ? parent : group(parent, 0, 0, -TAIL[i - 1].l);
      seg.rotation.x = -0.05; // halen siger ned mot bakken
      part(seg, `croc-tail-${i}`, crocTail(i));
      this.tail.push(seg);
      parent = seg;
    }

    // Bein: diagonale par i takt (venstre foran + høyre bak)
    this.legs = [];
    for (const [s, z, off] of [[-1, 0.55, 0], [1, 0.55, Math.PI], [-1, -0.55, Math.PI], [1, -0.55, 0]]) {
      const leg = group(this.body, s * 0.34, -0.06, z);
      part(leg, `croc-leg-${s}`, crocLeg(s));
      leg.userData.s = s;
      leg.userData.off = off;
      this.legs.push(leg);
    }

    this.t = Math.random() * 20;
    this.phase = 0;
    this.atk = -1;
    this.gape = 0;
  }

  update(dt, speed, state) {
    this.t += dt;
    if (state === 'attack' && this.atk < 0) this.atk = 0;
    const swim = state === 'swim';
    const moving = speed > 0.1;
    this.phase += dt * (swim ? 2.2 + speed * 0.9 : moving ? 3 + speed * 2.4 : 0.6);

    // Kroppen senkes i vannet slik at bare rygg, øyne og nesebor stikker opp
    this.body.position.y = damp(this.body.position.y, swim ? CROC_SWIM_Y : CROC_BODY_Y, 5, dt);
    this.body.rotation.y = moving && !swim ? Math.sin(this.phase) * 0.08 : damp(this.body.rotation.y, 0, 4, dt);

    for (const leg of this.legs) {
      const s = leg.userData.s;
      let ry = 0, rz = 0;
      if (swim) {
        ry = s * 1.25; // beina legges inntil kroppen
        rz = s * 0.3;
      } else if (moving) {
        const ph = this.phase + leg.userData.off;
        const amp = state === 'run' ? 0.7 : 0.5;
        ry = s * Math.sin(ph) * amp;
        rz = s * Math.max(0, Math.cos(ph)) * 0.3;
      }
      leg.rotation.y = damp(leg.rotation.y, ry, swim ? 6 : 14, dt);
      leg.rotation.z = damp(leg.rotation.z, rz, swim ? 6 : 14, dt);
    }

    // Halen svaier (driver krokodillen fremover i vannet)
    const amp = swim ? 0.3 + Math.min(speed, 6) * 0.03 : moving ? 0.16 : 0.05;
    for (let i = 0; i < this.tail.length; i++) {
      this.tail[i].rotation.y = Math.sin(this.phase - i * 0.75) * amp * (0.6 + i * 0.12);
    }

    // Kjeven: gaper av og til i ro (soler seg), smeller igjen ved angrep
    let open = 0, lunge = 0;
    if (this.atk >= 0) {
      this.atk += dt / 0.6;
      const a = this.atk;
      open = a < 0.45 ? Math.sin((a / 0.45) * HALF_PI) * 0.8 : 0.8 * (1 - clamp((a - 0.45) / 0.1, 0, 1));
      lunge = Math.sin(clamp(a, 0, 1) * Math.PI);
      if (this.atk >= 1) this.atk = -1;
      this.gape = open;
    } else {
      const basking = !moving && !swim && Math.sin(this.t * 0.22) > 0.55;
      this.gape = damp(this.gape, basking ? 0.5 : 0, 2.5, dt);
      open = this.gape;
    }
    this.jaw.rotation.x = open;
    this.head.rotation.x = -open * 0.3;
    this.head.position.z = CROC_HEAD_Z + lunge * 0.28;
    this.head.rotation.y = moving || swim ? -this.body.rotation.y * 0.8 : Math.sin(this.t * 0.4) * 0.12;
  }
}

// ======================================================================
// Havskilpadde
// ======================================================================
const TURTLE = {
  plates: [0x6e4b2a, 0x7c5631, 0x5f4024, 0x86603a], seam: 0x3b2a18, rim: 0x8c6c3e,
  plastron: 0xd9c993, skin: 0x737650, spot: 0xb7ae7a, beak: 0x4a4228, eye: 0x111111,
};
const TURTLE_BODY_Y = 0.2;
const TURTLE_SWIM_Y = 0.16;
// Midtpunkter for skjoldplatene på ryggskjoldet (x, z i en kule med radius 0.5)
const SCUTES = [
  [0, -0.3], [0, -0.12], [0, 0.06], [0, 0.24],
  [-0.2, -0.2], [-0.22, 0.0], [-0.2, 0.2], [0.2, -0.2], [0.22, 0.0], [0.2, 0.2],
];

function turtleShell(parts) {
  // Ryggskjold: halvkule der hver trekant farges etter nærmeste skjoldplate (mørke fuger mellom platene)
  const top = new THREE.SphereGeometry(0.5, 20, 8, 0, Math.PI * 2, 0, HALF_PI);
  const geo = colorTris(paint(top, TURTLE.plates[0]), (x, y, z) => {
    if (Math.hypot(x, z) > 0.44) return hash3(Math.round(Math.atan2(x, z) * 4), 0, 0) > 0.5 ? TURTLE.rim : TURTLE.plates[3];
    let d1 = 9, d2 = 9, best = 0;
    for (let i = 0; i < SCUTES.length; i++) {
      const d = Math.hypot(x - SCUTES[i][0], z - SCUTES[i][1]);
      if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d;
    }
    if (d2 - d1 < 0.03) return TURTLE.seam;
    return TURTLE.plates[best % 3];
  });
  geo.scale(0.8, 0.46, 1.0);
  geo.translate(0, 0.01, 0);
  parts.push(geo);
  // Bukskjold
  const bottom = paint(new THREE.SphereGeometry(0.5, 14, 3, 0, Math.PI * 2, HALF_PI, HALF_PI), TURTLE.plastron);
  bottom.scale(0.76, 0.16, 0.95);
  bottom.translate(0, 0.01, 0);
  parts.push(bottom);
  // Liten hale
  parts.push(cone(0.05, 0.14, 5, TURTLE.skin, { y: -0.01, z: -0.52, rx: -HALF_PI }));
}

const skinSpots = () => (x, y, z) => (hash3(Math.round(x * 60), Math.round(y * 60), Math.round(z * 60)) > 0.62 ? TURTLE.spot : TURTLE.skin);

function turtleHead(parts) {
  parts.push(colorTris(cyl(0.075, 0.095, 0.24, 8, TURTLE.skin, { rx: HALF_PI, z: 0.06 }), skinSpots()));
  parts.push(colorTris(sphere(0.12, 10, 8, TURTLE.skin, { y: 0.03, z: 0.24, sx: 0.95, sy: 0.85, sz: 1.2 }), skinSpots()));
  parts.push(cone(0.06, 0.09, 6, TURTLE.beak, { y: 0.0, z: 0.37, rx: HALF_PI, sy: 1, sz: 0.7 }));
  for (const s of [-1, 1]) parts.push(box(0.025, 0.035, 0.04, TURTLE.eye, { x: s * 0.105, y: 0.06, z: 0.3 }));
}

function turtleFlipper(s, len, wid) {
  return (parts) => {
    parts.push(colorTris(sphere(0.5, 10, 4, TURTLE.skin, { x: s * len * 0.5, sx: len, sy: 0.06, sz: wid }), skinSpots()));
  };
}

export class TurtleRig {
  constructor() {
    this.root = new THREE.Group();
    this.model = group(this.root);
    this.body = group(this.model, 0, TURTLE_BODY_Y, 0);
    part(this.body, 'turtle-shell', turtleShell);
    this.head = group(this.body, 0, 0.02, 0.42);
    part(this.head, 'turtle-head', turtleHead);
    this.front = [];
    this.rear = [];
    for (const s of [-1, 1]) {
      const f = group(this.body, s * 0.3, -0.02, 0.24);
      part(f, `turtle-front-${s}`, turtleFlipper(s, 0.62, 0.2));
      f.userData.s = s;
      f.rotation.y = s * 0.55;
      this.front.push(f);
      const r = group(this.body, s * 0.25, -0.03, -0.36);
      part(r, `turtle-rear-${s}`, turtleFlipper(s, 0.3, 0.15));
      r.userData.s = s;
      r.rotation.y = s * 1.1;
      this.rear.push(r);
    }
    this.t = Math.random() * 20;
    this.phase = 0;
  }

  update(dt, speed, state) {
    this.t += dt;
    const swim = state === 'swim';
    const moving = speed > 0.05;
    this.phase += dt * (swim ? 1.8 + speed * 0.6 : moving ? 2.4 + speed * 2 : 0);
    this.body.position.y = damp(this.body.position.y, swim ? TURTLE_SWIM_Y : TURTLE_BODY_Y, 4, dt);

    for (const f of this.front) {
      const s = f.userData.s;
      let ry = s * 0.55, rz = 0;
      if (swim) {
        // Langsomme, vingelignende slag
        rz = s * Math.sin(this.phase) * 0.6;
        ry = s * (0.6 + Math.sin(this.phase + 1.3) * 0.3);
      } else if (moving) {
        // På land skyver begge forluffene samtidig
        ry = s * (0.35 + Math.sin(this.phase) * 0.45);
        rz = s * Math.max(0, -Math.cos(this.phase)) * 0.25;
      } else if (state === 'happy') {
        rz = s * Math.sin(this.t * 7) * 0.35;
      }
      f.rotation.y = damp(f.rotation.y, ry, 10, dt);
      f.rotation.z = damp(f.rotation.z, rz, 10, dt);
    }
    for (const r of this.rear) {
      const s = r.userData.s;
      r.rotation.y = s * (1.1 + (swim || moving ? Math.sin(this.phase + 2) * 0.25 : 0));
    }

    // Kroppen gynger fremover når den krabber på land
    this.body.rotation.x = moving && !swim ? Math.sin(this.phase) * 0.05 : damp(this.body.rotation.x, swim ? -0.06 : 0, 3, dt);
    // Hodet
    let hx = Math.sin(this.t * 0.7) * 0.05, hy = Math.sin(this.t * 0.31) * 0.3;
    if (state === 'eat') hx = 0.35 + Math.sin(this.t * 4) * 0.08;
    else if (state === 'happy') hx = Math.sin(this.t * 9) * 0.25;
    else if (swim) hx = -0.12;
    this.head.rotation.x = damp(this.head.rotation.x, hx, 8, dt);
    this.head.rotation.y = damp(this.head.rotation.y, moving ? 0 : hy, 3, dt);
  }
}

// ======================================================================
// Papegøye (ara)
// ======================================================================
const PARROTS = [
  { key: 'scarlet', body: 0xd8281c, chest: 0xd8281c, crown: 0xd8281c, wing: 0xd8281c, band: 0xf3c41a, flight: 0x2b5fd0, tail: 0xc8241a, tail2: 0x2b5fd0, tip: 0x2b5fd0, face: 0xf4f1e8, beak: 0xeee3c8, jaw: 0x1c1c1c },
  { key: 'bluegold', body: 0x2a7fe0, chest: 0xf2b41e, crown: 0x4caf3a, wing: 0x2a7fe0, band: 0x2a7fe0, flight: 0x1d4fb0, tail: 0x2a7fe0, tail2: 0x1d4fb0, tip: 0x1d4fb0, face: 0xf4f1e8, beak: 0x1c1c1c, jaw: 0x1c1c1c },
  { key: 'military', body: 0x5a9e34, chest: 0x5a9e34, crown: 0xd8281c, wing: 0x5a9e34, band: 0x4c8a2c, flight: 0x2b5fd0, tail: 0xa83a24, tail2: 0x2b5fd0, tip: 0x2b5fd0, face: 0xf0d8d0, beak: 0x1c1c1c, jaw: 0x1c1c1c },
];
const PARROT_TILT = 0.45; // kroppen heller fremover
const PARROT_HIP_Y = 0.1;
const PARROT_HEAD_Y = 0.3;

function parrotBody(P) {
  return (parts) => {
    // Kropp (brystet får egen farge på blå/gul ara)
    parts.push(colorTris(sphere(0.1, 10, 8, P.body, { y: 0.13, sx: 0.85, sy: 1.5, sz: 0.85 }), (x, y, z) => (z > 0.02 && y < 0.25 ? P.chest : P.body)));
  };
}

function parrotHead(P) {
  return (parts) => {
    parts.push(colorTris(sphere(0.068, 10, 8, P.body, { y: 0.03, sz: 1.1 }), (x, y, z) => (y > 0.06 && z > 0.01 ? P.crown : P.body)));
    for (const s of [-1, 1]) {
      parts.push(sphere(0.04, 8, 6, P.face, { x: s * 0.05, y: 0.022, z: 0.035, sx: 0.4, sy: 0.85, sz: 1.0 }));
      parts.push(box(0.012, 0.017, 0.017, 0xf2e070, { x: s * 0.066, y: 0.038, z: 0.034 }));
      parts.push(box(0.013, 0.008, 0.008, 0x111111, { x: s * 0.067, y: 0.038, z: 0.036 }));
    }
    // Krumt overnebb og svart undernebb
    parts.push(cone(0.03, 0.09, 6, P.beak, { y: 0.0, z: 0.085, rx: HALF_PI + 0.8, sz: 0.85 }));
    parts.push(box(0.034, 0.03, 0.04, P.jaw, { y: -0.03, z: 0.06 }));
  };
}

function parrotWing(P) {
  return (parts) => {
    parts.push(box(0.022, 0.1, 0.11, P.wing, { y: -0.05 }));
    parts.push(box(0.023, 0.05, 0.105, P.band, { y: -0.125 }));
    parts.push(box(0.02, 0.14, 0.09, P.flight, { y: -0.215, z: -0.005 }));
    parts.push(box(0.018, 0.06, 0.06, P.flight, { y: -0.31, z: -0.012 }));
  };
}

function parrotTail(P) {
  return (parts) => {
    parts.push(box(0.045, 0.38, 0.012, P.tail, { y: -0.19 }));
    for (const s of [-1, 1]) parts.push(box(0.032, 0.32, 0.011, P.tail2, { x: s * 0.026, y: -0.16, z: 0.004 }));
    parts.push(box(0.044, 0.1, 0.013, P.tip, { y: -0.41 }));
  };
}

function parrotLeg(parts) {
  parts.push(cyl(0.012, 0.012, 0.1, 5, 0x6b6a70, { y: 0.05 }));
  parts.push(box(0.022, 0.014, 0.06, 0x5d5c62, { y: 0.007, z: 0.015 }));
  parts.push(box(0.018, 0.014, 0.04, 0x5d5c62, { y: 0.007, z: -0.02 }));
}

export class ParrotRig {
  constructor() {
    const P = PARROTS[Math.floor(Math.random() * PARROTS.length)];
    this.root = new THREE.Group();
    this.model = group(this.root);
    this.model.scale.setScalar(1.6); // litt større enn virkeligheten, så den synes i spillet
    this.legs = [];
    for (const s of [-1, 1]) {
      const leg = group(this.model, s * 0.035, 0, 0);
      part(leg, 'parrot-leg', parrotLeg, false);
      this.legs.push(leg);
    }
    this.body = group(this.model, 0, PARROT_HIP_Y, 0);
    this.body.rotation.x = PARROT_TILT;
    part(this.body, `parrot-body-${P.key}`, parrotBody(P));
    this.head = group(this.body, 0, PARROT_HEAD_Y, 0.02);
    this.head.rotation.x = -PARROT_TILT;
    part(this.head, `parrot-head-${P.key}`, parrotHead(P));
    this.wings = [];
    for (const s of [-1, 1]) {
      const w = group(this.body, s * 0.088, 0.24, -0.01);
      part(w, `parrot-wing-${P.key}`, parrotWing(P));
      w.userData.s = s;
      this.wings.push(w);
    }
    this.tail = group(this.body, 0, 0.0, -0.02);
    this.tail.rotation.x = 1.0;
    part(this.tail, `parrot-tail-${P.key}`, parrotTail(P));

    this.t = Math.random() * 20;
    this.phase = 0;
    this.lookT = 0;
    this.look = { x: 0, y: 0, z: 0 };
    this.shuffleT = 3 + Math.random() * 5;
  }

  update(dt, speed, state) {
    this.t += dt;
    const moving = speed > 0.05;
    const happy = state === 'happy';
    const flutter = happy || state === 'swim' || state === 'run';
    if (moving) this.phase += dt * (9 + speed * 4);

    // Hopp og vagling
    let hop = 0;
    if (happy) hop = Math.abs(Math.sin(this.t * 7)) * 0.08;
    else if (moving) hop = Math.abs(Math.sin(this.phase)) * 0.025;
    this.model.position.y = damp(this.model.position.y, hop, 20, dt);
    this.body.rotation.z = moving ? Math.sin(this.phase) * 0.12 : damp(this.body.rotation.z, 0, 6, dt);
    this.legs[0].rotation.x = moving ? Math.sin(this.phase) * 0.4 : 0;
    this.legs[1].rotation.x = moving ? -Math.sin(this.phase) * 0.4 : 0;

    // Vinger: blafrer når den er glad, ellers foldet med en liten risting av og til
    this.shuffleT -= dt;
    let open = 0;
    if (flutter) open = 0.9 + Math.sin(this.t * 22) * 0.7;
    else if (this.shuffleT < 0) {
      open = Math.sin(-this.shuffleT * 14) * 0.35;
      if (this.shuffleT < -0.45) this.shuffleT = 4 + Math.random() * 6;
    }
    for (const w of this.wings) w.rotation.z = damp(w.rotation.z, w.userData.s * Math.max(0, open), 25, dt);
    this.tail.rotation.x = 1.0 + (moving ? Math.sin(this.phase * 2) * 0.06 : 0);

    // Hodet: hakker når den spiser, nikker når den går, vrir på seg i ro
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.lookT = 0.8 + Math.random() * 2.5;
      this.look.y = (Math.random() - 0.5) * 1.4;
      this.look.z = (Math.random() - 0.5) * 0.7;
    }
    let hx = -PARROT_TILT, hy = this.look.y, hz = this.look.z;
    if (state === 'eat') {
      hx = -PARROT_TILT + 0.7 + Math.max(0, Math.sin(this.t * 8)) * 0.35;
      hy = 0;
      hz = 0;
    } else if (moving) {
      hx = -PARROT_TILT + Math.sin(this.phase * 2) * 0.12;
      hy = 0;
      hz = 0;
    } else if (happy) {
      hx = -PARROT_TILT + Math.sin(this.t * 10) * 0.2;
      hz = Math.sin(this.t * 5) * 0.3;
    }
    this.head.rotation.x = damp(this.head.rotation.x, hx, 14, dt);
    this.head.rotation.y = damp(this.head.rotation.y, hy, 10, dt);
    this.head.rotation.z = damp(this.head.rotation.z, hz, 10, dt);
  }
}

// ======================================================================
// Artsregister (samme felt som i js/levels/fauna.js; length = snute–halespiss i meter)
// ======================================================================
export const SPECIES = {
  crocodile: {
    name: 'krokodille', definite: 'krokodillen', article: 'en', height: 0.8, radius: 1.1, length: 3.8,
    habitat: 'amphibious', swimSink: 0.3, swimDepth: 0.7,
    stats: { name: 'krokodille', hp: 140, damage: 22, speed: 1.6, runSpeed: 7, reach: 2.6, cooldown: 1.5, sight: 0.8 },
    createRig: () => new CrocodileRig(),
  },
  turtle: {
    name: 'havskilpadde', definite: 'havskilpadden', article: 'en', height: 0.55, radius: 0.6, length: 1.2,
    habitat: 'amphibious', swimSink: 0.3, swimDepth: 0.6, stats: null,
    createRig: () => new TurtleRig(),
  },
  parrot: {
    name: 'papegøye', definite: 'papegøyen', article: 'en', height: 0.85, radius: 0.35, length: 1.2,
    habitat: 'land', stats: null,
    createRig: () => new ParrotRig(),
  },
};
