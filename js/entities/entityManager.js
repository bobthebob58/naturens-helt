// Holder styr på alle figurer i verden: krypskyttere, leirer, dyr, mennesker og interaksjoner.
import * as THREE from 'three';
import { VEHICLES, ITEM_INFO } from '../config.js';
import { Poacher } from './poacher.js';
import { Animal } from './animal.js';
import { NPC } from './npc.js';
import { generateCamps, buildCamp } from '../world/camps.js';
import { dist2D } from '../utils/math.js';
import { species, capitalize } from '../levels/fauna.js';

const _v = new THREE.Vector3();

export class EntityManager {
  constructor(game) {
    this.game = game;
    this.poachers = [];
    this.animals = [];
    this.npcs = [];
    this.camps = [];
    this.campObjs = [];
    this.cages = [];
    this._hittables = [];
    this.spawnT = 0;
    this.friendlyT = 8;
  }

  reset() {
    for (const p of this.poachers) p.dispose();
    for (const a of this.animals) a.dispose();
    for (const n of this.npcs) n.dispose();
    for (const c of this.campObjs) this.game.scene.remove(c.group);
    this.poachers = [];
    this.animals = [];
    this.npcs = [];
    this.camps = [];
    this.campObjs = [];
    this.cages = [];
    this.spawnT = 0;
    this.friendlyT = 8;
  }

  /** Lag leirer og krypskyttere. Må kalles FØR terrengbiter genereres (lysninger). */
  setupCamps(save) {
    const g = this.game;
    this.camps = generateCamps(g.gen, g.difficulty);
    for (const camp of this.camps) g.features.addClearing(camp.x, camp.z, 18);
    g.features.addClearing(g.gen.spawn.x, g.gen.spawn.z, 9);
    const stopped = new Set(save?.stoppedPoachers || []);
    const freed = new Set(save?.freedCages || []);
    const discovered = new Set(save?.discoveredCamps || []);
    for (const camp of this.camps) {
      const obj = buildCamp(g, camp);
      this.campObjs.push(obj);
      g.extraColliders.push(...obj.colliders);
      camp.obj = obj;
      if (discovered.has(camp.id)) camp.discovered = true;
      if (obj.cage) {
        if (freed.has(obj.cage.id)) {
          obj.cage.freed = true;
          obj.cage.mesh.remove(obj.cage.rig.root);
          obj.cage.mesh.userData.door.rotation.y = -1.8;
        }
        this.cages.push(obj.cage);
      }
      for (let i = 0; i < camp.size; i++) {
        const id = `p-${camp.id}-${i}`;
        if (stopped.has(id)) continue;
        const a = (i / camp.size) * Math.PI * 2;
        const p = new Poacher(g, {
          id, camp, seed: camp.seed + i * 101,
          x: camp.x + Math.cos(a) * 4, z: camp.z + Math.sin(a) * 4,
          homeRadius: camp.solitary ? 70 : 20,
        });
        this.poachers.push(p);
      }
    }
    g.stats.totalPoachers = this.camps.reduce((s, c) => s + c.size, 0);
    g.stats.stopped = stopped.size;
  }

  /** Første oppdrag: en skogvokter nær startpunktet. */
  spawnIntroNPC() {
    const g = this.game;
    const s = g.gen.spawn;
    const x = s.x + 9, z = s.z - 7;
    const npc = new NPC(g, 'ranger', x, z, {
      name: 'Siri', title: g.gen.level.ranger || 'Skogvokter',
      look: { shirt: 0x3d7a4a, pants: 0x4a4031, hat: 'ranger', hatColor: 0x8d6e3f, backpack: null, vest: 0x56663c },
    });
    this.npcs.push(npc);
  }

  hittables() {
    const out = this._hittables;
    out.length = 0;
    const p = this.game.player.pos;
    for (const e of this.poachers) if (e.alive && e.active) out.push(e);
    for (const a of this.animals) if (a.alive && Math.abs(a.pos.x - p.x) < 200 && Math.abs(a.pos.z - p.z) < 200) out.push(a);
    return out;
  }

  remainingPoachers() {
    return this.poachers.filter((p) => p.state !== 'arrested').length;
  }

