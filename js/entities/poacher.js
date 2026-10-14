// Krypskytter-AI: patruljerer, blir mistenksom, angriper med gevær – og overgir seg når den stoppes.
import * as THREE from 'three';
import { ENEMIES } from '../config.js';
import { HumanRig } from '../models/characters.js';
import { perceive, AlertIcon, moveToward, snapToGround } from './ai.js';
import { clamp, dampAngle, mulberry32 } from '../utils/math.js';

const CFG = ENEMIES.poacher;
const _m = new THREE.Vector3();
const _t = new THREE.Vector3();

const LOOKS = [
  { shirt: 0x5b6b3a, pants: 0x4a4632, vest: 0x3e4a2a, hat: 'cap', hatColor: 0x3a3a2a, skin: 0xd9a77e, hair: 0x2a1a10 },
  { shirt: 0x6b5a3a, pants: 0x3e3e30, vest: 0x2e3a22, hat: 'beanie', hatColor: 0x2a2a2a, skin: 0xb98060, hair: 0x1a1a1a },
  { shirt: 0x4a5a32, pants: 0x5a4a32, vest: null, hat: 'hood', hatColor: 0x4a5236, skin: 0xe6b894, hair: 0x6a4a2a },
  { shirt: 0x3e4a2e, pants: 0x2e2e26, vest: 0x5b4a2a, hat: 'cap', hatColor: 0x6b4a2a, skin: 0x8d5a3c, hair: 0x111111 },
];

export class Poacher {
  constructor(game, data) {
    this.game = game;
    this.id = data.id;
    this.camp = data.camp;
    this.home = new THREE.Vector3(data.x, 0, data.z);
    this.homeRadius = data.homeRadius;
    const rng = mulberry32(data.seed);
    this.rng = rng;
    const look = LOOKS[Math.floor(rng() * LOOKS.length)];
    this.rig = new HumanRig({ ...look, rifle: true, shoes: 0x2a2018 });
    this.group = this.rig.root;
    game.scene.add(this.group);
    this.icon = new AlertIcon(this.group, 2.35);
    this.pos = new THREE.Vector3(data.x, 0, data.z);
    snapToGround(this, game, 0);
    this.heading = rng() * Math.PI * 2;
    this.hp = CFG.hp;
    this.state = 'patrol';
    this.awareness = 0;
    this.target = null;
    this.waitT = rng() * 3;
    this.fireT = 1.5;
    this.lostT = 0;
    this.searchT = 0;
    this.lastSeen = new THREE.Vector3();
    this.strafeDir = rng() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.curSpeed = 0;
    this.surrenderT = 0;
    this.removed = false;
    this.spotted = false;
    this.hitRadius = 0.6;
    this.t = rng() * 10;
    this.active = false;
  }

  get alive() {
    return this.state !== 'surrender' && this.state !== 'arrested';
  }

  /** Tilfeldig mål rundt et senter som ikke ligger inne i et hus, tre eller en stein. */
  freeTarget(g, center, radius, randomRadius) {
    for (let i = 0; i < 6; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = randomRadius ? this.rng() * radius : radius;
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      if (!g.features.blockedAt(x, z, 0.6)) return new THREE.Vector3(x, 0, z);
    }
    return this.home.clone();
  }

  isUnaware() {
    return this.state === 'patrol' || (this.state === 'suspicious' && this.awareness < 0.7) || this.state === 'search';
  }

  hitCenter(out) {
    return out.set(this.pos.x, this.pos.y + 1.15, this.pos.z);
  }

  alert(fromPos, silent = false) {
    if (!this.alive) return;
    const was = this.state;
    this.awareness = 1;
    this.state = 'alert';
    this.lostT = 0;
    if (fromPos) this.lastSeen.copy(fromPos);
    this.fireT = Math.max(this.fireT, 0.8 + this.rng() * 0.8);
    if (was !== 'alert' && !silent) {
      this.game.audio.alert();
      this.game.onDetected(this);
      // Varsle kamerater i nærheten
      for (const o of this.game.entities.poachers) {
        if (o !== this && o.alive && o.state !== 'alert' && o.pos.distanceTo(this.pos) < 60) o.alert(fromPos, true);
      }
    }
  }

