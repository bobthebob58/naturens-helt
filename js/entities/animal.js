// Dyr: farlige rovdyr (bjørn, isbjørn, ulv, skorpion, hai) og vennlige dyr som trenger hjelp.
import * as THREE from 'three';
import { ENEMIES, WORLD } from '../config.js';
import { createAnimalRig } from '../models/characters.js';
import { makeIconSprite } from '../models/geo.js';
import { perceive, AlertIcon, moveToward, snapToGround } from './ai.js';
import { dampAngle, damp } from '../utils/math.js';

const WATER = WORLD.waterLevel;
const _v = new THREE.Vector3();

export const FRIENDLY_NAMES = {
  deer: 'hjorten', reindeer: 'reinsdyret', fox: 'reven', fennec: 'ørkenreven', camel: 'kamelen',
  penguin: 'pingvinen', rabbit: 'haren',
};

const HEIGHTS = { bear: 1.9, polarbear: 2.0, wolf: 1.3, scorpion: 1.3, shark: 1.2, deer: 2.2, reindeer: 2.1, fox: 0.9, fennec: 0.8, camel: 3.0, penguin: 1.4, rabbit: 0.8 };
const RADII = { bear: 0.95, polarbear: 1.0, wolf: 0.6, scorpion: 0.7, shark: 1.0 };

export class Animal {
  /**
   * opts: { hostile: bool, need: 'food'|'water'|null }
   */
  constructor(game, type, x, z, opts = {}) {
    this.game = game;
    this.type = type;
    this.hostile = !!opts.hostile;
    this.need = opts.need || null;
    this.cfg = ENEMIES[type] || null;
    this.rig = createAnimalRig(type);
    this.group = new THREE.Group();
    this.group.add(this.rig.root);
    game.scene.add(this.group);
    this.aquatic = type === 'shark';
    this.pos = new THREE.Vector3(x, 0, z);
    this.home = new THREE.Vector3(x, 0, z);
    if (this.aquatic) this.pos.y = WATER - 1.0;
    else snapToGround(this, game, 0);
    this.heading = Math.random() * Math.PI * 2;
    this.hp = this.cfg ? this.cfg.hp : 50;
    this.awareness = 0;
    this.state = this.hostile ? 'wander' : 'idle';
    this.target = null;
    this.waitT = Math.random() * 3;
    this.attackCd = 0;
    this.lostT = 0;
    this.fleeT = 0;
    this.leaveT = 0;
    this.removed = false;
    this.curSpeed = 0;
    this.t = Math.random() * 10;
    this.hitRadius = RADII[type] ?? 0.6;
    this.height = HEIGHTS[type] ?? 1.5;
    this.growled = false;
    if (this.hostile) this.icon = new AlertIcon(this.group, this.height + 0.5);
    if (this.need) {
      this.marker = makeIconSprite('!', '#ffd34a', '#3a2a00', 0.85);
      this.marker.position.y = this.height + 0.6;
      this.group.add(this.marker);
    }
    this.name = this.hostile ? this.cfg.name : FRIENDLY_NAMES[type] || 'dyret';
    if (this.aquatic) this.rig.root.position.y = 0;
  }

  get alive() {
    return this.hostile && this.state !== 'flee' && !this.removed;
  }

  isUnaware() {
    return this.state === 'wander' || this.state === 'suspicious';
  }

  hitCenter(out) {
    return out.set(this.pos.x, this.pos.y + (this.aquatic ? 0 : this.height * 0.45), this.pos.z);
  }

  takeHit(dmg) {
    if (!this.alive) return;
    this.hp -= dmg;
    this.game.hud.hitMarker();
    if (this.hp <= 0) {
      this.state = 'flee';
      this.fleeT = 8;
      this.icon?.set(0);
      this.game.stats.animalsScared++;
      this.game.hud.notify(`${capitalize(this.name)} ble skremt og flyktet.`, 'good');
      return;
    }
    if (this.state !== 'chase') this.startChase();
  }

  startChase() {
    this.state = 'chase';
    this.awareness = 1;
    this.lostT = 0;
    this.game.audio.growl();
    this.game.onAnimalAggro(this);
  }

