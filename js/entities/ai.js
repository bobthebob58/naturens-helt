// Felles sanselogikk for fiender: synsradius, synsfelt, hørsel og "oppmerksomhet".
// Fiender vet IKKE hvor spilleren er før de faktisk ser eller hører ham.
import { angleDiff, clamp, damp, dampAngle } from '../utils/math.js';
import { makeIconSprite } from '../models/geo.js';

/**
 * Oppdaterer e.awareness (0..1). Returnerer info om spilleren.
 * opts: { sightMult, fov (radianer), eyeH }
 */
export function perceive(e, game, dt, opts) {
  const p = game.player;
  const diff = game.difficulty;
  const dx = p.pos.x - e.pos.x;
  const dz = p.pos.z - e.pos.z;
  const dy = p.pos.y - e.pos.y;
  const dist2 = Math.hypot(dx, dz);
  const dist = Math.hypot(dx, dy, dz);
  const vis = p.visibilityFactor();
  const sight = diff.sightRadius * (opts.sightMult ?? 1) * vis;
  let seen = false;
  let heard = false;
  e.losT = (e.losT ?? 0) - dt;
  let peripheral = false;
  if (dist < sight && !p.dead) {
    const ang = Math.abs(angleDiff(e.heading, Math.atan2(dx, dz)));
    const inFov = ang < (opts.fov ?? 2.2) / 2;
    // Perifert syn på kort hold – men ikke når spilleren sniker
    peripheral = !inFov && !p.crouch && dist < sight * 0.35;
    if (inFov || peripheral || dist < 3.5 * vis) {
      if (e.losT <= 0) {
        e.losT = 0.2 + Math.random() * 0.1;
        const eyeY = e.pos.y + (opts.eyeH ?? 1.6);
        const targetY = p.pos.y + (p.crouch ? 0.9 : 1.3);
        e.losCache = game.gen.lineOfSight(e.pos.x, eyeY, e.pos.z, p.pos.x, targetY, p.pos.z) &&
          !game.features.segmentBlocked(e.pos.x, eyeY, e.pos.z, p.pos.x, targetY, p.pos.z);
      }
      seen = !!e.losCache;
    }
  }
  const nr = p.noiseRadius() * diff.hearMult;
  if (dist < nr && !p.dead) heard = true;
  let gain = 0;
  if (seen) gain = diff.awarenessRate * (0.35 + 1.3 * (1 - dist / sight)) * (peripheral ? 0.5 : 1);
  if (heard) gain = Math.max(gain, diff.awarenessRate * 0.75);
  if (gain > 0) e.awareness = Math.min(1, e.awareness + gain * dt);
  else e.awareness = Math.max(0, e.awareness - dt * 0.1);
  return { dist, dist2, seen, heard, dx, dz };
}

/** Indikator over hodet: ? (mistenksom) eller ! (angriper). */
export class AlertIcon {
  constructor(parent, height) {
    this.q = makeIconSprite('?', '#f5c542', '#2a2000', 0.7);
    this.x = makeIconSprite('!', '#e5484d', '#ffffff', 0.75);
    this.q.position.y = this.x.position.y = height;
    this.q.visible = this.x.visible = false;
    parent.add(this.q, this.x);
  }
  set(level) {
    // level: 0 = ingen, 1 = mistenksom, 2 = alarm
    this.q.visible = level === 1;
    this.x.visible = level === 2;
  }
  pulse(t, awareness) {
    const s = 0.55 + awareness * 0.35 + Math.sin(t * 8) * 0.04;
    this.q.scale.setScalar(s);
  }
}

/** Beveg en bakkebunden enhet mot et punkt. Unngår dypt vann. Returnerer avstand igjen. */
export function moveToward(e, game, tx, tz, speed, dt, turnRate = 6, allowWater = false) {
  const dx = tx - e.pos.x, dz = tz - e.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return 0;
  const target = Math.atan2(dx, dz);
  e.heading = dampAngle(e.heading, target, turnRate, dt);
  const facing = Math.cos(angleDiff(e.heading, target));
  const step = Math.min(d, speed * dt * clamp(facing, 0.2, 1));
  const nx = e.pos.x + Math.sin(e.heading) * step;
  const nz = e.pos.z + Math.cos(e.heading) * step;
  const gen = game.gen;
  if (!allowWater && gen.waterDepth(nx, nz) > 0.7) {
    e.blocked = (e.blocked || 0) + dt;
    e.curSpeed = 0;
    return d;
  }
  if (!gen.isInWorld(nx, nz, 40)) {
    e.blocked = (e.blocked || 0) + dt;
    return d;
  }
  e.blocked = 0;
  e.pos.x = nx;
  e.pos.z = nz;
  e.curSpeed = step / Math.max(dt, 1e-4);
  return d - step;
}

export function snapToGround(e, game, dt) {
  const gh = game.gen.groundHeight(e.pos.x, e.pos.z);
  e.pos.y = dt > 0 ? damp(e.pos.y, gh, 20, dt) : gh;
  if (Math.abs(e.pos.y - gh) > 2) e.pos.y = gh;
}
