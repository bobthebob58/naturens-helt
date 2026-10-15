// Felles hjelpere for scenariene.

/** Vent til spilltiden har gått `ms` millisekunder (headless er tregt – veggklokke er upålitelig). */
export async function sleep(page, ms) {
  const t0 = await page.evaluate(() => window.__game.time);
  await page.waitForFunction(([t, d]) => window.__game.time >= t + d || window.__game.state !== 'playing', [t0, ms / 1000], { timeout: 180000, polling: 50 });
}

/** Åpne menyen, velg bane (og ev. vanskelighetsgrad) og start et nytt spill uten PointerLock. */
export async function startLevel(page, base, level = 1, diff = null, query = '?nolock') {
  await page.goto(base + '/' + query);
  await page.waitForTimeout(500);
  await page.click(`.level[data-id="${level}"]`);
  if (diff) await page.click(`.diff[data-key="${diff}"]`);
  const t0 = Date.now();
  await page.click('#btn-new');
  await page.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 300000 });
  await page.evaluate(() => document.getElementById('dialog').classList.add('hidden'));
  return Date.now() - t0;
}

/** Hjelpefunksjoner i siden: teleport (__tp) og retning mot et punkt (__face). */
export async function installHelpers(page) {
  await page.evaluate(() => {
    const g = window.__game;
    window.__tp = (x, z, yaw = 0, pitch = -0.1, crouch = false) => {
      const p = g.player;
      p.pos.set(x, g.gen.groundHeight(x, z), z); p.vel.set(0, 0, 0);
      p.yaw = yaw; p.pitch = pitch; p.crouch = crouch; p.noMouseT = 0; p.heading = yaw + Math.PI; p.rig.root.rotation.y = p.heading;
      g.chunks.lastCx = null; g.chunks.update(x, z, g.time, 0);
      while (g.chunks.jobs.length) g.chunks._runJob(g.chunks.jobs.shift());
      g.minimap.reset();
      g.env.snapAtmosphere(g.gen.biomeDef(x, z));
    };
    window.__face = (px, pz, tx, tz) => Math.atan2(-(tx - px), -(tz - pz));
  });
}
