// Side-quests: finne mistede ting, mate/gi vann til dyr, gi medisin og befri fangede dyr.
import { REWARDS, ITEM_INFO } from '../config.js';
import { createBackpack, createQuestBeacon } from '../models/props.js';
import { randInt } from '../utils/math.js';

const BAG_COLORS = [0xc0392b, 0x2980b9, 0x27ae60, 0x8e44ad, 0xd35400];

export class QuestManager {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.beacon = createQuestBeacon();
    this.beacon.visible = false;
    game.scene.add(this.beacon);
  }

  reset() {
    if (this.active?.item) this.game.scene.remove(this.active.item);
    this.active = null;
    this.beacon.visible = false;
  }

  reward(amount, reason) {
    this.game.addCoins(amount, reason);
    this.game.stats.quests++;
    this.game.audio.quest();
  }

  startFetch(npc) {
    const g = this.game;
    if (this.active) {
      g.hud.notify(`Fullfør først: ${this.active.title}`, 'warn');
      g.audio.error();
      return;
    }
    const gen = g.gen;
    let spot = null;
    for (let i = 0; i < 60 && !spot; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = npc.kind === 'ranger' ? 35 + Math.random() * 30 : 45 + Math.random() * 80;
      const x = npc.pos.x + Math.cos(a) * r, z = npc.pos.z + Math.sin(a) * r;
      if (!gen.isInWorld(x, z, 60)) continue;
      const h = gen.groundHeight(x, z);
      if (h < 0.8 || gen.slopeAt(x, z) < 0.75) continue;
      if (g.features.inClearing(x, z, 10) && npc.kind !== 'ranger') continue;
      spot = { x, z, h };
    }
    if (!spot) spot = { x: npc.pos.x + 20, z: npc.pos.z, h: gen.groundHeight(npc.pos.x + 20, npc.pos.z) };
    const item = createBackpack(BAG_COLORS[Math.floor(Math.random() * BAG_COLORS.length)]);
    item.position.set(spot.x, spot.h, spot.z);
    g.scene.add(item);
    npc.questStarted = true;
    npc.setMarker('?', '#9fd3ff');
    this.active = { type: 'fetch', npc, item, state: 'find', title: `Finn ${npc.name}s ryggsekk` };
    g.hud.dialog(`${npc.title} ${npc.name}`, npc.line);
    g.hud.notify('Nytt oppdrag! Følg den gule markøren.', 'quest');
    g.audio.quest();
  }

  pickup() {
    const g = this.game;
    const q = this.active;
    if (!q) return;
    g.scene.remove(q.item);
    q.item = null;
    q.state = 'return';
    q.title = `Gi sekken tilbake til ${q.npc.name}`;
    q.npc.setMarker('!', '#7dff9a');
    g.hud.notify('Du fant ryggsekken! 🎒 Gå tilbake med den.', 'quest');
    g.audio.coin();
  }

  completeFetch() {
    const q = this.active;
    if (!q) return;
    const amount = randInt(Math.random, REWARDS.fetch[0], REWARDS.fetch[1]) + (q.npc.kind === 'ranger' ? 40 : 0);
    this.game.hud.dialog(`${q.npc.title} ${q.npc.name}`, 'Tusen takk! Her er en belønning. Lykke til med å stoppe krypskytterne!');
    q.npc.helped();
    this.active = null;
    this.beacon.visible = false;
    this.reward(amount, 'Oppdrag fullført');
  }

  giveMedicine(npc) {
    const g = this.game;
    const inv = g.player.inventory;
    const item = inv.medicine > 0 ? 'medicine' : inv.medkit > 0 ? 'medkit' : null;
    if (!item) {
      g.hud.dialog(`${npc.title} ${npc.name}`, npc.line);
      g.hud.notify('Du har ingen medisin. Kjøp i butikken (B).', 'warn');
      g.audio.error();
      return;
    }
    inv[item]--;
    g.particles.burst('heal', npc.pos.clone().setY(npc.pos.y + 0.8), 20);
    g.hud.dialog(`${npc.title} ${npc.name}`, 'Å, det hjalp! Tusen takk – ta disse myntene.');
    npc.helped();
    this.reward(randInt(Math.random, REWARDS.medicine[0], REWARDS.medicine[1]), 'Hjalp en skadet klatrer');
  }

  feedAnimal(a) {
    const g = this.game;
    const item = a.need;
    if (g.player.inventory[item] <= 0) {
      g.hud.notify(`Du trenger ${ITEM_INFO[item].name.toLowerCase()}. Kjøp i butikken (B) under «Mat og vann til dyr».`, 'warn');
      g.audio.error();
      return;
    }
    g.player.inventory[item]--;
    const range = item === 'food' ? REWARDS.feed : REWARDS.water;
    g.particles.burst('hearts', a.pos.clone().setY(a.pos.y + a.height), 14);
    a.helped();
    this.reward(randInt(Math.random, range[0], range[1]), item === 'food' ? `Matet ${a.name}` : `Ga vann til ${a.name}`);
  }

  freeCage(cage) {
    const g = this.game;
    cage.freed = true;
    cage.runT = 3;
    cage.mesh.userData.door.rotation.y = -1.8;
    g.particles.burst('hearts', cage.pos.clone().setY(cage.pos.y + 1.2), 16);
    g.stats.animalsFreed++;
    this.reward(REWARDS.cage, 'Befridde et fanget dyr');
    // Støy kan vekke krypskyttere i nærheten
    for (const p of g.entities.poachers) {
      if (p.alive && p.pos.distanceTo(cage.pos) < 22 && !g.player.crouch) p.awareness = Math.min(1, p.awareness + 0.5);
    }
  }

  update(dt, time) {
    const q = this.active;
    if (!q) {
      this.beacon.visible = false;
      return;
    }
    if (q.npc.removed) {
      if (q.item) this.game.scene.remove(q.item);
      this.active = null;
      this.game.hud.notify('Oppdraget ble avbrutt.', 'warn');
      return;
    }
    const target = this.target();
    this.beacon.visible = true;
    this.beacon.position.copy(target);
    if (q.item) {
      q.item.rotation.y += dt * 1.5;
      q.item.children[0].position.y = 0.15 + Math.sin(time * 3) * 0.1;
    }
  }

  target() {
    const q = this.active;
    if (!q) return null;
    return q.state === 'find' ? q.item.position : q.npc.pos;
  }
}

