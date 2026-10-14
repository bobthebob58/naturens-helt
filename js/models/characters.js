// Animerte figurer: mennesker, firbeinte dyr, pingvin, hai og skorpion.
// Alle modeller ser langs +Z (heading = rotation.y).
import * as THREE from 'three';
import { lambert, limb } from './geo.js';
import { damp, clamp } from '../utils/math.js';

export function addBox(parent, w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// ======================================================================
// Menneske
// ======================================================================
export class HumanRig {
  constructor(opts = {}) {
    const o = {
      skin: 0xe0b08c, shirt: 0x3b6ea8, pants: 0x34404f, shoes: 0x2b2118, hair: 0x3a2716,
      hat: null, hatColor: 0x6b5a3a, backpack: null, rifle: false, vest: null, sleeves: null, ...opts,
    };
    this.o = o;
    this.root = new THREE.Group();
    this.hips = new THREE.Group();
    this.hips.position.y = 0.92;
    this.root.add(this.hips);

    this.legL = this._leg(o, -0.11);
    this.legR = this._leg(o, 0.11);

    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    addBox(this.torso, 0.44, 0.6, 0.25, o.shirt, 0, 0.33, 0);
    addBox(this.torso, 0.45, 0.07, 0.26, 0x3a2a1c, 0, 0.04, 0);
    if (o.vest) addBox(this.torso, 0.46, 0.4, 0.27, o.vest, 0, 0.4, 0);
    if (o.backpack) {
      addBox(this.torso, 0.34, 0.44, 0.18, o.backpack, 0, 0.36, -0.21);
      addBox(this.torso, 0.3, 0.12, 0.1, 0x222222, 0, 0.6, -0.22);
    }

    this.neck = new THREE.Group();
    this.neck.position.y = 0.63;
    this.torso.add(this.neck);
    addBox(this.neck, 0.1, 0.06, 0.1, o.skin, 0, 0.02, 0);
    addBox(this.neck, 0.24, 0.26, 0.24, o.skin, 0, 0.17, 0);
    addBox(this.neck, 0.26, 0.07, 0.26, o.hair, 0, 0.31, 0);
    addBox(this.neck, 0.26, 0.16, 0.05, o.hair, 0, 0.22, -0.11);
    addBox(this.neck, 0.045, 0.045, 0.02, 0x1a1a1a, -0.055, 0.19, 0.122);
    addBox(this.neck, 0.045, 0.045, 0.02, 0x1a1a1a, 0.055, 0.19, 0.122);
    addBox(this.neck, 0.04, 0.06, 0.04, 0xc4906c, 0, 0.14, 0.13);
    if (o.hat === 'cap') {
      addBox(this.neck, 0.27, 0.08, 0.27, o.hatColor, 0, 0.34, 0);
      addBox(this.neck, 0.22, 0.02, 0.14, o.hatColor, 0, 0.31, 0.18);
    } else if (o.hat === 'ranger') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.025, 14), lambert(o.hatColor));
      brim.position.y = 0.31;
      this.neck.add(brim);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.14, 10), lambert(o.hatColor));
      top.position.y = 0.39;
      this.neck.add(top);
    } else if (o.hat === 'beanie') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lambert(o.hatColor));
      b.scale.set(1, 0.9, 1);
      b.position.y = 0.3;
      this.neck.add(b);
    } else if (o.hat === 'hood') {
      addBox(this.neck, 0.3, 0.32, 0.3, o.hatColor, 0, 0.2, -0.02).scale.set(1, 1, 1);
      // Ansiktet foran hetta
      addBox(this.neck, 0.2, 0.2, 0.02, o.skin, 0, 0.17, 0.15);
      addBox(this.neck, 0.045, 0.045, 0.02, 0x1a1a1a, -0.05, 0.19, 0.162);
      addBox(this.neck, 0.045, 0.045, 0.02, 0x1a1a1a, 0.05, 0.19, 0.162);
    }

    this.armL = this._arm(o, -0.29);
    this.armR = this._arm(o, 0.29);

    if (o.rifle) {
      const rifle = new THREE.Group();
      addBox(rifle, 0.05, 0.05, 0.95, 0x2a2a2a, 0, 0, 0.35);
      addBox(rifle, 0.07, 0.12, 0.35, 0x5a3b22, 0, -0.04, -0.1);
      addBox(rifle, 0.04, 0.06, 0.16, 0x1a1a1a, 0, 0.06, 0.2);
      // Pek langs underarmens -Y (framover når armen løftes)
      rifle.rotation.x = Math.PI / 2;
      rifle.position.set(0, -0.28, 0.02);
      this.armR.elbow.add(rifle);
      this.rifle = rifle;
      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0, 0, 0.85);
      rifle.add(this.muzzle);
    }

    this.held = new THREE.Group(); // våpen i hånda (spiller i 3. person)
    this.held.position.set(0, -0.31, 0.02);
    this.armR.elbow.add(this.held);

    this.phase = Math.random() * 10;
    this.t = 0;
    this.cur = {};
  }

  _leg(o, x) {
    const thigh = new THREE.Group();
    thigh.position.set(x, 0, 0);
    this.hips.add(thigh);
    thigh.add(limb(0.16, 0.46, 0.18, o.pants));
    const knee = new THREE.Group();
    knee.position.y = -0.46;
    thigh.add(knee);
    knee.add(limb(0.14, 0.42, 0.16, o.pants));
    addBox(knee, 0.15, 0.08, 0.26, o.shoes, 0, -0.44, 0.04);
    return { thigh, knee };
  }

  _arm(o, x) {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, 0.56, 0);
    this.torso.add(shoulder);
    shoulder.add(limb(0.11, 0.32, 0.12, o.sleeves ?? o.shirt));
    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    shoulder.add(elbow);
    elbow.add(limb(0.1, 0.27, 0.11, o.sleeves ?? o.shirt));
    addBox(elbow, 0.09, 0.09, 0.09, o.skin, 0, -0.31, 0);
    return { shoulder, elbow };
  }

  setHeld(obj) {
    while (this.held.children.length) this.held.remove(this.held.children[0]);
    if (obj) this.held.add(obj);
  }

  /**
   * s: { speed, pose: 'stand'|'crouch'|'sit'|'bike'|'surrender'|'swim'|'aim'|'sitGround'|'wave'|'cheer', attack (0..1 eller -1) }
   */
  update(dt, s) {
    this.t += dt;
    const speed = s.speed || 0;
    this.phase += dt * (speed > 0.1 ? 2.2 + speed * 1.5 : 0);
    const sw = clamp(speed / 4.5, 0, 1.25);
    const p = this.phase;
    const sin = Math.sin(p);
    const T = {
      hipsY: 0.92, torsoX: 0, thighL: 0, thighR: 0, kneeL: 0, kneeR: 0,
      shL: 0, shR: 0, elL: 0, elR: 0, shLz: 0, shRz: 0, neckX: 0,
    };
    switch (s.pose) {
      case 'crouch':
        T.hipsY = 0.62;
        T.torsoX = 0.38;
        T.thighL = -1.05 + sin * 0.35 * sw;
        T.thighR = -1.05 - sin * 0.35 * sw;
        T.kneeL = 1.7 - Math.max(0, sin) * 0.3 * sw;
        T.kneeR = 1.7 - Math.max(0, -sin) * 0.3 * sw;
        T.shL = -0.5 - sin * 0.2 * sw;
        T.shR = -0.5 + sin * 0.2 * sw;
        T.elL = -0.6; T.elR = -0.6;
        T.neckX = -0.3;
        break;
      case 'sit':
        T.hipsY = 0.5;
        T.thighL = T.thighR = -1.45;
        T.kneeL = T.kneeR = 1.45;
        T.shL = T.shR = -0.9;
        T.elL = T.elR = -0.5;
        break;
      case 'bike': {
        T.hipsY = 0.95;
        T.torsoX = 0.42;
        const c = p * 1.0;
        T.thighL = -0.75 + Math.sin(c) * 0.45;
        T.thighR = -0.75 - Math.sin(c) * 0.45;
        T.kneeL = 0.9 + Math.cos(c) * 0.45;
        T.kneeR = 0.9 - Math.cos(c) * 0.45;
        T.shL = T.shR = -1.05;
        T.elL = T.elR = -0.3;
        T.neckX = -0.35;
        break;
      }
      case 'surrender':
        T.hipsY = 0.52;
        T.thighL = T.thighR = 0;
        T.kneeL = T.kneeR = 1.55;
        T.shL = T.shR = -2.9;
        T.shLz = -0.25; T.shRz = 0.25;
        T.elL = T.elR = -0.3;
        T.neckX = 0.15;
        break;
      case 'sitGround':
        T.hipsY = 0.18;
        T.thighL = T.thighR = -1.5;
        T.kneeL = 0.25; T.kneeR = 0.6;
        T.shL = T.shR = 0.5;
        T.torsoX = -0.15;
        T.neckX = Math.sin(this.t * 1.5) * 0.15;
        break;
      case 'swim':
        T.hipsY = 0.92;
        T.torsoX = 0.6;
        T.shL = T.shR = -2.2 + Math.sin(this.t * 4) * 0.7;
        T.shLz = -0.4 - Math.cos(this.t * 4) * 0.4;
        T.shRz = 0.4 + Math.cos(this.t * 4) * 0.4;
        T.thighL = Math.sin(this.t * 6) * 0.4;
        T.thighR = -Math.sin(this.t * 6) * 0.4;
        T.kneeL = T.kneeR = 0.4;
        T.neckX = -0.5;
        break;
      case 'aim':
        T.thighL = sin * 0.5 * sw;
        T.thighR = -sin * 0.5 * sw;
        T.kneeL = Math.max(0, -Math.cos(p)) * 0.8 * sw;
        T.kneeR = Math.max(0, Math.cos(p)) * 0.8 * sw;
        T.shR = -1.5; T.elR = 0;
        T.shL = -1.35; T.shLz = 0.55; T.elL = -0.5;
        break;
      case 'wave':
        T.shR = -2.7; T.shRz = 0.3 + Math.sin(this.t * 7) * 0.3; T.elR = -0.3;
        break;
      case 'cheer':
        T.hipsY = 0.92 + Math.abs(Math.sin(this.t * 7)) * 0.15;
        T.shL = T.shR = -2.8; T.shLz = -0.3; T.shRz = 0.3;
        break;
      default: // stand / walk / run
        T.thighL = sin * 0.7 * sw;
        T.thighR = -sin * 0.7 * sw;
        T.kneeL = Math.max(0, -Math.cos(p)) * 1.0 * sw + (sw > 0.05 ? 0.1 : 0);
        T.kneeR = Math.max(0, Math.cos(p)) * 1.0 * sw + (sw > 0.05 ? 0.1 : 0);
        T.shL = -sin * 0.6 * sw;
        T.shR = sin * 0.6 * sw;
        T.elL = T.elR = -0.25 - 0.4 * sw;
        T.torsoX = 0.12 * sw;
        T.hipsY = 0.92 - Math.abs(Math.cos(p)) * 0.04 * sw;
        if (speed < 0.1) T.torsoX = Math.sin(this.t * 1.6) * 0.015;
    }
    // Hugg med våpen
    if (s.attack >= 0 && s.attack !== undefined) {
      const a = s.attack;
      T.shR = a < 0.35 ? -2.6 : -2.6 + ((a - 0.35) / 0.65) * 2.2;
      T.elR = -0.2;
      T.shRz = 0.15;
    } else if (s.holdRanged && s.pose !== 'swim' && s.pose !== 'sit' && s.pose !== 'bike') {
      T.shR = -1.45; T.elR = 0;
      T.shL = -1.3; T.shLz = 0.5; T.elL = -0.4;
    }

    const r = 14;
    const h = this.hips, L = this.legL, R = this.legR, aL = this.armL, aR = this.armR;
    h.position.y = damp(h.position.y, T.hipsY, r, dt);
    this.torso.rotation.x = damp(this.torso.rotation.x, T.torsoX, r, dt);
    L.thigh.rotation.x = damp(L.thigh.rotation.x, T.thighL, r, dt);
    R.thigh.rotation.x = damp(R.thigh.rotation.x, T.thighR, r, dt);
    L.knee.rotation.x = damp(L.knee.rotation.x, T.kneeL, r, dt);
    R.knee.rotation.x = damp(R.knee.rotation.x, T.kneeR, r, dt);
    aL.shoulder.rotation.x = damp(aL.shoulder.rotation.x, T.shL, r, dt);
    aR.shoulder.rotation.x = damp(aR.shoulder.rotation.x, T.shR, s.attack >= 0 ? 30 : r, dt);
    aL.shoulder.rotation.z = damp(aL.shoulder.rotation.z, T.shLz, r, dt);
    aR.shoulder.rotation.z = damp(aR.shoulder.rotation.z, T.shRz, r, dt);
    aL.elbow.rotation.x = damp(aL.elbow.rotation.x, T.elL, r, dt);
    aR.elbow.rotation.x = damp(aR.elbow.rotation.x, T.elR, r, dt);
    this.neck.rotation.x = damp(this.neck.rotation.x, T.neckX, r, dt);
  }
}

