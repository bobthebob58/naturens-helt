// Hjelpefunksjoner for å bygge lavpolygon-modeller av primitive former med vertex-farger.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Gjør geometrien ikke-indeksert, fjerner UV og fyller inn én farge. */
export function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  _c.set(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Flytt/roter/skaler en geometri. */
export function xf(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, s = 1 } = {}) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx * s, sy * s, sz * s);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

/** Slå sammen fargede, ikke-indekserte geometrier til én. */
export function merge(geos) {
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, n * 3), o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nor.set(g.attributes.normal.array.subarray(0, n * 3), o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array.subarray(0, n * 3), o * 3);
    else col.fill(1, o * 3, (o + n) * 3);
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/** Forskyv hjørner tilfeldig (konsistent for like posisjoner), og gi flat skyggelegging. */
export function jitter(geo, amount, seed = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719 + seed) * 43758.5453;
    const r1 = k - Math.floor(k);
    const k2 = Math.sin(k) * 15731.7;
    const r2 = k2 - Math.floor(k2);
    const k3 = Math.sin(k2) * 9173.3;
    const r3 = k3 - Math.floor(k3);
    p.setXYZ(i, x + (r1 - 0.5) * amount, y + (r2 - 0.5) * amount, z + (r3 - 0.5) * amount);
  }
  g.computeVertexNormals();
  return g;
}

/** Variér fargen litt per hjørne for et mer naturlig utseende. */
export function shadeVariation(geo, amount = 0.08, seed = 0) {
  const c = geo.attributes.color;
  for (let i = 0; i < c.count; i += 3) {
    const k = Math.sin((i + seed) * 91.7) * 4375.5;
    const f = 1 + (k - Math.floor(k) - 0.5) * amount * 2;
    for (let j = 0; j < 3 && i + j < c.count; j++) {
      c.setXYZ(i + j, c.getX(i + j) * f, c.getY(i + j) * f, c.getZ(i + j) * f);
    }
  }
  return geo;
}

// Kortformer
export const box = (w, h, d, color, t) => xf(paint(new THREE.BoxGeometry(w, h, d), color), t);
export const cyl = (rt, rb, h, seg, color, t) => xf(paint(new THREE.CylinderGeometry(rt, rb, h, seg), color), t);
export const cone = (r, h, seg, color, t) => xf(paint(new THREE.ConeGeometry(r, h, seg), color), t);
export const sphere = (r, ws, hs, color, t) => xf(paint(new THREE.SphereGeometry(r, ws, hs), color), t);
export const ico = (r, detail, color, t) => xf(paint(new THREE.IcosahedronGeometry(r, detail), color), t);

// Delte materialer
const matCache = new Map();
export function lambert(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}

export const vertexMat = new THREE.MeshLambertMaterial({ vertexColors: true });

/** Lag en mesh fra geometri med vertex-farger. */
export function vmesh(geo, { cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, vertexMat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Lag en mesh av en enkelt boks med eget materiale, med pivot øverst (for lemmer). */
export function limb(w, h, d, color, pivotTop = true) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (pivotTop) g.translate(0, -h / 2, 0);
  const m = new THREE.Mesh(g, lambert(color));
  m.castShadow = true;
  return m;
}

// ---------- Tekst/ikon-sprites ----------
const spriteCache = new Map();
export function iconTexture(text, bg, fg = '#fff', size = 128) {
  const key = text + bg + fg + size;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = size * 0.06;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.stroke();
  }
  ctx.fillStyle = fg;
  ctx.font = `bold ${Math.floor(size * 0.6)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  spriteCache.set(key, tex);
  return tex;
}

export function makeIconSprite(text, bg, fg, scale = 0.8) {
  const mat = new THREE.SpriteMaterial({ map: iconTexture(text, bg, fg), depthTest: true, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale, scale);
  s.renderOrder = 10;
  return s;
}

/** Myk, rund glød-tekstur (gnister, glimt, røyk). */
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
