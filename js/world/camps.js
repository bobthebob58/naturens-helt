// Krypskytterleirer: plassering i alle biomer, telt, bål, bur med fangede dyr.
import * as THREE from 'three';
import { mulberry32, dist2D } from '../utils/math.js';
import { createTent, createCampfire, createCrate, createCage, createTrophyRack, createContainer } from '../models/props.js';
import { species } from '../levels/fauna.js';
import { BIOMES } from '../levels/levels.js';

function pickCaged(biome, r) {
  const list = BIOMES[biome].fauna?.caged || ['fox'];
  return list[Math.floor(r * list.length) % list.length];
}

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
  // Fordel leirene på alle tre biomer: midten, nord, sør, midten, ...
  const biomes = [gen.bands[1].key, gen.bands[0].key, gen.bands[2].key];
  const camps = [];
  const lim = gen.half * 0.78;
  for (let i = 0; i < groups.length; i++) {
    const want = biomes[i % 3];
    let best = null;
    for (let tries = 0; tries < 600; tries++) {
      const x = (rng() * 2 - 1) * lim;
      const z = (rng() * 2 - 1) * lim;
      const cs = { minH: 2.5, maxH: 62, dryRadius: 18, dryH: 1, slope: 0.88, ...(gen.biomeDef(x, z).camp || {}) };
      const h = gen.height(x, z);
      if (h < cs.minH || h > cs.maxH) continue;
      if (gen.slopeAt(x, z) < cs.slope) continue;
      if (dist2D(x, z, gen.spawn.x, gen.spawn.z) < 320) continue;
      let ok = true;
      // Ikke for nær vann (dyr i bur og telt trenger tørt land)
      for (let k = 0; k < 8 && ok; k++) {
        const a = (k / 8) * Math.PI * 2;
        if (gen.height(x + Math.cos(a) * cs.dryRadius, z + Math.sin(a) * cs.dryRadius) < cs.dryH) ok = false;
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
      cagedType: pickCaged(best.biome, rng()),
      style: BIOMES[best.biome].camp?.style || 'tent',
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
  // r: kollisjonsradius, h: høyde (helikoptre og prosjektiler passerer over)
  const place = (obj, lx, lz, ry = 0, r = 0, h = 1) => {
    const c = Math.cos(camp.rotation), s = Math.sin(camp.rotation);
    const x = camp.x + lx * c - lz * s;
    const z = camp.z + lx * s + lz * c;
    obj.position.set(x, gen.groundHeight(x, z), z);
    obj.rotation.y = camp.rotation + ry;
    group.add(obj);
    if (r > 0) colliders.push({ x, z, r, y: obj.position.y, h });
    return obj;
  };
  const tents = camp.solitary ? 1 : Math.min(3, camp.size);
  if (camp.style === 'container') {
    const cols = [0x2e6da4, 0xb5462f, 0x3f7a4a];
    for (let i = 0; i < tents; i++) {
      const c = place(createContainer(cols[i % 3]), -7 + i * 4.2, -6, 0, 0);
      // Containerne står side om side: den lange lokale Z-aksen (6 m) på tvers av rekken
      const rot = -camp.rotation;
      c.rotation.y = rot;
      for (const k of [-2.1, 0, 2.1]) {
        colliders.push({ x: c.position.x + Math.sin(rot) * k, z: c.position.z + Math.cos(rot) * k, r: 1.35, y: c.position.y, h: 2.7 });
      }
    }
  } else {
    for (let i = 0; i < tents; i++) place(createTent(i % 2 ? 0x6b6b45 : 0x5d6b3a), -6 + i * 5.5, -6, 0, 1.8, 2.3);
  }
  const fire = place(createCampfire(), 0, 2, 0, 0.8, 0.6);
  place(createCrate(), 5, 3, 0.3, 0.7, 0.9);
  if (!camp.solitary) {
    place(createCrate(), 5.6, 4.2, 0.9, 0.7, 0.9);
    place(createTrophyRack(), -4, 5, 0.4, 0.4, 2);
  }
  let cage = null;
  if (camp.hasCage) {
    const cg = place(createCage(), 7.5, -3, -0.5, 1.1, 1.4);
    const rig = species(camp.cagedType).createRig();
    // Buret er 1,6 × 1,2 × 1,3 m innvendig: dyret står på tvers (langs buret), skaleres ned etter sin
    // faktiske utstrekning og sentreres, så ingen deler stikker ut gjennom sprinklene
    rig.root.rotation.y = Math.PI / 2;
    rig.root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(rig.root);
    const size = bb.getSize(new THREE.Vector3()), mid = bb.getCenter(new THREE.Vector3());
    const s = Math.min(1, 1.5 / size.x, 1.1 / size.z, 1.2 / size.y);
    rig.root.scale.setScalar(s);
    rig.root.position.set(-mid.x * s, 0.08 - bb.min.y * s, -mid.z * s);
    cg.add(rig.root);
    cage = { id: `cage-${camp.id}`, camp, mesh: cg, rig, freed: false, pos: cg.position.clone(), type: camp.cagedType, runT: 0 };
  }
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  game.scene.add(group);
  return { group, colliders, fire, cage };
}