// ======================================================================
// Firbeint dyr
// ======================================================================
export const ANIMAL_DEFS = {
  bear:      { len: 1.9, bodyH: 1.0, width: 0.95, legLen: 0.7, legW: 0.28, neck: 0.35, headL: 0.55, headH: 0.45, color: 0x5a3c26, belly: 0x4a311f, ears: 'round', tail: 'stub', snout: 0x3a2a1c, scale: 1 },
  polarbear: { len: 2.1, bodyH: 1.05, width: 1.0, legLen: 0.75, legW: 0.3, neck: 0.5, headL: 0.6, headH: 0.42, color: 0xeeeae0, belly: 0xdcd6c8, ears: 'round', tail: 'stub', snout: 0x222222, scale: 1 },
  wolf:      { len: 1.25, bodyH: 0.5, width: 0.4, legLen: 0.6, legW: 0.12, neck: 0.32, headL: 0.42, headH: 0.26, color: 0x7d7a74, belly: 0xbdb8ad, ears: 'pointy', tail: 'bushy', snout: 0x2a2a2a, scale: 1 },
  deer:      { len: 1.35, bodyH: 0.6, width: 0.42, legLen: 0.85, legW: 0.1, neck: 0.65, headL: 0.4, headH: 0.24, color: 0x9a6a3e, belly: 0xe8dcc8, ears: 'long', tail: 'stub', snout: 0x2a1a10, antlers: true, scale: 1 },
  reindeer:  { len: 1.4, bodyH: 0.65, width: 0.48, legLen: 0.8, legW: 0.12, neck: 0.55, headL: 0.42, headH: 0.26, color: 0x7d6a58, belly: 0xece6dc, ears: 'long', tail: 'stub', snout: 0x2a1a10, antlers: true, scale: 1 },
  fox:       { len: 0.75, bodyH: 0.3, width: 0.26, legLen: 0.32, legW: 0.07, neck: 0.2, headL: 0.28, headH: 0.18, color: 0xc8642a, belly: 0xf2e8da, ears: 'pointy', tail: 'bushy', tailTip: 0xffffff, snout: 0x1a1a1a, scale: 1 },
  fennec:    { len: 0.55, bodyH: 0.24, width: 0.2, legLen: 0.25, legW: 0.06, neck: 0.15, headL: 0.22, headH: 0.15, color: 0xe2c49a, belly: 0xf5eadb, ears: 'huge', tail: 'bushy', snout: 0x1a1a1a, scale: 1 },
  camel:     { len: 1.9, bodyH: 0.85, width: 0.7, legLen: 1.25, legW: 0.15, neck: 0.95, headL: 0.5, headH: 0.28, color: 0xc49a62, belly: 0xb08a58, ears: 'small', tail: 'thin', snout: 0x8a6a42, hump: true, scale: 1 },
  rabbit:    { len: 0.4, bodyH: 0.26, width: 0.22, legLen: 0.12, legW: 0.07, neck: 0.06, headL: 0.18, headH: 0.16, color: 0x9a8a78, belly: 0xe9e2d6, ears: 'long', tail: 'stub', snout: 0xd88a8a, scale: 1 },
};

