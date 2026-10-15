// Raske kontroller uten nettleser (kjøres i GitHub Actions): `npm run check`
//  - verdensgenerering for alle baner (startpunkt, endelige høyder, biomvekter)
//  - all vegetasjon har vegInfo og en gyldig 3D-modell, og trekantbudsjettet per terrengbit holdes
//  - alle dyr som biomene bruker finnes, kan lages og tåler alle animasjonstilstander
//  - krypskytterleirer: riktig antall krypskyttere, på land, og dyret får plass i buret
// Avslutter med kode 1 ved feil. Kjør `npm install` først (three hentes fra node_modules).

// Leirbålet tegner et glødebilde på et <canvas> – en liten erstatning holder i Node
const ctx = new Proxy({}, { get: (t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}), set: () => true });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const THREE = await import('three');
const { WorldGen } = await import('../js/world/worldgen.js');
const { FeatureStore } = await import('../js/world/features.js');
const { LEVELS, BIOMES, VEG_INFO } = await import('../js/levels/levels.js');
const { vegGeometry } = await import('../js/levels/models.js');
const { SPECIES } = await import('../js/levels/fauna.js');
const { generateCamps, buildCamp } = await import('../js/world/camps.js');
const { DIFFICULTY } = await import('../js/config.js');

const SEEDS = [12345, 777];
const MODEL_TRIS_WARN = 1500; // kontrakten i js/levels/README.md
const CHUNK_TRIS_WARN = 20000; // bane 1-skogen ligger på ca. 13k per terrengbit
const CHUNK_TRIS_FAIL = 32000;

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
const t0 = Date.now();

// Fang «Ukjent modelltype» og andre advarsler fra spillkoden
const origWarn = console.warn;
console.warn = (...a) => fail(`console.warn: ${a.join(' ')}`);

// ---------------------------------------------------------------- modeller
const trisOf = new Map();
function checkModel(type) {
  if (trisOf.has(type)) return trisOf.get(type);
  let tris = 0;
  try {
    const g = vegGeometry(type);
    const pos = g.attributes.position;
    if (g.index) fail(`modell ${type}: geometrien er indeksert (må komme fra merge())`);
    for (const a of ['position', 'normal', 'color']) if (!g.attributes[a]) fail(`modell ${type}: mangler attributtet ${a}`);
    for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) { fail(`modell ${type}: NaN/Infinity i posisjonene`); break; }
    tris = pos.count / 3;
    if (tris > MODEL_TRIS_WARN) warn(`modell ${type}: ${tris} trekanter (> ${MODEL_TRIS_WARN})`);
  } catch (e) {
    fail(`modell ${type}: ${e.message}`);
  }
  trisOf.set(type, tris);
  return tris;
}

