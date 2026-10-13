// Strømming av terrengbiter rundt spilleren, med detaljnivå (LOD), vegetasjon og skattekister.
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { vegGeometry } from '../levels/models.js';
import { VEG_INFO } from '../levels/levels.js';
import { createChest } from '../models/props.js';

const CS = WORLD.chunkSize;
const CELL = WORLD.cell;
const CELLS = CS / CELL; // 32

/** Liten støytekstur som gir terrenget mikrodetaljer på nært hold. */
function makeDetailTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  // Flislagt verdistøy
  const grid = (n, seed) => {
    const g = new Float32Array(n * n);
    let s = seed;
    for (let i = 0; i < g.length; i++) {
      s = (s * 16807) % 2147483647;
      g[i] = s / 2147483647;
    }
    return (x, y) => {
      const fx = (x / size) * n, fy = (y / size) * n;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const a = g[(iy % n) * n + (ix % n)], b = g[(iy % n) * n + ((ix + 1) % n)];
      const cc = g[((iy + 1) % n) * n + (ix % n)], d = g[((iy + 1) % n) * n + ((ix + 1) % n)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
    };
  };
  const n1 = grid(8, 7), n2 = grid(32, 13), n3 = grid(128, 29);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = 0.82 + n1(x, y) * 0.07 + n2(x, y) * 0.07 + n3(x, y) * 0.06;
      const i = (y * size + x) * 4;
      const b = Math.min(255, v * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Legg til vind-svai i vegetasjonsmaterialer. */
function addWind(material, strength, minY, uniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ip = vec3(0.0);
      #endif
      float sway = max(0.0, position.y - ${minY.toFixed(2)}) * ${strength.toFixed(3)};
      transformed.x += sin(uTime * 1.4 + ip.x * 0.15 + ip.z * 0.07) * sway;
      transformed.z += cos(uTime * 1.1 + ip.z * 0.15) * sway * 0.6;`,
    );
  };
}

export class ChunkManager {
  constructor(scene, gen, features, quality) {
    this.scene = scene;
    this.gen = gen;
    this.features = features;
    this.chunks = new Map();
    this.quality = quality;
    this.windUniforms = { uTime: { value: 0 } };
    this.detailTex = makeDetailTexture();
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.detailTex });
    this.vegMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    addWind(this.vegMat, 0.022, 1.5, this.windUniforms);
    this.staticMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    addWind(this.grassMat, 0.16, 0.0, this.windUniforms);
    this.collected = new Set();
    this.lastCx = null;
    this.lastCz = null;
    this.jobs = [];
    this._n = [0, 0, 0];
    this._c = [0, 0, 0];
    this.chestMeshes = new Map(); // id -> {data, mesh, chunkKey}
  }

  setQuality(q) {
    this.quality = q;
    this.lastCx = null;
  }

  key(cx, cz) {
    return cx * 100000 + cz;
  }

  lodFor(d) {
    if (d <= 1.5) return 32;
    if (d <= 3.5) return 16;
    return 8;
  }

  update(px, pz, time, budgetMs = 5) {
    this.windUniforms.uTime.value = time;
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    if (pcx !== this.lastCx || pcz !== this.lastCz) {
      this.lastCx = pcx;
      this.lastCz = pcz;
      this._plan(pcx, pcz);
    }
    const start = performance.now();
    while (this.jobs.length && performance.now() - start < budgetMs) {
      const job = this.jobs.shift();
      this._runJob(job);
    }
  }

  /** Bygg alt rundt et punkt med en gang (ved oppstart). */
  buildAllNow(px, pz) {
    this.lastCx = null;
    this.update(px, pz, 0, 0);
    while (this.jobs.length) this._runJob(this.jobs.shift());
  }

  _plan(pcx, pcz) {
    const R = this.quality.viewRadius;
    const VR = this.quality.vegRadius;
    const GR = this.quality.grassRadius;
    const half = this.gen.half;
    const wanted = new Set();
    const jobs = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > R + 0.5) continue;
        const cx = pcx + dx, cz = pcz + dz;
        if (cx * CS >= half + CS || (cx + 1) * CS <= -half - CS || cz * CS >= half + CS || (cz + 1) * CS <= -half - CS) continue;
        const k = this.key(cx, cz);
        wanted.add(k);
        const cheb = Math.max(Math.abs(dx), Math.abs(dz));
        const res = this.lodFor(d);
        const veg = cheb <= VR;
        const grass = cheb <= GR;
        const ch = this.chunks.get(k);
        if (!ch || ch.res !== res || !!ch.veg !== veg || !!ch.grass !== grass) {
          jobs.push({ cx, cz, k, res, veg, grass, pri: d });
        }
      }
    }
    for (const [k, ch] of this.chunks) {
      if (!wanted.has(k)) this._disposeChunk(ch);
    }
    jobs.sort((a, b) => a.pri - b.pri);
    this.jobs = jobs;
  }

  _runJob(job) {
    let ch = this.chunks.get(job.k);
    if (!ch) {
      ch = { cx: job.cx, cz: job.cz, k: job.k, res: 0, mesh: null, veg: null, grass: null, chests: [] };
      this.chunks.set(job.k, ch);
    }
    if (ch.res !== job.res) {
      if (ch.mesh) {
        this.scene.remove(ch.mesh);
        ch.mesh.geometry.dispose();
      }
      ch.mesh = this._buildTerrain(job.cx, job.cz, job.res);
      ch.res = job.res;
      this.scene.add(ch.mesh);
    }
    if (job.veg && !ch.veg) {
      ch.veg = this._buildVeg(job.cx, job.cz, false);
      this.scene.add(ch.veg);
      this._buildChests(ch);
    } else if (!job.veg && ch.veg) {
      this._disposeGroup(ch.veg);
      ch.veg = null;
      this._removeChests(ch);
    }
    if (job.grass && !ch.grass) {
      ch.grass = this._buildVeg(job.cx, job.cz, true);
      this.scene.add(ch.grass);
    } else if (!job.grass && ch.grass) {
      this._disposeGroup(ch.grass);
      ch.grass = null;
    }
  }

  _buildTerrain(cx, cz, res) {
    const gen = this.gen;
    const step = CELLS / res;
    const n = res + 1;
    const vCount = n * n + res * 4 * 2 + 8;
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    const col = new Float32Array(vCount * 3);
    const uv = new Float32Array(vCount * 2);
    const gx0 = cx * CELLS, gz0 = cz * CELLS;
    const x0 = cx * CS, z0 = cz * CS;
    const N = this._n, C = this._c;
    let v = 0;
    const put = (x, y, z, nx, ny, nz, r, g, b) => {
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz;
      col[v * 3] = r; col[v * 3 + 1] = g; col[v * 3 + 2] = b;
      uv[v * 2] = (x0 + x) / 7;
      uv[v * 2 + 1] = (z0 + z) / 7;
      return v++;
    };
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const gx = gx0 + i * step, gz = gz0 + j * step;
        const h = gen.gridHeight(gx, gz);
        gen.gridNormal(gx, gz, N);
        const wx = gx * CELL, wz = gz * CELL;
        gen.terrainColor(wx, wz, h, N[1], C);
        put(wx - x0, h, wz - z0, N[0], N[1], N[2], C[0], C[1], C[2]);
      }
    }
    const idx = [];
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    // Skjørt rundt kanten skjuler sprekker mellom ulike detaljnivåer
    const edge = (list) => {
      let prevTop = -1, prevBot = -1;
      for (const vi of list) {
        const bot = put(pos[vi * 3], pos[vi * 3 + 1] - 6, pos[vi * 3 + 2], nor[vi * 3], nor[vi * 3 + 1], nor[vi * 3 + 2], col[vi * 3], col[vi * 3 + 1], col[vi * 3 + 2]);
        if (prevTop >= 0) idx.push(prevTop, prevBot, vi, vi, prevBot, bot, prevTop, vi, prevBot, vi, bot, prevBot);
        prevTop = vi;
        prevBot = bot;
      }
    };
    const top = [], bottom = [], left = [], right = [];
    for (let i = 0; i < n; i++) {
      top.push(i);
      bottom.push(res * n + i);
      left.push(i * n);
      right.push(i * n + res);
    }
    edge(top); edge(bottom); edge(left); edge(right);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, v * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(0, v * 2), 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.terrainMat);
    m.position.set(x0, 0, z0);
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    return m;
  }

  _buildVeg(cx, cz, grassOnly) {
    const f = this.features.get(cx, cz);
    const list = grassOnly ? f.grass : f.items;
    const groups = new Map();
    for (const it of list) {
      if (!groups.has(it.type)) groups.set(it.type, []);
      groups.get(it.type).push(it);
    }
    const group = new THREE.Group();
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    let seed = cx * 31 + cz * 17;
    for (const [type, arr] of groups) {
      const info = VEG_INFO[type] || {};
      const mat = grassOnly || info.decor ? this.grassMat : info.static || info.box ? this.staticMat : this.vegMat;
      const mesh = new THREE.InstancedMesh(vegGeometry(type), mat, arr.length);
      arr.forEach((it, i) => {
        e.set(0, it.ry, 0);
        q.setFromEuler(e);
        p.set(it.x, it.y, it.z);
        s.setScalar(it.s);
        m4.compose(p, q, s);
        mesh.setMatrixAt(i, m4);
        seed = (seed * 9301 + 49297) % 233280;
        const v = info.box ? 0.94 + (seed / 233280) * 0.12 : 0.86 + (seed / 233280) * 0.24;
        col.setRGB(v, v, v);
        mesh.setColorAt(i, col);
      });
      mesh.castShadow = !grassOnly && !info.noShadow && !info.decor;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return group;
  }

  _buildChests(ch) {
    const f = this.features.get(ch.cx, ch.cz);
    for (const c of f.chests) {
      if (this.collected.has(c.id) || this.chestMeshes.has(c.id)) continue;
      const mesh = createChest(c.rare);
      mesh.position.set(c.x, c.y - 0.05, c.z);
      mesh.rotation.y = (c.x * 13.7 + c.z) % 6.28;
      this.scene.add(mesh);
      this.chestMeshes.set(c.id, { data: c, mesh, chunk: ch.k });
      ch.chests.push(c.id);
    }
  }

  _removeChests(ch) {
    for (const id of ch.chests) {
      const e = this.chestMeshes.get(id);
      if (e) {
        this.scene.remove(e.mesh);
        e.mesh.userData.glint.material.dispose();
        this.chestMeshes.delete(id);
      }
    }
    ch.chests = [];
  }

  collectChest(id) {
    this.collected.add(id);
    const e = this.chestMeshes.get(id);
    if (e) {
      this.scene.remove(e.mesh);
      e.mesh.userData.glint.material.dispose();
      this.chestMeshes.delete(id);
    }
  }

  /** Animer glimt på kister og finn nærmeste kiste. */
  updateChests(time, px, py, pz) {
    let best = null, bestD = 1e9;
    for (const [, e] of this.chestMeshes) {
      const dx = e.mesh.position.x - px, dz = e.mesh.position.z - pz, dy = e.mesh.position.y - py;
      const d = Math.sqrt(dx * dx + dz * dz + dy * dy * 0.5);
      const gl = e.mesh.userData.glint;
      const pulse = 0.5 + 0.5 * Math.sin(time * 3 + e.mesh.position.x);
      gl.material.opacity = d < 45 ? (0.25 + pulse * 0.6) * (1 - d / 45) : 0;
      gl.visible = gl.material.opacity > 0.01;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return { chest: best, dist: bestD };
  }

  _disposeGroup(g) {
    this.scene.remove(g);
    g.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
  }

  _disposeChunk(ch) {
    if (ch.mesh) {
      this.scene.remove(ch.mesh);
      ch.mesh.geometry.dispose();
    }
    if (ch.veg) this._disposeGroup(ch.veg);
    if (ch.grass) this._disposeGroup(ch.grass);
    this._removeChests(ch);
    this.chunks.delete(ch.k);
  }

  dispose() {
    for (const ch of [...this.chunks.values()]) this._disposeChunk(ch);
    this.jobs = [];
    this.lastCx = null;
  }
}