export class QuadrupedRig {
  /** type: nøkkel i ANIMAL_DEFS, eller et eget definisjonsobjekt (samme felt + valgfri key). */
  constructor(type) {
    const d = typeof type === 'string' ? { ...ANIMAL_DEFS[type] } : { ...type };
    this.d = d;
    this.type = typeof type === 'string' ? type : d.key || 'custom';
    type = this.type;
    this.root = new THREE.Group();
    this.bodyG = new THREE.Group();
    this.bodyG.position.y = d.legLen + d.bodyH / 2;
    this.root.add(this.bodyG);

    // Kropp
    const body = addBox(this.bodyG, d.width, d.bodyH, d.len, d.color);
    addBox(this.bodyG, d.width * 0.86, d.bodyH * 0.3, d.len * 0.8, d.belly, 0, -d.bodyH * 0.38, 0);
    if (type === 'bear' || type === 'polarbear') {
      // Skulderpukkel
      addBox(this.bodyG, d.width * 0.9, d.bodyH * 0.35, d.len * 0.35, d.color, 0, d.bodyH * 0.5, d.len * 0.18);
    }
    if (d.hump) {
      const hump = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), lambert(d.color));
      hump.scale.set(0.9, 0.9, 1.3);
      hump.position.set(0, d.bodyH * 0.5, 0);
      hump.castShadow = true;
      this.bodyG.add(hump);
    }
    body.castShadow = true;

    // Hals og hode
    this.neck = new THREE.Group();
    this.neck.position.set(0, d.bodyH * 0.2, d.len / 2 - 0.05);
    this.bodyG.add(this.neck);
    const neckTilt = d.neck > 0.4 ? -0.75 : -0.35;
    this.neckBase = neckTilt;
    this.neck.rotation.x = neckTilt;
    const nm = addBox(this.neck, d.width * 0.45, d.width * 0.45, d.neck, d.color, 0, 0, d.neck / 2);
    nm.castShadow = true;
    this.head = new THREE.Group();
    this.head.position.set(0, 0, d.neck);
    this.neck.add(this.head);
    this.head.rotation.x = -neckTilt;
    addBox(this.head, d.headH * 1.05, d.headH, d.headL * 0.6, d.color, 0, 0, d.headL * 0.2);
    addBox(this.head, d.headH * 0.6, d.headH * 0.6, d.headL * 0.5, d.belly, 0, -d.headH * 0.15, d.headL * 0.65);
    addBox(this.head, d.headH * 0.25, d.headH * 0.2, 0.04, d.snout, 0, -d.headH * 0.02, d.headL * 0.9);
    // Øyne på sidene av hodet (egne definisjoner legger på sine egne øyne)
    if (!d.key) {
      for (const s of [-1, 1]) addBox(this.head, 0.04, 0.04, 0.02, 0x111111, s * (d.headH * 0.525 - 0.012), d.headH * 0.2, d.headL * 0.5 - 0.012);
    }
    // Ører
    const earC = d.color;
    if (d.ears === 'round') {
      for (const s of [-1, 1]) addBox(this.head, 0.14, 0.14, 0.06, earC, s * d.headH * 0.4, d.headH * 0.55, 0);
    } else if (d.ears === 'pointy') {
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.ConeGeometry(d.headH * 0.22, d.headH * 0.6, 4), lambert(earC));
        e.position.set(s * d.headH * 0.3, d.headH * 0.75, 0);
        this.head.add(e);
      }
    } else if (d.ears === 'long') {
      for (const s of [-1, 1]) {
        const e = addBox(this.head, 0.06, d.headH * (type === 'rabbit' ? 1.4 : 0.7), 0.1, earC, s * d.headH * 0.45, d.headH * 0.7, -0.02);
        e.rotation.z = s * (type === 'rabbit' ? 0.15 : 0.7);
      }
    } else if (d.ears === 'huge') {
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.ConeGeometry(d.headH * 0.4, d.headH * 1.4, 4), lambert(earC));
        e.position.set(s * d.headH * 0.38, d.headH * 0.9, 0);
        e.rotation.z = -s * 0.35;
        this.head.add(e);
      }
    } else if (d.ears === 'small') {
      for (const s of [-1, 1]) addBox(this.head, 0.05, 0.1, 0.05, earC, s * d.headH * 0.4, d.headH * 0.55, -0.05);
    }
    if (d.antlers) {
      const ac = 0xd9c7a6;
      for (const s of [-1, 1]) {
        const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.5, 4), lambert(ac));
        a1.position.set(s * 0.1, d.headH * 0.75, -0.02);
        a1.rotation.z = -s * 0.5;
        this.head.add(a1);
        const a2 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.3, 4), lambert(ac));
        a2.position.set(s * 0.22, d.headH * 1.1, 0.05);
        a2.rotation.set(0.5, 0, s * 0.2);
        this.head.add(a2);
        const a3 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.28, 4), lambert(ac));
        a3.position.set(s * 0.3, d.headH * 1.05, -0.1);
        a3.rotation.set(-0.4, 0, -s * 0.9);
        this.head.add(a3);
      }
    }

    // Bein
    this.legs = [];
    const lx = d.width / 2 - d.legW / 2;
    const lz = d.len / 2 - d.legW * 0.8;
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * lx, d.legLen, sz * lz);
      this.root.add(pivot);
      pivot.add(limb(d.legW, d.legLen, d.legW * 1.1, sz > 0 ? d.color : d.color));
      addBox(pivot, d.legW * 1.1, 0.06, d.legW * 1.3, 0x2a2018, 0, -d.legLen + 0.03, 0.02);
      this.legs.push(pivot);
    }

    // Hale
    this.tail = new THREE.Group();
    this.tail.position.set(0, d.bodyH * 0.3, -d.len / 2);
    this.bodyG.add(this.tail);
    if (d.tail === 'bushy') {
      const t = addBox(this.tail, d.width * 0.35, d.width * 0.35, d.len * 0.55, d.color, 0, -0.05, -d.len * 0.27);
      t.rotation.x = 0.5;
      if (d.tailTip) addBox(this.tail, d.width * 0.3, d.width * 0.3, 0.12, d.tailTip, 0, -0.18, -d.len * 0.5);
    } else if (d.tail === 'thin') {
      const t = addBox(this.tail, 0.05, 0.05, 0.6, d.color, 0, -0.25, -0.15);
      t.rotation.x = 1.0;
    } else {
      addBox(this.tail, 0.12, 0.12, 0.12, d.belly, 0, 0, -0.04);
    }
    this.phase = Math.random() * 10;
    this.t = 0;
    this.attackT = -1;
  }

  /** state: 'idle'|'walk'|'run'|'eat'|'attack'|'happy' */
  update(dt, speed, state) {
    this.t += dt;
    const d = this.d;
    const freq = 3 + speed * (this.type === 'rabbit' ? 2.5 : 1.3) / Math.max(0.5, d.legLen);
    this.phase += dt * (speed > 0.1 ? freq : 0);
    const amp = clamp(speed / 6, 0, 1) * 0.7 + (speed > 0.1 ? 0.15 : 0);
    const p = this.phase;
    const s = Math.sin(p);
    const gallop = speed > 5;
    const offs = gallop ? [0, 0.4, Math.PI, Math.PI + 0.4] : [0, Math.PI, Math.PI, 0];
    for (let i = 0; i < 4; i++) {
      const target = Math.sin(p + offs[i]) * amp;
      this.legs[i].rotation.x = damp(this.legs[i].rotation.x, target, 16, dt);
    }
    this.bodyG.position.y = d.legLen + d.bodyH / 2 + (speed > 0.1 ? Math.abs(s) * 0.05 * d.legLen : 0);
    this.bodyG.rotation.x = gallop ? Math.sin(p) * 0.06 : 0;
    let neckT = this.neckBase;
    if (state === 'eat') neckT = this.neckBase + 1.1 + Math.sin(this.t * 6) * 0.08;
    if (state === 'idle') neckT = this.neckBase + Math.sin(this.t * 0.8) * 0.12;
    if (state === 'attack') {
      if (this.attackT < 0) this.attackT = 0;
    }
    if (this.attackT >= 0) {
      this.attackT += dt * 3;
      neckT = this.neckBase + Math.sin(Math.min(1, this.attackT) * Math.PI) * 0.7;
      if (this.attackT >= 1) this.attackT = -1;
    }
    if (state === 'happy') {
      this.bodyG.position.y += Math.abs(Math.sin(this.t * 8)) * 0.25;
    }
    this.neck.rotation.x = damp(this.neck.rotation.x, neckT, 10, dt);
    this.tail.rotation.y = Math.sin(this.t * (state === 'happy' ? 14 : 3)) * (state === 'happy' ? 0.6 : 0.2);
  }
}

