// Nye firbeinte arter (bane 2 og 3): kattedyr, hunder, hovdyr, gnagere og kjemper som elefant og sjiraff.
// Alle bygger på QuadrupedRig (kropp, hals, hode, bein og hale av bokser) og får egne kjennetegn
// – flekker, striper, man, horn, snabel – lagt på rig.bodyG / rig.neck / rig.head / beina.
// Mønstrene slås sammen til én mesh med vertex-farger per kroppsdel og mellomlagres per art,
// så hvert dyr bare koster noen få ekstra tegnekall. Modellene ser langs +Z og står på y = 0.
import * as THREE from 'three';
import { QuadrupedRig, addBox } from '../characters.js';
import { lambert, paint, xf, box, cyl, cone, merge, vertexMat } from '../geo.js';
import { clamp, damp, lerp, mulberry32 } from '../../utils/math.js';

// ======================================================================
// Definisjoner (samme felt som ANIMAL_DEFS i characters.js)
// ======================================================================
const DEFS = {
  jaguar:      { key: 'jaguar', len: 1.45, bodyH: 0.52, width: 0.48, legLen: 0.48, legW: 0.15, neck: 0.26, headL: 0.42, headH: 0.34, color: 0xd99c38, belly: 0xf3e6c6, ears: 'round', tail: 'none', snout: 0x6e4436 },
  snowleopard: { key: 'snowleopard', len: 1.25, bodyH: 0.48, width: 0.44, legLen: 0.42, legW: 0.14, neck: 0.24, headL: 0.36, headH: 0.3, color: 0xd3d0c8, belly: 0xf4f2ec, ears: 'round', tail: 'none', snout: 0x8a6a66 },
  lion:        { key: 'lion', len: 1.75, bodyH: 0.66, width: 0.58, legLen: 0.62, legW: 0.17, neck: 0.3, headL: 0.5, headH: 0.42, color: 0xc99d5e, belly: 0xe6d0a4, ears: 'none', tail: 'none', snout: 0x5a3a30 },
  hyena:       { key: 'hyena', len: 1.15, bodyH: 0.52, width: 0.44, legLen: 0.56, legW: 0.12, neck: 0.32, headL: 0.42, headH: 0.3, color: 0xb39a70, belly: 0xc9b690, ears: 'round', tail: 'none', snout: 0x15110d },
  dog:         { key: 'dog', len: 1.0, bodyH: 0.42, width: 0.34, legLen: 0.52, legW: 0.1, neck: 0.3, headL: 0.44, headH: 0.24, color: 0xb87a38, belly: 0xd9b07a, ears: 'none', tail: 'none', snout: 0x111111 },
  boar:        { key: 'boar', len: 1.25, bodyH: 0.56, width: 0.48, legLen: 0.34, legW: 0.11, neck: 0.15, headL: 0.58, headH: 0.36, color: 0x56473a, belly: 0x43372d, ears: 'pointy', tail: 'none', snout: 0x2a201a },
  tapir:       { key: 'tapir', len: 1.75, bodyH: 0.72, width: 0.62, legLen: 0.46, legW: 0.15, neck: 0.22, headL: 0.55, headH: 0.36, color: 0x2a292e, belly: 0x2e2d32, ears: 'round', tail: 'stub', snout: 0x18171a },
  capybara:    { key: 'capybara', len: 1.05, bodyH: 0.52, width: 0.5, legLen: 0.22, legW: 0.11, neck: 0.12, headL: 0.37, headH: 0.29, color: 0x8c5e38, belly: 0x7c5232, ears: 'small', tail: 'stub', snout: 0x2a1c14 },
  zebra:       { key: 'zebra', len: 1.55, bodyH: 0.66, width: 0.5, legLen: 0.78, legW: 0.11, neck: 0.62, headL: 0.6, headH: 0.28, color: 0xf2f1ec, belly: 0xf2f1ec, ears: 'none', tail: 'none', snout: 0x1a1a1a },
  rhino:       { key: 'rhino', len: 2.4, bodyH: 1.08, width: 1.12, legLen: 0.55, legW: 0.3, neck: 0.32, headL: 0.85, headH: 0.5, color: 0x8b8882, belly: 0x7d7a74, ears: 'none', tail: 'none', snout: 0x55524e },
  elephant:    { key: 'elephant', len: 3.0, bodyH: 1.6, width: 1.6, legLen: 1.45, legW: 0.5, neck: 0.42, headL: 0.9, headH: 1.0, color: 0x8e8a85, belly: 0x84807b, ears: 'none', tail: 'none', snout: 0x8e8a85 },
  giraffe:     { key: 'giraffe', len: 1.95, bodyH: 0.95, width: 0.7, legLen: 1.78, legW: 0.14, neck: 2.0, headL: 0.62, headH: 0.28, color: 0xe8c48c, belly: 0xf1e3c4, ears: 'none', tail: 'none', snout: 0x2a1e18 },
  ibex:        { key: 'ibex', len: 1.25, bodyH: 0.56, width: 0.44, legLen: 0.62, legW: 0.1, neck: 0.36, headL: 0.38, headH: 0.24, color: 0x8a7153, belly: 0xdcd0b8, ears: 'small', tail: 'stub', snout: 0x2a2018 },
  cat:         { key: 'cat', len: 0.44, bodyH: 0.2, width: 0.17, legLen: 0.18, legW: 0.05, neck: 0.08, headL: 0.17, headH: 0.15, color: 0xd9842e, belly: 0xf3dfc2, ears: 'pointy', tail: 'none', snout: 0xd88a8a },
};

// ======================================================================
// Hjelpere: mellomlagrede mønster-meshes
// ======================================================================
const GEO = new Map();

function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Sammenslått geometri bygd én gang per nøkkel. build(parts, rng) legger delgeometrier i parts. */
function shared(key, build) {
  let g = GEO.get(key);
  if (!g) {
    const parts = [];
    build(parts, mulberry32(strHash(key)));
    g = merge(parts);
    GEO.set(key, g);
  }
  return g;
}

// Flate mønstre ligger få millimeter utenpå kroppen; polygonOffset hindrer flimring (z-fighting) på avstand
const decalMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });

/** Legg en (delt) mønster-mesh på en kroppsdel. cast: kaster skygge (store former som man og horn). */
function deco(parent, key, build, cast = false) {
  const m = new THREE.Mesh(shared(key, build), cast ? vertexMat : decalMat);
  m.castShadow = cast;
  m.userData.sharedGeometry = true; // delt mellom alle dyr av arten – må ikke frigjøres (dispose) ved despawn
  parent.add(m);
  return m;
}

// Mål og sentrum for boksene QuadrupedRig bygger (brukes til å legge mønster på flatene)
const bodyBox = (d) => ({ w: d.width, h: d.bodyH, l: d.len, x: 0, y: 0, z: 0 });
const neckBox = (d) => ({ w: d.width * 0.45, h: d.width * 0.45, l: d.neck, x: 0, y: 0, z: d.neck / 2 });
const headBox = (d) => ({ w: d.headH * 1.05, h: d.headH, l: d.headL * 0.6, x: 0, y: 0, z: d.headL * 0.2 });
const legBox = (d) => ({ w: d.legW, h: d.legLen, l: d.legW * 1.1, x: 0, y: -d.legLen / 2, z: 0 });

/** Flatens mål [langs u, langs v]. x-flater: u = z, v = y; y-flater: u = z, v = x; z-flater: u = x, v = y. */
function faceDims(b, face) {
  if (face[0] === 'x') return [b.l, b.h];
  if (face[0] === 'y') return [b.l, b.w];
  return [b.w, b.h];
}

const FACE_ROT = { 'x+': [0, Math.PI / 2], 'x-': [0, -Math.PI / 2], 'y+': [-Math.PI / 2, 0], 'y-': [Math.PI / 2, 0], 'z+': [0, 0], 'z-': [0, Math.PI] };
const LIFT = 0.005;

/**
 * Flat firkant (2 trekanter) med sentrum (x, y, z) som vender ut langs flatens normal.
 * a, c: mål langs flatens u og v (x-flater: u = z, v = y; y-flater: u = z, v = x; z-flater: u = x, v = y).
 * rot: vridning i flatens plan (på x-flatene samme retning som rotasjon om +x på begge sider).
 */
function flat(parts, face, x, y, z, a, c, color, rot = 0) {
  const [rx, ry] = FACE_ROT[face];
  const yFace = face[0] === 'y';
  const rz = face === 'x-' ? -rot : rot;
  parts.push(xf(paint(new THREE.PlaneGeometry(yFace ? c : a, yFace ? a : c), color), { x, y, z, rx, ry, rz }));
}