  takeHit(dmg, opts = {}) {
    if (!this.alive) return;
    if (opts.sneak && opts.melee) {
      this.hp = 0;
      this.game.hud.notify('Snikangrep! Krypskytteren overgir seg.', 'good');
    } else {
      this.hp -= dmg;
    }
    this.game.hud.hitMarker();
    if (this.hp <= 0) {
      this.surrender();
      return;
    }
    this.alert(this.game.player.pos);
  }

  surrender() {
    this.state = 'surrender';
    this.surrenderT = 2.6;
    this.icon.set(0);
    this.game.audio.poof();
    this.game.hud.notify('Krypskytteren overgir seg! 🙌', 'good');
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const p = g.player;
    const distToPlayer = this.pos.distanceTo(p.pos);
    this.active = distToPlayer < 380 || this.state === 'alert';
    this.group.visible = distToPlayer < g.env.fogFar + 60;
    if (!this.active) return;

    if (this.state === 'surrender') {
      this.surrenderT -= dt;
      this.rig.update(dt, { speed: 0, pose: 'surrender' });
      this.group.position.copy(this.pos);
      if (this.surrenderT <= 0) {
        this.state = 'arrested';
        g.particles.burst('poof', _m.set(this.pos.x, this.pos.y + 1, this.pos.z), 35);
        g.scene.remove(this.group);
        this.removed = true;
        g.onPoacherStopped(this);
      }
      return;
    }
    if (this.state === 'arrested') return;

    const info = perceive(this, g, dt, { sightMult: 1, fov: 2.1, eyeH: 1.65 });
    if (info.seen && info.dist < 90) this.spotted = true;
    if (info.seen) this.lastSeen.copy(p.pos);

    let pose = 'stand';
    let speed = 0;
    switch (this.state) {
      case 'patrol': {
        if (this.awareness > 0.3) {
          this.state = 'suspicious';
          if (!info.seen) this.lastSeen.copy(p.pos);
          break;
        }
        if (this.waitT > 0) {
          this.waitT -= dt;
          this.curSpeed = 0;
          // Speid rundt mens han står stille
          this.lookT = (this.lookT ?? 0) - dt;
          if (this.lookT <= 0) {
            this.lookT = 1.5 + this.rng() * 2.5;
            this.lookDir = this.heading + (this.rng() - 0.5) * 2.8;
          }
          this.heading = dampAngle(this.heading, this.lookDir ?? this.heading, 2, dt);
        } else {
          if (!this.target) this.target = this.freeTarget(g, this.home, this.homeRadius, true);
          const left = moveToward(this, g, this.target.x, this.target.z, 1.5, dt, 4);
          speed = this.curSpeed;
          if (left < 0.6 || this.blocked > 1) {
            this.target = null;
            this.waitT = 2 + this.rng() * 5;
          }
        }
        break;
      }
      case 'suspicious': {
        if (this.awareness >= 1) {
          this.alert(p.pos);
          break;
        }
        if (this.awareness < 0.08) {
          this.state = 'patrol';
          this.target = null;
          break;
        }
        // Se mot lyden/bevegelsen og gå forsiktig nærmere
        const tx = this.lastSeen.x, tz = this.lastSeen.z;
        const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
        if (d > 4 && this.awareness > 0.5) {
          moveToward(this, g, tx, tz, 1.3, dt, 5);
          speed = this.curSpeed;
        } else {
          this.heading = dampAngle(this.heading, Math.atan2(tx - this.pos.x, tz - this.pos.z), 4, dt);
        }
        pose = 'aim';
        break;
      }
      case 'alert': {
        pose = 'aim';
        if (info.seen) this.lostT = 0;
        else this.lostT += dt;
        const range = CFG.range * (g.difficulty.key === 'hard' ? 1.25 : 1);
        const d = info.dist2;
        if (!info.seen || d > range * 0.75) {
          // Jakt på siste kjente posisjon
          const left = moveToward(this, g, this.lastSeen.x, this.lastSeen.z, CFG.runSpeed, dt, 7);
          speed = this.curSpeed;
          if (left < 1.5 && !info.seen) this.lostT += dt * 2;
        } else if (d < 9) {
          // Trekk seg unna for å få skuddavstand
          const ax = this.pos.x - p.pos.x, az = this.pos.z - p.pos.z;
          moveToward(this, g, this.pos.x + ax, this.pos.z + az, CFG.speed, dt, 8);
          speed = this.curSpeed;
          this.heading = Math.atan2(-ax, -az);
        } else {
          // Sidesteg
          this.strafeT -= dt;
          if (this.strafeT <= 0) {
            this.strafeT = 1.5 + this.rng() * 2;
            this.strafeDir = this.rng() < 0.5 ? 1 : -1;
          }
          const hx = Math.atan2(info.dx, info.dz);
          const sx = Math.cos(hx) * this.strafeDir, sz = -Math.sin(hx) * this.strafeDir;
          moveToward(this, g, this.pos.x + sx * 2, this.pos.z + sz * 2, 1.4, dt, 1);
          speed = this.curSpeed;
          this.heading = dampAngle(this.heading, hx, 10, dt);
        }
        if (info.seen) this.heading = dampAngle(this.heading, Math.atan2(info.dx, info.dz), 10, dt);
        // Skyt
        this.fireT -= dt;
        if (info.seen && d < range && this.fireT <= 0 && !p.dead) {
          this.shoot(info.dist);
          this.fireT = g.difficulty.fireInterval * (0.75 + this.rng() * 0.6);
        }
        if (this.lostT > 9) {
          this.state = 'search';
          this.searchT = 14;
          this.awareness = 0.55;
          this.target = null;
        }
        // Ikke løp for langt hjemmefra
        if (this.pos.distanceTo(this.home) > 260 && !info.seen) {
          this.state = 'patrol';
          this.awareness = 0;
          this.target = this.home.clone();
        }
        break;
      }
      case 'search': {
        if (this.awareness >= 1) {
          this.alert(p.pos);
          break;
        }
        this.searchT -= dt;
        if (!this.target || this.blocked > 1) this.target = this.freeTarget(g, this.lastSeen, 15, false);
        const left = moveToward(this, g, this.target.x, this.target.z, 2.4, dt, 5);
        speed = this.curSpeed;
        if (left < 1) this.target = null;
        pose = 'aim';
        if (this.searchT <= 0) {
          this.state = 'patrol';
          this.awareness = 0.2;
          this.target = this.home.clone();
        }
        break;
      }
    }

    // Unngå kollisjoner med trær nær spilleren
    if (distToPlayer < 120) g.features.resolve(this.pos, 0.35, g.extraColliders);
    snapToGround(this, g, dt);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    this.rig.update(dt, { speed, pose });
    const level = this.state === 'alert' ? 2 : this.state === 'suspicious' || this.state === 'search' ? 1 : 0;
    this.icon.set(level);
    this.icon.pulse(this.t, this.awareness);
  }