// ======================================================================
// Pingvin
// ======================================================================
export class PenguinRig {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), lambert(0x1d1f26));
    b.scale.set(1, 1.6, 0.9);
    b.position.y = 0.45;
    b.castShadow = true;
    this.body.add(b);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), lambert(0xf4f4f0));
    belly.scale.set(0.95, 1.5, 0.7);
    belly.position.set(0, 0.42, 0.08);
    this.body.add(belly);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), lambert(0x1d1f26));
    head.position.set(0, 0.9, 0.02);
    this.body.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), lambert(0xf0a020));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.88, 0.2);
    this.body.add(beak);
    for (const s of [-1, 1]) {
      addBox(this.body, 0.04, 0.04, 0.02, 0xffffff, s * 0.07, 0.95, 0.15);
      const f = addBox(this.body, 0.05, 0.4, 0.14, 0x1d1f26, s * 0.29, 0.5, 0);
      f.rotation.z = s * 0.25;
      const foot = addBox(this.root, 0.12, 0.04, 0.16, 0xf0a020, s * 0.1, 0.02, 0.06);
      foot.castShadow = false;
    }
    this.t = Math.random() * 5;
  }
  update(dt, speed, state) {
    this.t += dt;
    const w = speed > 0.1 ? Math.sin(this.t * 10) * 0.18 : Math.sin(this.t * 1.5) * 0.03;
    this.body.rotation.z = w;
    this.body.position.y = state === 'happy' ? Math.abs(Math.sin(this.t * 8)) * 0.3 : 0;
  }
}