/**
 * Flat flekk på én flate av boksen b. face: 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-'.
 * u, v: plassering som andel av flaten (−0.5..0.5), a, c: flekkens mål langs u og v (meter),
 * rot: vridning i flatens plan, lift: ekstra avstand ut fra flaten (lag på lag, f.eks. rosettsenter).
 */
function patch(parts, b, face, u, v, a, c, color, rot = 0, lift = 0) {
  const s = face[1] === '-' ? -1 : 1;
  const o = LIFT + lift;
  if (face[0] === 'x') flat(parts, face, b.x + s * (b.w / 2 + o), b.y + v * b.h, b.z + u * b.l, a, c, color, rot);
  else if (face[0] === 'y') flat(parts, face, b.x + v * b.w, b.y + s * (b.h / 2 + o), b.z + u * b.l, a, c, color, rot);
  else flat(parts, face, b.x + u * b.w, b.y + v * b.h, b.z + s * (b.l / 2 + o), a, c, color, rot);
}

/**
 * Strø flekker over flater av boksen b.
 * o = { n, size: [min, maks], color (eller liste), center (farge → rosett), long (strekk langs u),
 *       faces: [[flate, vekt, u0, u1, v0, v1], ...] }
 */
function scatter(parts, rng, b, o) {
  let tot = 0;
  for (const f of o.faces) tot += f[1];
  for (let i = 0; i < o.n; i++) {
    let r = rng() * tot;
    let f = o.faces[0];
    for (const ff of o.faces) {
      r -= ff[1];
      if (r <= 0) { f = ff; break; }
    }
    const u = lerp(f[2], f[3], rng());
    const v = lerp(f[4], f[5], rng());
    const sz = lerp(o.size[0], o.size[1], rng());
    const a = sz * (0.8 + rng() * 0.45) * (o.long || 1);
    const c = sz * (0.8 + rng() * 0.45);
    const rot = (rng() - 0.5) * 1.2;
    const col = Array.isArray(o.color) ? o.color[Math.floor(rng() * o.color.length)] : o.color;
    patch(parts, b, f[0], u, v, a, c, col, rot);
    if (o.center !== undefined) patch(parts, b, f[0], u, v, a * 0.5, c * 0.5, o.center, rot + 0.4, 0.004);
  }
}

/** Nettmønster (sjiraff): rutenett av flekker med lyse fuger mellom. */
function reticulate(parts, rng, b, face, cell, u0, u1, v0, v1, colors) {
  const [du, dv] = faceDims(b, face);
  const nu = Math.max(1, Math.round(((u1 - u0) * du) / cell));
  const nv = Math.max(1, Math.round(((v1 - v0) * dv) / cell));
  const su = (u1 - u0) / nu, sv = (v1 - v0) / nv;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const u = u0 + (i + 0.5 + (rng() - 0.5) * 0.18) * su;
      const v = v0 + (j + 0.5 + (rng() - 0.5) * 0.18) * sv;
      const a = su * du * (0.76 + rng() * 0.1);
      const c = sv * dv * (0.76 + rng() * 0.1);
      patch(parts, b, face, u, v, a, c, colors[Math.floor(rng() * colors.length)], (rng() - 0.5) * 0.3);
    }
  }
}

/** Synlige øyne i hjørnene av hodeboksen (standardøynene i QuadrupedRig ligger skjult inne i hodet). */
function eyes(parts, d, color = 0x15100c, k = 1, y = 0.2, z = 0.5) {
  const e = Math.max(0.026, d.headH * 0.13) * k;
  const hw = d.headH * 0.525;
  for (const s of [-1, 1]) parts.push(box(e, e * 0.8, e, color, { x: s * (hw - e * 0.3), y: d.headH * y, z: d.headL * z - e * 0.3 }));
}

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _eu = new THREE.Euler();

/** Sylinder fra punkt a til b med radius r0 i a og r1 i b (r1 = 0 gir kjegle). */
function rod(parts, a, b, r0, r1, seg, color) {
  _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const l = _dir.length();
  _dir.multiplyScalar(1 / l);
  _q.setFromUnitVectors(_up, _dir);
  _eu.setFromQuaternion(_q);
  const t = { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2, rx: _eu.x, ry: _eu.y, rz: _eu.z };
  parts.push(r1 <= 0 ? cone(r0, l, seg, color, t) : cyl(r1, r0, l, seg, color, t));
}

/** Ringer rundt et haleledd (fra z = 0 til −l), og eventuelt en mørk tipp. */
function tailRings(parts, s, n, color, tip) {
  const h = s.h ?? s.w;
  for (let i = 0; i < n; i++) parts.push(box(s.w + 0.014, h + 0.014, 0.035, color, { z: (-s.l * (i + 0.6)) / (n + 0.4) }));
  if (tip !== undefined) parts.push(box(s.w + 0.016, h + 0.016, s.l * 0.32, tip, { z: -s.l * 0.84 }));
}

// ======================================================================
// Felles rigg
// ======================================================================
class FaunaRig extends QuadrupedRig {
  /**
   * def: definisjon som i ANIMAL_DEFS (+ key). o = { slope, neck, headPitch, heavy, feet }
   *   slope     helning på ryggen (radianer, + = skuldrene høyere enn hoftene)
   *   neck      halsvinkel i hvile (− = opp), ellers standarden i QuadrupedRig
   *   headPitch ekstra hodevinkel (+ = snuten ned)
   *   heavy     0..1 – demper hoppingen i «happy» for tunge dyr
   *   feet      farge på føttene (standard: mørke klover)
   */
  constructor(def, o = {}) {
    super(def);
    const d = this.d;
    // Rekkefølgen QuadrupedRig bygger hodet i: hodeboks, snute, nese, øye, øye, ører …
    const hc = this.head.children;
    this.headBox = hc[0];
    this.muzzle = hc[1];
    this.noseTip = hc[2];
    // Standardøynene ligger skjult inne i hodeboksen – vi lager egne, synlige øyne i stedet
    const hidden = [hc[3], hc[4]].filter((m) => m && m.isMesh && m.geometry.parameters?.width === 0.04);
    if (hidden.length) this.head.remove(...hidden);
    this.feet = this.legs.map((l) => l.children[1]);
    if (o.feet !== undefined) for (const f of this.feet) f.material = lambert(o.feet);
    this.slope = o.slope || 0;
    this.heavy = o.heavy || 0;
    this.headPitch = o.headPitch || 0;
    this.setNeck(o.neck ?? this.neckBase);
    this.bodyG.rotation.x = -this.slope;
    if (this.slope > 0) {
      // Forbeina forlenges oppover så skuldrene ikke svever når ryggen heller
      const lz = d.len / 2 - d.legW * 0.8;
      const ext = lz * Math.sin(this.slope) + 0.12;
      for (const leg of this.legs.slice(0, 2)) addBox(leg, d.legW * 0.96, ext, d.legW * 1.06, d.color, 0, ext / 2 - 0.04, 0);
    }
    this.tailSegs = null;
    this.anim = null;
  }

  /** Sett halsvinkelen i hvile; hodet holdes vannrett (pluss headPitch). */
  setNeck(base) {
    this.neckBase = base;
    this.neck.rotation.x = base;
    this.head.rotation.x = -base + this.slope + this.headPitch;
  }

  /**
   * Bytt standardhalen mot en kjede av ledd.
   * segs: [{ l, w, h, pitch, run, sway, color, extra(parts, rng, seg) }]
   * pitch: vinkel i hvile (− = ned, + = opp), run: vinkel for første ledd i full fart.
   */
  makeTail(key, segs) {
    this.tail.clear();
    this.tailSegs = [];
    let parent = this.tail;
    let prevL = 0;
    segs.forEach((s, i) => {
      const g = new THREE.Group();
      g.position.z = -prevL;
      g.rotation.x = s.pitch;
      parent.add(g);
      deco(g, `${key}-tail${i}`, (parts, rng) => {
        const h = s.h ?? s.w;
        parts.push(box(s.w, h, s.l + h * 0.5, s.color, { z: -s.l / 2 + h * 0.25 }));
        if (s.extra) s.extra(parts, rng, s);
      }, true);
      this.tailSegs.push({ g, pitch: s.pitch, run: s.run ?? s.pitch, sway: s.sway ?? 0.18 });
      parent = g;
      prevL = s.l;
    });
  }

  update(dt, speed, state) {
    super.update(dt, speed, state);
    if (this.slope) this.bodyG.rotation.x -= this.slope;
    if (this.heavy && state === 'happy') this.bodyG.position.y -= Math.abs(Math.sin(this.t * 8)) * 0.25 * this.heavy;
    if (this.tailSegs) {
      const run = clamp((speed - 2) / 7, 0, 1);
      const happy = state === 'happy';
      for (let i = 0; i < this.tailSegs.length; i++) {
        const s = this.tailSegs[i];
        const target = (i === 0 ? lerp(s.pitch, s.run, run) : s.pitch) + Math.sin(this.t * 1.7 - i * 0.8) * 0.05;
        s.g.rotation.x = damp(s.g.rotation.x, target, 6, dt);
        if (i > 0) s.g.rotation.y = Math.sin(this.t * (happy ? 9 : 2.4) - i * 0.9) * s.sway * (happy ? 1.8 : 1);
      }
    }
    if (this.anim) this.anim(dt, speed, state);
  }
}

