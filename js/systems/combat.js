// Våpen og prosjektiler. Treff gir støv og gnister – aldri blod.
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { segmentSphere, clamp } from '../utils/math.js';

const WATER = WORLD.waterLevel;
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);

const templates = {};
function projectileMesh(kind) {
  if (!templates[kind]) templates[kind] = buildProjectile(kind);
  return templates[kind].clone();
}

function buildProjectile(kind) {
  const g = new THREE.Group();
  if (kind === 'stone') {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshLambertMaterial({ color: 0x8a8580 }));
    g.add(m);
  } else if (kind === 'arrow') {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.75), new THREE.MeshLambertMaterial({ color: 0x8a6a3a }));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), new THREE.MeshLambertMaterial({ color: 0x777777 }));
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.42;
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.005, 0.12), new THREE.MeshLambertMaterial({ color: 0xd04040 }));
    fl.position.z = -0.32;
    g.add(shaft, tip, fl);
  } else {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    body.rotation.x = Math.PI / 2;
    const fluff = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 6), new THREE.MeshBasicMaterial({ color: 0xff4fa0 }));
    fluff.rotation.x = -Math.PI / 2;
    fluff.position.z = -0.1;
    g.add(body, fluff);
  }
  return g;
}

export class Combat {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.tracers = [];
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  }

  reset() {
    for (const p of this.projectiles) this.game.scene.remove(p.mesh);
    for (const t of this.tracers) this.game.scene.remove(t.line);
    this.projectiles = [];
    this.tracers = [];
  }

  /** Punktet spilleren sikter på (midt i skjermen). */
  aimPoint(out) {
    const cam = this.game.camera;
    cam.getWorldPosition(_o);
    cam.getWorldDirection(_d);
    let best = 200;
    const t = this.game.gen.raycast(_o, _d, 200);
    if (t > 0) best = t;
    for (const e of this.game.entities.hittables()) {
      e.hitCenter(_c);
      const far = _prev.copy(_o).addScaledVector(_d, best);
      const ht = segmentSphere(_o, far, _c, e.hitRadius);
      if (ht >= 0 && ht * best < best) best = ht * best;
    }
    return out.copy(_o).addScaledVector(_d, Math.max(3, best));
  }

  fireProjectile(player, w) {
    const g = this.game;
    const aim = this.aimPoint(new THREE.Vector3());
    const origin = new THREE.Vector3();
    const cam = g.camera;
    if (player.cameraMode === 'first') {
      cam.getWorldPosition(origin);
      cam.getWorldDirection(_d);
      origin.addScaledVector(_d, 0.4);
      origin.y -= 0.12;
    } else {
      const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
      origin.set(player.pos.x + rx * 0.3, player.pos.y + (player.crouch ? 1.0 : 1.45), player.pos.z + rz * 0.3);
    }
    const dir = aim.clone().sub(origin);
    const dist = dir.length();
    dir.normalize();
    // Kompenser litt for fallet slik at prosjektilet treffer siktepunktet
    const tFlight = dist / w.speed;
    const vel = dir.multiplyScalar(w.speed);
    vel.y += 0.5 * w.gravity * tFlight;
    const mesh = projectileMesh(w.projectile);
    mesh.position.copy(origin);
    g.scene.add(mesh);
    this.projectiles.push({ mesh, pos: origin, vel, grav: w.gravity, dmg: w.damage, life: 4, kind: w.projectile, wet: false });
    if (w.projectile === 'stone') g.audio.twang();
    else if (w.projectile === 'arrow') g.audio.twang();
    else g.audio.dartShot();
  }

  melee(player, w) {
    const g = this.game;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    let hitAny = false;
    for (const e of g.entities.hittables()) {
      e.hitCenter(_c);
      const dx = _c.x - player.pos.x, dz = _c.z - player.pos.z;
      const dy = _c.y - (player.pos.y + 1.0);
      const d = Math.hypot(dx, dz);
      if (d > w.range + e.hitRadius * 0.6 || Math.abs(dy) > 2.2) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < 0.35 && d > 1.0) continue;
      const sneak = player.crouch && e.isUnaware && e.isUnaware();
      e.takeHit(w.damage * (sneak ? 2 : 1), { sneak, melee: true, from: player.pos });
      g.particles.burst('spark', _c, 8);
      g.particles.burst('dust', _c, 4, { speed: 1.5 });
      hitAny = true;
    }
    if (hitAny) g.audio.hit();
  }

  /** Synlig skuddsporing fra en krypskytter. */
  enemyShot(from, to, shooterDist) {
    const g = this.game;
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geo, this.tracerMat.clone());
    g.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
    g.particles.burst('flash', from, 3);
    g.particles.burst('smoke', from, 2, { size: 0.4, sizeEnd: 1.2, life: 0.8 });
    g.audio.shot(shooterDist);
    // Treffer bakken/trær bak spilleren
    g.particles.burst('dust', to, 4, { speed: 1.5 });
  }

  update(dt) {
    const g = this.game;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = clamp(t.life / 0.09, 0, 1);
      if (t.life <= 0) {
        g.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    const targets = g.entities.hittables();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      _prev.copy(p.pos);
      p.vel.y -= p.grav * dt;
      p.pos.addScaledVector(p.vel, dt);
      let done = p.life <= 0;
      // Treff på mål
      let bestT = 2, bestE = null;
      for (const e of targets) {
        e.hitCenter(_c);
        const t = segmentSphere(_prev, p.pos, _c, e.hitRadius);
        if (t >= 0 && t < bestT) {
          bestT = t;
          bestE = e;
        }
      }
      if (bestE) {
        const hp = _prev.clone().lerp(p.pos, bestT);
        const sneak = bestE.isUnaware && bestE.isUnaware() && g.player.crouch;
        bestE.takeHit(p.dmg * (sneak ? 1.5 : 1), { sneak, from: g.player.pos, ranged: true });
        g.particles.burst('spark', hp, 6);
        g.audio.hit();
        done = true;
      }
      // Vann
      if (!done && !p.wet && p.pos.y < WATER && _prev.y >= WATER) {
        p.wet = true;
        p.vel.multiplyScalar(0.25);
        g.particles.burst('splash', p.pos, 6, { speed: 2.5 });
      }
      // Terreng
      if (!done) {
        const gh = g.gen.groundHeight(p.pos.x, p.pos.z);
        if (p.pos.y < gh) {
          p.pos.y = gh + 0.02;
          g.particles.burst('dust', p.pos, 5, { speed: 1.5 });
          done = true;
          if (p.kind === 'arrow') {
            p.stuck = 6;
          }
        }
      }
      if (!done) {
        // Hindringer (trær og steiner)
        const list = g.features.collidersNear(p.pos.x, p.pos.z, 0.1, this._tmp || (this._tmp = []));
        for (const c of list) {
          if (Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < c.r && p.pos.y < c.y + 6 * (c.r > 0.9 ? 0.25 : 1)) {
            g.particles.burst('dust', p.pos, 4, { speed: 1.2 });
            done = true;
            break;
          }
        }
      }
      if (p.vel.lengthSq() > 0.01) {
        _d.copy(p.vel).normalize();
        _q.setFromUnitVectors(_z, _d);
        p.mesh.quaternion.copy(_q);
      }
      p.mesh.position.copy(p.pos);
      if (done) {
        g.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
}