// ======================================================================
// Hai
// ======================================================================
export class SharkRig {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const col = 0x6f7f8c;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), lambert(col));
    b.scale.set(0.9, 0.8, 3.2);
    b.castShadow = true;
    this.body.add(b);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), lambert(0xe6e8ea));
    belly.scale.set(0.8, 0.55, 2.8);
    belly.position.set(0, -0.15, 0.1);
    this.body.add(belly);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 4), lambert(col));
    fin.scale.set(0.25, 1, 1);
    fin.position.set(0, 0.75, -0.1);
    fin.rotation.x = -0.35;
    this.body.add(fin);
    for (const s of [-1, 1]) {
      const pf = addBox(this.body, 0.7, 0.05, 0.35, col, s * 0.6, -0.2, 0.4);
      pf.rotation.z = s * -0.35;
      addBox(this.body, 0.06, 0.06, 0.02, 0x101010, s * 0.3, 0.12, 1.25);
    }
    this.tail = new THREE.Group();
    this.tail.position.z = -1.6;
    this.body.add(this.tail);
    const t1 = addBox(this.tail, 0.08, 0.9, 0.35, col, 0, 0.3, -0.25);
    t1.rotation.x = 0.5;
    const t2 = addBox(this.tail, 0.08, 0.6, 0.3, col, 0, -0.2, -0.2);
    t2.rotation.x = -0.6;
    this.t = Math.random() * 5;
  }
  update(dt, speed, state) {
    this.t += dt * (1 + speed * 0.5);
    this.tail.rotation.y = Math.sin(this.t * 4) * 0.45;
    this.body.rotation.y = Math.sin(this.t * 4 - 1) * 0.06;
    this.body.rotation.x = state === 'attack' ? -0.25 : 0;
  }
}