// ======================================================================
// Kattedyr
// ======================================================================
const SIDES = (v0, v1, w = 1) => [['x+', w, -0.46, 0.46, v0, v1], ['x-', w, -0.46, 0.46, v0, v1]];
const LEG_FACES = [['x+', 1, -0.3, 0.3, -0.32, 0.42], ['x-', 1, -0.3, 0.3, -0.32, 0.42], ['z+', 1, -0.3, 0.3, -0.32, 0.42], ['z-', 0.5, -0.3, 0.3, -0.32, 0.42]];

/** Kattedyr har kort snute: krymp standardsnuten og flytt nesen inntil. */
function catFace(r, d, muzzleColor) {
  r.muzzle.scale.set(1.1, 0.85, 0.5);
  r.muzzle.position.set(0, -d.headH * 0.2, d.headL * 0.625 - 0.005);
  if (muzzleColor !== undefined) r.muzzle.material = lambert(muzzleColor);
  r.noseTip.position.set(0, d.headH * 0.0, d.headL * 0.75 - 0.012);
}

/** Felles for jaguar og snøleopard: rosetter på kropp, prikker på hode, hals og bein. */
function spottedCat(key, d, o) {
  const r = new FaunaRig(d, { feet: o.feet, headPitch: 0.05 });
  catFace(r, d, o.muzzle);
  deco(r.bodyG, `${key}-body`, (parts, rng) => {
    const b = bodyBox(d);
    // Svak mørkere rygg gir form
    flat(parts, 'y+', 0, d.bodyH / 2 + 0.003, 0, d.len * 0.9, d.width * 0.82, o.back);
    scatter(parts, rng, b, { n: o.rosettes, size: o.rosetteSize, color: o.dark, center: o.center,
      faces: [...SIDES(-0.26, 0.4), ['y+', 0.9, -0.44, 0.44, -0.36, 0.36], ['z-', 0.15, -0.3, 0.3, -0.2, 0.35]] });
    scatter(parts, rng, b, { n: o.dots, size: [0.028, 0.048], color: o.dark,
      faces: [...SIDES(-0.42, 0.46), ['y+', 0.6, -0.47, 0.47, -0.4, 0.4], ['z+', 0.3, -0.35, 0.35, -0.3, 0.4], ['z-', 0.3, -0.35, 0.35, -0.3, 0.4]] });
  });
  deco(r.neck, `${key}-neck`, (parts, rng) => scatter(parts, rng, neckBox(d), { n: 10, size: [0.03, 0.055], color: o.dark,
    faces: [['x+', 1, -0.4, 0.4, -0.35, 0.35], ['x-', 1, -0.4, 0.4, -0.35, 0.35], ['y+', 1, -0.4, 0.4, -0.35, 0.35]] }));
  deco(r.head, `${key}-head`, (parts, rng) => {
    scatter(parts, rng, headBox(d), { n: 14, size: [0.018, 0.032], color: o.dark,
      faces: [['y+', 1.2, -0.42, 0.3, -0.4, 0.4], ['x+', 1, -0.42, 0.25, -0.05, 0.4], ['x-', 1, -0.42, 0.25, -0.05, 0.4]] });
    eyes(parts, d, 0x3a3010, 0.9);
    // Mørk bakside på ørene
    for (const s of [-1, 1]) flat(parts, 'z-', s * d.headH * 0.4, d.headH * 0.56, -0.03 - LIFT, 0.11, 0.11, o.dark);
  });
  for (const leg of r.legs) {
    deco(leg, `${key}-leg`, (parts, rng) => scatter(parts, rng, legBox(d), { n: 9, size: [0.026, 0.045], color: o.dark, faces: LEG_FACES }));
  }
  r.makeTail(key, o.tail.map((s) => ({ ...s, color: d.color, extra: (parts, rng, seg) => tailRings(parts, seg, seg.rings, o.dark, seg.tip) })));
  return r;
}

function jaguarRig() {
  return spottedCat('jaguar', DEFS.jaguar, {
    feet: 0xe2ad55, muzzle: 0xf0dcae, back: 0xc98a2c, dark: 0x1d1510, center: 0xb36d1e, rosettes: 30, rosetteSize: [0.075, 0.115], dots: 22,
    tail: [
      { l: 0.3, w: 0.08, pitch: -1.05, run: -0.35, rings: 1 },
      { l: 0.27, w: 0.072, pitch: 0.3, rings: 2 },
      { l: 0.22, w: 0.065, pitch: 0.45, rings: 1, tip: 0x1d1510 },
    ],
  });
}

function snowleopardRig() {
  const r = spottedCat('snowleopard', DEFS.snowleopard, {
    feet: 0xe2dfd8, back: 0xc4c0b6, dark: 0x3c3b38, center: 0xaaa69c, rosettes: 26, rosetteSize: [0.08, 0.12], dots: 20,
    tail: [
      { l: 0.34, w: 0.14, pitch: -0.75, run: -0.25, rings: 1, sway: 0.22 },
      { l: 0.32, w: 0.14, pitch: 0.4, rings: 2, sway: 0.22 },
      { l: 0.3, w: 0.13, pitch: 0.6, rings: 1, tip: 0x3c3b38, sway: 0.22 },
    ],
  });
  // Store, lodne poter
  for (const f of r.feet) f.scale.set(1.3, 1.3, 1.25);
  return r;
}

function lionRig() {
  const d = DEFS.lion;
  const r = new FaunaRig(d, { feet: 0xd2aa6c, headPitch: 0.05 });
  catFace(r, d);
  const M1 = 0x6e421f, M2 = 0x8c5627, M3 = 0xa8712f;
  const H = d.headH, L = d.headL;
  deco(r.bodyG, 'lion-body', (parts) => {
    flat(parts, 'y+', 0, d.bodyH / 2 + 0.003, 0, d.len * 0.9, d.width * 0.82, 0xb98c4e);
    // Manen fortsetter ned over brystet og skuldrene, og en frynse under buken
    parts.push(box(d.width * 0.84, d.bodyH * 0.8, 0.32, M1, { y: -0.04, z: d.len / 2 - 0.08 }));
    parts.push(box(d.width * 0.92, 0.14, d.len * 0.26, M2, { y: d.bodyH / 2 + 0.04, z: d.len / 2 - d.len * 0.13 }));
    parts.push(box(d.width * 0.5, 0.1, d.len * 0.4, M1, { y: -d.bodyH * 0.56, z: d.len * 0.12 }));
  }, true);
  deco(r.neck, 'lion-neck', (parts) => {
    const nb = neckBox(d);
    parts.push(box(nb.w * 2.4, nb.w * 2.5, d.neck + 0.16, M1, { y: 0.02, z: d.neck / 2 - 0.04 }));
    parts.push(box(nb.w * 1.7, 0.18, d.neck + 0.1, M2, { y: nb.w * 1.25, z: d.neck / 2 - 0.04 }));
  }, true);
  deco(r.head, 'lion-head', (parts) => {
    // Manen rammer inn ansiktet bak hodeboksens framkant
    parts.push(box(H * 2.0, H * 1.9, L * 0.5, M1, { z: -L * 0.12 }));
    parts.push(box(H * 1.55, H * 0.5, L * 0.5, M2, { y: H * 0.98, z: -L * 0.14, rz: 0.08 }));
    for (const s of [-1, 1]) parts.push(box(H * 0.5, H * 1.5, L * 0.48, M2, { x: s * H * 1.02, y: -H * 0.05, z: -L * 0.13, rz: s * 0.12 }));
    parts.push(box(H * 1.3, H * 0.6, L * 0.55, M1, { y: -H * 0.95, z: -L * 0.04, rx: -0.15 }));
    parts.push(box(H * 1.55, H * 1.45, 0.06, M3, { z: L * 0.12 }));
    // Runde ører foran manen
    for (const s of [-1, 1]) parts.push(box(0.1, 0.1, 0.05, 0xb48a52, { x: s * H * 0.45, y: H * 0.6, z: L * 0.2 }));
    eyes(parts, d, 0x2a1c0c, 0.9);
  }, true);
  r.makeTail('lion', [
    { l: 0.36, w: 0.05, pitch: -1.05, run: -0.4, color: d.color },
    { l: 0.3, w: 0.045, pitch: 0.25, color: d.color },
    { l: 0.22, w: 0.04, pitch: 0.35, color: d.color, extra: (parts) => parts.push(box(0.11, 0.11, 0.17, 0x3a2414, { z: -0.25 })) },
  ]);
  return r;
}

