// Vennlige mennesker som trenger hjelp (side-quests).
import * as THREE from 'three';
import { HumanRig } from '../models/characters.js';
import { makeIconSprite } from '../models/geo.js';
import { moveToward, snapToGround } from './ai.js';
import { dampAngle } from '../utils/math.js';

const NAMES = ['Kari', 'Ola', 'Ingrid', 'Lars', 'Aisha', 'Mats', 'Sofie', 'Emil', 'Nora', 'Jonas', 'Leah', 'Amir', 'Sigrid', 'Henrik', 'Maja', 'Tobias'];
const LOOKS = [
  { shirt: 0x2d7dd2, pants: 0x30343f, hat: 'beanie', hatColor: 0xe0443a, backpack: 0xe0a030 },
  { shirt: 0xd9483b, pants: 0x3a3f4a, hat: 'cap', hatColor: 0x222222, backpack: 0x3b5998 },
  { shirt: 0xf2c94c, pants: 0x4a4a4a, hat: null, backpack: 0x6a8a3a },
  { shirt: 0x9b59b6, pants: 0x2e2e3a, hat: 'beanie', hatColor: 0x5ac8fa, backpack: null },
  { shirt: 0xf0f0f0, pants: 0x5a6a7a, hat: 'ranger', hatColor: 0x9a7a4a, backpack: 0x7a5a3a },
];
const SKINS = [0xf1c8a5, 0xd9a77e, 0xb98060, 0x8d5a3c, 0x6b4430];
const HAIRS = [0x2a1a10, 0x6a4a2a, 0xd8b56a, 0x111111, 0x8a3a1a];

export class NPC {
  /** kind: 'lost' (har mistet sekken) | 'injured' (trenger medisin) | 'ranger' (introduksjon) */
  constructor(game, kind, x, z, opts = {}) {
    this.game = game;
    this.kind = kind;
    const r = (n) => Math.floor(Math.random() * n);
    const look = opts.look || LOOKS[r(LOOKS.length)];
    this.rig = new HumanRig({ ...look, skin: SKINS[r(SKINS.length)], hair: HAIRS[r(HAIRS.length)] });
    this.group = this.rig.root;
    game.scene.add(this.group);
    this.name = opts.name || NAMES[r(NAMES.length)];
    this.title = opts.title || (kind === 'injured' ? 'Skadet klatrer' : 'Turgåer');
    this.pos = new THREE.Vector3(x, 0, z);
    snapToGround(this, game, 0);
    this.heading = Math.random() * Math.PI * 2;
    this.need = kind === 'injured' ? 'medicine' : kind === 'lost' || kind === 'ranger' ? 'fetch' : null;
    this.questStarted = false;
    this.state = 'idle';
    this.leaveT = 0;
    this.removed = false;
    this.t = Math.random() * 10;
    this.curSpeed = 0;
    this.marker = makeIconSprite('!', '#ffd34a', '#3a2a00', 0.85);
    this.marker.position.y = 2.5;
    this.group.add(this.marker);
    this.height = 1.9;
  }

  get line() {
    if (this.kind === 'injured') return 'Au! Jeg har vridd ankelen. Har du litt medisin?';
    if (this.kind === 'ranger') return 'Velkommen, Naturens helt! Jeg mistet sekken min i nærheten – kan du finne den?';
    return 'Hjelp! Jeg har mistet ryggsekken min et sted her ute. Kan du finne den?';
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const p = g.player;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    this.group.visible = d < g.env.fogFar;
    let pose = this.kind === 'injured' && this.state === 'idle' ? 'sitGround' : 'stand';
    let speed = 0;
    if (this.state === 'happy') {
      pose = 'cheer';
      this.leaveT -= dt;
      if (this.leaveT <= 0) {
        this.state = 'leave';
        this.leaveT = 30;
        const a = Math.random() * Math.PI * 2;
        this.target = new THREE.Vector3(this.pos.x + Math.cos(a) * 120, 0, this.pos.z + Math.sin(a) * 120);
      }
    } else if (this.state === 'leave') {
      moveToward(this, g, this.target.x, this.target.z, 2.2, dt, 3);
      speed = this.curSpeed;
      this.leaveT -= dt;
      if (this.leaveT <= 0 || this.blocked > 2) this.despawn();
    } else if (d < 14) {
      this.heading = dampAngle(this.heading, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), 3, dt);
      if (this.kind !== 'injured' && !this.questStarted && d > 4) pose = 'wave';
    }
    snapToGround(this, g, dt);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    this.rig.update(dt, { speed, pose });
    if (this.marker) {
      this.marker.position.y = (pose === 'sitGround' ? 1.6 : 2.45) + Math.sin(this.t * 3) * 0.08;
    }
  }

  setMarker(text, bg) {
    if (this.marker) this.group.remove(this.marker);
    this.marker = text ? makeIconSprite(text, bg, '#3a2a00', 0.85) : null;
    if (this.marker) this.group.add(this.marker);
  }

  helped() {
    this.need = null;
    this.state = 'happy';
    this.leaveT = 3.5;
    this.setMarker(null);
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