// ======================================================================
// Skorpion
// ======================================================================
export class ScorpionRig {
  constructor() {
    this.root = new THREE.Group();
    const col = 0x3b2a1e;
    const dark = 0x241810;
    this.body = new THREE.Group();
    this.body.position.y = 0.35;
    this.root.add(this.body);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), lambert(col));
    b.scale.set(1, 0.45, 1.5);
    b.castShadow = true;
    this.body.add(b);
    this.legs = [];
    for (let i = 0; i < 4; i++) {
      for (const s of [-1, 1]) {
        const lg = new THREE.Group();
        lg.position.set(s * 0.3, 0, 0.3 - i * 0.22);
        this.body.add(lg);
        const seg = addBox(lg, 0.5, 0.05, 0.05, dark, s * 0.25, -0.1, 0);
        seg.rotation.z = s * -0.6;
        this.legs.push(lg);
      }
    }
    // Klør
    for (const s of [-1, 1]) {
      const arm = addBox(this.body, 0.08, 0.08, 0.5, col, s * 0.3, 0, 0.75);
      arm.rotation.y = s * -0.4;
      addBox(this.body, 0.2, 0.12, 0.28, col, s * 0.42, 0, 1.05);
    }
    // Hale
    this.tail = new THREE.Group();
    this.tail.position.z = -0.55;
    this.body.add(this.tail);
    let parent = this.tail;
    this.tailSegs = [];
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.z = i === 0 ? 0 : -0.22;
      seg.rotation.x = -0.55;
      parent.add(seg);
      addBox(seg, 0.16 - i * 0.015, 0.14 - i * 0.01, 0.24, col, 0, 0, -0.1);
      this.tailSegs.push(seg);
      parent = seg;
    }
    const sting = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), lambert(0x111111));
    sting.position.z = -0.3;
    sting.rotation.x = -Math.PI / 2;
    parent.add(sting);
    this.root.scale.setScalar(1.6);
    this.t = Math.random() * 5;
    this.attackT = -1;
  }
  update(dt, speed, state) {
    this.t += dt;
    for (let i = 0; i < this.legs.length; i++) {
      this.legs[i].rotation.y = speed > 0.1 ? Math.sin(this.t * 14 + i * 1.3) * 0.35 : 0;
    }
    if (state === 'attack' && this.attackT < 0) this.attackT = 0;
    let curl = -0.55;
    if (this.attackT >= 0) {
      this.attackT += dt * 3;
      curl = -0.55 - Math.sin(Math.min(1, this.attackT) * Math.PI) * 0.35;
      if (this.attackT >= 1) this.attackT = -1;
    }
    for (const s of this.tailSegs) s.rotation.x = curl + Math.sin(this.t * 2) * 0.04;
  }
}