const CAT_COATS = [
  { color: 0xd9842e, belly: 0xf3dfc2, stripe: 0xa4561c },                                   // rødstripet
  { color: 0x8c8781, belly: 0xdcd8d0, stripe: 0x4a4642 },                                   // grå tigerstripet
  { color: 0x26262b, belly: 0x2e2e33 },                                                     // svart
  { color: 0x1f1f24, belly: 0xf2f2ee, socks: 0xf2f2ee },                                    // svart og hvit
  { color: 0xf0ebe2, belly: 0xf6f3ee, patches: [0xd9842e, 0x2a2a2e] },                       // trefarget
];

function catRig(variant = Math.floor(Math.random() * CAT_COATS.length)) {
  const coat = CAT_COATS[variant % CAT_COATS.length];
  const d = { ...DEFS.cat, color: coat.color, belly: coat.belly };
  const key = `cat${variant}`;
  const r = new FaunaRig(d, { feet: coat.socks ?? coat.color, headPitch: 0.05 });
  catFace(r, d);
  deco(r.bodyG, `${key}-body`, (parts, rng) => {
    const b = bodyBox(d);
    if (coat.stripe) {
      for (let i = 0; i < 7; i++) {
        const z = lerp(0.42, -0.42, i / 6) * d.len;
        flat(parts, 'y+', 0, d.bodyH / 2 + LIFT, z, 0.022, d.width * 0.9, coat.stripe, 0.15);
        for (const s of [-1, 1]) flat(parts, s > 0 ? 'x+' : 'x-', s * (d.width / 2 + LIFT), d.bodyH * 0.18, z - 0.01, 0.02, d.bodyH * 0.6, coat.stripe, 0.3);
      }
    }
    if (coat.patches) scatter(parts, rng, b, { n: 9, size: [0.06, 0.1], color: coat.patches, faces: [...SIDES(-0.2, 0.4), ['y+', 1, -0.4, 0.4, -0.35, 0.35]] });
    if (coat.socks) flat(parts, 'z+', 0, -0.02, d.len / 2 + LIFT, d.width * 0.7, d.bodyH * 0.7, coat.socks);
  });
  deco(r.head, `${key}-head`, (parts) => {
    if (coat.stripe) for (const x of [-0.025, 0, 0.025]) flat(parts, 'y+', x, d.headH / 2 + LIFT, d.headL * 0.2, 0.06, 0.012, coat.stripe);
    if (coat.patches) flat(parts, 'y+', 0.03, d.headH / 2 + LIFT, d.headL * 0.15, d.headL * 0.4, d.headH * 0.55, coat.patches[0]);
    eyes(parts, d, 0xa8b43a, 1.0, 0.18);
  });
  if (coat.socks) for (const leg of r.legs) deco(leg, `${key}-leg`, (parts) => parts.push(box(d.legW + 0.01, d.legLen * 0.3, d.legW * 1.1 + 0.01, coat.socks, { y: -d.legLen * 0.83 })));
  const tc = coat.color;
  r.makeTail(key, [
    { l: 0.13, w: 0.035, pitch: 1.0, run: 0.15, color: tc, sway: 0.25, extra: (p, rng, s) => coat.stripe && tailRings(p, s, 1, coat.stripe) },
    { l: 0.12, w: 0.032, pitch: 0.35, color: tc, sway: 0.3, extra: (p, rng, s) => coat.stripe && tailRings(p, s, 2, coat.stripe) },
    { l: 0.1, w: 0.03, pitch: 0.55, color: tc, sway: 0.35, extra: (p, rng, s) => coat.stripe && tailRings(p, s, 1, coat.stripe, coat.stripe) },
  ]);
  return r;
}

// ======================================================================
// Hunder og hyener
// ======================================================================
function dogRig() {
  const d = DEFS.dog;
  const r = new FaunaRig(d, { slope: 0.06, headPitch: 0.08, feet: 0xc08a4a });
  r.muzzle.material = lambert(0x2a2420);
  const B = 0x1d1a17;
  deco(r.bodyG, 'dog-body', (parts) => {
    // Svart «sal» over ryggen (schæfer)
    parts.push(box(d.width + 0.024, d.bodyH * 0.52, d.len * 0.74, B, { y: d.bodyH * 0.27, z: -d.len * 0.05 }));
    flat(parts, 'z+', 0, -0.02, d.len / 2 + LIFT, d.width * 0.7, d.bodyH * 0.6, 0xd9b07a);
  });
  deco(r.neck, 'dog-neck', (parts) => {
    const nb = neckBox(d);
    parts.push(box(nb.w + 0.02, nb.h * 0.5, d.neck * 0.8, 0x3a2c20, { y: nb.h * 0.3, z: d.neck * 0.45 }));
    // Halsbånd med metallplate
    parts.push(box(nb.w + 0.04, nb.h + 0.04, 0.06, 0x8a1e1a, { z: d.neck * 0.3 }));
    parts.push(box(0.035, 0.04, 0.012, 0xcfd2d6, { y: -nb.h / 2 - 0.05, z: d.neck * 0.3 + 0.02 }));
  });
  deco(r.head, 'dog-head', (parts) => {
    const H = d.headH, L = d.headL;
    parts.push(box(H * 1.07, H * 0.3, L * 0.42, 0x3a2c20, { y: H * 0.38, z: L * 0.22 }));
    // Store, spisse ører som står rett opp
    for (const s of [-1, 1]) {
      const t = { x: s * H * 0.32, y: H * 0.86, z: -L * 0.02, ry: Math.PI / 4, rz: -s * 0.12 };
      parts.push(cone(H * 0.3, H * 0.8, 4, 0x2c2218, t));
    }
    eyes(parts, d, 0x2a1a0c, 0.9);
  }, true);
  r.makeTail('dog', [
    { l: 0.22, w: 0.08, pitch: -1.0, run: -0.45, color: d.color, sway: 0.25 },
    { l: 0.22, w: 0.1, pitch: 0.3, color: 0x3a2c20, sway: 0.3 },
  ]);
  return r;
}

function hyenaRig() {
  const d = DEFS.hyena;
  const r = new FaunaRig(d, { slope: 0.2, neck: 0.02, headPitch: 0.12, feet: 0x3a3026 });
  r.muzzle.material = lambert(0x3c3228);
  const S = [0x4a3826, 0x57422c];
  const crest = 0x3a2c1e;
  deco(r.bodyG, 'hyena-body', (parts, rng) => {
    scatter(parts, rng, bodyBox(d), { n: 36, size: [0.05, 0.085], color: S,
      faces: [...SIDES(-0.38, 0.45), ['y+', 0.6, -0.45, 0.45, -0.4, 0.4], ['z-', 0.25, -0.35, 0.35, -0.3, 0.35]] });
    // Kort, mørk bust langs skuldrene
    parts.push(box(0.07, 0.08, d.len * 0.45, crest, { y: d.bodyH / 2 + 0.03, z: d.len * 0.25 }));
  });
  deco(r.neck, 'hyena-neck', (parts, rng) => {
    const nb = neckBox(d);
    scatter(parts, rng, nb, { n: 6, size: [0.04, 0.06], color: S, faces: [['x+', 1, -0.4, 0.4, -0.3, 0.3], ['x-', 1, -0.4, 0.4, -0.3, 0.3]] });
    parts.push(box(0.06, 0.1, d.neck + 0.06, crest, { y: nb.h / 2 + 0.04, z: d.neck / 2 }));
  });
  deco(r.head, 'hyena-head', (parts) => {
    eyes(parts, d, 0x15100c, 0.9);
    for (const s of [-1, 1]) flat(parts, 'z-', s * d.headH * 0.4, d.headH * 0.56, -0.03 - LIFT, 0.11, 0.11, 0x2e241a);
  });
  for (const leg of r.legs) {
    deco(leg, 'hyena-leg', (parts, rng) => {
      scatter(parts, rng, legBox(d), { n: 6, size: [0.03, 0.05], color: S, faces: LEG_FACES });
      parts.push(box(d.legW + 0.012, d.legLen * 0.3, d.legW * 1.1 + 0.012, 0x6a5840, { y: -d.legLen * 0.82 }));
    });
  }
  r.makeTail('hyena', [
    { l: 0.18, w: 0.055, pitch: -1.2, run: -0.6, color: d.color },
    { l: 0.2, w: 0.1, pitch: 0.1, color: 0x2e241a },
  ]);
  return r;
}

