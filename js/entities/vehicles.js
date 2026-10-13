// Kjøretøyfysikk: sykkel og bil (land), båt (vann) og helikopter (luft).
import * as THREE from 'three';
import { VEHICLES, WORLD } from '../config.js';
import { createVehicleModel } from '../models/vehicleModels.js';
import { clamp, damp, dampAngle } from '../utils/math.js';

const WATER = WORLD.waterLevel;

export class Vehicle {
  constructor(game, type) {
    this.game = game;
    this.type = type;
    this.cfg = VEHICLES[type];
    this.model = createVehicleModel(type);
    this.group = this.model.group;
    this.group.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.vy = 0;
    this.pitch = 0;
    this.roll = 0;
    this.steer = 0;
    this.rotorSpin = 0;
    this.airborne = false;
    this.driver = null;
    this.blockedMsgT = 0;
    this.wakeT = 0;
    this.time = Math.random() * 10;
    this.landed = true;
    game.scene.add(this.group);
  }

  get kind() {
    return this.cfg.kind;
  }

  placeAt(x, z, heading = 0) {
    const gen = this.game.gen;
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.vel.set(0, 0, 0);
    this.vy = 0;
    const g = gen.groundHeight(x, z);
    if (this.kind === 'water') this.pos.y = WATER;
    else if (this.kind === 'air') this.pos.y = Math.max(g, WATER);
    else this.pos.y = g;
    this.group.visible = true;
    this.syncModel(0);
  }

  /** Setepunkt i verdenskoordinater. */
  seatWorld(out) {
    out.copy(this.model.seat);
    this.group.updateMatrixWorld();
    return out.applyMatrix4(this.group.matrixWorld);
  }

  get speedFrac() {
    const v = this.kind === 'air' ? Math.hypot(this.vel.x, this.vel.z) : Math.abs(this.speed);
    return clamp(v / this.cfg.maxSpeed, 0, 1);
  }

  update(dt, c) {
    this.time += dt;
    if (this.kind === 'land') this.updateLand(dt, c);
    else if (this.kind === 'water') this.updateBoat(dt, c);
    else this.updateHeli(dt, c);
    this.syncModel(dt);
  }

  notifyBlocked(msg) {
    if (this.blockedMsgT <= 0 && this.driver) {
      this.game.hud.notify(msg, 'warn');
      this.blockedMsgT = 4;
    }
  }