/** Opprett riktig rigg for en dyretype. */
export function createAnimalRig(type) {
  if (type === 'penguin') return new PenguinRig();
  if (type === 'shark') return new SharkRig();
  if (type === 'scorpion') return new ScorpionRig();
  return new QuadrupedRig(type);
}

// ======================================================================
// Våpenmodeller (holdes i hånda / vises i førsteperson)
// ======================================================================
export function createWeaponModel(id) {
  const g = new THREE.Group();
  if (id === 'machete') {
    addBox(g, 0.05, 0.05, 0.16, 0x2b1d12, 0, 0, 0);
    const blade = addBox(g, 0.015, 0.09, 0.55, 0xc8ccd2, 0, 0.01, 0.35);
    blade.material = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.8, roughness: 0.3 });
    addBox(g, 0.07, 0.03, 0.03, 0x555555, 0, 0, 0.08);
  } else if (id === 'slingshot') {
    addBox(g, 0.04, 0.04, 0.18, 0x6b4a2a, 0, 0, 0);
    for (const s of [-1, 1]) {
      const p = addBox(g, 0.035, 0.035, 0.16, 0x6b4a2a, s * 0.05, 0, 0.14);
      p.rotation.y = s * 0.35;
    }
    addBox(g, 0.12, 0.01, 0.01, 0x8a2a2a, 0, 0, 0.2);
  } else if (id === 'bow') {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 5, 16, Math.PI * 0.8), lambert(0x5e3a1e));
    arc.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.1);
    arc.position.z = 0.0;
    g.add(arc);
    addBox(g, 0.005, 0.74, 0.005, 0xeeeeee, 0, 0, -0.13);
    addBox(g, 0.012, 0.012, 0.7, 0x8a6a3a, 0, 0, 0.12);
  } else if (id === 'tranq') {
    addBox(g, 0.06, 0.07, 0.75, 0x30353a, 0, 0.02, 0.25);
    addBox(g, 0.07, 0.14, 0.3, 0x2a5a8a, 0, -0.04, -0.05);
    addBox(g, 0.04, 0.06, 0.18, 0x111111, 0, 0.08, 0.2);
    addBox(g, 0.05, 0.12, 0.05, 0x222222, 0, -0.1, 0.05);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