// ======================================================================
// Villsvin, tapir og kapybara
// ======================================================================
function boarRig() {
  const d = DEFS.boar;
  const r = new FaunaRig(d, { slope: 0.12, neck: 0.12, headPitch: 0.18, feet: 0x1e1814 });
  r.muzzle.material = lambert(0x3e322a);
  r.noseTip.visible = false;
  const bristle = 0x211a15;
  deco(r.bodyG, 'boar-body', (parts, rng) => {
    // Grånet, bustete pels
    scatter(parts, rng, bodyBox(d), { n: 24, size: [0.08, 0.14], color: [0x6a5846, 0x3a2f26, 0x4a3d32],
      faces: [...SIDES(-0.4, 0.45), ['y+', 0.8, -0.45, 0.45, -0.4, 0.4]] });
    // Høy skulderpukkel og bustekam langs ryggen
    const hz = d.len * 0.2, hl = d.len * 0.42;
    parts.push(box(d.width * 0.86, 0.12, hl, d.color, { y: d.bodyH / 2 + 0.04, z: hz }));
    for (let i = 0; i < 11; i++) {
      const z = d.len / 2 - 0.08 - i * 0.095;
      const onHump = z > hz - hl / 2 + 0.03;
      const h = 0.13 - i * 0.008;
      parts.push(box(0.05, h, 0.09, bristle, { y: d.bodyH / 2 + (onHump ? 0.09 : 0) + h / 2 - 0.03, z, rx: -0.35 }));
    }
  }, true);
  deco(r.neck, 'boar-neck', (parts) => {
    const nb = neckBox(d);
    parts.push(box(0.06, 0.16, d.neck + 0.1, bristle, { y: nb.h / 2 + 0.05, z: d.neck / 2 - 0.02, rx: -0.2 }));
  }, true);
  deco(r.head, 'boar-head', (parts) => {
    const H = d.headH, L = d.headL;
    // Trynet (flat skive) med nesebor
    parts.push(box(H * 0.44, H * 0.38, 0.035, 0x7a6058, { y: -H * 0.13, z: L * 0.9 + 0.012 }));
    for (const s of [-1, 1]) parts.push(box(0.03, 0.035, 0.012, 0x1a1210, { x: s * H * 0.08, y: -H * 0.13, z: L * 0.9 + 0.03 }));
    // Støttenner som bøyer seg opp og ut
    for (const s of [-1, 1]) {
      rod(parts, [s * H * 0.25, -H * 0.32, L * 0.8], [s * H * 0.36, -H * 0.12, L * 0.78], 0.024, 0.02, 5, 0xeee6d0);
      rod(parts, [s * H * 0.36, -H * 0.12, L * 0.78], [s * H * 0.42, H * 0.04, L * 0.7], 0.02, 0, 5, 0xeee6d0);
    }
    eyes(parts, d, 0x120d0a, 0.75, 0.22, 0.45);
  }, true);
  for (const leg of r.legs) deco(leg, 'boar-leg', (parts) => parts.push(box(d.legW + 0.012, d.legLen * 0.5, d.legW * 1.1 + 0.012, 0x2a221c, { y: -d.legLen * 0.72 })));
  r.makeTail('boar', [
    { l: 0.22, w: 0.03, pitch: -1.3, run: -0.5, color: d.color, sway: 0.3, extra: (parts) => parts.push(box(0.05, 0.05, 0.08, bristle, { z: -0.21 })) },
  ]);
  return r;
}

function tapirRig() {
  const d = DEFS.tapir;
  const r = new FaunaRig(d, { neck: -0.12, headPitch: 0.32, feet: 0x141316 });
  const W = 0xe9e6df;
  const H = d.headH, L = d.headL;
  deco(r.bodyG, 'tapir-body', (parts) => {
    // Hvit «sal» over midje og bakpart, mørk forpart og mørke bein
    const zf = d.len * 0.06, zb = -d.len / 2 - 0.016;
    parts.push(box(d.width + 0.03, d.bodyH * 1.14, zf - zb, W, { y: -d.bodyH * 0.05, z: (zf + zb) / 2 }));
    // Avrundet, høy bakpart
    parts.push(box(d.width * 0.9, d.bodyH * 0.2, d.len * 0.42, W, { y: d.bodyH * 0.55, z: -d.len * 0.2 }));
    parts.push(box(d.width * 0.92, d.bodyH * 0.12, d.len * 0.26, d.color, { y: d.bodyH * 0.5, z: d.len * 0.3 }));
  }, true);
  deco(r.head, 'tapir-head', (parts) => {
    // Hvite kanter på ørene
    for (const s of [-1, 1]) parts.push(box(0.15, 0.03, 0.065, W, { x: s * H * 0.4, y: H * 0.55 + 0.07, z: 0 }));
    eyes(parts, d, 0x0c0b0d, 0.75, 0.25, 0.42);
  });
  // Kort, bevegelig snabel
  r.snout = new THREE.Group();
  r.snout.position.set(0, -H * 0.08, L * 0.88);
  r.head.add(r.snout);
  deco(r.snout, 'tapir-snout', (parts) => {
    parts.push(box(0.13, 0.12, 0.16, d.color, { z: 0.06 }));
    parts.push(box(0.1, 0.1, 0.11, d.color, { y: -0.035, z: 0.16, rx: 0.45 }));
    parts.push(box(0.085, 0.05, 0.04, 0x111013, { y: -0.075, z: 0.2, rx: 0.45 }));
  }, true);
  r.anim = (dt, speed, state) => {
    const eat = state === 'eat';
    r.snout.rotation.x = Math.sin(r.t * (eat ? 7 : 1.6)) * (eat ? 0.25 : 0.12);
    r.snout.rotation.y = Math.sin(r.t * 1.1) * 0.12;
  };
  return r;
}

function capybaraRig() {
  const d = DEFS.capybara;
  const r = new FaunaRig(d, { neck: -0.2, headPitch: 0.1, feet: 0x3a2a1e });
  r.tail.clear(); // ingen synlig hale
  r.muzzle.scale.set(1.3, 1.3, 1);
  r.muzzle.material = lambert(0x7e5233);
  r.noseTip.position.y = d.headH * 0.12;
  r.noseTip.scale.set(1.8, 0.8, 1);
  deco(r.bodyG, 'capybara-body', (parts) => {
    // Tønneformet kropp: avrundet rygg, rund bakende og bryst
    parts.push(box(d.width * 0.84, d.bodyH * 0.18, d.len * 0.84, d.color, { y: d.bodyH * 0.55 }));
    parts.push(box(d.width * 0.86, d.bodyH * 0.78, 0.12, d.color, { y: 0.02, z: -d.len / 2 - 0.045 }));
    parts.push(box(d.width * 0.84, d.bodyH * 0.66, 0.08, d.color, { y: -0.02, z: d.len / 2 + 0.03 }));
    flat(parts, 'y+', 0, d.bodyH * 0.64 + LIFT, 0, d.len * 0.7, d.width * 0.6, 0x7a5030);
  }, true);
  deco(r.head, 'capybara-head', (parts) => {
    const H = d.headH, L = d.headL;
    // Mørk kjertel oppå snuten
    parts.push(box(0.07, 0.03, 0.09, 0x3a2418, { y: H * 0.5 + 0.01, z: L * 0.42 }));
    eyes(parts, d, 0x140e0a, 0.75, 0.32, 0.4);
  });
  return r;
}