// ---------------------------------------------------------------- baner
for (const level of Object.values(LEVELS)) {
  for (const seed of SEEDS) {
    const gen = new WorldGen(seed, level.id);
    const tag = `bane ${level.id} frø ${seed}`;
    if (!gen.spawn || gen.biomeAt(gen.spawn.x, gen.spawn.z) !== level.bands[1]) fail(`${tag}: startpunktet ligger ikke i midtbiomet`);
    // Høyder og biomvekter på et rutenett over hele verden
    const w = [0, 0, 0];
    for (let z = -gen.half + 16; z < gen.half; z += 64) {
      for (let x = -gen.half + 16; x < gen.half; x += 64) {
        const h = gen.height(x, z);
        if (!Number.isFinite(h)) { fail(`${tag}: høyden er ${h} i (${x}, ${z})`); break; }
        gen.biomeWeights(x, z, w);
        if (Math.abs(w[0] + w[1] + w[2] - 1) > 1e-3) { fail(`${tag}: biomvektene summerer til ${w[0] + w[1] + w[2]} i (${x}, ${z})`); break; }
      }
    }
    // Vegetasjon og trekanter per terrengbit (hver 3. bit over hele verden)
    const fs = new FeatureStore(gen);
    const perBiome = {};
    for (let cz = -15; cz <= 15; cz += 3) {
      for (let cx = -15; cx <= 15; cx += 3) {
        const f = fs.get(cx, cz);
        const biome = gen.biomeAt(cx * 128 + 64, cz * 128 + 64);
        let tris = 0;
        for (const it of f.items) {
          const info = VEG_INFO[it.type];
          if (!info) { fail(`${tag}: ${it.type} mangler vegInfo`); continue; }
          if (!Number.isFinite(it.x + it.y + it.z + it.s)) fail(`${tag}: ${it.type} har ugyldig posisjon/skala`);
          const t = checkModel(it.type);
          if (!info.near) tris += t;
        }
        const b = (perBiome[biome] ??= { n: 0, tris: 0 });
        b.n++;
        b.tris += tris;
      }
    }
    if (seed === SEEDS[0]) {
      for (const [biome, b] of Object.entries(perBiome)) {
        const avg = Math.round(b.tris / b.n);
        const line = `${tag} ${biome}: ${avg} trekanter per terrengbit`;
        if (avg > CHUNK_TRIS_FAIL) fail(`${line} (> ${CHUNK_TRIS_FAIL})`);
        else if (avg > CHUNK_TRIS_WARN) warn(`${line} (> ${CHUNK_TRIS_WARN})`);
        console.log(`  ${line}`);
      }
    }
    // Krypskytterleirer
    const diff = DIFFICULTY.medium;
    const camps = generateCamps(gen, diff);
    const total = camps.reduce((s, c) => s + c.size, 0);
    if (total !== diff.poachers) fail(`${tag}: ${total} krypskyttere i leirene, ventet ${diff.poachers}`);
    const game = { gen, scene: new THREE.Scene() };
    for (const c of camps) {
      if (gen.height(c.x, c.z) < 1) fail(`${tag}: leir ${c.id} står i vann`);
      try {
        const { cage } = buildCamp(game, c);
        if (cage) {
          // Mål dyret i burets eget koordinatsystem (buret er 1,6 × 1,2 × 1,3 m)
          cage.mesh.position.set(0, 0, 0);
          cage.mesh.rotation.set(0, 0, 0);
          cage.mesh.updateMatrixWorld(true);
          const bb = new THREE.Box3().setFromObject(cage.rig.root);
          if (bb.max.x > 0.81 || bb.min.x < -0.81 || bb.max.z > 0.61 || bb.min.z < -0.61 || bb.max.y > 1.31) fail(`${tag}: ${c.cagedType} stikker ut av buret`);
        }
      } catch (e) {
        fail(`${tag}: buildCamp for leir ${c.id} (${c.biome}): ${e.message}`);
      }
    }
  }
}

// ---------------------------------------------------------------- alle modeller i registeret
for (const type of Object.keys(VEG_INFO)) checkModel(type);

// ---------------------------------------------------------------- arter
const used = new Set();
for (const b of Object.values(BIOMES)) {
  const f = b.fauna || {};
  for (const [k] of f.predators || []) used.add(k);
  for (const k of [f.aquatic, ...(f.friendly || []), ...(f.caged || [])]) if (k) used.add(k);
}
for (const k of used) if (!SPECIES[k]) fail(`arten ${k} brukes av et biom, men finnes ikke i SPECIES`);
for (const [k, sp] of Object.entries(SPECIES)) {
  for (const field of ['name', 'definite', 'article', 'height', 'radius', 'createRig']) if (sp[field] === undefined) fail(`art ${k}: mangler ${field}`);
  try {
    const rig = sp.createRig();
    if (!rig.root?.isObject3D) fail(`art ${k}: riggen mangler root`);
    for (const st of ['idle', 'walk', 'run', 'eat', 'attack', 'happy', 'swim', 'ukjent']) rig.update(0.05, st === 'run' ? 7 : st === 'walk' ? 1.5 : 0, st);
  } catch (e) {
    fail(`art ${k}: ${e.message}`);
  }
}

console.warn = origWarn;
for (const w of warnings) console.log(`ADVARSEL ${w}`);
for (const e of errors) console.log(`FEIL     ${e}`);
console.log(`${errors.length ? '✗' : '✓'} ${Object.keys(LEVELS).length} baner × ${SEEDS.length} frø, ${trisOf.size} modeller, ${Object.keys(SPECIES).length} arter – ${errors.length} feil, ${warnings.length} advarsler (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(errors.length ? 1 : 0);