  updateLand(dt, c) {
    const cfg = this.cfg;
    const gen = this.game.gen;
    this.blockedMsgT -= dt;
    const thr = c ? c.throttle : 0;
    const st = c ? c.steer : 0;
    if (thr > 0) {
      if (this.speed < -0.2) this.speed += cfg.brake * dt;
      else this.speed += cfg.accel * dt * thr;
    } else if (thr < 0) {
      if (this.speed > 0.2) this.speed -= cfg.brake * dt;
      else this.speed -= cfg.accel * 0.6 * dt;
    } else {
      this.speed = damp(this.speed, 0, this.airborne ? 0.05 : 0.9, dt);
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    if (c && c.brake) this.speed = damp(this.speed, 0, 3.5, dt);

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const hHere = gen.groundHeight(this.pos.x, this.pos.z);
    const dir = Math.sign(this.speed) || 1;
    const hAhead = gen.groundHeight(this.pos.x + fx * 1.6 * dir, this.pos.z + fz * 1.6 * dir);
    const slope = (hAhead - hHere) / 1.6;
    const slopeK = this.type === 'bike' ? 1.6 : 0.8;
    const maxF = clamp(1 - Math.max(0, slope) * slopeK, 0.2, 1);
    if (!this.airborne) this.speed -= slope * dir * 9.8 * 0.18 * dt * (Math.abs(this.speed) > 0.5 ? 1 : 0);
    this.speed = clamp(this.speed, -cfg.reverse, cfg.maxSpeed * maxF + (slope < 0 ? 3 : 0));

    this.steer = damp(this.steer, st, 7, dt);
    if (!this.airborne) {
      const tf = clamp(Math.abs(this.speed) / 3, 0, 1) * (1 - clamp(Math.abs(this.speed) / cfg.maxSpeed, 0, 1) * 0.35);
      this.heading += this.steer * cfg.turnRate * tf * Math.sign(this.speed) * dt;
    }

    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    const depth = WATER - gen.groundHeight(nx, nz);
    const maxDepth = this.type === 'car' ? 0.9 : 0.6;
    if (depth > maxDepth && depth > WATER - hHere) {
      this.speed *= -0.25;
      this.notifyBlocked('For dypt vann! Bruk båt eller helikopter for å krysse.');
    } else if (!gen.isInWorld(nx, nz, 30)) {
      this.speed *= -0.3;
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }
    if (this.game.features.resolve(this.pos, cfg.collideRadius, this.game.extraColliders)) {
      if (Math.abs(this.speed) > 7) {
        this.game.audio.hit();
        this.game.camShake = Math.min(1, Math.abs(this.speed) / 20);
      }
      this.speed *= 0.4;
    }

    const g = gen.groundHeight(this.pos.x, this.pos.z);
    if (this.airborne) {
      this.vy -= 24 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= g) {
        this.pos.y = g;
        this.airborne = false;
        if (this.vy < -9) {
          this.game.camShake = 0.6;
          this.game.audio.hit();
        }
        this.vy = 0;
      }
    } else {
      const needVy = (g - this.pos.y) / Math.max(dt, 1e-3);
      if (needVy < this.vy - 24 * dt - 2 && Math.abs(this.speed) > 9) {
        this.airborne = true;
        this.vy -= 24 * dt;
        this.pos.y += this.vy * dt;
      } else {
        this.vy = clamp(needVy, -30, 30);
        this.pos.y = g;
      }
    }

    // Helling etter terrenget
    if (!this.airborne) {
      const L = this.type === 'bike' ? 1.2 : 2.6, W = this.type === 'bike' ? 0.3 : 1.8;
      const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
      const lx = Math.cos(this.heading), lz = -Math.sin(this.heading);
      const hF = gen.groundHeight(this.pos.x + hx * L / 2, this.pos.z + hz * L / 2);
      const hB = gen.groundHeight(this.pos.x - hx * L / 2, this.pos.z - hz * L / 2);
      const hL = gen.groundHeight(this.pos.x + lx * W / 2, this.pos.z + lz * W / 2);
      const hR = gen.groundHeight(this.pos.x - lx * W / 2, this.pos.z - lz * W / 2);
      this.pitch = damp(this.pitch, Math.atan2(hF - hB, L), 10, dt);
      let roll = Math.atan2(hL - hR, W);
      if (this.type === 'bike') roll = -this.steer * clamp(this.speed / 10, 0, 1) * 0.35 + (this.speed < 0.3 && !this.driver ? 0.25 : 0);
      this.roll = damp(this.roll, roll, 8, dt);
    }
    if (Math.abs(this.speed) > 6 && !this.airborne && Math.random() < dt * 8) {
      const biome = this.game.gen.biomeAt(this.pos.x, this.pos.z);
      this.game.particles.burst(biome === 'ice' ? 'snow' : 'dust', { x: this.pos.x - fx * 1.5, y: this.pos.y + 0.2, z: this.pos.z - fz * 1.5 }, 1);
    }
  }

  updateBoat(dt, c) {
    const cfg = this.cfg;
    const gen = this.game.gen;
    this.blockedMsgT -= dt;
    const thr = c ? c.throttle : 0;
    const st = c ? c.steer : 0;
    if (thr > 0) this.speed += cfg.accel * dt * thr * (this.speed < 0 ? 2 : 1);
    else if (thr < 0) this.speed -= (this.speed > 0 ? cfg.brake : cfg.accel * 0.6) * dt;
    else this.speed = damp(this.speed, 0, 0.6, dt);
    this.speed = clamp(this.speed, -cfg.reverse, cfg.maxSpeed);
    this.steer = damp(this.steer, st, 4, dt);
    const tf = 0.3 + clamp(Math.abs(this.speed) / 5, 0, 0.7);
    this.heading += this.steer * cfg.turnRate * tf * (this.speed < -0.1 ? -1 : 1) * dt;
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    const depth = WATER - gen.groundHeight(nx, nz);
    if (depth < 0.45) {
      this.speed *= -0.3;
      this.notifyBlocked('Båten går på grunn – den kan bare kjøre på vann.');
    } else if (!gen.isInWorld(nx, nz, 15)) {
      this.speed *= -0.3;
      this.notifyBlocked('Du har nådd kanten av verden.');
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }
    this.pos.y = WATER + Math.sin(this.time * 1.6) * 0.06 - 0.05;
    this.pitch = damp(this.pitch, this.speed / cfg.maxSpeed * 0.1 + Math.sin(this.time * 1.3) * 0.02, 3, dt);
    this.roll = damp(this.roll, -this.steer * clamp(this.speed / cfg.maxSpeed, 0, 1) * 0.2 + Math.sin(this.time * 1.1) * 0.03, 3, dt);
    this.wakeT -= dt;
    if (Math.abs(this.speed) > 2 && this.wakeT <= 0) {
      this.wakeT = 0.05;
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      this.game.particles.burst('wake', { x: this.pos.x - fx * 2.4, y: WATER + 0.1, z: this.pos.z - fz * 2.4 }, 2);
    }
    if (this.model.prop) this.model.prop.rotation.z += this.speed * dt * 4;
  }