// ======================================================================
// Savannens hovdyr: sebra, neshorn
// ======================================================================
function zebraRig() {
  const d = DEFS.zebra;
  const r = new FaunaRig(d, { headPitch: 0.5 });
  r.muzzle.material = lambert(0x2b2b2b);
  const B = 0x1b1b1d, Wh = d.color;
  const H = d.headH, L = d.headL;
  deco(r.bodyG, 'zebra-body', (parts) => {
    const w = d.width, h = d.bodyH, l = d.len;
    // Loddrette striper foran som sveiper bakover over lendet
    const n = 12;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const z0 = lerp(l / 2 - 0.08, -l / 2 + 0.1, f);
      const rot = f < 0.55 ? 0.12 - f * 0.2 : (f - 0.55) * 1.9;
      const sw = 0.05 + (i % 2) * 0.012;
      let L2 = h * (f < 0.6 ? 0.84 : 0.72);
      if (rot > 0.05) L2 = Math.min(L2, (z0 + l / 2 - 0.03) / Math.sin(rot));
      for (const s of [-1, 1]) {
        flat(parts, s > 0 ? 'x+' : 'x-', s * (w / 2 + LIFT), h / 2 - 0.01 - (L2 / 2) * Math.cos(rot), z0 - (L2 / 2) * Math.sin(rot), sw, L2, B, rot);
      }
      flat(parts, 'y+', 0, h / 2 + LIFT, z0, sw, w - 0.01, B);
    }
    // Vannrette striper over låret og bakenden
    for (let j = 0; j < 3; j++) {
      for (const s of [-1, 1]) flat(parts, s > 0 ? 'x+' : 'x-', s * (w / 2 + LIFT + 0.001), h * (-0.05 - j * 0.15), -l / 2 + l * 0.15 + 0.01, l * 0.3, 0.045, B, -0.1);
    }
    for (let j = 0; j < 4; j++) flat(parts, 'z-', 0, h * (0.32 - j * 0.2), -l / 2 - LIFT, w * 0.9, 0.045, B);
  });
  deco(r.neck, 'zebra-neck', (parts) => {
    const nb = neckBox(d);
    for (let k = 0; k < 6; k++) parts.push(box(nb.w + 0.022, nb.h + 0.022, 0.05, B, { z: 0.07 + k * 0.1, rx: 0.15 }));
    // Stående man, stripet
    parts.push(box(0.05, 0.11, d.neck + 0.1, Wh, { y: nb.h / 2 + 0.05, z: d.neck / 2 - 0.02 }));
    for (let k = 0; k < 6; k++) parts.push(box(0.056, 0.114, 0.05, B, { y: nb.h / 2 + 0.05, z: 0.07 + k * 0.1 }));
    parts.push(box(0.054, 0.02, d.neck + 0.1, B, { y: nb.h / 2 + 0.105, z: d.neck / 2 - 0.02 }));
  }, true);
  deco(r.head, 'zebra-head', (parts) => {
    const hb = headBox(d);
    for (let k = 0; k < 3; k++) {
      for (const f of ['x+', 'x-']) patch(parts, hb, f, -0.05, 0.3 - k * 0.3, hb.l * 0.85, 0.028, B, 0.15);
    }
    for (const u of [-0.25, 0, 0.25]) patch(parts, hb, 'z+', u, 0.33, 0.018, 0.12, B);
    // Ører med svart tupp og en liten pannelugg
    for (const s of [-1, 1]) {
      rod(parts, [s * 0.07, H * 0.42, -L * 0.04], [s * 0.12, H * 0.42 + 0.17, -L * 0.08], 0.038, 0.016, 4, Wh);
      parts.push(box(0.035, 0.04, 0.03, B, { x: s * 0.12, y: H * 0.42 + 0.17, z: -L * 0.08 }));
    }
    parts.push(box(0.04, 0.06, 0.08, B, { y: H / 2 + 0.03, z: -0.02 }));
    eyes(parts, d, 0x111111, 0.8, 0.25, 0.4);
  }, true);
  for (const leg of r.legs) {
    deco(leg, 'zebra-leg', (parts) => {
      for (let k = 0; k < 7; k++) parts.push(box(d.legW + 0.02, 0.04, d.legW * 1.1 + 0.02, B, { y: -0.08 - k * 0.095 }));
    });
  }
  r.makeTail('zebra', [
    { l: 0.42, w: 0.04, pitch: -1.3, run: -0.7, color: Wh, sway: 0.25,
      extra: (parts, rng, s) => { tailRings(parts, s, 3, B); parts.push(box(0.07, 0.07, 0.2, B, { z: -0.46 })); } },
  ]);
  return r;
}

function rhinoRig() {
  const d = DEFS.rhino;
  const r = new FaunaRig(d, { neck: 0.2, headPitch: 0.18, heavy: 0.7, feet: 0x5a5752 });
  r.muzzle.scale.set(1.5, 1.05, 1);
  const fold = 0x6f6c66, horn = 0xb4aa96;
  const H = d.headH, L = d.headL;
  deco(r.bodyG, 'rhino-body', (parts) => {
    // Skulderpukkel, kraftig lend og hudfolder
    parts.push(box(d.width * 0.8, 0.2, d.len * 0.32, d.color, { y: d.bodyH / 2 + 0.03, z: d.len * 0.2 }));
    parts.push(box(d.width * 0.86, 0.12, d.len * 0.3, d.color, { y: d.bodyH / 2, z: -d.len * 0.28 }));
    parts.push(box(d.width + 0.03, d.bodyH * 0.9, 0.05, fold, { y: 0.02, z: d.len / 2 - 0.4 }));
    parts.push(box(d.width + 0.03, d.bodyH * 0.9, 0.05, fold, { y: 0.02, z: -d.len / 2 + 0.5 }));
    parts.push(box(d.width + 0.06, d.bodyH * 0.55, d.len * 0.5, d.color, { y: -0.08, z: 0 }));
  }, true);
  deco(r.neck, 'rhino-neck', (parts) => {
    const nb = neckBox(d);
    parts.push(box(nb.w + 0.04, nb.h + 0.04, 0.05, fold, { z: 0.06 }));
  });
  deco(r.head, 'rhino-head', (parts) => {
    // To horn: et stort framme på snuten og et mindre bak
    const my = -H * 0.15 + H * 0.3 * 1.05;
    rod(parts, [0, my - 0.02, L * 0.8], [0, my + 0.6, L * 0.8 + 0.16], 0.13, 0, 6, horn);
    rod(parts, [0, H / 2 - 0.02, L * 0.42], [0, H / 2 + 0.3, L * 0.42 + 0.05], 0.095, 0, 6, horn);
    // Rørformede ører
    for (const s of [-1, 1]) rod(parts, [s * H * 0.36, H * 0.42, -L * 0.04], [s * H * 0.5, H * 0.42 + 0.17, -L * 0.07], 0.045, 0.04, 6, d.color);
    eyes(parts, d, 0x1a1816, 0.55, 0.05, 0.42);
  }, true);
  for (const leg of r.legs) deco(leg, 'rhino-leg', (parts) => parts.push(box(d.legW + 0.02, 0.03, d.legW * 1.1 + 0.02, fold, { y: -d.legLen * 0.45 })));
  r.makeTail('rhino', [
    { l: 0.36, w: 0.05, pitch: -1.4, run: -0.9, color: d.color, extra: (parts) => parts.push(box(0.07, 0.07, 0.1, 0x3a3836, { z: -0.36 })) },
  ]);
  return r;
}

