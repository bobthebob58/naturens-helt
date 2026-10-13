// Spilleren: bevegelse til fots, svømming, huking (snik), kamera (1./3. person),
// våpen, helse, pust og kjøretøy.
import * as THREE from 'three';
import { WORLD, WEAPONS, WEAPON_ORDER, VEHICLES, VEHICLE_ORDER, ITEM_INFO } from '../config.js';
import { HumanRig, createWeaponModel } from '../models/characters.js';
import { clamp, damp, lerp } from '../utils/math.js';
import { Vehicle } from './vehicles.js';

const WATER = WORLD.waterLevel;
const GRAVITY = 24;
// Omtrentlig trekrone per tretype (ved skala 1) – brukes for å holde kameraet utenfor kronene
const FOLIAGE = {
  pine: { r: 2.1, y0: 1.6, y1: 8.6 },
  snowPine: { r: 2.1, y0: 1.6, y1: 8.6 },
  oak: { r: 2.4, y0: 2.4, y1: 7.2 },
  birch: { r: 1.4, y0: 3.6, y1: 7.6 },
  palm: { r: 2.3, y0: 6.0, y1: 8.8 },
};
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;
    this.rig = new HumanRig({
      shirt: 0x3d7a4a, sleeves: 0x3d7a4a, pants: 0x5a4e3a, hat: 'ranger', hatColor: 0x8d6e3f,
      backpack: 0x6e5a3a, vest: 0x56663c, skin: 0xd9a77e, hair: 0x4a3020,
    });
    this.rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    game.scene.add(this.rig.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.viewModel = new THREE.Group();
    this.viewModel.position.set(0.3, -0.3, -0.55);
    game.camera.add(this.viewModel);
    this.weaponModels = {};
    this.cameraMode = 'third';
    this.reset();
  }

  reset(save = null) {
    const g = this.game;
    this.pos.set(g.gen.spawn.x, g.gen.groundHeight(g.gen.spawn.x, g.gen.spawn.z), g.gen.spawn.z);
    this.vel.set(0, 0, 0);
    this.yaw = Math.PI;
    this.pitch = -0.1;
    this.heading = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.breath = 1;
    this.coins = g.difficulty.startCoins;
    this.crouch = false;
    this.running = false;
    this.onGround = true;
    this.swimming = false;
    this.headUnder = false;
    this.inCover = 0;
    this.eyeH = 1.65;
    this.weapons = ['machete'];
    this.weapon = 'machete';
    this.inventory = { medicine: 1, medkit: 0, food: 1, water: 1 };
    this.ownedVehicles = ['bike'];
    this.selectedVehicle = 'bike';
    this.vehicle = null;
    this.attackT = -1;
    this.cooldown = 0;
    this.stepT = 0;
    this.lastHurt = 99;
    this.noMouseT = 0;
    this.dead = false;
    this.fallVel = 0;
    this.drownTick = 0;
    this.heartbeatT = 0;
    if (save) {
      this.pos.set(save.pos[0], save.pos[1], save.pos[2]);
      this.yaw = save.yaw;
      this.health = save.health;
      this.coins = save.coins;
      this.weapons = save.weapons;
      this.weapon = save.weapon;
      this.inventory = { ...this.inventory, ...save.inventory };
      this.ownedVehicles = save.ownedVehicles;
      this.selectedVehicle = save.selectedVehicle;
      this.pos.y = Math.max(this.pos.y, g.gen.groundHeight(this.pos.x, this.pos.z));
    }
    this.setWeapon(this.weapon);
    this.rig.root.visible = true;
  }

  // ---------------------------------------------------------------------
  get chest() {
    return _v2.set(this.pos.x, this.pos.y + (this.crouch ? 0.8 : 1.2), this.pos.z);
  }

  get isMoving() {
    return Math.hypot(this.vel.x, this.vel.z) > 0.5;
  }

  get speed2D() {
    if (this.vehicle) return this.vehicle.kind === 'air' ? Math.hypot(this.vehicle.vel.x, this.vehicle.vel.z) : Math.abs(this.vehicle.speed);
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /** Vektet "synlighet" brukt av fiender (lavere = vanskeligere å oppdage). */
  visibilityFactor() {
    if (this.vehicle) {
      if (this.vehicle.type === 'heli') return 2.0;
      if (this.vehicle.type === 'bike') return 1.1;
      return 1.5;
    }
    let f = 1;
    if (this.crouch) f *= 0.42;
    if (this.running) f *= 1.3;
    if (this.crouch && this.inCover > 0.3) f *= 1 - this.inCover * 0.55;
    if (this.swimming) f *= 0.6;
    return f;
  }

  /** Hvor langt unna man kan høres. */
  noiseRadius() {
    if (this.vehicle) {
      if (this.vehicle.type === 'heli') return this.vehicle.rotorSpin > 0.3 ? 70 : 5;
      if (this.vehicle.type === 'bike') return 7 + this.vehicle.speedFrac * 5;
      return 18 + this.vehicle.speedFrac * 20;
    }
    if (!this.isMoving) return 0;
    if (this.crouch) return 1.2;
    if (this.running) return 13;
    if (this.swimming) return 4;
    return 5.5;
  }

  // ---------------------------------------------------------------------
  setWeapon(id) {
    if (!this.weapons.includes(id)) return;
    this.weapon = id;
    if (!this.weaponModels[id]) {
      this.weaponModels[id] = { held: createWeaponModel(id), view: createWeaponModel(id) };
      const held = this.weaponModels[id].held;
      held.rotation.x = Math.PI / 2 - (id === 'machete' ? 0.3 : 0);
      if (id === 'bow') held.rotation.set(Math.PI / 2, 0, Math.PI / 2);
      const view = this.weaponModels[id].view;
      view.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
      view.rotation.y = Math.PI;
      if (id === 'machete') view.rotation.set(0.25, Math.PI + 0.15, 0.1);
      if (id === 'bow') { view.rotation.set(0, Math.PI, 0.1); view.position.set(-0.15, 0.05, 0); }
    }
    this.rig.setHeld(this.weaponModels[id].held);
    while (this.viewModel.children.length) this.viewModel.remove(this.viewModel.children[0]);
    this.viewModel.add(this.weaponModels[id].view);
    this.cooldown = Math.max(this.cooldown, 0.25);
    this.game.hud?.markDirty();
  }

  cycleWeapon(dir) {
    const owned = WEAPON_ORDER.filter((w) => this.weapons.includes(w));
    const i = owned.indexOf(this.weapon);
    this.setWeapon(owned[(i + dir + owned.length) % owned.length]);
    this.game.audio.ui();
  }

  cycleVehicle() {
    const owned = VEHICLE_ORDER.filter((v) => this.ownedVehicles.includes(v));
    const i = owned.indexOf(this.selectedVehicle);
    this.selectedVehicle = owned[(i + 1) % owned.length];
    this.game.hud.notify(`Valgt kjøretøy: ${VEHICLES[this.selectedVehicle].icon} ${VEHICLES[this.selectedVehicle].name}`);
    this.game.audio.ui();
    this.game.hud.markDirty();
  }

  useMedicine() {
    if (this.health >= this.maxHealth) {
      this.game.hud.notify('Du har allerede full helse.');
      return;
    }
    const missing = this.maxHealth - this.health;
    let item = null;
    if (this.inventory.medkit > 0 && (missing > 50 || this.inventory.medicine <= 0)) item = 'medkit';
    else if (this.inventory.medicine > 0) item = 'medicine';
    if (!item) {
      this.game.hud.notify('Du har ingen medisin. Kjøp i butikken (B).', 'warn');
      this.game.audio.error();
      return;
    }
    this.inventory[item]--;
    this.heal(ITEM_INFO[item].heal);
    this.game.hud.notify(`${ITEM_INFO[item].icon} Brukte ${ITEM_INFO[item].name.toLowerCase()}`, 'good');
  }

  heal(n) {
    this.health = Math.min(this.maxHealth, this.health + n);
    this.game.particles.burst('heal', this.chest, 20);
    this.game.audio.quest();
    this.game.hud.markDirty();
  }

  damage(amount, cause, from) {
    if (this.dead || this.game.state !== 'playing') return;
    this.health -= amount;
    this.lastHurt = 0;
    this.game.hud.damageFlash(amount, from, this);
    this.game.audio.hurt();
    this.game.camShake = Math.min(1, this.game.camShake + amount / 30);
    this.game.stats.damageTaken += amount;
    this.lastCause = cause;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.game.gameOver(cause);
    }
    this.game.hud.markDirty();
  }

  // ---------------------------------------------------------------------
  // Kjøretøy
  getVehicle(type) {
    const g = this.game;
    if (!g.vehicles[type]) g.vehicles[type] = new Vehicle(g, type);
    return g.vehicles[type];
  }

  /** Hent valgt kjøretøy til spilleren. */
  summonVehicle() {
    const type = this.selectedVehicle;
    const cfg = VEHICLES[type];
    const g = this.game;
    const gen = g.gen;
    let spot = null;
    const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
    if (cfg.kind === 'water') {
      for (let r = 2; r <= 40 && !spot; r += 2) {
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2;
          const x = this.pos.x + Math.cos(ang) * r, z = this.pos.z + Math.sin(ang) * r;
          if (gen.waterDepth(x, z) > 1.2 && gen.waterDepth(x + 2, z) > 0.8 && gen.waterDepth(x - 2, z + 2) > 0.8) {
            spot = { x, z };
            break;
          }
        }
      }
      if (!spot) {
        g.hud.notify('Båten trenger vann – gå nærmere en innsjø eller havet.', 'warn');
        g.audio.error();
        return;
      }
    } else {
      const need = cfg.kind === 'air' ? 4.5 : 1.8;
      const tmp = [];
      for (let r = 3; r <= 24 && !spot; r += 1.5) {
        for (let a = 0; a < 12; a++) {
          const ang = Math.atan2(fwdZ, fwdX) + (a % 2 ? 1 : -1) * Math.ceil(a / 2) * 0.5;
          const x = this.pos.x + Math.cos(ang) * r, z = this.pos.z + Math.sin(ang) * r;
          const depth = gen.waterDepth(x, z);
          if (cfg.kind === 'land' && depth > 0.3) continue;
          if (gen.slopeAt(x, z) < 0.75) continue;
          g.features.collidersNear(x, z, need, tmp);
          const blocked = tmp.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + need);
          if (blocked) continue;
          spot = { x, z };
          break;
        }
      }
      if (!spot) {
        g.hud.notify('Fant ingen ledig plass til kjøretøyet her.', 'warn');
        g.audio.error();
        return;
      }
    }
    const v = this.getVehicle(type);
    v.placeAt(spot.x, spot.z, this.yaw + Math.PI);
    g.particles.burst('poof', { x: spot.x, y: v.pos.y + 1, z: spot.z }, 25);
    g.audio.poof();
    g.hud.notify(`${cfg.icon} ${cfg.name} er klar – trykk E for å stige på.`);
  }

  enterVehicle(v) {
    if (this.vehicle) return;
    this.vehicle = v;
    v.driver = this;
    this.crouch = false;
    this.swimming = false;
    this.vel.set(0, 0, 0);
    this.game.audio.startEngine(v.type);
    this.game.hud.notify(`${v.cfg.icon} ${v.cfg.name}${v.type === 'heli' ? ' – Space: opp, Shift: ned' : ''}`);
    this.game.hud.markDirty();
  }

  exitVehicle() {
    const v = this.vehicle;
    if (!v) return;
    if (v.type === 'heli' && !v.landed) {
      this.game.hud.notify('Land helikopteret før du går ut (Shift for å senke).', 'warn');
      this.game.audio.error();
      return;
    }
    if (v.kind === 'land' && Math.abs(v.speed) > 9) {
      this.game.hud.notify('Stopp først!', 'warn');
      return;
    }
    v.driver = null;
    this.vehicle = null;
    // Gå ut på siden
    const lx = Math.cos(v.heading), lz = -Math.sin(v.heading);
    const off = v.cfg.collideRadius + 0.9;
    let best = null;
    for (const side of [1, -1]) {
      const x = v.pos.x + lx * off * side, z = v.pos.z + lz * off * side;
      const d = this.game.gen.waterDepth(x, z);
      if (!best || d < best.d) best = { x, z, d };
    }
    this.pos.set(best.x, Math.max(this.game.gen.groundHeight(best.x, best.z), v.pos.y), best.z);
    this.vel.set(0, 0, 0);
    this.game.audio.stopEngine();
    this.game.hud.markDirty();
  }

  // ---------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    const input = g.input;
    this.lastHurt += dt;
    this.cooldown -= dt;

    // Mus
    const [mdx, mdy] = input.consumeMouse();
    this.yaw -= mdx * 0.0022;
    this.pitch -= mdy * 0.0022;
    const minP = this.cameraMode === 'first' ? -1.45 : -1.1;
    const maxP = this.cameraMode === 'first' ? 1.45 : 0.75;
    this.pitch = clamp(this.pitch, minP, maxP);
    if (Math.abs(mdx) + Math.abs(mdy) > 0.5) this.noMouseT = 0;
    else this.noMouseT += dt;

    if (this.vehicle) this.updateVehicle(dt);
    else this.updateOnFoot(dt);

    // Lav helse – hjerteslag
    if (this.health < 30 && !this.dead) {
      this.heartbeatT -= dt;
      if (this.heartbeatT <= 0) {
        this.heartbeatT = 1.1;
        g.audio.heartbeat();
      }
    }
  }

  updateVehicle(dt) {
    const g = this.game;
    const input = g.input;
    const v = this.vehicle;
    const c = {
      throttle: (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0),
      steer: (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0),
      strafe: (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0),
      up: input.down('Space'),
      down: input.down('ShiftLeft') || input.down('ShiftRight') || input.down('ControlLeft'),
      brake: input.down('Space'),
      camYaw: this.yaw,
    };
    if (v.kind === 'air') c.brake = false;
    v.update(dt, c);
    v.seatWorld(this.pos);
    this.vel.set(0, 0, 0);
    this.swimming = false;
    this.headUnder = false;
    this.breath = Math.min(1, this.breath + dt / 3);
    this.crouch = false;
    this.running = false;
    // Kamera følger kjøretøyet bakfra når man ikke styrer med musa
    if (v.kind !== 'air' && this.noMouseT > 1.2 && Math.abs(v.speed) > 2) {
      const target = v.heading + Math.PI + (v.speed < 0 ? Math.PI : 0);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-2.5 * dt));
      this.pitch = damp(this.pitch, -0.18, 2, dt);
    }
    g.audio.updateEngine(v.speedFrac, Math.abs(c.throttle));
    // Rytter-positur
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.set(-v.pitch, v.heading, v.roll, 'YXZ');
    this.rig.update(dt, { speed: v.type === 'bike' ? Math.abs(v.speed) : 0, pose: v.model.pose });
  }

  updateOnFoot(dt) {
    const g = this.game;
    const input = g.input;
    const gen = g.gen;

    // Huk (venstre museklikk eller C)
    if (input.clicked(0) || input.wasPressed('KeyC')) {
      this.crouch = !this.crouch;
      g.hud.markDirty();
    }
    const fwd = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const side = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const wantRun = (input.down('ShiftLeft') || input.down('ShiftRight')) && fwd > 0;
    if (wantRun && this.crouch && !this.swimming) {
      this.crouch = false;
      g.hud.markDirty();
    }
    this.running = wantRun && !this.crouch;

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let dx = -sy * fwd + cy * side;
    let dz = -cy * fwd - sy * side;
    const len = Math.hypot(dx, dz);
    if (len > 0) { dx /= len; dz /= len; }

    let speed = this.crouch ? 2.3 : this.running ? 8.2 : 4.6;
    if (this.swimming) speed = this.running ? 4.0 : 2.8;
    if (this.attackT >= 0 && WEAPONS[this.weapon].type === 'melee') speed *= 0.8;

    const groundH = gen.groundHeight(this.pos.x, this.pos.z);
    const accel = this.onGround || this.swimming ? 12 : 2.5;
    this.vel.x = damp(this.vel.x, dx * speed, accel, dt);
    this.vel.z = damp(this.vel.z, dz * speed, accel, dt);

    // Bratt terreng bremser
    if (len > 0 && this.onGround) {
      const ahead = gen.groundHeight(this.pos.x + dx * 0.8, this.pos.z + dz * 0.8);
      const slope = (ahead - groundH) / 0.8;
      if (slope > 0.9) {
        const k = clamp(1 - (slope - 0.9) * 1.2, 0, 1);
        this.vel.x *= k;
        this.vel.z *= k;
      }
    }

    const depth = WATER - groundH;
    // Vertikal bevegelse
    if (this.swimming) {
      const diving = this.crouch;
      let targetY = WATER - 1.45;
      if (diving) targetY = Math.max(groundH + 0.2, WATER - 4.5);
      if (input.down('Space')) targetY = WATER - 1.2;
      this.vel.y = damp(this.vel.y, (targetY - this.pos.y) * 2.5, 4, dt);
      this.onGround = false;
    } else {
      this.vel.y -= GRAVITY * dt;
      if (input.wasPressed('Space') && this.onGround) {
        this.vel.y = this.crouch ? 6 : 7.6;
        this.onGround = false;
        if (this.crouch) { this.crouch = false; g.hud.markDirty(); }
      }
    }

    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // Kollisjon med trær, steiner og leirutstyr
    g.features.resolve(this.pos, 0.35, g.extraColliders);
    if (!gen.isInWorld(this.pos.x, this.pos.z, 8)) {
      this.pos.x = ox;
      this.pos.z = oz;
    }

    const newGround = gen.groundHeight(this.pos.x, this.pos.z);
    // Veldig bratte klipper kan ikke gås opp
    if (newGround - groundH > 1.3 * Math.max(0.3, Math.hypot(this.pos.x - ox, this.pos.z - oz)) + 0.15 && newGround > this.pos.y + 0.25) {
      this.pos.x = ox;
      this.pos.z = oz;
    }
    const gh = gen.groundHeight(this.pos.x, this.pos.z);
    const wasOnGround = this.onGround;
    if (this.pos.y <= gh) {
      if (!wasOnGround && this.vel.y < -17 && !this.swimming && WATER - gh < 1.0) {
        const dmg = Math.round((-this.vel.y - 17) * 4.5);
        this.damage(dmg, 'fall', null);
        g.hud.notify('Au! Et hardt fall.', 'warn');
      }
      this.pos.y = gh;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
    } else if (wasOnGround && this.vel.y <= 0 && this.pos.y - gh < 0.6 && !this.swimming) {
      this.pos.y = gh; // følg bakken nedover bakker
      this.vel.y = 0;
      this.onGround = true;
    } else if (!this.swimming) {
      this.onGround = false;
    }

    // Vann og pust
    const d2 = WATER - gh;
    const wasSwimming = this.swimming;
    this.swimming = d2 > 1.35 && this.pos.y < WATER - 1.0;
    if (this.swimming && !wasSwimming) {
      g.particles.burst('splash', { x: this.pos.x, y: WATER + 0.1, z: this.pos.z }, 18);
      g.audio.splash();
      if (this.vel.y < -6) this.vel.y *= 0.3;
    }
    if (!this.swimming && wasSwimming && this.crouch) this.crouch = false;
    const eye = this.pos.y + this.eyeH;
    this.headUnder = eye < WATER - 0.05 && d2 > 0;
    if (this.headUnder) this.breath -= dt / 13;
    else if (this.swimming) this.breath -= dt / 75;
    else this.breath = Math.min(1, this.breath + dt / 2.5);
    if (this.breath <= 0) {
      this.breath = 0;
      this.drownTick -= dt;
      if (this.drownTick <= 0) {
        this.drownTick = 0.5;
        this.damage(7, 'drown', null);
      }
    }

    // Dekning (busker og trær) – viktig for snikmodus
    this.inCover = g.features.coverAt(this.pos.x, this.pos.z);

    // Våpen
    if ((input.clicked(2) || input.wasPressed('KeyF')) && !this.swimming) this.attack();
    if (this.attackT >= 0) {
      this.attackT += dt / (WEAPONS[this.weapon].type === 'melee' ? 0.35 : 0.25);
      if (this.attackT >= 1) this.attackT = -1;
    }

    // Fotsteg
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 1) {
      this.stepT -= dt * hs;
      if (this.stepT <= 0) {
        this.stepT = this.running ? 2.2 : 1.7;
        const biome = gen.biomeAt(this.pos.x, this.pos.z);
        const surf = d2 > 0.05 ? 'water' : biome === 'ice' ? 'snow' : biome === 'desert' ? 'sand' : 'grass';
        if (!this.crouch) g.audio.step(surf);
        if (this.running && Math.random() < 0.5) {
          g.particles.burst(surf === 'snow' ? 'snow' : surf === 'water' ? 'splash' : 'dust', { x: this.pos.x, y: this.pos.y + 0.1, z: this.pos.z }, 2, { speed: 1.2 });
        }
      }
    }

    // Kropp
    if (hs > 0.3) this.heading = Math.atan2(this.vel.x, this.vel.z);
    if (this.cameraMode === 'first' || this.attackT >= 0 || (WEAPONS[this.weapon].type === 'ranged' && !this.running)) {
      this.heading = this.yaw + Math.PI;
    }
    this.rig.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    let rh = this.rig.root.rotation.y;
    let dd = this.heading - rh;
    dd = Math.atan2(Math.sin(dd), Math.cos(dd));
    this.rig.root.rotation.set(0, rh + dd * (1 - Math.exp(-12 * dt)), 0);
    const pose = this.swimming ? 'swim' : this.crouch ? 'crouch' : 'stand';
    this.rig.update(dt, {
      speed: hs, pose,
      attack: this.attackT >= 0 && WEAPONS[this.weapon].type === 'melee' ? this.attackT : -1,
      holdRanged: WEAPONS[this.weapon].type === 'ranged' && !this.running,
    });
    this.eyeH = damp(this.eyeH, this.swimming ? (this.crouch ? 0.6 : 1.5) : this.crouch ? 1.05 : 1.65, 10, dt);
  }

  attack() {
    if (this.cooldown > 0 || this.vehicle) return;
    const w = WEAPONS[this.weapon];
    this.cooldown = w.cooldown;
    this.attackT = 0;
    const g = this.game;
    if (w.type === 'melee') {
      g.audio.swing();
      g.combat.melee(this, w);
    } else {
      g.combat.fireProjectile(this, w);
    }
  }

  // ---------------------------------------------------------------------
  updateCamera(dt, camera) {
    const g = this.game;
    const v = this.vehicle;
    const first = this.cameraMode === 'first';
    const shake = g.camShake;
    camera.rotation.order = 'YXZ';
    if (first) {
      if (v) {
        _v.set(0, 0, 0);
        v.seatWorld(_v);
        camera.position.set(_v.x, _v.y + v.cfg.eye, _v.z);
      } else {
        const bob = this.onGround && this.isMoving ? Math.sin(this.rig.phase * 2) * 0.04 * clamp(this.speed2D / 5, 0, 1) : 0;
        camera.position.set(this.pos.x, this.pos.y + this.eyeH + bob, this.pos.z);
      }
      camera.rotation.set(this.pitch, this.yaw, 0);
    } else {
      const pivot = _v;
      let dist, shoulder;
      if (v) {
        pivot.set(v.pos.x, v.pos.y + v.cfg.camHeight, v.pos.z);
        dist = v.cfg.camDist + v.speedFrac * 2;
        shoulder = 0;
      } else {
        pivot.set(this.pos.x, this.pos.y + (this.swimming ? 1.2 : this.crouch ? 1.15 : 1.6), this.pos.z);
        dist = this.crouch ? 3.0 : 3.6;
        shoulder = 0.55;
      }
      const cp = Math.cos(this.pitch);
      _fwd.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      pivot.x += rx * shoulder;
      pivot.z += rz * shoulder;
      // Unngå at kameraet går gjennom terrenget
      const back = _v2.copy(_fwd).multiplyScalar(-1);
      const hit = g.gen.raycast(pivot, back, dist + 0.5);
      if (hit > 0) dist = Math.max(0.8, hit - 0.5);
      camera.position.copy(pivot).addScaledVector(_fwd, -dist);
      // Ikke la kameraet havne inne i en trekrone
      while (dist > 1.2 && this.cameraInFoliage(camera.position)) {
        dist -= 0.6;
        camera.position.copy(pivot).addScaledVector(_fwd, -dist);
      }
      const gy = g.gen.groundHeight(camera.position.x, camera.position.z) + 0.35;
      if (camera.position.y < gy) camera.position.y = gy;
      camera.rotation.set(this.pitch, this.yaw, 0);
    }
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.25;
      camera.position.y += (Math.random() - 0.5) * shake * 0.25;
      camera.rotation.z = (Math.random() - 0.5) * shake * 0.03;
    }
    // Synlighet for egen modell og våpen i førsteperson
    this.rig.root.visible = !first;
    const showVM = first && !v && !this.swimming;
    this.viewModel.visible = showVM;
    if (showVM) this.animateViewModel(dt);
  }

  cameraInFoliage(pos) {
    const list = this.game.features.collidersNear(pos.x, pos.z, 3, this._camTmp || (this._camTmp = []));
    for (const c of list) {
      const f = FOLIAGE[c.type];
      if (!f) continue;
      const dy = pos.y - c.y;
      if (dy < f.y0 * c.s || dy > f.y1 * c.s) continue;
      const rr = f.r * c.s;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  animateViewModel(dt) {
    const vm = this.viewModel;
    const t = this.rig.phase;
    const moving = this.isMoving && this.onGround;
    const bobX = moving ? Math.sin(t) * 0.02 : 0;
    const bobY = moving ? Math.abs(Math.cos(t)) * 0.02 : Math.sin(performance.now() * 0.0015) * 0.004;
    let rx = 0, ry = 0, rz = 0, px = 0.3 + bobX, py = -0.32 + bobY - (this.crouch ? 0.03 : 0), pz = -0.55;
    const w = WEAPONS[this.weapon];
    if (this.attackT >= 0) {
      const a = this.attackT;
      if (w.type === 'melee') {
        const k = a < 0.3 ? a / 0.3 : 1 - (a - 0.3) / 0.7;
        rx = (a < 0.3 ? 0.9 * k : -1.3 * Math.sin((a - 0.3) / 0.7 * Math.PI) + 0.9 * (1 - (a - 0.3) / 0.7));
        rz = -0.6 * Math.sin(a * Math.PI);
        px -= 0.15 * Math.sin(a * Math.PI);
      } else {
        pz += 0.08 * Math.sin(a * Math.PI);
        rx = 0.15 * Math.sin(a * Math.PI);
      }
    }
    if (w.type === 'ranged') { px = 0.22 + bobX; py = -0.25 + bobY; }
    vm.position.set(lerp(vm.position.x, px, 0.5), lerp(vm.position.y, py, 0.5), lerp(vm.position.z, pz, 0.5));
    vm.rotation.set(rx, ry, rz);
  }
}