  update(dt) {
    const g = this.game;
    for (const p of this.poachers) p.update(dt);
    this.poachers = this.poachers.filter((p) => !p.removed);
    for (const a of this.animals) a.update(dt);
    this.animals = this.animals.filter((a) => !a.removed);
    for (const n of this.npcs) n.update(dt);
    this.npcs = this.npcs.filter((n) => !n.removed);

    // Leir-effekter og oppdagelse
    const pp = g.player.pos;
    for (const c of this.campObjs) {
      const camp = this.camps[this.campObjs.indexOf(c)];
      const d = dist2D(pp.x, pp.z, camp.x, camp.z);
      c.group.visible = d < g.env.fogFar + 80;
      if (d < 200 && c.fire) {
        const f = c.fire.userData.flame;
        f.scale.set(1 + Math.sin(g.time * 13 + camp.id) * 0.1, 1 + Math.sin(g.time * 17) * 0.18, 1 + Math.cos(g.time * 11) * 0.1);
        if (Math.random() < dt * 4) g.particles.burst('smoke', _v.set(c.fire.position.x, c.fire.position.y + 1.2, c.fire.position.z), 1);
        if (Math.random() < dt * 10) g.particles.burst('fire', _v.set(c.fire.position.x, c.fire.position.y + 0.4, c.fire.position.z), 1);
      }
      if (!camp.discovered && d < 75) {
        camp.discovered = true;
        g.hud.notify('⛺ Krypskytterleir oppdaget! Den er merket på kartet.', 'warn');
        g.audio.alert();
      }
    }
    // Befridde dyr løper sin vei
    for (const cage of this.cages) {
      if (cage.freed && cage.runT > 0) {
        cage.runT -= dt;
        const r = cage.rig.root;
        r.position.z += dt * 4;
        cage.rig.update(dt, 4, 'walk');
        if (cage.runT <= 0) cage.mesh.remove(r);
      }
    }

    // Spawn/despawn
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1.5;
      this.spawnTick();
    }
  }

  spawnTick() {
    const g = this.game;
    const p = g.player.pos;
    const gen = g.gen;
    // Fjern dyr langt unna
    for (const a of this.animals) {
      const d = dist2D(a.pos.x, a.pos.z, p.x, p.z);
      if (a.hostile && d > 320 && a.state !== 'chase') a.despawn();
      if (!a.hostile && d > 420) a.despawn();
    }
    for (const n of this.npcs) {
      const d = dist2D(n.pos.x, n.pos.z, p.x, p.z);
      if (d > 450 && !(g.quests.active && g.quests.active.npc === n)) n.despawn();
    }
    // Rovdyr
    const safe = g.time < 25 || dist2D(p.x, p.z, gen.spawn.x, gen.spawn.z) < 110;
    const landHostile = this.animals.filter((a) => a.hostile && !a.aquatic && !a.amphibious).length;
    if (!safe && landHostile < g.difficulty.maxPredators) {
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 95 + Math.random() * 80;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (!gen.isInWorld(x, z, 60)) continue;
        const h = gen.groundHeight(x, z);
        if (h < 1 || gen.slopeAt(x, z) < 0.75) continue;
        if (dist2D(x, z, gen.spawn.x, gen.spawn.z) < 120) continue;
        if (this.camps.some((c) => dist2D(x, z, c.x, c.z) < 50)) continue;
        if (g.features.blockedAt(x, z, 1.5)) continue;
        const table = gen.biomeDef(x, z).fauna?.predators;
        if (!table || !table.length) continue;
        let roll = Math.random(), type = table[0][0];
        for (const [t, w] of table) { roll -= w; if (roll <= 0) { type = t; break; } }
        const sp = species(type);
        const pack = sp.pack ? sp.pack[0] + Math.floor(Math.random() * (sp.pack[1] - sp.pack[0] + 1)) : 1;
        for (let k = 0; k < pack; k++) this.animals.push(new Animal(g, type, x + k * 2.5, z + k * 1.5, { hostile: true }));
        break;
      }
    }
    // Vannrovdyr (hai i dypt vann, krokodiller i sump osv.)
    const sharks = this.animals.filter((a) => a.hostile && (a.aquatic || a.amphibious)).length;
    const maxSharks = g.difficulty.key === 'hard' ? 3 : 2;
    if (!safe && sharks < maxSharks && Math.random() < 0.4) {
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 50 + Math.random() * 90;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (!gen.isInWorld(x, z, 30)) continue;
        const type = gen.biomeDef(x, z).fauna?.aquatic;
        if (!type) continue;
        const sp = species(type);
        const need = sp.habitat === 'water' ? 3.5 : 0.8;
        if (gen.waterDepth(x, z) > need) {
          this.animals.push(new Animal(g, type, x, z, { hostile: true }));
          break;
        }
      }
    }
    // Vennlige figurer med oppdrag
    this.friendlyT -= 1.5;
    const friendlies = this.animals.filter((a) => !a.hostile && a.need).length + this.npcs.filter((n) => n.need).length;
    if (this.friendlyT <= 0 && friendlies < 3) {
      this.friendlyT = 15 + Math.random() * 20;
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 55 + Math.random() * 90;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (!gen.isInWorld(x, z, 60)) continue;
        const h = gen.groundHeight(x, z);
        if (h < 1 || gen.slopeAt(x, z) < 0.8) continue;
        if (this.camps.some((c) => dist2D(x, z, c.x, c.z) < 90)) continue;
        if (this.poachers.some((pc) => dist2D(x, z, pc.pos.x, pc.pos.z) < 60)) continue;
        if (g.features.blockedAt(x, z, 1.5)) continue;
        const list = gen.biomeDef(x, z).fauna?.friendly || [];
        if (Math.random() < 0.55 && list.length) {
          const type = list[Math.floor(Math.random() * list.length)];
          this.animals.push(new Animal(g, type, x, z, { need: Math.random() < 0.55 ? 'food' : 'water' }));
        } else {
          this.npcs.push(new NPC(g, Math.random() < 0.6 ? 'lost' : 'injured', x, z));
        }
        break;
      }
    }
  }

  /** Finn det nærmeste spilleren kan samhandle med. */
  findInteractable() {
    const g = this.game;
    const p = g.player;
    if (p.vehicle) return { label: `Gå ut av ${p.vehicle.cfg.name.toLowerCase()}`, action: () => p.exitVehicle() };
    let best = null, bestD = 1e9;
    const consider = (d, max, obj) => {
      if (d < max && d < bestD) {
        bestD = d;
        best = obj;
      }
    };
    // Skattekister
    const near = g.nearestChest;
    if (near.chest) {
      const c = near.chest;
      consider(near.dist, 2.8, { label: 'Åpne skattekiste', action: () => g.openChest(c) });
    }
    // Oppdragsgjenstand
    const q = g.quests.active;
    if (q && q.item && q.state === 'find') {
      consider(q.item.position.distanceTo(p.pos), 2.8, { label: 'Plukk opp ryggsekken', action: () => g.quests.pickup() });
    }
    // Mennesker
    for (const n of this.npcs) {
      if (n.state !== 'idle') continue;
      const d = n.pos.distanceTo(p.pos);
      if (n.need === 'medicine') {
        const has = p.inventory.medicine + p.inventory.medkit > 0;
        consider(d, 3.2, { label: has ? `Gi medisin til ${n.name}` : `${n.name} trenger medisin (kjøp i butikken)`, action: () => g.quests.giveMedicine(n) });
      } else if (n.need === 'fetch') {
        if (q && q.npc === n) {
          if (q.state === 'return') consider(d, 3.2, { label: `Gi ryggsekken til ${n.name}`, action: () => g.quests.completeFetch() });
          else consider(d, 3.2, { label: `${n.name}: «Har du funnet sekken min?»`, action: () => g.hud.notify('Følg den gule markøren på kartet.') });
        } else {
          consider(d, 3.2, { label: `Snakk med ${n.title.toLowerCase()} ${n.name}`, action: () => g.quests.startFetch(n) });
        }
      }
    }
    // Vennlige dyr
    for (const a of this.animals) {
      if (a.hostile || !a.need || a.state !== 'idle') continue;
      const d = a.pos.distanceTo(p.pos);
      const item = a.need;
      const info = ITEM_INFO[item];
      const has = p.inventory[item] > 0;
      const label = has
        ? `Gi ${info.name.toLowerCase()} til ${a.name} (${p.inventory[item]} igjen)`
        : `${capitalize(a.name)} er ${item === 'food' ? 'sulten' : 'tørst'} – du trenger ${info.name.toLowerCase()}`;
      consider(d, 3.4, { label, action: () => g.quests.feedAnimal(a) });
    }
    // Bur
    for (const c of this.cages) {
      if (c.freed) continue;
      consider(c.pos.distanceTo(p.pos), 3.0, { label: 'Slipp fri det fangede dyret', action: () => g.quests.freeCage(c) });
    }
    // Kjøretøy
    for (const type of p.ownedVehicles) {
      const v = g.vehicles[type];
      if (!v || !v.group.visible) continue;
      const d = v.pos.distanceTo(p.pos);
      consider(d, v.cfg.collideRadius + 2.6, { label: `Stig på ${VEHICLES[type].name.toLowerCase()}`, action: () => p.enterVehicle(v) });
    }
    return best;
  }

  /** Data til minikartet. */
  mapMarkers() {
    const out = [];
    for (const p of this.poachers) if (p.alive && (p.spotted || p.state === 'alert')) out.push({ x: p.pos.x, z: p.pos.z, type: p.state === 'alert' ? 'enemyAlert' : 'enemy' });
    for (const a of this.animals) {
      if (a.hostile && a.alive && a.state === 'chase') out.push({ x: a.pos.x, z: a.pos.z, type: 'animal' });
      if (!a.hostile && a.need) out.push({ x: a.pos.x, z: a.pos.z, type: 'quest' });
    }
    for (const n of this.npcs) if (n.need && n.state === 'idle') out.push({ x: n.pos.x, z: n.pos.z, type: 'quest' });
    for (const c of this.cages) if (!c.freed && c.camp.discovered) out.push({ x: c.pos.x, z: c.pos.z, type: 'cage' });
    return out;
  }
}