// ======================================================================
// Elefant: snabel med ledd, ører som vifter, støttenner
// ======================================================================
class ElephantRig extends FaunaRig {
  constructor() {
    const d = DEFS.elephant;
    super(d, { neck: -0.22, heavy: 0.85, feet: 0x77736e });
    const H = d.headH, L = d.headL;
    const ivory = 0xefe8d6, wr = 0x7a7672;
    this.head.remove(this.muzzle, this.noseTip);
    deco(this.bodyG, 'elephant-body', (parts) => {
      // Høye skuldre, svai rygg og runde sider
      parts.push(box(d.width * 0.86, 0.26, d.len * 0.34, d.color, { y: d.bodyH / 2 + 0.06, z: d.len * 0.25 }));
      parts.push(box(d.width * 0.84, 0.2, d.len * 0.3, d.color, { y: d.bodyH / 2 + 0.03, z: -d.len * 0.27 }));
      parts.push(box(d.width + 0.06, d.bodyH * 0.68, d.len * 0.74, d.color, { y: -0.08 }));
      for (const s of [-1, 1]) {
        for (let k = 0; k < 4; k++) flat(parts, s > 0 ? 'x+' : 'x-', s * (d.width / 2 + 0.03 + LIFT), -0.1, -0.7 + k * 0.45, 0.03, d.bodyH * 0.45, wr, 0.1 * (k - 1.5));
      }
    }, true);
    deco(this.head, 'elephant-head', (parts) => {
      parts.push(box(H * 0.86, 0.26, L * 0.55, d.color, { y: H * 0.58, z: L * 0.12 }));
      parts.push(box(H * 0.5, H * 0.42, 0.22, d.color, { y: -H * 0.18, z: L * 0.5 }));
      parts.push(box(H * 0.72, H * 0.3, L * 0.45, d.color, { y: -H * 0.5, z: L * 0.12 }));
      parts.push(box(0.2, 0.06, 0.1, 0x6a4a48, { y: -H * 0.62, z: L * 0.38 }));
      for (const s of [-1, 1]) {
        parts.push(box(0.06, 0.05, 0.09, 0x1c1814, { x: s * H * 0.53, y: H * 0.1, z: L * 0.3 }));
        // Støttenner: ned og fram, tuppen bøyer opp
        const A = [s * 0.21, -H * 0.38, L * 0.42], B2 = [s * 0.27, -H * 0.7, L * 0.74], C = [s * 0.3, -H * 0.8, L * 1.05], D = [s * 0.31, -H * 0.72, L * 1.27];
        rod(parts, A, B2, 0.075, 0.066, 6, ivory);
        rod(parts, B2, C, 0.066, 0.05, 6, ivory);
        rod(parts, C, D, 0.05, 0, 6, ivory);
      }
    }, true);
    // Store ører som henger bakover langs halsen
    this.ears = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(s * H * 0.5, H * 0.14, -L * 0.08);
      g.rotation.z = s * 0.12;
      this.head.add(g);
      deco(g, `elephant-ear${s}`, (parts) => {
        // Bred øvre del, smalere midtparti og en flik nederst (afrikansk elefant), mørk kant og lys innside
        const ec = 0x827d78, rim = 0x67635e, x = s * 0.03;
        parts.push(box(0.06, 0.75, 0.86, ec, { x, y: 0, z: -0.43 }));
        parts.push(box(0.06, 0.45, 0.7, ec, { x, y: -0.55, z: -0.39 }));
        parts.push(box(0.055, 0.42, 0.4, ec, { x, y: -0.92, z: -0.28 }));
        parts.push(box(0.068, 0.07, 0.84, rim, { x, y: 0.375, z: -0.43 }));
        parts.push(box(0.068, 0.8, 0.07, rim, { x, y: -0.02, z: -0.86 }));
        parts.push(box(0.068, 0.46, 0.07, rim, { x, y: -0.55, z: -0.73, rx: -0.25 }));
        parts.push(box(0.064, 0.07, 0.38, rim, { x, y: -1.12, z: -0.28 }));
        parts.push(box(0.012, 0.66, 0.74, 0xa48e88, { x: -s * 0.002, y: -0.02, z: -0.42 }));
        parts.push(box(0.012, 0.42, 0.56, 0xa48e88, { x: -s * 0.002, y: -0.55, z: -0.38 }));
      }, true);
      this.ears.push({ g, s });
    }
    // Snabel: sju ledd som henger fra snuten
    this.trunk = [];
    const n = 7, SL = 0.3;
    let parent = this.head;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      if (i === 0) g.position.set(0, -H * 0.3, L * 0.5);
      else g.position.y = -SL;
      parent.add(g);
      const w = lerp(0.34, 0.11, i / (n - 1));
      deco(g, `elephant-trunk${i}`, (parts) => {
        parts.push(box(w, SL + w * 0.4, w * 0.9, d.color, { y: -SL / 2 + w * 0.2 }));
        parts.push(box(w + 0.016, 0.025, w * 0.9 + 0.016, wr, { y: -SL * 0.35 }));
        parts.push(box(w + 0.016, 0.025, w * 0.9 + 0.016, wr, { y: -SL * 0.72 }));
        if (i === n - 1) parts.push(box(w * 0.9, 0.06, w * 0.8, 0x6a6662, { y: -SL - 0.01 }));
      }, true);
      this.trunk.push(g);
      parent = g;
    }
    // Hvilestilling, beite (ned mot bakken / krøllet opp mot munnen) og trompetstøt
    this.poseRest = [-0.25, 0.06, 0.08, 0.08, 0.06, -0.18, -0.35];
    this.poseDown = [-0.12, 0.02, 0.02, 0.02, 0.0, -0.08, -0.25];
    this.poseCurl = [0.0, 0.35, 0.45, 0.5, 0.55, 0.6, 0.6];
    this.poseUp = [-1.15, -0.38, -0.32, -0.26, -0.2, -0.1, 0.2];
    this.trunk.forEach((g, i) => { g.rotation.x = this.poseRest[i]; });
    for (const e of this.ears) e.g.rotation.y = -e.s * 0.75;
    for (const leg of this.legs) {
      deco(leg, 'elephant-leg', (parts) => {
        parts.push(box(d.legW + 0.02, 0.025, d.legW * 1.1 + 0.02, wr, { y: -d.legLen * 0.48 }));
        parts.push(box(d.legW + 0.02, 0.025, d.legW * 1.1 + 0.02, wr, { y: -d.legLen * 0.54 }));
        parts.push(box(d.legW * 1.12, 0.12, d.legW * 1.22, d.color, { y: -d.legLen + 0.1 }));
        for (let k = -1; k <= 1; k++) parts.push(box(0.08, 0.06, 0.03, 0xd8d0be, { x: k * 0.14, y: -d.legLen + 0.07, z: d.legW * 0.61 + 0.01 }));
      });
    }
    this.makeTail('elephant', [
      { l: 0.6, w: 0.07, pitch: -1.35, run: -1.1, color: d.color, sway: 0.12 },
      { l: 0.45, w: 0.05, pitch: 0.05, color: d.color, sway: 0.15, extra: (parts) => parts.push(box(0.1, 0.1, 0.18, 0x2a2622, { z: -0.47 })) },
    ]);
    this.neckX = this.neckBase;
  }

  update(dt, speed, state) {
    super.update(dt, speed, state);
    const t = this.t;
    // Elefanten bøyer ikke hodet ned mot bakken – snabelen gjør jobben
    const excited = state === 'happy' || state === 'attack';
    let neckT = this.neckBase + Math.sin(t * 0.7) * 0.03;
    if (state === 'eat') neckT = this.neckBase + 0.12;
    if (excited) neckT = this.neckBase - 0.12 + Math.sin(t * 5) * 0.05;
    this.neckX = damp(this.neckX, neckT, 5, dt);
    this.neck.rotation.x = this.neckX;
    // Snabelen
    const walk = clamp(speed / 3, 0, 1);
    const k = 0.5 - 0.5 * Math.cos(t * 1.6);
    for (let i = 0; i < this.trunk.length; i++) {
      let target;
      if (state === 'eat') target = lerp(this.poseDown[i], this.poseCurl[i], k);
      else if (excited) target = this.poseUp[i] + Math.sin(t * 6 - i * 0.6) * 0.06;
      else target = this.poseRest[i] + Math.sin(t * (1.1 + walk * 2) - i * 0.5) * (0.04 + walk * 0.05);
      const g = this.trunk[i];
      g.rotation.x = damp(g.rotation.x, target, 4, dt);
      g.rotation.z = Math.sin(t * (0.9 + walk * 1.5) - i * 0.45) * (0.03 + walk * 0.05) * (1 + i * 0.3);
    }
    // Ørene vifter
    const spread = excited ? 1.25 + Math.sin(t * 7) * 0.15 : 0.75 + Math.sin(t * 1.5) * 0.14 - walk * 0.12;
    for (const e of this.ears) e.g.rotation.y = damp(e.g.rotation.y, -e.s * spread, 6, dt);
  }
}

// ======================================================================
// Sjiraff: svært lang hals og lange bein, nettmønster, ossikoner
// ======================================================================
class GiraffeRig extends FaunaRig {
  constructor() {
    const d = DEFS.giraffe;
    super(d, { slope: 0.2, neck: -1.0, headPitch: 0.25, heavy: 0.6, feet: 0x2a2018 });
    const H = d.headH, L = d.headL;
    const P = [0x8b4a1e, 0x7a3f18, 0x965528];
    deco(this.bodyG, 'giraffe-body', (parts, rng) => {
      const b = bodyBox(d);
      reticulate(parts, rng, b, 'x+', 0.24, -0.48, 0.48, -0.3, 0.48, P);
      reticulate(parts, rng, b, 'x-', 0.24, -0.48, 0.48, -0.3, 0.48, P);
      reticulate(parts, rng, b, 'y+', 0.24, -0.48, 0.48, -0.45, 0.45, P);
      reticulate(parts, rng, b, 'z+', 0.22, -0.45, 0.45, -0.2, 0.45, P);
      reticulate(parts, rng, b, 'z-', 0.22, -0.45, 0.45, -0.2, 0.45, P);
    });
    deco(this.neck, 'giraffe-neck', (parts, rng) => {
      const nb = neckBox(d);
      for (const f of ['x+', 'x-', 'y+', 'y-']) reticulate(parts, rng, nb, f, 0.24, -0.47, 0.47, -0.42, 0.42, P);
      // Tykkere halsrot
      const root = { w: nb.w * 1.35, h: nb.h * 1.45, l: 0.62, x: 0, y: -nb.h * 0.08, z: 0.31 };
      parts.push(box(root.w, root.h, root.l, d.color, { y: root.y, z: root.z }));
      for (const f of ['x+', 'x-', 'y+', 'y-']) reticulate(parts, rng, root, f, 0.22, -0.4, 0.45, -0.42, 0.42, P);
      // Kort, mørk man langs nakken
      parts.push(box(0.05, 0.09, d.neck * 0.92, 0x5a3418, { y: nb.h / 2 + 0.04, z: d.neck * 0.48 }));
    });
    deco(this.head, 'giraffe-head', (parts) => {
      for (const s of [-1, 1]) {
        // Ossikoner med mørke dusker
        rod(parts, [s * 0.06, H * 0.4, -L * 0.04], [s * 0.08, H * 0.4 + 0.2, -L * 0.08], 0.032, 0.028, 5, 0xb07a40);
        parts.push(box(0.06, 0.05, 0.06, 0x2a1e18, { x: s * 0.08, y: H * 0.4 + 0.21, z: -L * 0.08 }));
        // Ører ut til siden
        rod(parts, [s * 0.12, H * 0.25, -L * 0.06], [s * 0.27, H * 0.38, -L * 0.1], 0.035, 0.016, 4, d.color);
        parts.push(box(0.055, 0.05, 0.07, 0x1a120e, { x: s * (H * 0.525 - 0.005), y: H * 0.2, z: L * 0.32 }));
      }
      parts.push(box(0.06, 0.05, 0.08, 0xb07a40, { y: H / 2 + 0.02, z: L * 0.3 }));
    }, true);
    for (const leg of this.legs) {
      deco(leg, 'giraffe-leg', (parts, rng) => {
        const lb = legBox(d);
        for (const f of ['x+', 'x-', 'z+', 'z-']) reticulate(parts, rng, lb, f, 0.17, -0.42, 0.42, 0.02, 0.48, P);
        parts.push(box(d.legW + 0.012, d.legLen * 0.4, d.legW * 1.1 + 0.012, 0xf2eadc, { y: -d.legLen + 0.06 + d.legLen * 0.2 }));
      });
    }
    this.makeTail('giraffe', [
      { l: 0.75, w: 0.045, pitch: -1.3, run: -0.9, color: d.color, sway: 0.15, extra: (parts) => parts.push(box(0.09, 0.09, 0.28, 0x1e1612, { z: -0.76 })) },
    ]);
    this.neckX = this.neckBase;
    this.headRest = this.head.rotation.x;
  }

