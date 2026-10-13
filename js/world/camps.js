// Krypskytterleirer: plassering i alle biomer, telt, bål, bur med fangede dyr.
import * as THREE from 'three';
import { mulberry32, dist2D } from '../utils/math.js';
import { createTent, createCampfire, createCrate, createCage, createTrophyRack } from '../models/props.js';
import { createAnimalRig } from '../models/characters.js';

const CAGED = { forest: ['fox', 'deer', 'rabbit'], desert: ['fennec', 'fennec', 'rabbit'], ice: ['penguin', 'fox', 'reindeer'] };

/** Velg posisjoner og størrelser for leirene (deterministisk ut fra frø + vanskelighetsgrad). */
export function generateCamps(gen, difficulty) {
  const rng = mulberry32(gen.seed * 13 + difficulty.poachers);
  const total = difficulty.poachers;
  const groups = [];
  let left = total;
  while (left > 0) {
    let n = 1;
    const r = rng();
    if (left >= 3 && r < 0.35) n = 3;
    else if (left >= 2 && r < 0.75) n = 2;
    groups.push(n);
    left -= n;
  }
  const biomes = ['forest', 'ice', 'desert'];
  const camps = [];
  const lim = gen.half * 0.78;
  for (let i = 0; i < groups.length; i++) {
    const want = biomes[i % 3];
    let best = null;
    for (let tries = 0; tries < 600; tries++) {
      const x = (rng() * 2 - 1) * lim;
      const z = (rng() * 2 - 1) * lim;
      const h = gen.height(x, z);
      if (h < 2.5 || h > 62) continue;
      if (gen.slopeAt(x, z) < 0.88) continue;
      if (dist2D(x, z, gen.spawn.x, gen.spawn.z) < 320) continue;
      let ok = true;
      // Ikke for nær vann (dyr i bur og telt trenger tørt land)
      for (let k = 0; k < 8 && ok; k++) {
        const a = (k / 8) * Math.PI * 2;
        if (gen.height(x + Math.cos(a) * 18, z + Math.sin(a) * 18) < 1) ok = false;
      }
      if (!ok) continue;
      const minSep = tries < 400 ? 420 : 250;
      for (const c of camps) if (dist2D(x, z, c.x, c.z) < minSep) ok = false;
      if (!ok) continue;
      const biome = gen.biomeAt(x, z);
      if (biome !== want && tries < 300) continue;
      best = { x, z, biome };
      break;
    }
    if (!best) continue;
    const n = groups[i];
    const ang = rng() * Math.PI * 2;
    const rr = 30 + rng() * 80;
    camps.push({
      id: i,
      x: best.x,
      z: best.z,
      biome: best.biome,
      size: n,
      solitary: n === 1,
      hasCage: n >= 2 || rng() < 0.4,
      cagedType: CAGED[best.biome][Math.floor(rng() * 3)],
      rumorX: best.x + Math.cos(ang) * rr,
      rumorZ: best.z + Math.sin(ang) * rr,
      rotation: rng() * Math.PI * 2,
      discovered: false,
      seed: Math.floor(rng() * 1e9),
    });
  }
  // Fyll opp hvis noen grupper ikke fikk plass (alle krypskyttere må finnes)
  const placed = camps.reduce((s, c) => s + c.size, 0);
  if (placed < total && camps.length) camps[camps.length - 1].size += total - placed;
  return camps;
}

/** Bygg leirens 3D-objekter og registrer kollisjoner. */
export function buildCamp(game, camp) {
  const gen = game.gen;
  const group = new THREE.Group();
  const colliders = [];
  const place = (obj, lx, lz, ry = 0, r = 0) => {
    const c = Math.cos(camp.rotation), s = Math.sin(camp.rotation);
    const x = camp.x + lx * c - lz * s;
    const z = camp.z + lx * s + lz * c;
    obj.position.set(x, gen.groundHeight(x, z), z);
    obj.rotation.y = camp.rotation + ry;
    group.add(obj);
    if (r > 0) colliders.push({ x, z, r, y: obj.position.y });
    return obj;
  };
  const tents = camp.solitary ? 1 : Math.min(3, camp.size);
  for (let i = 0; i < tents; i++) place(createTent(i % 2 ? 0x6b6b45 : 0x5d6b3a), -6 + i * 5.5, -6, 0, 1.8);
  const fire = place(createCampfire(), 0, 2, 0, 0.8);
  place(createCrate(), 5, 3, 0.3, 0.7);
  if (!camp.solitary) {
    place(createCrate(), 5.6, 4.2, 0.9, 0.7).position.y += 0.0;
    place(createTrophyRack(), -4, 5, 0.4, 0.4);
  }
  let cage = null;
  if (camp.hasCage) {
    const cg = place(createCage(), 7.5, -3, -0.5, 1.1);
    const rig = createAnimalRig(camp.cagedType);
    const s = camp.cagedType === 'deer' || camp.cagedType === 'reindeer' ? 0.6 : 1;
    rig.root.scale.setScalar(s);
    rig.root.position.set(0, 0.08, -0.1);
    cg.add(rig.root);
    cage = { id: `cage-${camp.id}`, camp, mesh: cg, rig, freed: false, pos: cg.position.clone(), type: camp.cagedType, runT: 0 };
  }
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  game.scene.add(group);
  return { group, colliders, fire, cage };
}