  /** Kan dyret nå spilleren? (kjøretøy beskytter) */
  canReachPlayer() {
    const p = this.game.player;
    if (this.aquatic) return p.swimming || (!p.vehicle && this.game.gen.waterDepth(p.pos.x, p.pos.z) > 1.0);
    if (p.vehicle) return p.vehicle.type === 'bike';
    if (p.swimming) return false;
    return true;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const p = g.player;
    const dToPlayer = Math.hypot(this.pos.x - p.pos.x, this.pos.z - p.pos.z);
    this.group.visible = dToPlayer < g.env.fogFar;
    if (this.hostile) this.updateHostile(dt, dToPlayer);
    else this.updateFriendly(dt, dToPlayer);
    if (this.removed) return;
    if (this.aquatic) {
      this.pos.y = damp(this.pos.y, this.state === 'chase' ? WATER - 0.55 : WATER - 0.8, 2, dt);
    } else {
      if (dToPlayer < 100) g.features.resolve(this.pos, this.hitRadius * 0.6, g.extraColliders);
      snapToGround(this, g, dt);
    }
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    if (this.marker) {
      this.marker.position.y = this.height + 0.6 + Math.sin(this.t * 3) * 0.08;
    }
  }

  updateHostile(dt, dToPlayer) {
    const g = this.game;
    const p = g.player;
    const cfg = this.cfg;
    let speed = 0;
    let anim = 'idle';
    this.attackCd -= dt;
    if (this.state === 'flee') {
      const ax = this.pos.x - p.pos.x, az = this.pos.z - p.pos.z;
      const l = Math.hypot(ax, az) || 1;
      moveToward(this, g, this.pos.x + (ax / l) * 10, this.pos.z + (az / l) * 10, cfg.runSpeed, dt, 6, this.aquatic);
      if (this.aquatic) this.keepInWater();
      speed = this.curSpeed;
      this.fleeT -= dt;
      if (this.fleeT <= 0 || dToPlayer > 120) this.despawn();
      this.rig.update(dt, speed, 'run');
      return;
    }

    const info = perceive(this, g, dt, { sightMult: cfg.sight, fov: 3.6, eyeH: this.aquatic ? 0 : 1.0 });
    const reachable = this.canReachPlayer();

    switch (this.state) {
      case 'wander': {
        if (this.awareness > 0.4 && reachable) {
          this.state = 'suspicious';
          break;
        }
        if (this.waitT > 0) {
          this.waitT -= dt;
          anim = 'eat';
        } else {
          if (!this.target) this.pickWanderTarget();
          const left = moveToward(this, g, this.target.x, this.target.z, cfg.speed, dt, 3, this.aquatic);
          if (this.aquatic) this.keepInWater();
          speed = this.curSpeed;
          anim = 'walk';
          if (left < 1 || this.blocked > 1) {
            this.target = null;
            this.waitT = 2 + Math.random() * 6;
          }
        }
        break;
      }
      case 'suspicious': {
        this.heading = dampAngle(this.heading, Math.atan2(info.dx, info.dz), 3, dt);
        if (!this.growled && dToPlayer < 45) {
          this.growled = true;
          g.audio.growl();
        }
        if (this.awareness >= 1 && reachable) this.startChase();
        else if (this.awareness < 0.1 || !reachable) {
          this.state = 'wander';
          this.growled = false;
        }
        break;
      }
      case 'chase': {
        anim = 'run';
        if (info.seen || info.heard) this.lostT = 0;
        else this.lostT += dt;
        const tx = p.vehicle ? p.vehicle.pos.x : p.pos.x;
        const tz = p.vehicle ? p.vehicle.pos.z : p.pos.z;
        const reach = cfg.reach + (p.vehicle ? p.vehicle.cfg.collideRadius : 0.3);
        if (info.dist2 > reach * 0.85) {
          moveToward(this, g, tx, tz, cfg.runSpeed, dt, 7, this.aquatic);
          if (this.aquatic) this.keepInWater();
          speed = this.curSpeed;
        } else {
          this.heading = dampAngle(this.heading, Math.atan2(info.dx, info.dz), 8, dt);
        }
        const dy = Math.abs((p.pos.y) - this.pos.y);
        if (info.dist2 < reach && dy < 2.5 && this.attackCd <= 0) {
          this.attackCd = cfg.cooldown;
          this.rig.update(0, 0, 'attack');
          if (reachable) {
            const dmg = cfg.damage * g.difficulty.damageMult * (0.85 + Math.random() * 0.3);
            p.damage(dmg, this.type, this.pos);
          } else {
            g.audio.growl();
            g.camShake = 0.3;
          }
        }
        if (!reachable) this.lostT += dt * 0.5;
        if (this.lostT > 7 || info.dist2 > 140) {
          this.state = 'wander';
          this.awareness = 0;
          this.target = this.home.clone();
          this.growled = false;
        }
        break;
      }
    }
    this.rig.update(dt, speed, anim);
    this.icon.set(this.state === 'chase' ? 2 : this.state === 'suspicious' ? 1 : 0);
    this.icon.pulse(this.t, this.awareness);
  }

