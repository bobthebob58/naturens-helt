// Røyktest: start hver bane, besøk alle tre biomer med alle dyrearter, slipp ut dyr i bur.
//   node tools/run.mjs smoke          (alle baner)   ·   node tools/run.mjs smoke 2 3   (bare bane 2 og 3)
// Feiler hvis spillet ikke starter, et dyr ikke kan lages, eller nettleseren logger feil.
import { sleep, startLevel } from './common.mjs';

export default async function (page, { args, out, base }) {
  const levels = args.length ? args.map(Number) : [1, 2, 3];
  let ok = true;
  for (const level of levels) {
    const ms = await startLevel(page, base, level);
    const info = await page.evaluate(() => {
      const g = window.__game;
      return { name: g.gen.level.name, bands: g.gen.bands.map((b) => b.key), camps: g.entities.camps.map((c) => `${c.biome}/${c.style}/${c.cagedType}`), poachers: g.stats.totalPoachers };
    });
    console.log(`Bane ${level} (${info.name}) lastet på ${(ms / 1000).toFixed(1)} s – biomer ${info.bands.join('/')}, ${info.camps.length} leirer, ${info.poachers} krypskyttere`);
    for (let band = 0; band < 3; band++) {
      const r = await page.evaluate(async (band) => {
        const g = window.__game, gen = g.gen, def = gen.bands[band];
        const zc = band === 0 ? -1100 : band === 2 ? 1100 : 0;
        const w = [0, 0, 0];
        let spot = null;
        for (let rr = 0; rr < 1600 && !spot; rr += 25) for (let a = 0; a < 24; a++) {
          const x = Math.cos(a / 24 * 6.283) * rr, z = zc + Math.sin(a / 24 * 6.283) * rr;
          gen.biomeWeights(x, z, w);
          if (w[band] < 0.97) continue;
          const h = gen.groundHeight(x, z);
          if (h < 0.8 || gen.slopeAt(x, z) < 0.85 || g.features.blockedAt(x, z, 3)) continue;
          spot = { x, z, h }; break;
        }
        if (!spot) return { biome: def.key, error: 'fant ikke et sted å stå' };
        const p = g.player;
        p.pos.set(spot.x, spot.h, spot.z);
        g.chunks.lastCx = null; g.chunks.update(spot.x, spot.z, g.time, 0);
        while (g.chunks.jobs.length) g.chunks._runJob(g.chunks.jobs.shift());
        g.env.snapAtmosphere(def);
        for (const a of g.entities.animals) a.despawn();
        const { Animal } = await import('/js/entities/animal.js');
        const f = def.fauna || {};
        const list = [...(f.predators || []).map((x) => [x[0], true]), ...(f.friendly || []).map((x) => [x, false])];
        if (f.aquatic) list.push([f.aquatic, true]);
        const spawned = [], errors = [];
        list.forEach(([type, hostile], i) => {
          try {
            const an = new Animal(g, type, spot.x + 12 + i * 3, spot.z + 10, hostile ? { hostile: true } : { need: 'food' });
            g.entities.animals.push(an);
            spawned.push(type);
          } catch (e) { errors.push(`${type}: ${e.message}`); }
        });
        return { biome: def.key, spawned, errors };
      }, band);
      if (r.error || r.errors.length) ok = false;
      console.log(`  ${r.biome}: ${r.error || `${r.spawned.join(', ')}${r.errors.length ? ' – FEIL: ' + r.errors.join('; ') : ''}`}`);
      await sleep(page, 1000);
      await page.evaluate(() => { const g = window.__game; g.player.health = 100; for (const a of g.entities.animals) a.despawn(); if (g.state !== 'playing') g.setPlaying(); });
    }
    await page.screenshot({ path: `${out}/smoke_l${level}.png` });
    const cages = await page.evaluate(() => window.__game.entities.cages.map((c) => { try { window.__game.quests.freeCage(c); return null; } catch (e) { return `${c.type}: ${e.message}`; } }).filter(Boolean));
    if (cages.length) { ok = false; console.log('  Bur: FEIL', cages.join('; ')); }
  }
  return ok;
}