  shoot(dist) {
    const g = this.game;
    const p = g.player;
    const diff = g.difficulty;
    if (this.rig.muzzle) this.rig.muzzle.getWorldPosition(_m);
    else _m.set(this.pos.x, this.pos.y + 1.45, this.pos.z);
    const range = CFG.range * 1.2;
    let acc = diff.accuracy * (1 - clamp(dist / range, 0, 1) * 0.55);
    if (p.crouch) acc *= 0.75;
    if (p.speed2D > 6) acc *= 0.65;
    if (p.vehicle) acc *= p.vehicle.type === 'heli' ? 0.45 : 0.7;
    if (p.crouch && p.inCover > 0.4) acc *= 0.6;
    if (p.swimming) acc *= 0.6;
    const hit = this.rng() < acc;
    _t.copy(p.vehicle ? p.vehicle.pos : p.pos);
    _t.y += p.vehicle ? 1.2 : p.crouch ? 0.9 : 1.25;
    if (!hit) {
      const a = this.rng() * Math.PI * 2;
      const r = 1.2 + this.rng() * 2.2;
      _t.x += Math.cos(a) * r;
      _t.z += Math.sin(a) * r;
      _t.y += (this.rng() - 0.6) * 1.5;
      // Fortsett forbi spilleren
      _t.sub(_m).multiplyScalar(1.6).add(_m);
      const gh = g.gen.groundHeight(_t.x, _t.z);
      if (_t.y < gh) _t.y = gh;
    }
    g.combat.enemyShot(_m, _t, dist);
    if (hit) {
      const dmg = CFG.damage * diff.damageMult * (0.85 + this.rng() * 0.3);
      p.damage(dmg, 'poacher', this.pos);
    } else if (dist < 70) {
      setTimeout(() => g.audio.whiz(), 60);
    }
  }

  dispose() {
    this.game.scene.remove(this.group);
  }
}