  keepInWater() {
    // Haien holder seg i dypt vann
    if (this.game.gen.waterDepth(this.pos.x, this.pos.z) < 2) {
      this.pos.x = damp(this.pos.x, this.home.x, 2, 0.05);
      this.pos.z = damp(this.pos.z, this.home.z, 2, 0.05);
      this.target = null;
    }
  }

  pickWanderTarget() {
    const g = this.game;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * (this.aquatic ? 35 : 28);
      const x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
      const depth = g.gen.waterDepth(x, z);
      if (this.aquatic ? depth > 2.5 : depth < 0.3) {
        this.target = new THREE.Vector3(x, 0, z);
        return;
      }
    }
    this.target = this.home.clone();
  }

  // ----- Vennlige dyr -----
  updateFriendly(dt, dToPlayer) {
    const g = this.game;
    let speed = 0;
    let anim = 'idle';
    if (this.state === 'happy') {
      this.leaveT -= dt;
      anim = 'happy';
      if (Math.random() < dt * 6) g.particles.burst('hearts', _v.set(this.pos.x, this.pos.y + this.height, this.pos.z), 1);
      if (this.leaveT <= 0) {
        this.state = 'leave';
        this.leaveT = 25;
        const a = Math.random() * Math.PI * 2;
        this.target = new THREE.Vector3(this.pos.x + Math.cos(a) * 80, 0, this.pos.z + Math.sin(a) * 80);
      }
    } else if (this.state === 'leave') {
      moveToward(this, g, this.target.x, this.target.z, 3.5, dt, 3);
      speed = this.curSpeed;
      anim = 'walk';
      this.leaveT -= dt;
      if (this.leaveT <= 0 || this.blocked > 2) this.despawn();
    } else {
      // Rolig vandring nær hjemmet, se mot spilleren når han er nær
      if (dToPlayer < 8) {
        this.heading = dampAngle(this.heading, Math.atan2(g.player.pos.x - this.pos.x, g.player.pos.z - this.pos.z), 3, dt);
        anim = 'idle';
      } else if (this.waitT > 0) {
        this.waitT -= dt;
        anim = 'eat';
      } else {
        if (!this.target) {
          const a = Math.random() * Math.PI * 2;
          this.target = new THREE.Vector3(this.home.x + Math.cos(a) * 6, 0, this.home.z + Math.sin(a) * 6);
        }
        const left = moveToward(this, g, this.target.x, this.target.z, 1.0, dt, 3);
        speed = this.curSpeed;
        anim = 'walk';
        if (left < 0.5 || this.blocked > 1) {
          this.target = null;
          this.waitT = 3 + Math.random() * 5;
        }
      }
    }
    this.rig.update(dt, speed, anim);
  }

  helped() {
    this.need = null;
    this.state = 'happy';
    this.leaveT = 3;
    if (this.marker) {
      this.group.remove(this.marker);
      this.marker = null;
    }
  }

  despawn() {
    if (this.removed) return;
    this.removed = true;
    this.game.scene.remove(this.group);
  }

  dispose() {
    this.despawn();
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
