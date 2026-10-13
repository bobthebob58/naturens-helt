// Enkelt partikkelsystem (støv, sprut, røyk, gnister, mynt-glimt). Ingen blod!
import * as THREE from 'three';

const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
  vAlpha = aAlpha;
  vColor = aColor;
}`;

const FRAG = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}`;

class ParticlePool {
  constructor(scene, max, additive) {
    this.max = max;
    this.count = 0;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.c = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(max), 1);
    for (const a of [this.aPos, this.aCol, this.aSize, this.aAlpha]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('aColor', this.aCol);
    this.geo.setAttribute('aSize', this.aSize);
    this.geo.setAttribute('aAlpha', this.aAlpha);
    this.uniforms = { uScale: { value: 400 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(x, y, z, o) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    const sp = o.speed * (0.5 + Math.random() * 0.5);
    let dx = (Math.random() - 0.5) * 2, dy = Math.random() * (o.up ?? 1), dz = (Math.random() - 0.5) * 2;
    if (o.dir) {
      dx = o.dir.x + dx * (o.spread ?? 0.4);
      dy = o.dir.y + dy * (o.spread ?? 0.4);
      dz = o.dir.z + dz * (o.spread ?? 0.4);
    }
    const l = Math.hypot(dx, dy, dz) || 1;
    this.v[i * 3] = (dx / l) * sp; this.v[i * 3 + 1] = (dy / l) * sp; this.v[i * 3 + 2] = (dz / l) * sp;
    const col = o.color;
    const cv = o.colorVar ?? 0.1;
    const f = 1 + (Math.random() - 0.5) * cv * 2;
    this.c[i * 3] = col.r * f; this.c[i * 3 + 1] = col.g * f; this.c[i * 3 + 2] = col.b * f;
    this.maxLife[i] = this.life[i] = o.life * (0.7 + Math.random() * 0.6);
    this.size0[i] = o.size;
    this.size1[i] = o.sizeEnd ?? o.size;
    this.alpha0[i] = o.alpha ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 1;
  }

  update(dt) {
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      if (n !== i) {
        for (let k = 0; k < 3; k++) {
          this.p[n * 3 + k] = this.p[i * 3 + k];
          this.v[n * 3 + k] = this.v[i * 3 + k];
          this.c[n * 3 + k] = this.c[i * 3 + k];
        }
        this.life[n] = this.life[i];
        this.maxLife[n] = this.maxLife[i];
        this.size0[n] = this.size0[i];
        this.size1[n] = this.size1[i];
        this.alpha0[n] = this.alpha0[i];
        this.grav[n] = this.grav[i];
        this.drag[n] = this.drag[i];
      }
      const dr = Math.exp(-this.drag[n] * dt);
      this.v[n * 3] *= dr;
      this.v[n * 3 + 1] = this.v[n * 3 + 1] * dr - this.grav[n] * dt;
      this.v[n * 3 + 2] *= dr;
      this.p[n * 3] += this.v[n * 3] * dt;
      this.p[n * 3 + 1] += this.v[n * 3 + 1] * dt;
      this.p[n * 3 + 2] += this.v[n * 3 + 2] * dt;
      n++;
    }
    this.count = n;
    const ap = this.aPos.array, ac = this.aCol.array, as = this.aSize.array, aa = this.aAlpha.array;
    for (let i = 0; i < n; i++) {
      const t = 1 - this.life[i] / this.maxLife[i];
      ap[i * 3] = this.p[i * 3]; ap[i * 3 + 1] = this.p[i * 3 + 1]; ap[i * 3 + 2] = this.p[i * 3 + 2];
      ac[i * 3] = this.c[i * 3]; ac[i * 3 + 1] = this.c[i * 3 + 1]; ac[i * 3 + 2] = this.c[i * 3 + 2];
      as[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      aa[i] = this.alpha0[i] * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
    }
    this.geo.setDrawRange(0, n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }

  clear() {
    this.count = 0;
  }
}

const C = (hex) => new THREE.Color(hex);
const PRESETS = {
  dust: { color: C(0xb8a888), speed: 2.5, life: 0.9, size: 0.6, sizeEnd: 1.6, gravity: -0.3, drag: 2.5, alpha: 0.6 },
  snow: { color: C(0xffffff), speed: 2.5, life: 0.8, size: 0.5, sizeEnd: 1.2, gravity: 1, drag: 2, alpha: 0.8 },
  splash: { color: C(0xd8eef7), speed: 5, life: 0.8, size: 0.35, sizeEnd: 0.7, gravity: 12, drag: 0.6, alpha: 0.85, up: 3 },
  smoke: { color: C(0x8a8a8a), speed: 1.2, life: 2.2, size: 1.2, sizeEnd: 3.5, gravity: -1.2, drag: 0.8, alpha: 0.45 },
  poof: { color: C(0xe8e8e8), speed: 4, life: 1.1, size: 0.9, sizeEnd: 2.6, gravity: -0.6, drag: 2.2, alpha: 0.8 },
  spark: { color: C(0xffc04a), speed: 6, life: 0.35, size: 0.18, sizeEnd: 0.05, gravity: 6, drag: 1.5, alpha: 1, additive: true },
  coin: { color: C(0xffd84a), speed: 3.5, life: 0.9, size: 0.3, sizeEnd: 0.05, gravity: -1.5, drag: 1.5, alpha: 1, additive: true, up: 2 },
  heal: { color: C(0x7dff9a), speed: 1.5, life: 1.0, size: 0.35, sizeEnd: 0.05, gravity: -2, drag: 1, alpha: 1, additive: true },
  hearts: { color: C(0xff7aa8), speed: 1.6, life: 1.4, size: 0.4, sizeEnd: 0.1, gravity: -1.5, drag: 1, alpha: 1, additive: true, up: 2 },
  wake: { color: C(0xf2f8fb), speed: 1.2, life: 1.2, size: 0.6, sizeEnd: 1.8, gravity: 0, drag: 1.5, alpha: 0.6 },
  flash: { color: C(0xffe28a), speed: 0.5, life: 0.08, size: 0.9, sizeEnd: 0.3, gravity: 0, drag: 0, alpha: 1, additive: true },
  fire: { color: C(0xffa040), speed: 0.8, life: 0.7, size: 0.5, sizeEnd: 0.1, gravity: -2.5, drag: 1, alpha: 0.9, additive: true },
};

export class Particles {
  constructor(scene) {
    this.normal = new ParticlePool(scene, 2500, false);
    this.additive = new ParticlePool(scene, 1500, true);
  }
  setScale(s) {
    this.normal.uniforms.uScale.value = s;
    this.additive.uniforms.uScale.value = s;
  }
  burst(name, pos, count, overrides) {
    const o = overrides ? { ...PRESETS[name], ...overrides } : PRESETS[name];
    const pool = o.additive ? this.additive : this.normal;
    for (let i = 0; i < count; i++) pool.emit(pos.x, pos.y, pos.z, o);
  }
  update(dt) {
    this.normal.update(dt);
    this.additive.update(dt);
  }
  clear() {
    this.normal.clear();
    this.additive.clear();
  }
}