  update(dt, speed, state) {
    super.update(dt, speed, state);
    // Egen halsstyring: sjiraffen beiter høyt (halsen litt fram), nikker når den går og «slår» med halsen ved angrep
    const t = this.t;
    let neckT = this.neckBase + Math.sin(t * 0.8) * 0.05;
    if (speed > 0.1) neckT = this.neckBase + 0.08 + Math.sin(this.phase) * 0.05 * clamp(speed / 3, 0, 1);
    if (state === 'eat') neckT = this.neckBase + 0.32 + Math.sin(t * 0.9) * 0.05;
    if (this.attackT >= 0) neckT = this.neckBase + Math.sin(Math.min(1, this.attackT) * Math.PI) * 0.6;
    this.neckX = damp(this.neckX, neckT, 6, dt);
    this.neck.rotation.x = this.neckX;
    const headT = this.headRest + (state === 'eat' ? -0.25 + Math.sin(t * 5) * 0.1 : 0);
    this.head.rotation.x = damp(this.head.rotation.x, headT, 6, dt);
  }
}

// ======================================================================
// Steinbukk
// ======================================================================
function ibexRig() {
  const d = DEFS.ibex;
  const r = new FaunaRig(d, { neck: -0.65, headPitch: 0.2, feet: 0x2a2018 });
  r.muzzle.material = lambert(0xa89474);
  const darkC = 0x3a2e22, hornC = 0x5e5040, knot = 0x7c6c58;
  r.tail.children[0].material = lambert(darkC);
  const H = d.headH, L = d.headL;
  deco(r.bodyG, 'ibex-body', (parts) => {
    const b = bodyBox(d);
    for (const f of ['x+', 'x-']) patch(parts, b, f, 0, -0.26, d.len * 0.8, 0.07, 0x5a4632);
    patch(parts, b, 'z+', 0, -0.08, d.width * 0.7, d.bodyH * 0.6, 0x4a3a2a);
    flat(parts, 'y+', 0, d.bodyH / 2 + LIFT, 0, d.len * 0.85, 0.05, 0x5a4632);
  });
  deco(r.head, 'ibex-head', (parts) => {
    // Store, bakoverbøyde horn med tverrknuter
    for (const s of [-1, 1]) {
      let p = [s * 0.055, H * 0.42, L * 0.02];
      let th = 0.12;
      const n = 8, segL = 0.12;
      for (let i = 0; i < n; i++) {
        const dl = Math.hypot(0.13, 1);
        const dir = [(s * 0.13) / dl, Math.cos(th) / dl, -Math.sin(th) / dl];
        const q = [p[0] + dir[0] * segL, p[1] + dir[1] * segL, p[2] + dir[2] * segL];
        const r0 = lerp(0.042, 0.014, i / n), r1 = lerp(0.042, 0.014, (i + 1) / n);
        rod(parts, p, q, r0, i === n - 1 ? 0 : r1, 5, hornC);
        if (i < n - 1) {
          const k0 = [p[0] + dir[0] * segL * 0.45, p[1] + dir[1] * segL * 0.45, p[2] + dir[2] * segL * 0.45];
          const k1 = [p[0] + dir[0] * segL * 0.6, p[1] + dir[1] * segL * 0.6, p[2] + dir[2] * segL * 0.6];
          rod(parts, k0, k1, r0 * 1.25, r0 * 1.2, 5, knot);
        }
        p = q;
        th += 0.31;
      }
    }
    // Skjegg
    parts.push(box(0.045, 0.11, 0.05, darkC, { y: -H * 0.62, z: L * 0.6 }));
    eyes(parts, d, 0x1a120c, 0.8, 0.25, 0.42);
  }, true);
  for (const leg of r.legs) deco(leg, 'ibex-leg', (parts) => patch(parts, legBox(d), 'z+', 0, 0.02, d.legW * 0.7, d.legLen * 0.8, darkC));
  return r;
}

// ======================================================================
// Artsregister
// ======================================================================
// length: lengde fra snute til bakende uten hale (m) – ekstra felt, f.eks. til å skalere dyr i bur
const land = (name, definite, article, height, radius, length, createRig, extra = {}) => ({
  name, definite, article, height, radius, length, habitat: 'land', stats: null, createRig, ...extra,
});

export const SPECIES = {
  // Rovdyr
  jaguar: land('jaguar', 'jaguaren', 'en', 1.2, 0.72, 2.0, jaguarRig, {
    stats: { name: 'jaguar', hp: 90, damage: 16, speed: 2.6, runSpeed: 11, reach: 1.9, cooldown: 1.0, sight: 0.9 },
  }),
  boar: land('villsvin', 'villsvinet', 'et', 1.1, 0.62, 2.0, boarRig, {
    stats: { name: 'villsvin', hp: 80, damage: 11, speed: 2.4, runSpeed: 8.5, reach: 1.6, cooldown: 0.9, sight: 0.6 },
  }),
  lion: land('løve', 'løven', 'en', 1.7, 0.9, 2.4, lionRig, {
    stats: { name: 'løve', hp: 140, damage: 20, speed: 2.4, runSpeed: 10, reach: 2.2, cooldown: 1.2, sight: 0.85 },
  }),
  hyena: land('hyene', 'hyenen', 'en', 1.35, 0.6, 1.85, hyenaRig, {
    stats: { name: 'hyene', hp: 60, damage: 9, speed: 2.8, runSpeed: 9.5, reach: 1.7, cooldown: 0.8, sight: 0.85 },
    pack: [2, 3],
  }),
  snowleopard: land('snøleopard', 'snøleoparden', 'en', 1.05, 0.65, 1.7, snowleopardRig, {
    stats: { name: 'snøleopard', hp: 90, damage: 15, speed: 2.6, runSpeed: 11, reach: 1.8, cooldown: 1.0, sight: 0.9 },
  }),
  dog: land('vakthund', 'vakthunden', 'en', 1.2, 0.5, 1.65, dogRig, {
    stats: { name: 'vakthund', hp: 55, damage: 8, speed: 3.0, runSpeed: 10, reach: 1.6, cooldown: 0.75, sight: 0.95 },
    pack: [1, 2],
  }),
  // Vennlige dyr (og dyr i bur)
  tapir: land('tapir', 'tapiren', 'en', 1.25, 0.85, 2.6, tapirRig),
  capybara: land('kapybara', 'kapybaraen', 'en', 0.8, 0.5, 1.6, capybaraRig),
  zebra: land('sebra', 'sebraen', 'en', 1.9, 0.75, 2.45, zebraRig),
  rhino: land('neshorn', 'neshornet', 'et', 1.9, 1.2, 3.6, rhinoRig),
  elephant: land('elefant', 'elefanten', 'en', 3.3, 1.6, 4.5, () => new ElephantRig()),
  giraffe: land('sjiraff', 'sjiraffen', 'en', 4.9, 0.85, 3.2, () => new GiraffeRig()),
  ibex: land('steinbukk', 'steinbukken', 'en', 1.8, 0.6, 1.85, ibexRig),
  cat: land('katt', 'katten', 'en', 0.45, 0.25, 0.6, () => catRig()),
};
