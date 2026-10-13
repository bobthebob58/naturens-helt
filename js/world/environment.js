// Himmel, sol, tåke, vann og skyer.
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { createCloudGeometry } from '../models/props.js';

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
  col = mix(col, uGround, smoothstep(0.0, -0.2, h));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += vec3(1.0, 0.86, 0.62) * pow(s, 900.0) * 6.0;
  col += vec3(1.0, 0.8, 0.55) * pow(s, 10.0) * 0.18;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Flislagt normalkart for vannoverflaten (sum av sinusbølger). */
function makeWaterNormals() {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  const waves = [];
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    waves.push({ kx: Math.floor(rnd() * 9) - 4, ky: Math.floor(rnd() * 9) - 4, a: 0.4 + rnd(), ph: rnd() * 6.28 });
  }
  for (const w of waves) if (w.kx === 0 && w.ky === 0) w.kx = 3;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let dx = 0, dy = 0;
      for (const w of waves) {
        const ph = (2 * Math.PI * (w.kx * x + w.ky * y)) / N + w.ph;
        const c2 = Math.cos(ph) * w.a;
        dx += c2 * w.kx;
        dy += c2 * w.ky;
      }
      const nx = -dx * 0.05, ny = -dy * 0.05, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * N + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class Environment {
  constructor(scene, quality) {
    this.scene = scene;
    this.sunDir = new THREE.Vector3(0.45, 0.78, 0.35).normalize();
    this.horizon = new THREE.Color(0xc4dbe9);
    this.skyTop = new THREE.Color(0x3b7bc4);
    this.uwColor = new THREE.Color(0x1b5566);

    // Himmelkuppel
    this.skyUniforms = {
      uTop: { value: this.skyTop.clone() },
      uHorizon: { value: this.horizon.clone() },
      uGround: { value: new THREE.Color(0x9fb3bd) },
      uSunDir: { value: this.sunDir },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    // Lys
    this.hemi = new THREE.HemisphereLight(0xd6e8ff, 0x6a5a45, 1.15);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 500;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // Tåke
    scene.fog = new THREE.Fog(this.horizon.clone(), 60, 700);

    // Vann
    this.waterNormals = makeWaterNormals();
    const size = 6000;
    this.tile = 24;
    this.waterNormals.repeat.set(size / this.tile, size / this.tile);
    this.waterMat = new THREE.MeshPhongMaterial({
      color: 0x2a6a86, specular: 0x5f7f8c, shininess: 90, transparent: true, opacity: 0.82,
      normalMap: this.waterNormals, normalScale: new THREE.Vector2(0.22, 0.22), side: THREE.DoubleSide,
    });
    const wg = new THREE.PlaneGeometry(size, size, 1, 1);
    wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, this.waterMat);
    this.water.position.y = WORLD.waterLevel;
    this.water.renderOrder = 1;
    this.water.receiveShadow = true;
    scene.add(this.water);

    // Skyer
    this.clouds = [];
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a96a3, transparent: true, opacity: 0.93, fog: false });
    for (let k = 0; k < 2; k++) {
      const count = 16;
      const mesh = new THREE.InstancedMesh(createCloudGeometry(k * 3 + 2), cloudMat, count);
      mesh.frustumCulled = false;
      const data = [];
      for (let i = 0; i < count; i++) {
        data.push({ x: (Math.random() - 0.5) * 3000, z: (Math.random() - 0.5) * 3000, y: 210 + Math.random() * 90, s: 0.8 + Math.random() * 0.9, r: Math.random() * 6 });
      }
      this.clouds.push({ mesh, data });
      scene.add(mesh);
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this.setQuality(quality);
    this.underwater = false;
  }

  setQuality(q) {
    this.quality = q;
    this.sun.castShadow = q.shadows > 0;
    if (q.shadows > 0) {
      this.sun.shadow.mapSize.set(q.shadows, q.shadows);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    this.fogFar = q.viewRadius * WORLD.chunkSize * 0.92;
    this.fogNear = this.fogFar * 0.12;
  }

  /** Sett atmosfæren straks (ved oppstart/teleport) – ellers glir den mykt i update(). */
  snapAtmosphere(biome) {
    this._atmoInit = false;
    this.applyAtmosphere(biome, 1);
  }

  applyAtmosphere(biome, k) {
    const a = (biome && biome.atmosphere) || {};
    if (!this._atmo) {
      this._atmo = { fog: this.horizon.clone(), water: new THREE.Color(0x2a6a86), top: this.skyTop.clone(), scale: 1 };
      this._tc = new THREE.Color();
    }
    const A = this._atmo;
    if (!this._atmoInit) { k = 1; this._atmoInit = true; }
    A.fog.lerp(this._tc.set(a.fog ?? 0xc4dbe9), k);
    A.water.lerp(this._tc.set(a.water ?? 0x2a6a86), k);
    A.top.lerp(this._tc.set(a.sky ?? 0x3b7bc4), k);
    A.scale += ((a.fogScale ?? 1) - A.scale) * k;
    this.skyUniforms.uHorizon.value.copy(A.fog);
    this.skyUniforms.uTop.value.copy(A.top);
    this.waterMat.color.copy(A.water);
  }

  update(dt, time, camera, focus, groundAtCam, biome = null) {
    this.applyAtmosphere(biome, 1 - Math.exp(-dt * 0.7));
    this.sky.position.copy(camera.position);
    // Sol og skygge følger spilleren
    const fx = Math.round(focus.x), fz = Math.round(focus.z);
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + this.sunDir.x * 200, focus.y + this.sunDir.y * 200, fz + this.sunDir.z * 200);
    // Vannet følger kameraet (justert til flisstørrelsen for stabilt mønster)
    this.water.position.x = Math.round(camera.position.x / this.tile) * this.tile;
    this.water.position.z = Math.round(camera.position.z / this.tile) * this.tile;
    this.waterNormals.offset.set((time * 0.012) % 1, (time * 0.02) % 1);
    this.water.position.y = WORLD.waterLevel + Math.sin(time * 0.6) * 0.03;

    // Under vann?
    const uw = camera.position.y < WORLD.waterLevel - 0.05 && groundAtCam < WORLD.waterLevel;
    this.underwater = uw;
    const fog = this.scene.fog;
    if (uw) {
      fog.color.copy(this.uwColor);
      fog.near = 0.5;
      fog.far = 32;
    } else {
      fog.color.copy(this._atmo.fog);
      // Litt lengre sikt når man flyr høyt
      const alt = Math.max(0, camera.position.y - 60);
      const sc = this._atmo.scale;
      fog.near = this.fogNear * sc + alt * 0.5;
      fog.far = this.fogFar * Math.min(1, 0.35 + sc * 0.65) + alt * 1.2;
    }

    // Skyer driver med vinden
    const half = 1500;
    for (const c of this.clouds) {
      c.data.forEach((d, i) => {
        d.x += dt * 4;
        let x = d.x - camera.position.x, z = d.z - camera.position.z;
        x = ((x + half) % (2 * half) + 2 * half) % (2 * half) - half;
        z = ((z + half) % (2 * half) + 2 * half) % (2 * half) - half;
        this._v.set(camera.position.x + x, d.y, camera.position.z + z);
        this._q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, d.r);
        this._s.set(d.s * 1.4, d.s * 0.55, d.s);
        this._m.compose(this._v, this._q, this._s);
        c.mesh.setMatrixAt(i, this._m);
      });
      c.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