  updateHeli(dt, c) {
    const cfg = this.cfg;
    const gen = this.game.gen;
    const on = !!c;
    this.rotorSpin = damp(this.rotorSpin, on ? 1 : 0, on ? 0.9 : 0.4, dt);
    const g = gen.groundHeight(this.pos.x, this.pos.z);
    const floor = Math.max(g, WATER);
    const lift = this.rotorSpin > 0.75;
    let tvx = 0, tvz = 0, tvy = 0;
    if (c && lift) {
      const yaw = c.camYaw;
      const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
      const rX = Math.cos(yaw), rZ = -Math.sin(yaw);
      tvx = (fwdX * c.throttle + rX * c.strafe) * cfg.maxSpeed;
      tvz = (fwdZ * c.throttle + rZ * c.strafe) * cfg.maxSpeed;
      tvy = (c.up ? cfg.climb : 0) - (c.down ? cfg.climb : 0);
      if (this.landed && tvy <= 0) { tvx = 0; tvz = 0; }
      const targetHeading = yaw + Math.PI;
      this.heading = dampAngle(this.heading, targetHeading, this.landed ? 0.5 : 2.2, dt);
    } else if (!lift && this.pos.y > floor + 0.1) {
      tvy = -6; // synker sakte uten rotor
    }
    this.vel.x = damp(this.vel.x, tvx, 1.3, dt);
    this.vel.z = damp(this.vel.z, tvz, 1.3, dt);
    this.vel.y = damp(this.vel.y, tvy, 2.5, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    if (!gen.isInWorld(this.pos.x, this.pos.z, 10)) {
      this.pos.x = clamp(this.pos.x, -gen.half + 10, gen.half - 10);
      this.pos.z = clamp(this.pos.z, -gen.half + 10, gen.half - 10);
      this.vel.x *= -0.3;
      this.vel.z *= -0.3;
    }
    const g2 = Math.max(gen.groundHeight(this.pos.x, this.pos.z), WATER);
    if (this.pos.y <= g2) {
      this.pos.y = g2;
      if (this.vel.y < 0) this.vel.y = 0;
      this.landed = true;
      this.vel.x = damp(this.vel.x, 0, 4, dt);
      this.vel.z = damp(this.vel.z, 0, 4, dt);
    } else {
      this.landed = this.pos.y - g2 < 0.15;
    }
    if (this.pos.y > 320) {
      this.pos.y = 320;
      this.vel.y = Math.min(0, this.vel.y);
    }
    if (this.pos.y - g < 9) this.game.features.resolve(this.pos, cfg.collideRadius, this.game.extraColliders);
    // Helling
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    const fwdSpeed = this.vel.x * hx + this.vel.z * hz;
    const sideSpeed = this.vel.x * Math.cos(this.heading) - this.vel.z * Math.sin(this.heading);
    this.pitch = damp(this.pitch, -fwdSpeed / cfg.maxSpeed * 0.28, 3, dt);
    this.roll = damp(this.roll, -sideSpeed / cfg.maxSpeed * 0.3, 3, dt);
    this.model.rotor.rotation.y += this.rotorSpin * dt * 28;
    this.model.tailRotor.rotation.x += this.rotorSpin * dt * 40;
    // Støv/vannsprut under rotoren
    if (this.rotorSpin > 0.6 && this.pos.y - g2 < 14 && Math.random() < dt * 20) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 3;
      const px = this.pos.x + Math.cos(a) * r, pz = this.pos.z + Math.sin(a) * r;
      const overWater = gen.groundHeight(px, pz) < WATER;
      this.game.particles.burst(overWater ? 'splash' : 'dust', { x: px, y: g2 + 0.2, z: pz }, 1, { speed: 4 });
    }
  }

  syncModel(dt) {
    const m = this.model;
    this.group.position.copy(this.pos);
    this.group.rotation.set(-this.pitch, this.heading, this.roll);
    if (m.wheels) {
      for (const w of m.wheels) w.rotation.x += (this.speed / m.wheelRadius) * dt;
    }
    if (m.steerGroups) for (const s of m.steerGroups) s.rotation.y = this.steer * 0.5;
    if (m.steer) m.steer.rotation.y = this.steer * 0.45;
    if (m.crank) m.crank.rotation.x += this.speed * dt * 1.5;
  }

  remove() {
    this.game.scene.remove(this.group);
  }
}
